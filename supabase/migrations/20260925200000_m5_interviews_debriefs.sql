-- =============================================================================
-- Migration: 20260925200000_m5_interviews_debriefs.sql
-- Milestone 5: Interviews & Debriefs (additive; M1/M1B/M3/M4 migrations untouched).
--
-- Sources: Gate 03 TARGET_SCHEMA #12 (interviews), ADR-022 (no automatic stage
-- change; preparation_notes + questions_expected replace the rejected checklist),
-- Gate 02B FORM_SPEC 6.1/6.2 and INTERACTION_SPEC 4.2/4.3 (schedule / record
-- outcome), legacy JobQuest1.0 `interviews` columns (docs/BACKEND_SCHEMA.md).
--
--  1. public.interviews: TARGET_SCHEMA columns plus the debrief fields the
--     approved I4 form captures and the legacy table already had
--     (questions_asked, next_step, thank_you_status). outcome adds CANCELLED for
--     the approved "Cancelled / moved" result. Composite tenant FK to applications.
--  2. public.interview_contacts: participants that are M4 contacts. Composite FKs
--     to interviews and contacts (same workspace); only the interview owner's own
--     contacts can be linked (no exposure of another USER's private contacts).
--  3. RLS: OWNER SCOPED / MANAGER OVERRIDE. Clients never INSERT or DELETE
--     interviews (scheduling is the atomic RPC; cancel is an outcome, not a
--     delete); simple fields are editable through column-level UPDATE grants.
--  4. rpc_schedule_interview / rpc_record_interview_outcome: atomic. They write
--     the interview, INTERVIEW_SCHEDULED / INTERVIEW_COMPLETED events and
--     last_activity_at; an explicit, optional stage move calls the existing
--     rpc_move_application_stage in the same transaction. Nothing changes the
--     stage automatically.
--  5. Manager audit: the M4 cross-user audit trigger now also covers interviews
--     and interview_contacts.
--  6. profiles.timezone must be a real IANA zone name (display depends on it).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. interviews
-- -----------------------------------------------------------------------------
create table if not exists public.interviews (
  id                 uuid primary key default gen_random_uuid(),
  application_id     uuid not null,
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  user_id            uuid not null references public.user_accounts(user_id) on delete restrict,
  round_number       integer not null default 1,
  interview_type     varchar(32) not null,
  scheduled_at       timestamptz not null,
  duration_minutes   integer not null default 45,
  format             varchar(16) not null default 'VIDEO',
  location_or_link   text null,
  interviewer_names  text null,
  preparation_notes  text null,
  questions_expected text null,
  completed_at       timestamptz null,
  outcome            varchar(16) null,
  feedback_notes     text null,
  questions_asked    text null,
  next_step          varchar(255) null,
  thank_you_status   varchar(16) null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  legacy_id          integer null,
  constraint uq_interviews_id_workspace unique (id, workspace_id),
  constraint fk_interviews_application foreign key (application_id, workspace_id)
    references public.applications(id, workspace_id) on delete cascade,
  -- Approved I3 types (FORM_SPEC 6.1) plus the legacy JobQuest1.0 values
  -- (Behavioral, Coding, Final Interview) so migrated rows keep their meaning.
  constraint chk_interviews_type check (interview_type in (
    'RECRUITER_SCREEN', 'HIRING_MANAGER', 'TECHNICAL', 'CODING', 'BEHAVIORAL',
    'PANEL', 'FINAL', 'OFFER_CALL', 'OTHER'
  )),
  constraint chk_interviews_format check (format in ('VIDEO', 'PHONE', 'ONSITE')),
  constraint chk_interviews_outcome check (outcome is null or outcome in ('PASSED', 'FAILED', 'PENDING', 'CANCELLED')),
  constraint chk_interviews_completion check (
    (outcome is null and completed_at is null)
    or (outcome = 'CANCELLED' and completed_at is null)
    or (outcome in ('PASSED', 'FAILED', 'PENDING') and completed_at is not null)
  ),
  constraint chk_interviews_thank_you check (thank_you_status is null or thank_you_status in ('NOT_NEEDED', 'TO_SEND', 'SENT')),
  constraint chk_interviews_round check (round_number between 1 and 50),
  constraint chk_interviews_duration check (duration_minutes between 5 and 600),
  constraint chk_interviews_text_len check (
    coalesce(char_length(location_or_link), 0) <= 500
    and coalesce(char_length(interviewer_names), 0) <= 1000
    and coalesce(char_length(preparation_notes), 0) <= 5000
    and coalesce(char_length(questions_expected), 0) <= 5000
    and coalesce(char_length(feedback_notes), 0) <= 5000
    and coalesce(char_length(questions_asked), 0) <= 5000
  )
);

-- TARGET_SCHEMA index + list / drawer access paths.
create index if not exists idx_interviews_workspace_schedule on public.interviews(workspace_id, scheduled_at);
create index if not exists idx_interviews_ws_owner_schedule on public.interviews(workspace_id, user_id, scheduled_at);
create index if not exists idx_interviews_application on public.interviews(application_id, scheduled_at);
create index if not exists idx_interviews_open on public.interviews(workspace_id, scheduled_at) where outcome is null;

drop trigger if exists trg_interviews_updated on public.interviews;
create trigger trg_interviews_updated before update on public.interviews
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 2. interview_contacts (participants that are M4 contacts)
-- -----------------------------------------------------------------------------
create table if not exists public.interview_contacts (
  interview_id uuid not null,
  contact_id   uuid not null,
  workspace_id uuid not null,
  created_at   timestamptz not null default now(),
  primary key (interview_id, contact_id),
  constraint fk_interview_contacts_interview foreign key (interview_id, workspace_id)
    references public.interviews(id, workspace_id) on delete cascade,
  constraint fk_interview_contacts_contact foreign key (contact_id, workspace_id)
    references public.contacts(id, workspace_id) on delete cascade
);
create index if not exists idx_interview_contacts_contact on public.interview_contacts(contact_id, workspace_id);

-- -----------------------------------------------------------------------------
-- 3. RLS + least-privilege grants
-- -----------------------------------------------------------------------------
alter table public.interviews enable row level security;
alter table public.interview_contacts enable row level security;

drop policy if exists interviews_select on public.interviews;
create policy interviews_select on public.interviews for select to authenticated
  using (public.can_access_owned_record(workspace_id, user_id));

drop policy if exists interviews_update on public.interviews;
create policy interviews_update on public.interviews for update to authenticated
  using (public.can_access_owned_record(workspace_id, user_id))
  with check (public.can_access_owned_record(workspace_id, user_id));

drop policy if exists interview_contacts_select on public.interview_contacts;
create policy interview_contacts_select on public.interview_contacts for select to authenticated
  using (exists (
    select 1 from public.interviews i
    where i.id = interview_contacts.interview_id and i.workspace_id = interview_contacts.workspace_id
      and public.can_access_owned_record(i.workspace_id, i.user_id)
  ));

-- A participant contact must belong to the interview's owner (same workspace via
-- the composite FKs), so nobody can attach or reveal another USER's contacts.
drop policy if exists interview_contacts_insert on public.interview_contacts;
create policy interview_contacts_insert on public.interview_contacts for insert to authenticated
  with check (exists (
    select 1 from public.interviews i
    join public.contacts c on c.id = interview_contacts.contact_id and c.workspace_id = i.workspace_id
    where i.id = interview_contacts.interview_id and i.workspace_id = interview_contacts.workspace_id
      and c.user_id = i.user_id
      and public.can_access_owned_record(i.workspace_id, i.user_id)
  ));

drop policy if exists interview_contacts_delete on public.interview_contacts;
create policy interview_contacts_delete on public.interview_contacts for delete to authenticated
  using (exists (
    select 1 from public.interviews i
    where i.id = interview_contacts.interview_id and i.workspace_id = interview_contacts.workspace_id
      and public.can_access_owned_record(i.workspace_id, i.user_id)
  ));

revoke all on public.interviews, public.interview_contacts from public, anon, authenticated;
grant select on public.interviews to authenticated;
-- Simple, invariant-safe fields only. Ownership, tenancy, the application link,
-- outcome and completed_at change only through the RPCs below.
grant update (
  round_number, interview_type, scheduled_at, duration_minutes, format,
  location_or_link, interviewer_names, preparation_notes, questions_expected,
  feedback_notes, questions_asked, next_step, thank_you_status
) on public.interviews to authenticated;
grant select, insert, delete on public.interview_contacts to authenticated;
grant all on public.interviews, public.interview_contacts to service_role;

-- -----------------------------------------------------------------------------
-- 4a. rpc_schedule_interview
-- -----------------------------------------------------------------------------
create or replace function public.rpc_schedule_interview(
  p_application_id uuid,
  p_interview_type text,
  p_scheduled_at timestamptz,
  p_duration_minutes integer default 45,
  p_format text default 'VIDEO',
  p_round_number integer default null,
  p_location_or_link text default null,
  p_interviewer_names text default null,
  p_preparation_notes text default null,
  p_questions_expected text default null,
  p_contact_ids uuid[] default '{}',
  p_move_to_stage text default null
)
returns public.interviews
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_app record;
  v_round integer;
  v_interview public.interviews;
  v_contact_id uuid;
begin
  if v_uid is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select id, workspace_id, user_id, stage, status, archived_at
    into v_app from public.applications where id = p_application_id for update;
  if not found then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.can_access_owned_record(v_app.workspace_id, v_app.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if v_app.archived_at is not null or v_app.status <> 'OPEN' then
    raise exception 'APPLICATION_NOT_ACTIVE' using errcode = '22023',
      hint = 'Interviews are scheduled on open, unarchived applications.';
  end if;
  if p_scheduled_at is null then
    raise exception 'SCHEDULED_AT_REQUIRED' using errcode = '22023';
  end if;

  v_round := coalesce(p_round_number,
    (select coalesce(max(i.round_number), 0) + 1 from public.interviews i where i.application_id = p_application_id));

  insert into public.interviews (
    application_id, workspace_id, user_id, round_number, interview_type, scheduled_at,
    duration_minutes, format, location_or_link, interviewer_names, preparation_notes, questions_expected
  ) values (
    p_application_id, v_app.workspace_id, v_app.user_id, v_round, p_interview_type, p_scheduled_at,
    coalesce(p_duration_minutes, 45), coalesce(p_format, 'VIDEO'),
    nullif(trim(coalesce(p_location_or_link, '')), ''),
    nullif(trim(coalesce(p_interviewer_names, '')), ''),
    nullif(trim(coalesce(p_preparation_notes, '')), ''),
    nullif(trim(coalesce(p_questions_expected, '')), '')
  ) returning * into v_interview;

  foreach v_contact_id in array coalesce(p_contact_ids, '{}') loop
    if not exists (
      select 1 from public.contacts c
      where c.id = v_contact_id and c.workspace_id = v_app.workspace_id and c.user_id = v_app.user_id
    ) then
      raise exception 'CONTACT_NOT_LINKABLE' using errcode = '42501',
        hint = 'Participants must be contacts owned by the application owner in the same workspace.';
    end if;
    insert into public.interview_contacts (interview_id, contact_id, workspace_id)
    values (v_interview.id, v_contact_id, v_app.workspace_id)
    on conflict do nothing;
  end loop;

  insert into public.application_events (application_id, workspace_id, actor_id, event_type, payload)
  values (p_application_id, v_app.workspace_id, v_uid, 'INTERVIEW_SCHEDULED', jsonb_build_object(
    'interview_id', v_interview.id,
    'interview_type', v_interview.interview_type,
    'round_number', v_interview.round_number,
    'scheduled_at', v_interview.scheduled_at,
    'duration_minutes', v_interview.duration_minutes,
    'format', v_interview.format
  ));

  update public.applications set last_activity_at = now(), updated_at = now() where id = p_application_id;

  -- Explicit, optional stage move chosen by the user: the existing workflow RPC,
  -- same transaction (a failure rolls the whole schedule back).
  if p_move_to_stage is not null then
    perform public.rpc_move_application_stage(p_application_id, p_move_to_stage, null);
  end if;

  return v_interview;
end; $$;

-- -----------------------------------------------------------------------------
-- 4b. rpc_record_interview_outcome (debrief)
-- -----------------------------------------------------------------------------
create or replace function public.rpc_record_interview_outcome(
  p_interview_id uuid,
  p_outcome text,
  p_feedback_notes text default null,
  p_questions_asked text default null,
  p_next_step text default null,
  p_thank_you_status text default null,
  p_next_action text default null,
  p_next_action_date date default null,
  p_move_to_stage text default null
)
returns public.interviews
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_old public.interviews;
  v_new public.interviews;
  v_notes text := nullif(trim(coalesce(p_feedback_notes, '')), '');
  v_next_action text := nullif(trim(coalesce(p_next_action, '')), '');
begin
  if v_uid is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select * into v_old from public.interviews where id = p_interview_id for update;
  if not found then
    raise exception 'INTERVIEW_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.can_access_owned_record(v_old.workspace_id, v_old.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_outcome is null or p_outcome not in ('PENDING', 'PASSED', 'FAILED', 'CANCELLED') then
    raise exception 'INVALID_OUTCOME' using errcode = '22023';
  end if;
  if p_outcome <> 'CANCELLED' and v_old.scheduled_at > now() then
    raise exception 'INTERVIEW_NOT_YET_HELD' using errcode = '22023',
      hint = 'Record a result after the interview starts; cancel or reschedule instead.';
  end if;
  if length(coalesce(v_next_action, '')) > 255 then
    raise exception 'NEXT_ACTION_TOO_LONG' using errcode = '22023';
  end if;

  update public.interviews set
    outcome = p_outcome,
    completed_at = case when p_outcome = 'CANCELLED' then null else coalesce(v_old.completed_at, now()) end,
    feedback_notes = v_notes,
    questions_asked = nullif(trim(coalesce(p_questions_asked, '')), ''),
    next_step = nullif(trim(coalesce(p_next_step, '')), ''),
    thank_you_status = p_thank_you_status
  where id = p_interview_id
  returning * into v_new;

  -- One timeline event per meaningful result: first completion or a changed
  -- result. Cancellation and unchanged re-saves (text edits) write no event.
  if p_outcome <> 'CANCELLED' and v_old.outcome is distinct from p_outcome then
    insert into public.application_events (application_id, workspace_id, actor_id, event_type, payload)
    values (v_old.application_id, v_old.workspace_id, v_uid, 'INTERVIEW_COMPLETED', jsonb_build_object(
      'interview_id', v_old.id,
      'interview_type', v_old.interview_type,
      'round_number', v_old.round_number,
      'scheduled_at', v_old.scheduled_at,
      'outcome', p_outcome,
      'previous_outcome', v_old.outcome,
      'next_step', v_new.next_step,
      'thank_you_status', v_new.thank_you_status,
      'notes', left(v_notes, 500)
    ));
    update public.applications set last_activity_at = now(), updated_at = now() where id = v_old.application_id;
  end if;

  -- "Replaces the application's next action" (FORM_SPEC 6.2), only when given.
  if v_next_action is not null then
    update public.applications
       set next_action = v_next_action,
           next_action_date = p_next_action_date,
           next_action_completed_at = null,
           updated_at = now()
     where id = v_old.application_id;
  end if;

  -- Explicit, optional stage move: never implied by the result itself.
  if p_move_to_stage is not null then
    perform public.rpc_move_application_stage(v_old.application_id, p_move_to_stage, null);
  end if;

  return v_new;
end; $$;

revoke all on function public.rpc_schedule_interview(uuid, text, timestamptz, integer, text, integer, text, text, text, text, uuid[], text) from public, anon;
revoke all on function public.rpc_record_interview_outcome(uuid, text, text, text, text, text, text, date, text) from public, anon;
grant execute on function public.rpc_schedule_interview(uuid, text, timestamptz, integer, text, integer, text, text, text, text, uuid[], text) to authenticated, service_role;
grant execute on function public.rpc_record_interview_outcome(uuid, text, text, text, text, text, text, date, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. Manager audit: extend the M4 cross-user audit trigger to interviews
-- -----------------------------------------------------------------------------
create or replace function app.audit_cross_user_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_entity text := tg_argv[0];
  v_ws uuid := (v_row->>'workspace_id')::uuid;
  v_owner uuid;
  v_new_owner uuid;
  v_entity_id uuid;
  v_action text;
  v_changed text[];
  v_meta jsonb := '{}';
  v_ua text;
  v_is_link boolean := tg_table_name in ('application_contacts', 'interview_contacts');
begin
  if v_actor is null then
    return null;
  end if;

  if tg_table_name = 'application_contacts' then
    select a.user_id into v_owner from public.applications a where a.id = (v_row->>'application_id')::uuid;
    v_entity_id := (v_row->>'application_id')::uuid;
    v_meta := jsonb_build_object('contact_id', v_row->>'contact_id');
  elsif tg_table_name = 'interview_contacts' then
    select i.user_id into v_owner from public.interviews i where i.id = (v_row->>'interview_id')::uuid;
    v_entity_id := (v_row->>'interview_id')::uuid;
    v_meta := jsonb_build_object('contact_id', v_row->>'contact_id');
  elsif tg_table_name = 'job_snapshots' then
    select a.user_id into v_owner from public.applications a where a.id = (v_row->>'application_id')::uuid;
    v_entity_id := (v_row->>'id')::uuid;
    v_meta := jsonb_build_object('application_id', v_row->>'application_id');
  elsif tg_table_name = 'contact_interactions' then
    select c.user_id into v_owner from public.contacts c where c.id = (v_row->>'contact_id')::uuid;
    v_entity_id := (v_row->>'id')::uuid;
    v_meta := jsonb_build_object('contact_id', v_row->>'contact_id', 'interaction_type', v_row->>'interaction_type');
  else
    v_owner := coalesce((v_old->>'user_id')::uuid, (v_new->>'user_id')::uuid);
    v_new_owner := (v_new->>'user_id')::uuid;
    v_entity_id := (v_row->>'id')::uuid;
    if tg_table_name = 'interviews' then
      v_meta := jsonb_build_object('application_id', v_row->>'application_id');
    end if;
  end if;

  if v_owner is null or not exists (select 1 from public.workspaces w where w.id = v_ws) then
    return null;
  end if;

  if tg_op = 'INSERT' then
    v_action := case when v_is_link then 'LINK_CREATED' else 'RECORD_CREATED' end;
  elsif tg_op = 'DELETE' then
    v_action := case when v_is_link then 'LINK_REMOVED' else 'RECORD_DELETED' end;
  else
    select array_agg(n.key order by n.key) into v_changed
    from jsonb_each(v_new) n
    where n.value is distinct from (v_old->n.key)
      and n.key not in ('updated_at', 'last_activity_at');
    if v_changed is null then
      return null;
    end if;
    v_meta := v_meta || jsonb_build_object('changed_columns', to_jsonb(v_changed));
    if v_new_owner is distinct from v_owner then
      v_action := 'RECORD_REASSIGNED';
      v_meta := v_meta || jsonb_build_object('to_user_id', v_new_owner);
    elsif (v_old->>'archived_at') is null and (v_new->>'archived_at') is not null then
      v_action := 'RECORD_ARCHIVED';
    elsif (v_old->>'archived_at') is not null and (v_new->>'archived_at') is null then
      v_action := 'RECORD_RESTORED';
    else
      v_action := 'RECORD_UPDATED';
    end if;
    if 'stage' = any(v_changed) then
      v_meta := v_meta || jsonb_build_object('from_stage', v_old->>'stage', 'to_stage', v_new->>'stage');
    end if;
    if tg_table_name = 'interviews' and 'outcome' = any(v_changed) then
      v_meta := v_meta || jsonb_build_object('outcome', v_new->>'outcome');
    end if;
  end if;

  if v_owner = v_actor and v_action <> 'RECORD_REASSIGNED' then
    return null;
  end if;

  begin
    v_ua := left(current_setting('request.headers', true)::json->>'user-agent', 256);
  exception when others then
    v_ua := null;
  end;

  insert into public.audit_events (workspace_id, actor_id, target_user_id, target_entity_type, target_entity_id, action, metadata, user_agent)
  values (v_ws, v_actor, v_owner, v_entity, v_entity_id, v_action, v_meta, v_ua);
  return null;
end; $$;
revoke all on function app.audit_cross_user_mutation() from public;

drop trigger if exists trg_audit_interviews on public.interviews;
create trigger trg_audit_interviews after insert or update or delete on public.interviews
  for each row execute function app.audit_cross_user_mutation('INTERVIEW');
drop trigger if exists trg_audit_interview_contacts on public.interview_contacts;
create trigger trg_audit_interview_contacts after insert or delete on public.interview_contacts
  for each row execute function app.audit_cross_user_mutation('INTERVIEW_CONTACT');

-- -----------------------------------------------------------------------------
-- 6. profiles.timezone must be a valid IANA zone (interview times render in it)
-- -----------------------------------------------------------------------------
create or replace function app.validate_profile_timezone()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.timezone is not distinct from old.timezone then
      return new;
    end if;
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'INVALID_TIMEZONE' using errcode = '22023',
      hint = 'Use an IANA time zone name such as America/Chicago.';
  end if;
  return new;
end; $$;
revoke all on function app.validate_profile_timezone() from public;

drop trigger if exists trg_profiles_timezone on public.profiles;
create trigger trg_profiles_timezone before insert or update on public.profiles
  for each row execute function app.validate_profile_timezone();
