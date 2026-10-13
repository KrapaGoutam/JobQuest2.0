-- =============================================================================
-- AI-6: External intelligence sources (additive; no core table changes)
--
-- Email events and recruiter intel stay plain `ai_findings` (kind email_event /
-- recruiter_intel): their filters (date, category, provider, status, priority) are
-- real finding columns and the rest is queryable JSON. Job leads need real
-- filtering/uniqueness, so they get a CHILD table of the finding:
--
--   ai_job_leads  (1:1 with an ai_findings row of kind job_lead)
--
-- The finding stays the system-of-record AI observation (provider, run, status,
-- confidence, provenance, dedupe identity, audit). The child holds normalized,
-- queryable job fields plus the bounded plain-text description (kept out of the
-- 16 KiB finding payload).
--
-- Access boundary (mirrors the parent finding exactly):
--   * authenticated: SELECT only, same predicate as ai_findings
--     (public.can_access_owned_record(workspace_id, user_id)). The composite FK
--     (finding_id, workspace_id, user_id) guarantees the child's owner columns can
--     never differ from the parent's, so a child row cannot expose a finding that
--     RLS hides.
--   * No client INSERT/UPDATE/DELETE. The only writer is rpc_ai_upsert_job_lead
--     (service_role), called by the ingestion service AFTER the parent finding was
--     ingested. It writes NO audit event: the parent ingestion already audited the
--     authoritative mutation once.
--   * Review/dismiss/delete keep using the AI-1B finding RPCs; the child cascades.
-- =============================================================================

-- 1. Parent owner key (target of the composite FK). Cheap: ai_findings is small.
alter table public.ai_findings
  add constraint uq_ai_findings_id_owner unique (id, workspace_id, user_id);

-- 2. ai_job_leads
create table public.ai_job_leads (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null,
  workspace_id uuid not null,
  user_id uuid not null,
  company varchar(200) not null,
  title varchar(300) not null,
  location varchar(200) null,
  work_arrangement varchar(16) null,
  employment_type varchar(24) null,
  source_name varchar(64) null,
  source_url varchar(2048) null,
  canonical_url varchar(2048) null,
  external_job_id varchar(255) null,
  -- Calendar date the SOURCE states the job was posted. Never inferred. Distinct from
  -- discovered_at (when JobQuest first stored the lead).
  posted_date date null,
  discovered_at timestamptz not null default now(),
  salary_min integer null,
  salary_max integer null,
  salary_currency char(3) null,
  salary_period varchar(8) null,
  experience_level varchar(60) null,
  -- Provider analysis (0..100), not an objective measure.
  match_score smallint null,
  -- Normalized PLAIN TEXT only (never HTML), bounded to 30,000 characters.
  description text null,
  description_truncated boolean not null default false,
  description_length integer null,
  required_skills jsonb not null default '[]'::jsonb,
  preferred_skills jsonb not null default '[]'::jsonb,
  payload_version varchar(8) not null default '1.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_ai_job_leads_finding unique (finding_id),
  constraint fk_ai_job_leads_finding foreign key (finding_id, workspace_id, user_id)
    references public.ai_findings (id, workspace_id, user_id) on delete cascade,
  constraint chk_ai_job_leads_arrangement check (work_arrangement is null or work_arrangement in ('remote', 'hybrid', 'onsite')),
  constraint chk_ai_job_leads_employment check (
    employment_type is null or employment_type in ('full_time', 'part_time', 'contract', 'temporary', 'internship', 'freelance', 'other')
  ),
  constraint chk_ai_job_leads_salary_period check (salary_period is null or salary_period in ('year', 'month', 'week', 'day', 'hour')),
  constraint chk_ai_job_leads_salary check (
    (salary_min is null or salary_min >= 0) and (salary_max is null or salary_max >= 0)
    and (salary_min is null or salary_max is null or salary_min <= salary_max)
  ),
  constraint chk_ai_job_leads_currency check (salary_currency is null or salary_currency ~ '^[A-Z]{3}$'),
  constraint chk_ai_job_leads_match_score check (match_score is null or match_score between 0 and 100),
  constraint chk_ai_job_leads_description check (description is null or char_length(description) <= 30000),
  constraint chk_ai_job_leads_skills check (jsonb_typeof(required_skills) = 'array' and jsonb_typeof(preferred_skills) = 'array'),
  constraint chk_ai_job_leads_urls check (
    (source_url is null or source_url ~* '^https?://') and (canonical_url is null or canonical_url ~* '^https?://')
  ),
  constraint chk_ai_job_leads_payload_version check (payload_version ~ '^[0-9]+\.[0-9]+$')
);

-- Query needs only (no speculative indexes): newest-first listing per workspace, and the two
-- cross-run identity lookups used by rpc_ai_resolve_job_lead_key.
create index idx_ai_job_leads_ws_discovered on public.ai_job_leads (workspace_id, discovered_at desc, id desc);
create index idx_ai_job_leads_owner_canonical_url on public.ai_job_leads (workspace_id, user_id, canonical_url)
  where canonical_url is not null;
create index idx_ai_job_leads_owner_external on public.ai_job_leads (workspace_id, user_id, source_name, external_job_id)
  where external_job_id is not null;

create trigger trg_ai_job_leads_updated before update on public.ai_job_leads
  for each row execute function app.touch_updated_at();

alter table public.ai_job_leads enable row level security;
revoke all on public.ai_job_leads from public, anon, authenticated;
grant select on public.ai_job_leads to authenticated;
grant select, insert, update, delete on public.ai_job_leads to service_role;

create policy ai_job_leads_select on public.ai_job_leads
  for select to authenticated
  using (public.can_access_owned_record(workspace_id, user_id));

-- 3. Cross-run identity resolution (read-only helper).
--    Providers may identify the same posting differently (one sends the board's job id, the
--    other only the URL). The finding dedupe key hierarchy is external id > URL > ..., so a
--    later submission can compute a DIFFERENT key for the same job. Before ingesting a
--    job_lead, the service asks for an existing lead (this owner, this workspace) with the
--    same canonical URL or the same (source, external id) and reuses that finding's key, so
--    the same logical lead is updated instead of duplicated. Provider is never considered.
create or replace function public.rpc_ai_resolve_job_lead_key(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_canonical_url text,
  p_source_name text,
  p_external_job_id text
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
      or (p_canonical_url is not null and l.canonical_url = p_canonical_url)
    )
  order by (l.external_job_id is not distinct from p_external_job_id and l.source_name is not distinct from p_source_name) desc,
           l.created_at asc
  limit 1;
  return jsonb_build_object('dedupe_key', v_key);
end;
$$;

-- 4. Child projection (service_role only). Idempotent upsert keyed by finding_id.
--    Called after rpc_ai_ingest_finding returned created / duplicate / updated, so a replay
--    heals a projection that failed earlier. A finding that is no longer NEW (reviewed,
--    dismissed, ...) is never rewritten, mirroring the parent's "unchanged_closed" rule.
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
      source_name, source_url, canonical_url, external_job_id, posted_date, salary_min, salary_max,
      salary_currency, salary_period, experience_level, match_score, description, description_truncated,
      description_length, required_skills, preferred_skills, payload_version
    ) values (
      v_f.id, v_f.workspace_id, v_f.user_id,
      btrim(p_lead->>'company'), btrim(p_lead->>'title'),
      nullif(btrim(p_lead->>'location'), ''), nullif(p_lead->>'work_arrangement', ''), nullif(p_lead->>'employment_type', ''),
      nullif(btrim(p_lead->>'source_name'), ''), nullif(p_lead->>'source_url', ''), nullif(p_lead->>'canonical_url', ''),
      nullif(btrim(p_lead->>'external_job_id'), ''), nullif(p_lead->>'posted_date', '')::date,
      nullif(p_lead->>'salary_min', '')::integer, nullif(p_lead->>'salary_max', '')::integer,
      nullif(p_lead->>'salary_currency', ''), nullif(p_lead->>'salary_period', ''),
      nullif(btrim(p_lead->>'experience_level'), ''), nullif(p_lead->>'match_score', '')::smallint,
      nullif(p_lead->>'description', ''), coalesce((p_lead->>'description_truncated')::boolean, false),
      nullif(p_lead->>'description_length', '')::integer,
      coalesce(p_lead->'required_skills', '[]'::jsonb), coalesce(p_lead->'preferred_skills', '[]'::jsonb),
      coalesce(nullif(p_lead->>'payload_version', ''), '1.0')
    )
    on conflict (finding_id) do update set
      company = excluded.company, title = excluded.title, location = excluded.location,
      work_arrangement = excluded.work_arrangement, employment_type = excluded.employment_type,
      -- Identity facts only ever accumulate: a later submission that states less (another provider that
      -- saw only the board id, say) must not erase the URL / id the lead is matched by.
      source_name = coalesce(excluded.source_name, public.ai_job_leads.source_name),
      source_url = coalesce(excluded.source_url, public.ai_job_leads.source_url),
      canonical_url = coalesce(excluded.canonical_url, public.ai_job_leads.canonical_url),
      external_job_id = coalesce(excluded.external_job_id, public.ai_job_leads.external_job_id),
      posted_date = coalesce(excluded.posted_date, public.ai_job_leads.posted_date),
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

-- 5. Explicit EXECUTE boundaries (Supabase default privileges grant EXECUTE to anon/authenticated).
revoke all on function public.rpc_ai_resolve_job_lead_key(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.rpc_ai_upsert_job_lead(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.rpc_ai_resolve_job_lead_key(uuid, uuid, text, text, text) to service_role;
grant execute on function public.rpc_ai_upsert_job_lead(uuid, uuid, jsonb) to service_role;
