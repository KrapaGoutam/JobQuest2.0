import { describe, expect, it } from 'vitest';
import type { AppRow } from '../../apps/api/src/services/aiApplicationMatchService';
import { evaluateEmailApplicationMatch, matchEmailsToApplications, EMAIL_MATCH_POSSIBLE_LIMIT } from '../../apps/api/src/services/aiEmailMatchService';

// AI-11B application matching for email: server-owned, derived, conservative. The provider supplies company + role
// text (untrusted hints); only the owner's own live applications can ever be candidates.

const app = (over: Partial<AppRow> = {}): AppRow => ({
  id: '00000000-0000-4000-8000-000000000001', user_id: 'u1', company_name: 'Acme Inc.', role_title: 'QA Engineer', job_url: null, external_job_id: null, source: null,
  location: null, work_arrangement: null, stage: 'INTERVIEW', status: 'ACTIVE', outcome: null, archived_at: null,
  last_activity_at: '2026-09-28T10:00:00Z', created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-28T10:00:00Z', ...over,
});
const mail = (over: Record<string, unknown> = {}) => ({ group: 'job_related' as const, company: 'Acme', roleTitle: 'QA Engineer', receivedAt: '2026-10-01T12:00:00Z', ...over });

describe('evaluateEmailApplicationMatch', () => {
  it('MATCHED: one application agrees on company and role (legal suffix and case are ignored) with nearby activity', () => {
    const m = evaluateEmailApplicationMatch([app()], mail({ company: 'ACME' }));
    expect(m.state).toBe('MATCHED');
    expect(m.application).toMatchObject({ company: 'Acme Inc.', title: 'QA Engineer', stage: 'INTERVIEW' });
    expect(m.basis).toBe('company_title_context');
    expect(Object.keys(m.application!).sort()).toEqual(['company', 'id', 'outcome', 'stage', 'status', 'title']); // no URL, no timestamps
    expect(m.possible).toEqual([]);
  });

  it('POSSIBLE is never authoritative: it lists candidates and selects none', () => {
    const two = [app(), app({ id: '00000000-0000-4000-8000-000000000002', last_activity_at: '2026-09-29T10:00:00Z' })];
    const m = evaluateEmailApplicationMatch(two, mail());
    expect(m.state).toBe('POSSIBLE');
    expect(m.application).toBeNull();
    expect(m.possible).toHaveLength(2);
    // Same company + role but no recent activity at all: weak, so still only POSSIBLE.
    const stale = evaluateEmailApplicationMatch([app({ last_activity_at: '2026-01-01T10:00:00Z', created_at: '2026-01-01T10:00:00Z' })], mail());
    expect(stale.state).toBe('POSSIBLE');
    expect(stale.application).toBeNull();
  });

  it('a company with no role in the email is only ever POSSIBLE (never MATCHED)', () => {
    const m = evaluateEmailApplicationMatch([app()], mail({ roleTitle: null }));
    expect(m).toMatchObject({ state: 'POSSIBLE', basis: 'company', application: null });
    expect(m.possible.map((a) => a.title)).toEqual(['QA Engineer']);
  });

  it('UNMATCHED: nothing fits, a different role at the same company, or nothing to compare', () => {
    expect(evaluateEmailApplicationMatch([app()], mail({ company: 'Other Corp' })).state).toBe('UNMATCHED');
    expect(evaluateEmailApplicationMatch([app()], mail({ roleTitle: 'Data Scientist' })).state).toBe('UNMATCHED');
    expect(evaluateEmailApplicationMatch([app()], mail({ company: null })).state).toBe('UNMATCHED');
    expect(evaluateEmailApplicationMatch([], mail()).state).toBe('UNMATCHED');
    expect(evaluateEmailApplicationMatch([app()], mail({ company: 'Ac' })).state).toBe('UNMATCHED'); // a prefix is not a company
  });

  it('archived applications are never candidates', () => {
    expect(evaluateEmailApplicationMatch([app({ archived_at: '2026-09-30T00:00:00Z' })], mail()).state).toBe('UNMATCHED');
  });

  it('non-job mail is NOT_APPLICABLE and never matched', () => {
    expect(evaluateEmailApplicationMatch([app()], mail({ group: 'other' })).state).toBe('NOT_APPLICABLE');
    expect(evaluateEmailApplicationMatch([app()], mail({ group: null })).state).toBe('NOT_APPLICABLE');
  });

  it('lists at most three possible candidates, newest activity first', () => {
    const rows = [1, 2, 3, 4, 5].map((n) => app({ id: `00000000-0000-4000-8000-00000000000${n}`, role_title: 'QA', last_activity_at: `2026-09-2${n}T10:00:00Z` }));
    const m = evaluateEmailApplicationMatch(rows, mail({ roleTitle: null }));
    expect(m.possible).toHaveLength(EMAIL_MATCH_POSSIBLE_LIMIT);
    expect(m.possible.map((a) => a.id.slice(-1))).toEqual(['5', '4', '3']);
  });

  it('is deterministic', () => {
    const rows = [app(), app({ id: '00000000-0000-4000-8000-000000000002' })];
    expect(evaluateEmailApplicationMatch(rows, mail())).toEqual(evaluateEmailApplicationMatch([...rows].reverse(), mail()));
  });
});

describe('matchEmailsToApplications', () => {
  type Call = { table: string; filters: Array<[string, unknown]> };
  const fake = (rowsByOwner: Record<string, AppRow[]>, calls: Call[], fail = false) => ({
    from(table: string) {
      const call: Call = { table, filters: [] };
      calls.push(call);
      const q: any = {
        select: () => q, order: () => q,
        eq: (k: string, v: unknown) => { call.filters.push([k, v]); return q; },
        is: (k: string, v: unknown) => { call.filters.push([k, v]); return q; },
        limit: () => {
          const owner = call.filters.find(([k]) => k === 'user_id')?.[1] as string;
          return Promise.resolve(fail ? { data: null, error: { code: 'XX' } } : { data: rowsByOwner[owner] ?? [], error: null });
        },
      };
      return q;
    },
  });

  it('reads once per owner, scoped by workspace + owner + live, and evaluates each email against its OWN owner', async () => {
    const calls: Call[] = [];
    const db = fake({ u1: [app()], u2: [app({ id: '00000000-0000-4000-8000-0000000000aa', user_id: 'u2', company_name: 'Zed', role_title: 'Dev' })] }, calls);
    const out = await matchEmailsToApplications(db, 'ws-1', [
      { id: 'e1', ownerId: 'u1', group: 'job_related', company: 'Acme', roleTitle: 'QA Engineer', receivedAt: '2026-10-01T12:00:00Z' },
      { id: 'e2', ownerId: 'u1', group: 'job_related', company: 'Zed', roleTitle: 'Dev', receivedAt: '2026-10-01T12:00:00Z' },
      { id: 'e3', ownerId: 'u2', group: 'job_related', company: 'Acme', roleTitle: 'QA Engineer', receivedAt: '2026-10-01T12:00:00Z' },
      { id: 'e4', ownerId: 'u1', group: 'other', company: null, roleTitle: null, receivedAt: null },
    ]);
    expect(calls).toHaveLength(2); // u1 and u2, once each
    for (const c of calls) {
      expect(c.table).toBe('applications');
      expect(c.filters).toEqual(expect.arrayContaining([['workspace_id', 'ws-1'], ['archived_at', null]]));
    }
    expect(out.get('e1')!.state).toBe('MATCHED');
    expect(out.get('e2')!.state).toBe('UNMATCHED'); // Zed belongs to u2, not to e2's owner
    expect(out.get('e3')!.state).toBe('UNMATCHED'); // u2 has no Acme
    expect(out.get('e4')!.state).toBe('NOT_APPLICABLE');
  });

  it('does not read at all when no email can be matched', async () => {
    const calls: Call[] = [];
    const out = await matchEmailsToApplications(fake({}, calls), 'ws-1', [{ id: 'e1', ownerId: 'u1', group: 'other', company: null, roleTitle: null, receivedAt: null }]);
    expect(calls).toHaveLength(0);
    expect(out.get('e1')!.state).toBe('NOT_APPLICABLE');
  });

  it('a read failure rejects so the caller can degrade (the match is optional context)', async () => {
    await expect(matchEmailsToApplications(fake({}, [], true), 'ws-1', [{ id: 'e1', ownerId: 'u1', group: 'job_related', company: 'Acme', roleTitle: 'QA', receivedAt: null }])).rejects.toThrow('MATCH_READ_FAILED');
  });
});
