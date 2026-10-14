import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, loadEnv, makeRecorder, serviceDb } from './harness';
import { emailTriageFinding, external, jobLeadFinding, recruiterIntelFinding } from '../unit/fixtures/ai-contract/external';

// AI-6: the three read-only source tools and the single write boundary over real HTTP handling,
// real connector tokens and a real database. Local stack only.
const ready = loadEnv();
const local = /^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.SUPABASE_URL ?? '');
const record = makeRecorder('test-results/evidence', 'integration');
const URL_ = 'http://localhost/api/mcp';
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const NEW_TOOLS = ['jobquest_list_email_intelligence', 'jobquest_list_job_leads', 'jobquest_list_recruiter_intel'];

describe.skipIf(!ready || !local)('AI-6 — MCP source tools (real DB)', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();
  const carol = new Actor(); // member, owner
  const eve = new Actor(); // peer
  let ws: string;
  let appMod: typeof import('../../apps/api/src/app');
  let n = 0;
  const uniq = (p: string) => `${p}-${run}-${++n}`;
  const tokens: Record<string, string> = {};

  async function mkToken(actor: Actor, scopes: string[]) {
    const res = await actor.call('/ai/connector-tokens', { workspace_id: ws, name: uniq('tok'), scopes });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    return res.json.token as string;
  }
  async function mcp(token: string, body: unknown) {
    const res = await appMod.app.request(URL_, {
      method: 'POST', body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}`, 'x-real-ip': `10.7.${run.length}.${(n % 200) + 1}` },
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
  }
  const rpc = (method: string, params?: unknown, id = 1) => ({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
  const call = (token: string, name: string, args: Record<string, unknown> = {}) => mcp(token, rpc('tools/call', { name, arguments: args }));
  const data = (r: { json: any }) => r.json?.result?.structuredContent ?? JSON.parse(r.json?.result?.content?.[0]?.text ?? 'null');
  const toolNames = async (token: string) => ((await mcp(token, rpc('tools/list'))).json?.result?.tools ?? []).map((t: { name: string }) => t.name).sort();

  beforeAll(async () => {
    process.env.AI_HUB_ENABLED = 'true';
    const envMod = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    envMod.resetEnvCache(); resetSigningMaterial(); resetAdminClient();
    appMod = await import('../../apps/api/src/app');
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    for (const [a, name] of [[carol, 'carol'], [eve, 'eve']] as const) {
      expect((await a.call('/auth/register', { username: `ai6m_${name}_${run}`, password: `Valid-AI6M-${name}-${run}!` })).status).toBe(201);
    }
    ws = (await admin.from('profiles').select('last_active_workspace_id').eq('user_id', carol.userId!).single()).data!.last_active_workspace_id as string;
    expect((await admin.from('workspace_members').insert({ workspace_id: ws, user_id: eve.userId!, role: 'USER', status: 'ACTIVE' })).error).toBeNull();
    tokens.carolRw = await mkToken(carol, ['jobquest:read', 'ai:read', 'ai:ingest']);
    tokens.carolRead = await mkToken(carol, ['jobquest:read', 'ai:read']);
    tokens.carolIngestOnly = await mkToken(carol, ['ai:ingest']);
    tokens.eveRead = await mkToken(eve, ['jobquest:read', 'ai:read']);
  });
  afterAll(() => { vi.restoreAllMocks(); delete process.env.AI_HUB_ENABLED; });

  const multi = () => {
    const doc = clone(external.multiSource) as Record<string, any>;
    doc.run = { external_run_id: uniq('mcp-multi'), generated_at: '2026-10-01T12:00:00Z' };
    doc.findings = [
      jobLeadFinding({ dedupe: { job_url: `https://jobs.example.com/${run}/m1` }, source: { url: `https://jobs.example.com/${run}/m1` }, title: 'MCP lead' }, { job_url: `https://jobs.example.com/${run}/m1`, external_job_id: `EX-${run}-m1`, company: 'McpCo', role_title: 'MCP Engineer' }),
      emailTriageFinding({ dedupe: { source_type: 'gmail', source_id: `mcp-${run}-1` }, title: 'MCP email' }, { company: 'McpCo' }),
      recruiterIntelFinding({ title: 'MCP recruiter' }, { company: 'McpCo', recruiter_name: 'Mcp Recruiter', profile_url: `https://example.com/team/${run}/m1`, related_job: { job_url: `https://jobs.example.com/${run}/m1` } }),
    ];
    return doc;
  };

  it('AI6M-01 · the source tools are read-only ai:read tools; there is still exactly one write tool and no source-specific write tool', async () => {
    const rw = await toolNames(tokens.carolRw!);
    expect(rw).toEqual(expect.arrayContaining(NEW_TOOLS));
    expect(rw).toHaveLength(13); // AI-7 adds the calendar read; AI-11D and AI-11E add read-only profile reads
    expect(rw.filter((t: string) => /submit|create|import|delete|update|apply/.test(t))).toEqual(['jobquest_submit_ai_result']);
    const read = await toolNames(tokens.carolRead!);
    expect(read).toEqual(expect.arrayContaining(NEW_TOOLS));
    expect(read).not.toContain('jobquest_submit_ai_result');
    expect(await toolNames(tokens.carolIngestOnly!)).toEqual(['jobquest_submit_ai_result']); // scope-filtered registry
    const tools = (await mcp(tokens.carolRead!, rpc('tools/list'))).json.result.tools as Array<{ name: string; annotations: Record<string, boolean> }>;
    for (const t of tools.filter((x) => NEW_TOOLS.includes(x.name))) expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
  });

  it('AI6M-02 · scope enforcement: ingest-only tokens cannot read the sources; read tokens cannot submit', async () => {
    for (const t of NEW_TOOLS) {
      const denied = await call(tokens.carolIngestOnly!, t);
      expect(denied.status === 403 || denied.json?.result?.isError === true || denied.json?.error !== undefined, `${t}: ${denied.text.slice(0, 120)}`).toBe(true);
    }
    const submit = await call(tokens.carolRead!, 'jobquest_submit_ai_result', { result: multi() });
    expect(submit.status === 403 || submit.json?.result?.isError === true || submit.json?.error !== undefined).toBe(true);
  });

  it('AI6M-03 · one submit tool stores a job lead, an email event and recruiter intel; the reads return them, sanitized and bounded', async () => {
    const sub = await call(tokens.carolRw!, 'jobquest_submit_ai_result', { result: multi() });
    const s = data(sub);
    expect(s).toMatchObject({ success: true, counts: { findingsCreated: 3 } });

    const leads = data(await call(tokens.carolRead!, 'jobquest_list_job_leads', { search: 'McpCo' }));
    expect(leads.items).toHaveLength(1);
    expect(leads.items[0]).toMatchObject({ company: 'McpCo', title: 'MCP Engineer', matchScore: 86, strongMatch: true, provider: 'claude', descriptionAvailable: true });
    expect(leads.notice).toMatch(/untrusted/i);
    expect(JSON.stringify(leads)).not.toMatch(/Build reliable systems|dedupe|content_hash|workspace_id/);

    const mail = data(await call(tokens.carolRead!, 'jobquest_list_email_intelligence', { company: 'McpCo', category: 'interview_invitation' }));
    expect(mail.items).toHaveLength(1);
    expect(mail.items[0]).toMatchObject({ category: 'interview_invitation', senderDomain: 'example.com', needsAttention: true });
    expect(JSON.stringify(mail)).not.toMatch(/dedupe|provider_message_id|gmail-msg/);

    const rec = data(await call(tokens.carolRead!, 'jobquest_list_recruiter_intel', { search: 'Mcp Recruiter' }));
    expect(rec.items).toHaveLength(1);
    expect(rec.items[0]).toMatchObject({ name: 'Mcp Recruiter', company: 'McpCo', verification: 'verified', contact: null });
    expect(rec.items[0].relatedLead).toMatchObject({ company: 'McpCo', title: 'MCP Engineer' });
    record('ai6m-03-mcp-sources', { tools: NEW_TOOLS.length, singleWriteTool: true });
  });

  it('AI6M-04 · bounded and strict: page size capped, unknown or identity arguments rejected', async () => {
    for (const t of NEW_TOOLS) {
      const big = await call(tokens.carolRead!, t, { pageSize: 51 });
      expect(big.json?.result?.isError === true || big.json?.error !== undefined, t).toBe(true);
      for (const extra of [{ workspaceId: ws }, { user_id: carol.userId }, { unknown: 1 }]) {
        const bad = await call(tokens.carolRead!, t, extra);
        expect(bad.json?.result?.isError === true || bad.json?.error !== undefined, `${t} ${JSON.stringify(extra)}`).toBe(true);
      }
    }
    const one = data(await call(tokens.carolRead!, 'jobquest_list_job_leads', { pageSize: 1 }));
    expect(one.items.length).toBeLessThanOrEqual(1);
    expect(one.pageSize).toBe(1);
  });

  it('AI6M-05 · a peer\'s token sees none of the owner\'s source data', async () => {
    for (const [t, args] of [['jobquest_list_job_leads', { search: 'McpCo' }], ['jobquest_list_email_intelligence', { company: 'McpCo' }], ['jobquest_list_recruiter_intel', { search: 'Mcp Recruiter' }]] as const) {
      expect(data(await call(tokens.eveRead!, t, args as Record<string, unknown>)).items).toHaveLength(0);
    }
  });

  it('AI6M-06 · submitting a multi-source result twice is idempotent and creates no application', async () => {
    const before = (await admin.from('applications').select('id', { count: 'exact', head: true }).eq('workspace_id', ws)).count ?? 0;
    const doc = multi();
    const first = data(await call(tokens.carolRw!, 'jobquest_submit_ai_result', { result: doc }));
    const again = data(await call(tokens.carolRw!, 'jobquest_submit_ai_result', { result: doc }));
    expect(first.success).toBe(true);
    expect(again).toMatchObject({ success: true, duplicateRun: true });
    expect((await admin.from('applications').select('id', { count: 'exact', head: true }).eq('workspace_id', ws)).count ?? 0).toBe(before);
  });
});
