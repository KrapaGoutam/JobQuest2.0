import { api, type PublicSession } from '../api';

export const EXTENSION_SCOPES = [
  'workflow:read',
  'documents:read',
  'applications:duplicate_check',
  'applications:create',
  'profile:read',
] as const;

export interface ExtensionTokenMetadata {
  id: string;
  workspace_id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  replaced_by_token_id: string | null;
  status: 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'REVOKED';
}

function errorMessage(payload: { error?: { message?: string } }, fallback: string): string {
  return payload.error?.message ?? fallback;
}

export async function listExtensionTokens(workspaceId: string, session: PublicSession): Promise<ExtensionTokenMetadata[]> {
  const result = await api<{ tokens?: ExtensionTokenMetadata[]; error?: { message?: string } }>(
    `/extension/tokens?workspace_id=${encodeURIComponent(workspaceId)}`,
    undefined,
    session.access_token,
  );
  if (result.status !== 200) throw new Error(errorMessage(result.data, 'Could not load extension tokens.'));
  return result.data.tokens ?? [];
}

export async function createExtensionToken(
  input: { workspace_id: string; name: string; expires_in_days: 30 | 90 | 365 },
  session: PublicSession,
): Promise<{ token: string; metadata: ExtensionTokenMetadata }> {
  const result = await api<{ token?: string; metadata?: ExtensionTokenMetadata; error?: { message?: string } }>(
    '/extension/tokens', input, session.access_token,
  );
  if (result.status !== 201 || !result.data.token || !result.data.metadata) {
    throw new Error(errorMessage(result.data, 'Could not create extension token.'));
  }
  return { token: result.data.token, metadata: result.data.metadata };
}

export async function revokeExtensionToken(id: string, session: PublicSession): Promise<void> {
  const result = await api<{ error?: { message?: string } }>(`/extension/tokens/${id}/revoke`, {}, session.access_token);
  if (result.status !== 200) throw new Error(errorMessage(result.data, 'Could not revoke extension token.'));
}

export async function rotateExtensionToken(
  id: string,
  session: PublicSession,
): Promise<{ token: string; metadata: ExtensionTokenMetadata }> {
  const result = await api<{ token?: string; metadata?: ExtensionTokenMetadata; error?: { message?: string } }>(
    `/extension/tokens/${id}/rotate`, { expires_in_days: 90 }, session.access_token,
  );
  if (result.status !== 201 || !result.data.token || !result.data.metadata) {
    throw new Error(errorMessage(result.data, 'Could not replace extension token.'));
  }
  return { token: result.data.token, metadata: result.data.metadata };
}
