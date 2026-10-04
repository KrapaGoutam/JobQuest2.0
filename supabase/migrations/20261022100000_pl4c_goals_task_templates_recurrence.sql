-- =============================================================================
-- PL-4C: Configurable goals, global task templates, configurable recurrence
--
-- This migration is intentionally additive for deployed-client compatibility:
--   * public.goals keeps target_applications/target_outreach as compatibility
--     snapshots while goal_type/target_value become canonical.
--   * existing recurrence presets keep their current defaults and behavior.
--   * templates create ordinary public.tasks rows; they never own task status.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Normalize goals: one effective-dated metric per row.
-- -----------------------------------------------------------------------------
alter table public.goals
  add column if not exists goal_type varchar(32) null,
  add column if not exists target_value integer null,
  add column if not exists is_enabled boolean not null default true;

alter table public.goals drop constraint if exists uq_goals_user_effective;

update public.goals
set goal_type = 'APPLICATIONS',
    target_value = target_applications,
    is_enabled = true
where goal_type is null;

-- Preserve the original row/id as APPLICATIONS and clone its bundled outreach
-- target into the canonical NETWORKING metric. Compatibility columns remain on
-- both rows so an older read-only client can consume either row during rollout.
insert into public.goals (
  workspace_id, user_id, period_type, target_applications, target_outreach,
  effective_date, created_at, updated_at, legacy_id,
  goal_type, target_value, is_enabled
)
select
  g.workspace_id, g.user_id, g.period_type, g.target_applications,
  g.target_outreach, g.effective_date, g.created_at, g.updated_at, null,
  'NETWORKING', g.target_outreach, true
from public.goals g
where g.goal_type = 'APPLICATIONS'
  and not exists (
    select 1 from public.goals n
    where n.workspace_id = g.workspace_id
      and n.user_id = g.user_id
      and n.goal_type = 'NETWORKING'
      and n.effective_date = g.effective_date
  );

alter table public.goals
  alter column goal_type set not null,
  alter column target_value set not null;

alter table public.goals drop constraint if exists chk_goals_type;
alter table public.goals add constraint chk_goals_type check (
  goal_type in ('APPLICATIONS', 'NETWORKING', 'FOLLOW_UPS', 'INTERVIEW_PREP')
);
alter table public.goals drop constraint if exists chk_goals_target_value;
alter table public.goals add constraint chk_goals_target_value check (
  target_value between 1 and 100000
);
alter table public.goals add constraint uq_goals_user_type_effective
  unique (workspace_id, user_id, goal_type, effective_date);

create index if not exists idx_goals_ws_user_type_effective
  on public.goals(workspace_id, user_id, goal_type, effective_date desc);

-- Count one canonical goal metric in a half-open owner-local calendar range.
create or replace function app.goal_actual(
  p_workspace_id uuid,
  p_user_id uuid,
  p_goal_type text,
  p_period_start date,
  p_period_end date,
  p_timezone text
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := p_period_start::timestamp at time zone p_timezone;
  v_end timestamptz := p_period_end::timestamp at time zone p_timezone;
  v_actual integer := 0;
begin
  if p_goal_type = 'APPLICATIONS' then
    select count(*)::integer into v_actual
    from public.applications a
    cross join lateral app.analytics_milestones(a.id) m
    where a.workspace_id = p_workspace_id
      and a.user_id = p_user_id
      and m.applied_event_at >= v_start
      and m.applied_event_at < v_end;
  elsif p_goal_type = 'NETWORKING' then
    select count(*)::integer into v_actual
    from public.contact_interactions c
    where c.workspace_id = p_workspace_id
      and c.user_id = p_user_id
      and c.interaction_type <> 'NOTE'
      and c.interaction_date >= v_start
      and c.interaction_date < v_end;
  elsif p_goal_type = 'FOLLOW_UPS' then
    select count(*)::integer into v_actual
    from public.tasks t
    where t.workspace_id = p_workspace_id
      and t.user_id = p_user_id
      and t.task_type = 'FOLLOW_UP'
      and t.status = 'COMPLETED'
      and t.completed_at >= v_start
      and t.completed_at < v_end;
  elsif p_goal_type = 'INTERVIEW_PREP' then
    select count(*)::integer into v_actual
    from public.journal_entries j
    where j.workspace_id = p_workspace_id
      and j.user_id = p_user_id
      and j.entry_type = 'INTERVIEW_PREP'
      and j.created_at >= v_start
      and j.created_at < v_end;
  else
    raise exception 'INVALID_GOAL_TYPE' using errcode = '22023';
  end if;
  return coalesce(v_actual, 0);
end;
$$;
revoke all on function app.goal_actual(uuid, uuid, text, date, date, text)
  from public, anon, authenticated;

-- Create/update a current or future effective goal version. The caller passes a
-- local calendar date; weekly/monthly values are normalized for the target user.
create or replace function public.rpc_set_goal_for_user(
  p_workspace_id uuid,
  p_goal_type text,
  p_target_value integer,
  p_period_type text default 'WEEKLY',
  p_effective_date date default null,
  p_is_enabled boolean default true,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_target uuid;
  v_goal_type text := upper(coalesce(nullif(btrim(p_goal_type), ''), ''));
  v_period text := upper(coalesce(nullif(btrim(p_period_type), ''), 'WEEKLY'));
  v_timezone text := 'UTC';
  v_week_start smallint := 1;
  v_today date;
  v_requested date;
  v_effective date;
  v_apps integer := 15;
  v_networking integer := 5;
  v_result public.goals%rowtype;
begin
  if v_actor is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'NOT_A_WORKSPACE_MEMBER' using errcode = '42501';
  end if;

  v_target := coalesce(p_user_id, v_actor);
  if v_target <> v_actor and not public.is_workspace_manager(p_workspace_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if not app.user_is_member(p_workspace_id, v_target) then
    raise exception 'TARGET_NOT_A_WORKSPACE_MEMBER' using errcode = '42501';
  end if;
  if v_goal_type not in ('APPLICATIONS', 'NETWORKING', 'FOLLOW_UPS', 'INTERVIEW_PREP') then
    raise exception 'INVALID_GOAL_TYPE' using errcode = '23514';
  end if;
  if v_period not in ('DAILY', 'WEEKLY', 'MONTHLY') then
    raise exception 'INVALID_PERIOD_TYPE' using errcode = '23514';
  end if;
  if p_target_value is null or p_target_value < 1 or p_target_value > 100000 then
    raise exception 'INVALID_TARGET_VALUE' using errcode = '23514';
  end if;

  select coalesce(p.timezone, 'UTC'), coalesce(p.week_start, 1)
    into v_timezone, v_week_start
    from public.profiles p where p.user_id = v_target;
  v_today := (now() at time zone v_timezone)::date;
  v_requested := coalesce(p_effective_date, v_today);
  if v_requested < v_today then
    raise exception 'GOAL_HISTORY_IMMUTABLE' using errcode = '22023',
      hint = 'Choose today or a future effective date; closed periods cannot be rewritten.';
  end if;

  v_effective := v_requested;
  if v_period = 'WEEKLY' then
    v_effective := v_effective - case
      when v_week_start = 0 then extract(dow from v_effective)::integer
      else extract(isodow from v_effective)::integer - 1
    end;
  elsif v_period = 'MONTHLY' then
    v_effective := date_trunc('month', v_effective)::date;
  end if;

  select g.target_value into v_apps
  from public.goals g
  where g.workspace_id = p_workspace_id and g.user_id = v_target
    and g.goal_type = 'APPLICATIONS' and g.is_enabled
    and g.effective_date <= v_effective
  order by g.effective_date desc, g.created_at desc limit 1;
  v_apps := coalesce(v_apps, 15);

  select g.target_value into v_networking
  from public.goals g
  where g.workspace_id = p_workspace_id and g.user_id = v_target
    and g.goal_type = 'NETWORKING' and g.is_enabled
    and g.effective_date <= v_effective
  order by g.effective_date desc, g.created_at desc limit 1;
  v_networking := coalesce(v_networking, 5);

  if v_goal_type = 'APPLICATIONS' then
    v_apps := p_target_value;
  elsif v_goal_type = 'NETWORKING' then
    v_networking := p_target_value;
  end if;

  insert into public.goals (
    workspace_id, user_id, goal_type, target_value, period_type,
    effective_date, is_enabled, target_applications, target_outreach, updated_at
  ) values (
    p_workspace_id, v_target, v_goal_type, p_target_value, v_period,
    v_effective, coalesce(p_is_enabled, true), v_apps, v_networking, now()
  )
  on conflict (workspace_id, user_id, goal_type, effective_date)
  do update set
    target_value = excluded.target_value,
    period_type = excluded.period_type,
    is_enabled = excluded.is_enabled,
    target_applications = excluded.target_applications,
    target_outreach = excluded.target_outreach,
    updated_at = now()
  returning * into v_result;

  return to_jsonb(v_result);
end;
$$;
revoke all on function public.rpc_set_goal_for_user(uuid, text, integer, text, date, boolean, uuid)
  from public, anon;
grant execute on function public.rpc_set_goal_for_user(uuid, text, integer, text, date, boolean, uuid)
  to authenticated;

-- Compatibility wrappers for the bundled M8 goal contract. They now write two
-- canonical goal versions and return the legacy combined JSON shape.
create or replace function public.rpc_upsert_goal_for_user(
  p_workspace_id uuid,
  p_period_type text default 'WEEKLY',
  p_target_applications integer default 15,
  p_target_outreach integer default 5,
  p_effective_date date default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_apps jsonb;
  v_networking jsonb;
begin
  v_apps := public.rpc_set_goal_for_user(
    p_workspace_id, 'APPLICATIONS', p_target_applications,
    p_period_type, p_effective_date, true, p_user_id
  );
  v_networking := public.rpc_set_goal_for_user(
    p_workspace_id, 'NETWORKING', greatest(p_target_outreach, 1),
    p_period_type, p_effective_date, p_target_outreach > 0, p_user_id
  );
  return jsonb_build_object(
    'id', v_apps->>'id',
    'period_type', v_apps->>'period_type',
    'target_applications', p_target_applications,
    'target_outreach', p_target_outreach,
    'effective_date', v_apps->>'effective_date',
    'application_goal', v_apps,
    'networking_goal', v_networking
  );
end;
$$;
revoke all on function public.rpc_upsert_goal_for_user(uuid, text, integer, integer, date, uuid)
  from public, anon;
grant execute on function public.rpc_upsert_goal_for_user(uuid, text, integer, integer, date, uuid)
  to authenticated;

create or replace function public.rpc_upsert_goal(
  p_workspace_id uuid,
  p_period_type text default 'WEEKLY',
  p_target_applications integer default 15,
  p_target_outreach integer default 5,
  p_effective_date date default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.rpc_upsert_goal_for_user(
    p_workspace_id, p_period_type, p_target_applications,
    p_target_outreach, p_effective_date, null
  );
$$;
revoke all on function public.rpc_upsert_goal(uuid, text, integer, integer, date)
  from public, anon;
grant execute on function public.rpc_upsert_goal(uuid, text, integer, integer, date)
  to authenticated;

create or replace function public.rpc_get_goal_progress(
  p_workspace_id uuid,
  p_user_id uuid default null,
  p_period_count integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_target uuid;
  v_timezone text := 'UTC';
  v_week_start smallint := 1;
  v_today date;
  v_limit integer := least(greatest(coalesce(p_period_count, 12), 1), 36);
  v_active jsonb := '[]'::jsonb;
  v_history jsonb := '[]'::jsonb;
  v_versions jsonb := '[]'::jsonb;
begin
  if v_actor is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'NOT_A_WORKSPACE_MEMBER' using errcode = '42501';
  end if;
  v_target := coalesce(p_user_id, v_actor);
  if v_target <> v_actor and not public.is_workspace_manager(p_workspace_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if not app.user_is_member(p_workspace_id, v_target) then
    raise exception 'TARGET_NOT_A_WORKSPACE_MEMBER' using errcode = '42501';
  end if;

  select coalesce(p.timezone, 'UTC'), coalesce(p.week_start, 1)
    into v_timezone, v_week_start
    from public.profiles p where p.user_id = v_target;
  v_today := (now() at time zone v_timezone)::date;

  with ordered_versions as (
    select g.*,
      lead(g.effective_date) over (
        partition by g.goal_type order by g.effective_date, g.created_at
      ) as next_effective
    from public.goals g
    where g.workspace_id = p_workspace_id and g.user_id = v_target
      and g.effective_date <= v_today
  ), enabled_windows as (
    select * from ordered_versions where is_enabled
  ), generated_periods as (
    select v.id as goal_id, v.goal_type, v.period_type, v.target_value,
      v.effective_date, gs::date as period_start,
      case v.period_type
        when 'DAILY' then (gs + interval '1 day')::date
        when 'WEEKLY' then (gs + interval '7 days')::date
        else (gs + interval '1 month')::date
      end as period_end
    from enabled_windows v
    cross join lateral generate_series(
      v.effective_date::timestamp,
      least(coalesce(v.next_effective - 1, v_today), v_today)::timestamp,
      case v.period_type
        when 'DAILY' then interval '1 day'
        when 'WEEKLY' then interval '7 days'
        else interval '1 month'
      end
    ) gs
  ), measured as (
    select p.*,
      app.goal_actual(
        p_workspace_id, v_target, p.goal_type,
        p.period_start, p.period_end, v_timezone
      ) as actual,
      row_number() over (
        partition by p.goal_type order by p.period_start desc
      ) as recency
    from generated_periods p
  ), limited as (
    select * from measured where recency <= v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'goal_id', goal_id,
    'goal_type', goal_type,
    'period_type', period_type,
    'target_value', target_value,
    'effective_date', effective_date,
    'period_start', period_start,
    'period_end', period_end,
    'actual', actual,
    'percentage', round(actual::numeric * 100 / greatest(target_value, 1), 1),
    'status', case
      when period_end > v_today then 'CURRENT'
      when actual >= target_value then 'MET'
      else 'MISSED'
    end
  ) order by goal_type, period_start), '[]'::jsonb)
  into v_history
  from limited;

  with latest as (
    select distinct on (g.goal_type) g.*
    from public.goals g
    where g.workspace_id = p_workspace_id and g.user_id = v_target
      and g.effective_date <= v_today
    order by g.goal_type, g.effective_date desc, g.created_at desc
  ), bounds as (
    select l.*,
      case l.period_type
        when 'DAILY' then v_today
        when 'WEEKLY' then v_today - case
          when v_week_start = 0 then extract(dow from v_today)::integer
          else extract(isodow from v_today)::integer - 1
        end
        else date_trunc('month', v_today)::date
      end as period_start
    from latest l where l.is_enabled
  ), measured as (
    select b.*,
      case b.period_type
        when 'DAILY' then b.period_start + 1
        when 'WEEKLY' then b.period_start + 7
        else (b.period_start + interval '1 month')::date
      end as period_end
    from bounds b
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'goal_type', goal_type,
    'period_type', period_type,
    'target_value', target_value,
    'effective_date', effective_date,
    'is_enabled', is_enabled,
    'period_start', period_start,
    'period_end', period_end,
    'actual', app.goal_actual(
      p_workspace_id, v_target, goal_type, period_start, period_end, v_timezone
    ),
    'percentage', round(
      app.goal_actual(p_workspace_id, v_target, goal_type, period_start, period_end, v_timezone)::numeric
      * 100 / greatest(target_value, 1), 1
    )
  ) order by goal_type), '[]'::jsonb)
  into v_active
  from measured;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id,
    'goal_type', g.goal_type,
    'period_type', g.period_type,
    'target_value', g.target_value,
    'effective_date', g.effective_date,
    'is_enabled', g.is_enabled,
    'created_at', g.created_at,
    'updated_at', g.updated_at
  ) order by g.goal_type, g.effective_date desc, g.created_at desc), '[]'::jsonb)
  into v_versions
  from public.goals g
  where g.workspace_id = p_workspace_id and g.user_id = v_target;

  return jsonb_build_object(
    'user_id', v_target,
    'timezone', v_timezone,
    'week_start', v_week_start,
    'active_goals', v_active,
    'history', v_history,
    'versions', v_versions
  );
end;
$$;
revoke all on function public.rpc_get_goal_progress(uuid, uuid, integer)
  from public, anon;
grant execute on function public.rpc_get_goal_progress(uuid, uuid, integer)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Extend canonical task recurrence configuration.
-- -----------------------------------------------------------------------------
alter table public.tasks
  add column if not exists recurrence_interval smallint not null default 1,
  add column if not exists recurrence_weekdays smallint[] null,
  add column if not exists recurrence_until date null,
  add column if not exists recurrence_occurrence_limit integer null,
  add column if not exists recurrence_occurrence_number integer not null default 1;

alter table public.tasks drop constraint if exists chk_task_recurrence_interval;
alter table public.tasks add constraint chk_task_recurrence_interval
  check (recurrence_interval between 1 and 365);
alter table public.tasks drop constraint if exists chk_task_recurrence_weekdays;
alter table public.tasks add constraint chk_task_recurrence_weekdays check (
  recurrence_weekdays is null or (
    recurrence_rule = 'WEEKLY'
    and cardinality(recurrence_weekdays) between 1 and 7
    and recurrence_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
  )
);
alter table public.tasks drop constraint if exists chk_task_recurrence_end;
alter table public.tasks add constraint chk_task_recurrence_end check (
  recurrence_until is null or recurrence_occurrence_limit is null
);
alter table public.tasks drop constraint if exists chk_task_recurrence_limit;
alter table public.tasks add constraint chk_task_recurrence_limit check (
  recurrence_occurrence_limit is null
  or recurrence_occurrence_limit between 1 and 10000
);
alter table public.tasks drop constraint if exists chk_task_recurrence_number;
alter table public.tasks add constraint chk_task_recurrence_number check (
  recurrence_occurrence_number between 1 and 10000
  and (
    recurrence_occurrence_limit is null
    or recurrence_occurrence_number <= recurrence_occurrence_limit
  )
);
alter table public.tasks drop constraint if exists chk_task_recurrence_config;
alter table public.tasks add constraint chk_task_recurrence_config check (
  (recurrence_rule is null and recurrence_interval = 1
    and recurrence_weekdays is null and recurrence_until is null
    and recurrence_occurrence_limit is null and recurrence_occurrence_number = 1)
  or
  (recurrence_rule is not null
    and (recurrence_rule not in ('WEEKDAYS', 'BIWEEKLY') or recurrence_interval = 1)
    and (recurrence_rule = 'WEEKLY' or recurrence_weekdays is null))
);

-- Replaces the M6 guard in place. Recurrence configuration changes re-anchor
-- the pending series; end-condition-only edits do not move its calendar anchor.
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
  new.recurrence_interval := coalesce(new.recurrence_interval, 1);
  new.recurrence_occurrence_number := coalesce(new.recurrence_occurrence_number, 1);

  if new.recurrence_rule is null then
    new.recurrence_anchor := null;
    new.recurrence_interval := 1;
    new.recurrence_weekdays := null;
    new.recurrence_until := null;
    new.recurrence_occurrence_limit := null;
    new.recurrence_occurrence_number := 1;
  elsif tg_op = 'INSERT' then
    if new.recurrence_anchor is null then
      new.recurrence_anchor := coalesce(
        new.due_date,
        (new.due_at at time zone app.user_timezone(new.user_id))::date
      );
    end if;
  elsif new.due_date is distinct from old.due_date
        or new.due_at is distinct from old.due_at
        or new.recurrence_rule is distinct from old.recurrence_rule
        or new.recurrence_interval is distinct from old.recurrence_interval
        or new.recurrence_weekdays is distinct from old.recurrence_weekdays then
    new.recurrence_anchor := coalesce(
      new.due_date,
      (new.due_at at time zone app.user_timezone(new.user_id))::date
    );
  end if;
  return new;
end; $$;
revoke all on function app.guard_task() from public;

create or replace function app.task_next_occurrence(
  p_rule text,
  p_due_date date,
  p_due_at timestamptz,
  p_anchor date,
  p_tz text,
  p_today date,
  p_interval integer,
  p_weekdays smallint[]
)
returns table (next_date date, next_at timestamptz)
language plpgsql stable set search_path = '' as $$
declare
  v_date date;
  v_time time;
  v_anchor date;
  v_anchor_week date;
  v_candidate_week date;
  v_months integer;
  v_interval integer := greatest(coalesce(p_interval, 1), 1);
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
  v_anchor_week := v_anchor - (extract(isodow from v_anchor)::integer - 1);

  loop
    v_guard := v_guard + 1;
    if v_guard > 30000 then
      raise exception 'RECURRENCE_RUNAWAY' using errcode = '22023';
    end if;
    if p_rule = 'DAILY' then
      v_date := v_date + v_interval;
    elsif p_rule = 'WEEKDAYS' then
      v_date := v_date + 1;
      while extract(isodow from v_date) > 5 loop
        v_date := v_date + 1;
      end loop;
    elsif p_rule = 'WEEKLY' and p_weekdays is not null then
      loop
        v_date := v_date + 1;
        v_candidate_week := v_date - (extract(isodow from v_date)::integer - 1);
        exit when extract(isodow from v_date)::smallint = any(p_weekdays)
          and ((v_candidate_week - v_anchor_week) / 7) % v_interval = 0;
      end loop;
    elsif p_rule = 'WEEKLY' then
      v_date := v_date + (7 * v_interval);
    elsif p_rule = 'BIWEEKLY' then
      v_date := v_date + 14;
    elsif p_rule = 'MONTHLY' then
      v_months := (extract(year from v_date)::int - extract(year from v_anchor)::int) * 12
                + (extract(month from v_date)::int - extract(month from v_anchor)::int)
                + v_interval;
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
revoke all on function app.task_next_occurrence(text, date, timestamptz, date, text, date, integer, smallint[])
  from public;

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

  if v_t.recurrence_rule is not null
     and (v_t.recurrence_occurrence_limit is null
       or v_t.recurrence_occurrence_number < v_t.recurrence_occurrence_limit) then
    v_tz := app.user_timezone(v_t.user_id);
    select * into v_next from app.task_next_occurrence(
      v_t.recurrence_rule, v_t.due_date, v_t.due_at,
      v_t.recurrence_anchor, v_tz, (now() at time zone v_tz)::date,
      v_t.recurrence_interval, v_t.recurrence_weekdays
    );
    if v_t.recurrence_until is null or v_next.next_date <= v_t.recurrence_until then
      insert into public.tasks (
        workspace_id, user_id, application_id, contact_id, interview_id,
        task_type, title, details, due_date, due_at, priority,
        recurrence_rule, recurrence_anchor, parent_task_id,
        recurrence_interval, recurrence_weekdays, recurrence_until,
        recurrence_occurrence_limit, recurrence_occurrence_number
      ) values (
        v_t.workspace_id, v_t.user_id, v_t.application_id, v_t.contact_id,
        v_t.interview_id, v_t.task_type, v_t.title, v_t.details,
        case when v_t.due_at is null then v_next.next_date end,
        v_next.next_at, v_t.priority, v_t.recurrence_rule,
        v_t.recurrence_anchor, v_t.id, v_t.recurrence_interval,
        v_t.recurrence_weekdays, v_t.recurrence_until,
        v_t.recurrence_occurrence_limit,
        v_t.recurrence_occurrence_number + 1
      )
      on conflict (parent_task_id) where parent_task_id is not null do nothing
      returning id into v_next_id;
    end if;
  end if;

  if v_t.task_type = 'FOLLOW_UP' and v_t.application_id is not null then
    insert into public.application_events (
      application_id, workspace_id, actor_id, event_type, payload
    ) values (
      v_t.application_id, v_t.workspace_id, v_uid, 'FOLLOW_UP',
      jsonb_build_object('task_id', v_t.id, 'title', v_t.title, 'completed', true)
    );
    update public.applications set last_activity_at = now(), updated_at = now()
      where id = v_t.application_id;
  end if;

  return jsonb_build_object('task_id', p_task_id, 'next_task_id', v_next_id);
end; $$;
revoke all on function public.rpc_complete_task(uuid) from public, anon;
grant execute on function public.rpc_complete_task(uuid) to authenticated, service_role;

grant insert (recurrence_interval, recurrence_weekdays, recurrence_until,
              recurrence_occurrence_limit) on public.tasks to authenticated;
grant update (recurrence_interval, recurrence_weekdays, recurrence_until,
              recurrence_occurrence_limit) on public.tasks to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Owner-scoped reusable task templates.
-- -----------------------------------------------------------------------------
create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.user_accounts(user_id) on delete restrict,
  title varchar(255) not null,
  details text null,
  task_type varchar(16) not null default 'TASK',
  priority varchar(16) not null default 'MEDIUM',
  due_offset_days integer null,
  recurrence_rule varchar(32) null,
  recurrence_interval smallint not null default 1,
  recurrence_weekdays smallint[] null,
  recurrence_until date null,
  recurrence_occurrence_limit integer null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_task_template_title check (char_length(btrim(title)) between 1 and 255),
  constraint chk_task_template_details check (coalesce(char_length(details), 0) <= 5000),
  constraint chk_task_template_type check (task_type in ('TASK', 'FOLLOW_UP', 'REMINDER')),
  constraint chk_task_template_priority check (priority in ('LOW', 'MEDIUM', 'HIGH')),
  constraint chk_task_template_due_offset check (due_offset_days is null or due_offset_days between 0 and 3650),
  constraint chk_task_template_recurrence check (
    recurrence_rule is null or recurrence_rule in ('DAILY', 'WEEKDAYS', 'WEEKLY', 'BIWEEKLY', 'MONTHLY')
  ),
  constraint chk_task_template_recurrence_due check (
    recurrence_rule is null or due_offset_days is not null
  ),
  constraint chk_task_template_reminder_due check (
    task_type <> 'REMINDER' or due_offset_days is not null
  ),
  constraint chk_task_template_interval check (recurrence_interval between 1 and 365),
  constraint chk_task_template_weekdays check (
    recurrence_weekdays is null or (
      recurrence_rule = 'WEEKLY'
      and cardinality(recurrence_weekdays) between 1 and 7
      and recurrence_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
    )
  ),
  constraint chk_task_template_end check (
    recurrence_until is null or recurrence_occurrence_limit is null
  ),
  constraint chk_task_template_limit check (
    recurrence_occurrence_limit is null
    or recurrence_occurrence_limit between 1 and 10000
  ),
  constraint chk_task_template_config check (
    (recurrence_rule is null and recurrence_interval = 1
      and recurrence_weekdays is null and recurrence_until is null
      and recurrence_occurrence_limit is null)
    or
    (recurrence_rule is not null
      and (recurrence_rule not in ('WEEKDAYS', 'BIWEEKLY') or recurrence_interval = 1)
      and (recurrence_rule = 'WEEKLY' or recurrence_weekdays is null))
  )
);

create index idx_task_templates_ws_owner_active
  on public.task_templates(workspace_id, user_id, is_active, updated_at desc);

create trigger trg_task_templates_updated
  before update on public.task_templates
  for each row execute function app.touch_updated_at();

create or replace function app.guard_task_template()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.title := btrim(new.title);
  new.recurrence_interval := coalesce(new.recurrence_interval, 1);
  if new.recurrence_rule is null then
    new.recurrence_interval := 1;
    new.recurrence_weekdays := null;
    new.recurrence_until := null;
    new.recurrence_occurrence_limit := null;
  end if;
  return new;
end; $$;
revoke all on function app.guard_task_template() from public;

create trigger trg_task_template_guard
  before insert or update on public.task_templates
  for each row execute function app.guard_task_template();

alter table public.task_templates enable row level security;

create policy task_templates_select on public.task_templates
  for select to authenticated
  using (public.can_access_owned_record(workspace_id, user_id));
create policy task_templates_insert on public.task_templates
  for insert to authenticated
  with check (
    (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id))
    or (public.is_workspace_manager(workspace_id) and app.user_is_member(workspace_id, user_id))
  );
create policy task_templates_update on public.task_templates
  for update to authenticated
  using (public.can_access_owned_record(workspace_id, user_id))
  with check (public.can_access_owned_record(workspace_id, user_id));

revoke all on public.task_templates from public, anon, authenticated;
grant select on public.task_templates to authenticated;
grant insert (
  workspace_id, user_id, title, details, task_type, priority,
  due_offset_days, recurrence_rule, recurrence_interval,
  recurrence_weekdays, recurrence_until, recurrence_occurrence_limit, is_active
) on public.task_templates to authenticated;
grant update (
  title, details, task_type, priority, due_offset_days, recurrence_rule,
  recurrence_interval, recurrence_weekdays, recurrence_until,
  recurrence_occurrence_limit, is_active
) on public.task_templates to authenticated;
grant all on public.task_templates to service_role;

create trigger trg_audit_task_templates
  after insert or update or delete on public.task_templates
  for each row execute function app.audit_cross_user_mutation('TASK_TEMPLATE');

create or replace function public.rpc_apply_task_template(
  p_template_id uuid,
  p_application_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_template public.task_templates;
  v_application public.applications;
  v_due date;
  v_task public.tasks;
begin
  if v_actor is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select * into v_template from public.task_templates
    where id = p_template_id for share;
  if not found then
    raise exception 'TASK_TEMPLATE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not v_template.is_active then
    raise exception 'TASK_TEMPLATE_INACTIVE' using errcode = '22023';
  end if;
  if not public.can_access_owned_record(v_template.workspace_id, v_template.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select * into v_application from public.applications
    where id = p_application_id for share;
  if not found then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.can_access_owned_record(v_application.workspace_id, v_application.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if v_application.workspace_id <> v_template.workspace_id
     or v_application.user_id <> v_template.user_id then
    raise exception 'TASK_TEMPLATE_OWNER_MISMATCH' using errcode = '42501';
  end if;
  if v_application.archived_at is not null then
    raise exception 'APPLICATION_ARCHIVED' using errcode = '22023';
  end if;

  if v_template.due_offset_days is not null then
    v_due := (now() at time zone app.user_timezone(v_application.user_id))::date
      + v_template.due_offset_days;
  end if;
  if v_template.recurrence_until is not null
     and v_due is not null
     and v_template.recurrence_until < v_due then
    raise exception 'RECURRENCE_ENDS_BEFORE_DUE' using errcode = '22023';
  end if;

  insert into public.tasks (
    workspace_id, user_id, application_id, task_type, title, details,
    due_date, priority, recurrence_rule, recurrence_interval,
    recurrence_weekdays, recurrence_until, recurrence_occurrence_limit
  ) values (
    v_application.workspace_id, v_application.user_id, v_application.id,
    v_template.task_type, v_template.title, v_template.details, v_due,
    v_template.priority, v_template.recurrence_rule,
    v_template.recurrence_interval, v_template.recurrence_weekdays,
    v_template.recurrence_until, v_template.recurrence_occurrence_limit
  ) returning * into v_task;

  return to_jsonb(v_task);
end;
$$;
revoke all on function public.rpc_apply_task_template(uuid, uuid) from public, anon;
grant execute on function public.rpc_apply_task_template(uuid, uuid)
  to authenticated, service_role;
