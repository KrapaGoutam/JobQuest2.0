-- =============================================================================
-- AI-1B: AI Hub RLS, ownership and audit (additive; no core table changes)
--
-- Read model (clients):
--   * authenticated gets SELECT only; RLS filters rows.
--   * ai_runs / ai_findings / ai_suggestions: public.can_access_owned_record
--     (owner who is an ACTIVE member, or an ACTIVE workspace MANAGER) -- the
--     same predicate as every core owner-scoped table.
--   * ai_workflow_configs: owner only (personal settings, like extension_tokens).
--   * anon/public: nothing. No client INSERT/UPDATE/DELETE on any ai_* table.
--
-- Write model:
--   * service_role-only ingest RPCs (called by the MCP/server layer with the
--     connector token's resolved user + workspace; same p_actor_id convention as
--     the M11 extension-token RPCs): rpc_ai_ingest_run, rpc_ai_finalize_run,
--     rpc_ai_ingest_finding, rpc_ai_create_suggestion.
--   * authenticated, owner-only review RPCs for AI-only rows:
--     rpc_ai_dismiss_finding, rpc_ai_decide_suggestion (IGNORED only; ACCEPTED
--     is refused until AI-11), rpc_ai_delete_finding. None touch core tables.
--   * ai_workflow_configs mutation is deferred to AI-1F (no RPC here).
--
-- Audit: reuses public.audit_events (append-only). Metadata carries ids, enums
-- and counts only -- never title/summary/evidence/payload/source_ref/error text.
-- metadata.actor_kind distinguishes SERVICE_INGEST (server acting for the
-- connector owner) from USER (an interactive review).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Client read access
-- -----------------------------------------------------------------------------
grant select on public.ai_runs to authenticated;
grant select on public.ai_findings to authenticated;
grant select on public.ai_suggestions to authenticated;
grant select on public.ai_workflow_configs to authenticated;

create policy ai_runs_select on public.ai_runs
  for select to authenticated
  using (public.can_access_owned_record(workspace_id, user_id));

create policy ai_findings_select on public.ai_findings
  for select to authenticated
  using (public.can_access_owned_record(workspace_id, user_id));

create policy ai_suggestions_select on public.ai_suggestions
  for select to authenticated
  using (public.can_access_owned_record(workspace_id, user_id));

create policy ai_workflow_configs_select_own on public.ai_workflow_configs
  for select to authenticated
  using (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));

-- -----------------------------------------------------------------------------
-- 2. Internal helpers (not executable by any API role)
-- -----------------------------------------------------------------------------
-- The connector owner must still be an ACTIVE member of the workspace.
create or replace function app.ai_assert_actor(p_actor_id uuid, p_workspace_id uuid)
returns void language plpgsql stable set search_path = '' as $$
begin
  if p_actor_id is null or p_workspace_id is null
     or not app.user_is_member(p_workspace_id, p_actor_id) then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;
end; $$;

-- Current contract major is 1 (jobquest.ai-result 1.x).
create or replace function app.ai_assert_schema_version(p_version text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_version is null or p_version !~ '^1\.[0-9]{1,3}$' then
    raise exception 'AI_SCHEMA_VERSION_UNSUPPORTED' using errcode = '22023';
  end if;
end; $$;

create or replace function app.ai_write_audit(
  p_workspace_id uuid, p_actor_id uuid, p_target_user_id uuid,
  p_entity_type text, p_entity_id uuid, p_action text, p_metadata jsonb
)
returns void language sql volatile set search_path = '' as $$
  insert into public.audit_events (
    workspace_id, actor_id, target_user_id, target_entity_type,
    target_entity_id, action, metadata
  ) values (
    p_workspace_id, p_actor_id, p_target_user_id, p_entity_type,
    p_entity_id, p_action, jsonb_strip_nulls(coalesce(p_metadata, '{}'::jsonb))
  );
$$;

revoke all on function app.ai_assert_actor(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function app.ai_assert_schema_version(text) from public, anon, authenticated, service_role;
revoke all on function app.ai_write_audit(uuid, uuid, uuid, text, uuid, text, jsonb) from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Service-role ingest RPCs
-- -----------------------------------------------------------------------------

-- Create a run (QUEUED or RUNNING). Idempotent on (workspace, provider,
-- external_run_id): a rerun returns the prior run instead of a new row.
create or replace function public.rpc_ai_ingest_run(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_provider text,
  p_workflow text,
  p_trigger_type text default 'manual',
  p_external_run_id text default null,
  p_schema_version text default '1.0',
  p_status text default 'RUNNING',
  p_sources jsonb default '[]'::jsonb,
  p_retry_of_run_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.ai_runs%rowtype;
  v_id uuid;
  v_sources jsonb := coalesce(p_sources, '[]'::jsonb);
begin
  perform app.ai_assert_actor(p_actor_id, p_workspace_id);
  perform app.ai_assert_schema_version(p_schema_version);

  if p_status is null or p_status not in ('QUEUED', 'RUNNING') then
    raise exception 'AI_RUN_INVALID_INITIAL_STATUS' using errcode = '22023';
  end if;
  if jsonb_typeof(v_sources) <> 'array' or jsonb_array_length(v_sources) > 50
     or octet_length(v_sources::text) > 8192 then
    raise exception 'AI_RUN_INVALID_SOURCES' using errcode = '22023';
  end if;
  if p_external_run_id is not null and p_external_run_id !~ '^[[:graph:]]{1,255}$' then
    raise exception 'AI_RUN_INVALID_EXTERNAL_ID' using errcode = '22023';
  end if;
  if (p_trigger_type = 'retry') <> (p_retry_of_run_id is not null) then
    raise exception 'AI_RUN_INVALID_RETRY' using errcode = '22023';
  end if;
  if p_retry_of_run_id is not null and not exists (
    select 1 from public.ai_runs r
    where r.id = p_retry_of_run_id and r.workspace_id = p_workspace_id and r.user_id = p_actor_id
  ) then
    raise exception 'AI_RUN_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.ai_runs (
    workspace_id, user_id, provider, workflow, status, trigger_type,
    external_run_id, schema_version, sources, retry_of_run_id, started_at
  ) values (
    p_workspace_id, p_actor_id, p_provider, p_workflow, p_status, p_trigger_type,
    p_external_run_id, p_schema_version, v_sources, p_retry_of_run_id,
    case when p_status = 'RUNNING' then now() end
  )
  on conflict (workspace_id, provider, external_run_id) where external_run_id is not null
  do nothing
  returning id into v_id;

  if v_id is null then
    select * into v_run from public.ai_runs r
    where r.workspace_id = p_workspace_id and r.provider = p_provider
      and r.external_run_id = p_external_run_id;
    -- Another member's run with the same external id: refuse without leaking it.
    if v_run.user_id is distinct from p_actor_id then
      raise exception 'AI_RUN_CONFLICT' using errcode = '23505';
    end if;
    return jsonb_build_object('run_id', v_run.id, 'created', false, 'status', v_run.status);
  end if;

  perform app.ai_write_audit(p_workspace_id, p_actor_id, p_actor_id, 'AI_RUN', v_id, 'AI_RUN_CREATED',
    jsonb_build_object('actor_kind', 'SERVICE_INGEST', 'provider', p_provider, 'workflow', p_workflow,
                       'trigger_type', p_trigger_type, 'status', p_status, 'schema_version', p_schema_version));

  return jsonb_build_object('run_id', v_id, 'created', true, 'status', p_status);
end;
$$;

-- Constrained status transition. Legal transitions:
--   QUEUED            -> RUNNING | FAILED | CANCELLED
--   RUNNING           -> SUCCEEDED | PARTIAL | FAILED | AWAITING_APPROVAL | CANCELLED
--   AWAITING_APPROVAL -> SUCCEEDED | PARTIAL | FAILED | CANCELLED
--   SUCCEEDED/PARTIAL/FAILED/CANCELLED are terminal. Repeating the current
--   status is an idempotent no-op.
create or replace function public.rpc_ai_finalize_run(
  p_actor_id uuid,
  p_run_id uuid,
  p_status text,
  p_counts jsonb default null,
  p_error_category text default null,
  p_error_detail text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.ai_runs%rowtype;
  v_terminal boolean := p_status in ('SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED');
begin
  select * into v_run from public.ai_runs r
  where r.id = p_run_id and r.user_id = p_actor_id
  for update;
  if not found then
    raise exception 'AI_RUN_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform app.ai_assert_actor(p_actor_id, v_run.workspace_id);

  if v_run.status = p_status then
    return jsonb_build_object('run_id', v_run.id, 'changed', false, 'status', v_run.status);
  end if;
  if not (
       (v_run.status = 'QUEUED' and p_status in ('RUNNING', 'FAILED', 'CANCELLED'))
    or (v_run.status = 'RUNNING' and p_status in ('SUCCEEDED', 'PARTIAL', 'FAILED', 'AWAITING_APPROVAL', 'CANCELLED'))
    or (v_run.status = 'AWAITING_APPROVAL' and p_status in ('SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED'))
  ) then
    raise exception 'AI_RUN_INVALID_TRANSITION' using errcode = '22023';
  end if;

  if p_counts is not null and (
       jsonb_typeof(p_counts) <> 'object'
    or (select count(*) from jsonb_object_keys(p_counts)) > 20
    or exists (select 1 from jsonb_each(p_counts) e
               where case when jsonb_typeof(e.value) = 'number' then (e.value)::numeric < 0 else true end)
  ) then
    raise exception 'AI_RUN_INVALID_COUNTS' using errcode = '22023';
  end if;
  if (p_error_category is not null or p_error_detail is not null)
     and p_status not in ('FAILED', 'PARTIAL', 'CANCELLED') then
    raise exception 'AI_RUN_ERROR_NOT_ALLOWED' using errcode = '22023';
  end if;

  update public.ai_runs r set
    status = p_status,
    counts = coalesce(p_counts, r.counts),
    error_category = coalesce(p_error_category, r.error_category),
    error_detail = coalesce(left(p_error_detail, 500), r.error_detail),
    started_at = case when p_status = 'RUNNING' then coalesce(r.started_at, now()) else r.started_at end,
    completed_at = case when v_terminal then now() else r.completed_at end
  where r.id = v_run.id;

  perform app.ai_write_audit(v_run.workspace_id, p_actor_id, v_run.user_id, 'AI_RUN', v_run.id, 'AI_RUN_STATUS_CHANGED',
    jsonb_build_object('actor_kind', 'SERVICE_INGEST', 'provider', v_run.provider, 'from_status', v_run.status,
                       'to_status', p_status, 'error_category', p_error_category, 'counts', p_counts));

  return jsonb_build_object('run_id', v_run.id, 'changed', true, 'status', p_status);
end;
$$;

-- Ingest one finding into an open (RUNNING) run owned by the actor. Workspace,
-- user and provider come from the run, never from the caller. dedupe_key is
-- computed by the JobQuest server (AI-1C util); content_hash is computed HERE
-- from the canonical stored fields (any caller hash is not accepted).
-- Outcomes (DATA_MODEL_PLAN §5):
--   created           new (workspace, user, kind, dedupe_key)
--   duplicate         same key + same content_hash: kept first; a new provider is
--                     appended to payload.seen_by
--   updated           same key, different hash, finding still NEW: updated in place
--   unchanged_closed  same key, finding already reviewed/dismissed/accepted/...:
--                     never resurrected (superseding linked findings: later phase)
create or replace function public.rpc_ai_ingest_finding(
  p_actor_id uuid,
  p_run_id uuid,
  p_kind text,
  p_dedupe_key text,
  p_title text,
  p_schema_version text default '1.0',
  p_category text default null,
  p_priority text default 'NORMAL',
  p_confidence numeric default null,
  p_application_id uuid default null,
  p_match_confidence numeric default null,
  p_summary text default null,
  p_occurred_at timestamptz default null,
  p_due_at timestamptz default null,
  p_source_ref jsonb default '{}'::jsonb,
  p_evidence text default null,
  p_payload jsonb default '{}'::jsonb,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.ai_runs%rowtype;
  v_existing public.ai_findings%rowtype;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_source_ref jsonb := coalesce(p_source_ref, '{}'::jsonb);
  v_hash text;
  v_id uuid;
  v_seen jsonb;
begin
  select * into v_run from public.ai_runs r
  where r.id = p_run_id and r.user_id = p_actor_id;
  if not found then
    raise exception 'AI_RUN_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform app.ai_assert_actor(p_actor_id, v_run.workspace_id);
  if v_run.status <> 'RUNNING' then
    raise exception 'AI_RUN_NOT_OPEN' using errcode = '22023';
  end if;
  perform app.ai_assert_schema_version(p_schema_version);

  if p_dedupe_key is null or p_dedupe_key !~ '^[[:graph:]]{1,255}$' then
    raise exception 'AI_FINDING_INVALID_DEDUPE_KEY' using errcode = '22023';
  end if;
  if p_title is null or btrim(p_title) = '' then
    raise exception 'AI_FINDING_INVALID_TITLE' using errcode = '22023';
  end if;
  if jsonb_typeof(v_payload) <> 'object' or octet_length(v_payload::text) > 16384 then
    raise exception 'AI_FINDING_INVALID_PAYLOAD' using errcode = '22023';
  end if;
  if jsonb_typeof(v_source_ref) <> 'object' or octet_length(v_source_ref::text) > 2048 then
    raise exception 'AI_FINDING_INVALID_SOURCE_REF' using errcode = '22023';
  end if;
  -- The server owns application matching; still never trust an id blindly.
  if p_application_id is not null and not exists (
    select 1 from public.applications a
    where a.id = p_application_id and a.workspace_id = v_run.workspace_id and a.user_id = p_actor_id
  ) then
    raise exception 'AI_APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_payload := v_payload - 'seen_by'; -- server-owned provenance key
  -- jsonb text is key-order canonical; timestamps as epoch and confidences at
  -- stored scale keep the hash independent of session TimeZone / input scale.
  v_hash := encode(sha256(convert_to(jsonb_build_object(
    'kind', p_kind, 'schema_version', p_schema_version, 'category', p_category,
    'priority', coalesce(p_priority, 'NORMAL'), 'confidence', round(p_confidence, 3),
    'application_id', p_application_id, 'match_confidence', round(p_match_confidence, 3),
    'title', btrim(p_title), 'summary', p_summary,
    'occurred_at', extract(epoch from p_occurred_at), 'due_at', extract(epoch from p_due_at),
    'source_ref', v_source_ref,
    'evidence', p_evidence, 'payload', v_payload
  )::text, 'UTF8')), 'hex');

  insert into public.ai_findings (
    workspace_id, user_id, run_id, kind, schema_version, provider, category, priority,
    confidence, application_id, match_confidence, title, summary, occurred_at, due_at,
    source_ref, evidence, dedupe_key, content_hash, payload, expires_at
  ) values (
    v_run.workspace_id, p_actor_id, v_run.id, p_kind, p_schema_version, v_run.provider, p_category,
    coalesce(p_priority, 'NORMAL'), p_confidence, p_application_id, p_match_confidence, btrim(p_title),
    p_summary, p_occurred_at, p_due_at, v_source_ref, p_evidence, p_dedupe_key, v_hash, v_payload,
    p_expires_at
  )
  on conflict (workspace_id, user_id, kind, dedupe_key) do nothing
  returning id into v_id;

  if v_id is not null then
    perform app.ai_write_audit(v_run.workspace_id, p_actor_id, p_actor_id, 'AI_FINDING', v_id, 'AI_FINDING_CREATED',
      jsonb_build_object('actor_kind', 'SERVICE_INGEST', 'provider', v_run.provider, 'run_id', v_run.id,
                         'kind', p_kind, 'priority', coalesce(p_priority, 'NORMAL'),
                         'application_linked', p_application_id is not null));
    return jsonb_build_object('finding_id', v_id, 'outcome', 'created');
  end if;

  select * into v_existing from public.ai_findings f
  where f.workspace_id = v_run.workspace_id and f.user_id = p_actor_id
    and f.kind = p_kind and f.dedupe_key = p_dedupe_key
  for update;

  v_seen := coalesce(v_existing.payload->'seen_by', '[]'::jsonb);
  if v_run.provider <> v_existing.provider and not v_seen ? v_run.provider then
    v_seen := v_seen || to_jsonb(v_run.provider);
  end if;

  if v_existing.content_hash = v_hash then
    if v_seen is distinct from coalesce(v_existing.payload->'seen_by', '[]'::jsonb) then
      update public.ai_findings f set payload = f.payload || jsonb_build_object('seen_by', v_seen)
      where f.id = v_existing.id;
    end if;
    return jsonb_build_object('finding_id', v_existing.id, 'outcome', 'duplicate');
  end if;

  if v_existing.status <> 'NEW' then
    return jsonb_build_object('finding_id', v_existing.id, 'outcome', 'unchanged_closed');
  end if;

  update public.ai_findings f set
    schema_version = p_schema_version,
    category = p_category,
    priority = coalesce(p_priority, 'NORMAL'),
    confidence = p_confidence,
    application_id = p_application_id,
    match_confidence = p_match_confidence,
    title = btrim(p_title),
    summary = p_summary,
    occurred_at = p_occurred_at,
    due_at = p_due_at,
    source_ref = v_source_ref,
    evidence = p_evidence,
    content_hash = v_hash,
    payload = case when jsonb_array_length(v_seen) > 0
                   then v_payload || jsonb_build_object('seen_by', v_seen) else v_payload end,
    expires_at = coalesce(p_expires_at, f.expires_at)
  where f.id = v_existing.id;

  perform app.ai_write_audit(v_run.workspace_id, p_actor_id, p_actor_id, 'AI_FINDING', v_existing.id, 'AI_FINDING_UPDATED',
    jsonb_build_object('actor_kind', 'SERVICE_INGEST', 'provider', v_run.provider, 'run_id', v_run.id,
                       'kind', p_kind, 'priority', coalesce(p_priority, 'NORMAL'),
                       'application_linked', p_application_id is not null));
  return jsonb_build_object('finding_id', v_existing.id, 'outcome', 'updated');
end;
$$;

-- Attach an inert proposal to an open (NEW) finding owned by the actor.
-- Nothing is executed. Repeating an identical PENDING proposal is a no-op.
create or replace function public.rpc_ai_create_suggestion(
  p_actor_id uuid,
  p_finding_id uuid,
  p_action text,
  p_proposed jsonb default '{}'::jsonb,
  p_target_type text default null,
  p_target_id uuid default null,
  p_confidence numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_finding public.ai_findings%rowtype;
  v_proposed jsonb := coalesce(p_proposed, '{}'::jsonb);
  v_id uuid;
begin
  select * into v_finding from public.ai_findings f
  where f.id = p_finding_id and f.user_id = p_actor_id
  for update; -- serializes suggestion creation per finding
  if not found then
    raise exception 'AI_FINDING_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform app.ai_assert_actor(p_actor_id, v_finding.workspace_id);
  if v_finding.status <> 'NEW' then
    raise exception 'AI_FINDING_CLOSED' using errcode = '22023';
  end if;

  if jsonb_typeof(v_proposed) <> 'object' or octet_length(v_proposed::text) > 4096 then
    raise exception 'AI_SUGGESTION_INVALID_PROPOSED' using errcode = '22023';
  end if;
  if p_target_type is not null and p_target_type not in ('application', 'task', 'contact') then
    raise exception 'AI_SUGGESTION_INVALID_TARGET' using errcode = '22023';
  end if;
  if p_target_id is not null and (
       p_target_type is null
    or (p_target_type = 'application' and not exists (
          select 1 from public.applications t where t.id = p_target_id
            and t.workspace_id = v_finding.workspace_id and t.user_id = p_actor_id))
    or (p_target_type = 'task' and not exists (
          select 1 from public.tasks t where t.id = p_target_id
            and t.workspace_id = v_finding.workspace_id and t.user_id = p_actor_id))
    or (p_target_type = 'contact' and not exists (
          select 1 from public.contacts t where t.id = p_target_id
            and t.workspace_id = v_finding.workspace_id and t.user_id = p_actor_id))
  ) then
    raise exception 'AI_SUGGESTION_TARGET_NOT_FOUND' using errcode = 'P0002';
  end if;

  select s.id into v_id from public.ai_suggestions s
  where s.finding_id = v_finding.id and s.status = 'PENDING' and s.action = p_action
    and s.target_type is not distinct from p_target_type
    and s.target_id is not distinct from p_target_id
    and s.proposed = v_proposed
  limit 1;
  if v_id is not null then
    return jsonb_build_object('suggestion_id', v_id, 'created', false);
  end if;

  insert into public.ai_suggestions (
    workspace_id, user_id, finding_id, action, target_type, target_id, proposed, confidence
  ) values (
    v_finding.workspace_id, p_actor_id, v_finding.id, p_action, p_target_type, p_target_id,
    v_proposed, p_confidence
  )
  returning id into v_id;

  perform app.ai_write_audit(v_finding.workspace_id, p_actor_id, p_actor_id, 'AI_SUGGESTION', v_id, 'AI_SUGGESTION_CREATED',
    jsonb_build_object('actor_kind', 'SERVICE_INGEST', 'provider', v_finding.provider, 'finding_id', v_finding.id,
                       'action', p_action, 'target_type', p_target_type));
  return jsonb_build_object('suggestion_id', v_id, 'created', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Authenticated owner-only review RPCs (AI-only rows; no core mutation)
-- Managers can READ members' AI rows but cannot review or delete them.
-- Unknown, foreign and inaccessible ids all return the same NOT_FOUND.
-- -----------------------------------------------------------------------------

create or replace function public.rpc_ai_dismiss_finding(p_finding_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_finding public.ai_findings%rowtype;
  v_ignored integer;
begin
  if v_actor is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_finding from public.ai_findings f
  where f.id = p_finding_id and f.user_id = v_actor
  for update;
  if not found or not public.is_workspace_member(v_finding.workspace_id) then
    raise exception 'AI_FINDING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_finding.status = 'DISMISSED' then
    return jsonb_build_object('finding_id', v_finding.id, 'changed', false, 'status', 'DISMISSED');
  end if;
  if v_finding.status not in ('NEW', 'REVIEWED') then
    raise exception 'AI_FINDING_INVALID_TRANSITION' using errcode = '22023';
  end if;

  update public.ai_findings f set status = 'DISMISSED' where f.id = v_finding.id;
  update public.ai_suggestions s set status = 'IGNORED', decided_by = v_actor, decided_at = now()
  where s.finding_id = v_finding.id and s.status = 'PENDING';
  get diagnostics v_ignored = row_count;

  perform app.ai_write_audit(v_finding.workspace_id, v_actor, v_finding.user_id, 'AI_FINDING', v_finding.id, 'AI_FINDING_DISMISSED',
    jsonb_build_object('actor_kind', 'USER', 'from_status', v_finding.status, 'kind', v_finding.kind,
                       'ignored_suggestions', v_ignored));
  return jsonb_build_object('finding_id', v_finding.id, 'changed', true, 'status', 'DISMISSED');
end;
$$;

-- Records a decision only. ACCEPTED (which would apply a core change) is not
-- available until AI-11; it is refused before any lookup or write.
create or replace function public.rpc_ai_decide_suggestion(p_suggestion_id uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_s public.ai_suggestions%rowtype;
begin
  if v_actor is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_decision = 'ACCEPTED' then
    raise exception 'AI_ACTION_NOT_ENABLED' using errcode = '0A000';
  end if;
  if p_decision is distinct from 'IGNORED' then
    raise exception 'AI_INVALID_DECISION' using errcode = '22023';
  end if;

  select * into v_s from public.ai_suggestions s
  where s.id = p_suggestion_id and s.user_id = v_actor
  for update;
  if not found or not public.is_workspace_member(v_s.workspace_id) then
    raise exception 'AI_SUGGESTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_s.status = 'IGNORED' then
    return jsonb_build_object('suggestion_id', v_s.id, 'changed', false, 'status', 'IGNORED');
  end if;
  if v_s.status <> 'PENDING' then
    raise exception 'AI_SUGGESTION_INVALID_TRANSITION' using errcode = '22023';
  end if;

  update public.ai_suggestions s set status = 'IGNORED', decided_by = v_actor, decided_at = now()
  where s.id = v_s.id;

  perform app.ai_write_audit(v_s.workspace_id, v_actor, v_s.user_id, 'AI_SUGGESTION', v_s.id, 'AI_SUGGESTION_IGNORED',
    jsonb_build_object('actor_kind', 'USER', 'finding_id', v_s.finding_id, 'action', v_s.action));
  return jsonb_build_object('suggestion_id', v_s.id, 'changed', true, 'status', 'IGNORED');
end;
$$;

-- User-initiated hard delete (DATA_MODEL_PLAN §7: findings are user-deletable;
-- core records are unaffected). Suggestions cascade. Not callable by providers.
create or replace function public.rpc_ai_delete_finding(p_finding_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_finding public.ai_findings%rowtype;
  v_suggestions integer;
begin
  if v_actor is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_finding from public.ai_findings f
  where f.id = p_finding_id and f.user_id = v_actor
  for update;
  if not found or not public.is_workspace_member(v_finding.workspace_id) then
    raise exception 'AI_FINDING_NOT_FOUND' using errcode = 'P0002';
  end if;

  select count(*) into v_suggestions from public.ai_suggestions s where s.finding_id = v_finding.id;
  delete from public.ai_findings f where f.id = v_finding.id;

  perform app.ai_write_audit(v_finding.workspace_id, v_actor, v_finding.user_id, 'AI_FINDING', v_finding.id, 'AI_FINDING_DELETED',
    jsonb_build_object('actor_kind', 'USER', 'kind', v_finding.kind, 'status', v_finding.status,
                       'provider', v_finding.provider, 'suggestions_deleted', v_suggestions));
  return jsonb_build_object('finding_id', v_finding.id, 'deleted', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Explicit EXECUTE boundaries (Supabase default privileges grant EXECUTE on
--    new public functions to anon/authenticated/service_role; revoke each).
-- -----------------------------------------------------------------------------
revoke all on function public.rpc_ai_ingest_run(uuid, uuid, text, text, text, text, text, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.rpc_ai_finalize_run(uuid, uuid, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.rpc_ai_ingest_finding(uuid, uuid, text, text, text, text, text, text, numeric, uuid, numeric, text, timestamptz, timestamptz, jsonb, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.rpc_ai_create_suggestion(uuid, uuid, text, jsonb, text, uuid, numeric) from public, anon, authenticated;
grant execute on function public.rpc_ai_ingest_run(uuid, uuid, text, text, text, text, text, text, jsonb, uuid) to service_role;
grant execute on function public.rpc_ai_finalize_run(uuid, uuid, text, jsonb, text, text) to service_role;
grant execute on function public.rpc_ai_ingest_finding(uuid, uuid, text, text, text, text, text, text, numeric, uuid, numeric, text, timestamptz, timestamptz, jsonb, text, jsonb, timestamptz) to service_role;
grant execute on function public.rpc_ai_create_suggestion(uuid, uuid, text, jsonb, text, uuid, numeric) to service_role;

revoke all on function public.rpc_ai_dismiss_finding(uuid) from public, anon, service_role;
revoke all on function public.rpc_ai_decide_suggestion(uuid, text) from public, anon, service_role;
revoke all on function public.rpc_ai_delete_finding(uuid) from public, anon, service_role;
grant execute on function public.rpc_ai_dismiss_finding(uuid) to authenticated;
grant execute on function public.rpc_ai_decide_suggestion(uuid, text) to authenticated;
grant execute on function public.rpc_ai_delete_finding(uuid) to authenticated;
