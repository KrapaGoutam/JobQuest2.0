// AI-11H: browser-side model of the Weekly Digest (GET /api/ai/digest/weekly). Presentation only: the server builds the report from the
// owner's records (see apps/api/src/services/aiWeeklyDigestService.ts) and decides every boundary; nothing here recomputes a figure.
// The shapes mirror apps/api/src/lib/aiContract/weekly.ts (tests/unit/ai-11h-weekly-ui.test.ts fails on drift).

export const WEEKLY_SECTION_KEYS = [
  'at_a_glance', 'applications', 'interviews', 'job_email', 'job_leads', 'recruiters', 'tasks', 'goals', 'automation_health', 'attention_next',
] as const;
export type WeeklySectionKey = (typeof WEEKLY_SECTION_KEYS)[number];
export type WeeklySectionStatus = 'available' | 'zero' | 'not_configured' | 'unavailable';

export interface WeeklyItem { title: string; detail: string | null; at: string | null }
export interface WeeklyMetric { label: string; value: string }
export interface WeeklySection {
  key: WeeklySectionKey; title: string; status: WeeklySectionStatus; count: number | null; headline: string; metrics: WeeklyMetric[]; items: WeeklyItem[];
}
export interface WeeklyDigest {
  version: '1.0';
  kind: 'weekly_digest';
  weekStart: string;
  currentWeekStart: string;
  oldestWeekStart: string;
  weekEnd: string;
  timeZone: string;
  windowStart: string;
  windowEnd: string;
  inProgress: boolean;
  throughAt: string;
  generatedAt: string;
  sections: WeeklySection[];
  notes: string[];
}

export const WEEKLY_STATUS_LABELS: Record<WeeklySectionStatus, string> = {
  available: 'Has activity', zero: 'Nothing this week', not_configured: 'Not set up', unavailable: 'Could not be checked',
};
export const WEEKLY_STATUS_HELP: Record<WeeklySectionStatus, string> = {
  available: '',
  zero: 'Checked: nothing to report.',
  not_configured: 'This source is not set up yet, so nothing was checked.',
  unavailable: 'The source could not be checked (its latest run failed). That is unknown, not zero.',
};
export const weeklyStatusVariant = (s: WeeklySectionStatus): 'success' | 'info' | 'warning' | 'muted' =>
  (s === 'available' ? 'success' : s === 'zero' ? 'info' : s === 'unavailable' ? 'warning' : 'muted');

const shift = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
export const previousWeek = (d: Pick<WeeklyDigest, 'weekStart' | 'oldestWeekStart'>): string | null => (d.weekStart > d.oldestWeekStart ? shift(d.weekStart, -7) : null);
export const nextWeek = (d: Pick<WeeklyDigest, 'weekStart' | 'currentWeekStart'>): string | null => (d.weekStart < d.currentWeekStart ? shift(d.weekStart, 7) : null);

/** "Oct 12 – Oct 18, 2026" from two calendar dates (no time zone conversion: they are already owner-local dates). */
export function formatWeekRange(weekStart: string, weekEnd: string): string {
  const f = (d: string, year: boolean) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) }).format(new Date(`${d}T00:00:00Z`));
  return `${f(weekStart, false)} – ${f(weekEnd, true)}`;
}

/** Sections the page renders, in the canonical order, skipping anything unknown (forward compatible). */
export function orderedWeeklySections(list: readonly WeeklySection[]): WeeklySection[] {
  return WEEKLY_SECTION_KEYS.flatMap((k) => list.filter((s) => s.key === k));
}
