// AI-11E: the canonical Recruiter Discovery preferences (WHO is useful to connect with). One bounded, owner-scoped row per workspace.
//
// Not the Job Discovery profile (WHAT jobs), not Providers (WHO executes) and not Automations (WHEN). The row carries no
// credentials, no provider ids and no free-form query language. Reads run AS THE CALLER (RLS: owner only, active member). Writes go
// through the service_role RPC with the actor id the API derived from the verified session; the RPC re-verifies membership and
// re-validates every field. A provider can only READ the preferences (jobquest_get_recruiter_discovery_profile).
import { admin as adminClient } from '../lib/db';
import { isAiHubServerEnabled } from '../lib/aiHubConfig';
import {
  DEFAULT_RECRUITER_PREFERENCES, RECRUITER_PREFERENCE_COLUMNS, parseRecruiterPreferences, recruiterPreferencesFromRow, recruiterPreferencesToRpc,
  type RecruiterDiscoveryPreferences,
} from '../lib/aiContract';
import type { AiReadContext, AiReadDeps, AiReadResult } from './aiReadService';
import { UUID, dbFail, prepare } from './aiReadSupport';

export type RecruiterPrefsErrorCode = 'INVALID_INPUT' | 'WORKSPACE_ACCESS_DENIED' | 'AI_HUB_DISABLED' | 'READ_FAILED' | 'SAVE_FAILED';
export interface RecruiterPrefsError { code: RecruiterPrefsErrorCode; message: string; field?: string }
export type RecruiterPrefsResult<T> = { ok: true; data: T } | { ok: false; error: RecruiterPrefsError };

export interface RecruiterPreferencesView {
  preferences: RecruiterDiscoveryPreferences;
  /** false = nothing saved yet: the generic default is shown and no company-specific rule is applied. */
  configured: boolean;
  updatedAt: string | null;
}

/**
 * The caller's preferences (RLS). Shared by the settings screen and the MCP read tool. Returns the generic default with
 * `configured: false` when none is saved. Never exposes any other profile field.
 */
export async function getRecruiterPreferences(ctx: AiReadContext, deps: AiReadDeps = {}): Promise<AiReadResult<RecruiterPreferencesView>> {
  const p = prepare(ctx, deps); if (!p.ok) return p;
  const { data, error } = await p.db.from('ai_recruiter_discovery_preferences').select(RECRUITER_PREFERENCE_COLUMNS).eq('workspace_id', p.ws).limit(1);
  if (error) return dbFail(error);
  const row = ((data ?? []) as Record<string, unknown>[])[0];
  if (!row) return { ok: true, data: { preferences: { ...DEFAULT_RECRUITER_PREFERENCES }, configured: false, updatedAt: null } };
  return { ok: true, data: { preferences: recruiterPreferencesFromRow(row), configured: true, updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null } };
}

export interface RecruiterPrefsWriteContext { workspaceId: string; userId: string }
type Writer = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }> };
export interface RecruiterPrefsWriteDeps { writer?: Writer; aiHubEnabled?: () => boolean }

const fail = <T>(code: RecruiterPrefsErrorCode, message: string, field?: string): RecruiterPrefsResult<T> => ({ ok: false, error: { code, message, ...(field ? { field } : {}) } });

/** Create or replace the caller's preferences. Validated here first (friendly field errors) and again in the RPC. */
export async function saveRecruiterPreferences(ctx: RecruiterPrefsWriteContext, input: unknown, deps: RecruiterPrefsWriteDeps = {}): Promise<RecruiterPrefsResult<{ created: boolean }>> {
  if (!(deps.aiHubEnabled ?? isAiHubServerEnabled)()) return fail('AI_HUB_DISABLED', 'AI Hub is disabled on this server.');
  if (!UUID.test(ctx.workspaceId) || !UUID.test(ctx.userId)) return fail('INVALID_INPUT', 'A workspace is required.');
  const v = parseRecruiterPreferences(input);
  if (!v.ok) return fail('INVALID_INPUT', v.message, v.field);
  const writer = deps.writer ?? (adminClient() as unknown as Writer);
  const { data, error } = await writer.rpc('rpc_ai_recruiter_prefs_save', {
    p_actor_id: ctx.userId, p_workspace_id: ctx.workspaceId, p_prefs: recruiterPreferencesToRpc(v.value),
  });
  if (error || !data) {
    if (error?.code === '42501') return fail('WORKSPACE_ACCESS_DENIED', 'Workspace access denied.');
    if (error?.code === '22023') return fail('INVALID_INPUT', 'The recruiter preferences are not valid.');
    return fail('SAVE_FAILED', 'Could not save the recruiter preferences.');
  }
  return { ok: true, data: { created: (data as { created?: boolean }).created === true } };
}
