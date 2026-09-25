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
  return data as AnalyticsOverview;
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
  const raw = (data ?? {}) as Record<string, any>;
  const fup = (raw.follow_up_impact || raw.follow_up_correlation || {}) as Record<string, any>;
  const withFup = (fup.with_follow_up || {}) as Record<string, any>;
  const withoutFup = (fup.without_follow_up || {}) as Record<string, any>;

  return {
    transitions: (raw.transitions || []).map((t: any) => ({
      transition: t.transition || '',
      median_days: t.median_days ?? null,
      min_days: t.min_days ?? null,
      max_days: t.max_days ?? null,
      sample_size: t.sample_size ?? t.sample_count ?? 0,
    })),
    stuck_applications: (raw.stuck_applications || []).map((s: any) => ({
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
  }
) {
  const { data, error } = await supabase.rpc('rpc_upsert_goal', {
    p_workspace_id: workspaceId,
    p_period_type: params.periodType,
    p_target_applications: params.targetApplications,
    p_target_outreach: params.targetOutreach,
    p_effective_date: params.effectiveDate ?? new Date().toISOString().split('T')[0],
  });

  if (error) throw error;
  return data;
}

export {
  sanitizeCsvField,
  exportAnalyticsToCsv,
  exportAnalyticsToJson,
} from '../lib/analyticsExport';

