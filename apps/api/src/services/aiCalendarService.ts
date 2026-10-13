// AI-7: READ-ONLY query service for calendar intelligence. Shared by the MCP read tool and the Daily
// Digest aggregation; the browser has its own RLS reader (apps/web/src/api/aiCalendar.ts) that mirrors
// these filters.
//
// Authorization is identical to the other AI read services: every read runs AS THE CALLER through RLS
// (userClient). The workspace id only narrows the query. There are no writes and no RPCs here: calendar
// intelligence enters JobQuest exclusively through ingestAiResult, and JobQuest never touches an external
// calendar.
//
// Output is sanitized for tool consumption: https-only links, bounded text, no provider event ids, no
// attendees, no raw provider payload. A cancelled event keeps its original time; a rescheduled event keeps
// the time it was moved from.
import {
  AI_PROVIDERS, CALENDAR_CATEGORIES, CALENDAR_STATUSES,
  type AiFindingStatus, type AiPriority, type AiProvider, type CalendarCategory, type CalendarStatus,
} from '../lib/aiContract';
import type { AiPage, AiPageRequest, AiReadContext, AiReadDeps, AiReadResult } from './aiReadService';
import { dbFail, num, parsePage, prepare, rec, s, sliced, sn } from './aiReadSupport';
import { SOURCE_STATUS_FILTERS, safeUrl, sanitizeSearch, type SourceStatusFilter } from './aiExternalIntelligenceService';

type Row = Record<string, unknown>;

export const CALENDAR_ORDERS = ['asc', 'desc'] as const;
export type CalendarOrder = (typeof CALENDAR_ORDERS)[number];

export interface CalendarFilters {
  provider?: AiProvider;
  /** Review status of the finding (ACTIVE = NEW or REVIEWED). */
  status?: SourceStatusFilter;
  category?: CalendarCategory;
  /** Calendar lifecycle: scheduled, tentative, rescheduled or cancelled. */
  eventStatus?: CalendarStatus;
  company?: string;
  /** Only deadline-type items (assessment/application/take-home deadlines, follow-ups). */
  deadlinesOnly?: boolean;
  /** Chronological window on the item's sort instant: >= since, < before (ISO-8601 with offset). */
  startsSince?: string;
  startsBefore?: string;
  /** Default asc (soonest first). */
  order?: CalendarOrder;
}

export interface CalendarEventDto {
  /** The parent finding id (the item's identity everywhere: dismiss, links). */
  id: string; ownerId: string; provider: AiProvider; reviewStatus: AiFindingStatus; priority: AiPriority; confidence: number | null;
  category: CalendarCategory; isDeadline: boolean; status: CalendarStatus;
  title: string; summary: string | null; evidence: string | null;
  allDay: boolean;
  /** UTC instants (timed items) or calendar dates (all-day items, end inclusive). */
  startAt: string | null; endAt: string | null; startDate: string | null; endDate: string | null; deadlineAt: string | null;
  /** Chronological anchor used for ordering and range queries. */
  sortAt: string;
  /** SOURCE zone of the item; display in the owner's profile zone. */
  timeZone: string | null;
  calendarSource: string | null; sourceEventUrl: string | null;
  company: string | null; jobTitle: string | null; location: string | null; meetingUrl: string | null;
  organizerName: string | null; organizerDomain: string | null;
  /** First known start when the item was moved; null when it never moved. */
  originalStartAt: string | null; rescheduleCount: number; cancelledAt: string | null;
  discoveredAt: string;
}

export const CALENDAR_COLUMNS = 'id, finding_id, user_id, category, is_deadline, status, all_day, start_at, end_at, start_date, end_date, deadline_at, sort_at, time_zone, '
  + 'calendar_source, source_event_url, company, job_title, location, meeting_url, organizer_name, organizer_domain, original_start_at, reschedule_count, '
  + 'cancelled_at, discovered_at, finding:ai_findings!inner(provider, status, priority, confidence, title, summary, evidence)';

const str = (v: unknown, max = 500): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
/** Meeting and event links are https-only on the way out (the contract enforces it on the way in). */
const httpsUrl = (v: unknown): string | null => { const u = safeUrl(v); return u && u.startsWith('https://') ? u : null; };

export function toCalendarEvent(r: Row): CalendarEventDto {
  const f = rec(r.finding);
  return {
    id: s(r.finding_id), ownerId: s(r.user_id), provider: f.provider as AiProvider, reviewStatus: f.status as AiFindingStatus, priority: f.priority as AiPriority,
    confidence: num(f.confidence), category: r.category as CalendarCategory, isDeadline: r.is_deadline === true, status: r.status as CalendarStatus,
    title: str(f.title, 300) ?? '', summary: str(f.summary, 1000), evidence: str(f.evidence, 500), allDay: r.all_day === true,
    startAt: sn(r.start_at), endAt: sn(r.end_at), startDate: sn(r.start_date), endDate: sn(r.end_date), deadlineAt: sn(r.deadline_at), sortAt: s(r.sort_at),
    timeZone: str(r.time_zone, 64), calendarSource: str(r.calendar_source, 64), sourceEventUrl: httpsUrl(r.source_event_url),
    company: str(r.company, 200), jobTitle: str(r.job_title, 300), location: str(r.location, 300), meetingUrl: httpsUrl(r.meeting_url),
    organizerName: str(r.organizer_name, 200), organizerDomain: str(r.organizer_domain, 255),
    originalStartAt: sn(r.original_start_at), rescheduleCount: num(r.reschedule_count) ?? 0, cancelledAt: sn(r.cancelled_at), discoveredAt: s(r.discovered_at),
  };
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: { code: 'INVALID_FILTER'; message: string } };
const badFilter = (detail: string): Parsed<never> => ({ ok: false, error: { code: 'INVALID_FILTER', message: `Invalid filter or pagination: ${detail}` } });
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
const ENUMS: Record<string, readonly string[]> = {
  provider: AI_PROVIDERS, status: SOURCE_STATUS_FILTERS, category: CALENDAR_CATEGORIES, eventStatus: CALENDAR_STATUSES, order: CALENDAR_ORDERS,
};

/** Strict parse: unknown keys are rejected; enums/instants are validated; text is sanitized. */
function parseCalendarFilters(raw: unknown): Parsed<CalendarFilters> {
  if (raw === undefined || raw === null) return { ok: true, value: {} };
  if (typeof raw !== 'object' || Array.isArray(raw)) return badFilter('filters');
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue;
    if (ENUMS[k]) { if (typeof v !== 'string' || !ENUMS[k]!.includes(v)) return badFilter(k); out[k] = v; }
    else if (k === 'startsSince' || k === 'startsBefore') { if (typeof v !== 'string' || !ISO.test(v) || Number.isNaN(Date.parse(v))) return badFilter(k); out[k] = v; }
    else if (k === 'deadlinesOnly') { if (typeof v !== 'boolean') return badFilter(k); out[k] = v; }
    else if (k === 'company') { if (typeof v !== 'string') return badFilter(k); const t = sanitizeSearch(v); if (t) out[k] = t; }
    else return badFilter(`unknown filter ${k}`);
  }
  return { ok: true, value: out as CalendarFilters };
}

const STATUS_SETS: Record<SourceStatusFilter, readonly string[] | null> = {
  ACTIVE: ['NEW', 'REVIEWED'], NEW: ['NEW'], REVIEWED: ['REVIEWED'], DISMISSED: ['DISMISSED'], ALL: null,
};

/**
 * Chronological calendar intelligence (soonest first unless `order: desc`), bounded and paginated.
 * Cancelled and rescheduled items are included unless filtered: a cancellation is information.
 */
export async function listCalendarIntelligence(ctx: AiReadContext, filters?: CalendarFilters, page?: AiPageRequest, deps: AiReadDeps = {}): Promise<AiReadResult<AiPage<CalendarEventDto>>> {
  const p = prepare(ctx, deps); if (!p.ok) return p;
  const f = parseCalendarFilters(filters); if (!f.ok) return f;
  const pg = parsePage(page); if (!pg.ok) return pg;
  const v = f.value;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = p.db.from('ai_calendar_events').select(CALENDAR_COLUMNS).eq('workspace_id', p.ws);
  if (v.provider) q = q.eq('finding.provider', v.provider);
  const set = STATUS_SETS[v.status ?? 'ALL'];
  if (set) q = set.length === 1 ? q.eq('finding.status', set[0]) : q.in('finding.status', [...set]);
  if (v.category) q = q.eq('category', v.category);
  if (v.eventStatus) q = q.eq('status', v.eventStatus);
  if (v.company) q = q.ilike('company', `%${v.company}%`);
  if (v.deadlinesOnly === true) q = q.eq('is_deadline', true);
  if (v.startsSince) q = q.gte('sort_at', v.startsSince);
  if (v.startsBefore) q = q.lt('sort_at', v.startsBefore);
  const asc = (v.order ?? 'asc') === 'asc';
  const { data, error } = await q.order('sort_at', { ascending: asc }).order('id', { ascending: asc }).range(pg.from, pg.to);
  if (error) return dbFail(error);
  return { ok: true, data: sliced(((data ?? []) as Row[]).map(toCalendarEvent), pg.page, pg.size) };
}
