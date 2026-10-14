// AI-11H: automation health + run analytics (pure; no I/O, no secrets).
//
// Everything here is DERIVED from data that already exists (ai_workflow_configs, ai_runs, provider connection evidence). Nothing is
// persisted, no new status enum is stored, and nobody can set a health state by hand. The states reuse the domain's own words:
//   disabled | running | needs_setup | needs_attention | never_run | healthy
// plus the list of plain reasons that explain WHY (each reason is also what the owner should do), and whether intervention is needed.
import { EXECUTION_STALE_AFTER_MS, type ProviderCredentialState, type ProviderConnectionState, type SchedulerReadiness } from './providerAdapters';
import { isSchedulerProvider } from './providerAdapters';
import type { AutomationProvider } from './automation';

export const AUTOMATION_RETRY_LIMIT = 3; // AI-11F contract: a failed first attempt is retried as new linked runs, at most 3.

export type AutomationHealthState = 'healthy' | 'running' | 'needs_setup' | 'needs_attention' | 'never_run' | 'disabled';

export interface HealthRun {
  id: string;
  status: string;
  trigger: string; // scheduled | manual | retry
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorCategory: string | null;
  /** `retry:<first run>:<n>` -> n; null for other runs. */
  retryAttempt: number | null;
}

export interface HealthProvider {
  connection: ProviderConnectionState;
  canIngest: boolean;
  credential: ProviderCredentialState;
  scheduler: SchedulerReadiness;
}

export interface HealthInput {
  enabled: boolean;
  provider: AutomationProvider;
  cadence: string;
  nextExpectedRunAt: string | null;
  /** Newest first; automation-linked runs only (bounded by the caller). */
  runs: readonly HealthRun[];
  /** Null when the provider is `manual` or its status could not be read. */
  providerStatus: HealthProvider | null;
  now: Date;
}

export interface RetryState {
  /** 1..AUTOMATION_RETRY_LIMIT of the newest retry attempt. */
  attempt: number;
  limit: number;
  /** A retry is queued or running right now. */
  inFlight: boolean;
  /** The newest attempt failed and no attempts remain. */
  exhausted: boolean;
}

export interface AutomationHealth {
  state: AutomationHealthState;
  label: string;
  variant: 'success' | 'warning' | 'danger' | 'info' | 'muted';
  /** Why, in order of importance (plain language, safe to render). */
  reasons: string[];
  /** The owner has something to DO (reconnect, create the provider schedule, look at a failure). Disabled is never intervention. */
  interventionRequired: boolean;
  retry: RetryState | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastTrigger: string | null;
  nextExpectedRunAt: string | null;
}

const FINISHED_OK = ['SUCCEEDED'];
const IN_FLIGHT = ['QUEUED', 'RUNNING'];

const VIEW: Record<AutomationHealthState, { label: string; variant: AutomationHealth['variant'] }> = {
  healthy: { label: 'Healthy', variant: 'success' },
  running: { label: 'Running', variant: 'info' },
  needs_setup: { label: 'Needs setup', variant: 'info' },
  needs_attention: { label: 'Needs attention', variant: 'warning' },
  never_run: { label: 'Never run', variant: 'muted' },
  disabled: { label: 'Disabled', variant: 'muted' },
};

/** "retry:<uuid>:2" -> 2. */
export function retryAttemptOf(externalRunId: string | null | undefined): number | null {
  const m = /^retry:[0-9a-f-]{36}:(\d+)$/i.exec(externalRunId ?? '');
  return m ? Number(m[1]) : null;
}

function retryState(runs: readonly HealthRun[]): RetryState | null {
  const newest = runs[0];
  if (!newest || newest.trigger !== 'retry') return null;
  const attempt = newest.retryAttempt ?? 1;
  const inFlight = IN_FLIGHT.includes(newest.status);
  return { attempt, limit: AUTOMATION_RETRY_LIMIT, inFlight, exhausted: newest.status === 'FAILED' && attempt >= AUTOMATION_RETRY_LIMIT };
}

export function deriveAutomationHealth(i: HealthInput): AutomationHealth {
  const latest = i.runs[0] ?? null;
  const lastSuccess = i.runs.find((r) => FINISHED_OK.includes(r.status)) ?? null;
  const lastFailure = i.runs.find((r) => r.status === 'FAILED') ?? null;
  const base = {
    lastRunAt: latest?.createdAt ?? null,
    lastSuccessAt: lastSuccess ? lastSuccess.completedAt ?? lastSuccess.createdAt : null,
    lastFailureAt: lastFailure ? lastFailure.completedAt ?? lastFailure.createdAt : null,
    lastTrigger: latest?.trigger ?? null,
    nextExpectedRunAt: i.enabled ? i.nextExpectedRunAt : null,
    retry: retryState(i.runs),
  };
  const done = (state: AutomationHealthState, reasons: string[], intervention: boolean): AutomationHealth => ({
    state, ...VIEW[state], reasons, interventionRequired: intervention, ...base,
  });

  if (!i.enabled) return done('disabled', ['Disabled: a provider claim is refused and nothing runs. Enable it to resume.'], false);

  const attention: string[] = [];
  const setup: string[] = [];

  // ---- provider readiness (a manual-only / provider-less automation has none) ----
  const supported = isSchedulerProvider(i.provider);
  const p = i.providerStatus;
  if (supported && p) {
    if (p.credential === 'expired') attention.push('The provider credential has expired or its authorization ended. Reconnect it under Providers.');
    else if (p.credential === 'revoked') attention.push('The provider credential was revoked. Create or authorize a new one under Providers.');
    // A past success proves the path worked once; if it has since stopped working the credential is expired / revoked (above), not absent.
    else if (p.connection !== 'connected') { if (!lastSuccess) setup.push('The provider is not connected to JobQuest yet. Connect it under Providers.'); }
    else if (!p.canIngest) attention.push('The provider connection cannot save results. Reconnect it with permission to save AI findings.');
    if (p.connection === 'connected' && p.canIngest && i.cadence !== 'manual_only' && p.scheduler === 'SETUP_REQUIRED' && !i.runs.some((r) => r.trigger !== 'manual')) {
      setup.push('Connected, but the provider has not claimed a scheduled run yet. Create its schedule with the setup instructions.');
    }
  } else if (!supported && i.cadence !== 'manual_only') {
    setup.push('No provider is selected. Choose Claude, ChatGPT or Gemini to run this on a schedule.');
  }

  // ---- run evidence ----
  const stale = latest && IN_FLIGHT.includes(latest.status) && latest.startedAt
    && i.now.getTime() - Date.parse(latest.startedAt) > EXECUTION_STALE_AFTER_MS;
  if (stale) attention.push('A run was claimed over an hour ago and never reported back. The next claim will mark it failed and retry it.');
  if (latest?.status === 'FAILED') {
    attention.push('The last run failed.');
  } else if (latest?.status === 'PARTIAL') {
    attention.push('The last run finished partially: some steps or sources could not be completed.');
  }
  if (base.retry?.exhausted) attention.push(`All ${AUTOMATION_RETRY_LIMIT} retry attempts failed. Look at the failure, then wait for the next occurrence or run it again.`);

  const running = latest && IN_FLIGHT.includes(latest.status) && !stale;
  if (running) {
    const reasons = base.retry?.inFlight ? [`Retry attempt ${base.retry.attempt} of ${AUTOMATION_RETRY_LIMIT} is running.`, ...attention] : ['A run is in progress.', ...attention];
    return done('running', reasons, attention.length > 0);
  }
  if (attention.length) return done('needs_attention', [...attention, ...setup], true);
  if (setup.length) return done('needs_setup', setup, true);
  if (!latest) return done('never_run', [i.cadence === 'manual_only' ? 'Manual only: it runs when you start it from the provider.' : 'Ready, waiting for its first run.'], false);
  return done('healthy', ['The last run succeeded.'], false);
}

// ---- analytics (derived from ai_runs; owner/workspace scoped by the caller) -------------------------------------------------------

export interface AnalyticsRun {
  id: string;
  automationId: string;
  provider: string;
  workflow: string;
  status: string;
  trigger: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorCategory: string | null;
  /** `ai_runs.sources` statuses/types only (no refs, no URLs). */
  sources: ReadonlyArray<{ type: string; status: string }>;
}

export interface Tally { runs: number; succeeded: number; partial: number; failed: number }
export interface AutomationAnalytics {
  windowDays: number;
  /** Runs in the window attributed to a configured automation: linked by claim (automation_id), or provider-submitted runs of the same workflow + provider (same rule as the card and its history). */
  totalRuns: number;
  finishedRuns: number;
  inFlightRuns: number;
  succeeded: number;
  partial: number;
  failed: number;
  cancelled: number;
  /** succeeded / finished (partial counted separately, never as success). Null when nothing finished. */
  successRate: number | null;
  byTrigger: { scheduled: number; manual: number; retry: number };
  retries: { attempts: number; recovered: number };
  byProvider: Array<{ key: string } & Tally>;
  byWorkflow: Array<{ key: string } & Tally>;
  /** Mean of completed - started over finished runs that have both, in ms (provider time included). Null when none. */
  avgCompletionMs: number | null;
  /** Source observations that were unavailable / blocked / errored across the window (never counted as "zero results"). */
  sourceProblems: { total: number; byType: Array<{ key: string; count: number }> };
  recentFailures: Array<{ runId: string; automationId: string; provider: string; workflow: string; at: string; errorCategory: string | null; trigger: string }>;
}

const FINISHED = ['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED'];
const SOURCE_PROBLEM = ['unavailable', 'blocked', 'error'];

function tally(rows: readonly AnalyticsRun[], key: (r: AnalyticsRun) => string): Array<{ key: string } & Tally> {
  const m = new Map<string, Tally>();
  for (const r of rows) {
    const t = m.get(key(r)) ?? { runs: 0, succeeded: 0, partial: 0, failed: 0 };
    t.runs += 1;
    if (r.status === 'SUCCEEDED') t.succeeded += 1;
    else if (r.status === 'PARTIAL') t.partial += 1;
    else if (r.status === 'FAILED') t.failed += 1;
    m.set(key(r), t);
  }
  return [...m.entries()].map(([k, t]) => ({ key: k, ...t })).sort((a, b) => b.runs - a.runs || a.key.localeCompare(b.key));
}

export function summarizeAutomationRuns(rows: readonly AnalyticsRun[], windowDays: number, recentFailureLimit = 5): AutomationAnalytics {
  const finished = rows.filter((r) => FINISHED.includes(r.status));
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const durations = finished.filter((r) => r.startedAt && r.completedAt)
    .map((r) => Date.parse(r.completedAt!) - Date.parse(r.startedAt!)).filter((d) => Number.isFinite(d) && d >= 0);
  const problems = new Map<string, number>();
  for (const r of rows) for (const s of r.sources) if (SOURCE_PROBLEM.includes(s.status)) problems.set(s.type, (problems.get(s.type) ?? 0) + 1);
  const retryRuns = rows.filter((r) => r.trigger === 'retry');
  const succeeded = count('SUCCEEDED');
  return {
    windowDays,
    totalRuns: rows.length,
    finishedRuns: finished.length,
    inFlightRuns: rows.filter((r) => IN_FLIGHT.includes(r.status)).length,
    succeeded, partial: count('PARTIAL'), failed: count('FAILED'), cancelled: count('CANCELLED'),
    successRate: finished.length ? succeeded / finished.length : null,
    byTrigger: { scheduled: rows.filter((r) => r.trigger === 'scheduled').length, manual: rows.filter((r) => r.trigger === 'manual').length, retry: retryRuns.length },
    retries: { attempts: retryRuns.length, recovered: retryRuns.filter((r) => r.status === 'SUCCEEDED').length },
    byProvider: tally(rows, (r) => r.provider),
    byWorkflow: tally(rows, (r) => r.workflow),
    avgCompletionMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    sourceProblems: {
      total: [...problems.values()].reduce((a, b) => a + b, 0),
      byType: [...problems.entries()].map(([key, c]) => ({ key, count: c })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
    },
    recentFailures: rows.filter((r) => r.status === 'FAILED')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, recentFailureLimit)
      .map((r) => ({ runId: r.id, automationId: r.automationId, provider: r.provider, workflow: r.workflow, at: r.completedAt ?? r.createdAt, errorCategory: r.errorCategory, trigger: r.trigger })),
  };
}
