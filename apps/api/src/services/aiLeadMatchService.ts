// AI-11D: server-owned, READ-ONLY relation between a discovered job lead and the OWNER's existing Applications.
// A lead is not an application. This reuses the AI-8 matcher (aiApplicationMatchService) unchanged and, like the
// AI-11B email match, is derived at READ time so it always reflects today's applications; nothing is written, no
// application id is ever trusted from a provider, and nothing is created or modified.
//
//   MATCHED   : the lead's job id / URL, or company + role (with agreeing context) fits exactly ONE application.
//   POSSIBLE  : several applications fit, or only context-conflicting ones. NEVER authoritative (candidates only).
//   UNMATCHED : nothing fits. Company alone is never a MATCH.
import type { AiAppSummary, AiMatchBasis, AiMatchHints, AppRow, MatchClient } from './aiApplicationMatchService';
import { APP_MATCH_COLUMNS, emptyHints, evaluateApplicationMatch } from './aiApplicationMatchService';

export const LEAD_MATCH_APPLICATION_LIMIT = 1000;
export const LEAD_MATCH_POSSIBLE_LIMIT = 3;
export type LeadMatchState = 'MATCHED' | 'POSSIBLE' | 'UNMATCHED';

export interface LeadMatchApp { id: string; company: string; title: string; stage: string; status: string; outcome: string | null }
const brief = (a: AiAppSummary): LeadMatchApp => ({ id: a.id, company: a.company, title: a.title, stage: a.stage, status: a.status, outcome: a.outcome });

export interface LeadApplicationMatch {
  state: LeadMatchState;
  basis: AiMatchBasis | null;
  /** The matched application: set for MATCHED only. */
  application: LeadMatchApp | null;
  /** Candidates for POSSIBLE (never authoritative). */
  possible: LeadMatchApp[];
}

export interface LeadMatchInput {
  id: string; ownerId: string; company: string; title: string; location: string | null; workArrangement: string | null;
  canonicalUrl: string | null; sourceUrl: string | null; externalJobId: string | null; sourceName: string | null; referenceDate: string | null;
}

const UNMATCHED: LeadApplicationMatch = { state: 'UNMATCHED', basis: null, application: null, possible: [] };

/** Pure and deterministic. `rows` must already be limited to the owner's visible, live applications. */
export function evaluateLeadApplicationMatch(rows: readonly AppRow[], i: Omit<LeadMatchInput, 'id' | 'ownerId'>): LeadApplicationMatch {
  const hints: AiMatchHints = {
    ...emptyHints(), company: i.company, title: i.title, urls: [i.canonicalUrl, i.sourceUrl].filter((u): u is string => !!u),
    externalJobId: i.externalJobId, sourceName: i.sourceName, location: i.location, arrangement: i.workArrangement, referenceDate: i.referenceDate,
  };
  const r = evaluateApplicationMatch(rows, hints);
  if (r.result === 'EXACT' || r.result === 'STRONG') {
    return r.selected ? { state: 'MATCHED', basis: r.candidates[0]?.basis ?? null, application: brief(r.selected), possible: [] } : UNMATCHED;
  }
  if (r.result === 'AMBIGUOUS') {
    return { state: 'POSSIBLE', basis: r.candidates[0]?.basis ?? null, application: null, possible: r.candidates.slice(0, LEAD_MATCH_POSSIBLE_LIMIT).map((c) => brief(c.application)) };
  }
  return UNMATCHED;
}

/**
 * One bounded read per distinct owner through the CALLER's client (RLS decides visibility) with explicit workspace + owner
 * filters as defence in depth. A read failure rejects so the caller can degrade (the match is optional context).
 */
export async function matchLeadsToApplications(client: MatchClient, workspaceId: string, inputs: readonly LeadMatchInput[]): Promise<Map<string, LeadApplicationMatch>> {
  const out = new Map<string, LeadApplicationMatch>();
  const owners = [...new Set(inputs.map((i) => i.ownerId))];
  const byOwner = new Map<string, AppRow[]>();
  await Promise.all(owners.map(async (owner) => {
    const { data, error } = await client.from('applications').select(APP_MATCH_COLUMNS)
      .eq('workspace_id', workspaceId).eq('user_id', owner).is('archived_at', null)
      .order('last_activity_at', { ascending: false }).limit(LEAD_MATCH_APPLICATION_LIMIT);
    if (error) throw new Error('MATCH_READ_FAILED');
    byOwner.set(owner, (data ?? []) as AppRow[]);
  }));
  for (const i of inputs) out.set(i.id, evaluateLeadApplicationMatch(byOwner.get(i.ownerId) ?? [], i));
  return out;
}
