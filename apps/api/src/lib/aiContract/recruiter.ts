// AI-11E: provider-neutral recruiter-intelligence rules. Pure and deterministic (no I/O, no model call, no web access).
//
// JobQuest never searches for people. A provider worker reads the owner's recruiter preferences (WHO is useful: target
// companies and role categories), researches with its own public/prospecting tools and submits `recruiter_intel`
// findings. This module holds only what can be decided safely and deterministically on the server:
//   * the bounded preferences model;
//   * the privacy boundary for contact details and outreach DRAFT text (drafts are data for a human, never sent);
//   * role relevance and a stable ranking, so ONE useful person per company is chosen the same way every time;
//   * the per-run plan: one person per company, a bounded number of NEW contacts, no re-surfacing of people seen recently.
// Everything originating from a provider, a profile page or a job posting is untrusted DATA and stays inert text.
import {
  RECRUITER_LIMITS, RECRUITER_PREFERRED_ROLES,
  type RecruiterDiscoveryMode, type RecruiterPreferredRole,
} from './constants';
import { canonicalJson } from './canonical';
import { companyIdentityKey } from './dedupe';
import type { AiRecruiterProjection } from './types';

// ---- preferences (WHO is useful to connect with) -----------------------------------------------

export interface RecruiterDiscoveryPreferences {
  /** Research one useful person for each strong existing Job Lead. */
  jobLinkedEnabled: boolean;
  /** Standing networking: a few NEW contacts at the target companies, even when no job was found today. */
  targetNetworkingEnabled: boolean;
  /** Explicit, user-maintained, bounded. Never populated automatically. */
  targetCompanies: string[];
  preferredRoles: RecruiterPreferredRole[];
  maxNewContactsPerRun: number;
  /** Allow the provider to include DRAFT outreach text (never sent by JobQuest). */
  draftOutreachEnabled: boolean;
}

/** Generic starting point: nothing here encodes one person's search. Networking stays off until companies are listed. */
export const DEFAULT_RECRUITER_PREFERENCES: RecruiterDiscoveryPreferences = {
  jobLinkedEnabled: true, targetNetworkingEnabled: false, targetCompanies: [],
  preferredRoles: ['technical_recruiter', 'talent_acquisition', 'qa_manager', 'engineering_manager'],
  maxNewContactsPerRun: RECRUITER_LIMITS.maxNewContactsDefault, draftOutreachEnabled: true,
};

export const RECRUITER_PREFERENCE_KEYS = [
  'jobLinkedEnabled', 'targetNetworkingEnabled', 'targetCompanies', 'preferredRoles', 'maxNewContactsPerRun', 'draftOutreachEnabled',
] as const;

/** Columns read by the owner (RLS) and mapped by recruiterPreferencesFromRow. */
export const RECRUITER_PREFERENCE_COLUMNS =
  'job_linked_enabled, target_networking_enabled, target_companies, preferred_roles, max_new_contacts_per_run, draft_outreach_enabled, updated_at';

export type RecruiterPreferencesParse = { ok: true; value: RecruiterDiscoveryPreferences } | { ok: false; field: string; message: string };
const bad = (field: string, message: string): RecruiterPreferencesParse => ({ ok: false, field, message });
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F]/;

/** Strict, bounded parse of preferences submitted by the user. Unknown keys are rejected; absent keys take the generic default. */
export function parseRecruiterPreferences(raw: unknown): RecruiterPreferencesParse {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return bad('preferences', 'must be an object');
  const o = raw as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!(RECRUITER_PREFERENCE_KEYS as readonly string[]).includes(k)) return bad(k, 'unknown field');
  const d = DEFAULT_RECRUITER_PREFERENCES;
  const get = <K extends keyof RecruiterDiscoveryPreferences>(k: K): unknown => (o[k] === undefined ? d[k] : o[k]);

  for (const k of ['jobLinkedEnabled', 'targetNetworkingEnabled', 'draftOutreachEnabled'] as const) {
    if (typeof get(k) !== 'boolean') return bad(k, 'must be true or false');
  }
  const rawCompanies = get('targetCompanies');
  if (!Array.isArray(rawCompanies)) return bad('targetCompanies', 'must be a list');
  const companies: string[] = [];
  const seen = new Set<string>();
  for (const x of rawCompanies) {
    if (typeof x !== 'string') return bad('targetCompanies', 'entries must be text');
    const t = x.normalize('NFC').trim().replace(/\s+/g, ' ');
    if (!t) continue;
    if (CONTROL.test(t)) return bad('targetCompanies', 'contains control characters');
    if ([...t].length > RECRUITER_LIMITS.companyChars) return bad('targetCompanies', `each company is at most ${RECRUITER_LIMITS.companyChars} characters`);
    const key = companyIdentityKey(t);
    if (!key) return bad('targetCompanies', 'each company needs a name');
    if (seen.has(key)) continue; // "Acme", "ACME Inc." and "acme" are one company
    seen.add(key);
    companies.push(t);
  }
  if (companies.length > RECRUITER_LIMITS.targetCompanies) return bad('targetCompanies', `at most ${RECRUITER_LIMITS.targetCompanies} companies`);

  const roles = get('preferredRoles');
  if (!Array.isArray(roles) || roles.length < 1 || !roles.every((r) => typeof r === 'string' && (RECRUITER_PREFERRED_ROLES as readonly string[]).includes(r))) {
    return bad('preferredRoles', 'choose one or more supported roles');
  }
  const max = get('maxNewContactsPerRun');
  if (typeof max !== 'number' || !Number.isInteger(max) || max < 1 || max > RECRUITER_LIMITS.maxNewContactsMax) {
    return bad('maxNewContactsPerRun', `a whole number 1-${RECRUITER_LIMITS.maxNewContactsMax}`);
  }
  if (get('targetNetworkingEnabled') === true && companies.length === 0) return bad('targetCompanies', 'add at least one company to turn on target-company networking');

  return {
    ok: true,
    value: {
      jobLinkedEnabled: get('jobLinkedEnabled') as boolean, targetNetworkingEnabled: get('targetNetworkingEnabled') as boolean,
      targetCompanies: companies, preferredRoles: [...new Set(roles)] as RecruiterPreferredRole[],
      maxNewContactsPerRun: max, draftOutreachEnabled: get('draftOutreachEnabled') as boolean,
    },
  };
}

/** Database row (snake_case) -> preferences. Defensive: a malformed column falls back to the generic default. */
export function recruiterPreferencesFromRow(row: unknown): RecruiterDiscoveryPreferences {
  const r = (typeof row === 'object' && row !== null ? row : {}) as Record<string, unknown>;
  const d = DEFAULT_RECRUITER_PREFERENCES;
  const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
  const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const roles = strs(r.preferred_roles).filter((x): x is RecruiterPreferredRole => (RECRUITER_PREFERRED_ROLES as readonly string[]).includes(x));
  const max = typeof r.max_new_contacts_per_run === 'number' ? r.max_new_contacts_per_run : d.maxNewContactsPerRun;
  return {
    jobLinkedEnabled: bool(r.job_linked_enabled, d.jobLinkedEnabled), targetNetworkingEnabled: bool(r.target_networking_enabled, d.targetNetworkingEnabled),
    targetCompanies: strs(r.target_companies).slice(0, RECRUITER_LIMITS.targetCompanies), preferredRoles: roles.length ? roles : [...d.preferredRoles],
    maxNewContactsPerRun: Math.min(RECRUITER_LIMITS.maxNewContactsMax, Math.max(1, Math.trunc(max))), draftOutreachEnabled: bool(r.draft_outreach_enabled, d.draftOutreachEnabled),
  };
}

/** Preferences -> the jsonb the save RPC accepts (snake_case). */
export function recruiterPreferencesToRpc(p: RecruiterDiscoveryPreferences): Record<string, unknown> {
  return {
    job_linked_enabled: p.jobLinkedEnabled, target_networking_enabled: p.targetNetworkingEnabled, target_companies: p.targetCompanies,
    preferred_roles: p.preferredRoles, max_new_contacts_per_run: p.maxNewContactsPerRun, draft_outreach_enabled: p.draftOutreachEnabled,
  };
}

/** Is this company on the owner's target list (legal suffixes and case ignored)? */
export function isTargetCompany(prefs: Pick<RecruiterDiscoveryPreferences, 'targetCompanies'>, companyKey: string): boolean {
  return companyKey !== '' && prefs.targetCompanies.some((c) => companyIdentityKey(c) === companyKey);
}

// ---- contact privacy boundary ------------------------------------------------------------------

const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'ymail.com', 'rocketmail.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com',
  'pm.me', 'mail.com', 'zoho.com', 'hey.com', 'fastmail.com', 'qq.com', '163.com', '126.com', 'comcast.net', 'att.net', 'verizon.net', 'sbcglobal.net',
  'bellsouth.net', 'cox.net', 'earthlink.net', 'duck.com',
]);
// Consumer brands in their own TLDs only (a company subdomain such as live.example.com is NOT a consumer mailbox).
const FREE_MAIL_FAMILY = /^(yahoo|hotmail|outlook|live|gmx|yandex)\.(com|net|org|de|fr|es|it|jp|ru|in|br|co\.uk|co\.jp|co\.in|com\.[a-z]{2}|[a-z]{2})$/;
const FREE_MAIL_EXTRA = new Set(['web.de', 'mail.ru']);

/** A personal/consumer mailbox is never a work contact, whatever the source says. */
export function isPersonalEmailDomain(email: string): boolean {
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  return FREE_MAIL.has(domain) || FREE_MAIL_EXTRA.has(domain) || FREE_MAIL_FAMILY.test(domain);
}

// ---- outreach DRAFTS (data for a human; JobQuest never sends) ---------------------------------

const URL_IN_TEXT = /\b(?:https?:\/\/|www\.)\S+/i;
const EMAIL_IN_TEXT = /[^\s<>"'(),;:]+@[^\s<>"'(),;:]+\.[^\s<>"'(),;:]+/;
const PHONE_IN_TEXT = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}\b|\+\d[\d\s.-]{8,}\d/;
/** Claims JobQuest cannot support: having applied, an existing thread, an earlier conversation or a shared connection. */
const UNSUPPORTED_CLAIMS: readonly RegExp[] = [
  /\b(?:i|we)(?:'ve|\s+have)?\s+(?:recently\s+|just\s+)?applied\b/i,
  /\bmy\s+(?:recent\s+)?application\b/i,
  /\b(?:after|since)\s+applying\b/i,
  /\bapplied\s+(?:to|for|via|through|on)\b/i,
  /\b(?:i|we)\s+(?:submitted|sent\s+in|filed)\b.{0,40}\bapplication\b/i,
  /\b(?:following\s+up|follow-up|circling\s+back)\b.{0,40}\b(?:email|message|conversation|chat|call|application|note)\b/i,
  /\bas\s+(?:we\s+)?(?:discussed|agreed|talked|spoke)\b/i,
  /\b(?:we|you\s+and\s+i)\s+(?:spoke|talked|met|connected|chatted)\b/i,
  /\b(?:great|nice|good)\s+(?:speaking|talking|meeting|chatting)\s+(?:with|to)\s+you\b/i,
  /\bmutual\s+connections?\b/i,
  /\bthanks?\s+for\s+(?:connecting|accepting)\b/i,
  /\byour\s+(?:previous|earlier|last)\s+(?:email|message|reply)\b/i,
  /\bthank\s+you\s+for\s+(?:your\s+)?(?:reply|response|getting\s+back)\b/i,
];

export type DraftRejection = 'too_long' | 'contact_or_link' | 'unsupported_claim' | 'empty';
export type DraftResult = { ok: true; value: string } | { ok: false; reason: DraftRejection };

// eslint-disable-next-line no-control-regex
const DRAFT_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
function draftText(raw: string, max: number): DraftResult {
  const t = raw.normalize('NFC').replace(DRAFT_CONTROL, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!t) return { ok: false, reason: 'empty' };
  if ([...t].length > max) return { ok: false, reason: 'too_long' };
  if (URL_IN_TEXT.test(t) || EMAIL_IN_TEXT.test(t) || PHONE_IN_TEXT.test(t)) return { ok: false, reason: 'contact_or_link' };
  if (UNSUPPORTED_CLAIMS.some((re) => re.test(t))) return { ok: false, reason: 'unsupported_claim' };
  return { ok: true, value: t };
}

/** LinkedIn-style connection note: at most 300 characters, no links/addresses/numbers, no unsupported claim. Over-long = dropped, never truncated. */
export const sanitizeConnectionNote = (raw: string): DraftResult => draftText(raw, RECRUITER_LIMITS.noteChars);

/** Email draft: a leading "Re:"/"Fwd:" is removed (JobQuest knows of no thread); each part is bounded and checked like the note. */
export function sanitizeEmailDraft(subject: string, body: string): { ok: true; value: { subject: string; body: string } } | { ok: false; reason: DraftRejection } {
  const cleanSubject = subject.replace(/^(?:\s*(?:re|fwd?|fw)\s*:\s*)+/i, '');
  const s = draftText(cleanSubject, RECRUITER_LIMITS.emailSubjectChars);
  if (!s.ok) return s;
  const b = draftText(body, RECRUITER_LIMITS.emailBodyChars);
  if (!b.ok) return b;
  return { ok: true, value: { subject: s.value.replace(/\s*\n+\s*/g, ' '), body: b.value } };
}

/** "Why this person" must be evidence, not enthusiasm or speculation about hiring. */
const SPECULATIVE_WHY = /\b(?:likely|probably|possibly|might\s+be|may\s+be|could\s+be)\s+(?:hiring|looking|expanding|recruiting)\b|\bhiring\s+soon\b|\b(?:innovative|exciting|amazing|fantastic|perfect|dream|best[- ]in[- ]class|world[- ]class|cutting[- ]edge)\b|\bgreat\s+(?:company|fit|recruiter|culture|place)\b|\bgrowing\s+(?:fast|quickly|rapidly)\b/i;
export const isSpeculativeWhy = (s: string): boolean => SPECULATIVE_WHY.test(s);

// ---- role relevance and ranking ---------------------------------------------------------------

/** Roles that are never a useful contact for an experienced software-testing search. */
const IRRELEVANT_ROLE = /\b(?:sales|account\s+(?:executive|manager|director)|business\s+development|bdr|sdr|campus|university|college|early[- ]careers?|new[- ]grad(?:uate)?s?|interns?|internships?|apprentice(?:ship)?s?|former|retired|alumn(?:us|i|a)|payroll|benefits|marketing|customer\s+(?:success|support)|finance|legal)\b|\bex-/i;
const TECH_RECRUITER = /\b(?:technical|engineering|software|tech|it)\s+(?:recruit|talent|sourc)/i;
const TALENT = /\b(?:talent\s+(?:acquisition|partner|advisor|sourc)|recruit(?:er|ing|ment)|sourcer|staffing)\b/i;
const QA_MANAGER = /\b(?:qa|quality|test(?:ing)?|sdet)\b.{0,40}\b(?:manager|lead|head|director|vp)\b|\b(?:manager|lead|head|director|vp)\b.{0,40}\b(?:qa|quality|test(?:ing)?|sdet)\b/i;
const ENG_MANAGER = /\bengineering\s+(?:manager|lead)\b|\bmanager,?\s+(?:software\s+)?engineering\b/i;
const HIRING_MANAGER = /\bhiring\s+manager\b/i;
const ENG_LEADER = /\b(?:head|vp|vice\s+president|director|chief|cto)\b.{0,30}\b(?:engineering|technology)\b|\b(?:engineering|technology)\b.{0,12}\b(?:head|director|vp)\b/i;
const HIRING_WORD = /\b(?:recruit\w*|talent|sourc\w*|hiring|staffing|people\s+partner)\b/i;
const NON_HIRING_ROLE = /\b(?:software|senior|staff|principal|developer|engineer|designer|analyst|scientist|architect|programmer|consultant|accountant)\b/i;

/** Lower = better. Deterministic; the stored relationship wins over title wording, and title wording can promote a generic one. */
export const RECRUITER_ROLE_RANK: Record<string, number> = {
  technical_recruiter: 1, talent_acquisition: 2, qa_manager: 3, engineering_manager: 4, hiring_manager: 5, engineering_leader: 6, recruiter: 7, sourcer: 8, other: 9,
};

export interface RoleAssessment {
  /** relevant = a recognised hiring-side role; unknown = not enough information; irrelevant = obviously the wrong person. */
  relevance: 'relevant' | 'unknown' | 'irrelevant';
  /** One of the supported role categories, when identifiable. */
  category: RecruiterPreferredRole | null;
  rank: number;
}

export function assessRecruiterRole(relationship: string | null, roleTitle: string | null): RoleAssessment {
  const title = roleTitle ?? '';
  if (title && IRRELEVANT_ROLE.test(title) && !TECH_RECRUITER.test(title)) return { relevance: 'irrelevant', category: null, rank: 99 };
  const fromTitle = (): RecruiterPreferredRole | null =>
    TECH_RECRUITER.test(title) ? 'technical_recruiter' : HIRING_MANAGER.test(title) ? 'hiring_manager' : QA_MANAGER.test(title) ? 'qa_manager'
      : ENG_MANAGER.test(title) ? 'engineering_manager' : ENG_LEADER.test(title) ? 'engineering_leader' : /\btalent\s+(?:acquisition|partner|advisor)\b/i.test(title) ? 'talent_acquisition' : null;
  const stated = relationship && relationship in RECRUITER_ROLE_RANK ? relationship : null;
  const promoted = fromTitle();
  const isPreferred = (r: string | null): r is RecruiterPreferredRole => r !== null && (RECRUITER_PREFERRED_ROLES as readonly string[]).includes(r);
  // A generic stated relationship (recruiter / sourcer / other / none) may be refined by the title; a specific one is kept.
  const category = isPreferred(stated) ? stated : promoted;
  if (category) return { relevance: 'relevant', category, rank: RECRUITER_ROLE_RANK[category]! };
  if (stated === 'recruiter' || stated === 'sourcer' || TALENT.test(title) || HIRING_WORD.test(title)) {
    return { relevance: 'relevant', category: null, rank: RECRUITER_ROLE_RANK[stated ?? 'recruiter']! };
  }
  // No hiring relationship at all and the title is an ordinary individual-contributor role: not a useful contact.
  if ((stated === null || stated === 'other') && title && NON_HIRING_ROLE.test(title)) return { relevance: 'irrelevant', category: null, rank: 99 };
  return { relevance: 'unknown', category: null, rank: stated ? RECRUITER_ROLE_RANK[stated]! : 10 };
}

const BASIS_RANK: Record<string, number> = { job_posting: 0, company_page: 1, prospecting_source: 2, professional_profile: 3, other_public_source: 4 };

/**
 * Lexicographic rank (lower = better) for choosing ONE person per company:
 * posting association, then role responsibility (technical recruiting, then QA/hiring), then verified relationship, then evidence quality.
 */
export function rankRecruiter(r: Pick<AiRecruiterProjection, 'posting_contact' | 'has_related_job' | 'relationship' | 'role_title' | 'verification' | 'verification_basis'>): number[] {
  const role = assessRecruiterRole(r.relationship, r.role_title);
  return [
    r.posting_contact ? 0 : r.has_related_job ? 1 : 2,
    role.rank,
    r.verification === 'verified' ? 0 : 1,
    r.verification_basis ? BASIS_RANK[r.verification_basis] ?? 5 : 6,
  ];
}
const compareRank = (a: number[], b: number[]): number => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
};

// ---- merging a re-submission into the stored person ----------------------------------------------

const MAX_MERGED_PAYLOAD_CHARS = 15_000;
const asList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/**
 * A second submission of the same person must add to what JobQuest knows, never erase it: fields the new submission states win,
 * fields it omits are kept, identity keys are unioned. Verification is never silently upgraded: the result is verified only when
 * the new submission is verified itself (it brings its own cited evidence), or when the stored person was verified and the new
 * one raised no doubt. A new submission that lists uncertain fields makes the person uncertain.
 */
export function mergeRecruiterPayload(old: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...old, ...next };
  // The first-seen spelling of the name and company stays (the owner already knows the person by it); a later spelling is the same person.
  if (typeof old.recruiter_name === 'string') out.recruiter_name = old.recruiter_name;
  if (typeof old.company === 'string') out.company = old.company;
  out.identity_keys = [...new Set([...asList(old.identity_keys), ...asList(next.identity_keys)])].slice(0, 8);
  const oldVerified = old.verification === 'verified', newVerified = next.verification === 'verified';
  if (!newVerified && oldVerified && asList(next.uncertain_fields).length === 0) {
    out.verification = 'verified';
    if (old.verification_basis !== undefined) out.verification_basis = old.verification_basis;
    delete out.uncertain_fields;
  } else if (!newVerified) {
    delete out.verification_basis;
  }
  return JSON.stringify(out).length > MAX_MERGED_PAYLOAD_CHARS ? next : out;
}

/** Does merging `next` into the stored person change anything (ignoring server-owned provenance and the checked mode)? */
export function recruiterSubmissionAdds(old: Record<string, unknown>, next: Record<string, unknown>): boolean {
  const norm = (p: Record<string, unknown>) => { const { seen_by: _s, discovery_mode: _m, ...rest } = p; return canonicalJson(rest); }; // eslint-disable-line @typescript-eslint/no-unused-vars
  return norm(mergeRecruiterPayload(old, next)) !== norm(old);
}

// ---- the per-run plan -------------------------------------------------------------------------

export type RecruiterDropReason = 'irrelevant' | 'mode_disabled' | 'not_preferred' | 'recent' | 'company_active' | 'company_duplicate' | 'over_limit';

export interface RecruiterPlanItem {
  index: number;
  recruiter: AiRecruiterProjection;
  /**
   * The finding this person already is (same owner/workspace), when the resolver found one. `adds` = the submission would add
   * information to the stored person (a stronger identity, evidence, a draft ...); a pure repeat is `adds: false` (default).
   */
  existing: { createdAtMs: number; adds?: boolean } | null;
}
export interface RecruiterPlanInput {
  items: readonly RecruiterPlanItem[];
  /** null = the owner saved no preferences: generic defaults, nothing company-specific is assumed. */
  prefs: RecruiterDiscoveryPreferences | null;
  /** Normalized companies that already have an ACTIVE contact surfaced in the last 24 hours. */
  activeCompanyKeys: ReadonlySet<string>;
  nowMs: number;
}
export interface RecruiterDecision {
  index: number;
  keep: boolean;
  reason: RecruiterDropReason | null;
  /** Verified server-side: job_linked needs a related job; target_company needs the company on the owner's list. */
  mode: RecruiterDiscoveryMode | null;
  stripDrafts: boolean;
}

export function recruiterMode(r: AiRecruiterProjection, prefs: RecruiterDiscoveryPreferences | null): RecruiterDiscoveryMode | null {
  if (r.has_related_job) return 'job_linked';
  if (r.mode_hint === 'target_company' && prefs && isTargetCompany(prefs, r.company_key)) return 'target_company';
  return null;
}

/**
 * Pure. Order of rules:
 *   1. obviously irrelevant person -> dropped;  a mode the owner switched off -> dropped;  a role outside the owner's preferences
 *      (not job-linked) -> dropped;  a target-company contact already surfaced inside the suppression window -> not refreshed.
 *   2. ONE person per company per run (best rank; ties keep the earlier submission).
 *   3. a NEW target-company contact at a company that already has an active contact today -> dropped.
 *   4. bounded NEW contacts per run (standing: the owner's maximum, default 5; job-linked: a fixed cap). People who already exist are updates, not new.
 */
export function planRecruiterBatch(input: RecruiterPlanInput): RecruiterDecision[] {
  const { prefs, nowMs } = input;
  const windowMs = RECRUITER_LIMITS.suppressionDays * 86_400_000;
  const decisions = new Map<number, RecruiterDecision>();
  const survivors: RecruiterPlanItem[] = [];
  const stripDrafts = prefs ? !prefs.draftOutreachEnabled : false;

  for (const it of input.items) {
    const r = it.recruiter;
    const mode = recruiterMode(r, prefs);
    const drop = (reason: RecruiterDropReason) => decisions.set(it.index, { index: it.index, keep: false, reason, mode, stripDrafts });
    const role = assessRecruiterRole(r.relationship, r.role_title);
    if (role.relevance === 'irrelevant') { drop('irrelevant'); continue; }
    if (prefs && ((mode === 'job_linked' && !prefs.jobLinkedEnabled) || (mode === 'target_company' && !prefs.targetNetworkingEnabled))) { drop('mode_disabled'); continue; }
    if (mode !== 'job_linked') {
      if (prefs && role.category && !prefs.preferredRoles.includes(role.category) && !r.posting_contact) { drop('not_preferred'); continue; }
    }
    // Standing networking only: a contact surfaced inside the window is not touched again unless the submission genuinely adds to what is stored.
    if (mode === 'target_company' && it.existing && !it.existing.adds && nowMs - it.existing.createdAtMs < windowMs) { drop('recent'); continue; }
    survivors.push(it);
  }

  // One person per company, deterministically.
  const best = new Map<string, RecruiterPlanItem>();
  for (const it of survivors) {
    const cur = best.get(it.recruiter.company_key);
    if (!cur) { best.set(it.recruiter.company_key, it); continue; }
    const c = compareRank(rankRecruiter(it.recruiter), rankRecruiter(cur.recruiter));
    if (c < 0 || (c === 0 && it.index < cur.index)) best.set(it.recruiter.company_key, it);
  }
  const chosen: RecruiterPlanItem[] = [];
  for (const it of survivors) {
    if (best.get(it.recruiter.company_key) === it) chosen.push(it);
    else decisions.set(it.index, { index: it.index, keep: false, reason: 'company_duplicate', mode: recruiterMode(it.recruiter, prefs), stripDrafts });
  }

  // A new standing contact is not added to a company that already has an active contact today.
  const fresh: RecruiterPlanItem[] = [];
  const updates: RecruiterPlanItem[] = [];
  for (const it of chosen) {
    const mode = recruiterMode(it.recruiter, prefs);
    if (it.existing) { updates.push(it); continue; }
    if (mode === 'target_company' && input.activeCompanyKeys.has(it.recruiter.company_key)) {
      decisions.set(it.index, { index: it.index, keep: false, reason: 'company_active', mode, stripDrafts });
      continue;
    }
    fresh.push(it);
  }

  // Standing slots go to verified target-company contacts first (a company the owner listed outranks an unsolicited one), then by rank.
  const cap = (xs: RecruiterPlanItem[], limit: number, targetFirst: boolean) => {
    const key = (it: RecruiterPlanItem) => [targetFirst && recruiterMode(it.recruiter, prefs) === 'target_company' ? 0 : 1, ...rankRecruiter(it.recruiter)];
    const sorted = [...xs].sort((a, b) => compareRank(key(a), key(b)) || a.index - b.index);
    return { kept: new Set(sorted.slice(0, limit).map((x) => x.index)) };
  };
  const standing = fresh.filter((it) => recruiterMode(it.recruiter, prefs) !== 'job_linked');
  const linked = fresh.filter((it) => recruiterMode(it.recruiter, prefs) === 'job_linked');
  const keepStanding = cap(standing, prefs?.maxNewContactsPerRun ?? RECRUITER_LIMITS.maxNewContactsDefault, true).kept;
  const keepLinked = cap(linked, RECRUITER_LIMITS.jobLinkedRunCap, false).kept;
  for (const it of [...updates, ...fresh]) {
    const mode = recruiterMode(it.recruiter, prefs);
    const isFresh = !it.existing;
    const keep = !isFresh || (mode === 'job_linked' ? keepLinked.has(it.index) : keepStanding.has(it.index));
    decisions.set(it.index, { index: it.index, keep, reason: keep ? null : 'over_limit', mode, stripDrafts });
  }
  return input.items.map((it) => decisions.get(it.index)!);
}

