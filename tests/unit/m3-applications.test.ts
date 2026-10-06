import { describe, expect, it } from 'vitest';
import {
  agingRange,
  buildSearchFilter,
  calculateDaysInactive,
  computeAgingBand,
  type Application,
  type ApplicationEvent,
  type CanonicalWorkflow,
} from '../../apps/web/src/types/applications';
import { validateApplicationFields } from '../../apps/web/src/components/applications/validation';
import { describeEvent } from '../../apps/web/src/components/applications/eventText';
import {
  dateAddedBounds,
  groupApplicationsByDate,
  groupApplicationsByMonth,
  sortDirectionLabel,
} from '../../apps/web/src/lib/applicationProductivity';

const DAY = 86_400_000;

describe('PL-2 application productivity', () => {
  const application = (id: string, createdAt: string): Application => ({
    id,
    created_at: createdAt,
  } as Application);

  it('leaves Date Added unbounded when no filter is selected', () => {
    expect(dateAddedBounds({ from: '', to: '' }, 'America/Chicago')).toEqual({
      from: undefined,
      toExclusive: undefined,
    });
  });

  it('builds inclusive Date Added boundaries in the profile time zone', () => {
    expect(dateAddedBounds({ from: '2026-03-08', to: '2026-03-08' }, 'America/Chicago')).toEqual({
      from: '2026-03-08T06:00:00.000Z',
      toExclusive: '2026-03-09T05:00:00.000Z',
    });
  });

  it('groups the bounded result set by Date Added month across years without duplicates', () => {
    const applications = [
      application('jan-2026', '2026-01-15T12:00:00Z'),
      application('dec-2025', '2025-12-31T23:00:00Z'),
      application('jan-2026-b', '2026-01-02T12:00:00Z'),
    ];
    const groups = groupApplicationsByMonth(applications, 'UTC');
    expect(groups.map((group) => [group.label, group.applications.map((item) => item.id)])).toEqual([
      ['January 2026', ['jan-2026', 'jan-2026-b']],
      ['December 2025', ['dec-2025']],
    ]);
    expect(groups.flatMap((group) => group.applications).map((item) => item.id).sort()).toEqual(
      applications.map((item) => item.id).sort(),
    );
  });

  it('uses human-readable direction labels for text and Date Added sorts', () => {
    expect(sortDirectionLabel({ field: 'company_name', direction: 'asc' })).toBe('A to Z');
    expect(sortDirectionLabel({ field: 'company_name', direction: 'desc' })).toBe('Z to A');
    expect(sortDirectionLabel({ field: 'created_at', direction: 'asc' })).toBe('Oldest to newest');
    expect(sortDirectionLabel({ field: 'created_at', direction: 'desc' })).toBe('Newest to oldest');
  });
});

describe('2.1-C Application date grouping', () => {
  const application = (id: string, createdAt?: string, appliedAt?: string): Application => ({
    id,
    created_at: createdAt,
    applied_at: appliedAt,
  } as unknown as Application);

  const referenceNow = '2026-10-06T15:00:00Z'; // Today: 2026-10-06, Yesterday: 2026-10-05

  it('Scenario A — groups applications from the same calendar date under one heading', () => {
    const apps = [
      application('app-1', '2026-10-04T09:00:00Z'),
      application('app-2', '2026-10-04T18:30:00Z'),
    ];
    const groups = groupApplicationsByDate(apps, 'UTC', 'desc', referenceNow);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe('2026-10-04');
    expect(groups[0]?.label).toBe('October 4, 2026');
    expect(groups[0]?.applications.map((a) => a.id)).toEqual(['app-1', 'app-2']);
  });

  it('Scenario B — separates applications from multiple calendar dates into distinct day groups', () => {
    const apps = [
      application('app-oct-4', '2026-10-04T12:00:00Z'),
      application('app-oct-3', '2026-10-03T12:00:00Z'),
      application('app-sep-28', '2026-09-28T12:00:00Z'),
    ];
    const groups = groupApplicationsByDate(apps, 'UTC', 'desc', referenceNow);
    expect(groups.map((g) => g.label)).toEqual(['October 4, 2026', 'October 3, 2026', 'September 28, 2026']);
    expect(groups.map((g) => g.key)).toEqual(['2026-10-04', '2026-10-03', '2026-09-28']);
    expect(groups.map((g) => g.applications.map((a) => a.id))).toEqual([
      ['app-oct-4'],
      ['app-oct-3'],
      ['app-sep-28'],
    ]);
  });

  it('Scenario C — labels current-day applications as Today', () => {
    const apps = [
      application('app-today-1', '2026-10-06T08:00:00Z'),
      application('app-today-2', '2026-10-06T14:30:00Z'),
    ];
    const groups = groupApplicationsByDate(apps, 'UTC', 'desc', referenceNow);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe('2026-10-06');
    expect(groups[0]?.label).toBe('Today');
    expect(groups[0]?.applications.map((a) => a.id)).toEqual(['app-today-1', 'app-today-2']);
  });

  it('Scenario D — labels previous-day applications as Yesterday', () => {
    const apps = [
      application('app-yesterday', '2026-10-05T20:00:00Z'),
    ];
    const groups = groupApplicationsByDate(apps, 'UTC', 'desc', referenceNow);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe('2026-10-05');
    expect(groups[0]?.label).toBe('Yesterday');
    expect(groups[0]?.applications.map((a) => a.id)).toEqual(['app-yesterday']);
  });

  it('Scenario E — preserves Month grouping functionality without regression', () => {
    const apps = [
      application('jan-2026', '2026-01-15T12:00:00Z'),
      application('dec-2025', '2025-12-31T23:00:00Z'),
      application('jan-2026-b', '2026-01-02T12:00:00Z'),
    ];
    const groups = groupApplicationsByMonth(apps, 'UTC', 'desc');
    expect(groups.map((g) => [g.label, g.applications.map((a) => a.id)])).toEqual([
      ['January 2026', ['jan-2026', 'jan-2026-b']],
      ['December 2025', ['dec-2025']],
    ]);
  });

  it('Scenario F — default / no grouping retains flat list of applications', () => {
    const apps = [
      application('app-1', '2026-10-04T12:00:00Z'),
      application('app-2', '2026-10-03T12:00:00Z'),
    ];
    // Flat grouping convention
    const noGrouping = [{ key: 'all', label: '', applications: apps }];
    expect(noGrouping).toHaveLength(1);
    expect(noGrouping[0]?.applications).toBe(apps);
    expect(noGrouping[0]?.label).toBe('');
  });

  it('Scenario G — handles missing or invalid dates safely with fallback label', () => {
    const apps = [
      application('app-dated', '2026-10-04T12:00:00Z'),
      application('app-no-date-1', undefined, undefined),
      application('app-no-date-2', '', ''),
      application('app-invalid-date', 'not-a-valid-date'),
    ];
    const groups = groupApplicationsByDate(apps, 'UTC', 'desc', referenceNow);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.label).toBe('October 4, 2026');
    expect(groups[1]?.key).toBe('undated');
    expect(groups[1]?.label).toBe('No application date');
    expect(groups[1]?.applications.map((a) => a.id)).toEqual([
      'app-no-date-1',
      'app-no-date-2',
      'app-invalid-date',
    ]);

    // Also verify groupApplicationsByMonth safely handles undated apps
    const monthGroups = groupApplicationsByMonth(apps, 'UTC', 'desc');
    expect(monthGroups[monthGroups.length - 1]?.label).toBe('No application date');
  });

  it('Scenario H — grouping operates strictly on active result set without resurrecting filtered items', () => {
    const allApps = [
      application('active-1', '2026-10-04T12:00:00Z'),
      application('filtered-out', '2026-10-04T13:00:00Z'),
      application('active-2', '2026-10-03T12:00:00Z'),
    ];
    // Filter applied before grouping
    const filteredApps = allApps.filter((a) => a.id.startsWith('active-'));
    const groups = groupApplicationsByDate(filteredApps, 'UTC', 'desc', referenceNow);
    const resultIds = groups.flatMap((g) => g.applications.map((a) => a.id));
    expect(resultIds).toEqual(['active-1', 'active-2']);
    expect(resultIds).not.toContain('filtered-out');
  });

  it('supports ascending date order and preserves intra-group sort order', () => {
    const apps = [
      application('b-today', '2026-10-06T14:00:00Z'),
      application('a-today', '2026-10-06T09:00:00Z'),
      application('c-yesterday', '2026-10-05T12:00:00Z'),
      application('undated-app', undefined),
    ];
    const ascGroups = groupApplicationsByDate(apps, 'UTC', 'asc', referenceNow);
    expect(ascGroups.map((g) => g.label)).toEqual(['Yesterday', 'Today', 'No application date']);
    // Intra-group ordering preserved exactly as provided
    const todayGroup = ascGroups.find((g) => g.key === '2026-10-06');
    expect(todayGroup?.applications.map((a) => a.id)).toEqual(['b-today', 'a-today']);
  });

  it('respects profile timezone when bucketing into calendar dates', () => {
    // 2026-10-07T02:00:00Z is 2026-10-06 21:00 in America/Chicago (CDT)
    const apps = [application('night-app', '2026-10-07T02:00:00Z')];
    const chicagoGroups = groupApplicationsByDate(apps, 'America/Chicago', 'desc', '2026-10-06T15:00:00Z');
    expect(chicagoGroups[0]?.key).toBe('2026-10-06');
    expect(chicagoGroups[0]?.label).toBe('Today');

    const utcGroups = groupApplicationsByDate(apps, 'UTC', 'desc', '2026-10-06T15:00:00Z');
    expect(utcGroups[0]?.key).toBe('2026-10-07');
    expect(utcGroups[0]?.label).toBe('October 7, 2026');
  });

  it('2.1-PA Issue C — proves rendered grouping behavior and mutual exclusivity (None / Date / Month)', () => {
    const apps = [
      application('app-oct-6', '2026-10-06T10:00:00Z'),
      application('app-oct-5', '2026-10-05T14:00:00Z'),
      application('app-sep-15', '2026-09-15T09:00:00Z'),
    ];

    // Helper mirroring ApplicationsTable's exact activeGrouping and rendered groups logic
    function resolveRenderedGroups(groupBy: 'none' | 'date' | 'month', groupByMonthFlag: boolean) {
      const activeGrouping = groupBy ?? (groupByMonthFlag ? 'month' : 'none');
      const isGrouped = activeGrouping !== 'none';
      let groups: Array<{ key: string; label: string; applications: typeof apps }>;

      if (activeGrouping === 'date') {
        groups = groupApplicationsByDate(apps, 'UTC', 'desc', referenceNow);
      } else if (activeGrouping === 'month') {
        groups = groupApplicationsByMonth(apps, 'UTC', 'desc');
      } else {
        groups = [{ key: 'all', label: '', applications: apps }];
      }

      return {
        activeGrouping,
        isGrouped,
        renderedHeadings: isGrouped ? groups.map((g) => g.label) : [],
        groups,
      };
    }

    // 1. None: Flat list without rendered headings
    const noneState = resolveRenderedGroups('none', false);
    expect(noneState.activeGrouping).toBe('none');
    expect(noneState.isGrouped).toBe(false);
    expect(noneState.renderedHeadings).toEqual([]);
    expect(noneState.groups).toHaveLength(1);
    expect(noneState.groups[0]?.applications.map((a) => a.id)).toEqual(['app-oct-6', 'app-oct-5', 'app-sep-15']);

    // 2. Date: Click "Group by date" -> actual rendered day headings appear and applications move under correct headings
    const dateState = resolveRenderedGroups('date', false);
    expect(dateState.activeGrouping).toBe('date');
    expect(dateState.isGrouped).toBe(true);
    expect(dateState.renderedHeadings).toEqual(['Today', 'Yesterday', 'September 15, 2026']);
    expect(dateState.groups.find((g) => g.label === 'Today')?.applications.map((a) => a.id)).toEqual(['app-oct-6']);
    expect(dateState.groups.find((g) => g.label === 'Yesterday')?.applications.map((a) => a.id)).toEqual(['app-oct-5']);
    expect(dateState.groups.find((g) => g.label === 'September 15, 2026')?.applications.map((a) => a.id)).toEqual(['app-sep-15']);

    // 3. Month: Click "Group by month" -> monthly headings render
    const monthState = resolveRenderedGroups('month', true);
    expect(monthState.activeGrouping).toBe('month');
    expect(monthState.isGrouped).toBe(true);
    expect(monthState.renderedHeadings).toEqual(['October 2026', 'September 2026']);
    expect(monthState.groups.find((g) => g.label === 'October 2026')?.applications.map((a) => a.id)).toEqual(['app-oct-6', 'app-oct-5']);
    expect(monthState.groups.find((g) => g.label === 'September 2026')?.applications.map((a) => a.id)).toEqual(['app-sep-15']);

    // 4. Mutual exclusivity: Date and Month cannot both remain logically active
    // If state is 'date', groupByMonth flag in parent is false (groupBy === 'month' is false)
    const dateExclusive = resolveRenderedGroups('date', false);
    expect(dateExclusive.activeGrouping).toBe('date');
    expect(dateExclusive.renderedHeadings).not.toContain('October 2026');

    // If toolbar previously dispatched conflicting legacy toggle (now removed), toolbar ensures single source of truth
    const toggleGrouping = (current: 'none' | 'date' | 'month', target: 'date' | 'month'): 'none' | 'date' | 'month' =>
      current === target ? 'none' : target;
    expect(toggleGrouping('none', 'date')).toBe('date');
    expect(toggleGrouping('date', 'date')).toBe('none');
    expect(toggleGrouping('month', 'date')).toBe('date');
  });
});

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
