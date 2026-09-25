/**
 * Milestone 8 — Analytics, Reports & Search Goals Types
 */

export interface WeeklyPacingPoint {
  week_start: string;
  week_label: string;
  applied: number;
  responses: number;
  interviews: number;
  outreach: number;
  target: number;
}

export interface StageCount {
  stage: string;
  count: number;
  pct?: number;
}

export interface SourcePerformance {
  source: string;
  apps: number;
  responses: number;
  interviews: number;
}

export interface ResumePerformance {
  resume_id: string;
  title: string;
  apps: number;
  responses: number;
  interviews: number;
}

export interface OutcomePerformance {
  outcome: string;
  count: number;
  stages_detail: string;
}

export interface ActiveGoal {
  id: string | null;
  period_type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  target_applications: number;
  target_outreach: number;
  effective_date: string;
}

export interface AnalyticsOverview {
  total_applications: number;
  response_count: number;
  interview_count: number;
  offer_count: number;
  accepted_count: number;
  median_response_days: number | null;
  response_samples: number;
  weekly_pacing: WeeklyPacingPoint[];
  current_pipeline: StageCount[];
  historical_funnel: StageCount[];
  sources_breakdown: SourcePerformance[];
  resumes_breakdown: ResumePerformance[];
  outcomes_breakdown: OutcomePerformance[];
  active_goal: ActiveGoal | null;
  date_range_semantics?: {
    range_scoped: string[];
    current_state: string[];
    fixed_window: string[];
  };
}

export interface StageTransition {
  transition: string;
  average_days: number | null;
  median_days: number | null;
  min_days: number | null;
  max_days: number | null;
  sample_size: number;
}

export interface StuckApplication {
  id: string;
  company_name: string;
  role_title: string;
  stage: string;
  days_in_stage: number;
}

export interface FollowUpImpact {
  with_follow_up: { count: number; responses: number };
  without_follow_up: { count: number; responses: number };
  total_follow_ups: number;
}

export interface StageTiming {
  transitions: StageTransition[];
  stuck_applications: StuckApplication[];
  follow_up_impact: FollowUpImpact;
}

export type AgingBand = 'NEW' | 'WAITING' | 'FOLLOW_UP_RECOMMENDED' | 'STALE' | 'LONG_WAITING';

export interface AgingApplication {
  id: string;
  company_name: string;
  role_title: string;
  stage: string;
  status: string;
  last_activity_at: string;
  days_inactive: number;
  aging_band: AgingBand;
  next_action_title?: string | null;
  next_action_due?: string | null;
}

export interface GoalRecord {
  id: string;
  workspace_id: string;
  user_id: string;
  period_type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  target_applications: number;
  target_outreach: number;
  effective_date: string;
  created_at: string;
  updated_at: string;
}
