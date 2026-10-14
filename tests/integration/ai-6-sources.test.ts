import { beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, loadEnv, makeRecorder, serviceDb } from './harness';
import { emailTriageFinding, external, jobLeadFinding, recruiterIntelFinding } from '../unit/fixtures/ai-contract/external';

// AI-6: job leads (ai_job_leads child), email intelligence and recruiter intel against a REAL
// database: projection, cross-provider dedupe, audit, RLS (owner / manager / peer / other
// workspace), reads, review actions and Daily Digest integration. Local stack only (writes seed rows).
const ready = loadEnv();
const local = /^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.SUPABASE_URL ?? '');
const record = makeRecorder('test-results/evidence', 'integration');
const ON = { AI_HUB_ENABLED: 'true' };
const quiet = { env: ON, log: () => undefined };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe.skipIf(!ready || !local)('AI-6 — external intelligence sources (real DB, RLS)', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();
  const alice = new Actor(); // workspace manager
  const carol = new Actor(); // member, owner of the data
  const eve = new Actor(); // member, peer
  const dave = new Actor(); // unrelated workspace
  let ws: string;
  let daveWs: string;
  let svc: typeof import('../../apps/api/src/services/aiExternalIntelligenceService');
  let digestSvc: typeof import('../../apps/api/src/services/aiDigestService');
  let ingest: typeof import('../../apps/api/src/services/aiIntegrationService').ingestAiResult;
  let n = 0;
  const uniq = (p: string) => `${p}-${run}-${++n}`;
  const as = (a: Actor, workspaceId = ws) => ({ workspaceId, accessToken: a.token! });

  /** A job envelope whose posting identity is unique to this test run. */
  const jobDoc = (tag: string, opts: { provider?: string; payload?: Record<string, unknown>; finding?: Record<string, unknown>; runId?: string } = {}) => ({
    ...clone(external.jobDiscovery),
    provider: opts.provider ?? 'claude',
    run: { external_run_id: opts.runId ?? uniq('job'), generated_at: '2026-10-01T12:00:00Z' },
    findings: [jobLeadFinding({
      dedupe: { job_url: `https://jobs.example.com/${run}/${tag}` }, source: { url: `https://jobs.example.com/${run}/${tag}` },
      title: `Role ${tag}`, ...opts.finding,
    }, {
      job_url: `https://jobs.example.com/${run}/${tag}`, external_job_id: `EX-${run}-${tag}`, source_name: 'Example Jobs', role_title: `Role ${tag}`, ...opts.payload,
    })],
  });
  const emailDoc = (tag: string, opts: { provider?: string; finding?: Record<string, unknown>; payload?: Record<string, unknown> } = {}) => ({
    ...clone(external.emailTriage),
    provider: opts.provider ?? 'claude',
    run: { external_run_id: uniq('mail'), generated_at: '2026-10-01T12:00:00Z' },
    findings: [emailTriageFinding({ dedupe: { source_type: 'gmail', source_id: `msg-${run}-${tag}` }, title: `Email ${tag}`, ...opts.finding }, opts.payload ?? {})],
  });
  const recruiterDoc = (tag: string, opts: { provider?: string; finding?: Record<string, unknown>; payload?: Record<string, unknown> } = {}) => ({
    ...clone(external.recruiterIntel),
    provider: opts.provider ?? 'claude',
    run: { external_run_id: uniq('rec'), generated_at: '2026-10-01T12:00:00Z' },
    findings: [recruiterIntelFinding({ title: `Recruiter ${tag}`, ...opts.finding }, {
      recruiter_name: `Pat ${tag}`, profile_url: `https://example.com/team/${run}/${tag}`, related_job: undefined, ...opts.payload,
    })],
  });
  const submit = async (doc: unknown, owner: Actor = carol, workspaceId = ws) => {
    const r = await ingest({ workspaceId, userId: owner.userId!, actorKind: 'SERVICE_INGEST' }, doc, quiet);
    expect(r.runId, JSON.stringify(r.errors)).not.toBeNull();
    return r;
  };
  const leadRow = async (findingId: string) => (await admin.from('ai_job_leads').select('*').eq('finding_id', findingId).maybeSingle()).data as Record<string, any> | null;
  const leadsOf = async (a: Actor, filters = {}, page = {}, workspaceId = ws) => {
    const r = await svc.listJobLeads(as(a, workspaceId), filters, page, { env: ON });
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    return r.data;
  };
  const countApplications = async () => (await admin.from('applications').select('id', { count: 'exact', head: true }).eq('workspace_id', ws)).count ?? 0;

  beforeAll(async () => {
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache(); resetSigningMaterial(); resetAdminClient();
    svc = await import('../../apps/api/src/services/aiExternalIntelligenceService');
    digestSvc = await import('../../apps/api/src/services/aiDigestService');
    ({ ingestAiResult: ingest } = await import('../../apps/api/src/services/aiIntegrationService'));
    for (const [a, name] of [[alice, 'alice'], [carol, 'carol'], [eve, 'eve'], [dave, 'dave']] as const) {
      expect((await a.call('/auth/register', { username: `ai6_${name}_${run}`, password: `Valid-AI6-${name}-${run}!` })).status).toBe(201);
    }
    const prof = async (a: Actor) => (await admin.from('profiles').select('last_active_workspace_id').eq('user_id', a.userId!).single()).data!.last_active_workspace_id as string;
    ws = await prof(alice);
    daveWs = await prof(dave);
    // Static company names below are shared across runs: clear any earlier rows (local stack only).
    await admin.from('ai_findings').delete().in('payload->>company', ['Zeta Robotics', 'Other Corp', 'Statusco', 'Mailco', 'Recruitco', 'Daveco', 'Elsewhere']);
    expect((await admin.from('workspace_members').insert([
      { workspace_id: ws, user_id: carol.userId!, role: 'USER', status: 'ACTIVE' },
      { workspace_id: ws, user_id: eve.userId!, role: 'USER', status: 'ACTIVE' },
    ])).error).toBeNull();
  });

  // ---- job leads: storage, projection, audit ---------------------------------------------

  it('AI6-01 · a job lead is a finding plus a child row; the description lives in the child; the parent is audited once; no application is created', async () => {
    const apps0 = await countApplications();
    const r = await submit(jobDoc('01'));
    expect(r.status).toBe('SUCCEEDED');
    expect(r.counts.findingsCreated).toBe(1);
    const f = (await admin.from('ai_findings').select('*').eq('run_id', r.runId!).single()).data as Record<string, any>;
    expect(f).toMatchObject({ kind: 'job_lead', provider: 'claude', status: 'NEW', user_id: carol.userId, workspace_id: ws });
    expect(f.payload).not.toHaveProperty('description');
    const child = await leadRow(f.id);
    expect(child).toMatchObject({
      workspace_id: ws, user_id: carol.userId, company: 'Example Corp', title: 'Role 01', work_arrangement: 'hybrid', employment_type: 'full_time',
      salary_min: 150000, salary_max: 190000, salary_currency: 'USD', salary_period: 'year', match_score: 86, posted_date: '2026-09-28', description_truncated: false,
    });
    expect(child!.description).toContain('Build reliable systems');
    expect(child!.canonical_url).toBe(`https://jobs.example.com/${run}/01`);
    expect(child!.required_skills).toEqual(['TypeScript', 'PostgreSQL']);
    expect(new Date(child!.discovered_at).getTime()).toBeGreaterThan(Date.now() - 60_000); // discovered now, not the posting date
    const audits = (await admin.from('audit_events').select('action').eq('target_entity_id', f.id)).data!.map((x) => x.action);
    expect(audits).toEqual(['AI_FINDING_CREATED']); // the child projection adds no audit event
    expect(await countApplications()).toBe(apps0);
    record('ai6-01-job-lead', { child: true, audits, applicationsCreated: 0 });
  });

  it('AI6-02 · an over-long description is truncated at 30,000 characters and flagged; HTML is stored as plain text', async () => {
    const long = await submit(jobDoc('02', { payload: { description: 'é'.repeat(31_000) } }));
    expect(long.warnings.map((w) => w.code)).toContain('description_truncated');
    const f = (await admin.from('ai_findings').select('id, payload').eq('run_id', long.runId!).single()).data!;
    const child = await leadRow(f.id);
    expect([...child!.description].length).toBe(30_000);
    expect(child).toMatchObject({ description_truncated: true, description_length: 31_000 });
    expect(f.payload).toMatchObject({ description_truncated: true, description_length: 31_000 });
    const html = await submit(jobDoc('02b', { payload: { description: '<p>Hello &amp; welcome</p><script>alert(1)</script><ul><li>One</li></ul>' } }));
    const hf = (await admin.from('ai_findings').select('id').eq('run_id', html.runId!).single()).data!;
    expect((await leadRow(hf.id))!.description).not.toMatch(/<|alert/);
    // the DB itself refuses anything beyond the bound (defence in depth)
    const bad = await admin.from('ai_job_leads').update({ description: 'x'.repeat(30_001) }).eq('finding_id', f.id);
    expect(bad.error?.code).toBe('23514');
  });

  it('AI6-03 · cross-provider dedupe: the same posting from another provider updates ONE lead (same URL, then same board id without a URL)', async () => {
    const first = await submit(jobDoc('03', { provider: 'claude' }));
    const f1 = (await admin.from('ai_findings').select('id, dedupe_key').eq('run_id', first.runId!).single()).data!;
    // ChatGPT sees the same canonical URL (tracking params, different wording)
    const again = await submit(jobDoc('03', { provider: 'chatgpt', finding: { dedupe: { job_url: `https://Jobs.Example.com/${run}/03/?utm_source=x#apply` }, title: 'Different wording' }, payload: { match_score: 91 } }));
    expect(again.counts.findingsCreated).toBe(0);
    const rows = (await admin.from('ai_findings').select('id, provider, payload, dedupe_key').eq('user_id', carol.userId!).eq('kind', 'job_lead').eq('dedupe_key', f1.dedupe_key)).data!;
    expect(rows).toHaveLength(1);
    expect((await leadRow(f1.id))!.match_score).toBe(91); // updated while NEW
    // Gemini sends only the board id + source (no URL, other title): resolved to the same lead
    const byId = await submit(jobDoc('03', {
      provider: 'gemini',
      finding: { dedupe: {}, source: undefined, title: 'Yet another wording' },
      payload: { job_url: undefined, external_job_id: `EX-${run}-03`, source_name: 'example jobs' },
    }));
    expect(byId.counts.findingsCreated).toBe(0);
    const sameUrl = (await admin.from('ai_job_leads').select('finding_id').eq('user_id', carol.userId!).eq('canonical_url', `https://jobs.example.com/${run}/03`)).data!;
    expect(sameUrl).toEqual([{ finding_id: f1.id }]);
    // a genuinely different posting is a separate lead
    await submit(jobDoc('03-other'));
    const other = (await admin.from('ai_job_leads').select('finding_id').eq('user_id', carol.userId!).eq('canonical_url', `https://jobs.example.com/${run}/03-other`)).data!;
    expect(other).toHaveLength(1);
    expect(other[0]!.finding_id).not.toBe(f1.id);
    record('ai6-03-dedupe', { sameLogicalLead: true, providers: ['claude', 'chatgpt', 'gemini'] });
  });

  it('AI6-04 · a dismissed lead is never resurrected or rewritten by a later submission', async () => {
    const r = await submit(jobDoc('04'));
    const f = (await admin.from('ai_findings').select('id').eq('run_id', r.runId!).single()).data!;
    const dis = await carol.db().rpc('rpc_ai_dismiss_finding', { p_finding_id: f.id });
    expect(dis.error).toBeNull();
    const again = await submit(jobDoc('04', { payload: { match_score: 5, company: 'Changed Co' } }));
    expect(again.counts.findingsClosed).toBe(1);
    expect(await leadRow(f.id)).toMatchObject({ company: 'Example Corp', match_score: 86 });
    expect((await admin.from('ai_findings').select('status').eq('id', f.id).single()).data!.status).toBe('DISMISSED');
  });

  it('AI6-05 · the child cannot drift from its parent (composite FK) and deleting the finding removes the child', async () => {
    const r = await submit(jobDoc('05'));
    const f = (await admin.from('ai_findings').select('id').eq('run_id', r.runId!).single()).data!;
    await admin.from('ai_job_leads').delete().eq('finding_id', f.id); // free the 1:1 slot so the FK is what is tested
    const mismatched = await admin.from('ai_job_leads').insert({ finding_id: f.id, workspace_id: ws, user_id: eve.userId!, company: 'x', title: 'y' });
    expect(mismatched.error?.code).toBe('23503');
    const orphan = await admin.from('ai_job_leads').insert({ finding_id: '00000000-0000-4000-8000-000000000000', workspace_id: ws, user_id: carol.userId!, company: 'x', title: 'y' });
    expect(orphan.error?.code).toBe('23503');
    expect((await admin.rpc('rpc_ai_upsert_job_lead', { p_actor_id: carol.userId!, p_finding_id: f.id, p_lead: { company: 'Example Corp', title: 'Role 05' } })).error).toBeNull();
    expect(await leadRow(f.id)).not.toBeNull();
    const del = await carol.db().rpc('rpc_ai_delete_finding', { p_finding_id: f.id });
    expect(del.error).toBeNull();
    expect(await leadRow(f.id)).toBeNull();
  });

  it('AI6-06 · the projection rejects non-job findings, foreign actors and bad data with controlled item-level codes', async () => {
    const r = await submit(jobDoc('06'));
    const f = (await admin.from('ai_findings').select('id').eq('run_id', r.runId!).single()).data!;
    const lead = { company: 'A', title: 'B' };
    expect((await admin.rpc('rpc_ai_upsert_job_lead', { p_actor_id: eve.userId!, p_finding_id: f.id, p_lead: lead })).error?.message).toBe('AI_FINDING_NOT_FOUND');
    expect((await admin.rpc('rpc_ai_upsert_job_lead', { p_actor_id: carol.userId!, p_finding_id: f.id, p_lead: { title: 'B' } })).error?.message).toBe('AI_FINDING_INVALID_JOB_LEAD');
    expect((await admin.rpc('rpc_ai_upsert_job_lead', { p_actor_id: carol.userId!, p_finding_id: f.id, p_lead: { ...lead, salary_min: 'lots' } })).error?.message).toBe('AI_FINDING_INVALID_JOB_LEAD');
    expect((await admin.rpc('rpc_ai_upsert_job_lead', { p_actor_id: carol.userId!, p_finding_id: f.id, p_lead: { ...lead, match_score: 120 } })).error?.code).toBe('23514');
    const email = await submit(emailDoc('06'));
    const ef = (await admin.from('ai_findings').select('id').eq('run_id', email.runId!).single()).data!;
    expect((await admin.rpc('rpc_ai_upsert_job_lead', { p_actor_id: carol.userId!, p_finding_id: ef.id, p_lead: lead })).error?.message).toBe('AI_FINDING_NOT_FOUND');
  });

  // ---- RLS ------------------------------------------------------------------------------------

  it('AI6-07 · RLS: owner and manager see the lead; a peer and another workspace see nothing; clients cannot write', async () => {
    const r = await submit(jobDoc('07'));
    const f = (await admin.from('ai_findings').select('id').eq('run_id', r.runId!).single()).data!;
    const seen = async (a: Actor) => ((await a.db().from('ai_job_leads').select('finding_id').eq('finding_id', f.id)).data ?? []).length;
    expect(await seen(carol)).toBe(1);
    expect(await seen(alice)).toBe(1); // manager parity with ai_findings
    expect(await seen(eve)).toBe(0); // peer
    expect(await seen(dave)).toBe(0); // other workspace
    const parentSeen = async (a: Actor) => ((await a.db().from('ai_findings').select('id').eq('id', f.id)).data ?? []).length;
    expect([await parentSeen(carol), await parentSeen(alice), await parentSeen(eve), await parentSeen(dave)]).toEqual([1, 1, 0, 0]); // child visibility == parent visibility
    // service-layer reads obey the same boundary
    expect((await leadsOf(carol)).items.some((l) => l.id === f.id)).toBe(true);
    expect((await leadsOf(eve)).items.some((l) => l.id === f.id)).toBe(false);
    expect((await leadsOf(dave, {}, {}, daveWs)).items).toHaveLength(0);
    expect((await leadsOf(dave, {}, {}, ws)).items).toHaveLength(0); // a forged workspace id yields nothing
    for (const a of [carol, alice, eve]) {
      expect((await a.db().from('ai_job_leads').insert({ finding_id: f.id, workspace_id: ws, user_id: a.userId!, company: 'x', title: 'y' })).error).not.toBeNull();
      await a.db().from('ai_job_leads').update({ company: 'hacked' }).eq('finding_id', f.id);
      await a.db().from('ai_job_leads').delete().eq('finding_id', f.id);
    }
    expect(await leadRow(f.id)).toMatchObject({ company: 'Example Corp' });
    expect((await admin.from('ai_job_leads').select('id').eq('finding_id', f.id)).data).toHaveLength(1);
    const rpc = await carol.db().rpc('rpc_ai_upsert_job_lead', { p_actor_id: carol.userId!, p_finding_id: f.id, p_lead: { company: 'x', title: 'y' } });
    expect(rpc.error).not.toBeNull(); // not executable by clients
    record('ai6-07-rls', { owner: 1, manager: 1, peer: 0, otherWorkspace: 0, clientWrites: 'denied' });
  });

  // ---- job lead reads --------------------------------------------------------------------------

  it('AI6-08 · listJobLeads filters, orders newest-first, paginates, flags strong matches and never returns the description', async () => {
    const tag = `08${run}`;
    await submit(jobDoc(`${tag}a`, { payload: { company: 'Zeta Robotics', role_title: 'Platform Engineer', location: 'Denver, CO', work_arrangement: 'remote', employment_type: 'contract', match_score: 92, posted_date: '2026-09-01' } }));
    await submit(jobDoc(`${tag}b`, { payload: { company: 'Zeta Robotics', role_title: 'Data Engineer', location: 'Remote', work_arrangement: 'hybrid', employment_type: 'full_time', match_score: 40, posted_date: '2026-09-20' } }));
    await submit(jobDoc(`${tag}c`, { provider: 'chatgpt', payload: { company: 'Other Corp', role_title: 'Unscored role', match_score: undefined, posted_date: undefined } }));
    const all = await leadsOf(carol, { search: 'zeta' });
    expect(all.items).toHaveLength(2);
    expect(all.items[0]!.discoveredAt >= all.items[1]!.discoveredAt).toBe(true);
    expect(JSON.stringify(all)).not.toContain('Build reliable systems'); // description never in list reads
    const byTitle = (items: Awaited<ReturnType<typeof leadsOf>>['items']) => Object.fromEntries(items.map((l) => [l.title, l]));
    const t = byTitle((await leadsOf(carol, { company: 'zeta robotics' })).items);
    expect(t['Platform Engineer']).toMatchObject({ matchScore: 92, strongMatch: true, workArrangement: 'remote', provider: 'claude' });
    expect(t['Data Engineer']).toMatchObject({ matchScore: 40, strongMatch: false });
    expect((await leadsOf(carol, { company: 'other corp' })).items[0]).toMatchObject({ matchScore: null, strongMatch: false, provider: 'chatgpt' });
    expect((await leadsOf(carol, { minMatchScore: 80, search: 'zeta' })).items.map((l) => l.title)).toEqual(['Platform Engineer']);
    expect((await leadsOf(carol, { workArrangement: 'hybrid', search: 'zeta' })).items.map((l) => l.title)).toEqual(['Data Engineer']);
    expect((await leadsOf(carol, { employmentType: 'contract', search: 'zeta' })).items).toHaveLength(1);
    expect((await leadsOf(carol, { location: 'denver', company: 'zeta' })).items.map((l) => l.title)).toEqual(['Platform Engineer']);
    expect((await leadsOf(carol, { provider: 'chatgpt', company: 'other corp' })).items).toHaveLength(1);
    expect((await leadsOf(carol, { provider: 'gemini', company: 'zeta' })).items).toHaveLength(0);
    expect((await leadsOf(carol, { postedSince: '2026-09-15', search: 'zeta' })).items.map((l) => l.title)).toEqual(['Data Engineer']);
    expect((await leadsOf(carol, { postedBefore: '2026-09-10', search: 'zeta' })).items.map((l) => l.title)).toEqual(['Platform Engineer']);
    expect((await leadsOf(carol, { discoveredSince: '2000-01-01T00:00:00Z', company: 'zeta' })).items).toHaveLength(2);
    expect((await leadsOf(carol, { discoveredBefore: '2000-01-01T00:00:00Z', company: 'zeta' })).items).toHaveLength(0);
    // pagination: bounded pages with lookahead
    const p0 = await leadsOf(carol, { company: 'zeta' }, { page: 0, pageSize: 1 });
    const p1 = await leadsOf(carol, { company: 'zeta' }, { page: 1, pageSize: 1 });
    expect([p0.items.length, p0.hasNext, p1.items.length, p1.hasNext]).toEqual([1, true, 1, false]);
    expect(p0.items[0]!.id).not.toBe(p1.items[0]!.id);
    // invalid input is rejected, not ignored
    for (const bad of [{ minMatchScore: 101 }, { workArrangement: 'moon' }, { status: 'WEIRD' }, { nope: 1 }, { postedSince: '2026-13-01' }]) {
      expect(await svc.listJobLeads(as(carol), bad as never, {}, { env: ON })).toMatchObject({ ok: false, error: { code: 'INVALID_FILTER' } });
    }
    expect(await svc.listJobLeads(as(carol), {}, { pageSize: 51 }, { env: ON })).toMatchObject({ ok: false, error: { code: 'INVALID_FILTER' } });
    expect(await svc.listJobLeads(as(carol), {}, {}, { env: {} })).toMatchObject({ ok: false, error: { code: 'AI_HUB_DISABLED' } });
    // search text cannot inject filter syntax
    expect((await leadsOf(carol, { search: 'x),company.neq.(' })).items).toHaveLength(0);
  });

  it('AI6-09 · status filters: ACTIVE excludes dismissed, DISMISSED and ALL include them', async () => {
    const r = await submit(jobDoc('09', { payload: { company: 'Statusco' } }));
    const f = (await admin.from('ai_findings').select('id').eq('run_id', r.runId!).single()).data!;
    await submit(jobDoc('09b', { payload: { company: 'Statusco' } }));
    expect((await carol.db().rpc('rpc_ai_dismiss_finding', { p_finding_id: f.id })).error).toBeNull();
    expect((await leadsOf(carol, { company: 'statusco', status: 'ACTIVE' })).items).toHaveLength(1);
    expect((await leadsOf(carol, { company: 'statusco', status: 'DISMISSED' })).items.map((l) => l.id)).toEqual([f.id]);
    expect((await leadsOf(carol, { company: 'statusco', status: 'ALL' })).items).toHaveLength(2);
    expect((await leadsOf(carol, { company: 'statusco' })).items).toHaveLength(2); // service default = ALL (provider context)
  });

  // ---- email intelligence ----------------------------------------------------------------------

  it('AI6-10 · email events: no body is stored, one finding per message across providers, filters and attention', async () => {
    const doc = emailDoc('10', { finding: { body: 'FULL-BODY-CANARY', raw_body: 'FULL-BODY-CANARY' }, payload: { body: 'FULL-BODY-CANARY', html: '<p>FULL-BODY-CANARY</p>', attachments: ['cv.pdf'], sender_domain: 'Pat@Example.com' } });
    const r = await submit(doc);
    expect(r.status).toBe('SUCCEEDED');
    expect(r.warnings.map((w) => w.code)).toContain('raw_body_rejected');
    const f = (await admin.from('ai_findings').select('*').eq('run_id', r.runId!).single()).data!;
    expect(JSON.stringify(f)).not.toMatch(/FULL-BODY-CANARY|cv\.pdf|pat@example/i);
    expect(f).toMatchObject({ kind: 'email_event', category: 'interview_invitation', priority: 'HIGH' });
    expect(f.payload).toMatchObject({ sender_name: 'Pat Recruiter', sender_domain: 'example.com', subject: 'Interview with Example Corp' });
    expect(f.evidence.length).toBeLessThanOrEqual(500);
    expect(f.source_ref).toMatchObject({ provider_message_id: `msg-${run}-10`, thread_id: 'thread-100' });

    // another provider classifies the same message differently: still ONE finding (message id identity)
    const other = await submit(emailDoc('10', { provider: 'gemini', finding: { category: 'follow_up', title: 'Different wording' } }));
    expect(other.counts.findingsCreated).toBe(0);
    expect((await admin.from('ai_findings').select('id').eq('user_id', carol.userId!).eq('kind', 'email_event').eq('dedupe_key', f.dedupe_key)).data).toHaveLength(1);
    // a different message with the same subject is separate
    await submit(emailDoc('10b', { payload: { subject: 'Interview with Example Corp' } }));
    const same = (await admin.from('ai_findings').select('id').eq('user_id', carol.userId!).eq('kind', 'email_event').eq('payload->>subject', 'Interview with Example Corp')).data!;
    expect(same.length).toBeGreaterThanOrEqual(2);
    record('ai6-10-email', { bodyStored: false, oneFindingPerMessage: true });
  });

  it('AI6-11 · listEmailIntelligence: category, company, needs-attention, received dates, privacy and RLS', async () => {
    await submit(emailDoc('11a', { finding: { category: 'rejection', priority: 'LOW', due_at: undefined, occurred_at: '2026-09-01T10:00:00Z', title: 'Rejection from Mailco' }, payload: { company: 'Mailco', needs_attention: undefined, deadline: undefined } }));
    await submit(emailDoc('11b', { finding: { category: 'assessment', priority: 'NORMAL', occurred_at: '2026-09-15T10:00:00Z', title: 'Assessment from Mailco' }, payload: { company: 'Mailco', needs_attention: undefined } }));
    await submit(emailDoc('11c', { finding: { category: 'application_confirmation', priority: 'INFO', due_at: undefined, occurred_at: '2026-09-20T10:00:00Z', title: 'Applied at Mailco' }, payload: { company: 'Mailco', needs_attention: undefined, deadline: undefined } }));
    const list = async (a: Actor, f = {}, page = {}) => {
      const r = await svc.listEmailIntelligence(as(a), f, page, { env: ON });
      if (!r.ok) throw new Error(JSON.stringify(r.error));
      return r.data;
    };
    const all = await list(carol, { company: 'mailco' });
    expect(all.items.map((e) => e.category)).toEqual(['application_confirmation', 'assessment', 'rejection']); // newest received first
    expect(all.items[0]).toMatchObject({ senderName: 'Pat Recruiter', senderDomain: 'example.com', company: 'Mailco', provider: 'claude', needsAttention: false });
    expect(JSON.stringify(all)).not.toMatch(/gmail-msg|provider_message_id|dedupe/);
    expect((await list(carol, { company: 'mailco', category: 'rejection' })).items).toHaveLength(1);
    expect((await list(carol, { company: 'mailco', needsAttention: true })).items.map((e) => e.category)).toEqual(['assessment']);
    expect((await list(carol, { company: 'mailco', receivedSince: '2026-09-10T00:00:00Z', receivedBefore: '2026-09-18T00:00:00Z' })).items.map((e) => e.category)).toEqual(['assessment']);
    expect((await list(carol, { company: 'mailco', provider: 'gemini' })).items).toHaveLength(0);
    expect((await list(carol, { company: 'mailco' }, { pageSize: 2 })).hasNext).toBe(true);
    // a dismissed email leaves the attention list
    const a = (await admin.from('ai_findings').select('id').eq('user_id', carol.userId!).eq('title', 'Assessment from Mailco').single()).data!;
    expect((await carol.db().rpc('rpc_ai_dismiss_finding', { p_finding_id: a.id })).error).toBeNull();
    expect((await list(carol, { company: 'mailco', needsAttention: true })).items).toHaveLength(0);
    expect((await list(eve, { company: 'mailco' })).items).toHaveLength(0); // peer
    expect((await list(alice, { company: 'mailco' })).items).toHaveLength(3); // manager parity
    expect((await svc.listEmailIntelligence(as(dave, daveWs), { company: 'mailco' }, {}, { env: ON }) as { ok: true; data: { items: unknown[] } }).data.items).toHaveLength(0);
    expect(await svc.listEmailIntelligence(as(carol), { category: 'marketing' } as never, {}, { env: ON })).toMatchObject({ ok: false, error: { code: 'INVALID_FILTER' } });
  });

  // ---- recruiter intelligence ------------------------------------------------------------------

  it('AI6-12 · recruiter intel: public source, no guessed contacts, cross-provider dedupe, related lead resolved only in scope', async () => {
    // the lead exists with a board id AND a URL; the recruiter references it by URL only
    await submit(jobDoc('12', { payload: { company: 'Recruitco', role_title: 'Staff Engineer' } }));
    const leadUrl = `https://jobs.example.com/${run}/12`;
    const doc = recruiterDoc('12', {
      finding: { source: { url: 'https://recruitco.example/team' } },
      payload: { company: 'Recruitco', contact_email: 'pat.12@recruitco.example', related_job: { job_url: leadUrl, company: 'Recruitco', title: 'Staff Engineer' } },
    });
    const r = await submit(doc);
    expect(r.warnings.map((w) => w.code)).toContain('contact_uncited_dropped');
    const f = (await admin.from('ai_findings').select('*').eq('run_id', r.runId!).single()).data!;
    expect(JSON.stringify(f)).not.toContain('pat.12@recruitco.example');
    expect(f.source_ref.url).toBe('https://recruitco.example/team');
    // same person from another provider (same profile URL) is the same finding
    const again = await submit(recruiterDoc('12', { provider: 'chatgpt', finding: { source: { url: 'https://recruitco.example/team' } }, payload: { company: 'Recruitco', related_job: { job_url: leadUrl } } }));
    expect(again.counts.findingsCreated).toBe(0);
    // a cited contact survives
    const cited = await submit(recruiterDoc('12c', { payload: { company: 'Recruitco', contact_email: 'ops@recruitco.example', contact_source_url: 'https://recruitco.example/contact' } }));
    const cf = (await admin.from('ai_findings').select('payload').eq('run_id', cited.runId!).single()).data!;
    expect(cf.payload).toMatchObject({ contact_email: 'ops@recruitco.example', contact_source_url: 'https://recruitco.example/contact' });

    const list = async (a: Actor, filters = {}, workspaceId = ws) => {
      const res = await svc.listRecruiterIntel(as(a, workspaceId), filters, {}, { env: ON });
      if (!res.ok) throw new Error(JSON.stringify(res.error));
      return res.data.items;
    };
    const mine = await list(carol, { company: 'recruitco' });
    const pat = mine.find((x) => x.name === 'Pat 12')!;
    expect(pat).toMatchObject({ company: 'Recruitco', verification: 'verified', provider: 'claude', contact: null });
    expect(pat.relatedLead).toMatchObject({ company: 'Recruitco', title: 'Staff Engineer' }); // resolved via the stored lead's canonical URL
    expect(mine.find((x) => x.name === 'Pat 12c')!.contact).toEqual({ email: 'ops@recruitco.example', sourceUrl: 'https://recruitco.example/contact' }); // AI-11E: no phone is ever stored
    expect((await list(carol, { search: 'pat 12c' })).map((x) => x.name)).toEqual(['Pat 12c']);
    // no fabricated association: an unrelated recruiter has no lead
    await submit(recruiterDoc('12x', { payload: { company: 'Elsewhere', related_job: { job_url: 'https://jobs.example.com/nope/404' } } }));
    expect((await list(carol, { company: 'elsewhere' }))[0]!.relatedLead).toBeNull();
    // RLS: peer and other workspace see nothing; the manager sees the owner's data but the lead resolves only under RLS
    expect(await list(eve, { company: 'recruitco' })).toHaveLength(0);
    expect(await list(dave, { company: 'recruitco' }, daveWs)).toHaveLength(0);
    expect((await list(alice, { company: 'recruitco' })).find((x) => x.name === 'Pat 12')!.relatedLead).not.toBeNull();
    record('ai6-12-recruiter', { contactGuessing: 'dropped', crossProviderDedupe: true });
  });

  it('AI6-13 · a recruiter cannot be linked to another workspace\'s lead (lookup is scoped by RLS + workspace)', async () => {
    await submit(jobDoc('13', { payload: { company: 'Daveco' } }), dave, daveWs);
    const leadUrl = `https://jobs.example.com/${run}/13`;
    await submit(recruiterDoc('13', { payload: { company: 'Daveco', related_job: { job_url: leadUrl } } }));
    const res = await svc.listRecruiterIntel(as(carol), { company: 'daveco' }, {}, { env: ON });
    expect(res.ok && res.data.items[0]!.relatedLead).toBeNull();
  });

  it('AI6-14 · a malformed finding is rejected without breaking the rest of the result (PARTIAL)', async () => {
    const doc = clone(external.multiSource) as { findings: Array<Record<string, any>>; run: Record<string, unknown> };
    doc.run = { external_run_id: uniq('multi'), generated_at: '2026-10-01T12:00:00Z' };
    doc.findings = [
      jobLeadFinding({ dedupe: { job_url: `https://jobs.example.com/${run}/14` }, source: { url: `https://jobs.example.com/${run}/14` } }, { job_url: `https://jobs.example.com/${run}/14`, external_job_id: `EX-${run}-14`, role_title: 'Multi 14' }),
      jobLeadFinding({}, { match_score: 500 }),
      emailTriageFinding({ dedupe: { source_type: 'gmail', source_id: `msg-${run}-14` }, title: 'Multi email 14' }),
      recruiterIntelFinding({ title: 'Multi recruiter 14' }, { profile_url: `https://example.com/team/${run}/14`, related_job: undefined, recruiter_name: 'Pat 14' }),
    ];
    const r = await submit(doc);
    expect(r.status).toBe('PARTIAL');
    expect(r.counts).toMatchObject({ findingsCreated: 3, rejectedItems: 1 });
    expect(r.errors).toEqual([]);
  });

  // ---- Daily Digest ------------------------------------------------------------------------------

  it('AI6-15 · Daily Digest: unavailable vs zero vs available; the stored snapshot never changes afterwards', async () => {
    // A fresh owner with no source runs: every external section is not_configured (never zero).
    const fresh = await digestSvc.buildDeterministicDigest({ workspaceId: daveWs, userId: dave.userId!, accessToken: dave.token! }, '2026-10-01', { env: ON });
    // dave has job leads from AI6-13 but no email/recruiter runs
    expect(fresh.ok).toBe(true);
    const fp = (fresh as any).data.payload;
    // AI-11C: email is now the job_email / other_email pair; the 7-day lead lookback ends with the digest date
    expect(fp.sections.job_email).toEqual({ status: 'not_configured', items: [] });
    expect(fp.sections.other_email).toEqual({ status: 'not_configured', items: [] });
    expect(fp.sections.recruiter_intel).toEqual({ status: 'not_configured', items: [] });
    expect(fp.sections.job_leads.status).toBe('zero'); // job_discovery ran, but the lead was discovered today, not in the 7 days up to 2026-10-01
    expect(fp.summary).toMatchObject({ recruiters: 0, recent_jobs: 0 });

    // Carol: generate today's JobQuest digest (provider system) through the ingestion boundary.
    const gen = await digestSvc.generateSystemDigest({ workspaceId: ws, userId: carol.userId!, accessToken: carol.token! }, { env: ON, ingest: quiet });
    expect(gen.ok, JSON.stringify(gen)).toBe(true);
    if (!gen.ok) return;
    const stored = (await admin.from('ai_findings').select('id, payload').eq('user_id', carol.userId!).eq('kind', 'daily_brief').eq('dedupe_key', `daily_brief:${gen.data.digestDate}:system`).single()).data!;
    const p = stored.payload as any;
    expect(p.sections.job_leads.status).toBe('available');
    expect(p.summary.recent_jobs).toBeGreaterThan(0);
    expect(p.sections.job_leads.items.some((i: any) => typeof i.score === 'number' && i.score >= 80)).toBe(true);
    expect(p.sections.job_leads.items.every((i: any) => i.ref.type === 'job_lead' && i.application === undefined)).toBe(true);
    // email events were received on 2026-09/10, outside the email lookback: email triage has run => zero, not available
    expect(p.sections.job_email.status).toBe('zero');
    expect(p.sections.recruiter_intel.status).toBe('available'); // recruiter findings were created today
    // snapshot immutability: new data later must not rewrite the stored digest
    await submit(jobDoc('15-late', { payload: { match_score: 99 } }));
    const regen = await digestSvc.generateSystemDigest({ workspaceId: ws, userId: carol.userId!, accessToken: carol.token! }, { env: ON, ingest: quiet });
    expect(regen.ok && regen.data.ingest.duplicateRun).toBe(true);
    const after = (await admin.from('ai_findings').select('payload, content_hash').eq('id', stored.id).single()).data!;
    expect(after.payload).toEqual(stored.payload);
    record('ai6-15-digest', { jobLeads: p.sections.job_leads.status, email: p.sections.job_email.status, recruiter: p.sections.recruiter_intel.status, snapshotStable: true });
  });
});
