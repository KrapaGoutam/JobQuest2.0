-- Milestone 8 closeout corrections: truthful analytics, immutable goal history,
-- profile-aware weekly pacing, and the approved application Source field.

alter table public.applications
  add column if not exists source varchar(128) null;

alter table public.applications
  drop constraint if exists chk_app_source_length;
alter table public.applications
  add constraint chk_app_source_length
  check (source is null or char_length(btrim(source)) between 1 and 128);

-- Durable ownership follows Gate 03: removing an account must not erase goals.
alter table public.goals drop constraint if exists goals_user_id_fkey;
alter table public.goals drop constraint if exists fk_goals_user;
alter table public.goals
  add constraint fk_goals_user foreign key (user_id)
  references public.user_accounts(user_id) on delete restrict;

-- Goal rows are effective-dated history. Clients may read them, but all writes
-- go through the normalization/audit RPC below. In particular, direct DELETE
-- cannot destroy the history used by weekly pacing.
drop policy if exists goals_insert on public.goals;
drop policy if exists goals_update on public.goals;
drop policy if exists goals_delete on public.goals;
revoke insert, update, delete on table public.goals from authenticated;

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
  v_actor uuid := (select auth.uid());
  v_target uuid;
  v_period text := upper(coalesce(nullif(btrim(p_period_type), ''), 'WEEKLY'));
  v_timezone text := 'UTC';
  v_week_start smallint := 1;
  v_effective date;
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
  if v_period not in ('DAILY', 'WEEKLY', 'MONTHLY') then
    raise exception 'INVALID_PERIOD_TYPE' using errcode = '23514';
  end if;
  if p_target_applications < 0 or p_target_outreach < 0 then
    raise exception 'TARGETS_CANNOT_BE_NEGATIVE' using errcode = '23514';
  end if;

  select coalesce(p.timezone, 'UTC'), coalesce(p.week_start, 1)
    into v_timezone, v_week_start
    from public.profiles p where p.user_id = v_target;

  v_effective := coalesce(p_effective_date, (now() at time zone v_timezone)::date);
  if v_period = 'WEEKLY' then
    v_effective := v_effective - case
      when v_week_start = 0 then extract(dow from v_effective)::integer
      else extract(isodow from v_effective)::integer - 1
    end;
  elsif v_period = 'MONTHLY' then
    v_effective := date_trunc('month', v_effective)::date;
  end if;

  insert into public.goals (
    workspace_id, user_id, period_type, target_applications,
    target_outreach, effective_date, updated_at
  ) values (
    p_workspace_id, v_target, v_period, p_target_applications,
    p_target_outreach, v_effective, now()
  )
  on conflict (workspace_id, user_id, period_type, effective_date)
  do update set
    target_applications = excluded.target_applications,
    target_outreach = excluded.target_outreach,
    updated_at = now()
  returning * into v_result;

  return to_jsonb(v_result);
end;
$$;

revoke all on function public.rpc_upsert_goal_for_user(uuid, text, integer, integer, date, uuid) from public, anon;
grant execute on function public.rpc_upsert_goal_for_user(uuid, text, integer, integer, date, uuid) to authenticated;

-- Keep the original self-service RPC compatible while routing it through the
-- corrected period-normalization implementation.
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

revoke all on function public.rpc_upsert_goal(uuid, text, integer, integer, date) from public, anon;
grant execute on function public.rpc_upsert_goal(uuid, text, integer, integer, date) to authenticated;

-- One canonical event interpretation shared by overview and stage-timing.
-- It uses only exact recorded milestones; it never infers skipped stages from a
-- later current position. MIN gives first-qualifying-event semantics and makes
-- duplicate/reopened transitions deterministic.
create or replace function app.analytics_milestones(p_application_id uuid)
returns table (
  applied_event_at timestamptz,
  response_at timestamptz,
  recruiter_screen_at timestamptz,
  interview_at timestamptz,
  offer_at timestamptz,
  rejection_at timestamptz,
  closed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with event_marks as (
    select
      e.created_at,
      e.event_type,
      e.payload,
      case
        when e.event_type = 'APPLIED'
          or (e.event_type = 'CREATED' and e.payload->>'stage' = 'APPLIED')
          or (e.event_type = 'STAGE_CHANGED' and e.payload->>'to_stage' = 'APPLIED')
        then true else false
      end as is_applied,
      case
        when e.event_type = 'STAGE_CHANGED'
             and e.payload->>'to_stage' in ('ASSESSMENT', 'RECRUITER_SCREEN', 'INTERVIEW', 'FINAL_INTERVIEW', 'OFFER')
          or e.event_type = 'INTERVIEW_SCHEDULED'
          or (e.event_type = 'OUTCOME_CHANGED'
              and e.payload->>'outcome' in ('ACCEPTED', 'REJECTED', 'POSITION_CLOSED'))
        then true else false
      end as is_response
    from public.application_events e
    where e.application_id = p_application_id
  ), anchored as (
    select min(created_at) filter (where is_applied) as applied_at
    from event_marks
  )
  select
    a.applied_at,
    min(e.created_at) filter (where e.is_response and e.created_at >= a.applied_at),
    min(e.created_at) filter (
      where e.event_type = 'STAGE_CHANGED'
        and e.payload->>'to_stage' = 'RECRUITER_SCREEN'
        and e.created_at >= a.applied_at
    ),
    min(e.created_at) filter (
      where e.event_type = 'STAGE_CHANGED'
        and e.payload->>'to_stage' in ('INTERVIEW', 'FINAL_INTERVIEW')
        and e.created_at >= a.applied_at
    ),
    min(e.created_at) filter (
      where ((e.event_type = 'STAGE_CHANGED' and e.payload->>'to_stage' = 'OFFER')
          or (e.event_type = 'OUTCOME_CHANGED' and e.payload->>'outcome' = 'ACCEPTED'))
        and e.created_at >= a.applied_at
    ),
    min(e.created_at) filter (
      where e.event_type = 'OUTCOME_CHANGED'
        and e.payload->>'outcome' = 'REJECTED'
        and e.created_at >= a.applied_at
    ),
    min(e.created_at) filter (
      where e.event_type = 'OUTCOME_CHANGED'
        and e.created_at >= a.applied_at
    )
  from anchored a
  left join event_marks e on true
  group by a.applied_at;
$$;

revoke all on function app.analytics_milestones(uuid) from public, anon, authenticated;

create or replace function public.rpc_get_analytics_overview(
  p_workspace_id uuid,
  p_start_date timestamptz default null,
  p_end_date timestamptz default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_manager boolean;
  v_target uuid;
  v_start timestamptz := coalesce(p_start_date, now() - interval '90 days');
  v_end timestamptz := coalesce(p_end_date, now());
  v_timezone text := 'UTC';
  v_week_start smallint := 1;
  v_current_week date;
  v_total integer := 0;
  v_responses integer := 0;
  v_interviews integer := 0;
  v_offers integer := 0;
  v_accepted integer := 0;
  v_response_samples integer := 0;
  v_median_response numeric := null;
  v_pipeline jsonb := '[]'::jsonb;
  v_funnel jsonb := '[]'::jsonb;
  v_sources jsonb := '[]'::jsonb;
  v_resumes jsonb := '[]'::jsonb;
  v_outcomes jsonb := '[]'::jsonb;
  v_pacing jsonb := '[]'::jsonb;
  v_goal jsonb := null;
begin
  if v_caller is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'NOT_A_WORKSPACE_MEMBER' using errcode = '42501';
  end if;
  if v_start > v_end then
    raise exception 'INVALID_DATE_RANGE' using errcode = '22007';
  end if;

  v_manager := public.is_workspace_manager(p_workspace_id);
  if v_manager then
    v_target := p_user_id;
    if v_target is not null and not app.user_is_member(p_workspace_id, v_target) then
      raise exception 'TARGET_NOT_A_WORKSPACE_MEMBER' using errcode = '42501';
    end if;
  else
    v_target := v_caller;
  end if;

  select coalesce(p.timezone, 'UTC'), coalesce(p.week_start, 1)
    into v_timezone, v_week_start
    from public.profiles p where p.user_id = coalesce(v_target, v_caller);
  v_current_week := (now() at time zone v_timezone)::date - case
    when v_week_start = 0 then extract(dow from (now() at time zone v_timezone)::date)::integer
    else extract(isodow from (now() at time zone v_timezone)::date)::integer - 1
  end;

  with scoped as (
    select a.*, m.*
    from public.applications a
    cross join lateral app.analytics_milestones(a.id) m
    where a.workspace_id = p_workspace_id
      and (v_target is null or a.user_id = v_target)
      and a.applied_at >= v_start and a.applied_at <= v_end
  )
  select count(*),
         count(*) filter (where response_at is not null),
         count(*) filter (where interview_at is not null),
         count(*) filter (where offer_at is not null),
         count(*) filter (where outcome = 'ACCEPTED'),
         count(*) filter (where response_at is not null),
         round((percentile_cont(0.5) within group (
           order by extract(epoch from (response_at - applied_event_at)) / 86400.0
         ) filter (where response_at >= applied_event_at))::numeric, 2)
    into v_total, v_responses, v_interviews, v_offers, v_accepted,
         v_response_samples, v_median_response
  from scoped;

  select coalesce(jsonb_agg(jsonb_build_object('stage', q.stage, 'count', q.cnt)
           order by array_position(array['SAVED','PREPARING','APPLIED','ASSESSMENT','RECRUITER_SCREEN','INTERVIEW','FINAL_INTERVIEW','OFFER'], q.stage)), '[]'::jsonb)
    into v_pipeline
  from (
    select a.stage, count(*) as cnt
    from public.applications a
    where a.workspace_id = p_workspace_id
      and (v_target is null or a.user_id = v_target)
      and a.status = 'OPEN' and a.archived_at is null
    group by a.stage
  ) q;

  with stage_keys(stage_name, ord) as (
    values ('APPLIED',1),('ASSESSMENT',2),('RECRUITER_SCREEN',3),
           ('INTERVIEW',4),('FINAL_INTERVIEW',5),('OFFER',6),('ACCEPTED',7)
  ), scoped as (
    select a.* from public.applications a
    where a.workspace_id = p_workspace_id
      and (v_target is null or a.user_id = v_target)
      and a.applied_at >= v_start and a.applied_at <= v_end
  ), counts as (
    select sk.stage_name, sk.ord, count(distinct a.id) as cnt
    from stage_keys sk
    left join scoped a on
      (sk.stage_name = 'ACCEPTED' and a.outcome = 'ACCEPTED')
      or (sk.stage_name <> 'ACCEPTED' and (
        a.stage = sk.stage_name
        or exists (
          select 1 from public.application_events e
          where e.application_id = a.id
            and ((e.event_type = 'CREATED' and e.payload->>'stage' = sk.stage_name)
              or (e.event_type = 'STAGE_CHANGED' and e.payload->>'to_stage' = sk.stage_name)
              or (sk.stage_name = 'APPLIED' and e.event_type = 'APPLIED'))
        )
      ))
    group by sk.stage_name, sk.ord
  )
  select jsonb_agg(jsonb_build_object(
           'stage', stage_name, 'count', cnt,
           'pct', case when v_total = 0 then 0 else round(cnt::numeric * 100 / v_total, 1) end
         ) order by ord)
    into v_funnel from counts;

  with scoped as (
    select a.*, m.response_at, m.interview_at
    from public.applications a
    cross join lateral app.analytics_milestones(a.id) m
    where a.workspace_id = p_workspace_id
      and (v_target is null or a.user_id = v_target)
      and a.applied_at >= v_start and a.applied_at <= v_end
  ), grouped as (
    select coalesce(nullif(btrim(source), ''), 'Direct / Other') as source,
           count(*) as apps, count(*) filter (where response_at is not null) as responses,
           count(*) filter (where interview_at is not null) as interviews
    from scoped group by 1
  )
  select coalesce(jsonb_agg(to_jsonb(grouped) order by apps desc, source), '[]'::jsonb)
    into v_sources from grouped;

  with scoped as (
    select a.id, m.response_at, m.interview_at
    from public.applications a
    cross join lateral app.analytics_milestones(a.id) m
    where a.workspace_id = p_workspace_id
      and (v_target is null or a.user_id = v_target)
      and a.applied_at >= v_start and a.applied_at <= v_end
  ), grouped as (
    select r.id as resume_id,
           concat(r.name, case when r.version_label is null then '' else ' (' || r.version_label || ')' end) as title,
           count(distinct s.id) as apps,
           count(distinct s.id) filter (where s.response_at is not null) as responses,
           count(distinct s.id) filter (where s.interview_at is not null) as interviews
    from scoped s
    join public.application_documents d on d.application_id = s.id and d.document_type = 'RESUME'
    join public.resumes r on r.id = d.resume_id
    group by r.id, r.name, r.version_label
  )
  select coalesce(jsonb_agg(to_jsonb(grouped) order by apps desc, title), '[]'::jsonb)
    into v_resumes from grouped;

  with grouped as (
    select a.outcome, count(*) as count,
           string_agg(distinct a.stage, ', ' order by a.stage) as stages_detail
    from public.applications a
    where a.workspace_id = p_workspace_id
      and (v_target is null or a.user_id = v_target)
      and a.status = 'CLOSED' and a.outcome is not null
      and a.applied_at >= v_start and a.applied_at <= v_end
    group by a.outcome
  )
  select coalesce(jsonb_agg(to_jsonb(grouped) order by count desc, outcome), '[]'::jsonb)
    into v_outcomes from grouped;

  with weeks as (
    select generate_series(v_current_week - 77, v_current_week, interval '7 days')::date as week_start
  ), app_activity as (
    select ((a.applied_at at time zone v_timezone)::date - case
              when v_week_start = 0 then extract(dow from (a.applied_at at time zone v_timezone)::date)::integer
              else extract(isodow from (a.applied_at at time zone v_timezone)::date)::integer - 1 end) as week_start,
           count(*) as applied
    from public.applications a
    where a.workspace_id = p_workspace_id and (v_target is null or a.user_id = v_target)
      and a.applied_at >= (v_current_week - 77)::timestamp at time zone v_timezone
    group by 1
  ), response_activity as (
    select ((m.response_at at time zone v_timezone)::date - case
              when v_week_start = 0 then extract(dow from (m.response_at at time zone v_timezone)::date)::integer
              else extract(isodow from (m.response_at at time zone v_timezone)::date)::integer - 1 end) as week_start,
           count(*) as responses
    from public.applications a cross join lateral app.analytics_milestones(a.id) m
    where a.workspace_id = p_workspace_id and (v_target is null or a.user_id = v_target)
      and m.response_at is not null
    group by 1
  ), interview_activity as (
    select ((m.interview_at at time zone v_timezone)::date - case
              when v_week_start = 0 then extract(dow from (m.interview_at at time zone v_timezone)::date)::integer
              else extract(isodow from (m.interview_at at time zone v_timezone)::date)::integer - 1 end) as week_start,
           count(*) as interviews
    from public.applications a cross join lateral app.analytics_milestones(a.id) m
    where a.workspace_id = p_workspace_id and (v_target is null or a.user_id = v_target)
      and m.interview_at is not null
    group by 1
  ), outreach_activity as (
    select ((c.interaction_date at time zone v_timezone)::date - case
              when v_week_start = 0 then extract(dow from (c.interaction_date at time zone v_timezone)::date)::integer
              else extract(isodow from (c.interaction_date at time zone v_timezone)::date)::integer - 1 end) as week_start,
           count(*) as outreach
    from public.contact_interactions c
    where c.workspace_id = p_workspace_id and (v_target is null or c.user_id = v_target)
      and c.interaction_type <> 'NOTE'
    group by 1
  )
  select jsonb_agg(jsonb_build_object(
           'week_start', w.week_start,
           'week_label', to_char(w.week_start, 'Mon DD'),
           'applied', coalesce(aa.applied, 0),
           'responses', coalesce(ra.responses, 0),
           'interviews', coalesce(ia.interviews, 0),
           'outreach', coalesce(oa.outreach, 0),
           'target', case when v_target is not null then coalesce((
             select g.target_applications from public.goals g
             where g.workspace_id = p_workspace_id and g.user_id = v_target
               and g.period_type = 'WEEKLY' and g.effective_date <= w.week_start
             order by g.effective_date desc, g.created_at desc limit 1
           ), 15) else coalesce((
             select sum(coalesce((
               select g.target_applications from public.goals g
               where g.workspace_id = p_workspace_id and g.user_id = wm.user_id
                 and g.period_type = 'WEEKLY' and g.effective_date <= w.week_start
               order by g.effective_date desc, g.created_at desc limit 1
             ), 15)) from public.workspace_members wm where wm.workspace_id = p_workspace_id
           ), 0) end
         ) order by w.week_start)
    into v_pacing
  from weeks w
  left join app_activity aa using (week_start)
  left join response_activity ra using (week_start)
  left join interview_activity ia using (week_start)
  left join outreach_activity oa using (week_start);

  if v_target is not null then
    select to_jsonb(g) into v_goal
    from public.goals g
    where g.workspace_id = p_workspace_id and g.user_id = v_target
      and g.period_type = 'WEEKLY' and g.effective_date <= v_current_week
    order by g.effective_date desc, g.created_at desc limit 1;
    if v_goal is null then
      v_goal := jsonb_build_object(
        'id', null, 'period_type', 'WEEKLY', 'target_applications', 15,
        'target_outreach', 5, 'effective_date', v_current_week
      );
    end if;
  end if;

  return jsonb_build_object(
    'total_applications', v_total,
    'response_count', v_responses,
    'interview_count', v_interviews,
    'offer_count', v_offers,
    'accepted_count', v_accepted,
    'median_response_days', v_median_response,
    'response_samples', v_response_samples,
    'weekly_pacing', v_pacing,
    'current_pipeline', v_pipeline,
    'historical_funnel', v_funnel,
    'sources_breakdown', v_sources,
    'resumes_breakdown', v_resumes,
    'outcomes_breakdown', v_outcomes,
    'active_goal', v_goal,
    'date_range_semantics', jsonb_build_object(
      'range_scoped', jsonb_build_array('summary','historical_funnel','sources','resumes','outcomes','stage_timing','follow_up_impact'),
      'current_state', jsonb_build_array('current_pipeline','aging','stuck_applications'),
      'fixed_window', jsonb_build_array('weekly_pacing')
    )
  );
end;
$$;

create or replace function public.rpc_get_stage_timing(
  p_workspace_id uuid,
  p_start_date timestamptz default null,
  p_end_date timestamptz default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_target uuid;
  v_start timestamptz := coalesce(p_start_date, now() - interval '90 days');
  v_end timestamptz := coalesce(p_end_date, now());
  v_transitions jsonb := '[]'::jsonb;
  v_stuck jsonb := '[]'::jsonb;
  v_followup jsonb := '{}'::jsonb;
begin
  if v_caller is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'NOT_A_WORKSPACE_MEMBER' using errcode = '42501';
  end if;
  if v_start > v_end then
    raise exception 'INVALID_DATE_RANGE' using errcode = '22007';
  end if;
  if public.is_workspace_manager(p_workspace_id) then
    v_target := p_user_id;
    if v_target is not null and not app.user_is_member(p_workspace_id, v_target) then
      raise exception 'TARGET_NOT_A_WORKSPACE_MEMBER' using errcode = '42501';
    end if;
  else
    v_target := v_caller;
  end if;

  with scoped as (
    select a.id, a.applied_at, m.*
    from public.applications a cross join lateral app.analytics_milestones(a.id) m
    where a.workspace_id = p_workspace_id and (v_target is null or a.user_id = v_target)
      and a.applied_at >= v_start and a.applied_at <= v_end
  ), samples as (
    select 'Applied to first response'::text as transition,
           extract(epoch from (response_at - applied_event_at))/86400.0 as days
      from scoped where response_at >= applied_event_at
    union all
    select 'Applied to Recruiter Screen', extract(epoch from (recruiter_screen_at - applied_event_at))/86400.0
      from scoped where recruiter_screen_at >= applied_event_at
    union all
    select 'Applied to Interview', extract(epoch from (interview_at - applied_event_at))/86400.0
      from scoped where interview_at >= applied_event_at
    union all
    select 'Interview to Offer', extract(epoch from (offer_at - interview_at))/86400.0
      from scoped where offer_at >= interview_at
    union all
    select 'Applied to Rejection', extract(epoch from (rejection_at - applied_event_at))/86400.0
      from scoped where rejection_at >= applied_event_at
    union all
    select 'Full lifecycle (closed)', extract(epoch from (closed_at - applied_event_at))/86400.0
      from scoped where closed_at >= applied_event_at
  ), labels(transition, ord) as (
    values ('Applied to first response',1),('Applied to Recruiter Screen',2),
           ('Applied to Interview',3),('Interview to Offer',4),
           ('Applied to Rejection',5),('Full lifecycle (closed)',6)
  ), aggregated as (
    select l.transition, l.ord,
           round(avg(s.days)::numeric, 2) as average_days,
           round((percentile_cont(0.5) within group (order by s.days))::numeric, 2) as median_days,
           round(min(s.days)::numeric, 2) as min_days,
           round(max(s.days)::numeric, 2) as max_days,
           count(s.days)::integer as sample_size
    from labels l left join samples s using (transition)
    group by l.transition, l.ord
  )
  select jsonb_agg(to_jsonb(aggregated) - 'ord' order by ord)
    into v_transitions from aggregated;

  with stage_entry as (
    select a.*,
           coalesce((
             select max(e.created_at) from public.application_events e
             where e.application_id = a.id
               and ((e.event_type = 'CREATED' and e.payload->>'stage' = a.stage)
                 or (e.event_type = 'STAGE_CHANGED' and e.payload->>'to_stage' = a.stage))
           ), a.created_at) as entered_at
    from public.applications a
    where a.workspace_id = p_workspace_id and (v_target is null or a.user_id = v_target)
      and a.status = 'OPEN' and a.archived_at is null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'company_name', company_name, 'role_title', role_title,
           'stage', stage,
           'days_in_stage', greatest(0, floor(extract(epoch from (now() - entered_at))/86400))
         ) order by entered_at), '[]'::jsonb)
    into v_stuck
  from stage_entry where entered_at <= now() - interval '14 days';

  with scoped as (
    select a.id, m.applied_event_at, m.response_at,
           exists (
             select 1 from public.tasks t
             where t.application_id = a.id and t.task_type = 'FOLLOW_UP'
               and t.status = 'COMPLETED' and t.completed_at >= m.applied_event_at
               and t.completed_at <= m.applied_event_at + interval '14 days'
           ) as had_followup,
           (select count(*) from public.tasks t
             where t.application_id = a.id and t.task_type = 'FOLLOW_UP'
               and t.status = 'COMPLETED' and t.completed_at >= m.applied_event_at
               and t.completed_at <= m.applied_event_at + interval '14 days') as followup_count
    from public.applications a cross join lateral app.analytics_milestones(a.id) m
    where a.workspace_id = p_workspace_id and (v_target is null or a.user_id = v_target)
      and a.applied_at >= v_start and a.applied_at <= v_end
      and m.applied_event_at is not null
  )
  select jsonb_build_object(
    'with_follow_up', jsonb_build_object(
      'count', count(*) filter (where had_followup),
      'responses', count(*) filter (where had_followup and response_at is not null)
    ),
    'without_follow_up', jsonb_build_object(
      'count', count(*) filter (where not had_followup),
      'responses', count(*) filter (where not had_followup and response_at is not null)
    ),
    'total_follow_ups', coalesce(sum(followup_count), 0)
  ) into v_followup from scoped;

  return jsonb_build_object(
    'transitions', v_transitions,
    'stuck_applications', v_stuck,
    'follow_up_impact', v_followup
  );
end;
$$;

revoke all on function public.rpc_get_analytics_overview(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.rpc_get_analytics_overview(uuid, timestamptz, timestamptz, uuid) to authenticated;
revoke all on function public.rpc_get_stage_timing(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.rpc_get_stage_timing(uuid, timestamptz, timestamptz, uuid) to authenticated;
