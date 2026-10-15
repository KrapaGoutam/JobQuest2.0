import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Actor, loadEnv, serviceDb } from './harness';

// AI-11H against a REAL database: the Weekly Digest (owner-local week, owner/workspace scope, honest source states, no mutation),
// automation health + analytics, provider credential lifecycle (expired / revoked) and the stable manual run key. Local stack only.
const ready = loadEnv();
const local = /^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.SUPABASE_URL ?? '');
const ON = { AI_HUB_ENABLED: 'true' };
const DAY = 86_400_000;

describe.skipIf(!ready || !local)('AI-11H — Weekly Digest, automation health, credential lifecycle (real DB, RLS)', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();
  const alice = new Actor(); // manager of the workspace
  const carol = new Actor(); // member, the digest owner (Chicago, Monday weeks)
  const eve = new Actor(); // member, peer
  const dave = new Actor(); // unrelated workspace
  let ws = '';
  let weekly: typeof import('../../apps/api/src/services/aiWeeklyDigestService');
  let digestSvc: typeof import('../../apps/api/src/services/aiDigestService');
  let WEEK = ''; // a completed past week of carol
  let NEXT = '';

  const build = async (owner: Actor, week?: string, workspaceId = ws) => weekly.buildWeeklyDigest({ workspaceId, userId: owner.userId!, accessToken: owner.token! }, { weekStart: week }, { env: ON });
  const sec = (d: { sections: Array<{ key: string }> }, k: string) => d.sections.find((s) => s.key === k) as any;
  const coreSnapshot = async () => {
    const out: Record<string, unknown> = {};
    for (const t of ['applications', 'tasks', 'interviews', 'application_events', 'ai_findings', 'ai_runs']) out[t] = (await admin.from(t).select('id').eq('workspace_id', ws).order('id')).data;
    return JSON.stringify(out);
  };

  beforeAll(async () => {
    process.env.AI_HUB_ENABLED = 'true';
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache(); resetSigningMaterial(); resetAdminClient();
    weekly = await import('../../apps/api/src/services/aiWeeklyDigestService');
    digestSvc = await import('../../apps/api/src/services/aiDigestService');
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    for (const [a, name] of [[alice, 'alice'], [carol, 'carol'], [eve, 'eve'], [dave, 'dave']] as const) {
      expect((await a.call('/auth/register', { username: `ai11h_${name}_${run}`, password: `Valid-AI11H-${name}-${run}!` })).status).toBe(201);
    }
    const prof = async (a: Actor) => (await admin.from('profiles').select('last_active_workspace_id').eq('user_id', a.userId!).single()).data!.last_active_workspace_id as string;
    ws = await prof(alice);
    expect((await admin.from('workspace_members').insert([
      { workspace_id: ws, user_id: carol.userId!, role: 'USER', status: 'ACTIVE' },
      { workspace_id: ws, user_id: eve.userId!, role: 'USER', status: 'ACTIVE' },
    ])).error).toBeNull();
    expect((await admin.from('profiles').update({ timezone: 'America/Chicago', week_start: 1 }).eq('user_id', carol.userId!)).error).toBeNull();
    const cur = weekly.resolveWeek(new Date(), 'America/Chicago', 1);
    if (!cur.ok) throw new Error('week');
    const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
    WEEK = shift(cur.currentWeekStart, -14);
    NEXT = shift(WEEK, 7);
  });
  afterAll(() => vi.restoreAllMocks());

  /** Noon local (Chicago) on day `d` of the target week, as an ISO instant. */
  const noonLocal = (d: number) => {
    const day = new Date(Date.parse(`${WEEK}T00:00:00Z`) + d * DAY).toISOString().slice(0, 10);
    const start = Date.parse(digestSvc.localDayWindow(day, 'America/Chicago').start);
    return new Date(start + 12 * 3_600_000).toISOString();
  };

  it('AI11H-01 · a completed owner-local week is built from the owner’s own records only, nothing is mutated', async () => {
    const mkApp = async (owner: Actor, company: string, at: string) => {
      const { data, error } = await admin.from('applications').insert({
        workspace_id: ws, user_id: owner.userId!, company_name: `${company}${run}`, role_title: 'Staff Engineer', stage: 'APPLIED', applied_at: at,
      }).select('id').single();
      expect(error).toBeNull();
      return data!.id as string;
    };
    const a1 = await mkApp(carol, 'Acme', noonLocal(1));
    const a2 = await mkApp(carol, 'Globex', noonLocal(3));
    await mkApp(carol, 'OutsideWeek', noonLocal(-2)); // the Saturday before the week
    const eveApp = await mkApp(eve, 'EveOnly', noonLocal(2)); // a peer's record must never appear
    const ev = (appId: string, actor: Actor, type: string, payload: Record<string, unknown>, at: string) =>
      admin.from('application_events').insert({ application_id: appId, workspace_id: ws, actor_id: actor.userId!, event_type: type, payload, created_at: at });
    // the Goals engine counts APPLIED milestones from the event log (not the applied-date field)
    expect((await ev(a1, carol, 'APPLIED', {}, noonLocal(1))).error).toBeNull();
    expect((await ev(a2, carol, 'APPLIED', {}, noonLocal(3))).error).toBeNull();
    expect((await ev(a1, carol, 'STAGE_CHANGED', { from_stage: 'APPLIED', to_stage: 'SCREEN' }, noonLocal(2))).error).toBeNull();
    expect((await ev(eveApp, eve, 'STAGE_CHANGED', { from_stage: 'APPLIED', to_stage: 'OFFER' }, noonLocal(2))).error).toBeNull();
    expect((await admin.from('interviews').insert({ workspace_id: ws, user_id: carol.userId!, application_id: a1, interview_type: 'TECHNICAL', scheduled_at: noonLocal(4) })).error).toBeNull();
    expect((await admin.from('tasks').insert({ workspace_id: ws, user_id: carol.userId!, title: `Done ${run}`, status: 'COMPLETED', completed_at: noonLocal(2) })).error).toBeNull();
    expect((await admin.from('tasks').insert({ workspace_id: ws, user_id: carol.userId!, title: `Still open ${run}`, due_date: new Date(Date.parse(`${WEEK}T00:00:00Z`) + 3 * DAY).toISOString().slice(0, 10) })).error).toBeNull();
    expect((await admin.from('tasks').insert({ workspace_id: ws, user_id: eve.userId!, title: `EVE TASK ${run}`, status: 'COMPLETED', completed_at: noonLocal(2) })).error).toBeNull();
    expect((await admin.from('goals').insert({ workspace_id: ws, user_id: carol.userId!, period_type: 'WEEKLY', goal_type: 'APPLICATIONS', target_value: 5, target_applications: 5, effective_date: WEEK, is_enabled: true })).error).toBeNull();

    const before = await coreSnapshot();
    const out = await build(carol, WEEK);
    expect(out.ok, JSON.stringify(out)).toBe(true);
    if (!out.ok) return;
    const d = out.data;
    expect(d).toMatchObject({ weekStart: WEEK, kind: 'weekly_digest', timeZone: 'America/Chicago', inProgress: false });
    expect(d.sections.map((s) => s.key)).toEqual(['at_a_glance', 'applications', 'interviews', 'job_email', 'job_leads', 'recruiters', 'tasks', 'goals', 'automation_health', 'attention_next'].filter((k) => k !== 'attention_next'));
    expect(sec(d, 'applications')).toMatchObject({ status: 'available', count: 2 });
    expect(JSON.stringify(d)).not.toMatch(/EveOnly|EVE TASK|OutsideWeek/);
    expect(sec(d, 'interviews')).toMatchObject({ status: 'available', count: 2 }); // 1 interview + 1 stage change (the peer's is excluded)
    expect(sec(d, 'interviews').items.map((i: any) => i.detail)).toEqual(expect.arrayContaining(['APPLIED → SCREEN']));
    expect(sec(d, 'tasks')).toMatchObject({ status: 'available' });
    expect(sec(d, 'tasks').metrics).toEqual([{ label: 'Completed', value: '1' }, { label: 'Due this week, still open', value: '1' }]);
    expect(sec(d, 'goals').items[0]).toMatchObject({ title: 'Applications: 2 of 5' });
    // AI sources that never ran are NOT zero: they were never set up
    expect(sec(d, 'job_email').status).toBe('not_configured');
    expect(sec(d, 'job_leads').status).toBe('not_configured');
    expect(sec(d, 'recruiters').status).toBe('not_configured');
    expect(sec(d, 'automation_health').status).toBe('not_configured');
    // deterministic + idempotent + side-effect free
    const again = await build(carol, WEEK);
    expect(again.ok && JSON.stringify({ ...again.data, generatedAt: 0 })).toBe(JSON.stringify({ ...d, generatedAt: 0 }));
    expect(await coreSnapshot()).toBe(before);
  });

  it('AI11H-02 · the peer sees only their own week; a Sunday-start owner gets a different boundary; another week is empty, not invented', async () => {
    const eveWeek = await build(eve, WEEK);
    expect(eveWeek.ok && sec(eveWeek.data, 'applications').count).toBe(1);
    expect(eveWeek.ok && JSON.stringify(eveWeek.data)).not.toMatch(/Acme|Globex/);
    const nextWeek = await build(carol, NEXT);
    expect(nextWeek.ok).toBe(true);
    if (nextWeek.ok) {
      expect(sec(nextWeek.data, 'applications')).toMatchObject({ status: 'zero', count: 0 });
      expect(sec(nextWeek.data, 'at_a_glance').headline).toMatch(/quiet week/);
    }
    // Sunday-start owners: the same Monday is not a week start for them.
    expect((await admin.from('profiles').update({ week_start: 0 }).eq('user_id', eve.userId!)).error).toBeNull();
    const bad = await build(eve, WEEK);
    expect(bad).toMatchObject({ ok: false, error: { code: 'INVALID_WEEK' } });
    expect((await admin.from('profiles').update({ week_start: 1 }).eq('user_id', eve.userId!)).error).toBeNull();
  });

  it('AI11H-03 · route: owner session only, validated week, workspace membership enforced, no raw errors', async () => {
    const ok = await carol.call(`/ai/digest/weekly?workspace_id=${ws}&week_start=${WEEK}`);
    expect(ok.status, JSON.stringify(ok.json)).toBe(200);
    expect(ok.json).toMatchObject({ kind: 'weekly_digest', weekStart: WEEK, version: '1.0' });
    const current = await carol.call(`/ai/digest/weekly?workspace_id=${ws}`);
    expect(current.status).toBe(200);
    expect(current.json.inProgress).toBe(true);
    expect(current.json.sections.map((s: any) => s.key)).toContain('attention_next');
    expect((await carol.call(`/ai/digest/weekly?workspace_id=${ws}&week_start=2026-10-14`)).status).toBe(422);
    expect((await carol.call(`/ai/digest/weekly?workspace_id=${ws}&week_start=junk`)).status).toBe(422);
    expect((await carol.call(`/ai/digest/weekly?workspace_id=${ws}&week_start=1999-01-04`)).status).toBe(422);
    expect((await carol.call(`/ai/digest/weekly?workspace_id=not-a-uuid`)).status).toBe(422);
    expect((await dave.call(`/ai/digest/weekly?workspace_id=${ws}`)).status).toBe(403);
    const anon = new Actor();
    expect((await anon.call(`/ai/digest/weekly?workspace_id=${ws}`)).status).toBe(401);
    expect(JSON.stringify(ok.json)).not.toMatch(/Bearer|jq_mcp_|service_role|PGRST/i);
  });

  it('AI11H-04 · a real AI source: zero when its latest run succeeded with nothing, unavailable when it failed', async () => {
    const mkRun = (workflow: string, status: string, extra: Record<string, unknown> = {}) => admin.from('ai_runs').insert({
      workspace_id: ws, user_id: carol.userId!, provider: 'claude', workflow, status, trigger_type: 'manual', ...extra,
    });
    expect((await mkRun('email_triage', 'SUCCEEDED', { sources: [{ type: 'gmail', status: 'zero' }] })).error).toBeNull();
    expect((await mkRun('job_discovery', 'FAILED', { error_category: 'SOURCE_UNAVAILABLE', sources: [] })).error).toBeNull();
    const out = await build(carol, WEEK);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(sec(out.data, 'job_email')).toMatchObject({ status: 'zero' });
    expect(sec(out.data, 'job_leads')).toMatchObject({ status: 'unavailable', count: null });
    expect(sec(out.data, 'job_leads').headline).toMatch(/unknown, not zero/);
  });

  it('AI11H-05 · insights: owner-scoped health + analytics, the lapsed credential is surfaced, periods are validated', async () => {
    const auto = await carol.call('/ai/automations', {
      workspace_id: ws, name: `Digest ${run}`, workflow: 'daily_brief', enabled: true, provider: 'gemini', cadence: 'daily', localTime: '08:00', timezone: 'America/Chicago',
      weekdays: [], sections: [], delivery: ['ai_hub'],
    });
    expect(auto.status, JSON.stringify(auto.json)).toBe(201);
    const id = auto.json.id as string;
    // a failed scheduled run + a succeeded manual run, linked to the automation
    expect((await admin.from('ai_runs').insert({ workspace_id: ws, user_id: carol.userId!, provider: 'gemini', workflow: 'daily_brief', status: 'SUCCEEDED', trigger_type: 'manual', automation_id: id, sources: [{ type: 'gmail', status: 'unavailable' }], created_at: new Date(Date.now() - 120_000).toISOString(), started_at: new Date(Date.now() - 3_600_000).toISOString(), completed_at: new Date(Date.now() - 3_540_000).toISOString() })).error).toBeNull();
    expect((await admin.from('ai_runs').insert({ workspace_id: ws, user_id: carol.userId!, provider: 'gemini', workflow: 'daily_brief', status: 'FAILED', trigger_type: 'scheduled', automation_id: id, sources: [], error_category: 'CONNECTOR_AUTH_EXPIRED', started_at: new Date().toISOString(), completed_at: new Date().toISOString(), scheduled_for: new Date(Date.now() - 60_000).toISOString() })).error).toBeNull();
    // an expired connector credential for Gemini
    const created = await carol.call('/ai/connector-tokens', { workspace_id: ws, name: `gem ${run}`, scopes: ['jobquest:read', 'ai:read', 'ai:ingest'], provider: 'gemini' });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    expect((await admin.from('ai_connector_tokens').update({ created_at: new Date(Date.now() - 3 * DAY).toISOString(), expires_at: new Date(Date.now() - DAY).toISOString() }).eq('id', created.json.metadata.id)).error).toBeNull();

    const r = await carol.call(`/ai/automations/insights?workspace_id=${ws}&days=30`);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const h = r.json.health[id];
    expect(h).toMatchObject({ state: 'needs_attention', interventionRequired: true, lastTrigger: 'scheduled' });
    expect(h.reasons.join(' ')).toMatch(/credential has expired/);
    expect(h.reasons.join(' ')).toMatch(/last run failed/);
    expect(r.json.analytics).toMatchObject({ windowDays: 30, totalRuns: 2, succeeded: 1, failed: 1, successRate: 0.5, byTrigger: { scheduled: 1, manual: 1, retry: 0 } });
    expect(r.json.analytics.sourceProblems).toEqual({ total: 1, byType: [{ key: 'gmail', count: 1 }] });
    expect(r.json.analytics.recentFailures[0]).toMatchObject({ errorCategory: 'CONNECTOR_AUTH_EXPIRED', automationId: id });
    expect(JSON.stringify(r.json)).not.toMatch(/error_detail|Bearer|jq_mcp_|token_hash|secret/i);

    const st = await carol.call(`/ai/automations/scheduler-status?workspace_id=${ws}`);
    expect(st.json.providers.find((p: any) => p.provider === 'gemini')).toMatchObject({ connection: 'not_connected', credential: 'expired', scheduler: 'NOT_CONNECTED' });

    // revoking through the supported route turns the same state into "revoked" once a newer credential lapses
    const second = await carol.call('/ai/connector-tokens', { workspace_id: ws, name: `gem2 ${run}`, scopes: ['jobquest:read', 'ai:read', 'ai:ingest'], provider: 'gemini' });
    expect(second.status).toBe(201);
    const live = await carol.call(`/ai/automations/scheduler-status?workspace_id=${ws}`);
    expect(live.json.providers.find((p: any) => p.provider === 'gemini')).toMatchObject({ connection: 'connected', credential: 'active' });
    expect((await carol.call(`/ai/connector-tokens/${second.json.metadata.id}/revoke`, {})).status).toBe(200);
    const revoked = await carol.call(`/ai/automations/scheduler-status?workspace_id=${ws}`);
    expect(revoked.json.providers.find((p: any) => p.provider === 'gemini')).toMatchObject({ connection: 'not_connected', credential: 'revoked' });

    // isolation + validation
    const peer = await eve.call(`/ai/automations/insights?workspace_id=${ws}`);
    expect(peer.status).toBe(200);
    expect(peer.json.health[id]).toBeUndefined();
    expect(peer.json.analytics.totalRuns).toBe(0);
    expect((await carol.call(`/ai/automations/insights?workspace_id=${ws}&days=45`)).status).toBe(422);
    expect((await carol.call(`/ai/automations/insights?workspace_id=nope`)).status).toBe(422);
    expect((await new Actor().call(`/ai/automations/insights?workspace_id=${ws}`)).status).toBe(401);
  });

  it('AI11H-06 · setup instructions carry a server-generated run key that changes per request and is a valid claim key', async () => {
    const list = await carol.call(`/ai/automations?workspace_id=${ws}`);
    const id = (list.json.automations as any[]).find((a) => a.provider === 'gemini').id as string;
    const a = await carol.call(`/ai/automations/${id}/setup?workspace_id=${ws}`);
    const b = await carol.call(`/ai/automations/${id}/setup?workspace_id=${ws}`);
    expect(a.status, JSON.stringify(a.json)).toBe(200);
    const ka = a.json.setup.manualRunKey as string; const kb = b.json.setup.manualRunKey as string;
    expect(ka).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(ka).not.toBe(kb);
    expect(a.json.setup.manualRunInstructions).toContain(`"clientKey": "${ka}"`);
    expect(a.json.setup.manualRunInstructions).not.toContain(kb);
    expect(a.json.setup.scheduledInstructions).not.toContain('clientKey');
    expect(a.json.status).toMatchObject({ credential: expect.any(String) });
  });
});
