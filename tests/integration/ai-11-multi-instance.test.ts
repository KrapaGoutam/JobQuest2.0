import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, loadEnv, serviceDb } from './harness';
import { buildSchedulerSetup } from '../../apps/api/src/lib/aiContract';

// AI-11 multi-instance automations against a REAL database + the real API: several automations of the SAME workflow and
// provider (e.g. Email Intelligence Morning / Midday / Evening on Claude) coexist, and each keeps its own occurrence,
// claim, retry, idempotency, history and health. Name uniqueness (per owner, case-insensitive) is the only duplicate rule.
// Local stack only (writes test rows).
const ready = loadEnv();
const local = /^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.SUPABASE_URL ?? '');

describe.skipIf(!ready || !local)('AI-11 — multi-instance automations (real DB + real API)', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();
  const alice = new Actor(); // workspace owner
  const carol = new Actor(); // owns the Email Intelligence family
  const eve = new Actor(); // same workspace, other owner; owns the cross-workflow family
  let ws: string;
  const prevHub = process.env.AI_HUB_ENABLED;

  const post = (a: Actor, path: string, body: unknown) => a.call(`/ai/automations${path}`, body);
  const body = (over: Record<string, unknown>) => ({
    workspace_id: ws, name: `Auto ${randomBytes(3).toString('hex')}`, workflow: 'email_triage', enabled: true, provider: 'claude', cadence: 'daily',
    localTime: '08:00', timezone: 'America/Chicago', weekdays: [], sections: [], delivery: ['ai_hub'], ...over,
  });
  const mk = async (a: Actor, over: Record<string, unknown>) => {
    const r = await post(a, '', body(over));
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    return r.json.id as string;
  };
  const list = async (a: Actor) => (await a.call(`/ai/automations?workspace_id=${ws}`)).json.automations as Array<Record<string, any>>;
  const view = async (a: Actor, id: string) => (await list(a)).find((x) => x.id === id)!;
  let nextSlot = 0;
  const slot = () => new Date(Math.floor(Date.now() / 1000) * 1000 + 5_000 + (++nextSlot) * 1_000).toISOString();
  const request = (a: Actor, automationId: string | null, over: Record<string, unknown> = {}) => admin.rpc('rpc_ai_execution_request', {
    p_actor_id: a.userId, p_workspace_id: ws, p_automation_id: automationId, p_trigger_type: 'scheduled', p_scheduled_for: slot(),
    p_client_key: null, p_retry_of_run_id: null, ...over,
  });
  const claim = (a: Actor, runId: string) => admin.rpc('rpc_ai_execution_claim', { p_actor_id: a.userId, p_run_id: runId, p_provider: 'claude' });
  const finalize = (a: Actor, runId: string, status: string, extra: Record<string, unknown> = {}) => admin.rpc('rpc_ai_finalize_run', { p_actor_id: a.userId, p_run_id: runId, p_status: status, ...extra });
  const runRow = async (id: string) => (await admin.from('ai_runs').select('*').eq('id', id).single()).data as Record<string, any>;

  let morning: string;
  let midday: string;
  let evening: string;

  beforeAll(async () => {
    process.env.AI_HUB_ENABLED = 'true';
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache(); resetSigningMaterial(); resetAdminClient();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    for (const [a, name] of [[alice, 'alice'], [carol, 'carol'], [eve, 'eve']] as const) {
      expect((await a.call('/auth/register', { username: `ai11mi_${name}_${run}`, password: `Valid-AI11MI-${name}-${run}!` })).status).toBe(201);
    }
    ws = (await admin.from('profiles').select('last_active_workspace_id').eq('user_id', alice.userId!).single()).data!.last_active_workspace_id as string;
    expect((await admin.from('workspace_members').insert([
      { workspace_id: ws, user_id: carol.userId!, role: 'USER', status: 'ACTIVE' },
      { workspace_id: ws, user_id: eve.userId!, role: 'USER', status: 'ACTIVE' },
    ])).error).toBeNull();
  });
  afterAll(() => { vi.restoreAllMocks(); if (prevHub === undefined) delete process.env.AI_HUB_ENABLED; else process.env.AI_HUB_ENABLED = prevHub; });

  it('MI-01 · three Email Triage + Claude automations coexist with their own schedule; a duplicate NAME is still refused', async () => {
    morning = await mk(carol, { name: `Email Intelligence — Morning ${run}`, localTime: '08:00' });
    midday = await mk(carol, { name: `Email Intelligence — Midday ${run}`, localTime: '12:30' });
    evening = await mk(carol, { name: `Email Intelligence — Evening ${run}`, localTime: '16:30' });
    expect(new Set([morning, midday, evening]).size).toBe(3);
    const rows = await list(carol);
    const mine = rows.filter((r) => [morning, midday, evening].includes(r.id));
    expect(mine.map((r) => [r.workflow, r.provider])).toEqual([['email_triage', 'claude'], ['email_triage', 'claude'], ['email_triage', 'claude']]);
    expect(mine.map((r) => r.localTime).sort()).toEqual(['08:00', '12:30', '16:30']);
    // Each has its own next occurrence.
    expect(new Set(mine.map((r) => r.state.nextExpectedRunAt)).size).toBe(3);
    // The only duplicate rule: the name, per owner, case-insensitive.
    const dup = await post(carol, '', body({ name: `email intelligence — morning ${run}`, localTime: '09:00' }));
    expect(dup.status).toBe(409);
    expect(dup.json.error.message).toBe('An automation with this name already exists.');
    // Renaming onto a sibling's name is refused too; keeping its own name while changing the schedule is fine (MI-05).
    const clash = await post(carol, `/${evening}`, body({ name: `Email Intelligence — Morning ${run}`, localTime: '16:30' }));
    expect(clash.status).toBe(409);
    // Another owner may use the very same names (names are per owner).
    expect((await post(eve, '', body({ name: `Email Intelligence — Morning ${run}` }))).status).toBe(201);
  });

  it('MI-02 · every workflow can repeat its workflow + provider (job discovery, recruiter, digest, calendar)', async () => {
    const pairs: Array<[string, string, string[]]> = [
      ['job_discovery', 'gemini', []], ['recruiter_intel', 'chatgpt', []], ['daily_brief', 'claude', ['followups']], ['calendar_review', 'claude', []],
    ];
    for (const [workflow, provider, sections] of pairs) {
      const a = await mk(eve, { name: `${workflow} A ${run}`, workflow, provider, sections, localTime: '07:00' });
      const b = await mk(eve, { name: `${workflow} B ${run}`, workflow, provider, sections, localTime: '18:00' });
      expect(a).not.toBe(b);
      const [va, vb] = [await view(eve, a), await view(eve, b)];
      expect([va.workflow, va.provider, vb.workflow, vb.provider]).toEqual([workflow, provider, workflow, provider]);
      expect([va.localTime, vb.localTime]).toEqual(['07:00', '18:00']);
    }
  });

  it('MI-03 · same instant, same workflow + provider: each automation gets its OWN occurrence, and idempotency is per automation', async () => {
    const at = slot();
    const a = await request(carol, morning, { p_scheduled_for: at });
    const b = await request(carol, midday, { p_scheduled_for: at });
    const c = await request(carol, evening, { p_scheduled_for: at });
    for (const r of [a, b, c]) expect(r.error, JSON.stringify(r.error)).toBeNull();
    expect([a.data.created, b.data.created, c.data.created]).toEqual([true, true, true]);
    expect(new Set([a.data.run_id, b.data.run_id, c.data.run_id]).size).toBe(3);
    const keys = [a, b, c].map((r) => r.data.external_run_id as string);
    expect(new Set(keys).size).toBe(3);
    expect(keys[0]).toContain(morning); expect(keys[1]).toContain(midday); expect(keys[2]).toContain(evening);
    // Repeating A's occurrence returns A's run; B and C are unaffected (and never reported ALREADY-created by A).
    const again = await request(carol, morning, { p_scheduled_for: at });
    expect(again.data).toMatchObject({ created: false, run_id: a.data.run_id });
    expect((await runRow(b.data.run_id)).automation_id).toBe(midday);
    expect((await runRow(c.data.run_id)).automation_id).toBe(evening);
  });

  it('MI-04 · claiming one automation\'s run never consumes a sibling\'s; each is claimed, finalized and retried on its own', async () => {
    const a = await request(carol, morning);
    const b = await request(carol, midday);
    const ca = await claim(carol, a.data.run_id);
    expect(ca.data).toMatchObject({ claimed: true, automation_id: morning });
    expect((await runRow(b.data.run_id)).status).toBe('QUEUED'); // untouched
    // A fails and is retried; B is not retried, B's own claim still works.
    expect((await finalize(carol, a.data.run_id, 'FAILED', { p_error_category: 'TIMEOUT', p_error_detail: 'x' })).error).toBeNull();
    const retry = await request(carol, null, { p_trigger_type: 'retry', p_scheduled_for: null, p_retry_of_run_id: a.data.run_id });
    expect(retry.error, JSON.stringify(retry.error)).toBeNull();
    expect((await runRow(retry.data.run_id)).automation_id).toBe(morning);
    expect((await admin.from('ai_runs').select('id').eq('retry_of_run_id', a.data.run_id)).data).toHaveLength(1);
    expect((await admin.from('ai_runs').select('id').eq('automation_id', midday).eq('trigger_type', 'retry')).data).toHaveLength(0);
    const cb = await claim(carol, b.data.run_id);
    expect(cb.data).toMatchObject({ claimed: true, automation_id: midday });
    expect((await finalize(carol, b.data.run_id, 'SUCCEEDED')).error).toBeNull();
    // B finished: A's retry is still QUEUED, A is not "already completed" because B succeeded.
    expect((await runRow(retry.data.run_id)).status).toBe('QUEUED');
  });

  it('MI-05 · manual runs: the same client key on two siblings is two executions; repeating it on one stays idempotent for that one', async () => {
    const key = `manual-${run}`;
    const x = await mk(carol, { name: `Manual X ${run}`, localTime: '06:00' });
    const y = await mk(carol, { name: `Manual Y ${run}`, localTime: '06:30' });
    const a1 = await request(carol, x, { p_trigger_type: 'manual', p_scheduled_for: null, p_client_key: key });
    const b1 = await request(carol, y, { p_trigger_type: 'manual', p_scheduled_for: null, p_client_key: key });
    const a2 = await request(carol, x, { p_trigger_type: 'manual', p_scheduled_for: null, p_client_key: key });
    expect(a1.data.created).toBe(true); expect(b1.data.created).toBe(true);
    expect(a1.data.run_id).not.toBe(b1.data.run_id);
    expect(a2.data).toMatchObject({ created: false, run_id: a1.data.run_id });
    expect(a1.data.external_run_id).toBe(`manual:${x}:${key}`);
    expect(b1.data.external_run_id).toBe(`manual:${y}:${key}`);
    for (const id of [x, y]) expect((await post(carol, `/${id}/delete`, { workspace_id: ws })).status).toBe(200);
    // The generated provider instructions carry each automation's own id.
    const sa = buildSchedulerSetup({ id: morning, name: 'Email Intelligence — Morning', workflow: 'email_triage', provider: 'claude', cadence: 'daily', localTime: '08:00', timezone: 'America/Chicago', weekdays: [], sections: [], delivery: ['ai_hub'], enabled: true } as never);
    const sb = buildSchedulerSetup({ id: midday, name: 'Email Intelligence — Midday', workflow: 'email_triage', provider: 'claude', cadence: 'daily', localTime: '12:30', timezone: 'America/Chicago', weekdays: [], sections: [], delivery: ['ai_hub'], enabled: true } as never);
    expect(sa!.scheduledInstructions).toContain(morning); expect(sa!.scheduledInstructions).not.toContain(midday);
    expect(sb!.scheduledInstructions).toContain(midday); expect(sb!.manualRunInstructions).not.toContain(morning);
  });

  it('MI-06 · state, history and health are per automation: a sibling\'s runs and unlinked provider runs never leak', async () => {
    const sa = await view(carol, morning);
    const sb = await view(carol, midday);
    const sc = await view(carol, evening);
    expect(sa.state.lastFailureAt).not.toBeNull(); // A's claimed run failed; its retry is the newest run (queued)
    expect(sa.state.lastStatus).toBe('QUEUED');
    expect(sa.state.lastSuccessAt).toBeNull();
    expect(sb.state.lastSuccessAt).not.toBeNull(); // B finished successfully
    expect(sb.state.lastFailureAt).toBeNull();
    // C has only a queued occurrence: neither A's failure nor B's success is attributed to it.
    expect(sc.state.lastSuccessAt).toBeNull();
    expect(sc.state.lastFailureAt).toBeNull();
    // An unlinked, provider-submitted run of the same workflow + provider is ambiguous with three siblings: attributed to none.
    const ing = await admin.rpc('rpc_ai_ingest_run', { p_actor_id: carol.userId, p_workspace_id: ws, p_provider: 'claude', p_workflow: 'email_triage', p_external_run_id: `provider-${run}` });
    expect(ing.error).toBeNull();
    expect((await finalize(carol, ing.data.run_id, 'FAILED', { p_error_category: 'INTERNAL', p_error_detail: 'x' })).error).toBeNull();
    expect((await view(carol, evening)).state.lastFailureAt).toBeNull();
    const hist = (await carol.call(`/ai/automations/${evening}/runs?workspace_id=${ws}`)).json.runs as Array<{ id: string }>;
    expect(hist.map((r) => r.id)).not.toContain(ing.data.run_id);
    const histA = (await carol.call(`/ai/automations/${morning}/runs?workspace_id=${ws}`)).json.runs as Array<{ id: string }>;
    expect(histA.every((r) => r.id !== ing.data.run_id)).toBe(true);
    expect(histA.length).toBeGreaterThan(0);
    // Insights: one health entry per automation id, each with its own last run / next occurrence.
    const ins = (await carol.call(`/ai/automations/insights?workspace_id=${ws}`)).json;
    for (const id of [morning, midday, evening]) expect(ins.health[id]).toBeTruthy();
    expect(ins.health[morning].retry).toMatchObject({ attempt: 1, inFlight: true }); // A's retry is A's alone
    expect(ins.health[midday].retry).toBeNull();
    expect(ins.health[evening].retry).toBeNull();
    expect(ins.health[midday].lastSuccessAt).not.toBeNull();
    expect(ins.health[evening].lastSuccessAt).toBeNull();
    expect(ins.health[evening].lastFailureAt).toBeNull();
  });

  it('MI-07 · edit, disable and delete are isolated; deleting a sibling does not hand its history to the survivor', async () => {
    const before = await view(carol, midday);
    // Edit A (schedule only): B and C are unchanged.
    const edit = await post(carol, `/${morning}`, body({ name: `Email Intelligence — Morning ${run}`, localTime: '08:30' }));
    expect(edit.status, JSON.stringify(edit.json)).toBe(200);
    expect((await view(carol, morning)).localTime).toBe('08:30');
    expect((await view(carol, midday)).updatedAt).toBe(before.updatedAt);
    expect((await view(carol, evening)).localTime).toBe('16:30');
    // Disable A: B stays enabled and requestable; A is refused.
    expect((await post(carol, `/${morning}`, body({ name: `Email Intelligence — Morning ${run}`, localTime: '08:30', enabled: false }))).status).toBe(200);
    expect((await view(carol, midday)).enabled).toBe(true);
    expect((await request(carol, midday)).error).toBeNull();
    expect((await request(carol, morning)).error?.message).toContain('AI_EXECUTION_AUTOMATION_DISABLED');
    // Delete A: B and C remain with their runs; A's history is not re-attributed to a survivor.
    const aRuns = (await admin.from('ai_runs').select('id').eq('automation_id', morning)).data!.map((r) => r.id as string);
    expect(aRuns.length).toBeGreaterThan(0);
    expect((await post(carol, `/${morning}/delete`, { workspace_id: ws })).status).toBe(200);
    expect((await view(carol, midday))).toBeTruthy();
    expect((await view(carol, evening))).toBeTruthy();
    const orphans = (await admin.from('ai_runs').select('id, automation_id').in('id', aRuns)).data!;
    expect(orphans.every((r) => r.automation_id === null)).toBe(true);
    const hist = (await carol.call(`/ai/automations/${midday}/runs?workspace_id=${ws}`)).json.runs as Array<{ id: string }>;
    for (const id of aRuns) expect(hist.map((r) => r.id)).not.toContain(id);
    const afterDelete = (await view(carol, midday)).state;
    expect(afterDelete.lastSuccessAt).not.toBeNull();
    expect(afterDelete.lastFailureAt).toBeNull(); // A's failure stayed with A's (now orphaned) history
    // Delete B too: C is now the sole Email + Claude automation and owns the unlinked provider-submitted run again.
    expect((await post(carol, `/${midday}/delete`, { workspace_id: ws })).status).toBe(200);
    expect((await view(carol, evening)).state.lastFailureAt).not.toBeNull(); // the provider-submitted FAILED run from MI-06 (orphans of A / B stay out)
    expect((await view(carol, evening)).state.lastSuccessAt).toBeNull(); // B's success was B's
  });

  it('MI-08 · ownership is unchanged: another owner can neither see nor manage these automations', async () => {
    expect((await list(eve)).map((r) => r.id)).not.toContain(evening);
    expect((await post(eve, `/${evening}`, body({ name: 'hijack', localTime: '01:00' }))).status).toBe(404);
    expect((await post(eve, `/${evening}/delete`, { workspace_id: ws })).status).toBe(404);
    expect((await request(eve, evening)).error?.message).toContain('AI_EXECUTION_AUTOMATION_NOT_FOUND');
    expect((await view(carol, evening))).toBeTruthy();
  });
});
