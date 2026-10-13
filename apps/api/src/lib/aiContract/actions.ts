// AI-8: the CLOSED set of suggestion actions a human can approve, and the strict payload schema of each.
// Pure and provider-neutral (no I/O). A provider may PROPOSE one of these; it can never execute one, name an
// internal record id, or choose the workspace/user. Unsupported actions stay inert proposals. Mirrored by
// apps/web/src/lib/aiActions.ts (tests/unit/ai-8-actions-ui.test.ts fails on drift).

export const AI_ACTION_TYPES = ['create_application', 'create_task', 'set_status'] as const;
export type AiActionType = (typeof AI_ACTION_TYPES)[number];

/** Existing workflow stages (applications.stage CHECK). No stage is invented. */
export const AI_ACTION_STAGES = ['SAVED', 'PREPARING', 'APPLIED', 'ASSESSMENT', 'RECRUITER_SCREEN', 'INTERVIEW', 'FINAL_INTERVIEW', 'OFFER'] as const;
/** The only outcome an AI-8 status action may propose (closing as WITHDRAWN needs a reason; the rest are deferred). */
export const AI_ACTION_OUTCOMES = ['REJECTED'] as const;
export const AI_ACTION_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const AI_ACTION_TASK_TYPES = ['TASK', 'FOLLOW_UP'] as const;
export const AI_ACTION_LIMITS = { title: 255, details: 1000, reason: 300 } as const;

export type AiActionStage = (typeof AI_ACTION_STAGES)[number];

export interface CreateApplicationProposal { action: 'create_application'; priority: (typeof AI_ACTION_PRIORITIES)[number] | null; reason: string | null }
export interface CreateTaskProposal {
  action: 'create_task'; title: string; details: string | null; due_date: string | null;
  priority: (typeof AI_ACTION_PRIORITIES)[number]; task_type: (typeof AI_ACTION_TASK_TYPES)[number]; reason: string | null;
}
export interface SetStatusProposal { action: 'set_status'; stage: AiActionStage | null; outcome: (typeof AI_ACTION_OUTCOMES)[number] | null; reason: string | null }
export type ActionProposal = CreateApplicationProposal | CreateTaskProposal | SetStatusProposal;

export type ProposalResult = { ok: true; value: ActionProposal; normalized: Record<string, string> } | { ok: false; code: string; message: string };

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const KEYS: Record<AiActionType, readonly string[]> = {
  create_application: ['priority', 'reason'],
  create_task: ['title', 'details', 'due_date', 'priority', 'task_type', 'reason'],
  set_status: ['stage', 'outcome', 'reason'],
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const clean = (v: string) => v.normalize('NFC').replace(CONTROL, '').trim();
export const isActionType = (v: unknown): v is AiActionType => typeof v === 'string' && (AI_ACTION_TYPES as readonly string[]).includes(v);

function optText(v: unknown, max: number, name: string): { ok: true; value: string | null } | { ok: false; message: string } {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== 'string') return { ok: false, message: `${name} must be a string` };
  const s = clean(v);
  if (!s) return { ok: true, value: null };
  if ([...s].length > max) return { ok: false, message: `${name} must be at most ${max} characters` };
  return { ok: true, value: s };
}
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

/**
 * Strict: unknown keys, wrong types and out-of-vocabulary values are REJECTED (not stripped), so a provider
 * cannot smuggle `application_id`, `sql`, `status`, `workspace_id` or any other hidden field through `proposed`.
 */
export function validateActionProposal(action: AiActionType, proposed: unknown): ProposalResult {
  const bad = (message: string): ProposalResult => ({ ok: false, code: 'ACTION_VALIDATION_FAILED', message });
  if (!isObj(proposed)) return bad('proposed must be an object');
  for (const k of Object.keys(proposed)) if (!KEYS[action].includes(k)) return bad(`proposed.${k} is not allowed for ${action}`);
  const reason = optText(proposed.reason, AI_ACTION_LIMITS.reason, 'reason');
  if (!reason.ok) return bad(reason.message);
  const priority = proposed.priority;
  if (priority !== undefined && priority !== null && !(AI_ACTION_PRIORITIES as readonly unknown[]).includes(priority)) return bad('priority must be LOW, MEDIUM or HIGH');

  if (action === 'create_application') {
    const value: CreateApplicationProposal = { action, priority: (priority as CreateApplicationProposal['priority']) ?? null, reason: reason.value };
    return { ok: true, value, normalized: compact({ priority: value.priority, reason: value.reason }) };
  }
  if (action === 'set_status') {
    const stage = proposed.stage ?? null;
    const outcome = proposed.outcome ?? null;
    if ((stage === null) === (outcome === null)) return bad('exactly one of stage or outcome is required');
    if (stage !== null && !(AI_ACTION_STAGES as readonly unknown[]).includes(stage)) return bad('stage is not an existing workflow stage');
    if (outcome !== null && !(AI_ACTION_OUTCOMES as readonly unknown[]).includes(outcome)) return bad('outcome must be REJECTED');
    const value: SetStatusProposal = { action, stage: stage as AiActionStage | null, outcome: outcome as SetStatusProposal['outcome'], reason: reason.value };
    return { ok: true, value, normalized: compact({ stage: value.stage, outcome: value.outcome, reason: value.reason }) };
  }
  const title = optText(proposed.title, AI_ACTION_LIMITS.title, 'title');
  if (!title.ok) return bad(title.message);
  if (!title.value) return bad('title is required');
  const details = optText(proposed.details, AI_ACTION_LIMITS.details, 'details');
  if (!details.ok) return bad(details.message);
  const due = proposed.due_date ?? null;
  if (due !== null && (typeof due !== 'string' || !isDate(due))) return bad('due_date must be a valid YYYY-MM-DD date');
  const taskType = proposed.task_type ?? 'TASK';
  if (!(AI_ACTION_TASK_TYPES as readonly unknown[]).includes(taskType)) return bad('task_type must be TASK or FOLLOW_UP');
  const value: CreateTaskProposal = {
    action, title: title.value, details: details.value, due_date: due as string | null,
    priority: (priority as CreateTaskProposal['priority']) ?? 'MEDIUM', task_type: taskType as CreateTaskProposal['task_type'], reason: reason.value,
  };
  return { ok: true, value, // the stored proposal keeps only what the provider actually said; defaults are applied when the action is previewed
    normalized: compact({ title: value.title, details: value.details, due_date: value.due_date, priority: (priority as string | undefined) ?? null, task_type: proposed.task_type === undefined ? null : value.task_type, reason: value.reason }) };
}

function compact(o: Record<string, string | null>): Record<string, string> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as Record<string, string>;
}
