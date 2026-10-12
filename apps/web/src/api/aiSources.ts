import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import {
  EMAIL_ATTENTION_OR, SOURCE_PAGE_SIZE, SOURCE_STATUSES, SOURCE_WORKFLOW, clampScore, resolveDateRange, sanitizeSearch,
  toEmailView, toJobLeadView, toRecruiterView,
  type EmailFilters, type EmailRow, type EmailView, type JobLeadFilters, type JobLeadRow, type JobLeadView,
  type RecruiterFilters, type RecruiterRow, type RecruiterView, type SourceKind,
} from '../lib/aiSources';

// READ-ONLY selects with the user's session (RLS is the authority) plus ONE review action
// (rpc_ai_dismiss_finding, owner-only, AI rows only, audited by the database). Nothing here writes
// to applications, contacts, tasks or any mailbox, and no provider id is ever trusted: the related
// lead of a recruiter is looked up by public job identity inside the caller's own RLS scope.

type Client = Pick<SupabaseClient, 'from'>;
type ActionClient = Pick<SupabaseClient, 'rpc'>;
const fail = () => new Error('AI_SOURCE_LOAD_FAILED');
export const range = (page: number) => { const p = Math.max(0, Math.floor(page)); return { from: p * SOURCE_PAGE_SIZE, to: p * SOURCE_PAGE_SIZE + SOURCE_PAGE_SIZE }; };

export interface SourcePage<T> { rows: T[]; hasNext: boolean }
export const sliceRows = <R, V>(data: unknown, map: (r: R) => V): SourcePage<V> => {
  const rows = (Array.isArray(data) ? data : []) as R[];
  return { rows: rows.slice(0, SOURCE_PAGE_SIZE).map(map), hasNext: rows.length > SOURCE_PAGE_SIZE };
};

export type Query = any; // eslint-disable-line @typescript-eslint/no-explicit-any
export function applyStatus(q: Query, status: keyof typeof SOURCE_STATUSES | 'ALL', prefix = ''): Query {
  if (status === 'ALL') return q;
  const set = SOURCE_STATUSES[status];
  return set.length === 1 ? q.eq(`${prefix}status`, set[0]) : q.in(`${prefix}status`, [...set]);
}

// ---- job leads ----------------------------------------------------------------------------------

const LEAD_COLUMNS = 'finding_id, user_id, company, title, location, work_arrangement, employment_type, source_name, source_url, posted_date, discovered_at, '
  + 'salary_min, salary_max, salary_currency, salary_period, experience_level, match_score, required_skills, preferred_skills, description_truncated, description_length, '
  + 'finding:ai_findings!inner(provider, status, priority, confidence, summary, payload)';

export async function fetchJobLeadsPage(
  workspaceId: string, f: JobLeadFilters, timeZone: string, page: number, client: Client = supabase,
): Promise<SourcePage<JobLeadView>> {
  const disc = resolveDateRange(f.discovered, timeZone);
  if (!disc.ok) throw fail();
  const posted = f.posted;
  let q: Query = client.from('ai_job_leads').select(LEAD_COLUMNS).eq('workspace_id', workspaceId);
  q = applyStatus(q, f.status, 'finding.');
  if (f.provider !== 'ALL') q = q.eq('finding.provider', f.provider);
  const search = sanitizeSearch(f.search);
  if (search) q = q.or(`company.ilike.%${search}%,title.ilike.%${search}%`);
  const company = sanitizeSearch(f.company), location = sanitizeSearch(f.location);
  if (company) q = q.ilike('company', `%${company}%`);
  if (location) q = q.ilike('location', `%${location}%`);
  if (f.arrangement !== 'ALL') q = q.eq('work_arrangement', f.arrangement);
  if (f.employmentType !== 'ALL') q = q.eq('employment_type', f.employmentType);
  const min = clampScore(f.minScore);
  if (min !== null) q = q.gte('match_score', min);
  if (disc.since) q = q.gte('discovered_at', disc.since);
  if (disc.before) q = q.lt('discovered_at', disc.before);
  if (posted.from) q = q.gte('posted_date', posted.from);
  if (posted.to) q = q.lte('posted_date', posted.to);
  const { from, to } = range(page);
  const { data, error } = await q.order('discovered_at', { ascending: false }).order('id', { ascending: false }).range(from, to);
  if (error) throw fail();
  return sliceRows<JobLeadRow, JobLeadView>(data, toJobLeadView);
}

/** The (up to 30,000 character) plain-text description is fetched for one lead at a time, never in list reads. */
export async function fetchJobLeadDescription(workspaceId: string, findingId: string, client: Client = supabase): Promise<string | null> {
  const { data, error } = await client.from('ai_job_leads').select('description').eq('workspace_id', workspaceId).eq('finding_id', findingId).maybeSingle();
  if (error) throw fail();
  const d = (data as { description?: unknown } | null)?.description;
  return typeof d === 'string' && d !== '' ? d : null;
}

// ---- email --------------------------------------------------------------------------------------------

const EMAIL_COLUMNS = 'id, user_id, provider, status, priority, confidence, category, title, summary, evidence, occurred_at, due_at, created_at, payload';

export async function fetchEmailPage(workspaceId: string, f: EmailFilters, timeZone: string, page: number, client: Client = supabase): Promise<SourcePage<EmailView>> {
  const received = resolveDateRange(f.received, timeZone);
  if (!received.ok) throw fail();
  let q: Query = client.from('ai_findings').select(EMAIL_COLUMNS).eq('workspace_id', workspaceId).eq('kind', 'email_event');
  q = applyStatus(q, f.status);
  if (f.provider !== 'ALL') q = q.eq('provider', f.provider);
  if (f.category !== 'ALL') q = q.eq('category', f.category);
  const company = sanitizeSearch(f.company);
  if (company) q = q.ilike('payload->>company', `%${company}%`);
  if (f.needsAttention) q = q.eq('status', 'NEW').or(EMAIL_ATTENTION_OR);
  if (received.since) q = q.gte('occurred_at', received.since);
  if (received.before) q = q.lt('occurred_at', received.before);
  const { from, to } = range(page);
  const { data, error } = await q.order('occurred_at', { ascending: false }).order('id', { ascending: false }).range(from, to);
  if (error) throw fail();
  return sliceRows<EmailRow, EmailView>(data, toEmailView);
}

// ---- recruiters -----------------------------------------------------------------------------------------

const RECRUITER_COLUMNS = 'id, user_id, provider, status, confidence, title, summary, source_ref, created_at, payload';
const canonicalUrl = (u: string): string => {
  try {
    const x = new URL(u);
    x.hash = ''; x.username = ''; x.password = '';
    for (const k of [...x.searchParams.keys()]) if (/^(utm_.*|gclid|fbclid|msclkid|mc_cid|mc_eid|igshid|_hsenc|_hsmi|trk|trackingid)$/i.test(k)) x.searchParams.delete(k);
    x.searchParams.sort();
    if (x.pathname.length > 1) x.pathname = x.pathname.replace(/\/+$/, '') || '/';
    return x.toString();
  } catch { return u; }
};

export async function fetchRecruiterPage(workspaceId: string, f: RecruiterFilters, timeZone: string, page: number, client: Client = supabase): Promise<SourcePage<RecruiterView>> {
  const disc = resolveDateRange(f.discovered, timeZone);
  if (!disc.ok) throw fail();
  let q: Query = client.from('ai_findings').select(RECRUITER_COLUMNS).eq('workspace_id', workspaceId).eq('kind', 'recruiter_intel');
  q = applyStatus(q, f.status);
  if (f.provider !== 'ALL') q = q.eq('provider', f.provider);
  const search = sanitizeSearch(f.search), company = sanitizeSearch(f.company);
  if (search) q = q.or(`payload->>recruiter_name.ilike.%${search}%,payload->>company.ilike.%${search}%`);
  if (company) q = q.ilike('payload->>company', `%${company}%`);
  if (disc.since) q = q.gte('created_at', disc.since);
  if (disc.before) q = q.lt('created_at', disc.before);
  const { from, to } = range(page);
  const { data, error } = await q.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to);
  if (error) throw fail();
  const out = sliceRows<RecruiterRow, RecruiterView>(data, toRecruiterView);

  // Related lead: public job identity (never a provider-supplied id), resolved in the caller's own RLS scope.
  const keys = [...new Set(out.rows.map((r) => r.relatedJobKey).filter((k): k is string => k !== null))];
  const urls = [...new Set(out.rows.map((r) => r.relatedJobUrl).filter((u): u is string => u !== null).map(canonicalUrl))];
  if (keys.length || urls.length) {
    const [byKey, byUrl] = await Promise.all([
      keys.length ? client.from('ai_findings').select('id, dedupe_key').eq('workspace_id', workspaceId).eq('kind', 'job_lead').in('dedupe_key', keys) : Promise.resolve({ data: [], error: null }),
      urls.length ? client.from('ai_job_leads').select('finding_id, company, title, canonical_url').eq('workspace_id', workspaceId).in('canonical_url', urls) : Promise.resolve({ data: [], error: null }),
    ]);
    if (byKey.error || byUrl.error) throw fail();
    const idsByKey = new Map(((byKey.data ?? []) as Array<{ id: string; dedupe_key: string }>).map((r) => [r.dedupe_key, r.id]));
    const leadsByUrl = new Map(((byUrl.data ?? []) as Array<{ finding_id: string; company: string; title: string; canonical_url: string }>).map((r) => [r.canonical_url, r]));
    const keyedIds = [...new Set(idsByKey.values())];
    const keyedLeads = new Map<string, { finding_id: string; company: string; title: string }>();
    if (keyedIds.length) {
      const { data: kl, error: ke } = await client.from('ai_job_leads').select('finding_id, company, title').eq('workspace_id', workspaceId).in('finding_id', keyedIds);
      if (ke) throw fail();
      for (const r of (kl ?? []) as Array<{ finding_id: string; company: string; title: string }>) keyedLeads.set(r.finding_id, r);
    }
    for (const r of out.rows) {
      const id = r.relatedJobKey ? idsByKey.get(r.relatedJobKey) : undefined;
      const hit = (id ? keyedLeads.get(id) : undefined) ?? (r.relatedJobUrl ? leadsByUrl.get(canonicalUrl(r.relatedJobUrl)) : undefined);
      if (hit) r.relatedLead = { id: String(hit.finding_id), company: String(hit.company), title: String(hit.title) };
    }
  }
  return out;
}

// ---- configured? ------------------------------------------------------------------------------------------

/** True when the source's workflow has completed at least one successful (or partial) run. Distinguishes "not configured" from "no results". */
export async function fetchSourceConfigured(workspaceId: string, kind: SourceKind, client: Client = supabase): Promise<boolean> {
  const { data, error } = await client.from('ai_runs').select('id').eq('workspace_id', workspaceId)
    .eq('workflow', SOURCE_WORKFLOW[kind]).in('status', ['SUCCEEDED', 'PARTIAL']).limit(1);
  if (error) throw fail();
  return (data ?? []).length > 0;
}

// ---- the one review action ---------------------------------------------------------------------------------

/** Owner-only, AI rows only (rpc_ai_dismiss_finding). Does not touch applications, contacts, tasks or email. */
export async function dismissAiFinding(findingId: string, client: ActionClient = supabase): Promise<void> {
  const { error } = await client.rpc('rpc_ai_dismiss_finding', { p_finding_id: findingId });
  if (error) throw new Error('AI_DISMISS_FAILED');
}

// ---- overview counts -----------------------------------------------------------------------------------------

export interface SourceCounts { newJobLeads: number; emailAttention: number; recruiterIntel: number }

/** Three head counts for the Overview cards (all RLS-scoped). */
export async function fetchSourceCounts(workspaceId: string, client: Client = supabase): Promise<SourceCounts> {
  const [leads, email, recruiters] = await Promise.all([
    client.from('ai_job_leads').select('id, finding:ai_findings!inner(status)', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('finding.status', 'NEW'),
    client.from('ai_findings').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('kind', 'email_event').eq('status', 'NEW').or(EMAIL_ATTENTION_OR),
    client.from('ai_findings').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('kind', 'recruiter_intel').in('status', ['NEW', 'REVIEWED']),
  ]);
  if (leads.error || email.error || recruiters.error) throw fail();
  return { newJobLeads: leads.count ?? 0, emailAttention: email.count ?? 0, recruiterIntel: recruiters.count ?? 0 };
}
