// AI-10: provider-neutral OAuth 2.1 primitives. OAuth tokens use the existing
// ES256 key but a distinct issuer/audience/claim contract, so they cannot be
// mistaken for JobQuest browser access tokens or Supabase Data API tokens.
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { Context } from 'hono';
import type { JWTPayload } from 'jose';
import { allowedOrigins, env } from '../env';
import { admin } from './db';
import { ACCESS_ALG, signingMaterial } from './tokens';
import type { ConnectorScope } from './aiConnectorTokens';

export const OAUTH_SCOPES = ['jobquest:read', 'ai:read', 'ai:ingest'] as const;
export const OAUTH_OFFLINE_SCOPE = 'offline_access';
export const OAUTH_TOKEN_AUTH_METHODS = ['client_secret_post', 'client_secret_basic'] as const;
// `state` is opaque to us and round-tripped unchanged. Gemini sends ~1.2k characters,
// so the bound is generous but finite; it matches oauth_authorization_requests.state varchar(2048).
export const OAUTH_STATE_MIN_LENGTH = 8;
export const OAUTH_STATE_MAX_LENGTH = 2048;
export type OAuthProvider = 'gemini' | 'chatgpt';

const CLIENT_ID_PATTERN = /^jq_oauth_(dev|live)_[A-Za-z0-9]{32}$/;
const CLIENT_SECRET_PATTERN = /^jq_oauth_secret_(dev|live)_[A-Za-z0-9]{43}$/;
const AUTH_CODE_PATTERN = /^jq_oac_[A-Za-z0-9_-]{43}$/;
const REFRESH_PATTERN = /^jq_ort_[A-Za-z0-9_-]{43}$/;
const HASH_DOMAIN = 'jq-oauth-21-v1';

function hmac(kind: string, value: string): string {
  const key = createHmac('sha256', env().EXTENSION_TOKEN_PEPPER).update(`${HASH_DOMAIN}:${kind}`).digest();
  return createHmac('sha256', key).update(value).digest('hex');
}

function base62(length: number): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let out = '';
  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte >= 248) continue;
      out += alphabet[byte % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}

export function requestOrigin(c: Context): string | null {
  try {
    const origin = new URL(c.req.url).origin;
    return allowedOrigins().has(origin) ? origin : null;
  } catch {
    return null;
  }
}

export const mcpResource = (issuer: string): string => `${issuer}/api/mcp`;
export const protectedResourceMetadataUrl = (issuer: string): string => `${issuer}/.well-known/oauth-protected-resource/api/mcp`;

export function validRedirectUri(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.hash && value.length <= 512;
  } catch { return false; }
}

export function normalizeScopes(value: string): ConnectorScope[] | null {
  const parts = [...new Set(value.split(/\s+/).map((s) => s.trim()).filter(Boolean))];
  if (parts.length < 1 || parts.some((s) => !(OAUTH_SCOPES as readonly string[]).includes(s))) return null;
  return parts as ConnectorScope[];
}

export function mintOAuthClient(): { clientId: string; secret: string; secretPrefix: string; secretHash: string } {
  const marker = env().EXTENSION_TOKEN_ENV;
  const clientId = `jq_oauth_${marker}_${base62(32)}`;
  const secret = `jq_oauth_secret_${marker}_${base62(43)}`;
  return { clientId, secret, secretPrefix: secret.slice(0, 24), secretHash: oauthSecretHash(secret) };
}

export function oauthSecretHash(secret: string): string {
  return hmac('client-secret', secret);
}
export function validClientCredentials(clientId: string, secret: string): boolean {
  return CLIENT_ID_PATTERN.test(clientId) && CLIENT_SECRET_PATTERN.test(secret);
}
export function mintAuthorizationCode(): { code: string; hash: string } {
  const code = `jq_oac_${randomBytes(32).toString('base64url')}`;
  return { code, hash: hmac('authorization-code', code) };
}
export function authorizationCodeHash(code: string): string | null {
  return AUTH_CODE_PATTERN.test(code) ? hmac('authorization-code', code) : null;
}
export function mintOAuthRefreshToken(): { token: string; hash: string } {
  const token = `jq_ort_${randomBytes(32).toString('base64url')}`;
  return { token, hash: hmac('refresh-token', token) };
}
export function oauthRefreshHash(token: string): string | null {
  return REFRESH_PATTERN.test(token) ? hmac('refresh-token', token) : null;
}

export interface OAuthGrantPrincipal {
  grantId: string;
  userId: string;
  workspaceId: string;
  sessionId: string;
  scopes: ConnectorScope[];
  clientId: string;
  issuer: string;
  provider: OAuthProvider;
}

export interface OAuthAccessClaims extends JWTPayload {
  sub: string;
  session_id: string;
  workspace_id: string;
  grant_id: string;
  client_id: string;
  scope: string;
}

export async function mintOAuthAccessToken(principal: OAuthGrantPrincipal, resource: string) {
  const { kid, privateKey } = await signingMaterial();
  const { SignJWT } = await import('jose');
  const now = Math.floor(Date.now() / 1000);
  const exp = now + env().OAUTH_ACCESS_TOKEN_TTL_SECONDS;
  const accessToken = await new SignJWT({
    session_id: principal.sessionId,
    workspace_id: principal.workspaceId,
    grant_id: principal.grantId,
    client_id: principal.clientId,
    scope: principal.scopes.join(' '),
  })
    .setProtectedHeader({ alg: ACCESS_ALG, kid, typ: 'at+jwt' })
    .setSubject(principal.userId)
    .setIssuer(principal.issuer)
    .setAudience(resource)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setJti(randomUUID())
    .sign(privateKey);
  return { accessToken, expiresIn: exp - now };
}

export async function verifyOAuthAccessToken(token: string, issuer: string, resource: string): Promise<OAuthAccessClaims | null> {
  try {
    const { publicKey } = await signingMaterial();
    const { jwtVerify } = await import('jose');
    const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
      algorithms: [ACCESS_ALG], issuer, audience: resource, typ: 'at+jwt',
    });
    if (protectedHeader.typ !== 'at+jwt' || typeof payload.sub !== 'string' || typeof payload.session_id !== 'string'
      || typeof payload.workspace_id !== 'string' || typeof payload.grant_id !== 'string'
      || typeof payload.client_id !== 'string' || typeof payload.scope !== 'string') return null;
    return payload as OAuthAccessClaims;
  } catch { return null; }
}

export async function resolveOAuthAccessToken(token: string, issuer: string, resource: string): Promise<OAuthGrantPrincipal | null> {
  const claims = await verifyOAuthAccessToken(token, issuer, resource);
  if (!claims) return null;
  const scopes = normalizeScopes(claims.scope);
  if (!scopes) return null;
  const { data, error } = await admin().rpc('rpc_oauth_resolve_grant', {
    p_grant_id: claims.grant_id, p_client_id: claims.client_id,
  });
  if (error) throw new Error('oauth resolution unavailable');
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || row.user_id !== claims.sub || row.workspace_id !== claims.workspace_id
    || row.session_id !== claims.session_id || row.issuer !== issuer) return null;
  const storedScopes = (row.scopes as string[]).filter((s): s is ConnectorScope => (OAUTH_SCOPES as readonly string[]).includes(s));
  if (storedScopes.length !== scopes.length || scopes.some((s) => !storedScopes.includes(s))) return null;
  return {
    grantId: row.grant_id, userId: row.user_id, workspaceId: row.workspace_id, sessionId: row.session_id,
    scopes: storedScopes, clientId: row.client_id, issuer: row.issuer, provider: row.provider,
  };
}

export function touchOAuthGrant(grantId: string): void {
  void Promise.resolve(admin().rpc('rpc_oauth_touch_grant', { p_grant_id: grantId })).then(() => undefined, () => undefined);
}
