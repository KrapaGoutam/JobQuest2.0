import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as C from '../../apps/api/src/lib/aiContract';
import { buildDedupeKey, calendarLogicalKey, isIanaTimeZone, localMidnight, localToInstant, validateAiResult } from '../../apps/api/src/lib/aiContract';
import { allDayFinding, calendar, calendarEnvelope, calendarFinding, deadlineFinding } from './fixtures/ai-contract/calendar';

// AI-7 calendar intelligence contract: closed categories, exact time semantics (timezone, DST, all-day,
// deadlines), URL safety, privacy (no attendees / invite text), identity and dedupe. Pure validator tests.
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const one = (finding: Record<string, unknown>) => validateAiResult(calendarEnvelope({ findings: [finding] }));
const ok = (finding: Record<string, unknown>) => {
  const r = one(finding);
  expect(r.errors, JSON.stringify(r.errors)).toEqual([]);
  expect(r.data!.findings).toHaveLength(1);
  return r.data!.findings[0]!;
};
const codes = (finding: Record<string, unknown>) => one(finding).errors.map((e) => e.code);
const warn = (finding: Record<string, unknown>) => one(finding).warnings.map((e) => e.code);
const withPayload = (payload: Record<string, unknown>, over: Record<string, unknown> = {}) => calendarFinding(over, payload);

describe('constants and database sync', () => {
  it('uses the existing canonical workflow and finding kind (no new enum value)', () => {
    expect(C.AI_WORKFLOWS).toContain('calendar_review');
    expect(C.AI_WORKFLOWS as readonly string[]).not.toContain('calendar_intel');
    expect(C.AI_FINDING_KINDS).toContain('calendar_event');
    expect(validateAiResult(calendar.interview).success).toBe(true);
    expect(validateAiResult({ ...clone(calendar.interview), workflow: 'calendar_intel' }).success).toBe(false);
  });

  it('the SQL CHECK lists for ai_calendar_events match the TypeScript constants', () => {
    const sql = readFileSync('supabase/migrations/20261028100000_ai_hub_calendar_intelligence.sql', 'utf8').replace(/\r\n/g, '\n');
    const list = (name: string) => [...new RegExp(`${name} check \\(([\\s\\S]*?)\\)\\),?\\n|${name} check \\((\\w+ in \\([^)]*\\))\\)`).exec(sql)![0]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    expect(list('chk_ai_calendar_events_category')).toEqual([...C.CALENDAR_CATEGORIES]);
    expect(list('chk_ai_calendar_events_status')).toEqual([...C.CALENDAR_STATUSES]);
    expect(C.CALENDAR_DEADLINE_CATEGORIES.every((c) => (C.CALENDAR_CATEGORIES as readonly string[]).includes(c))).toBe(true);
  });

  it('the categories cover every requested job-search event; lifecycle changes are statuses', () => {
    for (const c of ['interview', 'recruiter_call', 'hiring_manager_call', 'assessment_deadline', 'application_deadline', 'take_home_deadline', 'follow_up', 'networking_call', 'other']) {
      expect(C.CALENDAR_CATEGORIES as readonly string[]).toContain(c);
    }
    for (const s of ['rescheduled', 'cancelled']) expect(C.CALENDAR_STATUSES as readonly string[]).toContain(s);
  });
});

describe('closed categories and statuses', () => {
  it('accepts every category and rejects free-form ones', () => {
    for (const category of C.CALENDAR_CATEGORIES) {
      const f = category.endsWith('deadline') || category === 'follow_up' ? deadlineFinding({ category }) : calendarFinding({ category });
      expect(ok(f).category).toBe(category);
    }
    expect(codes(calendarFinding({ category: 'party' }))).toContain('calendar_category');
    expect(codes(calendarFinding({ category: undefined }))).toContain('calendar_category');
    expect(codes(calendarFinding({ category: 'x'.repeat(200) }))).toContain('calendar_category');
  });

  it('normalises casing and spacing of a known category', () => {
    expect(ok(calendarFinding({ category: ' Recruiter Call ' })).category).toBe('recruiter_call');
  });

  it('a lifecycle word as the category becomes category other + that status (never a separate event)', () => {
    for (const [word, status] of [['reschedule', 'rescheduled'], ['cancellation', 'cancelled'], ['cancelled', 'cancelled']] as const) {
      const r = one(calendarFinding({ category: word }));
      expect(r.errors).toEqual([]);
      expect(r.data!.findings[0]).toMatchObject({ category: 'other', calendar: { status } });
      expect(r.warnings.map((w) => w.code)).toContain('category_alias');
    }
  });

  it('status is a closed set with friendly aliases; default scheduled', () => {
    expect(ok(calendarFinding()).calendar!.status).toBe('scheduled');
    expect(ok(withPayload({ status: 'confirmed' })).calendar!.status).toBe('scheduled');
    expect(ok(withPayload({ status: 'canceled' })).calendar!.status).toBe('cancelled');
    expect(ok(withPayload({ status: 'tentative' })).calendar!.status).toBe('tentative');
    expect(codes(withPayload({ status: 'maybe' }))).toContain('enum');
  });

  it('a deadline is derived from the category and cannot be claimed by the provider', () => {
    expect(ok(calendarFinding()).calendar!.is_deadline).toBe(false);
    expect(ok(deadlineFinding()).calendar!.is_deadline).toBe(true);
    expect(ok(withPayload({ is_deadline: true } as never)).calendar!.is_deadline).toBe(false);
  });
});

describe('time semantics', () => {
  it('normalises an offset timestamp to a UTC instant and keeps the source zone', () => {
    const f = ok(calendarFinding());
    expect(f.calendar).toMatchObject({ start_at: '2026-10-15T19:00:00.000Z', end_at: '2026-10-15T20:00:00.000Z', sort_at: '2026-10-15T19:00:00.000Z', time_zone: 'America/Chicago', all_day: false });
    expect(f.occurred_at).toBe('2026-10-15T19:00:00.000Z');
    expect(f.due_at).toBeNull();
    expect(f.payload).toMatchObject({ start_at: '2026-10-15T19:00:00.000Z', time_zone: 'America/Chicago' });
  });

  it('accepts a start-only event (no end)', () => {
    const f = ok(withPayload({ end_at: undefined }));
    expect(f.calendar).toMatchObject({ end_at: null, start_at: '2026-10-15T19:00:00.000Z' });
  });

  it('rejects an end before the start, malformed timestamps, ambiguous (offset-less) timestamps and out-of-range years', () => {
    expect(codes(withPayload({ end_at: '2026-10-15T13:00:00-05:00' }))).toContain('end_before_start');
    expect(codes(withPayload({ start_at: 'tomorrow at 2pm' }))).toContain('timestamp');
    expect(codes(withPayload({ start_at: '2026-10-15T14:00:00' }))).toContain('timestamp'); // no offset: never guessed in a server zone
    expect(codes(withPayload({ start_at: '1999-01-01T00:00:00Z', end_at: undefined }))).toContain('timestamp');
    expect(codes(withPayload({ start_at: '2026-02-30T10:00:00Z', end_at: undefined }))).toContain('timestamp');
    expect(codes(withPayload({ start_at: undefined, end_at: undefined }))).toContain('calendar_time_required');
  });

  it('rejects an invalid or unknown time zone and requires one for a local time', () => {
    for (const time_zone of ['Mars/Olympus', 'Central Time', 'America/Chicagoo', 123]) expect(codes(withPayload({ time_zone })), String(time_zone)).toEqual(expect.arrayContaining([expect.stringMatching(/time_zone|type/)]));
    expect(codes(withPayload({ start_at: undefined, end_at: undefined, start_local: '2026-10-15T14:00', time_zone: undefined }))).toContain('time_zone_required');
    expect(isIanaTimeZone('America/Chicago')).toBe(true);
    expect(isIanaTimeZone('UTC')).toBe(true);
    expect(isIanaTimeZone('')).toBe(false);
    expect(isIanaTimeZone('Nope/Zone')).toBe(false);
  });

  it('converts a local time in the source zone; the same wall time is a different instant in different zones', () => {
    const chi = ok(withPayload({ start_at: undefined, end_at: undefined, start_local: '2026-10-15T14:00', time_zone: 'America/Chicago' }));
    const ber = ok(withPayload({ start_at: undefined, end_at: undefined, start_local: '2026-10-15T14:00', time_zone: 'Europe/Berlin' }));
    const kol = ok(withPayload({ start_at: undefined, end_at: undefined, start_local: '2026-10-15T14:00', time_zone: 'Asia/Kolkata' }));
    expect(chi.calendar!.start_at).toBe('2026-10-15T19:00:00.000Z');
    expect(ber.calendar!.start_at).toBe('2026-10-15T12:00:00.000Z');
    expect(kol.calendar!.start_at).toBe('2026-10-15T08:30:00.000Z');
  });

  it('is independent of the process time zone (no server-local-time assumption)', () => {
    const original = process.env.TZ;
    try {
      for (const tz of ['UTC', 'Pacific/Auckland', 'America/Los_Angeles']) {
        process.env.TZ = tz;
        const r = localToInstant('2026-03-08T10:00', 'America/Chicago');
        expect(r).toEqual({ ok: true, iso: '2026-03-08T15:00:00.000Z', ambiguous: false });
        expect(ok(withPayload({ start_local: '2026-07-01T09:30', start_at: undefined, end_at: undefined, time_zone: 'America/New_York' })).calendar!.start_at).toBe('2026-07-01T13:30:00.000Z');
      }
    } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
  });

  describe('daylight saving', () => {
    it('spring forward: a time in the gap does not exist and is rejected; times either side convert with the right offset', () => {
      expect(localToInstant('2026-03-08T02:30', 'America/Chicago')).toEqual({ ok: false, reason: 'nonexistent' });
      expect(codes(withPayload({ start_at: undefined, end_at: undefined, start_local: '2026-03-08T02:30', time_zone: 'America/Chicago' }))).toContain('nonexistent_local_time');
      expect(localToInstant('2026-03-08T01:59', 'America/Chicago')).toMatchObject({ ok: true, iso: '2026-03-08T07:59:00.000Z' }); // CST (UTC-6)
      expect(localToInstant('2026-03-08T03:00', 'America/Chicago')).toMatchObject({ ok: true, iso: '2026-03-08T08:00:00.000Z' }); // CDT (UTC-5)
      expect(localToInstant('2026-03-29T02:30', 'Europe/Berlin')).toEqual({ ok: false, reason: 'nonexistent' });
    });

    it('fall back: an ambiguous wall time resolves to its FIRST occurrence and says so', () => {
      expect(localToInstant('2026-11-01T01:30', 'America/Chicago')).toEqual({ ok: true, iso: '2026-11-01T06:30:00.000Z', ambiguous: true }); // CDT, before the clocks fall back
      expect(localToInstant('2026-11-01T02:30', 'America/Chicago')).toEqual({ ok: true, iso: '2026-11-01T08:30:00.000Z', ambiguous: false });
      expect(warn(withPayload({ start_at: undefined, end_at: undefined, start_local: '2026-11-01T01:30', time_zone: 'America/Chicago' }))).toContain('ambiguous_local_time');
      expect(localToInstant('2026-10-25T02:30', 'Europe/Berlin')).toMatchObject({ ok: true, ambiguous: true });
    });

    it('a wall time keeps its local meaning across the transition (the same 10:00 is a different UTC offset before and after)', () => {
      const before = localToInstant('2026-03-07T10:00', 'America/Chicago') as { iso: string };
      const after = localToInstant('2026-03-09T10:00', 'America/Chicago') as { iso: string };
      expect(before.iso).toBe('2026-03-07T16:00:00.000Z'); // UTC-6
      expect(after.iso).toBe('2026-03-09T15:00:00.000Z'); // UTC-5
    });

    it('a zone with a half-hour offset and one without DST convert correctly', () => {
      expect(localToInstant('2026-10-15T14:00', 'Asia/Kolkata')).toMatchObject({ iso: '2026-10-15T08:30:00.000Z' });
      expect(localToInstant('2026-01-15T14:00', 'Asia/Kolkata')).toMatchObject({ iso: '2026-01-15T08:30:00.000Z' });
      expect(localToInstant('2026-07-15T14:00', 'Australia/Sydney')).toMatchObject({ iso: '2026-07-15T04:00:00.000Z' }); // southern winter, UTC+10
    });

    it('an explicit offset that disagrees with the zone is trusted (absolute) and warned about', () => {
      // 10:00 on 2026-03-08 in Chicago is CDT (-05:00); -06:00 claims standard time
      const r = one(withPayload({ start_at: '2026-03-08T10:00:00-06:00', end_at: undefined, time_zone: 'America/Chicago' }));
      expect(r.errors).toEqual([]);
      expect(r.data!.findings[0]!.calendar!.start_at).toBe('2026-03-08T16:00:00.000Z');
      expect(r.warnings.map((w) => w.code)).toContain('offset_zone_mismatch');
      expect(warn(withPayload({ start_at: '2026-03-08T10:00:00-05:00', end_at: undefined, time_zone: 'America/Chicago' }))).not.toContain('offset_zone_mismatch');
    });

    it('local and offset forms that disagree: the offset wins and it is reported', () => {
      expect(warn(withPayload({ start_local: '2026-10-15T09:00', end_at: undefined }))).toContain('local_time_ignored');
    });

    it('local midnight is DST-aware (a 25-hour day and a 23-hour day)', () => {
      const d = (a: string, b: string, z: string) => (Date.parse(localMidnight(b, z)) - Date.parse(localMidnight(a, z))) / 3_600_000;
      expect(d('2026-11-01', '2026-11-02', 'America/Chicago')).toBe(25);
      expect(d('2026-03-08', '2026-03-09', 'America/Chicago')).toBe(23);
      expect(d('2026-06-01', '2026-06-02', 'America/Chicago')).toBe(24);
      expect(localMidnight('2026-10-20', null)).toBe('2026-10-20T00:00:00.000Z');
    });
  });

  describe('all-day items and deadlines', () => {
    it('an all-day item is a date range (end inclusive), anchored at local midnight, and carries no instants', () => {
      const f = ok(allDayFinding({}, { time_zone: 'America/Chicago', end_date: '2026-10-22' }));
      expect(f.calendar).toMatchObject({ all_day: true, start_date: '2026-10-20', end_date: '2026-10-22', start_at: null, end_at: null, deadline_at: null, sort_at: '2026-10-20T05:00:00.000Z' });
    });
    it('end_date defaults to start_date; a date with no time is treated as all-day', () => {
      expect(ok(allDayFinding()).calendar).toMatchObject({ start_date: '2026-10-20', end_date: '2026-10-20' });
      const f = ok(withPayload({ start_at: undefined, end_at: undefined, start_date: '2026-10-20' }));
      expect(f.calendar).toMatchObject({ all_day: true, start_date: '2026-10-20' });
    });
    it('rejects an all-day end before its start and ignores stray times', () => {
      expect(codes(allDayFinding({}, { end_date: '2026-10-19' }))).toContain('end_before_start');
      expect(codes(withPayload({ all_day: true, start_at: undefined, end_at: undefined }))).toContain('all_day_date_required');
      expect(warn(allDayFinding({}, { start_at: '2026-10-20T10:00:00Z' }))).toContain('all_day_time_ignored');
    });
    it('a deadline is the sort anchor and the parent due time; start_at doubles as the due time when no deadline is given', () => {
      const f = ok(deadlineFinding());
      expect(f.calendar).toMatchObject({ is_deadline: true, deadline_at: '2026-10-16T22:00:00.000Z', sort_at: '2026-10-16T22:00:00.000Z', start_at: null });
      expect(f.due_at).toBe('2026-10-16T22:00:00.000Z');
      const viaStart = ok(deadlineFinding({}, { deadline_at: undefined, start_at: '2026-10-17T12:00:00Z' }));
      expect(viaStart.calendar).toMatchObject({ deadline_at: '2026-10-17T12:00:00.000Z', sort_at: '2026-10-17T12:00:00.000Z' });
      expect(codes(deadlineFinding({}, { deadline_at: undefined, start_at: undefined }))).toContain('calendar_time_required');
    });
    it('a date-only deadline is an all-day deadline; a deadline given to a meeting is ignored with a warning', () => {
      const f = ok(deadlineFinding({}, { deadline_at: undefined, deadline_date: '2026-10-30' }));
      expect(f.calendar).toMatchObject({ all_day: true, is_deadline: true, start_date: '2026-10-30', deadline_at: null });
      expect(warn(withPayload({ deadline_at: '2026-10-30T12:00:00Z' }))).toContain('deadline_ignored');
      expect(ok(withPayload({ deadline_at: '2026-10-30T12:00:00Z' })).calendar!.deadline_at).toBeNull();
    });
  });

  it('reschedule and cancellation inputs: previous event identity/time and cancelled_at are normalised', () => {
    const f = ok(withPayload({ status: 'rescheduled', previous_event: { source_event_id: 'old-1', start_at: '2026-10-14T14:00:00-05:00' }, cancelled_at: '2026-10-13T09:00:00Z' }));
    expect(f.calendar).toMatchObject({ status: 'rescheduled', previous_source_event_id: 'old-1', original_start_at: '2026-10-14T19:00:00.000Z', cancelled_at: '2026-10-13T09:00:00.000Z' });
    expect(f.calendar!.previous_logical_key).not.toBeNull();
    expect(f.calendar!.previous_logical_key).not.toBe(f.calendar!.logical_key);
    expect(codes(withPayload({ previous_event: 'old' }))).toContain('type');
    expect(codes(withPayload({ previous_event: { start_at: 'soon' } }))).toContain('timestamp');
  });
});

describe('links, privacy and bounds', () => {
  it('allows safe https meeting and event links; strips secret-looking query parameters and fragments', () => {
    const f = ok(withPayload({ meeting_url: 'https://zoom.example.com/j/123?pwd=abc&lang=en&token=zzz#frag', source_event_url: 'https://calendar.example.com/e?eid=abc&sig=zzz' }));
    expect(f.calendar!.meeting_url).toBe('https://zoom.example.com/j/123?lang=en');
    expect(f.calendar!.source_event_url).toBe('https://calendar.example.com/e?eid=abc');
    expect(JSON.stringify(f)).not.toMatch(/pwd|token|sig=|zzz|#frag/);
    expect(one(calendarFinding({}, { meeting_url: 'https://zoom.example.com/j/1?pwd=x' })).warnings.map((w) => w.code)).toContain('url_secret_param_removed');
  });

  it('rejects http, other schemes, credentials and malformed links; the finding is dropped, nothing else is affected', () => {
    for (const meeting_url of ['http://meet.example.com/x', 'javascript:alert(1)', 'data:text/html,<b>x</b>', 'ftp://example.com/x', 'https://user:pw@meet.example.com/x', 'not a url', 'file:///etc/passwd']) {
      const r = one(withPayload({ meeting_url }));
      expect(r.data!.findings, meeting_url).toHaveLength(0);
      expect(r.rejectedItemCount).toBe(1);
    }
  });

  it('never stores attendee lists, descriptions, invite bodies or raw events (they are dropped and reported)', () => {
    const f = withPayload({ attendees: [{ email: 'a@example.com' }], attendee_list: ['b@example.com'], description: 'RAW-INVITE', body: 'RAW-BODY', raw_event: { id: 1 }, ics: 'BEGIN:VCALENDAR', conference_data: { x: 1 }, attendee_count: 4 });
    const r = one(f);
    expect(r.errors).toEqual([]);
    expect(r.warnings.filter((w) => w.code === 'raw_calendar_rejected').length).toBeGreaterThanOrEqual(6);
    const stored = JSON.stringify(r.data!.findings[0]);
    expect(stored).not.toMatch(/a@example\.com|b@example\.com|RAW-INVITE|RAW-BODY|VCALENDAR|raw_event|attendee_list/);
    expect(r.data!.findings[0]!.payload.attendee_count).toBe(4); // a count only
    expect(codes(withPayload({ attendee_count: 5000 }))).toContain('attendee_count');
    expect(codes(withPayload({ attendee_count: -1 }))).toContain('attendee_count');
  });

  it('organizer is a display name and a domain only: an address is stripped; a bad domain is rejected', () => {
    const f = ok(withPayload({ organizer_name: 'Pat <pat@example.com> pat@example.com', organizer_domain: 'Pat@Example.COM' }));
    expect(f.calendar).toMatchObject({ organizer_name: 'Pat', organizer_domain: 'example.com' });
    expect(codes(withPayload({ organizer_domain: 'not a domain' }))).toContain('domain');
  });

  it('forbidden internal identity fields from a provider are dropped, not honoured', () => {
    const f = calendarFinding({ application_id: '11111111-1111-4111-8111-111111111111', user_id: 'u', workspace_id: 'w', match: { application_id: '11111111-1111-4111-8111-111111111111', hints: { company: 'Example Corp' } } }, { user_id: 'u', workspace_id: 'w', application_id: '11111111-1111-4111-8111-111111111111', finding_id: 'x' });
    const r = one(f);
    expect(r.errors).toEqual([]);
    expect(JSON.stringify(r.data!.findings[0])).not.toMatch(/11111111-1111|"user_id"|"workspace_id"|finding_id/);
    expect(r.warnings.map((w) => w.code)).toContain('untrusted_scope_field');
  });

  it('bounds text: title, summary, evidence, company, location', () => {
    expect(codes(calendarFinding({ title: 'x'.repeat(301) }))).toContain('too_long');
    expect(codes(calendarFinding({ summary: 'x'.repeat(1001) }))).toContain('too_long');
    const long = ok(calendarFinding({ evidence: 'é'.repeat(900) }));
    expect(long.evidence!.length).toBeLessThanOrEqual(500);
    expect(codes(withPayload({ company: 'x'.repeat(201) }))).toContain('too_long');
    expect(codes(withPayload({ location: 'x'.repeat(301) }))).toContain('too_long');
    expect(codes(calendarFinding({ title: undefined }))).toContain('required');
    expect(codes(calendarFinding({ confidence: 1.5 }))).toContain('confidence');
    expect(ok(calendarFinding({ confidence: 0.9234 })).confidence).toBe(0.923);
  });

  it('control characters are stripped from stored text', () => {
    const f = ok(calendarFinding({ title: 'Interview\u0000 with\u0007 Example' }, { location: 'Room\u0001 1' }));
    expect(f.title).toBe('Interview with Example');
    expect(f.calendar!.location).toBe('Room 1');
  });

  it('a malformed calendar finding is dropped alone (the rest of the result is kept)', () => {
    const r = validateAiResult(calendarEnvelope({ findings: [calendarFinding(), calendarFinding({ category: 'party' }), allDayFinding()] }));
    expect(r.success).toBe(true);
    expect(r.data!.findings).toHaveLength(2);
    expect(r.rejectedItemCount).toBe(1);
  });
});

describe('identity and dedupe', () => {
  it('primary identity is the calendar provider + event id; wording, time and provider are not identity', () => {
    const a = ok(calendarFinding());
    const b = ok(calendarFinding({ title: 'Different wording' }, { start_at: '2026-10-16T14:00:00-05:00', end_at: undefined, status: 'rescheduled' }));
    expect(a.dedupe_key).toBe(b.dedupe_key); // a reschedule of the same event updates one finding
    expect(a.dedupe_key).toMatch(/^cal:[0-9a-f]{64}$/);
    const otherProvider = validateAiResult({ ...clone(calendarEnvelope({ findings: [calendarFinding()] })), provider: 'gemini' });
    expect(otherProvider.data!.findings[0]!.dedupe_key).toBe(a.dedupe_key); // provider is not part of the identity
    const otherCalendar = ok(calendarFinding({ dedupe: { source_type: 'calendar', source_name: 'outlook', source_id: 'evt-cal-001' } }));
    expect(otherCalendar.dedupe_key).not.toBe(a.dedupe_key); // the same id under another calendar is another event
    const otherId = ok(calendarFinding({ dedupe: { source_type: 'calendar', source_name: 'google_calendar', source_id: 'evt-cal-002' } }));
    expect(otherId.dedupe_key).not.toBe(a.dedupe_key);
    expect(ok(calendarFinding({ dedupe: { source_type: 'calendar', source_name: ' Google_Calendar ', source_id: 'evt-cal-001' } })).dedupe_key).toBe(a.dedupe_key);
  });

  it('an event id needs the calendar provider name', () => {
    expect(codes(calendarFinding({ dedupe: { source_type: 'calendar', source_id: 'evt-1' } }))).toContain('dedupe');
  });

  it('without an event id the fallback is company + category + title + start minute: same title on different dates stay distinct', () => {
    const noId = (title: string, start: string, over: Record<string, unknown> = {}) => ok(calendarFinding({ title, dedupe: { source_type: 'calendar' } }, { start_at: start, end_at: undefined, ...over }));
    const a = noId('Interview', '2026-10-15T14:00:00-05:00');
    const b = noId('Interview', '2026-10-16T14:00:00-05:00');
    const c = noId('Interview', '2026-10-15T14:00:30-05:00'); // same minute
    expect(a.dedupe_key).toMatch(/^calfb:[0-9a-f]{64}$/);
    expect(a.dedupe_key).not.toBe(b.dedupe_key);
    expect(a.dedupe_key).toBe(c.dedupe_key);
    expect(noId('Interview', '2026-10-15T14:00:00-05:00', { company: 'Other Corp' }).dedupe_key).not.toBe(a.dedupe_key);
    expect(noId('  interview ', '2026-10-15T14:00:00-05:00').dedupe_key).toBe(a.dedupe_key); // title normalisation
    expect(ok(calendarFinding({ title: 'Interview', category: 'recruiter_call', dedupe: { source_type: 'calendar' } }, { end_at: undefined })).dedupe_key).not.toBe(a.dedupe_key);
  });

  it('dedupe free text can never override the validated company/title that define the logical key', () => {
    const f = ok(calendarFinding({ dedupe: { source_type: 'calendar', company: 'Forged Co', title: 'Forged title' } }, { end_at: undefined }));
    expect(f.dedupe_key).toBe(ok(calendarFinding({ dedupe: { source_type: 'calendar' } }, { end_at: undefined })).dedupe_key);
  });

  it('the logical key and builder reject unusable input', () => {
    expect(calendarLogicalKey({ company: 'A', category: 'interview', title: '', start_at: '2026-10-15T19:00:00Z' })).toBeNull();
    expect(calendarLogicalKey({ company: 'A', category: 'interview', title: 'T', start_at: 'x' })).toBeNull();
    expect(calendarLogicalKey({ company: 'A', category: 'interview', title: 'T', start_at: '2026-10-15T19:00:00Z' })).toBe(calendarLogicalKey({ company: ' a ', category: 'Interview', title: 't', start_at: '2026-10-15T19:00:59Z' }));
    expect(buildDedupeKey('calendar_event', {}).ok).toBe(false);
    expect(buildDedupeKey('calendar_event', { source_name: 'g', source_id: 'e' }).ok).toBe(true);
    const k = buildDedupeKey('calendar_event', { source_name: 'g', source_id: 'e' });
    expect(k.ok && /^[\x21-\x7e]{1,255}$/.test(k.key)).toBe(true);
  });

  it('the projection carries a logical key that equals the fallback identity (cross-provider convergence)', () => {
    const f = ok(calendarFinding());
    const noId = ok(calendarFinding({ dedupe: { source_type: 'calendar' } }));
    expect(f.calendar!.logical_key).toBe(noId.calendar!.logical_key);
    expect(noId.dedupe_key).toBe(`calfb:${noId.calendar!.logical_key}`);
  });

  it('same-run duplicate identities keep the first', () => {
    const r = validateAiResult(calendarEnvelope({ findings: [calendarFinding(), calendarFinding({ title: 'Duplicate' })] }));
    expect(r.data!.findings).toHaveLength(1);
    expect(r.warnings.map((w) => w.code)).toContain('duplicate_in_run');
  });
});
