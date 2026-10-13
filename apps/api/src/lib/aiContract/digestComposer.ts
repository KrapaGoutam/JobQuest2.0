// AI-11C: the ONE Daily Digest composition algorithm. Pure and deterministic: no I/O, no clock (the caller passes
// the generation instant and the local-day window), no randomness, no model. Provider-specific code never composes;
// every provider reads and writes this same payload shape (1.1).
//
// The digest answers "what needs my attention today, what changed, what should I look at next?" from structured
// JobQuest records only. It never discovers new data: an empty source stays an honest empty section.
//
// Everything originating from email, job descriptions, recruiters, calendar titles or AI findings is DATA. It is
// clipped, whitespace-normalized and placed in plain string fields; nothing here (or in the UI, which renders React
// text nodes) ever interprets it as an instruction, and nothing here mutates any record.
import {
  DIGEST_BYTE_BUDGET, DIGEST_PAYLOAD_VERSION, DIGEST_SECTION_ITEM_LIMITS, type DigestSectionStatus,
} from './constants';
import type { JsonRecord } from './types';

// ---- inputs (structural subsets of the read-service DTOs) -----------------------------------------------------

export type SourceHealth = 'ok' | 'failed' | 'never';

export interface ComposeEmail {
  id: string;
  group: 'job_related' | 'other' | null;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  category: string | null;
  title: string;
  summary: string | null;
  nextStep: string | null;
  actionState: 'needs_action' | 'no_action' | null;
  company: string | null;
  deadline: string | null;
  receivedAt: string | null;
  /** The existing single definition of "needs attention" (AI-6/11B emailNeedsAttention). */
  needsAttention: boolean;
  /** Server-derived; only MATCHED with an application is authoritative. */
  applicationMatch: { state: string; application: { id: string; company: string; title: string } | null } | null;
}
export interface ComposeCalendar {
  id: string;
  category: string;
  status: 'scheduled' | 'tentative' | 'rescheduled' | 'cancelled' | string;
  allDay: boolean;
  startDate: string | null;
  sortAt: string;
  isDeadline: boolean;
  company: string | null;
  title: string;
  originalStartAt: string | null;
}
export interface ComposeInterview { id: string; applicationId: string; label: string; company: string | null; interviewType: string | null; scheduledAt: string }
export interface ComposeFollowUp {
  kind: 'application' | 'task';
  id: string;
  applicationId: string | null;
  label: string;
  company: string | null;
  action: string | null;
  /** Calendar date in the owner's zone (never shifted by UTC conversion). */
  dueDate: string | null;
  priority: string | null;
}
export interface ComposeLead {
  id: string; title: string; company: string; location: string | null; workArrangement: string | null; postedDate: string | null;
  matchScore: number | null; sourceUrl: string | null; requiredSkills: string[]; discoveredAt: string;
}
export interface ComposeRecruiter {
  id: string; name: string; roleTitle: string | null; company: string; relationship: string | null;
  verification: 'verified' | 'uncertain'; profileUrl: string | null; sourceUrl: string | null; discoveredAt: string;
  relatedLead: { id: string; company: string; title: string } | null;
}

export interface ComposeInput {
  digestDate: string;
  timeZone: string;
  generatedAt: string;
  /** [dayStart, dayEnd): the digest date as UTC instants in the owner's zone. */
  dayStart: string;
  dayEnd: string;
  /** Exclusive end of the "upcoming" horizon (start of the 8th local day: today + 7 days). */
  upcomingEnd: string;
  /** Start of the job/other email lookback window (the attention window may be longer). */
  emailWindowStart: string;
  /** Latest successful-or-failed run state per source workflow (from ai_runs). */
  health: { email: SourceHealth; calendar: SourceHealth; jobs: SourceHealth; recruiters: SourceHealth };
  emails: readonly ComposeEmail[];
  emailCounts: { job: number; other: number; attention: number };
  calendar: readonly ComposeCalendar[];
  calendarCount: number;
  interviews: readonly ComposeInterview[];
  interviewCount: number;
  followUps: readonly ComposeFollowUp[];
  followUpCount: number;
  leads: readonly ComposeLead[];
  leadCount: number;
  recruiters: readonly ComposeRecruiter[];
  recruiterCount: number;
  /** Companies the owner is working on (open applications, active leads): recruiter relevance. */
  trackedCompanies: readonly string[];
}

// ---- text helpers ------------------------------------------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F]/g;
/** Whitespace-normalized, control-character-free, code-point-bounded plain text. */
export function clip(v: unknown, max: number): string {
  const s = String(v ?? '').normalize('NFC').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  const cps = [...s];
  return cps.length > max ? `${cps.slice(0, max - 1).join('').trimEnd()}…` : s;
}
const normCompany = (v: unknown): string => String(v ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const label = (v: unknown): string => clip(v, 48).replace(/_/g, ' ');
const sentence = (v: string): string => (v ? v.charAt(0).toUpperCase() + v.slice(1) : v);

export const CALENDAR_CATEGORY_LABEL: Record<string, string> = {
  interview: 'Interview', recruiter_call: 'Recruiter call', hiring_manager_call: 'Hiring manager call', networking_call: 'Networking call',
  assessment_deadline: 'Assessment due', application_deadline: 'Application deadline', take_home_deadline: 'Take-home due', follow_up: 'Follow-up', other: 'Calendar event',
};
const MEETING_CATEGORIES = new Set(['interview', 'recruiter_call', 'hiring_manager_call']);
const EMAIL_ACTION_DEFAULT: Record<string, string> = {
  recruiter_reply: 'Reply to the recruiter', interview: 'Confirm or schedule the interview', interview_scheduling: 'Confirm or schedule the interview',
  assessment: 'Complete the assessment', offer: 'Review the offer', follow_up: 'Send the follow-up', status_update: 'Review the update',
  other_job_search: 'Review the message',
};
const LEGACY_EMAIL: Record<string, string> = { interview_invitation: 'interview', scheduling: 'interview_scheduling', reschedule: 'interview_scheduling', deadline: 'other_job_search' };
const canonicalCategory = (c: string | null): string | null => (c ? LEGACY_EMAIL[c] ?? c : null);

function whenLabel(allDay: boolean, startDate: string | null, instant: string, zone: string): string {
  if (allDay && startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(`${startDate}T12:00:00Z`));
  }
  return new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(instant));
}
const isoOf = (v: string): string => new Date(v).toISOString();
const RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

// ---- candidates --------------------------------------------------------------------------------------------------

interface Candidate {
  /** 0 = time-critical / urgent, 1 = important, 2 = due today. */
  tier: number;
  /** Sort instant (ISO) of the thing itself: a deadline or event time. Null = no time of its own. */
  at: string | null;
  /** Recency tiebreak (ISO, newest first). */
  recency: string;
  id: string;
  /** Stable identity for cross-section duplicate detection. */
  key: string;
  item: JsonRecord;
}
const byCandidate = (a: Candidate, b: Candidate): number =>
  a.tier - b.tier
  || (a.at && b.at ? (a.at < b.at ? -1 : a.at > b.at ? 1 : 0) : a.at ? -1 : b.at ? 1 : 0)
  || (a.recency < b.recency ? 1 : a.recency > b.recency ? -1 : 0)
  || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const appLink = (id: string | null | undefined, text: string | null | undefined): JsonRecord => (id && text ? { application: { id, label: clip(text, 120) } } : {});

function emailItem(e: ComposeEmail): JsonRecord {
  const cat = canonicalCategory(e.category);
  const match = e.applicationMatch?.state === 'MATCHED' ? e.applicationMatch.application : null;
  // The provider's own next step wins. A category-based recommendation is only offered for mail that actually needs action
  // (never for routine mail, and never against an explicit "no action").
  const actionable = e.needsAttention || e.actionState === 'needs_action';
  const action = clip(e.nextStep, 120) || (actionable && cat ? EMAIL_ACTION_DEFAULT[cat] ?? '' : '');
  return {
    title: clip(e.title, 110),
    ...(clip(e.summary, 140) ? { detail: clip(e.summary, 140) } : {}),
    source: 'gmail',
    ...(e.urgency === 'HIGH' ? { priority: 'HIGH' } : {}),
    urgency: e.urgency,
    ...(cat ? { kind: cat } : {}),
    ...(clip(e.company, 60) ? { company: clip(e.company, 60) } : {}),
    ...(e.deadline ? { deadline_at: isoOf(e.deadline) } : {}),
    ...(action ? { action } : {}),
    ...(e.receivedAt ? { occurred_at: isoOf(e.receivedAt) } : {}),
    ref: { type: 'email', id: e.id },
    ...(match ? appLink(match.id, `${match.company} — ${match.title}`) : {}),
  };
}

/** Two entries describe the same meeting: same company (both known) and starts within 15 minutes. */
function sameEvent(aAt: string, aCompany: string | null, bAt: string, bCompany: string | null): boolean {
  const ca = normCompany(aCompany), cb = normCompany(bCompany);
  if (!ca || !cb || ca !== cb) return false;
  return Math.abs(Date.parse(aAt) - Date.parse(bAt)) <= 15 * 60_000;
}

// ---- composition -----------------------------------------------------------------------------------------------------

export interface ComposedDigest { payload: JsonRecord; attentionTotal: number }

/** Data wins: a section with items (or a count) is `available`. An empty one reports WHY it is empty (`empty`). */
function section(empty: DigestSectionStatus, count: number, items: JsonRecord[]): JsonRecord {
  if (items.length > 0 || count > 0) return { status: 'available', count: Math.max(count, items.length), items };
  return empty === 'zero' ? { status: 'zero', count: 0, items: [] } : { status: empty, items: [] };
}
/** Empty-section status from a source's latest run state: failed -> unavailable, never ran -> not_configured, otherwise zero. */
const emptyStatus = (h: SourceHealth): DigestSectionStatus => (h === 'failed' ? 'unavailable' : h === 'never' ? 'not_configured' : 'zero');

export function composeDailyDigest(input: ComposeInput): ComposedDigest {
  const { digestDate, timeZone: zone } = input;
  const attentionLimit = DIGEST_SECTION_ITEM_LIMITS.needs_attention!;
  const dayStartMs = Date.parse(input.dayStart);
  const soon = new Date(dayStartMs + 2 * 86_400_000).toISOString(); // today + the next day: "time-critical"

  // ---- JobQuest interviews + calendar -> one deduplicated, chronological event list ----
  const interviews = input.interviews.map((i) => ({ ...i, at: isoOf(i.scheduledAt) }));
  const events = input.calendar
    .filter((c) => c.status !== 'cancelled') // a cancelled item is never active upcoming work
    .filter((c) => !interviews.some((i) => sameEvent(i.at, i.company, c.sortAt, c.company))) // the JobQuest interview wins (authoritative application link)
    .map((c) => ({ ...c, at: isoOf(c.sortAt) }));
  const dedupedAway = input.calendar.filter((c) => c.status !== 'cancelled').length - events.length;

  const interviewItem = (i: (typeof interviews)[number], high: boolean): JsonRecord => ({
    title: clip(i.label, 110),
    detail: clip(`${i.interviewType ? `${label(i.interviewType).toLowerCase()} interview` : 'Interview'} · ${whenLabel(false, null, i.at, zone)}`, 140),
    source: 'jobquest', kind: 'interview', ...(clip(i.company, 60) ? { company: clip(i.company, 60) } : {}),
    ...(high ? { priority: 'HIGH' } : {}), occurred_at: i.at, ref: { type: 'interview', id: i.id }, ...appLink(i.applicationId, i.label),
    ...(high ? { action: 'Prepare for the interview' } : {}),
  });
  const calendarItem = (c: (typeof events)[number], high: boolean): JsonRecord => {
    const when = whenLabel(c.allDay, c.startDate, c.at, zone);
    const was = c.status === 'rescheduled' && c.originalStartAt ? whenLabel(false, null, c.originalStartAt, zone) : '';
    const detail = [
      CALENDAR_CATEGORY_LABEL[c.category] ?? 'Calendar event',
      c.isDeadline ? `due ${when}` : when,
      c.status === 'tentative' ? 'tentative' : c.status === 'rescheduled' ? `rescheduled${was ? ` from ${was}` : ''}` : '',
    ].filter(Boolean).join(' · ');
    const action = c.status === 'rescheduled' ? 'Confirm the new time'
      : c.isDeadline ? (c.category === 'follow_up' ? 'Send the follow-up' : 'Submit before the deadline')
        : MEETING_CATEGORIES.has(c.category) ? 'Prepare for the call' : '';
    return {
      title: clip(c.title, 110), detail: clip(detail, 140), source: 'calendar', kind: c.category,
      ...(clip(c.company, 60) ? { company: clip(c.company, 60) } : {}),
      ...(high ? { priority: 'HIGH' } : {}), ...(c.isDeadline ? { deadline_at: c.at } : {}), ...(action && high ? { action } : {}),
      occurred_at: c.at, ref: { type: 'calendar', id: c.id },
    };
  };

  // ---- NEEDS ATTENTION ----
  const cands: Candidate[] = [];
  for (const e of input.emails) {
    if (!e.needsAttention) continue;
    cands.push({ tier: RANK[e.urgency] ?? 1, at: e.deadline ? isoOf(e.deadline) : null, recency: e.receivedAt ?? '', id: e.id, key: `email:${e.id}`, item: emailItem(e) });
  }
  for (const i of interviews) {
    if (i.at >= input.dayStart && i.at < input.dayEnd) cands.push({ tier: 0, at: i.at, recency: i.at, id: i.id, key: `interview:${i.id}`, item: interviewItem(i, true) });
  }
  for (const c of events) {
    const meetingToday = MEETING_CATEGORIES.has(c.category) && c.at >= input.dayStart && c.at < input.dayEnd;
    const deadlineSoon = c.isDeadline && c.at >= input.dayStart && c.at < soon;
    const movedSoon = c.status === 'rescheduled' && c.at >= input.dayStart && c.at < soon;
    if (meetingToday || deadlineSoon || movedSoon) cands.push({ tier: 0, at: c.at, recency: c.at, id: c.id, key: `calendar:${c.id}`, item: calendarItem(c, true) });
  }
  for (const f of input.followUps) {
    if (!f.dueDate) continue;
    const overdue = f.dueDate < digestDate;
    const high = f.priority === 'HIGH' || f.priority === 'CRITICAL';
    const detail = clip(`${f.action ? `${f.action} · ` : ''}${overdue ? 'overdue, was due' : 'due'} ${f.dueDate}`, 140);
    cands.push({
      tier: overdue || high ? 1 : 2, at: `${f.dueDate}T00:00:00.000Z`, recency: f.dueDate, id: f.id, key: `${f.kind}:${f.id}`,
      item: {
        title: clip(f.label, 110), detail, source: 'jobquest', kind: f.kind === 'task' ? 'task' : 'application_follow_up',
        ...(clip(f.company, 60) ? { company: clip(f.company, 60) } : {}), ...(overdue || high ? { priority: 'HIGH' } : {}),
        action: clip(f.action, 120) || (f.kind === 'task' ? 'Finish the task' : 'Follow up'), ref: { type: f.kind === 'task' ? 'task' : 'application', id: f.id },
        ...(f.applicationId ? appLink(f.applicationId, f.kind === 'task' ? f.company ?? f.label : f.label) : {}),
      },
    });
  }
  cands.sort(byCandidate);
  const shownAttention = cands.slice(0, attentionLimit);
  const attentionKeys = new Set(shownAttention.map((c) => c.key));
  const attentionEmailCandidates = cands.filter((c) => c.key.startsWith('email:')).length;
  const nonEmailAttention = cands.length - attentionEmailCandidates;
  const attentionTotal = Math.max(input.emailCounts.attention, attentionEmailCandidates) + nonEmailAttention;
  const attentionItems = shownAttention.map((c) => c.item);

  // ---- EMAIL (job-related / other) ----
  const inWindow = (e: ComposeEmail) => e.receivedAt !== null && e.receivedAt >= input.emailWindowStart;
  const newest = (a: ComposeEmail, b: ComposeEmail) => (RANK[a.urgency] ?? 1) - (RANK[b.urgency] ?? 1) || ((a.receivedAt ?? '') < (b.receivedAt ?? '') ? 1 : (a.receivedAt ?? '') > (b.receivedAt ?? '') ? -1 : 0) || (a.id < b.id ? -1 : 1);
  const emailRows = (group: 'job_related' | 'other', limit: number): JsonRecord[] => {
    const rows = input.emails.filter((e) => inWindow(e) && (group === 'job_related' ? e.group === 'job_related' : e.group !== 'job_related')).sort(newest);
    const top = rows.filter((e) => e.urgency !== 'LOW').slice(0, limit);
    const low = rows.filter((e) => e.urgency === 'LOW').slice(0, Math.max(0, Math.min(2, limit - top.length)));
    return [...top, ...low].map((e) => ({ ...emailItem(e), ...(attentionKeys.has(`email:${e.id}`) ? { attention: true } : {}) }));
  };
  const jobEmailItems = emailRows('job_related', DIGEST_SECTION_ITEM_LIMITS.job_email!);
  const otherEmailItems = emailRows('other', DIGEST_SECTION_ITEM_LIMITS.other_email!);

  // ---- UPCOMING (calendar + interviews, active only, chronological) ----
  const upcomingAll = [
    ...interviews.filter((i) => i.at >= input.dayStart && i.at < input.upcomingEnd).map((i) => ({ at: i.at, key: `interview:${i.id}`, item: interviewItem(i, i.at < input.dayEnd) })),
    ...events.filter((c) => c.at >= input.dayStart && c.at < input.upcomingEnd).map((c) => ({
      at: c.at, key: `calendar:${c.id}`, item: calendarItem(c, c.status === 'rescheduled' || (MEETING_CATEGORIES.has(c.category) && c.at < input.dayEnd) || (c.isDeadline && c.at < soon)),
    })),
  ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.key < b.key ? -1 : 1));
  const upcomingItems = upcomingAll.slice(0, DIGEST_SECTION_ITEM_LIMITS.upcoming!).map((u) => ({ ...u.item, ...(attentionKeys.has(u.key) ? { attention: true } : {}) }));
  const upcomingCount = Math.max(upcomingAll.length, Math.max(0, input.calendarCount - dedupedAway) + input.interviewCount);

  // ---- RECENT JOB LEADS ----
  const leads = [...input.leads].sort((a, b) =>
    (b.matchScore ?? -1) - (a.matchScore ?? -1) || (a.discoveredAt < b.discoveredAt ? 1 : a.discoveredAt > b.discoveredAt ? -1 : 0) || (a.id < b.id ? -1 : 1));
  const leadItems: JsonRecord[] = leads.slice(0, DIGEST_SECTION_ITEM_LIMITS.job_leads!).map((l) => ({
    title: clip(l.title, 110),
    detail: clip([l.location, l.workArrangement ? label(l.workArrangement) : '', l.postedDate ? `posted ${l.postedDate}` : ''].filter(Boolean).join(' · ') || 'Job lead', 140),
    source: 'job_site', kind: 'job_lead', company: clip(l.company, 60), ...(l.matchScore !== null ? { score: Math.max(0, Math.min(100, Math.round(l.matchScore))) } : {}),
    ...(l.requiredSkills.length ? { tags: l.requiredSkills.slice(0, 3).map((t) => clip(t, 30)).filter(Boolean) } : {}),
    ...(l.sourceUrl ? { url: l.sourceUrl } : {}), occurred_at: isoOf(l.discoveredAt), ref: { type: 'job_lead', id: l.id },
  }));

  // ---- RECRUITERS (existing intelligence only) ----
  const tracked = new Set(input.trackedCompanies.map(normCompany).filter(Boolean));
  const recruiters = input.recruiters
    .map((r) => ({ r, tier: r.relatedLead ? 0 : tracked.has(normCompany(r.company)) ? 1 : 2 }))
    .sort((a, b) => a.tier - b.tier || (a.r.verification === b.r.verification ? 0 : a.r.verification === 'verified' ? -1 : 1)
      || (a.r.discoveredAt < b.r.discoveredAt ? 1 : a.r.discoveredAt > b.r.discoveredAt ? -1 : 0) || (a.r.id < b.r.id ? -1 : 1));
  const recruiterItems: JsonRecord[] = recruiters.slice(0, DIGEST_SECTION_ITEM_LIMITS.recruiter_intel!).map(({ r }) => {
    const url = r.profileUrl ?? r.sourceUrl;
    return {
      title: clip(r.name, 110),
      detail: clip([r.roleTitle ? sentence(clip(r.roleTitle, 60)) : r.relationship ? sentence(label(r.relationship)) : '', r.relatedLead ? `re: ${clip(r.relatedLead.title, 60)}` : ''].filter(Boolean).join(' · ') || 'Recruiter', 140),
      source: 'web', kind: 'recruiter', company: clip(r.company, 60), verification: r.verification,
      ...(url ? { url } : {}), occurred_at: isoOf(r.discoveredAt), ref: { type: 'recruiter', id: r.id },
    };
  });

  // ---- FOLLOW-UPS (read-only; nothing is created or changed) ----
  const fu = [...input.followUps].filter((f) => f.dueDate).sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : a.dueDate! > b.dueDate! ? 1 : a.id < b.id ? -1 : 1));
  const followUpItems: JsonRecord[] = fu.slice(0, DIGEST_SECTION_ITEM_LIMITS.follow_ups!).map((f) => {
    const overdue = f.dueDate! < digestDate;
    const key = `${f.kind}:${f.id}`;
    return {
      title: clip(f.label, 110), detail: clip(`${f.action ? `${f.action} · ` : ''}${overdue ? 'overdue, was due' : 'due'} ${f.dueDate}`, 140),
      source: 'jobquest', kind: f.kind === 'task' ? 'task' : 'application_follow_up', ...(clip(f.company, 60) ? { company: clip(f.company, 60) } : {}),
      ...(overdue ? { priority: 'HIGH' } : {}), ref: { type: f.kind === 'task' ? 'task' : 'application', id: f.id },
      ...(f.applicationId ? appLink(f.applicationId, f.kind === 'task' ? f.company ?? f.label : f.label) : {}),
      ...(attentionKeys.has(key) ? { attention: true } : {}),
    };
  });

  const sections: Record<string, JsonRecord> = {
    needs_attention: section('zero', attentionTotal, attentionItems),
    job_email: section(emptyStatus(input.health.email), input.emailCounts.job, jobEmailItems),
    other_email: section(emptyStatus(input.health.email), input.emailCounts.other, otherEmailItems),
    upcoming: section(input.interviews.length > 0 || input.health.calendar === 'ok' ? 'zero' : emptyStatus(input.health.calendar), upcomingCount, upcomingItems),
    job_leads: section(emptyStatus(input.health.jobs), input.leadCount, leadItems),
    recruiter_intel: section(emptyStatus(input.health.recruiters), input.recruiterCount, recruiterItems),
    follow_ups: section('zero', input.followUpCount, followUpItems),
  };

  const payload: JsonRecord = {
    version: DIGEST_PAYLOAD_VERSION,
    digest_date: digestDate,
    time_zone: zone,
    generated_at: input.generatedAt,
    summary: {
      needs_attention: attentionTotal,
      job_emails: input.emailCounts.job,
      other_emails: input.emailCounts.other,
      upcoming: upcomingCount,
      recent_jobs: input.leadCount,
      recruiters: input.recruiterCount,
      follow_ups: input.followUpCount,
    },
    priorities: [],
    sections,
  };
  return { payload: fitToBudget(payload), attentionTotal };
}

/** Section order in which items are dropped (least important first) when a digest would exceed the byte budget. */
const TRIM_ORDER = ['other_email', 'recruiter_intel', 'job_leads', 'job_email', 'upcoming', 'follow_ups', 'needs_attention'] as const;

/**
 * Keeps the stored snapshot under the ingest RPC's payload cap WITHOUT raising it (that would need a migration):
 * drops the last item of the least important section until the serialized size fits. The section `count` is kept, so
 * the UI still says how many exist ("showing x of N"). Deterministic: the same input always yields the same digest.
 */
export function fitToBudget(payload: JsonRecord, budget: number = DIGEST_BYTE_BUDGET): JsonRecord {
  const size = () => Buffer.byteLength(JSON.stringify(payload), 'utf8');
  const sections = payload.sections as Record<string, { items: JsonRecord[] }>;
  let guard = 200;
  while (size() > budget && guard-- > 0) {
    const target = TRIM_ORDER.find((k) => (sections[k]?.items.length ?? 0) > 1) ?? TRIM_ORDER.find((k) => (sections[k]?.items.length ?? 0) > 0);
    if (!target) break;
    sections[target]!.items.pop();
  }
  return payload;
}
