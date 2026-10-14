-- AI-11E: Recruiter Intelligence
--
-- Recruiter intelligence stays plain `ai_findings` rows (kind recruiter_intel; the payload is jsonb), so the people themselves
-- need NO new table. The additive contract fields (why, verification basis, drafts, discovery mode, identity keys) live in the
-- existing payload and are validated and normalized by the API contract.
--
-- This migration adds only what did not exist:
--   1. public.ai_recruiter_discovery_preferences: one bounded row per (workspace, owner): WHO is useful to connect with
--      (target companies, role categories, bounded per-run maximum, mode switches). Separate from the Job Discovery profile
--      (WHAT jobs), Providers (WHO executes) and Automations (WHEN).
--   2. service-role-only RPCs: save/get the preferences, resolve an existing recruiter by any identity tier (cross-source
--      dedupe), and list the companies that already have an active contact today.
--
-- Forward-only, additive. No data is changed, no grant is widened, nothing here touches applications, contacts or tasks.

-- -----------------------------------------------------------------------------
-- 1. ai_recruiter_discovery_preferences
-- -----------------------------------------------------------------------------
create table public.ai_recruiter_discovery_preferences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.user_accounts(user_id) on delete cascade,
  job_linked_enabled boolean not null default true,
  target_networking_enabled boolean not null default false,
  target_companies varchar(120)[] not null default '{}',
  preferred_roles varchar(32)[] not null default '{technical_recruiter,talent_acquisition,qa_manager,engineering_manager}',
  max_new_contacts_per_run smallint not null default 5,
  draft_outreach_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_ai_recruiter_prefs_owner unique (workspace_id, user_id),
  constraint chk_ai_recruiter_prefs_companies check (cardinality(target_companies) <= 25),
  constraint chk_ai_recruiter_prefs_roles check (
    preferred_roles <@ array['technical_recruiter', 'talent_acquisition', 'qa_manager', 'engineering_manager', 'hiring_manager', 'engineering_leader']::varchar(32)[]
    and cardinality(preferred_roles) between 1 and 6
  ),
  constraint chk_ai_recruiter_prefs_max check (max_new_contacts_per_run between 1 and 10),
  constraint chk_ai_recruiter_prefs_networking check (not target_networking_enabled or cardinality(target_companies) >= 1)
);

create trigger trg_ai_recruiter_prefs_updated before update on public.ai_recruiter_discovery_preferences
  for each row execute function app.touch_updated_at();

alter table public.ai_recruiter_discovery_preferences enable row level security;
revoke all on public.ai_recruiter_discovery_preferences from public, anon, authenticated;
grant select, insert, update, delete on public.ai_recruiter_discovery_preferences to service_role;
grant select on public.ai_recruiter_discovery_preferences to authenticated;

-- Owner-only, like the discovery profile: not even a workspace manager reads a peer's preferences.
create policy ai_recruiter_prefs_select_own on public.ai_recruiter_discovery_preferences
  for select to authenticated
  using (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));

-- Save (create or replace) the actor's preferences. The API validates first with friendly codes; this is defence in depth plus
-- the atomic upsert + audit. Arrays arrive as jsonb string arrays.
create or replace function public.rpc_ai_recruiter_prefs_save(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_prefs jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_created boolean;
  v_companies text[]; v_roles text[];
begin
  perform app.ai_assert_actor(p_actor_id, p_workspace_id);
  if p_prefs is null or jsonb_typeof(p_prefs) <> 'object' then
    raise exception 'AI_RECRUITER_PREFS_INVALID' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_prefs) k where k not in (
       'job_linked_enabled', 'target_networking_enabled', 'target_companies', 'preferred_roles', 'max_new_contacts_per_run', 'draft_outreach_enabled')) then
    raise exception 'AI_RECRUITER_PREFS_INVALID' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_prefs) e where e.key in ('target_companies', 'preferred_roles') and jsonb_typeof(e.value) <> 'array') then
    raise exception 'AI_RECRUITER_PREFS_INVALID' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_prefs) e, lateral jsonb_array_elements(case when jsonb_typeof(e.value) = 'array' then e.value else '[]'::jsonb end) x
              where jsonb_typeof(x) <> 'string' or btrim(x #>> '{}') = '') then
    raise exception 'AI_RECRUITER_PREFS_INVALID' using errcode = '22023';
  end if;

  select coalesce(array_agg(btrim(x)), '{}') into v_companies from jsonb_array_elements_text(coalesce(p_prefs->'target_companies', '[]')) x;
  select coalesce(array_agg(x), '{}') into v_roles from jsonb_array_elements_text(
    coalesce(p_prefs->'preferred_roles', '["technical_recruiter", "talent_acquisition", "qa_manager", "engineering_manager"]')) x;
  -- One company is one entry: reject a case-insensitive duplicate (the API also folds legal suffixes).
  if (select count(distinct lower(c)) from unnest(v_companies) c) <> cardinality(v_companies) then
    raise exception 'AI_RECRUITER_PREFS_INVALID' using errcode = '22023';
  end if;

  begin
    insert into public.ai_recruiter_discovery_preferences (
      workspace_id, user_id, job_linked_enabled, target_networking_enabled, target_companies, preferred_roles,
      max_new_contacts_per_run, draft_outreach_enabled
    ) values (
      p_workspace_id, p_actor_id, coalesce((p_prefs->>'job_linked_enabled')::boolean, true),
      coalesce((p_prefs->>'target_networking_enabled')::boolean, false), v_companies, v_roles,
      coalesce((p_prefs->>'max_new_contacts_per_run')::smallint, 5), coalesce((p_prefs->>'draft_outreach_enabled')::boolean, true)
    )
    on conflict (workspace_id, user_id) do update set
      job_linked_enabled = excluded.job_linked_enabled, target_networking_enabled = excluded.target_networking_enabled,
      target_companies = excluded.target_companies, preferred_roles = excluded.preferred_roles,
      max_new_contacts_per_run = excluded.max_new_contacts_per_run, draft_outreach_enabled = excluded.draft_outreach_enabled
    returning id, (xmax = 0) into v_id, v_created;
  exception
    when sqlstate '22P02' or sqlstate '22003' or sqlstate '22001' or sqlstate '23514' then
      raise exception 'AI_RECRUITER_PREFS_INVALID' using errcode = '22023';
  end;

  -- Counts and flags only: never the company names the user typed.
  perform app.ai_write_audit(p_workspace_id, p_actor_id, p_actor_id, 'AI_RECRUITER_PREFERENCES', v_id,
    case when v_created then 'AI_RECRUITER_PREFS_CREATED' else 'AI_RECRUITER_PREFS_UPDATED' end,
    jsonb_build_object('actor_kind', 'USER', 'companies_count', cardinality(v_companies), 'roles_count', cardinality(v_roles),
                       'networking_enabled', coalesce((p_prefs->>'target_networking_enabled')::boolean, false)));

  return jsonb_build_object('id', v_id, 'created', v_created);
end;
$$;

-- Read for ingestion (service_role): the deterministic policy backstop needs the owner's preferences.
create or replace function public.rpc_ai_recruiter_prefs_get(
  p_actor_id uuid,
  p_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
begin
  perform app.ai_assert_actor(p_actor_id, p_workspace_id);
  select to_jsonb(p) - 'id' - 'workspace_id' - 'user_id' - 'created_at' - 'updated_at' into v_row
    from public.ai_recruiter_discovery_preferences p
   where p.workspace_id = p_workspace_id and p.user_id = p_actor_id;
  return jsonb_build_object('prefs', v_row);
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Cross-source recruiter identity resolution
--    The caller passes candidate dedupe keys, STRONGEST FIRST (profile URL, provider person id, verified work email,
--    name + company). A candidate matches an existing recruiter finding of the SAME owner and workspace when it is that
--    finding's dedupe key or one of its stored identity keys. A weaker tier never merges two DIFFERENT strong identities: a
--    differing profile or person key means a different person.
-- -----------------------------------------------------------------------------
create or replace function public.rpc_ai_resolve_recruiter_key(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_keys text[],
  p_profile_key text,
  p_person_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_row record;
begin
  perform app.ai_assert_actor(p_actor_id, p_workspace_id);
  if p_keys is null or cardinality(p_keys) = 0 or cardinality(p_keys) > 8 then
    raise exception 'AI_RECRUITER_KEYS_INVALID' using errcode = '22023';
  end if;
  foreach v_key in array p_keys loop
    for v_row in
      select f.dedupe_key, f.status, f.created_at, f.payload,
             f.payload->>'profile_key' as profile_key, f.payload->>'person_key' as person_key
        from public.ai_findings f
       where f.workspace_id = p_workspace_id and f.user_id = p_actor_id and f.kind = 'recruiter_intel'
         and (f.dedupe_key = v_key or (f.payload->'identity_keys') ? v_key)
       order by f.created_at asc, f.id asc
       limit 5
    loop
      if p_profile_key is not null and v_row.profile_key is not null and v_row.profile_key <> p_profile_key then continue; end if;
      if p_person_key is not null and v_row.person_key is not null and v_row.person_key <> p_person_key then continue; end if;
      return jsonb_build_object('dedupe_key', v_row.dedupe_key, 'status', v_row.status, 'created_at', v_row.created_at, 'payload', v_row.payload);
    end loop;
  end loop;
  return jsonb_build_object('dedupe_key', null);
end;
$$;

-- Companies (normalized keys) that already have an ACTIVE recruiter finding surfaced since p_since.
create or replace function public.rpc_ai_recruiter_active_companies(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_company_keys text[],
  p_since timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_keys jsonb;
begin
  perform app.ai_assert_actor(p_actor_id, p_workspace_id);
  if p_company_keys is null or cardinality(p_company_keys) = 0 then
    return jsonb_build_object('company_keys', '[]'::jsonb);
  end if;
  if cardinality(p_company_keys) > 200 then
    raise exception 'AI_RECRUITER_KEYS_INVALID' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(distinct f.payload->>'company_key'), '[]'::jsonb) into v_keys
    from public.ai_findings f
   where f.workspace_id = p_workspace_id and f.user_id = p_actor_id and f.kind = 'recruiter_intel'
     and f.status in ('NEW', 'REVIEWED') and f.created_at >= p_since
     and f.payload->>'company_key' = any (p_company_keys);
  return jsonb_build_object('company_keys', v_keys);
end;
$$;

revoke all on function public.rpc_ai_recruiter_prefs_save(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.rpc_ai_recruiter_prefs_get(uuid, uuid) from public, anon, authenticated;
revoke all on function public.rpc_ai_resolve_recruiter_key(uuid, uuid, text[], text, text) from public, anon, authenticated;
revoke all on function public.rpc_ai_recruiter_active_companies(uuid, uuid, text[], timestamptz) from public, anon, authenticated;
grant execute on function public.rpc_ai_recruiter_prefs_save(uuid, uuid, jsonb) to service_role;
grant execute on function public.rpc_ai_recruiter_prefs_get(uuid, uuid) to service_role;
grant execute on function public.rpc_ai_resolve_recruiter_key(uuid, uuid, text[], text, text) to service_role;
grant execute on function public.rpc_ai_recruiter_active_companies(uuid, uuid, text[], timestamptz) to service_role;
