-- =============================================================================
-- Migration: 20260924300000_m3_applications.sql
-- Milestone 3: Applications Workflow & Data Grid
--
-- Expands applications table with full metadata, job snapshots, and append-only
-- application events. Adds domain RPCs for atomic lifecycle mutations (stage move,
-- outcome closure, keep active, archive, restore, and 3-tier duplicate detection).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. applications table expansion
-- -----------------------------------------------------------------------------
alter table public.applications
  add column if not exists job_url text null,
  add column if not exists external_job_id varchar(128) null,
  add column if not exists location varchar(128) null,
  add column if not exists work_arrangement varchar(32) null,
  add column if not exists employment_type varchar(32) null,
  add column if not exists salary_min numeric(12, 2) null,
  add column if not exists salary_max numeric(12, 2) null,
  add column if not exists salary_currency varchar(3) not null default 'USD',
  add column if not exists tags text[] not null default '{}',
  add column if not exists closure_notes text null,
  add column if not exists applied_at timestamptz not null default now(),
  add column if not exists next_action_completed_at timestamptz null,
  add column if not exists notes text null,
  add column if not exists duplicate_override_flag boolean not null default false;

-- Additional check constraints
alter table public.applications
  add constraint chk_app_work_arrangement check (work_arrangement is null or work_arrangement in ('Remote', 'Hybrid', 'Onsite')),
  add constraint chk_app_employment_type check (employment_type is null or employment_type in ('Full-time', 'Contract', 'Part-time')),
  add constraint chk_app_salary_nonnegative check (salary_min is null or salary_min >= 0),
  add constraint chk_app_salary_range check (salary_min is null or salary_max is null or salary_max >= salary_min);

-- Supporting indexes
create index if not exists idx_applications_aging
  on public.applications(workspace_id, last_activity_at)
  where archived_at is null and status = 'OPEN';

create index if not exists idx_applications_next_action
  on public.applications(workspace_id, next_action_date)
  where next_action_date is not null and status = 'OPEN';

create index if not exists idx_applications_search
  on public.applications(workspace_id, company_name, role_title);

create index if not exists idx_applications_job_url
  on public.applications(workspace_id, job_url)
  where job_url is not null and archived_at is null;

create index if not exists idx_applications_external_id
  on public.applications(workspace_id, external_job_id)
  where external_job_id is not null and archived_at is null;

-- -----------------------------------------------------------------------------
-- 2. job_snapshots (immutable captured posting)
-- -----------------------------------------------------------------------------
create table if not exists public.job_snapshots (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid not null,
  workspace_id     uuid not null,
  job_description  text null,
  requirements     text null,
  skills           text null,
  raw_payload      jsonb null,
  captured_at      timestamptz not null default now(),
  constraint fk_snapshots_application foreign key (application_id, workspace_id)
    references public.applications(id, workspace_id) on delete cascade,
  constraint uq_job_snapshots_app unique (application_id)
);
create index if not exists idx_job_snapshots_app on public.job_snapshots(application_id);

alter table public.job_snapshots enable row level security;
grant select, insert, update, delete on public.job_snapshots to authenticated;

create policy job_snapshots_select on public.job_snapshots for select to authenticated
  using (exists (
    select 1 from public.applications a
    where a.id = job_snapshots.application_id
      and public.can_access_owned_record(a.workspace_id, a.user_id)
  ));

create policy job_snapshots_insert on public.job_snapshots for insert to authenticated
  with check (exists (
    select 1 from public.applications a
    where a.id = job_snapshots.application_id
      and public.can_access_owned_record(a.workspace_id, a.user_id)
  ));

create policy job_snapshots_update on public.job_snapshots for update to authenticated
  using (exists (
    select 1 from public.applications a
    where a.id = job_snapshots.application_id
      and public.can_access_owned_record(a.workspace_id, a.user_id)
  ))
  with check (exists (
    select 1 from public.applications a
    where a.id = job_snapshots.application_id
      and public.can_access_owned_record(a.workspace_id, a.user_id)
  ));

create policy job_snapshots_delete on public.job_snapshots for delete to authenticated
  using (exists (
    select 1 from public.applications a
    where a.id = job_snapshots.application_id
      and public.can_access_owned_record(a.workspace_id, a.user_id)
  ));

-- -----------------------------------------------------------------------------
-- 3. application_events (append-only lifecycle timeline & funnel analytics)
-- -----------------------------------------------------------------------------
create table if not exists public.application_events (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid not null,
  workspace_id     uuid not null,
  actor_id         uuid not null references public.user_accounts(user_id) on delete restrict,
  event_type       varchar(32) not null,
  payload_version  integer not null default 1,
  payload          jsonb not null default '{}',
  created_at       timestamptz not null default now(),
  constraint fk_events_application foreign key (application_id, workspace_id)
    references public.applications(id, workspace_id) on delete cascade,
  constraint chk_event_type check (event_type in (
    'CREATED', 'CAPTURED', 'APPLIED', 'STAGE_CHANGED', 'OUTCOME_CHANGED',
    'NEXT_ACTION_CHANGED', 'FOLLOW_UP', 'CONTACT_EVENT', 'INTERVIEW_SCHEDULED',
    'INTERVIEW_COMPLETED', 'NOTE', 'ARCHIVED', 'RESTORED', 'KEEP_ACTIVE'
  ))
);
create index if not exists idx_app_events_app_time on public.application_events(application_id, created_at asc);
create index if not exists idx_app_events_analytics on public.application_events(workspace_id, event_type, created_at);

alter table public.application_events enable row level security;
grant select, insert on public.application_events to authenticated;

create policy app_events_select on public.application_events for select to authenticated
  using (exists (
    select 1 from public.applications a
    where a.id = application_events.application_id
      and public.can_access_owned_record(a.workspace_id, a.user_id)
  ));

create policy app_events_insert on public.application_events for insert to authenticated
  with check (
    actor_id = (select auth.uid()) and exists (
      select 1 from public.applications a
      where a.id = application_events.application_id
        and public.can_access_owned_record(a.workspace_id, a.user_id)
    )
  );

-- -----------------------------------------------------------------------------
-- 4. Atomic Domain RPC: rpc_move_application_stage
-- -----------------------------------------------------------------------------
create or replace function public.rpc_move_application_stage(
  p_application_id uuid,
  p_new_stage text,
  p_notes text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_app record;
  v_uid uuid := (select auth.uid());
  v_old_stage text;
begin
  if v_uid is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select id, workspace_id, user_id, stage, status
    into v_app
    from public.applications
   where id = p_application_id
     for update;

  if not found then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.can_access_owned_record(v_app.workspace_id, v_app.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if p_new_stage not in ('SAVED', 'PREPARING', 'APPLIED', 'ASSESSMENT', 'RECRUITER_SCREEN', 'INTERVIEW', 'FINAL_INTERVIEW', 'OFFER') then
    raise exception 'INVALID_STAGE' using errcode = '22023';
  end if;

  v_old_stage := v_app.stage;

  update public.applications
     set stage = p_new_stage,
         last_activity_at = now(),
         updated_at = now()
   where id = p_application_id;

  insert into public.application_events(application_id, workspace_id, actor_id, event_type, payload)
  values (
    p_application_id,
    v_app.workspace_id,
    v_uid,
    'STAGE_CHANGED',
    jsonb_build_object(
      'from_stage', v_old_stage,
      'to_stage', p_new_stage,
      'notes', p_notes
    )
  );

  return jsonb_build_object(
    'id', p_application_id,
    'old_stage', v_old_stage,
    'new_stage', p_new_stage,
    'last_activity_at', now()
  );
end; $$;

revoke all on function public.rpc_move_application_stage(uuid, text, text) from public, anon;
grant execute on function public.rpc_move_application_stage(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Atomic Domain RPC: rpc_set_application_outcome
-- -----------------------------------------------------------------------------
create or replace function public.rpc_set_application_outcome(
  p_application_id uuid,
  p_outcome text,
  p_closure_reason text default null,
  p_closure_notes text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_app record;
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select id, workspace_id, user_id, stage, status, outcome
    into v_app
    from public.applications
   where id = p_application_id
     for update;

  if not found then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.can_access_owned_record(v_app.workspace_id, v_app.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if p_outcome not in ('ACCEPTED', 'REJECTED', 'WITHDRAWN', 'GHOSTED', 'POSITION_CLOSED') then
    raise exception 'INVALID_OUTCOME' using errcode = '22023';
  end if;

  if p_outcome = 'WITHDRAWN' and p_closure_reason is not null and p_closure_reason not in (
    'OFFER_DECLINED', 'GENERAL_WITHDRAWAL', 'COMPENSATION_MISMATCH', 'LOCATION_UNSUITABLE', 'OTHER'
  ) then
    raise exception 'INVALID_CLOSURE_REASON' using errcode = '22023';
  end if;

  update public.applications
     set status = 'CLOSED',
         outcome = p_outcome,
         closure_reason = p_closure_reason,
         closure_notes = p_closure_notes,
         closed_at = now(),
         last_activity_at = now(),
         updated_at = now()
   where id = p_application_id;

  insert into public.application_events(application_id, workspace_id, actor_id, event_type, payload)
  values (
    p_application_id,
    v_app.workspace_id,
    v_uid,
    'OUTCOME_CHANGED',
    jsonb_build_object(
      'outcome', p_outcome,
      'closure_reason', p_closure_reason,
      'closure_notes', p_closure_notes,
      'closed_at', now()
    )
  );

  return jsonb_build_object(
    'id', p_application_id,
    'status', 'CLOSED',
    'outcome', p_outcome,
    'closure_reason', p_closure_reason,
    'closed_at', now()
  );
end; $$;

revoke all on function public.rpc_set_application_outcome(uuid, text, text, text) from public, anon;
grant execute on function public.rpc_set_application_outcome(uuid, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Atomic Domain RPC: rpc_keep_application_active
-- -----------------------------------------------------------------------------
create or replace function public.rpc_keep_application_active(
  p_application_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_app record;
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select id, workspace_id, user_id
    into v_app
    from public.applications
   where id = p_application_id
     for update;

  if not found then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.can_access_owned_record(v_app.workspace_id, v_app.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  update public.applications
     set last_activity_at = now(),
         updated_at = now()
   where id = p_application_id;

  insert into public.application_events(application_id, workspace_id, actor_id, event_type, payload)
  values (
    p_application_id,
    v_app.workspace_id,
    v_uid,
    'KEEP_ACTIVE',
    jsonb_build_object('kept_active_at', now())
  );

  return jsonb_build_object(
    'id', p_application_id,
    'last_activity_at', now()
  );
end; $$;

revoke all on function public.rpc_keep_application_active(uuid) from public, anon;
grant execute on function public.rpc_keep_application_active(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Atomic Domain RPC: rpc_archive_application
-- -----------------------------------------------------------------------------
create or replace function public.rpc_archive_application(
  p_application_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_app record;
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select id, workspace_id, user_id
    into v_app
    from public.applications
   where id = p_application_id
     for update;

  if not found then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.can_access_owned_record(v_app.workspace_id, v_app.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  update public.applications
     set archived_at = now(),
         updated_at = now()
   where id = p_application_id;

  insert into public.application_events(application_id, workspace_id, actor_id, event_type, payload)
  values (
    p_application_id,
    v_app.workspace_id,
    v_uid,
    'ARCHIVED',
    jsonb_build_object('archived_at', now())
  );

  return jsonb_build_object(
    'id', p_application_id,
    'archived_at', now()
  );
end; $$;

revoke all on function public.rpc_archive_application(uuid) from public, anon;
grant execute on function public.rpc_archive_application(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Atomic Domain RPC: rpc_restore_application
-- -----------------------------------------------------------------------------
create or replace function public.rpc_restore_application(
  p_application_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_app record;
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select id, workspace_id, user_id
    into v_app
    from public.applications
   where id = p_application_id
     for update;

  if not found then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.can_access_owned_record(v_app.workspace_id, v_app.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  update public.applications
     set archived_at = null,
         last_activity_at = now(),
         updated_at = now()
   where id = p_application_id;

  insert into public.application_events(application_id, workspace_id, actor_id, event_type, payload)
  values (
    p_application_id,
    v_app.workspace_id,
    v_uid,
    'RESTORED',
    jsonb_build_object('restored_at', now())
  );

  return jsonb_build_object(
    'id', p_application_id,
    'archived_at', null,
    'last_activity_at', now()
  );
end; $$;

revoke all on function public.rpc_restore_application(uuid) from public, anon;
grant execute on function public.rpc_restore_application(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Atomic Domain RPC: rpc_check_application_duplicate
-- -----------------------------------------------------------------------------
create or replace function public.rpc_check_application_duplicate(
  p_workspace_id uuid,
  p_company_name text,
  p_role_title text,
  p_job_url text default null,
  p_external_job_id text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_matches jsonb := '[]'::jsonb;
begin
  if v_uid is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  -- Tier 1: Strong Duplicate (exact match on job_url or external_job_id in non-archived apps)
  if (p_job_url is not null and length(trim(p_job_url)) > 0)
     or (p_external_job_id is not null and length(trim(p_external_job_id)) > 0) then
    select jsonb_agg(jsonb_build_object(
      'id', a.id,
      'company_name', a.company_name,
      'role_title', a.role_title,
      'stage', a.stage,
      'status', a.status,
      'outcome', a.outcome,
      'applied_at', a.applied_at,
      'job_url', a.job_url,
      'external_job_id', a.external_job_id
    ))
    into v_matches
    from public.applications a
   where a.workspace_id = p_workspace_id
     and a.archived_at is null
     and public.can_access_owned_record(a.workspace_id, a.user_id)
     and (
       (p_job_url is not null and length(trim(p_job_url)) > 0 and lower(trim(a.job_url)) = lower(trim(p_job_url)))
       or (p_external_job_id is not null and length(trim(p_external_job_id)) > 0 and a.external_job_id = trim(p_external_job_id))
     );

    if v_matches is not null and jsonb_array_length(v_matches) > 0 then
      return jsonb_build_object('tier', 'STRONG', 'matches', v_matches);
    end if;
  end if;

  -- Tier 2: Probable Duplicate (case-insensitive company_name AND role_title match)
  select jsonb_agg(jsonb_build_object(
    'id', a.id,
    'company_name', a.company_name,
    'role_title', a.role_title,
    'stage', a.stage,
    'status', a.status,
    'outcome', a.outcome,
    'applied_at', a.applied_at
  ))
  into v_matches
  from public.applications a
 where a.workspace_id = p_workspace_id
   and a.archived_at is null
   and public.can_access_owned_record(a.workspace_id, a.user_id)
   and lower(trim(a.company_name)) = lower(trim(p_company_name))
   and lower(trim(a.role_title)) = lower(trim(p_role_title));

  if v_matches is not null and jsonb_array_length(v_matches) > 0 then
    return jsonb_build_object('tier', 'PROBABLE', 'matches', v_matches);
  end if;

  -- Tier 3: Possible Duplicate (case-insensitive company_name match with different role)
  select jsonb_agg(jsonb_build_object(
    'id', a.id,
    'company_name', a.company_name,
    'role_title', a.role_title,
    'stage', a.stage,
    'status', a.status,
    'outcome', a.outcome,
    'applied_at', a.applied_at
  ))
  into v_matches
  from public.applications a
 where a.workspace_id = p_workspace_id
   and a.archived_at is null
   and public.can_access_owned_record(a.workspace_id, a.user_id)
   and lower(trim(a.company_name)) = lower(trim(p_company_name));

  if v_matches is not null and jsonb_array_length(v_matches) > 0 then
    return jsonb_build_object('tier', 'POSSIBLE', 'matches', v_matches);
  end if;

  return jsonb_build_object('tier', 'NONE', 'matches', '[]'::jsonb);
end; $$;

revoke all on function public.rpc_check_application_duplicate(uuid, text, text, text, text) from public, anon;
grant execute on function public.rpc_check_application_duplicate(uuid, text, text, text, text) to authenticated;
