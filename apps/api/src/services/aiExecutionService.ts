// AI-11F: the provider-neutral execution lifecycle for automations.
//
//   automation (ai_workflow_configs)  --due evaluation-->  occurrence (automation + scheduled instant)
//     --rpc_ai_execution_request-->  ai_runs QUEUED   (idempotent: the database owns uniqueness)
//     --rpc_ai_execution_claim-->    ai_runs RUNNING  (row lock: exactly one winner, provider re-validated server-side)
//     --executor does the work, then jobquest_submit_ai_result with run.external_run_id = claim.externalRunId-->
//     --existing ingest/finalize-->  SUCCEEDED | PARTIAL | FAILED        (or reportExecutionFailure -> FAILED)
//
// This module is plumbing only. It never calls a provider API, holds no provider credential and is NOT reachable from
// MCP. The executor entry points (claim / report / retry / enqueue) take a TRUSTED context (owner + workspace derived by
// the server from a verified session or connector token, never from a request body); the AI-11G adapters call them.
// Run Now is the same lifecycle with trigger 'manual', and exists only when an executor is configured for the provider.
import { admin as adminClient, userClient } from '../lib/db';
import { isAiHubServerEnabled } from '../lib/aiHubConfig';
import {
  CLIENT_KEY, EXECUTION_FAILURE_CATEGORIES, executionPlan, executorState, getDueOccurrences, runNowReadiness, sanitizeFailureSummary,
  type AutomationDefinition, type DueCandidate, type DueOccurrence, type ExecutionClaim, type ExecutionFailureCategory, type ExecutionTrigger,
  type ExecutorState,
} from '../lib/aiContract';
import { UUID } from './aiReadSupport';

export type ExecutionErrorCode =
  | 'INVALID_INPUT' | 'AI_HUB_DISABLED' | 'WORKSPACE_ACCESS_DENIED' | 'AUTOMATION_NOT_FOUND' | 'AUTOMATION_DISABLED' | 'NO_EXECUTOR'
  | 'PROVIDER_MISMATCH' | 'NOT_CLAIMABLE' | 'RUN_NOT_FOUND' | 'INVALID_TRANSITION' | 'NOT_RETRYABLE' | 'RETRY_LIMIT'
  | 'INVALID_OCCURRENCE' | 'CONFLICT' | 'READ_FAILED' | 'EXECUTION_FAILED';
export interface ExecutionError { code: ExecutionErrorCode; message: string }
export type ExecutionResult<T> = { ok: true; data: T } | { ok: false; error: ExecutionError };

/** Trusted: derived by the server from the verified session / connector token. */
export interface ExecutionContext { workspaceId: string; userId: string; accessToken?: string }

type Reader = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Writer = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> };
export interface ExecutionDeps {
  /** Service-role reader for due evaluation (always filtered by the trusted owner + workspace). */
  configReader?: Reader;
  /** Caller-scoped reader for history (RLS). */
  runReader?: Reader;
  writer?: Writer;
  aiHubEnabled?: () => boolean;
  now?: () => Date;
  /** Providers with a connected executor; defaults to REGISTERED_EXECUTORS (empty until AI-11G). */
  registered?: readonly AutomationDefinition['provider'][];
}

const fail = <T>(code: ExecutionErrorCode, message: string): ExecutionResult<T> => ({ ok: false, error: { code, message } });
const hubOff = <T>() => fail<T>('AI_HUB_DISABLED', 'AI Hub is disabled on this server.');

/** Database exception text (the stable contract of the RPCs) -> safe code. Raw database text never reaches a client. */
const MESSAGE_ERRORS: Array<[string, ExecutionErrorCode, string]> = [
  ['AI_EXECUTION_AUTOMATION_NOT_FOUND', 'AUTOMATION_NOT_FOUND', 'Automation not found.'],
  ['AI_EXECUTION_AUTOMATION_DISABLED', 'AUTOMATION_DISABLED', 'The automation is disabled.'],
  ['AI_EXECUTION_INVALID_OCCURRENCE', 'INVALID_OCCURRENCE', 'That occurrence is not valid for the current schedule.'],
  ['AI_EXECUTION_INVALID_CLIENT_KEY', 'INVALID_INPUT', 'A valid request key is required.'],
  ['AI_EXECUTION_INVALID_TRIGGER', 'INVALID_INPUT', 'Unsupported trigger.'],
  ['AI_EXECUTION_INVALID_RETRY', 'INVALID_INPUT', 'A run to retry is required.'],
  ['AI_EXECUTION_PROVIDER_MISMATCH', 'PROVIDER_MISMATCH', 'This execution belongs to a different provider.'],
  ['AI_EXECUTION_NOT_CLAIMABLE', 'NOT_CLAIMABLE', 'This run cannot be claimed.'],
  ['AI_EXECUTION_NOT_RETRYABLE', 'NOT_RETRYABLE', 'Only a failed run with nothing else in flight can be retried.'],
  ['AI_EXECUTION_RETRY_LIMIT', 'RETRY_LIMIT', 'The retry limit for this occurrence has been reached.'],
  ['AI_EXECUTION_CONFLICT', 'CONFLICT', 'The execution conflicts with an existing one.'],
  ['AI_RUN_NOT_FOUND', 'RUN_NOT_FOUND', 'Run not found.'],
  ['AI_RUN_INVALID_TRANSITION', 'INVALID_TRANSITION', 'That status change is not allowed.'],
  ['WORKSPACE_ACCESS_DENIED', 'WORKSPACE_ACCESS_DENIED', 'Workspace access denied.'],
];
function rpcFail<T>(error: { code?: string; message?: string }): ExecutionResult<T> {
  const text = error.message ?? '';
  const hit = MESSAGE_ERRORS.find(([m]) => text.includes(m));
  if (hit) return fail(hit[1], hit[2]);
  if (error.code === '42501') return fail('WORKSPACE_ACCESS_DENIED', 'Workspace access denied.');
  return fail('EXECUTION_FAILED', 'The execution request could not be completed.');
}

const writerOf = (deps: ExecutionDeps): Writer => deps.writer ?? (adminClient() as unknown as Writer);
const hubOn = (deps: ExecutionDeps) => (deps.aiHubEnabled ?? isAiHubServerEnabled)();
const validCtx = (ctx: ExecutionContext) => UUID.test(ctx.workspaceId) && UUID.test(ctx.userId);

interface ConfigRow {
  id: string; workflow: AutomationDefinition['workflow']; enabled: boolean; primary_provider: AutomationDefinition['provider'] | null;
  cadence: AutomationDefinition['cadence']; local_time: string | null; timezone: string | null; weekdays: number[] | null; updated_at: string;
}
const DUE_COLUMNS = 'id, workflow, enabled, primary_provider, cadence, local_time, timezone, weekdays, updated_at';
const toCandidate = (r: ConfigRow): DueCandidate => ({
  id: r.id, workflow: r.workflow, provider: r.primary_provider, enabled: r.enabled, cadence: r.cadence, localTime: r.local_time,
  timezone: r.timezone, weekdays: r.weekdays ?? [], updatedAt: r.updated_at,
});

/** Which of the owner's automations have an occurrence due now? Pure evaluation over a bounded, workspace-scoped read. */
export async function listDueOccurrences(ctx: ExecutionContext, deps: ExecutionDeps = {}): Promise<ExecutionResult<DueOccurrence[]>> {
  if (!validCtx(ctx)) return fail('INVALID_INPUT', 'A workspace and an owner are required.');
  const reader = deps.configReader ?? (adminClient() as unknown as Reader);
  const res = await reader.from('ai_workflow_configs').select(DUE_COLUMNS)
    .eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.userId).eq('enabled', true).limit(10);
  if (res.error) return fail('READ_FAILED', 'Could not evaluate automations.');
  return { ok: true, data: getDueOccurrences(((res.data ?? []) as ConfigRow[]).map(toCandidate), (deps.now ?? (() => new Date()))()) };
}

export interface EnqueuedOccurrence { automationId: string; scheduledFor: string; runId: string; created: boolean; status: string }

/**
 * Turn every due occurrence into a QUEUED run, for providers that have a configured executor. Safe to call from any number
 * of concurrent pollers: the database makes the occurrence unique, losers get `created: false` and the same run id.
 * An occurrence for a provider without an executor is skipped, not queued: no run is created that nobody can claim.
 */
export async function enqueueDueOccurrences(ctx: ExecutionContext, deps: ExecutionDeps = {}): Promise<ExecutionResult<EnqueuedOccurrence[]>> {
  if (!hubOn(deps)) return hubOff();
  const due = await listDueOccurrences(ctx, deps);
  if (!due.ok) return due;
  const out: EnqueuedOccurrence[] = [];
  for (const o of due.data) {
    if (executorState(o.provider, { aiHubEnabled: true, registered: deps.registered }) !== 'configured') continue;
    const r = await requestExecution(ctx, { automationId: o.automationId, trigger: 'scheduled', scheduledFor: o.scheduledFor }, deps);
    if (!r.ok) {
      // A stale / disabled occurrence is simply not runnable; anything else is a real failure for the caller.
      if (r.error.code === 'INVALID_OCCURRENCE' || r.error.code === 'AUTOMATION_DISABLED') continue;
      return r;
    }
    out.push({ automationId: o.automationId, scheduledFor: o.scheduledFor, ...r.data });
  }
  return { ok: true, data: out };
}

export interface ExecutionRequest { /** Null only for a retry (the failed run determines the automation). */ automationId: string | null; trigger: ExecutionTrigger; scheduledFor?: string; clientKey?: string; retryOfRunId?: string }

/** Idempotent QUEUED run for an occurrence / Run Now key / retry. No readiness check: callers decide when it is truthful. */
export async function requestExecution(
  ctx: ExecutionContext, req: ExecutionRequest, deps: ExecutionDeps = {},
): Promise<ExecutionResult<{ runId: string; created: boolean; status: string; externalRunId: string | null }>> {
  if (!hubOn(deps)) return hubOff();
  const target = req.trigger === 'retry' ? req.retryOfRunId : req.automationId;
  if (!validCtx(ctx) || !target || !UUID.test(target)) return fail('INVALID_INPUT', 'A workspace and an automation are required.');
  const { data, error } = await writerOf(deps).rpc('rpc_ai_execution_request', {
    p_actor_id: ctx.userId, p_workspace_id: ctx.workspaceId, p_automation_id: req.automationId, p_trigger_type: req.trigger,
    p_scheduled_for: req.scheduledFor ?? null, p_client_key: req.clientKey ?? null, p_retry_of_run_id: req.retryOfRunId ?? null,
  });
  if (error || !data) return error ? rpcFail(error) : fail('EXECUTION_FAILED', 'The execution request could not be completed.');
  const d = data as { run_id: string; created: boolean; status: string; external_run_id?: string | null };
  return { ok: true, data: { runId: d.run_id, created: d.created, status: d.status, externalRunId: d.external_run_id ?? null } };
}

/**
 * Run Now (owner, session). Same lifecycle as a scheduled occurrence with trigger 'manual'. Truthful by construction: with no
 * executor configured for the automation's provider it returns NO_EXECUTOR and creates nothing, so no fake or permanently
 * stuck run ever exists. `clientKey` makes a double click / network retry the same execution.
 */
export async function requestRunNow(
  ctx: ExecutionContext, automationId: string, clientKey: string, deps: ExecutionDeps = {},
): Promise<ExecutionResult<{ runId: string; created: boolean; status: string }>> {
  if (!hubOn(deps)) return hubOff();
  if (!validCtx(ctx) || !UUID.test(automationId) || !CLIENT_KEY.test(clientKey)) return fail('INVALID_INPUT', 'A workspace, an automation and a request key are required.');
  const reader = deps.configReader ?? (adminClient() as unknown as Reader);
  const res = await reader.from('ai_workflow_configs').select('id, enabled, primary_provider')
    .eq('id', automationId).eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.userId).maybeSingle();
  if (res.error) return fail('READ_FAILED', 'Could not load the automation.');
  const row = res.data as { id: string; enabled: boolean; primary_provider: AutomationDefinition['provider'] | null } | null;
  if (!row) return fail('AUTOMATION_NOT_FOUND', 'Automation not found.');
  const state = executorState(row.primary_provider ?? 'manual', { aiHubEnabled: true, registered: deps.registered });
  const ready = runNowReadiness({ enabled: row.enabled }, { aiHubEnabled: true, executorAvailable: state === 'configured' });
  if (!ready.ready) return ready.reason === 'AUTOMATION_DISABLED' ? fail('AUTOMATION_DISABLED', 'Enable this automation first.') : fail('NO_EXECUTOR', 'No executor is connected for this provider yet.');
  const r = await requestExecution(ctx, { automationId, trigger: 'manual', clientKey }, deps);
  return r.ok ? { ok: true, data: { runId: r.data.runId, created: r.data.created, status: r.data.status } } : r;
}

export type ClaimOutcome =
  | { claimed: true; claim: ExecutionClaim }
  | { claimed: false; runId: string; status: string; reason: string };

/**
 * Executor entry point: claim a QUEUED run (QUEUED -> RUNNING). Exactly one concurrent caller gets `claimed: true` and the
 * bounded context; everyone else gets `claimed: false` with the current status. `provider` is the executor's own provider and
 * is checked by the database against the run, so a ChatGPT run can never be claimed as Claude by changing a parameter.
 */
export async function claimExecution(ctx: ExecutionContext, runId: string, provider: AutomationDefinition['provider'], deps: ExecutionDeps = {}): Promise<ExecutionResult<ClaimOutcome>> {
  if (!hubOn(deps)) return hubOff();
  if (!validCtx(ctx) || !UUID.test(runId)) return fail('INVALID_INPUT', 'A workspace and a run are required.');
  const { data, error } = await writerOf(deps).rpc('rpc_ai_execution_claim', { p_actor_id: ctx.userId, p_run_id: runId, p_provider: provider });
  if (error || !data) return error ? rpcFail(error) : fail('EXECUTION_FAILED', 'The claim could not be completed.');
  const d = data as Record<string, unknown>;
  if (d.claimed !== true) return { ok: true, data: { claimed: false, runId: String(d.run_id), status: String(d.status), reason: String(d.reason ?? 'NOT_QUEUED') } };
  const sections = (d.sections as AutomationDefinition['sections'] | null) ?? [];
  const workflow = d.workflow as AutomationDefinition['workflow'];
  return {
    ok: true,
    data: {
      claimed: true,
      claim: {
        runId: String(d.run_id), automationId: (d.automation_id as string | null) ?? null, workflow, provider: d.provider as AutomationDefinition['provider'],
        trigger: d.trigger_type as ExecutionTrigger, scheduledFor: (d.scheduled_for as string | null) ?? null, timezone: (d.timezone as string | null) ?? null,
        sections, delivery: (d.delivery as AutomationDefinition['delivery'] | null) ?? ['ai_hub'], plan: executionPlan({ workflow, sections }),
        externalRunId: String(d.external_run_id), retryOfRunId: (d.retry_of_run_id as string | null) ?? null,
      },
    },
  };
}

/**
 * Record an executor failure on a run: FAILED with a normalized category and a bounded, sanitized one-line summary (no
 * secrets, URLs, e-mail addresses or stack traces). The existing lifecycle makes repeating the same status a no-op and
 * refuses any change of a finished run.
 */
export async function reportExecutionFailure(
  ctx: ExecutionContext, runId: string, category: ExecutionFailureCategory, summary: unknown, deps: ExecutionDeps = {},
): Promise<ExecutionResult<{ runId: string; status: string; changed: boolean }>> {
  if (!hubOn(deps)) return hubOff();
  if (!validCtx(ctx) || !UUID.test(runId) || !(EXECUTION_FAILURE_CATEGORIES as readonly string[]).includes(category)) return fail('INVALID_INPUT', 'A run and a failure category are required.');
  const { data, error } = await writerOf(deps).rpc('rpc_ai_finalize_run', {
    p_actor_id: ctx.userId, p_run_id: runId, p_status: 'FAILED', p_counts: null, p_error_category: category,
    p_error_detail: sanitizeFailureSummary(summary) || 'The run failed.',
  });
  if (error || !data) return error ? rpcFail(error) : fail('EXECUTION_FAILED', 'The failure could not be recorded.');
  const d = data as { run_id: string; status: string; changed: boolean };
  return { ok: true, data: { runId: d.run_id, status: d.status, changed: d.changed } };
}

/** A retry is a NEW QUEUED run linked to the failed one (same occurrence, bounded attempts); history is never rewritten. */
export async function requestRetry(ctx: ExecutionContext, failedRunId: string, deps: ExecutionDeps = {}) {
  if (!UUID.test(failedRunId)) return fail<never>('INVALID_INPUT', 'A run to retry is required.');
  return requestExecution(ctx, { automationId: null, trigger: 'retry', retryOfRunId: failedRunId }, deps);
}

// ---- history ---------------------------------------------------------------------------------------------------------------

export interface AutomationRunView {
  id: string; status: string; trigger: ExecutionTrigger; scheduledFor: string | null; startedAt: string | null; completedAt: string | null;
  createdAt: string; errorCategory: string | null;
}
const HISTORY_COLUMNS = 'id, status, trigger_type, scheduled_for, started_at, completed_at, created_at, error_category';

/** Recent runs of one automation (caller-scoped read: RLS decides). Only the normalized error category, never error_detail. */
export async function listAutomationRuns(ctx: ExecutionContext & { accessToken: string }, automationId: string, deps: ExecutionDeps = {}): Promise<ExecutionResult<AutomationRunView[]>> {
  if (!validCtx(ctx) || !UUID.test(automationId)) return fail('INVALID_INPUT', 'A workspace and an automation are required.');
  const reader = deps.runReader ?? (userClient(ctx.accessToken) as unknown as Reader);
  // Same attribution rule as the derived state on the card: runs linked to this automation, plus provider-submitted runs
  // of the same workflow and provider (a provider-side schedule reports through the ingest without a claim).
  const cfg = await reader.from('ai_workflow_configs').select('workflow, primary_provider')
    .eq('id', automationId).eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.userId).maybeSingle();
  if (cfg.error) return fail('READ_FAILED', 'Could not load run history.');
  const c = cfg.data as { workflow: string; primary_provider: string | null } | null;
  if (!c) return fail('AUTOMATION_NOT_FOUND', 'Automation not found.');
  const match = c.primary_provider ? `automation_id.eq.${automationId},and(workflow.eq.${c.workflow},provider.eq.${c.primary_provider})` : `automation_id.eq.${automationId}`;
  const res = await reader.from('ai_runs').select(HISTORY_COLUMNS)
    .eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.userId).or(match)
    .order('created_at', { ascending: false }).limit(10);
  if (res.error) return fail('READ_FAILED', 'Could not load run history.');
  return {
    ok: true,
    data: ((res.data ?? []) as Array<Record<string, string | null>>).map((r) => ({
      id: r.id as string, status: r.status as string, trigger: r.trigger_type as ExecutionTrigger, scheduledFor: r.scheduled_for ?? null,
      startedAt: r.started_at ?? null, completedAt: r.completed_at ?? null, createdAt: r.created_at as string, errorCategory: r.error_category ?? null,
    })),
  };
}

export { executorState, type ExecutorState };
