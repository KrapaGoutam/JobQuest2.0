// Browser-safe Daily Digest helpers (AI-5). Pure functions only (no fetching), so every
// state is unit-testable. Mirrors the server digest payload contract 1.0
// (apps/api/src/lib/aiContract/constants.ts); tests/unit/ai-5-digest-ui.test.ts fails on drift.
//
// A digest is a STORED SNAPSHOT for one calendar date in the owner's profile time zone.
// Nothing here recomputes a historical digest from current application state.
import { safeHttpUrl } from './aiHub';
import { dayKey, isValidTimeZone } from './time';

export const DIGEST_SECTION_KEYS = ['applications', 'job_leads', 'email_activity', 'recruiter_intel', 'calendar', 'upcoming', 'follow_ups', 'ai_suggestions'] as const;
export type DigestSectionKey = (typeof DIGEST_SECTION_KEYS)[number];
export type DigestSectionStatus = 'available' | 'zero' | 'not_configured';
export const DIGEST_SECTION_STATUS_VALUES: readonly DigestSectionStatus[] = ['available', 'zero', 'not_configured'];
export const DIGEST_SUMMARY_KEYS = [
  'applications_added', 'active_applications', 'new_job_leads', 'strong_matches', 'recruiter_replies',
  'interviews', 'assessments', 'follow_ups', 'pending_suggestions', 'new_findings', 'calendar_today', 'calendar_deadlines',
] as const;
export const DIGEST_MAX_RANGE_DAYS = 366;

/** Display order requested by the product: priorities first, then applications/follow-ups, leads, email, recruiters, upcoming, suggestions. */
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
};

const SOURCE_LABELS: Record<string, string> = {
  jobquest: 'JobQuest', gmail: 'Email', calendar: 'Calendar', web: 'Web', job_site: 'Job site',
  recruiter_message: 'Recruiter message', drive: 'Drive', provider: 'AI provider', other: 'Other',
};
export const digestSourceLabel = (s: string | undefined) => (s ? SOURCE_LABELS[s] ?? 'Other' : '');

export const DIGEST_SECTION_STATUS_LABELS: Record<DigestSectionStatus, string> = {
  available: 'Available', zero: 'None found', not_configured: 'Not configured',
};

export interface DigestItem {
  title: string; detail?: string; priority?: string; source?: string; url?: string; occurredAt?: string;
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

function parseItem(raw: unknown): DigestItem | null {
  if (!isObj(raw)) return null;
  const title = str(raw.title, 200);
  if (!title) return null;
  const item: DigestItem = { title };
  const detail = str(raw.detail, 300); if (detail) item.detail = detail;
  const priority = str(raw.priority, 16); if (priority) item.priority = priority;
  const source = str(raw.source, 32); if (source) item.source = source;
  const url = safeHttpUrl(raw.url); if (url) item.url = url;
  const at = str(raw.occurred_at, 40); if (at && !Number.isNaN(Date.parse(at))) item.occurredAt = at;
  return item;
}
const parseItems = (raw: unknown, max: number): DigestItem[] =>
  (Array.isArray(raw) ? raw : []).slice(0, max).map(parseItem).filter((i): i is DigestItem => i !== null);

/**
 * Untrusted stored payload -> display model. Returns null for anything that is not a
 * 1.x digest (legacy/unknown payloads render as "unsupported", never as guesses).
 */
export function parseDigestPayload(payload: unknown): ParsedDigest | null {
  if (!isObj(payload)) return null;
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
      const items = status === 'available' ? parseItems(raw.items, 5) : [];
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
    priorities: parseItems(payload.priorities, 8),
    sections,
  };
}

// ---- combined ("All providers") view -----------------------------------------------------

const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3, INFO: 4 };
const STATUS_RANK: Record<DigestSectionStatus, number> = { available: 0, zero: 1, not_configured: 2 };

function mergeItems(lists: Array<{ provider: string; items: DigestItem[] }>): DigestItem[] {
  const byKey = new Map<string, DigestItem>();
  for (const { provider, items } of lists) {
    for (const it of items) {
      const key = `${it.title.toLowerCase()}|${it.source ?? ''}`;
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
  return { id: row.id, provider: row.provider, status: row.status, title: row.title, createdAt: row.created_at, digest: parseDigestPayload(row.payload) };
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

/** Header line summarising which sources reported what (never collapses zero and not-configured). */
export function sourceAvailability(d: ParsedDigest): Array<{ key: DigestSectionKey; title: string; status: DigestSectionStatus }> {
  return DIGEST_SECTION_ORDER.flatMap(({ key, title }) => {
    const s = d.sections[key];
    return s ? [{ key, title, status: s.status }] : [];
  });
}
