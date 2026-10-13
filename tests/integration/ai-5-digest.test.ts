import { beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, loadEnv, makeRecorder, serviceDb } from './harness';

// AI-5: Daily Digest storage, idempotency, snapshot stability, filters, RLS and the
// JobQuest-generated digest against a REAL database. Local stack only (writes seed rows).
const ready = loadEnv();
const local = /^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.SUPABASE_URL ?? '');
const record = makeRecorder('test-results/evidence', 'integration');
const ON = { AI_HUB_ENABLED: 'true' };
const quiet = { env: ON, log: () => undefined };

describe.skipIf(!ready || !local)('AI-5 — Daily Digest (real DB, RLS)', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();
  const alice = new Actor(); // workspace manager
  const carol = new Actor(); // member, owner of the digests
  const eve = new Actor(); // member, peer
  const dave = new Actor(); // unrelated workspace
  let ws: string;
  let daveWs: string;
  let read: typeof import('../../apps/api/src/services/aiReadService');
  let digestSvc: typeof import('../../apps/api/src/services/aiDigestService');
  let ingest: typeof import('../../apps/api/src/services/aiIntegrationService').ingestAiResult;
  let n = 0;
  const uniq = (p: string) => `${p}-${run}-${++n}`;
  const as = (a: Actor, workspaceId = ws) => ({ workspaceId, accessToken: a.token! });
  const payload = (date: string, over: Record<string, unknown> = {}) => ({
    version: '1.0', digest_date: date, time_zone: 'UTC', generated_at: `${date}T12:00:00Z`,
    summary: { follow_ups: 1, pending_suggestions: 0 }, priorities: [{ title: `Priority for ${date}` }],
    sections: { applications: { status: 'available', count: 1, items: [{ title: 'Acme — Engineer', source: 'jobquest' }] }, email_activity: { status: 'not_configured', items: [] }, job_leads: { status: 'zero', count: 0, items: [] } },
    ...over,
  });
  const digest = (date: string, over: { provider?: string; runId?: string; payload?: Record<string, unknown>; title?: string } = {}) => ({
    contract: 'jobquest.ai-result', schema_version: '1.0', provider: over.provider ?? 'claude', workflow: 'daily_brief',
    run: { external_run_id: over.runId ?? uniq('ext'), generated_at: `${date}T12:00:00Z` }, sources: [], suggestions: [], metadata: {},
    findings: [{ kind: 'daily_brief', dedupe: { date }, title: over.title ?? `Daily digest ${date}`, priority: 'INFO', payload: over.payload ?? payload(date) }],
  });
  const submit = async (doc: unknown, owner: Actor = carol) => {
    const r = await ingest({ workspaceId: ws, userId: owner.userId!, actorKind: 'SERVICE_INGEST' }, doc, quiet);
    expect(r.runId, JSON.stringify(r.errors)).not.toBeNull();
    return r;
  };
  const list = async (a: Actor, filters = {}, page = {}, workspaceId = ws) => {
    const r = await read.listAiDigests(as(a, workspaceId), filters, page, { env: ON });
    return r.ok ? r.data : (() => { throw new Error(JSON.stringify(r.error)); })();
  };

  beforeAll(async () => {
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache(); resetSigningMaterial(); resetAdminClient();
    read = await import('../../apps/api/src/services/aiReadService');
    digestSvc = await import('../../apps/api/src/services/aiDigestService');
    ({ ingestAiResult: ingest } = await import('../../apps/api/src/services/aiIntegrationService'));
    for (const [a, name] of [[alice, 'alice'], [carol, 'carol'], [eve, 'eve'], [dave, 'dave']] as const) {
      expect((await a.call('/auth/register', { username: `ai5_${name}_${run}`, password: `Valid-AI5-${name}-${run}!` })).status).toBe(201);
    }
    const prof = async (a: Actor) => (await admin.from('profiles').select('last_active_workspace_id').eq('user_id', a.userId!).single()).data!.last_active_workspace_id as string;
    ws = await prof(alice);
    daveWs = await prof(dave);
    expect((await admin.from('workspace_members').insert([
      { workspace_id: ws, user_id: carol.userId!, role: 'USER', status: 'ACTIVE' },
      { workspace_id: ws, user_id: eve.userId!, role: 'USER', status: 'ACTIVE' },
    ])).error).toBeNull();
  });

  it('AI5-01 · stores a digest as an ai_finding (daily_brief) keyed by date + provider; no digest table exists', async () => {
    const r = await submit(digest('2026-09-28', { runId: 'fixed-run-1' }));
    expect(r).toMatchObject({ success: true, counts: { findingsCreated: 1 } });
    const row = (await admin.from('ai_findings').select('kind, provider, dedupe_key, payload, workspace_id, user_id').eq('run_id', r.runId!).single()).data!;
    expect(row).toMatchObject({ kind: 'daily_brief', provider: 'claude', dedupe_key: 'daily_brief:2026-09-28:claude', workspace_id: ws, user_id: carol.userId });
    expect((row.payload as { version: string }).version).toBe('1.0');
    const tables = await admin.from('ai_daily_digests').select('id').limit(1);
    expect(tables.error).not.toBeNull(); // no separate digest table
    record('ai5-01-model', { kind: 'daily_brief', dedupe: 'date+provider', separateTable: false });
  });

  it('AI5-02 · scheduled retry is idempotent: same run id is a no-op; a later same-day run refreshes the one row (no duplicate)', async () => {
    const first = await submit(digest('2026-09-29', { runId: 'sched-2026-09-29', title: 'v1' }));
    const retry = await submit(digest('2026-09-29', { runId: 'sched-2026-09-29', title: 'v1' }));
    expect(retry.duplicateRun).toBe(true);
    expect(retry.runId).toBe(first.runId);
    const refreshed = await submit(digest('2026-09-29', { runId: uniq('later'), title: 'v2 refreshed', payload: payload('2026-09-29', { priorities: [{ title: 'Updated' }] }) }));
    expect(refreshed.counts.findingsUpdated).toBe(1);
    const rows = (await admin.from('ai_findings').select('title').eq('workspace_id', ws).eq('dedupe_key', 'daily_brief:2026-09-29:claude')).data!;
    expect(rows).toEqual([{ title: 'v2 refreshed' }]);
  });

  it('AI5-03 · different providers on the same day keep separate rows and provenance', async () => {
    await submit(digest('2026-09-30', { provider: 'claude' }));
    await submit(digest('2026-09-30', { provider: 'chatgpt', title: 'ChatGPT digest' }));
    await submit(digest('2026-09-30', { provider: 'system', title: 'JobQuest digest' }));
    const day = await list(carol, { dateFrom: '2026-09-30', dateTo: '2026-09-30' });
    expect(day.items.map((d) => d.provider).sort()).toEqual(['chatgpt', 'claude', 'system']);
    expect(new Set(day.items.map((d) => d.digestDate))).toEqual(new Set(['2026-09-30']));
    const only = await list(carol, { dateFrom: '2026-09-30', dateTo: '2026-09-30', provider: 'chatgpt' });
    expect(only.items).toHaveLength(1);
    expect(only.items[0]).toMatchObject({ provider: 'chatgpt', title: 'ChatGPT digest' });
  });

  it('AI5-04 · date filters are inclusive calendar ranges, ordered newest first, stable across pages and month boundaries', async () => {
    for (const d of ['2026-10-31', '2026-11-01', '2026-11-02']) await submit(digest(d));
    const all = await list(carol, { dateFrom: '2026-10-31', dateTo: '2026-11-02' });
    expect(all.items.map((d) => d.digestDate)).toEqual(['2026-11-02', '2026-11-01', '2026-10-31']);
    expect((await list(carol, { dateFrom: '2026-11-01', dateTo: '2026-11-01' })).items.map((d) => d.digestDate)).toEqual(['2026-11-01']);
    expect((await list(carol, { dateTo: '2026-10-31' })).items.every((d) => d.digestDate <= '2026-10-31')).toBe(true);
    const p0 = await list(carol, { dateFrom: '2026-10-31', dateTo: '2026-11-02' }, { pageSize: 2, page: 0 });
    const p1 = await list(carol, { dateFrom: '2026-10-31', dateTo: '2026-11-02' }, { pageSize: 2, page: 1 });
    expect(p0.hasNext).toBe(true);
    expect([...p0.items, ...p1.items].map((d) => d.digestDate)).toEqual(['2026-11-02', '2026-11-01', '2026-10-31']);
    expect(p1.hasNext).toBe(false);
  });

  it('AI5-05 · a stored digest is a snapshot: later application changes never alter it', async () => {
    const before = (await list(carol, { dateFrom: '2026-09-28', dateTo: '2026-09-28' })).items[0]!;
    for (let i = 0; i < 3; i++) {
      expect((await admin.from('applications').insert({ workspace_id: ws, user_id: carol.userId!, company_name: `Snap${i}`, role_title: 'Engineer' })).error).toBeNull();
    }
    const after = (await list(carol, { dateFrom: '2026-09-28', dateTo: '2026-09-28' })).items[0]!;
    expect(after.payload).toEqual(before.payload);
    expect(after.id).toBe(before.id);
    const single = await read.getAiDigest(as(carol), before.id, { env: ON });
    expect(single).toMatchObject({ ok: true, data: { digestDate: '2026-09-28', payload: before.payload } });
  });

  it('AI5-06 · RLS: owner and the ACTIVE manager read digests; a peer and another workspace see nothing', async () => {
    const mgr = await list(alice, { dateFrom: '2026-09-28', dateTo: '2026-09-28' });
    expect(mgr.items.map((d) => d.ownerId)).toEqual([carol.userId]);
    expect((await list(eve, { dateFrom: '2026-09-28', dateTo: '2026-09-28' })).items).toEqual([]);
    expect((await list(dave, {}, {}, ws)).items).toEqual([]); // naming someone else's workspace is not authority
    expect((await list(carol, {}, {}, daveWs)).items).toEqual([]);
    const id = (await list(carol, { dateFrom: '2026-09-28', dateTo: '2026-09-28' })).items[0]!.id;
    expect(await read.getAiDigest(as(eve), id, { env: ON })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(await read.getAiDigest(as(dave, ws), id, { env: ON })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(await read.getAiDigest(as(alice), id, { env: ON })).toMatchObject({ ok: true });
    record('ai5-06-rls', { owner: 'read', manager: 'read', peer: 'none', crossWorkspace: 'none' });
  });

  it('AI5-07 · clients cannot write digests directly (no insert/update grants)', async () => {
    const ins = await carol.db().from('ai_findings').insert({ workspace_id: ws, user_id: carol.userId!, kind: 'daily_brief', provider: 'claude', title: 'forged', dedupe_key: 'daily_brief:2026-01-01:claude', run_id: null });
    expect(ins.error).not.toBeNull();
  });

  it('AI5-08 · JobQuest-generated digest: owner-scoped facts, provider system, idempotent, owner time zone', async () => {
    for (const co of ['GenA', 'GenB']) {
      expect((await admin.from('applications').insert({ workspace_id: ws, user_id: carol.userId!, company_name: co, role_title: 'Engineer', next_action: 'Follow up', next_action_date: '2000-01-01' })).error).toBeNull();
    }
    // A peer's application must never leak into carol's digest.
    expect((await admin.from('applications').insert({ workspace_id: ws, user_id: eve.userId!, company_name: 'EveOnly', role_title: 'Engineer', next_action_date: '2000-01-01' })).error).toBeNull();

    const gen = () => digestSvc.generateSystemDigest({ workspaceId: ws, userId: carol.userId!, accessToken: carol.token! }, { env: ON, ingest: quiet });
    const one = await gen();
    expect(one.ok).toBe(true);
    if (!one.ok) return;
    expect(one.data.ingest.success).toBe(true);
    const two = await gen();
    expect(two.ok && two.data.ingest.duplicateRun).toBe(true); // same date -> same run id -> no duplicate
    const rows = (await admin.from('ai_findings').select('provider, dedupe_key, payload').eq('workspace_id', ws).eq('user_id', carol.userId!).eq('provider', 'system').eq('dedupe_key', `daily_brief:${one.data.digestDate}:system`)).data!;
    expect(rows).toHaveLength(1);
    const p = rows[0]!.payload as { summary: Record<string, number>; sections: Record<string, { status: string; items: { title: string }[]; }> & Record<'job_leads' | 'email_activity' | 'follow_ups', { status: string; items: { title: string }[] }> };
    expect(p.summary.applications_added).toBeGreaterThanOrEqual(5); // GenA, GenB + 3 Snap* (carol only; Eve excluded)
    expect(p.summary.follow_ups).toBe(2);
    expect(JSON.stringify(p)).not.toContain('EveOnly');
    expect(p.sections.job_leads.status).toBe('not_configured');
    expect(p.sections.email_activity.status).toBe('not_configured');
    expect(p.sections.follow_ups.items.map((i) => i.title).sort()).toEqual(['GenA — Engineer', 'GenB — Engineer']);
    const runRow = (await admin.from('ai_runs').select('provider, workflow, external_run_id').eq('id', one.data.ingest.runId!).single()).data!;
    expect(runRow).toMatchObject({ provider: 'system', workflow: 'daily_brief' });

    // Owner time zone: the same instant is a different digest date for a UTC+14 profile.
    expect((await admin.from('profiles').update({ timezone: 'Pacific/Kiritimati' }).eq('user_id', carol.userId!)).error).toBeNull();
    const fixed = await digestSvc.generateSystemDigest({ workspaceId: ws, userId: carol.userId!, accessToken: carol.token! }, { env: ON, ingest: quiet, now: () => new Date('2026-10-11T12:00:00Z') });
    expect(fixed.ok && fixed.data).toMatchObject({ digestDate: '2026-10-12', timeZone: 'Pacific/Kiritimati' });
    record('ai5-08-system-digest', { provider: 'system', idempotent: true, ownerScoped: true, timeZone: 'owner profile' });
  });

  it('AI5-09 · kill switch off: reads and generation fail closed', async () => {
    expect(await read.listAiDigests(as(carol), {}, {}, { env: {} })).toMatchObject({ ok: false, error: { code: 'AI_HUB_DISABLED' } });
    expect(await digestSvc.buildDeterministicDigest({ workspaceId: ws, userId: carol.userId!, accessToken: carol.token! }, '2026-10-11', { env: {} })).toMatchObject({ ok: false, error: { code: 'AI_HUB_DISABLED' } });
  });
});
