import { beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, loadEnv, makeRecorder, serviceDb } from './harness';
import { emailTriageFinding, jobLeadFinding } from '../unit/fixtures/ai-contract/external';

// AI-8: human-approved controlled actions against a REAL database. Preview performs no mutation; confirm re-reads and
// re-validates; one mutation per suggestion; stale/ambiguous/duplicate protection; authorization identical to normal
// JobQuest (owner / manager / peer / other workspace / suspended / forged); provenance; recovery. Local stack only.
const ready = loadEnv();
const local = /^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.SUPABASE_URL ?? '');
const record = makeRecorder('test-results/evidence', 'integration');
const ON = { AI_HUB_ENABLED: 'true' };
const quiet = { env: ON, log: () => undefined };
type AnyRow = Record<string, any>;

describe.skipIf(!ready || !local)('AI-8 — controlled actions (real DB, RLS)', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();
  const alice = new Actor(); // workspace manager
  const carol = new Actor(); // member, owner of the data
  const eve = new Actor(); // member, peer
  const frank = new Actor(); // member who is suspended later
  const dave = new Actor(); // unrelated workspace
  let ws: string;
  let daveWs: string;
  let svc: typeof import('../../apps/api/src/services/aiActionService');
  let ingest: typeof import('../../apps/api/src/services/aiIntegrationService').ingestAiResult;
  let n = 0;
  const uniq = (p: string) => `${p}-${run}-${++n}`;
  const ctxOf = (a: Actor, workspaceId = ws) => ({ workspaceId, userId: a.userId!, accessToken: a.token! });
  const D = { env: ON };

  const envelope = (workflow: string, findings: unknown[], suggestions: unknown[] = []) => ({
    contract: 'jobquest.ai-result', schema_version: '1.0', provider: 'claude', workflow,
    run: { external_run_id: uniq('run'), generated_at: '2026-10-12T12:00:00Z' }, sources: [], findings, suggestions, metadata: {},
  });
  const submit = async (doc: unknown, owner: Actor = carol, workspaceId = ws) => {
    const r = await ingest({ workspaceId, userId: owner.userId!, actorKind: 'SERVICE_INGEST' }, doc, quiet);
    expect(r.runId, JSON.stringify(r.errors)).not.toBeNull();
    return r;
  };

  /** A job lead with unique identity, plus one create_application suggestion. Returns the suggestion + finding ids. */
  const lead = async (tag: string, o: { company?: string; title?: string; location?: string; url?: string; ext?: string; suggestion?: Record<string, unknown>; owner?: Actor; payload?: Record<string, unknown> } = {}) => {
    const url = o.url ?? `https://jobs.example.com/posting/${run}-${tag}`;
    const finding = jobLeadFinding({ dedupe: { job_url: url }, title: `${o.title ?? 'Staff Engineer'} at ${o.company ?? `Co${tag}`}`, source: { url } }, {
      company: o.company ?? `Co${tag}`, role_title: o.title ?? 'Staff Engineer', job_url: url, external_job_id: o.ext ?? `EX-${run}-${tag}`, location: o.location ?? 'Austin, TX', ...o.payload,
    });
    const r = await submit(envelope('job_discovery', [finding], [{ finding_index: 0, action: 'create_application', proposed: {}, ...o.suggestion }]), o.owner ?? carol);
    expect(r.counts.suggestionsCreated, JSON.stringify(r.errors)).toBe(1);
    return idsOf(r.runId!);
  };
  const task = async (tag: string, o: { company?: string; title?: string; proposed?: Record<string, unknown>; due?: string | null; owner?: Actor; noCompany?: boolean } = {}) => {
    const finding = emailTriageFinding({ dedupe: { source_type: 'gmail', source_id: `msg-${run}-${tag}` }, title: `Assessment ${tag}`, due_at: o.due === null ? undefined : (o.due ?? '2026-10-20T17:00:00-05:00') },
      o.noCompany ? { company: undefined, role_title: undefined } : { company: o.company ?? `Mail${tag}`, role_title: o.title ?? 'Staff Engineer' });
    const r = await submit(envelope('email_triage', [finding], [{ finding_index: 0, action: 'create_task', proposed: { title: `Do the assessment ${tag}`, ...o.proposed } }]), o.owner ?? carol);
    expect(r.counts.suggestionsCreated, JSON.stringify(r.errors)).toBe(1);
    return idsOf(r.runId!);
  };
  const status = async (tag: string, proposed: Record<string, unknown>, o: { company?: string; title?: string; owner?: Actor } = {}) => {
    const finding = emailTriageFinding({ dedupe: { source_type: 'gmail', source_id: `msg-${run}-${tag}` }, title: `Update ${tag}` }, { company: o.company ?? `Mail${tag}`, role_title: o.title ?? 'Staff Engineer' });
    const r = await submit(envelope('email_triage', [finding], [{ finding_index: 0, action: 'set_status', proposed }]), o.owner ?? carol);
    expect(r.counts.suggestionsCreated, JSON.stringify(r.errors)).toBe(1);
    return idsOf(r.runId!);
  };
  async function idsOf(runId: string) {
    const f = (await admin.from('ai_findings').select('id').eq('run_id', runId).single()).data!;
    const s = (await admin.from('ai_suggestions').select('id, target_id').eq('finding_id', f.id).single()).data!;
    return { findingId: f.id as string, suggestionId: s.id as string, targetId: s.target_id as string | null };
  }

  /** Core application as the user would create it (RLS insert). */
  const makeApp = async (a: Actor, o: { company: string; title: string; url?: string | null; location?: string | null; ext?: string | null; stage?: string }) => {
    const { data, error } = await a.db().from('applications').insert({
      workspace_id: ws, user_id: a.userId!, company_name: o.company, role_title: o.title, stage: o.stage ?? 'APPLIED', job_url: o.url ?? null, location: o.location ?? null, external_job_id: o.ext ?? null,
    }).select('*').single();
    expect(error).toBeNull();
    return data as AnyRow;
  };
  const count = async (table: string, filter: Record<string, string> = {}) => {
    let q = admin.from(table).select('id', { count: 'exact', head: true }).eq('workspace_id', ws);
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    return (await q).count ?? 0;
  };
  const preview = async (a: Actor, suggestionId: string, workspaceId = ws) => svc.previewAiAction(ctxOf(a, workspaceId), suggestionId, D);
  const mustPreview = async (a: Actor, suggestionId: string) => {
    const r = await preview(a, suggestionId);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    return r.data;
  };
  const confirm = async (a: Actor, suggestionId: string, input: Parameters<typeof svc.confirmAiAction>[2], workspaceId = ws) => svc.confirmAiAction(ctxOf(a, workspaceId), suggestionId, input, D);
  const confirmFresh = async (a: Actor, suggestionId: string, extra: Omit<Parameters<typeof svc.confirmAiAction>[2], 'expectedFingerprint'> = {}) => {
    const p = await mustPreview(a, suggestionId);
    return confirm(a, suggestionId, { expectedFingerprint: p.fingerprint, ...extra });
  };
  const must = <T,>(r: { ok: true; data: T } | { ok: false; error: { code: string; message: string } }): T => {
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    return r.data;
  };
  const errCode = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? 'OK' : r.error!.code);

  beforeAll(async () => {
    process.env.AI_HUB_ENABLED = 'true'; // the HTTP-level test goes through the real app
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache(); resetSigningMaterial(); resetAdminClient();
    svc = await import('../../apps/api/src/services/aiActionService');
    ({ ingestAiResult: ingest } = await import('../../apps/api/src/services/aiIntegrationService'));
    for (const [a, name] of [[alice, 'alice'], [carol, 'carol'], [eve, 'eve'], [frank, 'frank'], [dave, 'dave']] as const) {
      expect((await a.call('/auth/register', { username: `ai8_${name}_${run}`, password: `Valid-AI8-${name}-${run}!` })).status).toBe(201);
    }
    const prof = async (a: Actor) => (await admin.from('profiles').select('last_active_workspace_id').eq('user_id', a.userId!).single()).data!.last_active_workspace_id as string;
    ws = await prof(alice);
    daveWs = await prof(dave);
    expect((await admin.from('workspace_members').insert([
      { workspace_id: ws, user_id: carol.userId!, role: 'USER', status: 'ACTIVE' },
      { workspace_id: ws, user_id: eve.userId!, role: 'USER', status: 'ACTIVE' },
      { workspace_id: ws, user_id: frank.userId!, role: 'USER', status: 'ACTIVE' },
    ])).error).toBeNull();
  });

  // ---- Job Lead -> Application ---------------------------------------------------------------------------------

  it('AI8-01 · preview mutates nothing; confirm creates ONE application (stage Saved) and keeps the lead; repeat is "already converted"', async () => {
    const ids = await lead('01');
    const apps0 = await count('applications'), exec0 = await count('ai_action_executions'), tasks0 = await count('tasks');
    const p = await mustPreview(carol, ids.suggestionId);
    expect(p).toMatchObject({ action: 'create_application', state: 'READY', confirmLabel: 'Create application', match: { result: 'NONE' } });
    expect(p.proposed.map((l) => l.label)).toEqual(expect.arrayContaining(['Company', 'Title', 'Location', 'Source URL', 'Initial stage']));
    expect(p.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(await count('applications')).toBe(apps0); expect(await count('ai_action_executions')).toBe(exec0); expect(await count('tasks')).toBe(tasks0);
    expect((await admin.from('ai_suggestions').select('status').eq('id', ids.suggestionId).single()).data!.status).toBe('PENDING');

    const done = must(await confirm(carol, ids.suggestionId, { expectedFingerprint: p.fingerprint }));
    expect(done).toMatchObject({ status: 'SUCCEEDED', action: 'create_application', targetType: 'application', result: 'created' });
    expect(await count('applications')).toBe(apps0 + 1);
    const app = (await admin.from('applications').select('*').eq('id', done.targetId).single()).data!;
    expect(app).toMatchObject({ company_name: 'Co01', role_title: 'Staff Engineer', stage: 'SAVED', status: 'OPEN', user_id: carol.userId, work_arrangement: 'Hybrid', employment_type: 'Full-time', salary_currency: 'USD', duplicate_override_flag: false, external_job_id: `EX-${run}-01` });
    expect(Number(app.salary_min)).toBe(150000);
    expect(app.job_url).toContain(`${run}-01`);
    const snap = (await admin.from('job_snapshots').select('job_description, skills').eq('application_id', done.targetId).maybeSingle()).data;
    expect(snap?.job_description).toContain('Build reliable systems');
    expect(snap?.skills).toContain('TypeScript');
    const events = (await admin.from('application_events').select('event_type').eq('application_id', done.targetId)).data!.map((e) => e.event_type);
    expect(events).toEqual(expect.arrayContaining(['CREATED', 'CAPTURED'])); // core audit stays authoritative
    // provenance + trusted link; the lead is preserved, not deleted
    const ex = (await admin.from('ai_action_executions').select('*').eq('suggestion_id', ids.suggestionId)).data!;
    expect(ex).toHaveLength(1);
    expect(ex[0]).toMatchObject({ status: 'SUCCEEDED', action_type: 'create_application', target_type: 'application', target_id: done.targetId, user_id: carol.userId, workspace_id: ws });
    expect(ex[0].idempotency_key).toMatch(/^[0-9a-f]{64}$/);
    const f = (await admin.from('ai_findings').select('status, application_id, kind').eq('id', ids.findingId).single()).data!;
    expect(f).toMatchObject({ status: 'ACCEPTED', application_id: done.targetId, kind: 'job_lead' });
    expect((await admin.from('ai_job_leads').select('id').eq('finding_id', ids.findingId)).data).toHaveLength(1);
    const s = (await admin.from('ai_suggestions').select('status, decided_by, applied_ref').eq('id', ids.suggestionId).single()).data!;
    expect(s).toMatchObject({ status: 'ACCEPTED', decided_by: carol.userId });
    expect(s.applied_ref).toMatchObject({ target_id: done.targetId, execution_id: ex[0].id });
    const audits = (await admin.from('audit_events').select('action, actor_id').eq('target_entity_id', ex[0].id)).data!;
    expect(audits).toEqual([expect.objectContaining({ action: 'AI_ACTION_EXECUTED', actor_id: carol.userId })]);

    // repeat: same fingerprint, then a fresh preview
    const again = await confirm(carol, ids.suggestionId, { expectedFingerprint: p.fingerprint });
    expect(errCode(again)).toBe('ACTION_ALREADY_EXECUTED');
    expect((again as any).error.existing).toEqual({ targetType: 'application', targetId: done.targetId });
    const after = await mustPreview(carol, ids.suggestionId);
    expect(after).toMatchObject({ state: 'ALREADY_EXECUTED', existing: { targetType: 'application', targetId: done.targetId } });
    expect(await count('applications')).toBe(apps0 + 1);
    record('ai8-01-conversion', { applications: 1, executions: 1, leadPreserved: true, stage: 'SAVED' });
  });

  it('AI8-02 · double click / concurrent confirm / HTTP retry / second suggestion on the same lead: ONE application', async () => {
    const ids = await lead('02');
    // a second suggestion on the same lead (e.g. from another run) can only be attached while the finding is open
    const { data: second } = await admin.rpc('rpc_ai_create_suggestion', { p_actor_id: carol.userId!, p_finding_id: ids.findingId, p_action: 'create_application', p_proposed: { priority: 'HIGH' } });
    const p = await mustPreview(carol, ids.suggestionId);
    const apps0 = await count('applications');
    const results = await Promise.all([1, 2, 3].map(() => confirm(carol, ids.suggestionId, { expectedFingerprint: p.fingerprint })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    // losers see the winner's write as ALREADY_EXECUTED, a stale fingerprint (the winner changed the suggestion) or an in-progress conflict
    for (const r of results.filter((x) => !x.ok)) expect(['ACTION_ALREADY_EXECUTED', 'ACTION_CONFLICT', 'ACTION_STALE']).toContain((r as any).error.code);
    expect(await count('applications')).toBe(apps0 + 1);
    expect(await count('ai_action_executions', { suggestion_id: ids.suggestionId })).toBe(1);
    // the other suggestion on the now converted lead can never create a second application
    expect((await admin.from('ai_suggestions').select('status').eq('id', second.suggestion_id).single()).data!.status).toBe('SUPERSEDED'); // moot, and out of the queue
    const dup = await mustPreview(carol, second.suggestion_id);
    expect(dup.state).toBe('ALREADY_EXECUTED');
    expect(errCode(await confirm(carol, second.suggestion_id, { expectedFingerprint: dup.fingerprint }))).toBe('ACTION_ALREADY_EXECUTED');
    expect(await count('applications')).toBe(apps0 + 1);
    record('ai8-02-idempotency', { applications: 1 });
  });

  it('AI8-03 · exact existing match: duplicate creation blocked; "use existing" links the lead without creating anything', async () => {
    const existing = await makeApp(carol, { company: 'ExactCo', title: 'Principal Engineer', url: `https://jobs.example.com/posting/${run}-03` });
    const ids = await lead('03', { company: 'ExactCo', title: 'Principal Engineer', ext: null as unknown as string });
    const p = await mustPreview(carol, ids.suggestionId);
    expect(p.match).toMatchObject({ result: 'EXACT', selectedId: existing.id });
    expect(p.match!.candidates[0]).toMatchObject({ basis: 'canonical_url' });
    expect(p.choices).toMatchObject({ createNew: false, useExisting: true });
    const apps0 = await count('applications');
    const blocked = await confirm(carol, ids.suggestionId, { expectedFingerprint: p.fingerprint, decision: 'create_new', confirmDuplicate: true });
    expect(errCode(blocked)).toBe('ACTION_CONFLICT');
    expect((blocked as any).error.existing).toEqual({ targetType: 'application', targetId: existing.id });
    expect(await count('applications')).toBe(apps0);
    expect(await count('ai_action_executions', { suggestion_id: ids.suggestionId })).toBe(0); // rejected before any claim
    const linked = must(await confirm(carol, ids.suggestionId, { expectedFingerprint: p.fingerprint, decision: 'use_existing' }));
    expect(linked).toMatchObject({ result: 'linked_existing', targetId: existing.id });
    expect(await count('applications')).toBe(apps0);
    expect((await admin.from('ai_findings').select('application_id, status').eq('id', ids.findingId).single()).data).toMatchObject({ application_id: existing.id, status: 'ACCEPTED' });
  });

  it('AI8-04 · strong match needs an explicit duplicate confirmation and is flagged duplicate_override; ambiguous never auto-selects', async () => {
    await makeApp(carol, { company: 'StrongCo', title: 'Data Engineer', location: 'Austin, TX', url: 'https://other.example.org/x' });
    const strong = await lead('04s', { company: 'StrongCo', title: 'Data Engineer', location: 'Austin, TX', ext: 'ZZ-1' });
    const ps = await mustPreview(carol, strong.suggestionId);
    expect(ps.match!.result).toBe('STRONG');
    expect(ps.requires.duplicateConfirmation).toBe(true);
    expect(errCode(await confirm(carol, strong.suggestionId, { expectedFingerprint: ps.fingerprint }))).toBe('ACTION_CONFLICT');
    const created = must(await confirm(carol, strong.suggestionId, { expectedFingerprint: ps.fingerprint, decision: 'create_new', confirmDuplicate: true }));
    expect((await admin.from('applications').select('duplicate_override_flag').eq('id', created.targetId).single()).data!.duplicate_override_flag).toBe(true);

    // ambiguous: two same company+title applications, no agreeing context
    const a1 = await makeApp(carol, { company: 'AmbigCo', title: 'SRE', location: 'Denver, CO' });
    const a2 = await makeApp(carol, { company: 'AmbigCo', title: 'SRE', location: 'Boston, MA' });
    const amb = await lead('04a', { company: 'AmbigCo', title: 'SRE', location: 'Remote - US', ext: 'AA-1' });
    const pa = await mustPreview(carol, amb.suggestionId);
    expect(pa.match!.result).toBe('AMBIGUOUS');
    expect(pa.match!.selectedId).toBeNull();
    expect(pa.requires.applicationSelection).toBe(true);
    expect(errCode(await confirm(carol, amb.suggestionId, { expectedFingerprint: pa.fingerprint }))).toBe('ACTION_AMBIGUOUS');
    expect(errCode(await confirm(carol, amb.suggestionId, { expectedFingerprint: pa.fingerprint, decision: 'use_existing' }))).toBe('ACTION_AMBIGUOUS');
    // an id that is not one of THIS action's candidates (here: another user's application) is refused
    const peerApp = await makeApp(eve, { company: 'AmbigCo', title: 'SRE' });
    const apps0 = await count('applications');
    expect(errCode(await confirm(carol, amb.suggestionId, { expectedFingerprint: pa.fingerprint, decision: 'use_existing', applicationId: peerApp.id }))).toBe('ACTION_VALIDATION_FAILED');
    expect(await count('applications')).toBe(apps0);
    expect(must(await confirm(carol, amb.suggestionId, { expectedFingerprint: pa.fingerprint, decision: 'use_existing', applicationId: a1.id })).targetId).toBe(a1.id);
    void a2;
  });

  it('AI8-05 · company alone is never a match; peers and other workspaces are invisible to matching', async () => {
    await makeApp(carol, { company: 'OnlyCo', title: 'Designer' });
    await makeApp(eve, { company: 'PeerCo', title: 'Staff Engineer', url: `https://jobs.example.com/posting/${run}-05` });
    const ids = await lead('05', { company: 'OnlyCo', title: 'Staff Engineer' });
    const p = await mustPreview(carol, ids.suggestionId);
    expect(p.match).toMatchObject({ result: 'NONE', candidates: [] }); // OnlyCo/Designer shares only the company; eve's app shares the URL but is not carol's
    // eve's own application is the same company+title, so it is a STRONG candidate for eve - and invisible to carol
    const mine = await lead('05b', { company: 'PeerCo', title: 'Staff Engineer', owner: eve });
    expect((await mustPreview(eve, mine.suggestionId)).match!.result).toBe('STRONG');
    const theirs = await lead('05c', { company: 'PeerCo', title: 'Staff Engineer' });
    expect((await mustPreview(carol, theirs.suggestionId)).match).toMatchObject({ result: 'NONE', candidates: [] });
  });

  it('AI8-06 · malformed / dismissed / unsupported: blocked with clear codes, nothing created', async () => {
    const apps0 = await count('applications');
    // a lead whose company is too long to be an application
    const long = await lead('06l', { company: 'C'.repeat(150) });
    const pl = await mustPreview(carol, long.suggestionId);
    expect(pl).toMatchObject({ state: 'BLOCKED', blocked: { code: 'ACTION_VALIDATION_FAILED' } });
    expect(errCode(await confirm(carol, long.suggestionId, { expectedFingerprint: pl.fingerprint }))).toBe('ACTION_VALIDATION_FAILED');
    // dismissed finding: its suggestions are IGNORED and cannot be applied
    const d = await lead('06d');
    expect((await carol.db().rpc('rpc_ai_dismiss_finding', { p_finding_id: d.findingId })).error).toBeNull();
    const pd = await mustPreview(carol, d.suggestionId);
    expect(pd.state).toBe('BLOCKED');
    expect(errCode(await confirm(carol, d.suggestionId, { expectedFingerprint: pd.fingerprint }))).toBe('ACTION_CONFLICT');
    // an unsupported action type stays inert
    const f = jobLeadFinding({ dedupe: { job_url: `https://jobs.example.com/posting/${run}-06u` } }, { job_url: `https://jobs.example.com/posting/${run}-06u` });
    const u = await submit(envelope('job_discovery', [f], [{ finding_index: 0, action: 'link_contact', proposed: {} }]));
    const ui = await idsOf(u.runId!);
    expect(errCode(await preview(carol, ui.suggestionId))).toBe('ACTION_NOT_SUPPORTED');
    expect(await count('applications')).toBe(apps0);
  });

  // ---- Task ----------------------------------------------------------------------------------------------------

  it('AI8-07 · task: due date from the finding deadline is shown; confirm creates ONE task linked to the single matching application; retry is idempotent', async () => {
    const app = await makeApp(carol, { company: 'TaskCo', title: 'Staff Engineer', stage: 'ASSESSMENT' });
    const ids = await task('07', { company: 'TaskCo' });
    const p = await mustPreview(carol, ids.suggestionId);
    expect(p).toMatchObject({ action: 'create_task', confirmLabel: 'Create task', match: { result: 'STRONG', selectedId: app.id } });
    expect(p.editable).toMatchObject({ dueDate: '2026-10-20', dueDateSource: 'finding_deadline', title: 'Do the assessment 07' });
    const tasks0 = await count('tasks');
    const done = must(await confirm(carol, ids.suggestionId, { expectedFingerprint: p.fingerprint }));
    expect(done).toMatchObject({ targetType: 'task', result: 'created' });
    const t = (await admin.from('tasks').select('*').eq('id', done.targetId).single()).data!;
    expect(t).toMatchObject({ title: 'Do the assessment 07', due_date: '2026-10-20', application_id: app.id, user_id: carol.userId, status: 'PENDING', task_type: 'TASK' });
    expect(t.details).toContain('Source: AI Hub (claude)');
    expect(await count('tasks')).toBe(tasks0 + 1);
    expect(errCode(await confirm(carol, ids.suggestionId, { expectedFingerprint: p.fingerprint }))).toBe('ACTION_ALREADY_EXECUTED');
    expect(await count('tasks')).toBe(tasks0 + 1);
    expect((await admin.from('ai_suggestions').select('status').eq('id', ids.suggestionId).single()).data!.status).toBe('ACCEPTED');
    // the finding itself is not converted by a task
    expect((await admin.from('ai_findings').select('application_id, status').eq('id', ids.findingId).single()).data).toMatchObject({ application_id: null });
    record('ai8-07-task', { tasks: 1, linkedApplication: true });
  });

  it('AI8-08 · task edits (title / due date / priority) are honoured and validated; ambiguity needs a choice; no-application is allowed', async () => {
    await makeApp(carol, { company: 'TwinCo', title: 'Staff Engineer', location: 'Denver' });
    await makeApp(carol, { company: 'TwinCo', title: 'Staff Engineer', location: 'Boston' });
    const ids = await task('08', { company: 'TwinCo', due: null, proposed: { due_date: '2026-11-02', priority: 'HIGH' } });
    const p = await mustPreview(carol, ids.suggestionId);
    expect(p.match!.result).toBe('AMBIGUOUS');
    expect(p.editable).toMatchObject({ dueDate: '2026-11-02', dueDateSource: 'suggestion', priority: 'HIGH' });
    expect(errCode(await confirm(carol, ids.suggestionId, { expectedFingerprint: p.fingerprint }))).toBe('ACTION_AMBIGUOUS');
    expect(errCode(await confirm(carol, ids.suggestionId, { expectedFingerprint: p.fingerprint, decision: 'no_application', edits: { dueDate: '2026-02-31' } }))).toBe('ACTION_VALIDATION_FAILED');
    expect(errCode(await confirm(carol, ids.suggestionId, { expectedFingerprint: p.fingerprint, decision: 'no_application', edits: { priority: 'URGENT' } }))).toBe('ACTION_VALIDATION_FAILED');
    expect(errCode(await confirm(carol, ids.suggestionId, { expectedFingerprint: p.fingerprint, decision: 'no_application', edits: { title: '   ' } }))).toBe('ACTION_VALIDATION_FAILED');
    expect(await count('ai_action_executions', { suggestion_id: ids.suggestionId })).toBe(0);
    const done = must(await confirm(carol, ids.suggestionId, { expectedFingerprint: p.fingerprint, decision: 'no_application', edits: { title: 'Edited title', dueDate: '2026-11-05', priority: 'LOW', details: null } }));
    const t = (await admin.from('tasks').select('*').eq('id', done.targetId).single()).data!;
    expect(t).toMatchObject({ title: 'Edited title', due_date: '2026-11-05', priority: 'LOW', application_id: null });
  });

  it('AI8-09 · a failed core mutation is recorded, does NOT mark the suggestion executed, creates nothing, and a re-reviewed retry succeeds once', async () => {
    const ids = await task('09', { noCompany: true });
    const p = await mustPreview(carol, ids.suggestionId);
    const real = carol.db();
    const failing = { from: (t: string) => (t === 'tasks' ? { insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: 'XX000', message: 'boom internal detail' } }) }) }) } : real.from(t)), rpc: real.rpc.bind(real) };
    const tasks0 = await count('tasks');
    const bad = await svc.confirmAiAction(ctxOf(carol), ids.suggestionId, { expectedFingerprint: p.fingerprint }, { ...D, client: failing as any });
    expect(errCode(bad)).toBe('ACTION_EXECUTION_FAILED');
    expect(JSON.stringify(bad)).not.toMatch(/boom|XX000/);
    expect(await count('tasks')).toBe(tasks0);
    expect((await admin.from('ai_suggestions').select('status').eq('id', ids.suggestionId).single()).data!.status).toBe('PENDING');
    const rows = (await admin.from('ai_action_executions').select('status, error_category, target_id').eq('suggestion_id', ids.suggestionId)).data!;
    expect(rows).toEqual([expect.objectContaining({ status: 'FAILED', error_category: 'ACTION_EXECUTION_FAILED' })]);
    const retry = must(await confirm(carol, ids.suggestionId, { expectedFingerprint: p.fingerprint }));
    expect(retry.status).toBe('SUCCEEDED');
    expect(await count('tasks')).toBe(tasks0 + 1);
    expect((await admin.from('ai_action_executions').select('status').eq('suggestion_id', ids.suggestionId).order('requested_at')).data!.map((r) => r.status)).toEqual(['FAILED', 'SUCCEEDED']);
  });

  // ---- Status --------------------------------------------------------------------------------------------------

  it('AI8-10 · status: current -> proposed is previewed; confirm moves the stage once through the existing RPC; at-target / closed are conflicts', async () => {
    const app = await makeApp(carol, { company: 'StageCo', title: 'Staff Engineer', stage: 'APPLIED' });
    const ids = await status('10', { stage: 'INTERVIEW', reason: 'Recruiter invited you to interview.' }, { company: 'StageCo' });
    const p = await mustPreview(carol, ids.suggestionId);
    expect(p).toMatchObject({ action: 'set_status', confirmLabel: 'Change status to Interview', match: { result: 'STRONG', selectedId: app.id } });
    expect(p.current).toEqual(expect.arrayContaining([{ label: 'Current', value: 'Applied' }]));
    expect(p.proposed[0]).toEqual({ label: 'Proposed', value: 'Interview' });
    expect((await admin.from('applications').select('stage').eq('id', app.id).single()).data!.stage).toBe('APPLIED'); // preview did nothing
    const done = must(await confirm(carol, ids.suggestionId, { expectedFingerprint: p.fingerprint }));
    expect(done).toMatchObject({ result: 'stage_changed', targetType: 'application', targetId: app.id });
    expect((await admin.from('applications').select('stage').eq('id', app.id).single()).data!.stage).toBe('INTERVIEW');
    const ev = (await admin.from('application_events').select('event_type, payload, actor_id').eq('application_id', app.id).eq('event_type', 'STAGE_CHANGED')).data!;
    expect(ev).toEqual([expect.objectContaining({ actor_id: carol.userId, payload: expect.objectContaining({ from_stage: 'APPLIED', to_stage: 'INTERVIEW' }) })]);
    expect(errCode(await confirm(carol, ids.suggestionId, { expectedFingerprint: p.fingerprint }))).toBe('ACTION_ALREADY_EXECUTED');
    expect((await admin.from('application_events').select('id').eq('application_id', app.id).eq('event_type', 'STAGE_CHANGED')).data).toHaveLength(1);

    // already at the proposed stage
    const same = await status('10b', { stage: 'INTERVIEW' }, { company: 'StageCo' });
    const ps = await mustPreview(carol, same.suggestionId);
    expect(errCode(await confirm(carol, same.suggestionId, { expectedFingerprint: ps.fingerprint }))).toBe('ACTION_CONFLICT');
    // rejection closes an OPEN application; a closed one cannot be changed again
    const rej = await status('10c', { outcome: 'REJECTED' }, { company: 'StageCo' });
    const pr = await mustPreview(carol, rej.suggestionId);
    expect(pr.confirmLabel).toBe('Mark as Rejected');
    expect(must(await confirm(carol, rej.suggestionId, { expectedFingerprint: pr.fingerprint })).result).toBe('closed');
    expect((await admin.from('applications').select('status, outcome').eq('id', app.id).single()).data).toMatchObject({ status: 'CLOSED', outcome: 'REJECTED' });
    const closed = await status('10d', { stage: 'OFFER' }, { company: 'StageCo' });
    expect(errCode(await confirm(carol, closed.suggestionId, { expectedFingerprint: (await mustPreview(carol, closed.suggestionId)).fingerprint }))).toBe('ACTION_CONFLICT');
    record('ai8-10-status', { stageChanges: 1, closed: 1 });
  });

  it('AI8-11 · stale state: a change after the preview is rejected (ACTION_STALE) and nothing is overwritten; a refreshed preview then works', async () => {
    const app = await makeApp(carol, { company: 'StaleCo', title: 'Staff Engineer', stage: 'APPLIED' });
    const ids = await status('11', { stage: 'OFFER' }, { company: 'StaleCo' });
    const p = await mustPreview(carol, ids.suggestionId);
    expect((await carol.db().from('applications').update({ notes: 'edited elsewhere' }).eq('id', app.id)).error).toBeNull();
    const stale = await confirm(carol, ids.suggestionId, { expectedFingerprint: p.fingerprint });
    expect(errCode(stale)).toBe('ACTION_STALE');
    expect((stale as any).error.message).toMatch(/changed/i);
    expect((await admin.from('applications').select('stage, notes').eq('id', app.id).single()).data).toMatchObject({ stage: 'APPLIED', notes: 'edited elsewhere' });
    expect(await count('ai_action_executions', { suggestion_id: ids.suggestionId })).toBe(0);
    const fresh = await mustPreview(carol, ids.suggestionId);
    expect(fresh.fingerprint).not.toBe(p.fingerprint);
    expect(must(await confirm(carol, ids.suggestionId, { expectedFingerprint: fresh.fingerprint })).result).toBe('stage_changed');
    // a forged / garbage fingerprint is stale, never trusted
    const other = await status('11b', { stage: 'OFFER' }, { company: 'StaleCo' });
    expect(errCode(await confirm(carol, other.suggestionId, { expectedFingerprint: 'f'.repeat(64) }))).toBe('ACTION_STALE');
  });

  it('AI8-12 · status for no match is blocked; for an ambiguous match the human must choose, and only among the candidates', async () => {
    const none = await status('12n', { stage: 'INTERVIEW' }, { company: 'NobodyCo' });
    const pn = await mustPreview(carol, none.suggestionId);
    expect(pn).toMatchObject({ state: 'BLOCKED', blocked: { code: 'ACTION_TARGET_NOT_FOUND' } });
    expect(errCode(await confirm(carol, none.suggestionId, { expectedFingerprint: pn.fingerprint }))).toBe('ACTION_TARGET_NOT_FOUND');

    const x = await makeApp(carol, { company: 'ChoiceCo', title: 'Staff Engineer', location: 'Denver' });
    const y = await makeApp(carol, { company: 'ChoiceCo', title: 'Staff Engineer', location: 'Boston' });
    const amb = await status('12a', { stage: 'ASSESSMENT' }, { company: 'ChoiceCo' });
    const pa = await mustPreview(carol, amb.suggestionId);
    expect(pa.match!.result).toBe('AMBIGUOUS');
    expect(pa.requires.applicationSelection).toBe(true);
    expect(errCode(await confirm(carol, amb.suggestionId, { expectedFingerprint: pa.fingerprint }))).toBe('ACTION_AMBIGUOUS');
    const foreign = await makeApp(eve, { company: 'ChoiceCo', title: 'Staff Engineer' });
    expect(errCode(await confirm(carol, amb.suggestionId, { expectedFingerprint: pa.fingerprint, applicationId: foreign.id }))).toBe('ACTION_VALIDATION_FAILED');
    expect(must(await confirm(carol, amb.suggestionId, { expectedFingerprint: pa.fingerprint, applicationId: y.id })).targetId).toBe(y.id);
    expect((await admin.from('applications').select('stage').eq('id', x.id).single()).data!.stage).toBe('APPLIED'); // the other one is untouched
  });

  // ---- provider cannot choose identity / validator -----------------------------------------------------------------

  it('AI8-13 · a provider cannot name an application, smuggle fields, or add an arbitrary action; the provided target is ignored', async () => {
    const app = await makeApp(carol, { company: 'TargetCo', title: 'Staff Engineer' });
    const f = emailTriageFinding({ dedupe: { source_type: 'gmail', source_id: `msg-${run}-13` } }, { company: 'TargetCo', role_title: 'Staff Engineer' });
    const r = await submit(envelope('email_triage', [f], [
      { finding_index: 0, action: 'set_status', target: { type: 'application', id: app.id }, proposed: { stage: 'OFFER' } },
      { finding_index: 0, action: 'set_status', proposed: { stage: 'OFFER', application_id: app.id } },
      { finding_index: 0, action: 'set_status', proposed: { stage: 'WAITING_ROOM' } },
      { finding_index: 0, action: 'create_task', proposed: { title: 'x', sql: 'drop table tasks' } },
      { finding_index: 0, action: 'execute_sql', proposed: {} },
      { finding_index: 0, action: 'create_application', proposed: {} }, // wrong finding kind
    ]));
    expect(r.counts.suggestionsCreated).toBe(1);
    expect(r.validationErrors.map((e) => e.code).sort()).toEqual(['action_invalid', 'action_invalid', 'action_invalid', 'action_invalid', 'enum']);
    expect(r.warnings.map((w) => w.code)).toContain('target_ignored');
    const ids = await idsOf(r.runId!);
    const row = (await admin.from('ai_suggestions').select('target_type, target_id, proposed').eq('id', ids.suggestionId).single()).data!;
    expect(row).toMatchObject({ target_type: null, target_id: null, proposed: { stage: 'OFFER' } });
    // the server still resolves the target itself (company+title), and the human still must confirm
    expect((await mustPreview(carol, ids.suggestionId)).match!.selectedId).toBe(app.id);
    expect((await admin.from('applications').select('stage').eq('id', app.id).single()).data!.stage).toBe('APPLIED');
  });

  // ---- authorization -------------------------------------------------------------------------------------------------

  it('AI8-14 · authorization: only the owner can preview/confirm; manager, peer, other workspace, forged workspace and suspended member cannot', async () => {
    const ids = await task('14', { noCompany: true });
    const p = await mustPreview(carol, ids.suggestionId);
    for (const [who, a] of [['manager', alice], ['peer', eve], ['other workspace', dave]] as const) {
      expect(errCode(await preview(a, ids.suggestionId)), `preview ${who}`).toBe('ACTION_TARGET_NOT_FOUND');
      expect(errCode(await confirm(a, ids.suggestionId, { expectedFingerprint: p.fingerprint })), `confirm ${who}`).toBe('ACTION_TARGET_NOT_FOUND');
    }
    expect(errCode(await preview(dave, ids.suggestionId, daveWs))).toBe('ACTION_TARGET_NOT_FOUND');
    expect(errCode(await preview(carol, ids.suggestionId, daveWs))).toBe('ACTION_TARGET_NOT_FOUND'); // forged workspace for the owner's own id
    expect(await count('ai_action_executions', { suggestion_id: ids.suggestionId })).toBe(0);
    expect(errCode(await svc.previewAiAction({ workspaceId: ws, userId: carol.userId!, accessToken: 'x'.repeat(10) }, ids.suggestionId, D))).toBe('INVALID_CONTEXT');
    expect(errCode(await svc.previewAiAction(ctxOf(carol), ids.suggestionId, { env: { AI_HUB_ENABLED: 'false' } }))).toBe('AI_HUB_DISABLED');
    // a suspended member loses access with the membership
    const fi = await task('14f', { owner: frank, noCompany: true });
    const pf = await mustPreview(frank, fi.suggestionId);
    expect((await admin.from('workspace_members').update({ status: 'SUSPENDED' }).eq('workspace_id', ws).eq('user_id', frank.userId!)).error).toBeNull();
    expect(errCode(await preview(frank, fi.suggestionId))).toBe('ACTION_TARGET_NOT_FOUND');
    expect(errCode(await confirm(frank, fi.suggestionId, { expectedFingerprint: pf.fingerprint }))).toBe('ACTION_TARGET_NOT_FOUND');
    expect(await count('tasks', { user_id: frank.userId! })).toBe(0);
    record('ai8-14-authz', { owner: 'allowed', manager: 'denied', peer: 'denied', otherWorkspace: 'denied', forged: 'denied', suspended: 'denied' });
  });

  it('AI8-15 · execution history RLS: owner and active manager can read; peer, other workspace and suspended cannot; clients cannot write; claim/complete are service-only', async () => {
    const ids = await task('15', { noCompany: true });
    const done = must(await confirmFresh(carol, ids.suggestionId));
    const seen = async (a: Actor) => ((await a.db().from('ai_action_executions').select('id').eq('suggestion_id', ids.suggestionId)).data ?? []).length;
    expect(await seen(carol)).toBe(1);
    expect(await seen(alice)).toBe(1);
    expect(await seen(eve)).toBe(0);
    expect(await seen(dave)).toBe(0);
    expect(await seen(frank)).toBe(0); // suspended
    const exec = (await admin.from('ai_action_executions').select('id').eq('suggestion_id', ids.suggestionId).single()).data!;
    for (const a of [carol, alice]) {
      expect((await a.db().from('ai_action_executions').insert({ workspace_id: ws, user_id: a.userId!, suggestion_id: ids.suggestionId, finding_id: ids.findingId, action_type: 'create_task', idempotency_key: 'x'.repeat(64), state_fingerprint: 'y' }).select()).error).not.toBeNull();
      const upd = await a.db().from('ai_action_executions').update({ status: 'FAILED' }).eq('id', exec.id).select();
      expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
      expect((await a.db().from('ai_action_executions').delete().eq('id', exec.id).select()).data ?? []).toHaveLength(0);
      expect((await a.db().rpc('rpc_ai_action_claim', { p_actor_id: a.userId!, p_suggestion_id: ids.suggestionId, p_action_type: 'create_task', p_target_type: 'task', p_target_id: done.targetId, p_idempotency_key: 'k', p_fingerprint: 'f', p_before: {}, p_correlation_id: null })).error).not.toBeNull();
      expect((await a.db().rpc('rpc_ai_action_complete', { p_actor_id: a.userId!, p_execution_id: exec.id, p_status: 'FAILED', p_target_type: null, p_target_id: null, p_after: {}, p_error_category: null, p_result: 'x' })).error).not.toBeNull();
    }
    expect((await admin.from('ai_action_executions').select('status').eq('id', exec.id).single()).data!.status).toBe('SUCCEEDED');
    // history DTO is the owner's own, bounded
    const h = must(await svc.listAiActionHistory(ctxOf(carol), 0, D));
    expect(h.items.some((i) => i.suggestionId === ids.suggestionId && i.status === 'SUCCEEDED')).toBe(true);
    expect(must(await svc.listAiActionHistory(ctxOf(eve), 0, D)).items.some((i) => i.suggestionId === ids.suggestionId)).toBe(false);
  });

  it('AI8-16 · rpc_ai_apply_status_change runs as the caller: another user\'s application is not found; a wrong version is stale; anon is refused', async () => {
    const app = await makeApp(carol, { company: 'RpcCo', title: 'Staff Engineer' });
    const call = (a: Actor, args: Record<string, unknown>) => a.db().rpc('rpc_ai_apply_status_change', args);
    expect((await call(eve, { p_application_id: app.id, p_expected_updated_at: app.updated_at, p_new_stage: 'OFFER' })).error?.message).toMatch(/APPLICATION_NOT_FOUND/);
    expect((await call(dave, { p_application_id: app.id, p_expected_updated_at: app.updated_at, p_new_stage: 'OFFER' })).error?.message).toMatch(/APPLICATION_NOT_FOUND/);
    expect((await call(carol, { p_application_id: app.id, p_expected_updated_at: '2020-01-01T00:00:00Z', p_new_stage: 'OFFER' })).error?.message).toMatch(/ACTION_STALE/);
    expect((await call(carol, { p_application_id: app.id, p_expected_updated_at: app.updated_at, p_new_stage: 'OFFER', p_new_outcome: 'REJECTED' })).error?.message).toMatch(/AI_ACTION_INVALID/);
    expect((await call(carol, { p_application_id: app.id, p_expected_updated_at: app.updated_at, p_new_stage: 'NOT_A_STAGE' })).error?.message).toMatch(/INVALID_STAGE/);
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    expect((await anon.rpc('rpc_ai_apply_status_change', { p_application_id: app.id, p_expected_updated_at: app.updated_at, p_new_stage: 'OFFER' })).error).not.toBeNull();
    expect((await admin.from('applications').select('stage').eq('id', app.id).single()).data!.stage).toBe('APPLIED');
    // a manager may do what the normal UI lets a manager do (the RPC is the existing authority) - here: the workspace manager cannot see carol's app via this path unless RLS allows it
    const viaManager = await call(alice, { p_application_id: app.id, p_expected_updated_at: app.updated_at, p_new_stage: 'OFFER' });
    expect(viaManager.error === null || /APPLICATION_NOT_FOUND|NOT_AUTHORIZED/.test(viaManager.error.message)).toBe(true);
  });

  // ---- recovery -----------------------------------------------------------------------------------------------------

  it('AI8-17 · crash recovery: a stale PENDING whose target exists is reconciled to SUCCEEDED (no duplicate); one whose target does not exist is abandoned and retried once', async () => {
    // (a) mutation happened, completion lost
    const ids = await task('17a', { noCompany: true });
    const p = await mustPreview(carol, ids.suggestionId);
    const tid = (await import('node:crypto')).randomUUID();
    const claim = await admin.rpc('rpc_ai_action_claim', { p_actor_id: carol.userId!, p_suggestion_id: ids.suggestionId, p_action_type: 'create_task', p_target_type: 'task', p_target_id: tid, p_idempotency_key: 'a'.repeat(64), p_fingerprint: p.fingerprint, p_before: {}, p_correlation_id: null });
    expect(claim.data.outcome).toBe('claimed');
    expect((await carol.db().from('tasks').insert({ workspace_id: ws, user_id: carol.userId!, task_type: 'TASK', title: 'half done', priority: 'MEDIUM', details: `AI Hub action ref: ${claim.data.execution_id}` })).error).toBeNull();
    const inProgress = await confirm(carol, ids.suggestionId, { expectedFingerprint: p.fingerprint });
    expect(errCode(inProgress)).toBe('ACTION_CONFLICT'); // fresh PENDING: another request is working on it
    await admin.from('ai_action_executions').update({ requested_at: new Date(Date.now() - 10 * 60_000).toISOString() }).eq('id', claim.data.execution_id);
    const tasks0 = await count('tasks');
    expect(errCode(await confirm(carol, ids.suggestionId, { expectedFingerprint: p.fingerprint }))).toBe('ACTION_ALREADY_EXECUTED');
    expect(await count('tasks')).toBe(tasks0);
    expect((await admin.from('ai_action_executions').select('status').eq('id', claim.data.execution_id).single()).data!.status).toBe('SUCCEEDED');
    expect((await admin.from('ai_suggestions').select('status').eq('id', ids.suggestionId).single()).data!.status).toBe('ACCEPTED');

    // (b) crashed before the mutation
    const ids2 = await task('17b', { noCompany: true });
    const p2 = await mustPreview(carol, ids2.suggestionId);
    const claim2 = await admin.rpc('rpc_ai_action_claim', { p_actor_id: carol.userId!, p_suggestion_id: ids2.suggestionId, p_action_type: 'create_task', p_target_type: 'task', p_target_id: (await import('node:crypto')).randomUUID(), p_idempotency_key: 'b'.repeat(64), p_fingerprint: p2.fingerprint, p_before: {}, p_correlation_id: null });
    await admin.from('ai_action_executions').update({ requested_at: new Date(Date.now() - 10 * 60_000).toISOString() }).eq('id', claim2.data.execution_id);
    const done = must(await confirm(carol, ids2.suggestionId, { expectedFingerprint: p2.fingerprint }));
    expect(done.status).toBe('SUCCEEDED');
    expect((await admin.from('ai_action_executions').select('status').eq('suggestion_id', ids2.suggestionId).order('requested_at')).data!.map((r) => r.status)).toEqual(['FAILED', 'SUCCEEDED']);
    expect(await count('tasks', { title: 'Do the assessment 17b' })).toBe(1);
  });

  it('AI8-17b · crash recovery for a job-lead conversion: a stale PENDING never blocks the lead forever (created -> reconciled; not created -> abandoned and retried)', async () => {
    // (a) the application was inserted but completion was lost
    const ids = await lead('17c');
    const p = await mustPreview(carol, ids.suggestionId);
    const appId = (await import('node:crypto')).randomUUID();
    const claim = await admin.rpc('rpc_ai_action_claim', { p_actor_id: carol.userId!, p_suggestion_id: ids.suggestionId, p_action_type: 'create_application', p_target_type: 'application', p_target_id: appId, p_idempotency_key: 'c'.repeat(64), p_fingerprint: p.fingerprint, p_before: {}, p_correlation_id: null });
    expect(claim.data.outcome).toBe('claimed');
    expect((await carol.db().from('applications').insert({ id: appId, workspace_id: ws, user_id: carol.userId!, company_name: 'Co17c', role_title: 'Staff Engineer', stage: 'SAVED' })).error).toBeNull();
    // fresh PENDING: blocked as in progress
    expect((await mustPreview(carol, ids.suggestionId)).state).toBe('BLOCKED');
    await admin.from('ai_action_executions').update({ requested_at: new Date(Date.now() - 10 * 60_000).toISOString() }).eq('id', claim.data.execution_id);
    const fresh = await mustPreview(carol, ids.suggestionId);
    expect(fresh.state).not.toBe('BLOCKED');
    const apps0 = await count('applications');
    expect(errCode(await confirm(carol, ids.suggestionId, { expectedFingerprint: fresh.fingerprint, decision: 'use_existing', applicationId: appId }))).toBe('ACTION_ALREADY_EXECUTED');
    expect(await count('applications')).toBe(apps0);
    expect((await admin.from('ai_findings').select('application_id, status').eq('id', ids.findingId).single()).data).toMatchObject({ application_id: appId, status: 'ACCEPTED' });
    expect((await admin.from('ai_suggestions').select('status').eq('id', ids.suggestionId).single()).data!.status).toBe('ACCEPTED');

    // (b) crashed before the insert
    const ids2 = await lead('17d');
    const p2 = await mustPreview(carol, ids2.suggestionId);
    const claim2 = await admin.rpc('rpc_ai_action_claim', { p_actor_id: carol.userId!, p_suggestion_id: ids2.suggestionId, p_action_type: 'create_application', p_target_type: 'application', p_target_id: (await import('node:crypto')).randomUUID(), p_idempotency_key: 'd'.repeat(64), p_fingerprint: p2.fingerprint, p_before: {}, p_correlation_id: null });
    await admin.from('ai_action_executions').update({ requested_at: new Date(Date.now() - 10 * 60_000).toISOString() }).eq('id', claim2.data.execution_id);
    const done = must(await confirmFresh(carol, ids2.suggestionId));
    expect(done.status).toBe('SUCCEEDED');
    expect((await admin.from('ai_action_executions').select('status').eq('finding_id', ids2.findingId).order('requested_at')).data!.map((r) => r.status)).toEqual(['FAILED', 'SUCCEEDED']);
    expect(await count('applications', { company_name: 'Co17d' })).toBe(1);
  });

  it('AI8-17c · an Ignore that raced a successful mutation does not leave the suggestion IGNORED', async () => {
    const ids = await task('17e', { noCompany: true });
    const p = await mustPreview(carol, ids.suggestionId);
    const claim = await admin.rpc('rpc_ai_action_claim', { p_actor_id: carol.userId!, p_suggestion_id: ids.suggestionId, p_action_type: 'create_task', p_target_type: 'task', p_target_id: null, p_idempotency_key: 'e'.repeat(64), p_fingerprint: p.fingerprint, p_before: {}, p_correlation_id: null });
    expect((await carol.db().rpc('rpc_ai_decide_suggestion', { p_suggestion_id: ids.suggestionId, p_decision: 'IGNORED' })).error).toBeNull();
    const t = await carol.db().from('tasks').insert({ workspace_id: ws, user_id: carol.userId!, task_type: 'TASK', title: 'raced', priority: 'MEDIUM' }).select('id').single();
    const done = await admin.rpc('rpc_ai_action_complete', { p_actor_id: carol.userId!, p_execution_id: claim.data.execution_id, p_status: 'SUCCEEDED', p_target_type: 'task', p_target_id: t.data!.id, p_after: {}, p_error_category: null, p_result: 'created' });
    expect(done.error).toBeNull();
    expect((await admin.from('ai_suggestions').select('status').eq('id', ids.suggestionId).single()).data!.status).toBe('ACCEPTED');
  });

  // ---- queue ---------------------------------------------------------------------------------------------------------

  it('AI8-18 · queue: only the owner\'s supported pending actions, with match state, filters, bounded paging; completed ones leave the queue', async () => {
    const ids = await lead('18', { company: 'QueueCo' });
    const q = must(await svc.listAiActionQueue(ctxOf(carol), {}, 0, D));
    const card = q.items.find((i) => i.suggestionId === ids.suggestionId)!;
    expect(card).toMatchObject({ action: 'create_application', provider: 'claude', kind: 'job_lead', target: { match: 'NONE' } });
    expect(card.summary).toBe('Create application: Staff Engineer at QueueCo');
    expect(q.pageSize).toBe(10);
    expect(q.pendingTotal).toBeGreaterThan(0);
    for (const bad of [{ action: 'delete_everything' }, { provider: 'x' }, { kind: 'y' }, { dateFrom: '2026-13-40' }]) expect(errCode(await svc.listAiActionQueue(ctxOf(carol), bad as any, 0, D))).toBe('ACTION_VALIDATION_FAILED');
    expect(errCode(await svc.listAiActionQueue(ctxOf(carol), {}, -1, D))).toBe('ACTION_VALIDATION_FAILED');
    const onlyTasks = must(await svc.listAiActionQueue(ctxOf(carol), { action: 'create_task' }, 0, D));
    expect(onlyTasks.items.every((i) => i.action === 'create_task')).toBe(true);
    expect(must(await svc.listAiActionQueue(ctxOf(carol), { kind: 'job_lead', provider: 'claude' }, 0, D)).items.some((i) => i.suggestionId === ids.suggestionId)).toBe(true);
    expect(must(await svc.listAiActionQueue(ctxOf(carol), { provider: 'gemini' }, 0, D)).items).toHaveLength(0);
    expect(must(await svc.listAiActionQueue(ctxOf(eve), {}, 0, D)).items.some((i) => i.suggestionId === ids.suggestionId)).toBe(false);
    expect(must(await svc.listAiActionQueue(ctxOf(alice), {}, 0, D)).items.some((i) => i.suggestionId === ids.suggestionId)).toBe(false); // manager reads AI rows, but the queue is the owner's
    must(await confirmFresh(carol, ids.suggestionId));
    expect(must(await svc.listAiActionQueue(ctxOf(carol), {}, 0, D)).items.some((i) => i.suggestionId === ids.suggestionId)).toBe(false);
    // a legacy suggestion with a free-form proposal is not actionable and is not shown
    const legacy = await lead('18l');
    const ins = await admin.from('ai_suggestions').insert({ workspace_id: ws, user_id: carol.userId!, finding_id: legacy.findingId, action: 'create_task', proposed: { anything: 'goes' } }).select('id').single();
    expect(ins.error).toBeNull();
    const after = must(await svc.listAiActionQueue(ctxOf(carol), {}, 0, D)).items;
    expect(after.some((i) => i.suggestionId === legacy.suggestionId)).toBe(true);
    expect(after.some((i) => i.suggestionId === ins.data!.id)).toBe(false);
    expect(errCode(await preview(carol, ins.data!.id))).toBe('OK'); // previewable only as a BLOCKED, never-executable plan
    expect((await mustPreview(carol, ins.data!.id)).state).toBe('BLOCKED');

    // AI-9: ONE canonical definition of an actionable pending action. The legacy row is PENDING in the table, yet it must not
    // inflate the count that the Overview card and the Daily Digest line show.
    const queueNow = must(await svc.listAiActionQueue(ctxOf(carol), {}, 0, D));
    const counted = must(await svc.countActionablePendingActions(ctxOf(carol), D));
    expect(counted.pendingTotal).toBe(queueNow.pendingTotal);
    expect(queueNow.pendingTotal).toBeGreaterThan(0);
    const raw = await admin.from('ai_suggestions').select('id', { count: 'exact', head: true })
      .eq('workspace_id', ws).eq('user_id', carol.userId!).eq('status', 'PENDING').in('action', ['create_application', 'create_task', 'set_status']);
    expect(raw.count!).toBeGreaterThan(counted.pendingTotal);
    // the legacy row is still readable (History / finding detail), only absent from the actionable set
    expect((await admin.from('ai_suggestions').select('id').eq('id', ins.data!.id).single()).data).not.toBeNull();
    // a peer's count never includes the owner's actions
    expect(must(await svc.countActionablePendingActions(ctxOf(eve), D)).pendingTotal).not.toBe(counted.pendingTotal);
  });
  it('AI9-1 · the count follows the queue: completing an action and dismissing a finding both lower it', async () => {
    const before = must(await svc.countActionablePendingActions(ctxOf(carol), D)).pendingTotal;
    const t = await task('9a', { noCompany: true });
    expect(must(await svc.countActionablePendingActions(ctxOf(carol), D)).pendingTotal).toBe(before + 1);
    must(await confirmFresh(carol, t.suggestionId));
    expect(must(await svc.countActionablePendingActions(ctxOf(carol), D)).pendingTotal).toBe(before);
    const t2 = await task('9b', { noCompany: true });
    expect(must(await svc.countActionablePendingActions(ctxOf(carol), D)).pendingTotal).toBe(before + 1);
    expect((await admin.from('ai_findings').update({ status: 'DISMISSED' }).eq('id', t2.findingId)).error).toBeNull();
    expect(must(await svc.countActionablePendingActions(ctxOf(carol), D)).pendingTotal).toBe(before);
    expect(must(await svc.listAiActionQueue(ctxOf(carol), {}, 0, D)).pendingTotal).toBe(before);
  });
  // ---- HTTP surface (the real Hono app) -----------------------------------------------------------------------------

  it('AI8-19 · HTTP: reads need a session, execute needs CSRF + a strict body, the browser flow creates ONE task, and errors never leak internals', async () => {
    const ids = await task('19', { noCompany: true });
    const q = `workspace_id=${ws}`;
    expect((await carol.call(`/ai/actions/queue?${q}`, undefined, { bearer: null })).status).toBe(401);
    expect((await carol.call(`/ai/actions/count?${q}`, undefined, { bearer: null })).status).toBe(401);
    expect((await carol.call(`/ai/actions/preview?${q}&suggestion_id=${ids.suggestionId}`, undefined, { bearer: null })).status).toBe(401);
    const queue = await carol.call(`/ai/actions/queue?${q}`);
    expect(queue.status).toBe(200);
    expect(queue.json.items.some((i: AnyRow) => i.suggestionId === ids.suggestionId)).toBe(true);
    const cnt = await carol.call(`/ai/actions/count?${q}`);
    expect(cnt.status).toBe(200);
    expect(cnt.json).toEqual({ pendingTotal: queue.json.pendingTotal });
    expect((await carol.call('/ai/actions/count?workspace_id=not-a-uuid')).status).toBe(400);
    expect((await carol.call(`/ai/actions/queue?${q}&action=delete_everything`)).status).toBe(422);
    expect((await carol.call('/ai/actions/queue?workspace_id=not-a-uuid')).status).toBe(400);
    expect((await carol.call(`/ai/actions/preview?${q}&suggestion_id=${ids.suggestionId}`, undefined, {})).json.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    // a peer cannot even see that the suggestion exists
    expect((await eve.call(`/ai/actions/preview?${q}&suggestion_id=${ids.suggestionId}`)).status).toBe(404);
    const pv = (await carol.call(`/ai/actions/preview?${q}&suggestion_id=${ids.suggestionId}`)).json;
    const body = { workspace_id: ws, suggestion_id: ids.suggestionId, expected_fingerprint: pv.fingerprint, decision: 'no_application' };
    expect((await carol.call('/ai/actions/execute', body, { csrf: false })).status).toBe(403); // CSRF
    expect((await carol.call('/ai/actions/execute', body, { origin: 'https://evil.example.com' })).status).toBe(403); // Origin
    expect((await carol.call('/ai/actions/execute', { ...body, application_id_override: 'x' })).status).toBe(422); // strict body
    expect((await carol.call('/ai/actions/execute', { ...body, edits: { sql: 'x' } })).status).toBe(422);
    expect((await carol.call('/ai/actions/execute', body, { bearer: null })).status).toBe(401);
    expect((await eve.call('/ai/actions/execute', body)).status).toBe(404);
    const tasks0 = await count('tasks');
    const ok1 = await carol.call('/ai/actions/execute', body);
    expect(ok1.status).toBe(200);
    expect(ok1.json).toMatchObject({ status: 'SUCCEEDED', action: 'create_task', targetType: 'task' });
    const again = await carol.call('/ai/actions/execute', body);
    expect(again.status).toBe(409);
    expect(again.json.error).toMatchObject({ code: 'ACTION_ALREADY_EXECUTED', existing: { targetType: 'task', targetId: ok1.json.targetId } });
    expect(await count('tasks')).toBe(tasks0 + 1);
    const stale = await carol.call('/ai/actions/execute', { ...body, suggestion_id: (await task('19b', { noCompany: true })).suggestionId, expected_fingerprint: 'e'.repeat(64) });
    expect(stale.status).toBe(409);
    expect(stale.json.error.code).toBe('ACTION_STALE');
    const hist = await carol.call(`/ai/actions/history?${q}`);
    expect(hist.status).toBe(200);
    expect(hist.json.items[0]).toMatchObject({ status: 'SUCCEEDED', action: 'create_task' });
    expect(JSON.stringify([queue.json, hist.json, ok1.json, again.json, stale.json])).not.toMatch(/dedupe_key|content_hash|idempotency_key|state_fingerprint|error_detail|service_role|user_id|workspace_id/);
    record('ai8-19-http', { csrf: 'enforced', strictBody: 'enforced', tasks: 1 });
  });
});
