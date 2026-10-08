import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Actor, loadEnv, makeRecorder, serviceDb } from './harness';
import { untrustedScope } from '../unit/fixtures/ai-contract/fixtures';

// AI-2A: the internal integration service against a REAL database (the AI-1A/1B
// schema and RPCs). Writes test rows, so it only ever runs against a LOCAL stack.
const ready = loadEnv();
const local = /^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.SUPABASE_URL ?? '');
const record = makeRecorder('test-results/evidence', 'integration');
const CANARY = 'SECRET-EMAIL-BODY-CANARY';
const ON = { AI_HUB_ENABLED: 'true' };

describe.skipIf(!ready || !local)('AI-2A — internal AI integration service (real DB)', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();
  const alice = new Actor();
  const bob = new Actor();
  let ws: string;
  let bobWs: string;
  let aliceApp: string;
  let bobApp: string;
  let ingest: typeof import('../../apps/api/src/services/aiIntegrationService').ingestAiResult;
  let n = 0;
  const logs: Record<string, unknown>[] = [];
  const log = (e: Record<string, unknown>) => logs.push(e);
  const uniq = (p: string) => `${p}-${run}-${++n}`;
  const ctxFor = (userId: string, workspaceId: string, extra: object = {}) => ({ workspaceId, userId, actorKind: 'SERVICE_INGEST' as const, ...extra });
  const aliceCtx = (extra: object = {}) => ctxFor(alice.userId!, ws, extra);

  const finding = (sid: string, over: Record<string, unknown> = {}) => ({
    kind: 'email_event', dedupe: { source_type: 'gmail', source_id: sid, event: 'interview' },
    category: 'INTERVIEW', priority: 'HIGH', confidence: 0.9, title: 'Interview invite', summary: CANARY, evidence: CANARY,
    occurred_at: '2026-10-01T10:00:00Z', source: { thread_id: `thr-${sid}`, url: `https://mail.example.com/t/${sid}?utm_source=x` },
    match: { hints: { company: 'Acme' } }, payload: { company: 'Acme', next_step: CANARY }, ...over,
  });
  const envelope = (over: Record<string, unknown> = {}) => ({
    contract: 'jobquest.ai-result', schema_version: '1.0', provider: 'claude', workflow: 'email_triage',
    run: { external_run_id: uniq('ext'), generated_at: '2026-10-01T12:00:00Z', model_hint: 'fixture' },
    sources: [{ type: 'gmail', ref: 'msg-fixture', observed_at: '2026-10-01T11:59:00Z' }],
    findings: [], suggestions: [], metadata: {}, ...over,
  });
  const go = (input: unknown, ctx = aliceCtx(), deps: object = {}) => ingest(ctx, input, { env: ON, log, ...deps });

  const audit = async (id: string) => (await admin.from('audit_events').select('action, metadata').eq('target_entity_id', id)).data ?? [];
  const runRow = async (id: string) => (await admin.from('ai_runs').select('*').eq('id', id).single()).data!;
  const findingsOf = async (dedupe: string) => (await admin.from('ai_findings').select('*').eq('dedupe_key', dedupe)).data ?? [];
  const runsByExternal = async (ext: string) => (await admin.from('ai_runs').select('id').eq('external_run_id', ext)).data ?? [];
  const appStatus = async (id: string) => (await admin.from('applications').select('status, outcome, updated_at').eq('id', id).single()).data;
  const countRows = async (t: string, col: string, v: string) => (await admin.from(t).select('id', { count: 'exact', head: true }).eq(col, v)).count ?? 0;

  beforeAll(async () => {
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache(); resetSigningMaterial(); resetAdminClient();
    ({ ingestAiResult: ingest } = await import('../../apps/api/src/services/aiIntegrationService'));
    for (const [a, name] of [[alice, 'alice'], [bob, 'bob']] as const) {
      expect((await a.call('/auth/register', { username: `ai2a_${name}_${run}`, password: `Valid-AI2A-${name}-${run}!` })).status).toBe(201);
    }
    const prof = async (a: Actor) => (await admin.from('profiles').select('last_active_workspace_id').eq('user_id', a.userId!).single()).data!.last_active_workspace_id as string;
    ws = await prof(alice);
    bobWs = await prof(bob);
    aliceApp = (await admin.from('applications').insert({ workspace_id: ws, user_id: alice.userId!, company_name: 'Acme', role_title: 'Engineer' }).select('id').single()).data!.id;
    bobApp = (await admin.from('applications').insert({ workspace_id: bobWs, user_id: bob.userId!, company_name: 'Other', role_title: 'Engineer' }).select('id').single()).data!.id;
  });

  it('AI2A-01 · kill switch OFF and invalid envelope write nothing (no run, finding, suggestion or audit)', async () => {
    const ext = uniq('off');
    const doc = envelope({ run: { external_run_id: ext, generated_at: '2026-10-01T12:00:00Z' }, findings: [finding(uniq('s'))] });
    const off = await go(doc, aliceCtx(), { env: {} });
    expect(off.errors.map((e) => e.code)).toEqual(['AI_HUB_DISABLED']);
    const bad = await go({ ...doc, schema_version: '9.9' });
    expect(bad.errors.map((e) => e.code)).toEqual(['INVALID_AI_RESULT']);
    expect(await runsByExternal(ext)).toHaveLength(0);
    expect((await admin.from('audit_events').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).like('action', 'AI_%')).count).toBe(0);
    record('ai2a-01-no-write', { killSwitchWrites: 0, invalidEnvelopeWrites: 0 });
  });

  it('AI2A-02 · full run persists via RPCs: SUCCEEDED, counts, provenance, one audit row per mutation, no core mutation', async () => {
    const sid = uniq('s');
    const ext = uniq('full');
    const before = await appStatus(aliceApp);
    const tasksBefore = await countRows('tasks', 'workspace_id', ws);
    const doc = envelope({
      run: { external_run_id: ext, generated_at: '2026-10-01T12:00:00Z' },
      findings: [finding(sid, { match: { application_id: aliceApp, hints: { company: 'Acme' } } })],
      suggestions: [{ finding_index: 0, action: 'set_status', target: { type: 'application', id: aliceApp }, proposed: { status: 'INTERVIEW' }, confidence: 0.9 }],
    });
    const r = await go(doc);
    expect(r).toMatchObject({ success: true, status: 'SUCCEEDED', finalized: true, duplicateRun: false, errors: [] });
    expect(r.counts).toMatchObject({ findingsCreated: 1, suggestionsCreated: 1, rejectedItems: 0 });
    expect(r.warnings.some((w) => w.code === 'untrusted_scope_field')).toBe(true); // provider application_id stripped

    const row = await runRow(r.runId!);
    expect(row).toMatchObject({ status: 'SUCCEEDED', provider: 'claude', workflow: 'email_triage', external_run_id: ext, user_id: alice.userId, workspace_id: ws, trigger_type: 'manual', schema_version: '1.0' });
    expect(row.completed_at).not.toBeNull();
    expect(row.counts).toMatchObject({ findings_created: 1, suggestions_created: 1, rejected_items: 0 });
    expect(row.sources).toEqual([{ type: 'gmail', ref: 'msg-fixture', observed_at: '2026-10-01T11:59:00.000Z' }]);

    const [f] = await admin.from('ai_findings').select('*').eq('run_id', r.runId!).then((x) => x.data!);
    expect(f).toMatchObject({ provider: 'claude', status: 'NEW', user_id: alice.userId, workspace_id: ws });
    expect(f!.application_id).toBeNull(); // application ids are never taken from the provider
    expect(f!.content_hash).toMatch(/^[0-9a-f]{64}$/); // DB-owned
    expect(f!.source_ref).toMatchObject({ type: 'gmail', provider_message_id: sid, thread_id: `thr-${sid}`, canonical_url: `https://mail.example.com/t/${sid}` });
    const sug = (await admin.from('ai_suggestions').select('*').eq('finding_id', f!.id)).data!;
    expect(sug).toHaveLength(1);
    expect(sug[0]).toMatchObject({ status: 'PENDING', action: 'set_status', target_type: 'application', target_id: aliceApp, proposed: { status: 'INTERVIEW' } });

    // Audit: exactly the RPC rows, once each (the service writes none of its own).
    expect((await audit(r.runId!)).map((a) => a.action).sort()).toEqual(['AI_RUN_CREATED', 'AI_RUN_STATUS_CHANGED']);
    expect((await audit(f!.id)).map((a) => a.action)).toEqual(['AI_FINDING_CREATED']);
    expect((await audit(sug[0]!.id)).map((a) => a.action)).toEqual(['AI_SUGGESTION_CREATED']);

    // Suggestions are proposals only: nothing in core changed.
    expect(await appStatus(aliceApp)).toEqual(before);
    expect(await countRows('tasks', 'workspace_id', ws)).toBe(tasksBefore);
    record('ai2a-02-full-run', { status: row.status, audits: 4, coreMutated: false });
  });

  it('AI2A-03 · submitting the exact same result twice is idempotent (no duplicate run, finding, suggestion or audit)', async () => {
    const sid = uniq('s');
    const doc = envelope({
      findings: [finding(sid)],
      suggestions: [{ finding_index: 0, action: 'create_task', target: null, proposed: { title: 'Prepare' } }],
    });
    const first = await go(doc);
    const auditBefore = (await audit(first.runId!)).length;
    const second = await go(doc);
    expect(second).toMatchObject({ success: true, duplicateRun: true, runId: first.runId, status: 'SUCCEEDED' });
    expect(second.counts.findingsCreated).toBe(0);
    expect(await runsByExternal(doc.run.external_run_id)).toHaveLength(1);
    const f = await admin.from('ai_findings').select('id').eq('run_id', first.runId!).then((x) => x.data!);
    expect(f).toHaveLength(1);
    expect(await countRows('ai_suggestions', 'finding_id', f[0]!.id)).toBe(1);
    expect((await audit(first.runId!)).length).toBe(auditBefore);
    expect((await audit(f[0]!.id)).length).toBe(1);
    record('ai2a-03-idempotent', { runs: 1, findings: 1, suggestions: 1 });
  });

  it('AI2A-04 · an interrupted RUNNING run is resumed (not duplicated) and finalized', async () => {
    const ext = uniq('resume');
    const sid = uniq('s');
    const open = await admin.rpc('rpc_ai_ingest_run', { p_actor_id: alice.userId!, p_workspace_id: ws, p_provider: 'claude', p_workflow: 'email_triage', p_external_run_id: ext });
    expect(open.data.created).toBe(true);
    const r = await go(envelope({ run: { external_run_id: ext, generated_at: '2026-10-01T12:00:00Z' }, findings: [finding(sid)] }));
    expect(r).toMatchObject({ success: true, duplicateRun: true, runId: open.data.run_id, status: 'SUCCEEDED' });
    expect(r.counts.findingsCreated).toBe(1);
    expect((await runRow(r.runId!)).status).toBe('SUCCEEDED');
    expect((await audit(r.runId!)).map((a) => a.action).sort()).toEqual(['AI_RUN_CREATED', 'AI_RUN_STATUS_CHANGED']);
  });

  it('AI2A-05 · cross-provider dedupe, changed content updates in place, closed findings are never resurrected', async () => {
    const sid = uniq('s');
    const first = await go(envelope({ findings: [finding(sid)] }));
    const [orig] = await admin.from('ai_findings').select('id, dedupe_key, provider').eq('run_id', first.runId!).then((x) => x.data!);
    expect(orig!.provider).toBe('claude');

    const gem = await go(envelope({ provider: 'gemini', findings: [finding(sid, { title: 'Interview invite' })] }));
    expect(gem.counts).toMatchObject({ findingsDuplicate: 1, findingsCreated: 0 });
    expect(await findingsOf(orig!.dedupe_key)).toHaveLength(1);
    expect((await findingsOf(orig!.dedupe_key))[0]!.payload.seen_by).toEqual(['gemini']);

    const upd = await go(envelope({ findings: [finding(sid, { due_at: '2026-10-06T09:00:00Z' })] }));
    expect(upd.counts).toMatchObject({ findingsUpdated: 1 });
    expect((await audit(orig!.id)).map((a) => a.action).sort()).toEqual(['AI_FINDING_CREATED', 'AI_FINDING_UPDATED']);

    expect((await alice.db().rpc('rpc_ai_dismiss_finding', { p_finding_id: orig!.id })).error).toBeNull();
    const closed = await go(envelope({
      findings: [finding(sid, { due_at: '2026-10-09T09:00:00Z' })],
      suggestions: [{ finding_index: 0, action: 'create_task', proposed: { title: 'x' } }],
    }));
    expect(closed).toMatchObject({ status: 'SUCCEEDED', counts: { findingsClosed: 1, suggestionsSkipped: 1, suggestionsFailed: 0, suggestionsCreated: 0 } });
    expect((await findingsOf(orig!.dedupe_key))[0]).toMatchObject({ status: 'DISMISSED' });
    record('ai2a-05-dedupe', { crossProvider: 'duplicate', changed: 'updated', closed: 'unchanged_closed' });
  });

  it('AI2A-06 · provider cannot choose workspace or user; trusted context decides ownership', async () => {
    const doc = JSON.parse(JSON.stringify(untrustedScope));
    doc.provider = 'claude';
    doc.run.external_run_id = uniq('scope');
    doc.findings[0].dedupe.source_id = uniq('s');
    doc.workspace_id = bobWs;
    doc.user_id = bob.userId;
    const r = await go(doc);
    expect(r.success).toBe(true);
    const row = await runRow(r.runId!);
    expect(row).toMatchObject({ user_id: alice.userId, workspace_id: ws });
    const f = (await admin.from('ai_findings').select('user_id, workspace_id').eq('run_id', r.runId!)).data!;
    expect(f).toEqual([{ user_id: alice.userId, workspace_id: ws }]);
    expect(await countRows('ai_runs', 'user_id', bob.userId!)).toBe(0);
  });

  it('AI2A-07 · a non-member owner is refused by the DB (fail closed, nothing persisted)', async () => {
    const ext = uniq('outsider');
    const r = await go(envelope({ run: { external_run_id: ext, generated_at: '2026-10-01T12:00:00Z' }, findings: [finding(uniq('s'))] }), ctxFor(bob.userId!, ws));
    expect(r.errors[0]).toMatchObject({ code: 'INGEST_RUN_FAILED', dbCode: 'WORKSPACE_ACCESS_DENIED' });
    expect(await runsByExternal(ext)).toHaveLength(0);
  });

  it('AI2A-08 · rejected items → PARTIAL; foreign suggestion target is refused by the RPC; orphan suggestions are not created', async () => {
    const doc = envelope({
      findings: [finding(uniq('s')), { kind: 'email_event', title: '', dedupe: {} }],
      suggestions: [
        { finding_index: 0, action: 'set_status', target: { type: 'application', id: bobApp }, proposed: { status: 'REJECTED' } }, // another user's app
        { finding_index: 1, action: 'create_task', proposed: { title: 'orphan' } }, // finding was rejected
      ],
    });
    const r = await go(doc);
    expect(r.status).toBe('PARTIAL');
    expect(r.success).toBe(true);
    expect(r.counts).toMatchObject({ findingsCreated: 1, rejectedItems: 2, suggestionsFailed: 1, suggestionsCreated: 0 });
    expect(r.errors).toEqual([expect.objectContaining({ code: 'CREATE_SUGGESTION_FAILED', dbCode: 'AI_SUGGESTION_TARGET_NOT_FOUND' })]);
    expect(r.validationErrors.length).toBeGreaterThan(0);
    const row = await runRow(r.runId!);
    expect(row).toMatchObject({ status: 'PARTIAL', error_category: 'SCHEMA_INVALID' });
    expect(row.error_detail).not.toContain(CANARY);
    expect(await countRows('ai_suggestions', 'user_id', alice.userId!)).toBeGreaterThan(0); // earlier tests
    expect((await admin.from('ai_suggestions').select('id').eq('target_id', bobApp)).data).toHaveLength(0);
    expect(await appStatus(bobApp)).toMatchObject({ status: expect.anything() });
  });

  it('AI2A-09 · systemic failure finalizes the existing run FAILED; a retry run is linked by trusted context only', async () => {
    const { admin: adminClient } = await import('../../apps/api/src/lib/db');
    const real = adminClient();
    const flaky = { rpc: (fn: string, a: Record<string, unknown>) => (fn === 'rpc_ai_ingest_finding' ? Promise.reject(new Error('connection reset')) : real.rpc(fn, a)) };
    const doc = envelope({ findings: [finding(uniq('s')), finding(uniq('s'))] });
    const failed = await go(doc, aliceCtx(), { client: flaky });
    expect(failed).toMatchObject({ success: false, status: 'FAILED', finalized: true });
    const row = await runRow(failed.runId!);
    expect(row).toMatchObject({ status: 'FAILED', error_category: 'INTERNAL' });
    expect(row.completed_at).not.toBeNull();
    expect(await countRows('ai_findings', 'run_id', failed.runId!)).toBe(0);

    // Resubmitting the failed external run id is refused with guidance, not reprocessed.
    const again = await go(doc);
    expect(again.errors[0]?.code).toBe('RUN_NOT_OPEN');

    const retry = await go(envelope({ findings: [finding(uniq('s'))] }), aliceCtx({ triggerType: 'retry', retryOfRunId: failed.runId }));
    expect(retry.success).toBe(true);
    expect(await runRow(retry.runId!)).toMatchObject({ trigger_type: 'retry', retry_of_run_id: failed.runId });

    const foreign = await go(envelope({ findings: [finding(uniq('s'))] }), ctxFor(bob.userId!, bobWs, { triggerType: 'retry', retryOfRunId: failed.runId }));
    expect(foreign.errors[0]).toMatchObject({ code: 'INGEST_RUN_FAILED', dbCode: 'AI_RUN_NOT_FOUND' });
    expect((await go(envelope(), aliceCtx({ triggerType: 'retry' }))).errors[0]?.code).toBe('INVALID_CONTEXT');
  });

  it('AI2A-10 · audit metadata is sanitized and logs never contain payload content', async () => {
    const rows = (await admin.from('audit_events').select('metadata').eq('workspace_id', ws).like('action', 'AI_%')).data!;
    expect(rows.length).toBeGreaterThan(5);
    expect(JSON.stringify(rows)).not.toContain(CANARY);
    expect(JSON.stringify(rows)).not.toMatch(/Interview invite|Acme/);
    expect(logs.length).toBeGreaterThan(5);
    expect(JSON.stringify(logs)).not.toContain(CANARY);
    expect(logs.every((l) => l.event === 'ai_integration.ingest' && typeof l.correlationId === 'string')).toBe(true);
    const stored = JSON.stringify((await admin.from('ai_findings').select('*').eq('workspace_id', ws)).data);
    expect(stored).not.toMatch(/user_id":"22222222|workspace_id":"33333333/); // provider scope values never stored
  });

  it('AI2A-11 · failure isolation: service errors never throw and the core API keeps answering; boot does not import the service', async () => {
    const boom = { rpc: () => Promise.reject(new Error('db down')) };
    await expect(go(envelope({ findings: [finding(uniq('s'))] }), aliceCtx(), { client: boom })).resolves.toMatchObject({ success: false });
    const health = await alice.call('/health', undefined, { method: 'GET' });
    expect(health.status).toBe(200);
    for (const file of ['apps/api/src/app.ts', 'apps/api/src/server.ts', 'apps/api/src/vercel.ts']) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/aiIntegrationService/);
    }
  });
});
