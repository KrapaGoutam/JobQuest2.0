import { api, type PublicSession } from '../api';
import type { ClaudeExpiryDays, ConnectorTokenMetadata } from '../lib/claudeConnector';

// AI-4: thin client for the AI-3 connector-token routes (/api/ai/connector-tokens).
// The raw token is returned by create only; callers must keep it in ephemeral
// component state and must never write it to storage, the URL or a query cache.

type ErrorPayload = { error?: { message?: string } };
const errorMessage = (payload: ErrorPayload, fallback: string): string => payload.error?.message ?? fallback;

export async function listConnectorTokens(workspaceId: string, session: PublicSession): Promise<ConnectorTokenMetadata[]> {
  const result = await api<{ tokens?: ConnectorTokenMetadata[] } & ErrorPayload>(
    `/ai/connector-tokens?workspace_id=${encodeURIComponent(workspaceId)}`, undefined, session.access_token,
  );
  if (result.status !== 200) throw new Error(errorMessage(result.data, 'Could not load connector credentials.'));
  return result.data.tokens ?? [];
}

export async function createConnectorToken(
  input: { workspace_id: string; name: string; scopes: string[]; expires_in_days: ClaudeExpiryDays },
  session: PublicSession,
): Promise<{ token: string; metadata: ConnectorTokenMetadata }> {
  const result = await api<{ token?: string; metadata?: ConnectorTokenMetadata } & ErrorPayload>(
    '/ai/connector-tokens', input, session.access_token,
  );
  if (result.status !== 201 || !result.data.token || !result.data.metadata) {
    throw new Error(errorMessage(result.data, 'Could not create the connector credential.'));
  }
  return { token: result.data.token, metadata: result.data.metadata };
}

export async function revokeConnectorToken(id: string, session: PublicSession): Promise<void> {
  const result = await api<ErrorPayload>(`/ai/connector-tokens/${encodeURIComponent(id)}/revoke`, {}, session.access_token);
  if (result.status !== 200) throw new Error(errorMessage(result.data, 'Could not revoke the connector credential.'));
}
