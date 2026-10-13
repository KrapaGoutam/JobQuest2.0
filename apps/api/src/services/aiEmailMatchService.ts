// AI-11B: server-owned relation between an email-intelligence item and the OWNER's existing Applications.
// Reuses the AI-8 matcher (aiApplicationMatchService) unchanged. Email text is an untrusted HINT: the provider
// never supplies (and JobQuest never trusts) an application id; matching is derived at READ time, so it is always
// current (an application added or removed later is reflected) and nothing is written to any core record.
//
//   MATCHED   : company + role agree with exactly ONE of the owner's applications (and no conflicting context).
//   POSSIBLE  : several applications fit, only context-conflicting ones fit, or the email names a company but no
//               role. NEVER authoritative: it lists candidates, it does not select one.
//   UNMATCHED : nothing fits (or there is not enough to compare). Company alone is never a MATCH.
//   NOT_APPLICABLE : non-job mail.
import type { AiAppSummary, AiMatchBasis, AppRow, MatchClient } from './aiApplicationMatchService';
import { APP_MATCH_COLUMNS, emptyHints, evaluateApplicationMatch, normalizeCompany, toAppSummary } from './aiApplicationMatchService';
import type { EmailGroup, EmailMatchState } from '../lib/aiContract';

/** Upper bound on the owner's live applications read for one batch (most recent activity first). */
export const EMAIL_MATCH_APPLICATION_LIMIT = 1000;
/** Candidates listed for a POSSIBLE match. */
export const EMAIL_MATCH_POSSIBLE_LIMIT = 3;

/** The few facts about an application that an email item may carry (no URL, no timestamps). */
export interface EmailMatchApp { id: string; company: string; title: string; stage: string; status: string; outcome: string | null }
const brief = (a: AiAppSummary): EmailMatchApp => ({ id: a.id, company: a.company, title: a.title, stage: a.stage, status: a.status, outcome: a.outcome });

export interface EmailApplicationMatch {
  state: EmailMatchState | 'NOT_APPLICABLE';
  basis: AiMatchBasis | 'company' | null;
  /** The matched application: set for MATCHED only. */
  application: EmailMatchApp | null;
  /** Candidates for POSSIBLE (never authoritative). */
  possible: EmailMatchApp[];
}

export interface EmailMatchInput {
  id: string; ownerId: string; group: EmailGroup | null;
  company: string | null; roleTitle: string | null; receivedAt: string | null;
}

const NOT_APPLICABLE: EmailApplicationMatch = { state: 'NOT_APPLICABLE', basis: null, application: null, possible: [] };
const UNMATCHED: EmailApplicationMatch = { state: 'UNMATCHED', basis: null, application: null, possible: [] };

/** Pure and deterministic. `rows` must already be limited to the owner's visible, live applications. */
export function evaluateEmailApplicationMatch(rows: readonly AppRow[], input: Omit<EmailMatchInput, 'id' | 'ownerId'>): EmailApplicationMatch {
  if (input.group !== 'job_related') return NOT_APPLICABLE;
  const company = normalizeCompany(input.company);
  if (!company) return UNMATCHED;
  const hints = { ...emptyHints(), company: input.company, title: input.roleTitle, referenceDate: input.receivedAt };
  const r = evaluateApplicationMatch(rows, hints);
  if (r.result === 'EXACT' || r.result === 'STRONG') return { state: 'MATCHED', basis: r.candidates[0]?.basis ?? null, application: r.selected ? brief(r.selected) : null, possible: [] };
  if (r.result === 'AMBIGUOUS') return { state: 'POSSIBLE', basis: r.candidates[0]?.basis ?? null, application: null, possible: r.candidates.slice(0, EMAIL_MATCH_POSSIBLE_LIMIT).map((c) => brief(c.application)) };
  // No role-level evidence. With NO role in the email a company-only candidate is a hint worth showing (never a match);
  // with a role that fits nothing, the conservative answer is UNMATCHED.
  if (hints.title) return UNMATCHED;
  const sameCompany = rows.filter((a) => a.archived_at === null && normalizeCompany(a.company_name) === company)
    .sort((a, b) => (b.last_activity_at < a.last_activity_at ? -1 : b.last_activity_at > a.last_activity_at ? 1 : a.id < b.id ? -1 : 1));
  return sameCompany.length
    ? { state: 'POSSIBLE', basis: 'company', application: null, possible: sameCompany.slice(0, EMAIL_MATCH_POSSIBLE_LIMIT).map((a) => brief(toAppSummary(a))) }
    : UNMATCHED;
}

/**
 * One bounded read per distinct owner, through the CALLER's client (RLS decides what is visible) with explicit
 * workspace + owner filters as defence in depth: an application of another workspace or another owner can never
 * become a candidate. A read failure rejects, so a caller can degrade (the match is optional context).
 */
export async function matchEmailsToApplications(client: MatchClient, workspaceId: string, inputs: readonly EmailMatchInput[]): Promise<Map<string, EmailApplicationMatch>> {
  const out = new Map<string, EmailApplicationMatch>();
  const owners = [...new Set(inputs.filter((i) => i.group === 'job_related' && normalizeCompany(i.company)).map((i) => i.ownerId))];
  const byOwner = new Map<string, AppRow[]>();
  await Promise.all(owners.map(async (owner) => {
    const { data, error } = await client.from('applications').select(APP_MATCH_COLUMNS)
      .eq('workspace_id', workspaceId).eq('user_id', owner).is('archived_at', null)
      .order('last_activity_at', { ascending: false }).limit(EMAIL_MATCH_APPLICATION_LIMIT);
    if (error) throw new Error('MATCH_READ_FAILED');
    byOwner.set(owner, (data ?? []) as AppRow[]);
  }));
  for (const i of inputs) out.set(i.id, evaluateEmailApplicationMatch(byOwner.get(i.ownerId) ?? [], i));
  return out;
}
