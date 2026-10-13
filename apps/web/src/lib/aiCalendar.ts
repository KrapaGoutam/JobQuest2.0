// Browser-safe helpers for the AI Hub Calendar page (AI-7). Pure functions only (no fetching), so every
// state is unit-testable. Constants mirror apps/api/src/lib/aiContract/constants.ts and the
// ai_calendar_events CHECKs; tests/unit/ai-7-calendar-ui.test.ts fails on drift.
//
// Calendar INTELLIGENCE, not a calendar: items are stored job-search observations from an AI provider.
// Everything rendered originates from an external provider: it is untrusted text, shown as React text
// children (escaped) with credential-free https links only.
//
// Time semantics: timed items are absolute instants shown in the OWNER'S PROFILE time zone (never the
// browser's, never the server's). All-day items are calendar DATES and are never shifted by a zone.
import { safeHttpUrl } from './aiHub';
import { shiftDay } from './aiDigest';
import { dayKey, formatInZone, isValidTimeZone, zonedWallTimeToUtcIso, zoneAbbreviation } from './time';
import type { DateRange, SourceStatusFilter } from './aiSources';

export const CALENDAR_CATEGORIES = [
  'interview', 'recruiter_call', 'hiring_manager_call', 'networking_call',
  'assessment_deadline', 'application_deadline', 'take_home_deadline', 'follow_up', 'other',
] as const;
export const CALENDAR_DEADLINE_CATEGORIES = ['assessment_deadline', 'application_deadline', 'take_home_deadline', 'follow_up'] as const;
export const CALENDAR_STATUSES = ['scheduled', 'tentative', 'rescheduled', 'cancelled'] as const;
export const CALENDAR_PAGE_SIZE = 20;
export const CALENDAR_WORKFLOW = 'calendar_review';

export const CALENDAR_CATEGORY_LABELS: Record<string, string> = {
  interview: 'Interview', recruiter_call: 'Recruiter call', hiring_manager_call: 'Hiring manager call', networking_call: 'Networking call',
  assessment_deadline: 'Assessment deadline', application_deadline: 'Application deadline', take_home_deadline: 'Take-home deadline', follow_up: 'Follow-up date', other: 'Other event',
};
export const CALENDAR_STATUS_LABELS: Record<string, string> = { scheduled: 'Scheduled', tentative: 'Tentative', rescheduled: 'Rescheduled', cancelled: 'Cancelled' };
const label = (map: Record<string, string>, v: string | null | undefined) => (v ? map[v] ?? 'Other' : '');
export const calendarCategoryLabel = (v: string | null | undefined) => label(CALENDAR_CATEGORY_LABELS, v);
export const calendarStatusLabel = (v: string | null | undefined) => label(CALENDAR_STATUS_LABELS, v);
export const isDeadlineCategory = (c: string) => (CALENDAR_DEADLINE_CATEGORIES as readonly string[]).includes(c);

export const CALENDAR_NOT_CONFIGURED =
  'Calendar review has not run yet. Connect Claude in Settings → AI & Automation and schedule the Calendar Intelligence task; interviews, calls and deadlines it finds appear here. JobQuest never connects to your calendar and cannot change it.';
export const CALENDAR_NOTE = 'Stored observations from your AI provider, not your calendar. JobQuest cannot create, change, accept or cancel calendar events.';

// ---- views and filters -----------------------------------------------------------------------------------------

export const CALENDAR_VIEWS = [
  { id: 'upcoming', label: 'Upcoming' }, { id: 'today', label: 'Today' }, { id: 'week', label: 'This week' },
  { id: 'past', label: 'Past' }, { id: 'custom', label: 'Date range' },
] as const;
export type CalendarViewId = (typeof CALENDAR_VIEWS)[number]['id'];

export interface CalendarFilters {
  view: CalendarViewId; provider: string; status: SourceStatusFilter; category: string; eventStatus: string; company: string; range: DateRange;
}
export const DEFAULT_CALENDAR_FILTERS: CalendarFilters = {
  view: 'upcoming', provider: 'ALL', status: 'ACTIVE', category: 'ALL', eventStatus: 'ALL', company: '', range: { from: '', to: '' },
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (d: string) => DAY.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);

/** UTC instant of local midnight of `date` in `zone`; a midnight that DST skips resolves to 01:00. */
export function localDayStart(date: string, zone: string): string {
  const z = isValidTimeZone(zone) ? zone : 'UTC';
  try { return zonedWallTimeToUtcIso(date, '00:00', z); } catch { return zonedWallTimeToUtcIso(date, '01:00', z); }
}

/** weekday index (0 = Sunday) of a calendar date. */
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

export interface CalendarWindow {
  /** timed items: sort instant in [since, before) */
  since: string | null; before: string | null;
  /** all-day items: how the dates are compared. overlap = [fromDate, toDate]; future = ends on/after fromDate; past = ended before beforeDate. */
  mode: 'overlap' | 'future' | 'past';
  fromDate: string | null; toDate: string | null;
  order: 'asc' | 'desc';
}
export type CalendarWindowResult = { ok: true; window: CalendarWindow } | { ok: false; message: string };

/**
 * The time window of a view in the owner's zone. "Today" and "This week" are calendar days of the PROFILE zone
 * (a 25-hour fall-back day is 25 hours; a spring-forward day is 23). "This week" starts on the profile week start.
 */
export function calendarWindow(view: CalendarViewId, range: DateRange, timeZone: string, now: Date, weekStart: 0 | 1 = 1): CalendarWindowResult {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const today = dayKey(now.getTime(), zone);
  if (view === 'upcoming') return { ok: true, window: { since: now.toISOString(), before: null, mode: 'future', fromDate: today, toDate: null, order: 'asc' } };
  if (view === 'past') return { ok: true, window: { since: null, before: now.toISOString(), mode: 'past', fromDate: null, toDate: today, order: 'desc' } };
  if (view === 'today') {
    return { ok: true, window: { since: localDayStart(today, zone), before: localDayStart(shiftDay(today, 1), zone), mode: 'overlap', fromDate: today, toDate: today, order: 'asc' } };
  }
  if (view === 'week') {
    const start = shiftDay(today, -((weekdayOf(today) - weekStart + 7) % 7));
    const end = shiftDay(start, 7);
    return { ok: true, window: { since: localDayStart(start, zone), before: localDayStart(end, zone), mode: 'overlap', fromDate: start, toDate: shiftDay(end, -1), order: 'asc' } };
  }
  const { from, to } = range;
  if ((from && !validDay(from)) || (to && !validDay(to))) return { ok: false, message: 'Enter valid dates.' };
  if (!from && !to) return { ok: false, message: 'Choose a start date, an end date, or both.' };
  if (from && to && from > to) return { ok: false, message: 'The start date must be on or before the end date.' };
  return {
    ok: true,
    window: { since: from ? localDayStart(from, zone) : null, before: to ? localDayStart(shiftDay(to, 1), zone) : null, mode: 'overlap', fromDate: from || null, toDate: to || null, order: 'asc' },
  };
}

/**
 * PostgREST `or` expression for a window: timed items by their sort instant, all-day items by calendar date
 * (an all-day item is never moved by a zone). Values are instants/dates only, so nothing user-typed enters it.
 */
export function calendarWindowOr(w: CalendarWindow): string {
  const timed = ['all_day.eq.false', w.since ? `sort_at.gte.${w.since}` : '', w.before ? `sort_at.lt.${w.before}` : ''].filter(Boolean).join(',');
  const allDay = ['all_day.eq.true'];
  if (w.mode === 'future' && w.fromDate) allDay.push(`end_date.gte.${w.fromDate}`);
  else if (w.mode === 'past' && w.toDate) allDay.push(`end_date.lt.${w.toDate}`);
  else {
    if (w.fromDate) allDay.push(`end_date.gte.${w.fromDate}`);
    if (w.toDate) allDay.push(`start_date.lte.${w.toDate}`);
  }
  return `and(${timed}),and(${allDay.join(',')})`;
}

// ---- rows and views -----------------------------------------------------------------------------------------------

export interface CalendarRow {
  finding_id: string; user_id: string; category: string; is_deadline: boolean; status: string; all_day: boolean;
  start_at: string | null; end_at: string | null; start_date: string | null; end_date: string | null; deadline_at: string | null; sort_at: string;
  time_zone: string | null; calendar_source: string | null; source_event_url: string | null; company: string | null; job_title: string | null;
  location: string | null; meeting_url: string | null; organizer_name: string | null; organizer_domain: string | null;
  original_start_at: string | null; reschedule_count: number; cancelled_at: string | null; discovered_at: string;
  finding: {
    provider: string; status: string; priority: string; confidence: number | string | null; title: string; summary: string | null; evidence: string | null;
    job_url?: string | null;
  };
}

export interface CalendarEventView {
  id: string; ownerId: string; provider: string; reviewStatus: string; priority: string; confidence: number | null;
  category: string; isDeadline: boolean; status: string; title: string; summary: string | null; evidence: string | null;
  allDay: boolean; startAt: string | null; endAt: string | null; startDate: string | null; endDate: string | null; deadlineAt: string | null; sortAt: string;
  timeZone: string | null; calendarSource: string | null; sourceEventUrl: string | null;
  company: string | null; jobTitle: string | null; jobUrl: string | null; location: string | null; meetingUrl: string | null;
  organizerName: string | null; organizerDomain: string | null;
  originalStartAt: string | null; rescheduleCount: number; cancelledAt: string | null; discoveredAt: string;
  /** Filled at read time inside the caller's own RLS scope; null when unknown or ambiguous. Never persisted. */
  relatedLead: { id: string; company: string; title: string } | null;
  relatedApplication: { id: string; company: string; role: string } | null;
  relatedEmails: Array<{ id: string; title: string }>;
}

const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const httpsOnly = (v: unknown): string | null => { const u = safeHttpUrl(v); return u && u.startsWith('https://') ? u : null; };

export function toCalendarView(r: CalendarRow): CalendarEventView {
  const f = (typeof r.finding === 'object' && r.finding !== null ? r.finding : {}) as Partial<CalendarRow['finding']>;
  const conf = typeof f.confidence === 'string' ? Number(f.confidence) : f.confidence;
  return {
    id: String(r.finding_id), ownerId: String(r.user_id), provider: String(f.provider ?? ''), reviewStatus: String(f.status ?? ''), priority: String(f.priority ?? ''),
    confidence: typeof conf === 'number' && Number.isFinite(conf) ? conf : null,
    category: text(r.category, 24) ?? 'other', isDeadline: r.is_deadline === true, status: text(r.status, 12) ?? 'scheduled',
    title: text(f.title, 300) ?? '', summary: text(f.summary, 1000), evidence: text(f.evidence, 500),
    allDay: r.all_day === true, startAt: text(r.start_at, 40), endAt: text(r.end_at, 40),
    startDate: DAY.test(String(r.start_date)) ? String(r.start_date) : null, endDate: DAY.test(String(r.end_date)) ? String(r.end_date) : null,
    deadlineAt: text(r.deadline_at, 40), sortAt: String(r.sort_at),
    timeZone: text(r.time_zone, 64), calendarSource: text(r.calendar_source, 64), sourceEventUrl: httpsOnly(r.source_event_url),
    company: text(r.company, 200), jobTitle: text(r.job_title, 300), jobUrl: safeHttpUrl(f.job_url), location: text(r.location, 300), meetingUrl: httpsOnly(r.meeting_url),
    organizerName: text(r.organizer_name, 200), organizerDomain: text(r.organizer_domain, 255),
    originalStartAt: text(r.original_start_at, 40), rescheduleCount: typeof r.reschedule_count === 'number' ? r.reschedule_count : 0, cancelledAt: text(r.cancelled_at, 40),
    discoveredAt: String(r.discovered_at), relatedLead: null, relatedApplication: null, relatedEmails: [],
  };
}

// ---- presentation ------------------------------------------------------------------------------------------------------

const fmtDate = (date: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00Z`));
const fmtDay = (iso: string, zone: string) => formatInZone(iso, zone, { weekday: 'short', month: 'short', day: 'numeric' });
const fmtClock = (iso: string, zone: string) => formatInZone(iso, zone, { hour: 'numeric', minute: '2-digit' });

/** The day heading an item belongs under, in the owner's zone (all-day items keep their own date). */
export function calendarDayKey(e: Pick<CalendarEventView, 'allDay' | 'startDate' | 'sortAt'>, zone: string): string {
  return e.allDay && e.startDate ? e.startDate : dayKey(e.sortAt, isValidTimeZone(zone) ? zone : 'UTC');
}
export const calendarDayHeading = (key: string) => fmtDate(key);

/**
 * "Thu, Oct 15 · 2:00–3:00 PM CDT", "Due Fri, Oct 16 · 5:00 PM CDT", "Tue, Oct 20 – Thu, Oct 22 · All day".
 * Always rendered in `zone` (the owner's profile zone); a deadline is labelled "Due" so it can never be mistaken for a meeting.
 */
export function calendarWhenLabel(e: CalendarEventView, zone: string): string {
  const z = isValidTimeZone(zone) ? zone : 'UTC';
  if (e.allDay && e.startDate) {
    const range = e.endDate && e.endDate !== e.startDate ? `${fmtDate(e.startDate)} – ${fmtDate(e.endDate)}` : fmtDate(e.startDate);
    return `${e.isDeadline ? 'Due ' : ''}${range} · All day`;
  }
  if (e.isDeadline) {
    const at = e.deadlineAt ?? e.sortAt;
    return `Due ${fmtDay(at, z)} · ${fmtClock(at, z)} ${zoneAbbreviation(at, z)}`;
  }
  const start = e.startAt ?? e.sortAt;
  if (!e.endAt) return `${fmtDay(start, z)} · ${fmtClock(start, z)} ${zoneAbbreviation(start, z)}`;
  const sameDay = dayKey(start, z) === dayKey(e.endAt, z);
  return sameDay
    ? `${fmtDay(start, z)} · ${fmtClock(start, z)}–${fmtClock(e.endAt, z)} ${zoneAbbreviation(e.endAt, z)}`
    : `${fmtDay(start, z)} ${fmtClock(start, z)} – ${fmtDay(e.endAt, z)} ${fmtClock(e.endAt, z)} ${zoneAbbreviation(e.endAt, z)}`;
}

/** Label of the time a moved/cancelled item had before ("was Wed, Oct 14 · 2:00 PM CDT"); null when it never moved. */
export function calendarWasLabel(e: CalendarEventView, zone: string): string | null {
  if (!e.originalStartAt) return null;
  const z = isValidTimeZone(zone) ? zone : 'UTC';
  return `${fmtDay(e.originalStartAt, z)} · ${fmtClock(e.originalStartAt, z)} ${zoneAbbreviation(e.originalStartAt, z)}`;
}

/** "Scheduled event" or "Deadline": the distinction users must never lose. */
export const calendarKindLabel = (e: Pick<CalendarEventView, 'isDeadline'>) => (e.isDeadline ? 'Deadline' : 'Scheduled event');

/** Source zone note, shown only when it differs from the display zone. */
export function calendarSourceZoneNote(e: CalendarEventView, zone: string): string | null {
  if (e.allDay || !e.timeZone || e.timeZone === zone) return null;
  const at = e.startAt ?? e.deadlineAt ?? e.sortAt;
  return `${e.timeZone.replace(/_/g, ' ')}: ${fmtClock(at, e.timeZone)} ${zoneAbbreviation(at, e.timeZone)}`;
}

// ---- association (read time, in the caller's own scope) ---------------------------------------------------------------------

const norm = (s: string | null | undefined) => (s ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const TRACKING = /^(utm_.*|gclid|fbclid|msclkid|mc_cid|mc_eid|igshid|_hsenc|_hsmi|trk|trackingid)$/i;
/** Same canonical form the ingestion contract uses for job URLs. */
export function canonicalJobUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    u.hash = ''; u.username = ''; u.password = '';
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.toString();
  } catch { return null; }
}

export interface LeadCandidate { id: string; company: string; title: string; canonicalUrl: string | null }
export interface ApplicationCandidate { id: string; company: string; role: string; jobUrl: string | null }

/**
 * Safe association. Strongest signal first: the exact canonical job URL, then company + job title. Anything
 * ambiguous (two or more candidates) stays unlinked — a wrong link is worse than none — and nothing is persisted.
 */
export function pickUnique<T>(candidates: T[]): T | null { return candidates.length === 1 ? candidates[0]! : null; }

export function associateLead(e: Pick<CalendarEventView, 'jobUrl' | 'company' | 'jobTitle'>, leads: LeadCandidate[]): LeadCandidate | null {
  const url = canonicalJobUrl(e.jobUrl);
  if (url) {
    const hit = pickUnique(leads.filter((l) => l.canonicalUrl === url));
    if (hit) return hit;
  }
  if (!e.company || !e.jobTitle) return null;
  return pickUnique(leads.filter((l) => norm(l.company) === norm(e.company) && norm(l.title) === norm(e.jobTitle)));
}

export function associateApplication(e: Pick<CalendarEventView, 'jobUrl' | 'company' | 'jobTitle'>, apps: ApplicationCandidate[]): ApplicationCandidate | null {
  const url = canonicalJobUrl(e.jobUrl);
  if (url) {
    const hit = pickUnique(apps.filter((a) => canonicalJobUrl(a.jobUrl) === url));
    if (hit) return hit;
  }
  if (!e.company || !e.jobTitle) return null;
  return pickUnique(apps.filter((a) => norm(a.company) === norm(e.company) && norm(a.role) === norm(e.jobTitle)));
}

export interface EmailCandidate { id: string; title: string; company: string | null; dueAt: string | null }
/** An email finding and a calendar item "clearly represent the same thing" only for the same company and a deadline within an hour of the item. Display only: neither source is merged or hidden. */
export const EMAIL_CORRELATION_WINDOW_MS = 60 * 60 * 1000;
export function correlateEmails(e: Pick<CalendarEventView, 'company' | 'sortAt'>, emails: EmailCandidate[]): Array<{ id: string; title: string }> {
  if (!e.company) return [];
  const t = Date.parse(e.sortAt);
  return emails
    .filter((m) => m.dueAt && norm(m.company) === norm(e.company) && Math.abs(Date.parse(m.dueAt) - t) <= EMAIL_CORRELATION_WINDOW_MS)
    .slice(0, 3).map((m) => ({ id: m.id, title: m.title }));
}

/** Groups already-ordered items under their day heading, preserving order. */
export function groupByDay<T extends Pick<CalendarEventView, 'allDay' | 'startDate' | 'sortAt'>>(items: T[], zone: string): Array<{ key: string; items: T[] }> {
  const out: Array<{ key: string; items: T[] }> = [];
  for (const it of items) {
    const key = calendarDayKey(it, zone);
    const last = out[out.length - 1];
    if (last && last.key === key) last.items.push(it); else out.push({ key, items: [it] });
  }
  return out;
}

export interface CalendarCounts { upcoming: number; interviews: number; deadlines: number }
