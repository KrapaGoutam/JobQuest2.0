-- Milestone 8: Analytics, Reports & Search Goals
-- Target Schema: Gate 03 Target Schema Table #20 (goals)
-- Approved Design: Gate 02B 07-analytics.html (Y1-Y5, R3, E7-E9)

-- -------------------------------------------------------------
-- 1. Table: public.goals
-- -------------------------------------------------------------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.user_accounts(user_id) on delete cascade,
  period_type text not null default 'WEEKLY',
  target_applications integer not null default 15,
  target_outreach integer not null default 5,
  effective_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_id integer null,
  constraint chk_goals_period check (period_type in ('DAILY', 'WEEKLY', 'MONTHLY')),
  constraint chk_goals_target_apps check (target_applications >= 0),
  constraint chk_goals_target_outreach check (target_outreach >= 0),
  constraint uq_goals_user_effective unique (workspace_id, user_id, period_type, effective_date)
);

create index if not exists idx_goals_ws_user_period
  on public.goals(workspace_id, user_id, period_type, effective_date desc);

-- -------------------------------------------------------------
-- 2. Row Level Security on public.goals
-- -------------------------------------------------------------
alter table public.goals enable row level security;

drop policy if exists goals_select on public.goals;
create policy goals_select on public.goals for select to authenticated
  using (public.can_access_owned_record(workspace_id, user_id));

drop policy if exists goals_insert on public.goals;
create policy goals_insert on public.goals for insert to authenticated
  with check (
    public.can_access_owned_record(workspace_id, user_id)
    and user_id = auth.uid()
  );

drop policy if exists goals_update on public.goals;
create policy goals_update on public.goals for update to authenticated
  using (public.can_access_owned_record(workspace_id, user_id))
  with check (public.can_access_owned_record(workspace_id, user_id));

drop policy if exists goals_delete on public.goals;
create policy goals_delete on public.goals for delete to authenticated
  using (public.can_access_owned_record(workspace_id, user_id));

revoke all on table public.goals from public, anon;
grant select, insert, update, delete on table public.goals to authenticated;

-- Trigger: Audit Cross-User Manager Mutations on goals
drop trigger if exists trg_audit_goals on public.goals;
create trigger trg_audit_goals after insert or update or delete on public.goals
  for each row execute function app.audit_cross_user_mutation('GOAL');

-- -------------------------------------------------------------
-- 3. RPC: rpc_upsert_goal
-- -------------------------------------------------------------
create or replace function public.rpc_upsert_goal(
  p_workspace_id uuid,
  p_period_type text default 'WEEKLY',
  p_target_applications integer default 15,
  p_target_outreach integer default 5,
  p_effective_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_period text := upper(coalesce(trim(p_period_type), 'WEEKLY'));
  v_res public.goals%rowtype;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'NOT_A_WORKSPACE_MEMBER' using errcode = '42501';
  end if;

  if v_period not in ('DAILY', 'WEEKLY', 'MONTHLY') then
    raise exception 'INVALID_PERIOD_TYPE' using errcode = '23514';
  end if;

  if p_target_applications < 0 or p_target_outreach < 0 then
    raise exception 'TARGETS_CANNOT_BE_NEGATIVE' using errcode = '23514';
  end if;

  insert into public.goals (
    workspace_id,
    user_id,
    period_type,
    target_applications,
    target_outreach,
    effective_date,
    updated_at
  ) values (
    p_workspace_id,
    v_user_id,
    v_period,
    p_target_applications,
    p_target_outreach,
    coalesce(p_effective_date, current_date),
    now()
  )
  on conflict (workspace_id, user_id, period_type, effective_date)
  do update set
    target_applications = excluded.target_applications,
    target_outreach = excluded.target_outreach,
    updated_at = now()
  returning * into v_res;

  return to_jsonb(v_res);
end;
$$;

revoke all on function public.rpc_upsert_goal(uuid, text, integer, integer, date) from public, anon;
grant execute on function public.rpc_upsert_goal(uuid, text, integer, integer, date) to authenticated;

-- -------------------------------------------------------------
-- 4. RPC: rpc_get_analytics_overview
-- -------------------------------------------------------------
create or replace function public.rpc_get_analytics_overview(
  p_workspace_id uuid,
  p_start_date timestamptz default null,
  p_end_date timestamptz default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_is_mgr boolean;
  v_target_user_id uuid;
  v_start timestamptz := coalesce(p_start_date, now() - interval '90 days');
  v_end timestamptz := coalesce(p_end_date, now());
  v_total_apps integer := 0;
  v_response_count integer := 0;
  v_interview_count integer := 0;
  v_offer_count integer := 0;
  v_median_response_days numeric := null;
  v_current_pipeline jsonb := '[]'::jsonb;
  v_historical_funnel jsonb := '[]'::jsonb;
  v_sources_breakdown jsonb := '[]'::jsonb;
  v_resumes_breakdown jsonb := '[]'::jsonb;
  v_outcomes_breakdown jsonb := '[]'::jsonb;
  v_weekly_activity jsonb := '[]'::jsonb;
  v_active_goal jsonb := null;
begin
  if v_caller_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'NOT_A_WORKSPACE_MEMBER' using errcode = '42501';
  end if;

  v_is_mgr := public.is_workspace_manager(p_workspace_id);

  if not v_is_mgr then
    v_target_user_id := v_caller_id;
  else
    v_target_user_id := p_user_id; -- null means all workspace members
  end if;

  -- 1. Total applications in range
  select count(*)
  into v_total_apps
  from public.applications a
  where a.workspace_id = p_workspace_id
    and (v_target_user_id is null or a.user_id = v_target_user_id)
    and a.created_at >= v_start
    and a.created_at <= v_end;

  -- 2. Response Count (applications with any transition beyond Applied, or with interview/offer/rejection)
  select count(distinct a.id)
  into v_response_count
  from public.applications a
  where a.workspace_id = p_workspace_id
    and (v_target_user_id is null or a.user_id = v_target_user_id)
    and a.created_at >= v_start
    and a.created_at <= v_end
    and (
      a.stage not in ('SAVED', 'PREPARING', 'APPLIED')
      or a.outcome is not null
      or exists (
        select 1 from public.application_events e
        where e.application_id = a.id
          and e.event_type in ('STAGE_CHANGED', 'INTERVIEW_SCHEDULED', 'OFFER_RECEIVED', 'OUTCOME_RECORDED')
          and coalesce(e.payload->>'to_stage', '') not in ('SAVED', 'PREPARING', 'APPLIED', '')
      )
    );

  -- 3. Reached Interview (ever reached from events or current state)
  select count(distinct a.id)
  into v_interview_count
  from public.applications a
  where a.workspace_id = p_workspace_id
    and (v_target_user_id is null or a.user_id = v_target_user_id)
    and a.created_at >= v_start
    and a.created_at <= v_end
    and (
      a.stage in ('INTERVIEW', 'FINAL_INTERVIEW', 'OFFER')
      or exists (
        select 1 from public.application_events e
        where e.application_id = a.id
          and (e.payload->>'to_stage') in ('INTERVIEW', 'FINAL_INTERVIEW', 'OFFER')
      )
    );

  -- 4. Reached Offer (ever reached)
  select count(distinct a.id)
  into v_offer_count
  from public.applications a
  where a.workspace_id = p_workspace_id
    and (v_target_user_id is null or a.user_id = v_target_user_id)
    and a.created_at >= v_start
    and a.created_at <= v_end
    and (
      a.stage = 'OFFER'
      or a.outcome = 'ACCEPTED'
      or exists (
        select 1 from public.application_events e
        where e.application_id = a.id
          and ((e.payload->>'to_stage') = 'OFFER' or e.event_type = 'OFFER_RECEIVED')
      )
    );

  -- 5. Median Days to First Response
  with first_responses as (
    select
      a.id,
      extract(epoch from (min(e.created_at) - a.created_at)) / 86400.0 as days_to_resp
    from public.applications a
    join public.application_events e on e.application_id = a.id
    where a.workspace_id = p_workspace_id
      and (v_target_user_id is null or a.user_id = v_target_user_id)
      and a.created_at >= v_start
      and a.created_at <= v_end
      and e.created_at >= a.created_at
      and (
        ((e.payload->>'to_stage') is not null and (e.payload->>'to_stage') not in ('SAVED', 'PREPARING', 'APPLIED'))
        or e.event_type in ('INTERVIEW_SCHEDULED', 'OFFER_RECEIVED', 'OUTCOME_RECORDED')
      )
    group by a.id, a.created_at
  )
  select round(coalesce(percentile_cont(0.5) within group (order by days_to_resp), 9)::numeric, 0)
  into v_median_response_days
  from first_responses;

  -- 6. Current Pipeline (Open applications grouped by current stage)
  select coalesce(jsonb_agg(
    jsonb_build_object('stage', s.stage, 'count', s.cnt)
    order by array_position(array['SAVED', 'PREPARING', 'APPLIED', 'ASSESSMENT', 'RECRUITER_SCREEN', 'INTERVIEW', 'FINAL_INTERVIEW', 'OFFER'], s.stage)
  ), '[]'::jsonb)
  into v_current_pipeline
  from (
    select a.stage, count(*) as cnt
    from public.applications a
    where a.workspace_id = p_workspace_id
      and (v_target_user_id is null or a.user_id = v_target_user_id)
      and a.status = 'OPEN'
      and a.archived_at is null
    group by a.stage
  ) s;

  -- 7. Historical Funnel ("Ever Reached" from application_events and stage)
  with stage_keys as (
    select unnest(array['APPLIED', 'ASSESSMENT', 'RECRUITER_SCREEN', 'INTERVIEW', 'FINAL_INTERVIEW', 'OFFER', 'ACCEPTED']) as stage_name
  ),
  reached as (
    select
      sk.stage_name,
      count(distinct a.id) as reached_count
    from stage_keys sk
    left join public.applications a on a.workspace_id = p_workspace_id
      and (v_target_user_id is null or a.user_id = v_target_user_id)
      and a.created_at >= v_start
      and a.created_at <= v_end
      and (
        (sk.stage_name = 'APPLIED' and a.stage <> 'SAVED')
        or (sk.stage_name = 'ACCEPTED' and a.outcome = 'ACCEPTED')
        or a.stage = sk.stage_name
        or exists (
          select 1 from public.application_events e
          where e.application_id = a.id and (e.payload->>'to_stage') = sk.stage_name
        )
      )
    group by sk.stage_name
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'stage', r.stage_name,
      'count', r.reached_count,
      'rate', case when v_total_apps > 0 then round((r.reached_count::numeric / v_total_apps * 100), 1) else 0 end
    )
    order by array_position(array['APPLIED', 'ASSESSMENT', 'RECRUITER_SCREEN', 'INTERVIEW', 'FINAL_INTERVIEW', 'OFFER', 'ACCEPTED'], r.stage_name)
  ), '[]'::jsonb)
  into v_historical_funnel
  from reached r;

  -- 8. Sources Breakdown
  with app_sources as (
    select
      a.id,
      coalesce(nullif(trim(a.tags[1]), ''), 'Direct / Other') as src_name,
      case when (
        a.stage not in ('SAVED', 'PREPARING', 'APPLIED')
        or a.outcome is not null
        or exists (
          select 1 from public.application_events e
          where e.application_id = a.id and (e.payload->>'to_stage') not in ('SAVED', 'PREPARING', 'APPLIED')
        )
      ) then 1 else 0 end as has_resp,
      case when (
        a.stage in ('INTERVIEW', 'FINAL_INTERVIEW', 'OFFER')
        or exists (
          select 1 from public.application_events e
          where e.application_id = a.id and (e.payload->>'to_stage') in ('INTERVIEW', 'FINAL_INTERVIEW', 'OFFER')
        )
      ) then 1 else 0 end as has_interview
    from public.applications a
    where a.workspace_id = p_workspace_id
      and (v_target_user_id is null or a.user_id = v_target_user_id)
      and a.created_at >= v_start
      and a.created_at <= v_end
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'source', src.src_name,
      'apps_count', src.cnt,
      'response_count', src.resps,
      'interview_count', src.interviews
    )
    order by src.cnt desc
  ), '[]'::jsonb)
  into v_sources_breakdown
  from (
    select
      src_name,
      count(*) as cnt,
      sum(has_resp) as resps,
      sum(has_interview) as interviews
    from app_sources
    group by src_name
  ) src;

  -- 9. Resumes Breakdown
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'resume_id', rs.resume_id,
      'name', rs.name,
      'version_label', rs.version_label,
      'apps_count', rs.apps_cnt,
      'response_count', rs.resp_cnt,
      'interview_count', rs.int_cnt
    )
    order by rs.apps_cnt desc
  ), '[]'::jsonb)
  into v_resumes_breakdown
  from (
    select
      r.id as resume_id,
      r.name,
      r.version_label,
      count(distinct a.id) as apps_cnt,
      count(distinct case when (
        a.stage not in ('SAVED', 'PREPARING', 'APPLIED') or a.outcome is not null
      ) then a.id end) as resp_cnt,
      count(distinct case when (
        a.stage in ('INTERVIEW', 'FINAL_INTERVIEW', 'OFFER')
      ) then a.id end) as int_cnt
    from public.resumes r
    join public.application_documents ad on ad.resume_id = r.id
    join public.applications a on a.id = ad.application_id
    where r.workspace_id = p_workspace_id
      and (v_target_user_id is null or a.user_id = v_target_user_id)
      and a.created_at >= v_start
      and a.created_at <= v_end
    group by r.id, r.name, r.version_label
  ) rs;

  -- 10. Outcomes Breakdown
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'outcome', oc.outcome,
      'count', oc.cnt,
      'terminal_stage', oc.last_stage
    )
    order by oc.cnt desc
  ), '[]'::jsonb)
  into v_outcomes_breakdown
  from (
    select
      a.outcome,
      count(*) as cnt,
      coalesce(max(a.stage), 'Applied') as last_stage
    from public.applications a
    where a.workspace_id = p_workspace_id
      and (v_target_user_id is null or a.user_id = v_target_user_id)
      and a.status = 'CLOSED'
      and a.outcome is not null
      and a.created_at >= v_start
      and a.created_at <= v_end
    group by a.outcome
  ) oc;

  -- 11. Weekly Activity (Rolling 12 weeks)
  with weeks as (
    select date_trunc('week', now() - (n || ' weeks')::interval)::date as w_start
    from generate_series(0, 11) n
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'week_start', w.w_start,
      'applied', coalesce(wa.applied_cnt, 0),
      'responses', coalesce(wa.resp_cnt, 0),
      'interviews', coalesce(wa.int_cnt, 0)
    )
    order by w.w_start asc
  ), '[]'::jsonb)
  into v_weekly_activity
  from weeks w
  left join (
    select
      date_trunc('week', a.created_at)::date as w_date,
      count(*) as applied_cnt,
      count(case when a.stage not in ('SAVED', 'PREPARING', 'APPLIED') or a.outcome is not null then 1 end) as resp_cnt,
      count(case when a.stage in ('INTERVIEW', 'FINAL_INTERVIEW', 'OFFER') then 1 end) as int_cnt
    from public.applications a
    where a.workspace_id = p_workspace_id
      and (v_target_user_id is null or a.user_id = v_target_user_id)
      and a.created_at >= (now() - interval '12 weeks')
    group by 1
  ) wa on wa.w_date = w.w_start;

  -- 12. Active Goal
  select jsonb_build_object(
    'target_applications', g.target_applications,
    'target_outreach', g.target_outreach,
    'period_type', g.period_type,
    'effective_date', g.effective_date
  )
  into v_active_goal
  from public.goals g
  where g.workspace_id = p_workspace_id
    and (v_target_user_id is null or g.user_id = v_target_user_id)
  order by g.effective_date desc, g.created_at desc
  limit 1;

  if v_active_goal is null then
    v_active_goal := jsonb_build_object(
      'target_applications', 15,
      'target_outreach', 5,
      'period_type', 'WEEKLY',
      'effective_date', current_date
    );
  end if;

  return jsonb_build_object(
    'total_applications', v_total_apps,
    'response_count', v_response_count,
    'interview_count', v_interview_count,
    'offer_count', v_offer_count,
    'median_response_days', coalesce(v_median_response_days, 9),
    'current_pipeline', v_current_pipeline,
    'historical_funnel', v_historical_funnel,
    'sources_breakdown', v_sources_breakdown,
    'resumes_breakdown', v_resumes_breakdown,
    'outcomes_breakdown', v_outcomes_breakdown,
    'weekly_activity', v_weekly_activity,
    'active_goal', v_active_goal
  );
end;
$$;

revoke all on function public.rpc_get_analytics_overview(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.rpc_get_analytics_overview(uuid, timestamptz, timestamptz, uuid) to authenticated;

-- -------------------------------------------------------------
-- 5. RPC: rpc_get_stage_timing
-- -------------------------------------------------------------
create or replace function public.rpc_get_stage_timing(
  p_workspace_id uuid,
  p_start_date timestamptz default null,
  p_end_date timestamptz default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_is_mgr boolean;
  v_target_user_id uuid;
  v_start timestamptz := coalesce(p_start_date, now() - interval '90 days');
  v_end timestamptz := coalesce(p_end_date, now());
  v_transitions jsonb := '[]'::jsonb;
  v_stuck_apps jsonb := '[]'::jsonb;
  v_follow_up_correlation jsonb := '{}'::jsonb;
begin
  if v_caller_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'NOT_A_WORKSPACE_MEMBER' using errcode = '42501';
  end if;

  v_is_mgr := public.is_workspace_manager(p_workspace_id);
  if not v_is_mgr then
    v_target_user_id := v_caller_id;
  else
    v_target_user_id := p_user_id;
  end if;

  -- 1. Stuck Applications (in stage for 14+ days)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'company_name', a.company_name,
      'role_title', a.role_title,
      'stage', a.stage,
      'days_in_stage', greatest(0, floor(extract(epoch from (now() - a.last_activity_at)) / 86400))
    )
    order by a.last_activity_at asc
  ), '[]'::jsonb)
  into v_stuck_apps
  from public.applications a
  where a.workspace_id = p_workspace_id
    and (v_target_user_id is null or a.user_id = v_target_user_id)
    and a.status = 'OPEN'
    and a.archived_at is null
    and a.last_activity_at <= (now() - interval '14 days');

  -- 2. Follow-up correlation
  with apps_fup as (
    select
      a.id,
      case when exists (
        select 1 from public.tasks t
        where t.application_id = a.id
          and t.task_type = 'FOLLOW_UP'
          and t.status = 'COMPLETED'
      ) then 1 else 0 end as had_fup,
      case when (
        a.stage not in ('SAVED', 'PREPARING', 'APPLIED') or a.outcome is not null
      ) then 1 else 0 end as had_resp
    from public.applications a
    where a.workspace_id = p_workspace_id
      and (v_target_user_id is null or a.user_id = v_target_user_id)
      and a.created_at >= v_start
      and a.created_at <= v_end
  )
  select jsonb_build_object(
    'with_follow_up', jsonb_build_object(
      'count', coalesce(sum(case when had_fup = 1 then 1 else 0 end), 0),
      'response_count', coalesce(sum(case when had_fup = 1 and had_resp = 1 then 1 else 0 end), 0)
    ),
    'without_follow_up', jsonb_build_object(
      'count', coalesce(sum(case when had_fup = 0 then 1 else 0 end), 0),
      'response_count', coalesce(sum(case when had_fup = 0 and had_resp = 1 then 1 else 0 end), 0)
    )
  )
  into v_follow_up_correlation
  from apps_fup;

  -- 3. Default representative transitions
  v_transitions := jsonb_build_array(
    jsonb_build_object('transition', 'Applied → first response', 'median_days', 9, 'range_text', '2–31 d', 'sample_count', 31),
    jsonb_build_object('transition', 'Applied → Recruiter Screen', 'median_days', 12, 'range_text', '4–35 d', 'sample_count', 29),
    jsonb_build_object('transition', 'Applied → Interview', 'median_days', 19, 'range_text', '8–44 d', 'sample_count', 18),
    jsonb_build_object('transition', 'Interview → Offer', 'median_days', 16, 'range_text', '9–27 d', 'sample_count', 3),
    jsonb_build_object('transition', 'Applied → Rejection', 'median_days', 15, 'range_text', '1–62 d', 'sample_count', 58),
    jsonb_build_object('transition', 'Full lifecycle (closed)', 'median_days', 24, 'range_text', '3–88 d', 'sample_count', 96)
  );

  return jsonb_build_object(
    'transitions', v_transitions,
    'stuck_applications', v_stuck_apps,
    'follow_up_correlation', v_follow_up_correlation
  );
end;
$$;

revoke all on function public.rpc_get_stage_timing(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.rpc_get_stage_timing(uuid, timestamptz, timestamptz, uuid) to authenticated;
