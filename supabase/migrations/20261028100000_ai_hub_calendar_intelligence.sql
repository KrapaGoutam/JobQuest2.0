-- =============================================================================
-- AI-7: Calendar intelligence (additive; no core table changes)
--
-- A calendar item is an `ai_findings` row (kind calendar_event, workflow calendar_review):
-- the system-of-record AI observation (provider, run, status, confidence, provenance,
-- dedupe identity, audit). Calendar items need real chronological queries (upcoming,
-- today, range, deadline, category, reschedule/cancellation), so they get a 1:1 CHILD:
--
--   ai_calendar_events  (1:1 with an ai_findings row of kind calendar_event)
--
-- It is intelligence storage only: JobQuest never writes to an external calendar. No raw
-- provider event, attendee list or invite body is stored (the validator drops them); only
-- normalized, job-search-relevant fields.
--
-- Access boundary (mirrors the parent finding exactly, same model as ai_job_leads):
--   * authenticated: SELECT only, same predicate as ai_findings
--     (public.can_access_owned_record(workspace_id, user_id)). The composite FK
--     (finding_id, workspace_id, user_id) guarantees the child's owner can never differ
--     from the parent's, so a child row cannot expose a finding that RLS hides.
--   * No client INSERT/UPDATE/DELETE. The only writer is rpc_ai_upsert_calendar_event
--     (service_role), called by the ingestion service AFTER the parent finding was
--     ingested. It writes NO audit event: the parent ingestion already audited the
--     authoritative mutation once.
--   * Review/dismiss/delete keep using the AI-1B finding RPCs; the child cascades.
--
-- Reschedule / cancellation model (the server, not the provider, owns the history):
--   * One logical event = one finding. A reschedule or cancellation of the same provider
--     event (same calendar source + event id, or a stated previous event) UPDATES that
--     finding's child row instead of creating a second active event.
--   * When the stored start moves, original_start_at keeps the FIRST known start and
--     reschedule_count increments; status becomes `rescheduled` unless the item is
--     tentative or cancelled. Cancellation sets status `cancelled`, cancelled_at, and keeps
--     the original time. Nothing is deleted.
-- =============================================================================

-- 1. ai_calendar_events
create table public.ai_calendar_events (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null,
  workspace_id uuid not null,
  user_id uuid not null,
  category varchar(24) not null,
  -- Derived from the category by the validator: the item is a due time, not a meeting.
  is_deadline boolean not null default false,
  status varchar(12) not null default 'scheduled',
  all_day boolean not null default false,
  -- Timed events: absolute UTC instants. All-day items carry calendar DATES instead (end inclusive).
  start_at timestamptz null,
  end_at timestamptz null,
  start_date date null,
  end_date date null,
  deadline_at timestamptz null,
  -- Chronological anchor for ordering/range queries: the deadline, else the start, else local
  -- midnight of start_date in the item's own zone (UTC when the source stated none).
  sort_at timestamptz not null,
  -- SOURCE IANA zone, kept so the item can be explained in its own zone. Display zone = the
  -- owner's profile zone, applied at read time.
  time_zone varchar(64) null,
  calendar_source varchar(64) null,
  source_event_id varchar(255) null,
  previous_source_event_id varchar(255) null,
  source_event_url varchar(2048) null,
  company varchar(200) null,
  job_title varchar(300) null,
  location varchar(300) null,
  meeting_url varchar(2048) null,
  organizer_name varchar(200) null,
  organizer_domain varchar(255) null,
  original_start_at timestamptz null,
  reschedule_count smallint not null default 0,
  cancelled_at timestamptz null,
  -- company + category + title + start minute (cross-provider convergence; see rpc_ai_resolve_calendar_key).
  logical_key varchar(64) null,
  payload_version varchar(8) not null default '1.0',
  -- When JobQuest FIRST stored the item (the parent's created_at at insert time).
  discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_ai_calendar_events_finding unique (finding_id),
  constraint fk_ai_calendar_events_finding foreign key (finding_id, workspace_id, user_id)
    references public.ai_findings (id, workspace_id, user_id) on delete cascade,
  constraint chk_ai_calendar_events_category check (category in (
    'interview', 'recruiter_call', 'hiring_manager_call', 'networking_call',
    'assessment_deadline', 'application_deadline', 'take_home_deadline', 'follow_up', 'other'
  )),
  constraint chk_ai_calendar_events_status check (status in ('scheduled', 'tentative', 'rescheduled', 'cancelled')),
  -- All-day items are dates (no instants); timed items are instants (no dates) and have a start or a deadline.
  constraint chk_ai_calendar_events_shape check (
    (all_day and start_date is not null and end_date is not null and end_date >= start_date
      and start_at is null and end_at is null and deadline_at is null)
    or (not all_day and start_date is null and end_date is null and (start_at is not null or deadline_at is not null))
  ),
  constraint chk_ai_calendar_events_range check (end_at is null or start_at is null or end_at >= start_at),
  constraint chk_ai_calendar_events_deadline check (is_deadline or deadline_at is null),
  -- cancelled_at is present exactly when the item is cancelled.
  constraint chk_ai_calendar_events_cancelled check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint chk_ai_calendar_events_reschedules check (reschedule_count >= 0),
  constraint chk_ai_calendar_events_urls check (
    (meeting_url is null or meeting_url ~* '^https://') and (source_event_url is null or source_event_url ~* '^https://')
  ),
  constraint chk_ai_calendar_events_payload_version check (payload_version ~ '^[0-9]+\.[0-9]+$')
);

-- Query needs only (no speculative indexes): chronological listing/range scans per workspace, and the two
-- cross-run identity lookups used by rpc_ai_resolve_calendar_key. Category and status are low-cardinality
-- filters evaluated on the (small) per-workspace range, so they are not indexed.
create index idx_ai_calendar_events_ws_sort on public.ai_calendar_events (workspace_id, sort_at, id);
create index idx_ai_calendar_events_owner_source on public.ai_calendar_events (workspace_id, user_id, calendar_source, source_event_id)
  where source_event_id is not null;
create index idx_ai_calendar_events_owner_logical on public.ai_calendar_events (workspace_id, user_id, logical_key)
  where logical_key is not null;

create trigger trg_ai_calendar_events_updated before update on public.ai_calendar_events
  for each row execute function app.touch_updated_at();

alter table public.ai_calendar_events enable row level security;
revoke all on public.ai_calendar_events from public, anon, authenticated;
grant select on public.ai_calendar_events to authenticated;
grant select, insert, update, delete on public.ai_calendar_events to service_role;

create policy ai_calendar_events_select on public.ai_calendar_events
  for select to authenticated
  using (public.can_access_owned_record(workspace_id, user_id));

-- 2. Cross-run identity resolution (read-only helper).
--    The finding dedupe key hierarchy is calendar source + event id > company/category/title/start-minute.
--    A later submission can compute a DIFFERENT key for the same logical event (another provider that sees
--    the same interview under its own id; a reschedule that arrives with a new event id or with no id).
--    Before ingesting a calendar_event, the service asks for an existing item (this owner, this workspace) that
--    is the same event and reuses that finding's key, so it is updated, not duplicated.
--      1. same calendar source + (current or previous) event id        -> same event
--      2. same logical key (current or previous start), company known  -> same event, but never across two
--         DIFFERENT events of the same calendar source (distinct ids stay distinct), and never when both sides
--         state organizer domains that differ.
--    Two interviews that merely share a title never match: the start minute is part of the logical key.
create or replace function public.rpc_ai_resolve_calendar_key(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_calendar_source text,
  p_source_event_ids text[],
  p_logical_keys text[],
  p_organizer_domain text,
  p_company text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_ids text[] := coalesce(p_source_event_ids, '{}'::text[]);
  v_logical text[] := coalesce(p_logical_keys, '{}'::text[]);
begin
  perform app.ai_assert_actor(p_actor_id, p_workspace_id);
  select f.dedupe_key into v_key
  from public.ai_calendar_events e
  join public.ai_findings f on f.id = e.finding_id
  where e.workspace_id = p_workspace_id and e.user_id = p_actor_id
    and (
      (p_calendar_source is not null and cardinality(v_ids) > 0 and e.calendar_source = p_calendar_source
        and (e.source_event_id = any(v_ids) or e.previous_source_event_id = any(v_ids)))
      or (
        p_company is not null and cardinality(v_logical) > 0 and e.logical_key = any(v_logical)
        and (cardinality(v_ids) = 0 or e.source_event_id is null or e.calendar_source is distinct from p_calendar_source)
        and (p_organizer_domain is null or e.organizer_domain is null or e.organizer_domain = p_organizer_domain)
      )
    )
  order by (p_calendar_source is not null and e.calendar_source = p_calendar_source
            and (e.source_event_id = any(v_ids) or e.previous_source_event_id = any(v_ids))) desc,
           e.created_at asc
  limit 1;
  return jsonb_build_object('dedupe_key', v_key);
end;
$$;

-- 3. Child projection (service_role only). Idempotent upsert keyed by finding_id.
--    Called after rpc_ai_ingest_finding returned created / duplicate / updated / unchanged_closed. Unlike a
--    job lead, a REVIEWED (or ACCEPTED) calendar item still receives schedule changes: a cancellation or a new
--    time must never stay hidden behind an earlier review. A DISMISSED / EXPIRED / SUPERSEDED item is never
--    rewritten or resurrected (mirrors the parent's "unchanged_closed" rule for those states).
create or replace function public.rpc_ai_upsert_calendar_event(
  p_actor_id uuid,
  p_finding_id uuid,
  p_event jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_f public.ai_findings%rowtype;
  v_old public.ai_calendar_events%rowtype;
  v_sort timestamptz;
  v_in_status text;
  v_provided_orig timestamptz;
  v_provided_cancelled timestamptz;
  v_orig timestamptz;
  v_count smallint;
  v_status text;
  v_cancelled timestamptz;
  v_prev_id text;
  v_src_id text;
  v_id uuid;
  v_found boolean;
begin
  select * into v_f from public.ai_findings f
  where f.id = p_finding_id and f.user_id = p_actor_id and f.kind = 'calendar_event'
  for update;
  if not found then
    raise exception 'AI_FINDING_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform app.ai_assert_actor(p_actor_id, v_f.workspace_id);
  if p_event is null or jsonb_typeof(p_event) <> 'object'
     or nullif(btrim(p_event->>'category'), '') is null or nullif(p_event->>'sort_at', '') is null then
    raise exception 'AI_FINDING_INVALID_CALENDAR_EVENT' using errcode = '22023';
  end if;
  if v_f.status not in ('NEW', 'REVIEWED', 'ACCEPTED') then
    return jsonb_build_object('calendar_event_id', (select e.id from public.ai_calendar_events e where e.finding_id = v_f.id), 'outcome', 'skipped_closed');
  end if;

  begin
    v_sort := (p_event->>'sort_at')::timestamptz;
    v_in_status := coalesce(nullif(p_event->>'status', ''), 'scheduled');
    v_provided_orig := nullif(p_event->>'original_start_at', '')::timestamptz;
    v_provided_cancelled := nullif(p_event->>'cancelled_at', '')::timestamptz;
    v_src_id := nullif(btrim(p_event->>'source_event_id'), '');

    select * into v_old from public.ai_calendar_events e where e.finding_id = v_f.id for update;
    v_found := found;

    -- History owned by the server: the first known start survives every later move.
    if v_found then
      if v_old.sort_at <> v_sort then
        v_orig := coalesce(v_old.original_start_at, v_old.sort_at);
        v_count := least(v_old.reschedule_count + 1, 1000);
      else
        v_orig := coalesce(v_old.original_start_at, v_provided_orig);
        v_count := v_old.reschedule_count;
      end if;
    else
      v_orig := v_provided_orig;
      v_count := case when v_provided_orig is not null and v_provided_orig <> v_sort then 1 else 0 end;
    end if;

    if v_in_status = 'cancelled' then
      v_status := 'cancelled';
    elsif v_in_status = 'tentative' then
      v_status := 'tentative';
    elsif v_orig is not null and v_orig <> v_sort then
      v_status := 'rescheduled';
    else
      v_status := v_in_status; -- scheduled, or a provider-stated reschedule we cannot yet contrast with a stored time
    end if;
    v_cancelled := case when v_status = 'cancelled'
                        then coalesce(v_provided_cancelled, case when v_found then v_old.cancelled_at end, now())
                        else null end;
    -- A reschedule that arrives under a NEW event id keeps the id it replaced, so either id resolves to this item.
    v_prev_id := coalesce(
      nullif(btrim(p_event->>'previous_source_event_id'), ''),
      case when v_found and v_old.source_event_id is not null and v_src_id is not null and v_old.source_event_id <> v_src_id then v_old.source_event_id end,
      case when v_found then v_old.previous_source_event_id end
    );

    if v_found then
      update public.ai_calendar_events e set
        category = p_event->>'category',
        is_deadline = coalesce((p_event->>'is_deadline')::boolean, false),
        status = v_status,
        all_day = coalesce((p_event->>'all_day')::boolean, false),
        start_at = nullif(p_event->>'start_at', '')::timestamptz,
        end_at = nullif(p_event->>'end_at', '')::timestamptz,
        start_date = nullif(p_event->>'start_date', '')::date,
        end_date = nullif(p_event->>'end_date', '')::date,
        deadline_at = nullif(p_event->>'deadline_at', '')::timestamptz,
        sort_at = v_sort,
        time_zone = nullif(btrim(p_event->>'time_zone'), ''),
        calendar_source = coalesce(nullif(btrim(p_event->>'calendar_source'), ''), e.calendar_source),
        source_event_id = coalesce(v_src_id, e.source_event_id),
        previous_source_event_id = v_prev_id,
        source_event_url = coalesce(nullif(p_event->>'source_event_url', ''), e.source_event_url),
        company = nullif(btrim(p_event->>'company'), ''),
        job_title = nullif(btrim(p_event->>'job_title'), ''),
        location = nullif(btrim(p_event->>'location'), ''),
        meeting_url = nullif(p_event->>'meeting_url', ''),
        organizer_name = coalesce(nullif(btrim(p_event->>'organizer_name'), ''), e.organizer_name),
        organizer_domain = coalesce(nullif(btrim(p_event->>'organizer_domain'), ''), e.organizer_domain),
        original_start_at = v_orig,
        reschedule_count = v_count,
        cancelled_at = v_cancelled,
        logical_key = nullif(p_event->>'logical_key', ''),
        payload_version = coalesce(nullif(p_event->>'payload_version', ''), '1.0')
        -- discovered_at is intentionally not updated: it records when JobQuest FIRST stored the item.
      where e.id = v_old.id
      returning e.id into v_id;
    else
      insert into public.ai_calendar_events (
        finding_id, workspace_id, user_id, category, is_deadline, status, all_day, start_at, end_at, start_date, end_date,
        deadline_at, sort_at, time_zone, calendar_source, source_event_id, previous_source_event_id, source_event_url,
        company, job_title, location, meeting_url, organizer_name, organizer_domain, original_start_at, reschedule_count,
        cancelled_at, logical_key, payload_version
      ) values (
        v_f.id, v_f.workspace_id, v_f.user_id, p_event->>'category', coalesce((p_event->>'is_deadline')::boolean, false),
        v_status, coalesce((p_event->>'all_day')::boolean, false),
        nullif(p_event->>'start_at', '')::timestamptz, nullif(p_event->>'end_at', '')::timestamptz,
        nullif(p_event->>'start_date', '')::date, nullif(p_event->>'end_date', '')::date,
        nullif(p_event->>'deadline_at', '')::timestamptz, v_sort, nullif(btrim(p_event->>'time_zone'), ''),
        nullif(btrim(p_event->>'calendar_source'), ''), v_src_id, v_prev_id, nullif(p_event->>'source_event_url', ''),
        nullif(btrim(p_event->>'company'), ''), nullif(btrim(p_event->>'job_title'), ''), nullif(btrim(p_event->>'location'), ''),
        nullif(p_event->>'meeting_url', ''), nullif(btrim(p_event->>'organizer_name'), ''), nullif(btrim(p_event->>'organizer_domain'), ''),
        v_orig, v_count, v_cancelled, nullif(p_event->>'logical_key', ''), coalesce(nullif(p_event->>'payload_version', ''), '1.0')
      )
      returning id into v_id;
    end if;
  exception
    when sqlstate '22P02' or sqlstate '22003' or sqlstate '22007' or sqlstate '22008' or sqlstate '22001' or sqlstate '23514' then
      raise exception 'AI_FINDING_INVALID_CALENDAR_EVENT' using errcode = '22023';
  end;

  return jsonb_build_object('calendar_event_id', v_id, 'outcome', case when v_found then 'updated' else 'created' end, 'status', v_status);
end;
$$;

-- 4. Explicit EXECUTE boundaries (Supabase default privileges grant EXECUTE to anon/authenticated).
revoke all on function public.rpc_ai_resolve_calendar_key(uuid, uuid, text, text[], text[], text, text) from public, anon, authenticated;
revoke all on function public.rpc_ai_upsert_calendar_event(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.rpc_ai_resolve_calendar_key(uuid, uuid, text, text[], text[], text, text) to service_role;
grant execute on function public.rpc_ai_upsert_calendar_event(uuid, uuid, jsonb) to service_role;
