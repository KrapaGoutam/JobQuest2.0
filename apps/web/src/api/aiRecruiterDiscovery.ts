import type { SupabaseClient } from '@supabase/supabase-js';
import { api, type PublicSession } from '../api';
import { supabase } from '../supabase';
import { DEFAULT_RECRUITER_PREFERENCES, toDiscoveryRunView, type DiscoveryRunRow, type DiscoveryRunView, type RecruiterPreferences } from '../lib/aiRecruiterDiscovery';

// Recruiter Discovery preferences talk to the JobQuest API only (never MCP): the read is a bearer-authenticated GET, the save is a
// CSRF-protected POST the server re-validates from scratch (workspace and owner come from the verified session). The last recruiter
// run is a read-only select under RLS (the owner's own ai_runs row). Nothing here searches for people or contacts anyone.

export class RecruiterPrefsApiError extends Error {
  constructor(public code: string, message: string, public field: string | null = null) {
    super(message);
  }
}
type Err = { error?: { code?: string; message?: string; field?: string } };
const fail = (r: { status: number; data: Err }): never => {
  throw new RecruiterPrefsApiError(r.data.error?.code ?? 'SAVE_FAILED', r.data.error?.message ?? 'Request failed.', r.data.error?.field ?? null);
};
const token = (s: PublicSession | null) => s?.access_token;

export interface RecruiterPreferencesState { preferences: RecruiterPreferences; configured: boolean; updatedAt: string | null }

export async function fetchRecruiterPreferences(workspaceId: string, session: PublicSession | null): Promise<RecruiterPreferencesState> {
  const r = await api<{ preferences?: Partial<RecruiterPreferences>; configured?: boolean; updatedAt?: string | null } & Err>(
    `/ai/recruiter-discovery/preferences?workspace_id=${encodeURIComponent(workspaceId)}`, undefined, token(session),
  );
  if (r.status !== 200 || typeof r.data.preferences !== 'object' || r.data.preferences === null) return fail(r);
  return { preferences: { ...DEFAULT_RECRUITER_PREFERENCES, ...r.data.preferences }, configured: r.data.configured === true, updatedAt: r.data.updatedAt ?? null };
}

export async function saveRecruiterPreferences(workspaceId: string, session: PublicSession | null, prefs: RecruiterPreferences): Promise<void> {
  const r = await api<{ created?: boolean } & Err>('/ai/recruiter-discovery/preferences', { workspace_id: workspaceId, ...prefs }, token(session));
  if (r.status !== 200) fail(r);
}

/** The newest recruiter_intel run (source health). Null = no recruiter run yet. */
export async function fetchLastRecruiterRun(workspaceId: string, client: Pick<SupabaseClient, 'from'> = supabase): Promise<DiscoveryRunView | null> {
  const { data, error } = await client.from('ai_runs').select('id, provider, status, created_at, completed_at, sources, counts')
    .eq('workspace_id', workspaceId).eq('workflow', 'recruiter_intel').order('created_at', { ascending: false }).limit(1);
  if (error) throw new Error('AI_RECRUITER_RUN_FAILED');
  const row = ((data ?? []) as DiscoveryRunRow[])[0];
  return row ? toDiscoveryRunView(row) : null;
}
