// Browser-safe helpers for the AI Hub external intelligence pages (AI-6): Job Leads, Email and
// Recruiter Intel. Pure functions only (no fetching) so every state is unit-testable. Constants
// mirror apps/api/src/lib/aiContract/constants.ts and the ai_job_leads CHECKs;
// tests/unit/ai-6-sources-ui.test.ts fails on drift.
//
// Everything rendered here originates from an external AI provider: it is untrusted text, shown
// as React text children (escaped) with credential-free http(s) links only.
import { safeHttpUrl } from './aiHub';
import { shiftDay } from './aiDigest';
import { zonedWallTimeToUtcIso } from './time';

// AI-11B email taxonomy (mirrors the server; tests/unit/ai-11b-email-ui.test.ts fails on drift).
export const EMAIL_GROUPS = ['job_related', 'other'] as const;
export const EMAIL_JOB_CATEGORIES = [
  'recruiter_reply', 'application_confirmation', 'interview', 'interview_scheduling', 'assessment',
  'follow_up', 'status_update', 'rejection', 'offer', 'other_job_search',
] as const;
export const EMAIL_OTHER_CATEGORIES = ['important_account', 'notification', 'newsletter', 'other'] as const;
/** AI-6 values stay valid (stored as sent) and read as the canonical category. */
export const EMAIL_LEGACY_CATEGORY_ALIASES: Record<string, string> = {
  interview_invitation: 'interview', scheduling: 'interview_scheduling', reschedule: 'interview_scheduling', deadline: 'other_job_search',
};
export const EMAIL_CATEGORIES = [
  ...EMAIL_JOB_CATEGORIES, ...EMAIL_OTHER_CATEGORIES, 'interview_invitation', 'scheduling', 'reschedule', 'deadline',
] as const;
/** Categories offered in the filter: the canonical ones (a canonical filter also matches its legacy spellings). */
export const EMAIL_FILTER_CATEGORIES = [...EMAIL_JOB_CATEGORIES, ...EMAIL_OTHER_CATEGORIES] as const;
export const EMAIL_ATTENTION_CATEGORIES = [
  'recruiter_reply', 'interview_invitation', 'assessment', 'scheduling', 'reschedule', 'deadline', 'follow_up', 'interview', 'interview_scheduling', 'offer',
] as const;
export const EMAIL_URGENCIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export const EMAIL_ACTION_STATES = ['needs_action', 'no_action'] as const;
export const EMAIL_STAGE_HINTS = ['APPLIED', 'ASSESSMENT', 'RECRUITER_SCREEN', 'INTERVIEW', 'FINAL_INTERVIEW', 'OFFER', 'REJECTED'] as const;
export type EmailGroup = (typeof EMAIL_GROUPS)[number];
export type EmailUrgency = (typeof EMAIL_URGENCIES)[number];

export function emailCategoryGroup(category: string | null | undefined): EmailGroup | null {
  const c = category ? EMAIL_LEGACY_CATEGORY_ALIASES[category] ?? category : null;
  if (!c) return null;
  if ((EMAIL_JOB_CATEGORIES as readonly string[]).includes(c)) return 'job_related';
  if ((EMAIL_OTHER_CATEGORIES as readonly string[]).includes(c)) return 'other';
  return null;
}
/** Every STORED value that reads as `canonical` (itself plus legacy spellings). */
export const emailCategoryMembers = (canonical: string): string[] =>
  [canonical, ...Object.entries(EMAIL_LEGACY_CATEGORY_ALIASES).filter(([, to]) => to === canonical).map(([from]) => from)];
export function emailGroupCategories(group: EmailGroup): string[] {
  const own = group === 'job_related' ? EMAIL_JOB_CATEGORIES : EMAIL_OTHER_CATEGORIES;
  return [...own, ...Object.entries(EMAIL_LEGACY_CATEGORY_ALIASES).filter(([, to]) => (own as readonly string[]).includes(to)).map(([from]) => from)];
}
export const urgencyFromPriority = (p: string | null | undefined): EmailUrgency =>
  p === 'HIGH' || p === 'CRITICAL' ? 'HIGH' : p === 'LOW' || p === 'INFO' ? 'LOW' : 'MEDIUM';
export const prioritiesForUrgency = (u: EmailUrgency): string[] => (u === 'HIGH' ? ['HIGH', 'CRITICAL'] : u === 'LOW' ? ['LOW', 'INFO'] : ['NORMAL']);
export const JOB_WORK_ARRANGEMENTS = ['remote', 'hybrid', 'onsite'] as const;
export const JOB_EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'temporary', 'internship', 'freelance', 'other'] as const;
/** A "strong match" is a provider match score >= this value (0..100). No score => never strong. */
export const STRONG_MATCH_THRESHOLD = 80;
export const JOB_DESCRIPTION_MAX_CHARS = 30000;
export const SOURCE_PAGE_SIZE = 20;
export const SOURCE_SEARCH_MAX = 80;

export const EMAIL_CATEGORY_LABELS: Record<string, string> = {
  recruiter_reply: 'Recruiter reply', interview_invitation: 'Interview invitation', assessment: 'Assessment', rejection: 'Rejection',
  application_confirmation: 'Application confirmation', follow_up: 'Follow-up', scheduling: 'Scheduling', reschedule: 'Reschedule',
  deadline: 'Deadline', other_job_search: 'Other job-search email',
  interview: 'Interview', interview_scheduling: 'Interview scheduling', status_update: 'Status update', offer: 'Offer',
  important_account: 'Important account', notification: 'Notification', newsletter: 'Newsletter', other: 'Other mail',
};
export const EMAIL_GROUP_LABELS: Record<EmailGroup, string> = { job_related: 'Job related', other: 'Other mail' };
export const EMAIL_URGENCY_LABELS: Record<EmailUrgency, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };
export const EMAIL_STAGE_HINT_LABELS: Record<string, string> = {
  APPLIED: 'Applied', ASSESSMENT: 'Assessment', RECRUITER_SCREEN: 'Recruiter screen', INTERVIEW: 'Interview', FINAL_INTERVIEW: 'Final interview', OFFER: 'Offer', REJECTED: 'Rejected',
};
export const WORK_ARRANGEMENT_LABELS: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' };
export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', temporary: 'Temporary', internship: 'Internship', freelance: 'Freelance', other: 'Other',
};
export const RELATIONSHIP_LABELS: Record<string, string> = {
  recruiter: 'Recruiter', talent_acquisition: 'Talent acquisition', hiring_manager: 'Hiring manager', sourcer: 'Sourcer', other: 'Other',
};
const label = (map: Record<string, string>, v: string | null | undefined) => (v ? map[v] ?? 'Other' : '');
export const emailCategoryLabel = (v: string | null | undefined) => label(EMAIL_CATEGORY_LABELS, v);
export const workArrangementLabel = (v: string | null | undefined) => label(WORK_ARRANGEMENT_LABELS, v);
export const employmentTypeLabel = (v: string | null | undefined) => label(EMPLOYMENT_TYPE_LABELS, v);
export const relationshipLabel = (v: string | null | undefined) => label(RELATIONSHIP_LABELS, v);

// ---- shared filters ----------------------------------------------------------------------------

export const SOURCE_STATUS_FILTERS = [
  { id: 'ACTIVE', label: 'Active (new and reviewed)' }, { id: 'NEW', label: 'New only' }, { id: 'DISMISSED', label: 'Dismissed' }, { id: 'ALL', label: 'All' },
] as const;
export type SourceStatusFilter = (typeof SOURCE_STATUS_FILTERS)[number]['id'];
export const SOURCE_STATUSES: Record<Exclude<SourceStatusFilter, 'ALL'>, readonly string[]> = {
  ACTIVE: ['NEW', 'REVIEWED'], NEW: ['NEW'], DISMISSED: ['DISMISSED'],
};
export const SOURCE_PROVIDER_FILTERS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'ALL', label: 'All providers' }, { id: 'claude', label: 'Claude' }, { id: 'chatgpt', label: 'ChatGPT' }, { id: 'gemini', label: 'Gemini' }, { id: 'manual', label: 'Manual' },
];

/** Strips characters that would alter a PostgREST filter expression and bounds the term. */
export function sanitizeSearch(v: string): string {
  return v.normalize('NFC').replace(/[,()*%\\"'`;:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, SOURCE_SEARCH_MAX);
}

export interface DateRange { from: string; to: string }
export type RangeResult = { ok: true; since: string | null; before: string | null } | { ok: false; message: string };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (d: string) => DAY.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);

/** Inclusive calendar dates (entered in the profile time zone) -> [since, before) ISO instants. */
export function resolveDateRange(range: DateRange, timeZone: string): RangeResult {
  const { from, to } = range;
  if ((from && !validDay(from)) || (to && !validDay(to))) return { ok: false, message: 'Enter valid dates.' };
  if (from && to && from > to) return { ok: false, message: 'The start date must be on or before the end date.' };
  const at = (d: string) => {
    try { return zonedWallTimeToUtcIso(d, '00:00', timeZone); } catch { return `${d}T00:00:00.000Z`; }
  };
  return { ok: true, since: from ? at(from) : null, before: to ? at(shiftDay(to, 1)) : null };
}

export const clampScore = (raw: string): number | null => {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : null;
};

// ---- job leads ---------------------------------------------------------------------------------------

export interface JobLeadFilters {
  provider: string; status: SourceStatusFilter; search: string; company: string; location: string;
  arrangement: string; employmentType: string; minScore: string; discovered: DateRange; posted: DateRange;
}
export const DEFAULT_JOB_LEAD_FILTERS: JobLeadFilters = {
  provider: 'ALL', status: 'ACTIVE', search: '', company: '', location: '', arrangement: 'ALL', employmentType: 'ALL', minScore: '',
  discovered: { from: '', to: '' }, posted: { from: '', to: '' },
};

/** Row selected by api/aiSources.ts (RLS). `description` is only present in the detail fetch. */
export interface JobLeadRow {
  finding_id: string; user_id: string; company: string; title: string; location: string | null; work_arrangement: string | null;
  employment_type: string | null; source_name: string | null; source_url: string | null; posted_date: string | null; discovered_at: string;
  salary_min: number | null; salary_max: number | null; salary_currency: string | null; salary_period: string | null;
  experience_level: string | null; match_score: number | null; required_skills: unknown; preferred_skills: unknown;
  description_truncated: boolean; description_length: number | null; description?: string | null;
  finding: { provider: string; status: string; priority: string; confidence: number | string | null; summary: string | null; payload: Record<string, unknown> | null; application_id?: string | null };
}

export interface JobLeadView {
  id: string; ownerId: string; company: string; title: string; location: string | null; arrangement: string | null; employmentType: string | null;
  sourceName: string | null; sourceUrl: string | null; postedDate: string | null; discoveredAt: string; salary: string | null;
  experienceLevel: string | null; matchScore: number | null; strongMatch: boolean; requiredSkills: string[]; preferredSkills: string[];
  provider: string; status: string; summary: string | null; matchReasoning: string | null; hasDescription: boolean; descriptionTruncated: boolean;
  descriptionLength: number | null; description: string | null;
  /** AI-8: the Application JobQuest created (or the human linked) from this lead; set only by JobQuest, never by a provider. */
  applicationId: string | null;
  /** AI-8: a create_application suggestion is waiting in the Actions queue (the lead itself is never executed from here). */
  pendingAction: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const list = (v: unknown, max = 30): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, max).map((x) => x.slice(0, 100)) : []);

export const isStrongMatch = (score: number | null | undefined): boolean => typeof score === 'number' && score >= STRONG_MATCH_THRESHOLD;

/** Published salary only: nothing is shown unless the posting stated at least one bound. */
export function salaryLabel(min: number | null, max: number | null, currency: string | null, period: string | null): string | null {
  if (min === null && max === null) return null;
  const fmt = (n: number) => n.toLocaleString('en-US');
  const range = min !== null && max !== null ? (min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`) : min !== null ? `from ${fmt(min)}` : `up to ${fmt(max!)}`;
  return [currency ? `${currency} ` : '', range, period ? ` per ${period}` : ''].join('').trim();
}

export function toJobLeadView(r: JobLeadRow): JobLeadView {
  const f = isObj(r.finding) ? r.finding : ({} as JobLeadRow['finding']);
  const payload = isObj(f.payload) ? f.payload : {};
  const score = typeof r.match_score === 'number' && Number.isFinite(r.match_score) ? r.match_score : null;
  const desc = typeof r.description === 'string' && r.description !== '' ? r.description : null;
  return {
    id: String(r.finding_id), ownerId: String(r.user_id), company: String(r.company), title: String(r.title), location: text(r.location, 200),
    arrangement: text(r.work_arrangement, 16), employmentType: text(r.employment_type, 24), sourceName: text(r.source_name, 64),
    sourceUrl: safeHttpUrl(r.source_url), postedDate: DAY.test(String(r.posted_date)) ? String(r.posted_date) : null, discoveredAt: String(r.discovered_at),
    salary: salaryLabel(r.salary_min ?? null, r.salary_max ?? null, text(r.salary_currency, 3), text(r.salary_period, 8)),
    experienceLevel: text(r.experience_level, 60), matchScore: score, strongMatch: isStrongMatch(score),
    requiredSkills: list(r.required_skills), preferredSkills: list(r.preferred_skills), provider: String(f.provider ?? ''), status: String(f.status ?? ''),
    summary: text(f.summary, 1000), matchReasoning: text(payload.match_reasoning, 1000),
    hasDescription: desc !== null || (typeof r.description_length === 'number' && r.description_length > 0),
    descriptionTruncated: r.description_truncated === true, descriptionLength: typeof r.description_length === 'number' ? r.description_length : null, description: desc,
    applicationId: typeof f.application_id === 'string' && f.application_id !== '' ? f.application_id : null, pendingAction: false,
  };
}

/** Structured, provider-neutral export of one lead (the copy action). Same fields the page already shows. */
export function jobLeadExport(v: JobLeadView): Record<string, unknown> {
  return {
    company: v.company, title: v.title, location: v.location, work_arrangement: v.arrangement, employment_type: v.employmentType,
    source_name: v.sourceName, source_url: v.sourceUrl, posted_date: v.postedDate, discovered_at: v.discoveredAt, salary: v.salary,
    experience_level: v.experienceLevel, ai_match_score: v.matchScore, required_skills: v.requiredSkills, preferred_skills: v.preferredSkills,
    description: v.description, description_truncated: v.descriptionTruncated, provider: v.provider,
  };
}

// ---- email -------------------------------------------------------------------------------------------------

export interface EmailFilters {
  provider: string; status: SourceStatusFilter; category: string; company: string; needsAttention: boolean; received: DateRange;
  /** AI-11B: 'ALL' | 'job_related' | 'other'. */
  group: string;
  /** AI-11B: 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'. */
  urgency: string;
}
export const DEFAULT_EMAIL_FILTERS: EmailFilters = {
  provider: 'ALL', status: 'ACTIVE', category: 'ALL', company: '', needsAttention: false, received: { from: '', to: '' }, group: 'ALL', urgency: 'ALL',
};

export interface EmailRow {
  id: string; user_id: string; provider: string; status: string; priority: string; confidence: number | string | null; category: string | null;
  title: string; summary: string | null; evidence: string | null; occurred_at: string | null; due_at: string | null; created_at: string;
  payload: Record<string, unknown> | null;
}
export interface EmailView {
  id: string; ownerId: string; provider: string; status: string; priority: string; category: string | null; title: string; summary: string | null;
  evidence: string | null; receivedAt: string | null; deadline: string | null; senderName: string | null; senderDomain: string | null;
  company: string | null; roleTitle: string | null; nextStep: string | null; subject: string | null; needsAttention: boolean;
  /** AI-11B */
  group: EmailGroup | null; urgency: EmailUrgency; actionState: 'needs_action' | 'no_action' | null; draftRecommended: boolean; stageHint: string | null;
}

/**
 * One definition of "needs attention" (mirrors the server and the list filter): an open email that is urgent or provider-flagged, or -
 * only when the provider gave no explicit action state - in an actionable category or dated. An explicit `no_action` is authoritative.
 */
export function emailNeedsAttention(e: { status: string; priority: string; category: string | null; dueAt: string | null; payload: Record<string, unknown> }): boolean {
  if (e.status !== 'NEW') return false;
  if (e.priority === 'HIGH' || e.priority === 'CRITICAL' || e.payload.needs_attention === true) return true;
  if (e.payload.action_state !== undefined && e.payload.action_state !== null) return false;
  return (e.category !== null && (EMAIL_ATTENTION_CATEGORIES as readonly string[]).includes(e.category)) || e.dueAt !== null;
}
const oneOfList = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null);
export function toEmailView(r: EmailRow): EmailView {
  const payload = isObj(r.payload) ? r.payload : {};
  const category = text(r.category, 48);
  return {
    id: String(r.id), ownerId: String(r.user_id), provider: String(r.provider), status: String(r.status), priority: String(r.priority),
    category, title: String(r.title), summary: text(r.summary, 1000), evidence: text(r.evidence, 500),
    receivedAt: text(r.occurred_at, 40), deadline: text(r.due_at, 40), senderName: text(payload.sender_name, 200), senderDomain: text(payload.sender_domain, 255),
    company: text(payload.company, 200), roleTitle: text(payload.role_title, 300), nextStep: text(payload.next_step, 300), subject: text(payload.subject, 200),
    needsAttention: emailNeedsAttention({ status: String(r.status), priority: String(r.priority), category, dueAt: text(r.due_at, 40), payload }),
    group: emailCategoryGroup(category), urgency: urgencyFromPriority(String(r.priority)), actionState: oneOfList(payload.action_state, EMAIL_ACTION_STATES),
    draftRecommended: payload.draft_recommended === true, stageHint: oneOfList(payload.application_stage_hint, EMAIL_STAGE_HINTS),
  };
}
/** PostgREST `or` expression equal to emailNeedsAttention (used with status = NEW). Identical to the server's EMAIL_ATTENTION_OR. */
export const EMAIL_ATTENTION_OR =
  `priority.in.(HIGH,CRITICAL),payload->>needs_attention.eq.true,and(payload->>action_state.is.null,or(category.in.(${EMAIL_ATTENTION_CATEGORIES.join(',')}),due_at.not.is.null))`;

/** An application the email relates to (read-only context; never changed from here). */
export interface EmailMatchApp { id: string; company: string; title: string; stage: string; status: string; outcome: string | null }
/** The server-derived relation to the owner's applications. POSSIBLE is never authoritative. */
export interface EmailMatchView {
  state: 'MATCHED' | 'POSSIBLE' | 'UNMATCHED' | 'NOT_APPLICABLE';
  application: EmailMatchApp | null;
  possible: EmailMatchApp[];
}
const matchApp = (v: unknown): EmailMatchApp | null => {
  if (!isObj(v) || typeof v.id !== 'string') return null;
  return { id: v.id, company: String(v.company ?? ''), title: String(v.title ?? ''), stage: String(v.stage ?? ''), status: String(v.status ?? ''), outcome: text(v.outcome, 16) };
};
export function toEmailMatchView(v: unknown): EmailMatchView | null {
  if (!isObj(v)) return null;
  const state = oneOfList(v.state, ['MATCHED', 'POSSIBLE', 'UNMATCHED', 'NOT_APPLICABLE'] as const);
  if (!state) return null;
  const application = state === 'MATCHED' ? matchApp(v.application) : null;
  if (state === 'MATCHED' && !application) return null;
  const possible = state === 'POSSIBLE' && Array.isArray(v.possible) ? v.possible.map(matchApp).filter((a): a is EmailMatchApp => a !== null).slice(0, 3) : [];
  return { state, application, possible };
}

export interface EmailUrgencyBucket { urgency: EmailUrgency; items: EmailView[] }
export interface EmailGroupSection { group: EmailGroup; label: string; buckets: EmailUrgencyBucket[]; total: number }
/**
 * Job related first, then other mail; inside each, HIGH, MEDIUM, LOW (empty urgencies are dropped, empty groups too). Rows keep
 * their incoming order (newest received first). An item with an unknown category is shown under "Other mail" - never hidden.
 */
export function groupEmailViews(rows: readonly EmailView[]): EmailGroupSection[] {
  const sections: EmailGroupSection[] = [];
  for (const group of EMAIL_GROUPS) {
    const inGroup = rows.filter((r) => (r.group ?? 'other') === group);
    if (inGroup.length === 0) continue;
    const buckets = EMAIL_URGENCIES.map((urgency) => ({ urgency, items: inGroup.filter((r) => r.urgency === urgency) })).filter((b) => b.items.length > 0);
    sections.push({ group, label: EMAIL_GROUP_LABELS[group], buckets, total: inGroup.length });
  }
  return sections;
}

/** Application pipeline stage -> label (an unknown future stage reads as itself, tidied, never as a blank). */
export const stageLabel = (stage: string | null | undefined): string => {
  if (!stage) return '';
  const known: Record<string, string> = { SAVED: 'Saved', PREPARING: 'Preparing', ...EMAIL_STAGE_HINT_LABELS };
  return known[stage] ?? stage.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
};

/** "5m ago" / "2h ago" / "3d ago" for a recent instant; '' when it is older than a week, in the future or unparseable (absolute time is shown anyway). */
export function relativeAge(iso: string | null | undefined, nowMs: number): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t) || t > nowMs) return '';
  const mins = Math.floor((nowMs - t) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ago`;
  const days = Math.floor(mins / (24 * 60));
  return days < 7 ? `${days}d ago` : '';
}

// ---- recruiters -----------------------------------------------------------------------------------------------

export interface RecruiterFilters { provider: string; status: SourceStatusFilter; search: string; company: string; discovered: DateRange }
export const DEFAULT_RECRUITER_FILTERS: RecruiterFilters = { provider: 'ALL', status: 'ACTIVE', search: '', company: '', discovered: { from: '', to: '' } };

export interface RecruiterRow {
  id: string; user_id: string; provider: string; status: string; confidence: number | string | null; title: string; summary: string | null;
  source_ref: Record<string, unknown> | null; created_at: string; payload: Record<string, unknown> | null;
}
export interface RecruiterView {
  id: string; ownerId: string; provider: string; status: string; name: string; roleTitle: string | null; company: string; relationship: string | null;
  verified: boolean; uncertainFields: string[]; sourceName: string | null; sourceUrl: string | null; profileUrl: string | null;
  contact: { email: string | null; phone: string | null; sourceUrl: string } | null; summary: string | null; discoveredAt: string;
  relatedJobKey: string | null; relatedJobUrl: string | null; relatedJob: { company: string | null; title: string | null } | null;
  relatedLead: { id: string; company: string; title: string } | null; confidence: number | null;
}
export function toRecruiterView(r: RecruiterRow): RecruiterView {
  const payload = isObj(r.payload) ? r.payload : {};
  const ref = isObj(r.source_ref) ? r.source_ref : {};
  const related = isObj(payload.related_job) ? payload.related_job : {};
  const contactSource = safeHttpUrl(payload.contact_source_url);
  const email = text(payload.contact_email, 254), phone = text(payload.contact_phone, 32);
  const conf = typeof r.confidence === 'string' ? Number(r.confidence) : r.confidence;
  return {
    id: String(r.id), ownerId: String(r.user_id), provider: String(r.provider), status: String(r.status),
    name: text(payload.recruiter_name, 200) ?? String(r.title), roleTitle: text(payload.role_title, 200), company: text(payload.company, 200) ?? '',
    relationship: text(payload.relationship, 32), verified: payload.verification === 'verified', uncertainFields: list(payload.uncertain_fields, 5),
    sourceName: text(payload.source_name, 100), sourceUrl: safeHttpUrl(ref.url), profileUrl: safeHttpUrl(payload.profile_url),
    contact: contactSource && (email || phone) ? { email, phone, sourceUrl: contactSource } : null, summary: text(r.summary, 1000), discoveredAt: String(r.created_at),
    relatedJobKey: text(payload.related_job_key, 255), relatedJobUrl: safeHttpUrl(related.job_url),
    relatedJob: Object.keys(related).length ? { company: text(related.company, 200), title: text(related.title, 300) } : null,
    relatedLead: null, confidence: typeof conf === 'number' && Number.isFinite(conf) ? conf : null,
  };
}

// ---- states --------------------------------------------------------------------------------------------------

export type SourceKind = 'job_leads' | 'email' | 'recruiters' | 'calendar';
export const SOURCE_WORKFLOW: Record<SourceKind, string> = { job_leads: 'job_discovery', email: 'email_triage', recruiters: 'recruiter_intel', calendar: 'calendar_review' };
export const SOURCE_TITLES: Record<SourceKind, string> = { job_leads: 'Job Leads', email: 'Email Intelligence', recruiters: 'Recruiter Intelligence', calendar: 'Calendar Intelligence' };
export const SOURCE_NOT_CONFIGURED: Record<SourceKind, string> = {
  job_leads: 'Job discovery has not run yet. Connect Claude in Settings → AI & Automation and schedule the Job Discovery task; its results appear here.',
  email: 'Email triage has not run yet. Connect Claude in Settings → AI & Automation and schedule the Email Triage task; classifications and summaries appear here (never message bodies).',
  recruiters: 'Recruiter research has not run yet. Connect Claude in Settings → AI & Automation and schedule the Recruiter Intelligence task; cited public findings appear here.',
  calendar: 'Calendar review has not run yet. Connect Claude in Settings → AI & Automation and schedule the Calendar Intelligence task; interviews, calls and deadlines it finds appear here. JobQuest never connects to your calendar and cannot change it.',
};
export const AI_MATCH_NOTE = 'AI match is the provider’s own estimate, not a measure JobQuest guarantees. A job lead is not an application.';
