// AI-11H: automation health + analytics (read-only, derived).
//
// One bounded read of the owner's recent `ai_runs` (RLS: the caller's own rows), joined in memory with the automation definitions
// (aiAutomationService.listAutomations) and provider connection evidence (aiSchedulerStatusService.getSchedulerStatus). Nothing is
// stored; there is no aggregate table and no monitoring job. A run is attributed to an automation exactly like the card and its history
// do: linked by a claim (`automation_id`), or (only while it is the sole automation of its workflow + provider) a provider-submitted run.
import { userClient } from '../lib/db';
import {
  AUTOMATION_LIMIT, attributeRunToAutomation, deriveAutomationHealth, retryAttemptOf, summarizeAutomationRuns,
  type AnalyticsRun, type AutomationAnalytics, type AutomationHealth, type HealthRun, type ProviderSchedulerStatus,
} from '../lib/aiContract';
import { listAutomations, type AutomationDeps, type AutomationView } from './aiAutomationService';
import { getSchedulerStatus, type SchedulerDeps } from './aiSchedulerStatusService';
import { UUID } from './aiReadSupport';

export const INSIGHT_WINDOWS = [7, 30, 90] as const;
export type InsightWindow = (typeof INSIGHT_WINDOWS)[number];
export const DEFAULT_INSIGHT_WINDOW: InsightWindow = 30;
/** Hard bound on rows examined (10 automations x at most a few runs a day for 90 days stays well inside this). */
export const INSIGHT_RUN_SCAN = 500;

export interface InsightsContext { workspaceId: string; userId: string; accessToken: string }
export interface AutomationInsights {
  generatedAt: string;
  windowDays: number;
  /** Per automation id. */
  health: Record<string, AutomationHealth>;
  analytics: AutomationAnalytics;
  /** True when more runs exist than were examined (analytics then describe the newest runs only). */
  truncated: boolean;
}
export type InsightsError = { code: 'INVALID_INPUT' | 'READ_FAILED'; message: string };
export type InsightsResult = { ok: true; data: AutomationInsights } | { ok: false; error: InsightsError };

type Reader = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
export interface InsightsDeps { automation?: AutomationDeps; scheduler?: SchedulerDeps; reader?: Reader; now?: () => Date }

interface RunRow {
  id: string; automation_id: string | null; provider: string; workflow: string; status: string; trigger_type: string; created_at: string;
  started_at: string | null; completed_at: string | null; error_category: string | null; sources: unknown; external_run_id: string | null;
}
const COLUMNS = 'id, automation_id, provider, workflow, status, trigger_type, created_at, started_at, completed_at, error_category, sources, external_run_id';

const fail = (code: InsightsError['code'], message: string): InsightsResult => ({ ok: false, error: { code, message } });
export const isInsightWindow = (n: number): n is InsightWindow => (INSIGHT_WINDOWS as readonly number[]).includes(n);

/** Which automation a run belongs to (null = none). Pure; identity is the automation id, never workflow + provider. */
export function attributeRun(run: Pick<RunRow, 'automation_id' | 'provider' | 'workflow'> & { external_run_id?: string | null }, automations: ReadonlyArray<Pick<AutomationView, 'id' | 'provider' | 'workflow'>>): string | null {
  return attributeRunToAutomation(run, automations);
}

const sourcesOf = (v: unknown): Array<{ type: string; status: string }> =>
  (Array.isArray(v) ? v : []).flatMap((s) => (s && typeof s === 'object' && typeof (s as { status?: unknown }).status === 'string'
    ? [{ type: String((s as { type?: unknown }).type ?? 'source').slice(0, 32), status: (s as { status: string }).status }] : []));

export async function getAutomationInsights(ctx: InsightsContext, windowDays: number = DEFAULT_INSIGHT_WINDOW, deps: InsightsDeps = {}): Promise<InsightsResult> {
  if (!UUID.test(ctx.workspaceId) || !UUID.test(ctx.userId) || !isInsightWindow(windowDays)) return fail('INVALID_INPUT', 'A workspace and a valid period (7, 30 or 90 days) are required.');
  const now = (deps.now ?? (() => new Date()))();
  const reader = deps.reader ?? (userClient(ctx.accessToken) as unknown as Reader);

  const listed = await listAutomations(ctx, { ...deps.automation, now: deps.now });
  if (!listed.ok) return fail('READ_FAILED', 'Could not load automations.');
  const automations = listed.data.slice(0, AUTOMATION_LIMIT);

  // Provider evidence is secondary: if it cannot be read, health is derived from the runs alone (and says nothing about connection).
  const sched = await getSchedulerStatus(ctx, { ...deps.scheduler, now: deps.now });
  const statuses: ProviderSchedulerStatus[] = sched.ok ? sched.data : [];

  const since = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const res = await reader.from('ai_runs').select(COLUMNS)
    .eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.userId).gte('created_at', since)
    .order('created_at', { ascending: false }).limit(INSIGHT_RUN_SCAN + 1);
  if (res.error) return fail('READ_FAILED', 'Could not load automation runs.');
  const all = (res.data ?? []) as RunRow[];
  const truncated = all.length > INSIGHT_RUN_SCAN;
  const rows = all.slice(0, INSIGHT_RUN_SCAN);

  const byAutomation = new Map<string, RunRow[]>();
  for (const r of rows) {
    const id = attributeRun(r, automations);
    if (id) byAutomation.set(id, [...(byAutomation.get(id) ?? []), r]);
  }

  const health: Record<string, AutomationHealth> = {};
  for (const a of automations) {
    const mine = byAutomation.get(a.id) ?? [];
    let runs: HealthRun[] = mine.map((r) => ({
      id: r.id, status: r.status, trigger: r.trigger_type, createdAt: r.created_at, startedAt: r.started_at, completedAt: r.completed_at,
      errorCategory: r.error_category, retryAttempt: retryAttemptOf(r.external_run_id),
    }));
    // Older than the scan window: fall back to the derived card state so a quiet automation is never reported "never run".
    if (runs.length === 0 && a.state.lastRunAt && a.state.lastStatus) {
      runs = [{ id: 'state', status: a.state.lastStatus, trigger: a.state.lastTrigger ?? 'scheduled', createdAt: a.state.lastRunAt, startedAt: null, completedAt: null, errorCategory: a.state.lastErrorCategory, retryAttempt: null }];
    }
    const p = statuses.find((s) => s.provider === a.provider) ?? null;
    health[a.id] = deriveAutomationHealth({
      enabled: a.enabled, provider: a.provider, cadence: a.cadence, nextExpectedRunAt: a.state.nextExpectedRunAt, runs,
      providerStatus: p ? { connection: p.connection, canIngest: p.canIngest, credential: p.credential, scheduler: p.scheduler } : null, now,
    });
  }

  const cutoff = now.getTime() - windowDays * 86_400_000;
  const analyticsRows: AnalyticsRun[] = [];
  for (const r of rows) {
    if (Date.parse(r.created_at) < cutoff) continue;
    const id = attributeRun(r, automations);
    if (!id) continue;
    analyticsRows.push({
      id: r.id, automationId: id, provider: r.provider, workflow: r.workflow, status: r.status, trigger: r.trigger_type, createdAt: r.created_at,
      startedAt: r.started_at, completedAt: r.completed_at, errorCategory: r.error_category, sources: sourcesOf(r.sources),
    });
  }
  return { ok: true, data: { generatedAt: now.toISOString(), windowDays, health, analytics: summarizeAutomationRuns(analyticsRows, windowDays), truncated } };
}
