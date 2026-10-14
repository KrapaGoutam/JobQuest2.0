-- =============================================================================
-- AI-11F: schedule / cadence EXECUTION lifecycle (additive; forward-only)
--
-- DECISION: EXTEND public.ai_runs minimally (no new table, no queue platform).
-- ai_workflow_configs stays the DESIRED future behaviour (AI-11A); ai_runs stays
-- the only HISTORY. An automation OCCURRENCE is identified by
--   (automation_id, scheduled_for, trigger_type)
-- and is made unique by the database, so two pollers, a retried request, a
-- provider retry or a refreshed page can never create two executions:
--   * scheduled  ai_runs.external_run_id = 'auto:<automation>:<UTC stamp>'
--   * manual     ai_runs.external_run_id = 'manual:<automation>:<client key>'
--   * retry      ai_runs.external_run_id = 'retry:<root run>:<attempt>'
-- Lifecycle (existing statuses, no new ones):
--   rpc_ai_execution_request  -> QUEUED   (idempotent; scheduled | manual | retry)
--   rpc_ai_execution_claim    -> RUNNING  (row-locked; exactly one winner)
--   rpc_ai_finalize_run (existing) -> SUCCEEDED | PARTIAL | FAILED | CANCELLED
-- The provider-neutral executor (AI-11G) claims, does the work, and submits via
-- jobquest_submit_ai_result with run.external_run_id = the claim's key; the
-- existing ingest RPC then resumes THIS RUNNING run instead of starting another.
--
-- Access: service_role only (same boundary as the AI-11A RPCs). No MCP tool, no
-- authenticated EXECUTE. Deleting an automation keeps its runs (FK set null).
-- Production is not touched here.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Linkage columns on ai_runs
-- -----------------------------------------------------------------------------
alter table public.ai_runs
  add column automation_id uuid null references public.ai_workflow_configs(id) on delete set null,
  add column scheduled_for timestamptz null;

-- One scheduled occurrence = one run, whatever the key says.
create unique index uq_ai_runs_automation_occurrence
  on public.ai_runs(automation_id, scheduled_for)
  where automation_id is not null and scheduled_for is not null and trigger_type = 'scheduled';
-- A key is unique per automation even if the provider binding were to change.
create unique index uq_ai_runs_automation_external
  on public.ai_runs(automation_id, external_run_id)
  where automation_id is not null and external_run_id is not null;
create index idx_ai_runs_automation_created
  on public.ai_runs(automation_id, created_at desc)
  where automation_id is not null;

-- -----------------------------------------------------------------------------
-- 2. Defence in depth below the RPCs (service_role can write the table directly)
--    * the binding of a run (who, which workflow/provider, which occurrence) never changes;
--      the only legal change to automation_id is the FK nulling it when the automation is deleted;
--    * a finished run is never resurrected.
-- -----------------------------------------------------------------------------
create or replace function app.ai_runs_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.workspace_id is distinct from old.workspace_id
     or new.user_id is distinct from old.user_id
     or new.provider is distinct from old.provider
     or new.workflow is distinct from old.workflow
     or new.trigger_type is distinct from old.trigger_type
     or new.scheduled_for is distinct from old.scheduled_for
     or (old.external_run_id is not null and new.external_run_id is distinct from old.external_run_id)
     or (new.automation_id is distinct from old.automation_id and new.automation_id is not null) then
    raise exception 'AI_RUN_BINDING_IMMUTABLE' using errcode = '22023';
  end if;
  if old.status in ('SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED') and new.status is distinct from old.status then
    raise exception 'AI_RUN_INVALID_TRANSITION' using errcode = '22023';
  end if;
  return new;
end; $$;
revoke all on function app.ai_runs_guard() from public, anon, authenticated, service_role;

create trigger trg_ai_runs_guard before update on public.ai_runs
  for each row execute function app.ai_runs_guard();

-- -----------------------------------------------------------------------------
-- 3. Request an execution (idempotent). Used by the due-occurrence enqueuer
--    (scheduled), Run Now (manual) and an explicit retry of a FAILED run.
-- -----------------------------------------------------------------------------
create or replace function public.rpc_ai_execution_request(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_automation_id uuid,
  p_trigger_type text,
  p_scheduled_for timestamptz default null,
  p_client_key text default null,
  p_retry_of_run_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg public.ai_workflow_configs%rowtype;
  v_root public.ai_runs%rowtype;
  v_key text;
  v_provider text;
  v_workflow text;
  v_scheduled timestamptz;
  v_automation uuid := p_automation_id;
  v_attempts integer;
  v_id uuid;
  v_run public.ai_runs%rowtype;
begin
  perform app.ai_assert_actor(p_actor_id, p_workspace_id);
  if p_trigger_type is null or p_trigger_type not in ('scheduled', 'manual', 'retry') then
    raise exception 'AI_EXECUTION_INVALID_TRIGGER' using errcode = '22023';
  end if;

  if p_trigger_type = 'retry' then
    -- The retry is a NEW run bound to the ORIGINAL occurrence's workflow/provider; the failed attempt is never touched.
    if p_retry_of_run_id is null then
      raise exception 'AI_EXECUTION_INVALID_RETRY' using errcode = '22023';
    end if;
    select * into v_root from public.ai_runs r
     where r.id = p_retry_of_run_id and r.workspace_id = p_workspace_id and r.user_id = p_actor_id;
    if not found then
      raise exception 'AI_RUN_NOT_FOUND' using errcode = 'P0002';
    end if;
    -- Chains stay flat: every retry points at the first attempt, and that row is the lock that serialises retries.
    if v_root.retry_of_run_id is not null then
      select * into v_root from public.ai_runs r where r.id = v_root.retry_of_run_id and r.user_id = p_actor_id;
    end if;
    perform 1 from public.ai_runs r where r.id = v_root.id for update;
    if v_root.automation_id is null then
      raise exception 'AI_EXECUTION_NOT_RETRYABLE' using errcode = '55000';
    end if;
    select * into v_cfg from public.ai_workflow_configs c
     where c.id = v_root.automation_id and c.workspace_id = p_workspace_id and c.user_id = p_actor_id for share;
    if not found then
      raise exception 'AI_EXECUTION_AUTOMATION_NOT_FOUND' using errcode = 'P0002';
    end if;
    if not v_cfg.enabled then
      raise exception 'AI_EXECUTION_AUTOMATION_DISABLED' using errcode = '55000';
    end if;
    -- Retry only a run that actually FAILED, with nothing else in flight for the occurrence.
    if not exists (select 1 from public.ai_runs r where r.id = p_retry_of_run_id and r.status = 'FAILED')
       or exists (
         select 1 from public.ai_runs r
          where (r.id = v_root.id or r.retry_of_run_id = v_root.id) and r.status in ('QUEUED', 'RUNNING', 'AWAITING_APPROVAL')
       )
       or exists (
         select 1 from public.ai_runs r
          where (r.id = v_root.id or r.retry_of_run_id = v_root.id) and r.status in ('SUCCEEDED', 'PARTIAL')
       ) then
      raise exception 'AI_EXECUTION_NOT_RETRYABLE' using errcode = '55000';
    end if;
    select count(*) into v_attempts from public.ai_runs r where r.retry_of_run_id = v_root.id;
    if v_attempts >= 3 then
      raise exception 'AI_EXECUTION_RETRY_LIMIT' using errcode = '54000';
    end if;
    v_provider := v_root.provider;
    v_workflow := v_root.workflow;
    v_scheduled := v_root.scheduled_for;
    v_key := 'retry:' || v_root.id::text || ':' || (v_attempts + 1)::text;
  else
    select * into v_cfg from public.ai_workflow_configs c
     where c.id = p_automation_id and c.workspace_id = p_workspace_id and c.user_id = p_actor_id for share;
    if not found then
      raise exception 'AI_EXECUTION_AUTOMATION_NOT_FOUND' using errcode = 'P0002';
    end if;
    if not v_cfg.enabled or v_cfg.primary_provider is null then
      raise exception 'AI_EXECUTION_AUTOMATION_DISABLED' using errcode = '55000';
    end if;
    v_provider := v_cfg.primary_provider;
    v_workflow := v_cfg.workflow;

    if p_trigger_type = 'scheduled' then
      if v_cfg.cadence = 'manual_only' then
        raise exception 'AI_EXECUTION_AUTOMATION_DISABLED' using errcode = '55000';
      end if;
      -- Whole seconds, not in the future, not older than a day, and owned by the CURRENT configuration (after its last
      -- change), so an edit can never double-run or retroactively fire a slot the new schedule did not own.
      if p_scheduled_for is null or p_scheduled_for <> date_trunc('second', p_scheduled_for)
         or p_scheduled_for > now() + interval '1 minute'
         or p_scheduled_for < now() - interval '1 day'
         or p_scheduled_for <= v_cfg.updated_at then
        raise exception 'AI_EXECUTION_INVALID_OCCURRENCE' using errcode = '22023';
      end if;
      v_scheduled := p_scheduled_for;
      v_key := 'auto:' || v_cfg.id::text || ':' || to_char(p_scheduled_for at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"');
    else
      if p_client_key is null or p_client_key !~ '^[A-Za-z0-9_-]{8,64}$' then
        raise exception 'AI_EXECUTION_INVALID_CLIENT_KEY' using errcode = '22023';
      end if;
      v_scheduled := null;
      v_key := 'manual:' || v_cfg.id::text || ':' || p_client_key;
    end if;
  end if;

  insert into public.ai_runs (
    workspace_id, user_id, provider, workflow, status, trigger_type, external_run_id,
    automation_id, scheduled_for, retry_of_run_id
  ) values (
    p_workspace_id, p_actor_id, v_provider, v_workflow, 'QUEUED', p_trigger_type, v_key,
    case when p_trigger_type = 'retry' then v_root.automation_id else v_automation end,
    v_scheduled, case when p_trigger_type = 'retry' then v_root.id end
  )
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    -- The occurrence / key already exists: return it, never a second run. (Binding stays the ORIGINAL provider/workflow.)
    select * into v_run from public.ai_runs r
     where r.workspace_id = p_workspace_id and r.user_id = p_actor_id
       and r.automation_id = case when p_trigger_type = 'retry' then v_root.automation_id else v_automation end
       and (r.external_run_id = v_key
            or (p_trigger_type = 'scheduled' and r.trigger_type = 'scheduled' and r.scheduled_for = v_scheduled))
     order by r.created_at limit 1;
    if not found then
      raise exception 'AI_EXECUTION_CONFLICT' using errcode = '23505';
    end if;
    return jsonb_build_object('run_id', v_run.id, 'created', false, 'status', v_run.status, 'external_run_id', v_run.external_run_id);
  end if;

  perform app.ai_write_audit(p_workspace_id, p_actor_id, p_actor_id, 'AI_RUN', v_id, 'AI_EXECUTION_REQUESTED',
    jsonb_build_object('actor_kind', 'USER', 'provider', v_provider, 'workflow', v_workflow, 'trigger_type', p_trigger_type));

  return jsonb_build_object('run_id', v_id, 'created', true, 'status', 'QUEUED', 'external_run_id', v_key);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Claim a QUEUED run (QUEUED -> RUNNING). The row lock makes the loser see RUNNING.
--    Provider identity is validated against the RUN (server-side), never trusted from the request alone.
--    A run whose automation was disabled, deleted or reassigned to another provider while it waited is CANCELLED
--    (history kept, never executed).
-- -----------------------------------------------------------------------------
create or replace function public.rpc_ai_execution_claim(
  p_actor_id uuid,
  p_run_id uuid,
  p_provider text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.ai_runs%rowtype;
  v_cfg public.ai_workflow_configs%rowtype;
  v_reason text;
begin
  select * into v_run from public.ai_runs r where r.id = p_run_id and r.user_id = p_actor_id for update;
  if not found then
    raise exception 'AI_RUN_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform app.ai_assert_actor(p_actor_id, v_run.workspace_id);

  if p_provider is null or v_run.provider is distinct from p_provider then
    raise exception 'AI_EXECUTION_PROVIDER_MISMATCH' using errcode = '42501';
  end if;
  if v_run.automation_id is null and v_run.status = 'QUEUED' then
    raise exception 'AI_EXECUTION_NOT_CLAIMABLE' using errcode = '55000';
  end if;
  if v_run.status <> 'QUEUED' then
    return jsonb_build_object('claimed', false, 'run_id', v_run.id, 'status', v_run.status, 'reason', 'NOT_QUEUED');
  end if;

  select * into v_cfg from public.ai_workflow_configs c
   where c.id = v_run.automation_id and c.workspace_id = v_run.workspace_id and c.user_id = p_actor_id for share;
  if not found or not v_cfg.enabled then
    v_reason := 'AUTOMATION_DISABLED';
  elsif v_cfg.primary_provider is distinct from v_run.provider then
    v_reason := 'AUTOMATION_REASSIGNED';
  end if;
  if v_reason is not null then
    update public.ai_runs r set status = 'CANCELLED', completed_at = now() where r.id = v_run.id;
    perform app.ai_write_audit(v_run.workspace_id, p_actor_id, p_actor_id, 'AI_RUN', v_run.id, 'AI_RUN_STATUS_CHANGED',
      jsonb_build_object('actor_kind', 'SERVICE_INGEST', 'provider', v_run.provider, 'from_status', 'QUEUED', 'to_status', 'CANCELLED', 'reason', v_reason));
    return jsonb_build_object('claimed', false, 'run_id', v_run.id, 'status', 'CANCELLED', 'reason', v_reason);
  end if;

  update public.ai_runs r set status = 'RUNNING', started_at = coalesce(r.started_at, now()) where r.id = v_run.id;
  perform app.ai_write_audit(v_run.workspace_id, p_actor_id, p_actor_id, 'AI_RUN', v_run.id, 'AI_EXECUTION_CLAIMED',
    jsonb_build_object('actor_kind', 'SERVICE_INGEST', 'provider', v_run.provider, 'workflow', v_run.workflow, 'trigger_type', v_run.trigger_type));

  -- Bounded, credential-free context: ids, enums and the canonical schedule fields.
  return jsonb_build_object(
    'claimed', true, 'run_id', v_run.id, 'status', 'RUNNING', 'automation_id', v_run.automation_id,
    'workflow', v_run.workflow, 'provider', v_run.provider, 'trigger_type', v_run.trigger_type,
    'scheduled_for', v_run.scheduled_for, 'timezone', v_cfg.timezone, 'sections', to_jsonb(v_cfg.sections),
    'delivery', to_jsonb(v_cfg.delivery), 'external_run_id', v_run.external_run_id, 'retry_of_run_id', v_run.retry_of_run_id
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 4b. Deleting an automation keeps its history (the FK nulls automation_id) but cancels runs that were still waiting
--     (QUEUED): nothing may claim work for a definition that no longer exists. RUNNING and finished runs are untouched.
--     Same signature, grants and behaviour as AI-11A otherwise.
-- -----------------------------------------------------------------------------
create or replace function public.rpc_ai_automation_delete(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.ai_workflow_configs%rowtype;
  v_cancelled integer;
begin
  perform app.ai_assert_actor(p_actor_id, p_workspace_id);
  select * into v_row from public.ai_workflow_configs c
   where c.id = p_id and c.workspace_id = p_workspace_id and c.user_id = p_actor_id
   for update;
  if not found then
    raise exception 'AI_AUTOMATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.ai_runs r set status = 'CANCELLED', completed_at = now()
   where r.automation_id = v_row.id and r.status = 'QUEUED';
  get diagnostics v_cancelled = row_count;
  delete from public.ai_workflow_configs c where c.id = v_row.id;
  perform app.ai_write_audit(p_workspace_id, p_actor_id, p_actor_id, 'AI_AUTOMATION', v_row.id, 'AI_AUTOMATION_DELETED',
    jsonb_build_object('actor_kind', 'USER', 'workflow', v_row.workflow, 'provider', v_row.primary_provider,
                       'cadence', v_row.cadence, 'enabled', v_row.enabled, 'queued_runs_cancelled', v_cancelled));
  return jsonb_build_object('id', v_row.id, 'deleted', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Explicit EXECUTE boundary: service_role only (the API / executor plumbing authenticates the owner).
-- -----------------------------------------------------------------------------
revoke all on function public.rpc_ai_execution_request(uuid, uuid, uuid, text, timestamptz, text, uuid) from public, anon, authenticated;
revoke all on function public.rpc_ai_execution_claim(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.rpc_ai_execution_request(uuid, uuid, uuid, text, timestamptz, text, uuid) to service_role;
grant execute on function public.rpc_ai_execution_claim(uuid, uuid, text) to service_role;
-- create or replace keeps the AI-11A grants; restated so this migration is self-evidently safe.
revoke all on function public.rpc_ai_automation_delete(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.rpc_ai_automation_delete(uuid, uuid, uuid) to service_role;

commit;
