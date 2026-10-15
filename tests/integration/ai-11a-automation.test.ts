import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, anonDb, loadEnv, makeRecorder, serviceDb } from './harness';

// AI-11A: provider-neutral automation definitions against a REAL database and the REAL API app. Ownership and
// workspace isolation (RLS + RPC), validation (route, RPC and table constraints), uniqueness, derived run state,
// audit hygiene, kill switch and CSRF. Local stack only (writes test rows).
const ready = loadEnv();
const local = /^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.SUPABASE_URL ?? '');
const record = makeRecorder('test-results/evidence', 'integration');
const CANARY = 'SECRET-NAME-CANARY';

const digest = (over: Record<string, unknown> = {}) => ({
  name: 'Weekday Morning Digest', workflow: 'daily_brief', enabled: true, provider: 'claude', cadence: 'weekdays', localTime: '08:00',
  timezone: 'America/Chicago', weekdays: [], sections: ['email_triage', 'job_discovery', 'followups'], delivery: ['ai_hub', 'email_summary'], ...over,
});

describe.skipIf(!ready || !local)('AI-11A — automation foundation (real DB + real API)', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();
  const alice = new Actor(); // workspace W manager
  const carol = new Actor(); // W member: owner of the automations under test
  const eve = new Actor(); // W member: same workspace, different owner
  const dave = new Actor(); // unrelated workspace
  let ws: string;
  let daveWs: string;
  let carolDigestId: string;
  const prevHub = process.env.AI_HUB_ENABLED;

  const post = (a: Actor, path: string, body: unknown, opts: { csrf?: boolean } = {}) => a.call(`/ai/automations${path}`, body, opts);
  const list = async (a: Actor, workspace = ws) => a.call(`/ai/automations?workspace_id=${workspace}`);
  const rpcSave = (over: Record<string, unknown> = {}) => admin.rpc('rpc_ai_automation_save', {
    p_actor_id: carol.userId, p_workspace_id: ws, p_id: null, p_name: `rpc-${randomBytes(3).toString('hex')}`, p_workflow: 'daily_brief', p_enabled: false,
    p_provider: 'gemini', p_cadence: 'daily', p_local_time: '09:30', p_timezone: 'America/Chicago', p_weekdays: [], p_sections: [], p_delivery: ['ai_hub'], ...over,
  });

  beforeAll(async () => {
    process.env.AI_HUB_ENABLED = 'true';
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache(); resetSigningMaterial(); resetAdminClient();
    for (const [actor, name] of [[alice, 'alice'], [carol, 'carol'], [eve, 'eve'], [dave, 'dave']] as const) {
      const res = await actor.call('/auth/register', { username: `ai11a_${name}_${run}`, password: `Valid-AI11A-${name}-${run}!` });
      expect(res.status).toBe(201);
    }
    const prof = async (a: Actor) =>
      (await admin.from('profiles').select('last_active_workspace_id').eq('user_id', a.userId!).single()).data!.last_active_workspace_id as string;
    ws = await prof(alice);
    daveWs = await prof(dave);
    const mem = await admin.from('workspace_members').insert([
      { workspace_id: ws, user_id: carol.userId!, role: 'USER', status: 'ACTIVE' },
      { workspace_id: ws, user_id: eve.userId!, role: 'USER', status: 'ACTIVE' },
    ]);
    expect(mem.error).toBeNull();
  });
  afterAll(() => { if (prevHub === undefined) delete process.env.AI_HUB_ENABLED; else process.env.AI_HUB_ENABLED = prevHub; });

  it('AI11A-01 · an owner creates and lists a provider-neutral automation with derived state', async () => {
    const created = await post(carol, '', { workspace_id: ws, ...digest({ name: `Weekday Morning Digest ${CANARY}` }) });
    expect(created.status).toBe(201);
    expect(created.json.created).toBe(true);
    carolDigestId = created.json.id;

    const r = await list(carol);
    expect(r.status).toBe(200);
    expect(r.json.automations).toHaveLength(1);
    const a = r.json.automations[0];
    expect(a).toMatchObject({
      id: carolDigestId, workflow: 'daily_brief', provider: 'claude', cadence: 'weekdays', localTime: '08:00', timezone: 'America/Chicago',
      weekdays: [], sections: ['email_triage', 'followups', 'job_discovery'], delivery: ['ai_hub', 'email_summary'], enabled: true,
    });
    expect(a.state).toMatchObject({ lastRunAt: null, lastStatus: null, lastSuccessAt: null, lastErrorCategory: null });
    expect(Date.parse(a.state.nextExpectedRunAt)).toBeGreaterThan(Date.now());
    // Run Now ships as a contract, not an action: nothing can execute a provider run yet.
    expect(a.runNow).toEqual({ ready: false, reason: 'NO_EXECUTOR' });
    record('ai11a-01-create-list', { ok: true });
  });

  it('AI11A-02 · workspace and owner isolation (RLS + RPC)', async () => {
    // Same-workspace peer and the workspace MANAGER see nothing (owner-only, like extension tokens).
    expect((await list(eve)).json.automations).toEqual([]);
    expect((await list(alice)).json.automations).toEqual([]);
    // Another workspace asking for W's id gets nothing; it can neither write into W nor touch the row.
    expect((await list(dave, ws)).json.automations).toEqual([]);
    expect((await post(dave, '', { workspace_id: ws, ...digest({ name: 'intruder' }) })).status).toBe(403);
    expect((await post(eve, `/${carolDigestId}`, { workspace_id: ws, ...digest({ name: 'hijack' }) })).status).toBe(404);
    expect((await post(eve, `/${carolDigestId}/delete`, { workspace_id: ws })).status).toBe(404);
    expect((await post(alice, `/${carolDigestId}/delete`, { workspace_id: ws })).status).toBe(404);
    expect((await post(dave, `/${carolDigestId}/delete`, { workspace_id: daveWs })).status).toBe(404);
    expect((await list(carol)).json.automations).toHaveLength(1);
    // Direct Data API: owner reads own row, nobody else does, and nobody writes or calls the RPCs.
    expect((await carol.db().from('ai_workflow_configs').select('id').eq('id', carolDigestId)).data).toHaveLength(1);
    for (const other of [eve, alice, dave]) expect((await other.db().from('ai_workflow_configs').select('id').eq('id', carolDigestId)).data).toHaveLength(0);
    for (const a of [carol, alice]) {
      expect((await a.db().from('ai_workflow_configs').update({ enabled: false }).eq('id', carolDigestId)).error?.code).toBe('42501');
      expect((await a.db().from('ai_workflow_configs').delete().eq('id', carolDigestId)).error?.code).toBe('42501');
      const direct = await a.db().rpc('rpc_ai_automation_save', { p_actor_id: a.userId, p_workspace_id: ws, p_id: null, p_name: 'x', p_workflow: 'daily_brief', p_enabled: false, p_provider: 'claude', p_cadence: 'manual_only', p_local_time: null, p_timezone: null, p_weekdays: [], p_sections: [], p_delivery: ['ai_hub'] });
      expect(direct.error?.code).toBe('42501');
      expect((await a.db().rpc('rpc_ai_automation_delete', { p_actor_id: a.userId, p_workspace_id: ws, p_id: carolDigestId })).error?.code).toBe('42501');
    }
    const anon = anonDb();
    expect((await anon.from('ai_workflow_configs').select('id').limit(1)).error).not.toBeNull();
    expect((await anon.rpc('rpc_ai_automation_save', { p_actor_id: carol.userId, p_workspace_id: ws })).error).not.toBeNull();
    // Unauthenticated API access.
    expect((await carol.call(`/ai/automations?workspace_id=${ws}`, undefined, { bearer: null })).status).toBe(401);
    record('ai11a-02-isolation', { owner_only: true, rpc_service_role_only: true });
  });

  it('AI11A-03 · enabled/disabled state drives next-run and is audited', async () => {
    const off = await post(carol, `/${carolDigestId}`, { workspace_id: ws, ...digest({ name: `Weekday Morning Digest ${CANARY}`, enabled: false }) });
    expect(off.status).toBe(200);
    const a = (await list(carol)).json.automations[0];
    expect(a.enabled).toBe(false);
    expect(a.state.nextExpectedRunAt).toBeNull();
    expect(a.runNow).toEqual({ ready: false, reason: 'AUTOMATION_DISABLED' });
    const on = await post(carol, `/${carolDigestId}`, { workspace_id: ws, ...digest({ name: `Weekday Morning Digest ${CANARY}`, enabled: true }) });
    expect(on.status).toBe(200);
    expect((await list(carol)).json.automations[0].state.nextExpectedRunAt).not.toBeNull();
    const audit = (await admin.from('audit_events').select('action, metadata').eq('target_entity_id', carolDigestId)).data ?? [];
    expect(audit.map((e) => e.action).sort()).toEqual(['AI_AUTOMATION_CREATED', 'AI_AUTOMATION_UPDATED', 'AI_AUTOMATION_UPDATED']);
    expect(audit.filter((e) => (e.metadata as { enabled_changed?: boolean }).enabled_changed)).toHaveLength(2);
  });

  it('AI11A-04 · the API rejects invalid definitions before any write', async () => {
    const bad: Array<[string, Record<string, unknown>]> = [
      ['cadence', { cadence: 'hourly' }],
      ['provider system', { provider: 'system' }],
      ['provider unknown', { provider: 'grok' }],
      ['timezone', { timezone: 'Mars/Phobos' }],
      ['timezone abbreviation', { timezone: 'EST' }],
      ['time', { localTime: '25:00' }],
      ['time missing', { localTime: null }],
      ['weekdays out of range', { cadence: 'selected_days', weekdays: [0, 8] }],
      ['selected_days empty', { cadence: 'selected_days', weekdays: [] }],
      ['weekly two days', { cadence: 'weekly', weekdays: [1, 2] }],
      ['daily with days', { cadence: 'daily', weekdays: [1] }],
      ['section', { sections: ['hacking'] }],
      ['sections on single-purpose workflow', { workflow: 'email_triage', sections: ['job_discovery'] }],
      ['delivery', { delivery: ['sms'] }],
      ['delivery without ai_hub', { delivery: ['email_summary'] }],
      ['empty name', { name: '   ' }],
      ['long name', { name: 'x'.repeat(81) }],
      ['workflow', { workflow: 'weekly_review' }],
    ];
    for (const [label, over] of bad) {
      const r = await post(carol, '', { workspace_id: ws, ...digest({ name: `bad-${label}`, ...over }) });
      expect(r.status, label).toBe(422);
      expect(r.json.error.code, label).toBe('INVALID_INPUT');
    }
    // Ownership/identity cannot be smuggled in, and malformed bodies fail closed.
    expect((await post(carol, '', { workspace_id: ws, user_id: eve.userId, ...digest({ name: 'smuggle' }) })).status).toBe(422);
    expect((await post(carol, '', { workspace_id: ws, ...digest({ name: 'smuggle2' }), id: carolDigestId })).status).toBe(422);
    expect((await post(carol, '', { ...digest({ name: 'no ws' }) })).status).toBe(422);
    expect((await post(carol, '/not-a-uuid', { workspace_id: ws, ...digest() })).status).toBe(404);
    // A valid minimal manual-only automation (no schedule fields at all) is fine.
    const manual = await post(carol, '', { workspace_id: ws, ...digest({ name: 'Manual only', provider: 'chatgpt', cadence: 'manual_only', localTime: null, timezone: null, sections: [], delivery: ['ai_hub'] }) });
    expect(manual.status).toBe(201);
    const a = (await list(carol)).json.automations.find((x: { name: string }) => x.name === 'Manual only');
    expect(a.state.nextExpectedRunAt).toBeNull();
    expect(a.runNow.reason).toBe('NO_EXECUTOR');
    const rows = (await list(carol)).json.automations.map((x: { name: string }) => x.name);
    expect(rows.some((n: string) => n.startsWith('bad-') || n === 'smuggle' || n === 'intruder' || n === 'hijack')).toBe(false);
    record('ai11a-04-validation', { rejected: bad.length });
  });

  it('AI11A-05 · the RPC and table constraints enforce the same rules independently', async () => {
    const bads: Array<[string, Record<string, unknown>, string]> = [
      ['bad zone', { p_timezone: 'Mars/Phobos' }, '22023'],
      ['posix zone', { p_timezone: 'posix/UTC' }, '22023'],
      ['bad time', { p_local_time: '24:00' }, '22023'],
      ['weekly two days', { p_cadence: 'weekly', p_weekdays: [1, 2] }, '22023'],
      ['weekday 0', { p_cadence: 'selected_days', p_weekdays: [0] }, '22023'],
      ['sections on single-purpose', { p_workflow: 'job_discovery', p_sections: ['followups'] }, '22023'],
      ['bad section', { p_sections: ['x'] }, '22023'],
      ['no ai_hub', { p_delivery: ['email_summary'] }, '22023'],
      ['provider system', { p_provider: 'system' }, '22023'],
      ['null provider', { p_provider: null }, '22023'],
      ['null enabled', { p_enabled: null }, '22023'],
      ['workflow', { p_workflow: 'nope' }, '22023'],
      ['not a member', { p_actor_id: dave.userId }, '42501'],
    ];
    for (const [label, over, code] of bads) expect((await rpcSave(over)).error?.code, label).toBe(code);
    // Raw table constraints (the last line of defence behind the RPC).
    const base = { workspace_id: ws, user_id: carol.userId!, workflow: 'recruiter_intel', name: `raw-${run}` };
    const raw = async (label: string, over: Record<string, unknown>) => expect((await admin.from('ai_workflow_configs').insert({ ...base, name: `raw-${label}-${run}`, ...over })).error?.code, label).toBe('23514');
    await raw('cadence', { cadence: 'hourly' });
    await raw('daily-no-time', { cadence: 'daily' });
    await raw('weekly-no-day', { cadence: 'weekly', local_time: '08:00', timezone: 'UTC' });
    await raw('manual-with-days', { cadence: 'manual_only', weekdays: [1] });
    await raw('weekday-range', { cadence: 'selected_days', weekdays: [9], local_time: '08:00', timezone: 'UTC' });
    await raw('time', { cadence: 'daily', local_time: '8:00', timezone: 'UTC' });
    await raw('sections', { sections: ['x'] });
    await raw('delivery', { delivery: ['email_summary'] });
    await raw('enabled-no-provider', { enabled: true });
    await raw('blank-name', { name: '   ' });
    // Normalisation: duplicates and order do not matter.
    const ok = await rpcSave({ p_name: `norm-${run}`, p_provider: 'gemini', p_cadence: 'selected_days', p_weekdays: [5, 1, 5, 3], p_sections: ['followups', 'email_triage', 'followups'], p_delivery: ['email_summary', 'ai_hub', 'ai_hub'] });
    expect(ok.error).toBeNull();
    const row = (await admin.from('ai_workflow_configs').select('weekdays, sections, delivery').eq('id', ok.data.id).single()).data!;
    expect(row).toEqual({ weekdays: [1, 3, 5], sections: ['email_triage', 'followups'], delivery: ['ai_hub', 'email_summary'] });
    await admin.rpc('rpc_ai_automation_delete', { p_actor_id: carol.userId, p_workspace_id: ws, p_id: ok.data.id });
  });

  it('AI11A-06 · uniqueness (name, workflow + provider) and the per-owner limit', async () => {
    // Same workflow, different provider and name is fine (provider is data, not architecture).
    expect((await post(carol, '', { workspace_id: ws, ...digest({ name: 'Gemini digest', provider: 'gemini' }) })).status).toBe(201);
    // A name collides case-insensitively, whatever the workflow/provider.
    expect((await post(carol, '', { workspace_id: ws, ...digest({ name: 'MANUAL ONLY', provider: 'gemini', workflow: 'job_discovery', sections: [] }) })).status).toBe(409);
    expect((await post(carol, '', { workspace_id: ws, ...digest({ name: 'gemini DIGEST', provider: 'chatgpt', workflow: 'job_discovery', sections: [] }) })).status).toBe(409);
    // Same workflow + provider as the Claude digest, different name.
    expect((await post(carol, '', { workspace_id: ws, ...digest({ name: 'Second Claude digest' }) })).status).toBe(409);
    // A different owner may reuse both the name and the workflow/provider.
    expect((await post(eve, '', { workspace_id: ws, ...digest() })).status).toBe(201);
    // Limit: fill to 10 for carol (some already exist), the next one is refused.
    const have = (await list(carol)).json.automations.length;
    const fill = ['email_triage', 'job_discovery', 'recruiter_intel', 'calendar_review', 'other'] as const;
    let n = have;
    for (const wf of fill) for (const pv of ['claude', 'chatgpt', 'gemini'] as const) {
      if (n >= 10) break;
      const r = await rpcSave({ p_name: `fill-${wf}-${pv}`, p_workflow: wf, p_provider: pv, p_cadence: 'manual_only', p_local_time: null, p_timezone: null });
      if (!r.error) n += 1;
    }
    expect(n).toBe(10);
    const over = await post(carol, '', { workspace_id: ws, ...digest({ name: 'eleventh', workflow: 'other', provider: 'claude', sections: [] }) });
    expect(over.status).toBe(422);
    expect(over.json.error.code).toBe('AUTOMATION_LIMIT');
    const limited = await rpcSave({ p_name: 'eleventh-rpc', p_workflow: 'other', p_provider: 'manual', p_cadence: 'manual_only', p_local_time: null, p_timezone: null });
    expect(limited.error?.code).toBe('53400');
    // Updating at the limit still works.
    expect((await post(carol, `/${carolDigestId}`, { workspace_id: ws, ...digest({ name: `Weekday Morning Digest ${CANARY}`, localTime: '07:45' }) })).status).toBe(200);
    expect((await list(carol)).json.automations).toHaveLength(10);
    // Cleanup the fillers so later tests see a small set.
    for (const a of (await list(carol)).json.automations as Array<{ id: string; name: string }>) {
      if (a.name.startsWith('fill-')) expect((await post(carol, `/${a.id}/delete`, { workspace_id: ws })).status).toBe(200);
    }
  });

  it('AI11A-07 · last run, last success and last error are derived from ai_runs (same owner, workflow and provider only)', async () => {
    const open = async (userId: string, provider: string, workflow: string, ext: string) => {
      const r = await admin.rpc('rpc_ai_ingest_run', { p_actor_id: userId, p_workspace_id: ws, p_provider: provider, p_workflow: workflow, p_external_run_id: `${ext}-${run}` });
      expect(r.error).toBeNull();
      return r.data.run_id as string;
    };
    const finish = async (userId: string, id: string, status: string, error?: string) => {
      const r = await admin.rpc('rpc_ai_finalize_run', { p_actor_id: userId, p_run_id: id, p_status: status, ...(error ? { p_error_category: error, p_error_detail: 'RAW-PROVIDER-DETAIL-CANARY' } : {}) });
      expect(r.error).toBeNull();
    };
    const ok = await open(carol.userId!, 'claude', 'daily_brief', 'ok'); await finish(carol.userId!, ok, 'SUCCEEDED');
    // Noise that must NOT count: another provider, another workflow, another owner.
    const otherProvider = await open(carol.userId!, 'gemini', 'daily_brief', 'op'); await finish(carol.userId!, otherProvider, 'FAILED', 'INTERNAL');
    const otherWorkflow = await open(carol.userId!, 'claude', 'email_triage', 'ow'); await finish(carol.userId!, otherWorkflow, 'FAILED', 'TIMEOUT');
    const peer = await open(eve.userId!, 'claude', 'daily_brief', 'peer'); await finish(eve.userId!, peer, 'FAILED', 'RATE_LIMITED');

    let a = (await list(carol)).json.automations.find((x: { id: string }) => x.id === carolDigestId);
    expect(a.state.lastStatus).toBe('SUCCEEDED');
    expect(a.state.lastErrorCategory).toBeNull();
    expect(a.state.lastSuccessAt).toBe(a.state.lastRunAt);

    const bad = await open(carol.userId!, 'claude', 'daily_brief', 'bad'); await finish(carol.userId!, bad, 'FAILED', 'CONNECTOR_AUTH_EXPIRED');
    a = (await list(carol)).json.automations.find((x: { id: string }) => x.id === carolDigestId);
    expect(a.state.lastStatus).toBe('FAILED');
    expect(a.state.lastErrorCategory).toBe('CONNECTOR_AUTH_EXPIRED');
    expect(a.state.lastSuccessAt).not.toBeNull();
    expect(Date.parse(a.state.lastRunAt)).toBeGreaterThanOrEqual(Date.parse(a.state.lastSuccessAt));
    // Provider error text is never exposed, only the normalized category.
    expect(JSON.stringify(a)).not.toContain('RAW-PROVIDER-DETAIL-CANARY');
    // The peer's automation is unaffected by carol's runs and sees only its own.
    const peerAuto = (await list(eve)).json.automations[0];
    expect(peerAuto.state.lastStatus).toBe('FAILED');
    expect(peerAuto.state.lastErrorCategory).toBe('RATE_LIMITED');
    expect(peerAuto.state.lastSuccessAt).toBeNull();
    // Existing run history is untouched: the automation table holds no run data.
    const cols = (await admin.from('ai_workflow_configs').select('*').eq('id', carolDigestId).single()).data!;
    for (const k of ['last_run_at', 'last_success_at', 'last_status', 'next_expected_run_at', 'last_error']) expect(cols).not.toHaveProperty(k);
  });

  it('AI11A-08 · AI Hub kill switch blocks create/update, never delete; CSRF is required', async () => {
    process.env.AI_HUB_ENABLED = 'false';
    try {
      expect((await post(carol, '', { workspace_id: ws, ...digest({ name: 'blocked' }) })).status).toBe(503);
      expect((await post(carol, `/${carolDigestId}`, { workspace_id: ws, ...digest({ name: `Weekday Morning Digest ${CANARY}` }) })).status).toBe(503);
      const a = (await list(carol)).json.automations.find((x: { id: string }) => x.id === carolDigestId);
      expect(a.runNow).toEqual({ ready: false, reason: 'AI_HUB_DISABLED' });
    } finally { process.env.AI_HUB_ENABLED = 'true'; }
    expect((await post(carol, '', { workspace_id: ws, ...digest({ name: 'no csrf' }) }, { csrf: false })).status).toBe(403);
    expect((await post(carol, `/${carolDigestId}/delete`, { workspace_id: ws }, { csrf: false })).status).toBe(403);
    // PUT/PATCH are not part of the API surface (the Vercel entry exports none).
    expect((await carol.call(`/ai/automations/${carolDigestId}`, { workspace_id: ws, ...digest() }, { method: 'PUT' })).status).toBe(404);
  });

  it('AI11A-09 · delete removes the definition, keeps run history, and the audit never carries the name', async () => {
    const del = await post(carol, `/${carolDigestId}/delete`, { workspace_id: ws });
    expect(del.status).toBe(200);
    expect((await post(carol, `/${carolDigestId}/delete`, { workspace_id: ws })).status).toBe(404);
    expect((await list(carol)).json.automations.find((x: { id: string }) => x.id === carolDigestId)).toBeUndefined();
    const runs = await admin.from('ai_runs').select('id').eq('workspace_id', ws).eq('user_id', carol.userId!).eq('workflow', 'daily_brief');
    expect((runs.data ?? []).length).toBeGreaterThanOrEqual(2);
    const audit = (await admin.from('audit_events').select('action, metadata, target_entity_type').eq('workspace_id', ws).like('action', 'AI_AUTOMATION_%')).data ?? [];
    expect(audit.length).toBeGreaterThanOrEqual(6);
    expect(audit.every((e) => e.target_entity_type === 'AI_AUTOMATION')).toBe(true);
    expect(audit.some((e) => e.action === 'AI_AUTOMATION_DELETED')).toBe(true);
    expect(JSON.stringify(audit)).not.toContain(CANARY);
    record('ai11a-09-delete-audit', { audit_events: audit.length });
  });
});
