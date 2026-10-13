import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { applyStatus, range, sliceRows, type Query, type SourcePage } from './aiSources';
import {
  CALENDAR_PAGE_SIZE, associateApplication, associateLead, calendarWindow, calendarWindowOr, canonicalJobUrl, correlateEmails, toCalendarView,
  type ApplicationCandidate, type CalendarCounts, type CalendarEventView, type CalendarFilters, type CalendarRow, type EmailCandidate, type LeadCandidate,
} from '../lib/aiCalendar';
import { sanitizeSearch } from '../lib/aiSources';

// READ-ONLY selects with the user's session (RLS is the authority) plus the shared owner-only dismiss
// review action (api/aiSources.ts). Nothing here writes to applications, tasks or any calendar, and no
// provider id is ever trusted: associations are resolved from public identity (job URL, company + title)
// inside the caller's own scope, are never persisted, and stay unlinked when ambiguous.

type Client = Pick<SupabaseClient, 'from'>;
const fail = () => new Error('AI_CALENDAR_LOAD_FAILED');

const CALENDAR_COLUMNS = 'finding_id, user_id, category, is_deadline, status, all_day, start_at, end_at, start_date, end_date, deadline_at, sort_at, time_zone, '
  + 'calendar_source, source_event_url, company, job_title, location, meeting_url, organizer_name, organizer_domain, original_start_at, reschedule_count, '
  + 'cancelled_at, discovered_at, finding:ai_findings!inner(provider, status, priority, confidence, title, summary, evidence, job_url:payload->>job_url)';

export async function fetchCalendarPage(
  workspaceId: string, f: CalendarFilters, timeZone: string, weekStart: 0 | 1, page: number, now: Date = new Date(), client: Client = supabase,
): Promise<SourcePage<CalendarEventView>> {
  const w = calendarWindow(f.view, f.range, timeZone, now, weekStart);
  if (!w.ok) throw fail();
  let q: Query = client.from('ai_calendar_events').select(CALENDAR_COLUMNS).eq('workspace_id', workspaceId).or(calendarWindowOr(w.window));
  q = applyStatus(q, f.status, 'finding.');
  if (f.provider !== 'ALL') q = q.eq('finding.provider', f.provider);
  if (f.category !== 'ALL') q = q.eq('category', f.category);
  if (f.eventStatus !== 'ALL') q = q.eq('status', f.eventStatus);
  const company = sanitizeSearch(f.company);
  if (company) q = q.ilike('company', `%${company}%`);
  const asc = w.window.order === 'asc';
  const { from, to } = range(page);
  const { data, error } = await q.order('sort_at', { ascending: asc }).order('id', { ascending: asc }).range(from, to);
  if (error) throw fail();
  const out = sliceRows<CalendarRow, CalendarEventView>(data, toCalendarView);
  await enrich(workspaceId, out.rows, client); // isolated: a failure leaves the page without links, never without events
  return out;
}

const ilikeAny = (col: string, values: string[]) => values.map((v) => `${col}.ilike.${v}`).join(',');

/**
 * Best-effort links, resolved inside the caller's own RLS scope: a stored Job Lead (exact job URL, else company + title),
 * a tracked application (same rule) and emails that clearly describe the same item (same company, deadline within an
 * hour). Ambiguous matches stay unlinked, nothing is persisted, and any failure just means no links.
 */
async function enrich(workspaceId: string, views: CalendarEventView[], client: Client): Promise<void> {
  if (views.length === 0) return;
  try {
    const companies = [...new Set(views.map((v) => (v.company ? sanitizeSearch(v.company) : '')).filter(Boolean))].slice(0, 20);
    const urls = [...new Set(views.map((v) => canonicalJobUrl(v.jobUrl)).filter((u): u is string => u !== null))].slice(0, 20);
    const times = views.map((v) => Date.parse(v.sortAt)).filter(Number.isFinite);
    const lo = new Date(Math.min(...times) - 3_600_000).toISOString(), hi = new Date(Math.max(...times) + 3_600_000).toISOString();
    const none = Promise.resolve({ data: [], error: null });
    const [leadsByCompany, leadsByUrl, apps, emails] = await Promise.all([
      companies.length ? client.from('ai_job_leads').select('finding_id, company, title, canonical_url').eq('workspace_id', workspaceId).or(ilikeAny('company', companies)).limit(100) : none,
      urls.length ? client.from('ai_job_leads').select('finding_id, company, title, canonical_url').eq('workspace_id', workspaceId).in('canonical_url', urls).limit(100) : none,
      companies.length ? client.from('applications').select('id, company_name, role_title, job_url').eq('workspace_id', workspaceId).is('archived_at', null).or(ilikeAny('company_name', companies)).limit(100) : none,
      companies.length ? client.from('ai_findings').select('id, title, due_at, company:payload->>company').eq('workspace_id', workspaceId).eq('kind', 'email_event')
        .in('status', ['NEW', 'REVIEWED']).gte('due_at', lo).lte('due_at', hi).limit(100) : none,
    ]);
    if (leadsByCompany.error || leadsByUrl.error || apps.error || emails.error) return;
    const leads = new Map<string, LeadCandidate>();
    for (const r of [...(leadsByCompany.data ?? []), ...(leadsByUrl.data ?? [])] as Array<Record<string, unknown>>) {
      leads.set(String(r.finding_id), { id: String(r.finding_id), company: String(r.company), title: String(r.title), canonicalUrl: typeof r.canonical_url === 'string' ? r.canonical_url : null });
    }
    const applications: ApplicationCandidate[] = ((apps.data ?? []) as Array<Record<string, unknown>>)
      .map((r) => ({ id: String(r.id), company: String(r.company_name ?? ''), role: String(r.role_title ?? ''), jobUrl: typeof r.job_url === 'string' ? r.job_url : null }));
    const mail: EmailCandidate[] = ((emails.data ?? []) as Array<Record<string, unknown>>)
      .map((r) => ({ id: String(r.id), title: String(r.title ?? ''), company: typeof r.company === 'string' ? r.company : null, dueAt: typeof r.due_at === 'string' ? r.due_at : null }));
    for (const v of views) {
      const lead = associateLead(v, [...leads.values()]);
      if (lead) v.relatedLead = { id: lead.id, company: lead.company, title: lead.title };
      const app = associateApplication(v, applications);
      if (app) v.relatedApplication = { id: app.id, company: app.company, role: app.role };
      v.relatedEmails = correlateEmails(v, mail);
    }
  } catch { /* links are optional */ }
}

/** Overview card: three bounded head counts over what is still ahead (active findings only; cancelled items are not "upcoming"). */
export async function fetchCalendarCounts(
  workspaceId: string, timeZone: string, now: Date = new Date(), client: Client = supabase,
): Promise<CalendarCounts> {
  const w = calendarWindow('upcoming', { from: '', to: '' }, timeZone, now);
  if (!w.ok) throw fail();
  const base = () => client.from('ai_calendar_events').select('id, finding:ai_findings!inner(status)', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId).in('finding.status', ['NEW', 'REVIEWED']).neq('status', 'cancelled').or(calendarWindowOr(w.window));
  const [upcoming, interviews, deadlines] = await Promise.all([base(), base().eq('category', 'interview'), base().eq('is_deadline', true)]);
  if (upcoming.error || interviews.error || deadlines.error) throw fail();
  return { upcoming: upcoming.count ?? 0, interviews: interviews.count ?? 0, deadlines: deadlines.count ?? 0 };
}

export { CALENDAR_PAGE_SIZE };
