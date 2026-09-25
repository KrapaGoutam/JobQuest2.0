import { supabase } from '../supabase';
import type {
  AnalyticsOverview,
  StageTiming,
  AgingApplication,
  AgingBand,
} from '../types/analytics';

export interface AnalyticsQueryOptions {
  startDate?: string;
  endDate?: string;
  userId?: string | null;
}

export async function fetchAnalyticsOverview(
  workspaceId: string,
  options: AnalyticsQueryOptions = {}
): Promise<AnalyticsOverview> {
  const { data, error } = await supabase.rpc('rpc_get_analytics_overview', {
    p_workspace_id: workspaceId,
    p_start_date: options.startDate ?? null,
    p_end_date: options.endDate ?? null,
    p_user_id: options.userId ?? null,
  });

  if (error) throw error;
  return normalizeAnalyticsOverview(data);
}

interface RawOverviewPayload extends Partial<AnalyticsOverview> {
  weekly_activity?: Array<Partial<AnalyticsOverview['weekly_pacing'][number]>>;
}

export function normalizeAnalyticsOverview(payload: unknown): AnalyticsOverview {
  const raw = (payload ?? {}) as RawOverviewPayload;
  const weekly = raw.weekly_pacing ?? raw.weekly_activity ?? [];
  return {
    total_applications: raw.total_applications ?? 0,
    response_count: raw.response_count ?? 0,
    interview_count: raw.interview_count ?? 0,
    offer_count: raw.offer_count ?? 0,
    accepted_count: raw.accepted_count ?? 0,
    median_response_days: raw.median_response_days ?? null,
    response_samples: raw.response_samples ?? 0,
    weekly_pacing: weekly.map((point) => ({
      week_start: point.week_start ?? '',
      week_label: point.week_label ?? point.week_start ?? '',
      applied: point.applied ?? 0,
      responses: point.responses ?? 0,
      interviews: point.interviews ?? 0,
      outreach: point.outreach ?? 0,
      target: point.target ?? 0,
    })),
    current_pipeline: raw.current_pipeline ?? [],
    historical_funnel: (raw.historical_funnel ?? []).map((row) => ({
      stage: row.stage,
      count: row.count,
      pct: row.pct ?? (row as { rate?: number }).rate,
    })),
    sources_breakdown: (raw.sources_breakdown ?? []).map((row) => ({
      source: row.source,
      apps: row.apps ?? (row as { apps_count?: number }).apps_count ?? 0,
      responses: row.responses ?? (row as { response_count?: number }).response_count ?? 0,
      interviews: row.interviews ?? (row as { interview_count?: number }).interview_count ?? 0,
    })),
    resumes_breakdown: (raw.resumes_breakdown ?? []).map((row) => ({
      resume_id: row.resume_id,
      title: row.title ?? (row as { name?: string }).name ?? 'Untitled resume',
      apps: row.apps ?? (row as { apps_count?: number }).apps_count ?? 0,
      responses: row.responses ?? (row as { response_count?: number }).response_count ?? 0,
      interviews: row.interviews ?? (row as { interview_count?: number }).interview_count ?? 0,
    })),
    outcomes_breakdown: (raw.outcomes_breakdown ?? []).map((row) => ({
      outcome: row.outcome,
      count: row.count,
      stages_detail: row.stages_detail ?? (row as { terminal_stage?: string }).terminal_stage ?? '',
    })),
    active_goal: raw.active_goal ?? null,
    date_range_semantics: raw.date_range_semantics,
  };
}

interface RawTransition {
  transition?: string;
  average_days?: number | null;
  median_days?: number | null;
  min_days?: number | null;
  max_days?: number | null;
  sample_size?: number;
  sample_count?: number;
}

interface RawStuckApp {
  id: string;
  company_name: string;
  role_title: string;
  stage: string;
  days_in_stage?: number;
}

interface RawFollowUpGroup {
  count?: number;
  responses?: number;
  response_count?: number;
}

interface RawStageTimingPayload {
  transitions?: RawTransition[];
  stuck_applications?: RawStuckApp[];
  follow_up_impact?: {
    with_follow_up?: RawFollowUpGroup;
    without_follow_up?: RawFollowUpGroup;
    total_follow_ups?: number;
  };
  follow_up_correlation?: {
    with_follow_up?: RawFollowUpGroup;
    without_follow_up?: RawFollowUpGroup;
    total_follow_ups?: number;
  };
}

export async function fetchStageTiming(
  workspaceId: string,
  options: AnalyticsQueryOptions = {}
): Promise<StageTiming> {
  const { data, error } = await supabase.rpc('rpc_get_stage_timing', {
    p_workspace_id: workspaceId,
    p_start_date: options.startDate ?? null,
    p_end_date: options.endDate ?? null,
    p_user_id: options.userId ?? null,
  });

  if (error) throw error;
  const raw = (data ?? {}) as RawStageTimingPayload;
  const fup = raw.follow_up_impact || raw.follow_up_correlation || {};
  const withFup = fup.with_follow_up || {};
  const withoutFup = fup.without_follow_up || {};

  return {
    transitions: (raw.transitions || []).map((t) => ({
      transition: t.transition || '',
      average_days: t.average_days ?? null,
      median_days: t.median_days ?? null,
      min_days: t.min_days ?? null,
      max_days: t.max_days ?? null,
      sample_size: t.sample_size ?? t.sample_count ?? 0,
    })),
    stuck_applications: (raw.stuck_applications || []).map((s) => ({
      id: s.id,
      company_name: s.company_name,
      role_title: s.role_title,
      stage: s.stage,
      days_in_stage: s.days_in_stage ?? 0,
    })),
    follow_up_impact: {
      with_follow_up: {
        count: withFup.count ?? 0,
        responses: withFup.responses ?? withFup.response_count ?? 0,
      },
      without_follow_up: {
        count: withoutFup.count ?? 0,
        responses: withoutFup.responses ?? withoutFup.response_count ?? 0,
      },
      total_follow_ups: fup.total_follow_ups ?? (withFup.count ?? 0),
    },
  };
}

interface ApplicationAgingRow {
  id: string;
  company_name: string;
  role_title: string;
  stage: string;
  status: string;
  last_activity_at: string;
  tasks?: Array<{
    title: string;
    due_date: string;
    status: string;
  }> | null;
}

export async function fetchAgingApplications(
  workspaceId: string,
  options: { userId?: string | null } = {}
): Promise<AgingApplication[]> {
  let query = supabase
    .from('applications')
    .select(`
      id,
      company_name,
      role_title,
      stage,
      status,
      last_activity_at,
      tasks (
        title,
        due_date,
        status
      )
    `)
    .eq('workspace_id', workspaceId)
    .eq('status', 'OPEN')
    .order('last_activity_at', { ascending: true });

  if (options.userId) {
    query = query.eq('user_id', options.userId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []) as unknown as ApplicationAgingRow[];
  const now = Date.now();
  return rows.map((row) => {
    const lastActive = new Date(row.last_activity_at).getTime();
    const diffDays = Math.max(0, Math.floor((now - lastActive) / (1000 * 60 * 60 * 24)));

    let agingBand: AgingBand;
    if (diffDays <= 3) {
      agingBand = 'NEW';
    } else if (diffDays <= 7) {
      agingBand = 'WAITING';
    } else if (diffDays <= 14) {
      agingBand = 'FOLLOW_UP_RECOMMENDED';
    } else if (diffDays <= 30) {
      agingBand = 'STALE';
    } else {
      agingBand = 'LONG_WAITING';
    }

    const openTasks = (row.tasks || []).filter((t) => t.status === 'PENDING');
    openTasks.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
    const nextTask = openTasks[0];

    return {
      id: row.id,
      company_name: row.company_name,
      role_title: row.role_title,
      stage: row.stage,
      status: row.status,
      last_activity_at: row.last_activity_at,
      days_inactive: diffDays,
      aging_band: agingBand,
      next_action_title: nextTask ? nextTask.title : null,
      next_action_due: nextTask ? nextTask.due_date : null,
    };
  });
}

export async function upsertGoal(
  workspaceId: string,
  params: {
    periodType: 'WEEKLY' | 'MONTHLY';
    targetApplications: number;
    targetOutreach: number;
    effectiveDate?: string;
    userId?: string | null;
  }
) {
  const { data, error } = await supabase.rpc('rpc_upsert_goal_for_user', {
    p_workspace_id: workspaceId,
    p_period_type: params.periodType,
    p_target_applications: params.targetApplications,
    p_target_outreach: params.targetOutreach,
    p_effective_date: params.effectiveDate ?? new Date().toISOString().split('T')[0],
    p_user_id: params.userId ?? null,
  });

  if (error) throw error;
  return data;
}

export {
  sanitizeCsvField,
  exportAnalyticsToCsv,
  exportAnalyticsToJson,
} from '../lib/analyticsExport';
