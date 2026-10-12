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
  AI_CONTRACT_NAME, AI_CONTRACT_VERSION, DIGEST_LIMITS, DIGEST_PAYLOAD_VERSION,
  type JsonRecord,
} from '../lib/aiContract';
import { isCalendarDate, nextCalendarDate, shiftCalendarDate } from '../lib/calendarDate';
import type { AiReadClient } from './aiReadService';
import { ingestAiResult, type AiIngestResult, type AiIntegrationDeps } from './aiIntegrationService';

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

/**
 * Computes the facts JobQuest owns for `digestDate`. Sources JobQuest does not have yet
 * (job discovery, email, recruiter intelligence) are reported `not_configured`, never as
 * zero. Nothing is fabricated: every count comes from a query below.
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

  const addedCount = added.count ?? 0;
  const dueCount = due.count ?? 0;
  const pendingCount = pending.count ?? 0;
  const upcomingCount = upcoming.length;

  const section = (count: number, items: JsonRecord[]): JsonRecord =>
    count > 0 || items.length > 0 ? { status: 'available', count: Math.max(count, items.length), items } : { status: 'zero', count: 0, items: [] };
  const NOT_CONFIGURED: JsonRecord = { status: 'not_configured', items: [] };

  const appItems: JsonRecord[] = ((addedRows.data ?? []) as Row[]).map((r) => ({
    title: appTitle(r), detail: `Added to JobQuest (${text(r.stage, 32).toLowerCase().replace(/_/g, ' ')})`, source: 'jobquest', occurred_at: new Date(String(r.created_at)).toISOString(),
  }));
  const dueItems: JsonRecord[] = ((dueRows.data ?? []) as Row[]).map((r) => ({
    title: appTitle(r),
    detail: text(`${r.next_action ? `${text(r.next_action, 120)} · ` : ''}due ${String(r.next_action_date)}`, DIGEST_LIMITS.itemDetail),
    source: 'jobquest', priority: String(r.next_action_date) < digestDate ? 'HIGH' : 'NORMAL',
  }));
  const upcomingItems: JsonRecord[] = upcoming.map((r) => ({
    title: text(`${titleById.get(String(r.application_id)) ?? 'Interview'}`, DIGEST_LIMITS.itemTitle),
    detail: `${text(r.interview_type, 32).toLowerCase().replace(/_/g, ' ')} interview`, source: 'jobquest', occurred_at: new Date(String(r.scheduled_at)).toISOString(),
  }));
  const suggestionItems: JsonRecord[] = ((pendingRows.data ?? []) as Row[]).map((r) => ({
    title: `${ACTION_LABEL[String(r.action)] ?? 'Suggestion'} awaiting your decision`,
    detail: r.target_type ? `Target: ${text(r.target_type, 32).replace(/_/g, ' ')}` : undefined, source: 'provider',
  })).map((i) => (i.detail === undefined ? { title: i.title, source: i.source } : i)) as JsonRecord[];

  const priorities: JsonRecord[] = [
    ...dueItems.filter((i) => i.priority === 'HIGH').slice(0, 3).map((i) => ({ title: `Follow up: ${i.title}`, detail: i.detail, priority: 'HIGH', source: 'jobquest' })),
    ...(pendingCount > 0 ? [{ title: `${pendingCount} AI suggestion${pendingCount === 1 ? '' : 's'} awaiting your decision`, priority: 'NORMAL', source: 'jobquest' }] : []),
  ].slice(0, DIGEST_LIMITS.priorities) as JsonRecord[];

  const payload: JsonRecord = {
    version: DIGEST_PAYLOAD_VERSION,
    digest_date: digestDate,
    time_zone: timeZone,
    generated_at: (deps.now?.() ?? new Date()).toISOString(),
    // Only facts JobQuest owns are summarized; email/job/recruiter counts are deliberately absent.
    summary: {
      applications_added: addedCount, active_applications: active.count ?? 0, follow_ups: dueCount,
      interviews: interviewsToday.count ?? 0, pending_suggestions: pendingCount, new_findings: newFindings.count ?? 0,
    },
    priorities,
    sections: {
      applications: section(addedCount, appItems),
      job_leads: NOT_CONFIGURED,
      email_activity: NOT_CONFIGURED,
      recruiter_intel: NOT_CONFIGURED,
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
