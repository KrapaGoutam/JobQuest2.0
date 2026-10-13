-- =============================================================================
-- AI-11A: provider-neutral automation foundation (additive; forward-only)
--
-- DECISION: EXTEND public.ai_workflow_configs (no new table). A row is one
-- "automation": a named, owner-scoped definition of WHICH workflow runs, with
-- WHICH provider, WHEN (a bounded cadence + IANA zone), with WHICH sections and
-- delivery preferences. It carries no credentials and no provider schedule ids
-- (adapter metadata, if ever needed, belongs in the existing `settings` jsonb
-- under an `adapter` key). Operational state (last run / last success / last
-- error) is NOT stored here: it is derived from public.ai_runs (provider +
-- workflow match), and next_expected_run is computed from this schedule.
--
-- Uniqueness: was one row per (workspace, owner, workflow). Run history is
-- matched to an automation by (workflow, provider), so the exact invariant is
-- one automation per (workspace, owner, workflow, provider) plus a unique name
-- per owner. Starting strict is deliberate: relaxing later (once explicit
-- run -> automation linkage exists with provider adapters) is non-breaking.
--
-- Access: unchanged boundary. authenticated keeps SELECT only (owner-only RLS
-- policy from AI-1B); all writes go through the service_role RPCs below, which
-- the API calls with the verified session user as p_actor_id (connector-token
-- convention). No MCP/provider can reach them. Production is not touched here.
-- =============================================================================

-- One transaction: a failure part-way must not leave a half-migrated table.
begin;

-- -----------------------------------------------------------------------------
-- 1. Columns
-- -----------------------------------------------------------------------------
alter table public.ai_workflow_configs
  add column name varchar(80),
  add column cadence varchar(16) not null default 'manual_only',
  add column local_time varchar(5),
  add column timezone varchar(64),
  add column weekdays smallint[] not null default '{}',
  add column sections varchar(24)[] not null default '{}',
  add column delivery varchar(16)[] not null default '{ai_hub}';

-- Rows predating AI-11A (none expected) get a stable name and cannot stay
-- enabled without a provider.
update public.ai_workflow_configs
   set name = initcap(replace(workflow, '_', ' '))
 where name is null;
update public.ai_workflow_configs
   set enabled = false
 where enabled and primary_provider is null;

alter table public.ai_workflow_configs alter column name set not null;

-- -----------------------------------------------------------------------------
-- 2. Constraints (defence in depth: the RPC validates first with friendly codes)
-- -----------------------------------------------------------------------------
alter table public.ai_workflow_configs
  add constraint chk_ai_workflow_configs_name check (btrim(name) <> ''),
  add constraint chk_ai_workflow_configs_cadence check (cadence in ('daily', 'weekdays', 'selected_days', 'weekly', 'manual_only')),
  add constraint chk_ai_workflow_configs_local_time check (local_time is null or local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  -- ISO weekdays: 1 = Monday .. 7 = Sunday.
  add constraint chk_ai_workflow_configs_weekdays check (weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[] and cardinality(weekdays) <= 7),
  add constraint chk_ai_workflow_configs_schedule_shape check (
    (cadence = 'manual_only' and cardinality(weekdays) = 0)
    or (cadence in ('daily', 'weekdays') and cardinality(weekdays) = 0 and local_time is not null and timezone is not null)
    or (cadence = 'weekly' and cardinality(weekdays) = 1 and local_time is not null and timezone is not null)
    or (cadence = 'selected_days' and cardinality(weekdays) between 1 and 7 and local_time is not null and timezone is not null)
  ),
  add constraint chk_ai_workflow_configs_sections check (
    sections::text[] <@ array['email_triage', 'job_discovery', 'recruiter_intel', 'calendar_review', 'followups', 'goal_summary']::text[]
    and cardinality(sections) <= 6
  ),
  add constraint chk_ai_workflow_configs_delivery check (
    delivery::text[] <@ array['ai_hub', 'email_summary']::text[]
    and 'ai_hub' = any (delivery::text[])
    and cardinality(delivery) <= 2
  ),
  add constraint chk_ai_workflow_configs_enabled_provider check (not enabled or primary_provider is not null);

alter table public.ai_workflow_configs drop constraint uq_ai_workflow_configs_owner_workflow;
create unique index uq_ai_workflow_configs_owner_workflow_provider
  on public.ai_workflow_configs(workspace_id, user_id, workflow, primary_provider);
create unique index uq_ai_workflow_configs_owner_name
  on public.ai_workflow_configs(workspace_id, user_id, lower(name));

-- -----------------------------------------------------------------------------
-- 3. Service-role save / delete RPCs (owner only; AI-only table, no core writes)
-- -----------------------------------------------------------------------------
create or replace function public.rpc_ai_automation_save(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_id uuid,
  p_name text,
  p_workflow text,
  p_enabled boolean,
  p_provider text,
  p_cadence text,
  p_local_time text,
  p_timezone text,
  p_weekdays integer[],
  p_sections text[],
  p_delivery text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_weekdays smallint[];
  v_sections text[];
  v_delivery text[];
  v_existing public.ai_workflow_configs%rowtype;
  v_id uuid;
  v_created boolean := p_id is null;
begin
  perform app.ai_assert_actor(p_actor_id, p_workspace_id);

  if v_name = '' or char_length(v_name) > 80 then
    raise exception 'AI_AUTOMATION_INVALID_NAME' using errcode = '22023';
  end if;
  if p_workflow is null or p_workflow not in ('daily_brief', 'email_triage', 'job_discovery', 'recruiter_intel', 'calendar_review', 'other') then
    raise exception 'AI_AUTOMATION_INVALID_WORKFLOW' using errcode = '22023';
  end if;
  -- 'system' is reserved for a future internal scheduler; there is none today.
  if p_provider is null or p_provider not in ('claude', 'chatgpt', 'gemini', 'manual') then
    raise exception 'AI_AUTOMATION_INVALID_PROVIDER' using errcode = '22023';
  end if;
  if p_enabled is null then
    raise exception 'AI_AUTOMATION_INVALID_ENABLED' using errcode = '22023';
  end if;
  if p_cadence is null or p_cadence not in ('daily', 'weekdays', 'selected_days', 'weekly', 'manual_only') then
    raise exception 'AI_AUTOMATION_INVALID_CADENCE' using errcode = '22023';
  end if;
  if p_local_time is not null and p_local_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'AI_AUTOMATION_INVALID_TIME' using errcode = '22023';
  end if;
  -- IANA "Area/Location" names (or UTC) that the database also knows; the tzdata
  -- posix/ and right/ aliases are not IANA names.
  if p_timezone is not null and (
       p_timezone !~ '^(UTC|[A-Za-z_]+(/[A-Za-z0-9_+-]+){1,2})$'
    or p_timezone ~ '^(posix|right)/'
    or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_timezone)
  ) then
    raise exception 'AI_AUTOMATION_INVALID_TIMEZONE' using errcode = '22023';
  end if;

  if exists (select 1 from unnest(coalesce(p_weekdays, '{}')) x where x is null or x not between 1 and 7) then
    raise exception 'AI_AUTOMATION_INVALID_WEEKDAYS' using errcode = '22023';
  end if;
  select coalesce(array_agg(d order by d), '{}')::smallint[] into v_weekdays
    from (select distinct x as d from unnest(coalesce(p_weekdays, '{}')) x) s;

  if p_cadence = 'manual_only' then
    if cardinality(v_weekdays) <> 0 then
      raise exception 'AI_AUTOMATION_INVALID_WEEKDAYS' using errcode = '22023';
    end if;
  else
    if p_local_time is null then
      raise exception 'AI_AUTOMATION_INVALID_TIME' using errcode = '22023';
    end if;
    if p_timezone is null then
      raise exception 'AI_AUTOMATION_INVALID_TIMEZONE' using errcode = '22023';
    end if;
    if (p_cadence in ('daily', 'weekdays') and cardinality(v_weekdays) <> 0)
       or (p_cadence = 'weekly' and cardinality(v_weekdays) <> 1)
       or (p_cadence = 'selected_days' and cardinality(v_weekdays) < 1) then
      raise exception 'AI_AUTOMATION_INVALID_WEEKDAYS' using errcode = '22023';
    end if;
  end if;

  select coalesce(array_agg(s order by s), '{}') into v_sections
    from (select distinct x as s from unnest(coalesce(p_sections, '{}')) x) q;
  if not v_sections <@ array['email_triage', 'job_discovery', 'recruiter_intel', 'calendar_review', 'followups', 'goal_summary']::text[] then
    raise exception 'AI_AUTOMATION_INVALID_SECTIONS' using errcode = '22023';
  end if;
  -- Only composite workflows (the digest, a custom review) carry sections; the
  -- single-purpose workflows ARE their own section.
  if cardinality(v_sections) > 0 and p_workflow not in ('daily_brief', 'other') then
    raise exception 'AI_AUTOMATION_INVALID_SECTIONS' using errcode = '22023';
  end if;

  select coalesce(array_agg(s order by s), '{}') into v_delivery
    from (select distinct x as s from unnest(coalesce(p_delivery, '{}')) x) q;
  if not v_delivery <@ array['ai_hub', 'email_summary']::text[] or not 'ai_hub' = any (v_delivery) then
    raise exception 'AI_AUTOMATION_INVALID_DELIVERY' using errcode = '22023';
  end if;

  if p_id is null then
    if (select count(*) from public.ai_workflow_configs c
         where c.workspace_id = p_workspace_id and c.user_id = p_actor_id) >= 10 then
      raise exception 'AI_AUTOMATION_LIMIT' using errcode = '53400';
    end if;
    insert into public.ai_workflow_configs (
      workspace_id, user_id, name, workflow, enabled, primary_provider, cadence,
      local_time, timezone, weekdays, sections, delivery
    ) values (
      p_workspace_id, p_actor_id, v_name, p_workflow, p_enabled, p_provider, p_cadence,
      p_local_time, p_timezone, v_weekdays, v_sections, v_delivery
    ) returning id into v_id;
  else
    select * into v_existing from public.ai_workflow_configs c
     where c.id = p_id and c.workspace_id = p_workspace_id and c.user_id = p_actor_id
     for update;
    if not found then
      raise exception 'AI_AUTOMATION_NOT_FOUND' using errcode = 'P0002';
    end if;
    update public.ai_workflow_configs c set
      name = v_name, workflow = p_workflow, enabled = p_enabled, primary_provider = p_provider,
      cadence = p_cadence, local_time = p_local_time, timezone = p_timezone,
      weekdays = v_weekdays, sections = v_sections, delivery = v_delivery
    where c.id = v_existing.id;
    v_id := v_existing.id;
  end if;

  -- Ids, enums and counts only: never the user-typed name.
  perform app.ai_write_audit(p_workspace_id, p_actor_id, p_actor_id, 'AI_AUTOMATION', v_id,
    case when v_created then 'AI_AUTOMATION_CREATED' else 'AI_AUTOMATION_UPDATED' end,
    jsonb_build_object('actor_kind', 'USER', 'workflow', p_workflow, 'provider', p_provider,
                       'cadence', p_cadence, 'enabled', p_enabled,
                       'sections_count', cardinality(v_sections), 'email_delivery', 'email_summary' = any (v_delivery),
                       'enabled_changed', not v_created and v_existing.enabled is distinct from p_enabled));

  return jsonb_build_object('id', v_id, 'created', v_created);
end;
$$;

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
begin
  perform app.ai_assert_actor(p_actor_id, p_workspace_id);
  select * into v_row from public.ai_workflow_configs c
   where c.id = p_id and c.workspace_id = p_workspace_id and c.user_id = p_actor_id
   for update;
  if not found then
    raise exception 'AI_AUTOMATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  delete from public.ai_workflow_configs c where c.id = v_row.id;
  perform app.ai_write_audit(p_workspace_id, p_actor_id, p_actor_id, 'AI_AUTOMATION', v_row.id, 'AI_AUTOMATION_DELETED',
    jsonb_build_object('actor_kind', 'USER', 'workflow', v_row.workflow, 'provider', v_row.primary_provider,
                       'cadence', v_row.cadence, 'enabled', v_row.enabled));
  return jsonb_build_object('id', v_row.id, 'deleted', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Explicit EXECUTE boundary: service_role only (the API authenticates the user).
-- -----------------------------------------------------------------------------
revoke all on function public.rpc_ai_automation_save(uuid, uuid, uuid, text, text, boolean, text, text, text, text, integer[], text[], text[]) from public, anon, authenticated;
revoke all on function public.rpc_ai_automation_delete(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.rpc_ai_automation_save(uuid, uuid, uuid, text, text, boolean, text, text, text, text, integer[], text[], text[]) to service_role;
grant execute on function public.rpc_ai_automation_delete(uuid, uuid, uuid) to service_role;

commit;
