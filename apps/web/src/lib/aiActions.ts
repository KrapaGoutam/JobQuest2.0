// AI-8 browser-safe types and helpers for the Actions page (human approval center). Mirrors the server contract in
// apps/api/src/lib/aiContract/actions.ts and apps/api/src/services/aiActionService.ts without importing any server code;
// tests/unit/ai-8-actions-ui.test.ts fails if the vocabularies drift.
//
// Everything here is presentation + request shaping. The BROWSER DECIDES NOTHING: the server re-reads, re-authorizes and
// re-validates every confirmation, and a preview echoed back is only a version stamp (the fingerprint).

export const AI_ACTION_TYPE_VALUES = ['create_application', 'create_task', 'set_status'] as const;
export type AiActionType = (typeof AI_ACTION_TYPE_VALUES)[number];

export const AI_ACTION_LABELS: Record<AiActionType, string> = {
  create_application: 'Create application', create_task: 'Create task', set_status: 'Change status',
};
export const aiActionTypeLabel = (v: string) => (AI_ACTION_LABELS as Record<string, string>)[v] ?? 'Unsupported action';

export const ACTION_ERROR_CODES = [
  'ACTION_NOT_SUPPORTED', 'ACTION_UNAUTHORIZED', 'ACTION_STALE', 'ACTION_AMBIGUOUS', 'ACTION_ALREADY_EXECUTED',
  'ACTION_TARGET_NOT_FOUND', 'ACTION_VALIDATION_FAILED', 'ACTION_CONFLICT', 'ACTION_EXECUTION_FAILED',
] as const;
export type ActionErrorCode = (typeof ACTION_ERROR_CODES)[number];

/** User-facing text per failure category. Raw server/database text is never shown. */
export const ACTION_ERROR_MESSAGES: Record<ActionErrorCode, string> = {
  ACTION_NOT_SUPPORTED: 'JobQuest cannot apply this kind of suggestion.',
  ACTION_UNAUTHORIZED: 'You no longer have permission to perform this action.',
  ACTION_STALE: 'The underlying record changed. Review the updated action before confirming.',
  ACTION_AMBIGUOUS: 'More than one existing application matches. Choose which one this action is for.',
  ACTION_ALREADY_EXECUTED: 'This action was already completed.',
  ACTION_TARGET_NOT_FOUND: 'This suggestion or its target could not be found.',
  ACTION_VALIDATION_FAILED: 'This action cannot be applied as proposed.',
  ACTION_CONFLICT: 'This action conflicts with the current state of the record.',
  ACTION_EXECUTION_FAILED: 'The action could not be completed and nothing was changed. You can review it and try again.',
};
export function actionErrorMessage(code: string | undefined | null, serverMessage?: string | null): string {
  const base = code && (ACTION_ERROR_MESSAGES as Record<string, string>)[code];
  if (!base) return 'Something went wrong. Nothing was changed.';
  // Server messages for these categories are already safe, specific sentences ("This application is already at that stage.").
  return code === 'ACTION_CONFLICT' || code === 'ACTION_VALIDATION_FAILED' || code === 'ACTION_AMBIGUOUS' ? (serverMessage || base) : base;
}
/** After these, the open review is out of date and must be reloaded (never silently retried). */
export const actionNeedsRefresh = (code: string | undefined | null) => code === 'ACTION_STALE' || code === 'ACTION_CONFLICT' || code === 'ACTION_ALREADY_EXECUTED';

export interface ActionCardRow {
  suggestionId: string; findingId: string; action: AiActionType; summary: string; provider: string; kind: string; priority: string;
  confidence: number | null; evidence: string | null; findingTitle: string; createdAt: string;
  target: { match: 'EXACT' | 'STRONG' | 'AMBIGUOUS' | 'NONE' | null; label: string | null };
}
export interface ActionQueuePage { items: ActionCardRow[]; page: number; pageSize: number; hasNext: boolean; pendingTotal: number }
export interface ActionHistoryRow {
  id: string; suggestionId: string; action: AiActionType; status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CONFLICT';
  targetType: 'application' | 'task' | null; targetId: string | null; label: string | null; errorCategory: string | null;
  requestedAt: string; completedAt: string | null;
}
export interface ActionHistoryPage { items: ActionHistoryRow[]; page: number; pageSize: number; hasNext: boolean }

export interface ActionPreviewMatchCandidate { id: string; company: string; title: string; stage: string; status: string; outcome: string | null; basis: string; jobUrl: string | null }
export interface ActionPreviewData {
  suggestionId: string; findingId: string; action: AiActionType; summary: string; confirmLabel: string; provider: string;
  source: { kind: string; title: string; evidence: string | null; priority: string; confidence: number | null; occurredAt: string | null; dueAt: string | null };
  state: 'READY' | 'BLOCKED' | 'ALREADY_EXECUTED';
  blocked: { code: string; message: string } | null;
  existing: { targetType: 'application' | 'task'; targetId: string } | null;
  match: { result: 'EXACT' | 'STRONG' | 'AMBIGUOUS' | 'NONE'; candidates: ActionPreviewMatchCandidate[]; selectedId: string | null } | null;
  current: Array<{ label: string; value: string }>;
  proposed: Array<{ label: string; value: string }>;
  warnings: string[];
  requires: { applicationSelection: boolean; duplicateConfirmation: boolean };
  choices: { createNew: boolean; useExisting: boolean; noApplication: boolean };
  editable: { title: string; details: string | null; dueDate: string | null; priority: string; dueDateSource: 'suggestion' | 'finding_deadline' | 'none' } | null;
  fingerprint: string;
}

export const ACTION_SOURCE_FILTERS = [
  { id: 'ALL', label: 'All sources' }, { id: 'job_lead', label: 'Job leads' }, { id: 'email_event', label: 'Email' },
  { id: 'recruiter_intel', label: 'Recruiter intel' }, { id: 'calendar_event', label: 'Calendar' },
] as const;
export const ACTION_PROVIDER_FILTERS = [
  { id: 'ALL', label: 'All providers' }, { id: 'claude', label: 'Claude' }, { id: 'gemini', label: 'Gemini' }, { id: 'chatgpt', label: 'ChatGPT' },
  { id: 'manual', label: 'Manual' }, { id: 'system', label: 'System' },
] as const;
export interface ActionFilters { action: string; kind: string; provider: string; dateFrom: string; dateTo: string }
export const DEFAULT_ACTION_FILTERS: ActionFilters = { action: 'ALL', kind: 'ALL', provider: 'ALL', dateFrom: '', dateTo: '' };

/** Query string for GET /api/ai/actions/queue. Only non-default filters are sent; the server validates every value. */
export function actionQueueQuery(workspaceId: string, f: ActionFilters, page: number): string {
  const q = new URLSearchParams({ workspace_id: workspaceId, page: String(Math.max(0, Math.floor(page))) });
  if (f.action !== 'ALL') q.set('action', f.action);
  if (f.kind !== 'ALL') q.set('kind', f.kind);
  if (f.provider !== 'ALL') q.set('provider', f.provider);
  if (f.dateFrom) q.set('date_from', f.dateFrom);
  if (f.dateTo) q.set('date_to', f.dateTo);
  return q.toString();
}

export const MATCH_LABELS: Record<string, string> = {
  EXACT: 'Exact match', STRONG: 'Strong match', AMBIGUOUS: 'Several possible matches', NONE: 'No existing application',
};
export const matchLabel = (v: string | null | undefined) => (v ? MATCH_LABELS[v] ?? 'Unknown' : 'Not matched');
export const MATCH_BASIS_LABELS: Record<string, string> = {
  linked_finding: 'already linked', external_job_id: 'same job id', canonical_url: 'same job link',
  company_title_context: 'same company, title and context', company_title: 'same company and title',
};
export const STAGE_LABELS: Record<string, string> = {
  SAVED: 'Saved', PREPARING: 'Preparing', APPLIED: 'Applied', ASSESSMENT: 'Assessment', RECRUITER_SCREEN: 'Recruiter screen',
  INTERVIEW: 'Interview', FINAL_INTERVIEW: 'Final interview', OFFER: 'Offer',
};
export const stageText = (s: string) => STAGE_LABELS[s] ?? s;

/** What the human has chosen in the review dialog so far. */
export interface ReviewChoice {
  /** 'existing' = use/link the chosen application; 'new' = create another; 'none' = no application; null = nothing yet. */
  mode: 'existing' | 'new' | 'none' | null;
  applicationId: string | null;
  confirmDuplicate: boolean;
  title: string; details: string; dueDate: string; priority: string;
}

export function initialChoice(p: ActionPreviewData): ReviewChoice {
  const selected = p.match?.selectedId ?? null;
  // Nothing ambiguous is ever pre-chosen: with several candidates the human must pick (mode stays null).
  const mode: ReviewChoice['mode'] = p.action === 'create_application'
    ? (p.match?.result === 'NONE' ? 'new' : selected ? 'existing' : null)
    : p.action === 'create_task'
      ? (selected ? 'existing' : p.match?.result === 'AMBIGUOUS' ? null : 'none')
      : (selected ? 'existing' : null);
  return {
    mode, applicationId: selected, confirmDuplicate: false,
    title: p.editable?.title ?? '', details: p.editable?.details ?? '', dueDate: p.editable?.dueDate ?? '', priority: p.editable?.priority ?? 'MEDIUM',
  };
}

/** Client-side convenience only: the Confirm button stays disabled until the human has made the decisions the server will require. */
export function confirmReadiness(p: ActionPreviewData, c: ReviewChoice): { ready: boolean; reason: string | null } {
  if (p.state !== 'READY') return { ready: false, reason: p.blocked?.message ?? 'Nothing to confirm.' };
  if (p.action === 'create_task') {
    if (!c.title.trim()) return { ready: false, reason: 'Enter a task title.' };
    if (c.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(c.dueDate)) return { ready: false, reason: 'Enter a valid due date.' };
    if (c.mode === null) return { ready: false, reason: 'Choose an application, or create the task without one.' };
    if (c.mode === 'existing' && !c.applicationId) return { ready: false, reason: 'Choose an application.' };
    return { ready: true, reason: null };
  }
  if (p.action === 'set_status') {
    return c.applicationId ? { ready: true, reason: null } : { ready: false, reason: 'Choose which application this applies to.' };
  }
  if (c.mode === 'existing') return c.applicationId ? { ready: true, reason: null } : { ready: false, reason: 'Choose an application.' };
  if (c.mode === 'new') {
    if (p.match && p.match.result !== 'NONE' && !c.confirmDuplicate) return { ready: false, reason: 'Confirm that you want to create another application.' };
    return { ready: true, reason: null };
  }
  return { ready: false, reason: 'Choose to use an existing application or create a new one.' };
}

/** Request body for POST /api/ai/actions/execute built from the review (the server ignores anything it does not expect). */
export function executeBody(workspaceId: string, p: ActionPreviewData, c: ReviewChoice) {
  const body: Record<string, unknown> = { workspace_id: workspaceId, suggestion_id: p.suggestionId, expected_fingerprint: p.fingerprint };
  if (p.action === 'create_application') {
    body.decision = c.mode === 'existing' ? 'use_existing' : 'create_new';
    if (c.mode === 'existing') body.application_id = c.applicationId;
    if (c.mode === 'new' && c.confirmDuplicate) body.confirm_duplicate = true;
  } else if (p.action === 'create_task') {
    if (c.mode === 'none') body.decision = 'no_application';
    else if (c.applicationId) body.application_id = c.applicationId;
    body.edits = { title: c.title.trim(), details: c.details.trim() || null, due_date: c.dueDate || null, priority: c.priority };
  } else if (c.applicationId) body.application_id = c.applicationId;
  return body;
}

export const HISTORY_STATUS_LABELS: Record<string, string> = { PENDING: 'In progress', SUCCEEDED: 'Completed', FAILED: 'Failed', CONFLICT: 'Not applied' };
export const historyStatusVariant = (s: string): 'success' | 'warning' | 'danger' | 'muted' =>
  s === 'SUCCEEDED' ? 'success' : s === 'FAILED' ? 'danger' : s === 'CONFLICT' ? 'warning' : 'muted';

/** Pending-action pluralisation shared by the Overview card and the Daily Digest line. */
export const pendingActionsText = (n: number) => (n === 1 ? '1 action awaiting your review' : `${n} actions awaiting your review`);
