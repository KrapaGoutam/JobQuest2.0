import type { SupabaseClient } from '@supabase/supabase-js';
import { api, type PublicSession } from '../api';
import { supabase } from '../supabase';
import {
  actionQueueQuery, AI_ACTION_TYPE_VALUES,
  type ActionFilters, type ActionHistoryPage, type ActionPreviewData, type ActionQueuePage,
} from '../lib/aiActions';

// The Actions page talks to the JobQuest API only (never to MCP). Reads are bearer-authenticated GETs; the single
// mutation, `executeAiAction`, is a CSRF-protected POST that the server re-validates from scratch. The browser
// supplies the fingerprint it reviewed, the choices the human made and nothing else.

export class ActionApiError extends Error {
  constructor(public code: string, message: string, public existing: { targetType: 'application' | 'task'; targetId: string } | null = null) {
    super(message);
  }
}

type Err = { error?: { code?: string; message?: string; existing?: { targetType: 'application' | 'task'; targetId: string } } };
const fail = (r: { status: number; data: Err }): never => {
  throw new ActionApiError(r.data.error?.code ?? 'ACTION_EXECUTION_FAILED', r.data.error?.message ?? 'Request failed.', r.data.error?.existing ?? null);
};
const token = (s: PublicSession | null) => s?.access_token;

export async function fetchActionQueue(workspaceId: string, session: PublicSession | null, filters: ActionFilters, page: number): Promise<ActionQueuePage> {
  const r = await api<ActionQueuePage & Err>(`/ai/actions/queue?${actionQueueQuery(workspaceId, filters, page)}`, undefined, token(session));
  return r.status === 200 ? r.data : fail(r);
}
export async function fetchActionHistory(workspaceId: string, session: PublicSession | null, page: number): Promise<ActionHistoryPage> {
  const r = await api<ActionHistoryPage & Err>(`/ai/actions/history?workspace_id=${encodeURIComponent(workspaceId)}&page=${Math.max(0, Math.floor(page))}`, undefined, token(session));
  return r.status === 200 ? r.data : fail(r);
}
/** Read-only: nothing is created or changed by a preview. */
export async function fetchActionPreview(workspaceId: string, session: PublicSession | null, suggestionId: string): Promise<ActionPreviewData> {
  const r = await api<ActionPreviewData & Err>(`/ai/actions/preview?workspace_id=${encodeURIComponent(workspaceId)}&suggestion_id=${encodeURIComponent(suggestionId)}`, undefined, token(session));
  return r.status === 200 ? r.data : fail(r);
}
export interface ActionExecuted { status: 'SUCCEEDED'; executionId: string; action: string; targetType: 'application' | 'task'; targetId: string; result: string; message: string }
export async function executeAiAction(session: PublicSession | null, body: Record<string, unknown>): Promise<ActionExecuted> {
  const r = await api<ActionExecuted & Err>('/ai/actions/execute', body, token(session));
  return r.status === 200 ? r.data : fail(r);
}

/** Existing owner-only review RPC (AI rows only): ignoring a suggestion never touches a core record. */
export async function ignoreSuggestion(suggestionId: string, client: Pick<SupabaseClient, 'rpc'> = supabase): Promise<void> {
  const { error } = await client.rpc('rpc_ai_decide_suggestion', { p_suggestion_id: suggestionId, p_decision: 'IGNORED' });
  if (error) throw new Error('AI_ACTION_IGNORE_FAILED');
}

/** Pending, supported actions awaiting THIS user's review (RLS-scoped head count; drives the Overview card and Daily Digest line). */
export async function fetchPendingActionCount(workspaceId: string, userId: string, client: Pick<SupabaseClient, 'from'> = supabase): Promise<number> {
  const { count, error } = await client.from('ai_suggestions').select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId).eq('user_id', userId).eq('status', 'PENDING').in('action', [...AI_ACTION_TYPE_VALUES]);
  if (error) throw new Error('AI_ACTION_COUNT_FAILED');
  return count ?? 0;
}
