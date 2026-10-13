import { Buffer } from 'node:buffer';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { env } from '../env';
import { admin } from '../lib/db';
import {
  OAUTH_OFFLINE_SCOPE, OAUTH_SCOPES, OAUTH_TOKEN_AUTH_METHODS, authorizationCodeHash,
  mcpResource, mintAuthorizationCode, mintOAuthAccessToken, mintOAuthClient,
  mintOAuthRefreshToken, normalizeScopes, oauthRefreshHash, oauthSecretHash,
  requestOrigin, validClientCredentials, validRedirectUri,
  verifyOAuthAccessToken, type OAuthGrantPrincipal,
} from '../lib/oauth';
import { limiter } from '../lib/rateLimit';
import { clientIp, requireCsrfToken } from '../lib/security';
import { signingJwks } from '../lib/tokens';
import { caller } from './scope';

export const oauth = new Hono();

const authorizeLimit = limiter('oauth-authorize-ip', () => env().OAUTH_AUTHORIZE_IP_MAX_PER_MINUTE, 60);
const tokenLimit = limiter('oauth-token-ip', () => env().OAUTH_TOKEN_IP_MAX_PER_MINUTE, 60);
const clientLimit = limiter('oauth-client-user', () => env().OAUTH_CLIENT_USER_MAX_PER_HOUR, 60 * 60);
const oauthError = (c: Context, status: 400 | 401 | 403 | 404 | 429 | 500 | 503, error: string, description: string, headers: Record<string, string> = {}) =>
  c.json({ error, error_description: description }, status, headers);

function rowOf<T>(data: unknown): T | null {
  return (Array.isArray(data) ? data[0] : null) as T | null;
}

function redirectWith(uri: string, values: Record<string, string | undefined>): string {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(values)) if (value !== undefined) url.searchParams.set(key, value);
  return url.toString();
}

function clientAuth(c: Context, form: Record<string, string>): { clientId: string; secret: string } | null {
  const header = c.req.header('authorization');
  if (header) {
    if (!header.startsWith('Basic ') || form.client_secret) return null;
    try {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const split = decoded.indexOf(':');
      if (split < 1) return null;
      const clientId = decodeURIComponent(decoded.slice(0, split));
      const secret = decodeURIComponent(decoded.slice(split + 1));
      return validClientCredentials(clientId, secret) ? { clientId, secret } : null;
    } catch { return null; }
  }
  return validClientCredentials(form.client_id ?? '', form.client_secret ?? '')
    ? { clientId: form.client_id!, secret: form.client_secret! } : null;
}

async function formBody(c: Context): Promise<Record<string, string> | null> {
  if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/x-www-form-urlencoded')) return null;
  const parsed = await c.req.parseBody().catch(() => null);
  if (!parsed) return null;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) if (typeof value === 'string') result[key] = value;
  return result;
}

export function authorizationServerMetadata(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/api/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    revocation_endpoint: `${issuer}/api/oauth/revoke`,
    jwks_uri: `${issuer}/api/oauth/jwks`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: [...OAUTH_TOKEN_AUTH_METHODS],
    scopes_supported: [...OAUTH_SCOPES, OAUTH_OFFLINE_SCOPE],
    authorization_response_iss_parameter_supported: true,
    client_id_metadata_document_supported: false,
  };
}

export function protectedResourceMetadata(issuer: string) {
  return {
    resource: mcpResource(issuer),
    authorization_servers: [issuer],
    scopes_supported: [...OAUTH_SCOPES],
    bearer_methods_supported: ['header'],
    resource_documentation: `${issuer}/#/settings/ai`,
  };
}

oauth.get('/jwks', async (c) => c.json(await signingJwks()));

oauth.get('/authorize', async (c) => {
  const hit = await authorizeLimit.hit(clientIp(c)).catch(() => null);
  if (!hit) return oauthError(c, 503, 'temporarily_unavailable', 'Authorization is temporarily unavailable.');
  if (!hit.allowed) return oauthError(c, 429, 'slow_down', 'Too many authorization attempts.', { 'Retry-After': String(hit.retryAfterSeconds) });
  const issuer = requestOrigin(c);
  if (!issuer) return oauthError(c, 400, 'invalid_request', 'Unknown authorization server origin.');
  const q = c.req.query();
  if (q.response_type !== 'code' || !q.client_id || !q.redirect_uri || !q.scope
    || !q.state || q.state.length < 8 || q.state.length > 512
    || q.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge ?? '')) {
    return oauthError(c, 400, 'invalid_request', 'Authorization Code, state, resource and PKCE S256 are required.');
  }
  if (!validRedirectUri(q.redirect_uri)) return oauthError(c, 400, 'invalid_request', 'Invalid redirect URI.');
  const scopes = normalizeScopes(q.scope);
  if (!scopes) return oauthError(c, 400, 'invalid_scope', 'Unsupported scope request.');
  const { data, error } = await admin().rpc('rpc_oauth_create_authorization_request', {
    p_client_id: q.client_id, p_issuer: issuer, p_redirect_uri: q.redirect_uri,
    p_resource: q.resource ?? mcpResource(issuer), p_scopes: scopes, p_state: q.state,
    p_code_challenge: q.code_challenge,
    p_ttl_seconds: env().OAUTH_AUTHORIZATION_REQUEST_TTL_SECONDS,
  });
  if (error) return oauthError(c, 503, 'temporarily_unavailable', 'Authorization is temporarily unavailable.');
  const request = rowOf<{ request_id: string }>(data);
  if (!request) return oauthError(c, 400, 'invalid_request', 'Unknown client, redirect URI, resource or scope.');
  return c.redirect(`${issuer}/#/oauth/authorize?request_id=${encodeURIComponent(request.request_id)}`, 302);
});

oauth.get('/requests/:id', async (c) => {
  const actor = await caller(c);
  if (!actor) return oauthError(c, 401, 'unauthorized', 'Sign in required.');
  const id = z.uuid().safeParse(c.req.param('id'));
  if (!id.success) return oauthError(c, 404, 'not_found', 'Authorization request not found.');
  const { data, error } = await admin().rpc('rpc_oauth_get_authorization_request', { p_actor_id: actor.userId, p_request_id: id.data });
  if (error) return oauthError(c, 500, 'server_error', 'Could not load the authorization request.');
  const request = rowOf<Record<string, unknown>>(data);
  return request ? c.json({ request }) : oauthError(c, 404, 'not_found', 'Authorization request expired or is not available to this user.');
});

oauth.post('/requests/:id/decision', requireCsrfToken, async (c) => {
  const actor = await caller(c);
  if (!actor) return oauthError(c, 401, 'unauthorized', 'Sign in required.');
  const id = z.uuid().safeParse(c.req.param('id'));
  const body = z.strictObject({ approve: z.boolean() }).safeParse(await c.req.json().catch(() => null));
  if (!id.success || !body.success) return oauthError(c, 400, 'invalid_request', 'Malformed consent decision.');
  const code = mintAuthorizationCode();
  const { data, error } = await admin().rpc('rpc_oauth_decide_authorization_request', {
    p_actor_id: actor.userId, p_request_id: id.data, p_approve: body.data.approve,
    p_code_hash: code.hash, p_grant_seconds: env().OAUTH_REFRESH_TOKEN_TTL_SECONDS,
    p_code_seconds: env().OAUTH_AUTHORIZATION_CODE_TTL_SECONDS,
  });
  if (error) return oauthError(c, 500, 'server_error', 'Could not record consent.');
  const result = rowOf<{ approved: boolean; issuer: string; redirect_uri: string; state: string }>(data);
  if (!result) return oauthError(c, 404, 'not_found', 'Authorization request expired or was already used.');
  const redirectTo = result.approved
    ? redirectWith(result.redirect_uri, { code: code.code, state: result.state, iss: result.issuer })
    : redirectWith(result.redirect_uri, { error: 'access_denied', error_description: 'The user denied access.', state: result.state, iss: result.issuer });
  return c.json({ redirect_to: redirectTo });
});

/** Row shape returned by the exchange / rotate RPCs (service-role only, server-derived). */
interface GrantRow {
  status?: string; grant_id: string; user_id: string; workspace_id: string; session_id: string;
  scopes: string[]; client_id: string; issuer: string; provider: OAuthGrantPrincipal['provider'];
}

function principalFrom(row: GrantRow): OAuthGrantPrincipal {
  const scopes = (row.scopes as string[]).filter((scope): scope is (typeof OAUTH_SCOPES)[number] => (OAUTH_SCOPES as readonly string[]).includes(scope));
  return {
    grantId: row.grant_id, userId: row.user_id, workspaceId: row.workspace_id,
    sessionId: row.session_id, scopes, clientId: row.client_id, issuer: row.issuer, provider: row.provider,
  };
}

oauth.post('/token', async (c) => {
  const hit = await tokenLimit.hit(clientIp(c)).catch(() => null);
  if (!hit) return oauthError(c, 503, 'temporarily_unavailable', 'Token service temporarily unavailable.');
  if (!hit.allowed) return oauthError(c, 429, 'slow_down', 'Too many token requests.', { 'Retry-After': String(hit.retryAfterSeconds) });
  const issuer = requestOrigin(c);
  const form = await formBody(c);
  if (!issuer || !form) return oauthError(c, 400, 'invalid_request', 'Use form-encoded OAuth parameters.');
  const client = clientAuth(c, form);
  if (!client) return oauthError(c, 401, 'invalid_client', 'Client authentication failed.', { 'WWW-Authenticate': 'Basic realm="jobquest-oauth"' });
  const secretHash = oauthSecretHash(client.secret);
  // RFC 8707 `resource` is optional for clients that omit it: this server has one resource, so it defaults to it. An explicit wrong value is still rejected.
  const resource = form.resource ?? mcpResource(issuer);
  if (resource !== mcpResource(issuer)) return oauthError(c, 400, 'invalid_target', 'Invalid resource.');

  if (form.grant_type === 'authorization_code') {
    const codeHash = authorizationCodeHash(form.code ?? '');
    if (!codeHash || !form.redirect_uri || !validRedirectUri(form.redirect_uri) || !/^[A-Za-z0-9._~-]{43,128}$/.test(form.code_verifier ?? '')) {
      return oauthError(c, 400, 'invalid_grant', 'Invalid authorization code request.');
    }
    const refresh = mintOAuthRefreshToken();
    const { data, error } = await admin().rpc('rpc_oauth_exchange_code', {
      p_code_hash: codeHash, p_client_id: client.clientId, p_secret_hash: secretHash,
      p_redirect_uri: form.redirect_uri, p_resource: resource, p_code_verifier: form.code_verifier,
      p_refresh_hash: refresh.hash, p_refresh_seconds: env().OAUTH_REFRESH_TOKEN_TTL_SECONDS,
    });
    if (error) return oauthError(c, 503, 'temporarily_unavailable', 'Token service temporarily unavailable.');
    const row = rowOf<GrantRow>(data);
    if (!row || row.issuer !== issuer) return oauthError(c, 400, 'invalid_grant', 'Authorization code is invalid, expired or already used.');
    const principal = principalFrom(row);
    const access = await mintOAuthAccessToken(principal, resource);
    return c.json({ access_token: access.accessToken, token_type: 'Bearer', expires_in: access.expiresIn,
      refresh_token: refresh.token, scope: principal.scopes.join(' ') });
  }

  if (form.grant_type === 'refresh_token') {
    const refreshHash = oauthRefreshHash(form.refresh_token ?? '');
    if (!refreshHash) return oauthError(c, 400, 'invalid_grant', 'Refresh token is invalid.');
    const next = mintOAuthRefreshToken();
    const { data, error } = await admin().rpc('rpc_oauth_rotate_refresh_token', {
      p_token_hash: refreshHash, p_new_hash: next.hash, p_client_id: client.clientId,
      p_secret_hash: secretHash, p_resource: resource, p_refresh_seconds: env().OAUTH_REFRESH_TOKEN_TTL_SECONDS,
    });
    if (error) return oauthError(c, 503, 'temporarily_unavailable', 'Token service temporarily unavailable.');
    const row = rowOf<GrantRow>(data);
    if (!row || row.status !== 'ok' || row.issuer !== issuer) return oauthError(c, 400, 'invalid_grant', 'Refresh token is invalid or expired.');
    const principal = principalFrom(row);
    const access = await mintOAuthAccessToken(principal, resource);
    return c.json({ access_token: access.accessToken, token_type: 'Bearer', expires_in: access.expiresIn,
      refresh_token: next.token, scope: principal.scopes.join(' ') });
  }
  return oauthError(c, 400, 'unsupported_grant_type', 'Only authorization_code and refresh_token are supported.');
});

oauth.post('/revoke', async (c) => {
  const issuer = requestOrigin(c);
  const form = await formBody(c);
  const client = form ? clientAuth(c, form) : null;
  // RFC 7009: do not reveal whether a token existed; malformed client auth still gets 401.
  if (!issuer || !form) return oauthError(c, 400, 'invalid_request', 'Use form-encoded OAuth parameters.');
  if (!client) return oauthError(c, 401, 'invalid_client', 'Client authentication failed.');
  const secretHash = oauthSecretHash(client.secret);
  let grantId: string | null = null;
  const refreshHash = oauthRefreshHash(form.token ?? '');
  if (refreshHash) {
    const { data } = await admin().rpc('rpc_oauth_grant_for_refresh', {
      p_token_hash: refreshHash, p_client_id: client.clientId, p_secret_hash: secretHash,
    });
    grantId = typeof data === 'string' ? data : null;
  } else {
    const claims = await verifyOAuthAccessToken(form.token ?? '', issuer, mcpResource(issuer));
    if (claims?.client_id === client.clientId) grantId = claims.grant_id;
  }
  if (grantId) await admin().rpc('rpc_oauth_revoke_grant_by_client', {
    p_grant_id: grantId, p_client_id: client.clientId, p_secret_hash: secretHash, p_reason: 'TOKEN_REVOKED',
  });
  return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
});

const clientSchema = z.strictObject({
  workspace_id: z.uuid(), provider: z.enum(['gemini', 'chatgpt']), name: z.string().trim().min(1).max(64),
  redirect_uris: z.array(z.string().max(512)).min(1).max(5),
  scopes: z.array(z.enum(OAUTH_SCOPES)).min(1).max(OAUTH_SCOPES.length),
});

oauth.get('/clients', async (c) => {
  const actor = await caller(c);
  if (!actor) return oauthError(c, 401, 'unauthorized', 'Sign in required.');
  const workspace = z.uuid().safeParse(c.req.query('workspace_id'));
  if (!workspace.success) return oauthError(c, 400, 'invalid_request', 'Invalid workspace.');
  const { data, error } = await admin().rpc('rpc_oauth_list_clients', { p_actor_id: actor.userId, p_workspace_id: workspace.data });
  if (error) return oauthError(c, 500, 'server_error', 'Could not load OAuth clients.');
  return c.json({ clients: data ?? [] });
});

oauth.post('/clients', requireCsrfToken, async (c) => {
  const actor = await caller(c);
  if (!actor) return oauthError(c, 401, 'unauthorized', 'Sign in required.');
  const hit = await clientLimit.hit(actor.userId).catch(() => null);
  if (!hit) return oauthError(c, 503, 'temporarily_unavailable', 'OAuth client service temporarily unavailable.');
  if (!hit.allowed) return oauthError(c, 429, 'slow_down', 'Too many OAuth client changes.', { 'Retry-After': String(hit.retryAfterSeconds) });
  const body = clientSchema.safeParse(await c.req.json().catch(() => null));
  const issuer = requestOrigin(c);
  if (!body.success || !issuer || body.data.redirect_uris.some((uri) => !validRedirectUri(uri))) {
    return oauthError(c, 400, 'invalid_request', 'A workspace, provider, exact HTTPS redirect URI and supported scopes are required.');
  }
  const minted = mintOAuthClient();
  const scopes = [...new Set(body.data.scopes)];
  const redirects = [...new Set(body.data.redirect_uris)];
  const { data, error } = await admin().rpc('rpc_oauth_register_client', {
    p_actor_id: actor.userId, p_workspace_id: body.data.workspace_id,
    p_client_id: minted.clientId, p_secret_hash: minted.secretHash, p_secret_prefix: minted.secretPrefix,
    p_issuer: issuer, p_provider: body.data.provider, p_name: body.data.name,
    p_redirect_uris: redirects, p_scopes: scopes,
  });
  if (error?.code === '42501') return oauthError(c, 403, 'access_denied', 'Workspace access denied.');
  if (error) return oauthError(c, error.code === '53400' ? 429 : 400, 'invalid_request', 'Could not create OAuth client.');
  return c.json({ client_secret: minted.secret, client: { id: data, client_id: minted.clientId,
    client_secret_prefix: minted.secretPrefix, issuer, provider: body.data.provider, name: body.data.name,
    workspace_id: body.data.workspace_id, redirect_uris: redirects, scopes, active_grants: 0 } }, 201);
});

oauth.post('/clients/:id/revoke', requireCsrfToken, async (c) => {
  const actor = await caller(c);
  if (!actor) return oauthError(c, 401, 'unauthorized', 'Sign in required.');
  const id = z.uuid().safeParse(c.req.param('id'));
  if (!id.success) return oauthError(c, 404, 'not_found', 'OAuth client not found.');
  const { data, error } = await admin().rpc('rpc_oauth_revoke_client', {
    p_actor_id: actor.userId, p_client_uuid: id.data, p_reason: 'USER_REVOKED',
  });
  if (error?.code === 'P0002') return oauthError(c, 404, 'not_found', 'OAuth client not found.');
  if (error) return oauthError(c, 500, 'server_error', 'Could not revoke OAuth client.');
  return c.json({ revoked: data === true });
});
