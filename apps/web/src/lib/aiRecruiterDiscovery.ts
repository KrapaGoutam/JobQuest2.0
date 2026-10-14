// AI-11E: pure helpers for Settings -> AI & Automation -> Recruiter Intelligence ("WHO is useful to connect with?") and for the
// last recruiter run's source health. No fetching here. Mirrors the server's bounds (aiContract/recruiter.ts); the server re-validates
// everything, so this only gives friendly, inline errors.
import { AI_SOURCE_STATUSES, type AiSourceStatus } from './aiSources';
import { searchOutcome, toDiscoveryRunView, type DiscoveryRunRow, type DiscoveryRunView } from './aiJobDiscovery';

export const RECRUITER_PREFERRED_ROLES = ['technical_recruiter', 'talent_acquisition', 'qa_manager', 'engineering_manager', 'hiring_manager', 'engineering_leader'] as const;
export type RecruiterPreferredRole = (typeof RECRUITER_PREFERRED_ROLES)[number];
export const RECRUITER_PREFERRED_ROLE_LABELS: Record<RecruiterPreferredRole, string> = {
  technical_recruiter: 'Technical recruiter', talent_acquisition: 'Talent acquisition / talent partner (engineering)', qa_manager: 'QA / test manager',
  engineering_manager: 'Engineering manager', hiring_manager: 'Hiring manager (when verifiable)', engineering_leader: 'Head of engineering (smaller companies)',
};
export const RECRUITER_LIMITS = { targetCompanies: 25, companyChars: 120, maxNewContactsMax: 10, suppressionDays: 30 } as const;

export interface RecruiterPreferences {
  jobLinkedEnabled: boolean;
  targetNetworkingEnabled: boolean;
  targetCompanies: string[];
  preferredRoles: RecruiterPreferredRole[];
  maxNewContactsPerRun: number;
  draftOutreachEnabled: boolean;
}

/** Same generic default as the server: nothing here encodes one person's search. */
export const DEFAULT_RECRUITER_PREFERENCES: RecruiterPreferences = {
  jobLinkedEnabled: true, targetNetworkingEnabled: false, targetCompanies: [],
  preferredRoles: ['technical_recruiter', 'talent_acquisition', 'qa_manager', 'engineering_manager'], maxNewContactsPerRun: 5, draftOutreachEnabled: true,
};

export interface RecruiterFormState {
  jobLinkedEnabled: boolean;
  targetNetworkingEnabled: boolean;
  /** One company per line. */
  targetCompanies: string;
  preferredRoles: string[];
  maxNewContactsPerRun: string;
  draftOutreachEnabled: boolean;
}
export type RecruiterFormErrors = Partial<Record<keyof RecruiterFormState, string>>;

const lines = (s: string): string[] => s.split(/\r?\n/).map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean);
const dedupe = (xs: string[]): string[] => xs.filter((x, i) => xs.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);

export function prefsToForm(p: RecruiterPreferences): RecruiterFormState {
  return {
    jobLinkedEnabled: p.jobLinkedEnabled, targetNetworkingEnabled: p.targetNetworkingEnabled, targetCompanies: p.targetCompanies.join('\n'),
    preferredRoles: [...p.preferredRoles], maxNewContactsPerRun: String(p.maxNewContactsPerRun), draftOutreachEnabled: p.draftOutreachEnabled,
  };
}

export function formToPrefs(f: RecruiterFormState): RecruiterPreferences {
  return {
    jobLinkedEnabled: f.jobLinkedEnabled, targetNetworkingEnabled: f.targetNetworkingEnabled, targetCompanies: dedupe(lines(f.targetCompanies)),
    preferredRoles: RECRUITER_PREFERRED_ROLES.filter((r) => f.preferredRoles.includes(r)),
    maxNewContactsPerRun: f.maxNewContactsPerRun.trim() === '' ? NaN : Number(f.maxNewContactsPerRun), draftOutreachEnabled: f.draftOutreachEnabled,
  };
}

export function validateRecruiterForm(f: RecruiterFormState): RecruiterFormErrors {
  const e: RecruiterFormErrors = {};
  const p = formToPrefs(f);
  if (p.targetCompanies.length > RECRUITER_LIMITS.targetCompanies) e.targetCompanies = `At most ${RECRUITER_LIMITS.targetCompanies} companies.`;
  else if (p.targetCompanies.some((c) => [...c].length > RECRUITER_LIMITS.companyChars)) e.targetCompanies = `Each company is at most ${RECRUITER_LIMITS.companyChars} characters.`;
  else if (p.targetNetworkingEnabled && p.targetCompanies.length === 0) e.targetCompanies = 'Add at least one company to turn on target-company networking.';
  if (p.preferredRoles.length < 1) e.preferredRoles = 'Choose at least one role.';
  if (!Number.isInteger(p.maxNewContactsPerRun) || p.maxNewContactsPerRun < 1 || p.maxNewContactsPerRun > RECRUITER_LIMITS.maxNewContactsMax) {
    e.maxNewContactsPerRun = `A whole number 1–${RECRUITER_LIMITS.maxNewContactsMax}.`;
  }
  return e;
}

/** One-line description for the summary above the form. */
export function describePreferences(p: RecruiterPreferences): string {
  const modes = [p.jobLinkedEnabled ? 'job-linked research on' : 'job-linked research off', p.targetNetworkingEnabled ? 'target-company networking on' : 'target-company networking off'];
  const n = p.targetCompanies.length;
  return `${modes.join(' · ')} · ${n} target ${n === 1 ? 'company' : 'companies'} · up to ${p.maxNewContactsPerRun} new contact${p.maxNewContactsPerRun === 1 ? '' : 's'} per run`;
}

// ---- last recruiter run (source health) ---------------------------------------------------------

const STATUS_WORDS: Record<AiSourceStatus, string> = { ok: 'returned results', zero: 'found nothing', blocked: 'blocked', unavailable: 'unavailable', error: 'failed', skipped: 'skipped' };

/**
 * What the last recruiter run actually did, in words. "Searched and found no one" and "could not reach any source" are deliberately
 * different sentences: an unavailable prospecting source is never reported as "no recruiter exists".
 */
export function recruiterRunSummary(run: DiscoveryRunView): string {
  const tally = new Map<AiSourceStatus, number>();
  for (const s of run.sources) if (s.status) tally.set(s.status, (tally.get(s.status) ?? 0) + 1);
  const parts = AI_SOURCE_STATUSES.filter((s) => tally.has(s)).map((s) => `${tally.get(s)} ${STATUS_WORDS[s]}`);
  if (run.outcome === 'not_searched') return `The last run could not search any source (${parts.join(', ')}). This is not the same as no recruiter existing.`;
  if (run.outcome === 'quiet') return `The last run searched ${tally.get('zero') ?? 0} source${(tally.get('zero') ?? 0) === 1 ? '' : 's'} and found no new contact${parts.length > 1 ? ` (${parts.join(', ')})` : ''}.`;
  if (run.outcome === 'found') return `Sources: ${parts.join(', ')}.`;
  return 'This run did not report per-source status.';
}

export { searchOutcome, toDiscoveryRunView };
export type { DiscoveryRunRow, DiscoveryRunView };
