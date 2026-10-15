// AI-3: MCP authentication boundary. Everything under /api/mcp passes through
// `authenticateMcp` BEFORE any tool or protocol handling. Verifiers produce an
// McpPrincipal; today only the scoped connector token exists. Full OAuth is
// AI-10 adds an OAuth verifier alongside (never instead of) connector tokens.
import type { Context } from 'hono';
import { env } from '../env';
import { resolveConnectorToken, touchConnectorToken } from '../lib/aiConnectorTokens';
import { mcpResource, requestOrigin, resolveOAuthAccessToken, touchOAuthGrant } from '../lib/oauth';
import { limiter } from '../lib/rateLimit';
import { bearer, clientIp } from '../lib/security';
import type { McpPrincipal } from './principal';

export type McpAuthFailure = 'MISSING' | 'MALFORMED' | 'INVALID' | 'RATE_LIMITED' | 'UNAVAILABLE';
export type McpAuthResult =
  | { ok: true; principal: McpPrincipal }
  | { ok: false; reason: McpAuthFailure; retryAfterSeconds?: number };

const tokenLimit = limiter('mcp-token', () => env().MCP_TOKEN_RATE_LIMIT, 60);
const failureLimit = limiter('mcp-auth-failure', () => env().MCP_AUTH_FAILURE_IP_MAX_PER_MINUTE, 60);

/** Strict `Authorization: Bearer <token>` parse (scheme is case-insensitive per RFC 9110; no extra whitespace). */
export function bearerOf(c: Context): { present: boolean; token?: string } {
  const header = c.req.header('authorization');
  if (!header) return { present: false };
  const token = bearer(c) ?? (/^bearer /i.test(header) ? header.slice(7) : undefined);
  return token && /^\S+$/.test(token) ? { present: true, token } : { present: true };
}

export async function authenticateMcp(c: Context): Promise<McpAuthResult> {
  const { present, token } = bearerOf(c);
  const rejected = async (reason: McpAuthFailure): Promise<McpAuthResult> => {
    // Failed attempts burn a per-IP budget (hashed key). A limiter outage must not turn into an open door.
    const hit = await failureLimit.hit(clientIp(c)).catch(() => null);
    if (!hit) return { ok: false, reason: 'UNAVAILABLE' };
    if (!hit.allowed) return { ok: false, reason: 'RATE_LIMITED', retryAfterSeconds: Math.max(1, hit.retryAfterSeconds) };
    return { ok: false, reason };
  };
  if (!present) return rejected('MISSING');
  if (!token) return rejected('MALFORMED');

  let resolved;
  try {
    resolved = await resolveConnectorToken(token);
  } catch {
    return { ok: false, reason: 'UNAVAILABLE' };
  }
  if (!resolved) {
    const issuer = requestOrigin(c);
    if (!issuer) return rejected('INVALID');
    let oauth;
    try { oauth = await resolveOAuthAccessToken(token, issuer, mcpResource(issuer)); }
    catch { return { ok: false, reason: 'UNAVAILABLE' }; }
    if (!oauth) return rejected('INVALID');
    const hit = await tokenLimit.hit(`oauth:${oauth.grantId}`).catch(() => null);
    if (!hit) return { ok: false, reason: 'UNAVAILABLE' };
    if (!hit.allowed) return { ok: false, reason: 'RATE_LIMITED', retryAfterSeconds: Math.max(1, hit.retryAfterSeconds) };
    touchOAuthGrant(oauth.grantId);
    return {
      ok: true,
      principal: {
        userId: oauth.userId, workspaceId: oauth.workspaceId, scopes: oauth.scopes,
        credentialType: 'oauth', credentialId: oauth.grantId,
        credentialPrefix: oauth.clientId.slice(0, 24), sessionId: oauth.sessionId, provider: oauth.provider,
      },
    };
  }

  const hit = await tokenLimit.hit(resolved.tokenId).catch(() => null);
  if (!hit) return { ok: false, reason: 'UNAVAILABLE' };
  if (!hit.allowed) return { ok: false, reason: 'RATE_LIMITED', retryAfterSeconds: Math.max(1, hit.retryAfterSeconds) };

  touchConnectorToken(resolved.tokenId);
  return {
    ok: true,
    principal: {
      userId: resolved.userId,
      workspaceId: resolved.workspaceId,
      scopes: resolved.scopes,
      credentialType: 'connector_token',
      credentialId: resolved.tokenId,
      credentialPrefix: resolved.tokenPrefix,
      sessionId: resolved.sessionId,
      provider: resolved.provider,
    },
  };
}
