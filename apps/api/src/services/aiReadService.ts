// AI-2B: provider-neutral, READ-ONLY server-side query service for AI Hub data
// (runs, findings, suggestions). Groundwork for AI-3 MCP and server automation.
//
// Authorization: every read runs AS THE CALLER through RLS (the user's own access
// token via userClient, or an injected client in tests). Never the service-role
// client, so the AI-1B policies (owner, plus ACTIVE manager visibility) remain the
// single authority. `workspaceId` is only a narrowing filter chosen by trusted
// server code; a forged id yields NOT_FOUND / empty results, never foreign data.
// There are no writes and no RPCs here. Mutation stays in the AI-1B RPCs.
import { nextCalendarDate } from '../lib/calendarDate';
import { DATE, dbFail, fail, num, parseFilters, parsePage, prepare, rec, s, sliced, sn, UUID } from './aiReadSupport';
import {
  AI_FINDING_KINDS, AI_FINDING_STATUSES, AI_PRIORITIES, AI_PROVIDERS, AI_RUN_STATUSES,
  AI_SUGGESTION_ACTIONS, AI_SUGGESTION_STATUSES, AI_WORKFLOWS,
  type AiErrorCategory, type AiFindingKind, type AiFindingStatus, type AiPriority, type AiProvider,
  type AiRunStatus, type AiSuggestionAction, type AiSuggestionStatus, type AiSuggestionTargetType,
  type AiTriggerType, type AiWorkflow, type JsonRecord,
} from '../lib/aiContract';

// ---- contracts --------------------------------------------------------------

/** Same model as the AI Hub UI (AI-1E): 20 rows per page, size+1 lookahead for `hasNext`. */
export const AI_READ_DEFAULT_PAGE_SIZE = 20;
/** Hard upper bound; larger requests are rejected (INVALID_FILTER), never silently unbounded. */
export const AI_READ_MAX_PAGE_SIZE = 50;
/** Offset pagination is bounded too (page index is 0-based). */
export const AI_READ_MAX_PAGE = 500;
/** Findings embedded in a run detail (one bounded query). */
export const AI_READ_RUN_DETAIL_FINDINGS = 50;
/** Digest payloads are large; digest pages are smaller than the generic AI pages. */
export const AI_DIGEST_DEFAULT_PAGE_SIZE = 7;
export const AI_DIGEST_MAX_PAGE_SIZE = 14;
/** A digest range may not exceed this many calendar days (history is paged, never unbounded). */
export const AI_DIGEST_MAX_RANGE_DAYS = 366;

export interface AiReadContext {
  /** Decided by trusted server code (session/workspace context), never taken from a URL or payload. */
  workspaceId: string;
  /** The caller's verified JobQuest access token; reads execute under RLS as this user. */
  accessToken?: string;
  correlationId?: string;
}

/** The only DB surface used: `.from(table).select(...)` (no rpc, no writes). */
export type AiReadClient = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface AiReadDeps {
  client?: AiReadClient;
  env?: Record<string, string | undefined>;
}

export interface AiPageRequest { page?: number; pageSize?: number }
export interface AiPage<T> { items: T[]; page: number; pageSize: number; hasNext: boolean }

export interface AiRunListFilters {
  status?: AiRunStatus; provider?: AiProvider; workflow?: AiWorkflow;
  createdSince?: string; createdBefore?: string; // ISO-8601 with offset
}
export interface AiFindingListFilters { status?: AiFindingStatus; kind?: AiFindingKind; priority?: AiPriority; runId?: string }
export interface AiSuggestionListFilters { status?: AiSuggestionStatus; findingId?: string; action?: AiSuggestionAction }

/** Digest dates are calendar dates (YYYY-MM-DD) in the digest owner's profile time zone, inclusive. */
export interface AiDigestListFilters { dateFrom?: string; dateTo?: string; provider?: AiProvider }

export type AiReadErrorCode = 'AI_HUB_DISABLED' | 'INVALID_CONTEXT' | 'INVALID_FILTER' | 'NOT_FOUND' | 'FORBIDDEN' | 'READ_FAILED';
export interface AiReadError { code: AiReadErrorCode; message: string }
export type AiReadResult<T> = { ok: true; data: T } | { ok: false; error: AiReadError };

// ---- DTOs (provider-neutral; no workspace id, hashes, dedupe keys or error_detail) ----

export interface AiRunDto {
  id: string; ownerId: string; provider: AiProvider; workflow: AiWorkflow; status: AiRunStatus;
  triggerType: AiTriggerType; createdAt: string; startedAt: string | null; completedAt: string | null;
  /** Normalized category only. Free-text error_detail is never exposed. */
  errorCategory: AiErrorCategory | null;
  counts: Record<string, number>;
}
export interface AiRunDetailDto extends AiRunDto {
  schemaVersion: string; retryOfRunId: string | null; sources: JsonRecord[];
}
export interface AiFindingDto {
  id: string; ownerId: string; runId: string; kind: AiFindingKind; provider: AiProvider; status: AiFindingStatus;
  priority: AiPriority; category: string | null; title: string; summary: string | null; evidence: string | null;
  confidence: number | null; occurredAt: string | null; dueAt: string | null; createdAt: string;
}
export interface AiFindingDetailDto extends AiFindingDto {
  /** Persisted application link only (null in AI-2: providers never choose it). */
  applicationId: string | null;
  /** Normalized provenance reference. */
  sourceRef: JsonRecord;
  /** Normalized, size-bounded payload as stored (validator output; includes server-owned seen_by). */
  payload: JsonRecord;
}
export interface AiSuggestionDto {
  id: string; ownerId: string; findingId: string; action: AiSuggestionAction; status: AiSuggestionStatus;
  targetType: AiSuggestionTargetType | null; targetId: string | null; proposed: JsonRecord;
  confidence: number | null; createdAt: string;
}
/**
 * A stored Daily Digest snapshot. `payload` is returned exactly as stored (validator
 * output at write time); it is NEVER recomputed from current application state.
 */
export interface AiDigestDto {
  id: string; ownerId: string; runId: string; provider: AiProvider; status: AiFindingStatus;
  /** YYYY-MM-DD, from the stored payload (falls back to the dedupe key). */
  digestDate: string; title: string; summary: string | null; createdAt: string; payload: JsonRecord;
}
export interface AiRunDetailResult { run: AiRunDetailDto; findings: AiFindingDto[]; findingsTruncated: boolean }

// ---- row mapping ----------------------------------------------------------------

type Row = Record<string, unknown>;
const numericCounts = (v: unknown): Record<string, number> =>
  Object.fromEntries(Object.entries(rec(v)).filter(([, n]) => typeof n === 'number' && Number.isFinite(n))) as Record<string, number>;

const RUN_COLUMNS = 'id, user_id, provider, workflow, status, trigger_type, created_at, started_at, completed_at, error_category, counts';
const RUN_DETAIL_COLUMNS = `${RUN_COLUMNS}, schema_version, retry_of_run_id, sources`; // error_detail deliberately excluded
const FINDING_COLUMNS = 'id, user_id, run_id, kind, provider, status, priority, category, title, summary, evidence, confidence, occurred_at, due_at, created_at';
const FINDING_DETAIL_COLUMNS = `${FINDING_COLUMNS}, application_id, source_ref, payload`; // content_hash / dedupe_key excluded
const SUGGESTION_COLUMNS = 'id, user_id, finding_id, action, status, target_type, target_id, proposed, confidence, created_at';

const toRun = (r: Row): AiRunDto => ({
  id: s(r.id), ownerId: s(r.user_id), provider: r.provider as AiProvider, workflow: r.workflow as AiWorkflow,
  status: r.status as AiRunStatus, triggerType: r.trigger_type as AiTriggerType, createdAt: s(r.created_at),
  startedAt: sn(r.started_at), completedAt: sn(r.completed_at), errorCategory: (r.error_category as AiErrorCategory | null) ?? null,
  counts: numericCounts(r.counts),
});
const toRunDetail = (r: Row): AiRunDetailDto => ({
  ...toRun(r), schemaVersion: s(r.schema_version), retryOfRunId: sn(r.retry_of_run_id),
  sources: (Array.isArray(r.sources) ? r.sources : []).map(rec),
});
const toFinding = (r: Row): AiFindingDto => ({
  id: s(r.id), ownerId: s(r.user_id), runId: s(r.run_id), kind: r.kind as AiFindingKind, provider: r.provider as AiProvider,
  status: r.status as AiFindingStatus, priority: r.priority as AiPriority, category: sn(r.category), title: s(r.title),
  summary: sn(r.summary), evidence: sn(r.evidence), confidence: num(r.confidence), occurredAt: sn(r.occurred_at),
  dueAt: sn(r.due_at), createdAt: s(r.created_at),
});
const toFindingDetail = (r: Row): AiFindingDetailDto => ({
  ...toFinding(r), applicationId: sn(r.application_id), sourceRef: rec(r.source_ref), payload: rec(r.payload),
});
const toSuggestion = (r: Row): AiSuggestionDto => ({
  id: s(r.id), ownerId: s(r.user_id), findingId: s(r.finding_id), action: r.action as AiSuggestionAction,
  status: r.status as AiSuggestionStatus, targetType: (r.target_type as AiSuggestionTargetType | null) ?? null,
  targetId: sn(r.target_id), proposed: rec(r.proposed), confidence: num(r.confidence), createdAt: s(r.created_at),
});

// Newest first with a stable tiebreaker, so equal timestamps never reorder across pages.
const newestFirst = (q: any) => q.order('created_at', { ascending: false }).order('id', { ascending: false }); // eslint-disable-line @typescript-eslint/no-explicit-any

const RUN_FILTERS = { status: AI_RUN_STATUSES, provider: AI_PROVIDERS, workflow: AI_WORKFLOWS, createdSince: 'iso', createdBefore: 'iso' } as const;
const FINDING_FILTERS = { status: AI_FINDING_STATUSES, kind: AI_FINDING_KINDS, priority: AI_PRIORITIES, runId: 'uuid' } as const;
const SUGGESTION_FILTERS = { status: AI_SUGGESTION_STATUSES, findingId: 'uuid', action: AI_SUGGESTION_ACTIONS } as const;

// ---- runs ---------------------------------------------------------------------------

export async function listAiRuns(ctx: AiReadContext, filters?: AiRunListFilters, page?: AiPageRequest, deps: AiReadDeps = {}): Promise<AiReadResult<AiPage<AiRunDto>>> {
  const p = prepare(ctx, deps); if (!p.ok) return p;
  const f = parseFilters(filters, RUN_FILTERS); if (!f.ok) return f;
  const pg = parsePage(page); if (!pg.ok) return pg;
  let q = p.db.from('ai_runs').select(RUN_COLUMNS).eq('workspace_id', p.ws);
  if (f.value.status) q = q.eq('status', f.value.status);
  if (f.value.provider) q = q.eq('provider', f.value.provider);
  if (f.value.workflow) q = q.eq('workflow', f.value.workflow);
  if (f.value.createdSince) q = q.gte('created_at', f.value.createdSince);
  if (f.value.createdBefore) q = q.lt('created_at', f.value.createdBefore);
  const { data, error } = await newestFirst(q).range(pg.from, pg.to);
  if (error) return dbFail(error);
  return { ok: true, data: sliced(((data ?? []) as Row[]).map(toRun), pg.page, pg.size) };
}

/** One run query + one bounded findings query (no per-child queries). */
export async function getAiRun(ctx: AiReadContext, runId: string, deps: AiReadDeps = {}): Promise<AiReadResult<AiRunDetailResult>> {
  const p = prepare(ctx, deps); if (!p.ok) return p;
  if (typeof runId !== 'string' || !UUID.test(runId)) return fail('INVALID_FILTER', 'runId');
  const [run, findings] = await Promise.all([
    p.db.from('ai_runs').select(RUN_DETAIL_COLUMNS).eq('workspace_id', p.ws).eq('id', runId.toLowerCase()).maybeSingle(),
    newestFirst(p.db.from('ai_findings').select(FINDING_COLUMNS).eq('workspace_id', p.ws).eq('run_id', runId.toLowerCase()))
      .limit(AI_READ_RUN_DETAIL_FINDINGS + 1),
  ]);
  if (run.error || findings.error) return dbFail(run.error ?? findings.error);
  if (!run.data) return fail('NOT_FOUND');
  const rows = (findings.data ?? []) as Row[];
  return {
    ok: true,
    data: { run: toRunDetail(run.data as Row), findings: rows.slice(0, AI_READ_RUN_DETAIL_FINDINGS).map(toFinding), findingsTruncated: rows.length > AI_READ_RUN_DETAIL_FINDINGS },
  };
}

// ---- findings -------------------------------------------------------------------------

export async function listAiFindings(ctx: AiReadContext, filters?: AiFindingListFilters, page?: AiPageRequest, deps: AiReadDeps = {}): Promise<AiReadResult<AiPage<AiFindingDto>>> {
  const p = prepare(ctx, deps); if (!p.ok) return p;
  const f = parseFilters(filters, FINDING_FILTERS); if (!f.ok) return f;
  const pg = parsePage(page); if (!pg.ok) return pg;
  let q = p.db.from('ai_findings').select(FINDING_COLUMNS).eq('workspace_id', p.ws);
  if (f.value.status) q = q.eq('status', f.value.status);
  if (f.value.kind) q = q.eq('kind', f.value.kind);
  if (f.value.priority) q = q.eq('priority', f.value.priority);
  if (f.value.runId) q = q.eq('run_id', f.value.runId);
  const { data, error } = await newestFirst(q).range(pg.from, pg.to);
  if (error) return dbFail(error);
  return { ok: true, data: sliced(((data ?? []) as Row[]).map(toFinding), pg.page, pg.size) };
}

export async function getAiFinding(ctx: AiReadContext, findingId: string, deps: AiReadDeps = {}): Promise<AiReadResult<AiFindingDetailDto>> {
  const p = prepare(ctx, deps); if (!p.ok) return p;
  if (typeof findingId !== 'string' || !UUID.test(findingId)) return fail('INVALID_FILTER', 'findingId');
  const { data, error } = await p.db.from('ai_findings').select(FINDING_DETAIL_COLUMNS).eq('workspace_id', p.ws).eq('id', findingId.toLowerCase()).maybeSingle();
  if (error) return dbFail(error);
  return data ? { ok: true, data: toFindingDetail(data as Row) } : fail('NOT_FOUND');
}

// ---- daily digests (AI-5) ----------------------------------------------------------
// A digest is an ai_findings row (kind daily_brief). These reads return the STORED snapshot;
// nothing here recomputes counts from current state.

const DIGEST_COLUMNS = 'id, user_id, run_id, provider, status, title, summary, created_at, payload, dedupe_key'; // dedupe_key is read to derive the date, never exposed
const DIGEST_FILTERS = { dateFrom: 'date', dateTo: 'date', provider: AI_PROVIDERS } as const;
const KEY_DATE = /^daily_brief:(\d{4}-\d{2}-\d{2})/;

const toDigest = (r: Row): AiDigestDto => {
  const payload = rec(r.payload);
  const fromKey = KEY_DATE.exec(s(r.dedupe_key))?.[1];
  const stored = typeof payload.digest_date === 'string' && DATE.test(payload.digest_date) ? payload.digest_date : undefined;
  return {
    id: s(r.id), ownerId: s(r.user_id), runId: s(r.run_id), provider: r.provider as AiProvider, status: r.status as AiFindingStatus,
    digestDate: stored ?? fromKey ?? '', title: s(r.title), summary: sn(r.summary), createdAt: s(r.created_at), payload,
  };
};

/** Newest digest date first, then provider, with id as a stable tiebreaker across owners (manager view). */
export async function listAiDigests(ctx: AiReadContext, filters?: AiDigestListFilters, page?: AiPageRequest, deps: AiReadDeps = {}): Promise<AiReadResult<AiPage<AiDigestDto>>> {
  const p = prepare(ctx, deps); if (!p.ok) return p;
  const f = parseFilters(filters, DIGEST_FILTERS); if (!f.ok) return f;
  const pg = parsePage(page, { def: AI_DIGEST_DEFAULT_PAGE_SIZE, max: AI_DIGEST_MAX_PAGE_SIZE }); if (!pg.ok) return pg;
  const { dateFrom, dateTo } = f.value;
  if (dateFrom && dateTo) {
    const days = (Date.parse(`${dateTo}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) / 86_400_000;
    if (days < 0 || days > AI_DIGEST_MAX_RANGE_DAYS) return fail('INVALID_FILTER', 'date range');
  }
  let q = p.db.from('ai_findings').select(DIGEST_COLUMNS).eq('workspace_id', p.ws).eq('kind', 'daily_brief');
  // The dedupe key is daily_brief:YYYY-MM-DD:provider, so a prefix range selects whole calendar dates.
  if (dateFrom) q = q.gte('dedupe_key', `daily_brief:${dateFrom}`);
  if (dateTo) q = q.lt('dedupe_key', `daily_brief:${nextCalendarDate(dateTo)}`);
  if (f.value.provider) q = q.eq('provider', f.value.provider);
  const { data, error } = await q.order('dedupe_key', { ascending: false }).order('id', { ascending: false }).range(pg.from, pg.to);
  if (error) return dbFail(error);
  return { ok: true, data: sliced(((data ?? []) as Row[]).map(toDigest), pg.page, pg.size) };
}

export async function getAiDigest(ctx: AiReadContext, digestId: string, deps: AiReadDeps = {}): Promise<AiReadResult<AiDigestDto>> {
  const p = prepare(ctx, deps); if (!p.ok) return p;
  if (typeof digestId !== 'string' || !UUID.test(digestId)) return fail('INVALID_FILTER', 'digestId');
  const { data, error } = await p.db.from('ai_findings').select(DIGEST_COLUMNS).eq('workspace_id', p.ws).eq('kind', 'daily_brief').eq('id', digestId.toLowerCase()).maybeSingle();
  if (error) return dbFail(error);
  return data ? { ok: true, data: toDigest(data as Row) } : fail('NOT_FOUND');
}

// ---- suggestions (read-only; there is deliberately no accept/decide here) -----------------

export async function listAiSuggestions(ctx: AiReadContext, filters?: AiSuggestionListFilters, page?: AiPageRequest, deps: AiReadDeps = {}): Promise<AiReadResult<AiPage<AiSuggestionDto>>> {
  const p = prepare(ctx, deps); if (!p.ok) return p;
  const f = parseFilters(filters, SUGGESTION_FILTERS); if (!f.ok) return f;
  const pg = parsePage(page); if (!pg.ok) return pg;
  let q = p.db.from('ai_suggestions').select(SUGGESTION_COLUMNS).eq('workspace_id', p.ws);
  if (f.value.status) q = q.eq('status', f.value.status);
  if (f.value.findingId) q = q.eq('finding_id', f.value.findingId);
  if (f.value.action) q = q.eq('action', f.value.action);
  const { data, error } = await newestFirst(q).range(pg.from, pg.to);
  if (error) return dbFail(error);
  return { ok: true, data: sliced(((data ?? []) as Row[]).map(toSuggestion), pg.page, pg.size) };
}

export async function getAiSuggestion(ctx: AiReadContext, suggestionId: string, deps: AiReadDeps = {}): Promise<AiReadResult<AiSuggestionDto>> {
  const p = prepare(ctx, deps); if (!p.ok) return p;
  if (typeof suggestionId !== 'string' || !UUID.test(suggestionId)) return fail('INVALID_FILTER', 'suggestionId');
  const { data, error } = await p.db.from('ai_suggestions').select(SUGGESTION_COLUMNS).eq('workspace_id', p.ws).eq('id', suggestionId.toLowerCase()).maybeSingle();
  if (error) return dbFail(error);
  return data ? { ok: true, data: toSuggestion(data as Row) } : fail('NOT_FOUND');
}

export async function countPendingAiSuggestions(ctx: AiReadContext, deps: AiReadDeps = {}): Promise<AiReadResult<{ pending: number }>> {
  const p = prepare(ctx, deps); if (!p.ok) return p;
  const { count, error } = await p.db.from('ai_suggestions').select('id', { count: 'exact', head: true }).eq('workspace_id', p.ws).eq('status', 'PENDING');
  if (error) return dbFail(error);
  return { ok: true, data: { pending: count ?? 0 } };
}
