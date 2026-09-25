export type ApplicationStage =
  | 'SAVED'
  | 'PREPARING'
  | 'APPLIED'
  | 'ASSESSMENT'
  | 'RECRUITER_SCREEN'
  | 'INTERVIEW'
  | 'FINAL_INTERVIEW'
  | 'OFFER';

export type ApplicationStatus = 'OPEN' | 'CLOSED';

export type ApplicationOutcome =
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'GHOSTED'
  | 'POSITION_CLOSED';

export type ClosureReason =
  | 'OFFER_DECLINED'
  | 'GENERAL_WITHDRAWAL'
  | 'COMPENSATION_MISMATCH'
  | 'LOCATION_UNSUITABLE'
  | 'OTHER';

export type ApplicationPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export type WorkArrangement = 'Remote' | 'Hybrid' | 'Onsite';

export type EmploymentType = 'Full-time' | 'Contract' | 'Part-time';

export type AgingBand = 'NEW' | 'WAITING' | 'FOLLOW_UP_RECOMMENDED' | 'STALE' | 'LONG_WAITING';

export interface JobSnapshot {
  id: string;
  application_id: string;
  workspace_id: string;
  job_description: string | null;
  requirements: string | null;
  skills: string | null;
  raw_payload?: Record<string, unknown> | null;
  captured_at: string;
}

export interface ApplicationEvent {
  id: string;
  application_id: string;
  workspace_id: string;
  actor_id: string;
  event_type:
    | 'CREATED'
    | 'CAPTURED'
    | 'APPLIED'
    | 'STAGE_CHANGED'
    | 'OUTCOME_CHANGED'
    | 'NEXT_ACTION_CHANGED'
    | 'FOLLOW_UP'
    | 'CONTACT_EVENT'
    | 'INTERVIEW_SCHEDULED'
    | 'INTERVIEW_COMPLETED'
    | 'NOTE'
    | 'ARCHIVED'
    | 'RESTORED'
    | 'KEEP_ACTIVE';
  payload_version: number;
  payload: Record<string, unknown>;
  created_at: string;
  actor_username?: string;
}

export interface Application {
  id: string;
  workspace_id: string;
  user_id: string;
  company_name: string;
  role_title: string;
  stage: ApplicationStage;
  status: ApplicationStatus;
  outcome: ApplicationOutcome | null;
  closure_reason: ClosureReason | null;
  closure_notes: string | null;
  closed_at: string | null;
  priority: ApplicationPriority;
  next_action: string | null;
  next_action_date: string | null;
  next_action_completed_at: string | null;
  job_url: string | null;
  external_job_id: string | null;
  location: string | null;
  work_arrangement: WorkArrangement | null;
  employment_type: EmploymentType | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  tags: string[];
  notes: string | null;
  duplicate_override_flag: boolean;
  last_activity_at: string;
  applied_at: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  job_snapshot?: JobSnapshot | null;
  user_account?: {
    username: string;
    display_name?: string | null;
  } | null;
}

export type DuplicateTier = 'STRONG' | 'PROBABLE' | 'POSSIBLE' | 'NONE';

export interface DuplicateCheckResult {
  tier: DuplicateTier;
  matches: Partial<Application>[];
}

export interface WorkflowStageDef {
  id: ApplicationStage;
  label: string;
  order: number;
  legacy?: string;
}

export interface WorkflowOutcomeDef {
  id: ApplicationOutcome;
  label: string;
  terminal_state: 'CLOSED';
  legacy?: string;
}

export interface WorkflowClosureReasonDef {
  id: ClosureReason;
  label: string;
  for_outcome: 'WITHDRAWN';
}

export interface CanonicalWorkflow {
  stages: WorkflowStageDef[];
  outcomes: WorkflowOutcomeDef[];
  closure_reasons: WorkflowClosureReasonDef[];
}

export interface ApplicationSort {
  field: keyof Application | 'company_name' | 'role_title' | 'stage' | 'priority' | 'applied_at' | 'last_activity_at';
  direction: 'asc' | 'desc';
}

export function computeAgingBand(daysInactive: number): AgingBand {
  if (daysInactive <= 3) return 'NEW';
  if (daysInactive <= 7) return 'WAITING';
  if (daysInactive <= 14) return 'FOLLOW_UP_RECOMMENDED';
  if (daysInactive <= 30) return 'STALE';
  return 'LONG_WAITING';
}

export function calculateDaysInactive(lastActivityAt: string): number {
  const diffMs = Date.now() - new Date(lastActivityAt).getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}
