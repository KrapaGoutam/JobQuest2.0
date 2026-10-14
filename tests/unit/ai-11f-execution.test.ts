import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AUTOMATION_CATCHUP_GRACE_MS, EXECUTION_RETRY_LIMIT, computeNextExpectedRun, executionPlan, executorState, getDueOccurrences,
  latestDueOccurrence, manualRunKey, occurrenceStamp, runNowReadiness, sanitizeFailureSummary, scheduledRunKey,
  type DueCandidate,
} from '../../apps/api/src/lib/aiContract';
import {
  claimExecution, enqueueDueOccurrences, listDueOccurrences, reportExecutionFailure, requestRetry, requestRunNow,
  type ExecutionContext, type ExecutionDeps,
} from '../../apps/api/src/services/aiExecutionService';

// AI-11F: schedule / cadence execution. The pure half: due evaluation (cadences, owner timezone, UTC boundary, DST), one
// shared occurrence calculator with the next-run display, canonical occurrence identity, bounded catch-up, the edit
// boundary, composite step ordering, failure sanitizing and executor readiness; the service half with faithful fakes
// (no executor => nothing is created; claim/report/retry parameters; no secrets). The database half (atomicity,
// concurrency, RLS, lifecycle) is tests/integration/ai-11f-execution.test.ts.

const WS = '11111111-1111-4111-8111-111111111111';
const ME = '22222222-2222-4222-8222-222222222222';
const AUTO = '44444444-4444-4444-8444-444444444444';
const RUN = '55555555-5555-4555-8555-555555555555';
const ctx: ExecutionContext = { workspaceId: WS, userId: ME };

const cand = (over: Partial<DueCandidate> = {}): DueCandidate => ({
  id: AUTO, workflow: 'daily_brief', provider: 'claude', enabled: true, cadence: 'daily', localTime: '08:00', timezone: 'America/Chicago',
  weekdays: [], updatedAt: '2026-01-01T00:00:00Z', ...over,
});
const due = (c: Partial<DueCandidate>, nowIso: string) => getDueOccurrences([cand(c)], new Date(nowIso))[0]?.scheduledFor ?? null;
const MIN = 60_000;

describe('due evaluation — cadences', () => {
  // 2026-10-13 is a Tuesday; 08:00 America/Chicago (CDT, UTC-5) = 13:00Z.
  it('daily: due after the local time, within the catch-up window', () => {
    expect(due({}, '2026-10-13T13:30:00Z')).toBe('2026-10-13T13:00:00.000Z');
    expect(due({}, '2026-10-13T12:59:59Z')).toBeNull(); // not yet
  });
  it('weekdays: Mon-Fri only', () => {
    expect(due({ cadence: 'weekdays' }, '2026-10-16T13:30:00Z')).toBe('2026-10-16T13:00:00.000Z'); // Friday
    expect(due({ cadence: 'weekdays' }, '2026-10-17T13:30:00Z')).toBeNull(); // Saturday
    expect(due({ cadence: 'weekdays' }, '2026-10-18T13:30:00Z')).toBeNull(); // Sunday
  });
  it('selected days: only the chosen ISO weekdays (Tue/Thu)', () => {
    const sel = { cadence: 'selected_days' as const, weekdays: [2, 4] };
    expect(due(sel, '2026-10-13T13:30:00Z')).toBe('2026-10-13T13:00:00.000Z');
    expect(due(sel, '2026-10-14T13:30:00Z')).toBeNull(); // Wednesday
    expect(due(sel, '2026-10-15T13:30:00Z')).toBe('2026-10-15T13:00:00.000Z');
  });
  it('weekly: one day only (Sunday)', () => {
    expect(due({ cadence: 'weekly', weekdays: [7] }, '2026-10-18T13:30:00Z')).toBe('2026-10-18T13:00:00.000Z');
    expect(due({ cadence: 'weekly', weekdays: [7] }, '2026-10-13T13:30:00Z')).toBeNull();
  });
  it('manual_only is never scheduled; a disabled or provider-less automation is never due', () => {
    expect(due({ cadence: 'manual_only', localTime: null, timezone: null }, '2026-10-13T13:30:00Z')).toBeNull();
    expect(due({ enabled: false }, '2026-10-13T13:30:00Z')).toBeNull();
    expect(due({ provider: null }, '2026-10-13T13:30:00Z')).toBeNull();
    expect(due({ timezone: 'Not/AZone' }, '2026-10-13T13:30:00Z')).toBeNull();
  });
});

describe('due evaluation — owner timezone and UTC boundary', () => {
  it('the owner zone decides, not the server or UTC', () => {
    const now = '2026-10-13T13:30:00Z'; // 22:30 in Tokyo
    expect(due({ timezone: 'Asia/Tokyo', localTime: '22:00' }, now)).toBe('2026-10-13T13:00:00.000Z');
    expect(due({ timezone: 'Asia/Tokyo', localTime: '08:00' }, now)).toBeNull(); // this morning's 08:00 JST is 14.5h old: skipped
  });
  it('UTC midnight boundary', () => {
    expect(due({ timezone: 'UTC', localTime: '00:00' }, '2026-10-14T00:10:00Z')).toBe('2026-10-14T00:00:00.000Z');
    expect(due({ timezone: 'UTC', localTime: '00:00' }, '2026-10-13T23:50:00Z')).toBeNull();
  });
  it('the weekday is the LOCAL weekday even when UTC has already rolled over', () => {
    // 20:00 Chicago on Tuesday Oct 13 = 01:00Z on Wednesday Oct 14.
    const now = '2026-10-14T01:30:00Z';
    expect(due({ cadence: 'weekly', weekdays: [2], localTime: '20:00' }, now)).toBe('2026-10-14T01:00:00.000Z'); // local Tuesday
    expect(due({ cadence: 'weekly', weekdays: [3], localTime: '20:00' }, now)).toBeNull(); // UTC Wednesday is not the local day
  });
});

describe('DST (America/Chicago; nothing zone-specific is hardcoded)', () => {
  it('spring forward: a missing wall time runs at the first valid instant after the gap, once', () => {
    // 2026-03-08 02:30 does not exist (02:00 -> 03:00). Policy: 03:30 CDT = 08:30Z.
    const s = { localTime: '02:30' };
    expect(due(s, '2026-03-08T08:40:00Z')).toBe('2026-03-08T08:30:00.000Z');
    expect(computeNextExpectedRun(cand(s), new Date('2026-03-07T20:00:00Z'))).toBe('2026-03-08T08:30:00.000Z');
    expect(due(s, '2026-03-08T08:20:00Z')).toBeNull(); // before the shifted instant
    expect(due(s, '2026-03-09T07:40:00Z')).toBe('2026-03-09T07:30:00.000Z'); // next day, normal CDT 02:30
  });
  it('fall back: an ambiguous wall time executes exactly once (first occurrence, one stable instant)', () => {
    // 2026-11-01 01:30 occurs twice (06:30Z CDT, 07:30Z CST). One occurrence: 06:30Z.
    const seen = new Set<string>();
    for (let t = Date.parse('2026-11-01T06:00:00Z'); t <= Date.parse('2026-11-01T11:30:00Z'); t += 5 * MIN) {
      const at = due({ localTime: '01:30' }, new Date(t).toISOString());
      if (at) seen.add(at);
    }
    expect([...seen]).toEqual(['2026-11-01T06:30:00.000Z']);
    expect(scheduledRunKey(AUTO, [...seen][0]!)).toBe(`auto:${AUTO}:20261101T063000Z`);
  });
  it('an ordinary 08:00 on both transition days stays at 08:00 local', () => {
    expect(due({}, '2026-03-08T13:30:00Z')).toBe('2026-03-08T13:00:00.000Z'); // CDT already
    expect(due({}, '2026-11-01T14:30:00Z')).toBe('2026-11-01T14:00:00.000Z'); // CST: 08:00 = 14:00Z
  });
});

describe('one calculator: the next-run display and due evaluation never disagree', () => {
  const schedules = [
    cand({ cadence: 'daily', localTime: '08:00' }),
    cand({ cadence: 'weekdays', localTime: '02:30' }),
    cand({ cadence: 'selected_days', weekdays: [1, 3, 7], localTime: '01:30' }),
    cand({ cadence: 'weekly', weekdays: [7], localTime: '19:00', timezone: 'Asia/Tokyo' }),
    cand({ cadence: 'daily', localTime: '00:00', timezone: 'UTC' }),
  ];
  it('every expected next run is exactly the instant at which it becomes due, and not a moment earlier', () => {
    for (const s of schedules) {
      for (const start of ['2026-03-05T00:00:00Z', '2026-10-30T00:00:00Z']) {
        let t = Date.parse(start);
        for (let i = 0; i < 40; i++, t += 7 * 3_600_000 + 13 * MIN) {
          const next = computeNextExpectedRun(s, new Date(t));
          expect(next).not.toBeNull();
          const n = Date.parse(next!);
          expect(n).toBeGreaterThan(t);
          expect(latestDueOccurrence(s, new Date(n))).toBe(next);
          expect(latestDueOccurrence(s, new Date(n - 1))).not.toBe(next);
        }
      }
    }
  });
});

describe('canonical occurrence identity', () => {
  it('is deterministic and offset-independent: one automation + one instant = one key', () => {
    expect(scheduledRunKey(AUTO, '2026-10-13T13:00:00.000Z')).toBe(`auto:${AUTO}:20261013T130000Z`);
    expect(scheduledRunKey(AUTO, '2026-10-13T08:00:00-05:00')).toBe(scheduledRunKey(AUTO, '2026-10-13T13:00:00Z'));
    expect(scheduledRunKey('b'.repeat(8), '2026-10-13T13:00:00Z')).not.toBe(scheduledRunKey(AUTO, '2026-10-13T13:00:00Z'));
    expect(occurrenceStamp('2026-11-01T06:30:00.000Z')).toBe('20261101T063000Z');
    expect(() => occurrenceStamp('not a date')).toThrow();
  });
  it('manual keys are per click; the key is the idempotency handle', () => {
    expect(manualRunKey(AUTO, 'click-0001')).toBe(`manual:${AUTO}:click-0001`);
    expect(manualRunKey(AUTO, 'click-0001')).not.toBe(manualRunKey(AUTO, 'click-0002'));
  });
  it('the same candidate evaluated twice yields the identical occurrence', () => {
    const now = new Date('2026-10-13T13:30:00Z');
    expect(getDueOccurrences([cand()], now)).toEqual(getDueOccurrences([cand()], now));
  });
});

describe('missed occurrences — bounded catch-up, never a backlog', () => {
  it('the grace window is three hours', () => {
    expect(AUTOMATION_CATCHUP_GRACE_MS).toBe(3 * 60 * MIN);
    expect(due({}, '2026-10-13T15:50:00Z')).toBe('2026-10-13T13:00:00.000Z'); // 2h50 late: still claimable
    expect(due({}, '2026-10-13T16:01:00Z')).toBeNull(); // 3h01 late: skipped, not replayed
  });
  it('a multi-day outage yields at most the single most recent occurrence, even with a huge grace', () => {
    const many = getDueOccurrences([cand()], new Date('2026-10-18T13:30:00Z'), 7 * 24 * 3_600_000);
    expect(many).toHaveLength(1);
    expect(many[0]!.scheduledFor).toBe('2026-10-18T13:00:00.000Z');
    // Default grace: yesterday's and the day before's occurrences are simply skipped.
    expect(due({}, '2026-10-18T20:00:00Z')).toBeNull();
  });
  it('the result is bounded and ordered deterministically', () => {
    const list = Array.from({ length: 25 }, (_, i) => cand({ id: `id-${String(i).padStart(2, '0')}`, localTime: i % 2 ? '08:00' : '07:30' }));
    const out = getDueOccurrences(list, new Date('2026-10-13T13:40:00Z'));
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out.map((o) => o.scheduledFor + o.automationId)).toEqual([...out.map((o) => o.scheduledFor + o.automationId)].sort());
  });
});

describe('schedule edits', () => {
  it('an edit never retroactively fires a slot the new configuration did not own', () => {
    // 08:00 occurrence (13:00Z) already passed; the rule was edited at 13:20Z. Not due, so no double-run at the boundary.
    expect(due({ updatedAt: '2026-10-13T13:20:00Z' }, '2026-10-13T13:30:00Z')).toBeNull();
    // Re-enabling after the slot is the same: the toggle bumps updated_at.
    expect(due({ updatedAt: '2026-10-13T13:05:00Z' }, '2026-10-13T13:30:00Z')).toBeNull();
  });
  it('the new cadence drives future occurrences; an old-schedule instant never reappears', () => {
    const edited = { updatedAt: '2026-10-13T13:15:00Z', localTime: '08:20' }; // moved 08:00 -> 08:20 at 08:15 local
    expect(due(edited, '2026-10-13T13:30:00Z')).toBe('2026-10-13T13:20:00.000Z'); // the new slot
    expect(due(edited, '2026-10-14T13:30:00Z')).toBe('2026-10-14T13:20:00.000Z');
  });
});

describe('composite workflow ordering — the digest is last', () => {
  it('sections run evidence-first in canonical order whatever order storage returns, and the Daily Digest composes LAST', () => {
    const stored = ['calendar_review', 'email_triage', 'followups', 'goal_summary', 'job_discovery', 'recruiter_intel'] as const; // alphabetical
    expect(executionPlan({ workflow: 'daily_brief', sections: [...stored] })).toEqual([
      'email_triage', 'job_discovery', 'recruiter_intel', 'calendar_review', 'followups', 'goal_summary', 'daily_brief',
    ]);
    expect(executionPlan({ workflow: 'daily_brief', sections: [] })).toEqual(['daily_brief']);
  });
  it('single-purpose workflows are one step; a custom review runs its sections in order and has no digest step', () => {
    for (const w of ['email_triage', 'job_discovery', 'recruiter_intel', 'calendar_review'] as const) expect(executionPlan({ workflow: w, sections: [] })).toEqual([w]);
    expect(executionPlan({ workflow: 'other', sections: ['recruiter_intel', 'email_triage'] })).toEqual(['email_triage', 'recruiter_intel']);
    expect(executionPlan({ workflow: 'other', sections: [] })).toEqual(['other']);
  });
});

describe('failure summaries are bounded and sanitized', () => {
  it('strips tokens, URLs, e-mail addresses, control characters and caps the length', () => {
    const raw = 'HTTP 401 at https://api.example.com/v1?key=sk-live-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123 for jane.doe@example.com\nAuthorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk\u0000 ' + 'x'.repeat(500);
    const out = sanitizeFailureSummary(raw);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out).not.toMatch(/sk-live|eyJ|https?:|@example|Bearer|\n/);
    expect(out).not.toContain(String.fromCharCode(0));
    expect(sanitizeFailureSummary('The connector token expired.')).toBe('The connector token expired.');
    expect(sanitizeFailureSummary(undefined)).toBe('');
    expect(sanitizeFailureSummary({ stack: 'x' })).toBe('');
  });
});

describe('executor readiness (provider-neutral, derived)', () => {
  it('no executor is registered in AI-11F: every provider is not_configured and Run Now says why', () => {
    for (const p of ['claude', 'chatgpt', 'gemini', 'manual'] as const) expect(executorState(p, { aiHubEnabled: true })).toBe('not_configured');
    expect(runNowReadiness({ enabled: true }, { aiHubEnabled: true, executorAvailable: false })).toEqual({ ready: false, reason: 'NO_EXECUTOR' });
  });
  it('a registered executor makes the provider configured (unavailable under the kill switch); manual never has one', () => {
    expect(executorState('claude', { aiHubEnabled: true, registered: ['claude'] })).toBe('configured');
    expect(executorState('claude', { aiHubEnabled: false, registered: ['claude'] })).toBe('unavailable');
    expect(executorState('chatgpt', { aiHubEnabled: true, registered: ['claude'] })).toBe('not_configured');
    expect(executorState('manual', { aiHubEnabled: true, registered: ['claude'] })).toBe('not_configured');
  });
});

// ---- service ------------------------------------------------------------------------------------------------------------

type Rpc = { fn: string; args: Record<string, unknown> };
function fakes(rows: Array<Record<string, unknown>> = [], rpcData: Record<string, unknown> | ((fn: string) => { data?: unknown; error?: { code?: string; message?: string } }) = {}) {
  const calls: Rpc[] = [];
  const chain = {
    select: () => chain, eq: () => chain,
    limit: () => Promise.resolve({ data: rows, error: null }),
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
  };
  const writer = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      const r = typeof rpcData === 'function' ? rpcData(fn) : { data: rpcData };
      return { data: r.data ?? null, error: r.error ?? null };
    }),
  };
  const deps: ExecutionDeps = { configReader: { from: () => chain }, writer, aiHubEnabled: () => true, now: () => new Date('2026-10-13T13:30:00Z') };
  return { deps, calls, writer };
}
const configRow = (over: Record<string, unknown> = {}) => ({
  id: AUTO, workflow: 'daily_brief', enabled: true, primary_provider: 'claude', cadence: 'daily', local_time: '08:00', timezone: 'America/Chicago',
  weekdays: [], updated_at: '2026-01-01T00:00:00Z', ...over,
});

describe('enqueue / Run Now never fabricate work', () => {
  it('listDueOccurrences evaluates the owner\'s enabled automations', async () => {
    const { deps } = fakes([configRow()]);
    const out = await listDueOccurrences(ctx, deps);
    expect(out.ok && out.data).toEqual([{ automationId: AUTO, scheduledFor: '2026-10-13T13:00:00.000Z', workflow: 'daily_brief', provider: 'claude' }]);
  });
  it('without a configured executor nothing is queued', async () => {
    const { deps, writer } = fakes([configRow()]);
    const out = await enqueueDueOccurrences(ctx, deps);
    expect(out).toEqual({ ok: true, data: [] });
    expect(writer.rpc).not.toHaveBeenCalled();
  });
  it('with an executor each due occurrence is requested once, scheduled, with its canonical instant', async () => {
    const { deps, calls } = fakes([configRow()], { run_id: RUN, created: true, status: 'QUEUED', external_run_id: `auto:${AUTO}:20261013T130000Z` });
    const out = await enqueueDueOccurrences(ctx, { ...deps, registered: ['claude'] });
    expect(out.ok && out.data).toEqual([{ automationId: AUTO, scheduledFor: '2026-10-13T13:00:00.000Z', runId: RUN, created: true, status: 'QUEUED', externalRunId: `auto:${AUTO}:20261013T130000Z` }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      fn: 'rpc_ai_execution_request',
      args: { p_actor_id: ME, p_workspace_id: WS, p_automation_id: AUTO, p_trigger_type: 'scheduled', p_scheduled_for: '2026-10-13T13:00:00.000Z', p_client_key: null, p_retry_of_run_id: null },
    });
  });
  it('a provider without an executor is skipped even when another provider has one', async () => {
    const { deps, writer } = fakes([configRow({ primary_provider: 'gemini' })]);
    expect(await enqueueDueOccurrences(ctx, { ...deps, registered: ['claude'] })).toEqual({ ok: true, data: [] });
    expect(writer.rpc).not.toHaveBeenCalled();
  });
  it('Run Now with no executor is NO_EXECUTOR and creates nothing (no fake or stuck run)', async () => {
    const { deps, writer } = fakes([{ id: AUTO, enabled: true, primary_provider: 'claude' }]);
    const out = await requestRunNow(ctx, AUTO, 'click-0001', deps);
    expect(out).toMatchObject({ ok: false, error: { code: 'NO_EXECUTOR' } });
    expect(writer.rpc).not.toHaveBeenCalled();
  });
  it('Run Now: disabled, unknown, invalid key and the kill switch', async () => {
    expect(await requestRunNow(ctx, AUTO, 'click-0001', { ...fakes([{ id: AUTO, enabled: false, primary_provider: 'claude' }]).deps, registered: ['claude'] })).toMatchObject({ ok: false, error: { code: 'AUTOMATION_DISABLED' } });
    expect(await requestRunNow(ctx, AUTO, 'click-0001', { ...fakes([]).deps, registered: ['claude'] })).toMatchObject({ ok: false, error: { code: 'AUTOMATION_NOT_FOUND' } });
    expect(await requestRunNow(ctx, AUTO, 'x', { ...fakes([]).deps, registered: ['claude'] })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(await requestRunNow(ctx, AUTO, 'click-0001', { ...fakes([]).deps, aiHubEnabled: () => false })).toMatchObject({ ok: false, error: { code: 'AI_HUB_DISABLED' } });
  });
  it('Run Now with an executor uses the SAME lifecycle: a manual QUEUED request keyed by the client key', async () => {
    const { deps, calls } = fakes([{ id: AUTO, enabled: true, primary_provider: 'claude' }], { run_id: RUN, created: true, status: 'QUEUED', external_run_id: `manual:${AUTO}:click-0001` });
    const out = await requestRunNow(ctx, AUTO, 'click-0001', { ...deps, registered: ['claude'] });
    expect(out).toEqual({ ok: true, data: { runId: RUN, created: true, status: 'QUEUED' } });
    expect(calls[0]).toMatchObject({ fn: 'rpc_ai_execution_request', args: { p_trigger_type: 'manual', p_client_key: 'click-0001', p_scheduled_for: null, p_actor_id: ME, p_workspace_id: WS } });
  });
});

describe('claim / report / retry', () => {
  const claimed = {
    claimed: true, run_id: RUN, status: 'RUNNING', automation_id: AUTO, workflow: 'daily_brief', provider: 'claude', trigger_type: 'scheduled',
    scheduled_for: '2026-10-13T13:00:00+00:00', timezone: 'America/Chicago', sections: ['calendar_review', 'email_triage'], delivery: ['ai_hub'],
    external_run_id: `auto:${AUTO}:20261013T130000Z`, retry_of_run_id: null,
  };
  it('the winner gets a bounded, credential-free context with the ordered plan', async () => {
    const { deps, calls } = fakes([], claimed);
    const out = await claimExecution(ctx, RUN, 'claude', deps);
    if (!out.ok || !out.data.claimed) throw new Error('expected a claim');
    expect(out.data.claim).toEqual({
      runId: RUN, automationId: AUTO, workflow: 'daily_brief', provider: 'claude', trigger: 'scheduled', scheduledFor: '2026-10-13T13:00:00+00:00',
      timezone: 'America/Chicago', sections: ['calendar_review', 'email_triage'], delivery: ['ai_hub'],
      plan: ['email_triage', 'calendar_review', 'daily_brief'], externalRunId: `auto:${AUTO}:20261013T130000Z`, retryOfRunId: null,
    });
    expect(JSON.stringify(out.data.claim)).not.toMatch(/token|secret|password|credential|service_role/i);
    expect(calls[0]).toEqual({ fn: 'rpc_ai_execution_claim', args: { p_actor_id: ME, p_run_id: RUN, p_provider: 'claude' } });
  });
  it('a loser gets claimed:false and the current status, never the context', async () => {
    const out = await claimExecution(ctx, RUN, 'claude', fakes([], { claimed: false, run_id: RUN, status: 'RUNNING', reason: 'NOT_QUEUED' }).deps);
    expect(out).toEqual({ ok: true, data: { claimed: false, runId: RUN, status: 'RUNNING', reason: 'NOT_QUEUED' } });
  });
  it('database refusals map to safe codes without leaking database text', async () => {
    const mismatch = await claimExecution(ctx, RUN, 'claude', fakes([], () => ({ error: { code: '42501', message: 'AI_EXECUTION_PROVIDER_MISMATCH secret-detail' } })).deps);
    expect(mismatch).toEqual({ ok: false, error: { code: 'PROVIDER_MISMATCH', message: 'This execution belongs to a different provider.' } });
    const unknown = await claimExecution(ctx, RUN, 'claude', fakes([], () => ({ error: { code: 'XX000', message: 'relation "ai_runs" exploded password=hunter2' } })).deps);
    expect(unknown).toEqual({ ok: false, error: { code: 'EXECUTION_FAILED', message: 'The execution request could not be completed.' } });
    expect(JSON.stringify(unknown)).not.toMatch(/hunter2|relation/);
  });
  it('a failure is recorded through the existing lifecycle with a sanitized, bounded summary', async () => {
    const { deps, calls } = fakes([], { run_id: RUN, status: 'FAILED', changed: true });
    const out = await reportExecutionFailure(ctx, RUN, 'CONNECTOR_AUTH_EXPIRED', 'token Bearer abc.def.ghijklmnopqrstuvwxyz0123456789 at https://x.test/y expired', deps);
    expect(out).toEqual({ ok: true, data: { runId: RUN, status: 'FAILED', changed: true } });
    expect(calls[0]!.fn).toBe('rpc_ai_finalize_run');
    expect(calls[0]!.args).toMatchObject({ p_status: 'FAILED', p_error_category: 'CONNECTOR_AUTH_EXPIRED', p_counts: null });
    expect(String(calls[0]!.args.p_error_detail)).not.toMatch(/Bearer|https?:|abc\.def/);
    expect(await reportExecutionFailure(ctx, RUN, 'NOT_A_CATEGORY' as never, 'x', deps)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });
  it('a retry is a NEW request that references the failed run; the failed run is never updated', async () => {
    const { deps, calls } = fakes([], { run_id: '66666666-6666-4666-8666-666666666666', created: true, status: 'QUEUED', external_run_id: `retry:${RUN}:1` });
    const out = await requestRetry(ctx, RUN, deps);
    expect(out.ok && out.data.created).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ fn: 'rpc_ai_execution_request', args: { p_trigger_type: 'retry', p_retry_of_run_id: RUN, p_automation_id: null } });
    expect(EXECUTION_RETRY_LIMIT).toBe(3);
  });
  it('every lifecycle entry point honours the AI Hub kill switch', async () => {
    const off = { ...fakes().deps, aiHubEnabled: () => false };
    for (const r of [await claimExecution(ctx, RUN, 'claude', off), await reportExecutionFailure(ctx, RUN, 'INTERNAL', 'x', off), await requestRetry(ctx, RUN, off), await enqueueDueOccurrences(ctx, off)]) {
      expect(r).toMatchObject({ ok: false, error: { code: 'AI_HUB_DISABLED' } });
    }
  });
});

describe('boundary: no provider code, no MCP surface, service-role-only SQL', () => {
  const read = (p: string) => readFileSync(p, 'utf8');
  it('no provider API is called and the executor lifecycle is not an HTTP route', () => {
    const svc = read('apps/api/src/services/aiExecutionService.ts');
    expect(svc).not.toMatch(/api\.anthropic|openai|generativelanguage|fetch\(|oauth/i);
    const routes = read('apps/api/src/routes/aiAutomations.ts');
    expect(routes).toContain("aiAutomations.post('/:id/run-now', requireCsrfToken");
    expect(routes).not.toMatch(/['"`]\/(:id\/)?(claim|enqueue|report|retry)/); // executor entry points are services, not routes
  });
  it('MCP is unchanged: 13 tools, exactly one write, no execution/claim/schedule tool', async () => {
    const { MCP_TOOLS } = await import('../../apps/api/src/mcp/tools');
    expect(MCP_TOOLS).toHaveLength(13);
    expect(MCP_TOOLS.filter((t) => t.annotations.readOnlyHint !== true).map((t) => t.name)).toEqual(['jobquest_submit_ai_result']);
    expect(MCP_TOOLS.map((t) => t.name).join(' ')).not.toMatch(/automation|schedule|claim|execution|run_now|workflow_config/i);
  });
  it('the migration is additive, forward-only and service-role only', () => {
    const sql = read('supabase/migrations/20261104100000_ai_hub_schedule_execution.sql');
    expect(sql).not.toMatch(/drop table|drop column|truncate/i);
    expect(sql).not.toMatch(/grant execute on function public\.rpc_ai_execution_\w+\([^)]*\) to (anon|authenticated|public)/i);
    expect(sql).toMatch(/revoke all on function public\.rpc_ai_execution_request[^;]*from public, anon, authenticated/);
    expect(sql).toMatch(/revoke all on function public\.rpc_ai_execution_claim[^;]*from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.rpc_ai_execution_claim[^;]*to service_role/);
    expect(sql).toMatch(/on delete set null/);
  });
});
