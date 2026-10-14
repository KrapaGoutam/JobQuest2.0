// AI-5 / AI-11C: provider-neutral Daily Digest generation.
//
// A Daily Digest is an `ai_findings` row (kind/workflow `daily_brief`) holding a versioned snapshot for one calendar
// date. This service is the READ half of the canonical generator:
//
//   resolve owner time zone -> local-day windows -> read canonical JobQuest sources (owner-scoped, under RLS)
//   -> composeDailyDigest (pure; ordering, bounding, grouping, source states) -> persist through ingestAiResult.
//
// It composes EXISTING structured data only (AI-6 email/job/recruiter intelligence, AI-7 calendar intelligence,
// applications, interviews, tasks). It never searches the web, never calls a model, never mutates a core record and
// never creates a task or application. External AI (Claude, later ChatGPT/Gemini) submits its own narrative digest
// through jobquest_submit_ai_result; both coexist, one per provider, in the same payload shape.
//
// Date semantics: the digest date is the calendar date in the OWNER'S PROFILE TIME ZONE (profiles.timezone, IANA; UTC
// when unset), the same authority the rest of JobQuest uses for dates. It is never the server UTC date. A stored
// digest is a snapshot: reads (aiReadService) never recompute it.
//
// Reads run AS THE CALLER through RLS (userClient), scoped to the digest owner's own rows, so a manager token does
// not fold other members' data into a personal digest.
import { userClient } from '../lib/db';
import { isAiHubServerEnabled } from '../lib/aiHubConfig';
import {
  AI_CONTRACT_NAME, AI_CONTRACT_VERSION, DIGEST_LOOKBACK_DAYS, EMAIL_ATTENTION_OR, composeDailyDigest, discoverySearchOutcome, emailGroupCategories,
  type AiSourceStatus, type ComposeInput, type JsonRecord, type SourceHealth,
} from '../lib/aiContract';
import { isCalendarDate, nextCalendarDate, shiftCalendarDate } from '../lib/calendarDate';
import type { AiReadClient } from './aiReadService';
import { ingestAiResult, type AiIngestResult, type AiIntegrationDeps } from './aiIntegrationService';
import {
  EMAIL_COLUMNS, LEAD_COLUMNS, RECRUITER_COLUMNS, attachEmailApplicationMatches, attachRelatedLeads, toEmailEvent, toJobLead, toRecruiterIntel,
} from './aiExternalIntelligenceService';
import { CALENDAR_COLUMNS, toCalendarEvent } from './aiCalendarService';

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
type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

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
/** The source workflows whose ai_runs describe whether a source is operational. */
const SOURCE_WORKFLOWS = { jobs: 'job_discovery', email: 'email_triage', recruiters: 'recruiter_intel', calendar: 'calendar_review' } as const;

/** Rows examined per source before composition keeps its bounded top-N (counts always come from exact head queries). */
const SCAN = { emails: 100, attentionEmails: 50, calendar: 30, interviews: 12, followUps: 10, leads: 12, recruiters: 30, trackedApps: 200 } as const;

/** Inclusive-local-date + instant window filter for events: timed items by instant, all-day items by calendar date. */
const windowOr = (w: { start: string; end: string }, d1: string, d2: string) =>
  `and(all_day.eq.false,sort_at.gte.${w.start},sort_at.lt.${w.end}),and(all_day.eq.true,start_date.lte.${d2},end_date.gte.${d1})`;

const rowsOf = (r: { data?: unknown }): Row[] => (Array.isArray(r.data) ? (r.data as Row[]) : []);
const countOf = (r: { count?: number | null }): number => r.count ?? 0;
const appLabel = (r: Row): string => `${String(r.company_name ?? '').trim()} — ${String(r.role_title ?? '').trim()}`;

/**
 * Reads the canonical JobQuest sources for `digestDate` and composes the digest. Nothing is fabricated: every count
 * comes from a query below; ordering and bounding live in composeDailyDigest (pure).
 *
 * Source states (per section): `available` the source stored items; `zero` the source's latest run succeeded and
 * found nothing in the window; `unavailable` its latest run FAILED; `not_configured` it has never produced a run.
 * (State comes from the latest ai_runs row of the source workflow; nothing else is invented for it.)
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
  const db = (deps.client ?? (userClient(ctx.accessToken!) as unknown as AiReadClient)) as unknown as Db;
  const ws = ctx.workspaceId.toLowerCase();
  const me = ctx.userId.toLowerCase();

  const timeZone = await resolveOwnerTimeZone(db as unknown as AiReadClient, me);
  const day = localDayWindow(digestDate, timeZone);
  const startOf = (back: number) => localDayWindow(shiftCalendarDate(digestDate, -(back - 1)), timeZone).start;
  const upcomingEnd = localDayWindow(shiftCalendarDate(digestDate, DIGEST_LOOKBACK_DAYS.upcoming + 1), timeZone).start;
  const lastUpcomingDay = shiftCalendarDate(digestDate, DIGEST_LOOKBACK_DAYS.upcoming);
  const attentionStart = startOf(DIGEST_LOOKBACK_DAYS.attention);
  const emailStart = startOf(DIGEST_LOOKBACK_DAYS.email);
  const leadStart = startOf(DIGEST_LOOKBACK_DAYS.jobLeads);
  const recruiterStart = startOf(DIGEST_LOOKBACK_DAYS.recruiters);

  // ---- builders (every query is owner + workspace scoped; RLS is the authority) ----
  const owned = (table: string, cols: string, head = false) => {
    const q = head ? db.from(table).select(cols, { count: 'exact', head: true }) : db.from(table).select(cols);
    return q.eq('workspace_id', ws).eq('user_id', me);
  };
  const emailQ = (cols: string, from: string, head = false) =>
    owned('ai_findings', cols, head).eq('kind', 'email_event').in('status', ACTIVE_STATUSES).gte('occurred_at', from).lt('occurred_at', day.end);
  const calQ = (cols: string, head = false) =>
    owned('ai_calendar_events', head ? 'id, finding:ai_findings!inner(status)' : cols, head).in('finding.status', ACTIVE_STATUSES)
      .or(windowOr({ start: day.start, end: upcomingEnd }, digestDate, lastUpcomingDay));
  const latestRun = (workflow: string) =>
    db.from('ai_runs').select('status, sources').eq('workspace_id', ws).eq('user_id', me).eq('workflow', workflow).in('status', ['SUCCEEDED', 'PARTIAL', 'FAILED'])
      .order('created_at', { ascending: false }).limit(1);
  const soonOrOverdueTasks = (cols: string, head = false) =>
    owned('tasks', cols, head).eq('status', 'PENDING').or(`due_date.lte.${digestDate},due_at.lt.${day.end}`);
  const dueApps = (cols: string, head = false) =>
    owned('applications', cols, head).is('archived_at', null).eq('status', 'OPEN').not('next_action_date', 'is', null).lte('next_action_date', digestDate);

  const [
    emailRows, attentionRows, jobEmailCount, otherEmailCount, attentionCount,
    calRows, calCount, interviewRows, interviewCount,
    appFollowRows, appFollowCount, taskRows, taskCount,
    leadRows, leadCount, recruiterRows, recruiterCount, openApps,
    runEmail, runCalendar, runJobs, runRecruiters,
  ] = await Promise.all([
    emailQ(EMAIL_COLUMNS, attentionStart).order('occurred_at', { ascending: false }).order('id', { ascending: false }).limit(SCAN.emails),
    emailQ(EMAIL_COLUMNS, attentionStart).eq('status', 'NEW').or(EMAIL_ATTENTION_OR).order('occurred_at', { ascending: false }).order('id', { ascending: false }).limit(SCAN.attentionEmails),
    emailQ('id', emailStart, true).in('category', emailGroupCategories('job_related')),
    emailQ('id', emailStart, true).in('category', emailGroupCategories('other')),
    emailQ('id', attentionStart, true).eq('status', 'NEW').or(EMAIL_ATTENTION_OR),
    calQ(CALENDAR_COLUMNS).order('sort_at', { ascending: true }).order('id', { ascending: true }).limit(SCAN.calendar),
    calQ('id', true).neq('status', 'cancelled'),
    owned('interviews', 'id, application_id, interview_type, scheduled_at').is('outcome', null).gte('scheduled_at', day.start).lt('scheduled_at', upcomingEnd)
      .order('scheduled_at', { ascending: true }).order('id', { ascending: true }).limit(SCAN.interviews),
    owned('interviews', 'id', true).is('outcome', null).gte('scheduled_at', day.start).lt('scheduled_at', upcomingEnd),
    dueApps('id, company_name, role_title, next_action, next_action_date').order('next_action_date', { ascending: true }).order('id', { ascending: true }).limit(SCAN.followUps),
    dueApps('id', true),
    soonOrOverdueTasks('id, application_id, title, due_date, due_at, priority').order('due_date', { ascending: true, nullsFirst: false }).order('id', { ascending: true }).limit(SCAN.followUps),
    soonOrOverdueTasks('id', true),
    owned('ai_job_leads', `${LEAD_COLUMNS}`).in('finding.status', ACTIVE_STATUSES).gte('discovered_at', leadStart).lt('discovered_at', day.end)
      .order('match_score', { ascending: false, nullsFirst: false }).order('discovered_at', { ascending: false }).order('id', { ascending: false }).limit(SCAN.leads),
    owned('ai_job_leads', 'id, finding:ai_findings!inner(status)', true).in('finding.status', ACTIVE_STATUSES).gte('discovered_at', leadStart).lt('discovered_at', day.end),
    owned('ai_findings', RECRUITER_COLUMNS).eq('kind', 'recruiter_intel').in('status', ACTIVE_STATUSES).gte('created_at', recruiterStart).lt('created_at', day.end)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(SCAN.recruiters),
    owned('ai_findings', 'id', true).eq('kind', 'recruiter_intel').in('status', ACTIVE_STATUSES).gte('created_at', recruiterStart).lt('created_at', day.end),
    owned('applications', 'company_name').is('archived_at', null).eq('status', 'OPEN').limit(SCAN.trackedApps),
    latestRun(SOURCE_WORKFLOWS.email), latestRun(SOURCE_WORKFLOWS.calendar), latestRun(SOURCE_WORKFLOWS.jobs), latestRun(SOURCE_WORKFLOWS.recruiters),
  ]);
  const all = [
    emailRows, attentionRows, jobEmailCount, otherEmailCount, attentionCount, calRows, calCount, interviewRows, interviewCount, appFollowRows,
    appFollowCount, taskRows, taskCount, leadRows, leadCount, recruiterRows, recruiterCount, openApps, runEmail, runCalendar, runJobs, runRecruiters,
  ];
  if (all.some((r) => r.error)) return bad('READ_FAILED', 'JobQuest data could not be read');

  // AI-11D: a run that finished but whose every source reported blocked / unavailable / error / skipped did NOT search anything,
  // so it reads as unavailable (never as a quiet "zero"). Runs without per-source status keep the AI-11C behaviour.
  const health = (r: { data?: unknown }): SourceHealth => {
    const row = rowsOf(r)[0];
    const status = row?.status;
    if (status === 'FAILED') return 'failed';
    if (status === 'SUCCEEDED' || status === 'PARTIAL') {
      const sources = Array.isArray(row?.sources) ? (row.sources as { status?: AiSourceStatus }[]) : [];
      return discoverySearchOutcome(sources) === 'not_searched' ? 'failed' : 'ok';
    }
    return 'never';
  };

  // ---- emails (+ the derived application match, best-effort: a failed lookup leaves matches null) ----
  const byId = new Map<string, Row>();
  for (const r of [...rowsOf(attentionRows), ...rowsOf(emailRows)]) byId.set(String(r.id), r);
  const emails = [...byId.values()].map(toEmailEvent);
  await attachEmailApplicationMatches(db, ws, emails);

  // ---- application labels for interviews / tasks / follow-ups (one bounded lookup) ----
  const interviews = rowsOf(interviewRows);
  const tasks = rowsOf(taskRows);
  const wantedApps = [...new Set([...interviews.map((r) => String(r.application_id)), ...tasks.map((r) => r.application_id).filter(Boolean).map(String)])];
  const appById = new Map<string, Row>();
  if (wantedApps.length) {
    const lookup = await owned('applications', 'id, company_name, role_title').in('id', wantedApps);
    if (lookup.error) return bad('READ_FAILED', 'JobQuest data could not be read');
    for (const r of rowsOf(lookup)) appById.set(String(r.id), r);
  }

  // ---- recruiters (related-lead resolution reuses the AI-6 resolver; contact fields never reach the digest) ----
  const recruiterRaw = rowsOf(recruiterRows);
  const recruiters = recruiterRaw.map(toRecruiterIntel);
  if (!(await attachRelatedLeads(db, ws, recruiterRaw, recruiters))) return bad('READ_FAILED', 'JobQuest data could not be read');

  const leads = rowsOf(leadRows).map(toJobLead);
  const dateOfInstant = (iso: string) => digestDateInZone(new Date(iso), timeZone);

  const input: ComposeInput = {
    digestDate, timeZone, generatedAt: (deps.now?.() ?? new Date()).toISOString(),
    dayStart: day.start, dayEnd: day.end, upcomingEnd, emailWindowStart: emailStart,
    health: { email: health(runEmail), calendar: health(runCalendar), jobs: health(runJobs), recruiters: health(runRecruiters) },
    emails,
    emailCounts: { job: countOf(jobEmailCount), other: countOf(otherEmailCount), attention: countOf(attentionCount) },
    calendar: rowsOf(calRows).map(toCalendarEvent),
    calendarCount: countOf(calCount),
    interviews: interviews.map((r) => {
      const app = appById.get(String(r.application_id));
      return {
        id: String(r.id), applicationId: String(r.application_id), label: app ? appLabel(app) : 'Interview', company: app ? String(app.company_name ?? '') : null,
        interviewType: r.interview_type ? String(r.interview_type) : null, scheduledAt: String(r.scheduled_at),
      };
    }),
    interviewCount: countOf(interviewCount),
    followUps: [
      ...rowsOf(appFollowRows).map((r) => ({
        kind: 'application' as const, id: String(r.id), applicationId: String(r.id), label: appLabel(r), company: String(r.company_name ?? ''),
        action: r.next_action ? String(r.next_action) : null, dueDate: String(r.next_action_date), priority: null,
      })),
      ...tasks.map((r) => {
        const app = r.application_id ? appById.get(String(r.application_id)) : undefined;
        const due = r.due_date ? String(r.due_date) : r.due_at ? dateOfInstant(String(r.due_at)) : null;
        return {
          kind: 'task' as const, id: String(r.id), applicationId: r.application_id ? String(r.application_id) : null, label: String(r.title ?? 'Task'),
          company: app ? String(app.company_name ?? '') : null, action: null, dueDate: due, priority: r.priority ? String(r.priority) : null,
        };
      }),
    ],
    followUpCount: countOf(appFollowCount) + countOf(taskCount),
    leads,
    leadCount: countOf(leadCount),
    recruiters,
    recruiterCount: countOf(recruiterCount),
    trackedCompanies: [...rowsOf(openApps).map((r) => String(r.company_name ?? '')), ...leads.map((l) => l.company)],
  };

  const { payload } = composeDailyDigest(input);
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
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
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
      summary: `${plural(sum.needs_attention ?? 0, 'item needs', 'items need')} attention, ${plural(sum.job_emails ?? 0, 'job email', 'job emails')}, ${sum.upcoming ?? 0} upcoming, ${plural(sum.recent_jobs ?? 0, 'recent job', 'recent jobs')}`,
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
