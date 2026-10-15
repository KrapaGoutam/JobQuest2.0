import { describe, expect, it } from 'vitest';
import { validateAiResult } from '../../apps/api/src/lib/aiContract';
import type { AiReadClient } from '../../apps/api/src/services/aiReadService';
import { buildDeterministicDigest, toSystemDigestWire } from '../../apps/api/src/services/aiDigestService';

// AI-6 sources in the Daily Digest, as composed since AI-11C (the digest reads job leads, email, recruiter and calendar
// intelligence through the shared read mappers and the pure composer). Query-shape + payload semantics with a recording
// fake; the composition rules themselves are in tests/unit/ai-11c-digest.test.ts and the real-DB behaviour in
// tests/integration/ai-6-sources.test.ts and ai-11c-digest.test.ts.
const WS = '11111111-1111-4111-8111-aaaaaaaaaaaa';
const ME = '22222222-2222-4222-8222-bbbbbbbbbbbb';
const ON = { AI_HUB_ENABLED: 'true' };
const NOW = () => new Date('2026-10-12T02:30:00Z'); // 2026-10-11 in America/Chicago
const ctx = { workspaceId: WS, userId: ME };

type Op = [string, ...unknown[]];
type Result = { data?: unknown; count?: number | null; error?: unknown };
const hasOp = (ops: Op[], ...o: Op) => ops.some((x) => JSON.stringify(x) === JSON.stringify(o));
const isHead = (ops: Op[]) => ops.some((o) => o[0] === 'select' && JSON.stringify(o[2]) === JSON.stringify({ count: 'exact', head: true }));

function world(handler: (table: string, ops: Op[]) => Result) {
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

interface Sources { leadRows?: unknown[]; leads?: number; recruiterRows?: unknown[]; recruiters?: number; ran?: Array<'job_discovery' | 'email_triage' | 'recruiter_intel' | 'calendar_review'> }

/** Everything else is empty, so only the AI-6 sources vary. */
function digestWorld(src: Sources) {
  return world((table, ops) => {
    const head = isHead(ops);
    switch (table) {
      case 'profiles': return { data: { timezone: 'America/Chicago' } };
      case 'ai_runs': return { data: src.ran?.some((w) => hasOp(ops, 'eq', 'workflow', w)) ? [{ status: 'SUCCEEDED' }] : [] };
      case 'ai_job_leads': return head ? { count: src.leads ?? 0 } : { data: src.leadRows ?? [] };
      case 'ai_findings':
        if (hasOp(ops, 'eq', 'kind', 'recruiter_intel')) return head ? { count: src.recruiters ?? 0 } : { data: src.recruiterRows ?? [] };
        return head ? { count: 0 } : { data: [] };
      default: return head ? { count: 0 } : { data: [] };
    }
  });
}

const build = async (src: Sources) => {
  const w = digestWorld(src);
  const r = await buildDeterministicDigest(ctx, '2026-10-11', { client: w.client, env: ON, now: NOW });
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return { p: r.data.payload as any, log: w.log, data: r.data };
};

describe('Daily Digest — external source availability (AI-5 semantics, per source)', () => {
  it('no source has ever run: all are not_configured and nothing is reported as zero', async () => {
    const { p } = await build({});
    for (const k of ['job_email', 'other_email', 'job_leads', 'recruiter_intel']) expect(p.sections[k], k).toEqual({ status: 'not_configured', items: [] });
    expect(p.sections.upcoming).toEqual({ status: 'not_configured', items: [] });
  });

  it('a source that ran successfully and found nothing is zero (with explicit zero counts)', async () => {
    const { p } = await build({ ran: ['job_discovery', 'email_triage', 'recruiter_intel', 'calendar_review'] });
    for (const k of ['job_email', 'other_email', 'job_leads', 'recruiter_intel', 'upcoming']) expect(p.sections[k], k).toEqual({ status: 'zero', count: 0, items: [] });
    expect(p.summary).toMatchObject({ job_emails: 0, recent_jobs: 0, recruiters: 0, upcoming: 0 });
  });

  it('sources are independent: one configured source does not configure the others', async () => {
    const { p } = await build({ ran: ['email_triage'] });
    expect(p.sections.job_email.status).toBe('zero');
    expect(p.sections.job_leads.status).toBe('not_configured');
    expect(p.sections.recruiter_intel.status).toBe('not_configured');
  });

  it('findings make a source available even if no run record exists', async () => {
    const { p } = await build({ leads: 1, leadRows: [{ id: 'l1', finding_id: 'f1', user_id: ME, company: 'Acme', title: 'Engineer', location: null, match_score: null, source_url: null, discovered_at: '2026-10-11T15:00:00Z', finding: { provider: 'claude', status: 'NEW', priority: 'NORMAL', payload: {} } }] });
    expect(p.sections.job_leads).toMatchObject({ status: 'available', count: 1 });
    expect(p.summary).toMatchObject({ recent_jobs: 1 });
  });
});

describe('Daily Digest — job lead and recruiter content', () => {
  const lead = (score: number | null, over: Record<string, unknown> = {}) => ({
    id: '44444444-4444-4444-8444-444444444444', finding_id: '55555555-5555-4555-8555-555555555555', user_id: ME, company: 'Acme', title: 'Staff Engineer', location: 'Austin, TX', match_score: score,
    source_url: 'https://jobs.example.com/42', discovered_at: '2026-10-11T15:00:00Z', finding: { provider: 'claude', status: 'NEW', priority: 'NORMAL', payload: {} }, ...over,
  });

  it('shows a match score only when one is stored; a missing score is never invented or ranked above a real one', async () => {
    const { p } = await build({ leads: 3, leadRows: [lead(null, { title: 'Unscored' }), lead(60, { title: 'Engineer' }), lead(91)], ran: ['job_discovery'] });
    const items = p.sections.job_leads.items;
    expect(items.map((i: any) => i.title)).toEqual(['Staff Engineer', 'Engineer', 'Unscored']);
    expect(items[0]).toMatchObject({ score: 91, company: 'Acme', source: 'job_site', url: 'https://jobs.example.com/42' });
    expect(items[2]).not.toHaveProperty('score');
    expect(p.priorities).toEqual([]);
  });

  it('suppresses unsafe lead URLs and the payload stays contract-valid', async () => {
    const { p } = await build({ leads: 1, leadRows: [lead(70, { source_url: 'javascript:alert(1)' })] });
    expect(p.sections.job_leads.items[0]).not.toHaveProperty('url');
    expect(validateAiResult(toSystemDigestWire({ digestDate: '2026-10-11', timeZone: 'UTC', payload: p }, '2026-10-12T02:30:00Z')).errors).toEqual([]);
  });

  it('reports recruiter intelligence with the public source and verification state, never contact details', async () => {
    const row = {
      id: 'aaaaaaaa-0000-4000-8000-000000000009', user_id: ME, provider: 'claude', status: 'NEW', confidence: 0.7, title: 'Pat Recruiter, Acme', summary: null, created_at: '2026-10-11T16:00:00Z', source_ref: { url: 'https://acme.example/team' },
      payload: { recruiter_name: 'Pat Recruiter', company: 'Acme', role_title: 'Technical Recruiter', verification: 'uncertain', contact_email: 'pat@acme.example', contact_phone: '+15555550100', contact_source_url: 'https://acme.example/contact' },
    };
    const { p } = await build({ recruiters: 1, recruiterRows: [row], ran: ['recruiter_intel'] });
    expect(p.sections.recruiter_intel.items[0]).toMatchObject({ title: 'Pat Recruiter', company: 'Acme', verification: 'uncertain', url: 'https://acme.example/team', source: 'web' });
    expect(p.sections.recruiter_intel.items[0].detail).toBe('Technical Recruiter');
    expect(JSON.stringify(p)).not.toMatch(/pat@acme\.example|\+1555555|acme\.example\/contact/);
  });

  it("only reads the owner's open findings and stays inside the lookback windows of the digest day", async () => {
    const { log } = await build({});
    for (const q of log.filter((x) => ['ai_job_leads', 'ai_findings', 'ai_runs'].includes(x.table))) {
      expect(hasOp(q.ops, 'eq', 'user_id', ME), q.table).toBe(true);
      expect(hasOp(q.ops, 'eq', 'workspace_id', WS), q.table).toBe(true);
    }
    const leads = log.filter((q) => q.table === 'ai_job_leads');
    expect(leads.length).toBeGreaterThan(0);
    for (const q of leads) {
      expect(hasOp(q.ops, 'in', 'finding.status', ['NEW', 'REVIEWED'])).toBe(true);
      expect(hasOp(q.ops, 'gte', 'discovered_at', '2026-10-05T05:00:00.000Z')).toBe(true); // 7 local days ending with the digest date (CDT)
      expect(hasOp(q.ops, 'lt', 'discovered_at', '2026-10-12T05:00:00.000Z')).toBe(true);
    }
  });

  it('fails closed (no partial digest) when a source read fails', async () => {
    const w = world((table) => (table === 'ai_job_leads' ? { error: { code: '500' } } : table === 'profiles' ? { data: null } : {}));
    expect(await buildDeterministicDigest(ctx, '2026-10-11', { client: w.client, env: ON, now: NOW })).toMatchObject({ ok: false, error: { code: 'READ_FAILED' } });
  });
});
