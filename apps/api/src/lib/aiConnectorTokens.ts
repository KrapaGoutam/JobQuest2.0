// AI-3: MCP connector tokens. Dedicated opaque bearer credentials for /api/mcp.
// Same security pattern as extension tokens (HMAC-SHA256 hash only, short display
// prefix, DB-resolved, revocable) but a separate table, prefix and scope set.
// The raw token exists only in the create response; it is never stored or logged.
import { createHmac, randomBytes } from 'node:crypto';
import { env } from '../env';
import { admin } from './db';

export const CONNECTOR_SCOPES = ['jobquest:read', 'ai:read', 'ai:ingest'] as const;
export type ConnectorScope = (typeof CONNECTOR_SCOPES)[number];
/** Least privilege: ingestion must be requested explicitly. */
export const DEFAULT_CONNECTOR_SCOPES: readonly ConnectorScope[] = ['jobquest:read', 'ai:read'];
export const CONNECTOR_EXPIRY_DAYS = [7, 30, 90] as const;
export const DEFAULT_CONNECTOR_EXPIRY_DAYS = 30;

export interface ConnectorTokenRecord {
  id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  token_prefix: string;
  scopes: ConnectorScope[];
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
}

/** Everything the resolver may return: bound identity + scopes. Never a hash. */
export interface ResolvedConnector {
  tokenId: string;
  userId: string;
  workspaceId: string;
  sessionId: string;
  scopes: ConnectorScope[];
  tokenPrefix: string;
  expiresAt: string;
  lastUsedAt: string | null;
}

/** `jq_mcp_<dev|live>_` + 43 base62 chars (~256 bits). */
const TOKEN_PATTERN = /^jq_mcp_(dev|live)_[A-Za-z0-9]{43}$/;
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
/** Domain separation so the shared pepper can never make an extension-token digest valid here. */
const HASH_DOMAIN = 'jq-ai-connector-token-v1';

function randomBase62(length: number): string {
  let result = '';
  while (result.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte >= 248) continue; // rejection sampling: no modulo bias
      result += BASE62[byte % 62];
      if (result.length === length) break;
    }
  }
  return result;
}

export function connectorTokenHash(token: string): string {
  const key = createHmac('sha256', env().EXTENSION_TOKEN_PEPPER).update(HASH_DOMAIN).digest();
  return createHmac('sha256', key).update(token).digest('hex');
}

export function isConnectorToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

export function mintConnectorSecret(): { token: string; prefix: string; hash: string } {
  const token = `jq_mcp_${env().EXTENSION_TOKEN_ENV}_${randomBase62(43)}`;
  // Prefix = marker + env + 4 random chars: distinguishes tokens in a list without
  // persisting enough material to authenticate.
  return { token, prefix: token.slice(0, 15), hash: connectorTokenHash(token) };
}

/**
 * Raw bearer -> live bound credential, or null. Malformed, unknown, revoked,
 * expired, session-revoked and membership-removed tokens are indistinguishable.
 * Authentication touches only the one resolver RPC (no general service-role reads).
 */
export async function resolveConnectorToken(raw: string): Promise<ResolvedConnector | null> {
  if (!isConnectorToken(raw)) return null;
  const { data, error } = await admin().rpc('rpc_ai_resolve_connector_token', { p_token_hash: connectorTokenHash(raw) });
  if (error) throw new Error('connector resolution unavailable'); // fail closed (503), not "invalid"
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  const scopes = (row.scopes as string[]).filter((s): s is ConnectorScope => (CONNECTOR_SCOPES as readonly string[]).includes(s));
  if (scopes.length === 0) return null;
  return {
    tokenId: row.token_id, userId: row.user_id, workspaceId: row.workspace_id, sessionId: row.session_id,
    scopes, tokenPrefix: row.token_prefix, expiresAt: row.expires_at, lastUsedAt: row.last_used_at,
  };
}

/** Advisory usage timestamp; failure never affects the (already made) auth decision. */
export function touchConnectorToken(tokenId: string): void {
  void Promise.resolve(admin().rpc('rpc_ai_touch_connector_token', { p_token_id: tokenId }))
    .then(() => undefined, () => undefined);
}

export const CONNECTOR_PUBLIC_COLUMNS =
  'id, workspace_id, user_id, name, token_prefix, scopes, created_at, expires_at, last_used_at, revoked_at, revoked_reason';

export function connectorStatus(row: Pick<ConnectorTokenRecord, 'revoked_at' | 'expires_at'>, now = Date.now()): 'REVOKED' | 'EXPIRED' | 'ACTIVE' {
  if (row.revoked_at) return 'REVOKED';
  return new Date(row.expires_at).getTime() <= now ? 'EXPIRED' : 'ACTIVE';
}

/** Metadata only: no hash, no session id, no secret. */
export function publicConnector(row: ConnectorTokenRecord) {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    name: row.name,
    token_prefix: row.token_prefix,
    scopes: row.scopes,
    created_at: row.created_at,
    expires_at: row.expires_at,
    last_used_at: row.last_used_at,
    revoked_at: row.revoked_at,
    revoked_reason: row.revoked_reason,
    status: connectorStatus(row),
  };
}
