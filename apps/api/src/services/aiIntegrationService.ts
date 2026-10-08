// AI-2A: provider-neutral INTERNAL integration service. Takes a canonical
// jobquest.ai-result, validates it with the AI-1C contract layer and persists it
// ONLY through the AI-1B service RPCs (no direct table access). It is not an HTTP
// route; later callers (AI-2B routes, AI-3 MCP, provider adapters) translate into
// the same entry point. The DB owns persistence semantics (idempotency, dedupe,
// content_hash, audit); this module only orchestrates and aggregates outcomes.
import { randomUUID } from 'node:crypto';
import { admin } from '../lib/db';
import { isAiHubServerEnabled } from '../lib/aiHubConfig';
import {
  AI_TRIGGER_TYPES, toIngestRunInput, validateAiResult,
  type AiErrorCategory, type AiFinding, type AiIssue, type AiRunStatus, type AiSuggestion, type AiTriggerType,
} from '../lib/aiContract';

// ---- public types -----------------------------------------------------------

/**
 * Trusted execution context. EVERY field is decided by the server (authenticated
 * session, connector token resolution, internal job), NEVER by the provider
 * payload. The provider payload can influence nothing in here.
 */
export interface AiTrustedContext {
  workspaceId: string;
  /** The owner the ingested rows belong to (the connector owner / signed-in user). */
  userId: string;
  /** Audit actor kind is fixed by the RPCs; only service ingestion exists in AI-2. */
  actorKind: 'SERVICE_INGEST';
  /** Optional upstream request id; a new one is generated when absent or malformed. */
  correlationId?: string;
  /** Defaults to 'manual'. 'retry' requires retryOfRunId (trusted, never inferred). */
  triggerType?: AiTriggerType;
  retryOfRunId?: string;
}

export type AiServiceErrorCode =
  | 'AI_HUB_DISABLED' | 'INVALID_CONTEXT' | 'INVALID_AI_RESULT' | 'SERVICE_UNAVAILABLE'
  | 'INGEST_RUN_FAILED' | 'RUN_NOT_OPEN' | 'INGEST_FINDING_FAILED' | 'CREATE_SUGGESTION_FAILED'
  | 'FINALIZE_RUN_FAILED';

export interface AiServiceError {
  code: AiServiceErrorCode;
  /** Approved AI-1A error category where one applies (null for pure gating errors). */
  category: AiErrorCategory | null;
  /** Static, sanitized text. Never contains SQL, payload content, tokens or stack traces. */
  message: string;
  /** Location of an item-level failure, e.g. `findings[2]` (accepted-finding index). */
  path?: string;
  /** Controlled DB error code (e.g. AI_FINDING_INVALID_TITLE) when the RPC raised one. */
  dbCode?: string;
}

export interface AiIngestCounts {
  findingsCreated: number;
  findingsDuplicate: number;
  findingsUpdated: number;
  findingsClosed: number;
  findingsFailed: number;
  suggestionsCreated: number;
  suggestionsDuplicate: number;
  suggestionsSkipped: number;
  suggestionsFailed: number;
  /** Items the validator dropped before persistence. */
  rejectedItems: number;
}

export interface AiIngestResult {
  /** true when the run was persisted and ended SUCCEEDED or PARTIAL. */
  success: boolean;
  runId: string | null;
  /** Last known run status; null when no run exists. */
  status: AiRunStatus | null;
  /** The (provider, external_run_id) run already existed; see ingestAiResult docs. */
  duplicateRun: boolean;
  /** false only when a run exists but could not be moved out of RUNNING. */
  finalized: boolean;
  counts: AiIngestCounts;
  /** Validator warnings (unknown fields dropped, newer minor, truncation, scope stripped...). */
  warnings: AiIssue[];
  /** Validator item/envelope rejections, kept so rejected-item detail is never lost. */
  validationErrors: AiIssue[];
  unknownFieldCount: number;
  errors: AiServiceError[];
  correlationId: string;
}

/** The only DB surface the service uses: `supabase.rpc`. */
export interface AiRpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}

export interface AiIntegrationDeps {
  client?: AiRpcClient;
  env?: Record<string, string | undefined>;
  log?: (entry: Record<string, unknown>) => void;
}

// ---- helpers ----------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORRELATION = /^[A-Za-z0-9._:-]{1,64}$/;
const DB_CODE = /^(AI_[A-Z0-9_]+|WORKSPACE_ACCESS_DENIED)$/;
/** Only these RPC failures are scoped to one child item; everything else is systemic. */
const ITEM_DB_CODE = /^AI_(FINDING|SUGGESTION|APPLICATION)_/;
const CHECK_VIOLATION = '23514';

const emptyCounts = (): AiIngestCounts => ({
  findingsCreated: 0, findingsDuplicate: 0, findingsUpdated: 0, findingsClosed: 0, findingsFailed: 0,
  suggestionsCreated: 0, suggestionsDuplicate: 0, suggestionsSkipped: 0, suggestionsFailed: 0, rejectedItems: 0,
});

const defaultLog = (entry: Record<string, unknown>) => console.info(JSON.stringify(entry));

type RpcOutcome = { ok: true; data: Record<string, unknown> } | { ok: false; systemic: boolean; dbCode?: string };

async function callRpc(client: AiRpcClient, fn: string, args: Record<string, unknown>): Promise<RpcOutcome> {
  try {
    const { data, error } = await client.rpc(fn, args);
    if (error) {
      const match = DB_CODE.exec((error.message ?? '').trim());
      const dbCode = match?.[1];
      const itemScoped = (dbCode !== undefined && ITEM_DB_CODE.test(dbCode)) || error.code === CHECK_VIOLATION;
      return { ok: false, systemic: !itemScoped, ...(dbCode ? { dbCode } : {}) };
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return { ok: false, systemic: true };
    return { ok: true, data: data as Record<string, unknown> };
  } catch {
    return { ok: false, systemic: true }; // transport failure; never surface the raw error
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

type ParsedContext =
  | { ok: true; workspaceId: string; userId: string; triggerType: AiTriggerType; retryOfRunId: string | null; correlationId: string }
  | { ok: false; correlationId: string; message: string };

function parseContext(raw: unknown): ParsedContext {
  const c = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const correlationId = typeof c.correlationId === 'string' && CORRELATION.test(c.correlationId) ? c.correlationId : randomUUID();
  const bad = (message: string): ParsedContext => ({ ok: false, correlationId, message });
  if (typeof c.workspaceId !== 'string' || !UUID.test(c.workspaceId)) return bad('workspaceId must be a UUID');
  if (typeof c.userId !== 'string' || !UUID.test(c.userId)) return bad('userId must be a UUID');
  if (c.actorKind !== 'SERVICE_INGEST') return bad('actorKind must be SERVICE_INGEST');
  const triggerType = c.triggerType === undefined ? 'manual' : c.triggerType;
  if (typeof triggerType !== 'string' || !(AI_TRIGGER_TYPES as readonly string[]).includes(triggerType)) return bad('triggerType is not approved');
  const retryOf = c.retryOfRunId;
  if (retryOf !== undefined && (typeof retryOf !== 'string' || !UUID.test(retryOf))) return bad('retryOfRunId must be a UUID');
  if ((triggerType === 'retry') !== (retryOf !== undefined)) return bad('retry requires retryOfRunId and only retry may set it');
  return {
    ok: true, workspaceId: c.workspaceId.toLowerCase(), userId: c.userId.toLowerCase(),
    triggerType: triggerType as AiTriggerType, retryOfRunId: typeof retryOf === 'string' ? retryOf.toLowerCase() : null, correlationId,
  };
}

const CATEGORY: Record<AiServiceErrorCode, AiErrorCategory | null> = {
  AI_HUB_DISABLED: null, INVALID_CONTEXT: 'SCHEMA_INVALID', INVALID_AI_RESULT: 'SCHEMA_INVALID',
  SERVICE_UNAVAILABLE: 'INTERNAL', INGEST_RUN_FAILED: 'INTERNAL', RUN_NOT_OPEN: 'INTERNAL',
  INGEST_FINDING_FAILED: 'INTERNAL', CREATE_SUGGESTION_FAILED: 'INTERNAL', FINALIZE_RUN_FAILED: 'INTERNAL',
};
const MESSAGE: Record<AiServiceErrorCode, string> = {
  AI_HUB_DISABLED: 'AI Hub is disabled on this server',
  INVALID_CONTEXT: 'Invalid trusted execution context',
  INVALID_AI_RESULT: 'AI result failed canonical contract validation',
  SERVICE_UNAVAILABLE: 'AI integration service is unavailable',
  INGEST_RUN_FAILED: 'Run could not be created',
  RUN_NOT_OPEN: 'Run already exists and is no longer open for ingestion',
  INGEST_FINDING_FAILED: 'A finding could not be ingested',
  CREATE_SUGGESTION_FAILED: 'A suggestion could not be created',
  FINALIZE_RUN_FAILED: 'Run could not be finalized',
};
function svcError(code: AiServiceErrorCode, extra: { path?: string; dbCode?: string; message?: string } = {}): AiServiceError {
  return { code, category: CATEGORY[code], message: extra.message ?? MESSAGE[code], ...(extra.path ? { path: extra.path } : {}), ...(extra.dbCode ? { dbCode: extra.dbCode } : {}) };
}

const countsForRpc = (c: AiIngestCounts): Record<string, number> => ({
  findings_created: c.findingsCreated, findings_duplicate: c.findingsDuplicate, findings_updated: c.findingsUpdated,
  findings_closed: c.findingsClosed, findings_failed: c.findingsFailed, suggestions_created: c.suggestionsCreated,
  suggestions_duplicate: c.suggestionsDuplicate, suggestions_skipped: c.suggestionsSkipped,
  suggestions_failed: c.suggestionsFailed, rejected_items: c.rejectedItems,
});

// ---- entry point ------------------------------------------------------------

/**
 * Ingest one canonical `jobquest.ai-result` for a trusted owner.
 *
 * Order: server kill switch (AI_HUB_ENABLED) -> trusted context -> canonical
 * validation -> run (rpc_ai_ingest_run) -> findings -> suggestions -> finalize.
 * Nothing is written (no run, finding, suggestion or audit row) when the kill
 * switch is off or the context/envelope is invalid.
 *
 * Duplicate run (same workspace + provider + external_run_id): the RPC returns the
 * existing run and the service never starts a second one.
 *  - existing run is RUNNING (an earlier attempt was interrupted): ingestion
 *    resumes. Findings dedupe and identical PENDING suggestions are no-ops in the
 *    DB, so re-submitting is safe; the run is then finalized from this attempt.
 *  - existing run is already terminal: nothing is re-ingested. SUCCEEDED/PARTIAL
 *    returns `success: true, duplicateRun: true` with zero counts; FAILED/CANCELLED
 *    returns RUN_NOT_OPEN (retry with a NEW external_run_id + trigger 'retry').
 *
 * Failure model: item-level RPC failures (AI_FINDING_*, AI_SUGGESTION_*,
 * AI_APPLICATION_*, CHECK violations) are recorded and the run ends PARTIAL;
 * systemic failures (transport, run/actor errors, unknown) stop processing and the
 * run is finalized FAILED once (no retry loop).
 */
export async function ingestAiResult(context: AiTrustedContext, input: unknown, deps: AiIntegrationDeps = {}): Promise<AiIngestResult> {
  const started = Date.now();
  const log = deps.log ?? defaultLog;
  const ctx = parseContext(context);
  const result: AiIngestResult = {
    success: false, runId: null, status: null, duplicateRun: false, finalized: false, counts: emptyCounts(),
    warnings: [], validationErrors: [], unknownFieldCount: 0, errors: [], correlationId: ctx.correlationId,
  };
  let provider: string | null = null;
  let workflow: string | null = null;
  const done = (): AiIngestResult => {
    // Safe fields only: ids, enums, counts. Never payload bodies or error text from the DB.
    log({
      event: 'ai_integration.ingest', correlationId: result.correlationId, runId: result.runId, provider, workflow,
      success: result.success, status: result.status, duplicateRun: result.duplicateRun, counts: result.counts,
      errorCodes: result.errors.map((e) => e.code), elapsedMs: Date.now() - started,
    });
    return result;
  };

  // 1. Environment kill switch always wins, before any parsing or DB access.
  if (!isAiHubServerEnabled(deps.env)) { result.errors.push(svcError('AI_HUB_DISABLED')); return done(); }

  // 2. Trusted context.
  if (!ctx.ok) { result.errors.push(svcError('INVALID_CONTEXT', { message: ctx.message })); return done(); }

  // 3. Canonical validation (AI-1C). Raw input is never persisted; only `data` is.
  const v = validateAiResult(input);
  result.warnings = v.warnings;
  result.validationErrors = v.errors;
  result.unknownFieldCount = v.unknownFieldCount;
  result.counts.rejectedItems = v.rejectedItemCount;
  if (!v.success || !v.data) { result.errors.push(svcError('INVALID_AI_RESULT')); return done(); }
  const data = v.data;
  provider = data.provider;
  workflow = data.workflow;

  // 4. Service-role client, lazily: invalid server config fails closed here and
  //    can never affect API boot or unrelated routes.
  let client: AiRpcClient;
  try { client = deps.client ?? (admin() as unknown as AiRpcClient); } catch {
    result.errors.push(svcError('SERVICE_UNAVAILABLE'));
    return done();
  }

  // 5. Run (idempotent on external_run_id inside the RPC).
  const runOut = await callRpc(client, 'rpc_ai_ingest_run', {
    p_actor_id: ctx.userId, p_workspace_id: ctx.workspaceId,
    ...toRunParams(data, ctx.triggerType, ctx.retryOfRunId),
  });
  const runId = runOut.ok ? str(runOut.data.run_id) : null;
  const runStatus = runOut.ok ? str(runOut.data.status) : null;
  if (!runOut.ok || !runId || !runStatus) {
    result.errors.push(svcError('INGEST_RUN_FAILED', runOut.ok ? {} : { dbCode: runOut.dbCode }));
    return done();
  }
  result.runId = runId;
  result.status = runStatus as AiRunStatus;
  result.duplicateRun = runOut.data.created === false;

  if (result.duplicateRun && runStatus !== 'RUNNING') {
    result.finalized = true; // nothing to do: an earlier attempt already ended it
    if (runStatus === 'SUCCEEDED' || runStatus === 'PARTIAL') result.success = true;
    else result.errors.push(svcError('RUN_NOT_OPEN', { message: `${MESSAGE.RUN_NOT_OPEN} (${runStatus})` }));
    result.counts = { ...emptyCounts(), rejectedItems: v.rejectedItemCount };
    return done();
  }

  // 6. Findings, then suggestions: sequential and deterministic.
  const counts = result.counts;
  let systemic: AiServiceError | null = null;
  const findingIds = new Map<number, { id: string; closed: boolean }>();
  for (const [i, f] of data.findings.entries()) {
    const out = await callRpc(client, 'rpc_ai_ingest_finding', { p_actor_id: ctx.userId, p_run_id: runId, ...toFindingParams(f, data.schema_version) });
    const id = out.ok ? str(out.data.finding_id) : null;
    const outcome = out.ok ? str(out.data.outcome) : null;
    if (!out.ok || !id) {
      counts.findingsFailed++;
      const err = svcError('INGEST_FINDING_FAILED', { path: `findings[${i}]`, ...(out.ok || !out.dbCode ? {} : { dbCode: out.dbCode }) });
      result.errors.push(err);
      if (!out.ok && !out.systemic) continue; // item-scoped DB refusal: other findings are independent
      systemic = err; // systemic, or a malformed RPC response: do not continue blindly
      break;
    }
    if (outcome === 'created') counts.findingsCreated++;
    else if (outcome === 'duplicate') counts.findingsDuplicate++;
    else if (outcome === 'updated') counts.findingsUpdated++;
    else if (outcome === 'unchanged_closed') counts.findingsClosed++;
    else { counts.findingsFailed++; const err = svcError('INGEST_FINDING_FAILED', { path: `findings[${i}]` }); result.errors.push(err); systemic = err; break; }
    findingIds.set(i, { id, closed: outcome === 'unchanged_closed' });
  }

  if (!systemic) {
    for (const [i, s] of data.suggestions.entries()) {
      const parent = findingIds.get(s.finding_index);
      if (!parent) { counts.suggestionsFailed++; result.errors.push(svcError('CREATE_SUGGESTION_FAILED', { path: `suggestions[${i}]`, message: 'Suggestion references a finding that was not persisted' })); continue; }
      if (parent.closed) { counts.suggestionsSkipped++; continue; } // closed finding: a proposal on it would be refused
      const out = await callRpc(client, 'rpc_ai_create_suggestion', { p_actor_id: ctx.userId, p_finding_id: parent.id, ...toSuggestionParams(s) });
      if (!out.ok || typeof out.data.created !== 'boolean') {
        counts.suggestionsFailed++;
        const err = svcError('CREATE_SUGGESTION_FAILED', { path: `suggestions[${i}]`, ...(out.ok || !out.dbCode ? {} : { dbCode: out.dbCode }) });
        result.errors.push(err);
        if (!out.ok && !out.systemic) continue;
        systemic = err;
        break;
      }
      if (out.data.created) counts.suggestionsCreated++; else counts.suggestionsDuplicate++;
    }
  }

  // 7. Finalize. FAILED when systemic, or when children were attempted and none persisted.
  const persisted = counts.findingsCreated + counts.findingsDuplicate + counts.findingsUpdated + counts.findingsClosed;
  const itemFailures = counts.findingsFailed + counts.suggestionsFailed;
  const attempted = data.findings.length;
  const failedRun = systemic !== null || (attempted > 0 && persisted === 0 && itemFailures > 0);
  const partial = !failedRun && (counts.rejectedItems > 0 || itemFailures > 0);
  const finalStatus: AiRunStatus = failedRun ? 'FAILED' : partial ? 'PARTIAL' : 'SUCCEEDED';
  const finalizeArgs: Record<string, unknown> = { p_actor_id: ctx.userId, p_run_id: runId, p_status: finalStatus, p_counts: countsForRpc(counts) };
  if (finalStatus !== 'SUCCEEDED') {
    finalizeArgs.p_error_category = failedRun ? 'INTERNAL' : counts.rejectedItems > 0 ? 'SCHEMA_INVALID' : 'INTERNAL';
    finalizeArgs.p_error_detail = failedRun
      ? 'Ingestion failed before all items could be persisted'
      : `${counts.rejectedItems} item(s) rejected by validation; ${itemFailures} item(s) failed ingestion`;
  }
  const fin = await callRpc(client, 'rpc_ai_finalize_run', finalizeArgs); // single attempt, no retry loop
  if (fin.ok) {
    result.status = finalStatus;
    result.finalized = true;
    result.success = finalStatus !== 'FAILED';
  } else {
    result.errors.push(svcError('FINALIZE_RUN_FAILED', fin.dbCode ? { dbCode: fin.dbCode } : {}));
  }
  return done();
}

// ---- RPC parameter mapping (normalized contract data only) --------------------

function toRunParams(data: Parameters<typeof toIngestRunInput>[0], trigger: AiTriggerType, retryOf: string | null) {
  const r = toIngestRunInput(data, trigger);
  return {
    p_provider: r.provider, p_workflow: r.workflow, p_trigger_type: r.triggerType, p_external_run_id: r.externalRunId,
    p_schema_version: r.schemaVersion, p_status: 'RUNNING', p_sources: r.sources, p_retry_of_run_id: retryOf,
  };
}

/**
 * application_id is deliberately never sent: providers only supply untrusted match
 * hints, and application matching is a later server-side concern. content_hash is
 * computed by rpc_ai_ingest_finding; nothing hash-like is sent.
 */
function toFindingParams(f: AiFinding, schemaVersion: string) {
  return {
    p_kind: f.kind, p_dedupe_key: f.dedupe_key, p_title: f.title, p_schema_version: schemaVersion,
    p_category: f.category, p_priority: f.priority, p_confidence: f.confidence, p_summary: f.summary,
    p_occurred_at: f.occurred_at, p_due_at: f.due_at, p_source_ref: f.source_ref, p_evidence: f.evidence, p_payload: f.payload,
  };
}

function toSuggestionParams(s: AiSuggestion) {
  return {
    p_action: s.action, p_proposed: s.proposed, p_target_type: s.target?.type ?? null,
    p_target_id: s.target?.id ?? null, p_confidence: s.confidence,
  };
}
