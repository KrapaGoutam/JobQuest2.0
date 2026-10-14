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
  technical_recruiter: 'Technical recruiter', qa_manager: 'QA / test manager', engineering_manager: 'Engineering manager', engineering_leader: 'Head of engineering',
};
export const VERIFICATION_BASIS_LABELS: Record<string, string> = {
  company_page: 'company page', professional_profile: 'public professional profile', job_posting: 'named in the job posting',
  prospecting_source: 'prospecting source', other_public_source: 'other public source',
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
  /** AI-11D: 'freshness' (default) | 'match' | 'discovered'. */
  sort: string;
  /** AI-11D: 'ALL' or the last 12/24/48/72 hours (posting time; first-stored time when the posting time is unknown). */
  recent: string;
  /** AI-11D: only remote roles open to the whole United States. */
  remoteUs: boolean;
}
export const DEFAULT_JOB_LEAD_FILTERS: JobLeadFilters = {
  provider: 'ALL', status: 'ACTIVE', search: '', company: '', location: '', arrangement: 'ALL', employmentType: 'ALL', minScore: '',
  discovered: { from: '', to: '' }, posted: { from: '', to: '' }, sort: 'freshness', recent: 'ALL', remoteUs: false,
};

// AI-11D (mirrors the server; tests/unit/ai-11d-discovery-ui.test.ts fails on drift).
export const JOB_LEAD_SORTS = ['freshness', 'match', 'discovered'] as const;
export const JOB_LEAD_SORT_LABELS: Record<(typeof JOB_LEAD_SORTS)[number], string> = {
  freshness: 'Freshest first', match: 'Best AI match first', discovered: 'Recently found first',
};
export const DISCOVERY_FRESHNESS_HOURS = [12, 24, 48, 72] as const;
export const JOB_REMOTE_SCOPES = ['us', 'restricted', 'region'] as const;
export type JobRemoteScope = (typeof JOB_REMOTE_SCOPES)[number];
export const AI_SOURCE_STATUSES = ['ok', 'zero', 'blocked', 'unavailable', 'error', 'skipped'] as const;
export type AiSourceStatus = (typeof AI_SOURCE_STATUSES)[number];

const NON_US = /\b(canada|canadian|uk|united kingdom|england|ireland|europe|european|emea|apac|asia|india|latam|latin america|mexico|australia|philippines|brazil)\b/i;
const US_WORDS = /\b(u\.?s\.?a?\.?|united states|nationwide|anywhere in the (u\.?s\.?|united states))\b/i;
const RESTRICTED = /\b(must (reside|live|be located|be based) in|residents? of|restricted to|only (open )?to (candidates|residents)|eligible (states|locations)|(select|certain|specific|following) states|(tx|ca|ny|fl|wa|il|ga|nc|va|az|co|nj|ma) (and|or|,) (tx|ca|ny|fl|wa|il|ga|nc|va|az|co|nj|ma)\b)/i;

/** Mirrors the server's effectiveRemoteScope: the provider's scope wins; otherwise a conservative reading of the stated text. */
export function effectiveRemoteScope(l: { scope: string | null; location: string | null; note: string | null }): JobRemoteScope | null {
  if (l.scope === 'us' || l.scope === 'restricted' || l.scope === 'region') return l.scope;
  const t = `${l.location ?? ''} ${l.note ?? ''}`.trim();
  if (!t) return null;
  if (RESTRICTED.test(t)) return 'restricted';
  if (NON_US.test(t) && !US_WORDS.test(t)) return 'region';
  if (US_WORDS.test(t)) return 'us';
  return null;
}

/** Row selected by api/aiSources.ts (RLS). `description` is only present in the detail fetch. */
export interface JobLeadRow {
  finding_id: string; user_id: string; company: string; title: string; location: string | null; work_arrangement: string | null;
  employment_type: string | null; source_name: string | null; source_url: string | null; posted_date: string | null; discovered_at: string;
  /** AI-11D */
  posted_at?: string | null; freshness_at?: string | null; remote_scope?: string | null; remote_note?: string | null;
  experience_min_years?: number | null; experience_max_years?: number | null; fit_reasons?: unknown; gap_reasons?: unknown;
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
  /** AI-11D. Exact posting instant; null = unknown (never shown as today / now). */
  postedAt: string | null;
  freshnessAt: string | null;
  /** Remote geography (provider scope, else a conservative text reading); null = not remote or not stated. */
  remoteScope: JobRemoteScope | null;
  remoteNote: string | null;
  experienceMinYears: number | null; experienceMaxYears: number | null;
  /** Provider analysis, bounded. */
  fitReasons: string[]; gapReasons: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const list = (v: unknown, max = 30, maxLen = 100): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, max).map((x) => x.slice(0, maxLen)) : []);

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
    postedAt: text(r.posted_at, 40), freshnessAt: text(r.freshness_at, 40),
    remoteScope: r.work_arrangement === 'remote' ? effectiveRemoteScope({ scope: text(r.remote_scope, 12), location: text(r.location, 200), note: text(r.remote_note, 200) }) : null,
    remoteNote: text(r.remote_note, 200),
    experienceMinYears: typeof r.experience_min_years === 'number' ? r.experience_min_years : null,
    experienceMaxYears: typeof r.experience_max_years === 'number' ? r.experience_max_years : null,
    fitReasons: list(r.fit_reasons, 8, 200), gapReasons: list(r.gap_reasons, 8, 200),
  };
}

/** Arrangement as the user should read it: a remote role is NEVER shown as "Remote - US" unless its geography is known to be the US. */
export function arrangementDisplay(l: { arrangement: string | null; remoteScope: JobRemoteScope | null }): string {
  if (l.arrangement === 'remote') {
    return l.remoteScope === 'us' ? 'Remote — US' : l.remoteScope === 'restricted' ? 'Remote — restricted locations'
      : l.remoteScope === 'region' ? 'Remote — specific region' : 'Remote — location scope not stated';
  }
  return l.arrangement === 'hybrid' ? 'Hybrid' : l.arrangement === 'onsite' ? 'Onsite' : '';
}

/**
 * How old the posting is, from a TRUSTWORTHY timestamp only. A date-only posting reads as a date; no date reads as unknown.
 * Never "today" for a missing date.
 */
export function postedDisplay(l: { postedAt: string | null; postedDate: string | null }, nowMs: number): string {
  if (l.postedAt) {
    const t = Date.parse(l.postedAt);
    if (Number.isFinite(t)) {
      const mins = Math.max(0, Math.round((nowMs - t) / 60_000));
      if (mins < 60) return 'Posted just now';
      const hours = Math.floor(mins / 60);
      if (hours < 48) return `Posted ${hours}h ago`;
      return `Posted ${Math.floor(hours / 24)}d ago`;
    }
  }
  if (l.postedDate && DAY.test(l.postedDate)) return `Posted ${new Date(`${l.postedDate}T00:00:00Z`).toLocaleDateString(undefined, { dateStyle: 'medium', timeZone: 'UTC' })}`;
  return 'Posted date unknown';
}

export function experienceDisplay(l: { experienceMinYears: number | null; experienceMaxYears: number | null; experienceLevel: string | null }): string | null {
  const { experienceMinYears: min, experienceMaxYears: max } = l;
  if (min !== null && max !== null) return min === max ? `${min} years stated` : `${min}–${max} years stated`;
  if (min !== null) return `${min}+ years stated`;
  if (max !== null) return `up to ${max} years stated`;
  return l.experienceLevel;
}

/** Structured, provider-neutral export of one lead (the copy action). Same fields the page already shows. */
export function jobLeadExport(v: JobLeadView): Record<string, unknown> {
  return {
    company: v.company, title: v.title, location: v.location, work_arrangement: v.arrangement, employment_type: v.employmentType,
    source_name: v.sourceName, source_url: v.sourceUrl, posted_date: v.postedDate, posted_at: v.postedAt, remote_scope: v.remoteScope, discovered_at: v.discoveredAt, salary: v.salary,
    fit_reasons: v.fitReasons, gap_reasons: v.gapReasons,
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

export const RECRUITER_MODE_FILTERS = [{ id: 'ALL', label: 'All' }, { id: 'job_linked', label: 'Job-linked' }, { id: 'target_company', label: 'Target company' }] as const;
export const RECRUITER_VERIFICATION_FILTERS = [{ id: 'ALL', label: 'All' }, { id: 'verified', label: 'Verified' }, { id: 'uncertain', label: 'Uncertain' }] as const;
export type RecruiterModeFilter = (typeof RECRUITER_MODE_FILTERS)[number]['id'];
export type RecruiterVerificationFilter = (typeof RECRUITER_VERIFICATION_FILTERS)[number]['id'];
export interface RecruiterFilters {
  provider: string; status: SourceStatusFilter; search: string; company: string; discovered: DateRange;
  /** AI-11E. job_linked = researched for a stored lead; target_company = standing networking at a company on the owner's list. */
  mode: RecruiterModeFilter; verification: RecruiterVerificationFilter;
}
export const DEFAULT_RECRUITER_FILTERS: RecruiterFilters = { provider: 'ALL', status: 'ACTIVE', search: '', company: '', discovered: { from: '', to: '' }, mode: 'ALL', verification: 'ALL' };

export interface RecruiterRow {
  id: string; user_id: string; provider: string; status: string; confidence: number | string | null; title: string; summary: string | null;
  source_ref: Record<string, unknown> | null; created_at: string; updated_at?: string | null; payload: Record<string, unknown> | null;
}
export interface RecruiterView {
  id: string; ownerId: string; provider: string; status: string; name: string; roleTitle: string | null; company: string; relationship: string | null;
  verified: boolean; uncertainFields: string[]; sourceName: string | null; sourceUrl: string | null; profileUrl: string | null;
  contact: { email: string; sourceUrl: string } | null; summary: string | null; discoveredAt: string;
  relatedJobKey: string | null; relatedJobUrl: string | null; relatedJob: { company: string | null; title: string | null } | null;
  relatedLead: { id: string; company: string; title: string } | null; confidence: number | null;
  /** AI-11E. Last time JobQuest saw this person (a re-submission refreshes it); discoveredAt stays the first time. */
  lastSeenAt: string;
  /** Evidence-based reason (bounded). */
  why: string | null;
  verificationBasis: string | null;
  /** Checked by JobQuest at ingestion: job_linked or target_company. Null = neither could be shown (listed under "Other"). */
  discoveryMode: 'job_linked' | 'target_company' | null;
  postingContact: boolean;
  /** Draft text for the owner to review. JobQuest never sends it. */
  draftNote: string | null;
  draftEmail: { subject: string; body: string } | null;
}
export function toRecruiterView(r: RecruiterRow): RecruiterView {
  const payload = isObj(r.payload) ? r.payload : {};
  const ref = isObj(r.source_ref) ? r.source_ref : {};
  const related = isObj(payload.related_job) ? payload.related_job : {};
  const contactSource = safeHttpUrl(payload.contact_source_url);
  const email = text(payload.contact_email, 254);
  const draftEmail = isObj(payload.draft_email) ? payload.draft_email : {};
  const mode = payload.discovery_mode;
  const conf = typeof r.confidence === 'string' ? Number(r.confidence) : r.confidence;
  return {
    id: String(r.id), ownerId: String(r.user_id), provider: String(r.provider), status: String(r.status),
    name: text(payload.recruiter_name, 200) ?? String(r.title), roleTitle: text(payload.role_title, 200), company: text(payload.company, 200) ?? '',
    relationship: text(payload.relationship, 32), verified: payload.verification === 'verified', uncertainFields: list(payload.uncertain_fields, 5),
    sourceName: text(payload.source_name, 100), sourceUrl: safeHttpUrl(ref.url), profileUrl: safeHttpUrl(payload.profile_url),
    contact: contactSource && email ? { email, sourceUrl: contactSource } : null, summary: text(r.summary, 1000), discoveredAt: String(r.created_at),
    lastSeenAt: String(r.updated_at ?? r.created_at), why: text(payload.why, 300),
    verificationBasis: payload.verification === 'verified' ? text(payload.verification_basis, 32) : null,
    discoveryMode: mode === 'job_linked' || mode === 'target_company' ? mode : null, postingContact: payload.posting_contact === true,
    draftNote: text(payload.draft_note, 300),
    draftEmail: text(draftEmail.subject, 120) && text(draftEmail.body, 1200) ? { subject: text(draftEmail.subject, 120)!, body: text(draftEmail.body, 1200)! } : null,
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
  job_leads: 'Job discovery has not run yet. Describe the jobs you want under Settings → AI & Automation → Job Discovery, connect a provider and schedule its Job Discovery task; fresh, strong-fit leads appear here.',
  email: 'Email triage has not run yet. Connect Claude in Settings → AI & Automation and schedule the Email Triage task; classifications and summaries appear here (never message bodies).',
  recruiters: 'Recruiter research has not run yet. Choose target companies and roles under Settings → AI & Automation → Recruiter Intelligence, connect a provider and schedule its Recruiter Intelligence task; cited public findings appear here.',
  calendar: 'Calendar review has not run yet. Connect Claude in Settings → AI & Automation and schedule the Calendar Intelligence task; interviews, calls and deadlines it finds appear here. JobQuest never connects to your calendar and cannot change it.',
};
export const AI_MATCH_NOTE = 'AI match is the provider’s own estimate, not a measure JobQuest guarantees. A job lead is not an application.';
