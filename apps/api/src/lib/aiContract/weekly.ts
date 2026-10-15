// AI-11H: Weekly Digest (pure; no I/O, no model, no web).
//
// A computed, deterministic report of ONE owner-local calendar week (first day of the week 00:00 .. the next first day 00:00 in the owner's
// profile time zone; the first day is the owner's profile week-start setting, Monday by default). It summarises EXISTING JobQuest records only (applications, application events, interviews, tasks, goals, and the AI Hub's
// stored email / job-lead / recruiter intelligence and automation runs). Nothing is invented: every number comes from a query the
// service ran, and a source that could not be read is reported as `unavailable`, never as zero.
//
// It is NOT a stored snapshot (see aiWeeklyDigestService for the full semantics): a Weekly Digest is regenerated on every request from
// timestamped records. The Daily Digest remains the immutable per-day snapshot; the two are deliberately different.
import { shiftCalendarDate } from '../calendarDate';
import type { SourceHealth } from './digestComposer';

export const WEEKLY_DIGEST_VERSION = '1.0' as const;
/** How far back a week may be requested (bounded so a request is always a bounded read). */
export const WEEKLY_MAX_WEEKS_BACK = 26;
export const WEEKLY_SECTION_KEYS = [
  'at_a_glance', 'applications', 'interviews', 'job_email', 'job_leads', 'recruiters', 'tasks', 'goals', 'automation_health', 'attention_next',
] as const;
export type WeeklySectionKey = (typeof WEEKLY_SECTION_KEYS)[number];
/** available = data found; zero = the source is operational and found nothing; unavailable = its latest run failed (could not be checked); not_configured = never ran / nothing set up. */
export type WeeklySectionStatus = 'available' | 'zero' | 'not_configured' | 'unavailable';

export const WEEKLY_ITEM_LIMIT = 6;
const TITLE_MAX = 160;
const DETAIL_MAX = 200;

export interface WeeklyItem { title: string; detail: string | null; at: string | null }
export interface WeeklyMetric { label: string; value: string }
export interface WeeklySection {
  key: WeeklySectionKey;
  title: string;
  status: WeeklySectionStatus;
  /** Records behind the section (null when it could not be determined). */
  count: number | null;
  headline: string;
  metrics: WeeklyMetric[];
  items: WeeklyItem[];
}
export interface WeeklyDigest {
  version: typeof WEEKLY_DIGEST_VERSION;
  kind: 'weekly_digest';
  /** First day of the week (owner's week-start setting), owner-local calendar date. */
  weekStart: string;
  /** The owner's CURRENT week and the oldest week that can be requested (navigation bounds). */
  currentWeekStart: string;
  oldestWeekStart: string;
  /** Last day of the week (inclusive), owner-local calendar date. */
  weekEnd: string;
  timeZone: string;
  /** [windowStart, windowEnd): local midnight to local midnight, as UTC instants. */
  windowStart: string;
  windowEnd: string;
  /** The week is still running: figures are to date and will change. */
  inProgress: boolean;
  /** The instant the report is complete up to (now for a running week, windowEnd otherwise). */
  throughAt: string;
  generatedAt: string;
  sections: WeeklySection[];
  /** Plain statements about how to read this report. */
  notes: string[];
}

// ---- week boundaries (owner-local calendar dates) -----------------------------------------------------------------------------------

const dow = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
/** The owner's first day of the week: profiles.week_start, 1 = Monday (default) or 0 = Sunday - the same setting Analytics and Goals use. */
export type WeekStartDay = 0 | 1;
export const toWeekStartDay = (v: unknown): WeekStartDay => (v === 0 ? 0 : 1);
export const isWeekStart = (date: string, startDay: WeekStartDay = 1): boolean => dow(date) === startDay;
export function weekStartOf(date: string, startDay: WeekStartDay = 1): string {
  return shiftCalendarDate(date, -((dow(date) - startDay + 7) % 7));
}
export const weekEndOf = (weekStart: string): string => shiftCalendarDate(weekStart, 6);
/** Whole weeks from `from` to `to` (both Mondays); positive when `to` is later. */
export const weeksBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (7 * 86_400_000));

// ---- input -------------------------------------------------------------------------------------------------------------------------

export interface WeeklyInput {
  weekStart: string;
  currentWeekStart: string;
  timeZone: string;
  windowStart: string;
  windowEnd: string;
  now: Date;
  /** Whether the "attention next" section applies (current or most recent completed week). */
  includeAttention: boolean;
  /** Include the current automation health (only meaningful as of now). */
  includeAutomationNow: boolean;
  applications: { added: number; items: Array<{ label: string; stage: string | null; at: string }> };
  stage: { changes: number; outcomes: number; items: Array<{ label: string; from: string | null; to: string | null; at: string }>; truncated: boolean };
  interviews: { count: number; items: Array<{ label: string; type: string | null; at: string }> };
  email: { health: SourceHealth; job: number; other: number; needsAction: number; high: number; items: Array<{ title: string; urgency: string; action: string | null; at: string | null }> };
  leads: { health: SourceHealth; count: number; strong: number; items: Array<{ title: string; score: number | null; location: string | null; at: string }> };
  recruiters: { health: SourceHealth; count: number; verified: number; items: Array<{ title: string; relationship: string | null; verified: boolean; at: string }> };
  tasks: { completed: number; openDue: number; items: Array<{ title: string; due: string | null }> };
  /** Weekly goals measured for exactly this week by the Goals engine (rpc_get_goal_progress); null = the engine could not be read. */
  goals: Array<{ type: string; target: number; actual: number }> | null;
  automations: {
    configured: number;
    runs: { total: number; succeeded: number; partial: number; failed: number; scheduled: number; manual: number; retry: number; sourceProblems: number };
    /** As of now (only when includeAutomationNow). */
    attention: Array<{ name: string; label: string; reason: string | null }> | null;
  };
  attention: {
    interviews: Array<{ label: string; at: string }>;
    interviewCount: number;
    tasks: Array<{ title: string; due: string | null; overdue: boolean }>;
    taskCount: number;
    overdueTasks: number;
    followUps: Array<{ label: string; due: string }>;
    followUpCount: number;
    emailsNeedingAction: number;
  };
}

// ---- composition -------------------------------------------------------------------------------------------------------------------

const clip = (v: string, n: number) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const item = (title: string, detail: string | null = null, at: string | null = null): WeeklyItem => ({ title: clip(title, TITLE_MAX), detail: detail ? clip(detail, DETAIL_MAX) : null, at });
const emptyOf = (h: SourceHealth): WeeklySectionStatus => (h === 'failed' ? 'unavailable' : h === 'never' ? 'not_configured' : 'zero');
const statusOf = (count: number, h: SourceHealth = 'ok'): WeeklySectionStatus => (count > 0 ? 'available' : emptyOf(h));
const GOAL_LABELS: Record<string, string> = { APPLICATIONS: 'Applications', NETWORKING: 'Networking', FOLLOW_UPS: 'Follow-ups', INTERVIEW_PREP: 'Interview prep' };
const sourceNote = (h: SourceHealth, what: string): string | null =>
  (h === 'failed' ? `${what} could not be checked this week (the latest run failed), so this is unknown, not zero.` : h === 'never' ? `${what} has never run, so nothing was checked.` : null);

export function composeWeeklyDigest(i: WeeklyInput): WeeklyDigest {
  const inProgress = i.now.getTime() < Date.parse(i.windowEnd);
  const weekEnd = weekEndOf(i.weekStart);
  const sections: WeeklySection[] = [];

  // 2. Applications
  const apps = i.applications;
  const appSection: WeeklySection = {
    key: 'applications', title: 'Applications', status: apps.added > 0 ? 'available' : 'zero', count: apps.added,
    headline: apps.added > 0 ? `${plural(apps.added, 'application', 'applications')} submitted.` : 'No applications were submitted this week.',
    metrics: [{ label: 'Applications submitted', value: String(apps.added) }],
    items: apps.items.slice(0, WEEKLY_ITEM_LIMIT).map((a) => item(a.label, a.stage ? `Stage: ${a.stage}` : null, a.at)),
  };

  // 3. Interviews / stage movement
  const iv = i.interviews;
  const st = i.stage;
  const ivCount = iv.count + st.changes;
  const ivItems: WeeklyItem[] = [
    ...iv.items.slice(0, 4).map((x) => item(`Interview: ${x.label}`, x.type ? x.type.replace(/_/g, ' ').toLowerCase() : null, x.at)),
    ...st.items.slice(0, WEEKLY_ITEM_LIMIT - Math.min(iv.items.length, 4)).map((x) => item(x.label, x.from && x.to ? `${x.from} → ${x.to}` : x.to ? `Moved to ${x.to}` : 'Stage changed', x.at)),
  ].slice(0, WEEKLY_ITEM_LIMIT);
  const interviewSection: WeeklySection = {
    key: 'interviews', title: 'Interviews and stage movement', status: ivCount > 0 ? 'available' : 'zero', count: ivCount,
    headline: ivCount > 0 ? `${plural(iv.count, 'interview', 'interviews')} and ${plural(st.changes, 'stage change', 'stage changes')}${st.outcomes ? `, ${plural(st.outcomes, 'outcome', 'outcomes')} recorded` : ''}.` : 'No interviews or stage changes this week.',
    metrics: [
      { label: 'Interviews', value: String(iv.count) },
      { label: 'Stage changes', value: `${st.truncated ? 'at least ' : ''}${st.changes}` },
      { label: 'Outcomes recorded', value: String(st.outcomes) },
    ],
    items: ivItems,
  };

  // 4. Job-related email
  const em = i.email;
  const emailTotal = em.job + em.other;
  const emailSection: WeeklySection = {
    key: 'job_email', title: 'Job-related email', status: statusOf(em.job, em.health), count: em.health === 'failed' ? null : em.job,
    headline: em.job > 0 ? `${plural(em.job, 'job-related email', 'job-related emails')}${em.other ? ` (plus ${em.other} other)` : ''}; ${em.needsAction} still need${em.needsAction === 1 ? 's' : ''} action.`
      : (sourceNote(em.health, 'Email triage') ?? (emailTotal > 0 ? `No job-related email; ${em.other} other.` : 'No job-related email was recorded this week.')),
    metrics: em.health === 'failed' ? [] : [
      { label: 'Job-related', value: String(em.job) }, { label: 'Other important', value: String(em.other) },
      { label: 'Still need action', value: String(em.needsAction) }, { label: 'High urgency', value: String(em.high) },
    ],
    items: em.items.slice(0, WEEKLY_ITEM_LIMIT).map((e) => item(e.title, `${e.urgency.toLowerCase()} urgency${e.action ? ` · ${e.action}` : ''}`, e.at)),
  };

  // 5. Fresh job leads
  const ld = i.leads;
  const leadSection: WeeklySection = {
    key: 'job_leads', title: 'Fresh job leads', status: statusOf(ld.count, ld.health), count: ld.health === 'failed' ? null : ld.count,
    headline: ld.count > 0 ? `${plural(ld.count, 'new job lead', 'new job leads')}, ${ld.strong} strong.` : (sourceNote(ld.health, 'Job discovery') ?? 'No new job leads this week.'),
    metrics: ld.health === 'failed' ? [] : [{ label: 'New leads', value: String(ld.count) }, { label: 'Strong matches', value: String(ld.strong) }],
    items: ld.items.slice(0, WEEKLY_ITEM_LIMIT).map((l) => item(l.title, [l.score !== null ? `Match ${l.score}` : null, l.location].filter(Boolean).join(' · ') || null, l.at)),
  };

  // 6. Recruiter intelligence
  const rc = i.recruiters;
  const recruiterSection: WeeklySection = {
    key: 'recruiters', title: 'Recruiter intelligence', status: statusOf(rc.count, rc.health), count: rc.health === 'failed' ? null : rc.count,
    headline: rc.count > 0 ? `${plural(rc.count, 'recruiter contact', 'recruiter contacts')} found, ${rc.verified} verified.` : (sourceNote(rc.health, 'Recruiter intelligence') ?? 'No new recruiter contacts this week.'),
    metrics: rc.health === 'failed' ? [] : [{ label: 'New contacts found', value: String(rc.count) }, { label: 'Verified', value: String(rc.verified) }],
    items: rc.items.slice(0, WEEKLY_ITEM_LIMIT).map((r) => item(r.title, [r.relationship, r.verified ? 'verified' : 'uncertain'].filter(Boolean).join(' · '), r.at)),
  };

  // 7. Tasks / follow-ups
  const tk = i.tasks;
  const taskSection: WeeklySection = {
    key: 'tasks', title: 'Tasks and follow-ups', status: tk.completed + tk.openDue > 0 ? 'available' : 'zero', count: tk.completed + tk.openDue,
    headline: tk.completed + tk.openDue > 0 ? `${plural(tk.completed, 'task', 'tasks')} completed; ${tk.openDue} due this week ${tk.openDue === 1 ? 'is' : 'are'} still open.` : 'No tasks were completed or due this week.',
    metrics: [{ label: 'Completed', value: String(tk.completed) }, { label: 'Due this week, still open', value: String(tk.openDue) }],
    items: tk.items.slice(0, WEEKLY_ITEM_LIMIT).map((t) => item(t.title, t.due ? `Due ${t.due}` : null, null)),
  };

  // 8. Goal progress
  const goals = i.goals ?? [];
  const goalItems = goals.map((g) => {
    const label = GOAL_LABELS[g.type] ?? g.type;
    return item(`${label}: ${g.actual} of ${g.target}`, `${Math.min(999, Math.round((g.actual / Math.max(g.target, 1)) * 100))}% of the weekly target${g.actual >= g.target ? ' · met' : ''}`);
  });
  const goalSection: WeeklySection = {
    key: 'goals', title: 'Goal progress', status: i.goals === null ? 'unavailable' : goals.length === 0 ? 'not_configured' : 'available', count: i.goals === null ? null : goals.length,
    headline: i.goals === null ? 'Goal progress could not be read, so it is unknown rather than zero.'
      : goals.length === 0 ? 'No weekly goals were active this week. Add one in Analytics → Goals to track progress here.' : `${plural(goals.length, 'weekly goal', 'weekly goals')} measured for this week.`,
    metrics: [], items: goalItems.slice(0, WEEKLY_ITEM_LIMIT),
  };

  // 9. Automation health
  const au = i.automations;
  const r = au.runs;
  const attentionNow = au.attention ?? [];
  const autoSection: WeeklySection = {
    key: 'automation_health', title: 'Automation health',
    status: au.configured === 0 ? 'not_configured' : r.total > 0 ? 'available' : 'zero', count: r.total,
    headline: au.configured === 0 ? 'No automations are configured.'
      : r.total === 0 ? 'No automation ran this week.'
        : `${plural(r.total, 'automation run', 'automation runs')}: ${r.succeeded} succeeded${r.partial ? `, ${r.partial} partial` : ''}${r.failed ? `, ${r.failed} failed` : ''}.`,
    metrics: au.configured === 0 ? [] : [
      { label: 'Runs', value: String(r.total) }, { label: 'Succeeded', value: String(r.succeeded) }, { label: 'Partial', value: String(r.partial) }, { label: 'Failed', value: String(r.failed) },
      { label: 'Scheduled / manual / retry', value: `${r.scheduled} / ${r.manual} / ${r.retry}` }, { label: 'Source problems', value: String(r.sourceProblems) },
    ],
    items: attentionNow.slice(0, WEEKLY_ITEM_LIMIT).map((a) => item(`${a.name}: ${a.label}`, a.reason ? `${a.reason} (as of now)` : '(as of now)')),
  };

  // 10. Attention next
  const at = i.attention;
  const attentionTotal = at.interviewCount + at.taskCount + at.followUpCount + at.emailsNeedingAction;
  const attentionSection: WeeklySection | null = i.includeAttention ? {
    key: 'attention_next', title: 'Needs attention next', status: attentionTotal > 0 ? 'available' : 'zero', count: attentionTotal,
    headline: attentionTotal > 0 ? 'What is coming up in the next 7 days, plus what is overdue.' : 'Nothing is due or scheduled in the next 7 days.',
    metrics: [
      { label: 'Interviews', value: String(at.interviewCount) }, { label: 'Tasks due or overdue', value: String(at.taskCount) },
      { label: 'Application follow-ups due', value: String(at.followUpCount) }, { label: 'Emails needing action', value: String(at.emailsNeedingAction) },
    ],
    items: [
      ...at.interviews.map((x) => item(`Interview: ${x.label}`, null, x.at)),
      ...at.tasks.map((t) => item(t.title, t.overdue ? `Overdue${t.due ? ` since ${t.due}` : ''}` : t.due ? `Due ${t.due}` : null)),
      ...at.followUps.map((f) => item(f.label, `Follow up by ${f.due}`)),
    ].slice(0, WEEKLY_ITEM_LIMIT + 2),
  } : null;

  // 1. At a glance (last in construction, first in order)
  const unavailable = (h: SourceHealth, n: number): string => (h === 'failed' ? 'unavailable' : String(n));
  const glance: WeeklySection = {
    key: 'at_a_glance', title: 'Week at a glance', status: 'available', count: null,
    headline: '',
    metrics: [
      { label: 'Applications submitted', value: String(apps.added) },
      { label: 'Interviews', value: String(iv.count) },
      { label: 'Stage changes', value: `${st.truncated ? 'at least ' : ''}${st.changes}` },
      { label: 'Job-related emails', value: unavailable(em.health, em.job) },
      { label: 'New job leads', value: unavailable(ld.health, ld.count) },
      { label: 'Recruiter contacts', value: unavailable(rc.health, rc.count) },
      { label: 'Tasks completed', value: String(tk.completed) },
      { label: 'Automation runs', value: au.configured === 0 ? 'none configured' : String(r.total) },
    ],
    items: [],
  };
  const activity = apps.added + iv.count + st.changes + (em.health === 'failed' ? 0 : em.job) + (ld.health === 'failed' ? 0 : ld.count) + (rc.health === 'failed' ? 0 : rc.count) + tk.completed + r.total;
  const gaps = [em.health, ld.health, rc.health].filter((h) => h === 'failed').length;
  glance.status = activity > 0 ? 'available' : 'zero';
  glance.headline = activity > 0
    ? `${plural(apps.added, 'application', 'applications')}, ${plural(iv.count, 'interview', 'interviews')}, ${tk.completed} tasks completed${em.health === 'failed' ? '' : `, ${plural(em.job, 'job email', 'job emails')}`}${ld.health === 'failed' ? '' : `, ${plural(ld.count, 'new lead', 'new leads')}`}.${gaps ? ` ${plural(gaps, 'source', 'sources')} could not be checked.` : ''}`
    : `A quiet week: JobQuest recorded no activity.${gaps ? ` ${plural(gaps, 'source', 'sources')} could not be checked.` : ''}`;

  sections.push(glance, appSection, interviewSection, emailSection, leadSection, recruiterSection, taskSection, goalSection, autoSection);
  if (attentionSection) sections.push(attentionSection);

  const notes = [
    'Weeks follow your profile time zone and week-start setting (Monday unless you chose Sunday). A running week shows figures to date.',
    'This report is rebuilt from your records each time you open it; completed weeks stay the same unless records are changed or deleted afterwards. Items you dismiss later are not counted.',
    '“Unavailable” means the source could not be checked, which is different from zero.',
  ];
  if (i.includeAutomationNow) notes.push('Automation status marked “as of now” reflects the present, not the week shown.');

  return {
    version: WEEKLY_DIGEST_VERSION, kind: 'weekly_digest',
    weekStart: i.weekStart, currentWeekStart: i.currentWeekStart, oldestWeekStart: shiftCalendarDate(i.currentWeekStart, -7 * WEEKLY_MAX_WEEKS_BACK), weekEnd, timeZone: i.timeZone, windowStart: i.windowStart, windowEnd: i.windowEnd,
    inProgress, throughAt: inProgress ? i.now.toISOString() : i.windowEnd, generatedAt: i.now.toISOString(),
    sections, notes,
  };
}
