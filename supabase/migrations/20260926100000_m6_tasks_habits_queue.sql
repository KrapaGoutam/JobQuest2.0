-- =============================================================================
-- Migration: 20260926100000_m6_tasks_habits_queue.sql
-- Milestone 6: Tasks, Habits & Unified Queue (additive; earlier migrations untouched).
--
-- Sources: Gate 03 TARGET_SCHEMA #16 tasks, #17 habits, #18 habit_logs; ADR-023
-- (one unified tasks & follow-ups workbench, recurrence Daily/Weekdays/Weekly/
-- (Bi-weekly)/Monthly); Gate 02B §6, §8.1, FORM_SPEC 5.1/7.1, INTERACTION_SPEC
-- 2.3/2.4/4.1, mockups 04-tasks.html (T1–T6) and 06-habits-journal.html (H1–H3),
-- approved dashboard D1 (action-first queue).
--
-- ONE canonical reminder model: public.tasks (TASK | FOLLOW_UP | REMINDER).
--  * applications.next_action stays the application's single current next step
--    (M3 field; approved T1/T2 show it as its own "Next action" row type). It is
--    completed through rpc_complete_next_action ("Done, set next", INTERACTION_SPEC
--    2.3) and is never copied into tasks.
--  * contacts.next_follow_up_date becomes a PROJECTION: the earliest due date of
--    the contact's pending FOLLOW_UP tasks, maintained by trigger. Writes to the
--    column (M4 UI, M4 RPCs) are routed into tasks, so there is one source of truth.
--  * Interview reminders are REMINDER tasks linked to the interview (the M5 I3
--    "Remind me" intent). They follow reschedules and are cancelled once the
--    interview has an outcome.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Helpers
-- -----------------------------------------------------------------------------
create or replace function app.user_timezone(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select p.timezone from public.profiles p where p.user_id = p_user), 'UTC');
$$;
revoke all on function app.user_timezone(uuid) from public;

-- -----------------------------------------------------------------------------
-- 1. tasks
-- -----------------------------------------------------------------------------
create table if not exists public.tasks (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  user_id           uuid not null references public.user_accounts(user_id) on delete restrict,
  application_id    uuid null,
  contact_id        uuid null,
  interview_id      uuid null,
  task_type         varchar(16) not null default 'TASK',
  title             varchar(255) not null,
  details           text null,
  -- Date-only tasks keep a calendar DATE (never shifted by UTC conversion);
  -- timed items (reminders) keep an absolute instant. At most one is set.
  due_date          date null,
  due_at            timestamptz null,
  priority          varchar(16) not null default 'MEDIUM',
  status            varchar(16) not null default 'PENDING',
  completed_at      timestamptz null,
  recurrence_rule   varchar(32) null,
  -- First due date of a recurring series; keeps monthly series on their day (Jan 31 -> Feb 28 -> Mar 31).
  recurrence_anchor date null,
  parent_task_id    uuid null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  legacy_id         integer null,
  constraint uq_tasks_id_workspace unique (id, workspace_id),
  constraint fk_tasks_app foreign key (application_id, workspace_id)
    references public.applications(id, workspace_id) on delete cascade,
  constraint fk_tasks_contact foreign key (contact_id, workspace_id)
    references public.contacts(id, workspace_id) on delete cascade,
  constraint fk_tasks_interview foreign key (interview_id, workspace_id)
    references public.interviews(id, workspace_id) on delete cascade,
  constraint fk_tasks_parent foreign key (parent_task_id, workspace_id)
    references public.tasks(id, workspace_id) on delete set null (parent_task_id),
  constraint chk_task_type check (task_type in ('TASK', 'FOLLOW_UP', 'REMINDER')),
  constraint chk_task_status check (status in ('PENDING', 'COMPLETED', 'CANCELLED')),
  constraint chk_task_priority check (priority in ('LOW', 'MEDIUM', 'HIGH')),
  constraint chk_task_recurrence check (recurrence_rule is null or recurrence_rule in ('DAILY', 'WEEKDAYS', 'WEEKLY', 'BIWEEKLY', 'MONTHLY')),
  constraint chk_task_title check (char_length(btrim(title)) between 1 and 255),
  constraint chk_task_details check (coalesce(char_length(details), 0) <= 5000),
  constraint chk_task_one_due check (not (due_date is not null and due_at is not null)),
  constraint chk_task_reminder_due check (task_type <> 'REMINDER' or due_date is not null or due_at is not null),
  constraint chk_task_follow_up_link check (task_type <> 'FOLLOW_UP' or coalesce(application_id, contact_id, interview_id) is not null),
  constraint chk_task_recurrence_due check (recurrence_rule is null or due_date is not null or due_at is not null),
  constraint chk_task_completion check ((status = 'COMPLETED') = (completed_at is not null))
);

-- TARGET_SCHEMA indexes (due index split by date/instant) + queue / entity paths.
create index if not exists idx_tasks_ws_due_date on public.tasks(workspace_id, due_date) where status = 'PENDING';
create index if not exists idx_tasks_ws_due_at on public.tasks(workspace_id, due_at) where status = 'PENDING';
create index if not exists idx_tasks_user_queue on public.tasks(workspace_id, user_id, status);
create index if not exists idx_tasks_ws_completed on public.tasks(workspace_id, completed_at desc) where status = 'COMPLETED';
create index if not exists idx_tasks_application on public.tasks(application_id) where application_id is not null;
create index if not exists idx_tasks_contact on public.tasks(contact_id) where contact_id is not null;
create index if not exists idx_tasks_interview on public.tasks(interview_id) where interview_id is not null;
-- A completed recurring instance generates at most one next instance.
create unique index if not exists uq_tasks_parent on public.tasks(parent_task_id) where parent_task_id is not null;

drop trigger if exists trg_tasks_updated on public.tasks;
create trigger trg_tasks_updated before update on public.tasks
  for each row execute function app.touch_updated_at();

-- Linked records must belong to the task owner (no exposure of another USER's
-- records through a task); an interview link implies its application.
create or replace function app.guard_task()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_app uuid;
begin
  if new.interview_id is not null then
    select i.user_id, i.application_id into v_owner, v_app
      from public.interviews i where i.id = new.interview_id and i.workspace_id = new.workspace_id;
    if found then
      if v_owner <> new.user_id then
        raise exception 'TASK_LINK_FORBIDDEN' using errcode = '42501';
      end if;
      if new.application_id is null then
        new.application_id := v_app;
      elsif new.application_id <> v_app then
        raise exception 'TASK_LINK_MISMATCH' using errcode = '22023';
      end if;
    end if;
  end if;
  if new.application_id is not null then
    select a.user_id into v_owner from public.applications a
      where a.id = new.application_id and a.workspace_id = new.workspace_id;
    if found and v_owner <> new.user_id then
      raise exception 'TASK_LINK_FORBIDDEN' using errcode = '42501';
    end if;
  end if;
  if new.contact_id is not null then
    select c.user_id into v_owner from public.contacts c
      where c.id = new.contact_id and c.workspace_id = new.workspace_id;
    if found and v_owner <> new.user_id then
      raise exception 'TASK_LINK_FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  new.title := btrim(new.title);

  if new.recurrence_rule is null then
    new.recurrence_anchor := null;
  elsif tg_op = 'INSERT' then
    if new.recurrence_anchor is null then
      new.recurrence_anchor := coalesce(new.due_date, (new.due_at at time zone app.user_timezone(new.user_id))::date);
    end if;
  elsif new.due_date is distinct from old.due_date or new.due_at is distinct from old.due_at
        or new.recurrence_rule is distinct from old.recurrence_rule then
    -- A user reschedule re-anchors the series.
    new.recurrence_anchor := coalesce(new.due_date, (new.due_at at time zone app.user_timezone(new.user_id))::date);
  end if;
  return new;
end; $$;
revoke all on function app.guard_task() from public;

drop trigger if exists trg_task_guard on public.tasks;
create trigger trg_task_guard before insert or update on public.tasks
  for each row execute function app.guard_task();

-- -----------------------------------------------------------------------------
-- 2. habits + habit_logs
-- -----------------------------------------------------------------------------
create table if not exists public.habits (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references public.user_accounts(user_id) on delete restrict,
  title         varchar(64) not null,
  description   text null,
  frequency     varchar(16) not null default 'DAILY',
  target_count  integer not null default 1,
  unit_label    varchar(20) null,
  is_active     boolean not null default true,
  archived_at   timestamptz null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  legacy_id     integer null,
  constraint uq_habits_id_workspace unique (id, workspace_id),
  -- TARGET_SCHEMA DAILY | WEEKLY plus the approved "Weekdays only" cadence (Gate 02B §8.1, FORM_SPEC 7.1).
  constraint chk_habits_frequency check (frequency in ('DAILY', 'WEEKDAYS', 'WEEKLY')),
  constraint chk_habits_target check (target_count between 1 and 100),
  constraint chk_habits_title check (char_length(btrim(title)) between 1 and 64),
  constraint chk_habits_description check (coalesce(char_length(description), 0) <= 500)
);
create index if not exists idx_habits_ws_owner on public.habits(workspace_id, user_id) where archived_at is null;

create table if not exists public.habit_logs (
  id              uuid primary key default gen_random_uuid(),
  habit_id        uuid not null,
  workspace_id    uuid not null,
  user_id         uuid not null references public.user_accounts(user_id) on delete restrict,
  log_date        date not null,
  completed_count integer not null default 1,
  -- Target in force when first logged: "Changing the target doesn't rewrite past days" (H2).
  target_count    integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  legacy_id       integer null,
  constraint fk_habit_logs_habit foreign key (habit_id, workspace_id)
    references public.habits(id, workspace_id) on delete cascade,
  constraint uq_habit_logs_date unique (habit_id, log_date),
  constraint chk_habit_logs_count check (completed_count between 1 and 1000),
  constraint chk_habit_logs_target check (target_count between 1 and 100)
);
create index if not exists idx_habit_logs_ws_owner_date on public.habit_logs(workspace_id, user_id, log_date);

drop trigger if exists trg_habits_updated on public.habits;
create trigger trg_habits_updated before update on public.habits for each row execute function app.touch_updated_at();
drop trigger if exists trg_habit_logs_updated on public.habit_logs;
create trigger trg_habit_logs_updated before update on public.habit_logs for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3. RLS + least-privilege grants (OWNER SCOPED / MANAGER OVERRIDE)
-- -----------------------------------------------------------------------------
alter table public.tasks enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (public.can_access_owned_record(workspace_id, user_id));
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (
    (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id))
    or (public.is_workspace_manager(workspace_id) and app.user_is_member(workspace_id, user_id))
  );
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_access_owned_record(workspace_id, user_id))
  with check (public.can_access_owned_record(workspace_id, user_id));

drop policy if exists habits_select on public.habits;
create policy habits_select on public.habits for select to authenticated
  using (public.can_access_owned_record(workspace_id, user_id));
drop policy if exists habits_insert on public.habits;
create policy habits_insert on public.habits for insert to authenticated
  with check (
    (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id))
    or (public.is_workspace_manager(workspace_id) and app.user_is_member(workspace_id, user_id))
  );
drop policy if exists habits_update on public.habits;
create policy habits_update on public.habits for update to authenticated
  using (public.can_access_owned_record(workspace_id, user_id))
  with check (public.can_access_owned_record(workspace_id, user_id));

drop policy if exists habit_logs_select on public.habit_logs;
create policy habit_logs_select on public.habit_logs for select to authenticated
  using (public.can_access_owned_record(workspace_id, user_id));

revoke all on public.tasks, public.habits, public.habit_logs from public, anon, authenticated;
grant select on public.tasks, public.habits, public.habit_logs to authenticated;
-- Tasks: simple fields are client-writable; status, completion, series links and
-- ownership change only through the RPCs below. No DELETE (archive-first: cancel).
grant insert (workspace_id, user_id, application_id, contact_id, interview_id, task_type, title, details,
              due_date, due_at, priority, recurrence_rule) on public.tasks to authenticated;
grant update (application_id, contact_id, interview_id, task_type, title, details, due_date, due_at,
              priority, recurrence_rule) on public.tasks to authenticated;
grant insert (workspace_id, user_id, title, description, frequency, target_count, unit_label, is_active) on public.habits to authenticated;
grant update (title, description, frequency, target_count, unit_label, is_active) on public.habits to authenticated;
grant all on public.tasks, public.habits, public.habit_logs to service_role;

-- -----------------------------------------------------------------------------
-- 4. Recurrence engine (ADR-023). The next occurrence keeps the wall-clock time
--    of timed items in the owner's time zone and skips to the first occurrence
--    that is not in the past, so completing an overdue daily task does not
--    stack overdue copies.
-- -----------------------------------------------------------------------------
create or replace function app.task_next_occurrence(
  p_rule text, p_due_date date, p_due_at timestamptz, p_anchor date, p_tz text, p_today date
)
returns table (next_date date, next_at timestamptz)
language plpgsql stable set search_path = '' as $$
declare
  v_date date;
  v_time time;
  v_anchor date;
  v_months integer;
  v_guard integer := 0;
begin
  if p_due_at is not null then
    v_date := (p_due_at at time zone p_tz)::date;
    v_time := (p_due_at at time zone p_tz)::time;
  else
    v_date := p_due_date;
  end if;
  if v_date is null then
    raise exception 'RECURRENCE_NEEDS_DUE' using errcode = '22023';
  end if;
  v_anchor := coalesce(p_anchor, v_date);
  loop
    v_guard := v_guard + 1;
    if v_guard > 20000 then
      raise exception 'RECURRENCE_RUNAWAY' using errcode = '22023';
    end if;
    if p_rule = 'DAILY' then
      v_date := v_date + 1;
    elsif p_rule = 'WEEKDAYS' then
      v_date := v_date + 1;
      while extract(isodow from v_date) > 5 loop
        v_date := v_date + 1;
      end loop;
    elsif p_rule = 'WEEKLY' then
      v_date := v_date + 7;
    elsif p_rule = 'BIWEEKLY' then
      v_date := v_date + 14;
    elsif p_rule = 'MONTHLY' then
      v_months := (extract(year from v_date)::int - extract(year from v_anchor)::int) * 12
                + (extract(month from v_date)::int - extract(month from v_anchor)::int) + 1;
      v_date := (v_anchor + make_interval(months => v_months))::date;
    else
      raise exception 'INVALID_RECURRENCE' using errcode = '22023';
    end if;
    exit when v_date >= p_today;
  end loop;
  if p_due_at is not null then
    return query select v_date, ((v_date + v_time) at time zone p_tz);
  else
    return query select v_date, null::timestamptz;
  end if;
end; $$;
revoke all on function app.task_next_occurrence(text, date, timestamptz, date, text, date) from public;

-- -----------------------------------------------------------------------------
-- 5. Task RPCs
-- -----------------------------------------------------------------------------
create or replace function public.rpc_complete_task(p_task_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_t public.tasks;
  v_tz text;
  v_next record;
  v_next_id uuid;
begin
  if v_uid is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select * into v_t from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'TASK_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.can_access_owned_record(v_t.workspace_id, v_t.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if v_t.status <> 'PENDING' then
    raise exception 'TASK_NOT_PENDING' using errcode = '22023';
  end if;

  update public.tasks set status = 'COMPLETED', completed_at = now() where id = p_task_id;

  if v_t.recurrence_rule is not null then
    v_tz := app.user_timezone(v_t.user_id);
    select * into v_next from app.task_next_occurrence(
      v_t.recurrence_rule, v_t.due_date, v_t.due_at, v_t.recurrence_anchor, v_tz, (now() at time zone v_tz)::date);
    insert into public.tasks (workspace_id, user_id, application_id, contact_id, interview_id, task_type, title, details,
                              due_date, due_at, priority, recurrence_rule, recurrence_anchor, parent_task_id)
    values (v_t.workspace_id, v_t.user_id, v_t.application_id, v_t.contact_id, v_t.interview_id, v_t.task_type, v_t.title,
            v_t.details, case when v_t.due_at is null then v_next.next_date end, v_next.next_at, v_t.priority,
            v_t.recurrence_rule, v_t.recurrence_anchor, v_t.id)
    on conflict (parent_task_id) where parent_task_id is not null do nothing
    returning id into v_next_id;
  end if;

  -- A completed follow-up on an application is timeline activity.
  if v_t.task_type = 'FOLLOW_UP' and v_t.application_id is not null then
    insert into public.application_events (application_id, workspace_id, actor_id, event_type, payload)
    values (v_t.application_id, v_t.workspace_id, v_uid, 'FOLLOW_UP',
            jsonb_build_object('task_id', v_t.id, 'title', v_t.title, 'completed', true));
    update public.applications set last_activity_at = now(), updated_at = now() where id = v_t.application_id;
  end if;

  return jsonb_build_object('task_id', p_task_id, 'next_task_id', v_next_id);
end; $$;

-- Undo (INTERACTION_SPEC 4.1 "Undo (8s)"): reopen and withdraw the untouched
-- next instance the completion generated.
create or replace function public.rpc_reopen_task(p_task_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_t public.tasks;
  v_child public.tasks;
begin
  if v_uid is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select * into v_t from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'TASK_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.can_access_owned_record(v_t.workspace_id, v_t.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if v_t.status <> 'COMPLETED' then
    raise exception 'TASK_NOT_COMPLETED' using errcode = '22023';
  end if;
  select * into v_child from public.tasks where parent_task_id = p_task_id for update;
  if found then
    if v_child.status <> 'PENDING' or v_child.updated_at <> v_child.created_at then
      raise exception 'TASK_REOPEN_CONFLICT' using errcode = '22023',
        hint = 'The next occurrence has already been changed or completed.';
    end if;
    delete from public.tasks where id = v_child.id;
  end if;
  update public.tasks set status = 'PENDING', completed_at = null where id = p_task_id;
  return jsonb_build_object('task_id', p_task_id, 'withdrawn_next_task_id', v_child.id);
end; $$;

-- Archive-first removal: a cancelled task stays in history.
create or replace function public.rpc_cancel_task(p_task_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_t public.tasks;
begin
  if v_uid is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select * into v_t from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'TASK_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.can_access_owned_record(v_t.workspace_id, v_t.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if v_t.status <> 'PENDING' then
    raise exception 'TASK_NOT_PENDING' using errcode = '22023';
  end if;
  update public.tasks set status = 'CANCELLED' where id = p_task_id;
  return true;
end; $$;

-- "Done, set next" for an application's next action (INTERACTION_SPEC 2.3).
create or replace function public.rpc_complete_next_action(
  p_application_id uuid,
  p_next_action text default null,
  p_next_action_date date default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_app record;
  v_next text := nullif(btrim(coalesce(p_next_action, '')), '');
begin
  if v_uid is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select id, workspace_id, user_id, next_action, next_action_date into v_app
    from public.applications where id = p_application_id for update;
  if not found then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.can_access_owned_record(v_app.workspace_id, v_app.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if v_app.next_action is null then
    raise exception 'NO_NEXT_ACTION' using errcode = '22023';
  end if;
  if char_length(coalesce(v_next, '')) > 255 then
    raise exception 'NEXT_ACTION_TOO_LONG' using errcode = '22023';
  end if;
  update public.applications
     set next_action = v_next,
         next_action_date = case when v_next is null then null else p_next_action_date end,
         next_action_completed_at = now(),
         last_activity_at = now(),
         updated_at = now()
   where id = p_application_id;
  insert into public.application_events (application_id, workspace_id, actor_id, event_type, payload)
  values (p_application_id, v_app.workspace_id, v_uid, 'NEXT_ACTION_CHANGED', jsonb_build_object(
    'completed_action', v_app.next_action, 'completed_due', v_app.next_action_date,
    'next_action', v_next, 'next_action_date', case when v_next is null then null else p_next_action_date end));
  return jsonb_build_object('id', p_application_id, 'next_action', v_next);
end; $$;

-- -----------------------------------------------------------------------------
-- 6. Contact follow-ups: tasks are canonical; contacts.next_follow_up_date is a projection
-- -----------------------------------------------------------------------------
create or replace function app.set_contact_follow_up(p_contact_id uuid, p_due date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_c public.contacts;
  v_task uuid;
begin
  select * into v_c from public.contacts where id = p_contact_id;
  if not found then
    return;
  end if;
  if p_due is null then
    update public.tasks set status = 'CANCELLED'
     where contact_id = p_contact_id and task_type = 'FOLLOW_UP' and status = 'PENDING';
    return;
  end if;
  select t.id into v_task from public.tasks t
   where t.contact_id = p_contact_id and t.task_type = 'FOLLOW_UP' and t.status = 'PENDING'
   order by coalesce(t.due_date, (t.due_at at time zone 'UTC')::date) nulls last, t.created_at
   limit 1 for update;
  if v_task is null then
    insert into public.tasks (workspace_id, user_id, contact_id, task_type, title, due_date, priority)
    values (v_c.workspace_id, v_c.user_id, v_c.id, 'FOLLOW_UP', left('Follow up with ' || v_c.full_name, 255), p_due, 'MEDIUM');
  else
    update public.tasks set due_date = p_due, due_at = null where id = v_task;
  end if;
end; $$;
revoke all on function app.set_contact_follow_up(uuid, date) from public;

-- Projection: earliest due date of the contact's pending FOLLOW_UP tasks.
create or replace function app.refresh_contact_follow_up(p_contact_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.contacts c
     set next_follow_up_date = s.next_due
    from (select min(coalesce(t.due_date, (t.due_at at time zone app.user_timezone(t.user_id))::date)) as next_due
            from public.tasks t
           where t.contact_id = p_contact_id and t.task_type = 'FOLLOW_UP' and t.status = 'PENDING') s
   where c.id = p_contact_id and c.next_follow_up_date is distinct from s.next_due;
$$;
revoke all on function app.refresh_contact_follow_up(uuid) from public;

create or replace function app.sync_contact_follow_up()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'DELETE' then
    if new.contact_id is not null then
      perform app.refresh_contact_follow_up(new.contact_id);
    end if;
  end if;
  if tg_op <> 'INSERT' then
    if old.contact_id is not null and old.contact_id is distinct from (case when tg_op = 'UPDATE' then new.contact_id end) then
      perform app.refresh_contact_follow_up(old.contact_id);
    end if;
  end if;
  return null;
end; $$;
revoke all on function app.sync_contact_follow_up() from public;

drop trigger if exists trg_tasks_contact_follow_up on public.tasks;
create trigger trg_tasks_contact_follow_up
  after insert or delete or update of status, due_date, due_at, contact_id, task_type on public.tasks
  for each row execute function app.sync_contact_follow_up();

-- Writes to contacts.next_follow_up_date (M4 UI/RPCs/tests) are routed into
-- the canonical tasks; the projection above then sets the column.
create or replace function app.route_contact_follow_up()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then
    return null; -- projection writes, not user intent
  end if;
  if tg_op = 'INSERT' then
    if new.next_follow_up_date is null then
      return null;
    end if;
  elsif new.next_follow_up_date is not distinct from old.next_follow_up_date then
    return null;
  end if;
  perform app.set_contact_follow_up(new.id, new.next_follow_up_date);
  return null;
end; $$;
revoke all on function app.route_contact_follow_up() from public;

drop trigger if exists trg_contacts_route_follow_up on public.contacts;
create trigger trg_contacts_route_follow_up
  after insert or update of next_follow_up_date on public.contacts
  for each row execute function app.route_contact_follow_up();

-- Contact follow-up actions used by the contacts UI.
create or replace function public.rpc_set_contact_follow_up(p_contact_id uuid, p_due_date date)
returns date language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_c public.contacts;
begin
  if v_uid is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select * into v_c from public.contacts where id = p_contact_id;
  if not found then
    raise exception 'CONTACT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.can_access_owned_record(v_c.workspace_id, v_c.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  perform app.set_contact_follow_up(p_contact_id, p_due_date);
  return (select next_follow_up_date from public.contacts where id = p_contact_id);
end; $$;

create or replace function public.rpc_complete_contact_follow_up(p_contact_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_c public.contacts;
  v_task uuid;
begin
  if v_uid is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select * into v_c from public.contacts where id = p_contact_id;
  if not found then
    raise exception 'CONTACT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.can_access_owned_record(v_c.workspace_id, v_c.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select t.id into v_task from public.tasks t
   where t.contact_id = p_contact_id and t.task_type = 'FOLLOW_UP' and t.status = 'PENDING'
   order by coalesce(t.due_date, (t.due_at at time zone 'UTC')::date) nulls last, t.created_at limit 1;
  if v_task is null then
    raise exception 'NO_FOLLOW_UP' using errcode = '22023';
  end if;
  return public.rpc_complete_task(v_task);
end; $$;

-- Backfill: existing contact follow-up dates become canonical FOLLOW_UP tasks.
insert into public.tasks (workspace_id, user_id, contact_id, task_type, title, due_date, priority)
select c.workspace_id, c.user_id, c.id, 'FOLLOW_UP', left('Follow up with ' || c.full_name, 255), c.next_follow_up_date, 'MEDIUM'
  from public.contacts c
 where c.next_follow_up_date is not null
   and not exists (select 1 from public.tasks t where t.contact_id = c.id and t.task_type = 'FOLLOW_UP' and t.status = 'PENDING');

-- -----------------------------------------------------------------------------
-- 7. Interview reminders (M5 I3 intent) as REMINDER tasks
-- -----------------------------------------------------------------------------
create or replace function app.sync_interview_tasks()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.scheduled_at is distinct from old.scheduled_at then
    update public.tasks
       set due_at = due_at + (new.scheduled_at - old.scheduled_at)
     where interview_id = new.id and task_type = 'REMINDER' and status = 'PENDING' and due_at is not null;
  end if;
  if new.outcome is not null and new.outcome is distinct from old.outcome then
    -- The interview has happened or was called off: its pre-interview reminders are moot.
    update public.tasks set status = 'CANCELLED'
     where interview_id = new.id and task_type = 'REMINDER' and status = 'PENDING';
  end if;
  return null;
end; $$;
revoke all on function app.sync_interview_tasks() from public;

drop trigger if exists trg_interviews_sync_tasks on public.interviews;
create trigger trg_interviews_sync_tasks
  after update of scheduled_at, outcome on public.interviews
  for each row execute function app.sync_interview_tasks();

drop function if exists public.rpc_schedule_interview(uuid, text, timestamptz, integer, text, integer, text, text, text, text, uuid[], text);

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
  p_move_to_stage text default null,
  p_remind_before_minutes integer default null
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

  -- M6: optional reminder as a canonical REMINDER task (no separate reminder system).
  if p_remind_before_minutes is not null then
    if p_remind_before_minutes < 0 or p_remind_before_minutes > 10080 then
      raise exception 'INVALID_REMINDER_OFFSET' using errcode = '22023';
    end if;
    insert into public.tasks (workspace_id, user_id, application_id, interview_id, task_type, title, due_at, priority)
    values (v_app.workspace_id, v_app.user_id, p_application_id, v_interview.id, 'REMINDER',
            left('Interview: ' || initcap(replace(v_interview.interview_type, '_', ' ')) || ' · round ' || v_interview.round_number, 255),
            v_interview.scheduled_at - make_interval(mins => p_remind_before_minutes), 'HIGH');
  end if;

  -- Explicit, optional stage move chosen by the user: the existing workflow RPC,
  -- same transaction (a failure rolls the whole schedule back).
  if p_move_to_stage is not null then
    perform public.rpc_move_application_stage(p_application_id, p_move_to_stage, null);
  end if;

  return v_interview;
end; $$;


revoke all on function public.rpc_schedule_interview(uuid, text, timestamptz, integer, text, integer, text, text, text, text, uuid[], text, integer) from public, anon;
grant execute on function public.rpc_schedule_interview(uuid, text, timestamptz, integer, text, integer, text, text, text, text, uuid[], text, integer) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 8. Habit RPCs
-- -----------------------------------------------------------------------------
-- Idempotent per (habit, day): sets the day's count; 0 removes the day's check-in.
create or replace function public.rpc_set_habit_log(p_habit_id uuid, p_log_date date, p_count integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_h public.habits;
  v_today date;
begin
  if v_uid is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select * into v_h from public.habits where id = p_habit_id for update;
  if not found then
    raise exception 'HABIT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.can_access_owned_record(v_h.workspace_id, v_h.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if v_h.archived_at is not null then
    raise exception 'HABIT_ARCHIVED' using errcode = '22023';
  end if;
  if p_count is null or p_count < 0 or p_count > 1000 then
    raise exception 'INVALID_COUNT' using errcode = '22023';
  end if;
  v_today := (now() at time zone app.user_timezone(v_h.user_id))::date;
  if p_log_date is null or p_log_date > v_today then
    raise exception 'FUTURE_DATE' using errcode = '22023';
  end if;
  if p_log_date < v_today - 366 then
    raise exception 'DATE_TOO_OLD' using errcode = '22023';
  end if;
  if p_count = 0 then
    delete from public.habit_logs where habit_id = p_habit_id and log_date = p_log_date;
    return 0;
  end if;
  if not v_h.is_active then
    raise exception 'HABIT_PAUSED' using errcode = '22023';
  end if;
  insert into public.habit_logs (habit_id, workspace_id, user_id, log_date, completed_count, target_count)
  values (p_habit_id, v_h.workspace_id, v_h.user_id, p_log_date, p_count, v_h.target_count)
  on conflict (habit_id, log_date) do update set completed_count = excluded.completed_count;
  return p_count;
end; $$;

create or replace function public.rpc_archive_habit(p_habit_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_h public.habits;
begin
  if v_uid is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select * into v_h from public.habits where id = p_habit_id for update;
  if not found then
    raise exception 'HABIT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.can_access_owned_record(v_h.workspace_id, v_h.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  update public.habits set archived_at = coalesce(archived_at, now()), is_active = false where id = p_habit_id;
  return true;
end; $$;

create or replace function public.rpc_restore_habit(p_habit_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_h public.habits;
begin
  if v_uid is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select * into v_h from public.habits where id = p_habit_id for update;
  if not found then
    raise exception 'HABIT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.can_access_owned_record(v_h.workspace_id, v_h.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  update public.habits set archived_at = null, is_active = true where id = p_habit_id;
  return true;
end; $$;

-- Habit log owner is the habit owner (manager check-ins stay attributed to the member).
create or replace function app.guard_habit_log()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select h.user_id into new.user_id from public.habits h where h.id = new.habit_id and h.workspace_id = new.workspace_id;
  return new;
end; $$;
revoke all on function app.guard_habit_log() from public;
drop trigger if exists trg_habit_log_guard on public.habit_logs;
create trigger trg_habit_log_guard before insert on public.habit_logs
  for each row execute function app.guard_habit_log();

do $$
declare f text;
begin
  foreach f in array array[
    'public.rpc_complete_task(uuid)', 'public.rpc_reopen_task(uuid)', 'public.rpc_cancel_task(uuid)',
    'public.rpc_complete_next_action(uuid, text, date)', 'public.rpc_set_contact_follow_up(uuid, date)',
    'public.rpc_complete_contact_follow_up(uuid)', 'public.rpc_set_habit_log(uuid, date, integer)',
    'public.rpc_archive_habit(uuid)', 'public.rpc_restore_habit(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 9. Manager mutation audit (M4/M5 architecture) for the new owner-scoped tables
-- -----------------------------------------------------------------------------
drop trigger if exists trg_audit_tasks on public.tasks;
create trigger trg_audit_tasks after insert or update or delete on public.tasks
  for each row execute function app.audit_cross_user_mutation('TASK');
drop trigger if exists trg_audit_habits on public.habits;
create trigger trg_audit_habits after insert or update or delete on public.habits
  for each row execute function app.audit_cross_user_mutation('HABIT');
drop trigger if exists trg_audit_habit_logs on public.habit_logs;
create trigger trg_audit_habit_logs after insert or update or delete on public.habit_logs
  for each row execute function app.audit_cross_user_mutation('HABIT_LOG');
