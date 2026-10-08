import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import {
  HISTORY_PAGE_SIZE, RECENT_WINDOW_DAYS, pageRange, sliceRunsPage,
  type AiFindingDetailRow, type AiFindingRow, type AiHubSnapshot, type AiRunDetailRow, type AiRunFilters,
  type AiRunRow, type AiSuggestionRow,
} from '../lib/aiHub';

// READ-ONLY. Plain RLS-protected SELECTs with the user's session; no writes, no
// RPCs, no service role. The workspace id comes from the app's workspace context,
// never from the URL; the database remains the authority on visibility.
// error_detail is deliberately never selected (only the normalized error_category).

type Client = Pick<SupabaseClient, 'from'>;

const RUN_COLUMNS = 'id, provider, workflow, status, trigger_type, created_at, started_at, completed_at, error_category, counts';
const RUN_DETAIL_COLUMNS = `${RUN_COLUMNS}, schema_version, sources`;
const FINDING_COLUMNS = 'id, kind, provider, status, priority, title, summary, evidence, confidence, occurred_at, created_at';
const FINDING_DETAIL_COLUMNS = `${FINDING_COLUMNS}, run_id, category, due_at, application_id, source_ref, payload`;
const SUGGESTION_COLUMNS = 'id, action, target_type, created_at';

// Deliberately opaque: callers show a generic message, never DB internals.
const fail = () => new Error('AI_HUB_LOAD_FAILED');

export async function fetchAiHubSnapshot(
  workspaceId: string,
  client: Client = supabase,
  now: Date = new Date(),
): Promise<AiHubSnapshot> {
  const since = new Date(now.getTime() - RECENT_WINDOW_DAYS * 86_400_000).toISOString();
  const [runs, findings, pending, pendingRows, recent, attention] = await Promise.all([
    client.from('ai_runs').select(RUN_COLUMNS).eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false }).limit(10),
    client.from('ai_findings').select(FINDING_COLUMNS).eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false }).limit(5),
    client.from('ai_suggestions').select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('status', 'PENDING'),
    client.from('ai_suggestions').select(SUGGESTION_COLUMNS).eq('workspace_id', workspaceId)
      .eq('status', 'PENDING').order('created_at', { ascending: false }).limit(3),
    client.from('ai_runs').select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).gte('created_at', since),
    client.from('ai_runs').select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).gte('created_at', since).in('status', ['FAILED', 'PARTIAL']),
  ]);
  if ([runs, findings, pending, pendingRows, recent, attention].some((r) => r.error)) throw fail();
  return {
    runs: (runs.data ?? []) as unknown as AiRunRow[],
    findings: (findings.data ?? []) as unknown as AiFindingRow[],
    pendingSuggestions: pending.count ?? 0,
    pendingSuggestionRows: (pendingRows.data ?? []) as unknown as AiSuggestionRow[],
    recentRunCount: recent.count ?? 0,
    attentionRunCount: attention.count ?? 0,
  };
}

/** One page of runs, newest first. Fetches size+1 rows so "has next" needs no count query. */
export async function fetchAiRunsPage(
  workspaceId: string,
  filters: AiRunFilters,
  page: number,
  client: Client = supabase,
): Promise<{ rows: AiRunRow[]; hasNext: boolean }> {
  let q = client.from('ai_runs').select(RUN_COLUMNS).eq('workspace_id', workspaceId);
  if (filters.status !== 'ALL') q = q.eq('status', filters.status);
  if (filters.provider !== 'ALL') q = q.eq('provider', filters.provider);
  if (filters.workflow !== 'ALL') q = q.eq('workflow', filters.workflow);
  const { from, to } = pageRange(page, HISTORY_PAGE_SIZE);
  const { data, error } = await q
    .order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to);
  if (error) throw fail();
  return sliceRunsPage((data ?? []) as unknown as AiRunRow[], HISTORY_PAGE_SIZE);
}

export async function fetchAiRunDetail(
  workspaceId: string,
  runId: string,
  client: Client = supabase,
): Promise<{ run: AiRunDetailRow; findings: AiFindingRow[] }> {
  // Two small queries total (not per-row): the run and all its findings.
  const [run, findings] = await Promise.all([
    client.from('ai_runs').select(RUN_DETAIL_COLUMNS).eq('workspace_id', workspaceId).eq('id', runId).maybeSingle(),
    client.from('ai_findings').select(FINDING_COLUMNS).eq('workspace_id', workspaceId).eq('run_id', runId)
      .order('created_at', { ascending: false }).limit(50),
  ]);
  if (run.error || findings.error || !run.data) throw fail();
  return { run: run.data as unknown as AiRunDetailRow, findings: (findings.data ?? []) as unknown as AiFindingRow[] };
}

export async function fetchAiFindingDetail(
  workspaceId: string,
  findingId: string,
  client: Client = supabase,
): Promise<AiFindingDetailRow> {
  const { data, error } = await client.from('ai_findings').select(FINDING_DETAIL_COLUMNS)
    .eq('workspace_id', workspaceId).eq('id', findingId).maybeSingle();
  if (error || !data) throw fail();
  return data as unknown as AiFindingDetailRow;
}

/** Own workflow-config rows (RLS: owner + active member). Read-only; AI-1F1 has no mutation. */
export async function fetchAiWorkflowConfigs(
  workspaceId: string,
  client: Client = supabase,
): Promise<Array<{ workflow: string; enabled: boolean }>> {
  const { data, error } = await client.from('ai_workflow_configs').select('workflow, enabled')
    .eq('workspace_id', workspaceId).limit(20);
  if (error) throw fail();
  return (data ?? []) as Array<{ workflow: string; enabled: boolean }>;
}
