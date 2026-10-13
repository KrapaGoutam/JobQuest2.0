import { describe, expect, it } from 'vitest';
import { STRONG_MATCH_THRESHOLD, validateAiResult } from '../../apps/api/src/lib/aiContract';
import type { AiReadClient } from '../../apps/api/src/services/aiReadService';
import { buildDeterministicDigest, toSystemDigestWire } from '../../apps/api/src/services/aiDigestService';

// AI-6: Daily Digest integration of job leads, email events and recruiter intel.
// Query-shape + payload semantics with a recording fake; the real-DB behaviour is in
// tests/integration/ai-6-sources.test.ts.
const WS = '11111111-1111-4111-8111-aaaaaaaaaaaa';
const ME = '22222222-2222-4222-8222-bbbbbbbbbbbb';
const ON = { AI_HUB_ENABLED: 'true' };
const NOW = () => new Date('2026-10-12T02:30:00Z'); // 2026-10-11 in America/Chicago
const ctx = { workspaceId: WS, userId: ME };

type Op = [string, ...unknown[]];
type Result = { data?: unknown; count?: number | null; error?: unknown };
const hasOp = (ops: Op[], ...o: Op) => ops.some((x) => JSON.stringify(x) === JSON.stringify(o));
const isCount = (ops: Op[]) => ops.some((o) => o[0] === 'select' && JSON.stringify(o[2]) === JSON.stringify({ count: 'exact', head: true }));

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

interface Sources {
  leads?: number; strong?: number; leadRows?: unknown[]; emails?: number; attention?: number; emailRows?: unknown[]; replies?: number; assessments?: number;
  deadlines?: number; deadlineRows?: unknown[]; recruiters?: number; recruiterRows?: unknown[]; ran?: Array<'job_discovery' | 'email_triage' | 'recruiter_intel'>;
}

/** Existing AI-5 tables return empty so only the AI-6 sources vary. */
function digestWorld(src: Sources) {
  return world((table, ops) => {
    const head = isCount(ops);
    switch (table) {
      case 'profiles': return { data: { timezone: 'America/Chicago' } };
      case 'applications': case 'interviews': case 'ai_suggestions': return head ? { count: 0 } : { data: [] };
      case 'ai_runs': return { data: src.ran?.some((w) => hasOp(ops, 'eq', 'workflow', w)) ? [{ id: 'r1' }] : [] };
      case 'ai_job_leads':
        if (head) return { count: hasOp(ops, 'gte', 'match_score', STRONG_MATCH_THRESHOLD) ? src.strong ?? 0 : src.leads ?? 0 };
        return { data: src.leadRows ?? [] };
      case 'ai_findings':
        if (hasOp(ops, 'eq', 'kind', 'email_event')) {
          const deadlineQuery = hasOp(ops, 'gte', 'due_at', '2026-10-11T05:00:00.000Z');
          if (head) {
            if (deadlineQuery) return { count: src.deadlines ?? 0 };
            if (hasOp(ops, 'eq', 'category', 'recruiter_reply')) return { count: src.replies ?? 0 };
            if (hasOp(ops, 'eq', 'category', 'assessment')) return { count: src.assessments ?? 0 };
            if (hasOp(ops, 'eq', 'status', 'NEW')) return { count: src.attention ?? 0 };
            return { count: src.emails ?? 0 };
          }
          return { data: deadlineQuery ? src.deadlineRows ?? [] : src.emailRows ?? [] };
        }
        if (hasOp(ops, 'eq', 'kind', 'recruiter_intel')) return head ? { count: src.recruiters ?? 0 } : { data: src.recruiterRows ?? [] };
        return { count: 0 };
      default: return {};
    }
  });
}

const build = async (src: Sources) => {
  const w = digestWorld(src);
  const r = await buildDeterministicDigest(ctx, '2026-10-11', { client: w.client, env: ON, now: NOW });
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return { p: r.data.payload as any, log: w.log, data: r.data };
};

describe('Daily Digest — external source availability (unchanged AI-5 semantics)', () => {
  it('no source has ever run: all three are not_configured and nothing is reported as zero', async () => {
    const { p } = await build({});
    for (const k of ['job_leads', 'email_activity', 'recruiter_intel']) expect(p.sections[k]).toEqual({ status: 'not_configured', items: [] });
    for (const k of ['new_job_leads', 'strong_matches', 'recruiter_replies', 'assessments']) expect(p.summary).not.toHaveProperty(k);
  });

  it('a source that ran successfully and found nothing is zero (with explicit zero counts)', async () => {
    const { p } = await build({ ran: ['job_discovery', 'email_triage', 'recruiter_intel'] });
    for (const k of ['job_leads', 'email_activity', 'recruiter_intel']) expect(p.sections[k]).toEqual({ status: 'zero', count: 0, items: [] });
    expect(p.summary).toMatchObject({ new_job_leads: 0, strong_matches: 0, recruiter_replies: 0, assessments: 0 });
  });

  it('sources are independent: one configured source does not configure the others', async () => {
    const { p } = await build({ ran: ['email_triage'] });
    expect(p.sections.email_activity.status).toBe('zero');
    expect(p.sections.job_leads.status).toBe('not_configured');
    expect(p.sections.recruiter_intel.status).toBe('not_configured');
    expect(p.summary).toHaveProperty('recruiter_replies');
    expect(p.summary).not.toHaveProperty('new_job_leads');
  });

  it('findings make a source available even if no run record exists', async () => {
    const { p } = await build({ leads: 1, leadRows: [{ company: 'Acme', title: 'Engineer', location: null, match_score: null, source_url: null, discovered_at: '2026-10-11T15:00:00Z' }] });
    expect(p.sections.job_leads).toMatchObject({ status: 'available', count: 1 });
    expect(p.summary).toMatchObject({ new_job_leads: 1, strong_matches: 0 });
  });
});

describe('Daily Digest — content', () => {
  const lead = (score: number | null, over: Record<string, unknown> = {}) => ({
    company: 'Acme', title: 'Staff Engineer', location: 'Austin, TX', match_score: score, source_url: 'https://jobs.example.com/42', discovered_at: '2026-10-11T15:00:00Z', ...over,
  });
  const email = (over: Record<string, unknown> = {}) => ({
    title: 'Interview invitation from Acme', category: 'interview_invitation', priority: 'HIGH', due_at: null, occurred_at: '2026-10-11T14:00:00Z', payload: { company: 'Acme' }, ...over,
  });

  it('counts strong matches only from stored scores (>= 80) and never treats a missing score as strong', async () => {
    const { p, log } = await build({ leads: 3, strong: 1, leadRows: [lead(91), lead(60, { title: 'Engineer' }), lead(null, { title: 'Unscored' })], ran: ['job_discovery'] });
    expect(p.summary).toMatchObject({ new_job_leads: 3, strong_matches: 1 });
    expect(log.some((q) => q.table === 'ai_job_leads' && hasOp(q.ops, 'gte', 'match_score', 80))).toBe(true);
    const items = p.sections.job_leads.items;
    expect(items.map((i: any) => i.priority)).toEqual(['HIGH', 'NORMAL', 'NORMAL']);
    expect(items[0]).toMatchObject({ title: 'Acme — Staff Engineer', detail: 'AI match 91/100 · Austin, TX', source: 'job_site', url: 'https://jobs.example.com/42' });
    expect(items[2].detail).toBe('Austin, TX'); // no invented score
    expect(p.priorities.map((x: any) => x.title)).toContain('1 strong job match (AI match 80+)');
  });

  it('suppresses unsafe lead URLs', async () => {
    const { p } = await build({ leads: 1, leadRows: [lead(70, { source_url: 'javascript:alert(1)' })] });
    expect(p.sections.job_leads.items[0]).not.toHaveProperty('url');
    expect(validateAiResult(toSystemDigestWire({ digestDate: '2026-10-11', timeZone: 'UTC', payload: p }, '2026-10-12T02:30:00Z')).errors).toEqual([]);
  });

  it('summarizes email activity, replies, assessments and attention', async () => {
    const { p } = await build({ emails: 4, attention: 2, replies: 1, assessments: 1, emailRows: [email(), email({ title: 'Assessment link', category: 'assessment', priority: 'NORMAL', due_at: '2026-10-14T20:00:00Z' })], ran: ['email_triage'] });
    expect(p.sections.email_activity).toMatchObject({ status: 'available', count: 4 });
    expect(p.summary).toMatchObject({ recruiter_replies: 1, assessments: 1 });
    expect(p.sections.email_activity.items[0]).toMatchObject({ title: 'Interview invitation from Acme', detail: 'interview invitation · Acme', priority: 'HIGH', source: 'gmail' });
    expect(p.sections.email_activity.items[1].detail).toContain('due 2026-10-14');
    expect(p.priorities[0]).toMatchObject({ title: '2 job-search emails need your attention', priority: 'HIGH' });
  });

  it('derives upcoming deadlines from email events and merges them with interviews, soonest first', async () => {
    const { p } = await build({ deadlines: 2, deadlineRows: [email({ title: 'Take-home due', category: 'deadline', due_at: '2026-10-13T20:00:00Z' }), email({ title: 'Reply by Friday', category: 'follow_up', due_at: '2026-10-15T20:00:00Z' })], ran: ['email_triage'] });
    expect(p.sections.upcoming).toMatchObject({ status: 'available', count: 2 });
    expect(p.sections.upcoming.items.map((i: any) => i.title)).toEqual(['Deadline: Take-home due', 'Deadline: Reply by Friday']);
    expect(p.sections.upcoming.items[0]).toMatchObject({ priority: 'HIGH', occurred_at: '2026-10-13T20:00:00.000Z' });
  });

  it('reports recruiter intel with the public source and verification state, never contact details', async () => {
    const row = { title: 'Pat Recruiter, Acme', created_at: '2026-10-11T16:00:00Z', source_ref: { url: 'https://acme.example/team' }, payload: { recruiter_name: 'Pat Recruiter', company: 'Acme', role_title: 'Technical Recruiter', verification: 'uncertain', contact_email: 'pat@acme.example' } };
    const { p } = await build({ recruiters: 1, recruiterRows: [row], ran: ['recruiter_intel'] });
    expect(p.sections.recruiter_intel.items[0]).toMatchObject({ title: 'Pat Recruiter — Acme', detail: 'Technical Recruiter · unverified', url: 'https://acme.example/team', source: 'web' });
    expect(JSON.stringify(p)).not.toContain('pat@acme.example');
  });

  it('only reads the owner\'s open findings and stays inside the digest day', async () => {
    const { log } = await build({});
    for (const q of log.filter((x) => ['ai_job_leads', 'ai_findings', 'ai_runs'].includes(x.table))) {
      expect(hasOp(q.ops, 'eq', 'user_id', ME), q.table).toBe(true);
      expect(hasOp(q.ops, 'eq', 'workspace_id', WS), q.table).toBe(true);
    }
    const leads = log.filter((q) => q.table === 'ai_job_leads');
    expect(leads.length).toBeGreaterThan(0);
    for (const q of leads) {
      expect(hasOp(q.ops, 'in', 'finding.status', ['NEW', 'REVIEWED'])).toBe(true);
      expect(hasOp(q.ops, 'gte', 'discovered_at', '2026-10-11T05:00:00.000Z')).toBe(true);
      expect(hasOp(q.ops, 'lt', 'discovered_at', '2026-10-12T05:00:00.000Z')).toBe(true);
    }
  });

  it('produces a payload the contract validator accepts (all three sources populated)', async () => {
    const { data } = await build({
      leads: 1, strong: 1, leadRows: [lead(88)], emails: 1, attention: 1, replies: 1, emailRows: [email()], recruiters: 1,
      recruiterRows: [{ title: 'x', created_at: '2026-10-11T16:00:00Z', source_ref: {}, payload: { recruiter_name: 'Pat', company: 'Acme', verification: 'verified' } }],
      ran: ['job_discovery', 'email_triage', 'recruiter_intel'],
    });
    const v = validateAiResult(toSystemDigestWire(data, '2026-10-12T02:30:00Z'));
    expect(v.errors).toEqual([]);
    expect(v.data!.findings[0]!.payload).toMatchObject({ sections: { job_leads: { status: 'available' }, email_activity: { status: 'available' }, recruiter_intel: { status: 'available' } } });
  });

  it('fails closed (no partial digest) when a source read fails', async () => {
    const w = world((table) => (table === 'ai_job_leads' ? { error: { code: '500' } } : table === 'profiles' ? { data: null } : {}));
    expect(await buildDeterministicDigest(ctx, '2026-10-11', { client: w.client, env: ON, now: NOW })).toMatchObject({ ok: false, error: { code: 'READ_FAILED' } });
  });
});
