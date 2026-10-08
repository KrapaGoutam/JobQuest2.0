import { beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, loadEnv, makeRecorder, serviceDb } from './harness';

// AI-2B: the read service and the server-side audit scope filter against a REAL
// database and the real RLS policies. Local stack only (writes seed rows).
const ready = loadEnv();
const local = /^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.SUPABASE_URL ?? '');
const record = makeRecorder('test-results/evidence', 'integration');
const ON = { AI_HUB_ENABLED: 'true' };
const CANARY = 'SECRET-ERROR-DETAIL-CANARY';

describe.skipIf(!ready || !local)('AI-2B — AI read service (RLS) and audit scope filter (real DB)', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();
  const alice = new Actor(); // workspace manager
  const carol = new Actor(); // member, owner of the AI rows
  const eve = new Actor(); // member, peer
  const dave = new Actor(); // unrelated workspace
  let ws: string;
  let daveWs: string;
  let svc: typeof import('../../apps/api/src/services/aiReadService');
  let ingest: typeof import('../../apps/api/src/services/aiIntegrationService').ingestAiResult;
  let n = 0;
  const uniq = (p: string) => `${p}-${run}-${++n}`;
  const as = (a: Actor, workspaceId = ws) => ({ workspaceId, accessToken: a.token! }); // default path: real userClient under RLS
  const finding = (sid: string, over: Record<string, unknown> = {}) => ({
    kind: 'email_event', dedupe: { source_type: 'gmail', source_id: sid, event: 'interview' }, priority: 'HIGH', title: `Finding ${sid}`,
    summary: 'Sanitized summary.', payload: { company: 'Acme' }, ...over,
  });
  const envelope = (over: Record<string, unknown> = {}) => ({
    contract: 'jobquest.ai-result', schema_version: '1.0', provider: 'claude', workflow: 'email_triage',
    run: { external_run_id: uniq('ext'), generated_at: '2026-10-01T12:00:00Z' }, sources: [], findings: [], suggestions: [], metadata: {}, ...over,
  });
  const seed = async (over: Record<string, unknown> = {}) => {
    const r = await ingest({ workspaceId: ws, userId: carol.userId!, actorKind: 'SERVICE_INGEST' }, envelope(over), { env: ON, log: () => undefined });
    expect(r.runId, JSON.stringify(r.errors)).not.toBeNull();
    return r;
  };
  const ids: { run: string; partialRun: string; finding: string; suggestion: string } = { run: '', partialRun: '', finding: '', suggestion: '' };

  beforeAll(async () => {
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache(); resetSigningMaterial(); resetAdminClient();
    svc = await import('../../apps/api/src/services/aiReadService');
    ({ ingestAiResult: ingest } = await import('../../apps/api/src/services/aiIntegrationService'));
    for (const [a, name] of [[alice, 'alice'], [carol, 'carol'], [eve, 'eve'], [dave, 'dave']] as const) {
      expect((await a.call('/auth/register', { username: `ai2b_${name}_${run}`, password: `Valid-AI2B-${name}-${run}!` })).status).toBe(201);
    }
    const prof = async (a: Actor) => (await admin.from('profiles').select('last_active_workspace_id').eq('user_id', a.userId!).single()).data!.last_active_workspace_id as string;
    ws = await prof(alice);
    daveWs = await prof(dave);
    expect((await admin.from('workspace_members').insert([
      { workspace_id: ws, user_id: carol.userId!, role: 'USER', status: 'ACTIVE' },
      { workspace_id: ws, user_id: eve.userId!, role: 'USER', status: 'ACTIVE' },
    ])).error).toBeNull();
    // Re-login not needed: RLS evaluates membership per query, not from the token.
    // A genuine non-AI audit event, created BEFORE the AI rows so newer AI events can crowd it out.
    const upd = await alice.db().rpc('rpc_update_workspace', { p_workspace_id: ws, p_name: `AI2B Workspace ${run}`, p_color: 'oklch(0.52 0.13 265)', p_description: 'AI-2B audit scope fixture' });
    expect(upd.error).toBeNull();

    // Seed through the AI-2A service (also exercises it): 5 successful claude runs, one gemini daily_brief, one PARTIAL.
    const first = await seed({ findings: [finding(uniq('s'), { priority: 'LOW' })], suggestions: [{ finding_index: 0, action: 'create_task', proposed: { title: 'Follow up' } }] });
    ids.run = first.runId!;
    for (let i = 0; i < 4; i++) await seed({ findings: [finding(uniq('s'))] });
    await seed({ provider: 'gemini', workflow: 'daily_brief', findings: [{ kind: 'daily_brief', dedupe: { date: `2026-10-0${1 + (n % 8)}` }, title: 'Daily brief', priority: 'INFO', payload: { date: '2026-10-01' } }] });
    const partial = await seed({ findings: [finding(uniq('s')), { kind: 'email_event', title: '', dedupe: {} }] });
    ids.partialRun = partial.runId!;
    expect(partial.status).toBe('PARTIAL');
    await admin.from('ai_runs').update({ error_detail: CANARY }).eq('id', ids.partialRun); // simulate unsafe free text
    ids.finding = (await admin.from('ai_findings').select('id').eq('run_id', ids.run).single()).data!.id;
    ids.suggestion = (await admin.from('ai_suggestions').select('id').eq('finding_id', ids.finding).single()).data!.id;
  });

  // ------------------------------------------------------------------ runs
  it('AI2B-01 · owner lists own runs (real userClient under RLS); filters, ordering and pagination are deterministic', async () => {
    const all = await svc.listAiRuns(as(carol), {}, { pageSize: 50 }, { env: ON });
    expect(all.ok).toBe(true);
    const items = all.ok ? all.data.items : [];
    expect(items.length).toBe(7);
    const sorted = [...items].sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1));
    expect(items.map((r) => r.id)).toEqual(sorted.map((r) => r.id)); // newest first, id tiebreak

    const byStatus = await svc.listAiRuns(as(carol), { status: 'PARTIAL' }, {}, { env: ON });
    expect(byStatus.ok && byStatus.data.items.map((r) => r.id)).toEqual([ids.partialRun]);
    const byProvider = await svc.listAiRuns(as(carol), { provider: 'gemini' }, {}, { env: ON });
    expect(byProvider.ok && byProvider.data.items).toHaveLength(1);
    const byWorkflow = await svc.listAiRuns(as(carol), { workflow: 'daily_brief' }, {}, { env: ON });
    expect(byWorkflow.ok && byWorkflow.data.items).toHaveLength(1);

    // Pages of 3 reassemble the full list with no overlap or gap.
    const seen: string[] = [];
    for (let page = 0; page < 5; page++) {
      const p = await svc.listAiRuns(as(carol), {}, { page, pageSize: 3 }, { env: ON });
      if (!p.ok) throw new Error('page failed');
      expect(p.data.items.length).toBeLessThanOrEqual(3);
      seen.push(...p.data.items.map((r) => r.id));
      expect(p.data.hasNext).toBe(page < 2);
      if (!p.data.hasNext) break;
    }
    expect(seen).toEqual(items.map((r) => r.id));

    expect(await svc.listAiRuns(as(carol), {}, { pageSize: 51 }, { env: ON })).toMatchObject({ ok: false, error: { code: 'INVALID_FILTER' } });
    record('ai2b-01-runs', { runs: items.length, pagesOf3: 3 });
  });

  it('AI2B-02 · run detail: one run + bounded findings, normalized error category only, missing run is NOT_FOUND', async () => {
    const d = await svc.getAiRun(as(carol), ids.partialRun, { env: ON });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.data.run).toMatchObject({ id: ids.partialRun, status: 'PARTIAL', errorCategory: 'SCHEMA_INVALID', ownerId: carol.userId, provider: 'claude' });
    expect(d.data.findings).toHaveLength(1);
    expect(JSON.stringify(d)).not.toContain(CANARY); // free-text error_detail never leaves the DB
    expect(JSON.stringify(d)).not.toMatch(/error_detail|workspace_id|content_hash|dedupe_key/);
    expect(await svc.getAiRun(as(carol), '00000000-0000-4000-8000-000000000000', { env: ON })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('AI2B-03 · RLS: manager sees members\' rows; peer and other-workspace users see nothing; workspaceId is not authority', async () => {
    const mgr = await svc.listAiRuns(as(alice), {}, { pageSize: 50 }, { env: ON });
    expect(mgr.ok && mgr.data.items.length).toBe(7); // ACTIVE manager visibility (AI-1B)
    const peer = await svc.listAiRuns(as(eve), {}, { pageSize: 50 }, { env: ON });
    expect(peer.ok && peer.data.items).toEqual([]);
    expect(await svc.getAiRun(as(eve), ids.run, { env: ON })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(await svc.getAiFinding(as(eve), ids.finding, { env: ON })).toMatchObject({ error: { code: 'NOT_FOUND' } });
    // Cross-workspace: dave naming carol's workspace gets nothing; carol naming dave's workspace gets nothing.
    const cross = await svc.listAiRuns(as(dave, ws), {}, { pageSize: 50 }, { env: ON });
    expect(cross.ok && cross.data.items).toEqual([]);
    expect(await svc.getAiRun(as(dave, ws), ids.run, { env: ON })).toMatchObject({ error: { code: 'NOT_FOUND' } });
    const other = await svc.listAiRuns(as(carol, daveWs), {}, {}, { env: ON });
    expect(other.ok && other.data.items).toEqual([]);
    // A manager naming the wrong workspace id narrows to nothing as well.
    expect((await svc.listAiRuns(as(alice, daveWs), {}, {}, { env: ON }))).toMatchObject({ ok: true, data: { items: [] } });
    // Unauthenticated token: no data.
    const bad = await svc.listAiRuns({ workspaceId: ws, accessToken: 'x'.repeat(40) }, {}, {}, { env: ON });
    expect(bad.ok ? bad.data.items : []).toEqual([]);
  });

  // -------------------------------------------------------------- findings
  it('AI2B-04 · findings: list, detail, status/kind/priority/run filters; safe payload shape', async () => {
    const all = await svc.listAiFindings(as(carol), {}, { pageSize: 50 }, { env: ON });
    expect(all.ok && all.data.items.length).toBe(7); // 1 + 4 + 1 (gemini brief) + 1 (partial run)
    expect(await svc.listAiFindings(as(carol), { runId: ids.run }, {}, { env: ON })).toMatchObject({ ok: true, data: { items: [expect.objectContaining({ id: ids.finding })] } });
    const low = await svc.listAiFindings(as(carol), { priority: 'LOW' }, {}, { env: ON });
    expect(low.ok && low.data.items.map((f) => f.id)).toEqual([ids.finding]);
    expect((await svc.listAiFindings(as(carol), { kind: 'daily_brief' }, {}, { env: ON }))).toMatchObject({ ok: true, data: { items: [expect.objectContaining({ provider: 'gemini' })] } });
    const none = await svc.listAiFindings(as(carol), { status: 'DISMISSED' }, {}, { env: ON });
    expect(none.ok && none.data.items).toEqual([]);

    const d = await svc.getAiFinding(as(carol), ids.finding, { env: ON });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.data).toMatchObject({ id: ids.finding, runId: ids.run, status: 'NEW', priority: 'LOW', applicationId: null, payload: { company: 'Acme' } });
    expect(Object.keys(d.data).sort()).toEqual(['applicationId', 'category', 'confidence', 'createdAt', 'dueAt', 'evidence', 'id', 'kind', 'occurredAt', 'ownerId', 'payload', 'priority', 'provider', 'runId', 'sourceRef', 'status', 'summary', 'title']);
    expect(await svc.getAiFinding(as(carol), '00000000-0000-4000-8000-000000000000', { env: ON })).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  // ----------------------------------------------------------- suggestions
  it('AI2B-05 · suggestions: list, detail, pending count, isolation; the service has no mutation path', async () => {
    const list = await svc.listAiSuggestions(as(carol), { status: 'PENDING' }, {}, { env: ON });
    expect(list.ok && list.data.items).toEqual([expect.objectContaining({ id: ids.suggestion, findingId: ids.finding, action: 'create_task', status: 'PENDING', proposed: { title: 'Follow up' } })]);
    expect(await svc.countPendingAiSuggestions(as(carol), { env: ON })).toEqual({ ok: true, data: { pending: 1 } });
    expect(await svc.countPendingAiSuggestions(as(eve), { env: ON })).toEqual({ ok: true, data: { pending: 0 } });
    expect(await svc.countPendingAiSuggestions(as(dave, ws), { env: ON })).toEqual({ ok: true, data: { pending: 0 } });
    expect((await svc.getAiSuggestion(as(carol), ids.suggestion, { env: ON })).ok).toBe(true);
    expect(await svc.getAiSuggestion(as(eve), ids.suggestion, { env: ON })).toMatchObject({ error: { code: 'NOT_FOUND' } });
    // Reads changed nothing.
    expect((await admin.from('ai_suggestions').select('status').eq('id', ids.suggestion).single()).data!.status).toBe('PENDING');
  });

  // ------------------------------------------------------------ kill switch
  it('AI2B-06 · AI_HUB_ENABLED=false fails closed without affecting core APIs', async () => {
    expect(await svc.listAiRuns(as(carol), {}, {}, { env: {} })).toMatchObject({ ok: false, error: { code: 'AI_HUB_DISABLED' } });
    expect(await svc.getAiRun(as(carol), ids.run, { env: { AI_HUB_ENABLED: 'false' } })).toMatchObject({ error: { code: 'AI_HUB_DISABLED' } });
    expect((await carol.call('/health', undefined, { method: 'GET' })).status).toBe(200);
  });

  // ------------------------------------------------------------ audit scope
  it('AI2B-07 · audit scope filters BEFORE the limit; ordering and bounds hold', async () => {
    const rpc = (a: Actor, args: Record<string, unknown>) => a.db().rpc('rpc_list_workspace_audit_events', { p_workspace_id: ws, ...args });
    const isAi = (r: { action: string }) => r.action.startsWith('AI_');
    const ai = await rpc(alice, { p_limit: 3, p_scope: 'AI' });
    expect(ai.error).toBeNull();
    expect(ai.data).toHaveLength(3);
    expect((ai.data as { action: string }[]).every(isAi)).toBe(true);

    // The workspace's own (older) membership/security events must still be reachable although
    // far more than 3 newer AI events exist: this is the crowding fix.
    const other = await rpc(alice, { p_limit: 3, p_scope: 'OTHER' });
    expect(other.error).toBeNull();
    const otherRows = other.data as { action: string }[];
    expect(otherRows.length).toBeGreaterThan(0);
    expect(otherRows.some((r) => r.action === 'workspace.updated')).toBe(true);
    expect(otherRows.some(isAi)).toBe(false);

    // Old behaviour for comparison: ALL with limit 3 is entirely AI, crowding the history out.
    const all = await rpc(alice, { p_limit: 3 });
    expect((all.data as { action: string }[]).every(isAi)).toBe(true);
    const allDefault = await rpc(alice, { p_limit: 500, p_scope: 'ALL' });
    const rows = allDefault.data as { action: string; created_at: string }[];
    expect(rows.some(isAi) && rows.some((r) => !isAi(r))).toBe(true);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1]!.created_at >= rows[i]!.created_at).toBe(true); // newest first
    const capped = await rpc(alice, { p_limit: 100000 });
    expect((capped.data as unknown[]).length).toBeLessThanOrEqual(500);

    // Authorization is unchanged: only ACTIVE managers; scope never widens access.
    for (const a of [carol, eve]) for (const scope of ['ALL', 'AI', 'OTHER']) expect((await rpc(a, { p_scope: scope })).error?.code).toBe('42501');
    expect((await dave.db().rpc('rpc_list_workspace_audit_events', { p_workspace_id: ws, p_scope: 'AI' })).error?.code).toBe('42501');
    expect((await rpc(alice, { p_scope: 'EVERYTHING' })).error?.code).toBe('22023');
    expect((await alice.db().rpc('rpc_list_workspace_audit_events', { p_workspace_id: daveWs })).error?.code).toBe('42501');
    // The two-argument call used by older clients still resolves.
    expect((await rpc(alice, { p_limit: 5 })).error).toBeNull();
    record('ai2b-07-audit', { aiScope: 'filtered-before-limit', otherScope: 'filtered-before-limit', authz: 'manager-only' });
  });
});
