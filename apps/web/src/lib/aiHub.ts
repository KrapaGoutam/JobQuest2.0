// Browser-safe AI Hub read types (AI-1D). Mirrors the DB CHECK enums and the
// AI-1C constants (apps/api/src/lib/aiContract/constants.ts) without importing
// any server-side validation/hashing code. tests/unit/ai-hub-ui.test.ts fails if
// these lists drift from the server constants.

export const AI_RUN_STATUS_VALUES = [
  'QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'AWAITING_APPROVAL', 'CANCELLED',
] as const;
export type AiRunStatus = (typeof AI_RUN_STATUS_VALUES)[number];

export const AI_PRIORITY_VALUES = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW', 'INFO'] as const;
export type AiPriority = (typeof AI_PRIORITY_VALUES)[number];

export const AI_PROVIDER_VALUES = ['claude', 'gemini', 'chatgpt', 'manual', 'system'] as const;
export const AI_WORKFLOW_VALUES = [
  'daily_brief', 'email_triage', 'job_discovery', 'recruiter_intel', 'calendar_review', 'other',
] as const;
export const AI_ERROR_CATEGORY_VALUES = [
  'PROVIDER_UNAVAILABLE', 'CONNECTOR_AUTH_EXPIRED', 'SOURCE_UNAVAILABLE', 'PARTIAL_READ',
  'SCHEMA_INVALID', 'TIMEOUT', 'RATE_LIMITED', 'INTERNAL',
] as const;

export interface AiRunRow {
  id: string;
  provider: string;
  workflow: string;
  status: AiRunStatus;
  trigger_type: string;
  created_at: string;
  started_at?: string | null;
  completed_at: string | null;
  error_category?: string | null;
  counts?: Record<string, unknown> | null;
}

/** Run row plus detail-only columns (AI-1E). error_detail is never selected. */
export interface AiRunDetailRow extends AiRunRow {
  schema_version: string;
  sources: unknown;
}

export interface AiFindingRow {
  id: string;
  kind: string;
  provider: string;
  status: string;
  priority: AiPriority;
  title: string;
  summary: string | null;
  evidence: string | null; // plain text only, <= 500 chars
  created_at: string;
  confidence?: number | string | null; // numeric(4,3) may arrive as a string
  occurred_at?: string | null;
}

export interface AiFindingDetailRow extends AiFindingRow {
  run_id: string | null;
  category: string | null;
  due_at: string | null;
  application_id: string | null;
  source_ref: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
}

export interface AiSuggestionRow {
  id: string;
  action: string;
  target_type: string | null;
  created_at: string;
}

const SUGGESTION_ACTION_LABELS: Record<string, string> = {
  set_status: 'Change status', create_task: 'Create task', create_followup: 'Create follow-up',
  link_contact: 'Link contact', create_application: 'Create application',
  schedule_interview: 'Schedule interview', other: 'Other',
};
export const aiSuggestionActionLabel = (v: string) => (v ? SUGGESTION_ACTION_LABELS[v] ?? 'Unknown' : '');

export interface AiHubSnapshot {
  runs: AiRunRow[];
  findings: AiFindingRow[];
  pendingSuggestions: number;
  pendingSuggestionRows?: AiSuggestionRow[];
  /** Runs created in the last RECENT_WINDOW_DAYS days. */
  recentRunCount?: number;
  /** FAILED or PARTIAL runs created in the same window. */
  attentionRunCount?: number;
}

export const RECENT_WINDOW_DAYS = 7;
export const HISTORY_PAGE_SIZE = 20;

export interface AiRunFilters { status: string; provider: string; workflow: string }
export const DEFAULT_RUN_FILTERS: AiRunFilters = { status: 'ALL', provider: 'ALL', workflow: 'ALL' };

export const AI_PROVIDER_LABELS: Record<string, string> = {
  claude: 'Claude', gemini: 'Gemini', chatgpt: 'ChatGPT', manual: 'Manual', system: 'System',
};
export const AI_WORKFLOW_LABELS: Record<string, string> = {
  daily_brief: 'Daily brief', email_triage: 'Email triage', job_discovery: 'Job discovery',
  recruiter_intel: 'Recruiter intel', calendar_review: 'Calendar review', other: 'Other',
};
export const AI_FINDING_KIND_LABELS: Record<string, string> = {
  daily_brief: 'Daily brief', email_event: 'Email event', job_lead: 'Job lead',
  recruiter_intel: 'Recruiter intel', calendar_event: 'Calendar event', note: 'Note', other: 'Other',
};
export const AI_ERROR_CATEGORY_LABELS: Record<string, string> = {
  PROVIDER_UNAVAILABLE: 'Provider unavailable', CONNECTOR_AUTH_EXPIRED: 'Connector authorization expired',
  SOURCE_UNAVAILABLE: 'Source unavailable', PARTIAL_READ: 'Partial read', SCHEMA_INVALID: 'Invalid result format',
  TIMEOUT: 'Timed out', RATE_LIMITED: 'Rate limited', INTERNAL: 'Internal error',
};
const FINDING_STATUS_LABELS: Record<string, string> = {
  NEW: 'New', REVIEWED: 'Reviewed', DISMISSED: 'Dismissed', ACCEPTED: 'Accepted',
  SUPERSEDED: 'Superseded', EXPIRED: 'Expired',
};
const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: 'Critical', HIGH: 'High', NORMAL: 'Normal', LOW: 'Low', INFO: 'Info',
};
const TRIGGER_LABELS: Record<string, string> = { scheduled: 'Scheduled', manual: 'Manual', retry: 'Retry' };

const lookup = (map: Record<string, string>, v: string | null | undefined) => (v ? map[v] ?? 'Unknown' : '');
export const aiProviderLabel = (v: string) => lookup(AI_PROVIDER_LABELS, v);
export const aiFindingKindLabel = (v: string) => lookup(AI_FINDING_KIND_LABELS, v);
export const aiErrorCategoryLabel = (v: string | null | undefined) => lookup(AI_ERROR_CATEGORY_LABELS, v);
export const aiFindingStatusLabel = (v: string) => lookup(FINDING_STATUS_LABELS, v);
export const aiPriorityLabel = (v: string) => lookup(PRIORITY_LABELS, v);
export const aiTriggerLabel = (v: string) => lookup(TRIGGER_LABELS, v);

/** Confidence is stored 0..1; null/invalid renders nothing. The stored value is not altered. */
export function formatConfidence(c: number | string | null | undefined): string | null {
  if (c === null || c === undefined) return null;
  const n = typeof c === 'string' ? Number(c) : c;
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return `${Math.round(n * 100)}%`;
}

/** Only credential-free http(s) URLs are ever rendered as links. */
export function safeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  return u.href;
}

export type PayloadFieldType = 'string' | 'number' | 'boolean' | 'url' | 'timestamp' | 'strings';
/** Allowlist per finding kind; mirrors the AI-1C payload schemas. note/other/unknown kinds show nothing. */
export const AI_PAYLOAD_FIELDS: Record<string, Array<[key: string, label: string, type: PayloadFieldType]>> = {
  daily_brief: [['date', 'Date', 'string'], ['highlights', 'Highlights', 'strings'], ['total_items', 'Items', 'number']],
  email_event: [['from_domain', 'From domain', 'string'], ['company', 'Company', 'string'], ['role_title', 'Role', 'string'], ['next_step', 'Next step', 'string'], ['deadline', 'Deadline', 'timestamp']],
  job_lead: [['company', 'Company', 'string'], ['role_title', 'Role', 'string'], ['location', 'Location', 'string'], ['salary_text', 'Salary', 'string'], ['remote', 'Remote', 'boolean'], ['job_url', 'Job posting', 'url'], ['fit_notes', 'Fit notes', 'string']],
  recruiter_intel: [['recruiter_name', 'Recruiter', 'string'], ['company', 'Company', 'string'], ['channel', 'Channel', 'string'], ['role_title', 'Role', 'string']],
  calendar_event: [['start_at', 'Starts', 'timestamp'], ['end_at', 'Ends', 'timestamp'], ['location', 'Location', 'string'], ['attendee_count', 'Attendees', 'number'], ['join_url', 'Join link', 'url']],
};

export interface PayloadDisplayItem { label: string; type: PayloadFieldType; text?: string; items?: string[]; href?: string }

/** Pure: untrusted payload -> display items using only allowlisted keys and types. */
export function allowlistedPayloadItems(kind: string, payload: Record<string, unknown> | null | undefined): PayloadDisplayItem[] {
  const fields = AI_PAYLOAD_FIELDS[kind];
  if (!fields || !payload || typeof payload !== 'object') return [];
  const out: PayloadDisplayItem[] = [];
  for (const [key, label, type] of fields) {
    const v = payload[key];
    if (v === undefined || v === null) continue;
    if (type === 'strings') {
      const items = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 20) : [];
      if (items.length) out.push({ label, type, items });
    } else if (type === 'url') {
      const href = safeHttpUrl(v);
      if (href) out.push({ label, type, text: href, href });
    } else if (type === 'boolean') {
      if (typeof v === 'boolean') out.push({ label, type, text: v ? 'Yes' : 'No' });
    } else if (type === 'number') {
      if (typeof v === 'number' && Number.isFinite(v)) out.push({ label, type, text: String(v) });
    } else if (type === 'timestamp') {
      const d = new Date(String(v));
      if (!Number.isNaN(d.getTime())) out.push({ label, type, text: d.toLocaleString() });
    } else if (typeof v === 'string') {
      out.push({ label, type, text: v });
    }
  }
  return out;
}

/** Safe source link from finding.source_ref; no other source_ref keys are surfaced. */
export function findingSourceUrl(sourceRef: Record<string, unknown> | null | undefined): string | null {
  return sourceRef ? safeHttpUrl(sourceRef.url) : null;
}

/** Numeric entries from run.counts (only finite numbers are shown). */
export function runCountEntries(counts: Record<string, unknown> | null | undefined): Array<[string, number]> {
  if (!counts || typeof counts !== 'object') return [];
  return Object.entries(counts)
    .filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]))
    .slice(0, 12);
}

/** Pagination: request size+1 rows so "has next" needs no count query. Range is inclusive. */
export function pageRange(page: number, size = HISTORY_PAGE_SIZE): { from: number; to: number } {
  const p = Math.max(0, Math.floor(page));
  return { from: p * size, to: p * size + size };
}
export function sliceRunsPage<T>(rows: T[], size = HISTORY_PAGE_SIZE): { rows: T[]; hasNext: boolean } {
  return { rows: rows.slice(0, size), hasNext: rows.length > size };
}

export function runDurationLabel(run: Pick<AiRunRow, 'started_at' | 'completed_at'>): string | null {
  if (!run.started_at || !run.completed_at) return null;
  const ms = new Date(run.completed_at).getTime() - new Date(run.started_at).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const sec = Math.round(ms / 1000);
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

export const AI_RUN_STATUS_LABELS: Record<AiRunStatus, string> = {
  QUEUED: 'Queued',
  RUNNING: 'Running',
  SUCCEEDED: 'Succeeded',
  PARTIAL: 'Partial',
  FAILED: 'Failed',
  AWAITING_APPROVAL: 'Awaiting approval',
  CANCELLED: 'Cancelled',
};

export function aiRunStatusLabel(status: string): string {
  return (AI_RUN_STATUS_LABELS as Record<string, string>)[status] ?? 'Unknown';
}

export function aiRunStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'muted' {
  if (status === 'SUCCEEDED') return 'success';
  if (status === 'PARTIAL' || status === 'AWAITING_APPROVAL') return 'warning';
  if (status === 'FAILED') return 'danger';
  if (status === 'RUNNING' || status === 'QUEUED') return 'info';
  return 'muted';
}

export function aiWorkflowLabel(workflow: string): string {
  return AI_WORKFLOW_LABELS[workflow] ?? 'Unknown';
}

export function isAiHubEmpty(s: AiHubSnapshot): boolean {
  return s.runs.length === 0 && s.findings.length === 0 && s.pendingSuggestions === 0;
}

export type AiHubTab = 'overview' | 'history';

export function aiHubTabFromPath(path: string): AiHubTab {
  return path === '/ai-hub/history' ? 'history' : 'overview';
}

export function aiHubPathForTab(tab: AiHubTab): string {
  return tab === 'history' ? '/ai-hub/history' : '/ai-hub';
}
