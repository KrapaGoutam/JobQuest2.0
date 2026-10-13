// AI-11A: provider-neutral automation definitions (the AI Hub "Automations" settings).
//
// An automation is an owner-scoped `ai_workflow_configs` row. Reads run AS THE CALLER (RLS: owner only, active
// member), so the database is the authority on visibility; the owner filter below is belt and braces. Writes go
// through the service_role RPCs with the actor id the API derived from the verified session; the RPCs re-verify
// ACTIVE membership and ownership and re-validate every field. Nothing here is reachable from MCP or a provider.
//
// Operational state is DERIVED: last run / last success / last error from `ai_runs` (same owner, workflow and
// provider; only the normalized error_category is read, never error_detail) and `nextExpectedRunAt` from the
// schedule. Nothing is copied back into the configuration row. JobQuest does not execute workflows, so Run Now is
// reported as a contract (`runNow`) rather than an action; see runNowReadiness.
import { admin as adminClient, userClient } from '../lib/db';
import { isAiHubServerEnabled } from '../lib/aiHubConfig';
import {
  AUTOMATION_LIMIT, computeNextExpectedRun, deriveAutomationRunState, runNowReadiness, validateAutomation,
  type AutomationDefinition, type AutomationRunSlice, type RunNowReadiness,
} from '../lib/aiContract';
import { UUID } from './aiReadSupport';

export type AutomationErrorCode =
  | 'INVALID_INPUT' | 'AUTOMATION_NOT_FOUND' | 'AUTOMATION_CONFLICT' | 'AUTOMATION_LIMIT' | 'WORKSPACE_ACCESS_DENIED'
  | 'AI_HUB_DISABLED' | 'READ_FAILED' | 'SAVE_FAILED';
export interface AutomationError { code: AutomationErrorCode; message: string; field?: string }
export type AutomationResult<T> = { ok: true; data: T } | { ok: false; error: AutomationError };

export interface AutomationContext {
  /** From the verified session and the workspace the UI is in; never from a provider payload. */
  workspaceId: string;
  userId: string;
  accessToken: string;
}

export interface AutomationView extends AutomationDefinition {
  id: string;
  createdAt: string;
  updatedAt: string;
  state: {
    lastRunAt: string | null;
    lastStatus: string | null;
    lastSuccessAt: string | null;
    lastErrorCategory: string | null;
    /** Computed from the schedule; null when disabled / manual-only. */
    nextExpectedRunAt: string | null;
  };
  /** Run Now contract (AI-11A defers execution): ready is false until a provider adapter can accept work. */
  runNow: RunNowReadiness;
}

// Narrow structural types so the unit tests can supply fakes.
type Reader = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Writer = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }> };
export interface AutomationDeps { reader?: Reader; writer?: Writer; aiHubEnabled?: () => boolean; now?: () => Date }

const CONFIG_COLUMNS = 'id, name, workflow, enabled, primary_provider, cadence, local_time, timezone, weekdays, sections, delivery, created_at, updated_at';
const RUN_COLUMNS = 'status, created_at, completed_at, error_category';

interface ConfigRow {
  id: string; name: string; workflow: AutomationDefinition['workflow']; enabled: boolean; primary_provider: AutomationDefinition['provider'] | null;
  cadence: AutomationDefinition['cadence']; local_time: string | null; timezone: string | null; weekdays: number[] | null;
  sections: AutomationDefinition['sections'] | null; delivery: AutomationDefinition['delivery'] | null; created_at: string; updated_at: string;
}

const fail = <T>(code: AutomationErrorCode, message: string, field?: string): AutomationResult<T> => ({ ok: false, error: { code, message, ...(field ? { field } : {}) } });
const readFail = <T>() => fail<T>('READ_FAILED', 'Could not load automations.');

function toView(row: ConfigRow, run: ReturnType<typeof deriveAutomationRunState>, aiHubEnabled: boolean, now: Date): AutomationView {
  const def: AutomationDefinition = {
    name: row.name, workflow: row.workflow, enabled: row.enabled, provider: row.primary_provider ?? 'manual', cadence: row.cadence,
    localTime: row.local_time, timezone: row.timezone, weekdays: row.weekdays ?? [], sections: row.sections ?? [], delivery: row.delivery ?? ['ai_hub'],
  };
  return {
    ...def, id: row.id, createdAt: row.created_at, updatedAt: row.updated_at,
    state: { ...run, nextExpectedRunAt: computeNextExpectedRun(def, now) },
    runNow: runNowReadiness(def, { aiHubEnabled }),
  };
}

export async function listAutomations(ctx: AutomationContext, deps: AutomationDeps = {}): Promise<AutomationResult<AutomationView[]>> {
  if (!UUID.test(ctx.workspaceId)) return fail('INVALID_INPUT', 'A workspace is required.');
  const reader = deps.reader ?? (userClient(ctx.accessToken) as unknown as Reader);
  const aiHubEnabled = (deps.aiHubEnabled ?? isAiHubServerEnabled)();
  const now = (deps.now ?? (() => new Date()))();

  const cfg = await reader.from('ai_workflow_configs').select(CONFIG_COLUMNS)
    .eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.userId).order('created_at', { ascending: true }).limit(AUTOMATION_LIMIT);
  if (cfg.error) return readFail();
  const rows = (cfg.data ?? []) as ConfigRow[];

  // At most AUTOMATION_LIMIT rows -> at most 2 tiny indexed queries each; exact per automation.
  const views = await Promise.all(rows.map(async (row) => {
    const base = () => reader.from('ai_runs').select(RUN_COLUMNS).eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.userId)
      .eq('workflow', row.workflow).eq('provider', row.primary_provider ?? '');
    const [latest, success] = await Promise.all([
      base().order('created_at', { ascending: false }).limit(1),
      base().eq('status', 'SUCCEEDED').order('created_at', { ascending: false }).limit(1),
    ]);
    if (latest.error || success.error) return null;
    const state = deriveAutomationRunState(
      ((latest.data ?? [])[0] ?? null) as AutomationRunSlice | null,
      ((success.data ?? [])[0] ?? null) as AutomationRunSlice | null,
    );
    return toView(row, state, aiHubEnabled, now);
  }));
  if (views.some((v) => v === null)) return readFail();
  return { ok: true, data: views as AutomationView[] };
}

const RPC_ERRORS: Record<string, [AutomationErrorCode, string]> = {
  '42501': ['WORKSPACE_ACCESS_DENIED', 'Workspace access denied.'],
  P0002: ['AUTOMATION_NOT_FOUND', 'Automation not found.'],
  '23505': ['AUTOMATION_CONFLICT', 'An automation with this name, or for this workflow and provider, already exists.'],
  '53400': ['AUTOMATION_LIMIT', `You can have at most ${AUTOMATION_LIMIT} automations. Delete one first.`],
  '22023': ['INVALID_INPUT', 'The automation settings are not valid.'],
};
function rpcFail<T>(code: string | undefined, fallback: AutomationErrorCode, message: string): AutomationResult<T> {
  const mapped = code ? RPC_ERRORS[code] : undefined;
  return mapped ? fail(mapped[0], mapped[1]) : fail(fallback, message);
}

/** Create (id null) or update. Validation happens here first (friendly field errors) and again in the RPC. */
export async function saveAutomation(
  ctx: AutomationContext, id: string | null, input: unknown, deps: AutomationDeps = {},
): Promise<AutomationResult<{ id: string; created: boolean }>> {
  if (!(deps.aiHubEnabled ?? isAiHubServerEnabled)()) return fail('AI_HUB_DISABLED', 'AI Hub is disabled on this server.');
  if (!UUID.test(ctx.workspaceId) || (id !== null && !UUID.test(id))) return fail('INVALID_INPUT', 'A workspace is required.');
  const v = validateAutomation(input);
  if (!v.ok) return fail('INVALID_INPUT', v.message, v.field);
  const a = v.value;
  const writer = deps.writer ?? (adminClient() as unknown as Writer);
  const { data, error } = await writer.rpc('rpc_ai_automation_save', {
    p_actor_id: ctx.userId, p_workspace_id: ctx.workspaceId, p_id: id, p_name: a.name, p_workflow: a.workflow, p_enabled: a.enabled,
    p_provider: a.provider, p_cadence: a.cadence, p_local_time: a.localTime, p_timezone: a.timezone, p_weekdays: a.weekdays,
    p_sections: a.sections, p_delivery: a.delivery,
  });
  if (error || !data) return rpcFail(error?.code, 'SAVE_FAILED', 'Could not save the automation.');
  const out = data as { id: string; created: boolean };
  return { ok: true, data: { id: out.id, created: out.created } };
}

/** Deleting never depends on the AI Hub kill switch (like revoking a connector token). */
export async function deleteAutomation(ctx: AutomationContext, id: string, deps: AutomationDeps = {}): Promise<AutomationResult<{ id: string }>> {
  if (!UUID.test(ctx.workspaceId) || !UUID.test(id)) return fail('INVALID_INPUT', 'A workspace and an automation are required.');
  const writer = deps.writer ?? (adminClient() as unknown as Writer);
  const { data, error } = await writer.rpc('rpc_ai_automation_delete', { p_actor_id: ctx.userId, p_workspace_id: ctx.workspaceId, p_id: id });
  if (error || !data) return rpcFail(error?.code, 'SAVE_FAILED', 'Could not delete the automation.');
  return { ok: true, data: { id } };
}
