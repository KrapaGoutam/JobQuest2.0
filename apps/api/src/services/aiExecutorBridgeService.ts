// AI-11G: the PULL-executor bridge between a provider's scheduled task and the provider-neutral execution lifecycle (AI-11F).
//
//   provider scheduled task wakes  -->  jobquest_claim_ai_execution(automation_id)
//     JobQuest decides, atomically and server-side, whether THAT occurrence is due and whether this caller wins it
//       NOT_DUE / ALREADY_CLAIMED / ALREADY_COMPLETED / DISABLED  -> the provider stops cleanly, nothing is created
//       CLAIMED                                                   -> bounded execution context (no credentials)
//     the provider does the work with ITS OWN tools, then jobquest_submit_ai_result(external_run_id = claim.externalRunId)
//     ... or jobquest_report_ai_execution_failure(run_id, category, summary) when it cannot finish.
//
// JobQuest never calls a provider. Identity comes from the authenticated MCP principal (oauth_clients.provider /
// ai_connector_tokens.provider), never from a request body: a ChatGPT credential cannot claim a Claude automation, a credential
// of another workspace cannot see the automation at all, and an unbound credential cannot claim anything.
// This file adds no new lifecycle: it composes aiExecutionService (request / claim / retry / fail) and only adds
//   * occurrence selection for ONE automation (the canonical AI-11F due calculator),
//   * stale-RUNNING recovery (a bounded policy; no watchdog service), and
//   * the submit-side guards (provider binding, claim-first) plus digest-last composition.
import { admin as adminClient } from '../lib/db';
import { isAiHubServerEnabled } from '../lib/aiHubConfig';
import {
  CLIENT_KEY, EXECUTION_FAILURE_CATEGORIES, EXECUTION_STALE_AFTER_MS, computeNextExpectedRun, executionPlan, getDueOccurrences, claimSteps, planComposesDigest,
  type AutomationDefinition, type ClaimStep, type ExecutionFailureCategory, type ExecutionTrigger,
} from '../lib/aiContract';
import { claimExecution, reportExecutionFailure, requestExecution, requestRetry, type ExecutionDeps, type ExecutionError, type ExecutionResult } from './aiExecutionService';
import { generateSystemDigest } from './aiDigestService';
import { UUID } from './aiReadSupport';
import type { McpProvider } from '../mcp/principal';

export type BridgeErrorCode = ExecutionError['code'] | 'PROVIDER_UNBOUND' | 'RUN_NOT_CLAIMED';
export interface BridgeError { code: BridgeErrorCode; message: string }
export type BridgeResult<T> = { ok: true; data: T } | { ok: false; error: BridgeError };

/** Trusted: derived by the server from the authenticated principal. `provider` is null for an unbound credential. */
export interface BridgeContext { workspaceId: string; userId: string; provider: McpProvider | null }

type Reader = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
export interface BridgeDeps extends ExecutionDeps {
  /** Service-role reader for run lookups (always filtered by the trusted owner + workspace). */
  runLookup?: Reader;
  /** Writes the digest (tests inject; defaults to the real system digest composer). */
  digest?: typeof generateSystemDigest;
}

const fail = <T>(code: BridgeErrorCode, message: string): BridgeResult<T> => ({ ok: false, error: { code, message } });
const lift = <T>(r: ExecutionResult<T>): BridgeResult<T> => r;
const liftErr = (e: ExecutionError): BridgeResult<never> => ({ ok: false, error: e });
const hubOn = (deps: BridgeDeps) => (deps.aiHubEnabled ?? isAiHubServerEnabled)();
const nowOf = (deps: BridgeDeps) => (deps.now ?? (() => new Date()))();
const lookup = (deps: BridgeDeps): Reader => deps.runLookup ?? deps.configReader ?? (adminClient() as unknown as Reader);

/** `external_run_id` namespaces owned by the execution lifecycle (rpc_ai_execution_request builds them). */
export const RESERVED_RUN_KEY = /^(auto|manual|retry):/;

// ---- claim -------------------------------------------------------------------------------------------------------------------

export const CLAIM_STATUSES = ['CLAIMED', 'NOT_DUE', 'ALREADY_CLAIMED', 'ALREADY_COMPLETED', 'DISABLED', 'RETRY_LIMIT_REACHED'] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export interface ExecutionClaimPayload {
  runId: string;
  externalRunId: string;
  automationId: string;
  workflow: AutomationDefinition['workflow'];
  provider: McpProvider;
  trigger: ExecutionTrigger;
  scheduledFor: string | null;
  timezone: string | null;
  sections: string[];
  delivery: string[];
  /** 1 = first attempt; a retry after a failed / timed-out attempt is 2..4. */
  attempt: number;
  retryOfRunId: string | null;
}
export interface ClaimResponse {
  status: ClaimStatus;
  /** Machine-readable detail for the non-CLAIMED statuses. */
  reason: string | null;
  automationId: string;
  scheduledFor: string | null;
  nextExpectedRunAt: string | null;
  /** Present only when status is CLAIMED. */
  claim: ExecutionClaimPayload | null;
  steps: ClaimStep[];
  submit: { tool: string; provider: McpProvider; workflow: AutomationDefinition['workflow']; externalRunId: string; digestComposedByJobQuest: boolean } | null;
  failureTool: string | null;
  guidance: string;
}

interface ConfigRow {
  id: string; workflow: AutomationDefinition['workflow']; enabled: boolean; primary_provider: AutomationDefinition['provider'] | null;
  cadence: AutomationDefinition['cadence']; local_time: string | null; timezone: string | null; weekdays: number[] | null; updated_at: string;
  sections: AutomationDefinition['sections'] | null; delivery: AutomationDefinition['delivery'] | null;
}
const CONFIG_COLUMNS = 'id, workflow, enabled, primary_provider, cadence, local_time, timezone, weekdays, updated_at, sections, delivery';

interface AttemptRow { id: string; status: string; started_at: string | null; created_at: string; external_run_id: string | null }

/** The newest attempt of an occurrence: the original run or any retry that points at it. */
async function latestAttempt(deps: BridgeDeps, ctx: BridgeContext, rootRunId: string): Promise<AttemptRow | null> {
  const res = await lookup(deps).from('ai_runs').select('id, status, started_at, created_at, external_run_id')
    .eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.userId).or(`id.eq.${rootRunId},retry_of_run_id.eq.${rootRunId}`)
    .order('created_at', { ascending: false }).limit(1);
  if (res.error) return null;
  return ((res.data ?? [])[0] as AttemptRow | undefined) ?? null;
}

const GUIDANCE: Record<ClaimStatus, string> = {
  CLAIMED: 'Run the steps in order with your own tools, then submit ONE result with jobquest_submit_ai_result using submit.externalRunId, or call jobquest_report_ai_execution_failure if you cannot finish.',
  NOT_DUE: 'Nothing is due for this automation right now. Stop. Do not run any step and do not submit a result.',
  ALREADY_CLAIMED: 'This occurrence is already being executed. Stop. Do not run any step and do not submit a result.',
  ALREADY_COMPLETED: 'This occurrence already finished. Stop. Do not run any step and do not submit a result.',
  DISABLED: 'This automation is disabled. Stop.',
  RETRY_LIMIT_REACHED: 'This occurrence failed and its retry limit is reached. Stop; the owner can review it in JobQuest.',
};

function respond(status: ClaimStatus, automationId: string, extra: Partial<ClaimResponse> = {}): ClaimResponse {
  return { status, reason: null, automationId, scheduledFor: null, nextExpectedRunAt: null, claim: null, steps: [], submit: null, failureTool: null, guidance: GUIDANCE[status], ...extra };
}

export interface ClaimInput { automationId: string; trigger?: 'scheduled' | 'manual'; clientKey?: string }

/**
 * Claim THIS automation's due occurrence (scheduled) or start an attended manual run of it (manual, owner-initiated in the provider).
 * Everything is decided server-side; the provider only says which automation. Idempotent: the same occurrence / client key can never
 * produce a second run, and concurrent callers produce exactly one winner (the database owns both guarantees).
 */
export async function claimAutomationExecution(ctx: BridgeContext, input: ClaimInput, deps: BridgeDeps = {}): Promise<BridgeResult<ClaimResponse>> {
  if (!hubOn(deps)) return fail('AI_HUB_DISABLED', 'AI Hub is disabled on this server.');
  if (!UUID.test(ctx.workspaceId) || !UUID.test(ctx.userId) || !UUID.test(input.automationId)) return fail('INVALID_INPUT', 'A valid automation id is required.');
  const trigger = input.trigger ?? 'scheduled';
  if (trigger !== 'scheduled' && trigger !== 'manual') return fail('INVALID_INPUT', 'Unsupported trigger.');
  if (trigger === 'manual' && !(typeof input.clientKey === 'string' && CLIENT_KEY.test(input.clientKey))) return fail('INVALID_INPUT', 'A manual run needs a client_key of 8-64 letters, digits, "_" or "-".');
  if (!ctx.provider) return fail('PROVIDER_UNBOUND', 'This credential is not bound to a provider. Create the connector for Claude (or connect ChatGPT/Gemini) under Settings -> Providers.');

  const cfgRes = await lookup(deps).from('ai_workflow_configs').select(CONFIG_COLUMNS)
    .eq('id', input.automationId).eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.userId).maybeSingle();
  if (cfgRes.error) return fail('READ_FAILED', 'Could not load the automation.');
  const row = cfgRes.data as ConfigRow | null;
  if (!row) return fail('AUTOMATION_NOT_FOUND', 'Automation not found.');
  if (row.primary_provider !== ctx.provider) return fail('PROVIDER_MISMATCH', 'This automation belongs to a different provider.');
  if (!row.enabled) return { ok: true, data: respond('DISABLED', row.id, { reason: 'AUTOMATION_DISABLED' }) };

  const def: AutomationDefinition = {
    name: '', workflow: row.workflow, enabled: row.enabled, provider: row.primary_provider, cadence: row.cadence, localTime: row.local_time, timezone: row.timezone,
    weekdays: row.weekdays ?? [], sections: row.sections ?? [], delivery: row.delivery ?? ['ai_hub'],
  };
  const now = nowOf(deps);

  // 1. Which occurrence? Scheduled = the canonical AI-11F calculator (latest eligible slot in the catch-up window, nothing replayed).
  let scheduledFor: string | null = null;
  if (trigger === 'scheduled') {
    if (row.cadence === 'manual_only') return { ok: true, data: respond('NOT_DUE', row.id, { reason: 'MANUAL_ONLY' }) };
    const due = getDueOccurrences([{ id: row.id, workflow: row.workflow, provider: row.primary_provider, enabled: true, cadence: row.cadence, localTime: row.local_time, timezone: row.timezone, weekdays: row.weekdays ?? [], updatedAt: row.updated_at }], now)[0];
    if (!due) return { ok: true, data: respond('NOT_DUE', row.id, { reason: 'NOT_IN_WINDOW', nextExpectedRunAt: computeNextExpectedRun(def, now) }) };
    scheduledFor = due.scheduledFor;
  }

  // 2. Idempotent request: the database turns the same occurrence / key into the same run.
  const req = await requestExecution(ctx, trigger === 'scheduled' ? { automationId: row.id, trigger, scheduledFor: scheduledFor! } : { automationId: row.id, trigger, clientKey: input.clientKey }, deps);
  if (!req.ok) {
    if (req.error.code === 'INVALID_OCCURRENCE') return { ok: true, data: respond('NOT_DUE', row.id, { reason: 'NOT_IN_WINDOW', scheduledFor }) };
    if (req.error.code === 'AUTOMATION_DISABLED') return { ok: true, data: respond('DISABLED', row.id, { reason: 'AUTOMATION_DISABLED' }) };
    return liftErr(req.error);
  }

  // 3. Where is the occurrence now? (the original run plus any retry)
  let cur = await latestAttempt(deps, ctx, req.data.runId);
  if (!cur) return fail('READ_FAILED', 'Could not load the run.');

  // A claimed run whose provider vanished: after a bounded wait it is failed (TIMEOUT) so the occurrence is not stuck RUNNING forever.
  if ((cur.status === 'RUNNING' || cur.status === 'AWAITING_APPROVAL') && now.getTime() - Date.parse(cur.started_at ?? cur.created_at) > EXECUTION_STALE_AFTER_MS) {
    const stale = await reportExecutionFailure(ctx, cur.id, 'TIMEOUT', 'The provider did not finish this run in time.', deps);
    if (!stale.ok) return liftErr(stale.error);
    cur = { ...cur, status: 'FAILED' };
  }

  switch (cur.status) {
    case 'QUEUED':
      break;
    case 'RUNNING':
    case 'AWAITING_APPROVAL':
      return { ok: true, data: respond('ALREADY_CLAIMED', row.id, { reason: 'IN_PROGRESS', scheduledFor }) };
    case 'SUCCEEDED':
    case 'PARTIAL':
      return { ok: true, data: respond('ALREADY_COMPLETED', row.id, { reason: cur.status, scheduledFor }) };
    case 'CANCELLED':
      return { ok: true, data: respond('NOT_DUE', row.id, { reason: 'CANCELLED', scheduledFor }) };
    case 'FAILED': {
      // The provider (or the stale policy) failed this attempt and is now asking again: a NEW linked run, bounded by the AI-11F retry limit.
      const retry = await requestRetry(ctx, cur.id, deps);
      if (!retry.ok) {
        if (retry.error.code === 'RETRY_LIMIT') return { ok: true, data: respond('RETRY_LIMIT_REACHED', row.id, { reason: 'RETRY_LIMIT', scheduledFor }) };
        if (retry.error.code === 'NOT_RETRYABLE') return { ok: true, data: respond('ALREADY_CLAIMED', row.id, { reason: 'IN_PROGRESS', scheduledFor }) };
        return liftErr(retry.error);
      }
      cur = { id: retry.data.runId, status: retry.data.status, started_at: null, created_at: now.toISOString(), external_run_id: retry.data.externalRunId };
      if (cur.status !== 'QUEUED') return { ok: true, data: respond('ALREADY_CLAIMED', row.id, { reason: 'IN_PROGRESS', scheduledFor }) };
      break;
    }
    default:
      return { ok: true, data: respond('ALREADY_CLAIMED', row.id, { reason: 'IN_PROGRESS', scheduledFor }) };
  }

  // 4. Claim (QUEUED -> RUNNING, row-locked: exactly one concurrent caller wins; the database re-validates the provider).
  const won = await claimExecution(ctx, cur.id, ctx.provider, deps);
  if (!won.ok) return liftErr(won.error);
  if (!won.data.claimed) {
    if (won.data.reason === 'AUTOMATION_DISABLED') return { ok: true, data: respond('DISABLED', row.id, { reason: 'AUTOMATION_DISABLED' }) };
    if (won.data.reason === 'AUTOMATION_REASSIGNED') return fail('PROVIDER_MISMATCH', 'This automation belongs to a different provider.');
    return { ok: true, data: respond('ALREADY_CLAIMED', row.id, { reason: 'IN_PROGRESS', scheduledFor }) };
  }

  const c = won.data.claim;
  const plan = executionPlan({ workflow: c.workflow, sections: c.sections });
  const retryNo = /^retry:[^:]+:(\d+)$/.exec(c.externalRunId)?.[1];
  const payload: ExecutionClaimPayload = {
    runId: c.runId, externalRunId: c.externalRunId, automationId: row.id, workflow: c.workflow, provider: ctx.provider, trigger: c.trigger, scheduledFor: c.scheduledFor,
    timezone: c.timezone, sections: [...c.sections], delivery: [...c.delivery], attempt: retryNo ? Number(retryNo) + 1 : 1, retryOfRunId: c.retryOfRunId,
  };
  return {
    ok: true,
    data: respond('CLAIMED', row.id, {
      scheduledFor: c.scheduledFor, claim: payload, steps: claimSteps(plan),
      submit: { tool: 'jobquest_submit_ai_result', provider: ctx.provider, workflow: c.workflow, externalRunId: c.externalRunId, digestComposedByJobQuest: planComposesDigest(plan) },
      failureTool: 'jobquest_report_ai_execution_failure',
    }),
  };
}

// ---- failure report ---------------------------------------------------------------------------------------------------------

export interface FailureInput { runId: string; category: ExecutionFailureCategory; summary: unknown }

/**
 * A provider that claimed a run but cannot finish says so. Validated against the run in the database: same owner + workspace, the
 * run's provider is THIS credential's provider, it is an execution-lifecycle run and it is RUNNING. Another provider's run (or
 * another workspace's) is never touched. A finished run is final: repeating the report is a no-op.
 */
export async function reportAutomationFailure(ctx: BridgeContext, input: FailureInput, deps: BridgeDeps = {}): Promise<BridgeResult<{ runId: string; status: string; changed: boolean }>> {
  if (!hubOn(deps)) return fail('AI_HUB_DISABLED', 'AI Hub is disabled on this server.');
  if (!UUID.test(ctx.workspaceId) || !UUID.test(ctx.userId) || !UUID.test(input.runId) || !(EXECUTION_FAILURE_CATEGORIES as readonly string[]).includes(input.category)) return fail('INVALID_INPUT', 'A run id and a failure category are required.');
  if (!ctx.provider) return fail('PROVIDER_UNBOUND', 'This credential is not bound to a provider.');
  const res = await lookup(deps).from('ai_runs').select('id, status, provider, external_run_id')
    .eq('id', input.runId).eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.userId).maybeSingle();
  if (res.error) return fail('READ_FAILED', 'Could not load the run.');
  const run = res.data as { id: string; status: string; provider: string; external_run_id: string | null } | null;
  if (!run) return fail('RUN_NOT_FOUND', 'Run not found.');
  if (run.provider !== ctx.provider) return fail('PROVIDER_MISMATCH', 'This run belongs to a different provider.');
  if (!run.external_run_id || !RESERVED_RUN_KEY.test(run.external_run_id)) return fail('NOT_CLAIMABLE', 'Only an automation execution run can be reported here.');
  if (run.status === 'QUEUED') return fail('NOT_CLAIMABLE', 'This run has not been claimed.');
  if (run.status !== 'RUNNING' && run.status !== 'AWAITING_APPROVAL') return { ok: true, data: { runId: run.id, status: run.status, changed: false } };
  return lift(await reportExecutionFailure(ctx, run.id, input.category, input.summary, deps));
}

// ---- submit-side guards ------------------------------------------------------------------------------------------------------

/**
 * Called by jobquest_submit_ai_result BEFORE ingestion.
 *  1. Provider identity is the credential's, not the body's: a bound credential can only submit as its own provider, so it can
 *     never create or finalize another provider's run by naming it in the payload.
 *  2. The run-key namespaces of the execution lifecycle (auto:/manual:/retry:) can only be used for a run that was CLAIMED by this
 *     provider: submitting before claiming (or inventing a key) is refused instead of squatting an occurrence.
 */
export async function guardSubmission(ctx: BridgeContext, result: unknown, deps: BridgeDeps = {}): Promise<BridgeResult<null>> {
  const r = (typeof result === 'object' && result !== null ? result : {}) as { provider?: unknown; run?: { external_run_id?: unknown } };
  if (ctx.provider && r.provider !== ctx.provider) return fail('PROVIDER_MISMATCH', `This credential belongs to ${ctx.provider}; the result must use provider "${ctx.provider}".`);
  const key = r.run && typeof r.run === 'object' ? r.run.external_run_id : undefined;
  if (typeof key !== 'string' || !RESERVED_RUN_KEY.test(key)) return { ok: true, data: null };
  const res = await lookup(deps).from('ai_runs').select('id')
    .eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.userId).eq('provider', typeof r.provider === 'string' ? r.provider : '').eq('external_run_id', key).maybeSingle();
  if (res.error) return fail('READ_FAILED', 'Could not verify the run.');
  if (!res.data) return fail('RUN_NOT_CLAIMED', 'Claim the automation with jobquest_claim_ai_execution first and use the externalRunId it returns.');
  return { ok: true, data: null };
}

// ---- digest last ------------------------------------------------------------------------------------------------------------

export type DigestOutcome = 'COMPOSED' | 'ALREADY_COMPOSED' | 'FAILED' | 'NOT_APPLICABLE';

/**
 * After the provider's result is stored: if the claimed automation's plan ends with the Daily Digest, JobQuest composes the
 * canonical digest NOW (AI-11C composer, provider "system"), so it reads the intelligence the earlier steps just persisted.
 * Same-day semantics are the AI-11C snapshot rules (one digest per owner + date; a stored digest is never rewritten). Best effort:
 * a digest problem never turns a stored result into a failure, and a repeated submission retries it.
 */
export async function composeDigestLast(ctx: BridgeContext, runId: string | null, accessToken: string, deps: BridgeDeps = {}): Promise<DigestOutcome> {
  if (!runId || !UUID.test(runId)) return 'NOT_APPLICABLE';
  const lk = lookup(deps);
  const run = await lk.from('ai_runs').select('id, status, external_run_id, automation_id')
    .eq('id', runId).eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.userId).maybeSingle();
  const r = run.data as { status: string; external_run_id: string | null; automation_id: string | null } | null;
  if (run.error || !r || !r.automation_id || !r.external_run_id || !RESERVED_RUN_KEY.test(r.external_run_id)) return 'NOT_APPLICABLE';
  if (r.status !== 'SUCCEEDED' && r.status !== 'PARTIAL') return 'NOT_APPLICABLE';
  const cfg = await lk.from('ai_workflow_configs').select('workflow, sections').eq('id', r.automation_id).eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.userId).maybeSingle();
  const c = cfg.data as { workflow: AutomationDefinition['workflow']; sections: AutomationDefinition['sections'] | null } | null;
  if (cfg.error || !c || !planComposesDigest(executionPlan({ workflow: c.workflow, sections: c.sections ?? [] }))) return 'NOT_APPLICABLE';
  try {
    const out = await (deps.digest ?? generateSystemDigest)({ workspaceId: ctx.workspaceId, userId: ctx.userId, accessToken });
    if (!out.ok || !out.data.ingest.success) return 'FAILED';
    return out.data.ingest.duplicateRun ? 'ALREADY_COMPOSED' : 'COMPOSED';
  } catch { return 'FAILED'; }
}
