// AI-11D: browser-side Job Discovery profile helpers. Browser-safe mirror of apps/api/src/lib/aiContract/discovery.ts
// (tests/unit/ai-11d-discovery-ui.test.ts fails on drift). The server is the validation authority: this file only
// pre-checks so the form can point at a field before the round trip.
//
// The profile defines WHAT jobs the user wants. WHO searches (a provider) and WHEN (an automation) are separate
// concepts configured elsewhere on the same Settings page; nothing here carries credentials or provider details.
import { AI_SOURCE_STATUSES, DISCOVERY_FRESHNESS_HOURS, JOB_EMPLOYMENT_TYPES, JOB_WORK_ARRANGEMENTS, type AiSourceStatus } from './aiSources';

export const DISCOVERY_LIMITS = {
  titles: 20, titleChars: 80, cities: 5, cityChars: 80, exclusions: 20, exclusionChars: 40, skills: 20, skillChars: 60,
  maxResultsMax: 25, maxExperienceYears: 30, toleranceYears: 5,
} as const;

export interface JobDiscoveryProfile {
  targetTitles: string[];
  includeRestrictedRemote: boolean;
  cities: string[];
  workArrangements: string[];
  employmentTypes: string[];
  freshnessWindowHours: number;
  allowUnknownPostedDate: boolean;
  maxExperienceYears: number | null;
  experienceToleranceYears: number;
  excludedTitleTerms: string[];
  excludeClearance: boolean;
  softwareQaGate: boolean;
  minimumMatchScore: number;
  maximumResults: number;
  coreSkills: string[];
}

/** Generic starting point (mirrors the server default): no role, no city, remote only. */
export const DEFAULT_DISCOVERY_PROFILE: JobDiscoveryProfile = {
  targetTitles: [], includeRestrictedRemote: false, cities: [], workArrangements: ['remote'], employmentTypes: ['full_time'],
  freshnessWindowHours: 24, allowUnknownPostedDate: false, maxExperienceYears: null, experienceToleranceYears: 0,
  excludedTitleTerms: ['Senior', 'Sr', 'Lead', 'Principal', 'Staff', 'Manager', 'Director'], excludeClearance: true,
  softwareQaGate: false, minimumMatchScore: 0, maximumResults: 15, coreSkills: [],
};

/**
 * A convenience PRESET the user can load into the form (then edit and save). It is data in the browser, not behaviour in
 * JobQuest: nothing server-side knows about it.
 */
export const QA_TESTING_PRESET: Partial<JobDiscoveryProfile> = {
  targetTitles: [
    'QA Engineer', 'Quality Assurance Engineer', 'QA Analyst', 'Software QA Engineer', 'Software Test Engineer', 'Test Engineer',
    'QA Automation Engineer', 'Automation Test Engineer', 'SDET', 'Software Development Engineer in Test', 'Software Tester', 'Quality Engineer',
  ],
  workArrangements: ['remote', 'hybrid'], cities: ['Houston, TX'], softwareQaGate: true,
  coreSkills: ['Selenium', 'Playwright', 'Cypress', 'API testing', 'Postman', 'SQL', 'Agile', 'CI/CD'],
};

export const FRESHNESS_LABELS: Record<number, string> = { 12: 'Last 12 hours', 24: 'Last 24 hours', 48: 'Last 48 hours', 72: 'Last 72 hours' };
export const ARRANGEMENT_LABELS: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'Onsite' };
export const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', temporary: 'Temporary', internship: 'Internship', freelance: 'Freelance', other: 'Other',
};
export const SOURCE_STATUS_LABELS: Record<AiSourceStatus, string> = {
  ok: 'searched, results found', zero: 'searched, nothing found', blocked: 'blocked', unavailable: 'unavailable', error: 'error', skipped: 'skipped',
};

/** The editable form: text areas hold one entry per line, numbers are strings until validated. */
export interface DiscoveryFormState {
  targetTitles: string; includeRestrictedRemote: boolean; cities: string; workArrangements: string[]; employmentTypes: string[];
  freshnessWindowHours: string; allowUnknownPostedDate: boolean; maxExperienceYears: string; experienceToleranceYears: string;
  excludedTitleTerms: string; excludeClearance: boolean; softwareQaGate: boolean; minimumMatchScore: string; maximumResults: string; coreSkills: string;
}
export type DiscoveryFormErrors = Partial<Record<keyof DiscoveryFormState, string>>;

const lines = (s: string): string[] => s.split(/\r?\n/).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
const dedupe = (xs: string[]): string[] => xs.filter((x, i) => xs.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);

export function profileToForm(p: JobDiscoveryProfile): DiscoveryFormState {
  return {
    targetTitles: p.targetTitles.join('\n'), includeRestrictedRemote: p.includeRestrictedRemote, cities: p.cities.join('\n'),
    workArrangements: [...p.workArrangements], employmentTypes: [...p.employmentTypes], freshnessWindowHours: String(p.freshnessWindowHours),
    allowUnknownPostedDate: p.allowUnknownPostedDate, maxExperienceYears: p.maxExperienceYears === null ? '' : String(p.maxExperienceYears),
    experienceToleranceYears: String(p.experienceToleranceYears), excludedTitleTerms: p.excludedTitleTerms.join('\n'), excludeClearance: p.excludeClearance,
    softwareQaGate: p.softwareQaGate, minimumMatchScore: String(p.minimumMatchScore), maximumResults: String(p.maximumResults), coreSkills: p.coreSkills.join('\n'),
  };
}

export function formToProfile(f: DiscoveryFormState): JobDiscoveryProfile {
  const int = (s: string): number => (s.trim() === '' ? NaN : Number(s));
  return {
    targetTitles: dedupe(lines(f.targetTitles)), includeRestrictedRemote: f.includeRestrictedRemote, cities: dedupe(lines(f.cities)),
    workArrangements: [...f.workArrangements], employmentTypes: [...f.employmentTypes], freshnessWindowHours: int(f.freshnessWindowHours),
    allowUnknownPostedDate: f.allowUnknownPostedDate, maxExperienceYears: f.maxExperienceYears.trim() === '' ? null : int(f.maxExperienceYears),
    experienceToleranceYears: int(f.experienceToleranceYears), excludedTitleTerms: dedupe(lines(f.excludedTitleTerms)), excludeClearance: f.excludeClearance,
    softwareQaGate: f.softwareQaGate, minimumMatchScore: int(f.minimumMatchScore), maximumResults: int(f.maximumResults), coreSkills: dedupe(lines(f.coreSkills)),
  };
}

export function applyPreset(form: DiscoveryFormState, preset: Partial<JobDiscoveryProfile>): DiscoveryFormState {
  return profileToForm({ ...formToProfileLoose(form), ...preset });
}
/** Like formToProfile but never NaN (used only to re-render the form after a preset). */
function formToProfileLoose(f: DiscoveryFormState): JobDiscoveryProfile {
  const p = formToProfile(f);
  const num = (n: number, d: number) => (Number.isFinite(n) ? n : d);
  return { ...p, freshnessWindowHours: num(p.freshnessWindowHours, 24), experienceToleranceYears: num(p.experienceToleranceYears, 0), minimumMatchScore: num(p.minimumMatchScore, 0), maximumResults: num(p.maximumResults, 15), maxExperienceYears: p.maxExperienceYears !== null && Number.isFinite(p.maxExperienceYears) ? p.maxExperienceYears : null };
}

export function validateDiscoveryForm(f: DiscoveryFormState): DiscoveryFormErrors {
  const e: DiscoveryFormErrors = {};
  const L = DISCOVERY_LIMITS;
  const p = formToProfile(f);
  const tooLong = (xs: string[], n: number) => xs.some((x) => [...x].length > n);
  if (p.targetTitles.length > L.titles) e.targetTitles = `At most ${L.titles} titles.`;
  else if (tooLong(p.targetTitles, L.titleChars)) e.targetTitles = `Each title is at most ${L.titleChars} characters.`;
  if (p.cities.length > L.cities) e.cities = `At most ${L.cities} cities.`;
  else if (tooLong(p.cities, L.cityChars)) e.cities = `Each city is at most ${L.cityChars} characters.`;
  if (p.excludedTitleTerms.length > L.exclusions) e.excludedTitleTerms = `At most ${L.exclusions} terms.`;
  else if (tooLong(p.excludedTitleTerms, L.exclusionChars)) e.excludedTitleTerms = `Each term is at most ${L.exclusionChars} characters.`;
  if (p.coreSkills.length > L.skills) e.coreSkills = `At most ${L.skills} skills.`;
  else if (tooLong(p.coreSkills, L.skillChars)) e.coreSkills = `Each skill is at most ${L.skillChars} characters.`;
  if (p.workArrangements.length < 1 || !p.workArrangements.every((a) => (JOB_WORK_ARRANGEMENTS as readonly string[]).includes(a))) e.workArrangements = 'Choose at least one work arrangement.';
  else if ((p.workArrangements.includes('hybrid') || p.workArrangements.includes('onsite')) && p.cities.length === 0) e.cities = 'Add at least one city for hybrid or onsite roles.';
  if (p.employmentTypes.length < 1 || !p.employmentTypes.every((t) => (JOB_EMPLOYMENT_TYPES as readonly string[]).includes(t))) e.employmentTypes = 'Choose at least one employment type.';
  if (!(DISCOVERY_FRESHNESS_HOURS as readonly number[]).includes(p.freshnessWindowHours)) e.freshnessWindowHours = 'Choose 12, 24, 48 or 72 hours.';
  const whole = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;
  if (p.maxExperienceYears !== null && !whole(p.maxExperienceYears, 0, L.maxExperienceYears)) e.maxExperienceYears = `A whole number 0–${L.maxExperienceYears}, or leave empty.`;
  if (!whole(p.experienceToleranceYears, 0, L.toleranceYears)) e.experienceToleranceYears = `A whole number 0–${L.toleranceYears}.`;
  if (!whole(p.minimumMatchScore, 0, 100)) e.minimumMatchScore = 'A whole number 0–100.';
  if (!whole(p.maximumResults, 1, L.maxResultsMax)) e.maximumResults = `A whole number 1–${L.maxResultsMax}.`;
  return e;
}

/** One-line description for the summary above the form. */
export function describeProfile(p: JobDiscoveryProfile): string {
  const where = [...p.workArrangements.map((a) => ARRANGEMENT_LABELS[a] ?? a), ...(p.cities.length ? [p.cities.join(', ')] : [])].join(' · ');
  return `${p.targetTitles.length || 'No'} target title${p.targetTitles.length === 1 ? '' : 's'} · ${where} · ${FRESHNESS_LABELS[p.freshnessWindowHours] ?? ''}`;
}

// ---- last discovery run (source health) -------------------------------------------------------------

export interface DiscoveryRunSource { type: string; ref: string; status: AiSourceStatus | null; count: number | null; note: string | null }
export interface DiscoveryRunView {
  id: string; provider: string; status: string; at: string;
  sources: DiscoveryRunSource[];
  /** Policy-filtered leads this run (stale, wrong arrangement, ...) and the stored counts. */
  filtered: number; created: number;
  /** found = a source returned results; quiet = searched, nothing; not_searched = nothing could be searched; unknown = no per-source status. */
  outcome: 'found' | 'quiet' | 'not_searched' | 'unknown';
}

export interface DiscoveryRunRow { id: string; provider: string; status: string; created_at: string; completed_at?: string | null; sources: unknown; counts: unknown }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const cnt = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** Mirrors the server's discoverySearchOutcome. */
export function searchOutcome(sources: ReadonlyArray<{ status: AiSourceStatus | null }>): DiscoveryRunView['outcome'] {
  const st = sources.map((s) => s.status).filter((x): x is AiSourceStatus => x !== null);
  if (st.length === 0) return 'unknown';
  if (st.includes('ok')) return 'found';
  if (st.includes('zero')) return 'quiet';
  return 'not_searched';
}

export function toDiscoveryRunView(r: DiscoveryRunRow): DiscoveryRunView {
  const sources: DiscoveryRunSource[] = (Array.isArray(r.sources) ? r.sources : []).filter(isObj).slice(0, 50).map((s) => ({
    type: String(s.type ?? ''), ref: String(s.ref ?? '').slice(0, 255),
    status: typeof s.status === 'string' && (AI_SOURCE_STATUSES as readonly string[]).includes(s.status) ? (s.status as AiSourceStatus) : null,
    count: typeof s.count === 'number' ? s.count : null, note: typeof s.note === 'string' && s.note ? s.note.slice(0, 200) : null,
  }));
  const counts = isObj(r.counts) ? r.counts : {};
  return {
    id: String(r.id), provider: String(r.provider), status: String(r.status), at: String(r.completed_at ?? r.created_at), sources,
    filtered: cnt(counts.filtered_items), created: cnt(counts.findings_created) + cnt(counts.findings_updated), outcome: searchOutcome(sources),
  };
}

/**
 * What the last discovery run actually did, in words. "Quiet" and "did not run" are deliberately different sentences:
 * a connector that was unavailable is never reported as zero jobs.
 */
export function discoveryRunSummary(run: DiscoveryRunView): string {
  const tally = new Map<AiSourceStatus, number>();
  for (const s of run.sources) if (s.status) tally.set(s.status, (tally.get(s.status) ?? 0) + 1);
  const parts = AI_SOURCE_STATUSES.filter((s) => tally.has(s)).map((s) => `${tally.get(s)} ${SOURCE_STATUS_LABELS[s]}`);
  if (run.outcome === 'not_searched') return `The last run could not search any source (${parts.join(', ')}). This is not the same as no new jobs.`;
  if (run.outcome === 'quiet') return `The last run searched ${tally.get('zero') ?? 0} source${(tally.get('zero') ?? 0) === 1 ? '' : 's'} and found nothing new${parts.length > 1 ? ` (${parts.join(', ')})` : ''}.`;
  if (run.outcome === 'found') return `Sources: ${parts.join(', ')}.`;
  return 'This run did not report per-source status.';
}
