import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  attributeRunToAutomation, automationRunsFilter, buildSchedulerSetup, computeNextExpectedRun, getDueOccurrences, scheduledRunKey, validateAutomation,
  type AutomationDefinition, type DueCandidate,
} from '../../apps/api/src/lib/aiContract';
import { listAutomations } from '../../apps/api/src/services/aiAutomationService';
import { listAutomationRuns } from '../../apps/api/src/services/aiExecutionService';
import { attributeRun } from '../../apps/api/src/services/aiAutomationInsightsService';
import { evalFilter, fakeReader, type Row } from './helpers/postgrestFake';

// AI-11 multi-instance automations: an automation is identified by its id, never by workflow + provider. Several automations
// may share a workflow and provider (Email Intelligence Morning / Midday / Evening on Claude); each keeps its own schedule,
// occurrence, instructions, history and health. Name uniqueness is the only duplicate rule (database-enforced, tested in the
// integration suite).
const WS = '11111111-1111-4111-8111-111111111111';
const ME = '22222222-2222-4222-8222-222222222222';
const ctx = { workspaceId: WS, userId: ME, accessToken: 'tok' };
const NOW = () => new Date('2026-10-13T20:00:00Z');
const A = '4a000000-0000-4000-8000-00000000000a';
const B = '4b000000-0000-4000-8000-00000000000b';
const C = '4c000000-0000-4000-8000-00000000000c';

const cfg = (id: string, name: string, localTime: string, over: Row = {}): Row => ({
  id, name, workflow: 'email_triage', enabled: true, primary_provider: 'claude', cadence: 'daily', local_time: localTime, timezone: 'America/Chicago', weekdays: [],
  sections: [], delivery: ['ai_hub'], created_at: `2026-10-01T00:0${id.length % 9}:00Z`, updated_at: '2026-10-01T00:00:00Z', workspace_id: WS, user_id: ME, ...over,
});
const run = (over: Row = {}): Row => ({
  workspace_id: WS, user_id: ME, workflow: 'email_triage', provider: 'claude', status: 'SUCCEEDED', trigger_type: 'scheduled', automation_id: null, external_run_id: null,
  created_at: '2026-10-12T13:00:00Z', completed_at: '2026-10-12T13:01:00Z', error_category: null, ...over,
});
const trio = [cfg(A, 'Email Intelligence — Morning', '08:00', { created_at: '2026-10-01T00:00:01Z' }), cfg(B, 'Email Intelligence — Midday', '12:30', { created_at: '2026-10-01T00:00:02Z' }), cfg(C, 'Email Intelligence — Evening', '16:30', { created_at: '2026-10-01T00:00:03Z' })];

describe('multi-instance: identity is the automation id', () => {
  const autos = [{ id: A, provider: 'claude', workflow: 'email_triage' }, { id: B, provider: 'claude', workflow: 'email_triage' }, { id: 'D', provider: 'gemini', workflow: 'job_discovery' }];

  it('a linked run belongs to its automation only; a deleted automation\'s run belongs to nobody', () => {
    expect(attributeRunToAutomation({ automation_id: A, provider: 'claude', workflow: 'email_triage' }, autos)).toBe(A);
    expect(attributeRunToAutomation({ automation_id: B, provider: 'claude', workflow: 'email_triage' }, autos)).toBe(B);
    expect(attributeRunToAutomation({ automation_id: 'gone', provider: 'claude', workflow: 'email_triage' }, autos)).toBeNull();
  });

  it('an unlinked provider-submitted run is attributed only when exactly one automation matches workflow + provider', () => {
    const unlinked = { automation_id: null, provider: 'claude', workflow: 'email_triage' };
    expect(attributeRunToAutomation(unlinked, autos)).toBeNull(); // A and B both match: ambiguous
    expect(attributeRunToAutomation(unlinked, autos.slice(1))).toBe(B); // only B matches
    expect(attributeRunToAutomation({ ...unlinked, provider: 'gemini', workflow: 'job_discovery' }, autos)).toBe('D');
    expect(attributeRunToAutomation({ ...unlinked, provider: 'chatgpt' }, autos)).toBeNull();
    expect(attributeRun(unlinked as never, autos.slice(1) as never)).toBe(B);
  });

  it('an unlinked run in a lifecycle key namespace is an orphan of a deleted automation and never moves to a survivor', () => {
    for (const key of [`auto:${A}:20261012T130000Z`, `manual:${A}:abcdefgh`, `retry:${A}:1`]) {
      expect(attributeRunToAutomation({ automation_id: null, provider: 'claude', workflow: 'email_triage', external_run_id: key }, [autos[1]!])).toBeNull();
    }
    expect(attributeRunToAutomation({ automation_id: null, provider: 'claude', workflow: 'email_triage', external_run_id: 'provider-chosen-id' }, [autos[1]!])).toBe(B);
  });

  it('the database filter and the pure attribution agree on every kind of run', () => {
    const rows: Row[] = [
      { automation_id: A, workflow: 'email_triage', provider: 'claude', external_run_id: `auto:${A}:x` },
      { automation_id: B, workflow: 'email_triage', provider: 'claude', external_run_id: `auto:${B}:x` },
      { automation_id: null, workflow: 'email_triage', provider: 'claude', external_run_id: null },
      { automation_id: null, workflow: 'email_triage', provider: 'claude', external_run_id: 'provider-id' },
      { automation_id: null, workflow: 'email_triage', provider: 'claude', external_run_id: `auto:${A}:orphan` },
      { automation_id: null, workflow: 'email_triage', provider: 'claude', external_run_id: `manual:${A}:orphan` },
      { automation_id: null, workflow: 'email_triage', provider: 'claude', external_run_id: `retry:${A}:orphan` },
      { automation_id: null, workflow: 'email_triage', provider: 'gemini', external_run_id: null },
      { automation_id: null, workflow: 'daily_brief', provider: 'claude', external_run_id: null },
    ];
    for (const set of [autos.slice(0, 2), autos.slice(1, 2), autos]) {
      for (const a of set.filter((x) => x.id !== 'D')) {
        const sole = set.every((o) => o.id === a.id || o.workflow !== a.workflow || o.provider !== a.provider);
        const expr = `or(${automationRunsFilter(a.id, a.workflow, a.provider, sole)})`;
        for (const r of rows) {
          const viaFilter = evalFilter(expr, r);
          const viaPure = attributeRunToAutomation(r as never, set) === a.id;
          expect(viaFilter, `${a.id} sole=${sole} ${JSON.stringify(r)}`).toBe(viaPure);
        }
      }
    }
  });
});

describe('multi-instance: listAutomations / listAutomationRuns keep each card\'s state separate', () => {
  it('three Email Triage + Claude automations: each card shows only its own runs', async () => {
    const { reader } = fakeReader({
      ai_workflow_configs: trio,
      ai_runs: [
        run({ automation_id: A, status: 'FAILED', error_category: 'TIMEOUT', created_at: '2026-10-13T13:00:00Z', completed_at: '2026-10-13T13:01:00Z', external_run_id: `auto:${A}:s1` }),
        run({ automation_id: B, status: 'SUCCEEDED', created_at: '2026-10-13T17:30:00Z', completed_at: '2026-10-13T17:31:00Z', external_run_id: `auto:${B}:s1` }),
        run({ automation_id: null, status: 'FAILED', created_at: '2026-10-13T19:00:00Z', external_run_id: 'provider-run' }), // ambiguous: nobody's
      ],
    });
    const out = await listAutomations(ctx, { reader, aiHubEnabled: () => true, now: NOW });
    if (!out.ok) throw new Error('list failed');
    expect(out.data.map((a) => a.id)).toEqual([A, B, C]);
    const [a, b, c] = out.data;
    expect(a!.state).toMatchObject({ lastStatus: 'FAILED', lastErrorCategory: 'TIMEOUT', lastSuccessAt: null });
    expect(b!.state).toMatchObject({ lastStatus: 'SUCCEEDED', lastFailureAt: null, lastErrorCategory: null });
    expect(c!.state).toMatchObject({ lastRunAt: null, lastStatus: null, lastSuccessAt: null, lastFailureAt: null });
    // Each has its own schedule and next occurrence.
    expect(new Set(out.data.map((x) => x.state.nextExpectedRunAt)).size).toBe(3);
    expect(out.data.map((x) => x.localTime)).toEqual(['08:00', '12:30', '16:30']);
  });

  it('the sole automation of its workflow + provider still owns an unlinked provider-submitted run (existing behavior preserved)', async () => {
    const { reader } = fakeReader({ ai_workflow_configs: [trio[0]!], ai_runs: [run({ status: 'FAILED', error_category: 'INTERNAL', external_run_id: null })] });
    const out = await listAutomations(ctx, { reader, aiHubEnabled: () => true, now: NOW });
    expect(out.ok && out.data[0]!.state.lastStatus).toBe('FAILED');
  });

  it('a different workflow or provider alongside does not count as a sibling', async () => {
    const { reader } = fakeReader({
      ai_workflow_configs: [trio[0]!, cfg('5e', 'Gemini email', '09:00', { primary_provider: 'gemini' }), cfg('5f', 'Digest', '09:00', { workflow: 'daily_brief' })],
      ai_runs: [run({ status: 'FAILED', error_category: 'INTERNAL' })],
    });
    const out = await listAutomations(ctx, { reader, aiHubEnabled: () => true, now: NOW });
    const byId = new Map((out.ok ? out.data : []).map((x) => [x.id, x]));
    expect(byId.get(A)!.state.lastStatus).toBe('FAILED');
    expect(byId.get('5e')!.state.lastStatus).toBeNull();
    expect(byId.get('5f')!.state.lastStatus).toBeNull();
  });

  it('run history is per automation id', async () => {
    const rows = [
      run({ id: 'ra', automation_id: A, scheduled_for: null, started_at: null }), run({ id: 'rb', automation_id: B }), run({ id: 'rx', automation_id: null, external_run_id: 'provider-run' }),
      run({ id: 'orphan', automation_id: null, external_run_id: `auto:${C}:gone` }),
    ];
    const { reader } = fakeReader({ ai_workflow_configs: trio, ai_runs: rows });
    const hist = async (id: string) => {
      const out = await listAutomationRuns(ctx, id, { runReader: reader });
      if (!out.ok) throw new Error('history failed');
      return out.data.map((r) => r.id);
    };
    expect(await hist(A)).toEqual(['ra']);
    expect(await hist(B)).toEqual(['rb']);
    expect(await hist(C)).toEqual([]);
    // Once A and B are gone, C is the sole one: it owns the provider-submitted run, but never the orphans of a deleted automation.
    const solo = fakeReader({ ai_workflow_configs: [trio[2]!], ai_runs: rows });
    const out = await listAutomationRuns(ctx, C, { runReader: solo.reader });
    expect(out.ok && out.data.map((r) => r.id)).toEqual(['rx']);
  });
});

describe('multi-instance: scheduling, instructions and validation do not collide', () => {
  const candidate = (id: string, localTime: string): DueCandidate => ({
    id, workflow: 'email_triage', provider: 'claude', enabled: true, cadence: 'daily', localTime, timezone: 'America/Chicago', weekdays: [], updatedAt: '2026-10-01T00:00:00Z',
  });
  const def = (id: string, name: string, localTime: string): AutomationDefinition & { id: string } => ({
    id, name, workflow: 'email_triage', provider: 'claude', enabled: true, cadence: 'daily', localTime, timezone: 'America/Chicago', weekdays: [], sections: [], delivery: ['ai_hub'],
  });

  it('three siblings due at once yield three occurrences with distinct automation ids and keys', () => {
    // 2026-10-13 22:00 UTC = 17:00 CDT: 08:00, 12:30 and 16:30 local slots have all passed; a wide grace makes all three due.
    const due = getDueOccurrences([candidate(A, '08:00'), candidate(B, '12:30'), candidate(C, '16:30')], new Date('2026-10-13T22:00:00Z'), 12 * 3_600_000);
    expect(due.map((d) => d.automationId).sort()).toEqual([A, B, C]);
    const keys = due.map((d) => scheduledRunKey(d.automationId, d.scheduledFor));
    expect(new Set(keys).size).toBe(3);
    for (const d of due) expect(scheduledRunKey(d.automationId, d.scheduledFor)).toContain(d.automationId);
    // The same instant for two siblings still produces two keys: the automation id is part of the occurrence identity.
    expect(scheduledRunKey(A, '2026-10-13T13:00:00Z')).not.toBe(scheduledRunKey(B, '2026-10-13T13:00:00Z'));
  });

  it('next expected runs are computed per automation', () => {
    const next = [def(A, 'M', '08:00'), def(B, 'D', '12:30'), def(C, 'E', '16:30')].map((d) => computeNextExpectedRun(d, new Date('2026-10-13T20:00:00Z')));
    expect(new Set(next).size).toBe(3);
  });

  it('provider instructions carry each automation\'s own id (scheduled and manual) and never a sibling\'s', () => {
    const [sa, sb] = [buildSchedulerSetup(def(A, 'Email Intelligence — Morning', '08:00')), buildSchedulerSetup(def(B, 'Email Intelligence — Evening', '16:30'))];
    expect(sa!.scheduledInstructions).toContain(A);
    expect(sa!.manualRunInstructions).toContain(A);
    expect(sa!.scheduledInstructions + sa!.manualRunInstructions).not.toContain(B);
    expect(sb!.scheduledInstructions).toContain(B);
    expect(sb!.scheduledInstructions + sb!.manualRunInstructions).not.toContain(A);
    expect(sa!.automationId).not.toBe(sb!.automationId);
    expect(sa!.manualRunKey).not.toBe(sb!.manualRunKey); // freshly minted per generation
    // A stable key makes regenerating the same instructions idempotent for THAT automation.
    const again = buildSchedulerSetup(def(A, 'Email Intelligence — Morning', '08:00'), sa!.manualRunKey);
    expect(again!.manualRunInstructions).toBe(sa!.manualRunInstructions);
  });

  it('validation has no cross-automation rule: the same workflow + provider is valid for every workflow', () => {
    const base = { enabled: true, provider: 'claude', cadence: 'daily', localTime: '08:00', timezone: 'America/Chicago', weekdays: [], delivery: ['ai_hub'] };
    for (const [workflow, provider, sections] of [['email_triage', 'claude', []], ['job_discovery', 'gemini', []], ['recruiter_intel', 'chatgpt', []], ['daily_brief', 'claude', ['followups']], ['calendar_review', 'claude', []], ['other', 'claude', ['goal_summary']]] as const) {
      for (const name of ['One', 'Two']) {
        const v = validateAutomation({ ...base, name, workflow, provider, sections });
        expect(v.ok, `${workflow}/${provider}/${name}`).toBe(true);
      }
    }
  });

  it('the conflict message no longer implies workflow/provider uniqueness, and no code path still enforces it', () => {
    const svc = readFileSync('apps/api/src/services/aiAutomationService.ts', 'utf8');
    expect(svc).toContain("'An automation with this name already exists.'");
    expect(svc).not.toMatch(/workflow and provider/);
    const migration = readFileSync('supabase/migrations/20261106100000_ai_hub_multi_instance_automations.sql', 'utf8');
    expect(migration).toMatch(/drop index if exists public\.uq_ai_workflow_configs_owner_workflow_provider/);
    expect(migration).not.toMatch(/drop (table|index public\.uq_ai_workflow_configs_owner_name)|delete from|update public|truncate/i); // data and the name rule are untouched
  });
});
