// Browser-safe Daily Digest helpers (AI-5, AI-11C). Pure functions only (no fetching), so every
// state is unit-testable. Mirrors the server digest payload contract 1.0/1.1
// (apps/api/src/lib/aiContract/constants.ts); tests/unit/ai-5-digest-ui.test.ts and ai-11c-digest-ui.test.ts fail on drift.
//
// A digest is a STORED SNAPSHOT for one calendar date in the owner's profile time zone.
// Nothing here recomputes a historical digest from current application state.
import { safeHttpUrl } from './aiHub';
import { dayKey, isValidTimeZone } from './time';

/** Canonical (AI-11C) sections first, then the AI-5/6/7 sections still valid for provider-submitted digests. Mirrors the server. */
export const DIGEST_SECTION_KEYS = [
  'needs_attention', 'job_email', 'other_email', 'upcoming', 'job_leads', 'recruiter_intel', 'follow_ups',
  'applications', 'email_activity', 'calendar', 'ai_suggestions',
] as const;
export type DigestSectionKey = (typeof DIGEST_SECTION_KEYS)[number];
export type DigestSectionStatus = 'available' | 'zero' | 'not_configured' | 'unavailable';
export const DIGEST_SECTION_STATUS_VALUES: readonly DigestSectionStatus[] = ['available', 'zero', 'not_configured', 'unavailable'];
export const DIGEST_SUMMARY_KEYS = [
  'applications_added', 'active_applications', 'new_job_leads', 'strong_matches', 'recruiter_replies',
  'interviews', 'assessments', 'follow_ups', 'pending_suggestions', 'new_findings', 'calendar_today', 'calendar_deadlines',
  'needs_attention', 'job_emails', 'other_emails', 'upcoming', 'recent_jobs', 'recruiters',
] as const;
export const DIGEST_SECTION_ITEM_LIMITS: Readonly<Record<string, number>> = {
  needs_attention: 6, job_email: 8, other_email: 4, upcoming: 6, job_leads: 6, recruiter_intel: 4, follow_ups: 5,
};
export const DIGEST_DEFAULT_ITEM_LIMIT = 5;
export const DIGEST_MAX_RANGE_DAYS = 366;

/** The canonical Daily Digest layout (AI-11C): what needs attention first, then email, what is coming, leads, people, follow-ups. */
export const DIGEST_CANONICAL_ORDER: ReadonlyArray<{ key: DigestSectionKey; title: string; tab?: string }> = [
  { key: 'needs_attention', title: 'Needs attention' },
  { key: 'job_email', title: 'Job-related email', tab: '/ai-hub/email' },
  { key: 'other_email', title: 'Other important email', tab: '/ai-hub/email' },
  { key: 'upcoming', title: 'Upcoming', tab: '/ai-hub/calendar' },
  { key: 'job_leads', title: 'Recent job leads', tab: '/ai-hub/job-leads' },
  { key: 'recruiter_intel', title: 'Recruiters', tab: '/ai-hub/recruiters' },
  { key: 'follow_ups', title: 'Follow-ups' },
];
const CANONICAL_ONLY = new Set<string>(['needs_attention', 'job_email', 'other_email']);

/** Display order of digests written before AI-11C (payload 1.0, e.g. provider narratives): unchanged. */
export const DIGEST_SECTION_ORDER: ReadonlyArray<{ key: DigestSectionKey; title: string }> = [
  { key: 'applications', title: 'Applications' },
  { key: 'follow_ups', title: 'Follow-ups' },
  { key: 'job_leads', title: 'Job Leads' },
  { key: 'email_activity', title: 'Email Activity' },
  { key: 'recruiter_intel', title: 'Recruiter Intelligence' },
  { key: 'calendar', title: 'Calendar' },
  { key: 'upcoming', title: 'Upcoming' },
  { key: 'ai_suggestions', title: 'AI Suggestions' },
];

export const DIGEST_SUMMARY_LABELS: Record<string, string> = {
  applications_added: 'Applications added', active_applications: 'Active applications', new_job_leads: 'New job leads',
  strong_matches: 'Strong matches', recruiter_replies: 'Recruiter replies', interviews: 'Interviews', assessments: 'Assessments',
  follow_ups: 'Follow-ups', pending_suggestions: 'Pending suggestions', new_findings: 'New AI findings',
  calendar_today: 'Calendar events today', calendar_deadlines: 'Deadlines this week',
  needs_attention: 'Need attention', job_emails: 'Job emails', other_emails: 'Other emails', upcoming: 'Upcoming',
  recent_jobs: 'Recent jobs', recruiters: 'Recruiters',
};
/** Headline metrics of a canonical digest, in the product order. */
export const DIGEST_HEADLINE_KEYS = ['needs_attention', 'job_emails', 'upcoming', 'recent_jobs', 'recruiters', 'follow_ups'] as const;

const SOURCE_LABELS: Record<string, string> = {
  jobquest: 'JobQuest', gmail: 'Email', calendar: 'Calendar', web: 'Web', job_site: 'Job site',
  recruiter_message: 'Recruiter message', drive: 'Drive', provider: 'AI provider', other: 'Other',
};
export const digestSourceLabel = (s: string | undefined) => (s ? SOURCE_LABELS[s] ?? 'Other' : '');

export const DIGEST_SECTION_STATUS_LABELS: Record<DigestSectionStatus, string> = {
  available: 'Available', zero: 'None found', not_configured: 'Not configured', unavailable: 'Unavailable',
};

export type DigestUrgency = 'HIGH' | 'MEDIUM' | 'LOW';
export const DIGEST_URGENCIES: readonly DigestUrgency[] = ['HIGH', 'MEDIUM', 'LOW'];
export interface DigestItem {
  title: string; detail?: string; priority?: string; source?: string; url?: string; occurredAt?: string;
  /** 1.1 (all optional). */
  kind?: string; company?: string; urgency?: DigestUrgency; deadlineAt?: string; action?: string; score?: number; tags?: string[];
  ref?: { type: string; id: string };
  /** Authoritative link to one of the owner's applications. Only kept for JobQuest-composed (system) digests. */
  application?: { id: string; label: string };
  /** This item is also listed under Needs attention (so the section can show it as a reference, not a second record). */
  attention?: boolean;
  verification?: 'verified' | 'uncertain';
  /** Providers that reported this item (combined view only). */
  providers?: string[];
}
export interface DigestSection { status: DigestSectionStatus; count: number | null; items: DigestItem[] }
export interface ParsedDigest {
  version: string;
  digestDate: string;
  timeZone: string | null;
  generatedAt: string | null;
  summary: Array<{ key: string; label: string; value: number }>;
  priorities: DigestItem[];
  sections: Partial<Record<DigestSectionKey, DigestSection>>;
  /** True when the digest uses the AI-11C layout (it carries a canonical-only section). */
  canonical: boolean;
}

/** Row shape selected by api/aiDigest.ts (RLS). */
export interface DigestRow {
  id: string; user_id: string; provider: string; status: string; title: string; summary: string | null;
  created_at: string; payload: Record<string, unknown> | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isCalendarDay = (v: unknown): v is string =>
  typeof v === 'string' && DATE.test(v) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validInstant = (v: unknown): string | undefined => { const t = str(v, 40); return t && !Number.isNaN(Date.parse(t)) ? t : undefined; };

/** `trustLinks`: the payload was composed by JobQuest itself (provider system); only then is an application link authoritative. */
function parseItem(raw: unknown, trustLinks: boolean): DigestItem | null {
  if (!isObj(raw)) return null;
  const title = str(raw.title, 200);
  if (!title) return null;
  const item: DigestItem = { title };
  const detail = str(raw.detail, 300); if (detail) item.detail = detail;
  const priority = str(raw.priority, 16); if (priority) item.priority = priority;
  const source = str(raw.source, 32); if (source) item.source = source;
  const url = safeHttpUrl(raw.url); if (url) item.url = url;
  const at = validInstant(raw.occurred_at); if (at) item.occurredAt = at;
  const kind = str(raw.kind, 32); if (kind && /^[a-z][a-z0-9_]*$/.test(kind)) item.kind = kind;
  const company = str(raw.company, 80); if (company) item.company = company;
  const urgency = DIGEST_URGENCIES.find((u) => u === raw.urgency); if (urgency) item.urgency = urgency;
  const deadline = validInstant(raw.deadline_at); if (deadline) item.deadlineAt = deadline;
  const action = str(raw.action, 160); if (action) item.action = action;
  if (typeof raw.score === 'number' && Number.isInteger(raw.score) && raw.score >= 0 && raw.score <= 100) item.score = raw.score;
  if (Array.isArray(raw.tags)) { const tags = raw.tags.map((t) => str(t, 30)).filter((t): t is string => Boolean(t)).slice(0, 3); if (tags.length) item.tags = tags; }
  if (isObj(raw.ref) && typeof raw.ref.type === 'string' && typeof raw.ref.id === 'string' && UUID.test(raw.ref.id)) item.ref = { type: raw.ref.type.slice(0, 16), id: raw.ref.id.toLowerCase() };
  if (trustLinks && isObj(raw.application) && typeof raw.application.id === 'string' && UUID.test(raw.application.id)) {
    const label = str(raw.application.label, 120);
    if (label) item.application = { id: raw.application.id.toLowerCase(), label };
  }
  if (raw.attention === true) item.attention = true;
  if (raw.verification === 'verified' || raw.verification === 'uncertain') item.verification = raw.verification;
  return item;
}
const parseItems = (raw: unknown, max: number, trustLinks: boolean): DigestItem[] =>
  (Array.isArray(raw) ? raw : []).slice(0, max).map((x) => parseItem(x, trustLinks)).filter((i): i is DigestItem => i !== null);

/**
 * Untrusted stored payload -> display model. Returns null for anything that is not a
 * 1.x digest (legacy/unknown payloads render as "unsupported", never as guesses).
 */
export function parseDigestPayload(payload: unknown, provider?: string): ParsedDigest | null {
  if (!isObj(payload)) return null;
  const trustLinks = provider === 'system';
  const version = str(payload.version, 8);
  if (!version || !/^1\.\d+$/.test(version)) return null;
  if (!isCalendarDay(payload.digest_date)) return null;
  const summary: ParsedDigest['summary'] = [];
  if (isObj(payload.summary)) {
    for (const key of DIGEST_SUMMARY_KEYS) {
      const v = payload.summary[key];
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0) summary.push({ key, label: DIGEST_SUMMARY_LABELS[key]!, value: v });
    }
  }
  const sections: ParsedDigest['sections'] = {};
  if (isObj(payload.sections)) {
    for (const key of DIGEST_SECTION_KEYS) {
      const raw = payload.sections[key];
      if (!isObj(raw)) continue;
      const status = DIGEST_SECTION_STATUS_VALUES.find((s) => s === raw.status);
      if (!status) continue;
      const items = status === 'available' ? parseItems(raw.items, DIGEST_SECTION_ITEM_LIMITS[key] ?? DIGEST_DEFAULT_ITEM_LIMIT, trustLinks) : [];
      const count = typeof raw.count === 'number' && Number.isInteger(raw.count) && raw.count >= 0 ? raw.count : null;
      sections[key] = { status, count, items };
    }
  }
  const tz = str(payload.time_zone, 64);
  return {
    version,
    digestDate: payload.digest_date,
    timeZone: tz && isValidTimeZone(tz) ? tz : null,
    generatedAt: str(payload.generated_at, 40) ?? null,
    summary,
    priorities: parseItems(payload.priorities, 8, trustLinks),
    sections,
    canonical: Object.keys(sections).some((k) => CANONICAL_ONLY.has(k)),
  };
}

// ---- combined ("All providers") view -----------------------------------------------------

const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3, INFO: 4 };
const STATUS_RANK: Record<DigestSectionStatus, number> = { available: 0, zero: 1, unavailable: 2, not_configured: 3 };

function mergeItems(lists: Array<{ provider: string; items: DigestItem[] }>): DigestItem[] {
  const byKey = new Map<string, DigestItem>();
  for (const { provider, items } of lists) {
    for (const it of items) {
      const key = `${it.ref?.id ?? it.title.toLowerCase()}|${it.source ?? ''}`;
      const existing = byKey.get(key);
      if (existing) existing.providers = [...new Set([...(existing.providers ?? []), provider])];
      else byKey.set(key, { ...it, providers: [provider] });
    }
  }
  return [...byKey.values()].sort((a, b) => (PRIORITY_RANK[a.priority ?? 'NORMAL'] ?? 2) - (PRIORITY_RANK[b.priority ?? 'NORMAL'] ?? 2));
}

/**
 * Deterministic merge of same-date digests from several providers. Counts take the MAX
 * across providers (providers often observe the same facts, so summing would double
 * count); items are deduplicated by title+source and keep the providers that reported
 * them; a section's status is the most informative one reported by any provider
 * (available > none found > not configured). No model is involved.
 */
export function combineDigests(entries: Array<{ provider: string; digest: ParsedDigest }>): ParsedDigest {
  const first = entries[0]!.digest;
  const summaryMax = new Map<string, { label: string; value: number }>();
  for (const { digest } of entries) for (const s of digest.summary) {
    const cur = summaryMax.get(s.key);
    if (!cur || s.value > cur.value) summaryMax.set(s.key, { label: s.label, value: s.value });
  }
  const summary = DIGEST_SUMMARY_KEYS.filter((k) => summaryMax.has(k)).map((k) => ({ key: k, label: summaryMax.get(k)!.label, value: summaryMax.get(k)!.value }));
  const sections: ParsedDigest['sections'] = {};
  for (const key of DIGEST_SECTION_KEYS) {
    const present = entries.map((e) => ({ provider: e.provider, section: e.digest.sections[key] })).filter((x): x is { provider: string; section: DigestSection } => Boolean(x.section));
    if (present.length === 0) continue;
    const status = present.map((p) => p.section.status).sort((a, b) => STATUS_RANK[a] - STATUS_RANK[b])[0]!;
    const counts = present.map((p) => p.section.count).filter((c): c is number => c !== null);
    sections[key] = {
      status,
      count: counts.length ? Math.max(...counts) : null,
      items: status === 'available' ? mergeItems(present.map((p) => ({ provider: p.provider, items: p.section.items }))) : [],
    };
  }
  const generated = entries.map((e) => e.digest.generatedAt).filter((g): g is string => g !== null).sort().pop() ?? null;
  return {
    version: first.version, digestDate: first.digestDate, timeZone: first.timeZone, generatedAt: generated, summary,
    priorities: mergeItems(entries.map((e) => ({ provider: e.provider, items: e.digest.priorities }))).slice(0, 8), sections,
    canonical: entries.some((e) => e.digest.canonical),
  };
}

// ---- dates ---------------------------------------------------------------------------------

export function shiftDay(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
export const todayKey = (now: Date, timeZone: string): string => dayKey(now.getTime(), isValidTimeZone(timeZone) ? timeZone : 'UTC');

export type DigestPreset = 'today' | 'yesterday' | 'last7' | 'custom';
export const DIGEST_PRESETS: ReadonlyArray<{ id: DigestPreset; label: string }> = [
  { id: 'today', label: 'Today' }, { id: 'yesterday', label: 'Yesterday' }, { id: 'last7', label: 'Last 7 days' }, { id: 'custom', label: 'Custom range' },
];
export type DigestRange = { ok: true; dateFrom: string; dateTo: string } | { ok: false; message: string };

export function resolveDigestRange(preset: DigestPreset, today: string, custom: { from: string; to: string }): DigestRange {
  if (preset === 'today') return { ok: true, dateFrom: today, dateTo: today };
  if (preset === 'yesterday') { const y = shiftDay(today, -1); return { ok: true, dateFrom: y, dateTo: y }; }
  if (preset === 'last7') return { ok: true, dateFrom: shiftDay(today, -6), dateTo: today };
  if (!isCalendarDay(custom.from) || !isCalendarDay(custom.to)) return { ok: false, message: 'Choose a start and end date.' };
  if (custom.from > custom.to) return { ok: false, message: 'The start date must be on or before the end date.' };
  if ((Date.parse(`${custom.to}T00:00:00Z`) - Date.parse(`${custom.from}T00:00:00Z`)) / 86_400_000 > DIGEST_MAX_RANGE_DAYS) {
    return { ok: false, message: `Choose a range of at most ${DIGEST_MAX_RANGE_DAYS} days.` };
  }
  return { ok: true, dateFrom: custom.from, dateTo: custom.to };
}

/** "Saturday, October 11, 2026" from a calendar day key (no time zone conversion). */
export function formatDigestDate(key: string): string {
  if (!isCalendarDay(key)) return '';
  return new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

// ---- grouping ----------------------------------------------------------------------------------

export interface DigestEntry { id: string; provider: string; status: string; title: string; createdAt: string; digest: ParsedDigest | null }
export interface DigestDayGroup { date: string; entries: DigestEntry[] }

export function toDigestEntry(row: DigestRow): DigestEntry {
  return { id: row.id, provider: row.provider, status: row.status, title: row.title, createdAt: row.created_at, digest: parseDigestPayload(row.payload, row.provider) };
}

/** Groups newest-date-first. Rows whose payload is unsupported fall back to their created date. */
export function groupDigestsByDate(rows: DigestRow[]): DigestDayGroup[] {
  const groups = new Map<string, DigestEntry[]>();
  for (const row of rows) {
    const entry = toDigestEntry(row);
    const date = entry.digest?.digestDate ?? (isCalendarDay(row.created_at.slice(0, 10)) ? row.created_at.slice(0, 10) : '');
    groups.set(date, [...(groups.get(date) ?? []), entry]);
  }
  return [...groups.entries()].sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0)).map(([date, entries]) => ({ date, entries }));
}

/** Provider options for the filter. */
export const DIGEST_PROVIDER_FILTERS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'ALL', label: 'All providers' }, { id: 'claude', label: 'Claude' }, { id: 'chatgpt', label: 'ChatGPT' },
  { id: 'gemini', label: 'Gemini' }, { id: 'system', label: 'JobQuest' },
];
export const digestProviderLabel = (id: string) => DIGEST_PROVIDER_FILTERS.find((p) => p.id === id)?.label ?? (id === 'manual' ? 'Manual' : 'Unknown');

/** Sections to render, in order: the canonical layout (plus any legacy section a provider added), or the legacy order. */
export function digestLayout(d: ParsedDigest): Array<{ key: DigestSectionKey; title: string; tab?: string }> {
  const legacy = DIGEST_SECTION_ORDER.filter(({ key }) => !DIGEST_CANONICAL_ORDER.some((c) => c.key === key));
  return (d.canonical ? [...DIGEST_CANONICAL_ORDER, ...legacy] : [...DIGEST_SECTION_ORDER]).filter(({ key }) => d.sections[key] !== undefined);
}

/** Header line summarising which sources reported what (never collapses zero, unavailable and not-configured). */
export function sourceAvailability(d: ParsedDigest): Array<{ key: DigestSectionKey; title: string; status: DigestSectionStatus }> {
  return digestLayout(d).flatMap(({ key, title }) => {
    const s = d.sections[key];
    return s ? [{ key, title, status: s.status }] : [];
  });
}

/** The headline counts of a canonical digest (need attention, job emails, upcoming, recent jobs, recruiters, follow-ups); only reported ones. */
export function headlineMetrics(d: ParsedDigest): Array<{ key: string; label: string; value: number }> {
  return DIGEST_HEADLINE_KEYS.flatMap((k) => d.summary.filter((m) => m.key === k));
}

/** Items grouped HIGH / MEDIUM / LOW in that order; items without an urgency count as MEDIUM. Empty groups are omitted. */
export function groupByUrgency(items: DigestItem[]): Array<{ urgency: DigestUrgency; items: DigestItem[] }> {
  return DIGEST_URGENCIES.map((urgency) => ({ urgency, items: items.filter((i) => (i.urgency ?? 'MEDIUM') === urgency) })).filter((g) => g.items.length > 0);
}

/** How many more records exist than the snapshot lists ("Showing 5 of 12"). 0 when the count is unknown or complete. */
export const hiddenCount = (section: DigestSection): number => (section.count !== null && section.count > section.items.length ? section.count - section.items.length : 0);

// ---- labels (canonical layout) -------------------------------------------------------------------------------------

/** Plain-language type of an item. Email categories, calendar categories and JobQuest record kinds share one map. */
export const DIGEST_KIND_LABELS: Record<string, string> = {
  recruiter_reply: 'Recruiter reply', application_confirmation: 'Application confirmation', interview: 'Interview', interview_scheduling: 'Interview scheduling',
  assessment: 'Assessment', follow_up: 'Follow-up', status_update: 'Status update', rejection: 'Rejection', offer: 'Offer', other_job_search: 'Job-search email',
  important_account: 'Important account', notification: 'Notification', newsletter: 'Newsletter', other: 'Other mail',
  recruiter_call: 'Recruiter call', hiring_manager_call: 'Hiring manager call', networking_call: 'Networking call', assessment_deadline: 'Assessment due',
  application_deadline: 'Application deadline', take_home_deadline: 'Take-home due',
  application_follow_up: 'Application follow-up', task: 'Task', job_lead: 'Job lead', recruiter: 'Recruiter',
};
export const digestKindLabel = (kind: string | undefined): string =>
  kind ? DIGEST_KIND_LABELS[kind] ?? kind.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '';

/** Honest empty/unavailable copy per section: "nothing found" is never confused with "could not check". */
const EMPTY_ZERO: Partial<Record<DigestSectionKey, string>> = {
  needs_attention: 'Nothing needs your attention in the sources JobQuest checked.',
  job_email: 'No job-related email found in this period.',
  other_email: 'No other important email found in this period.',
  upcoming: 'Nothing scheduled in the next 7 days.',
  job_leads: 'No recent job leads. JobQuest only lists leads that a saved job-discovery run already stored.',
  recruiter_intel: 'No recruiter intelligence stored yet. JobQuest does not look people up here.',
  follow_ups: 'No follow-ups are due.',
};
export function digestEmptyText(key: DigestSectionKey, status: DigestSectionStatus): string {
  if (status === 'zero') return EMPTY_ZERO[key] ?? 'Checked: nothing to report.';
  if (status === 'unavailable') return 'The last run for this source failed, so nothing could be checked.';
  if (status === 'not_configured') return 'This source is not configured yet, so nothing was checked.';
  return '';
}
