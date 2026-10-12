// AI-8: human-approved controlled actions.
//
//   AI proposes (ai_suggestions) -> JobQuest PREVIEWS (read-only) -> the human CONFIRMS (a separate, explicit
//   request) -> JobQuest re-reads everything, re-checks authorization and the state fingerprint -> claims the
//   idempotency identity -> performs the mutation through the EXISTING core paths AS THE CALLER (RLS inserts for
//   applications/tasks, the stage/outcome RPCs for status) -> records provenance (ai_action_executions).
//
// There is NO unattended path: nothing here is callable from MCP, a scheduler or a provider payload, and the
// provider cannot choose workspace, user, application id, task id, authorization or executability.
//
// Authorization: every read and every core mutation runs with the caller's own access token (userClient), so RLS,
// triggers and the core RPCs' own checks are the only authority; there is no AI privilege and no service-role
// mutation of core tables. The service-role client is used ONLY for the two provenance RPCs, with the actor id
// the API derived from the verified session (the RPCs re-verify ownership and ACTIVE membership).
//
// Idempotency: rpc_ai_action_claim serialises per suggestion; unique partial indexes allow at most one live
// (PENDING|SUCCEEDED) execution per suggestion, per idempotency key and per converted job lead.
import { randomUUID } from 'node:crypto';
import { admin as adminClient, userClient } from '../lib/db';
import { isAiHubServerEnabled } from '../lib/aiHubConfig';
import {
  AI_ACTION_TYPES, canonicalJson, canonicalizeUrl, isActionType, sha256Hex, validateActionProposal,
  type ActionProposal, type AiActionType, type CreateApplicationProposal, type CreateTaskProposal, type SetStatusProposal,
} from '../lib/aiContract';
import { digestDateInZone, resolveOwnerTimeZone } from './aiDigestService';
import { UUID } from './aiReadSupport';
import {
  emptyHints, matchApplications, type AiApplicationMatch, type AiAppSummary, type AiMatchHints, type MatchClient,
} from './aiApplicationMatchService';

// ---- contracts --------------------------------------------------------------------------------------------

export const AI_ACTION_ERROR_CODES = [
  'ACTION_NOT_SUPPORTED', 'ACTION_UNAUTHORIZED', 'ACTION_STALE', 'ACTION_AMBIGUOUS', 'ACTION_ALREADY_EXECUTED',
  'ACTION_TARGET_NOT_FOUND', 'ACTION_VALIDATION_FAILED', 'ACTION_CONFLICT', 'ACTION_EXECUTION_FAILED',
] as const;
export type AiActionErrorCode = (typeof AI_ACTION_ERROR_CODES)[number] | 'AI_HUB_DISABLED' | 'INVALID_CONTEXT' | 'READ_FAILED';

export interface AiActionError {
  code: AiActionErrorCode;
  /** Safe, user-facing text. Never a raw database message. */
  message: string;
  /** Set on ACTION_ALREADY_EXECUTED / duplicate conflicts so the UI can offer "open it". */
  existing?: { targetType: 'application' | 'task'; targetId: string } | null;
}
export type AiActionResult<T> = { ok: true; data: T } | { ok: false; error: AiActionError };

export interface AiActionContext {
  /** From trusted server code (the verified session + the workspace the UI is in); never from a provider payload. */
  workspaceId: string;
  userId: string;
  accessToken?: string;
  correlationId?: string;
}
/** DB surface: `.from()` / `.rpc()` as the caller (RLS). */
export type AiActionClient = MatchClient & { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> }; // eslint-disable-line @typescript-eslint/no-explicit-any
/** Service-role surface: provenance RPCs only. */
export type AiActionServiceClient = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> }; // eslint-disable-line @typescript-eslint/no-explicit-any
export interface AiActionDeps {
  client?: AiActionClient;
  service?: AiActionServiceClient;
  env?: Record<string, string | undefined>;
  now?: () => Date;
  newId?: () => string;
}

export type AiMatchView = {
  result: AiApplicationMatch['result'];
  candidates: Array<{ id: string; company: string; title: string; stage: string; status: string; outcome: string | null; basis: string; jobUrl: string | null }>;
  selectedId: string | null;
};
export interface AiPreviewLine { label: string; value: string }
export interface AiActionPreview {
  suggestionId: string;
  findingId: string;
  action: AiActionType;
  /** Human-readable, action-specific summary ("Create application: Staff Engineer at Acme"). */
  summary: string;
  confirmLabel: string;
  provider: string;
  source: { kind: string; title: string; evidence: string | null; priority: string; confidence: number | null; occurredAt: string | null; dueAt: string | null };
  /** READY: may be confirmed (possibly after the human picks something). ALREADY_EXECUTED / BLOCKED: nothing to confirm. */
  state: 'READY' | 'BLOCKED' | 'ALREADY_EXECUTED';
  blocked: { code: AiActionErrorCode; message: string } | null;
  existing: { targetType: 'application' | 'task'; targetId: string } | null;
  match: AiMatchView | null;
  current: AiPreviewLine[];
  proposed: AiPreviewLine[];
  warnings: string[];
  /** What the human must still decide before Confirm can succeed. */
  requires: { applicationSelection: boolean; duplicateConfirmation: boolean };
  /** Which choices the confirm request may use. */
  choices: { createNew: boolean; useExisting: boolean; noApplication: boolean };
  /** Safe, editable defaults (tasks only). */
  editable: { title: string; details: string | null; dueDate: string | null; priority: string; dueDateSource: 'suggestion' | 'finding_deadline' | 'none' } | null;
  /** Opaque state version; the confirm request must echo it. */
  fingerprint: string;
}

export interface AiConfirmInput {
  expectedFingerprint: string;
  decision?: 'create_new' | 'use_existing' | 'no_application';
  /** Must be one of the candidates the server found for THIS action; never an arbitrary id. */
  applicationId?: string | null;
  /** Explicit "I know a similar application exists; create another". Required for STRONG / AMBIGUOUS matches. */
  confirmDuplicate?: boolean;
  edits?: { title?: string; details?: string | null; dueDate?: string | null; priority?: string };
}
export interface AiActionOutcome {
  status: 'SUCCEEDED';
  executionId: string;
  action: AiActionType;
  targetType: 'application' | 'task';
  targetId: string;
  /** created | linked_existing | stage_changed | closed */
  result: string;
  message: string;
}

// ---- small helpers ------------------------------------------------------------------------------------------

const ok = <T,>(data: T): AiActionResult<T> => ({ ok: true, data });
const MESSAGES: Record<AiActionErrorCode, string> = {
  ACTION_NOT_SUPPORTED: 'This kind of suggestion cannot be applied from JobQuest.',
  ACTION_UNAUTHORIZED: 'You no longer have permission to perform this action.',
  ACTION_STALE: 'The underlying record changed. Review the updated action before confirming.',
  ACTION_AMBIGUOUS: 'More than one existing application matches. Choose which one this action is for.',
  ACTION_ALREADY_EXECUTED: 'This action was already completed.',
  ACTION_TARGET_NOT_FOUND: 'The suggestion or its target could not be found.',
  ACTION_VALIDATION_FAILED: 'This action cannot be applied as proposed.',
  ACTION_CONFLICT: 'This action conflicts with the current state of the record.',
  ACTION_EXECUTION_FAILED: 'The action could not be completed. Nothing was changed. You can review it and try again.',
  AI_HUB_DISABLED: 'AI Hub is disabled on this server.',
  INVALID_CONTEXT: 'Invalid request context.',
  READ_FAILED: 'AI data could not be read.',
};
export const aiActionError = (code: AiActionErrorCode, message?: string, existing?: AiActionError['existing']): { ok: false; error: AiActionError } =>
  ({ ok: false, error: { code, message: message ?? MESSAGES[code], ...(existing !== undefined ? { existing } : {}) } });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.normalize('NFC').replace(CONTROL, '').trim();
  return s ? [...s].slice(0, max).join('') : null;
};
/** Mirrors the 2-minute grace in rpc_ai_action_claim. */
const STALE_PENDING_MS = 2 * 60_000;
const OPEN_FINDING = new Set(['NEW', 'REVIEWED', 'ACCEPTED']);

const STAGE_LABELS: Record<string, string> = {
  SAVED: 'Saved', PREPARING: 'Preparing', APPLIED: 'Applied', ASSESSMENT: 'Assessment', RECRUITER_SCREEN: 'Recruiter screen',
  INTERVIEW: 'Interview', FINAL_INTERVIEW: 'Final interview', OFFER: 'Offer',
};
export const stageLabel = (s: string | null | undefined) => (s ? STAGE_LABELS[s] ?? s : '');
const OUTCOME_LABELS: Record<string, string> = { REJECTED: 'Rejected' };
const ACTION_NOUN: Record<AiActionType, string> = { create_application: 'Create application', create_task: 'Create task', set_status: 'Change status' };

interface Prepared { ok: true; db: AiActionClient; service: AiActionServiceClient; now: () => Date; newId: () => string }
function prepare(ctx: AiActionContext, deps: AiActionDeps): Prepared | { ok: false; error: AiActionError } {
  if (!isAiHubServerEnabled(deps.env)) return aiActionError('AI_HUB_DISABLED');
  if (typeof ctx?.workspaceId !== 'string' || !UUID.test(ctx.workspaceId) || typeof ctx.userId !== 'string' || !UUID.test(ctx.userId)) return aiActionError('INVALID_CONTEXT');
  if (!deps.client && (typeof ctx.accessToken !== 'string' || ctx.accessToken.length < 20)) return aiActionError('INVALID_CONTEXT');
  try {
    return {
      ok: true,
      db: deps.client ?? (userClient(ctx.accessToken!) as unknown as AiActionClient),
      service: deps.service ?? (adminClient() as unknown as AiActionServiceClient),
      now: deps.now ?? (() => new Date()),
      newId: deps.newId ?? randomUUID,
    };
  } catch { return aiActionError('READ_FAILED'); }
}

/** First SCREAMING_CASE token of a database exception message (our RPCs raise stable codes). */
const dbCode = (e: { message?: string; code?: string } | null | undefined): string => /^[A-Z][A-Z0-9_]+/.exec((e?.message ?? '').trim())?.[0] ?? '';
function mapDbFailure(e: { message?: string; code?: string } | null | undefined): AiActionError['code'] {
  const code = dbCode(e);
  if (code === 'ACTION_STALE' || e?.code === '40001') return 'ACTION_STALE';
  if (code === 'ACTION_CONFLICT' || code === 'STAGE_UNCHANGED') return 'ACTION_CONFLICT';
  if (code === 'APPLICATION_NOT_FOUND') return 'ACTION_TARGET_NOT_FOUND';
  if (code === 'NOT_AUTHORIZED' || code === 'NOT_AUTHENTICATED' || code === 'WORKSPACE_ACCESS_DENIED' || e?.code === '42501') return 'ACTION_UNAUTHORIZED';
  if (e?.code === '23505') return 'ACTION_CONFLICT';
  if (e?.code === '23514' || e?.code === '22001' || e?.code === '22023' || e?.code === '23502' || code.startsWith('INVALID_')) return 'ACTION_VALIDATION_FAILED';
  return 'ACTION_EXECUTION_FAILED';
}

const matchView = (m: AiApplicationMatch): AiMatchView => ({
  result: m.result,
  candidates: m.candidates.slice(0, 10).map((c) => ({
    id: c.application.id, company: c.application.company, title: c.application.title, stage: c.application.stage,
    status: c.application.status, outcome: c.application.outcome, basis: c.basis, jobUrl: c.application.jobUrl,
  })),
  selectedId: m.selected?.id ?? null,
});
const matchSignature = (m: AiApplicationMatch) => ({ r: m.result, c: m.candidates.map((c) => [c.application.id, c.application.updatedAt, c.application.stage, c.application.status]) });
const appLine = (a: AiAppSummary) => `${a.company} — ${a.title}`;
const fingerprintOf = (parts: unknown) => sha256Hex(canonicalJson(parts));

// ---- loading ------------------------------------------------------------------------------------------------

const SUGGESTION_COLUMNS = 'id, user_id, finding_id, action, status, proposed, confidence, created_at, updated_at';
const FINDING_COLUMNS = 'id, user_id, kind, provider, status, priority, title, summary, evidence, confidence, occurred_at, due_at, application_id, payload, created_at, updated_at';
const LEAD_COLUMNS = 'finding_id, company, title, location, work_arrangement, employment_type, source_name, source_url, canonical_url, external_job_id, posted_date, discovered_at, salary_min, salary_max, salary_currency, salary_period, description, description_truncated, required_skills, preferred_skills, updated_at';

interface Bundle { suggestion: Row; finding: Row; lead: Row | null; calendar: Row | null }

async function loadBundle(db: AiActionClient, ctx: AiActionContext, suggestionId: string): Promise<AiActionResult<Bundle>> {
  if (typeof suggestionId !== 'string' || !UUID.test(suggestionId)) return aiActionError('ACTION_TARGET_NOT_FOUND');
  const sug = await db.from('ai_suggestions').select(SUGGESTION_COLUMNS).eq('id', suggestionId.toLowerCase()).eq('workspace_id', ctx.workspaceId).maybeSingle();
  if (sug.error) return aiActionError('READ_FAILED');
  // Owner-only: a manager (who may READ a member's AI rows) cannot preview or confirm that member's action, and a
  // row the caller cannot read at all is indistinguishable from a missing one.
  if (!sug.data || sug.data.user_id !== ctx.userId) return aiActionError('ACTION_TARGET_NOT_FOUND');
  const fin = await db.from('ai_findings').select(FINDING_COLUMNS).eq('id', sug.data.finding_id).eq('workspace_id', ctx.workspaceId).maybeSingle();
  if (fin.error) return aiActionError('READ_FAILED');
  if (!fin.data || fin.data.user_id !== ctx.userId) return aiActionError('ACTION_TARGET_NOT_FOUND');
  let lead: Row | null = null;
  let calendar: Row | null = null;
  if (fin.data.kind === 'job_lead') {
    const r = await db.from('ai_job_leads').select(LEAD_COLUMNS).eq('finding_id', fin.data.id).maybeSingle();
    if (r.error) return aiActionError('READ_FAILED');
    lead = r.data ?? null;
  } else if (fin.data.kind === 'calendar_event') {
    const r = await db.from('ai_calendar_events').select('finding_id, company, job_title, location').eq('finding_id', fin.data.id).maybeSingle();
    if (r.error) return aiActionError('READ_FAILED');
    calendar = r.data ?? null;
  }
  return ok({ suggestion: sug.data, finding: fin.data, lead, calendar });
}

/** Untrusted provider text becomes a matching HINT only; it never selects a record by itself. */
export function hintsOf(b: Bundle): AiMatchHints {
  const h = emptyHints();
  const f = b.finding, p = (f.payload && typeof f.payload === 'object' ? f.payload : {}) as Row;
  h.linkedApplicationId = typeof f.application_id === 'string' ? f.application_id : null;
  if (b.lead) {
    h.company = b.lead.company ?? null; h.title = b.lead.title ?? null; h.location = b.lead.location ?? null;
    h.arrangement = b.lead.work_arrangement ?? null; h.externalJobId = b.lead.external_job_id ?? null; h.sourceName = b.lead.source_name ?? null;
    h.urls = [b.lead.canonical_url, b.lead.source_url].filter((u): u is string => typeof u === 'string');
    h.referenceDate = b.lead.posted_date ? `${b.lead.posted_date}T00:00:00Z` : b.lead.discovered_at ?? null;
  } else if (b.calendar) {
    h.company = b.calendar.company ?? null; h.title = b.calendar.job_title ?? null; h.location = b.calendar.location ?? null;
  } else {
    h.company = clean(p.company, 200); h.title = clean(p.role_title, 300);
    if (typeof p.job_url === 'string') h.urls = [p.job_url];
  }
  if (!h.referenceDate) h.referenceDate = f.occurred_at ?? f.created_at ?? null;
  return h;
}

async function liveExecution(db: AiActionClient, suggestionId: string): Promise<Row | null> {
  const r = await db.from('ai_action_executions').select('id, status, action_type, target_type, target_id, requested_at')
    .eq('suggestion_id', suggestionId).in('status', ['PENDING', 'SUCCEEDED']).limit(1);
  return !r.error && Array.isArray(r.data) && r.data.length ? (r.data[0] as Row) : null;
}
async function conversionFor(db: AiActionClient, findingId: string): Promise<Row | null> {
  const r = await db.from('ai_action_executions').select('id, status, target_type, target_id, requested_at')
    .eq('finding_id', findingId).eq('action_type', 'create_application').in('status', ['PENDING', 'SUCCEEDED']).limit(1);
  return !r.error && Array.isArray(r.data) && r.data.length ? (r.data[0] as Row) : null;
}

// ---- planning (read-only) -------------------------------------------------------------------------------------

interface Plan {
  preview: AiActionPreview;
  /** What `execute` needs after the checks; never serialised to the client. */
  run: PlanRun;
}
type PlanRun =
  | { kind: 'create_application'; proposal: CreateApplicationProposal; app: Row | null; snapshot: Row | null; match: AiApplicationMatch; label: string }
  | { kind: 'create_task'; proposal: CreateTaskProposal; match: AiApplicationMatch; defaults: NonNullable<AiActionPreview['editable']>; findingTitle: string; provider: string }
  | { kind: 'set_status'; proposal: SetStatusProposal; match: AiApplicationMatch };

const ARRANGEMENT: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'Onsite' };
const EMPLOYMENT: Record<string, string> = { full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract' };

function baseSource(b: Bundle) {
  const f = b.finding;
  return {
    kind: String(f.kind), title: String(f.title), evidence: clean(f.evidence, 500), priority: String(f.priority),
    confidence: f.confidence === null || f.confidence === undefined ? null : Number(f.confidence), occurredAt: f.occurred_at ?? null, dueAt: f.due_at ?? null,
  };
}
function blank(b: Bundle, action: AiActionType, summary: string, fingerprint: string): AiActionPreview {
  return {
    suggestionId: b.suggestion.id, findingId: b.finding.id, action, summary, confirmLabel: ACTION_NOUN[action], provider: String(b.finding.provider),
    source: baseSource(b), state: 'READY', blocked: null, existing: null, match: null, current: [], proposed: [], warnings: [],
    requires: { applicationSelection: false, duplicateConfirmation: false }, choices: { createNew: false, useExisting: false, noApplication: false },
    editable: null, fingerprint,
  };
}
function blockedPlan(b: Bundle, action: AiActionType, code: AiActionErrorCode, message: string): Plan {
  const p = blank(b, action, ACTION_NOUN[action], fingerprintOf({ blocked: code, s: b.suggestion.updated_at, f: b.finding.updated_at }));
  p.state = 'BLOCKED'; p.blocked = { code, message };
  return { preview: p, run: { kind: 'set_status', proposal: { action: 'set_status', stage: null, outcome: null, reason: null }, match: { result: 'NONE', candidates: [], selected: null } } };
}

function mapApplicationFields(lead: Row, priority: string): { app: Row | null; snapshot: Row | null; warnings: string[]; error?: string } {
  const warnings: string[] = [];
  const company = clean(lead.company, 400), title = clean(lead.title, 400);
  if (!company || !title) return { app: null, snapshot: null, warnings, error: 'The job lead has no company or title.' };
  if ([...company].length > 128 || [...title].length > 128) return { app: null, snapshot: null, warnings, error: 'The company or job title is too long to create an application.' };
  const app: Row = { company_name: company, role_title: title, stage: 'SAVED', priority };
  const location = clean(lead.location, 400);
  if (location) { app.location = [...location].slice(0, 128).join(''); if ([...location].length > 128) warnings.push('The location was shortened to fit.'); }
  if (lead.work_arrangement && ARRANGEMENT[lead.work_arrangement]) app.work_arrangement = ARRANGEMENT[lead.work_arrangement];
  if (lead.employment_type && EMPLOYMENT[lead.employment_type]) app.employment_type = EMPLOYMENT[lead.employment_type];
  else if (lead.employment_type) warnings.push('The employment type has no matching application value and was not copied.');
  const url = [lead.canonical_url, lead.source_url].find((u) => typeof u === 'string' && canonicalizeUrl(u));
  if (url) app.job_url = url;
  const ext = clean(lead.external_job_id, 400);
  if (ext) { if ([...ext].length <= 128) app.external_job_id = ext; else warnings.push('The external job id is too long and was not copied.'); }
  const source = clean(lead.source_name, 128);
  if (source) app.source = source;
  const lo = lead.salary_min, hi = lead.salary_max;
  if (lo !== null && lo !== undefined || hi !== null && hi !== undefined) {
    if (lead.salary_period === 'year' && lead.salary_currency) {
      if (lo !== null && lo !== undefined) app.salary_min = Number(lo);
      if (hi !== null && hi !== undefined) app.salary_max = Number(hi);
      app.salary_currency = lead.salary_currency;
    } else warnings.push('The published salary is not an annual amount, so it was not copied.');
  }
  const skills = [...(Array.isArray(lead.required_skills) ? lead.required_skills : []), ...(Array.isArray(lead.preferred_skills) ? lead.preferred_skills : [])]
    .filter((x): x is string => typeof x === 'string').slice(0, 40);
  const description = typeof lead.description === 'string' && lead.description.trim() ? lead.description : null;
  const snapshot = description || skills.length ? { job_description: description, skills: skills.length ? skills.join(', ') : null } : null;
  return { app, snapshot, warnings };
}

async function planCreateApplication(db: AiActionClient, ctx: AiActionContext, b: Bundle, proposal: CreateApplicationProposal): Promise<AiActionResult<Plan>> {
  const f = b.finding;
  if (f.kind !== 'job_lead' || !b.lead) return ok(blockedPlan(b, 'create_application', 'ACTION_VALIDATION_FAILED', 'Only a reviewed job lead can be turned into an application.'));
  const converted = f.application_id ? { targetType: 'application' as const, targetId: String(f.application_id) } : null;
  const conv = await conversionFor(db, f.id);
  const existingConv = converted ?? (conv?.status === 'SUCCEEDED' && conv.target_id ? { targetType: 'application' as const, targetId: String(conv.target_id) } : null);
  const fpBase = { a: 'create_application', s: b.suggestion.updated_at, f: f.updated_at, l: b.lead.updated_at, fa: f.application_id ?? null };
  const mapped = mapApplicationFields(b.lead, proposal.priority ?? 'MEDIUM');
  const label = `${b.lead.title} at ${b.lead.company}`;
  if (existingConv) {
    const p = blank(b, 'create_application', `Already converted: ${label}`, fingerprintOf({ ...fpBase, done: true }));
    p.state = 'ALREADY_EXECUTED'; p.existing = existingConv; p.blocked = { code: 'ACTION_ALREADY_EXECUTED', message: 'This job lead was already converted.' };
    return ok({ preview: p, run: { kind: 'create_application', proposal, app: null, snapshot: null, match: { result: 'NONE', candidates: [], selected: null }, label } });
  }
  // A PENDING row older than the claim grace period is reconciled by the claim (stale_pending), never blocked forever.
  if (conv?.status === 'PENDING' && Date.now() - Date.parse(String(conv.requested_at)) < STALE_PENDING_MS) {
    const p = blank(b, 'create_application', `In progress: ${label}`, fingerprintOf({ ...fpBase, pending: conv.id }));
    p.state = 'BLOCKED'; p.blocked = { code: 'ACTION_CONFLICT', message: 'This action is already being applied. Refresh in a moment.' };
    return ok({ preview: p, run: { kind: 'create_application', proposal, app: null, snapshot: null, match: { result: 'NONE', candidates: [], selected: null }, label } });
  }
  let match: AiApplicationMatch;
  try { match = await matchApplications(db, ctx.workspaceId, ctx.userId, hintsOf(b)); } catch { return aiActionError('READ_FAILED'); }
  const p = blank(b, 'create_application', `Create application: ${label}`, fingerprintOf({ ...fpBase, m: matchSignature(match) }));
  p.confirmLabel = 'Create application';
  p.match = matchView(match);
  p.warnings.push(...mapped.warnings);
  if (mapped.error || !mapped.app) {
    p.state = 'BLOCKED'; p.blocked = { code: 'ACTION_VALIDATION_FAILED', message: mapped.error ?? 'The job lead is incomplete.' };
    return ok({ preview: p, run: { kind: 'create_application', proposal, app: null, snapshot: null, match, label } });
  }
  const a = mapped.app;
  p.current = [{ label: 'Application', value: match.result === 'NONE' ? 'None found for this job' : `${match.candidates.length} possible existing match${match.candidates.length === 1 ? '' : 'es'}` }];
  p.proposed = [
    { label: 'Company', value: a.company_name }, { label: 'Title', value: a.role_title },
    ...(a.location ? [{ label: 'Location', value: a.location }] : []),
    ...(a.work_arrangement ? [{ label: 'Arrangement', value: a.work_arrangement }] : []),
    ...(a.employment_type ? [{ label: 'Employment type', value: a.employment_type }] : []),
    ...(a.job_url ? [{ label: 'Source URL', value: a.job_url }] : []),
    ...(a.salary_min !== undefined || a.salary_max !== undefined ? [{ label: 'Salary (published)', value: `${a.salary_min ?? ''}${a.salary_min !== undefined && a.salary_max !== undefined ? '–' : ''}${a.salary_max ?? ''} ${a.salary_currency} per year` }] : []),
    { label: 'Job description', value: mapped.snapshot?.job_description ? 'Included' : 'Not available' },
    { label: 'Discovered', value: String(b.lead.discovered_at).slice(0, 10) },
    { label: 'Initial stage', value: `${stageLabel(a.stage)} (no applied date is claimed)` },
  ];
  if (match.result === 'NONE') p.choices = { createNew: true, useExisting: false, noApplication: false };
  else {
    p.choices = { createNew: match.result !== 'EXACT', useExisting: true, noApplication: false };
    p.requires.duplicateConfirmation = match.result !== 'EXACT';
    p.requires.applicationSelection = match.result === 'AMBIGUOUS';
    p.warnings.push(match.result === 'EXACT' ? 'An application for this exact job already exists. Creating another is not offered.'
      : match.result === 'STRONG' ? 'A very similar application already exists. Review it before creating another.'
        : 'More than one existing application could be this job. Choose one, or explicitly create a new one.');
  }
  return ok({ preview: p, run: { kind: 'create_application', proposal, app: a, snapshot: mapped.snapshot, match, label } });
}

async function planCreateTask(db: AiActionClient, ctx: AiActionContext, b: Bundle, proposal: CreateTaskProposal, deps: Prepared): Promise<AiActionResult<Plan>> {
  const f = b.finding;
  let match: AiApplicationMatch;
  try { match = await matchApplications(db, ctx.workspaceId, ctx.userId, hintsOf(b)); } catch { return aiActionError('READ_FAILED'); }
  const tz = await resolveOwnerTimeZone(db, ctx.userId);
  let dueDate = proposal.due_date;
  let dueDateSource: 'suggestion' | 'finding_deadline' | 'none' = dueDate ? 'suggestion' : 'none';
  if (!dueDate && f.due_at && !Number.isNaN(Date.parse(f.due_at))) { dueDate = digestDateInZone(new Date(f.due_at), tz); dueDateSource = 'finding_deadline'; }
  const defaults = { title: proposal.title, details: proposal.details, dueDate, priority: proposal.priority, dueDateSource };
  const fp = fingerprintOf({ a: 'create_task', s: b.suggestion.updated_at, f: f.updated_at, fs: f.status, due: f.due_at ?? null, m: matchSignature(match) });
  const p = blank(b, 'create_task', `Create task: ${proposal.title}`, fp);
  p.editable = defaults;
  p.match = matchView(match);
  p.current = [{ label: 'Task', value: 'No task exists for this suggestion' }];
  p.proposed = [
    { label: 'Title', value: proposal.title },
    { label: 'Due date', value: dueDate ? `${dueDate}${dueDateSource === 'finding_deadline' ? ' (from the finding deadline)' : ''}` : 'None' },
    { label: 'Priority', value: proposal.priority },
    { label: 'Application', value: match.selected ? appLine(match.selected) : match.result === 'AMBIGUOUS' ? 'Not chosen yet' : 'None' },
    ...(proposal.details ? [{ label: 'Notes', value: proposal.details }] : []),
  ];
  p.choices = { createNew: true, useExisting: false, noApplication: match.result !== 'NONE' };
  p.requires.applicationSelection = match.result === 'AMBIGUOUS';
  if (match.result === 'AMBIGUOUS') p.warnings.push('More than one existing application could match. Choose one, or create the task without an application.');
  if (proposal.task_type === 'FOLLOW_UP' && match.result === 'NONE') p.warnings.push('No application was found, so this will be created as a regular task.');
  void deps;
  return ok({ preview: p, run: { kind: 'create_task', proposal, match, defaults, findingTitle: String(f.title), provider: String(f.provider) } });
}

async function planSetStatus(db: AiActionClient, ctx: AiActionContext, b: Bundle, proposal: SetStatusProposal): Promise<AiActionResult<Plan>> {
  const f = b.finding;
  let match: AiApplicationMatch;
  try { match = await matchApplications(db, ctx.workspaceId, ctx.userId, hintsOf(b)); } catch { return aiActionError('READ_FAILED'); }
  const proposedText = proposal.stage ? stageLabel(proposal.stage) : OUTCOME_LABELS[proposal.outcome!] ?? 'Closed';
  const fp = fingerprintOf({ a: 'set_status', s: b.suggestion.updated_at, f: f.updated_at, fs: f.status, v: proposal.stage ?? proposal.outcome, m: matchSignature(match) });
  const p = blank(b, 'set_status', proposal.stage ? `Change status to ${proposedText}` : `Close application as ${proposedText}`, fp);
  p.confirmLabel = proposal.stage ? `Change status to ${proposedText}` : `Mark as ${proposedText}`;
  p.match = matchView(match);
  p.choices = { createNew: false, useExisting: true, noApplication: false };
  p.requires.applicationSelection = match.selected === null;
  const t = match.selected;
  p.current = t ? [{ label: 'Application', value: appLine(t) }, { label: 'Current', value: t.status === 'CLOSED' ? `Closed (${t.outcome ?? ''})`.trim() : stageLabel(t.stage) }] : [{ label: 'Application', value: match.result === 'AMBIGUOUS' ? 'More than one possible match — choose one' : 'No matching application found' }];
  p.proposed = [{ label: 'Proposed', value: proposedText }, ...(proposal.reason ? [{ label: 'Reason', value: proposal.reason }] : [])];
  if (match.result === 'NONE') { p.state = 'BLOCKED'; p.blocked = { code: 'ACTION_TARGET_NOT_FOUND', message: 'No existing application matches this suggestion, so there is nothing to change.' }; }
  else if (match.result === 'AMBIGUOUS') p.warnings.push('More than one existing application could match. Choose the one this applies to.');
  return ok({ preview: p, run: { kind: 'set_status', proposal, match } });
}

/** Everything read-only: used by the preview AND re-run at confirm so the decision is made on fresh state. */
async function buildPlan(deps: Prepared, ctx: AiActionContext, suggestionId: string): Promise<AiActionResult<Plan & { bundle: Bundle }>> {
  const loaded = await loadBundle(deps.db, ctx, suggestionId);
  if (!loaded.ok) return loaded;
  const b = loaded.data;
  const action = b.suggestion.action;
  if (!isActionType(action)) return aiActionError('ACTION_NOT_SUPPORTED');
  const checked = validateActionProposal(action, b.suggestion.proposed ?? {});
  if (!checked.ok) return ok({ ...blockedPlan(b, action, 'ACTION_VALIDATION_FAILED', 'The proposed action is not valid.'), bundle: b });
  const proposal: ActionProposal = checked.value;

  // A sibling proposal to convert an already converted lead is SUPERSEDED by JobQuest: report it as "already converted".
  const done = b.suggestion.status === 'ACCEPTED' || (b.suggestion.status === 'SUPERSEDED' && action === 'create_application' && Boolean(b.finding.application_id));
  if (!done && b.suggestion.status !== 'PENDING') return ok({ ...blockedPlan(b, action, 'ACTION_CONFLICT', 'This suggestion was already decided.'), bundle: b });
  if (!OPEN_FINDING.has(String(b.finding.status))) {
    return ok({ ...blockedPlan(b, action, 'ACTION_CONFLICT', b.finding.status === 'DISMISSED' ? 'The source finding was dismissed, so its suggestions can no longer be applied.' : 'The source finding is no longer open.'), bundle: b });
  }
  if (done || (action !== 'create_application' && (await liveExecution(deps.db, b.suggestion.id))?.status === 'SUCCEEDED')) {
    const ex = (await liveExecution(deps.db, b.suggestion.id)) ?? (await conversionFor(deps.db, b.finding.id));
    const plan = blank(b, action, `${ACTION_NOUN[action]} — already completed`, fingerprintOf({ done: true, s: b.suggestion.updated_at }));
    plan.state = 'ALREADY_EXECUTED'; plan.blocked = { code: 'ACTION_ALREADY_EXECUTED', message: MESSAGES.ACTION_ALREADY_EXECUTED };
    plan.existing = ex?.target_id ? { targetType: ex.target_type === 'task' ? 'task' : 'application', targetId: String(ex.target_id) } : null;
    return ok({ preview: plan, run: { kind: 'set_status', proposal: { action: 'set_status', stage: null, outcome: null, reason: null }, match: { result: 'NONE', candidates: [], selected: null } }, bundle: b });
  }

  let planned: AiActionResult<Plan>;
  if (action === 'create_application') planned = await planCreateApplication(deps.db, ctx, b, proposal as CreateApplicationProposal);
  else if (action === 'create_task') planned = await planCreateTask(deps.db, ctx, b, proposal as CreateTaskProposal, deps);
  else planned = await planSetStatus(deps.db, ctx, b, proposal as SetStatusProposal);
  return planned.ok ? ok({ ...planned.data, bundle: b }) : planned;
}

// ---- preview (read-only) ------------------------------------------------------------------------------------------

export async function previewAiAction(ctx: AiActionContext, suggestionId: string, deps: AiActionDeps = {}): Promise<AiActionResult<AiActionPreview>> {
  const p = prepare(ctx, deps);
  if (!p.ok) return p;
  const plan = await buildPlan(p, ctx, suggestionId);
  return plan.ok ? ok(plan.data.preview) : plan;
}

// ---- execution ----------------------------------------------------------------------------------------------------

const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

type Claim = { outcome: 'claimed' | 'already_succeeded' | 'in_progress' | 'stale_pending'; executionId: string; targetType: string | null; targetId: string | null };
async function claim(p: Prepared, ctx: AiActionContext, plan: Plan, key: string, targetType: 'application' | 'task' | null, targetId: string | null, before: Row): Promise<AiActionResult<Claim>> {
  const { data, error } = await p.service.rpc('rpc_ai_action_claim', {
    p_actor_id: ctx.userId, p_suggestion_id: plan.preview.suggestionId, p_action_type: plan.preview.action, p_target_type: targetType,
    p_target_id: targetId, p_idempotency_key: key, p_fingerprint: plan.preview.fingerprint, p_before: before, p_correlation_id: ctx.correlationId ?? null,
  });
  if (error) {
    const c = dbCode(error);
    if (c === 'AI_SUGGESTION_NOT_FOUND') return aiActionError('ACTION_TARGET_NOT_FOUND');
    if (c === 'WORKSPACE_ACCESS_DENIED') return aiActionError('ACTION_UNAUTHORIZED');
    if (c === 'AI_SUGGESTION_INVALID_TRANSITION' || c === 'AI_FINDING_CLOSED') return aiActionError('ACTION_CONFLICT', 'This suggestion can no longer be applied.');
    if (c === 'AI_ACTION_NOT_SUPPORTED') return aiActionError('ACTION_NOT_SUPPORTED');
    if (error.code === '23505') return aiActionError('ACTION_ALREADY_EXECUTED');
    return aiActionError('ACTION_EXECUTION_FAILED');
  }
  if (!data || typeof data !== 'object' || typeof data.outcome !== 'string' || typeof data.execution_id !== 'string') return aiActionError('ACTION_EXECUTION_FAILED');
  return ok({ outcome: data.outcome, executionId: data.execution_id, targetType: data.target_type ?? null, targetId: data.target_id ?? null });
}
async function complete(p: Prepared, ctx: AiActionContext, executionId: string, status: 'SUCCEEDED' | 'FAILED' | 'CONFLICT', targetType: string | null, targetId: string | null, after: Row, errorCategory: string | null, result: string): Promise<boolean> {
  const { error } = await p.service.rpc('rpc_ai_action_complete', {
    p_actor_id: ctx.userId, p_execution_id: executionId, p_status: status, p_target_type: targetType, p_target_id: targetId,
    p_after: after, p_error_category: errorCategory, p_result: result,
  });
  return !error;
}

/** Footer line of an AI-created task: ties the task to its execution so a crash between insert and record is reconcilable. */
const TASK_REF_PREFIX = 'AI Hub action ref: ';

/** The record a PENDING execution may already have created, or null. */
async function findCreated(db: AiActionClient, kind: PlanRun['kind'], userId: string, c: Claim): Promise<{ type: 'application' | 'task'; id: string } | null> {
  try { return await findCreatedUnsafe(db, kind, userId, c); } catch { return null; } // a lookup problem is "unknown", never a crash
}
async function findCreatedUnsafe(db: AiActionClient, kind: PlanRun['kind'], userId: string, c: Claim): Promise<{ type: 'application' | 'task'; id: string } | null> {
  if (kind === 'create_task') {
    const r = await db.from('tasks').select('id').eq('user_id', userId).ilike('details', `%${TASK_REF_PREFIX}${c.executionId}%`).limit(1);
    return !r.error && Array.isArray(r.data) && r.data.length ? { type: 'task', id: String(r.data[0].id) } : null;
  }
  if (kind === 'create_application' && c.targetId) {
    const r = await db.from('applications').select('id').eq('id', c.targetId).maybeSingle();
    return !r.error && r.data ? { type: 'application', id: c.targetId } : null;
  }
  return null;
}

function resolveTarget(plan: Plan, match: AiApplicationMatch, input: AiConfirmInput): { ok: true; app: AiAppSummary | null } | { ok: false; error: AiActionError } {
  const wanted = typeof input.applicationId === 'string' ? input.applicationId.toLowerCase() : null;
  if (wanted) {
    const found = match.candidates.find((c) => c.application.id === wanted);
    if (!found) return aiActionError('ACTION_VALIDATION_FAILED', 'That application is not one of the matches for this action.');
    return { ok: true, app: found.application };
  }
  void plan;
  if (match.result === 'AMBIGUOUS') return aiActionError('ACTION_AMBIGUOUS');
  return { ok: true, app: match.selected };
}

export async function confirmAiAction(ctx: AiActionContext, suggestionId: string, input: AiConfirmInput, deps: AiActionDeps = {}): Promise<AiActionResult<AiActionOutcome>> {
  const p = prepare(ctx, deps);
  if (!p.ok) return p;
  if (!input || typeof input.expectedFingerprint !== 'string' || input.expectedFingerprint.length < 8) return aiActionError('ACTION_VALIDATION_FAILED', 'The review is out of date. Open the action again.');

  // 1. Re-read EVERYTHING (never trust preview data from the browser) and re-check state.
  const built = await buildPlan(p, ctx, suggestionId);
  if (!built.ok) return built;
  const plan = built.data;
  const { preview } = plan;
  if (preview.state === 'ALREADY_EXECUTED') return aiActionError('ACTION_ALREADY_EXECUTED', undefined, preview.existing);
  if (preview.blocked) return aiActionError(preview.blocked.code, preview.blocked.message);
  if (preview.fingerprint !== input.expectedFingerprint) return aiActionError('ACTION_STALE');

  const run = plan.run;
  const suggestion = built.data.bundle.suggestion;
  const finding = built.data.bundle.finding;

  // 2. Per-action decision + validation (no writes yet).
  let targetType: 'application' | 'task';
  // Applications get a server-generated id BEFORE the mutation (recovery key). `tasks.id` is not client-writable (column
  // grants), so a task is reconciled through the execution reference embedded in its notes instead.
  let targetId: string | null;
  let key: string;
  let before: Row;
  let doMutation: (executionId: string) => Promise<{ ok: true; after: Row; resultKind: string; message: string; createdId?: string } | { ok: false; code: AiActionError['code']; recorded: 'FAILED' | 'CONFLICT' }>;

  if (run.kind === 'create_application') {
    const decision = input.decision ?? 'create_new';
    if (decision === 'no_application') return aiActionError('ACTION_VALIDATION_FAILED');
    if (decision === 'use_existing') {
      const explicit = typeof input.applicationId === 'string' ? input.applicationId.toLowerCase() : null;
      const wanted = explicit ?? run.match.selected?.id ?? null;
      const found = run.match.candidates.find((c) => c.application.id === wanted);
      if (explicit && !found) return aiActionError('ACTION_VALIDATION_FAILED', 'That application is not one of the matches for this action.');
      if (!found) return run.match.result === 'AMBIGUOUS' ? aiActionError('ACTION_AMBIGUOUS') : aiActionError('ACTION_VALIDATION_FAILED', 'Choose one of the existing applications.');
      targetType = 'application'; targetId = found.application.id;
      key = fingerprintOf({ w: ctx.workspaceId, s: suggestion.id, a: 'create_application', t: `finding:${finding.id}` });
      before = { label: run.label, decision: 'use_existing', match: run.match.result };
      doMutation = async () => ({ ok: true, after: { label: appLine(found.application), result: 'linked_existing' }, resultKind: 'linked_existing', message: `Linked to the existing application ${appLine(found.application)}.` });
    } else {
      if (decision !== 'create_new' || !run.app) return aiActionError('ACTION_VALIDATION_FAILED');
      if (run.match.result === 'EXACT') return aiActionError('ACTION_CONFLICT', 'An application for this exact job already exists, so another one was not created.', { targetType: 'application', targetId: run.match.selected!.id });
      if (run.match.result !== 'NONE' && input.confirmDuplicate !== true) {
        return run.match.result === 'AMBIGUOUS' ? aiActionError('ACTION_AMBIGUOUS') : aiActionError('ACTION_CONFLICT', 'A very similar application already exists. Open it, or explicitly confirm that you want another one.', { targetType: 'application', targetId: run.match.selected!.id });
      }
      targetType = 'application'; targetId = p.newId();
      key = fingerprintOf({ w: ctx.workspaceId, s: suggestion.id, a: 'create_application', t: `finding:${finding.id}` });
      before = { label: run.label, decision: 'create_new', match: run.match.result };
      const newId = targetId;
      doMutation = async () => {
        const row = { id: newId, workspace_id: ctx.workspaceId, user_id: ctx.userId, ...run.app!, duplicate_override_flag: run.match.result !== 'NONE' };
        const ins = await p.db.from('applications').insert(row).select('id').single();
        if (ins.error) return { ok: false, code: mapDbFailure(ins.error), recorded: mapDbFailure(ins.error) === 'ACTION_CONFLICT' ? 'CONFLICT' : 'FAILED' };
        let message = `Created the application ${run.label}.`;
        if (run.snapshot) {
          const snap = await p.db.from('job_snapshots').insert({ application_id: newId, workspace_id: ctx.workspaceId, ...run.snapshot, raw_payload: { source: 'ai_hub_action', version: 1 } });
          if (snap.error) message += ' The job description could not be saved.';
        }
        return { ok: true, after: { label: run.label, result: 'created' }, resultKind: 'created', message };
      };
    }
  } else if (run.kind === 'create_task') {
    const edits = input.edits ?? {};
    const title = edits.title === undefined ? run.defaults.title : clean(edits.title, 255);
    if (!title) return aiActionError('ACTION_VALIDATION_FAILED', 'A task title is required.');
    const dueRaw = edits.dueDate === undefined ? run.defaults.dueDate : edits.dueDate;
    if (dueRaw !== null && (typeof dueRaw !== 'string' || !isDate(dueRaw))) return aiActionError('ACTION_VALIDATION_FAILED', 'The due date is not a valid date.');
    const priority = edits.priority === undefined ? run.defaults.priority : edits.priority;
    if (typeof priority !== 'string' || !TASK_PRIORITIES.includes(priority)) return aiActionError('ACTION_VALIDATION_FAILED', 'The priority is not valid.');
    const detailsRaw = edits.details === undefined ? run.defaults.details : edits.details === null ? null : clean(edits.details, 1000);
    let app: AiAppSummary | null;
    if (input.decision === 'no_application') app = null;
    else { const t = resolveTarget(plan, run.match, input); if (!t.ok) return t; app = t.app; }
    const taskType = run.proposal.task_type === 'FOLLOW_UP' && app ? 'FOLLOW_UP' : 'TASK';
    const details = [detailsRaw, `Source: AI Hub (${run.provider}) — ${run.findingTitle}`].filter(Boolean).join('\n\n').slice(0, 5000);
    targetType = 'task'; targetId = null;
    key = fingerprintOf({ w: ctx.workspaceId, s: suggestion.id, a: 'create_task', t: 'task' });
    before = { label: title, application: app?.id ?? null, match: run.match.result };
    doMutation = async (executionId) => {
      const row = {
        workspace_id: ctx.workspaceId, user_id: ctx.userId, task_type: taskType, title, due_date: dueRaw, priority,
        details: `${details}
${TASK_REF_PREFIX}${executionId}`.slice(0, 5000), application_id: app?.id ?? null,
      };
      const ins = await p.db.from('tasks').insert(row).select('id').single();
      if (ins.error || !ins.data?.id) return { ok: false, code: mapDbFailure(ins.error), recorded: 'FAILED' };
      return { ok: true, after: { label: title, result: 'created' }, resultKind: 'created', message: `Created the task “${title}”.`, createdId: String(ins.data.id) };
    };
  } else {
    const t = resolveTarget(plan, run.match, input);
    if (!t.ok) return t;
    const app = t.app;
    if (!app) return aiActionError('ACTION_TARGET_NOT_FOUND', 'No matching application was found.');
    if (app.status !== 'OPEN') return aiActionError('ACTION_CONFLICT', 'This application is already closed, so its status was not changed.');
    if (run.proposal.stage && run.proposal.stage === app.stage) return aiActionError('ACTION_CONFLICT', 'This application is already at that stage.');
    targetType = 'application'; targetId = app.id;
    const value = run.proposal.stage ?? run.proposal.outcome!;
    key = fingerprintOf({ w: ctx.workspaceId, s: suggestion.id, a: 'set_status', t: `${app.id}:${value}` });
    before = { label: appLine(app), from: app.stage, to: value };
    doMutation = async () => {
      const r = await p.db.rpc('rpc_ai_apply_status_change', {
        p_application_id: app.id, p_expected_updated_at: app.updatedAt,
        p_new_stage: run.proposal.stage, p_new_outcome: run.proposal.outcome,
      });
      if (r.error) { const code = mapDbFailure(r.error); return { ok: false, code, recorded: code === 'ACTION_STALE' || code === 'ACTION_CONFLICT' ? 'CONFLICT' : 'FAILED' }; }
      const label = run.proposal.stage ? `Changed ${appLine(app)} to ${stageLabel(run.proposal.stage)}.` : `Marked ${appLine(app)} as Rejected.`;
      return { ok: true, after: { label: appLine(app), from: app.stage, to: value }, resultKind: run.proposal.stage ? 'stage_changed' : 'closed', message: label };
    };
  }

  // 3. Claim the idempotency identity (this is the gate that makes a double click / retry / second tab a no-op).
  const alreadyOutcome = (c: Claim) => aiActionError('ACTION_ALREADY_EXECUTED', undefined, c.targetId ? { targetType: c.targetType === 'task' ? 'task' : 'application', targetId: c.targetId } : null);
  let claimed = await claim(p, ctx, plan, key, targetType, targetId, before);
  if (!claimed.ok) return claimed;
  if (claimed.data.outcome === 'stale_pending') {
    // A previous attempt died between "mutate" and "record". The pre-generated target id tells us what happened.
    const prev = claimed.data;
    const happened = await findCreated(p.db, run.kind, ctx.userId, prev);
    if (happened) {
      await complete(p, ctx, prev.executionId, 'SUCCEEDED', happened.type, happened.id, { recovered: true }, null, 'created');
      return alreadyOutcome({ ...prev, targetType: happened.type, targetId: happened.id });
    }
    await complete(p, ctx, prev.executionId, 'FAILED', null, null, { abandoned: true }, 'ACTION_EXECUTION_FAILED', 'abandoned');
    claimed = await claim(p, ctx, plan, key, targetType, targetId, before);
    if (!claimed.ok) return claimed;
  }
  if (claimed.data.outcome === 'already_succeeded') return alreadyOutcome(claimed.data);
  if (claimed.data.outcome === 'in_progress') return aiActionError('ACTION_CONFLICT', 'This action is already being applied. Refresh in a moment.');
  if (claimed.data.outcome !== 'claimed') return aiActionError('ACTION_EXECUTION_FAILED');
  const executionId = claimed.data.executionId;

  // 4. The one core mutation, as the caller. A failure is recorded and NEVER marks the suggestion executed.
  let mutated: Awaited<ReturnType<typeof doMutation>>;
  try { mutated = await doMutation(executionId); } catch { mutated = { ok: false, code: 'ACTION_EXECUTION_FAILED', recorded: 'FAILED' }; }
  if (!mutated.ok && mutated.code === 'ACTION_EXECUTION_FAILED') {
    // An ambiguous failure (e.g. the response was lost after the write committed) must not be recorded as "nothing happened".
    const landed = await findCreated(p.db, run.kind, ctx.userId, { outcome: 'claimed', executionId, targetType, targetId });
    if (landed) {
      await complete(p, ctx, executionId, 'SUCCEEDED', landed.type, landed.id, { recovered: true }, null, 'created');
      return ok({ status: 'SUCCEEDED', executionId, action: preview.action, targetType: landed.type, targetId: landed.id, result: 'created', message: 'The change was applied.' });
    }
  }
  if (!mutated.ok) {
    await complete(p, ctx, executionId, mutated.recorded, null, null, { label: String(before.label ?? '') }, mutated.code, 'failed');
    return aiActionError(mutated.code);
  }
  const finalId = mutated.createdId ?? targetId;
  if (!finalId) return aiActionError('ACTION_EXECUTION_FAILED');
  const recorded = await complete(p, ctx, executionId, 'SUCCEEDED', targetType, finalId, mutated.after, null, mutated.resultKind);
  // The core change is already durable. If recording failed, the execution stays PENDING and the next claim reconciles it
  // from the pre-generated target id; the user still sees success because the mutation happened exactly once.
  void recorded;
  return ok({ status: 'SUCCEEDED', executionId, action: preview.action, targetType, targetId: finalId, result: mutated.resultKind, message: mutated.message });
}

// ---- queue + history (read-only, owner's own rows) -------------------------------------------------------------------

export const AI_ACTION_QUEUE_PAGE_SIZE = 10;
export interface AiActionQueueFilters { action?: AiActionType; provider?: string; kind?: string; dateFrom?: string; dateTo?: string }
export interface AiActionCard {
  suggestionId: string; findingId: string; action: AiActionType; summary: string; provider: string; kind: string; priority: string;
  confidence: number | null; evidence: string | null; findingTitle: string; createdAt: string;
  target: { match: AiMatchView['result'] | null; label: string | null };
}
export interface AiActionQueue { items: AiActionCard[]; page: number; pageSize: number; hasNext: boolean; pendingTotal: number }

const SOURCE_KINDS = ['job_lead', 'email_event', 'recruiter_intel', 'calendar_event', 'daily_brief', 'note', 'other'];
const PROVIDERS = ['claude', 'gemini', 'chatgpt', 'manual', 'system'];

export async function listAiActionQueue(ctx: AiActionContext, filters: AiActionQueueFilters = {}, page = 0, deps: AiActionDeps = {}): Promise<AiActionResult<AiActionQueue>> {
  const p = prepare(ctx, deps);
  if (!p.ok) return p;
  if (!Number.isInteger(page) || page < 0 || page > 500) return aiActionError('ACTION_VALIDATION_FAILED', 'Invalid page.');
  if (filters.action !== undefined && !isActionType(filters.action)) return aiActionError('ACTION_VALIDATION_FAILED', 'Invalid action filter.');
  if (filters.provider !== undefined && !PROVIDERS.includes(filters.provider)) return aiActionError('ACTION_VALIDATION_FAILED', 'Invalid provider filter.');
  if (filters.kind !== undefined && !SOURCE_KINDS.includes(filters.kind)) return aiActionError('ACTION_VALIDATION_FAILED', 'Invalid source filter.');
  for (const d of [filters.dateFrom, filters.dateTo]) if (d !== undefined && !isDate(d)) return aiActionError('ACTION_VALIDATION_FAILED', 'Invalid date filter.');
  const size = AI_ACTION_QUEUE_PAGE_SIZE;
  let q = p.db.from('ai_suggestions')
    .select('id, finding_id, action, proposed, confidence, created_at, ai_findings!inner(id, kind, provider, status, priority, title, evidence, confidence, application_id, payload, due_at, occurred_at)', { count: 'exact' })
    .eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.userId).eq('status', 'PENDING')
    .in('action', filters.action ? [filters.action] : [...AI_ACTION_TYPES])
    .in('ai_findings.status', [...OPEN_FINDING]);
  if (filters.provider) q = q.eq('ai_findings.provider', filters.provider);
  if (filters.kind) q = q.eq('ai_findings.kind', filters.kind);
  if (filters.dateFrom) q = q.gte('created_at', `${filters.dateFrom}T00:00:00Z`);
  if (filters.dateTo) q = q.lt('created_at', `${new Date(Date.parse(`${filters.dateTo}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)}T00:00:00Z`);
  const r = await q.order('created_at', { ascending: false }).order('id', { ascending: false }).range(page * size, page * size + size);
  if (r.error) return aiActionError('READ_FAILED');
  const rows = (r.data ?? []) as Row[];
  const visible = rows.slice(0, size);
  const ids = visible.map((x) => x.finding_id as string);
  const [leads, cals] = ids.length
    ? await Promise.all([
      p.db.from('ai_job_leads').select(LEAD_COLUMNS).in('finding_id', ids),
      p.db.from('ai_calendar_events').select('finding_id, company, job_title, location').in('finding_id', ids),
    ])
    : [{ data: [] }, { data: [] }] as { data: Row[] }[];
  const leadBy = new Map<string, Row>(((leads.data ?? []) as Row[]).map((x) => [x.finding_id, x]));
  const calBy = new Map<string, Row>(((cals.data ?? []) as Row[]).map((x) => [x.finding_id, x]));
  const items: AiActionCard[] = [];
  await Promise.all(visible.map(async (row, i) => {
    const f = row.ai_findings as Row;
    const checked = validateActionProposal(row.action, row.proposed ?? {});
    if (!checked.ok) return; // a legacy / malformed proposal is not actionable and is not shown
    const b: Bundle = { suggestion: row, finding: f, lead: leadBy.get(f.id) ?? null, calendar: calBy.get(f.id) ?? null };
    const v = checked.value;
    let summary: string;
    let target: AiActionCard['target'] = { match: null, label: null };
    if (v.action === 'create_task') summary = `Create task: ${v.title}`;
    else if (v.action === 'create_application') summary = b.lead ? `Create application: ${b.lead.title} at ${b.lead.company}` : 'Create application';
    else summary = v.stage ? `Change status to ${stageLabel(v.stage)}` : 'Mark application as Rejected';
    try {
      const m = await matchApplications(p.db, ctx.workspaceId, ctx.userId, hintsOf(b));
      target = { match: m.result, label: m.selected ? appLine(m.selected) : null };
    } catch { /* the card still renders; the review modal reports a read failure */ }
    items[i] = {
      suggestionId: row.id, findingId: f.id, action: v.action, summary, provider: String(f.provider), kind: String(f.kind), priority: String(f.priority),
      confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence), evidence: clean(f.evidence, 500),
      findingTitle: String(f.title), createdAt: String(row.created_at), target,
    };
  }));
  const shown = items.filter(Boolean);
  // On a single page the total is exactly what is listed (a legacy, non-actionable proposal is counted by the database but never shown).
  const pendingTotal = page === 0 && rows.length <= size ? shown.length : r.count ?? shown.length;
  return ok({ items: shown, page, pageSize: size, hasNext: rows.length > size, pendingTotal });
}

export interface AiActionHistoryItem {
  id: string; suggestionId: string; action: AiActionType; status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CONFLICT';
  targetType: 'application' | 'task' | null; targetId: string | null; label: string | null; errorCategory: string | null;
  requestedAt: string; completedAt: string | null;
}
export async function listAiActionHistory(ctx: AiActionContext, page = 0, deps: AiActionDeps = {}): Promise<AiActionResult<{ items: AiActionHistoryItem[]; page: number; pageSize: number; hasNext: boolean }>> {
  const p = prepare(ctx, deps);
  if (!p.ok) return p;
  if (!Number.isInteger(page) || page < 0 || page > 500) return aiActionError('ACTION_VALIDATION_FAILED', 'Invalid page.');
  const size = 20;
  const r = await p.db.from('ai_action_executions')
    .select('id, suggestion_id, action_type, status, target_type, target_id, error_category, before_snapshot, after_snapshot, requested_at, completed_at')
    .eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.userId)
    .order('requested_at', { ascending: false }).order('id', { ascending: false }).range(page * size, page * size + size);
  if (r.error) return aiActionError('READ_FAILED');
  const rows = (r.data ?? []) as Row[];
  return ok({
    items: rows.slice(0, size).map((x) => ({
      id: x.id, suggestionId: x.suggestion_id, action: x.action_type, status: x.status, targetType: x.target_type ?? null, targetId: x.target_id ?? null,
      label: clean((x.after_snapshot as Row)?.label ?? (x.before_snapshot as Row)?.label, 200), errorCategory: x.error_category ?? null,
      requestedAt: String(x.requested_at), completedAt: x.completed_at ?? null,
    })),
    page, pageSize: size, hasNext: rows.length > size,
  });
}
