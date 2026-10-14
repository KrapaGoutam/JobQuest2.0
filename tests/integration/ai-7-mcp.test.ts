import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, loadEnv, makeRecorder, serviceDb } from './harness';
import { calendarEnvelope, calendarFinding, deadlineFinding } from '../unit/fixtures/ai-contract/calendar';

// AI-7: the calendar read tool and the single write boundary over real HTTP handling, real connector
// tokens and a real database. Local stack only. There is no calendar write tool and no calendar provider call.
const ready = loadEnv();
const local = /^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.SUPABASE_URL ?? '');
const record = makeRecorder('test-results/evidence', 'integration');
const URL_ = 'http://localhost/api/mcp';
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const TOOL = 'jobquest_list_calendar_intelligence';
type AnyJson = any;

describe.skipIf(!ready || !local)('AI-7 — MCP calendar tool (real DB)', () => {
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
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}`, 'x-real-ip': `10.8.${run.length}.${(n % 200) + 1}` },
    });
    const text = await res.text();
    let json: AnyJson = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
  }
  const rpc = (method: string, params?: unknown, id = 1) => ({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
  const call = (token: string, name: string, args: Record<string, unknown> = {}) => mcp(token, rpc('tools/call', { name, arguments: args }));
  const data = (r: { json: AnyJson }) => r.json?.result?.structuredContent ?? JSON.parse(r.json?.result?.content?.[0]?.text ?? 'null');
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
      expect((await a.call('/auth/register', { username: `ai7m_${name}_${run}`, password: `Valid-AI7M-${name}-${run}!` })).status).toBe(201);
    }
    ws = (await admin.from('profiles').select('last_active_workspace_id').eq('user_id', carol.userId!).single()).data!.last_active_workspace_id as string;
    expect((await admin.from('workspace_members').insert({ workspace_id: ws, user_id: eve.userId!, role: 'USER', status: 'ACTIVE' })).error).toBeNull();
    tokens.carolRw = await mkToken(carol, ['jobquest:read', 'ai:read', 'ai:ingest']);
    tokens.carolRead = await mkToken(carol, ['jobquest:read', 'ai:read']);
    tokens.carolIngestOnly = await mkToken(carol, ['ai:ingest']);
    tokens.carolAppsOnly = await mkToken(carol, ['jobquest:read']);
    tokens.eveRead = await mkToken(eve, ['jobquest:read', 'ai:read']);
  });
  afterAll(() => { vi.restoreAllMocks(); delete process.env.AI_HUB_ENABLED; });

  const doc = (finding: Record<string, unknown>, runId = uniq('mcp-cal')) => ({
    ...clone(calendarEnvelope()), run: { external_run_id: runId, generated_at: '2026-10-12T12:00:00Z' }, findings: [finding],
  });
  const submit = (token: string, result: unknown) => call(token, 'jobquest_submit_ai_result', { result });

  it('AI7M-01 · the calendar tool is a read-only ai:read tool; the surface is twelve tools with exactly one write and no calendar write tool', async () => {
    const rw = await toolNames(tokens.carolRw!);
    expect(rw).toContain(TOOL);
    expect(rw).toHaveLength(12);
    expect(rw.filter((t: string) => /submit|create|import|delete|update|apply|calendar.*(write|event|rsvp|accept)/.test(t) && t !== TOOL)).toEqual(['jobquest_submit_ai_result']);
    expect(rw.join()).not.toMatch(/submit_calendar|create_event|update_event|delete_event|respond|rsvp/);
    expect(await toolNames(tokens.carolRead!)).toContain(TOOL);
    expect(await toolNames(tokens.carolRead!)).not.toContain('jobquest_submit_ai_result');
    expect(await toolNames(tokens.carolIngestOnly!)).toEqual(['jobquest_submit_ai_result']); // scope-filtered registry
    expect(await toolNames(tokens.carolAppsOnly!)).not.toContain(TOOL);
    const denied = await call(tokens.carolAppsOnly!, TOOL);
    expect(denied.status === 403 || denied.json?.result?.isError === true || denied.json?.error).toBeTruthy();
    const list = (await mcp(tokens.carolRead!, rpc('tools/list'))).json.result.tools.find((t: { name: string }) => t.name === TOOL);
    expect(list.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    expect(list.description).toMatch(/Read-only/);
    expect(list.description).toMatch(/NOT your calendar/);
    record('ai7m-01-tools', { total: 11, writes: 1, calendarWrite: 'none' });
  });

  it('AI7M-02 · a calendar event goes in through the one write tool and comes out chronologically, sanitized and without provider ids, attendees or raw data', async () => {
    const co = `McpCal${run}`;
    const sub = await submit(tokens.carolRw!, doc(calendarFinding({
      dedupe: { source_type: 'calendar', source_name: 'google_calendar', source_id: `evt-${run}-m2` }, title: 'MCP later interview',
    }, { company: co, start_at: '2026-11-04T14:00:00-06:00', end_at: undefined, attendees: ['x@example.com'], description: 'RAW-INVITE-CANARY', meeting_url: 'https://zoom.example.com/j/9?pwd=SECRET&lang=en' })));
    expect(sub.status, sub.text).toBe(200);
    expect(data(sub)).toMatchObject({ success: true, status: 'SUCCEEDED' });
    expect(JSON.stringify(data(sub).warnings.map((w: { code: string }) => w.code))).toContain('raw_calendar_rejected');
    await submit(tokens.carolRw!, doc(calendarFinding({
      dedupe: { source_type: 'calendar', source_name: 'google_calendar', source_id: `evt-${run}-m1` }, title: 'MCP sooner interview',
    }, { company: co, start_at: '2026-11-02T14:00:00-06:00', end_at: undefined })));
    await submit(tokens.carolRw!, doc(deadlineFinding({
      dedupe: { source_type: 'calendar', source_name: 'google_calendar', source_id: `evt-${run}-m3` }, title: 'MCP assessment due',
    }, { company: co, deadline_at: '2026-11-03T17:00:00-06:00' })));

    const r = await call(tokens.carolRead!, TOOL, { company: co });
    expect(r.status, r.text).toBe(200);
    const d = data(r);
    expect(d.items.map((i: { title: string }) => i.title)).toEqual(['MCP sooner interview', 'MCP assessment due', 'MCP later interview']);
    expect(d.items[0]).toMatchObject({ category: 'interview', status: 'scheduled', isDeadline: false, provider: 'claude', timeZone: 'America/Chicago', company: co });
    expect(d.items[1]).toMatchObject({ category: 'assessment_deadline', isDeadline: true });
    expect(d.items[2].meetingUrl).toBe('https://zoom.example.com/j/9?lang=en');
    expect(d.notice).toMatch(/untrusted/i);
    const out = JSON.stringify(d);
    expect(out).not.toMatch(/RAW-INVITE-CANARY|x@example\.com|SECRET|evt-|dedupe|source_event_id|attendee/i);
    expect(d).toMatchObject({ page: 0, hasNext: false });
    const desc = data(await call(tokens.carolRead!, TOOL, { company: co, order: 'desc', pageSize: 2 }));
    expect(desc.items.map((i: { title: string }) => i.title)).toEqual(['MCP later interview', 'MCP assessment due']);
    expect(desc.hasNext).toBe(true);
    const range = data(await call(tokens.carolRead!, TOOL, { company: co, startsSince: '2026-11-03T00:00:00Z', startsBefore: '2026-11-04T00:00:00Z' }));
    expect(range.items.map((i: { title: string }) => i.title)).toEqual(['MCP assessment due']);
    expect(data(await call(tokens.carolRead!, TOOL, { company: co, deadlinesOnly: true })).items).toHaveLength(1);
    record('ai7m-02-roundtrip', { order: 'chronological', rawStored: false });
  });

  it('AI7M-03 · a reschedule and a cancellation arrive through the same tool and show as state of one event', async () => {
    const co = `McpMove${run}`;
    const ev = (extra: Record<string, unknown>) => doc(calendarFinding({ dedupe: { source_type: 'calendar', source_name: 'google_calendar', source_id: `evt-${run}-m4` }, title: 'MCP movable' }, { company: co, end_at: undefined, ...extra }));
    await submit(tokens.carolRw!, ev({ start_at: '2026-11-05T14:00:00-06:00' }));
    await submit(tokens.carolRw!, ev({ start_at: '2026-11-06T14:00:00-06:00' }));
    let items = data(await call(tokens.carolRead!, TOOL, { company: co })).items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: 'rescheduled', rescheduleCount: 1 });
    expect(new Date(items[0].originalStartAt).toISOString()).toBe('2026-11-05T20:00:00.000Z');
    await submit(tokens.carolRw!, ev({ start_at: '2026-11-06T14:00:00-06:00', status: 'cancelled' }));
    items = data(await call(tokens.carolRead!, TOOL, { company: co })).items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: 'cancelled' });
    expect(items[0].cancelledAt).toBeTruthy();
    expect(data(await call(tokens.carolRead!, TOOL, { company: co, eventStatus: 'cancelled' })).items).toHaveLength(1);
    expect(data(await call(tokens.carolRead!, TOOL, { company: co, eventStatus: 'scheduled' })).items).toHaveLength(0);
  });

  it('AI7M-04 · a malformed calendar item is rejected alone (PARTIAL), and the result never creates an application', async () => {
    const apps0 = (await admin.from('applications').select('id', { count: 'exact', head: true }).eq('workspace_id', ws)).count ?? 0;
    const r = doc(calendarFinding({ dedupe: { source_type: 'calendar', source_name: 'google_calendar', source_id: `evt-${run}-m5` }, title: 'MCP ok' }, { company: `McpOk${run}`, end_at: undefined }));
    (r.findings as unknown[]).push(calendarFinding({ category: 'party', dedupe: { source_type: 'calendar', source_name: 'google_calendar', source_id: `evt-${run}-m6` } }), calendarFinding({ dedupe: { source_type: 'calendar', source_name: 'google_calendar', source_id: `evt-${run}-m7` } }, { end_at: '2026-01-01T00:00:00Z' }));
    const res = await submit(tokens.carolRw!, r);
    expect(data(res)).toMatchObject({ success: true, status: 'PARTIAL', counts: { findingsCreated: 1, rejectedItems: 2 } });
    expect(data(res).validationErrors.map((e: { code: string }) => e.code)).toEqual(expect.arrayContaining(['calendar_category', 'end_before_start']));
    expect((await admin.from('applications').select('id', { count: 'exact', head: true }).eq('workspace_id', ws)).count ?? 0).toBe(apps0);
  });

  it('AI7M-05 · reads are workspace/RLS scoped, strictly validated and bounded', async () => {
    const co = `McpCal${run}`;
    expect(data(await call(tokens.eveRead!, TOOL, { company: co })).items).toHaveLength(0); // a peer sees nothing of the owner's
    for (const args of [{ pageSize: 51 }, { page: -1 }, { category: 'party' }, { eventStatus: 'moved' }, { startsSince: 'tomorrow' }, { order: 'sideways' }, { user_id: carolId(), workspace_id: ws }, { nope: 1 }]) {
      const r = await call(tokens.carolRead!, TOOL, args as Record<string, unknown>);
      expect(r.json?.result?.isError === true || r.json?.error !== undefined, JSON.stringify(args)).toBe(true);
    }
    expect(data(await call(tokens.carolRead!, TOOL, { company: 'x),company.neq.(' })).items).toHaveLength(0);
  });

  function carolId() { return carol.userId!; }
});
