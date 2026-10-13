import { api, type PublicSession } from '../api';
import { formToBody, summarizeAutomations, type AutomationFormState, type AutomationOverview, type AutomationView } from '../lib/aiAutomation';

// Automation definitions talk to the JobQuest API only (never MCP): reads are bearer-authenticated GETs; every
// mutation is a CSRF-protected POST that the server re-validates from scratch (workspace and owner come from the
// verified session, never from the body).

export class AutomationApiError extends Error {
  constructor(public code: string, message: string, public field: string | null = null) {
    super(message);
  }
}

type Err = { error?: { code?: string; message?: string; field?: string } };
const fail = (r: { status: number; data: Err }): never => {
  throw new AutomationApiError(r.data.error?.code ?? 'SAVE_FAILED', r.data.error?.message ?? 'Request failed.', r.data.error?.field ?? null);
};
const token = (s: PublicSession | null) => s?.access_token;

export async function fetchAutomations(workspaceId: string, session: PublicSession | null): Promise<AutomationView[]> {
  const r = await api<{ automations: AutomationView[] } & Err>(`/ai/automations?workspace_id=${encodeURIComponent(workspaceId)}`, undefined, token(session));
  return r.status === 200 ? r.data.automations : fail(r);
}

/** Create (id null) or update. Returns the saved automation's id. */
export async function saveAutomation(
  workspaceId: string, session: PublicSession | null, id: string | null, form: AutomationFormState,
): Promise<{ id: string; created: boolean }> {
  const r = await api<{ id: string; created: boolean } & Err>(id ? `/ai/automations/${encodeURIComponent(id)}` : '/ai/automations', { workspace_id: workspaceId, ...formToBody(form) }, token(session));
  return r.status === 200 || r.status === 201 ? r.data : fail(r);
}

export async function deleteAutomation(workspaceId: string, session: PublicSession | null, id: string): Promise<void> {
  const r = await api<{ id: string } & Err>(`/ai/automations/${encodeURIComponent(id)}/delete`, { workspace_id: workspaceId }, token(session));
  if (r.status !== 200) fail(r);
}

/** Overview card data; isolated by the caller so a failure never breaks the rest of the Overview. */
export async function fetchAutomationOverview(workspaceId: string, session: PublicSession | null): Promise<AutomationOverview> {
  return summarizeAutomations(await fetchAutomations(workspaceId, session));
}
