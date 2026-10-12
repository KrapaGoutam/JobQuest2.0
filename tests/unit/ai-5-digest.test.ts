import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildDedupeKey, validateAiResult } from '../../apps/api/src/lib/aiContract';
import { listAiDigests, getAiDigest, type AiReadClient } from '../../apps/api/src/services/aiReadService';
import {
  buildDeterministicDigest, digestDateInZone, generateSystemDigest, localDayWindow, toSystemDigestWire,
} from '../../apps/api/src/services/aiDigestService';
import { digestPayload } from './fixtures/ai-contract/fixtures';

const WS = '11111111-1111-4111-8111-aaaaaaaaaaaa';
const ME = '22222222-2222-4222-8222-bbbbbbbbbbbb';
const ID = '33333333-3333-4333-8333-cccccccccccc';
const ON = { AI_HUB_ENABLED: 'true' };

const envelope = (over: Record<string, unknown> = {}, payloadOver: Record<string, unknown> = {}, provider = 'claude') => ({
  contract: 'jobquest.ai-result', schema_version: '1.0', provider, workflow: 'daily_brief',
  run: { external_run_id: 'digest-run-1', generated_at: '2026-10-01T12:00:00Z' },
  sources: [], suggestions: [], metadata: {},
  findings: [{ kind: 'daily_brief', dedupe: { date: '2026-10-01' }, title: 'Daily digest 2026-10-01', priority: 'INFO', payload: digestPayload(payloadOver) }],
  ...over,
});

describe('digest payload contract', () => {
  it('validates a versioned digest and keys it by date + provider', () => {
    const r = validateAiResult(envelope());
    expect(r.errors).toEqual([]);
    const f = r.data!.findings[0]!;
    expect(f.dedupe_key).toBe('daily_brief:2026-10-01:claude');
    expect(f.payload).toMatchObject({ version: '1.0', digest_date: '2026-10-01', time_zone: 'America/Chicago' });
  });
  it('the same provider/day retry maps to the same identity; another provider keeps its own', () => {
    const key = (p: string) => validateAiResult(envelope({}, {}, p)).data!.findings[0]!.dedupe_key;
    expect(key('claude')).toBe(key('claude'));
    expect(key('chatgpt')).toBe('daily_brief:2026-10-01:chatgpt');
    expect(new Set([key('claude'), key('chatgpt'), key('gemini'), key('system')]).size).toBe(4);
    expect(buildDedupeKey('daily_brief', { date: '2026-10-02', provider: 'claude' })).not.toEqual(buildDedupeKey('daily_brief', { date: '2026-10-01', provider: 'claude' }));
  });
  it('keeps zero and not_configured distinct and never invents counts', () => {
    const p = validateAiResult(envelope()).data!.findings[0]!.payload as { sections: Record<string, { status: string; count?: number }>; summary: Record<string, number> };
    expect(p.sections.email_activity).toEqual({ status: 'zero', count: 0, items: [] });
    expect(p.sections.job_leads).toEqual({ status: 'not_configured', items: [] });
    expect(p.sections.recruiter_intel).toBeUndefined(); // absent = not reported
    expect(Object.keys(p.summary).sort()).toEqual(['active_applications', 'applications_added', 'follow_ups', 'pending_suggestions']);
  });
  it.each([
    ['missing payload', () => envelope({ findings: [{ kind: 'daily_brief', dedupe: { date: '2026-10-01' }, title: 't' }] })],
    ['legacy payload without version', () => envelope({}, { version: undefined })],
    ['unsupported major', () => envelope({}, { version: '2.0' })],
    ['digest_date not equal dedupe.date', () => envelope({}, { digest_date: '2026-10-02' })],
    ['impossible calendar date', () => envelope({ findings: [{ kind: 'daily_brief', dedupe: { date: '2026-02-30' }, title: 't', payload: digestPayload({ digest_date: '2026-02-30' }) }] })],
    ['bad time zone', () => envelope({}, { time_zone: 'Mars/Olympus' })],
    ['negative count', () => envelope({}, { summary: { follow_ups: -1 } })],
    ['fractional count', () => envelope({}, { summary: { follow_ups: 1.5 } })],
    ['zero section carrying items', () => envelope({}, { sections: { applications: { status: 'zero', items: [{ title: 'x' }] } } })],
    ['not_configured section with a count', () => envelope({}, { sections: { job_leads: { status: 'not_configured', count: 0 } } })],
    ['available section with nothing', () => envelope({}, { sections: { applications: { status: 'available', items: [] } } })],
    ['too many items', () => envelope({}, { sections: { applications: { status: 'available', items: Array.from({ length: 6 }, (_, i) => ({ title: `a${i}` })) } } })],
    ['non-http url', () => envelope({}, { priorities: [{ title: 'x', url: 'javascript:alert(1)' }] })],
  ])('rejects: %s', (_n, make) => {
    const r = validateAiResult(make());
    expect(r.rejectedItemCount).toBe(1);
    expect(r.data!.findings).toHaveLength(0);
    expect(r.errors.length).toBeGreaterThan(0);
  });
  it('drops unknown keys (counted) and strips scope fields instead of trusting them', () => {
    const r = validateAiResult(envelope({}, { summary: { follow_ups: 2, mystery: 9 }, workspace_id: WS, sections: { applications: { status: 'available', count: 1, items: [{ title: 'x', application_id: ID }] } } }));
    expect(r.errors).toEqual([]);
    expect(r.unknownFieldCount).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(r.data!.findings[0]!.payload)).not.toContain(WS);
    expect(JSON.stringify(r.data!.findings[0]!.payload)).not.toContain(ID);
  });
});

// ---- read service (query shape; DB behaviour is in the integration test) ----

type Op = [string, ...unknown[]];
function fake(rows: unknown[] = [], error: { code?: string } | null = null) {
  const ops: Op[] = [];
  const client: AiReadClient = {
    from() {
      const result = { data: rows, error };
      const chain: any = new Proxy({}, {
        get: (_t, prop: string) => {
          if (prop === 'then') return (res: (v: unknown) => unknown) => res(result);
          if (prop === 'maybeSingle') return () => Promise.resolve({ data: rows[0] ?? null, error });
          return (...a: unknown[]) => { ops.push([prop, ...a]); return chain; };
        },
      });
      return chain;
    },
  };
  return { client, ops };
}
const ctx = { workspaceId: WS };
const row = (date: string, provider = 'claude') => ({
  id: ID, user_id: ME, run_id: ID, provider, status: 'NEW', title: 't', summary: 's', created_at: '2026-10-01T12:00:00Z',
  dedupe_key: `daily_brief:${date}:${provider}`, payload: { version: '1.0', digest_date: date, sections: {} },
});

describe('digest reads', () => {
  it('filters by inclusive date range and provider on the dedupe-key prefix; stable order', async () => {
    const f = fake([row('2026-10-02'), row('2026-10-01')]);
    const r = await listAiDigests(ctx, { dateFrom: '2026-10-01', dateTo: '2026-10-31', provider: 'claude' }, {}, { client: f.client, env: ON });
    expect(r).toMatchObject({ ok: true, data: { items: [{ digestDate: '2026-10-02' }, { digestDate: '2026-10-01' }], pageSize: 7, hasNext: false } });
    expect(f.ops).toContainEqual(['eq', 'kind', 'daily_brief']);
    expect(f.ops).toContainEqual(['gte', 'dedupe_key', 'daily_brief:2026-10-01']);
    expect(f.ops).toContainEqual(['lt', 'dedupe_key', 'daily_brief:2026-11-01']); // exclusive next day: 31st is included
    expect(f.ops).toContainEqual(['eq', 'provider', 'claude']);
    expect(f.ops).toContainEqual(['order', 'dedupe_key', { ascending: false }]);
    expect(f.ops).toContainEqual(['order', 'id', { ascending: false }]);
  });
  it('returns the stored payload as-is and never exposes the dedupe key', async () => {
    const f = fake([row('2026-09-30')]);
    const r = await listAiDigests(ctx, {}, {}, { client: f.client, env: ON });
    expect(r.ok && r.data.items[0]).toMatchObject({ digestDate: '2026-09-30', payload: { digest_date: '2026-09-30' } });
    expect(JSON.stringify(r)).not.toContain('dedupe');
  });
  it('size+1 lookahead drives hasNext and page size is capped at 14', async () => {
    const f = fake(Array.from({ length: 8 }, () => row('2026-10-01')));
    const r = await listAiDigests(ctx, {}, { pageSize: 7 }, { client: f.client, env: ON });
    expect(r.ok && r.data.hasNext).toBe(true);
    expect(r.ok && r.data.items).toHaveLength(7);
    expect(await listAiDigests(ctx, {}, { pageSize: 15 }, { client: f.client, env: ON })).toMatchObject({ ok: false, error: { code: 'INVALID_FILTER' } });
  });
  it.each([
    ['impossible date', { dateFrom: '2026-02-30' }], ['malformed date', { dateTo: '10/01/2026' }], ['reversed range', { dateFrom: '2026-10-05', dateTo: '2026-10-01' }],
    ['range over a year', { dateFrom: '2024-01-01', dateTo: '2026-01-01' }], ['bad provider', { provider: 'openai' }], ['unknown key', { workspace_id: WS }],
  ])('rejects %s without querying', async (_n, filters) => {
    const f = fake();
    expect(await listAiDigests(ctx, filters as never, {}, { client: f.client, env: ON })).toMatchObject({ ok: false, error: { code: 'INVALID_FILTER' } });
    expect(f.ops).toEqual([]);
  });
  it('is disabled when the AI Hub kill switch is off; getAiDigest validates ids and maps NOT_FOUND', async () => {
    expect(await listAiDigests(ctx, {}, {}, { client: fake().client, env: {} })).toMatchObject({ error: { code: 'AI_HUB_DISABLED' } });
    expect(await getAiDigest(ctx, 'nope', { client: fake().client, env: ON })).toMatchObject({ error: { code: 'INVALID_FILTER' } });
    expect(await getAiDigest(ctx, ID, { client: fake([]).client, env: ON })).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(await getAiDigest(ctx, ID, { client: fake([row('2026-10-01')]).client, env: ON })).toMatchObject({ ok: true, data: { id: ID, provider: 'claude' } });
  });
});

// ---- date / time zone -------------------------------------------------------

describe('digest date semantics (owner profile time zone, never server UTC)', () => {
  it('the same instant is a different calendar date in different zones', () => {
    const t = new Date('2026-10-12T02:30:00Z');
    expect(digestDateInZone(t, 'America/Chicago')).toBe('2026-10-11');
    expect(digestDateInZone(t, 'UTC')).toBe('2026-10-12');
    expect(digestDateInZone(t, 'Asia/Kolkata')).toBe('2026-10-12');
    expect(digestDateInZone(t, 'Pacific/Auckland')).toBe('2026-10-12');
    expect(digestDateInZone(t, 'Not/AZone')).toBe('2026-10-12'); // falls back to UTC
  });
  it('local day windows follow the zone, including DST transitions (23h/25h days)', () => {
    expect(localDayWindow('2026-10-11', 'America/Chicago')).toEqual({ start: '2026-10-11T05:00:00.000Z', end: '2026-10-12T05:00:00.000Z' });
    const spring = localDayWindow('2026-03-08', 'America/Chicago'); // US spring-forward day = 23h
    expect((Date.parse(spring.end) - Date.parse(spring.start)) / 3_600_000).toBe(23);
    const fall = localDayWindow('2026-11-01', 'America/Chicago'); // fall-back day = 25h
    expect((Date.parse(fall.end) - Date.parse(fall.start)) / 3_600_000).toBe(25);
    expect(localDayWindow('2026-10-11', 'UTC').start).toBe('2026-10-11T00:00:00.000Z');
  });
});

// ---- deterministic aggregation -----------------------------------------------

type Handler = (table: string, ops: Op[]) => { data?: unknown; count?: number | null; error?: unknown };
function world(handler: Handler) {
  const log: { table: string; ops: Op[] }[] = [];
  const client: AiReadClient = {
    from(table: string) {
      const q = { table, ops: [] as Op[] };
      log.push(q);
      const chain: any = new Proxy({}, {
        get: (_t, prop: string) => {
          if (prop === 'then') return (res: (v: unknown) => unknown) => { const r = handler(table, q.ops); return res({ data: r.data ?? null, count: r.count ?? null, error: r.error ?? null }); };
          return (...a: unknown[]) => { q.ops.push([prop, ...a]); return chain; };
        },
      });
      return chain;
    },
  };
  return { client, log };
}
const NOW = () => new Date('2026-10-12T02:30:00Z'); // 2026-10-11 in America/Chicago
const dctx = { workspaceId: WS, userId: ME };
const hasOp = (ops: Op[], ...o: Op) => ops.some((x) => JSON.stringify(x) === JSON.stringify(o));
const isCount = (ops: Op[]) => ops.some((o) => o[0] === 'select' && JSON.stringify(o[2]) === JSON.stringify({ count: 'exact', head: true }));

const standard: Handler = (table, ops) => {
  const head = isCount(ops);
  switch (table) {
    case 'profiles': return { data: { timezone: 'America/Chicago' } };
    case 'applications':
      if (ops.some((o) => o[0] === 'in')) return { data: [{ id: 'a1', company_name: 'Acme', role_title: 'Engineer' }] };
      if (head) return { count: hasOp(ops, 'lte', 'next_action_date', '2026-10-11') ? 2 : hasOp(ops, 'eq', 'status', 'OPEN') ? 9 : 3 };
      if (hasOp(ops, 'lte', 'next_action_date', '2026-10-11')) return { data: [{ company_name: 'Acme', role_title: 'Engineer', next_action: 'Send thank-you', next_action_date: '2026-10-10' }] };
      return { data: [{ company_name: 'Acme', role_title: 'Engineer', stage: 'APPLIED', created_at: '2026-10-11T15:00:00Z' }] };
    case 'interviews':
      return head ? { count: 1 } : { data: [{ application_id: 'a1', interview_type: 'TECHNICAL', scheduled_at: '2026-10-13T15:00:00Z' }] };
    case 'ai_suggestions':
      return head ? { count: 4 } : { data: [{ action: 'set_status', target_type: 'application', created_at: '2026-10-11T10:00:00Z' }] };
    case 'ai_findings': return { count: 6 };
    default: return {};
  }
};

describe('deterministic JobQuest aggregation', () => {
  it('computes only facts JobQuest owns, in the owner zone, scoped to the owner', async () => {
    const w = world(standard);
    const r = await buildDeterministicDigest(dctx, '2026-10-11', { client: w.client, env: ON, now: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.timeZone).toBe('America/Chicago');
    const p = r.data.payload as any;
    expect(p.summary).toEqual({ applications_added: 3, active_applications: 9, follow_ups: 2, interviews: 1, pending_suggestions: 4, new_findings: 6 });
    // not-yet-integrated sources are NOT zero
    expect(p.sections.job_leads).toEqual({ status: 'not_configured', items: [] });
    expect(p.sections.email_activity).toEqual({ status: 'not_configured', items: [] });
    expect(p.sections.recruiter_intel).toEqual({ status: 'not_configured', items: [] });
    expect(p.summary).not.toHaveProperty('new_job_leads');
    expect(p.sections.applications).toMatchObject({ status: 'available', count: 3 });
    expect(p.sections.upcoming.items[0]).toMatchObject({ title: 'Acme — Engineer' });
    expect(p.sections.follow_ups.items[0]).toMatchObject({ priority: 'HIGH' });
    expect(p.priorities.length).toBeGreaterThan(0);
    // window is the Chicago day, every owned-table query is restricted to the owner
    const apps = w.log.filter((q) => q.table === 'applications');
    expect(apps.some((q) => hasOp(q.ops, 'gte', 'created_at', '2026-10-11T05:00:00.000Z') && hasOp(q.ops, 'lt', 'created_at', '2026-10-12T05:00:00.000Z'))).toBe(true);
    for (const q of w.log.filter((x) => x.table !== 'profiles')) expect(hasOp(q.ops, 'eq', 'user_id', ME), q.table).toBe(true);
  });
  it('distinguishes zero from unavailable for sources it does own', async () => {
    const w = world((table, ops) => (table === 'profiles' ? { data: null } : table === 'applications' || table === 'interviews' || table === 'ai_suggestions' || table === 'ai_findings' ? (isCount(ops) ? { count: 0 } : { data: [] }) : {}));
    const r = await buildDeterministicDigest(dctx, '2026-10-11', { client: w.client, env: ON, now: NOW });
    const p = (r as any).data.payload;
    expect((r as any).data.timeZone).toBe('UTC'); // no profile zone -> documented UTC default
    expect(p.sections.applications).toEqual({ status: 'zero', count: 0, items: [] });
    expect(p.sections.follow_ups).toEqual({ status: 'zero', count: 0, items: [] });
    expect(p.sections.job_leads.status).toBe('not_configured');
    expect(p.priorities).toEqual([]);
  });
  it('validates input, honours the kill switch and fails closed on read errors', async () => {
    const w = world(standard);
    expect(await buildDeterministicDigest(dctx, '2026-10-11', { client: w.client, env: {} })).toMatchObject({ error: { code: 'AI_HUB_DISABLED' } });
    expect(await buildDeterministicDigest(dctx, '2026-02-30', { client: w.client, env: ON })).toMatchObject({ error: { code: 'INVALID_DATE' } });
    expect(await buildDeterministicDigest({ workspaceId: 'x', userId: ME }, '2026-10-11', { client: w.client, env: ON })).toMatchObject({ error: { code: 'INVALID_CONTEXT' } });
    const broken = world((table) => (table === 'ai_findings' ? { error: { code: '500' } } : standard(table, [])));
    expect(await buildDeterministicDigest(dctx, '2026-10-11', { client: broken.client, env: ON })).toMatchObject({ error: { code: 'READ_FAILED' } });
  });
  it('the wire result is a valid system-provider digest, never attributed to Claude', async () => {
    const w = world(standard);
    const built = await buildDeterministicDigest(dctx, '2026-10-11', { client: w.client, env: ON, now: NOW });
    if (!built.ok) throw new Error('build failed');
    const wire = toSystemDigestWire(built.data, '2026-10-12T02:30:00.000Z');
    const v = validateAiResult(wire);
    expect(v.errors).toEqual([]);
    expect(v.data!.provider).toBe('system');
    expect(v.data!.findings[0]!.dedupe_key).toBe('daily_brief:2026-10-11:system');
    expect(v.data!.run.external_run_id).toBe('system-digest:2026-10-11');
  });
});

describe('JobQuest-generated digest goes through the ingestion boundary', () => {
  it('persists via RPCs only (no table writes) with provider system and a stable run id', async () => {
    const w = world(standard);
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const rpc = {
      async rpc(fn: string, args: Record<string, unknown>) {
        calls.push({ fn, args });
        if (fn === 'rpc_ai_ingest_run') return { data: { run_id: ID, created: true, status: 'RUNNING' }, error: null };
        if (fn === 'rpc_ai_ingest_finding') return { data: { finding_id: ID, outcome: 'created' }, error: null };
        return { data: { run_id: ID, status: 'SUCCEEDED' }, error: null };
      },
    };
    const out = await generateSystemDigest(dctx, { client: w.client, env: ON, now: NOW, ingest: { client: rpc, env: ON, log: () => undefined } });
    expect(out).toMatchObject({ ok: true, data: { digestDate: '2026-10-11', timeZone: 'America/Chicago', ingest: { success: true } } });
    expect(calls.map((c) => c.fn)).toEqual(['rpc_ai_ingest_run', 'rpc_ai_ingest_finding', 'rpc_ai_finalize_run']);
    expect(calls[0]!.args).toMatchObject({ p_provider: 'system', p_workflow: 'daily_brief', p_external_run_id: 'system-digest:2026-10-11', p_workspace_id: WS });
    expect(calls[1]!.args).toMatchObject({ p_kind: 'daily_brief', p_dedupe_key: 'daily_brief:2026-10-11:system' });
    expect(w.log.every((q) => q.ops.every((o) => !['insert', 'update', 'upsert', 'delete'].includes(String(o[0]))))).toBe(true);
  });
  it('only today (owner zone) can be generated: the date is derived, not accepted', async () => {
    const src = readFileSync('apps/api/src/services/aiDigestService.ts', 'utf8');
    expect(src).toMatch(/const date = digestDateInZone\(now, zone\)/);
    expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(|admin\(|service_role/);
  });
});
