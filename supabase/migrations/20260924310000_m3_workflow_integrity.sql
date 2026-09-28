-- =============================================================================
-- Migration: 20260924310000_m3_workflow_integrity.sql
-- Milestone 3: enforce the approved workflow boundary inside the database.
--
-- Gate 03 (RPC_DOMAIN_OPERATIONS.md §1): direct Data API writes are for simple,
-- low-risk updates; state transitions, event appending and audit logging run
-- in SECURITY DEFINER RPCs within one transaction. 20260924300000 created the
-- RPCs but still allowed clients to bypass them. This migration closes that:
--
--  1. Lifecycle columns (stage, status, outcome, closure_*, closed_at,
--     archived_at) change only through the domain RPCs. Direct inserts must
--     start OPEN, unarchived and without an outcome.
--  2. application_events is append-only history written only by database code
--     (RPCs and triggers); clients cannot insert, update or delete events.
--  3. job_snapshots is immutable once captured (ADR-013): no UPDATE/DELETE.
--  4. CREATED and CAPTURED events are written by triggers, not by the client.
--  5. Outcome RPC validates closure reasons explicitly; archive/restore reject
--     no-op transitions; Keep Active records the Gate 02B review note.
--  6. rpc_list_workspace_members: the member roster for owner filters and
--     timeline actor names (user_accounts itself stays unreachable).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Lifecycle guard: direct client writes cannot change workflow state
-- -----------------------------------------------------------------------------
create or replace function app.guard_application_lifecycle()
returns trigger language plpgsql as $$
begin
  -- Inside the SECURITY DEFINER RPCs current_user is the function owner, and
  -- privileged server code runs as service_role. Only direct Data API calls
  -- run as anon/authenticated.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'OPEN' or new.outcome is not null or new.closure_reason is not null
       or new.closure_notes is not null or new.closed_at is not null or new.archived_at is not null then
      raise exception 'LIFECYCLE_CHANGE_REQUIRES_RPC'
        using errcode = '42501',
              hint = 'New applications start OPEN and unarchived; use rpc_set_application_outcome / rpc_archive_application.';
    end if;
    return new;
  end if;

  if new.stage is distinct from old.stage
     or new.status is distinct from old.status
     or new.outcome is distinct from old.outcome
     or new.closure_reason is distinct from old.closure_reason
     or new.closure_notes is distinct from old.closure_notes
     or new.closed_at is distinct from old.closed_at
     or new.archived_at is distinct from old.archived_at then
    raise exception 'LIFECYCLE_CHANGE_REQUIRES_RPC'
      using errcode = '42501',
            hint = 'Use rpc_move_application_stage, rpc_set_application_outcome, rpc_archive_application or rpc_restore_application.';
  end if;
  return new;
end; $$;

drop trigger if exists trg_application_lifecycle on public.applications;
create trigger trg_application_lifecycle
  before insert or update on public.applications
  for each row execute function app.guard_application_lifecycle();

-- -----------------------------------------------------------------------------
-- 2. application_events: append-only, written only by database code
-- -----------------------------------------------------------------------------
drop policy if exists app_events_insert on public.application_events;
revoke insert, update, delete on public.application_events from authenticated, anon;

-- -----------------------------------------------------------------------------
-- 3. job_snapshots: immutable once captured (ADR-013)
-- -----------------------------------------------------------------------------
drop policy if exists job_snapshots_update on public.job_snapshots;
drop policy if exists job_snapshots_delete on public.job_snapshots;
revoke update, delete on public.job_snapshots from authenticated, anon;

-- -----------------------------------------------------------------------------
-- 4. Trigger-written history: CREATED and CAPTURED
-- -----------------------------------------------------------------------------
create or replace function app.log_application_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.application_events(application_id, workspace_id, actor_id, event_type, payload)
  values (
    new.id, new.workspace_id, coalesce((select auth.uid()), new.user_id), 'CREATED',
    jsonb_build_object('stage', new.stage, 'status', new.status,
                       'company_name', new.company_name, 'role_title', new.role_title)
  );
  return new;
end; $$;

drop trigger if exists trg_application_created on public.applications;
create trigger trg_application_created
  after insert on public.applications
  for each row execute function app.log_application_created();

create or replace function app.log_snapshot_captured()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  select a.user_id into v_owner from public.applications a where a.id = new.application_id;
  insert into public.application_events(application_id, workspace_id, actor_id, event_type, payload)
  values (
    new.application_id, new.workspace_id, coalesce((select auth.uid()), v_owner), 'CAPTURED',
    jsonb_build_object('snapshot_id', new.id,
                       'has_description', new.job_description is not null,
                       'has_requirements', new.requirements is not null,
                       'has_skills', new.skills is not null)
  );
  return new;
end; $$;

drop trigger if exists trg_snapshot_captured on public.job_snapshots;
create trigger trg_snapshot_captured
  after insert on public.job_snapshots
  for each row execute function app.log_snapshot_captured();

revoke all on function app.log_application_created() from public;
revoke all on function app.log_snapshot_captured() from public;

-- -----------------------------------------------------------------------------
-- 5a. rpc_set_application_outcome: explicit closure-reason rules
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

  if p_outcome is null or p_outcome not in ('ACCEPTED', 'REJECTED', 'WITHDRAWN', 'GHOSTED', 'POSITION_CLOSED') then
    raise exception 'INVALID_OUTCOME' using errcode = '22023';
  end if;

  if p_outcome = 'WITHDRAWN' then
    if p_closure_reason is null then
      raise exception 'CLOSURE_REASON_REQUIRED' using errcode = '22023';
    end if;
    if p_closure_reason not in ('OFFER_DECLINED', 'GENERAL_WITHDRAWAL', 'COMPENSATION_MISMATCH', 'LOCATION_UNSUITABLE', 'OTHER') then
      raise exception 'INVALID_CLOSURE_REASON' using errcode = '22023';
    end if;
  elsif p_closure_reason is not null then
    raise exception 'CLOSURE_REASON_ONLY_FOR_WITHDRAWN' using errcode = '22023';
  end if;

  update public.applications
     set status = 'CLOSED',
         outcome = p_outcome,
         closure_reason = p_closure_reason,
         closure_notes = nullif(trim(coalesce(p_closure_notes, '')), ''),
         closed_at = now(),
         last_activity_at = now(),
         updated_at = now()
   where id = p_application_id;

  insert into public.application_events(application_id, workspace_id, actor_id, event_type, payload)
  values (
    p_application_id, v_app.workspace_id, v_uid, 'OUTCOME_CHANGED',
    jsonb_build_object(
      'previous_status', v_app.status,
      'previous_outcome', v_app.outcome,
      'outcome', p_outcome,
      'closure_reason', p_closure_reason,
      'closure_notes', nullif(trim(coalesce(p_closure_notes, '')), ''),
      'stage_at_close', v_app.stage
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

-- -----------------------------------------------------------------------------
-- 5b. rpc_keep_application_active: records the Gate 02B review note
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

  select id, workspace_id, user_id, last_activity_at
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
    p_application_id, v_app.workspace_id, v_uid, 'KEEP_ACTIVE',
    jsonb_build_object('note', 'Reviewed application', 'previous_last_activity_at', v_app.last_activity_at)
  );

  return jsonb_build_object('id', p_application_id, 'last_activity_at', now());
end; $$;

-- -----------------------------------------------------------------------------
-- 5c. rpc_archive_application / rpc_restore_application: reject no-ops
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

  select id, workspace_id, user_id, archived_at
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

  if v_app.archived_at is not null then
    raise exception 'ALREADY_ARCHIVED' using errcode = '22023';
  end if;

  update public.applications
     set archived_at = now(),
         updated_at = now()
   where id = p_application_id;

  insert into public.application_events(application_id, workspace_id, actor_id, event_type, payload)
  values (p_application_id, v_app.workspace_id, v_uid, 'ARCHIVED', jsonb_build_object('archived_at', now()));

  return jsonb_build_object('id', p_application_id, 'archived_at', now());
end; $$;

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

  select id, workspace_id, user_id, archived_at
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

  if v_app.archived_at is null then
    raise exception 'NOT_ARCHIVED' using errcode = '22023';
  end if;

  update public.applications
     set archived_at = null,
         last_activity_at = now(),
         updated_at = now()
   where id = p_application_id;

  insert into public.application_events(application_id, workspace_id, actor_id, event_type, payload)
  values (p_application_id, v_app.workspace_id, v_uid, 'RESTORED',
          jsonb_build_object('previously_archived_at', v_app.archived_at));

  return jsonb_build_object('id', p_application_id, 'archived_at', null, 'last_activity_at', now());
end; $$;

-- -----------------------------------------------------------------------------
-- 5d. rpc_move_application_stage: reject no-op moves (no empty history rows)
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

  if p_new_stage is null or p_new_stage not in ('SAVED', 'PREPARING', 'APPLIED', 'ASSESSMENT', 'RECRUITER_SCREEN', 'INTERVIEW', 'FINAL_INTERVIEW', 'OFFER') then
    raise exception 'INVALID_STAGE' using errcode = '22023';
  end if;

  if p_new_stage = v_app.stage then
    raise exception 'STAGE_UNCHANGED' using errcode = '22023';
  end if;

  -- Stage is independent of state: moving a stage never opens or closes the record.
  update public.applications
     set stage = p_new_stage,
         last_activity_at = now(),
         updated_at = now()
   where id = p_application_id;

  insert into public.application_events(application_id, workspace_id, actor_id, event_type, payload)
  values (
    p_application_id, v_app.workspace_id, v_uid, 'STAGE_CHANGED',
    jsonb_build_object('from_stage', v_app.stage, 'to_stage', p_new_stage,
                       'notes', nullif(trim(coalesce(p_notes, '')), ''), 'status', v_app.status)
  );

  return jsonb_build_object(
    'id', p_application_id,
    'old_stage', v_app.stage,
    'new_stage', p_new_stage,
    'last_activity_at', now()
  );
end; $$;

-- -----------------------------------------------------------------------------
-- 6. rpc_list_workspace_members: roster for owner filters and actor names
-- -----------------------------------------------------------------------------
create or replace function public.rpc_list_workspace_members(p_workspace_id uuid)
returns table (user_id uuid, role text, username text, display_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return query
    select m.user_id, m.role::text, u.username::text, p.display_name::text
      from public.workspace_members m
      join public.user_accounts u on u.user_id = m.user_id
      left join public.profiles p on p.user_id = m.user_id
     where m.workspace_id = p_workspace_id
     order by lower(u.username);
end; $$;

revoke all on function public.rpc_list_workspace_members(uuid) from public, anon;
grant execute on function public.rpc_list_workspace_members(uuid) to authenticated;
