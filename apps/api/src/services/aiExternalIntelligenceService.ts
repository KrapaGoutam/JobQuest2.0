// AI-6: READ-ONLY query service for the three external intelligence sources
// (job leads, email events, recruiter intel). One cohesive module shared by the MCP
// read tools and the Daily Digest aggregation; the browser has its own RLS reader
// (apps/web/src/api/aiSources.ts) that mirrors these filters.
//
// Authorization is identical to aiReadService: every read runs AS THE CALLER through
// RLS (userClient). The workspace id only narrows the query. There are no writes and
// no RPCs here: sources enter JobQuest exclusively through ingestAiResult.
//
// Output is sanitized for tool/UI consumption: URLs are credential-free http(s) only,
// text is bounded, and nothing that was dropped at ingestion (message bodies, full
// sender addresses, provider ids) can appear. Job descriptions are NOT returned by the
// list reads (they can be 30,000 characters); the UI reads them for one lead at a time.
import {
  AI_PROVIDERS, EMAIL_ACTION_STATES, EMAIL_ATTENTION_CATEGORIES, EMAIL_ATTENTION_OR, EMAIL_CATEGORIES, EMAIL_GROUPS, EMAIL_MATCH_STATES, EMAIL_STAGE_HINTS, EMAIL_URGENCIES,
  DISCOVERY_FRESHNESS_HOURS, JOB_EMPLOYMENT_TYPES, JOB_REMOTE_SCOPES, JOB_WORK_ARRANGEMENTS, STRONG_MATCH_THRESHOLD, effectiveRemoteScope, emailCategoryGroup, emailCategoryMembers, emailGroupCategories, prioritiesForUrgency, urgencyFromPriority,
  type AiFindingStatus, type AiPriority, type AiProvider, type JobRemoteScope, type EmailActionState, type EmailGroup, type EmailStageHint, type EmailUrgency, type JsonRecord,
} from '../lib/aiContract';
import type { MatchClient } from './aiApplicationMatchService';
import { matchEmailsToApplications, type EmailApplicationMatch } from './aiEmailMatchService';
import { matchLeadsToApplications, type LeadApplicationMatch, type LeadMatchInput } from './aiLeadMatchService';
import type { AiPage, AiPageRequest, AiReadContext, AiReadDeps, AiReadResult } from './aiReadService';
import { dbFail, fail, num, parsePage, prepare, rec, s, sliced, sn } from './aiReadSupport';

// ---- shared shapes ------------------------------------------------------------------

/** ACTIVE = still open to the user (NEW or REVIEWED); ALL adds dismissed/closed. */
export const SOURCE_STATUS_FILTERS = ['ACTIVE', 'NEW', 'REVIEWED', 'DISMISSED', 'ALL'] as const;
export type SourceStatusFilter = (typeof SOURCE_STATUS_FILTERS)[number];

export const SOURCE_SEARCH_MAX = 80;

type Row = Record<string, unknown>;
type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Only credential-free http(s) URLs ever leave this service. */
export function safeUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  try {
    const u = new URL(raw.trim());
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return null;
    return u.href;
  } catch { return null; }
}

const str = (v: unknown, max = 500): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const strList = (v: unknown, max = 30, maxLen = 100): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max).map((x) => x.slice(0, maxLen)) : []);

/** Strips characters that would alter a PostgREST filter expression, then bounds the term. */
export function sanitizeSearch(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.normalize('NFC').replace(/[,()*%\\"'`;:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, SOURCE_SEARCH_MAX);
  return t || null;
}

const STATUS_SETS: Record<SourceStatusFilter, readonly AiFindingStatus[] | null> = {
  ACTIVE: ['NEW', 'REVIEWED'], NEW: ['NEW'], REVIEWED: ['REVIEWED'], DISMISSED: ['DISMISSED'], ALL: null,
};

interface CommonFilters { provider?: AiProvider; status?: SourceStatusFilter }
type Parsed<T> = { ok: true; value: T } | { ok: false; error: { code: 'INVALID_FILTER'; message: string } };
const bad = (detail: string): Parsed<never> => ({ ok: false, error: { code: 'INVALID_FILTER', message: `Invalid filter or pagination: ${detail}` } });

/** Strict parse: unknown keys are rejected; enum and date-like values are validated; text is sanitized. */
function parseSourceFilters<T extends object>(
  raw: unknown,
  spec: { enums?: Record<string, readonly string[]>; dates?: readonly string[]; times?: readonly string[]; texts?: readonly string[]; ints?: readonly string[]; bools?: readonly string[] },
): Parsed<T> {
  if (raw === undefined || raw === null) return { ok: true, value: {} as T };
  if (typeof raw !== 'object' || Array.isArray(raw)) return bad('filters');
  const known = new Set([...Object.keys(spec.enums ?? {}), ...(spec.dates ?? []), ...(spec.times ?? []), ...(spec.texts ?? []), ...(spec.ints ?? []), ...(spec.bools ?? [])]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue;
    if (!known.has(k)) return bad(`unknown filter ${k}`);
    if (spec.enums?.[k]) { if (typeof v !== 'string' || !spec.enums[k]!.includes(v)) return bad(k); out[k] = v; }
    else if (spec.dates?.includes(k)) { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) return bad(k); out[k] = v; }
    else if (spec.times?.includes(k)) { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/.test(v) || Number.isNaN(Date.parse(v))) return bad(k); out[k] = v; }
    else if (spec.ints?.includes(k)) { if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100) return bad(k); out[k] = v; }
    else if (spec.bools?.includes(k)) { if (typeof v !== 'boolean') return bad(k); out[k] = v; }
    else { const t = sanitizeSearch(v); if (typeof v !== 'string') return bad(k); if (t) out[k] = t; }
  }
  return { ok: true, value: out as T };
}

const PROVIDER_STATUS = { provider: AI_PROVIDERS as readonly string[], status: SOURCE_STATUS_FILTERS as readonly string[] };

function applyCommon(q: any, f: CommonFilters, prefix = '') { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (f.provider) q = q.eq(`${prefix}provider`, f.provider);
  const set = STATUS_SETS[f.status ?? 'ALL'];
  if (set) q = set.length === 1 ? q.eq(`${prefix}status`, set[0]) : q.in(`${prefix}status`, [...set]);
  return q;
}

// ---- job leads ----------------------------------------------------------------------

/** freshness = best known posting time first (then match); match = provider score first; discovered = when JobQuest stored it. */
export const JOB_LEAD_SORTS = ['freshness', 'match', 'discovered'] as const;
export type JobLeadSort = (typeof JOB_LEAD_SORTS)[number];

export interface JobLeadFilters extends CommonFilters {
  search?: string; company?: string; title?: string; location?: string;
  workArrangement?: (typeof JOB_WORK_ARRANGEMENTS)[number]; employmentType?: (typeof JOB_EMPLOYMENT_TYPES)[number];
  minMatchScore?: number;
  /** AI-11D: only leads whose freshness time (posted time, else first stored) is within the last 12/24/48/72 hours. */
  recentHours?: (typeof DISCOVERY_FRESHNESS_HOURS)[number];
  /** AI-11D: restrict remote roles by the geography they admit (us = open to the whole United States). */
  remoteScope?: JobRemoteScope;
  sort?: JobLeadSort;
  discoveredSince?: string; discoveredBefore?: string; // ISO-8601 with offset
  postedSince?: string; postedBefore?: string; // YYYY-MM-DD, inclusive
}

export interface JobLeadDto {
  /** The parent finding id (the lead's identity everywhere: dismiss, MCP, links). */
  id: string; ownerId: string; provider: AiProvider; status: AiFindingStatus; priority: AiPriority; confidence: number | null;
  company: string; title: string; location: string | null; workArrangement: string | null; employmentType: string | null;
  sourceName: string | null; sourceUrl: string | null; postedDate: string | null; discoveredAt: string;
  /** AI-11D. Exact posting time when the source stated one; null = unknown (NEVER defaulted to today / now). */
  postedAt: string | null;
  /** Sort key only: the best known posting time, else when JobQuest first stored the lead. Not a posted time. */
  freshnessAt: string | null;
  /** Remote geography: the provider's scope, else a conservative reading of the stated location. Null = not stated / not remote. */
  remoteScope: JobRemoteScope | null; remoteNote: string | null;
  experienceMinYears: number | null; experienceMaxYears: number | null;
  /** Bounded provider reasons (analysis, not fact). */
  fitReasons: string[]; gapReasons: string[];
  canonicalUrl: string | null; externalJobId: string | null;
  /** Derived at read time from the owner's applications; null = not evaluated. A lead is never an application. */
  applicationMatch: LeadApplicationMatch | null;
  salary: { min: number | null; max: number | null; currency: string | null; period: string | null } | null;
  experienceLevel: string | null;
  /** Provider analysis 0..100 (null = not scored). Never an objective suitability measure. */
  matchScore: number | null;
  /** matchScore >= STRONG_MATCH_THRESHOLD; false whenever there is no score. */
  strongMatch: boolean;
  requiredSkills: string[]; preferredSkills: string[];
  summary: string | null; matchReasoning: string | null;
  descriptionAvailable: boolean; descriptionTruncated: boolean;
}

export const LEAD_COLUMNS = 'id, finding_id, user_id, company, title, location, work_arrangement, employment_type, source_name, source_url, canonical_url, external_job_id, posted_date, posted_at, discovered_at, '
  + 'freshness_at, remote_scope, remote_note, experience_min_years, experience_max_years, fit_reasons, gap_reasons, '
  + 'salary_min, salary_max, salary_currency, salary_period, experience_level, match_score, required_skills, preferred_skills, '
  + 'description_truncated, description_length, '
  + 'finding:ai_findings!inner(provider, status, priority, confidence, summary, payload)';

export const isStrongMatch = (score: number | null | undefined): boolean => typeof score === 'number' && score >= STRONG_MATCH_THRESHOLD;

export function toJobLead(r: Row): JobLeadDto {
  const f = rec(r.finding);
  const payload = rec(f.payload);
  const min = num(r.salary_min), max = num(r.salary_max);
  const score = num(r.match_score);
  return {
    id: s(r.finding_id), ownerId: s(r.user_id), provider: f.provider as AiProvider, status: f.status as AiFindingStatus, priority: f.priority as AiPriority,
    confidence: num(f.confidence), company: s(r.company), title: s(r.title), location: sn(r.location), workArrangement: sn(r.work_arrangement),
    employmentType: sn(r.employment_type), sourceName: sn(r.source_name), sourceUrl: safeUrl(r.source_url), postedDate: sn(r.posted_date),
    discoveredAt: s(r.discovered_at), postedAt: sn(r.posted_at), freshnessAt: sn(r.freshness_at),
    remoteScope: r.work_arrangement === 'remote'
      ? effectiveRemoteScope({ remote_scope: sn(r.remote_scope), location: sn(r.location), remote_note: sn(r.remote_note) }) : null,
    remoteNote: sn(r.remote_note), experienceMinYears: num(r.experience_min_years), experienceMaxYears: num(r.experience_max_years),
    fitReasons: strList(r.fit_reasons, 8, 200), gapReasons: strList(r.gap_reasons, 8, 200),
    canonicalUrl: safeUrl(r.canonical_url), externalJobId: str(r.external_job_id, 255), applicationMatch: null,
    salary: min !== null || max !== null ? { min, max, currency: sn(r.salary_currency), period: sn(r.salary_period) } : null,
    experienceLevel: sn(r.experience_level), matchScore: score, strongMatch: isStrongMatch(score),
    requiredSkills: strList(r.required_skills), preferredSkills: strList(r.preferred_skills),
    summary: str(f.summary, 1000), matchReasoning: str(payload.match_reasoning, 1000),
    descriptionAvailable: num(r.description_length) !== null && (num(r.description_length) ?? 0) > 0, descriptionTruncated: r.description_truncated === true,
  };
}

const LEAD_FILTERS = {
  enums: {
    ...PROVIDER_STATUS, workArrangement: JOB_WORK_ARRANGEMENTS as readonly string[], employmentType: JOB_EMPLOYMENT_TYPES as readonly string[],
    remoteScope: JOB_REMOTE_SCOPES as readonly string[], sort: JOB_LEAD_SORTS as readonly string[],
  },
  texts: ['search', 'company', 'title', 'location'], ints: ['minMatchScore', 'recentHours'], times: ['discoveredSince', 'discoveredBefore'], dates: ['postedSince', 'postedBefore'],
} as const;

/**
 * Freshest first by default (best known posting time, then provider match, stable id tiebreak); `description` is never selected here.
 * Each item carries the derived application match as optional context (a failed match read never fails the list).
 */
export async function listJobLeads(ctx: AiReadContext, filters?: JobLeadFilters, page?: AiPageRequest, deps: AiReadDeps = {}): Promise<AiReadResult<AiPage<JobLeadDto>>> {
  const p = prepare(ctx, deps); if (!p.ok) return p;
  const f = parseSourceFilters<JobLeadFilters>(filters, LEAD_FILTERS); if (!f.ok) return f;
  const pg = parsePage(page); if (!pg.ok) return pg;
  const v = f.value;
  if (v.recentHours !== undefined && !(DISCOVERY_FRESHNESS_HOURS as readonly number[]).includes(v.recentHours)) return fail('INVALID_FILTER', 'recentHours');
  let q = p.db.from('ai_job_leads').select(LEAD_COLUMNS).eq('workspace_id', p.ws);
  q = applyCommon(q, v, 'finding.');
  if (v.search) q = q.or(`company.ilike.%${v.search}%,title.ilike.%${v.search}%`);
  if (v.company) q = q.ilike('company', `%${v.company}%`);
  if (v.title) q = q.ilike('title', `%${v.title}%`);
  if (v.location) q = q.ilike('location', `%${v.location}%`);
  if (v.workArrangement) q = q.eq('work_arrangement', v.workArrangement);
  if (v.employmentType) q = q.eq('employment_type', v.employmentType);
  if (v.remoteScope) q = q.eq('work_arrangement', 'remote').eq('remote_scope', v.remoteScope);
  if (v.recentHours !== undefined) q = q.gte('freshness_at', new Date(Date.now() - v.recentHours * 3_600_000).toISOString());
  if (v.minMatchScore !== undefined) q = q.gte('match_score', v.minMatchScore);
  if (v.discoveredSince) q = q.gte('discovered_at', v.discoveredSince);
  if (v.discoveredBefore) q = q.lt('discovered_at', v.discoveredBefore);
  if (v.postedSince) q = q.gte('posted_date', v.postedSince);
  if (v.postedBefore) q = q.lte('posted_date', v.postedBefore);
  const sort = v.sort ?? 'freshness';
  q = sort === 'match' ? q.order('match_score', { ascending: false, nullsFirst: false }).order('freshness_at', { ascending: false })
    : sort === 'discovered' ? q.order('discovered_at', { ascending: false })
    : q.order('freshness_at', { ascending: false }).order('match_score', { ascending: false, nullsFirst: false });
  const { data, error } = await q.order('id', { ascending: false }).range(pg.from, pg.to);
  if (error) return dbFail(error);
  const result = sliced(((data ?? []) as Row[]).map(toJobLead), pg.page, pg.size);
  await attachLeadApplicationMatches(p.db as Db, p.ws, result.items); // optional context: never fails the list
  return { ok: true, data: result };
}

const leadMatchInput = (l: JobLeadDto): LeadMatchInput => ({
  id: l.id, ownerId: l.ownerId, company: l.company, title: l.title, location: l.location, workArrangement: l.workArrangement,
  canonicalUrl: l.canonicalUrl, sourceUrl: l.sourceUrl, externalJobId: l.externalJobId, sourceName: l.sourceName, referenceDate: l.postedAt ?? l.discoveredAt,
});

/** Mutates `items` with the derived match; returns false (leaving them null) when the application read failed. */
export async function attachLeadApplicationMatches(db: Db, ws: string, items: JobLeadDto[]): Promise<boolean> {
  if (items.length === 0) return true;
  try {
    const matches = await matchLeadsToApplications(db as MatchClient, ws, items.map(leadMatchInput));
    for (const l of items) l.applicationMatch = matches.get(l.id) ?? null;
    return true;
  } catch { return false; }
}

/** Most leads one matches lookup accepts (one UI page is far smaller). */
export const LEAD_MATCH_LOOKUP_MAX = 50;

/**
 * The derived application match for specific leads (the AI Hub Job Leads page reads rows under RLS and asks for the matches
 * here). Read-only; runs AS THE CALLER; an id that is not a readable lead in this workspace is simply absent.
 */
export async function getJobLeadApplicationMatches(ctx: AiReadContext, ids: readonly string[], deps: AiReadDeps = {}): Promise<AiReadResult<Record<string, LeadApplicationMatch>>> {
  const p = prepare(ctx, deps); if (!p.ok) return p;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > LEAD_MATCH_LOOKUP_MAX || !ids.every((i) => typeof i === 'string' && UUID_RE.test(i))) return fail('INVALID_FILTER', 'ids');
  const { data, error } = await p.db.from('ai_job_leads').select(LEAD_COLUMNS).eq('workspace_id', p.ws).in('finding_id', ids.map((i) => i.toLowerCase()));
  if (error) return dbFail(error);
  const items = ((data ?? []) as Row[]).map(toJobLead);
  if (!(await attachLeadApplicationMatches(p.db as Db, p.ws, items))) return fail('READ_FAILED');
  return { ok: true, data: Object.fromEntries(items.flatMap((l) => (l.applicationMatch ? [[l.id, l.applicationMatch] as const] : []))) };
}

// ---- email intelligence -------------------------------------------------------------

export interface EmailFilters extends CommonFilters {
  category?: (typeof EMAIL_CATEGORIES)[number]; company?: string; needsAttention?: boolean;
  receivedSince?: string; receivedBefore?: string; // ISO-8601 with offset
  group?: EmailGroup; urgency?: EmailUrgency; actionState?: EmailActionState;
  /** Derived at read time from the owner's applications; evaluated over a bounded window (EMAIL_MATCH_FILTER_WINDOW). */
  applicationMatch?: (typeof EMAIL_MATCH_STATES)[number];
}

/** Most recent items examined when filtering by application match (the match is derived, so it cannot be a SQL filter). */
export const EMAIL_MATCH_FILTER_WINDOW = 200;

export interface EmailEventDto {
  id: string; ownerId: string; provider: AiProvider; status: AiFindingStatus; priority: AiPriority; confidence: number | null;
  category: string | null; title: string; summary: string | null; evidence: string | null;
  /** When the email was received (the finding's occurred_at). */
  receivedAt: string | null; deadline: string | null; discoveredAt: string;
  senderName: string | null; senderDomain: string | null; subject: string | null;
  company: string | null; roleTitle: string | null;
  /** What the person should do (AI-11B `action_summary`; stored as `next_step`). Never an instruction to JobQuest. */
  nextStep: string | null; needsAttention: boolean;
  /** AI-11B. job_related | other, derived from the category (null for an unknown category). */
  group: EmailGroup | null;
  /** HIGH | MEDIUM | LOW: the stored priority seen through a fixed mapping. */
  urgency: EmailUrgency;
  /** needs_action | no_action | null (the provider did not say). */
  actionState: EmailActionState | null;
  /** The provider suggests a reply draft. A recommendation only: JobQuest never drafts or sends mail. */
  draftRecommended: boolean;
  /** A pipeline signal the email suggests. A hint only: it never changes an application. */
  stageHint: EmailStageHint | null;
  /** The run that produced this item. */
  runId: string | null;
  /** Derived from the owner's applications. Null = not evaluated (e.g. the lookup failed); never guessed. */
  applicationMatch: EmailApplicationMatch | null;
}

export const EMAIL_COLUMNS = 'id, user_id, run_id, provider, status, priority, confidence, category, title, summary, evidence, occurred_at, due_at, created_at, payload';

/**
 * Mirrors the `needsAttention` list filter exactly: an open email that is urgent or provider-flagged, or - only when the
 * provider gave no explicit action state - in an actionable category or dated. An explicit `no_action` is authoritative.
 */
export function emailNeedsAttention(e: { status: string; priority: string; category: string | null; dueAt: string | null; payload: JsonRecord }): boolean {
  if (e.status !== 'NEW') return false;
  if (e.priority === 'HIGH' || e.priority === 'CRITICAL' || e.payload.needs_attention === true) return true;
  if (e.payload.action_state !== undefined && e.payload.action_state !== null) return false;
  return (e.category !== null && (EMAIL_ATTENTION_CATEGORIES as readonly string[]).includes(e.category)) || e.dueAt !== null;
}

const oneOfList = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null);

export function toEmailEvent(r: Row): EmailEventDto {
  const payload = rec(r.payload);
  return {
    id: s(r.id), ownerId: s(r.user_id), provider: r.provider as AiProvider, status: r.status as AiFindingStatus, priority: r.priority as AiPriority,
    confidence: num(r.confidence), category: sn(r.category), title: s(r.title), summary: sn(r.summary), evidence: sn(r.evidence),
    receivedAt: sn(r.occurred_at), deadline: sn(r.due_at), discoveredAt: s(r.created_at),
    senderName: str(payload.sender_name, 200), senderDomain: str(payload.sender_domain, 255), subject: str(payload.subject, 200),
    company: str(payload.company, 200), roleTitle: str(payload.role_title, 300), nextStep: str(payload.next_step, 300),
    needsAttention: emailNeedsAttention({ status: s(r.status), priority: s(r.priority), category: sn(r.category), dueAt: sn(r.due_at), payload }),
    group: emailCategoryGroup(sn(r.category)), urgency: urgencyFromPriority(s(r.priority)),
    actionState: oneOfList(payload.action_state, EMAIL_ACTION_STATES), draftRecommended: payload.draft_recommended === true,
    stageHint: oneOfList(payload.application_stage_hint, EMAIL_STAGE_HINTS),
    runId: sn(r.run_id), applicationMatch: null,
  };
}

const EMAIL_FILTERS = {
  enums: {
    ...PROVIDER_STATUS, category: EMAIL_CATEGORIES as readonly string[], group: EMAIL_GROUPS as readonly string[], urgency: EMAIL_URGENCIES as readonly string[],
    actionState: EMAIL_ACTION_STATES as readonly string[], applicationMatch: EMAIL_MATCH_STATES as readonly string[],
  },
  texts: ['company'], bools: ['needsAttention'], times: ['receivedSince', 'receivedBefore'],
} as const;

/** Attaches the derived application match to job-related items. Best-effort: a lookup failure leaves `applicationMatch` null. */
export async function attachEmailApplicationMatches(db: Db, ws: string, items: EmailEventDto[]): Promise<boolean> {
  if (!items.some((e) => e.group === 'job_related')) return true;
  try {
    const matches = await matchEmailsToApplications(db as MatchClient, ws, items.map((e) => ({
      id: e.id, ownerId: e.ownerId, group: e.group, company: e.company, roleTitle: e.roleTitle, receivedAt: e.receivedAt,
    })));
    for (const e of items) e.applicationMatch = matches.get(e.id) ?? null;
    return true;
  } catch { return false; }
}

/** Newest received first. Findings without a received time cannot exist for this kind (the contract requires it). */
export async function listEmailIntelligence(ctx: AiReadContext, filters?: EmailFilters, page?: AiPageRequest, deps: AiReadDeps = {}): Promise<AiReadResult<AiPage<EmailEventDto>>> {
  const p = prepare(ctx, deps); if (!p.ok) return p;
  const f = parseSourceFilters<EmailFilters>(filters, EMAIL_FILTERS); if (!f.ok) return f;
  const pg = parsePage(page); if (!pg.ok) return pg;
  const v = f.value;
  let q = p.db.from('ai_findings').select(EMAIL_COLUMNS).eq('workspace_id', p.ws).eq('kind', 'email_event');
  q = applyCommon(q, v);
  if (v.group) q = q.in('category', emailGroupCategories(v.group));
  if (v.category) q = q.in('category', emailCategoryMembers(v.category));
  if (v.urgency) q = q.in('priority', prioritiesForUrgency(v.urgency));
  if (v.actionState) q = q.eq('payload->>action_state', v.actionState);
  if (v.company) q = q.ilike('payload->>company', `%${v.company}%`);
  if (v.needsAttention === true) q = q.eq('status', 'NEW').or(EMAIL_ATTENTION_OR);
  if (v.receivedSince) q = q.gte('occurred_at', v.receivedSince);
  if (v.receivedBefore) q = q.lt('occurred_at', v.receivedBefore);
  q = q.order('occurred_at', { ascending: false }).order('id', { ascending: false });

  if (v.applicationMatch) {
    // The match is derived from the owner's applications, so it is evaluated over a bounded window of the newest items.
    const { data, error } = await q.range(0, EMAIL_MATCH_FILTER_WINDOW - 1);
    if (error) return dbFail(error);
    const all = ((data ?? []) as Row[]).map(toEmailEvent);
    if (!(await attachEmailApplicationMatches(p.db as Db, p.ws, all))) return fail('READ_FAILED');
    const kept = all.filter((e) => e.applicationMatch?.state === v.applicationMatch);
    return { ok: true, data: { items: kept.slice(pg.from, pg.from + pg.size), page: pg.page, pageSize: pg.size, hasNext: kept.length > pg.from + pg.size } };
  }

  const { data, error } = await q.range(pg.from, pg.to);
  if (error) return dbFail(error);
  const result = sliced(((data ?? []) as Row[]).map(toEmailEvent), pg.page, pg.size);
  await attachEmailApplicationMatches(p.db as Db, p.ws, result.items); // optional context: never fails the list
  return { ok: true, data: result };
}

/** Most email items one matches lookup accepts (one UI page is far smaller). */
export const EMAIL_MATCH_LOOKUP_MAX = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The derived application match for specific email items (the AI Hub Email page reads the rows itself under RLS and asks
 * for the matches here). Read-only; runs AS THE CALLER; an id that is not a readable email in this workspace is simply absent.
 */
export async function getEmailApplicationMatches(ctx: AiReadContext, ids: readonly string[], deps: AiReadDeps = {}): Promise<AiReadResult<Record<string, EmailApplicationMatch>>> {
  const p = prepare(ctx, deps); if (!p.ok) return p;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > EMAIL_MATCH_LOOKUP_MAX || !ids.every((i) => typeof i === 'string' && UUID_RE.test(i))) return fail('INVALID_FILTER', 'ids');
  const { data, error } = await p.db.from('ai_findings').select(EMAIL_COLUMNS).eq('workspace_id', p.ws).eq('kind', 'email_event').in('id', ids.map((i) => i.toLowerCase()));
  if (error) return dbFail(error);
  const items = ((data ?? []) as Row[]).map(toEmailEvent);
  if (!(await attachEmailApplicationMatches(p.db as Db, p.ws, items))) return fail('READ_FAILED');
  return { ok: true, data: Object.fromEntries(items.flatMap((e) => (e.applicationMatch ? [[e.id, e.applicationMatch] as const] : []))) };
}

// ---- recruiter intelligence -----------------------------------------------------------

export interface RecruiterFilters extends CommonFilters {
  search?: string; company?: string; discoveredSince?: string; discoveredBefore?: string;
}

export interface RecruiterIntelDto {
  id: string; ownerId: string; provider: AiProvider; status: AiFindingStatus; confidence: number | null;
  name: string; roleTitle: string | null; company: string; relationship: string | null;
  /** 'verified' only when the provider cited a public source and flagged nothing uncertain. */
  verification: 'verified' | 'uncertain'; uncertainFields: string[];
  sourceName: string | null; sourceUrl: string | null; profileUrl: string | null;
  /** Present only when the provider cited a contact source URL. Never inferred or guessed. */
  contact: { email: string | null; phone: string | null; sourceUrl: string | null } | null;
  summary: string | null; discoveredAt: string;
  /** The job lead this research relates to, resolved inside the caller's own RLS scope. Null when unknown or not stored. */
  relatedLead: { id: string; company: string; title: string } | null;
  relatedJob: { company: string | null; title: string | null } | null;
}

export const RECRUITER_COLUMNS = 'id, user_id, provider, status, confidence, title, summary, source_ref, created_at, payload';

export function toRecruiterIntel(r: Row): RecruiterIntelDto {
  const payload = rec(r.payload);
  const ref = rec(r.source_ref);
  const email = str(payload.contact_email, 254), phone = str(payload.contact_phone, 32);
  const contactSource = safeUrl(payload.contact_source_url);
  const related = rec(payload.related_job);
  return {
    id: s(r.id), ownerId: s(r.user_id), provider: r.provider as AiProvider, status: r.status as AiFindingStatus, confidence: num(r.confidence),
    name: str(payload.recruiter_name, 200) ?? s(r.title), roleTitle: str(payload.role_title, 200), company: str(payload.company, 200) ?? '',
    relationship: str(payload.relationship, 32),
    verification: payload.verification === 'verified' ? 'verified' : 'uncertain',
    uncertainFields: strList(payload.uncertain_fields, 5),
    sourceName: str(payload.source_name, 100), sourceUrl: safeUrl(ref.url), profileUrl: safeUrl(payload.profile_url),
    contact: contactSource && (email || phone) ? { email, phone, sourceUrl: contactSource } : null,
    summary: sn(r.summary), discoveredAt: s(r.created_at), relatedLead: null,
    relatedJob: Object.keys(related).length ? { company: str(related.company, 200), title: str(related.title, 300) } : null,
  };
}

/**
 * Resolves each recruiter's related job to a lead in the CALLER'S OWN scope (RLS + workspace). The
 * reference is a public job identity the server turned into a dedupe key; an id supplied by a
 * provider is never used, and a lead that RLS hides simply does not resolve.
 */
export async function attachRelatedLeads(db: Db, ws: string, rows: Row[], dtos: RecruiterIntelDto[]): Promise<boolean> {
  const wanted = rows.map((r) => rec(rec(r.payload)));
  const keys = [...new Set(wanted.map((p) => str(p.related_job_key, 255)).filter((k): k is string => k !== null))];
  const urls = [...new Set(wanted.map((p) => safeUrl(rec(p.related_job).job_url)).filter((u): u is string => u !== null))];
  if (keys.length === 0 && urls.length === 0) return true;
  const [byKey, byUrl] = await Promise.all([
    keys.length ? db.from('ai_findings').select('id, dedupe_key, title').eq('workspace_id', ws).eq('kind', 'job_lead').in('dedupe_key', keys) : Promise.resolve({ data: [], error: null }),
    urls.length ? db.from('ai_job_leads').select('finding_id, company, title, canonical_url').eq('workspace_id', ws).in('canonical_url', urls.map(canon)) : Promise.resolve({ data: [], error: null }),
  ]);
  if (byKey.error || byUrl.error) return false;
  const keyed = new Map(((byKey.data ?? []) as Row[]).map((r) => [s(r.dedupe_key), r]));
  const urlKeyed = new Map(((byUrl.data ?? []) as Row[]).map((r) => [s(r.canonical_url), r]));
  const leadInfo = new Map<string, { id: string; company: string; title: string }>();
  const companyTitle = async (ids: string[]) => {
    if (ids.length === 0) return;
    const { data } = await db.from('ai_job_leads').select('finding_id, company, title').eq('workspace_id', ws).in('finding_id', ids);
    for (const r of (data ?? []) as Row[]) leadInfo.set(s(r.finding_id), { id: s(r.finding_id), company: s(r.company), title: s(r.title) });
  };
  await companyTitle([...keyed.values()].map((r) => s(r.id)));
  dtos.forEach((d, i) => {
    const p = wanted[i]!;
    const k = str(p.related_job_key, 255);
    const u = safeUrl(rec(p.related_job).job_url);
    const byK = k ? keyed.get(k) : undefined;
    if (byK) { d.relatedLead = leadInfo.get(s(byK.id)) ?? { id: s(byK.id), company: d.relatedJob?.company ?? '', title: s(byK.title) }; return; }
    const byU = u ? urlKeyed.get(canon(u)) : undefined;
    if (byU) d.relatedLead = { id: s(byU.finding_id), company: s(byU.company), title: s(byU.title) };
  });
  return true;
}

const canon = (u: string): string => {
  try {
    const x = new URL(u);
    x.hash = ''; x.username = ''; x.password = '';
    for (const k of [...x.searchParams.keys()]) if (/^(utm_.*|gclid|fbclid|msclkid|mc_cid|mc_eid|igshid|_hsenc|_hsmi|trk|trackingid)$/i.test(k)) x.searchParams.delete(k);
    x.searchParams.sort();
    if (x.pathname.length > 1) x.pathname = x.pathname.replace(/\/+$/, '') || '/';
    return x.toString();
  } catch { return u; }
};

const RECRUITER_FILTERS = { enums: PROVIDER_STATUS, texts: ['search', 'company'], times: ['discoveredSince', 'discoveredBefore'] } as const;

export async function listRecruiterIntel(ctx: AiReadContext, filters?: RecruiterFilters, page?: AiPageRequest, deps: AiReadDeps = {}): Promise<AiReadResult<AiPage<RecruiterIntelDto>>> {
  const p = prepare(ctx, deps); if (!p.ok) return p;
  const f = parseSourceFilters<RecruiterFilters>(filters, RECRUITER_FILTERS); if (!f.ok) return f;
  const pg = parsePage(page); if (!pg.ok) return pg;
  const v = f.value;
  let q = p.db.from('ai_findings').select(RECRUITER_COLUMNS).eq('workspace_id', p.ws).eq('kind', 'recruiter_intel');
  q = applyCommon(q, v);
  if (v.search) q = q.or(`payload->>recruiter_name.ilike.%${v.search}%,payload->>company.ilike.%${v.search}%`);
  if (v.company) q = q.ilike('payload->>company', `%${v.company}%`);
  if (v.discoveredSince) q = q.gte('created_at', v.discoveredSince);
  if (v.discoveredBefore) q = q.lt('created_at', v.discoveredBefore);
  const { data, error } = await q.order('created_at', { ascending: false }).order('id', { ascending: false }).range(pg.from, pg.to);
  if (error) return dbFail(error);
  const rows = ((data ?? []) as Row[]).slice(0, pg.size);
  const items = rows.map(toRecruiterIntel);
  if (!(await attachRelatedLeads(p.db as Db, p.ws, rows, items))) return fail('READ_FAILED');
  return { ok: true, data: { items, page: pg.page, pageSize: pg.size, hasNext: ((data ?? []) as Row[]).length > pg.size } };
}
