// AI-8: server-owned Application matching for controlled actions. Provider text is an untrusted HINT; this
// service decides which of the CALLER'S OWN visible Applications (read under RLS as the caller) it may refer to.
// A provider never supplies an internal application id and never resolves an ambiguity.
//
// Hierarchy (first tier that yields candidates wins; company alone is NEVER enough):
//   1. linked   : the finding already carries an application link JobQuest wrote itself               -> EXACT
//   2. identity : same trusted external job id (sources compatible) or same canonical job URL        -> EXACT
//   3. context  : same company + title AND at least one agreeing context field (location, work
//                 arrangement, URL host) or a nearby date, with NO conflicting context              -> STRONG
//   4. weak     : same company + title but no agreeing context, or conflicting context              -> AMBIGUOUS
// More than one candidate in the winning tier is AMBIGUOUS. No candidate is NONE.
//
// No numeric score is used: the outcome is the documented tier above.
import { canonicalizeUrl, normalizeIdentityText } from '../lib/aiContract';

export type AiMatchResult = 'EXACT' | 'STRONG' | 'AMBIGUOUS' | 'NONE';
export type AiMatchBasis = 'linked_finding' | 'external_job_id' | 'canonical_url' | 'company_title_context' | 'company_title';

/** Context window for "approximately the same time" (lead date vs application created date). */
export const MATCH_DATE_WINDOW_DAYS = 60;
const CANDIDATE_LIMIT = 100;
const URL_CANDIDATE_LIMIT = 200;

export interface AiMatchHints {
  company: string | null;
  title: string | null;
  /** Canonical and/or source URLs; compared after canonicalization. */
  urls: string[];
  externalJobId: string | null;
  sourceName: string | null;
  location: string | null;
  arrangement: string | null;
  /** ISO instant used only for the nearby-date context check. */
  referenceDate: string | null;
  /** Application id JobQuest itself persisted on the finding (never provider-supplied). */
  linkedApplicationId: string | null;
}

export const emptyHints = (): AiMatchHints => ({
  company: null, title: null, urls: [], externalJobId: null, sourceName: null, location: null, arrangement: null, referenceDate: null, linkedApplicationId: null,
});

export interface AppRow {
  id: string; user_id: string; company_name: string; role_title: string; job_url: string | null; external_job_id: string | null;
  source: string | null; location: string | null; work_arrangement: string | null; stage: string; status: string; outcome: string | null;
  archived_at: string | null; last_activity_at: string; created_at: string; updated_at: string;
}
export const APP_MATCH_COLUMNS =
  'id, user_id, company_name, role_title, job_url, external_job_id, source, location, work_arrangement, stage, status, outcome, archived_at, last_activity_at, created_at, updated_at';

export interface AiAppSummary {
  id: string; company: string; title: string; stage: string; status: string; outcome: string | null;
  jobUrl: string | null; lastActivityAt: string; updatedAt: string;
}
export interface AiMatchCandidate { application: AiAppSummary; basis: AiMatchBasis }
export interface AiApplicationMatch {
  result: AiMatchResult;
  /** Deterministic order: tier, then most recent activity, then id. */
  candidates: AiMatchCandidate[];
  /** Set ONLY for EXACT / STRONG with a single candidate. AMBIGUOUS and NONE never select anything. */
  selected: AiAppSummary | null;
}

export const toAppSummary = (r: AppRow): AiAppSummary => ({
  id: r.id, company: r.company_name, title: r.role_title, stage: r.stage, status: r.status, outcome: r.outcome,
  jobUrl: r.job_url, lastActivityAt: r.last_activity_at, updatedAt: r.updated_at,
});

// ---- normalization --------------------------------------------------------------------------------

const LEGAL_SUFFIX = /\b(incorporated|inc|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|gmbh|plc|ag|sa)\b\.?/g;
/** Casefold, drop punctuation and trailing legal-entity words; "Acme, Inc." === "ACME". */
export function normalizeCompany(v: string | null | undefined): string {
  return normalizeIdentityText(v).replace(/[.,]/g, ' ').replace(LEGAL_SUFFIX, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
export function normalizeTitle(v: string | null | undefined): string {
  return normalizeIdentityText(v).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
const normPlace = (v: string | null | undefined) => normalizeIdentityText(v).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const host = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const c = canonicalizeUrl(raw);
  if (!c) return null;
  try { return new URL(c).hostname.replace(/^www\./, ''); } catch { return null; }
};
const arrangement = (v: string | null | undefined) => (v ? v.trim().toLowerCase() : null);

// ---- pure evaluation ------------------------------------------------------------------------------

/** Pure and deterministic: no I/O, no clock. `rows` must already be limited to what the caller may see. */
export function evaluateApplicationMatch(rows: readonly AppRow[], hints: AiMatchHints): AiApplicationMatch {
  const live = rows.filter((r) => r.archived_at === null);
  const byId = new Map<string, AiMatchCandidate>();
  const tierOf = new Map<string, number>();
  const put = (r: AppRow, basis: AiMatchBasis, tier: number) => {
    if ((tierOf.get(r.id) ?? 99) <= tier) return;
    tierOf.set(r.id, tier);
    byId.set(r.id, { application: toAppSummary(r), basis });
  };

  // 1. trusted link written by JobQuest
  if (hints.linkedApplicationId) {
    const linked = live.find((r) => r.id === hints.linkedApplicationId);
    if (linked) put(linked, 'linked_finding', 0);
  }
  // 2. identity
  const hintUrls = new Set(hints.urls.map((u) => canonicalizeUrl(u)).filter((u): u is string => Boolean(u)));
  const hintSource = normalizeIdentityText(hints.sourceName);
  for (const r of live) {
    if (hints.externalJobId && r.external_job_id && r.external_job_id.trim() === hints.externalJobId.trim()) {
      const appSource = normalizeIdentityText(r.source);
      // A board-specific id is only "trusted" when the sources agree or one side does not state a source.
      if (!hintSource || !appSource || hintSource === appSource) put(r, 'external_job_id', 0);
    }
    if (hintUrls.size && r.job_url) {
      const c = canonicalizeUrl(r.job_url);
      if (c && hintUrls.has(c)) put(r, 'canonical_url', 0);
    }
  }
  // 3/4. company + title (+ context)
  const co = normalizeCompany(hints.company), ti = normalizeTitle(hints.title);
  if (co && ti) {
    const ref = hints.referenceDate ? Date.parse(hints.referenceDate) : NaN;
    for (const r of live) {
      if (normalizeCompany(r.company_name) !== co || normalizeTitle(r.role_title) !== ti) continue;
      let agree = 0, conflict = 0;
      const hl = normPlace(hints.location), al = normPlace(r.location);
      if (hl && al) { if (hl === al) agree++; else conflict++; }
      const ha = arrangement(hints.arrangement), aa = arrangement(r.work_arrangement);
      if (ha && aa) { if (ha === aa) agree++; else conflict++; }
      const hh = hints.urls.map(host).find(Boolean) ?? null, ah = host(r.job_url);
      if (hh && ah && hh === ah) agree++;
      const span = MATCH_DATE_WINDOW_DAYS * 86_400_000;
      const near = Number.isFinite(ref) && (Math.abs(ref - Date.parse(r.created_at)) <= span || Math.abs(ref - Date.parse(r.last_activity_at)) <= span);
      if (conflict === 0 && (agree > 0 || near)) put(r, 'company_title_context', 1);
      else put(r, 'company_title', 2);
    }
  }

  const rank = (c: AiMatchCandidate) => tierOf.get(c.application.id) ?? 99;
  const candidates = [...byId.values()].sort((a, b) =>
    rank(a) - rank(b)
    || (b.application.lastActivityAt < a.application.lastActivityAt ? -1 : b.application.lastActivityAt > a.application.lastActivityAt ? 1 : 0)
    || (a.application.id < b.application.id ? -1 : 1));
  if (!candidates.length) return { result: 'NONE', candidates: [], selected: null };

  const best = rank(candidates[0]!);
  const inBest = candidates.filter((c) => rank(c) === best);
  if (best === 0) return inBest.length === 1 ? { result: 'EXACT', candidates, selected: inBest[0]!.application } : { result: 'AMBIGUOUS', candidates, selected: null };
  if (best === 1) return inBest.length === 1 ? { result: 'STRONG', candidates, selected: inBest[0]!.application } : { result: 'AMBIGUOUS', candidates, selected: null };
  return { result: 'AMBIGUOUS', candidates, selected: null };
}

// ---- retrieval (RLS as the caller) ----------------------------------------------------------------

/** The only DB surface used: `.from(table).select(...).filters` as the caller. */
export type MatchClient = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const likeEscape = (v: string) => v.replace(/[\\%_]/g, (m) => `\\${m}`);

/**
 * Bounded, targeted candidate lookups over the OWNER's non-archived applications in the workspace. They run
 * through the caller's client, so a row the caller cannot read under RLS can never become a candidate, and
 * another workspace/owner is excluded by the explicit filters (defence in depth).
 */
export async function loadMatchRows(client: MatchClient, workspaceId: string, ownerId: string, hints: AiMatchHints): Promise<AppRow[]> {
  const base = () => client.from('applications').select(APP_MATCH_COLUMNS).eq('workspace_id', workspaceId).eq('user_id', ownerId).is('archived_at', null);
  const queries: PromiseLike<{ data: unknown; error: unknown }>[] = [];
  if (hints.linkedApplicationId) queries.push(base().eq('id', hints.linkedApplicationId).limit(1));
  if (hints.externalJobId) queries.push(base().eq('external_job_id', hints.externalJobId).limit(CANDIDATE_LIMIT));
  const firstToken = normalizeCompany(hints.company).split(' ')[0];
  if (firstToken && normalizeTitle(hints.title)) queries.push(base().ilike('company_name', `${likeEscape(firstToken)}%`).limit(CANDIDATE_LIMIT));
  const hosts = [...new Set(hints.urls.map(host).filter((h): h is string => Boolean(h)))];
  for (const h of hosts) queries.push(base().ilike('job_url', `%${likeEscape(h)}%`).order('last_activity_at', { ascending: false }).limit(URL_CANDIDATE_LIMIT));
  const results = await Promise.all(queries);
  const rows = new Map<string, AppRow>();
  for (const r of results) {
    if (r.error) throw new Error('MATCH_READ_FAILED');
    for (const row of (r.data ?? []) as AppRow[]) rows.set(row.id, row);
  }
  return [...rows.values()];
}

export async function matchApplications(client: MatchClient, workspaceId: string, ownerId: string, hints: AiMatchHints): Promise<AiApplicationMatch> {
  const hasIdentity = Boolean(hints.linkedApplicationId || hints.externalJobId || hints.urls.length || (normalizeCompany(hints.company) && normalizeTitle(hints.title)));
  if (!hasIdentity) return { result: 'NONE', candidates: [], selected: null };
  return evaluateApplicationMatch(await loadMatchRows(client, workspaceId, ownerId, hints), hints);
}
