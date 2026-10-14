import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, loadEnv, makeRecorder, serviceDb } from './harness';
import { emailTriageFinding, external } from '../unit/fixtures/ai-contract/external';
import { scheduledRunKey } from '../../apps/api/src/lib/aiContract';

// AI-11F: the schedule / cadence EXECUTION lifecycle against a REAL database: canonical occurrence identity, database-
// enforced idempotency and concurrency, provider/workspace binding, the status lifecycle, retry, failure hygiene, history
// and the Run Now gate. Local stack only (writes test rows). Provider-neutral: no provider is ever called.
const ready = loadEnv();
const local = /^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.SUPABASE_URL ?? '');
const record = makeRecorder('test-results/evidence', 'integration');
const ON = { AI_HUB_ENABLED: 'true' };
const quiet = { env: ON, log: () => undefined };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const CANARY = 'SECRET-FAILURE-CANARY';

describe.skipIf(!ready || !local)('AI-11F — schedule / cadence execution (real DB + real API)', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();
  const carol = new Actor(); // owner of the automations under test
  const eve = new Actor(); // same workspace, different owner
  const dave = new Actor(); // unrelated workspace
  const alice = new Actor();
  let ws: string;
  let daveWs: string;
  let exec: typeof import('../../apps/api/src/services/aiExecutionService');
  let ingest: typeof import('../../apps/api/src/services/aiIntegrationService').ingestAiResult;
  let digestId: string;
  let emailId: string;
  let geminiId: string;
  const ctx = (a: Actor, workspaceId = ws) => ({ workspaceId, userId: a.userId!, accessToken: a.token! });
  const post = (a: Actor, path: string, body: unknown) => a.call(`/ai/automations${path}`, body);
  const mk = async (over: Record<string, unknown>) => {
    const r = await post(carol, '', {
      workspace_id: ws, name: `Auto ${randomBytes(3).toString('hex')}`, workflow: 'daily_brief', enabled: true, provider: 'claude', cadence: 'daily',
      localTime: '08:00', timezone: 'America/Chicago', weekdays: [], sections: [], delivery: ['ai_hub'], ...over,
    });
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    return r.json.id as string;
  };
  /** A unique, valid occurrence: whole seconds, just ahead of now (allowed up to +1 minute) and after the last config change. */
  let nextSlot = 0;
  const slot = () => new Date(Math.floor(Date.now() / 1000) * 1000 + 5_000 + (++nextSlot) * 1_000).toISOString();
  const request = (automationId: string | null, over: Record<string, unknown> = {}, actor = carol, workspaceId = ws) => admin.rpc('rpc_ai_execution_request', {
    p_actor_id: actor.userId, p_workspace_id: workspaceId, p_automation_id: automationId, p_trigger_type: 'scheduled', p_scheduled_for: slot(),
    p_client_key: null, p_retry_of_run_id: null, ...over,
  });
  const claim = (runId: string, provider = 'claude', actor = carol) => admin.rpc('rpc_ai_execution_claim', { p_actor_id: actor.userId, p_run_id: runId, p_provider: provider });
  const runRow = async (id: string) => (await admin.from('ai_runs').select('*').eq('id', id).single()).data as Record<string, any>;
  const finalize = (runId: string, status: string, extra: Record<string, unknown> = {}) => admin.rpc('rpc_ai_finalize_run', { p_actor_id: carol.userId, p_run_id: runId, p_status: status, ...extra });

  beforeAll(async () => {
    process.env.AI_HUB_ENABLED = 'true';
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache(); resetSigningMaterial(); resetAdminClient();
    exec = await import('../../apps/api/src/services/aiExecutionService');
    ({ ingestAiResult: ingest } = await import('../../apps/api/src/services/aiIntegrationService'));
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    for (const [a, name] of [[alice, 'alice'], [carol, 'carol'], [eve, 'eve'], [dave, 'dave']] as const) {
      expect((await a.call('/auth/register', { username: `ai11f_${name}_${run}`, password: `Valid-AI11F-${name}-${run}!` })).status).toBe(201);
    }
    const prof = async (a: Actor) => (await admin.from('profiles').select('last_active_workspace_id').eq('user_id', a.userId!).single()).data!.last_active_workspace_id as string;
    ws = await prof(alice);
    daveWs = await prof(dave);
    expect((await admin.from('workspace_members').insert([
      { workspace_id: ws, user_id: carol.userId!, role: 'USER', status: 'ACTIVE' },
      { workspace_id: ws, user_id: eve.userId!, role: 'USER', status: 'ACTIVE' },
    ])).error).toBeNull();
    digestId = await mk({ name: `Digest ${run}`, workflow: 'daily_brief', sections: ['email_triage', 'job_discovery', 'calendar_review'] });
    emailId = await mk({ name: `Email ${run}`, workflow: 'email_triage' });
    geminiId = await mk({ name: `Gemini ${run}`, workflow: 'daily_brief', provider: 'gemini' });
  });
  afterAll(() => { vi.restoreAllMocks(); delete process.env.AI_HUB_ENABLED; });

  it('AI11F-01 · a scheduled occurrence becomes ONE queued run with a canonical identity (SQL key == TS key)', async () => {
    const at = slot();
    const r = await request(digestId, { p_scheduled_for: at });
    expect(r.error, JSON.stringify(r.error)).toBeNull();
    expect(r.data).toMatchObject({ created: true, status: 'QUEUED' });
    const row = await runRow(r.data.run_id);
    expect(row).toMatchObject({
      automation_id: digestId, trigger_type: 'scheduled', status: 'QUEUED', provider: 'claude', workflow: 'daily_brief', user_id: carol.userId, workspace_id: ws,
      started_at: null, retry_of_run_id: null,
    });
    expect(Date.parse(row.scheduled_for)).toBe(Date.parse(at));
    expect(row.external_run_id).toBe(scheduledRunKey(digestId, at)); // the database and the contract agree byte for byte
    record('ai11f-01', { key: row.external_run_id });
  });

  it('AI11F-02 · the same occurrence is idempotent, and its provider/workflow binding survives a later edit', async () => {
    const at = slot();
    const first = await request(geminiId, { p_scheduled_for: at });
    const again = await request(geminiId, { p_scheduled_for: at });
    expect(first.data.created).toBe(true);
    expect(again.data).toMatchObject({ created: false, run_id: first.data.run_id, status: 'QUEUED' });
    // Edit the automation to another provider: the SAME occurrence still resolves to the ORIGINAL run, never a second one.
    const edit = await post(carol, `/${geminiId}`, { workspace_id: ws, name: `Gemini ${run}`, workflow: 'daily_brief', enabled: true, provider: 'chatgpt', cadence: 'daily', localTime: '08:00', timezone: 'America/Chicago', weekdays: [], sections: [], delivery: ['ai_hub'] });
    expect(edit.status).toBe(200);
    const afterEdit = await request(geminiId, { p_scheduled_for: at });
    expect(afterEdit.data).toMatchObject({ created: false, run_id: first.data.run_id });
    expect((await runRow(first.data.run_id)).provider).toBe('gemini');
    const rows = await admin.from('ai_runs').select('id').eq('automation_id', geminiId).eq('scheduled_for', at);
    expect(rows.data).toHaveLength(1);
    // Put it back so later tests have a stable gemini automation.
    await post(carol, `/${geminiId}`, { workspace_id: ws, name: `Gemini ${run}`, workflow: 'daily_brief', enabled: true, provider: 'gemini', cadence: 'daily', localTime: '08:00', timezone: 'America/Chicago', weekdays: [], sections: [], delivery: ['ai_hub'] });
  });

  it('AI11F-03 · eight concurrent requesters of one occurrence: exactly one creates the run', async () => {
    const at = slot();
    const results = await Promise.all(Array.from({ length: 8 }, () => request(emailId, { p_scheduled_for: at })));
    for (const r of results) expect(r.error, JSON.stringify(r.error)).toBeNull();
    expect(results.filter((r) => r.data.created === true)).toHaveLength(1);
    expect(new Set(results.map((r) => r.data.run_id)).size).toBe(1);
    expect((await admin.from('ai_runs').select('id').eq('automation_id', emailId).eq('scheduled_for', at)).data).toHaveLength(1);
  });

  it('AI11F-04 · eight concurrent claimers of one run: exactly one wins and receives a bounded, credential-free context', async () => {
    const q = await request(digestId);
    const runId = q.data.run_id as string;
    const results = await Promise.all(Array.from({ length: 8 }, () => claim(runId)));
    for (const r of results) expect(r.error, JSON.stringify(r.error)).toBeNull();
    const winners = results.filter((r) => r.data.claimed === true);
    expect(winners).toHaveLength(1);
    for (const l of results.filter((r) => r.data.claimed === false)) expect(l.data).toMatchObject({ run_id: runId, status: 'RUNNING', reason: 'NOT_QUEUED' });
    expect(Object.keys(winners[0]!.data).sort()).toEqual([
      'automation_id', 'claimed', 'delivery', 'external_run_id', 'provider', 'retry_of_run_id', 'run_id', 'scheduled_for', 'sections', 'status', 'timezone', 'trigger_type', 'workflow',
    ]);
    expect(winners[0]!.data).toMatchObject({ workflow: 'daily_brief', provider: 'claude', trigger_type: 'scheduled', timezone: 'America/Chicago', sections: ['calendar_review', 'email_triage', 'job_discovery'] });
    expect(JSON.stringify(winners[0]!.data)).not.toMatch(/token|secret|password|key_hash|service_role/i);
    const row = await runRow(runId);
    expect(row.status).toBe('RUNNING');
    expect(row.started_at).not.toBeNull();
    // The service layer builds the ordered plan (digest composed last) from that context.
    const q2 = await request(digestId);
    const viaService = await exec.claimExecution(ctx(carol), q2.data.run_id, 'claude', quiet as never);
    if (!viaService.ok || !viaService.data.claimed) throw new Error('claim failed');
    expect(viaService.data.claim.plan).toEqual(['email_triage', 'job_discovery', 'calendar_review', 'daily_brief']);
    record('ai11f-04', { winners: winners.length });
  });

  it('AI11F-05 · isolation: other owners, other workspaces and the wrong provider can neither request nor claim', async () => {
    const q = await request(digestId);
    const runId = q.data.run_id as string;
    // Same workspace, different owner.
    expect((await request(digestId, {}, eve)).error?.message).toContain('AI_EXECUTION_AUTOMATION_NOT_FOUND');
    expect((await claim(runId, 'claude', eve)).error?.message).toContain('AI_RUN_NOT_FOUND');
    // Another workspace.
    expect((await request(digestId, {}, dave, daveWs)).error?.message).toContain('AI_EXECUTION_AUTOMATION_NOT_FOUND');
    expect((await request(digestId, {}, carol, daveWs)).error?.code).toBe('42501');
    expect((await claim(runId, 'claude', dave)).error?.message).toContain('AI_RUN_NOT_FOUND');
    // The provider is validated against the RUN: a ChatGPT/Gemini claim of a Claude run is refused and changes nothing.
    for (const wrong of ['chatgpt', 'gemini', 'manual', 'system']) {
      expect((await claim(runId, wrong)).error?.message, wrong).toContain('AI_EXECUTION_PROVIDER_MISMATCH');
    }
    expect((await runRow(runId)).status).toBe('QUEUED');
    // History is owner-only through RLS.
    expect((await eve.db().from('ai_runs').select('id').eq('id', runId)).data).toEqual([]);
    expect((await carol.db().from('ai_runs').select('id').eq('id', runId)).data).toHaveLength(1);
    expect((await claim(runId)).data.claimed).toBe(true); // the rightful owner + provider still wins
  });

  it('AI11F-06 · occurrence validation: stale, future, fractional and manual-only slots are refused; the edit boundary holds', async () => {
    const cfg = (await admin.from('ai_workflow_configs').select('updated_at').eq('id', digestId).single()).data!;
    const stale = new Date(Date.parse(cfg.updated_at) - 3_600_000).toISOString(); // before the last configuration change
    expect((await request(digestId, { p_scheduled_for: stale })).error?.message).toContain('AI_EXECUTION_INVALID_OCCURRENCE');
    expect((await request(digestId, { p_scheduled_for: new Date(Date.now() + 3_600_000).toISOString() })).error?.message).toContain('AI_EXECUTION_INVALID_OCCURRENCE');
    expect((await request(digestId, { p_scheduled_for: new Date(Date.now() - 3 * 86_400_000).toISOString() })).error?.message).toContain('AI_EXECUTION_INVALID_OCCURRENCE');
    expect((await request(digestId, { p_scheduled_for: `${slot().slice(0, 19)}.500Z` })).error?.message).toContain('AI_EXECUTION_INVALID_OCCURRENCE');
    expect((await request(digestId, { p_scheduled_for: null })).error?.message).toContain('AI_EXECUTION_INVALID_OCCURRENCE');
    const manualOnly = await mk({ name: `Manual only ${run}`, workflow: 'calendar_review', cadence: 'manual_only', localTime: null, timezone: null });
    expect((await request(manualOnly)).error?.message).toContain('AI_EXECUTION_AUTOMATION_DISABLED');
    expect((await request(digestId, { p_trigger_type: 'bogus' })).error?.message).toContain('AI_EXECUTION_INVALID_TRIGGER');
  });

  it('AI11F-07 · Run Now is the same lifecycle (manual trigger, idempotent per client key) and is gated by the executor', async () => {
    // The route is truthful: no executor is registered in AI-11F, so nothing is created.
    const before = (await admin.from('ai_runs').select('id', { count: 'exact', head: true }).eq('automation_id', emailId).eq('trigger_type', 'manual')).count;
    const gated = await post(carol, `/${emailId}/run-now`, { workspace_id: ws, client_key: `click-${run}-0001` });
    expect(gated.status).toBe(409);
    expect(gated.json.error.code).toBe('NO_EXECUTOR');
    expect((await admin.from('ai_runs').select('id', { count: 'exact', head: true }).eq('automation_id', emailId).eq('trigger_type', 'manual')).count).toBe(before);
    // Authorization and input of the route.
    expect((await post(eve, `/${emailId}/run-now`, { workspace_id: ws, client_key: `click-${run}-0001` })).status).toBe(404);
    expect((await post(carol, `/${emailId}/run-now`, { workspace_id: ws, client_key: 'x' })).status).toBe(422);
    expect((await post(carol, `/${emailId}/run-now`, { workspace_id: ws, client_key: `click-${run}-0001`, user_id: eve.userId })).status).toBe(422);
    expect((await carol.call(`/ai/automations/${emailId}/run-now`, { workspace_id: ws, client_key: `click-${run}-0001` }, { csrf: false })).status).toBe(403);
    // The backend lifecycle itself, with an executor registered for the test: manual QUEUED, idempotent on the key.
    const live = { ...quiet, registered: ['claude'] } as never;
    const a = await exec.requestRunNow(ctx(carol), emailId, `click-${run}-0002`, live);
    const b = await exec.requestRunNow(ctx(carol), emailId, `click-${run}-0002`, live);
    const c = await exec.requestRunNow(ctx(carol), emailId, `click-${run}-0003`, live);
    if (!a.ok || !b.ok || !c.ok) throw new Error(JSON.stringify([a, b, c]));
    expect(a.data.created).toBe(true);
    expect(b.data).toMatchObject({ created: false, runId: a.data.runId });
    expect(c.data.runId).not.toBe(a.data.runId);
    expect(await runRow(a.data.runId)).toMatchObject({ trigger_type: 'manual', status: 'QUEUED', scheduled_for: null, provider: 'claude', workflow: 'email_triage', automation_id: emailId, external_run_id: `manual:${emailId}:click-${run}-0002` });
    // Nobody but the owner; a disabled automation cannot be run.
    expect((await exec.requestRunNow(ctx(eve), emailId, `click-${run}-0004`, live))).toMatchObject({ ok: false, error: { code: 'AUTOMATION_NOT_FOUND' } });
    const off = await mk({ name: `Off ${run}`, workflow: 'job_discovery', enabled: false });
    expect(await exec.requestRunNow(ctx(carol), off, `click-${run}-0005`, live)).toMatchObject({ ok: false, error: { code: 'AUTOMATION_DISABLED' } });
    expect((await admin.from('ai_runs').select('id').eq('automation_id', off)).data).toEqual([]);
    record('ai11f-07', { gated: gated.json.error.code });
  });

  it('AI11F-08 · lifecycle: legal transitions only, a finished run is never resurrected, the binding is immutable', async () => {
    const runId = (await request(emailId)).data.run_id as string;
    expect((await finalize(runId, 'SUCCEEDED')).error?.message).toContain('AI_RUN_INVALID_TRANSITION'); // QUEUED -> SUCCEEDED
    expect((await claim(runId)).data.claimed).toBe(true);
    expect((await finalize(runId, 'SUCCEEDED', { p_counts: { findings_created: 1 } })).data).toMatchObject({ changed: true, status: 'SUCCEEDED' });
    expect((await finalize(runId, 'SUCCEEDED')).data).toMatchObject({ changed: false }); // repeating is an idempotent no-op
    expect((await finalize(runId, 'RUNNING')).error?.message).toContain('AI_RUN_INVALID_TRANSITION');
    expect((await finalize(runId, 'FAILED')).error?.message).toContain('AI_RUN_INVALID_TRANSITION');
    // Even a direct service-role write cannot resurrect or rebind it (trigger, below the RPCs).
    expect((await admin.from('ai_runs').update({ status: 'RUNNING' }).eq('id', runId)).error?.message).toContain('AI_RUN_INVALID_TRANSITION');
    for (const patch of [{ provider: 'gemini' }, { workflow: 'job_discovery' }, { trigger_type: 'manual' }, { scheduled_for: new Date().toISOString() }, { external_run_id: 'tampered' }, { user_id: eve.userId }]) {
      expect((await admin.from('ai_runs').update(patch).eq('id', runId)).error?.message, JSON.stringify(patch)).toContain('AI_RUN_BINDING_IMMUTABLE');
    }
    expect(await runRow(runId)).toMatchObject({ status: 'SUCCEEDED', provider: 'claude', workflow: 'email_triage' });
    // A claim of a finished run is a harmless loser.
    expect((await claim(runId)).data).toMatchObject({ claimed: false, status: 'SUCCEEDED' });
  });

  it('AI11F-09 · failures are concise and safe; a retry is a NEW attempt and never rewrites the failed one', async () => {
    const runId = (await request(emailId)).data.run_id as string;
    expect((await claim(runId)).data.claimed).toBe(true);
    const failed = await exec.reportExecutionFailure(ctx(carol), runId, 'CONNECTOR_AUTH_EXPIRED',
      `token Bearer abc.def.ghijklmnopqrstuvwxyz0123456789 at https://provider.example/cb?code=${CANARY}-XXXXXXXXXXXXXXXXXXXXXXXX for jane@example.com\n${'x'.repeat(900)}`, quiet as never);
    expect(failed).toMatchObject({ ok: true, data: { status: 'FAILED', changed: true } });
    const f = await runRow(runId);
    expect(f.status).toBe('FAILED');
    expect(f.error_category).toBe('CONNECTOR_AUTH_EXPIRED');
    expect(f.error_detail.length).toBeLessThanOrEqual(200);
    expect(f.error_detail).not.toMatch(/Bearer|https?:|jane@|abc\.def|\n/);
    expect(JSON.stringify(f)).not.toContain(CANARY);
    expect(f.completed_at).not.toBeNull();
    // Reporting again is a no-op, and the failure cannot become something else.
    expect(await exec.reportExecutionFailure(ctx(carol), runId, 'INTERNAL', 'again', quiet as never)).toMatchObject({ ok: true, data: { changed: false } });
    expect((await runRow(runId)).error_category).toBe('CONNECTOR_AUTH_EXPIRED');

    // Retry #1: a new QUEUED run linked to the original; the failed attempt is untouched.
    const r1 = await exec.requestRetry(ctx(carol), runId, quiet as never);
    if (!r1.ok) throw new Error(JSON.stringify(r1));
    expect(r1.data.created).toBe(true);
    const n1 = await runRow(r1.data.runId);
    expect(n1).toMatchObject({ status: 'QUEUED', trigger_type: 'retry', retry_of_run_id: runId, automation_id: emailId, provider: 'claude', workflow: 'email_triage', external_run_id: `retry:${runId}:1` });
    expect(Date.parse(n1.scheduled_for)).toBe(Date.parse(f.scheduled_for));
    expect(await runRow(runId)).toMatchObject({ status: 'FAILED', error_category: 'CONNECTOR_AUTH_EXPIRED', error_detail: f.error_detail, completed_at: f.completed_at });
    // One attempt in flight at a time (also under concurrency); nothing to retry once something succeeded.
    const burst = await Promise.all(Array.from({ length: 5 }, () => exec.requestRetry(ctx(carol), runId, quiet as never)));
    for (const b of burst) expect(b).toMatchObject({ ok: false, error: { code: 'NOT_RETRYABLE' } });
    // Fail retries until the bounded limit.
    let current = r1.data.runId;
    for (let attempt = 2; attempt <= 3; attempt++) {
      expect((await claim(current)).data.claimed).toBe(true);
      expect((await finalize(current, 'FAILED', { p_error_category: 'TIMEOUT', p_error_detail: 'timed out' })).error).toBeNull();
      const next = await exec.requestRetry(ctx(carol), current, quiet as never); // retrying a retry points at the ROOT
      if (!next.ok) throw new Error(JSON.stringify(next));
      expect((await runRow(next.data.runId))).toMatchObject({ retry_of_run_id: runId, external_run_id: `retry:${runId}:${attempt}` });
      current = next.data.runId;
    }
    expect((await claim(current)).data.claimed).toBe(true);
    expect((await finalize(current, 'FAILED', { p_error_category: 'TIMEOUT' })).error).toBeNull();
    expect(await exec.requestRetry(ctx(carol), runId, quiet as never)).toMatchObject({ ok: false, error: { code: 'RETRY_LIMIT' } });
    expect((await admin.from('ai_runs').select('id').eq('retry_of_run_id', runId)).data).toHaveLength(3);
    // Other owners cannot retry it; a succeeded occurrence is not retryable.
    expect(await exec.requestRetry(ctx(eve), runId, quiet as never)).toMatchObject({ ok: false, error: { code: 'RUN_NOT_FOUND' } });
    const okRun = (await request(emailId)).data.run_id as string;
    await claim(okRun); await finalize(okRun, 'SUCCEEDED');
    expect(await exec.requestRetry(ctx(carol), okRun, quiet as never)).toMatchObject({ ok: false, error: { code: 'NOT_RETRYABLE' } });
    record('ai11f-09', { attempts: 3 });
  });

  it('AI11F-10 · disabling / reassigning while queued cancels at claim time; history survives disable and delete', async () => {
    const id = await mk({ name: `Lifecycle ${run}`, workflow: 'recruiter_intel' });
    const queued = (await request(id)).data.run_id as string;
    const done = (await request(id)).data.run_id as string;
    expect((await claim(done)).data.claimed).toBe(true);
    // Disable: nothing new is requestable, history is untouched, and the waiting run is never executed.
    const edit = (over: Record<string, unknown>) => post(carol, `/${id}`, { workspace_id: ws, name: `Lifecycle ${run}`, workflow: 'recruiter_intel', enabled: true, provider: 'claude', cadence: 'daily', localTime: '08:00', timezone: 'America/Chicago', weekdays: [], sections: [], delivery: ['ai_hub'], ...over });
    expect((await edit({ enabled: false })).status).toBe(200);
    expect((await request(id)).error?.message).toContain('AI_EXECUTION_AUTOMATION_DISABLED');
    expect((await runRow(queued)).status).toBe('QUEUED');
    expect((await claim(queued)).data).toMatchObject({ claimed: false, status: 'CANCELLED', reason: 'AUTOMATION_DISABLED' });
    expect((await runRow(done)).status).toBe('RUNNING'); // a started run is never destroyed by disabling
    // Reassigned to another provider while queued: the old provider cannot run it.
    expect((await edit({ enabled: true })).status).toBe(200);
    const q2 = (await request(id)).data.run_id as string;
    expect((await edit({ provider: 'chatgpt' })).status).toBe(200);
    expect((await claim(q2)).data).toMatchObject({ claimed: false, status: 'CANCELLED', reason: 'AUTOMATION_REASSIGNED' });
    // Delete: queued runs are cancelled, every run row stays (automation_id nulled), nothing cascades.
    expect((await edit({ provider: 'claude' })).status).toBe(200);
    const q3 = (await request(id)).data.run_id as string;
    expect((await post(carol, `/${id}/delete`, { workspace_id: ws })).status).toBe(200);
    const rows = (await admin.from('ai_runs').select('id,status,automation_id').in('id', [queued, done, q2, q3])).data!;
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.automation_id === null)).toBe(true);
    expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({ [queued]: 'CANCELLED', [done]: 'RUNNING', [q2]: 'CANCELLED', [q3]: 'CANCELLED' });
    expect((await claim(done)).data).toMatchObject({ claimed: false, status: 'RUNNING' });
  });

  it('AI11F-11 · the executor submits through the EXISTING ingest and lands on the claimed run (no second run, retries are idempotent)', async () => {
    const q = await request(emailId);
    const runId = q.data.run_id as string;
    const claimed = await exec.claimExecution(ctx(carol), runId, 'claude', quiet as never);
    if (!claimed.ok || !claimed.data.claimed) throw new Error('claim failed');
    const key = claimed.data.claim.externalRunId;
    const doc = {
      ...clone(external.emailTriage), provider: 'claude', run: { external_run_id: key, generated_at: '2026-10-01T12:00:00Z' },
      findings: [emailTriageFinding({ dedupe: { source_type: 'gmail', source_id: `msg-${run}-exec` }, title: `Email exec ${run}`, due_at: undefined }, { needs_attention: undefined, next_step: undefined, deadline: undefined })],
    };
    const before = (await admin.from('ai_runs').select('id', { count: 'exact', head: true }).eq('user_id', carol.userId!)).count;
    const r1 = await ingest({ workspaceId: ws, userId: carol.userId!, actorKind: 'SERVICE_INGEST' }, doc, quiet);
    expect(r1.runId).toBe(runId);
    expect(r1.status).toBe('SUCCEEDED');
    expect(r1.counts.findingsCreated).toBe(1);
    const r2 = await ingest({ workspaceId: ws, userId: carol.userId!, actorKind: 'SERVICE_INGEST' }, doc, quiet);
    expect(r2).toMatchObject({ runId, duplicateRun: true, success: true });
    expect((await admin.from('ai_runs').select('id', { count: 'exact', head: true }).eq('user_id', carol.userId!)).count).toBe(before); // no run added
    expect((await admin.from('ai_findings').select('id').eq('user_id', carol.userId!).eq('title', `Email exec ${run}`)).data).toHaveLength(1);
    expect(await runRow(runId)).toMatchObject({ status: 'SUCCEEDED', trigger_type: 'scheduled', automation_id: emailId });
    // An unclaimed (QUEUED) occurrence cannot be ingested into: the executor must claim first.
    const unclaimed = (await request(emailId)).data;
    const rej = await ingest({ workspaceId: ws, userId: carol.userId!, actorKind: 'SERVICE_INGEST' }, { ...doc, run: { external_run_id: unclaimed.external_run_id, generated_at: '2026-10-01T12:00:00Z' } }, quiet);
    expect(rej.success).toBe(false);
    expect(rej.errors.map((e) => e.code)).toContain('RUN_NOT_OPEN');
    expect((await runRow(unclaimed.run_id)).status).toBe('QUEUED');
  });

  it('AI11F-12 · every AI-11A workflow can be requested; trigger, provider and workflow are carried on the run', async () => {
    const wfs = ['daily_brief', 'email_triage', 'job_discovery', 'recruiter_intel', 'calendar_review', 'other'] as const;
    const ids: Record<string, string> = { daily_brief: digestId, email_triage: emailId };
    for (const w of wfs) if (!ids[w]) ids[w] = await mk({ name: `WF ${w} ${run}`, workflow: w, provider: 'chatgpt', sections: w === 'other' ? ['recruiter_intel', 'email_triage'] : [] });
    for (const w of wfs) {
      const r = await request(ids[w]!);
      expect(r.error, `${w}: ${JSON.stringify(r.error)}`).toBeNull();
      expect(await runRow(r.data.run_id)).toMatchObject({ workflow: w, provider: ids[w] === digestId || ids[w] === emailId ? 'claude' : 'chatgpt', trigger_type: 'scheduled', status: 'QUEUED' });
    }
    const custom = await claim((await request(ids.other!)).data.run_id, 'chatgpt');
    const plan = await exec.claimExecution(ctx(carol), (await request(ids.other!)).data.run_id, 'chatgpt', quiet as never);
    expect(custom.data.sections).toEqual(['email_triage', 'recruiter_intel']);
    if (!plan.ok || !plan.data.claimed) throw new Error('claim failed');
    expect(plan.data.claim.plan).toEqual(['email_triage', 'recruiter_intel']); // custom review: sections only, no digest step
  });

  it('AI11F-13 · history and operational state: scheduled/manual are distinguishable, owner-only, no error detail exposed', async () => {
    const h = await carol.call(`/ai/automations/${emailId}/runs?workspace_id=${ws}`);
    expect(h.status).toBe(200);
    expect(h.json.runs.length).toBeGreaterThan(3);
    expect(h.json.runs.length).toBeLessThanOrEqual(10);
    const triggers = new Set(h.json.runs.map((r: { trigger: string }) => r.trigger));
    expect(triggers.has('scheduled')).toBe(true);
    expect(triggers.has('manual')).toBe(true);
    for (const r of h.json.runs) expect(Object.keys(r).sort()).toEqual(['completedAt', 'createdAt', 'errorCategory', 'id', 'scheduledFor', 'startedAt', 'status', 'trigger']);
    expect(JSON.stringify(h.json)).not.toMatch(/error_detail|Bearer|jane@/);
    // Not the owner, or another workspace: the automation does not exist for them, so there is no history to leak.
    for (const [who, workspace] of [[eve, ws], [dave, daveWs], [carol, daveWs], [alice, ws]] as const) {
      const r = await who.call(`/ai/automations/${emailId}/runs?workspace_id=${workspace}`);
      expect([r.status, r.json.runs]).toEqual([404, undefined]);
    }
    const list = await carol.call(`/ai/automations?workspace_id=${ws}`);
    const email = list.json.automations.find((a: { id: string }) => a.id === emailId);
    expect(email.state.lastFailureAt).not.toBeNull();
    expect(email.state.lastTrigger).toMatch(/^(scheduled|manual|retry)$/);
    expect(email.executor).toBe('not_configured');
    expect(email.runNow).toEqual({ ready: false, reason: 'NO_EXECUTOR' });
    expect(JSON.stringify(list.json)).not.toContain(CANARY);
  });

  it('AI11F-14 · no core mutation and an unchanged MCP surface', async () => {
    const counts = async () => Promise.all(['applications', 'tasks'].map(async (t) => (await admin.from(t).select('id', { count: 'exact', head: true }).eq('workspace_id', ws)).count ?? 0));
    const before = await counts();
    const id = (await request(emailId)).data.run_id as string;
    await claim(id); await finalize(id, 'SUCCEEDED');
    expect(await counts()).toEqual(before);
    const { MCP_TOOLS } = await import('../../apps/api/src/mcp/tools');
    expect(MCP_TOOLS).toHaveLength(15); // AI-11G adds the two pull-executor tools (claim, failure report)
  });
});
