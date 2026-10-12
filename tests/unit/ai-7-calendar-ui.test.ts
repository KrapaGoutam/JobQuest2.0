import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import * as C from '../../apps/api/src/lib/aiContract';
import { toCalendarEvent } from '../../apps/api/src/services/aiCalendarService';
import * as W from '../../apps/web/src/lib/aiCalendar';
import { AI_HUB_TABS, aiHubPathForTab, aiHubTabFromPath, allowlistedPayloadItems, type AiHubSnapshot } from '../../apps/web/src/lib/aiHub';
import { AiHubCalendarPanel, CalendarCard, type CalendarPanelProps } from '../../apps/web/src/views/AiHubCalendar';
import { AiHubOverview, AiHubShell } from '../../apps/web/src/views/AiHubView';

vi.mock('../../apps/web/src/supabase', () => ({ supabase: { from: () => { throw new Error('unexpected'); }, rpc: () => { throw new Error('unexpected'); } } }));

const noop = () => undefined;
const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
const TZ = 'America/Chicago';

// ---- fixtures ----------------------------------------------------------------------------------------------------
const row = (over: Partial<W.CalendarRow> = {}, finding: Partial<W.CalendarRow['finding']> = {}): W.CalendarRow => ({
  finding_id: 'f1', user_id: 'u1', category: 'interview', is_deadline: false, status: 'scheduled', all_day: false,
  start_at: '2026-10-15T19:00:00+00:00', end_at: '2026-10-15T20:00:00+00:00', start_date: null, end_date: null, deadline_at: null, sort_at: '2026-10-15T19:00:00+00:00',
  time_zone: 'America/Chicago', calendar_source: 'google_calendar', source_event_url: 'https://calendar.example.com/e?eid=abc', company: 'Example Corp', job_title: 'Staff Engineer',
  location: 'Video call', meeting_url: 'https://meet.example.com/abc', organizer_name: 'Pat Recruiter', organizer_domain: 'example.com', original_start_at: null,
  reschedule_count: 0, cancelled_at: null, discovered_at: '2026-10-12T12:00:00+00:00',
  finding: { provider: 'claude', status: 'NEW', priority: 'HIGH', confidence: 0.9, title: 'Technical interview — Example Corp', summary: 'Second-round interview.', evidence: 'Invitation: technical interview.', job_url: null, ...finding },
  ...over,
});
const view = (over: Partial<W.CalendarRow> = {}, finding: Partial<W.CalendarRow['finding']> = {}) => W.toCalendarView(row(over, finding));
const deadlineRow = (over: Partial<W.CalendarRow> = {}) => row({
  category: 'assessment_deadline', is_deadline: true, start_at: null, end_at: null, deadline_at: '2026-10-16T22:00:00+00:00', sort_at: '2026-10-16T22:00:00+00:00', meeting_url: null, ...over,
}, { title: 'Coding assessment due' });
const allDayRow = (over: Partial<W.CalendarRow> = {}) => row({
  category: 'application_deadline', is_deadline: true, all_day: true, start_at: null, end_at: null, start_date: '2026-10-20', end_date: '2026-10-20', sort_at: '2026-10-20T05:00:00+00:00', meeting_url: null, ...over,
}, { title: 'Application closes' });

describe('client/server contract sync', () => {
  it('categories, statuses and the workflow match the server contract', () => {
    expect([...W.CALENDAR_CATEGORIES]).toEqual([...C.CALENDAR_CATEGORIES]);
    expect([...W.CALENDAR_DEADLINE_CATEGORIES]).toEqual([...C.CALENDAR_DEADLINE_CATEGORIES]);
    expect([...W.CALENDAR_STATUSES]).toEqual([...C.CALENDAR_STATUSES]);
    expect(W.CALENDAR_WORKFLOW).toBe('calendar_review');
    for (const c of C.CALENDAR_CATEGORIES) expect(W.calendarCategoryLabel(c), c).not.toBe('Other');
    for (const s of C.CALENDAR_STATUSES) expect(W.calendarStatusLabel(s), s).toBeTruthy();
    for (const c of C.CALENDAR_CATEGORIES) expect(W.isDeadlineCategory(c)).toBe((C.CALENDAR_DEADLINE_CATEGORIES as readonly string[]).includes(c));
  });
  it('the server DTO and the browser view agree on what an item is', () => {
    const r = row();
    const server = toCalendarEvent({ ...r, finding: { ...r.finding, title: r.finding.title } } as unknown as Record<string, unknown>);
    const web = W.toCalendarView(r);
    expect(web).toMatchObject({ category: server.category, status: server.status, isDeadline: server.isDeadline, allDay: server.allDay, company: server.company, meetingUrl: server.meetingUrl, title: server.title, provider: server.provider });
    expect(server).not.toHaveProperty('sourceEventId');
    expect(JSON.stringify(server)).not.toMatch(/source_event_id|dedupe|attendee/i);
  });
  it('links leaving either side are https-only and credential-free', () => {
    for (const bad of ['http://meet.example.com/x', 'javascript:alert(1)', 'https://u:p@meet.example.com/x', 'data:text/html,x']) {
      expect(W.toCalendarView(row({ meeting_url: bad })).meetingUrl, bad).toBeNull();
      expect(toCalendarEvent(row({ meeting_url: bad }) as unknown as Record<string, unknown>).meetingUrl, bad).toBeNull();
      expect(W.toCalendarView(row({ source_event_url: bad })).sourceEventUrl, bad).toBeNull();
    }
  });
});

describe('windows (owner zone)', () => {
  const now = new Date('2026-10-12T18:30:00Z'); // 13:30 in Chicago
  const win = (v: W.CalendarViewId, range = { from: '', to: '' }, tz = TZ, weekStart: 0 | 1 = 1, at = now) => {
    const r = W.calendarWindow(v, range, tz, at, weekStart);
    if (!r.ok) throw new Error(r.message);
    return r.window;
  };
  it('upcoming is "from now"; past is "before now"; today is the local calendar day', () => {
    expect(win('upcoming')).toMatchObject({ since: '2026-10-12T18:30:00.000Z', before: null, mode: 'future', fromDate: '2026-10-12', order: 'asc' });
    expect(win('past')).toMatchObject({ since: null, before: '2026-10-12T18:30:00.000Z', mode: 'past', toDate: '2026-10-12', order: 'desc' });
    expect(win('today')).toMatchObject({ since: '2026-10-12T05:00:00.000Z', before: '2026-10-13T05:00:00.000Z', fromDate: '2026-10-12', toDate: '2026-10-12' });
  });
  it('"today" follows the owner zone, not UTC: late evening in Chicago is already tomorrow in UTC', () => {
    const late = new Date('2026-10-13T03:30:00Z'); // 22:30 Oct 12 in Chicago
    expect(win('today', undefined, TZ, 1, late).fromDate).toBe('2026-10-12');
    expect(win('today', undefined, 'UTC', 1, late).fromDate).toBe('2026-10-13');
    expect(win('today', undefined, 'Asia/Tokyo', 1, late).fromDate).toBe('2026-10-13');
  });
  it('day windows are DST-correct (25-hour and 23-hour days)', () => {
    const hours = (day: string) => { const w = win('today', undefined, TZ, 1, new Date(`${day}T18:00:00Z`)); return (Date.parse(w.before!) - Date.parse(w.since!)) / 3_600_000; };
    expect(hours('2026-11-01')).toBe(25);
    expect(hours('2026-03-08')).toBe(23);
    expect(hours('2026-06-10')).toBe(24);
  });
  it('this week starts on the profile week start (Monday or Sunday) and covers seven local days', () => {
    expect(win('week', undefined, TZ, 1)).toMatchObject({ fromDate: '2026-10-12', toDate: '2026-10-18', since: '2026-10-12T05:00:00.000Z', before: '2026-10-19T05:00:00.000Z' }); // Mon 12 Oct 2026
    expect(win('week', undefined, TZ, 0)).toMatchObject({ fromDate: '2026-10-11', toDate: '2026-10-17' }); // Sunday start
    const sun = new Date('2026-10-18T18:00:00Z');
    expect(win('week', undefined, TZ, 1, sun).fromDate).toBe('2026-10-12');
    expect(win('week', undefined, TZ, 0, sun).fromDate).toBe('2026-10-18');
    // week across the fall-back transition is 169 hours
    const w = win('week', undefined, TZ, 1, new Date('2026-10-28T18:00:00Z'));
    expect((Date.parse(w.before!) - Date.parse(w.since!)) / 3_600_000).toBe(168 + 1);
  });
  it('a custom range is inclusive in the owner zone and validated', () => {
    expect(win('custom', { from: '2026-10-11', to: '2026-10-11' })).toMatchObject({ since: '2026-10-11T05:00:00.000Z', before: '2026-10-12T05:00:00.000Z', fromDate: '2026-10-11', toDate: '2026-10-11' });
    expect(win('custom', { from: '2026-10-11', to: '' })).toMatchObject({ before: null, toDate: null });
    expect(win('custom', { from: '', to: '2026-10-11' })).toMatchObject({ since: null });
    for (const bad of [{ from: '2026-10-12', to: '2026-10-01' }, { from: '2026-13-01', to: '' }, { from: '', to: '' }, { from: 'x', to: '' }]) {
      expect(W.calendarWindow('custom', bad, TZ, now)).toMatchObject({ ok: false });
    }
  });
  it('the PostgREST filter handles timed items by instant and all-day items by calendar date', () => {
    expect(W.calendarWindowOr(win('today'))).toBe('and(all_day.eq.false,sort_at.gte.2026-10-12T05:00:00.000Z,sort_at.lt.2026-10-13T05:00:00.000Z),and(all_day.eq.true,end_date.gte.2026-10-12,start_date.lte.2026-10-12)');
    expect(W.calendarWindowOr(win('upcoming'))).toBe('and(all_day.eq.false,sort_at.gte.2026-10-12T18:30:00.000Z),and(all_day.eq.true,end_date.gte.2026-10-12)');
    expect(W.calendarWindowOr(win('past'))).toBe('and(all_day.eq.false,sort_at.lt.2026-10-12T18:30:00.000Z),and(all_day.eq.true,end_date.lt.2026-10-12)');
    expect(W.calendarWindowOr(win('custom', { from: '2026-10-11', to: '' }))).toBe('and(all_day.eq.false,sort_at.gte.2026-10-11T05:00:00.000Z),and(all_day.eq.true,end_date.gte.2026-10-11)');
  });
  it('an invalid zone falls back to UTC rather than throwing', () => {
    expect(win('today', undefined, 'Not/AZone', 1, now).fromDate).toBe('2026-10-12');
  });
});

describe('labels and grouping', () => {
  it('renders times in the owner zone, with the zone abbreviation, and a deadline is never worded like a meeting', () => {
    const e = view();
    expect(W.calendarWhenLabel(e, TZ)).toBe('Thu, Oct 15 · 2:00 PM–3:00 PM CDT');
    expect(W.calendarWhenLabel(e, 'Europe/Berlin')).toContain('9:00');
    expect(W.calendarWhenLabel(e, 'Asia/Kolkata')).toContain('12:30');
    const d = W.toCalendarView(deadlineRow());
    expect(W.calendarWhenLabel(d, TZ)).toBe('Due Fri, Oct 16 · 5:00 PM CDT');
    expect(W.calendarKindLabel(d)).toBe('Deadline');
    expect(W.calendarKindLabel(e)).toBe('Scheduled event');
  });
  it('start-only, multi-day and all-day items', () => {
    expect(W.calendarWhenLabel(view({ end_at: null }), TZ)).toBe('Thu, Oct 15 · 2:00 PM CDT');
    expect(W.calendarWhenLabel(view({ end_at: '2026-10-16T14:00:00+00:00' }), TZ)).toBe('Thu, Oct 15 2:00 PM – Fri, Oct 16 9:00 AM CDT');
    expect(W.calendarWhenLabel(W.toCalendarView(allDayRow()), TZ)).toBe('Due Tue, Oct 20 · All day');
    expect(W.calendarWhenLabel(W.toCalendarView(allDayRow({ end_date: '2026-10-22' })), TZ)).toBe('Due Tue, Oct 20 – Thu, Oct 22 · All day');
    expect(W.calendarWhenLabel(W.toCalendarView(allDayRow({ is_deadline: false, category: 'other' })), TZ)).toBe('Tue, Oct 20 · All day');
  });
  it('an all-day item is a date: no viewer zone can move it', () => {
    const e = W.toCalendarView(allDayRow());
    for (const z of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC', TZ]) {
      expect(W.calendarWhenLabel(e, z), z).toBe('Due Tue, Oct 20 · All day');
      expect(W.calendarDayKey(e, z), z).toBe('2026-10-20');
    }
  });
  it('shows where a moved or cancelled item came from and the source zone when it differs', () => {
    const moved = view({ status: 'rescheduled', original_start_at: '2026-10-14T19:00:00+00:00', start_at: '2026-10-16T19:00:00+00:00', sort_at: '2026-10-16T19:00:00+00:00', reschedule_count: 1 });
    expect(W.calendarWasLabel(moved, TZ)).toBe('Wed, Oct 14 · 2:00 PM CDT');
    expect(W.calendarWasLabel(view(), TZ)).toBeNull();
    expect(W.calendarSourceZoneNote(view({ time_zone: 'Europe/Berlin' }), TZ)).toBe('Europe/Berlin: 9:00 PM GMT+2');
    expect(W.calendarSourceZoneNote(view(), TZ)).toBeNull();
    expect(W.calendarSourceZoneNote(W.toCalendarView(allDayRow()), TZ)).toBeNull();
  });
  it('groups ordered items under their local day', () => {
    const items = [view({ sort_at: '2026-10-15T14:00:00+00:00' }), view({ finding_id: 'f2', sort_at: '2026-10-15T23:30:00+00:00' }), view({ finding_id: 'f3', sort_at: '2026-10-16T03:30:00+00:00' }), view({ finding_id: 'f4', sort_at: '2026-10-16T14:00:00+00:00' })];
    expect(W.groupByDay(items, TZ).map((g) => [g.key, g.items.length])).toEqual([['2026-10-15', 3], ['2026-10-16', 1]]); // 03:30Z is still Oct 15 evening in Chicago
    expect(W.groupByDay(items, 'UTC').map((g) => [g.key, g.items.length])).toEqual([['2026-10-15', 2], ['2026-10-16', 2]]);
    expect(W.calendarDayHeading('2026-10-15')).toBe('Thu, Oct 15');
  });
});

describe('safe association (read time, never persisted)', () => {
  const lead = (id: string, company: string, title: string, url: string | null = null): W.LeadCandidate => ({ id, company, title, canonicalUrl: url });
  const app = (id: string, company: string, role: string, jobUrl: string | null = null): W.ApplicationCandidate => ({ id, company, role, jobUrl });
  it('links by the exact canonical job URL first, then by company + title', () => {
    const e = { jobUrl: 'https://Jobs.Example.com/post/42/?utm_source=x#top', company: 'Example Corp', jobTitle: 'Staff Engineer' };
    expect(W.canonicalJobUrl(e.jobUrl)).toBe('https://jobs.example.com/post/42');
    expect(W.associateLead(e, [lead('a', 'Other', 'Other', 'https://jobs.example.com/post/42'), lead('b', 'Example Corp', 'Staff Engineer')])?.id).toBe('a');
    expect(W.associateLead({ ...e, jobUrl: null }, [lead('b', ' example corp ', 'STAFF engineer')])?.id).toBe('b');
    expect(W.associateApplication(e, [app('x', 'Example Corp', 'Staff Engineer', 'https://jobs.example.com/post/42?trk=1')])?.id).toBe('x');
  });
  it('ambiguous or weak matches stay unlinked', () => {
    const e = { jobUrl: null, company: 'Example Corp', jobTitle: 'Staff Engineer' };
    expect(W.associateLead(e, [lead('a', 'Example Corp', 'Staff Engineer'), lead('b', 'Example Corp', 'Staff Engineer')])).toBeNull(); // two candidates
    expect(W.associateApplication(e, [app('a', 'Example Corp', 'Staff Engineer'), app('b', 'Example Corp', 'Staff Engineer')])).toBeNull();
    expect(W.associateLead({ ...e, jobTitle: null }, [lead('a', 'Example Corp', 'Staff Engineer')])).toBeNull(); // company alone is never enough
    expect(W.associateLead({ ...e, company: null }, [lead('a', 'Example Corp', 'Staff Engineer')])).toBeNull();
    expect(W.associateLead(e, [lead('a', 'Example Corp', 'Senior Engineer')])).toBeNull();
    expect(W.associateLead({ ...e, jobUrl: 'https://jobs.example.com/x' }, [lead('a', 'Example Corp', 'Staff Engineer', 'https://jobs.example.com/y')])?.id).toBe('a'); // URL differs, unique company+title still links
    expect(W.associateLead({ ...e, jobUrl: 'ftp://nope' }, [])).toBeNull();
  });
  it('an email correlates only for the same company and a deadline within an hour; nothing is merged', () => {
    const e = { company: 'Example Corp', sortAt: '2026-10-15T19:00:00+00:00' };
    const mail = (id: string, due: string | null, company: string | null = 'Example Corp'): W.EmailCandidate => ({ id, title: `Mail ${id}`, company, dueAt: due });
    expect(W.correlateEmails(e, [mail('a', '2026-10-15T19:30:00Z'), mail('b', '2026-10-15T21:00:00Z'), mail('c', null), mail('d', '2026-10-15T19:00:00Z', 'Other Corp')]).map((m) => m.id)).toEqual(['a']);
    expect(W.correlateEmails({ ...e, company: null }, [mail('a', '2026-10-15T19:00:00Z')])).toEqual([]);
  });
  it('association inputs are never provider database ids (the view has no application id field)', () => {
    expect(Object.keys(view())).not.toEqual(expect.arrayContaining(['applicationId', 'application_id']));
  });
});

// ---- panels -----------------------------------------------------------------------------------------------------------
const panel = (over: Partial<CalendarPanelProps> = {}): CalendarPanelProps => ({
  state: { status: 'ready', rows: [view(), W.toCalendarView(deadlineRow())], hasNext: false }, draft: W.DEFAULT_CALENDAR_FILTERS, page: 0, timeZone: TZ, currentUserId: 'u1',
  configured: true, filtered: false, activeView: 'upcoming', onDraft: noop, onView: noop, onApply: noop, onReset: noop, onPage: noop, onDismiss: async () => undefined, ...over,
});
const render = (over: Partial<CalendarPanelProps> = {}) => html(createElement(AiHubCalendarPanel, panel(over)));

describe('Calendar page', () => {
  it('renders every state: loading, error, not configured, zero (per view), populated', () => {
    expect(render({ state: { status: 'loading' } })).toContain('Loading calendar intelligence');
    const err = render({ state: { status: 'error' }, onRetry: noop });
    expect(err).toContain('Calendar intelligence could not be loaded.');
    expect(err).toContain('Try again');
    expect(err).toContain('unaffected');
    const nc = render({ state: { status: 'ready', rows: [], hasNext: false }, configured: false, onOpenSettings: noop });
    expect(nc).toContain('Calendar Intelligence is not configured'); // never "zero events"
    expect(nc).toContain('Open AI settings');
    expect(nc).not.toContain('Nothing upcoming');
    const zero = render({ state: { status: 'ready', rows: [], hasNext: false }, configured: true });
    expect(zero).toContain('Nothing upcoming.');
    expect(zero).not.toContain('not configured');
    expect(render({ state: { status: 'ready', rows: [], hasNext: false }, configured: true, activeView: 'today' })).toContain('Nothing scheduled today.');
    expect(render({ state: { status: 'ready', rows: [], hasNext: false }, configured: true, activeView: 'past' })).toContain('No past calendar items.');
    const filtered = render({ state: { status: 'ready', rows: [], hasNext: false }, configured: false, filtered: true });
    expect(filtered).toContain('No results match these filters.');
    expect(filtered).not.toContain('not configured');
    const pop = render();
    expect(pop).toContain('Technical interview — Example Corp');
    expect(pop).toContain('Coding assessment due');
  });

  it('distinguishes a scheduled event from a deadline, in the owner zone, under day headings', () => {
    const h = render();
    for (const t of ['Scheduled event', 'Deadline', 'Interview', 'Assessment deadline', 'Thu, Oct 15 · 2:00 PM–3:00 PM CDT', 'Due Fri, Oct 16 · 5:00 PM CDT', '<h3', 'Thu, Oct 15', 'Fri, Oct 16']) expect(h).toContain(t);
  });

  it('shows the full detail: company/role, location, meeting link, organizer, source, confidence, summary, evidence, discovery time', () => {
    const h = render();
    for (const t of ['Example Corp · Staff Engineer', 'Video call', 'meet.example.com', 'Pat Recruiter (example.com)', 'google calendar', 'reported by Claude', '90%', 'Second-round interview.', 'Invitation: technical interview.', 'Discovered', 'opens in a new tab']) expect(h).toContain(t);
    expect(h).toContain('rel="noopener noreferrer"');
    expect(h).not.toMatch(/evt-|source_event_id|attendee/i);
  });

  it('shows reschedules (from where) and cancellations (struck through, original time kept)', () => {
    const moved = view({ status: 'rescheduled', original_start_at: '2026-10-14T19:00:00+00:00', reschedule_count: 1 });
    const hm = html(createElement(CalendarCard, { item: moved, timeZone: TZ, currentUserId: 'u1' }));
    expect(hm).toContain('Rescheduled');
    expect(hm).toContain('Moved from');
    expect(hm).toContain('Wed, Oct 14 · 2:00 PM CDT');
    const cancelled = view({ status: 'cancelled', original_start_at: '2026-10-14T19:00:00+00:00', cancelled_at: '2026-10-13T15:00:00+00:00' });
    const hc = html(createElement(CalendarCard, { item: cancelled, timeZone: TZ, currentUserId: 'u1' }));
    expect(hc).toContain('Cancelled');
    expect(hc).toContain('line-through');
    expect(hc).toContain('Was scheduled for');
    expect(hc).toContain('Oct 13, 2026');
    expect(html(createElement(CalendarCard, { item: view({ status: 'tentative' }), timeZone: TZ, currentUserId: 'u1' }))).toContain('Tentative');
    expect(html(createElement(CalendarCard, { item: view(), timeZone: TZ, currentUserId: 'u1' }))).not.toMatch(/Rescheduled|Cancelled|Tentative/);
  });

  it('handles all-day items as dates and notes a different source zone', () => {
    const h = render({ state: { status: 'ready', rows: [W.toCalendarView(allDayRow()), view({ time_zone: 'Europe/Berlin' })], hasNext: false } });
    expect(h).toContain('Due Tue, Oct 20 · All day');
    expect(h).toContain('Source time zone');
    expect(h).toContain('Europe/Berlin: 9:00 PM GMT+2');
  });

  it('suppresses unsafe links and renders long hostile text as escaped, wrapping content', () => {
    const evil = `Long ${'x'.repeat(200)} <img src=x onerror=alert(1)> <b>not bold</b>`;
    const h = html(createElement(CalendarCard, {
      item: view({ meeting_url: 'javascript:alert(1)', source_event_url: 'https://user:pw@calendar.example.com/x', location: evil, company: evil }, { title: evil, summary: evil, evidence: evil }), timeZone: TZ, currentUserId: 'u1',
    }));
    expect(h).not.toContain('javascript:');
    expect(h).not.toContain('user:pw');
    expect(h).not.toContain('<img');
    expect(h).not.toContain('<b>not bold</b>');
    expect(h).toContain('&lt;img');
    expect(h).toContain('overflow-wrap:anywhere');
  });

  it('offers no calendar mutation: no reschedule, cancel, accept, decline, edit or add-to-calendar; dismiss only for the owner of an open item', () => {
    const h = render();
    expect(h).not.toMatch(/>Reschedule<|>Cancel event<|>Accept<|>Decline<|>Edit<|Add to calendar|RSVP|Create task|Create application/i);
    expect(h).toContain('cannot create, change, accept or cancel calendar events');
    expect(h).toContain('Dismiss');
    expect(render({ currentUserId: 'someone-else' })).not.toContain('>Dismiss<');
    expect(render({ state: { status: 'ready', rows: [view({}, { status: 'DISMISSED' })], hasNext: false } })).not.toContain('>Dismiss<');
  });

  it('has a view switcher with the pressed state, labelled filters, a search landmark and an announced summary', () => {
    const h = render({ activeView: 'week' });
    for (const t of ['aria-label="Calendar view"', 'Upcoming', 'Today', 'This week', 'Past', 'Date range', 'role="search"', 'aria-label="Calendar filters"', 'Category', 'Event status', 'Company', 'Provider', 'Status', 'Apply filters', 'Reset filters']) expect(h).toContain(t);
    expect(h).toMatch(/aria-pressed="true"[^>]*>This week</);
    expect(h).toMatch(/aria-pressed="false"[^>]*>Upcoming</);
    expect(h).not.toContain('Event from'); // date fields only for the custom range
    const custom = render({ draft: { ...W.DEFAULT_CALENDAR_FILTERS, view: 'custom' }, activeView: 'custom' });
    expect(custom).toContain('Event from');
    expect(custom).toContain('Event to');
    expect(custom).toContain('type="date"');
    expect(render({ message: 'Event dates: Enter valid dates.', draft: { ...W.DEFAULT_CALENDAR_FILTERS, view: 'custom' }, activeView: 'custom' })).toMatch(/role="alert"/);
    expect(render({ page: 1, state: { status: 'ready', rows: [view()], hasNext: true } })).toContain('Showing 1 calendar item on page 2; more on the next page.');
    expect(render({ page: 1, state: { status: 'ready', rows: [view()], hasNext: true } })).toContain('aria-label="Calendar intelligence pagination"');
    expect(render()).not.toContain('pagination');
  });

  it('lists every category and status in the filters', () => {
    const h = render();
    for (const c of C.CALENDAR_CATEGORIES) expect(h).toContain(W.CALENDAR_CATEGORY_LABELS[c]);
    for (const s of C.CALENDAR_STATUSES) expect(h).toContain(W.CALENDAR_STATUS_LABELS[s]);
  });
});

describe('navigation, overview and wiring', () => {
  it('Calendar is the sixth tab and every tab path round-trips', () => {
    expect(AI_HUB_TABS.map((t) => t.label)).toEqual(['Overview', 'Daily Digest', 'Job Leads', 'Email', 'Recruiter Intel', 'Calendar', 'History']);
    expect(aiHubTabFromPath('/ai-hub/calendar')).toBe('calendar');
    expect(aiHubPathForTab('calendar')).toBe('/ai-hub/calendar');
    const shell = html(createElement(AiHubShell, { tab: 'calendar', onTabChange: noop, state: { status: 'loading' }, calendar: createElement('p', null, 'CAL-SLOT') }));
    expect(shell).toContain('CAL-SLOT');
    expect(shell).toContain('Calendar');
  });
  it('the App routes the calendar behind the existing AI Hub exposure check', () => {
    const app = readFileSync('apps/web/src/App.tsx', 'utf8');
    expect(app).toContain("case '/ai-hub/calendar'");
    expect(app).toMatch(/AI_HUB_PATHS\.includes\(routePath\)/);
  });
  it('the Overview shows one small Calendar card with upcoming, interviews and deadlines; absent counts never break the rest', () => {
    const snap: AiHubSnapshot = { runs: [], findings: [], pendingSuggestions: 1, calendar: { upcoming: 5, interviews: 2, deadlines: 1 } };
    const h = html(createElement(AiHubOverview, { snapshot: snap, onOpenTab: noop }));
    for (const t of ['Calendar', 'upcoming', '2 interviews', '1 deadline', 'Open Calendar']) expect(h).toContain(t);
    expect(h).not.toContain('1 deadlines');
    const without = html(createElement(AiHubOverview, { snapshot: { ...snap, calendar: undefined }, onOpenTab: noop }));
    expect(without).not.toContain('Open Calendar');
    expect(without).toContain('Pending suggestions');
  });
  it('the finding detail allowlist shows normalized calendar fields only', () => {
    const items = allowlistedPayloadItems('calendar_event', { start_at: '2026-10-15T19:00:00Z', time_zone: 'America/Chicago', meeting_url: 'javascript:alert(1)', description: 'RAW', attendees: ['a'], company: 'Example Corp' });
    expect(items.map((i) => i.label)).toEqual(['Starts', 'Source time zone', 'Company']);
  });
  it('the browser calendar reader is read-only and never talks to a calendar provider', () => {
    for (const f of ['apps/web/src/api/aiCalendar.ts', 'apps/web/src/lib/aiCalendar.ts', 'apps/web/src/views/AiHubCalendar.tsx', 'apps/api/src/services/aiCalendarService.ts']) {
      const src = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
      // (the pure lib has no client; its URL helpers legitimately call searchParams.delete)
      if (!f.endsWith('lib/aiCalendar.ts')) expect(src, f).not.toMatch(/\.(insert|update|delete|upsert|rpc)\(/);
      expect(src, f).not.toMatch(/service_role|dangerouslySetInnerHTML/);
      expect(src, f).not.toMatch(/googleapis|graph\.microsoft|accounts\.google|oauth2|calendar\/v3/i);
    }
  });
});
