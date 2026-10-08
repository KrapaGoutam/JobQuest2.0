import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import type { AiFindingRow, AiHubSnapshot, AiRunRow } from '../lib/aiHub';

// READ-ONLY. Plain RLS-protected SELECTs with the user's session; no writes, no
// RPCs, no service role. The workspace id comes from the app's workspace context,
// never from the URL; the database remains the authority on visibility.

const RUN_COLUMNS = 'id, provider, workflow, status, trigger_type, created_at, completed_at';
const FINDING_COLUMNS = 'id, kind, provider, status, priority, title, summary, evidence, created_at';

export async function fetchAiHubSnapshot(
  workspaceId: string,
  client: Pick<SupabaseClient, 'from'> = supabase,
): Promise<AiHubSnapshot> {
  const [runs, findings, pending] = await Promise.all([
    client.from('ai_runs').select(RUN_COLUMNS).eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false }).limit(10),
    client.from('ai_findings').select(FINDING_COLUMNS).eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false }).limit(5),
    client.from('ai_suggestions').select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('status', 'PENDING'),
  ]);
  if (runs.error || findings.error || pending.error) {
    // Deliberately opaque: callers show a generic message, never DB internals.
    throw new Error('AI_HUB_LOAD_FAILED');
  }
  return {
    runs: (runs.data ?? []) as unknown as AiRunRow[],
    findings: (findings.data ?? []) as unknown as AiFindingRow[],
    pendingSuggestions: pending.count ?? 0,
  };
}
