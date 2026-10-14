import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Actor, loadEnv, makeRecorder, ORIGIN, serviceDb } from './harness';
import { emailTriageFinding, jobLeadFinding, recruiterIntelFinding } from '../unit/fixtures/ai-contract/external';

// AI-11G: the PULL-executor bridge against a REAL database and the REAL MCP endpoint. A provider's scheduled task claims one
// automation's occurrence through jobquest_claim_ai_execution; JobQuest decides, binds provider and workspace from the
// authenticated credential, and the existing submit/finalize path completes the run. No provider is ever called.
const ready = loadEnv();
const local = /^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.SUPABASE_URL ?? '');
const record = makeRecorder('test-results/evidence', 'integration');
const MCP_URL = 'http://localhost/api/mcp';
const issuer = 'http://localhost';
const redirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect';
const CANARY = 'SECRET-FAILURE-CANARY';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!ready || !local)('AI-11G — provider scheduler adapters / pull executor (real DB + real MCP)', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();
  const alice = new Actor(); // owner of every automation under test
  const dave = new Actor(); // owner in an unrelated workspace
  let ws = '';
  let daveWs = '';
  let appMod: typeof import('../../apps/api/src/app');
  let bridge: typeof import('../../apps/api/src/services/aiExecutorBridgeService');
  let disc: typeof import('../../apps/api/src/services/aiJobDiscoveryService');

  const auto: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  let rpcId = 0;
  const mcp = async (token: string, method: string, params?: unknown) => {
    const res = await appMod.app.request(MCP_URL, {
      method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, ...(params === undefined ? {} : { params }) }),
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}`, 'x-real-ip': `10.17.${run.charCodeAt(0) % 200}.${(rpcId % 200) + 1}` },
    });
    return { status: res.status, body: JSON.parse((await res.text()) || '{}') };
  };
  const payload = (out: { body: any }) => { if (out.body.result?.structuredContent) return out.body.result.structuredContent; const t = out.body.result?.content?.[0]?.text ?? '{}'; try { return JSON.parse(t); } catch { return { error: { code: 'MCP_PROTOCOL', message: t } }; } };
  const callTool = async (token: string, name: string, args: unknown) => {
    const out = await mcp(token, 'tools/call', { name, arguments: args });
    return { ...out, data: payload(out), isError: out.body.result?.isError === true };
  };
  const claimTool = (token: string, automationId: string, over: Record<string, unknown> = {}) => callTool(token, 'jobquest_claim_ai_execution', { automationId, ...over });
  const key = () => `k${randomBytes(6).toString('hex')}`;

  const body = (over: Record<string, unknown>) => ({
    workspace_id: ws, name: `Auto ${randomBytes(3).toString('hex')}`, workflow: 'daily_brief', enabled: true, provider: 'claude', cadence: 'daily',
    localTime: '08:00', timezone: 'America/Chicago', weekdays: [], sections: [], delivery: ['ai_hub'], ...over,
  });
  const mk = async (over: Record<string, unknown>) => {
    const r = await alice.call('/ai/automations', body(over));
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    return r.json.id as string;
  };
  const edit = (id: string, over: Record<string, unknown>) => alice.call(`/ai/automations/${id}`, body(over));
  const mkToken = async (a: Actor, wsId: string, provider: string | undefined, scopes = ['jobquest:read', 'ai:read', 'ai:ingest']) => {
    const r = await a.call('/ai/connector-tokens', { workspace_id: wsId, name: `tok ${provider ?? 'unbound'} ${randomBytes(2).toString('hex')}`, scopes, ...(provider ? { provider } : {}) });
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    return r.json.token as string;
  };
  const runRow = async (id: string) => (await admin.from('ai_runs').select('*').eq('id', id).single()).data as Record<string, any>;
  const runsOf = async (automationId: string) => ((await admin.from('ai_runs').select('*').eq('automation_id', automationId).order('created_at')).data ?? []) as Array<Record<string, any>>;
  const result = (provider: string, workflow: string, externalRunId: string, over: Record<string, unknown> = {}) => ({
    contract: 'jobquest.ai-result', schema_version: '1.0', provider, workflow,
    run: { external_run_id: externalRunId, generated_at: new Date().toISOString() }, sources: [], findings: [], suggestions: [], metadata: {}, ...over,
  });

  /**
   * Arm an automation so its latest scheduled occurrence is due at an injected "now": a daily UTC slot at the next minute boundary
   * (after the edit, so the edit-boundary rule holds and the database's +1 minute clock tolerance is never exceeded).
   */
  async function arm(id: string, over: Record<string, unknown> = {}): Promise<Date> {
    for (let i = 0; i < 6; i++) {
      const now0 = Date.now();
      const rem = 60_000 - (now0 % 60_000);
      if (rem < 2_500) { await sleep(rem + 200); continue; }
      const at = new Date(now0 + rem);
      const hh = String(at.getUTCHours()).padStart(2, '0');
      const mm = String(at.getUTCMinutes()).padStart(2, '0');
      const e = await edit(id, { ...over, localTime: `${hh}:${mm}`, timezone: 'UTC', cadence: 'daily' });
      expect(e.status, JSON.stringify(e.json)).toBe(200);
      if (Date.now() > at.getTime() - 300) continue;
      return at;
    }
    throw new Error('could not arm the automation');
  }

  // ---- OAuth (ChatGPT) --------------------------------------------------------------------------------------------------
  const pkce = () => { const verifier = randomBytes(32).toString('base64url'); return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }; };
  async function oauthAccessToken(scopes: string[]): Promise<string> {
    const headers = (json = true): Record<string, string> => {
      const h: Record<string, string> = { origin: ORIGIN, authorization: `Bearer ${alice.token}`, 'x-real-ip': '10.11.11.11' };
      if (json) h['content-type'] = 'application/json';
      const cookie = [...alice.jar].map(([k, v]) => `${k}=${v}`).join('; ');
      if (cookie) h.cookie = cookie;
      const csrf = alice.jar.get('jq_csrf');
      if (csrf) h['x-jq-csrf'] = csrf;
      return h;
    };
    const call = async (path: string, b?: unknown) => {
      const res = await appMod.app.request(`${issuer}/api${path}`, { method: b === undefined ? 'GET' : 'POST', headers: headers(b !== undefined), body: b === undefined ? undefined : JSON.stringify(b) });
      const text = await res.text(); let json: any = {}; try { json = JSON.parse(text); } catch { /* none */ }
      return { status: res.status, json, headers: res.headers };
    };
    const created = await call('/oauth/clients', { workspace_id: ws, provider: 'chatgpt', name: `chatgpt-${run}`, redirect_uris: [redirectUri], scopes });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const client = { id: created.json.client.client_id as string, secret: created.json.client_secret as string };
    const p = pkce(); const state = randomBytes(16).toString('base64url'); const resource = `${issuer}/api/mcp`;
    const start = await appMod.app.request(`${issuer}/api/oauth/authorize?${new URLSearchParams({
      response_type: 'code', client_id: client.id, redirect_uri: redirectUri, resource, scope: scopes.join(' '), state, code_challenge: p.challenge, code_challenge_method: 'S256',
    })}`, { headers: { 'x-real-ip': '10.11.11.12' } });
    expect(start.status).toBe(302);
    const requestId = new URLSearchParams(new URL(start.headers.get('location')!).hash.split('?')[1]).get('request_id')!;
    const decision = await call(`/oauth/requests/${requestId}/decision`, { approve: true });
    expect(decision.status, JSON.stringify(decision.json)).toBe(200);
    const code = new URL(decision.json.redirect_to).searchParams.get('code')!;
    const tokenRes = await appMod.app.request(`${issuer}/api/oauth/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-real-ip': '10.11.11.13', authorization: `Basic ${Buffer.from(`${client.id}:${client.secret}`).toString('base64')}` },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: p.verifier, resource }).toString(),
    });
    const json = await tokenRes.json() as any;
    expect(tokenRes.status, JSON.stringify(json)).toBe(200);
    return json.access_token as string;
  }

  beforeAll(async () => {
    process.env.AI_HUB_ENABLED = 'true';
    process.env.APP_ORIGINS = `${process.env.APP_ORIGINS ?? ORIGIN},${issuer}`;
    process.env.OAUTH_AUTHORIZE_IP_MAX_PER_MINUTE = '500';
    process.env.OAUTH_TOKEN_IP_MAX_PER_MINUTE = '500';
    process.env.OAUTH_CLIENT_USER_MAX_PER_HOUR = '500';
    process.env.MCP_TOKEN_RATE_LIMIT = '2000';
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache(); resetSigningMaterial(); resetAdminClient();
    appMod = await import('../../apps/api/src/app');
    bridge = await import('../../apps/api/src/services/aiExecutorBridgeService');
    disc = await import('../../apps/api/src/services/aiJobDiscoveryService');
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    expect((await alice.call('/auth/register', { username: `ai11g_alice_${run}`, password: `Valid-AI11G-alice-${run}!` })).status).toBe(201);
    expect((await dave.call('/auth/register', { username: `ai11g_dave_${run}`, password: `Valid-AI11G-dave-${run}!` })).status).toBe(201);
    const prof = async (a: Actor) => (await admin.from('profiles').select('last_active_workspace_id').eq('user_id', a.userId!).single()).data!.last_active_workspace_id as string;
    ws = await prof(alice);
    daveWs = await prof(dave);

    const hour = (new Date().getUTCHours() + 12) % 24;
    auto.digest = await mk({ name: `Morning ${run}`, workflow: 'daily_brief', provider: 'claude', sections: ['email_triage', 'job_discovery', 'recruiter_intel', 'calendar_review'] });
    auto.far = await mk({ name: `Far ${run}`, workflow: 'email_triage', provider: 'claude', localTime: `${String(hour).padStart(2, '0')}:00`, timezone: 'UTC' });
    auto.disabled = await mk({ name: `Off ${run}`, workflow: 'job_discovery', provider: 'claude', enabled: false });
    auto.manualOnly = await mk({ name: `Manual ${run}`, workflow: 'recruiter_intel', provider: 'claude', cadence: 'manual_only', localTime: null, timezone: null });
    auto.armed = await mk({ name: `Armed ${run}`, workflow: 'calendar_review', provider: 'claude' });
    auto.chatgpt = await mk({ name: `ChatGPT ${run}`, workflow: 'daily_brief', provider: 'chatgpt' });
    auto.gemini = await mk({ name: `Gemini ${run}`, workflow: 'daily_brief', provider: 'gemini' });
    tokens.claude = await mkToken(alice, ws, 'claude');
    tokens.chatgpt = await mkToken(alice, ws, 'chatgpt');
    tokens.gemini = await mkToken(alice, ws, 'gemini');
    tokens.unbound = await mkToken(alice, ws, undefined);
    tokens.readOnly = await mkToken(alice, ws, 'claude', ['jobquest:read', 'ai:read']);
    tokens.dave = await mkToken(dave, daveWs, 'claude');
  }, 60_000);
  afterAll(() => { vi.restoreAllMocks(); delete process.env.AI_HUB_ENABLED; });

  // ---- connector provider binding -------------------------------------------------------------------------------------------

  it('AI11G-01 · a connector token records the provider it was created for (owner-chosen at creation) and an invalid provider is refused', async () => {
    const list = await alice.call(`/ai/connector-tokens?workspace_id=${ws}`);
    expect(list.status).toBe(200);
    const providers = (list.json.tokens as Array<{ provider: string | null }>).map((t) => t.provider);
    expect(providers).toEqual(expect.arrayContaining(['claude', 'chatgpt', 'gemini', null]));
    expect(JSON.stringify(list.json)).not.toMatch(/jq_mcp_(dev|live)_[A-Za-z0-9]{40}/);
    const bad = await alice.call('/ai/connector-tokens', { workspace_id: ws, name: 'x', provider: 'openai' });
    expect(bad.status).toBe(422);
  });

  // ---- MCP surface ----------------------------------------------------------------------------------------------------------

  it('AI11G-02 · MCP: 15 tools = 12 reads + submit + the two execution tools; no core mutation tool; a read-only credential never sees the execution tools', async () => {
    const tools = (await mcp(tokens.claude!, 'tools/list')).body.result.tools as Array<{ name: string; annotations: Record<string, boolean> }>;
    expect(tools).toHaveLength(15);
    expect(tools.filter((t) => t.annotations.readOnlyHint !== true).map((t) => t.name).sort()).toEqual(['jobquest_claim_ai_execution', 'jobquest_report_ai_execution_failure', 'jobquest_submit_ai_result']);
    expect(tools.filter((t) => t.annotations.readOnlyHint === true)).toHaveLength(12);
    expect(tools.filter((t) => /application|task|contact|email|outreach|calendar_event|status/i.test(t.name) && t.annotations.readOnlyHint !== true)).toEqual([]);
    const ro = (await mcp(tokens.readOnly!, 'tools/list')).body.result.tools as Array<{ name: string }>;
    expect(ro).toHaveLength(12);
    expect(ro.map((t) => t.name)).not.toContain('jobquest_claim_ai_execution');
    // Calling it without ai:ingest is an HTTP 403 before any tool code runs.
    const denied = await mcp(tokens.readOnly!, 'tools/call', { name: 'jobquest_claim_ai_execution', arguments: { automationId: auto.digest } });
    expect(denied.status).toBe(403);
    const d = await mcp(tokens.readOnly!, 'tools/call', { name: 'jobquest_report_ai_execution_failure', arguments: { runId: auto.digest, category: 'INTERNAL', summary: 'x' } });
    expect(d.status).toBe(403);
    // Strict inputs: an attempt to pass identity is rejected, never honoured.
    const smuggle = await mcp(tokens.claude!, 'tools/call', { name: 'jobquest_claim_ai_execution', arguments: { automationId: auto.digest, provider: 'chatgpt', userId: dave.userId, workspaceId: daveWs } });
    expect(smuggle.body.result?.isError === true || smuggle.body.error !== undefined).toBe(true);
    // Existing read tools are unaffected.
    const apps = await callTool(tokens.claude!, 'jobquest_list_ai_runs', {});
    expect(apps.isError).toBe(false);
    record('ai11g-02', { tools: tools.length });
  });

  // ---- claim: identity, binding, isolation ----------------------------------------------------------------------------------

  it('AI11G-03 · provider binding: the authenticated provider claims only its own automation (Claude/ChatGPT/Gemini); wrong-provider and unbound credentials are refused and create nothing', async () => {
    const before = (await runsOf(auto.chatgpt!)).length + (await runsOf(auto.gemini!)).length + (await runsOf(auto.digest!)).length;
    const wrong: Array<[string, string]> = [['chatgpt', auto.digest!], ['gemini', auto.chatgpt!], ['claude', auto.gemini!], ['chatgpt', auto.gemini!]];
    for (const [who, target] of wrong) {
      const r = await claimTool(tokens[who]!, target, { trigger: 'manual', clientKey: key() });
      expect(r.isError, `${who} -> ${target}`).toBe(true);
      expect(r.data.error.code).toBe('PROVIDER_MISMATCH');
    }
    const unbound = await claimTool(tokens.unbound!, auto.digest!, { trigger: 'manual', clientKey: key() });
    expect(unbound.isError).toBe(true);
    expect(unbound.data.error.code).toBe('PROVIDER_UNBOUND');
    expect((await runsOf(auto.chatgpt!)).length + (await runsOf(auto.gemini!)).length + (await runsOf(auto.digest!)).length).toBe(before);
  });

  it('AI11G-04 · workspace isolation: another workspace cannot see or claim the automation', async () => {
    const r = await claimTool(tokens.dave!, auto.digest!, { trigger: 'manual', clientKey: key() });
    expect(r.isError).toBe(true);
    expect(r.data.error.code).toBe('AUTOMATION_NOT_FOUND');
    expect((await admin.from('ai_runs').select('id').eq('workspace_id', daveWs)).data).toEqual([]);
  });

  it('AI11G-05 · NOT_DUE, DISABLED and manual-only are clean stops: no run is created', async () => {
    const far = await claimTool(tokens.claude!, auto.far!);
    expect(far.isError).toBe(false);
    expect(far.data).toMatchObject({ status: 'NOT_DUE', reason: 'NOT_IN_WINDOW', claim: null, steps: [], submit: null });
    expect(typeof far.data.nextExpectedRunAt).toBe('string');
    expect(far.data.guidance).toMatch(/Stop/);
    expect(await runsOf(auto.far!)).toEqual([]);

    const off = await claimTool(tokens.claude!, auto.disabled!);
    expect(off.data).toMatchObject({ status: 'DISABLED' });
    const off2 = await claimTool(tokens.claude!, auto.disabled!, { trigger: 'manual', clientKey: key() });
    expect(off2.data).toMatchObject({ status: 'DISABLED' });
    expect(await runsOf(auto.disabled!)).toEqual([]);

    const mo = await claimTool(tokens.claude!, auto.manualOnly!);
    expect(mo.data).toMatchObject({ status: 'NOT_DUE', reason: 'MANUAL_ONLY' });
    expect(await runsOf(auto.manualOnly!)).toEqual([]);
    // A manual-only automation CAN be run attended through the provider (manual trigger), and that is a Manual run.
    const attended = await claimTool(tokens.claude!, auto.manualOnly!, { trigger: 'manual', clientKey: key() });
    expect(attended.data.status).toBe('CLAIMED');
    expect(attended.data.claim.trigger).toBe('manual');
  });

  it('AI11G-06 · a manual claim returns the canonical, credential-free context with the digest LAST, and a retried claim is idempotent', async () => {
    const clientKey = key();
    const first = await claimTool(tokens.claude!, auto.digest!, { trigger: 'manual', clientKey });
    expect(first.isError).toBe(false);
    expect(first.data.status).toBe('CLAIMED');
    const c = first.data.claim;
    expect(Object.keys(c).sort()).toEqual(['attempt', 'automationId', 'delivery', 'externalRunId', 'provider', 'retryOfRunId', 'runId', 'scheduledFor', 'sections', 'timezone', 'trigger', 'workflow']);
    expect(c).toMatchObject({ automationId: auto.digest, provider: 'claude', workflow: 'daily_brief', trigger: 'manual', attempt: 1, retryOfRunId: null });
    expect(c.externalRunId).toBe(`manual:${auto.digest}:${clientKey}`);
    expect(first.data.steps.map((s: { step: string }) => s.step)).toEqual(['email_triage', 'job_discovery', 'recruiter_intel', 'calendar_review', 'daily_brief']);
    expect(first.data.steps.at(-1).findingKind).toBeNull(); // the digest step is JobQuest's, not the provider's
    expect(first.data.submit).toMatchObject({ tool: 'jobquest_submit_ai_result', provider: 'claude', workflow: 'daily_brief', externalRunId: c.externalRunId, digestComposedByJobQuest: true });
    expect(JSON.stringify(first.data)).not.toMatch(/jq_mcp_|Bearer|secret|password|service_role|client_secret|access_token/i);
    const row = await runRow(c.runId);
    expect(row).toMatchObject({ status: 'RUNNING', trigger_type: 'manual', provider: 'claude', automation_id: auto.digest, user_id: alice.userId, workspace_id: ws });

    const again = await claimTool(tokens.claude!, auto.digest!, { trigger: 'manual', clientKey });
    expect(again.data).toMatchObject({ status: 'ALREADY_CLAIMED', claim: null, steps: [], submit: null });
    expect((await runsOf(auto.digest!)).filter((r) => r.external_run_id === c.externalRunId)).toHaveLength(1);
    // A manual claim needs a valid client key.
    const noKey = await claimTool(tokens.claude!, auto.digest!, { trigger: 'manual' });
    expect(noKey.isError).toBe(true);
    record('ai11g-06', { steps: first.data.steps.length });
  });

  it('AI11G-07 · eight concurrent claims of one manual run: exactly one winner, one run', async () => {
    const clientKey = key();
    const ctx = { workspaceId: ws, userId: alice.userId!, provider: 'claude' as const };
    const out = await Promise.all(Array.from({ length: 8 }, () => bridge.claimAutomationExecution(ctx, { automationId: auto.far!, trigger: 'manual', clientKey })));
    for (const o of out) expect(o.ok, JSON.stringify(o)).toBe(true);
    const statuses = out.map((o) => (o.ok ? o.data.status : 'ERR'));
    expect(statuses.filter((s) => s === 'CLAIMED')).toHaveLength(1);
    expect(statuses.filter((s) => s === 'ALREADY_CLAIMED')).toHaveLength(7);
    expect((await runsOf(auto.far!)).filter((r) => r.external_run_id === `manual:${auto.far}:${clientKey}`)).toHaveLength(1);
  });

  // ---- scheduled occurrence (injected clock) ---------------------------------------------------------------------------------

  it('AI11G-08 · a due scheduled occurrence is claimed exactly once among concurrent wakes; repeats are ALREADY_CLAIMED, then ALREADY_COMPLETED after the result', async () => {
    const at = await arm(auto.armed!, { workflow: 'calendar_review' });
    const now = () => new Date(at.getTime() + 1_000);
    const ctx = { workspaceId: ws, userId: alice.userId!, provider: 'claude' as const };
    const early = await bridge.claimAutomationExecution(ctx, { automationId: auto.armed! }, { now: () => new Date(at.getTime() - 120_000) });
    expect(early.ok && early.data.status).toBe('NOT_DUE'); // the provider woke slightly EARLY: no premature run
    expect(await runsOf(auto.armed!)).toEqual([]);

    const wakes = await Promise.all(Array.from({ length: 8 }, () => bridge.claimAutomationExecution(ctx, { automationId: auto.armed! }, { now })));
    for (const w of wakes) expect(w.ok, JSON.stringify(w)).toBe(true);
    const statuses = wakes.map((w) => (w.ok ? w.data.status : 'ERR'));
    expect(statuses.filter((s) => s === 'CLAIMED')).toHaveLength(1);
    expect(statuses.filter((s) => s === 'ALREADY_CLAIMED')).toHaveLength(7);
    const winner = wakes.find((w) => w.ok && w.data.status === 'CLAIMED')!;
    if (!winner.ok || !winner.data.claim) throw new Error('no winner');
    const rows = await runsOf(auto.armed!);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ trigger_type: 'scheduled', status: 'RUNNING', provider: 'claude' });
    expect(Date.parse(rows[0]!.scheduled_for)).toBe(at.getTime());
    expect(winner.data.claim.externalRunId).toMatch(/^auto:[0-9a-f-]{36}:\d{8}T\d{6}Z$/);
    expect(winner.data.claim.attempt).toBe(1);

    // The provider submits through the existing path with the claimed key; the run is finalized, the occurrence is then completed.
    const sub = await callTool(tokens.claude!, 'jobquest_submit_ai_result', { result: result('claude', winner.data.claim.workflow, winner.data.claim.externalRunId, { sources: [{ type: 'calendar', ref: 'primary', observed_at: new Date().toISOString(), status: 'ok' }] }) });
    expect(sub.isError, JSON.stringify(sub.data)).toBe(false);
    expect(sub.data).toMatchObject({ success: true, status: 'SUCCEEDED', runId: winner.data.claim.runId });
    expect(sub.data.digest).toBeUndefined(); // a single-purpose workflow composes no digest
    const done = await bridge.claimAutomationExecution(ctx, { automationId: auto.armed! }, { now });
    expect(done.ok && done.data).toMatchObject({ status: 'ALREADY_COMPLETED', reason: 'SUCCEEDED' });
    expect(await runsOf(auto.armed!)).toHaveLength(1);
    record('ai11g-08', { run: winner.data.claim.runId });
  }, 90_000);

  it('AI11G-09 · after an occurrence is outside the catch-up window nothing is replayed', async () => {
    const at = await arm(auto.far!, { workflow: 'email_triage' });
    const ctx = { workspaceId: ws, userId: alice.userId!, provider: 'claude' as const };
    const late = await bridge.claimAutomationExecution(ctx, { automationId: auto.far! }, { now: () => new Date(at.getTime() + 4 * 3_600_000) });
    expect(late.ok && late.data.status).toBe('NOT_DUE');
    // Put it far away again for any later test.
    await edit(auto.far!, { workflow: 'email_triage', localTime: `${String((new Date().getUTCHours() + 12) % 24).padStart(2, '0')}:00`, timezone: 'UTC' });
  }, 60_000);

  // ---- submit: finalization, composite ingest, digest last, guards -------------------------------------------------------------

  it('AI11G-10 · one claimed Morning Digest run takes heterogeneous findings in ONE result, applies the profile backstop, then JobQuest composes the digest LAST (idempotent on repeat)', async () => {
    await disc.saveJobDiscoveryProfile({ workspaceId: ws, userId: alice.userId! }, { workArrangements: ['remote', 'hybrid'], cities: ['Houston, TX'], freshnessWindowHours: 24 });
    const claimed = await claimTool(tokens.claude!, auto.digest!, { trigger: 'manual', clientKey: key() });
    expect(claimed.data.status).toBe('CLAIMED');
    const { runId, externalRunId } = claimed.data.claim;
    const stale = jobLeadFinding({ dedupe: { job_url: `https://jobs.example.com/old/${run}` }, source: { url: `https://jobs.example.com/old/${run}` } }, { job_url: `https://jobs.example.com/old/${run}`, external_job_id: `OLD-${run}`, posted_date: '2020-01-01' });
    const fresh = jobLeadFinding({ title: 'Software QA Engineer at Example Corp', dedupe: { job_url: `https://jobs.example.com/new/${run}` }, source: { url: `https://jobs.example.com/new/${run}` } }, { job_url: `https://jobs.example.com/new/${run}`, external_job_id: `NEW-${run}`, posted_at: new Date(Date.now() - 2 * 3_600_000).toISOString(), posted_date: undefined, work_arrangement: 'hybrid', location: 'Houston, TX', role_title: 'Software QA Engineer', experience_level: undefined, required_skills: ['Playwright', 'API testing'], description: 'Software testing and test automation with Playwright and SQL.' });
    const submission = result('claude', 'daily_brief', externalRunId, {
      sources: [
        { type: 'gmail', ref: 'job-search-scan', observed_at: new Date().toISOString(), status: 'unavailable', note: 'mailbox connector not enabled' },
        { type: 'job_site', ref: 'example jobs', observed_at: new Date().toISOString(), status: 'ok', count: 2 },
      ],
      findings: [
        emailTriageFinding({ dedupe: { source_type: 'gmail', source_id: `msg-${run}` } }),
        stale, fresh,
        recruiterIntelFinding({ source: { url: `https://example.com/team/${run}` } }, { profile_url: `https://example.com/team/${run}`, related_job: { job_url: `https://jobs.example.com/new/${run}` } }),
      ],
    });
    const sub = await callTool(tokens.claude!, 'jobquest_submit_ai_result', { result: submission });
    expect(sub.isError, JSON.stringify(sub.data)).toBe(false);
    expect(sub.data.runId).toBe(runId); // the claimed run, not a second one
    expect(sub.data.digest).toBe('COMPOSED');
    const row = await runRow(runId);
    expect(['SUCCEEDED', 'PARTIAL']).toContain(row.status);
    const sources = row.sources as Array<{ type: string; status: string }>;
    expect(sources.find((s) => s.type === 'gmail')?.status).toBe('unavailable'); // unavailable is never presented as zero
    const findings = (await admin.from('ai_findings').select('kind, dedupe_key').eq('run_id', runId)).data ?? [];
    expect(new Set(findings.map((f) => f.kind))).toEqual(new Set(['email_event', 'job_lead', 'recruiter_intel']));
    expect(findings.filter((f) => f.kind === 'job_lead')).toHaveLength(1); // the stale lead was dropped by the owner's profile, inside a composite run
    expect(sub.data.counts.filteredItems).toBeGreaterThanOrEqual(1);
    expect(findings.some((f) => f.kind === 'daily_brief')).toBe(false); // the provider authored no digest

    // Digest composed AFTER the intelligence: a system digest run exists and finished after the provider's run.
    const digests = (await admin.from('ai_runs').select('id, status, completed_at, provider').eq('user_id', alice.userId!).eq('provider', 'system').eq('workflow', 'daily_brief')).data ?? [];
    expect(digests).toHaveLength(1);
    expect(Date.parse(digests[0]!.completed_at as string)).toBeGreaterThanOrEqual(Date.parse(row.completed_at));

    // Repeating the submission (a lost response / timeout) duplicates nothing, including the digest.
    const again = await callTool(tokens.claude!, 'jobquest_submit_ai_result', { result: submission });
    expect(again.data).toMatchObject({ success: true, duplicateRun: true, runId });
    expect(again.data.digest).toBe('ALREADY_COMPOSED');
    expect((await admin.from('ai_findings').select('id').eq('run_id', runId)).data).toHaveLength(findings.length);
    expect((await admin.from('ai_runs').select('id').eq('user_id', alice.userId!).eq('provider', 'system').eq('workflow', 'daily_brief')).data).toHaveLength(1);
    record('ai11g-10', { kinds: [...new Set(findings.map((f) => f.kind))] });
  }, 60_000);

  it('AI11G-11 · submit guards: a bound credential can only submit as its own provider, and a lifecycle run key must have been claimed', async () => {
    const claimed = await claimTool(tokens.claude!, auto.digest!, { trigger: 'manual', clientKey: key() });
    const { runId, externalRunId } = claimed.data.claim;
    // ChatGPT credential naming the Claude run / Claude naming ChatGPT: refused, and the run is untouched.
    const asChatGpt = await callTool(tokens.chatgpt!, 'jobquest_submit_ai_result', { result: result('claude', 'daily_brief', externalRunId) });
    expect(asChatGpt.isError).toBe(true);
    expect(asChatGpt.data.error.code).toBe('PROVIDER_MISMATCH');
    const asClaude = await callTool(tokens.claude!, 'jobquest_submit_ai_result', { result: result('chatgpt', 'daily_brief', externalRunId) });
    expect(asClaude.data.error.code).toBe('PROVIDER_MISMATCH');
    expect((await runRow(runId)).status).toBe('RUNNING');
    // An invented lifecycle key (no claim) is refused instead of squatting an occurrence.
    const invented = await callTool(tokens.claude!, 'jobquest_submit_ai_result', { result: result('claude', 'daily_brief', `auto:${auto.digest}:20990101T000000Z`) });
    expect(invented.isError).toBe(true);
    expect(invented.data.error.code).toBe('RUN_NOT_CLAIMED');
    expect((await admin.from('ai_runs').select('id').eq('external_run_id', `auto:${auto.digest}:20990101T000000Z`)).data).toEqual([]);
    // Ordinary provider-side schedules (their own external ids) are unaffected.
    const own = await callTool(tokens.claude!, 'jobquest_submit_ai_result', { result: result('claude', 'email_triage', `claude-email-${run}`) });
    expect(own.isError, JSON.stringify(own.data)).toBe(false);
    // The legitimate submit still finalizes the right run.
    const ok = await callTool(tokens.claude!, 'jobquest_submit_ai_result', { result: result('claude', 'daily_brief', externalRunId) });
    expect(ok.data).toMatchObject({ success: true, runId });
  }, 60_000);

  // ---- failure reporting & stale claims -----------------------------------------------------------------------------------

  it('AI11G-12 · failure report: provider- and run-bound, sanitized and bounded, idempotent; a QUEUED, foreign-provider or foreign-workspace run is refused', async () => {
    const claimed = await claimTool(tokens.claude!, auto.digest!, { trigger: 'manual', clientKey: key() });
    const runId = claimed.data.claim.runId as string;
    const wrongProvider = await callTool(tokens.chatgpt!, 'jobquest_report_ai_execution_failure', { runId, category: 'INTERNAL', summary: 'not yours' });
    expect(wrongProvider.isError).toBe(true);
    expect(wrongProvider.data.error.code).toBe('PROVIDER_MISMATCH');
    const foreign = await callTool(tokens.dave!, 'jobquest_report_ai_execution_failure', { runId, category: 'INTERNAL', summary: 'not yours' });
    expect(foreign.data.error.code).toBe('RUN_NOT_FOUND');
    expect((await runRow(runId)).status).toBe('RUNNING');

    const summary = `Gmail failed for me@example.com at https://mail.example.com/x?t=abc Bearer ${CANARY}-${'z'.repeat(40)} ${'long text '.repeat(40)}`;
    const failed = await callTool(tokens.claude!, 'jobquest_report_ai_execution_failure', { runId, category: 'SOURCE_UNAVAILABLE', summary });
    expect(failed.isError, JSON.stringify(failed.data)).toBe(false);
    expect(failed.data).toMatchObject({ runId, status: 'FAILED', changed: true });
    const row = await runRow(runId);
    expect(row).toMatchObject({ status: 'FAILED', error_category: 'SOURCE_UNAVAILABLE' });
    expect(row.error_detail.length).toBeLessThanOrEqual(200);
    expect(row.error_detail).not.toMatch(new RegExp(`${CANARY}|example\\.com|https?://|Bearer`));
    const again = await callTool(tokens.claude!, 'jobquest_report_ai_execution_failure', { runId, category: 'INTERNAL', summary: 'second report' });
    expect(again.data).toMatchObject({ status: 'FAILED', changed: false });
    expect((await runRow(runId)).error_category).toBe('SOURCE_UNAVAILABLE'); // history is not rewritten

    // A QUEUED (never claimed) run and a non-lifecycle run cannot be failed through this tool.
    const queued = await admin.rpc('rpc_ai_execution_request', { p_actor_id: alice.userId, p_workspace_id: ws, p_automation_id: auto.digest, p_trigger_type: 'manual', p_scheduled_for: null, p_client_key: key(), p_retry_of_run_id: null });
    const q = await callTool(tokens.claude!, 'jobquest_report_ai_execution_failure', { runId: queued.data.run_id, category: 'INTERNAL', summary: 'x' });
    expect(q.data.error.code).toBe('NOT_CLAIMABLE');
    const plain = await callTool(tokens.claude!, 'jobquest_submit_ai_result', { result: result('claude', 'email_triage', `plain-${run}-${key()}`) });
    const p = await callTool(tokens.claude!, 'jobquest_report_ai_execution_failure', { runId: plain.data.runId, category: 'INTERNAL', summary: 'x' });
    expect(p.data.error.code).toBe('NOT_CLAIMABLE');
    await admin.from('ai_runs').update({ status: 'CANCELLED' }).eq('id', queued.data.run_id); // tidy: nothing left waiting
  }, 60_000);

  it('AI11G-13 · a claimed run whose provider vanished is failed (TIMEOUT) by the next claim and retried as a NEW linked run, at most three times', async () => {
    const clientKey = key();
    const first = await claimTool(tokens.claude!, auto.digest!, { trigger: 'manual', clientKey });
    const root = first.data.claim.runId as string;
    expect((await claimTool(tokens.claude!, auto.digest!, { trigger: 'manual', clientKey })).data.status).toBe('ALREADY_CLAIMED'); // fresh claim: not stale yet
    const old = new Date(Date.now() - 2 * 3_600_000).toISOString();
    expect((await admin.from('ai_runs').update({ started_at: old }).eq('id', root)).error).toBeNull();

    const recovered = await claimTool(tokens.claude!, auto.digest!, { trigger: 'manual', clientKey });
    expect(recovered.data.status).toBe('CLAIMED');
    expect(recovered.data.claim).toMatchObject({ attempt: 2, retryOfRunId: root, trigger: 'retry' });
    expect(recovered.data.claim.runId).not.toBe(root);
    expect(await runRow(root)).toMatchObject({ status: 'FAILED', error_category: 'TIMEOUT' });
    // Retry chain is bounded by the AI-11F limit.
    let last = recovered.data.claim.runId as string;
    for (let n = 3; n <= 4; n++) {
      await admin.from('ai_runs').update({ started_at: old }).eq('id', last);
      const next = await claimTool(tokens.claude!, auto.digest!, { trigger: 'manual', clientKey });
      expect(next.data.status, JSON.stringify(next.data)).toBe('CLAIMED');
      expect(next.data.claim.attempt).toBe(n);
      last = next.data.claim.runId;
    }
    await admin.from('ai_runs').update({ started_at: old }).eq('id', last);
    const exhausted = await claimTool(tokens.claude!, auto.digest!, { trigger: 'manual', clientKey });
    expect(exhausted.data).toMatchObject({ status: 'RETRY_LIMIT_REACHED' });
    expect(((await runsOf(auto.digest!)).filter((r) => r.retry_of_run_id === root))).toHaveLength(3);
  }, 60_000);

  // ---- OAuth principal (ChatGPT) and readiness ---------------------------------------------------------------------------------

  it('AI11G-14 · an OAuth credential takes its provider from the OAuth client: ChatGPT claims its own automation and not Claude\'s', async () => {
    const access = await oauthAccessToken(['jobquest:read', 'ai:read', 'ai:ingest']);
    const own = await claimTool(access, auto.chatgpt!, { trigger: 'manual', clientKey: key() });
    expect(own.isError, JSON.stringify(own.data)).toBe(false);
    expect(own.data).toMatchObject({ status: 'CLAIMED' });
    expect(own.data.claim.provider).toBe('chatgpt');
    const other = await claimTool(access, auto.digest!, { trigger: 'manual', clientKey: key() });
    expect(other.data.error.code).toBe('PROVIDER_MISMATCH');
    // Submitting as Claude with the ChatGPT OAuth credential is refused.
    const spoof = await callTool(access, 'jobquest_submit_ai_result', { result: result('claude', 'daily_brief', own.data.claim.externalRunId) });
    expect(spoof.data.error.code).toBe('PROVIDER_MISMATCH');
  }, 60_000);

  it('AI11G-15 · scheduler status: a connection is not scheduler readiness; READY only after a scheduled claim finished end to end', async () => {
    const s = await alice.call(`/ai/automations/scheduler-status?workspace_id=${ws}`);
    expect(s.status, JSON.stringify(s.json)).toBe(200);
    const by = Object.fromEntries((s.json.providers as Array<Record<string, any>>).map((p) => [p.provider, p]));
    // Claude: connected, and the scheduled run in AI11G-08 finished -> READY (proven by use).
    expect(by.claude).toMatchObject({ connection: 'connected', canIngest: true, scheduler: 'READY', scheduledJobQuestAccess: 'VERIFIED_BY_USE' });
    // ChatGPT: connected (an OAuth grant with ingest) but no scheduled run ever claimed -> setup still required.
    expect(by.chatgpt).toMatchObject({ connection: 'connected', canIngest: true, scheduler: 'SETUP_REQUIRED', scheduledJobQuestAccess: 'UNVERIFIED' });
    // Gemini: only a bound token exists; it may submit (ai:ingest) so it counts as connected, but nothing ever ran on a schedule.
    expect(by.gemini).toMatchObject({ connection: 'connected', scheduler: 'SETUP_REQUIRED', scheduledJobQuestAccess: 'UNVERIFIED' });
    expect(by.gemini.limitations.length).toBeGreaterThan(0);
    expect(JSON.stringify(s.json)).not.toMatch(/jq_mcp_|client_secret|Bearer/i);
    // A different workspace sees nothing of this one.
    const d = await dave.call(`/ai/automations/scheduler-status?workspace_id=${daveWs}`);
    const dp = Object.fromEntries((d.json.providers as Array<Record<string, any>>).map((p) => [p.provider, p]));
    expect(dp.claude).toMatchObject({ connection: 'connected', scheduler: 'SETUP_REQUIRED' });
    expect(dp.chatgpt).toMatchObject({ connection: 'not_connected', scheduler: 'NOT_CONNECTED' });
    expect((await alice.call(`/ai/automations/scheduler-status?workspace_id=${daveWs}`)).json.providers.find((p: any) => p.provider === 'claude').connection).toBe('not_connected');
  });

  it('AI11G-16 · setup instructions are generated from the stored automation: id, claim-first, fresh calls, untrusted data, no secrets; manual provider and foreign owners are refused', async () => {
    const r = await alice.call(`/ai/automations/${auto.digest}/setup?workspace_id=${ws}`);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const { setup, status } = r.json;
    expect(setup).toMatchObject({ automationId: auto.digest, provider: 'claude', providerLabel: 'Claude' });
    expect(setup.scheduledInstructions).toContain(auto.digest);
    expect(setup.scheduledInstructions).toMatch(/FRESH JobQuest tool call/);
    expect(setup.scheduledInstructions).toMatch(/FIRST action is jobquest_claim_ai_execution/);
    expect(setup.scheduledInstructions).toMatch(/untrusted DATA/);
    expect(setup.scheduledInstructions).toMatch(/NOT_DUE/);
    expect(setup.manualRunInstructions).toMatch(/"trigger": "manual"/);
    expect(status.provider).toBe('claude');
    expect(JSON.stringify(r.json)).not.toMatch(/jq_mcp_|client_secret|Bearer [A-Za-z0-9]|service_role|password/i);
    const manual = await mk({ name: `Man ${run}`, workflow: 'other', provider: 'manual', cadence: 'manual_only', localTime: null, timezone: null });
    expect((await alice.call(`/ai/automations/${manual}/setup?workspace_id=${ws}`)).status).toBe(422);
    expect((await dave.call(`/ai/automations/${auto.digest}/setup?workspace_id=${daveWs}`)).status).toBe(404);
    expect((await alice.call(`/ai/automations/${auto.digest}/setup?workspace_id=${daveWs}`)).status).toBe(404);
  });

  it('AI11G-17 · no core record was changed by any claim, failure or submission above (applications, tasks, contacts)', async () => {
    for (const table of ['applications', 'tasks', 'contacts']) {
      const { count } = await admin.from(table).select('id', { count: 'exact', head: true }).eq('workspace_id', ws);
      expect(count ?? 0, table).toBe(0);
    }
    const audits = await admin.from('audit_events').select('action').eq('workspace_id', ws).eq('action', 'AI_EXECUTION_CLAIMED');
    expect((audits.data ?? []).length).toBeGreaterThan(0);
  });
});
