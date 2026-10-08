import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as read from '../../apps/api/src/services/aiReadService';
import {
  AI_READ_DEFAULT_PAGE_SIZE, AI_READ_MAX_PAGE_SIZE, countPendingAiSuggestions, getAiFinding, getAiRun, getAiSuggestion,
  listAiFindings, listAiRuns, listAiSuggestions, type AiReadClient, type AiReadContext,
} from '../../apps/api/src/services/aiReadService';

// Query-shape tests with a recording fake. Real RLS/visibility behaviour is proven
// against a database in tests/integration/ai-2b-read-service.test.ts.
const WS = '11111111-1111-4111-8111-aaaaaaaaaaaa';
const ID = '33333333-3333-4333-8333-cccccccccccc';
const ON = { AI_HUB_ENABLED: 'true' };
const ctx: AiReadContext = { workspaceId: WS };

type Op = [string, ...unknown[]];
function fake(reply: { data?: unknown; error?: { message: string; code?: string } | null; count?: number | null } | ((table: string) => any) = {}) {
  const queries: { table: string; ops: Op[] }[] = [];
  const client: AiReadClient = {
    from(table: string) {
      const q = { table, ops: [] as Op[] };
      queries.push(q);
      const r = typeof reply === 'function' ? reply(table) : reply;
      const result = { data: r.data ?? null, error: r.error ?? null, count: r.count ?? null };
      const chain: any = new Proxy({}, {
        get: (_t, prop: string) => {
          if (prop === 'then') return (res: (v: unknown) => unknown) => res(result);
          if (prop === 'maybeSingle') return () => { q.ops.push(['maybeSingle']); return Promise.resolve(result); };
          return (...a: unknown[]) => { q.ops.push([prop, ...a]); return chain; };
        },
      });
      return chain;
    },
  };
  return { client, queries };
}
const used = (f: ReturnType<typeof fake>, i = 0) => f.queries[i]!.ops;
const has = (f: ReturnType<typeof fake>, ...op: Op) => used(f).some((o) => JSON.stringify(o) === JSON.stringify(op));

const runRow = { id: ID, user_id: ID, provider: 'claude', workflow: 'email_triage', status: 'PARTIAL', trigger_type: 'manual', created_at: '2026-10-01T00:00:00Z', started_at: null, completed_at: null, error_category: 'SCHEMA_INVALID', counts: { findings_created: 2, junk: 'x', nested: { a: 1 } }, schema_version: '1.0', retry_of_run_id: null, sources: [{ type: 'gmail', ref: 'm' }, 'bad'], error_detail: 'SECRET-DETAIL', workspace_id: WS };

describe('kill switch, context, filters', () => {
  it('fails closed when AI_HUB_ENABLED is off and never touches the client', async () => {
    const f = fake();
    for (const env of [{}, { AI_HUB_ENABLED: 'false' }, { VITE_AI_HUB_ENABLED: 'true' }]) {
      for (const r of [await listAiRuns(ctx, {}, {}, { client: f.client, env }), await getAiRun(ctx, ID, { client: f.client, env }), await countPendingAiSuggestions(ctx, { client: f.client, env })]) {
        expect(r).toMatchObject({ ok: false, error: { code: 'AI_HUB_DISABLED' } });
      }
    }
    expect(f.queries).toEqual([]);
  });
  it('requires a UUID workspace and either an injected client or an access token', async () => {
    const f = fake();
    expect(await listAiRuns({ workspaceId: 'nope' }, {}, {}, { client: f.client, env: ON })).toMatchObject({ error: { code: 'INVALID_CONTEXT' } });
    expect(await listAiRuns({ workspaceId: WS }, {}, {}, { env: ON })).toMatchObject({ error: { code: 'INVALID_CONTEXT' } });
    expect(await listAiRuns({ workspaceId: WS, accessToken: 'short' }, {}, {}, { env: ON })).toMatchObject({ error: { code: 'INVALID_CONTEXT' } });
    expect(f.queries).toEqual([]);
  });
  it.each([
    ['unknown filter key', { workspace_id: WS }], ['bad status', { status: 'DONE' }], ['bad provider', { provider: 'openai' }],
    ['non-string', { status: 5 }], ['bad date', { createdSince: 'yesterday' }],
  ])('rejects %s before querying', async (_n, filters) => {
    const f = fake();
    expect(await listAiRuns(ctx, filters as never, {}, { client: f.client, env: ON })).toMatchObject({ ok: false, error: { code: 'INVALID_FILTER' } });
    expect(f.queries).toEqual([]);
  });
  it('rejects non-uuid ids and out-of-range pagination', async () => {
    const f = fake();
    const d = { client: f.client, env: ON };
    expect(await listAiFindings(ctx, { runId: 'x' }, {}, d)).toMatchObject({ error: { code: 'INVALID_FILTER' } });
    expect(await getAiRun(ctx, 'x', d)).toMatchObject({ error: { code: 'INVALID_FILTER' } });
    for (const page of [{ pageSize: AI_READ_MAX_PAGE_SIZE + 1 }, { pageSize: 0 }, { pageSize: 1.5 }, { page: -1 }, { page: 100000 }]) {
      expect(await listAiRuns(ctx, {}, page, d)).toMatchObject({ error: { code: 'INVALID_FILTER' } });
    }
    expect(f.queries).toEqual([]);
    expect(AI_READ_MAX_PAGE_SIZE).toBe(50);
  });
});

describe('query shape', () => {
  it('runs: workspace + typed filters, newest-first with id tiebreaker, size+1 lookahead', async () => {
    const f = fake({ data: [runRow] });
    const r = await listAiRuns(ctx, { status: 'PARTIAL', provider: 'claude', workflow: 'email_triage', createdSince: '2026-10-01T00:00:00Z' }, { page: 2, pageSize: 10 }, { client: f.client, env: ON });
    expect(f.queries[0]!.table).toBe('ai_runs');
    expect(has(f, 'eq', 'workspace_id', WS)).toBe(true);
    expect(has(f, 'eq', 'status', 'PARTIAL')).toBe(true);
    expect(has(f, 'eq', 'provider', 'claude')).toBe(true);
    expect(has(f, 'eq', 'workflow', 'email_triage')).toBe(true);
    expect(has(f, 'gte', 'created_at', '2026-10-01T00:00:00Z')).toBe(true);
    expect(has(f, 'order', 'created_at', { ascending: false })).toBe(true);
    expect(has(f, 'order', 'id', { ascending: false })).toBe(true);
    expect(has(f, 'range', 20, 30)).toBe(true);
    expect(r).toMatchObject({ ok: true, data: { page: 2, pageSize: 10, hasNext: false } });
  });
  it('defaults to 20 rows and reports hasNext from the lookahead row', async () => {
    const rows = Array.from({ length: AI_READ_DEFAULT_PAGE_SIZE + 1 }, (_, i) => ({ ...runRow, id: `${i}` }));
    const f = fake({ data: rows });
    const r = await listAiRuns(ctx, undefined, undefined, { client: f.client, env: ON });
    expect(has(f, 'range', 0, 20)).toBe(true);
    expect(r.ok && r.data.items).toHaveLength(20);
    expect(r.ok && r.data.hasNext).toBe(true);
  });
  it('findings and suggestions apply only their typed filters', async () => {
    const f = fake({ data: [] });
    await listAiFindings(ctx, { status: 'NEW', kind: 'email_event', priority: 'HIGH', runId: ID.toUpperCase() }, {}, { client: f.client, env: ON });
    for (const op of [['eq', 'status', 'NEW'], ['eq', 'kind', 'email_event'], ['eq', 'priority', 'HIGH'], ['eq', 'run_id', ID]] as Op[]) expect(has(f, ...op)).toBe(true);
    const g = fake({ data: [] });
    await listAiSuggestions(ctx, { status: 'PENDING', findingId: ID, action: 'create_task' }, {}, { client: g.client, env: ON });
    expect(g.queries[0]!.table).toBe('ai_suggestions');
    for (const op of [['eq', 'status', 'PENDING'], ['eq', 'finding_id', ID], ['eq', 'action', 'create_task']] as Op[]) expect(has(g, ...op)).toBe(true);
  });
  it('run detail = exactly two bounded queries (run + findings), no per-child queries', async () => {
    const f = fake((t) => (t === 'ai_runs' ? { data: runRow } : { data: Array.from({ length: 51 }, (_, i) => ({ id: `${i}`, title: 't' })) }));
    const r = await getAiRun(ctx, ID, { client: f.client, env: ON });
    expect(f.queries.map((q) => q.table).sort()).toEqual(['ai_findings', 'ai_runs']);
    expect(f.queries.find((q) => q.table === 'ai_findings')!.ops).toContainEqual(['limit', 51]);
    expect(r.ok && r.data.findings).toHaveLength(50);
    expect(r.ok && r.data.findingsTruncated).toBe(true);
  });
  it('pending count is a head count scoped to the workspace', async () => {
    const f = fake({ count: 7 });
    expect(await countPendingAiSuggestions(ctx, { client: f.client, env: ON })).toEqual({ ok: true, data: { pending: 7 } });
    expect(has(f, 'select', 'id', { count: 'exact', head: true })).toBe(true);
    expect(has(f, 'eq', 'status', 'PENDING')).toBe(true);
  });
});

describe('DTO safety and errors', () => {
  it('never selects or returns error_detail, content_hash, dedupe_key or workspace_id', async () => {
    const f = fake((t) => (t === 'ai_runs' ? { data: runRow } : { data: [] }));
    const r = await getAiRun(ctx, ID, { client: f.client, env: ON });
    const selects = f.queries.flatMap((q) => q.ops.filter((o) => o[0] === 'select').map((o) => String(o[1]))).join(' ');
    for (const col of ['error_detail', 'content_hash', 'dedupe_key', 'workspace_id', 'connection_id']) expect(selects).not.toContain(col);
    const blob = JSON.stringify(r);
    expect(blob).not.toContain('SECRET-DETAIL');
    expect(blob).not.toContain('error_detail');
    expect(r.ok && r.data.run).toMatchObject({ errorCategory: 'SCHEMA_INVALID', counts: { findings_created: 2 }, sources: [{ type: 'gmail', ref: 'm' }, {}] });
    expect(r.ok && r.data.run.counts).not.toHaveProperty('junk');
  });
  it('finding detail exposes the normalized payload/source_ref only', async () => {
    const f = fake({ data: { id: ID, user_id: ID, run_id: ID, kind: 'email_event', provider: 'claude', status: 'NEW', priority: 'HIGH', title: 't', created_at: 'x', payload: { company: 'Acme', seen_by: ['gemini'] }, source_ref: { type: 'gmail' }, application_id: null, content_hash: 'h', dedupe_key: 'k' } });
    const r = await getAiFinding(ctx, ID, { client: f.client, env: ON });
    expect(r.ok && r.data).toMatchObject({ payload: { company: 'Acme', seen_by: ['gemini'] }, sourceRef: { type: 'gmail' }, applicationId: null });
    expect(JSON.stringify(r)).not.toMatch(/content_hash|dedupe_key/);
  });
  it('missing rows are NOT_FOUND; DB errors are coarse and never leak SQL', async () => {
    const d = (reply: Parameters<typeof fake>[0]) => ({ client: fake(reply).client, env: ON });
    expect(await getAiFinding(ctx, ID, d({ data: null }))).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(await getAiSuggestion(ctx, ID, d({ data: null }))).toMatchObject({ error: { code: 'NOT_FOUND' } });
    const boom = await listAiRuns(ctx, {}, {}, d({ error: { message: 'relation "ai_runs" password=hunter2', code: '42P01' } }));
    expect(boom).toMatchObject({ ok: false, error: { code: 'READ_FAILED' } });
    expect(JSON.stringify(boom)).not.toMatch(/hunter2|relation/);
    expect(await listAiRuns(ctx, {}, {}, d({ error: { message: 'x', code: '42501' } }))).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });
});

describe('read-only guarantee', () => {
  it('exports only reads/counts and the source has no write, rpc or service-role path', () => {
    const fns = Object.entries(read).filter(([, v]) => typeof v === 'function').map(([k]) => k);
    expect(fns.sort()).toEqual(['countPendingAiSuggestions', 'getAiFinding', 'getAiRun', 'getAiSuggestion', 'listAiFindings', 'listAiRuns', 'listAiSuggestions']);
    const src = readFileSync('apps/api/src/services/aiReadService.ts', 'utf8');
    expect(src).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(|admin\(|SUPABASE_SECRET_KEY|service_role/);
    expect(src).toContain('userClient');
  });
  it('is not wired into API boot (failure isolation)', () => {
    for (const file of ['apps/api/src/app.ts', 'apps/api/src/server.ts', 'apps/api/src/vercel.ts']) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/aiReadService|aiIntegrationService/);
    }
  });
});
