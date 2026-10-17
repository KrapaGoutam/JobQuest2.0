// AI-11H: Weekly Digest (read-only, computed).
//
// SEMANTICS (decided and documented, see reports/AI-11H):
//   * Week      the owner's calendar week in their PROFILE time zone, starting on their profile week-start day (Monday unless they chose
//               Sunday; the same two settings Analytics and Goals use). Never the server's UTC week.
//   * Window    [local midnight of the first day, local midnight of the next first day) as UTC instants (DST-safe: 23/25-hour days work).
//   * Lookback  one week per request, 0..26 weeks back. A running week is reported to date; it is flagged `inProgress`.
//   * Storage   NONE. A Weekly Digest is not an ai_findings row and has no table: it is rebuilt from timestamped records on every request,
//               so regenerating is simply reloading, is idempotent and deterministic for a given set of records, and can never diverge
//               from the system of record. The Daily Digest stays the immutable per-day snapshot (AI-11C); a week is derived, so a
//               completed week changes only if its source records are later edited or deleted (and items dismissed later stop counting).
//   * Sources   applications / application_events / interviews / tasks / goals (core records, read as the caller under RLS and scoped to
//               the owner's own rows) and the AI Hub's stored email / job-lead / recruiter findings and automation runs. Nothing is
//               searched, nothing is called, nothing is mutated and no raw email, calendar payload or secret is read.
//   * Health    zero vs unavailable: an AI source whose latest run FAILED (or searched nothing) reports `unavailable`; one that never ran
//               reports `not_configured`; one that ran and found nothing reports `zero` (the same rule as the Daily Digest).
import { userClient } from '../lib/db';
import { isAiHubServerEnabled } from '../lib/aiHubConfig';
import {
  EMAIL_ATTENTION_OR, STRONG_MATCH_THRESHOLD, WEEKLY_MAX_WEEKS_BACK, composeWeeklyDigest, emailGroupCategories, isWeekStart, summarizeAutomationRuns, toWeekStartDay,
  weekEndOf, weekStartOf, weeksBetween, type AnalyticsRun, type SourceHealth, type WeekStartDay, type WeeklyDigest, type WeeklyInput,
} from '../lib/aiContract';
import { isCalendarDate, shiftCalendarDate } from '../lib/calendarDate';
import { DEFAULT_DIGEST_TIME_ZONE, SOURCE_WORKFLOWS, digestDateInZone, isValidTimeZone, localDayWindow, sourceHealthOfRun } from './aiDigestService';
import { EMAIL_COLUMNS, LEAD_COLUMNS, RECRUITER_COLUMNS, toEmailEvent, toJobLead, toRecruiterIntel } from './aiExternalIntelligenceService';
import { listAutomations } from './aiAutomationService';
import { attributeRun, getAutomationInsights } from './aiAutomationInsightsService';

export interface WeeklyContext { workspaceId: string; userId: string; accessToken?: string }
export type WeeklyClient = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }; // eslint-disable-line @typescript-eslint/no-explicit-any
export interface WeeklyDeps { client?: WeeklyClient; env?: Record<string, string | undefined>; now?: () => Date; insights?: typeof getAutomationInsights }
export type WeeklyErrorCode = 'AI_HUB_DISABLED' | 'INVALID_CONTEXT' | 'INVALID_WEEK' | 'WORKSPACE_ACCESS_DENIED' | 'READ_FAILED';
export type WeeklyResult = { ok: true; data: WeeklyDigest } | { ok: false; error: { code: WeeklyErrorCode; message: string } };
const bad = (code: WeeklyErrorCode, message: string): WeeklyResult => ({ ok: false, error: { code, message } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Row = Record<string, unknown>;
const rowsOf = (r: { data?: unknown }): Row[] => (Array.isArray(r.data) ? (r.data as Row[]) : []);
const countOf = (r: { count?: number | null }): number => r.count ?? 0;
/** Findings the owner still treats as real (dismissed / superseded / expired ones no longer count). */
const VISIBLE = ['NEW', 'REVIEWED', 'ACCEPTED'];
const SCAN = { stageEvents: 300, emails: 40, leads: 12, recruiters: 100, items: 6, runs: 300 } as const;
const label = (r: Row | undefined): string => (r ? `${String(r.company_name ?? '').trim()} — ${String(r.role_title ?? '').trim()}` : 'Application');

export interface WeekRequest { weekStart?: string }

/** The owner's current week and the bounds a request may use. Pure. */
export function resolveWeek(now: Date, timeZone: string, startDay: WeekStartDay, requested?: string): { ok: true; weekStart: string; currentWeekStart: string } | { ok: false; message: string } {
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_DIGEST_TIME_ZONE;
  const currentWeekStart = weekStartOf(digestDateInZone(now, zone), startDay);
  if (requested === undefined) return { ok: true, weekStart: currentWeekStart, currentWeekStart };
  if (!isCalendarDate(requested) || !isWeekStart(requested, startDay)) return { ok: false, message: 'week_start must be the first day of one of your weeks.' };
  const back = weeksBetween(requested, currentWeekStart);
  if (back < 0) return { ok: false, message: 'That week has not started yet.' };
  if (back > WEEKLY_MAX_WEEKS_BACK) return { ok: false, message: `Weeks older than ${WEEKLY_MAX_WEEKS_BACK} weeks are not available.` };
  return { ok: true, weekStart: requested, currentWeekStart };
}

export async function buildWeeklyDigest(ctx: WeeklyContext, req: WeekRequest = {}, deps: WeeklyDeps = {}): Promise<WeeklyResult> {
  if (!isAiHubServerEnabled(deps.env)) return bad('AI_HUB_DISABLED', 'AI Hub is disabled on this server');
  if (!UUID.test(ctx?.workspaceId ?? '') || !UUID.test(ctx?.userId ?? '')) return bad('INVALID_CONTEXT', 'Invalid digest context');
  if (!deps.client && (typeof ctx.accessToken !== 'string' || ctx.accessToken.length < 20)) return bad('INVALID_CONTEXT', 'Invalid digest context');
  const db = (deps.client ?? (userClient(ctx.accessToken!) as unknown as WeeklyClient));
  const ws = ctx.workspaceId.toLowerCase();
  const me = ctx.userId.toLowerCase();
  const now = (deps.now ?? (() => new Date()))();

  // Reads below are RLS-scoped (a non-member would just see nothing); say so explicitly instead of returning a misleading "quiet week".
  const member = await db.from('workspace_members').select('user_id').eq('workspace_id', ws).eq('user_id', me).eq('status', 'ACTIVE').maybeSingle();
  if (member.error) return bad('READ_FAILED', 'JobQuest data could not be read');
  if (!member.data) return bad('WORKSPACE_ACCESS_DENIED', 'Workspace access denied');

  const profile = await db.from('profiles').select('timezone, week_start').eq('user_id', me).maybeSingle();
  const timeZone = isValidTimeZone(profile?.data?.timezone) ? (profile.data.timezone as string) : DEFAULT_DIGEST_TIME_ZONE;
  const startDay = toWeekStartDay(profile?.data?.week_start);
  const week = resolveWeek(now, timeZone, startDay, req.weekStart);
  if (!week.ok) return bad('INVALID_WEEK', week.message);
  const { weekStart, currentWeekStart } = week;
  const weekEndDate = weekEndOf(weekStart);
  const win = { start: localDayWindow(weekStart, timeZone).start, end: localDayWindow(shiftCalendarDate(weekStart, 7), timeZone).start };
  const today = digestDateInZone(now, timeZone);
  const includeAttention = weeksBetween(weekStart, currentWeekStart) <= 1;
  const includeAutomationNow = weekStart === currentWeekStart;
  const nowIso = now.toISOString();
  const horizonIso = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const horizonDate = digestDateInZone(new Date(now.getTime() + 7 * 86_400_000), timeZone);
  const emailFrom = new Date(now.getTime() - 14 * 86_400_000).toISOString();

  const owned = (table: string, cols: string, head = false) => {
    const q = head ? db.from(table).select(cols, { count: 'exact', head: true }) : db.from(table).select(cols);
    return q.eq('workspace_id', ws).eq('user_id', me);
  };
  const emailIn = (cols: string, head = false) =>
    owned('ai_findings', cols, head).eq('kind', 'email_event').in('status', VISIBLE).gte('occurred_at', win.start).lt('occurred_at', win.end);
  const leadIn = (cols: string, head = false) =>
    owned('ai_job_leads', head ? 'id, finding:ai_findings!inner(status)' : cols, head).in('finding.status', VISIBLE).gte('discovered_at', win.start).lt('discovered_at', win.end);
  const recruiterIn = (cols: string, head = false) =>
    owned('ai_findings', cols, head).eq('kind', 'recruiter_intel').in('status', VISIBLE).gte('created_at', win.start).lt('created_at', win.end);
  const latestRun = (workflow: string) =>
    db.from('ai_runs').select('status, sources').eq('workspace_id', ws).eq('user_id', me).eq('workflow', workflow).in('status', ['SUCCEEDED', 'PARTIAL', 'FAILED'])
      .order('created_at', { ascending: false }).limit(1);
  const openDue = (cols: string, head = false) =>
    owned('tasks', cols, head).eq('status', 'PENDING').or(`and(due_date.gte.${weekStart},due_date.lte.${weekEndDate}),and(due_at.gte.${win.start},due_at.lt.${win.end})`);
  const dueSoonTasks = (cols: string, head = false) =>
    owned('tasks', cols, head).eq('status', 'PENDING').or(`due_date.lte.${horizonDate},due_at.lt.${horizonIso}`);
  const followUps = (cols: string, head = false) =>
    owned('applications', cols, head).is('archived_at', null).eq('status', 'OPEN').not('next_action_date', 'is', null).lte('next_action_date', horizonDate);

  const [
    appRows, appCount, eventRows, ivRows, ivCount,
    jobEmailRows, jobEmailCount, otherEmailCount, needsActionCount, highCount,
    leadRows, leadCount, strongCount, recruiterRows, recruiterCount,
    doneCount, dueRows, dueCount, goalRes, runRows,
    runEmail, runJobs, runRecruiters,
    aivRows, aivCount, atTaskRows, atTaskCount, overdueCount, fuRows, fuCount, attnEmailCount,
  ] = await Promise.all([
    owned('applications', 'id, company_name, role_title, stage, applied_at').gte('applied_at', win.start).lt('applied_at', win.end).order('applied_at', { ascending: false }).limit(SCAN.items),
    owned('applications', 'id', true).gte('applied_at', win.start).lt('applied_at', win.end),
    db.from('application_events').select('application_id, event_type, payload, created_at').eq('workspace_id', ws).in('event_type', ['STAGE_CHANGED', 'OUTCOME_CHANGED'])
      .gte('created_at', win.start).lt('created_at', win.end).order('created_at', { ascending: false }).limit(SCAN.stageEvents + 1),
    owned('interviews', 'id, application_id, interview_type, scheduled_at').gte('scheduled_at', win.start).lt('scheduled_at', win.end).order('scheduled_at', { ascending: false }).limit(SCAN.items),
    owned('interviews', 'id', true).gte('scheduled_at', win.start).lt('scheduled_at', win.end),
    emailIn(EMAIL_COLUMNS).in('category', emailGroupCategories('job_related')).order('occurred_at', { ascending: false }).limit(SCAN.emails),
    emailIn('id', true).in('category', emailGroupCategories('job_related')),
    emailIn('id', true).in('category', emailGroupCategories('other')),
    emailIn('id', true).in('category', emailGroupCategories('job_related')).eq('status', 'NEW').or(EMAIL_ATTENTION_OR),
    emailIn('id', true).in('category', emailGroupCategories('job_related')).in('priority', ['HIGH', 'CRITICAL']),
    leadIn(LEAD_COLUMNS).order('match_score', { ascending: false, nullsFirst: false }).order('discovered_at', { ascending: false }).limit(SCAN.leads),
    leadIn('id', true),
    leadIn('id', true).gte('match_score', STRONG_MATCH_THRESHOLD),
    recruiterIn(RECRUITER_COLUMNS).order('created_at', { ascending: false }).limit(SCAN.recruiters),
    recruiterIn('id', true),
    owned('tasks', 'id', true).eq('status', 'COMPLETED').gte('completed_at', win.start).lt('completed_at', win.end),
    openDue('id, title, due_date, due_at').order('due_date', { ascending: true, nullsFirst: false }).order('id', { ascending: true }).limit(SCAN.items),
    openDue('id', true),
    db.rpc('rpc_get_goal_progress', { p_workspace_id: ws, p_user_id: me, p_period_count: 36 }),
    owned('ai_runs', 'id, automation_id, provider, workflow, status, trigger_type, created_at, started_at, completed_at, error_category, sources, external_run_id').gte('created_at', win.start).lt('created_at', win.end)
      .order('created_at', { ascending: false }).limit(SCAN.runs),
    latestRun(SOURCE_WORKFLOWS.email), latestRun(SOURCE_WORKFLOWS.jobs), latestRun(SOURCE_WORKFLOWS.recruiters),
    includeAttention ? owned('interviews', 'id, application_id, scheduled_at').is('outcome', null).gte('scheduled_at', nowIso).lt('scheduled_at', horizonIso).order('scheduled_at', { ascending: true }).limit(4) : Promise.resolve({ data: [] }),
    includeAttention ? owned('interviews', 'id', true).is('outcome', null).gte('scheduled_at', nowIso).lt('scheduled_at', horizonIso) : Promise.resolve({ count: 0 }),
    includeAttention ? dueSoonTasks('id, title, due_date, due_at').order('due_date', { ascending: true, nullsFirst: false }).order('id', { ascending: true }).limit(4) : Promise.resolve({ data: [] }),
    includeAttention ? dueSoonTasks('id', true) : Promise.resolve({ count: 0 }),
    includeAttention ? owned('tasks', 'id', true).eq('status', 'PENDING').or(`due_date.lt.${today},due_at.lt.${nowIso}`) : Promise.resolve({ count: 0 }),
    includeAttention ? followUps('id, company_name, role_title, next_action_date').order('next_action_date', { ascending: true }).order('id', { ascending: true }).limit(3) : Promise.resolve({ data: [] }),
    includeAttention ? followUps('id', true) : Promise.resolve({ count: 0 }),
    includeAttention ? owned('ai_findings', 'id', true).eq('kind', 'email_event').eq('status', 'NEW').or(EMAIL_ATTENTION_OR).gte('occurred_at', emailFrom) : Promise.resolve({ count: 0 }),
  ]);
  // Every core/AI read must have worked; the goal engine is the one secondary source (reported as unavailable instead of failing the week).
  const required = [
    appRows, appCount, eventRows, ivRows, ivCount, jobEmailRows, jobEmailCount, otherEmailCount, needsActionCount, highCount, leadRows, leadCount, strongCount,
    recruiterRows, recruiterCount, doneCount, dueRows, dueCount, runRows, runEmail, runJobs, runRecruiters, aivRows, aivCount, atTaskRows, atTaskCount, overdueCount, fuRows, fuCount, attnEmailCount,
  ] as Array<{ error?: unknown }>;
  if (required.some((r) => r.error)) return bad('READ_FAILED', 'JobQuest data could not be read');

  // ---- application labels (one bounded lookup; ownership decides which stage events are the owner's) ----
  const events = rowsOf(eventRows);
  const truncated = events.length > SCAN.stageEvents;
  const wanted = [...new Set([
    ...events.slice(0, SCAN.stageEvents).map((e) => String(e.application_id)),
    ...rowsOf(ivRows).map((r) => String(r.application_id)),
    ...rowsOf(aivRows).map((r) => String(r.application_id)),
  ])];
  const appById = new Map<string, Row>();
  if (wanted.length) {
    const lookup = await owned('applications', 'id, company_name, role_title').in('id', wanted);
    if (lookup.error) return bad('READ_FAILED', 'JobQuest data could not be read');
    for (const r of rowsOf(lookup)) appById.set(String(r.id), r);
  }
  const mine = events.slice(0, SCAN.stageEvents).filter((e) => appById.has(String(e.application_id)));
  const stageEvents = mine.filter((e) => e.event_type === 'STAGE_CHANGED');
  const payloadOf = (e: Row): Row => (e.payload && typeof e.payload === 'object' ? (e.payload as Row) : {});

  // ---- emails / leads / recruiters through the same read mappers as the hubs ----
  const urgencyRank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const emails = rowsOf(jobEmailRows).map(toEmailEvent).sort((a, b) => (urgencyRank[a.urgency] ?? 3) - (urgencyRank[b.urgency] ?? 3) || String(b.receivedAt).localeCompare(String(a.receivedAt)));
  const leads = rowsOf(leadRows).map(toJobLead);
  const recruiters = rowsOf(recruiterRows).map(toRecruiterIntel);

  // ---- weekly goals measured by the Goals engine for exactly this week ----
  let goals: WeeklyInput['goals'] = null;
  if (!goalRes.error && goalRes.data && typeof goalRes.data === 'object') {
    const history = Array.isArray((goalRes.data as { history?: unknown }).history) ? ((goalRes.data as { history: Row[] }).history) : [];
    goals = history.filter((h) => h.period_type === 'WEEKLY' && String(h.period_start).slice(0, 10) === weekStart)
      .map((h) => ({ type: String(h.goal_type), target: Number(h.target_value), actual: Number(h.actual) }))
      .filter((g) => Number.isFinite(g.target) && Number.isFinite(g.actual));
  }

  // ---- automations: runs in the week (derived) + current health (current week only) ----
  const listed = await listAutomations({ workspaceId: ws, userId: me, accessToken: ctx.accessToken ?? '' }, deps.client ? { reader: deps.client as never, aiHubEnabled: () => true, now: () => now } : { now: () => now });
  const automations = listed.ok ? listed.data : [];
  const runs: AnalyticsRun[] = [];
  for (const r of rowsOf(runRows)) {
    const id = attributeRun({ automation_id: (r.automation_id as string | null) ?? null, provider: String(r.provider), workflow: String(r.workflow), external_run_id: (r.external_run_id as string | null) ?? null }, automations);
    if (!id) continue;
    runs.push({
      id: String(r.id), automationId: id, provider: String(r.provider), workflow: String(r.workflow), status: String(r.status), trigger: String(r.trigger_type),
      createdAt: String(r.created_at), startedAt: (r.started_at as string | null) ?? null, completedAt: (r.completed_at as string | null) ?? null,
      errorCategory: (r.error_category as string | null) ?? null,
      sources: (Array.isArray(r.sources) ? r.sources : []).flatMap((s: { type?: unknown; status?: unknown }) => (typeof s?.status === 'string' ? [{ type: String(s.type ?? 'source'), status: s.status }] : [])),
    });
  }
  const tally = summarizeAutomationRuns(runs, 7);
  let attentionNow: NonNullable<WeeklyInput['automations']['attention']> | null = null;
  if (includeAutomationNow && automations.length > 0) {
    const insights = await (deps.insights ?? getAutomationInsights)({ workspaceId: ws, userId: me, accessToken: ctx.accessToken ?? '' }, 30);
    if (insights.ok) {
      attentionNow = automations.flatMap((a) => {
        const h = insights.data.health[a.id];
        return h && h.interventionRequired ? [{ name: a.name, label: h.label, reason: h.reasons[0] ?? null }] : [];
      });
    }
  }

  const health = (r: { data?: unknown }): SourceHealth => sourceHealthOfRun(rowsOf(r)[0]);
  const dateOfInstant = (iso: string) => digestDateInZone(new Date(iso), timeZone);
  const dueOf = (r: Row): string | null => (r.due_date ? String(r.due_date) : r.due_at ? dateOfInstant(String(r.due_at)) : null);

  const input: WeeklyInput = {
    weekStart, currentWeekStart, timeZone, windowStart: win.start, windowEnd: win.end, now, includeAttention, includeAutomationNow,
    applications: {
      added: countOf(appCount),
      items: rowsOf(appRows).map((r) => ({ label: label(r), stage: r.stage ? String(r.stage) : null, at: String(r.applied_at) })),
    },
    stage: {
      changes: stageEvents.length, outcomes: mine.length - stageEvents.length, truncated,
      items: mine.slice(0, SCAN.items).map((e) => {
        const p = payloadOf(e);
        const outcome = e.event_type === 'OUTCOME_CHANGED';
        return {
          label: label(appById.get(String(e.application_id))),
          from: outcome ? (p.old_outcome ? String(p.old_outcome) : null) : (p.from_stage ?? p.old_stage) ? String(p.from_stage ?? p.old_stage) : null,
          to: outcome ? (p.new_outcome ? String(p.new_outcome) : 'outcome recorded') : (p.to_stage ?? p.new_stage) ? String(p.to_stage ?? p.new_stage) : null,
          at: String(e.created_at),
        };
      }),
    },
    interviews: {
      count: countOf(ivCount),
      items: rowsOf(ivRows).map((r) => ({ label: label(appById.get(String(r.application_id))), type: r.interview_type ? String(r.interview_type) : null, at: String(r.scheduled_at) })),
    },
    email: {
      health: health(runEmail), job: countOf(jobEmailCount), other: countOf(otherEmailCount), needsAction: countOf(needsActionCount), high: countOf(highCount),
      items: emails.map((e) => ({ title: `${e.company ?? e.senderName ?? 'Email'}: ${e.subject ?? e.title}`, urgency: e.urgency, action: e.nextStep, at: e.receivedAt })),
    },
    leads: {
      health: health(runJobs), count: countOf(leadCount), strong: countOf(strongCount),
      items: leads.map((l) => ({ title: `${l.company} — ${l.title}`, score: l.matchScore, location: l.location, at: l.discoveredAt })),
    },
    recruiters: {
      health: health(runRecruiters), count: countOf(recruiterCount), verified: recruiters.filter((r) => r.verification === 'verified').length,
      items: recruiters.map((r) => ({ title: `${r.name} — ${r.company}`, relationship: r.relationship, verified: r.verification === 'verified', at: r.discoveredAt })),
    },
    tasks: { completed: countOf(doneCount), openDue: countOf(dueCount), items: rowsOf(dueRows).map((r) => ({ title: String(r.title ?? 'Task'), due: dueOf(r) })) },
    goals,
    automations: {
      configured: automations.length,
      runs: {
        total: tally.totalRuns, succeeded: tally.succeeded, partial: tally.partial, failed: tally.failed,
        scheduled: tally.byTrigger.scheduled, manual: tally.byTrigger.manual, retry: tally.byTrigger.retry, sourceProblems: tally.sourceProblems.total,
      },
      attention: attentionNow,
    },
    attention: {
      interviews: rowsOf(aivRows).map((r) => ({ label: label(appById.get(String(r.application_id))), at: String(r.scheduled_at) })),
      interviewCount: countOf(aivCount),
      tasks: rowsOf(atTaskRows).map((r) => { const due = dueOf(r); return { title: String(r.title ?? 'Task'), due, overdue: due !== null && due < today }; }),
      taskCount: countOf(atTaskCount),
      overdueTasks: countOf(overdueCount),
      followUps: rowsOf(fuRows).map((r) => ({ label: label(r), due: String(r.next_action_date) })),
      followUpCount: countOf(fuCount),
      emailsNeedingAction: countOf(attnEmailCount),
    },
  };
  return { ok: true, data: composeWeeklyDigest(input) };
}
