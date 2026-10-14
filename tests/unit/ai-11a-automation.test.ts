import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  AUTOMATION_LIMIT, computeNextExpectedRun, deriveAutomationRunState, runNowReadiness, validateAutomation,
  type AutomationDefinition,
} from '../../apps/api/src/lib/aiContract';
import { deleteAutomation, listAutomations, saveAutomation, type AutomationContext } from '../../apps/api/src/services/aiAutomationService';

// AI-11A: provider-neutral automation foundation. Pure contract (validation, next-run incl. timezone/DST), derived run
// state, service scoping with a faithful fake store, and the route/MCP boundary. The database half (RLS, RPCs,
// constraints, audit) is tests/integration/ai-11a-automation.test.ts.

const def = (over: Record<string, unknown> = {}) => ({
  name: 'Weekday Morning Digest', workflow: 'daily_brief', enabled: true, provider: 'claude', cadence: 'weekdays', localTime: '08:00',
  timezone: 'America/Chicago', weekdays: [], sections: ['email_triage', 'job_discovery', 'recruiter_intel', 'calendar_review', 'followups'],
  delivery: ['ai_hub', 'email_summary'], ...over,
});
const ok = (over: Record<string, unknown> = {}) => {
  const r = validateAutomation(def(over));
  if (!r.ok) throw new Error(`${r.field}: ${r.message}`);
  return r.value;
};
const bad = (over: Record<string, unknown>) => {
  const r = validateAutomation(def(over));
  return r.ok ? null : r;
};

describe('validation', () => {
  it('accepts the canonical examples', () => {
    expect(ok()).toMatchObject({ provider: 'claude', cadence: 'weekdays', localTime: '08:00', timezone: 'America/Chicago', delivery: ['ai_hub', 'email_summary'] });
    expect(ok({ name: 'Weekly Job Search Review', workflow: 'other', cadence: 'weekly', weekdays: [7], localTime: '19:00', sections: [], delivery: ['ai_hub'] }))
      .toMatchObject({ cadence: 'weekly', weekdays: [7], workflow: 'other' });
  });

  it('provider is data: every real provider and manual are accepted, anything else (incl. system) is not', () => {
    for (const p of ['claude', 'chatgpt', 'gemini', 'manual']) expect(ok({ provider: p }).provider).toBe(p);
    for (const p of ['system', 'grok', '', null, 1]) expect(bad({ provider: p })?.field, String(p)).toBe('provider');
  });

  it('cadence validation, including the day rules per cadence', () => {
    for (const c of ['daily', 'weekdays']) expect(ok({ cadence: c }).weekdays).toEqual([]);
    expect(bad({ cadence: 'hourly' })?.field).toBe('cadence');
    expect(bad({ cadence: 'daily', weekdays: [1] })?.field).toBe('weekdays');
    expect(bad({ cadence: 'weekdays', weekdays: [1, 2] })?.field).toBe('weekdays');
    expect(bad({ cadence: 'weekly', weekdays: [] })?.field).toBe('weekdays');
    expect(bad({ cadence: 'weekly', weekdays: [1, 2] })?.field).toBe('weekdays');
    expect(ok({ cadence: 'weekly', weekdays: [3] }).weekdays).toEqual([3]);
    expect(bad({ cadence: 'selected_days', weekdays: [] })?.field).toBe('weekdays');
    expect(bad({ cadence: 'manual_only', weekdays: [1] })?.field).toBe('weekdays');
  });

  it('selected days are validated, de-duplicated and sorted', () => {
    expect(ok({ cadence: 'selected_days', weekdays: [5, 1, 5, 3] }).weekdays).toEqual([1, 3, 5]);
    for (const w of [[0], [8], [1.5], ['1'], [null], [-1], 'mon', new Array(8).fill(1)]) expect(bad({ cadence: 'selected_days', weekdays: w })?.field, JSON.stringify(w)).toBe('weekdays');
  });

  it('timezone must be a real IANA Area/Location name (or UTC); abbreviations and junk are rejected', () => {
    for (const z of ['America/Chicago', 'Europe/London', 'Asia/Kolkata', 'America/Argentina/Buenos_Aires', 'UTC']) expect(ok({ timezone: z }).timezone).toBe(z);
    for (const z of ['Mars/Phobos', 'EST', 'CST6CDT', 'America/', '/Chicago', 'posix/UTC', '../etc/passwd', 'a'.repeat(80), 5]) expect(bad({ timezone: z })?.field, String(z)).toBe('timezone');
    expect(bad({ timezone: null })?.field).toBe('timezone'); // scheduled cadence needs a zone
  });

  it('local time is HH:MM 24-hour and required for scheduled cadences only', () => {
    for (const t of ['00:00', '08:00', '19:30', '23:59']) expect(ok({ localTime: t }).localTime).toBe(t);
    for (const t of ['24:00', '8:00', '08:60', '08:00:00', 'noon', '', 800]) expect(bad({ localTime: t })?.field, String(t)).toBe('localTime');
    expect(bad({ localTime: null })?.field).toBe('localTime');
    expect(ok({ cadence: 'manual_only', localTime: null, timezone: null, sections: [] })).toMatchObject({ cadence: 'manual_only', localTime: null, timezone: null });
  });

  it('sections: bounded vocabulary, de-duplicated, composite workflows only', () => {
    expect(ok({ sections: ['followups', 'email_triage', 'followups'] }).sections).toEqual(['email_triage', 'followups']);
    expect(ok({ sections: ['goal_summary'] }).sections).toEqual(['goal_summary']);
    expect(bad({ sections: ['hacking'] })?.field).toBe('sections');
    expect(bad({ sections: 'email_triage' })?.field).toBe('sections');
    for (const wf of ['email_triage', 'job_discovery', 'recruiter_intel', 'calendar_review']) expect(bad({ workflow: wf, sections: ['followups'] })?.field, wf).toBe('sections');
    expect(ok({ workflow: 'email_triage', sections: [] }).sections).toEqual([]);
  });

  it('delivery: ai_hub is always present; email_summary is a stored preference; nothing else', () => {
    expect(ok({ delivery: ['ai_hub'] }).delivery).toEqual(['ai_hub']);
    expect(ok({ delivery: ['email_summary', 'ai_hub', 'ai_hub'] }).delivery).toEqual(['ai_hub', 'email_summary']);
    expect(bad({ delivery: ['email_summary'] })?.field).toBe('delivery');
    expect(bad({ delivery: [] })?.field).toBe('delivery');
    expect(bad({ delivery: ['ai_hub', 'push'] })?.field).toBe('delivery');
    expect(bad({ delivery: ['ai_hub', 'sms'] })?.field).toBe('delivery');
  });

  it('name, enabled, workflow and non-object input fail closed without throwing', () => {
    expect(ok({ name: '  Trim me  ' }).name).toBe('Trim me');
    expect(bad({ name: '   ' })?.field).toBe('name');
    expect(bad({ name: 'x'.repeat(81) })?.field).toBe('name');
    expect(bad({ enabled: 'yes' })?.field).toBe('enabled');
    expect(bad({ enabled: undefined })?.field).toBe('enabled');
    expect(bad({ workflow: 'weekly_review' })?.field).toBe('workflow');
    for (const junk of [null, undefined, 'x', 1, [], true]) expect(validateAutomation(junk)).toMatchObject({ ok: false });
  });

  it('output is a whitelist: unknown or hostile keys never reach the definition', () => {
    const v = validateAutomation({ ...def(), user_id: 'u', workspace_id: 'w', id: 'i', settings: { adapter: 'x' }, role: 'MANAGER' });
    expect(v.ok && Object.keys(v.value).sort()).toEqual(['cadence', 'delivery', 'enabled', 'localTime', 'name', 'provider', 'sections', 'timezone', 'weekdays', 'workflow']);
  });
});

// ---- next expected run ------------------------------------------------------------------------------------------
const next = (over: Partial<AutomationDefinition>, now: string) => computeNextExpectedRun({ ...ok(), ...over }, new Date(now));
// 2026-10-13 is a Tuesday. America/Chicago is UTC-5 (CDT) until Sun 2026-11-01 02:00, UTC-6 (CST) after;
// DST started Sun 2026-03-08 02:00 CST -> 03:00 CDT.

describe('next expected run', () => {
  it('daily: today when still ahead, otherwise tomorrow; strictly after now', () => {
    expect(next({ cadence: 'daily', localTime: '09:00' }, '2026-10-13T12:00:00Z')).toBe('2026-10-13T14:00:00.000Z'); // 07:00 CDT now
    expect(next({ cadence: 'daily', localTime: '06:00' }, '2026-10-13T12:00:00Z')).toBe('2026-10-14T11:00:00.000Z');
    expect(next({ cadence: 'daily', localTime: '08:00' }, '2026-10-13T13:00:00Z')).toBe('2026-10-14T13:00:00.000Z'); // exactly due -> next
    expect(next({ cadence: 'daily', localTime: '08:00' }, '2026-10-13T12:59:59.999Z')).toBe('2026-10-13T13:00:00.000Z');
  });

  it('weekdays skips the weekend', () => {
    expect(next({ cadence: 'weekdays' }, '2026-10-13T12:00:00Z')).toBe('2026-10-13T13:00:00.000Z'); // Tue
    expect(next({ cadence: 'weekdays' }, '2026-10-16T14:00:00Z')).toBe('2026-10-19T13:00:00.000Z'); // Fri 09:00 CDT -> Mon
    expect(next({ cadence: 'weekdays' }, '2026-10-18T03:00:00Z')).toBe('2026-10-19T13:00:00.000Z'); // Sat 22:00 CDT -> Mon
    expect(next({ cadence: 'weekdays' }, '2026-10-17T20:00:00Z')).toBe('2026-10-19T13:00:00.000Z'); // Sat
  });

  it('selected days and weekly', () => {
    const mwf: Partial<AutomationDefinition> = { cadence: 'selected_days', weekdays: [1, 3, 5], localTime: '09:30' };
    expect(next(mwf, '2026-10-13T12:00:00Z')).toBe('2026-10-14T14:30:00.000Z'); // Tue -> Wed
    expect(next(mwf, '2026-10-16T20:00:00Z')).toBe('2026-10-19T14:30:00.000Z'); // Fri after 09:30 -> Mon
    expect(next({ cadence: 'selected_days', weekdays: [6, 7], localTime: '10:00' }, '2026-10-13T12:00:00Z')).toBe('2026-10-17T15:00:00.000Z'); // weekend scan: Sat
    const sunday: Partial<AutomationDefinition> = { cadence: 'weekly', weekdays: [7], localTime: '19:00' };
    expect(next(sunday, '2026-10-13T12:00:00Z')).toBe('2026-10-19T00:00:00.000Z'); // Sun Oct 18 19:00 CDT
    expect(next(sunday, '2026-10-19T00:00:00Z')).toBe('2026-10-26T00:00:00.000Z'); // exactly due -> a week later
    expect(next({ cadence: 'weekly', weekdays: [2], localTime: '06:00' }, '2026-10-13T12:00:00Z')).toBe('2026-10-20T11:00:00.000Z'); // today's slot passed -> next Tuesday
  });

  it('is null when disabled, manual-only or invalid; never throws', () => {
    expect(next({ enabled: false }, '2026-10-13T12:00:00Z')).toBeNull();
    expect(next({ cadence: 'manual_only', localTime: null, timezone: null }, '2026-10-13T12:00:00Z')).toBeNull();
    expect(next({ timezone: 'Mars/Phobos' }, '2026-10-13T12:00:00Z')).toBeNull();
    expect(next({ localTime: '99:99' }, '2026-10-13T12:00:00Z')).toBeNull();
    expect(next({ localTime: null }, '2026-10-13T12:00:00Z')).toBeNull();
    expect(next({ cadence: 'weekly', weekdays: [] }, '2026-10-13T12:00:00Z')).toBeNull();
    expect(computeNextExpectedRun(ok(), new Date(Number.NaN))).toBeNull();
  });

  it('timezone boundaries: the local date, not the UTC date or the server zone, decides', () => {
    // 03:00Z on Oct 14 is still Tue 22:00 in Chicago: a weekday digest at 08:00 is Wed 08:00 CDT (13:00Z), not 08:00Z.
    expect(next({ cadence: 'weekdays' }, '2026-10-14T03:00:00Z')).toBe('2026-10-14T13:00:00.000Z');
    // Tokyo is a day ahead: 20:00Z Oct 13 is already Wed 05:00 JST, so 08:00 JST today is 23:00Z the same UTC day.
    expect(next({ cadence: 'daily', timezone: 'Asia/Tokyo' }, '2026-10-13T20:00:00Z')).toBe('2026-10-13T23:00:00.000Z');
    // Weekly Monday 09:00 JST: the UTC date is still Sunday, yet the local day is Monday.
    expect(next({ cadence: 'weekly', weekdays: [1], localTime: '09:00', timezone: 'Asia/Tokyo' }, '2026-10-18T20:00:00Z')).toBe('2026-10-19T00:00:00.000Z');
    // Half-hour offset.
    expect(next({ cadence: 'daily', timezone: 'Asia/Kolkata' }, '2026-10-13T00:00:00Z')).toBe('2026-10-13T02:30:00.000Z');
    // UTC itself.
    expect(next({ cadence: 'daily', timezone: 'UTC', localTime: '08:00' }, '2026-10-13T07:00:00Z')).toBe('2026-10-13T08:00:00.000Z');
    // The same wall-clock schedule in two zones yields different instants for the same "now".
    expect(next({ cadence: 'daily', timezone: 'America/Chicago' }, '2026-10-13T00:00:00Z')).not.toBe(next({ cadence: 'daily', timezone: 'America/New_York' }, '2026-10-13T00:00:00Z'));
  });

  it('DST (America/Chicago): wall-clock times hold across the changes', () => {
    // Spring forward 2026-03-08: 08:00 is 14:00Z before (CST) and 13:00Z after (CDT).
    expect(next({ cadence: 'daily' }, '2026-03-07T15:00:00Z')).toBe('2026-03-08T13:00:00.000Z');
    expect(next({ cadence: 'daily' }, '2026-03-06T15:00:00Z')).toBe('2026-03-07T14:00:00.000Z');
    // A time inside the skipped hour does not exist: it runs at the first valid instant after the gap (03:30 CDT).
    expect(next({ cadence: 'daily', localTime: '02:30' }, '2026-03-08T06:00:00Z')).toBe('2026-03-08T08:30:00.000Z');
    // ...and the next day it is a normal 02:30 CDT again.
    expect(next({ cadence: 'daily', localTime: '02:30' }, '2026-03-08T09:00:00Z')).toBe('2026-03-09T07:30:00.000Z');
    // Fall back 2026-11-01: 08:00 CDT yesterday (13:00Z), 08:00 CST today (14:00Z).
    expect(next({ cadence: 'daily' }, '2026-10-31T14:00:00Z')).toBe('2026-11-01T14:00:00.000Z');
    // An ambiguous time (01:30 happens twice) resolves to its FIRST occurrence (CDT) and is not run twice.
    expect(next({ cadence: 'daily', localTime: '01:30' }, '2026-11-01T04:00:00Z')).toBe('2026-11-01T06:30:00.000Z');
    expect(next({ cadence: 'daily', localTime: '01:30' }, '2026-11-01T06:45:00Z')).toBe('2026-11-02T07:30:00.000Z');
    // Weekly Sunday 19:00 across the end of DST: still 19:00 local (01:00Z the next day, CST).
    expect(next({ cadence: 'weekly', weekdays: [7], localTime: '19:00' }, '2026-10-27T12:00:00Z')).toBe('2026-11-02T01:00:00.000Z');
    // Weekdays across spring forward on a Monday after a Sunday change.
    expect(next({ cadence: 'weekdays' }, '2026-03-07T20:00:00Z')).toBe('2026-03-09T13:00:00.000Z');
  });

  it('southern-hemisphere DST also follows the platform tz database', () => {
    // Sydney springs forward 2026-10-04 (AEST +10 -> AEDT +11): 08:00 on Oct 5 is 21:00Z Oct 4.
    expect(next({ cadence: 'daily', timezone: 'Australia/Sydney' }, '2026-10-04T10:00:00Z')).toBe('2026-10-04T21:00:00.000Z');
  });
});

// ---- derived state & Run Now contract ---------------------------------------------------------------------------
const runRow = (status: string, at: string, error: string | null = null, completed: string | null = at) => ({ status, created_at: at, completed_at: completed, error_category: error });

describe('derived run state', () => {
  it('has no history of its own: it is a pure function of the latest and latest-success runs', () => {
    expect(deriveAutomationRunState(null, null)).toEqual({ lastRunAt: null, lastStatus: null, lastTrigger: null, lastSuccessAt: null, lastFailureAt: null, lastErrorCategory: null });
    const good = runRow('SUCCEEDED', '2026-10-12T13:00:00Z');
    expect(deriveAutomationRunState(good, good)).toEqual({ lastRunAt: '2026-10-12T13:00:00Z', lastStatus: 'SUCCEEDED', lastTrigger: null, lastSuccessAt: '2026-10-12T13:00:00Z', lastFailureAt: null, lastErrorCategory: null });
    const failed = runRow('FAILED', '2026-10-13T13:00:00Z', 'TIMEOUT');
    expect(deriveAutomationRunState(failed, good)).toEqual({ lastRunAt: '2026-10-13T13:00:00Z', lastStatus: 'FAILED', lastTrigger: null, lastSuccessAt: '2026-10-12T13:00:00Z', lastFailureAt: null, lastErrorCategory: 'TIMEOUT' });
    expect(deriveAutomationRunState(runRow('PARTIAL', '2026-10-13T13:00:00Z', 'PARTIAL_READ'), good).lastErrorCategory).toBe('PARTIAL_READ');
  });
  it('a running run is not an error and falls back to created_at before completion', () => {
    const running = runRow('RUNNING', '2026-10-13T13:00:00Z', null, null);
    expect(deriveAutomationRunState(running, null)).toEqual({ lastRunAt: '2026-10-13T13:00:00Z', lastStatus: 'RUNNING', lastTrigger: null, lastSuccessAt: null, lastFailureAt: null, lastErrorCategory: null });
  });
});

describe('Run Now contract (execution deferred)', () => {
  it('is never ready in AI-11A: there is no executor, so nothing may fabricate a run', () => {
    expect(runNowReadiness({ enabled: true }, { aiHubEnabled: true })).toEqual({ ready: false, reason: 'NO_EXECUTOR' });
    expect(runNowReadiness({ enabled: false }, { aiHubEnabled: true })).toEqual({ ready: false, reason: 'AUTOMATION_DISABLED' });
    expect(runNowReadiness({ enabled: true }, { aiHubEnabled: false })).toEqual({ ready: false, reason: 'AI_HUB_DISABLED' });
    expect(runNowReadiness({ enabled: true }, { aiHubEnabled: true, executorAvailable: true })).toEqual({ ready: true, reason: null });
  });
  it('no route or service creates a run: the foundation adds no ai_runs writer', () => {
    const src = ['apps/api/src/services/aiAutomationService.ts', 'apps/api/src/routes/aiAutomations.ts'].map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(src).not.toMatch(/rpc_ai_ingest_run|rpc_ai_finalize_run|\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
  });
});

// ---- service scoping with a faithful fake store ----------------------------------------------------------------
type Row = Record<string, unknown>;
function fakeReader(tables: Record<string, Row[]>, failTable?: string) {
  const calls: Array<{ table: string; eq: Array<[string, unknown]> }> = [];
  const from = (table: string) => {
    const eq: Array<[string, unknown]> = [];
    let order: { col: string; asc: boolean } | null = null;
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (c: string, v: unknown) => { eq.push([c, v]); return chain; },
      order: (col: string, o: { ascending: boolean }) => { order = { col, asc: o.ascending }; return chain; },
      limit: async (n: number) => {
        calls.push({ table, eq: [...eq] });
        if (table === failTable) return { data: null, error: { message: 'boom' } };
        let rows = (tables[table] ?? []).filter((r) => eq.every(([c, v]) => r[c] === v));
        if (order) { const o = order; rows = [...rows].sort((a, b) => String(a[o.col]).localeCompare(String(b[o.col])) * (o.asc ? 1 : -1)); }
        return { data: rows.slice(0, n), error: null };
      },
    };
    return chain;
  };
  return { reader: { from }, calls };
}

const WS = '11111111-1111-4111-8111-111111111111';
const ME = '22222222-2222-4222-8222-222222222222';
const PEER = '33333333-3333-4333-8333-333333333333';
const ctx: AutomationContext = { workspaceId: WS, userId: ME, accessToken: 'tok' };
const cfg = (over: Row = {}): Row => ({
  id: '44444444-4444-4444-8444-444444444444', name: 'Weekday Morning Digest', workflow: 'daily_brief', enabled: true, primary_provider: 'claude', cadence: 'weekdays',
  local_time: '08:00', timezone: 'America/Chicago', weekdays: [], sections: ['followups'], delivery: ['ai_hub'], created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
  workspace_id: WS, user_id: ME, ...over,
});
const run = (over: Row = {}): Row => ({ workspace_id: WS, user_id: ME, workflow: 'daily_brief', provider: 'claude', status: 'SUCCEEDED', created_at: '2026-10-12T13:00:00Z', completed_at: '2026-10-12T13:01:00Z', error_category: null, ...over });
const NOW = () => new Date('2026-10-13T12:00:00Z');

describe('listAutomations (service)', () => {
  it('returns only the caller\'s automations in the workspace, with derived state and the Run Now contract', async () => {
    const { reader, calls } = fakeReader({
      ai_workflow_configs: [cfg(), cfg({ id: 'x1', user_id: PEER, name: 'Peer' }), cfg({ id: 'x2', workspace_id: 'other-ws', name: 'Elsewhere' })],
      ai_runs: [
        run(), run({ status: 'FAILED', created_at: '2026-10-13T13:00:00Z', completed_at: '2026-10-13T13:01:00Z', error_category: 'TIMEOUT' }),
        run({ provider: 'gemini', status: 'FAILED', created_at: '2026-10-14T00:00:00Z' }), run({ workflow: 'email_triage', status: 'FAILED', created_at: '2026-10-14T00:00:00Z' }),
        run({ user_id: PEER, status: 'FAILED', created_at: '2026-10-14T00:00:00Z' }), run({ workspace_id: 'other-ws', status: 'FAILED', created_at: '2026-10-14T00:00:00Z' }),
      ],
    });
    const out = await listAutomations(ctx, { reader, aiHubEnabled: () => true, now: NOW });
    if (!out.ok) throw new Error('list failed');
    expect(out.data).toHaveLength(1);
    const a = out.data[0]!;
    expect(a).toMatchObject({ name: 'Weekday Morning Digest', provider: 'claude', cadence: 'weekdays', workflow: 'daily_brief' });
    expect(a.state).toEqual({
      lastRunAt: '2026-10-13T13:01:00Z', lastStatus: 'FAILED', lastTrigger: null, lastSuccessAt: '2026-10-12T13:01:00Z', lastFailureAt: '2026-10-13T13:01:00Z', lastErrorCategory: 'TIMEOUT', nextExpectedRunAt: '2026-10-13T13:00:00.000Z',
    });
    expect(a.runNow).toEqual({ ready: false, reason: 'NO_EXECUTOR' });
    // Every read is scoped by workspace AND owner (belt and braces on top of RLS); run reads also by workflow + provider.
    for (const c of calls) {
      expect(c.eq).toContainEqual(['workspace_id', WS]);
      expect(c.eq).toContainEqual(['user_id', ME]);
    }
    for (const c of calls.filter((x) => x.table === 'ai_runs')) {
      expect(c.eq).toContainEqual(['workflow', 'daily_brief']);
      expect(c.eq).toContainEqual(['provider', 'claude']);
    }
  });

  it('a disabled automation has no next run and reports why Run Now is unavailable', async () => {
    const { reader } = fakeReader({ ai_workflow_configs: [cfg({ enabled: false })], ai_runs: [] });
    const out = await listAutomations(ctx, { reader, aiHubEnabled: () => true, now: NOW });
    expect(out.ok && out.data[0]!.state).toMatchObject({ nextExpectedRunAt: null, lastRunAt: null, lastStatus: null });
    expect(out.ok && out.data[0]!.runNow.reason).toBe('AUTOMATION_DISABLED');
  });

  it('the AI Hub kill switch is reflected in Run Now, and reads never expose provider error text', async () => {
    const { reader } = fakeReader({ ai_workflow_configs: [cfg()], ai_runs: [run({ status: 'FAILED', error_category: 'INTERNAL', error_detail: 'RAW-SECRET-DETAIL' })] });
    const out = await listAutomations(ctx, { reader, aiHubEnabled: () => false, now: NOW });
    expect(out.ok && out.data[0]!.runNow.reason).toBe('AI_HUB_DISABLED');
    expect(JSON.stringify(out)).not.toContain('RAW-SECRET-DETAIL');
    const runColumns = /const RUN_COLUMNS = '([^']+)'/.exec(readFileSync('apps/api/src/services/aiAutomationService.ts', 'utf8'))?.[1];
    expect(runColumns).toBe('status, created_at, completed_at, error_category, trigger_type'); // never error_detail // error_detail is never selected
  });

  it('a read failure is opaque (no database text) and a bad workspace is rejected without reading', async () => {
    const f = fakeReader({}, 'ai_workflow_configs');
    expect(await listAutomations(ctx, { reader: f.reader, now: NOW })).toEqual({ ok: false, error: { code: 'READ_FAILED', message: 'Could not load automations.' } });
    const g = fakeReader({ ai_workflow_configs: [cfg()] }, 'ai_runs');
    expect(await listAutomations(ctx, { reader: g.reader, now: NOW })).toMatchObject({ ok: false, error: { code: 'READ_FAILED' } });
    const h = fakeReader({});
    expect(await listAutomations({ ...ctx, workspaceId: 'nope' }, { reader: h.reader })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(h.calls).toHaveLength(0);
  });
});

describe('saveAutomation / deleteAutomation (service)', () => {
  const rpc = vi.fn();
  beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: { id: 'new-id', created: true }, error: null }); });
  const deps = (enabled = true) => ({ writer: { rpc }, aiHubEnabled: () => enabled });

  it('validates BEFORE the RPC and sends the session user, never anything from the body', async () => {
    const out = await saveAutomation(ctx, null, { ...def(), user_id: PEER, workspace_id: 'evil' }, deps());
    expect(out).toEqual({ ok: true, data: { id: 'new-id', created: true } });
    const [fn, args] = rpc.mock.calls[0]!;
    expect(fn).toBe('rpc_ai_automation_save');
    expect(args).toMatchObject({ p_actor_id: ME, p_workspace_id: WS, p_id: null, p_provider: 'claude', p_cadence: 'weekdays', p_local_time: '08:00', p_timezone: 'America/Chicago' });
    expect(JSON.stringify(args)).not.toContain(PEER);

    const invalid = await saveAutomation(ctx, null, def({ timezone: 'Mars/Phobos' }), deps());
    expect(invalid).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT', field: 'timezone' } });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('honours the AI Hub kill switch for save, but never for delete', async () => {
    expect(await saveAutomation(ctx, null, def(), deps(false))).toMatchObject({ ok: false, error: { code: 'AI_HUB_DISABLED' } });
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ data: { id: 'x', deleted: true }, error: null });
    expect(await deleteAutomation(ctx, '55555555-5555-4555-8555-555555555555', deps(false))).toEqual({ ok: true, data: { id: '55555555-5555-4555-8555-555555555555' } });
  });

  it('maps database errors to safe codes and messages', async () => {
    const cases: Array<[string, string]> = [
      ['42501', 'WORKSPACE_ACCESS_DENIED'], ['P0002', 'AUTOMATION_NOT_FOUND'], ['23505', 'AUTOMATION_CONFLICT'], ['53400', 'AUTOMATION_LIMIT'], ['22023', 'INVALID_INPUT'], ['XX000', 'SAVE_FAILED'],
    ];
    for (const [code, expected] of cases) {
      rpc.mockResolvedValueOnce({ data: null, error: { code, message: 'pg internal detail' } });
      const out = await saveAutomation(ctx, null, def(), deps());
      expect(out).toMatchObject({ ok: false, error: { code: expected } });
      expect(JSON.stringify(out)).not.toContain('pg internal detail');
    }
    expect(AUTOMATION_LIMIT).toBe(10);
  });

  it('rejects malformed ids before any call', async () => {
    expect(await saveAutomation(ctx, 'not-a-uuid', def(), deps())).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(await deleteAutomation(ctx, 'not-a-uuid', deps())).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(rpc).not.toHaveBeenCalled();
  });
});

// ---- boundary: nothing new for providers ------------------------------------------------------------------------
describe('provider boundary (AI-10 security model intact)', () => {
  it('MCP surface carries no automation tool: 13 tools (AI-11D and AI-11E each add one read-only profile read), 12 reads + the single AI-ingest write', async () => {
    const { MCP_TOOLS } = await import('../../apps/api/src/mcp/tools');
    expect(MCP_TOOLS).toHaveLength(13);
    expect(MCP_TOOLS.map((t) => t.name).join(' ')).not.toMatch(/automation|schedule|workflow_config/i);
  });
  it('MCP and OAuth code never reference automation definitions or the new RPCs', () => {
    for (const dir of ['apps/api/src/mcp']) {
      for (const f of readdirSync(dir)) expect(readFileSync(`${dir}/${f}`, 'utf8'), f).not.toMatch(/ai_workflow_configs|rpc_ai_automation|aiAutomation/);
    }
  });
  it('the new RPCs are service_role only and the ingest RPCs are untouched', () => {
    const sql = readFileSync('supabase/migrations/20261101100000_ai_hub_automation_foundation.sql', 'utf8');
    expect(sql).toMatch(/revoke all on function public\.rpc_ai_automation_save[^;]+from public, anon, authenticated;/);
    expect(sql).toMatch(/grant execute on function public\.rpc_ai_automation_save[^;]+to service_role;/);
    expect(sql).toMatch(/grant execute on function public\.rpc_ai_automation_delete[^;]+to service_role;/);
    expect(sql).not.toMatch(/to authenticated|to anon|rpc_ai_ingest|rpc_ai_finalize|create table|drop table|alter table public\.ai_runs/i);
    // Additive on the only table it touches; no data is dropped.
    expect(sql).not.toMatch(/drop column|truncate/i);
  });
});
