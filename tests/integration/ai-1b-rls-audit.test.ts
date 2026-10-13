import { beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, anonDb, loadEnv, makeRecorder, serviceDb } from './harness';

// AI-1A/AI-1B behaviour: grants, RLS ownership, RPC boundaries, dedupe, constraints
// and audit. Writes test rows, so it only ever runs against a LOCAL stack.
const ready = loadEnv();
const local = /^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.SUPABASE_URL ?? '');
const record = makeRecorder('test-results/evidence', 'integration');

const AI_TABLES = ['ai_runs', 'ai_findings', 'ai_suggestions', 'ai_workflow_configs'] as const;
const FORBIDDEN_AUDIT_TEXT = 'SECRET-EMAIL-BODY-CANARY';

describe.skipIf(!ready || !local)('AI-1B — AI Hub RLS, ownership, RPC boundary and audit', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();
  const alice = new Actor(); // workspace W manager (creator)
  const carol = new Actor(); // W member (USER): owner of the AI rows under test
  const eve = new Actor(); // W member (USER): same workspace, different owner
  const dave = new Actor(); // unrelated workspace
  let ws: string;
  let daveWs: string;
  let runId: string;
  let findingId: string;
  let suggestionId: string;
  let carolAppId: string;
  let daveAppId: string;

  const svc = (fn: string, args: Record<string, unknown>) => admin.rpc(fn, args);
  const auditFor = async (id: string) =>
    (await admin.from('audit_events').select('action, actor_id, target_user_id, target_entity_type, metadata').eq('target_entity_id', id)).data ?? [];

  async function openRun(actorId: string, provider = 'claude', external = `ext-${randomBytes(4).toString('hex')}`) {
    const r = await svc('rpc_ai_ingest_run', {
      p_actor_id: actorId, p_workspace_id: ws, p_provider: provider, p_workflow: 'email_triage', p_external_run_id: external,
    });
    expect(r.error).toBeNull();
    return r.data as { run_id: string; created: boolean; status: string };
  }

  beforeAll(async () => {
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache(); resetSigningMaterial(); resetAdminClient();
    for (const [actor, name] of [[alice, 'alice'], [carol, 'carol'], [eve, 'eve'], [dave, 'dave']] as const) {
      const res = await actor.call('/auth/register', { username: `ai1b_${name}_${run}`, password: `Valid-AI1B-${name}-${run}!` });
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
    const app = await admin.from('applications').insert({ workspace_id: ws, user_id: carol.userId!, company_name: 'Acme', role_title: 'Engineer' }).select('id').single();
    expect(app.error).toBeNull();
    carolAppId = app.data!.id;
    const dApp = await admin.from('applications').insert({ workspace_id: daveWs, user_id: dave.userId!, company_name: 'Other', role_title: 'Engineer' }).select('id').single();
    daveAppId = dApp.data!.id;
  });

  // ---------------------------------------------------------------- grants
  it('AI1B-01 · anon can neither read nor write any AI table', async () => {
    const anon = anonDb();
    for (const t of AI_TABLES) {
      const read = await anon.from(t).select('id').limit(1);
      expect(read.error?.code).toBe('42501');
      const write = await anon.from(t).insert({ workspace_id: ws });
      expect(write.error).not.toBeNull();
    }
    record('ai1b-01-anon', { tables: AI_TABLES.length, readDenied: true, writeDenied: true });
  });

  it('AI1B-02 · service ingest creates a run idempotently and audits it as SERVICE_INGEST', async () => {
    const external = `ext-idem-${run}`;
    const first = await openRun(carol.userId!, 'claude', external);
    expect(first).toMatchObject({ created: true, status: 'RUNNING' });
    const again = await openRun(carol.userId!, 'claude', external);
    expect(again).toMatchObject({ run_id: first.run_id, created: false });
    runId = first.run_id;
    // Another member reusing the same external id gets a conflict, not the run.
    const foreign = await svc('rpc_ai_ingest_run', { p_actor_id: eve.userId!, p_workspace_id: ws, p_provider: 'claude', p_workflow: 'email_triage', p_external_run_id: external });
    expect(foreign.error?.message).toMatch(/AI_RUN_CONFLICT/);
    // Actor not in workspace: denied.
    const outsider = await svc('rpc_ai_ingest_run', { p_actor_id: dave.userId!, p_workspace_id: ws, p_provider: 'claude', p_workflow: 'email_triage' });
    expect(outsider.error?.message).toMatch(/WORKSPACE_ACCESS_DENIED/);
    const audit = await auditFor(runId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'AI_RUN_CREATED', actor_id: carol.userId, target_entity_type: 'AI_RUN' });
    expect(audit[0]!.metadata).toMatchObject({ actor_kind: 'SERVICE_INGEST', provider: 'claude', workflow: 'email_triage' });
    record('ai1b-02-ingest-run', { idempotent: true, foreignConflict: true, outsiderDenied: true, audited: 1 });
  });

  it('AI1B-03 · finding ingest validates application ownership and computes content_hash server-side', async () => {
    const foreignApp = await svc('rpc_ai_ingest_finding', {
      p_actor_id: carol.userId!, p_run_id: runId, p_kind: 'email_event', p_dedupe_key: `k-foreign-${run}`, p_title: 'x', p_application_id: daveAppId,
    });
    expect(foreignApp.error?.message).toMatch(/AI_APPLICATION_NOT_FOUND/);
    const created = await svc('rpc_ai_ingest_finding', {
      p_actor_id: carol.userId!, p_run_id: runId, p_kind: 'email_event', p_dedupe_key: `k1-${run}`,
      p_title: 'Rejection from Acme', p_summary: FORBIDDEN_AUDIT_TEXT, p_evidence: FORBIDDEN_AUDIT_TEXT,
      p_application_id: carolAppId, p_confidence: 0.97, p_category: 'REJECTION',
      p_source_ref: { type: 'gmail', provider_message_id: 'm-1' }, p_payload: { note: FORBIDDEN_AUDIT_TEXT, seen_by: ['spoofed'] },
    });
    expect(created.error).toBeNull();
    expect(created.data).toMatchObject({ outcome: 'created' });
    findingId = created.data.finding_id;
    const row = await admin.from('ai_findings').select('provider, content_hash, payload, workspace_id, user_id').eq('id', findingId).single();
    expect(row.data).toMatchObject({ provider: 'claude', workspace_id: ws, user_id: carol.userId });
    expect(row.data!.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.data!.payload.seen_by).toBeUndefined(); // server-owned key stripped
  });

  it('AI1B-04 · dedupe: same content is a duplicate, a second provider collapses into seen_by, changed NEW content updates in place', async () => {
    const base = {
      p_actor_id: carol.userId!, p_kind: 'email_event', p_dedupe_key: `k1-${run}`,
      p_title: 'Rejection from Acme', p_summary: FORBIDDEN_AUDIT_TEXT, p_evidence: FORBIDDEN_AUDIT_TEXT,
      p_application_id: carolAppId, p_confidence: 0.970, p_category: 'REJECTION',
      p_source_ref: { provider_message_id: 'm-1', type: 'gmail' }, p_payload: { note: FORBIDDEN_AUDIT_TEXT },
    };
    const dup = await svc('rpc_ai_ingest_finding', { ...base, p_run_id: runId });
    expect(dup.data).toEqual({ finding_id: findingId, outcome: 'duplicate' });

    const geminiRun = await openRun(carol.userId!, 'gemini');
    const cross = await svc('rpc_ai_ingest_finding', { ...base, p_run_id: geminiRun.run_id });
    expect(cross.data).toEqual({ finding_id: findingId, outcome: 'duplicate' });
    const count = await admin.from('ai_findings').select('id, payload, provider').eq('dedupe_key', `k1-${run}`);
    expect(count.data).toHaveLength(1);
    expect(count.data![0]!.provider).toBe('claude');
    expect(count.data![0]!.payload.seen_by).toEqual(['gemini']);

    const before = (await auditFor(findingId)).length;
    const updated = await svc('rpc_ai_ingest_finding', { ...base, p_run_id: runId, p_priority: 'HIGH' });
    expect(updated.data).toEqual({ finding_id: findingId, outcome: 'updated' });
    const after = await auditFor(findingId);
    expect(after.length).toBe(before + 1);
    expect(after.map((a) => a.action)).toEqual(expect.arrayContaining(['AI_FINDING_CREATED', 'AI_FINDING_UPDATED']));
    const kept = await admin.from('ai_findings').select('priority, payload').eq('id', findingId).single();
    expect(kept.data!.priority).toBe('HIGH');
    expect(kept.data!.payload.seen_by).toEqual(['gemini']);
    record('ai1b-04-dedupe', { duplicate: true, crossProviderCollapsed: true, updatedInPlace: true });
  });

  it('AI1B-05 · suggestions: validated targets, idempotent, inert (no core change)', async () => {
    const bad = await svc('rpc_ai_create_suggestion', { p_actor_id: carol.userId!, p_finding_id: findingId, p_action: 'set_status', p_target_type: 'application', p_target_id: daveAppId });
    expect(bad.error?.message).toMatch(/AI_SUGGESTION_TARGET_NOT_FOUND/);
    const notMine = await svc('rpc_ai_create_suggestion', { p_actor_id: eve.userId!, p_finding_id: findingId, p_action: 'set_status' });
    expect(notMine.error?.message).toMatch(/AI_FINDING_NOT_FOUND/);
    const args = { p_actor_id: carol.userId!, p_finding_id: findingId, p_action: 'set_status', p_target_type: 'application', p_target_id: carolAppId, p_proposed: { status: 'REJECTED' }, p_confidence: 0.9 };
    const s1 = await svc('rpc_ai_create_suggestion', args);
    expect(s1.data).toMatchObject({ created: true });
    suggestionId = s1.data.suggestion_id;
    const s2 = await svc('rpc_ai_create_suggestion', args);
    expect(s2.data).toEqual({ suggestion_id: suggestionId, created: false });
    const app = await admin.from('applications').select('stage').eq('id', carolAppId).single();
    expect(app.data!.stage).not.toBe('REJECTED');
    expect((await auditFor(suggestionId)).map((a) => a.action)).toEqual(['AI_SUGGESTION_CREATED']);
  });

  // ---------------------------------------------------------------- RLS
  it('AI1B-06 · owner and manager read; same-workspace peer and unrelated user see nothing', async () => {
    const vis = async (a: Actor, t: string, id: string) => ((await a.db().from(t).select('id').eq('id', id)).data ?? []).length;
    for (const [t, id] of [['ai_runs', runId], ['ai_findings', findingId], ['ai_suggestions', suggestionId]] as const) {
      expect(await vis(carol, t, id)).toBe(1); // owner
      expect(await vis(alice, t, id)).toBe(1); // ACTIVE manager (can_access_owned_record)
      expect(await vis(eve, t, id)).toBe(0); // same workspace, not owner, not manager
      expect(await vis(dave, t, id)).toBe(0); // unrelated workspace
    }
    record('ai1b-06-rls', { owner: 1, manager: 1, peer: 0, unrelated: 0 });
  });

  it('AI1B-07 · workflow configs are owner-only to read and not client-writable', async () => {
    const cfg = await admin.from('ai_workflow_configs').insert({ workspace_id: ws, user_id: carol.userId!, workflow: 'email_triage', enabled: true, primary_provider: 'claude' }).select('id').single();
    expect(cfg.error).toBeNull();
    const id = cfg.data!.id;
    expect((await carol.db().from('ai_workflow_configs').select('id').eq('id', id)).data).toHaveLength(1);
    expect((await alice.db().from('ai_workflow_configs').select('id').eq('id', id)).data).toHaveLength(0);
    expect((await eve.db().from('ai_workflow_configs').select('id').eq('id', id)).data).toHaveLength(0);
    const upd = await carol.db().from('ai_workflow_configs').update({ enabled: false }).eq('id', id);
    expect(upd.error?.code).toBe('42501');
    const mgrUpd = await alice.db().from('ai_workflow_configs').update({ enabled: false }).eq('id', id);
    expect(mgrUpd.error?.code).toBe('42501');
    const ins = await carol.db().from('ai_workflow_configs').insert({ workspace_id: ws, user_id: carol.userId!, workflow: 'daily_brief' });
    expect(ins.error?.code).toBe('42501');
  });

  it('AI1B-08 · authenticated users (incl. owner and manager) cannot directly write AI tables', async () => {
    for (const a of [carol, alice]) {
      const ins = await a.db().from('ai_findings').insert({ workspace_id: ws, user_id: carol.userId!, kind: 'note', provider: 'manual', title: 't', dedupe_key: `x-${run}` });
      expect(ins.error?.code).toBe('42501');
      const upd = await a.db().from('ai_findings').update({ status: 'ACCEPTED' }).eq('id', findingId);
      expect(upd.error?.code).toBe('42501');
      const del = await a.db().from('ai_suggestions').delete().eq('id', suggestionId);
      expect(del.error?.code).toBe('42501');
      const runIns = await a.db().from('ai_runs').insert({ workspace_id: ws, user_id: carol.userId!, provider: 'claude', workflow: 'other' });
      expect(runIns.error?.code).toBe('42501');
    }
  });

  // ---------------------------------------------------------------- RPC boundary
  it('AI1B-09 · service-only ingest RPCs are not executable by anon or authenticated', async () => {
    const calls: [string, Record<string, unknown>][] = [
      ['rpc_ai_ingest_run', { p_actor_id: carol.userId!, p_workspace_id: ws, p_provider: 'claude', p_workflow: 'other' }],
      ['rpc_ai_finalize_run', { p_actor_id: carol.userId!, p_run_id: runId, p_status: 'CANCELLED' }],
      ['rpc_ai_ingest_finding', { p_actor_id: carol.userId!, p_run_id: runId, p_kind: 'note', p_dedupe_key: `y-${run}`, p_title: 't' }],
      ['rpc_ai_create_suggestion', { p_actor_id: carol.userId!, p_finding_id: findingId, p_action: 'other' }],
    ];
    for (const [fn, args] of calls) {
      for (const client of [anonDb(), carol.db(), alice.db()]) {
        const r = await client.rpc(fn, args);
        expect(r.error, fn).not.toBeNull();
        expect(r.error!.code, fn).toBe('42501');
      }
    }
    // Run is still RUNNING: no rejected call took effect.
    expect((await admin.from('ai_runs').select('status').eq('id', runId).single()).data!.status).toBe('RUNNING');
    // User review RPCs are not executable by anon, nor by the service role (providers cannot delete).
    for (const [fn, args] of [['rpc_ai_delete_finding', { p_finding_id: findingId }], ['rpc_ai_dismiss_finding', { p_finding_id: findingId }]] as const) {
      expect((await anonDb().rpc(fn, args)).error?.code).toBe('42501');
      expect((await admin.rpc(fn, args)).error?.code).toBe('42501');
    }
    record('ai1b-09-rpc-acl', { serviceOnlyDeniedToClients: true, reviewDeniedToAnonAndService: true });
  });

  it('AI1B-10 · review RPCs are owner-only; refusals write no audit; ACCEPTED is not enabled', async () => {
    const before = (await auditFor(findingId)).length;
    for (const a of [alice, eve, dave]) {
      expect((await a.db().rpc('rpc_ai_dismiss_finding', { p_finding_id: findingId })).error?.message).toMatch(/AI_FINDING_NOT_FOUND/);
      expect((await a.db().rpc('rpc_ai_delete_finding', { p_finding_id: findingId })).error?.message).toMatch(/AI_FINDING_NOT_FOUND/);
      expect((await a.db().rpc('rpc_ai_decide_suggestion', { p_suggestion_id: suggestionId, p_decision: 'IGNORED' })).error?.message).toMatch(/AI_SUGGESTION_NOT_FOUND/);
    }
    const accept = await carol.db().rpc('rpc_ai_decide_suggestion', { p_suggestion_id: suggestionId, p_decision: 'ACCEPTED' });
    expect(accept.error?.message).toMatch(/AI_ACTION_NOT_ENABLED/);
    expect((await auditFor(findingId)).length).toBe(before);
    expect((await auditFor(suggestionId)).map((a) => a.action)).toEqual(['AI_SUGGESTION_CREATED']);
    expect((await admin.from('ai_suggestions').select('status').eq('id', suggestionId).single()).data!.status).toBe('PENDING');
  });

  it('AI1B-11 · owner ignores a suggestion, dismisses and deletes findings, each audited as USER', async () => {
    const ign = await carol.db().rpc('rpc_ai_decide_suggestion', { p_suggestion_id: suggestionId, p_decision: 'IGNORED' });
    expect(ign.data).toMatchObject({ changed: true, status: 'IGNORED' });
    const sAudit = await auditFor(suggestionId);
    expect(sAudit.find((a) => a.action === 'AI_SUGGESTION_IGNORED')).toMatchObject({ actor_id: carol.userId, metadata: { actor_kind: 'USER' } });

    const dis = await carol.db().rpc('rpc_ai_dismiss_finding', { p_finding_id: findingId });
    expect(dis.data).toMatchObject({ changed: true, status: 'DISMISSED' });
    const again = await carol.db().rpc('rpc_ai_dismiss_finding', { p_finding_id: findingId });
    expect(again.data).toMatchObject({ changed: false });
    expect((await auditFor(findingId)).filter((a) => a.action === 'AI_FINDING_DISMISSED')).toHaveLength(1);

    // A dismissed finding is never resurrected by re-ingest.
    const reingest = await svc('rpc_ai_ingest_finding', { p_actor_id: carol.userId!, p_run_id: runId, p_kind: 'email_event', p_dedupe_key: `k1-${run}`, p_title: 'Changed' });
    expect(reingest.data).toEqual({ finding_id: findingId, outcome: 'unchanged_closed' });
    expect((await admin.from('ai_findings').select('status, title').eq('id', findingId).single()).data).toMatchObject({ status: 'DISMISSED', title: 'Rejection from Acme' });

    const del = await carol.db().rpc('rpc_ai_delete_finding', { p_finding_id: findingId });
    expect(del.data).toMatchObject({ deleted: true });
    expect((await admin.from('ai_findings').select('id').eq('id', findingId)).data).toHaveLength(0);
    expect((await admin.from('ai_suggestions').select('id').eq('id', suggestionId)).data).toHaveLength(0); // cascade
    expect((await auditFor(findingId)).find((a) => a.action === 'AI_FINDING_DELETED')).toMatchObject({ metadata: { actor_kind: 'USER', suggestions_deleted: 1 } });
    expect((await admin.from('applications').select('id').eq('id', carolAppId)).data).toHaveLength(1); // core untouched
  });

  it('AI1B-12 · run transitions are constrained and audited', async () => {
    const r = await openRun(carol.userId!);
    const bad = await svc('rpc_ai_finalize_run', { p_actor_id: carol.userId!, p_run_id: r.run_id, p_status: 'QUEUED' });
    expect(bad.error?.message).toMatch(/AI_RUN_INVALID_TRANSITION/);
    const badCounts = await svc('rpc_ai_finalize_run', { p_actor_id: carol.userId!, p_run_id: r.run_id, p_status: 'SUCCEEDED', p_counts: { created: 'x' } });
    expect(badCounts.error?.message).toMatch(/AI_RUN_INVALID_COUNTS/);
    const errOnSuccess = await svc('rpc_ai_finalize_run', { p_actor_id: carol.userId!, p_run_id: r.run_id, p_status: 'SUCCEEDED', p_error_category: 'INTERNAL' });
    expect(errOnSuccess.error?.message).toMatch(/AI_RUN_ERROR_NOT_ALLOWED/);
    const other = await svc('rpc_ai_finalize_run', { p_actor_id: eve.userId!, p_run_id: r.run_id, p_status: 'FAILED' });
    expect(other.error?.message).toMatch(/AI_RUN_NOT_FOUND/);
    const ok = await svc('rpc_ai_finalize_run', { p_actor_id: carol.userId!, p_run_id: r.run_id, p_status: 'PARTIAL', p_counts: { created: 2, rejected: 1 }, p_error_category: 'PARTIAL_READ', p_error_detail: 'x'.repeat(900) });
    expect(ok.data).toMatchObject({ changed: true, status: 'PARTIAL' });
    const row = await admin.from('ai_runs').select('completed_at, error_detail, counts').eq('id', r.run_id).single();
    expect(row.data!.completed_at).not.toBeNull();
    expect(row.data!.error_detail).toHaveLength(500);
    const terminal = await svc('rpc_ai_finalize_run', { p_actor_id: carol.userId!, p_run_id: r.run_id, p_status: 'RUNNING' });
    expect(terminal.error?.message).toMatch(/AI_RUN_INVALID_TRANSITION/);
    const closedIngest = await svc('rpc_ai_ingest_finding', { p_actor_id: carol.userId!, p_run_id: r.run_id, p_kind: 'note', p_dedupe_key: `z-${run}`, p_title: 't' });
    expect(closedIngest.error?.message).toMatch(/AI_RUN_NOT_OPEN/);
    const audit = await auditFor(r.run_id);
    expect(audit.map((a) => a.action).sort()).toEqual(['AI_RUN_CREATED', 'AI_RUN_STATUS_CHANGED']);
    expect(audit.find((a) => a.action === 'AI_RUN_STATUS_CHANGED')!.metadata).toMatchObject({ from_status: 'RUNNING', to_status: 'PARTIAL', counts: { created: 2, rejected: 1 } });
    expect(JSON.stringify(audit)).not.toContain('xxxxxxxx'); // error_detail never audited
  });

  it('AI1B-13 · RPC input validation: schema version, initial status, dedupe key, payload shape', async () => {
    const v2 = await svc('rpc_ai_ingest_run', { p_actor_id: carol.userId!, p_workspace_id: ws, p_provider: 'claude', p_workflow: 'other', p_schema_version: '2.0' });
    expect(v2.error?.message).toMatch(/AI_SCHEMA_VERSION_UNSUPPORTED/);
    const term = await svc('rpc_ai_ingest_run', { p_actor_id: carol.userId!, p_workspace_id: ws, p_provider: 'claude', p_workflow: 'other', p_status: 'SUCCEEDED' });
    expect(term.error?.message).toMatch(/AI_RUN_INVALID_INITIAL_STATUS/);
    const prov = await svc('rpc_ai_ingest_run', { p_actor_id: carol.userId!, p_workspace_id: ws, p_provider: 'openai', p_workflow: 'other' });
    expect(prov.error?.code).toBe('23514');
    const r = await openRun(carol.userId!);
    const key = await svc('rpc_ai_ingest_finding', { p_actor_id: carol.userId!, p_run_id: r.run_id, p_kind: 'note', p_dedupe_key: 'has space', p_title: 't' });
    expect(key.error?.message).toMatch(/AI_FINDING_INVALID_DEDUPE_KEY/);
    const arr = await svc('rpc_ai_ingest_finding', { p_actor_id: carol.userId!, p_run_id: r.run_id, p_kind: 'note', p_dedupe_key: `p-${run}`, p_title: 't', p_payload: [1] });
    expect(arr.error?.message).toMatch(/AI_FINDING_INVALID_PAYLOAD/);
    const kind = await svc('rpc_ai_ingest_finding', { p_actor_id: carol.userId!, p_run_id: r.run_id, p_kind: 'malware', p_dedupe_key: `q-${run}`, p_title: 't' });
    expect(kind.error?.code).toBe('23514');
  });

  // ---------------------------------------------------------------- AI-1A constraints (outstanding from AI-1A)
  it('AI1B-14 · AI-1A table constraints, FKs, self-retry and set-null/cascade behave as defined', async () => {
    const base = { workspace_id: ws, user_id: carol.userId!, provider: 'claude', workflow: 'other' };
    expect((await admin.from('ai_runs').insert({ ...base, status: 'DONE' })).error?.code).toBe('23514');
    expect((await admin.from('ai_runs').insert({ ...base, schema_version: 'v1' })).error?.code).toBe('23514');
    expect((await admin.from('ai_runs').insert({ ...base, sources: {} })).error?.code).toBe('23514');
    expect((await admin.from('ai_runs').insert({ ...base, workspace_id: '00000000-0000-0000-0000-000000000000' })).error?.code).toBe('23503');
    const parent = await admin.from('ai_runs').insert(base).select('id').single();
    const pid = parent.data!.id;
    expect((await admin.from('ai_runs').update({ retry_of_run_id: pid }).eq('id', pid)).error?.code).toBe('23514');
    const child = await admin.from('ai_runs').insert({ ...base, trigger_type: 'retry', retry_of_run_id: pid }).select('id').single();
    expect(child.error).toBeNull();
    const f = await admin.from('ai_findings').insert({ workspace_id: ws, user_id: carol.userId!, run_id: pid, kind: 'note', provider: 'claude', title: 't', dedupe_key: `c-${run}` }).select('id').single();
    expect((await admin.from('ai_findings').insert({ workspace_id: ws, user_id: carol.userId!, kind: 'note', provider: 'claude', title: 't', dedupe_key: `c-${run}` })).error?.code).toBe('23505');
    expect((await admin.from('ai_findings').insert({ workspace_id: ws, user_id: carol.userId!, kind: 'note', provider: 'claude', title: 't', dedupe_key: `d-${run}`, confidence: 1.5 })).error?.code).toBe('23514');
    const s = await admin.from('ai_suggestions').insert({ workspace_id: ws, user_id: carol.userId!, finding_id: f.data!.id, action: 'other' }).select('id').single();
    expect((await admin.from('ai_suggestions').update({ status: 'IGNORED' }).eq('id', s.data!.id)).error?.code).toBe('23514'); // decision needs decided_at
    expect((await admin.from('ai_workflow_configs').insert({ workspace_id: ws, user_id: carol.userId!, workflow: 'other', primary_provider: 'claude', fallback_provider: 'claude' })).error?.code).toBe('23514');
    // Deleting the parent run nulls retry_of and finding.run_id; deleting the finding cascades suggestions.
    expect((await admin.from('ai_runs').delete().eq('id', pid)).error).toBeNull();
    expect((await admin.from('ai_runs').select('retry_of_run_id').eq('id', child.data!.id).single()).data!.retry_of_run_id).toBeNull();
    expect((await admin.from('ai_findings').select('run_id').eq('id', f.data!.id).single()).data!.run_id).toBeNull();
    await admin.from('ai_findings').delete().eq('id', f.data!.id);
    expect((await admin.from('ai_suggestions').select('id').eq('id', s.data!.id)).data).toHaveLength(0);
    record('ai1b-14-constraints', { checks: true, fk: true, selfRetry: true, setNull: true, cascade: true, unique: true });
  });

  it('AI1B-15 · no AI audit event carries finding content', async () => {
    const all = await admin.from('audit_events').select('action, metadata').eq('workspace_id', ws).like('action', 'AI_%');
    expect(all.data!.length).toBeGreaterThanOrEqual(8);
    const text = JSON.stringify(all.data);
    expect(text).not.toContain(FORBIDDEN_AUDIT_TEXT);
    expect(text).not.toContain('Rejection from Acme');
    expect(text).not.toContain('provider_message_id');
    record('ai1b-15-audit-content', { aiEvents: all.data!.length, contentLeak: false });
  });
});
