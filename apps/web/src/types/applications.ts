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
  source: string | null;
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
  field: 'company_name' | 'role_title' | 'stage' | 'priority' | 'applied_at' | 'last_activity_at' | 'created_at';
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

// ---------------------------------------------------------------------------------
// Aging filters (Gate 02B §4.5): bands are computed from whole days of inactivity.
// ---------------------------------------------------------------------------------
export type AgingFilter = 'ALL' | 'QUIET' | 'STALE' | 'LONG_WAITING';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * last_activity_at range (ISO strings) matching a band, consistent with
 * calculateDaysInactive (floor of whole days): STALE = 15–30 days, LONG_WAITING = 31+,
 * QUIET = both (15+). `from` is exclusive and `to` inclusive.
 */
export function agingRange(filter: Exclude<AgingFilter, 'ALL'>, now: Date): { from: string | null; to: string } {
  const at = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
  if (filter === 'STALE') return { from: at(31), to: at(15) };
  if (filter === 'LONG_WAITING') return { from: null, to: at(31) };
  return { from: null, to: at(15) };
}

// ---------------------------------------------------------------------------------
// Search: build a PostgREST `or` filter from untrusted input without letting the
// input change the filter structure (commas, parentheses, quotes, wildcards).
// ---------------------------------------------------------------------------------
export const SEARCH_COLUMNS = ['company_name', 'role_title', 'location', 'notes'] as const;

export function buildSearchFilter(
  raw: string,
  columns: readonly string[] = SEARCH_COLUMNS,
  tagColumn: string | null = 'tags',
): string | null {
  const term = raw.trim().replace(/\s+/g, ' ').slice(0, 100);
  if (!term) return null;
  // 1) LIKE escaping: the user's % and _ are literal characters.
  const like = term.replace(/[\\%_]/g, (c) => `\\${c}`);
  // 2) PostgREST quoted value: escape backslash and double quote; the quotes keep
  //    commas, parentheses and dots from being parsed as filter syntax.
  const quoted = like.replace(/[\\"]/g, (c) => `\\${c}`);
  const clauses = columns.map((col) => `${col}.ilike."*${quoted}*"`);
  // Tags are an array: exact tag match for single safe tokens.
  if (tagColumn && /^[A-Za-z0-9_.+#-]{1,40}$/.test(term)) clauses.push(`${tagColumn}.cs.{${term}}`);
  return clauses.join(',');
}
