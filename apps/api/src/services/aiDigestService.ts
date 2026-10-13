// AI-5: provider-neutral Daily Digest aggregation (Layer A).
//
// A Daily Digest is an `ai_findings` row (kind/workflow `daily_brief`) holding a
// versioned snapshot for one calendar date. This service owns the DETERMINISTIC half:
// it computes facts JobQuest itself owns (applications, follow-up dates, interviews,
// AI suggestions/findings) for a date and, on request, persists them as a
// provider='system' digest THROUGH ingestAiResult (the approved ingestion boundary;
// no direct table writes). External AI (Claude, later ChatGPT/Gemini) submits its own
// narrative digest through jobquest_submit_ai_result; both coexist, one per provider.
//
// Date semantics: the digest date is the calendar date in the OWNER'S PROFILE TIME
// ZONE (profiles.timezone, IANA; UTC when unset), the same authority the rest of
// JobQuest uses for dates. It is never the server UTC date. A stored digest is a
// snapshot: reads (aiReadService) never recompute it.
//
// Reads run AS THE CALLER through RLS (userClient), scoped to the digest owner's own
// rows, so a manager token does not fold other members' data into a personal digest.
import { userClient } from '../lib/db';
import { isAiHubServerEnabled } from '../lib/aiHubConfig';
import {
  AI_CONTRACT_NAME, AI_CONTRACT_VERSION, DIGEST_LIMITS, DIGEST_PAYLOAD_VERSION, EMAIL_ATTENTION_OR, STRONG_MATCH_THRESHOLD,
  type JsonRecord,
} from '../lib/aiContract';
import { isCalendarDate, nextCalendarDate, shiftCalendarDate } from '../lib/calendarDate';
import type { AiReadClient } from './aiReadService';
import { ingestAiResult, type AiIngestResult, type AiIntegrationDeps } from './aiIntegrationService';
import { safeUrl } from './aiExternalIntelligenceService';
import { rec } from './aiReadSupport';

// ---- date / time zone -------------------------------------------------------------

export const DEFAULT_DIGEST_TIME_ZONE = 'UTC';

export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length === 0 || zone.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true; } catch { return false; }
}

/** Calendar date (YYYY-MM-DD) of an instant in the given IANA zone. */
export function digestDateInZone(now: Date, timeZone: string): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_DIGEST_TIME_ZONE;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function zoneOffsetMs(utcMs: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - Math.floor(utcMs / 1000) * 1000;
}

/** UTC instant of local midnight at the start of `date` in `zone`. */
function zonedMidnightUtc(date: string, zone: string): number {
  const guess = Date.parse(`${date}T00:00:00Z`);
  let t = guess - zoneOffsetMs(guess, zone);
  const second = guess - zoneOffsetMs(t, zone);
  if (second !== t) t = second; // crossed a DST boundary
  return t;
}

/** [start, end) of a local calendar day as ISO instants. */
export function localDayWindow(date: string, timeZone: string): { start: string; end: string } {
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_DIGEST_TIME_ZONE;
  return {
    start: new Date(zonedMidnightUtc(date, zone)).toISOString(),
    end: new Date(zonedMidnightUtc(nextCalendarDate(date), zone)).toISOString(),
  };
}

// ---- context / errors ----------------------------------------------------------------

export interface AiDigestContext {
  workspaceId: string;
  /** The digest owner. Aggregation is restricted to this user's own rows. */
  userId: string;
  /** Verified access token of the owner; reads execute under RLS as this user. */
  accessToken?: string;
}
export interface AiDigestDeps { client?: AiReadClient; env?: Record<string, string | undefined>; now?: () => Date }

export type AiDigestErrorCode = 'AI_HUB_DISABLED' | 'INVALID_CONTEXT' | 'INVALID_DATE' | 'READ_FAILED';
export type AiDigestResult<T> = { ok: true; data: T } | { ok: false; error: { code: AiDigestErrorCode; message: string } };
const bad = (code: AiDigestErrorCode, message: string) => ({ ok: false as const, error: { code, message } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---- deterministic aggregation ---------------------------------------------------------

export interface DeterministicDigest {
  digestDate: string;
  timeZone: string;
  /** Normalized payload (same shape the contract validator stores). */
  payload: JsonRecord;
}

type Row = Record<string, unknown>;
const text = (v: unknown, max: number): string => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const appTitle = (r: Row) => text(`${text(r.company_name, 80)} — ${text(r.role_title, 70)}`, DIGEST_LIMITS.itemTitle);
const ACTION_LABEL: Record<string, string> = {
  set_status: 'Change status', create_task: 'Create task', create_followup: 'Create follow-up', link_contact: 'Link contact',
  create_application: 'Create application', schedule_interview: 'Schedule interview', other: 'Other',
};

/** Profile time zone of the digest owner (RLS: own profile). Falls back to UTC. */
export async function resolveOwnerTimeZone(db: AiReadClient, userId: string): Promise<string> {
  try {
    const { data } = await db.from('profiles').select('timezone').eq('user_id', userId).maybeSingle();
    return isValidTimeZone(data?.timezone) ? (data.timezone as string) : DEFAULT_DIGEST_TIME_ZONE;
  } catch {
    return DEFAULT_DIGEST_TIME_ZONE;
  }
}

/** Findings still open to the user; dismissed/closed ones are not part of a digest. */
const ACTIVE_STATUSES = ['NEW', 'REVIEWED'];
/** Mirrors aiExternalIntelligenceService (one definition of "needs attention"). */
const ATTENTION_OR = EMAIL_ATTENTION_OR;
const SOURCE_WORKFLOWS = { job_leads: 'job_discovery', email_activity: 'email_triage', recruiter_intel: 'recruiter_intel', calendar: 'calendar_review' } as const;
const label = (v: unknown) => text(v, 48).replace(/_/g, ' ');

// ---- calendar presentation (AI-7). Every time is rendered in the OWNER's profile zone; all-day items are dates. ----
const CATEGORY_LABEL: Record<string, string> = {
  interview: 'Interview', recruiter_call: 'Recruiter call', hiring_manager_call: 'Hiring manager call', networking_call: 'Networking call',
  assessment_deadline: 'Assessment due', application_deadline: 'Application deadline', take_home_deadline: 'Take-home due', follow_up: 'Follow-up', other: 'Calendar event',
};
const MEETING_CATEGORIES = new Set(['interview', 'recruiter_call', 'hiring_manager_call']);
function whenLabel(r: Row, zone: string): string {
  if (r.all_day === true) {
    const d = String(r.start_date ?? '');
    return isCalendarDate(d) ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(`${d}T12:00:00Z`)) : 'all day';
  }
  return new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(String(r.sort_at)));
}
/** Inclusive-local-date + instant window filter for events: timed items by instant, all-day items by calendar date. */
const windowOr = (w: { start: string; end: string }, d1: string, d2: string) =>
  `and(all_day.eq.false,sort_at.gte.${w.start},sort_at.lt.${w.end}),and(all_day.eq.true,start_date.lte.${d2},end_date.gte.${d1})`;

/**
 * Computes the facts JobQuest owns for `digestDate`. Nothing is fabricated: every count comes
 * from a query below.
 *
 * External sources (AI-6) keep the three AI-5 states exactly:
 *   available       the source stored items for the day
 *   zero            the source has run successfully before and found nothing for the day
 *   not_configured  no run of that source workflow has ever succeeded for this owner
 * "Strong job match" = provider match score >= STRONG_MATCH_THRESHOLD; a lead without a score is never strong.
 */
export async function buildDeterministicDigest(
  ctx: AiDigestContext,
  digestDate: string,
  deps: AiDigestDeps = {},
): Promise<AiDigestResult<DeterministicDigest>> {
  if (!isAiHubServerEnabled(deps.env)) return bad('AI_HUB_DISABLED', 'AI Hub is disabled on this server');
  if (!UUID.test(ctx?.workspaceId ?? '') || !UUID.test(ctx?.userId ?? '')) return bad('INVALID_CONTEXT', 'Invalid digest context');
  if (!deps.client && (typeof ctx.accessToken !== 'string' || ctx.accessToken.length < 20)) return bad('INVALID_CONTEXT', 'Invalid digest context');
  if (!isCalendarDate(digestDate)) return bad('INVALID_DATE', 'digest date must be YYYY-MM-DD');
  const db = deps.client ?? (userClient(ctx.accessToken!) as unknown as AiReadClient);
  const ws = ctx.workspaceId.toLowerCase();
  const me = ctx.userId.toLowerCase();

  const timeZone = await resolveOwnerTimeZone(db, me);
  const day = localDayWindow(digestDate, timeZone);
  const weekEnd = localDayWindow(shiftCalendarDate(digestDate, 7), timeZone).start;

  const apps = () => db.from('applications');
  const [added, addedRows, active, due, dueRows, interviewsToday, upcomingRows, pending, pendingRows, newFindings] = await Promise.all([
    apps().select('id', { count: 'exact', head: true }).eq('workspace_id', ws).eq('user_id', me).is('archived_at', null).gte('created_at', day.start).lt('created_at', day.end),
    apps().select('company_name, role_title, stage, created_at').eq('workspace_id', ws).eq('user_id', me).is('archived_at', null).gte('created_at', day.start).lt('created_at', day.end)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(DIGEST_LIMITS.itemsPerSection),
    apps().select('id', { count: 'exact', head: true }).eq('workspace_id', ws).eq('user_id', me).is('archived_at', null).eq('status', 'OPEN'),
    apps().select('id', { count: 'exact', head: true }).eq('workspace_id', ws).eq('user_id', me).is('archived_at', null).eq('status', 'OPEN').not('next_action_date', 'is', null).lte('next_action_date', digestDate),
    apps().select('company_name, role_title, next_action, next_action_date').eq('workspace_id', ws).eq('user_id', me).is('archived_at', null).eq('status', 'OPEN').not('next_action_date', 'is', null).lte('next_action_date', digestDate)
      .order('next_action_date', { ascending: true }).order('id', { ascending: true }).limit(DIGEST_LIMITS.itemsPerSection),
    db.from('interviews').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).eq('user_id', me).is('outcome', null).gte('scheduled_at', day.start).lt('scheduled_at', day.end),
    db.from('interviews').select('application_id, interview_type, scheduled_at').eq('workspace_id', ws).eq('user_id', me).is('outcome', null).gte('scheduled_at', day.start).lt('scheduled_at', weekEnd)
      .order('scheduled_at', { ascending: true }).order('id', { ascending: true }).limit(DIGEST_LIMITS.itemsPerSection),
    db.from('ai_suggestions').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).eq('user_id', me).eq('status', 'PENDING'),
    db.from('ai_suggestions').select('action, target_type, created_at').eq('workspace_id', ws).eq('user_id', me).eq('status', 'PENDING')
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(DIGEST_LIMITS.itemsPerSection),
    db.from('ai_findings').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).eq('user_id', me).neq('kind', 'daily_brief').gte('created_at', day.start).lt('created_at', day.end),
  ]);
  const all = [added, addedRows, active, due, dueRows, interviewsToday, upcomingRows, pending, pendingRows, newFindings];
  if (all.some((r) => r.error)) return bad('READ_FAILED', 'JobQuest data could not be read');

  // Interview rows carry only application_id; resolve titles with one bounded lookup.
  const upcoming = (upcomingRows.data ?? []) as Row[];
  const appIds = [...new Set(upcoming.map((r) => String(r.application_id)))];
  const titleById = new Map<string, string>();
  if (appIds.length) {
    const lookup = await apps().select('id, company_name, role_title').eq('workspace_id', ws).eq('user_id', me).in('id', appIds);
    if (lookup.error) return bad('READ_FAILED', 'JobQuest data could not be read');
    for (const r of (lookup.data ?? []) as Row[]) titleById.set(String(r.id), appTitle(r));
  }

  // ---- AI-6 external intelligence (job leads, email events, recruiter intel), owner-scoped under RLS ----
  const owned = (table: string, cols: string, head = false) => {
    const q = head ? db.from(table).select(cols, { count: 'exact', head: true }) : db.from(table).select(cols);
    return q.eq('workspace_id', ws).eq('user_id', me);
  };
  const leadsIn = (cols: string, head = false) =>
    owned('ai_job_leads', `${cols}, finding:ai_findings!inner(status)`, head).in('finding.status', ACTIVE_STATUSES).gte('discovered_at', day.start).lt('discovered_at', day.end);
  const emailIn = (cols: string, head = false) =>
    owned('ai_findings', cols, head).eq('kind', 'email_event').in('status', ACTIVE_STATUSES).gte('occurred_at', day.start).lt('occurred_at', day.end);
  const ran = (workflow: string) =>
    db.from('ai_runs').select('id').eq('workspace_id', ws).eq('user_id', me).eq('workflow', workflow).in('status', ['SUCCEEDED', 'PARTIAL']).limit(1);
  const [
    leadCount, strongCount, leadRows, emailCount, attentionCount, emailRows, replyCount, assessmentCount,
    deadlineCount, deadlineRows, recruiterCount, recruiterRows, ranLeads, ranEmail, ranRecruiter,
  ] = await Promise.all([
    leadsIn('id', true),
    leadsIn('id', true).gte('match_score', STRONG_MATCH_THRESHOLD),
    leadsIn('company, title, location, match_score, source_url, discovered_at')
      .order('match_score', { ascending: false, nullsFirst: false }).order('discovered_at', { ascending: false }).limit(DIGEST_LIMITS.itemsPerSection),
    emailIn('id', true),
    emailIn('id', true).eq('status', 'NEW').or(ATTENTION_OR),
    emailIn('title, category, priority, due_at, occurred_at, payload')
      .order('occurred_at', { ascending: false }).order('id', { ascending: false }).limit(DIGEST_LIMITS.itemsPerSection),
    emailIn('id', true).eq('category', 'recruiter_reply'),
    emailIn('id', true).eq('category', 'assessment'),
    owned('ai_findings', 'id', true).eq('kind', 'email_event').in('status', ACTIVE_STATUSES).gte('due_at', day.start).lt('due_at', weekEnd),
    owned('ai_findings', 'title, category, due_at, payload').eq('kind', 'email_event').in('status', ACTIVE_STATUSES).gte('due_at', day.start).lt('due_at', weekEnd)
      .order('due_at', { ascending: true }).order('id', { ascending: true }).limit(DIGEST_LIMITS.itemsPerSection),
    owned('ai_findings', 'id', true).eq('kind', 'recruiter_intel').in('status', ACTIVE_STATUSES).gte('created_at', day.start).lt('created_at', day.end),
    owned('ai_findings', 'title, source_ref, created_at, payload').eq('kind', 'recruiter_intel').in('status', ACTIVE_STATUSES).gte('created_at', day.start).lt('created_at', day.end)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(DIGEST_LIMITS.itemsPerSection),
    ran(SOURCE_WORKFLOWS.job_leads), ran(SOURCE_WORKFLOWS.email_activity), ran(SOURCE_WORKFLOWS.recruiter_intel),
  ]);
  const external = [leadCount, strongCount, leadRows, emailCount, attentionCount, emailRows, replyCount, assessmentCount, deadlineCount, deadlineRows, recruiterCount, recruiterRows, ranLeads, ranEmail, ranRecruiter];
  if (external.some((r) => r.error)) return bad('READ_FAILED', 'JobQuest data could not be read');

  // ---- AI-7 calendar intelligence (stored items only; the external calendar is never queried) ----
  const lastDay = shiftCalendarDate(digestDate, 6);
  const calIn = (cols: string, w: { start: string; end: string }, d1: string, d2: string, head = false) =>
    owned('ai_calendar_events', `${cols}, finding:ai_findings!inner(status, title)`, head).in('finding.status', ACTIVE_STATUSES).or(windowOr(w, d1, d2));
  const weekWindow = { start: day.start, end: weekEnd };
  const [calTodayCount, calDeadlineCount, calWeekCount, calRows, calChangeRows, ranCalendar] = await Promise.all([
    calIn('id', day, digestDate, digestDate, true).neq('status', 'cancelled'),
    calIn('id', weekWindow, digestDate, lastDay, true).neq('status', 'cancelled').eq('is_deadline', true),
    calIn('id', weekWindow, digestDate, lastDay, true),
    calIn('category, status, all_day, start_date, sort_at, original_start_at, is_deadline, finding_id', weekWindow, digestDate, lastDay).neq('status', 'cancelled')
      .order('sort_at', { ascending: true }).order('id', { ascending: true }).limit(DIGEST_LIMITS.itemsPerSection),
    calIn('category, status, all_day, start_date, sort_at, original_start_at, is_deadline, finding_id', weekWindow, digestDate, lastDay).in('status', ['cancelled', 'rescheduled'])
      .order('sort_at', { ascending: true }).order('id', { ascending: true }).limit(2),
    ran(SOURCE_WORKFLOWS.calendar),
  ]);
  if ([calTodayCount, calDeadlineCount, calWeekCount, calRows, calChangeRows, ranCalendar].some((r) => r.error)) return bad('READ_FAILED', 'JobQuest data could not be read');
  const rowsOf = (r: { data?: unknown }) => (Array.isArray(r.data) ? (r.data as Row[]) : []);
  const hasRun = (r: { data?: unknown }) => rowsOf(r).length > 0;

  const addedCount = added.count ?? 0;
  const dueCount = due.count ?? 0;
  const pendingCount = pending.count ?? 0;
  const deadlines = rowsOf(deadlineRows);
  const upcomingCount = upcoming.length + (deadlineCount.count ?? 0);
  const leadsTotal = leadCount.count ?? 0, strongTotal = strongCount.count ?? 0, emailTotal = emailCount.count ?? 0;
  const attentionTotal = attentionCount.count ?? 0, recruiterTotal = recruiterCount.count ?? 0;

  const section = (count: number, items: JsonRecord[]): JsonRecord =>
    count > 0 || items.length > 0 ? { status: 'available', count: Math.max(count, items.length), items } : { status: 'zero', count: 0, items: [] };
  const NOT_CONFIGURED: JsonRecord = { status: 'not_configured', items: [] };
  /** available when it reported items, zero when the source ran successfully before, otherwise not_configured. */
  const sourceSection = (count: number, items: JsonRecord[], configured: boolean): JsonRecord =>
    count > 0 || items.length > 0 ? section(count, items) : configured ? section(0, []) : NOT_CONFIGURED;
  const leadsConfigured = hasRun(ranLeads), emailConfigured = hasRun(ranEmail), recruiterConfigured = hasRun(ranRecruiter);
  const calendarConfigured = hasRun(ranCalendar);
  const calendarTotal = calWeekCount.count ?? 0, calendarTodayTotal = calTodayCount.count ?? 0, calendarDeadlineTotal = calDeadlineCount.count ?? 0;

  // Calendar items: scheduled/tentative/rescheduled first by time, with up to two cancellations/reschedules always kept
  // visible (a change is information), then re-sorted chronologically. A moved item says where it moved from.
  const calById = new Map<string, Row>();
  for (const r of [...rowsOf(calChangeRows), ...rowsOf(calRows)]) if (!calById.has(String(r.finding_id)) && calById.size < DIGEST_LIMITS.itemsPerSection) calById.set(String(r.finding_id), r);
  const calSorted = [...calById.values()].sort((a, b) => String(a.sort_at).localeCompare(String(b.sort_at)));
  const calendarItems: JsonRecord[] = calSorted.map((r) => {
    const status = String(r.status);
    const cat = String(r.category);
    const was = r.original_start_at ? whenLabel({ ...r, all_day: false, sort_at: r.original_start_at }, timeZone) : '';
    const detail = [
      CATEGORY_LABEL[cat] ?? 'Calendar event',
      r.is_deadline === true ? `due ${whenLabel(r, timeZone)}` : whenLabel(r, timeZone),
      status === 'cancelled' ? 'CANCELLED' : status === 'rescheduled' ? `rescheduled${was ? ` from ${was}` : ''}` : status === 'tentative' ? 'tentative' : '',
    ].filter(Boolean).join(' · ');
    const high = status === 'cancelled' || status === 'rescheduled' || (MEETING_CATEGORIES.has(cat) && String(r.sort_at) < day.end) || (r.is_deadline === true && String(r.sort_at) < new Date(Date.parse(day.start) + 2 * 86_400_000).toISOString());
    return {
      title: text(rec(r.finding).title, DIGEST_LIMITS.itemTitle), detail: text(detail, DIGEST_LIMITS.itemDetail), source: 'calendar',
      ...(high ? { priority: 'HIGH' } : {}), occurred_at: new Date(String(r.sort_at)).toISOString(),
    };
  });

  const leadItems: JsonRecord[] = rowsOf(leadRows).map((r) => {
    const score = r.match_score === null || r.match_score === undefined ? null : Number(r.match_score);
    const url = safeUrl(r.source_url);
    return {
      title: text(`${text(r.company, 80)} — ${text(r.title, 70)}`, DIGEST_LIMITS.itemTitle),
      detail: text([score === null ? '' : `AI match ${score}/100`, text(r.location, 80)].filter(Boolean).join(' · ') || 'Job lead', DIGEST_LIMITS.itemDetail),
      source: 'job_site', priority: score !== null && score >= STRONG_MATCH_THRESHOLD ? 'HIGH' : 'NORMAL',
      ...(url ? { url } : {}), occurred_at: new Date(String(r.discovered_at)).toISOString(),
    };
  });
  const emailItem = (r: Row, when: 'occurred_at' | 'due_at'): JsonRecord => {
    const payload = (r.payload ?? {}) as Row;
    const company = text(payload.company, 80);
    return {
      title: text(r.title, DIGEST_LIMITS.itemTitle),
      detail: text([label(r.category), company, when === 'due_at' ? '' : r.due_at ? `due ${String(r.due_at).slice(0, 10)}` : ''].filter(Boolean).join(' · '), DIGEST_LIMITS.itemDetail),
      source: 'gmail', ...(r.priority === 'HIGH' || r.priority === 'CRITICAL' ? { priority: String(r.priority) } : {}),
      ...(r[when] ? { occurred_at: new Date(String(r[when])).toISOString() } : {}),
    };
  };
  const emailItems: JsonRecord[] = rowsOf(emailRows).map((r) => emailItem(r, 'occurred_at'));
  const deadlineItems: JsonRecord[] = deadlines.map((r) => ({ ...emailItem(r, 'due_at'), title: text(`Deadline: ${text(r.title, 130)}`, DIGEST_LIMITS.itemTitle), priority: 'HIGH' }));
  const recruiterItems: JsonRecord[] = rowsOf(recruiterRows).map((r) => {
    const payload = (r.payload ?? {}) as Row;
    const url = safeUrl(payload.profile_url) ?? safeUrl(((r.source_ref ?? {}) as Row).url);
    return {
      title: text(`${text(payload.recruiter_name, 80) || text(r.title, 80)} — ${text(payload.company, 70)}`, DIGEST_LIMITS.itemTitle),
      detail: text([label(payload.role_title || payload.relationship), payload.verification === 'verified' ? 'public source cited' : 'unverified'].filter((x) => x !== '').join(' · '), DIGEST_LIMITS.itemDetail),
      source: 'web', ...(url ? { url } : {}), occurred_at: new Date(String(r.created_at)).toISOString(),
    };
  });

  const appItems: JsonRecord[] = ((addedRows.data ?? []) as Row[]).map((r) => ({
    title: appTitle(r), detail: `Added to JobQuest (${text(r.stage, 32).toLowerCase().replace(/_/g, ' ')})`, source: 'jobquest', occurred_at: new Date(String(r.created_at)).toISOString(),
  }));
  const dueItems: JsonRecord[] = ((dueRows.data ?? []) as Row[]).map((r) => ({
    title: appTitle(r),
    detail: text(`${r.next_action ? `${text(r.next_action, 120)} · ` : ''}due ${String(r.next_action_date)}`, DIGEST_LIMITS.itemDetail),
    source: 'jobquest', priority: String(r.next_action_date) < digestDate ? 'HIGH' : 'NORMAL',
  }));
  const interviewItems: JsonRecord[] = upcoming.map((r) => ({
    title: text(`${titleById.get(String(r.application_id)) ?? 'Interview'}`, DIGEST_LIMITS.itemTitle),
    detail: `${text(r.interview_type, 32).toLowerCase().replace(/_/g, ' ')} interview`, source: 'jobquest', occurred_at: new Date(String(r.scheduled_at)).toISOString(),
  }));
  // Interviews and email deadlines share "Upcoming", soonest first. (Calendar items have their own section.)
  const upcomingItems: JsonRecord[] = [...interviewItems, ...deadlineItems]
    .sort((a, b) => String(a.occurred_at ?? '').localeCompare(String(b.occurred_at ?? ''))).slice(0, DIGEST_LIMITS.itemsPerSection);
  const suggestionItems: JsonRecord[] = ((pendingRows.data ?? []) as Row[]).map((r) => ({
    title: `${ACTION_LABEL[String(r.action)] ?? 'Suggestion'} awaiting your decision`,
    detail: r.target_type ? `Target: ${text(r.target_type, 32).replace(/_/g, ' ')}` : undefined, source: 'provider',
  })).map((i) => (i.detail === undefined ? { title: i.title, source: i.source } : i)) as JsonRecord[];

  const calendarPriorities: JsonRecord[] = calendarItems.filter((i) => i.priority === 'HIGH').slice(0, 3)
    .map((i) => ({ title: text(`${i.detail && String(i.detail).includes('CANCELLED') ? 'Cancelled: ' : i.detail && String(i.detail).includes('rescheduled') ? 'Rescheduled: ' : ''}${i.title}`, DIGEST_LIMITS.itemTitle), ...(i.detail ? { detail: i.detail } : {}), priority: 'HIGH', source: 'calendar' }));
  const priorities: JsonRecord[] = [
    ...calendarPriorities,
    ...dueItems.filter((i) => i.priority === 'HIGH').slice(0, 3).map((i) => ({ title: `Follow up: ${i.title}`, detail: i.detail, priority: 'HIGH', source: 'jobquest' })),
    ...(attentionTotal > 0 ? [{ title: `${attentionTotal} job-search email${attentionTotal === 1 ? '' : 's'} need${attentionTotal === 1 ? 's' : ''} your attention`, priority: 'HIGH', source: 'gmail' }] : []),
    ...(strongTotal > 0 ? [{ title: `${strongTotal} strong job match${strongTotal === 1 ? '' : 'es'} (AI match ${STRONG_MATCH_THRESHOLD}+)`, priority: 'NORMAL', source: 'job_site' }] : []),
    ...(pendingCount > 0 ? [{ title: `${pendingCount} AI suggestion${pendingCount === 1 ? '' : 's'} awaiting your decision`, priority: 'NORMAL', source: 'jobquest' }] : []),
  ].slice(0, DIGEST_LIMITS.priorities) as JsonRecord[];

  const payload: JsonRecord = {
    version: DIGEST_PAYLOAD_VERSION,
    digest_date: digestDate,
    time_zone: timeZone,
    generated_at: (deps.now?.() ?? new Date()).toISOString(),
    // A count is only present when its source is configured: absent means "not reported", never zero.
    summary: {
      applications_added: addedCount, active_applications: active.count ?? 0, follow_ups: dueCount,
      interviews: interviewsToday.count ?? 0, pending_suggestions: pendingCount, new_findings: newFindings.count ?? 0,
      ...(leadsConfigured || leadsTotal > 0 ? { new_job_leads: leadsTotal, strong_matches: strongTotal } : {}),
      ...(emailConfigured || emailTotal > 0 ? { recruiter_replies: replyCount.count ?? 0, assessments: assessmentCount.count ?? 0 } : {}),
      ...(calendarConfigured || calendarTotal > 0 ? { calendar_today: calendarTodayTotal, calendar_deadlines: calendarDeadlineTotal } : {}),
    },
    priorities,
    sections: {
      applications: section(addedCount, appItems),
      job_leads: sourceSection(leadsTotal, leadItems, leadsConfigured),
      email_activity: sourceSection(emailTotal, emailItems, emailConfigured),
      recruiter_intel: sourceSection(recruiterTotal, recruiterItems, recruiterConfigured),
      calendar: sourceSection(calendarTotal, calendarItems, calendarConfigured),
      upcoming: section(upcomingCount, upcomingItems),
      follow_ups: section(dueCount, dueItems),
      ai_suggestions: section(pendingCount, suggestionItems),
    },
  };
  return { ok: true, data: { digestDate, timeZone, payload } };
}

// ---- persistence (through the approved ingestion boundary) ------------------------------

/**
 * Wire-format jobquest.ai-result for a JobQuest-generated digest. Provider is `system`
 * (JobQuest itself), never `claude`. The ingestion layer validates it like any provider
 * payload and derives the dedupe key (date + provider) itself.
 */
export function toSystemDigestWire(d: DeterministicDigest, generatedAt: string): Record<string, unknown> {
  const sum = d.payload.summary as Record<string, number>;
  return {
    contract: AI_CONTRACT_NAME,
    schema_version: AI_CONTRACT_VERSION,
    provider: 'system',
    workflow: 'daily_brief',
    // Stable per date: re-generating the same day is an idempotent no-op run.
    run: { external_run_id: `system-digest:${d.digestDate}`, generated_at: generatedAt },
    sources: [{ type: 'jobquest', ref: `digest:${d.digestDate}`, observed_at: generatedAt }],
    findings: [{
      kind: 'daily_brief',
      dedupe: { date: d.digestDate },
      priority: 'INFO',
      title: `JobQuest daily digest — ${d.digestDate}`,
      summary: text(`${sum.applications_added} added, ${sum.active_applications} active, ${sum.follow_ups} follow-ups, ${sum.pending_suggestions} pending suggestions`, 300),
      occurred_at: generatedAt,
      payload: d.payload,
    }],
    suggestions: [],
  };
}

export type GenerateDigestOutcome = { ingest: AiIngestResult; digestDate: string; timeZone: string };

/**
 * Persist the deterministic digest for TODAY (the owner's profile time zone) as a
 * provider='system' Daily Digest. Only today can be generated: a snapshot of past state
 * cannot be reconstructed from current state, so historical dates are never fabricated.
 * Re-running on the same date is idempotent (same external_run_id) and never creates a
 * duplicate row.
 */
export async function generateSystemDigest(
  ctx: AiDigestContext,
  deps: AiDigestDeps & { ingest?: AiIntegrationDeps } = {},
): Promise<AiDigestResult<GenerateDigestOutcome>> {
  const now = deps.now?.() ?? new Date();
  if (!deps.client && (typeof ctx?.accessToken !== 'string' || ctx.accessToken.length < 20)) return bad('INVALID_CONTEXT', 'Invalid digest context');
  const db = deps.client ?? (userClient(ctx.accessToken!) as unknown as AiReadClient);
  const zone = UUID.test(ctx?.userId ?? '') ? await resolveOwnerTimeZone(db, ctx.userId.toLowerCase()) : DEFAULT_DIGEST_TIME_ZONE;
  const date = digestDateInZone(now, zone);
  const built = await buildDeterministicDigest(ctx, date, { ...deps, client: db });
  if (!built.ok) return built;
  const wire = toSystemDigestWire(built.data, now.toISOString());
  const ingest = await ingestAiResult(
    { workspaceId: ctx.workspaceId, userId: ctx.userId, actorKind: 'SERVICE_INGEST', triggerType: 'manual' },
    wire,
    deps.ingest,
  );
  return { ok: true, data: { ingest, digestDate: built.data.digestDate, timeZone: built.data.timeZone } };
}
