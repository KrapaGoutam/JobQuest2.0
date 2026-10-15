import type { SupabaseClient } from '@supabase/supabase-js';
import { api, type PublicSession } from '../api';
import { supabase } from '../supabase';
import { shiftDay, type DigestRow } from '../lib/aiDigest';
import type { WeeklyDigest } from '../lib/aiWeekly';
import { zonedWallTimeToUtcIso } from '../lib/time';

// READ-ONLY selects with the user's session (RLS is the authority) plus one explicit,
// user-initiated POST that stores a JobQuest-generated snapshot for TODAY. Stored digests
// are returned exactly as saved; nothing here recomputes a historical digest.

type Client = Pick<SupabaseClient, 'from'>;
export const DIGEST_PAGE_SIZE = 7;
const DIGEST_COLUMNS = 'id, user_id, provider, status, title, summary, created_at, payload';
const fail = () => new Error('AI_DIGEST_LOAD_FAILED');

export interface DigestQuery { dateFrom: string; dateTo: string; provider: string }

/** One page of digests, newest date first. Fetches size+1 rows so "has next" needs no count query. */
export async function fetchDigestPage(
  workspaceId: string, query: DigestQuery, page: number, client: Client = supabase,
): Promise<{ rows: DigestRow[]; hasNext: boolean }> {
  let q = client.from('ai_findings').select(DIGEST_COLUMNS).eq('workspace_id', workspaceId).eq('kind', 'daily_brief')
    // dedupe_key = daily_brief:YYYY-MM-DD:provider, so a prefix range selects whole calendar dates (inclusive end).
    .gte('dedupe_key', `daily_brief:${query.dateFrom}`).lt('dedupe_key', `daily_brief:${shiftDay(query.dateTo, 1)}`);
  if (query.provider !== 'ALL') q = q.eq('provider', query.provider);
  const from = Math.max(0, Math.floor(page)) * DIGEST_PAGE_SIZE;
  const { data, error } = await q.order('dedupe_key', { ascending: false }).order('id', { ascending: false }).range(from, from + DIGEST_PAGE_SIZE);
  if (error) throw fail();
  const rows = (data ?? []) as unknown as DigestRow[];
  return { rows: rows.slice(0, DIGEST_PAGE_SIZE), hasNext: rows.length > DIGEST_PAGE_SIZE };
}

export interface LiveMetrics { applicationsAdded: number; activeApplications: number; followUps: number; pendingSuggestions: number }

/**
 * CURRENT JobQuest facts for today's date (owner's rows only). Shown only when no digest has been
 * stored for today, and always labelled as live, never as a stored digest.
 */
export async function fetchLiveMetrics(
  workspaceId: string, userId: string, today: string, timeZone: string, client: Client = supabase,
): Promise<LiveMetrics> {
  let start: string; let end: string;
  try {
    start = zonedWallTimeToUtcIso(today, '00:00', timeZone);
    end = zonedWallTimeToUtcIso(shiftDay(today, 1), '00:00', timeZone);
  } catch { // midnight skipped by a DST change in a few zones: fall back to UTC day bounds
    start = `${today}T00:00:00.000Z`; end = `${shiftDay(today, 1)}T00:00:00.000Z`;
  }
  const apps = () => client.from('applications').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('user_id', userId).is('archived_at', null);
  const [added, active, due, pending] = await Promise.all([
    apps().gte('created_at', start).lt('created_at', end),
    apps().eq('status', 'OPEN'),
    apps().eq('status', 'OPEN').not('next_action_date', 'is', null).lte('next_action_date', today),
    client.from('ai_suggestions').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('user_id', userId).eq('status', 'PENDING'),
  ]);
  if ([added, active, due, pending].some((r) => r.error)) throw fail();
  return { applicationsAdded: added.count ?? 0, activeApplications: active.count ?? 0, followUps: due.count ?? 0, pendingSuggestions: pending.count ?? 0 };
}

/** Stores JobQuest's own deterministic digest for today (provider "system"). Idempotent per date. */
export async function generateTodayDigest(workspaceId: string, session: PublicSession): Promise<{ digestDate: string; duplicate: boolean }> {
  const r = await api<{ digest_date?: string; duplicate?: boolean; error?: { message?: string } }>('/ai/digest/generate', { workspace_id: workspaceId }, session.access_token);
  if (r.status !== 200 || !r.data.digest_date) throw new Error(r.data.error?.message ?? 'Could not generate the digest.');
  return { digestDate: r.data.digest_date, duplicate: r.data.duplicate === true };
}

export class WeeklyApiError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

/** AI-11H: the Weekly Digest for the owner's week (null = the current week). Read-only; the server computes it from the owner's records. */
export async function fetchWeeklyDigest(workspaceId: string, session: PublicSession, weekStart: string | null): Promise<WeeklyDigest> {
  const qs = `workspace_id=${encodeURIComponent(workspaceId)}${weekStart ? `&week_start=${encodeURIComponent(weekStart)}` : ''}`;
  const r = await api<WeeklyDigest & { error?: { code?: string; message?: string } }>(`/ai/digest/weekly?${qs}`, undefined, session.access_token);
  if (r.status !== 200 || r.data.kind !== 'weekly_digest') throw new WeeklyApiError(r.data.error?.code ?? 'WEEKLY_FAILED', r.data.error?.message ?? 'Could not build the weekly digest.');
  return r.data;
}
