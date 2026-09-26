import type { Context } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
import { bearer } from '../lib/security';
import { userClient } from '../lib/db';
import { verifyAccessToken } from '../lib/tokens';

export interface Caller {
  token: string;
  userId: string;
  client: SupabaseClient;
}

export async function caller(c: Context): Promise<Caller | null> {
  const token = bearer(c);
  if (!token) return null;
  const claims = await verifyAccessToken(token);
  if (!claims) return null;
  return { token, userId: claims.sub, client: userClient(token) };
}

/** null owner means manager-wide workspace scope. */
export async function resolveOwnerScope(
  client: SupabaseClient,
  actorId: string,
  workspaceId: string,
  requestedOwner?: string | null,
): Promise<{ ownerId: string | null; isManager: boolean }> {
  const { data, error } = await client
    .from('workspace_members')
    .select('user_id, role')
    .eq('workspace_id', workspaceId);
  if (error) throw new Error(error.message);
  const members = (data ?? []) as { user_id: string; role: string }[];
  const actor = members.find((member) => member.user_id === actorId);
  if (!actor) throw Object.assign(new Error('Workspace access denied.'), { status: 403 });
  const isManager = actor.role === 'MANAGER';
  if (requestedOwner === 'ALL') {
    if (!isManager) throw Object.assign(new Error('Manager access required for workspace-wide scope.'), { status: 403 });
    return { ownerId: null, isManager };
  }
  const ownerId = requestedOwner || actorId;
  if (ownerId !== actorId && !isManager) throw Object.assign(new Error('Manager access required for another owner.'), { status: 403 });
  if (!members.some((member) => member.user_id === ownerId)) {
    throw Object.assign(new Error('Selected owner is not a workspace member.'), { status: 400 });
  }
  return { ownerId, isManager };
}

export function routeError(c: Context, error: unknown) {
  const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status: number }).status) : 400;
  const message = error instanceof Error ? error.message : 'Request failed.';
  return c.json({ error: { code: status === 403 ? 'FORBIDDEN' : 'INVALID_REQUEST', message } }, status === 403 ? 403 : 400);
}
