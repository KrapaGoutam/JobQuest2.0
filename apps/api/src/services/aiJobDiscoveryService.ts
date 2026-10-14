// AI-11D: the canonical Job Discovery profile (WHAT the user wants). One bounded, owner-scoped row per workspace.
//
// Provider (WHO searches) and automation cadence (WHEN) are separate concepts and live elsewhere; this row carries no
// credentials, no provider ids and no free-form query language. Reads run AS THE CALLER (RLS: owner only, active member).
// Writes go through the service_role RPC with the actor id the API derived from the verified session; the RPC re-verifies
// membership and re-validates every field. A provider can only READ the profile (jobquest_get_job_discovery_profile).
import { admin as adminClient } from '../lib/db';
import { isAiHubServerEnabled } from '../lib/aiHubConfig';
import {
  DEFAULT_DISCOVERY_PROFILE, DISCOVERY_PROFILE_COLUMNS, discoveryProfileFromRow, discoveryProfileToRpc, parseDiscoveryProfile,
  type JobDiscoveryProfile,
} from '../lib/aiContract';
import type { AiReadContext, AiReadDeps, AiReadResult } from './aiReadService';
import { UUID, dbFail, prepare } from './aiReadSupport';

export type DiscoveryErrorCode = 'INVALID_INPUT' | 'WORKSPACE_ACCESS_DENIED' | 'AI_HUB_DISABLED' | 'READ_FAILED' | 'SAVE_FAILED';
export interface DiscoveryError { code: DiscoveryErrorCode; message: string; field?: string }
export type DiscoveryResult<T> = { ok: true; data: T } | { ok: false; error: DiscoveryError };

export interface DiscoveryProfileView {
  profile: JobDiscoveryProfile;
  /** false = nothing saved yet: the generic default is shown and nothing is enforced at ingestion. */
  configured: boolean;
  updatedAt: string | null;
}

/**
 * The caller's profile (RLS). Shared by the settings screen and the MCP read tool. Returns the generic default with
 * `configured: false` when none is saved. Never exposes any other profile field (display name, email, timezone ...).
 */
export async function getJobDiscoveryProfile(ctx: AiReadContext, deps: AiReadDeps = {}): Promise<AiReadResult<DiscoveryProfileView>> {
  const p = prepare(ctx, deps); if (!p.ok) return p;
  const { data, error } = await p.db.from('ai_job_discovery_profiles').select(DISCOVERY_PROFILE_COLUMNS).eq('workspace_id', p.ws).limit(1);
  if (error) return dbFail(error);
  const row = ((data ?? []) as Record<string, unknown>[])[0];
  if (!row) return { ok: true, data: { profile: { ...DEFAULT_DISCOVERY_PROFILE }, configured: false, updatedAt: null } };
  return { ok: true, data: { profile: discoveryProfileFromRow(row), configured: true, updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null } };
}

export interface DiscoveryWriteContext { workspaceId: string; userId: string }
type Writer = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }> };
export interface DiscoveryWriteDeps { writer?: Writer; aiHubEnabled?: () => boolean }

const fail = <T>(code: DiscoveryErrorCode, message: string, field?: string): DiscoveryResult<T> => ({ ok: false, error: { code, message, ...(field ? { field } : {}) } });

/** Create or replace the caller's profile. Validated here first (friendly field errors) and again in the RPC. */
export async function saveJobDiscoveryProfile(ctx: DiscoveryWriteContext, input: unknown, deps: DiscoveryWriteDeps = {}): Promise<DiscoveryResult<{ created: boolean }>> {
  if (!(deps.aiHubEnabled ?? isAiHubServerEnabled)()) return fail('AI_HUB_DISABLED', 'AI Hub is disabled on this server.');
  if (!UUID.test(ctx.workspaceId) || !UUID.test(ctx.userId)) return fail('INVALID_INPUT', 'A workspace is required.');
  const v = parseDiscoveryProfile(input);
  if (!v.ok) return fail('INVALID_INPUT', v.message, v.field);
  const writer = deps.writer ?? (adminClient() as unknown as Writer);
  const { data, error } = await writer.rpc('rpc_ai_job_discovery_profile_save', {
    p_actor_id: ctx.userId, p_workspace_id: ctx.workspaceId, p_profile: discoveryProfileToRpc(v.value),
  });
  if (error || !data) {
    if (error?.code === '42501') return fail('WORKSPACE_ACCESS_DENIED', 'Workspace access denied.');
    if (error?.code === '22023') return fail('INVALID_INPUT', 'The discovery profile is not valid.');
    return fail('SAVE_FAILED', 'Could not save the discovery profile.');
  }
  return { ok: true, data: { created: (data as { created?: boolean }).created === true } };
}
