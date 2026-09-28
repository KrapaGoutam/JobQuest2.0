import { describe, expect, it } from 'vitest';
import {
  agingRange,
  buildSearchFilter,
  calculateDaysInactive,
  computeAgingBand,
  type ApplicationEvent,
  type CanonicalWorkflow,
} from '../../apps/web/src/types/applications';
import { validateApplicationFields } from '../../apps/web/src/components/applications/validation';
import { describeEvent } from '../../apps/web/src/components/applications/eventText';

const DAY = 86_400_000;

describe('M3 aging bands (Gate 02B §4.5)', () => {
  it('maps whole days of inactivity to the approved bands', () => {
    expect([0, 3].map(computeAgingBand)).toEqual(['NEW', 'NEW']);
    expect([4, 7].map(computeAgingBand)).toEqual(['WAITING', 'WAITING']);
    expect([8, 14].map(computeAgingBand)).toEqual(['FOLLOW_UP_RECOMMENDED', 'FOLLOW_UP_RECOMMENDED']);
    expect([15, 30].map(computeAgingBand)).toEqual(['STALE', 'STALE']);
    expect([31, 400].map(computeAgingBand)).toEqual(['LONG_WAITING', 'LONG_WAITING']);
  });

  it('server-side ranges agree with the client band at every boundary', () => {
    const now = new Date('2026-09-24T12:00:00Z');
    const inRange = (band: 'STALE' | 'LONG_WAITING' | 'QUIET', at: Date) => {
      const r = agingRange(band, now);
      const t = at.toISOString();
      return t <= r.to && (r.from === null || t > r.from);
    };
    for (let days = 0; days <= 60; days++) {
      const at = new Date(now.getTime() - days * DAY - 60_000); // a minute past the day mark
      const daysInactive = Math.floor((now.getTime() - at.getTime()) / DAY);
      const band = computeAgingBand(daysInactive);
      expect(inRange('STALE', at), `day ${days}`).toBe(band === 'STALE');
      expect(inRange('LONG_WAITING', at), `day ${days}`).toBe(band === 'LONG_WAITING');
      expect(inRange('QUIET', at), `day ${days}`).toBe(band === 'STALE' || band === 'LONG_WAITING');
    }
  });

  it('calculateDaysInactive never returns negative days (clock skew)', () => {
    expect(calculateDaysInactive(new Date(Date.now() + 5 * DAY).toISOString())).toBe(0);
  });
});

describe('M3 search filter (PostgREST injection safety)', () => {
  it('returns null for blank input', () => {
    expect(buildSearchFilter('   ')).toBeNull();
  });
  it('quotes every value so separators cannot create new filter clauses', () => {
    const f = buildSearchFilter('x),user_id.neq.0,(company_name.eq.x')!;
    const clauses = f.split(/,(?=[a-z_]+\.(?:ilike|cs)\.)/);
    expect(clauses).toHaveLength(4); // exactly the 4 text columns; no injected clause, no tag clause
    for (const c of clauses) expect(c).toMatch(/^(company_name|role_title|location|notes)\.ilike\."\*.*\*"$/);
  });
  it('escapes LIKE wildcards and quotes', () => {
    expect(buildSearchFilter('50%_off')).toContain('company_name.ilike."*50\\\\%\\\\_off*"');
    expect(buildSearchFilter('say "hi"')).toContain('"*say \\"hi\\"*"');
  });
  it('adds an exact tag clause only for safe single tokens', () => {
    expect(buildSearchFilter('react')).toContain('tags.cs.{react}');
    expect(buildSearchFilter('react native')).not.toContain('tags.cs');
    expect(buildSearchFilter('a,b')).not.toContain('tags.cs');
  });
  it('bounds input length', () => {
    expect(buildSearchFilter('a'.repeat(500))!.length).toBeLessThan(1000);
  });
});

describe('M3 form validation (AC-CREATE-02)', () => {
  const ok = { companyName: 'Acme', roleTitle: 'Engineer', jobUrl: '', salaryMin: '', salaryMax: '', salaryCurrency: 'USD' };
  it('accepts a minimal valid record', () => {
    expect(validateApplicationFields(ok)).toBeNull();
  });
  it('requires company and role', () => {
    expect(validateApplicationFields({ ...ok, companyName: ' ' })).toMatch(/Company/);
    expect(validateApplicationFields({ ...ok, roleTitle: '' })).toMatch(/Role/);
  });
  it('rejects non-http(s) URLs', () => {
    expect(validateApplicationFields({ ...ok, jobUrl: 'javascript:alert(1)' })).toMatch(/URL/);
    expect(validateApplicationFields({ ...ok, jobUrl: 'https://jobs.example.com/1' })).toBeNull();
  });
  it('validates the salary range and currency', () => {
    expect(validateApplicationFields({ ...ok, salaryMin: '200', salaryMax: '100' })).toMatch(/max/);
    expect(validateApplicationFields({ ...ok, salaryMin: '-1' })).toMatch(/positive/);
    expect(validateApplicationFields({ ...ok, salaryCurrency: 'dollars' })).toMatch(/Currency/);
    expect(validateApplicationFields({ ...ok, salaryMin: '100', salaryMax: '100', salaryCurrency: 'eur' })).toBeNull();
  });
});

describe('M3 timeline text', () => {
  const wf: CanonicalWorkflow = {
    stages: [
      { id: 'APPLIED', label: 'Applied', order: 3 },
      { id: 'INTERVIEW', label: 'Interview', order: 6 },
    ],
    outcomes: [{ id: 'WITHDRAWN', label: 'Withdrawn', terminal_state: 'CLOSED' }],
    closure_reasons: [],
  };
  const ev = (event_type: ApplicationEvent['event_type'], payload: Record<string, unknown>): ApplicationEvent => ({
    id: '1', application_id: 'a', workspace_id: 'w', actor_id: 'u', event_type, payload_version: 1, payload, created_at: '2026-09-24T00:00:00Z',
  });
  it('uses canonical labels for stage transitions and outcomes', () => {
    expect(describeEvent(ev('STAGE_CHANGED', { from_stage: 'APPLIED', to_stage: 'INTERVIEW', notes: 'n' }), wf)).toEqual({ label: 'Stage: Applied → Interview', detail: 'n' });
    expect(describeEvent(ev('OUTCOME_CHANGED', { outcome: 'WITHDRAWN', closure_reason: 'OFFER_DECLINED' }), wf).label).toBe('Closed: Withdrawn');
    expect(describeEvent(ev('OUTCOME_CHANGED', { outcome: 'WITHDRAWN', closure_reason: 'OFFER_DECLINED' }), wf).detail).toBe('Reason: Offer declined');
    expect(describeEvent(ev('KEEP_ACTIVE', {}), wf).label).toMatch(/Reviewed application/);
  });
});
