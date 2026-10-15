import { api, type PublicSession } from '../api';
import { toEmailMatchView, type EmailMatchView } from '../lib/aiSources';

// Read-only. The Email page reads the intelligence rows itself under RLS and asks the JobQuest API (never MCP) for the
// server-derived relation between each job-related email and the signed-in owner's existing applications.

/** Ids per request (the server accepts up to 50; one Email page is 20). */
export const EMAIL_MATCH_BATCH = 50;

export async function fetchEmailMatches(workspaceId: string, session: PublicSession | null, ids: readonly string[]): Promise<Record<string, EmailMatchView>> {
  const wanted = [...new Set(ids)].slice(0, EMAIL_MATCH_BATCH);
  if (wanted.length === 0) return {};
  const r = await api<{ matches?: Record<string, unknown> }>(
    `/ai/email/matches?workspace_id=${encodeURIComponent(workspaceId)}&ids=${wanted.map(encodeURIComponent).join(',')}`, undefined, session?.access_token,
  );
  if (r.status !== 200 || typeof r.data.matches !== 'object' || r.data.matches === null) throw new Error('AI_EMAIL_MATCH_FAILED');
  const out: Record<string, EmailMatchView> = {};
  for (const [id, v] of Object.entries(r.data.matches)) {
    const view = toEmailMatchView(v);
    if (view) out[id] = view;
  }
  return out;
}
