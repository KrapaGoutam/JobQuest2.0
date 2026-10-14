// AI-11D: provider-neutral fresh job discovery rules. Pure and deterministic (no I/O, no model call).
//
// JobQuest never searches the web. A provider worker reads the user's discovery PROFILE (what they want),
// searches with its own connectors, and submits job leads. This module is the server-side backstop that
// enforces only what can be checked safely and deterministically: freshness, allowed work arrangement /
// employment type, remote geography, hard-excluded titles, an explicit over-experience requirement, a
// clearance/citizenship restriction, the software-QA context gate and a score floor. A provider's match
// score stays provider analysis: it is validated for bounds, never recomputed or presented as precise.
import { sha256Hex } from './canonical';
import {
  AI_SOURCE_STATUSES, DISCOVERY_FRESHNESS_HOURS, DISCOVERY_LIMITS, JOB_EMPLOYMENT_TYPES, JOB_WORK_ARRANGEMENTS,
  type AiSourceStatus, type JobRemoteScope,
} from './constants';
import { companyIdentityKey, normalizeIdentityText } from './dedupe';

// ---- profile ----------------------------------------------------------------------------

export interface JobDiscoveryProfile {
  targetTitles: string[];
  /** Remote roles open anywhere in the US are always in scope when `remote` is allowed; this ALSO admits restricted/regional remote. */
  includeRestrictedRemote: boolean;
  /** Cities for hybrid/onsite roles ("Houston, TX"). */
  cities: string[];
  workArrangements: (typeof JOB_WORK_ARRANGEMENTS)[number][];
  employmentTypes: (typeof JOB_EMPLOYMENT_TYPES)[number][];
  freshnessWindowHours: (typeof DISCOVERY_FRESHNESS_HOURS)[number];
  /** Explicit permission to keep a lead whose posting time is unknown (shown as "posted date unknown"). */
  allowUnknownPostedDate: boolean;
  maxExperienceYears: number | null;
  experienceToleranceYears: number;
  excludedTitleTerms: string[];
  excludeClearance: boolean;
  /** Require evidence of a software-testing context (rejects manufacturing/lab/food "Quality Assurance"). */
  softwareQaGate: boolean;
  minimumMatchScore: number;
  maximumResults: number;
  coreSkills: string[];
}

/** Generic starting point: no role, no city, remote only. Nothing here encodes one person's job search. */
export const DEFAULT_DISCOVERY_PROFILE: JobDiscoveryProfile = {
  targetTitles: [], includeRestrictedRemote: false, cities: [], workArrangements: ['remote'], employmentTypes: ['full_time'],
  freshnessWindowHours: 24, allowUnknownPostedDate: false, maxExperienceYears: null, experienceToleranceYears: 0,
  excludedTitleTerms: ['Senior', 'Sr', 'Lead', 'Principal', 'Staff', 'Manager', 'Director'], excludeClearance: true,
  softwareQaGate: false, minimumMatchScore: 0, maximumResults: 15, coreSkills: [],
};

export const DISCOVERY_PROFILE_KEYS = [
  'targetTitles', 'includeRestrictedRemote', 'cities', 'workArrangements', 'employmentTypes', 'freshnessWindowHours', 'allowUnknownPostedDate',
  'maxExperienceYears', 'experienceToleranceYears', 'excludedTitleTerms', 'excludeClearance', 'softwareQaGate', 'minimumMatchScore',
  'maximumResults', 'coreSkills',
] as const;

export type DiscoveryProfileParse = { ok: true; value: JobDiscoveryProfile } | { ok: false; field: string; message: string };
const bad = (field: string, message: string): DiscoveryProfileParse => ({ ok: false, field, message });
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F]/;

function list(raw: unknown, field: string, max: number, maxChars: number): string[] | DiscoveryProfileParse {
  if (!Array.isArray(raw)) return bad(field, 'must be a list');
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== 'string') return bad(field, 'entries must be text');
    const t = x.normalize('NFC').trim().replace(/\s+/g, ' ');
    if (!t) continue;
    if (CONTROL.test(t)) return bad(field, 'contains control characters');
    if ([...t].length > maxChars) return bad(field, `each entry is at most ${maxChars} characters`);
    if (!out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  if (out.length > max) return bad(field, `at most ${max} entries`);
  return out;
}

/** Strict, bounded parse of a profile submitted by the user. Unknown keys are rejected; absent keys take the generic default. */
export function parseDiscoveryProfile(raw: unknown): DiscoveryProfileParse {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return bad('profile', 'must be an object');
  const o = raw as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!(DISCOVERY_PROFILE_KEYS as readonly string[]).includes(k)) return bad(k, 'unknown field');
  const d = DEFAULT_DISCOVERY_PROFILE;
  const L = DISCOVERY_LIMITS;
  const get = <K extends keyof JobDiscoveryProfile>(k: K): unknown => (o[k] === undefined ? d[k] : o[k]);

  const titles = list(get('targetTitles'), 'targetTitles', L.titles, L.titleChars); if (!Array.isArray(titles)) return titles;
  const cities = list(get('cities'), 'cities', L.cities, L.cityChars); if (!Array.isArray(cities)) return cities;
  const excl = list(get('excludedTitleTerms'), 'excludedTitleTerms', L.exclusions, L.exclusionChars); if (!Array.isArray(excl)) return excl;
  const skills = list(get('coreSkills'), 'coreSkills', L.skills, L.skillChars); if (!Array.isArray(skills)) return skills;

  const arr = get('workArrangements');
  if (!Array.isArray(arr) || arr.length < 1 || arr.length > 3 || !arr.every((x) => typeof x === 'string' && (JOB_WORK_ARRANGEMENTS as readonly string[]).includes(x))) {
    return bad('workArrangements', 'choose one or more of remote, hybrid, onsite');
  }
  const arrangements = [...new Set(arr)] as JobDiscoveryProfile['workArrangements'];
  const emp = get('employmentTypes');
  if (!Array.isArray(emp) || emp.length < 1 || !emp.every((x) => typeof x === 'string' && (JOB_EMPLOYMENT_TYPES as readonly string[]).includes(x))) {
    return bad('employmentTypes', 'choose one or more supported employment types');
  }
  const employment = [...new Set(emp)] as JobDiscoveryProfile['employmentTypes'];

  const hours = get('freshnessWindowHours');
  if (typeof hours !== 'number' || !(DISCOVERY_FRESHNESS_HOURS as readonly number[]).includes(hours)) return bad('freshnessWindowHours', 'must be 12, 24, 48 or 72');

  for (const k of ['includeRestrictedRemote', 'allowUnknownPostedDate', 'excludeClearance', 'softwareQaGate'] as const) {
    if (typeof get(k) !== 'boolean') return bad(k, 'must be true or false');
  }
  const maxExp = get('maxExperienceYears');
  if (maxExp !== null && (typeof maxExp !== 'number' || !Number.isInteger(maxExp) || maxExp < 0 || maxExp > L.maxExperienceYears)) return bad('maxExperienceYears', `a whole number 0-${L.maxExperienceYears}, or empty`);
  const tol = get('experienceToleranceYears');
  if (typeof tol !== 'number' || !Number.isInteger(tol) || tol < 0 || tol > L.toleranceYears) return bad('experienceToleranceYears', `a whole number 0-${L.toleranceYears}`);
  const minScore = get('minimumMatchScore');
  if (typeof minScore !== 'number' || !Number.isInteger(minScore) || minScore < 0 || minScore > 100) return bad('minimumMatchScore', 'a whole number 0-100');
  const maxRes = get('maximumResults');
  if (typeof maxRes !== 'number' || !Number.isInteger(maxRes) || maxRes < 1 || maxRes > L.maxResultsMax) return bad('maximumResults', `a whole number 1-${L.maxResultsMax}`);
  if ((arrangements.includes('hybrid') || arrangements.includes('onsite')) && cities.length === 0) return bad('cities', 'add at least one city for hybrid or onsite roles');

  return {
    ok: true,
    value: {
      targetTitles: titles, includeRestrictedRemote: get('includeRestrictedRemote') as boolean, cities, workArrangements: arrangements,
      employmentTypes: employment, freshnessWindowHours: hours as JobDiscoveryProfile['freshnessWindowHours'],
      allowUnknownPostedDate: get('allowUnknownPostedDate') as boolean, maxExperienceYears: maxExp as number | null, experienceToleranceYears: tol,
      excludedTitleTerms: excl, excludeClearance: get('excludeClearance') as boolean, softwareQaGate: get('softwareQaGate') as boolean,
      minimumMatchScore: minScore, maximumResults: maxRes, coreSkills: skills,
    },
  };
}

// ---- identity (cross-source dedupe fallback) --------------------------------------------

const normCompany = companyIdentityKey; // AI-11E: the definition moved to dedupe.ts so recruiter identity shares it

/**
 * Conservative title normalization: bracketed notes and a trailing "- remote/hybrid/onsite" marker are dropped; level words
 * (senior, II, junior ...) are KEPT because they are different roles. Never title alone: see leadLogicalKey.
 */
export function normalizeLeadTitle(s: string): string {
  return normalizeIdentityText(s)
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ')
    .replace(/\s[-–—|]\s*(remote|hybrid|onsite|on-site|contract|full[- ]?time|us|usa|united states)\b.*$/g, ' ')
    .replace(/[^a-z0-9+#/& ]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

/**
 * Cross-source identity: company + normalized title + (remote scope | normalized location | arrangement). Null when there is
 * no location/arrangement evidence at all (company + title alone is never an identity).
 */
export function leadLogicalKey(i: { company: string; title: string; location: string | null; work_arrangement: string | null; remote_scope: string | null }): string | null {
  const co = normCompany(i.company), ti = normalizeLeadTitle(i.title);
  if (!co || !ti) return null;
  let where: string;
  if (i.work_arrangement === 'remote') where = `remote:${i.remote_scope ?? ''}`;
  else {
    const loc = normalizeIdentityText(i.location).replace(/[^a-z0-9, ]+/g, ' ').replace(/\s+/g, ' ').trim();
    where = loc ? `${i.work_arrangement ?? 'any'}:${loc}` : i.work_arrangement ? `${i.work_arrangement}:` : '';
  }
  if (!where) return null;
  return sha256Hex(`${co}|${ti}|${where}`);
}

// ---- remote geography -------------------------------------------------------------------

const NON_US = /\b(canada|canadian|uk|united kingdom|england|ireland|europe|european|emea|apac|asia|india|latam|latin america|mexico|australia|philippines|brazil)\b/i;
const US_WORDS = /\b(u\.?s\.?a?\.?|united states|nationwide|anywhere in the (u\.?s\.?|united states))\b/i;
const RESTRICTED = /\b(must (reside|live|be located|be based) in|residents? of|restricted to|only (open )?to (candidates|residents)|eligible (states|locations)|(select|certain|specific|following) states|(tx|ca|ny|fl|wa|il|ga|nc|va|az|co|nj|ma) (and|or|,) (tx|ca|ny|fl|wa|il|ga|nc|va|az|co|nj|ma)\b)/i;

/**
 * The geography a "remote" role actually admits. The provider's explicit `remote_scope` wins; otherwise a conservative text
 * reading of the stated location/note. Nothing stated => null (unconfirmed): never assumed to be the US.
 */
export function effectiveRemoteScope(l: { remote_scope: string | null; location: string | null; remote_note: string | null }): JobRemoteScope | null {
  if (l.remote_scope === 'us' || l.remote_scope === 'restricted' || l.remote_scope === 'region') return l.remote_scope;
  const t = `${l.location ?? ''} ${l.remote_note ?? ''}`.trim();
  if (!t) return null;
  if (RESTRICTED.test(t)) return 'restricted';
  if (NON_US.test(t) && !US_WORDS.test(t)) return 'region';
  if (US_WORDS.test(t)) return 'us';
  return null;
}

// ---- policy -----------------------------------------------------------------------------

export type DiscoveryRejectReason =
  | 'stale_posting' | 'unknown_posted_date' | 'arrangement_not_allowed' | 'employment_not_allowed' | 'excluded_title'
  | 'remote_not_us' | 'location_outside_profile' | 'experience_too_high' | 'clearance_required' | 'not_software_qa' | 'below_minimum_score';
export type DiscoveryFlag = 'posted_date_unknown' | 'remote_scope_unconfirmed' | 'location_unconfirmed' | 'arrangement_unknown' | 'software_context_unverified';

export interface PolicyLead {
  title: string; location: string | null; work_arrangement: string | null; employment_type: string | null;
  remote_scope: string | null; remote_note: string | null; posted_at: string | null; posted_date: string | null;
  experience_min_years: number | null; match_score: number | null; experience_level: string | null;
  description: string | null; required_skills: string[]; preferred_skills: string[]; summary?: string | null;
}

export interface PolicyDecision { accept: boolean; reasons: DiscoveryRejectReason[]; flags: DiscoveryFlag[] }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasTerm = (text: string, term: string): boolean => new RegExp(`(^|[^a-z0-9])${escape(term.toLowerCase())}([^a-z0-9]|$)`).test(text.toLowerCase());

const CLEARANCE = /\b(top secret|ts\/sci|secret clearance|security clearance|active clearance|clearance (is )?required|dod clearance|public trust)\b|\b(u\.?s\.? citizen(ship)? (only|required)|must be a u\.?s\.? citizen|citizenship (is )?required)\b/i;
const SOFTWARE_TITLE = /\b(software|sdet|automation|web|api|mobile|application|developer|devops)\b/i;
const SOFTWARE_SIGNALS: RegExp[] = [
  /\bsoftware\b/i, /\bweb (application|app)s?\b/i, /\bapis?\b/i, /\btest automation\b|\bautomated (test|testing)\b|\bautomation (framework|script)/i,
  /\btest cases?\b/i, /\bselenium\b/i, /\bplaywright\b/i, /\bcypress\b/i, /\bsql\b/i, /\bpostman\b/i, /\bagile\b|\bscrum\b/i, /\bci\/cd\b/i,
  /\bjira\b/i, /\bappium\b/i, /\bregression (test|testing)\b/i, /\bsdet\b/i,
];
/** Minimum distinct software-testing signals required when the title itself does not say "software". */
export const SOFTWARE_QA_MIN_SIGNALS = 2;

/** Pure freshness check. posted_at is exact; a date-only posting is fresh when its (UTC) day overlaps the window. */
export function postedFreshness(l: { posted_at: string | null; posted_date: string | null }, windowHours: number, nowMs: number): 'fresh' | 'stale' | 'unknown' {
  const cutoff = nowMs - windowHours * 3_600_000;
  if (l.posted_at) { const t = Date.parse(l.posted_at); if (Number.isFinite(t)) return t >= cutoff ? 'fresh' : 'stale'; }
  if (l.posted_date) return l.posted_date >= new Date(cutoff).toISOString().slice(0, 10) ? 'fresh' : 'stale';
  return 'unknown';
}

export function evaluateDiscoveryPolicy(profile: JobDiscoveryProfile, lead: PolicyLead, nowMs: number): PolicyDecision {
  const reasons: DiscoveryRejectReason[] = [];
  const flags: DiscoveryFlag[] = [];

  const fresh = postedFreshness(lead, profile.freshnessWindowHours, nowMs);
  if (fresh === 'stale') reasons.push('stale_posting');
  else if (fresh === 'unknown') { if (profile.allowUnknownPostedDate) flags.push('posted_date_unknown'); else reasons.push('unknown_posted_date'); }

  if (profile.excludedTitleTerms.some((t) => hasTerm(lead.title, t))) reasons.push('excluded_title');

  if (lead.work_arrangement) {
    if (!(profile.workArrangements as readonly string[]).includes(lead.work_arrangement)) reasons.push('arrangement_not_allowed');
    else if (lead.work_arrangement === 'remote') {
      const scope = effectiveRemoteScope(lead);
      if (scope === null) flags.push('remote_scope_unconfirmed');
      else if (scope !== 'us' && !profile.includeRestrictedRemote) reasons.push('remote_not_us');
    } else if (profile.cities.length > 0) {
      const loc = (lead.location ?? '').toLowerCase();
      if (!loc.trim()) flags.push('location_unconfirmed');
      else if (!profile.cities.some((c) => hasTerm(loc, (c.split(',')[0] ?? c).trim()))) reasons.push('location_outside_profile');
    }
  } else flags.push('arrangement_unknown');

  if (lead.employment_type && !(profile.employmentTypes as readonly string[]).includes(lead.employment_type)) reasons.push('employment_not_allowed');

  if (profile.maxExperienceYears !== null && lead.experience_min_years !== null
      && lead.experience_min_years > profile.maxExperienceYears + profile.experienceToleranceYears) reasons.push('experience_too_high');

  const body = `${lead.title} ${lead.experience_level ?? ''} ${lead.description ?? ''} ${lead.summary ?? ''}`;
  if (profile.excludeClearance && CLEARANCE.test(body)) reasons.push('clearance_required');

  if (profile.softwareQaGate && !SOFTWARE_TITLE.test(lead.title)) {
    const evidence = `${[...lead.required_skills, ...lead.preferred_skills].join(' ')} ${lead.description ?? ''} ${lead.summary ?? ''}`.trim();
    if (!evidence) flags.push('software_context_unverified');
    else if (SOFTWARE_SIGNALS.filter((re) => re.test(evidence)).length < SOFTWARE_QA_MIN_SIGNALS) reasons.push('not_software_qa');
  }

  if (profile.minimumMatchScore > 0 && lead.match_score !== null && lead.match_score < profile.minimumMatchScore) reasons.push('below_minimum_score');

  return { accept: reasons.length === 0, reasons, flags };
}

// ---- source health ----------------------------------------------------------------------

export interface SourceStatusEntry { status?: AiSourceStatus | null }
export type DiscoverySearchOutcome = 'found' | 'quiet' | 'not_searched' | 'unknown';

/**
 * What a discovery run actually did. `quiet` = at least one source was searched and returned nothing (a genuinely quiet
 * market); `not_searched` = no source could be searched (unavailable/blocked/error/skipped): NOT the same thing.
 * `unknown` = the run carried no per-source status (legacy or provider did not report it).
 */
export function discoverySearchOutcome(sources: readonly SourceStatusEntry[]): DiscoverySearchOutcome {
  const st = sources.map((s) => s.status).filter((x): x is AiSourceStatus => !!x && (AI_SOURCE_STATUSES as readonly string[]).includes(x));
  if (st.length === 0) return 'unknown';
  if (st.includes('ok')) return 'found';
  if (st.includes('zero')) return 'quiet';
  return 'not_searched';
}

export function sourceStatusCounts(sources: readonly SourceStatusEntry[]): Record<AiSourceStatus, number> {
  const out = Object.fromEntries(AI_SOURCE_STATUSES.map((s) => [s, 0])) as Record<AiSourceStatus, number>;
  for (const s of sources) if (s.status && s.status in out) out[s.status]++;
  return out;
}

// ---- row mapping (DB snake_case <-> profile) --------------------------------------------

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Maps a stored row (snake_case) to a profile; anything that does not validate falls back to the generic default. */
export function discoveryProfileFromRow(r: unknown): JobDiscoveryProfile {
  if (typeof r !== 'object' || r === null) return { ...DEFAULT_DISCOVERY_PROFILE };
  const o = r as Record<string, unknown>;
  const parsed = parseDiscoveryProfile({
    targetTitles: arr(o.target_titles), includeRestrictedRemote: o.include_restricted_remote, cities: arr(o.cities),
    workArrangements: arr(o.work_arrangements), employmentTypes: arr(o.employment_types), freshnessWindowHours: o.freshness_window_hours,
    allowUnknownPostedDate: o.allow_unknown_posted_date, maxExperienceYears: o.max_experience_years ?? null,
    experienceToleranceYears: o.experience_tolerance_years, excludedTitleTerms: arr(o.excluded_title_terms), excludeClearance: o.exclude_clearance,
    softwareQaGate: o.software_qa_gate, minimumMatchScore: o.minimum_match_score, maximumResults: o.maximum_results, coreSkills: arr(o.core_skills),
  });
  return parsed.ok ? parsed.value : { ...DEFAULT_DISCOVERY_PROFILE };
}

export const DISCOVERY_PROFILE_COLUMNS =
  'target_titles, include_restricted_remote, cities, work_arrangements, employment_types, freshness_window_hours, allow_unknown_posted_date, '
  + 'max_experience_years, experience_tolerance_years, excluded_title_terms, exclude_clearance, software_qa_gate, minimum_match_score, maximum_results, core_skills, updated_at';

export function discoveryProfileToRpc(p: JobDiscoveryProfile): Record<string, unknown> {
  return {
    target_titles: p.targetTitles, include_restricted_remote: p.includeRestrictedRemote, cities: p.cities, work_arrangements: p.workArrangements,
    employment_types: p.employmentTypes, freshness_window_hours: p.freshnessWindowHours, allow_unknown_posted_date: p.allowUnknownPostedDate,
    max_experience_years: p.maxExperienceYears, experience_tolerance_years: p.experienceToleranceYears, excluded_title_terms: p.excludedTitleTerms,
    exclude_clearance: p.excludeClearance, software_qa_gate: p.softwareQaGate, minimum_match_score: p.minimumMatchScore,
    maximum_results: p.maximumResults, core_skills: p.coreSkills,
  };
}
