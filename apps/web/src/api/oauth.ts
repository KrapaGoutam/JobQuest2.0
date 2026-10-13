import { api, type PublicSession } from '../api';

export type OAuthProviderId = 'gemini' | 'chatgpt';
export interface OAuthClientMetadata {
  id: string;
  client_id: string;
  client_secret_prefix: string;
  issuer: string;
  provider: OAuthProviderId;
  name: string;
  workspace_id: string;
  redirect_uris: string[];
  scopes: string[];
  created_at?: string;
  last_used_at?: string | null;
  revoked_at?: string | null;
  revoked_reason?: string | null;
  active_grants: number;
}

function message(data: unknown, fallback: string): string {
  const x = data as { error_description?: string; error?: { message?: string } };
  return x?.error_description ?? x?.error?.message ?? fallback;
}

export async function listOAuthClients(workspaceId: string, session: PublicSession): Promise<OAuthClientMetadata[]> {
  const r = await api<{ clients?: OAuthClientMetadata[]; error_description?: string }>(`/oauth/clients?workspace_id=${encodeURIComponent(workspaceId)}`, undefined, session.access_token);
  if (r.status !== 200) throw new Error(message(r.data, 'Could not load OAuth clients.'));
  return r.data.clients ?? [];
}

export async function createOAuthClient(input: {
  workspace_id: string; provider: OAuthProviderId; name: string; redirect_uris: string[]; scopes: string[];
}, session: PublicSession): Promise<{ client_secret: string; client: OAuthClientMetadata }> {
  const r = await api<{ client_secret: string; client: OAuthClientMetadata; error_description?: string }>('/oauth/clients', input, session.access_token);
  if (r.status !== 201) throw new Error(message(r.data, 'Could not create OAuth client.'));
  return r.data;
}

export async function revokeOAuthClient(id: string, session: PublicSession): Promise<void> {
  const r = await api<{ revoked?: boolean; error_description?: string }>(`/oauth/clients/${encodeURIComponent(id)}/revoke`, {}, session.access_token);
  if (r.status !== 200) throw new Error(message(r.data, 'Could not revoke OAuth client.'));
}

export interface OAuthAuthorizationRequest {
  request_id: string;
  client_id: string;
  client_name: string;
  provider: OAuthProviderId;
  workspace_id: string;
  workspace_name: string;
  redirect_uri: string;
  resource: string;
  scopes: string[];
  expires_at: string;
}

export async function getOAuthAuthorizationRequest(id: string, session: PublicSession): Promise<OAuthAuthorizationRequest> {
  const r = await api<{ request?: OAuthAuthorizationRequest; error_description?: string }>(`/oauth/requests/${encodeURIComponent(id)}`, undefined, session.access_token);
  if (r.status !== 200 || !r.data.request) throw new Error(message(r.data, 'This authorization request is invalid or expired.'));
  return r.data.request;
}

export async function decideOAuthAuthorizationRequest(id: string, approve: boolean, session: PublicSession): Promise<string> {
  const r = await api<{ redirect_to?: string; error_description?: string }>(`/oauth/requests/${encodeURIComponent(id)}/decision`, { approve }, session.access_token);
  if (r.status !== 200 || !r.data.redirect_to) throw new Error(message(r.data, 'Could not record your consent decision.'));
  return r.data.redirect_to;
}
