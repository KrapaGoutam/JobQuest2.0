-- =============================================================================
-- AI-11D: fresh job discovery (additive; forward-only)
--
-- DECISION: EXTEND the existing job-lead storage (public.ai_job_leads) and ADD the one
-- small piece that did not exist: the canonical, user-scoped discovery profile (WHAT
-- the user wants). Provider (WHO) and automation cadence (WHEN) stay in their existing
-- structures; nothing here carries credentials or provider ids.
--
--  1. public.ai_job_leads gains: a trustworthy posted TIMESTAMP (posted_at; null =
--     unknown, never "now"), a remote geography scope, a bounded source note, an
--     explicit experience range, bounded fit / gap reasons, a freshness SORT key
--     (freshness_at: sorting only, never displayed as a posted time) and a
--     conservative logical identity key (cross-source dedupe fallback).
--  2. public.ai_job_discovery_profiles: one bounded row per (workspace, owner).
--     Owner-only SELECT through RLS; all writes through a service_role RPC that
--     the API calls with the verified session user (same boundary as AI-11A).
--  3. rpc_ai_resolve_job_lead_key / rpc_ai_upsert_job_lead are replaced to use the
--     new columns. Existing rows keep working (all new columns are nullable or
--     defaulted); no row is rewritten except the freshness_at backfill.
--
-- No Production change. Existing dedupe keys are untouched.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1. ai_job_leads columns
-- -----------------------------------------------------------------------------
alter table public.ai_job_leads
  add column posted_at timestamptz,
  add column remote_scope varchar(12),
  add column remote_note varchar(200),
  add column experience_min_years smallint,
  add column experience_max_years smallint,
  add column fit_reasons jsonb not null default '[]'::jsonb,
  add column gap_reasons jsonb not null default '[]'::jsonb,
  add column logical_key varchar(64),
  add column alt_urls jsonb not null default '[]'::jsonb,
  add column freshness_at timestamptz;

-- Sort key only: the best known posting time, else the first time JobQuest stored the lead.
update public.ai_job_leads
   set freshness_at = coalesce(posted_at, (posted_date::timestamp at time zone 'UTC'), discovered_at)
 where freshness_at is null;

alter table public.ai_job_leads
  alter column freshness_at set not null,
  alter column freshness_at set default now();

alter table public.ai_job_leads
  add constraint chk_ai_job_leads_remote_scope check (remote_scope is null or remote_scope in ('us', 'restricted', 'region')),
  add constraint chk_ai_job_leads_experience check (
    (experience_min_years is null or experience_min_years between 0 and 50)
    and (experience_max_years is null or experience_max_years between 0 and 50)
    and (experience_min_years is null or experience_max_years is null or experience_min_years <= experience_max_years)
  ),
  add constraint chk_ai_job_leads_fit_reasons check (jsonb_typeof(fit_reasons) = 'array' and jsonb_array_length(fit_reasons) <= 8),
  add constraint chk_ai_job_leads_gap_reasons check (jsonb_typeof(gap_reasons) = 'array' and jsonb_array_length(gap_reasons) <= 8),
  -- Bounded provenance: other canonical URLs the same posting was found under (a second board, an ATS mirror).
  add constraint chk_ai_job_leads_alt_urls check (jsonb_typeof(alt_urls) = 'array' and jsonb_array_length(alt_urls) <= 4);

create index idx_ai_job_leads_freshness on public.ai_job_leads(workspace_id, freshness_at desc, id desc);
create index idx_ai_job_leads_logical_key on public.ai_job_leads(workspace_id, user_id, logical_key) where logical_key is not null;

-- -----------------------------------------------------------------------------
-- 2. ai_job_discovery_profiles (WHAT the user wants; no credentials, no provider)
-- -----------------------------------------------------------------------------
create table public.ai_job_discovery_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.user_accounts(user_id) on delete cascade,
  target_titles varchar(80)[] not null default '{}',
  include_restricted_remote boolean not null default false,
  cities varchar(80)[] not null default '{}',
  work_arrangements varchar(8)[] not null default '{remote}',
  employment_types varchar(16)[] not null default '{full_time}',
  freshness_window_hours smallint not null default 24,
  allow_unknown_posted_date boolean not null default false,
  max_experience_years smallint,
  experience_tolerance_years smallint not null default 0,
  excluded_title_terms varchar(40)[] not null default '{}',
  exclude_clearance boolean not null default true,
  software_qa_gate boolean not null default false,
  minimum_match_score smallint not null default 0,
  maximum_results smallint not null default 15,
  core_skills varchar(60)[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_ai_job_discovery_profiles_owner unique (workspace_id, user_id),
  constraint chk_ai_jdp_titles check (cardinality(target_titles) <= 20),
  constraint chk_ai_jdp_cities check (cardinality(cities) <= 5),
  constraint chk_ai_jdp_arrangements check (
    work_arrangements <@ array['remote', 'hybrid', 'onsite']::varchar(8)[] and cardinality(work_arrangements) between 1 and 3
  ),
  constraint chk_ai_jdp_employment check (
    employment_types <@ array['full_time', 'part_time', 'contract', 'temporary', 'internship', 'freelance', 'other']::varchar(16)[]
    and cardinality(employment_types) between 1 and 7
  ),
  constraint chk_ai_jdp_freshness check (freshness_window_hours in (12, 24, 48, 72)),
  constraint chk_ai_jdp_experience check (
    (max_experience_years is null or max_experience_years between 0 and 30) and experience_tolerance_years between 0 and 5
  ),
  constraint chk_ai_jdp_exclusions check (cardinality(excluded_title_terms) <= 20),
  constraint chk_ai_jdp_min_score check (minimum_match_score between 0 and 100),
  constraint chk_ai_jdp_max_results check (maximum_results between 1 and 25),
  constraint chk_ai_jdp_skills check (cardinality(core_skills) <= 20)
);

create trigger trg_ai_job_discovery_profiles_updated before update on public.ai_job_discovery_profiles
  for each row execute function app.touch_updated_at();

alter table public.ai_job_discovery_profiles enable row level security;
revoke all on public.ai_job_discovery_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.ai_job_discovery_profiles to service_role;
grant select on public.ai_job_discovery_profiles to authenticated;

create policy ai_job_discovery_profiles_select_own on public.ai_job_discovery_profiles
  for select to authenticated
  using (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));

-- Save (create or replace) the caller's profile. The API validates first with friendly codes; this is
-- defence in depth plus the atomic upsert + audit. Arrays arrive as jsonb string arrays.
create or replace function public.rpc_ai_job_discovery_profile_save(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_profile jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_created boolean;
  v_titles text[]; v_cities text[]; v_arr text[]; v_emp text[]; v_excl text[]; v_skills text[];
begin
  perform app.ai_assert_actor(p_actor_id, p_workspace_id);
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'AI_JOB_PROFILE_INVALID' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_profile) k where k not in (
       'target_titles', 'include_restricted_remote', 'cities', 'work_arrangements', 'employment_types',
       'freshness_window_hours', 'allow_unknown_posted_date', 'max_experience_years', 'experience_tolerance_years',
       'excluded_title_terms', 'exclude_clearance', 'software_qa_gate', 'minimum_match_score', 'maximum_results', 'core_skills')) then
    raise exception 'AI_JOB_PROFILE_INVALID' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_profile) e where e.key in (
       'target_titles', 'cities', 'work_arrangements', 'employment_types', 'excluded_title_terms', 'core_skills')
       and jsonb_typeof(e.value) <> 'array') then
    raise exception 'AI_JOB_PROFILE_INVALID' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_profile) e, lateral jsonb_array_elements(case when jsonb_typeof(e.value) = 'array' then e.value else '[]'::jsonb end) x
              where jsonb_typeof(x) <> 'string' or btrim(x #>> '{}') = '') then
    raise exception 'AI_JOB_PROFILE_INVALID' using errcode = '22023';
  end if;

  select coalesce(array_agg(btrim(x)), '{}') into v_titles from jsonb_array_elements_text(coalesce(p_profile->'target_titles', '[]')) x;
  select coalesce(array_agg(btrim(x)), '{}') into v_cities from jsonb_array_elements_text(coalesce(p_profile->'cities', '[]')) x;
  select coalesce(array_agg(x), '{}') into v_arr from jsonb_array_elements_text(coalesce(p_profile->'work_arrangements', '["remote"]')) x;
  select coalesce(array_agg(x), '{}') into v_emp from jsonb_array_elements_text(coalesce(p_profile->'employment_types', '["full_time"]')) x;
  select coalesce(array_agg(btrim(x)), '{}') into v_excl from jsonb_array_elements_text(coalesce(p_profile->'excluded_title_terms', '[]')) x;
  select coalesce(array_agg(btrim(x)), '{}') into v_skills from jsonb_array_elements_text(coalesce(p_profile->'core_skills', '[]')) x;

  begin
    insert into public.ai_job_discovery_profiles (
      workspace_id, user_id, target_titles, include_restricted_remote, cities, work_arrangements, employment_types,
      freshness_window_hours, allow_unknown_posted_date, max_experience_years, experience_tolerance_years,
      excluded_title_terms, exclude_clearance, software_qa_gate, minimum_match_score, maximum_results, core_skills
    ) values (
      p_workspace_id, p_actor_id, v_titles,
      coalesce((p_profile->>'include_restricted_remote')::boolean, false), v_cities, v_arr, v_emp,
      coalesce((p_profile->>'freshness_window_hours')::smallint, 24), coalesce((p_profile->>'allow_unknown_posted_date')::boolean, false),
      nullif(p_profile->>'max_experience_years', '')::smallint, coalesce((p_profile->>'experience_tolerance_years')::smallint, 0),
      v_excl, coalesce((p_profile->>'exclude_clearance')::boolean, true), coalesce((p_profile->>'software_qa_gate')::boolean, false),
      coalesce((p_profile->>'minimum_match_score')::smallint, 0), coalesce((p_profile->>'maximum_results')::smallint, 15), v_skills
    )
    on conflict (workspace_id, user_id) do update set
      target_titles = excluded.target_titles,
      include_restricted_remote = excluded.include_restricted_remote, cities = excluded.cities,
      work_arrangements = excluded.work_arrangements, employment_types = excluded.employment_types,
      freshness_window_hours = excluded.freshness_window_hours, allow_unknown_posted_date = excluded.allow_unknown_posted_date,
      max_experience_years = excluded.max_experience_years, experience_tolerance_years = excluded.experience_tolerance_years,
      excluded_title_terms = excluded.excluded_title_terms, exclude_clearance = excluded.exclude_clearance,
      software_qa_gate = excluded.software_qa_gate, minimum_match_score = excluded.minimum_match_score,
      maximum_results = excluded.maximum_results, core_skills = excluded.core_skills
    returning id, (xmax = 0) into v_id, v_created;
  exception
    when sqlstate '22P02' or sqlstate '22003' or sqlstate '22001' or sqlstate '23514' then
      raise exception 'AI_JOB_PROFILE_INVALID' using errcode = '22023';
  end;

  -- Counts and enums only: never the user-typed titles, cities or keywords.
  perform app.ai_write_audit(p_workspace_id, p_actor_id, p_actor_id, 'AI_JOB_DISCOVERY_PROFILE', v_id,
    case when v_created then 'AI_JOB_PROFILE_CREATED' else 'AI_JOB_PROFILE_UPDATED' end,
    jsonb_build_object('actor_kind', 'USER', 'titles_count', cardinality(v_titles), 'exclusions_count', cardinality(v_excl),
                       'freshness_window_hours', coalesce((p_profile->>'freshness_window_hours')::int, 24)));

  return jsonb_build_object('id', v_id, 'created', v_created);
end;
$$;

-- Read for ingestion (service_role): the deterministic policy backstop needs the owner's profile.
create or replace function public.rpc_ai_job_discovery_profile_get(
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
    from public.ai_job_discovery_profiles p
   where p.workspace_id = p_workspace_id and p.user_id = p_actor_id;
  return jsonb_build_object('profile', v_row);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Cross-run identity resolution (replaces the AI-6 helper; adds the logical key)
--    Order of preference unchanged (board id, then URL); the new step is a conservative
--    fallback: same company + normalized title + location/arrangement within 45 days,
--    never merged across two different board ids of the SAME source.
-- -----------------------------------------------------------------------------
drop function if exists public.rpc_ai_resolve_job_lead_key(uuid, uuid, text, text, text);
create or replace function public.rpc_ai_resolve_job_lead_key(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_canonical_url text,
  p_source_name text,
  p_external_job_id text,
  p_logical_key text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  perform app.ai_assert_actor(p_actor_id, p_workspace_id);
  select f.dedupe_key into v_key
  from public.ai_job_leads l
  join public.ai_findings f on f.id = l.finding_id
  where l.workspace_id = p_workspace_id and l.user_id = p_actor_id
    and (
      (p_external_job_id is not null and p_source_name is not null
        and l.source_name = p_source_name and l.external_job_id = p_external_job_id)
      or (p_canonical_url is not null and (l.canonical_url = p_canonical_url or l.alt_urls ? p_canonical_url))
      or (p_logical_key is not null and l.logical_key = p_logical_key
          and l.discovered_at > now() - interval '45 days'
          and not (l.external_job_id is not null and p_external_job_id is not null
                   and l.source_name is not distinct from p_source_name and l.external_job_id <> p_external_job_id))
    )
  order by (l.external_job_id is not distinct from p_external_job_id and l.source_name is not distinct from p_source_name) desc,
           (l.canonical_url is not distinct from p_canonical_url) desc,
           l.created_at asc
  limit 1;
  return jsonb_build_object('dedupe_key', v_key);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Child projection (replaces the AI-6 upsert; same closed-finding rule)
-- -----------------------------------------------------------------------------
create or replace function public.rpc_ai_upsert_job_lead(
  p_actor_id uuid,
  p_finding_id uuid,
  p_lead jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_f public.ai_findings%rowtype;
  v_id uuid;
  v_created boolean;
begin
  select * into v_f from public.ai_findings f
  where f.id = p_finding_id and f.user_id = p_actor_id and f.kind = 'job_lead'
  for update;
  if not found then
    raise exception 'AI_FINDING_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform app.ai_assert_actor(p_actor_id, v_f.workspace_id);
  if p_lead is null or jsonb_typeof(p_lead) <> 'object'
     or nullif(btrim(p_lead->>'company'), '') is null or nullif(btrim(p_lead->>'title'), '') is null then
    raise exception 'AI_FINDING_INVALID_JOB_LEAD' using errcode = '22023';
  end if;
  if v_f.status <> 'NEW' then
    return jsonb_build_object('job_lead_id', (select l.id from public.ai_job_leads l where l.finding_id = v_f.id), 'outcome', 'skipped_closed');
  end if;

  begin
    insert into public.ai_job_leads (
      finding_id, workspace_id, user_id, company, title, location, work_arrangement, employment_type,
      source_name, source_url, canonical_url, external_job_id, posted_date, posted_at, salary_min, salary_max,
      salary_currency, salary_period, experience_level, experience_min_years, experience_max_years,
      remote_scope, remote_note, fit_reasons, gap_reasons, logical_key, freshness_at,
      match_score, description, description_truncated,
      description_length, required_skills, preferred_skills, payload_version
    ) values (
      v_f.id, v_f.workspace_id, v_f.user_id,
      btrim(p_lead->>'company'), btrim(p_lead->>'title'),
      nullif(btrim(p_lead->>'location'), ''), nullif(p_lead->>'work_arrangement', ''), nullif(p_lead->>'employment_type', ''),
      nullif(btrim(p_lead->>'source_name'), ''), nullif(p_lead->>'source_url', ''), nullif(p_lead->>'canonical_url', ''),
      nullif(btrim(p_lead->>'external_job_id'), ''), nullif(p_lead->>'posted_date', '')::date, nullif(p_lead->>'posted_at', '')::timestamptz,
      nullif(p_lead->>'salary_min', '')::integer, nullif(p_lead->>'salary_max', '')::integer,
      nullif(p_lead->>'salary_currency', ''), nullif(p_lead->>'salary_period', ''),
      nullif(btrim(p_lead->>'experience_level'), ''),
      nullif(p_lead->>'experience_min_years', '')::smallint, nullif(p_lead->>'experience_max_years', '')::smallint,
      nullif(p_lead->>'remote_scope', ''), nullif(btrim(p_lead->>'remote_note'), ''),
      coalesce(p_lead->'fit_reasons', '[]'::jsonb), coalesce(p_lead->'gap_reasons', '[]'::jsonb),
      nullif(p_lead->>'logical_key', ''),
      coalesce(nullif(p_lead->>'posted_at', '')::timestamptz, (nullif(p_lead->>'posted_date', '')::date)::timestamp at time zone 'UTC', now()),
      nullif(p_lead->>'match_score', '')::smallint,
      nullif(p_lead->>'description', ''), coalesce((p_lead->>'description_truncated')::boolean, false),
      nullif(p_lead->>'description_length', '')::integer,
      coalesce(p_lead->'required_skills', '[]'::jsonb), coalesce(p_lead->'preferred_skills', '[]'::jsonb),
      coalesce(nullif(p_lead->>'payload_version', ''), '1.0')
    )
    on conflict (finding_id) do update set
      company = excluded.company, title = excluded.title, location = excluded.location,
      work_arrangement = excluded.work_arrangement, employment_type = excluded.employment_type,
      -- Identity and posting-time facts only ever accumulate: a later submission that states less
      -- (another provider that saw only the board id, say) must not erase the URL / id / posted time. A lead keeps the
      -- URL it was first stored under; a different URL seen later is bounded provenance (alt_urls), so every URL the
      -- posting was found under keeps resolving to this one lead.
      source_name = case when public.ai_job_leads.external_job_id is null and excluded.external_job_id is not null
                         then coalesce(excluded.source_name, public.ai_job_leads.source_name)
                         else coalesce(public.ai_job_leads.source_name, excluded.source_name) end,
      source_url = coalesce(public.ai_job_leads.source_url, excluded.source_url),
      canonical_url = coalesce(public.ai_job_leads.canonical_url, excluded.canonical_url),
      alt_urls = case
        when excluded.canonical_url is not null and public.ai_job_leads.canonical_url is not null
             and excluded.canonical_url <> public.ai_job_leads.canonical_url
             and not (public.ai_job_leads.alt_urls ? excluded.canonical_url)
        then (select coalesce(jsonb_agg(t.u order by t.o), '[]'::jsonb)
                from (select u, o from jsonb_array_elements_text(public.ai_job_leads.alt_urls || to_jsonb(excluded.canonical_url)) with ordinality x(u, o)
                       order by o desc limit 4) t)
        else public.ai_job_leads.alt_urls end,
      external_job_id = coalesce(public.ai_job_leads.external_job_id, excluded.external_job_id),
      posted_date = coalesce(excluded.posted_date, public.ai_job_leads.posted_date),
      posted_at = coalesce(excluded.posted_at, public.ai_job_leads.posted_at),
      logical_key = coalesce(excluded.logical_key, public.ai_job_leads.logical_key),
      remote_scope = coalesce(excluded.remote_scope, public.ai_job_leads.remote_scope),
      remote_note = coalesce(excluded.remote_note, public.ai_job_leads.remote_note),
      experience_min_years = coalesce(excluded.experience_min_years, public.ai_job_leads.experience_min_years),
      experience_max_years = coalesce(excluded.experience_max_years, public.ai_job_leads.experience_max_years),
      freshness_at = coalesce(
        coalesce(excluded.posted_at, public.ai_job_leads.posted_at),
        (coalesce(excluded.posted_date, public.ai_job_leads.posted_date))::timestamp at time zone 'UTC',
        public.ai_job_leads.discovered_at),
      fit_reasons = excluded.fit_reasons, gap_reasons = excluded.gap_reasons,
      salary_min = excluded.salary_min, salary_max = excluded.salary_max, salary_currency = excluded.salary_currency,
      salary_period = excluded.salary_period, experience_level = excluded.experience_level,
      match_score = excluded.match_score, description = excluded.description,
      description_truncated = excluded.description_truncated, description_length = excluded.description_length,
      required_skills = excluded.required_skills, preferred_skills = excluded.preferred_skills,
      payload_version = excluded.payload_version
      -- discovered_at is intentionally not updated: it records when JobQuest FIRST stored the lead.
    returning id, (xmax = 0) into v_id, v_created;
  exception
    when sqlstate '22P02' or sqlstate '22003' or sqlstate '22007' or sqlstate '22008' or sqlstate '22001' then
      raise exception 'AI_FINDING_INVALID_JOB_LEAD' using errcode = '22023';
  end;

  return jsonb_build_object('job_lead_id', v_id, 'outcome', case when v_created then 'created' else 'updated' end);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Explicit EXECUTE boundaries (service_role only)
-- -----------------------------------------------------------------------------
revoke all on function public.rpc_ai_job_discovery_profile_save(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.rpc_ai_job_discovery_profile_get(uuid, uuid) from public, anon, authenticated;
revoke all on function public.rpc_ai_resolve_job_lead_key(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.rpc_ai_upsert_job_lead(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.rpc_ai_job_discovery_profile_save(uuid, uuid, jsonb) to service_role;
grant execute on function public.rpc_ai_job_discovery_profile_get(uuid, uuid) to service_role;
grant execute on function public.rpc_ai_resolve_job_lead_key(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.rpc_ai_upsert_job_lead(uuid, uuid, jsonb) to service_role;

commit;
