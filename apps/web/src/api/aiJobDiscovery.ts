import type { SupabaseClient } from '@supabase/supabase-js';
import { api, type PublicSession } from '../api';
import { supabase } from '../supabase';
import { toEmailMatchView, type EmailMatchView } from '../lib/aiSources';
import {
  DEFAULT_DISCOVERY_PROFILE, toDiscoveryRunView, type DiscoveryRunRow, type DiscoveryRunView, type JobDiscoveryProfile,
} from '../lib/aiJobDiscovery';

// Job Discovery profile and lead matches talk to the JobQuest API only (never MCP): reads are bearer-authenticated GETs, the
// save is a CSRF-protected POST the server re-validates from scratch (workspace and owner come from the verified session).
// The last discovery run is a read-only select under RLS (the owner's own ai_runs row).

export class DiscoveryApiError extends Error {
  constructor(public code: string, message: string, public field: string | null = null) {
    super(message);
  }
}
type Err = { error?: { code?: string; message?: string; field?: string } };
const fail = (r: { status: number; data: Err }): never => {
  throw new DiscoveryApiError(r.data.error?.code ?? 'SAVE_FAILED', r.data.error?.message ?? 'Request failed.', r.data.error?.field ?? null);
};
const token = (s: PublicSession | null) => s?.access_token;

export interface DiscoveryProfileState { profile: JobDiscoveryProfile; configured: boolean; updatedAt: string | null }

export async function fetchDiscoveryProfile(workspaceId: string, session: PublicSession | null): Promise<DiscoveryProfileState> {
  const r = await api<{ profile?: Partial<JobDiscoveryProfile>; configured?: boolean; updatedAt?: string | null } & Err>(
    `/ai/job-discovery/profile?workspace_id=${encodeURIComponent(workspaceId)}`, undefined, token(session),
  );
  if (r.status !== 200 || typeof r.data.profile !== 'object' || r.data.profile === null) return fail(r);
  return { profile: { ...DEFAULT_DISCOVERY_PROFILE, ...r.data.profile }, configured: r.data.configured === true, updatedAt: r.data.updatedAt ?? null };
}

export async function saveDiscoveryProfile(workspaceId: string, session: PublicSession | null, profile: JobDiscoveryProfile): Promise<void> {
  const r = await api<{ created?: boolean } & Err>('/ai/job-discovery/profile', { workspace_id: workspaceId, ...profile }, token(session));
  if (r.status !== 200) fail(r);
}

/** Ids per request (the server accepts up to 50; one Job Leads page is 20). */
export const LEAD_MATCH_BATCH = 50;

/** Read-only: the server-derived relation between each lead and the owner's existing applications. */
export async function fetchLeadMatches(workspaceId: string, session: PublicSession | null, ids: readonly string[]): Promise<Record<string, EmailMatchView>> {
  const wanted = [...new Set(ids)].slice(0, LEAD_MATCH_BATCH);
  if (wanted.length === 0) return {};
  const r = await api<{ matches?: Record<string, unknown> }>(
    `/ai/job-discovery/matches?workspace_id=${encodeURIComponent(workspaceId)}&ids=${wanted.map(encodeURIComponent).join(',')}`, undefined, token(session),
  );
  if (r.status !== 200 || typeof r.data.matches !== 'object' || r.data.matches === null) throw new Error('AI_LEAD_MATCH_FAILED');
  const out: Record<string, EmailMatchView> = {};
  for (const [id, v] of Object.entries(r.data.matches)) {
    const view = toEmailMatchView(v);
    if (view) out[id] = view;
  }
  return out;
}

/** The newest job_discovery run (source health). Null = no discovery run yet. */
export async function fetchLastDiscoveryRun(workspaceId: string, client: Pick<SupabaseClient, 'from'> = supabase): Promise<DiscoveryRunView | null> {
  const { data, error } = await client.from('ai_runs').select('id, provider, status, created_at, completed_at, sources, counts')
    .eq('workspace_id', workspaceId).eq('workflow', 'job_discovery').order('created_at', { ascending: false }).limit(1);
  if (error) throw new Error('AI_DISCOVERY_RUN_FAILED');
  const row = ((data ?? []) as DiscoveryRunRow[])[0];
  return row ? toDiscoveryRunView(row) : null;
}
