import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { env } from '../env';
import { admin } from './db';
import { bearer } from './security';

export const EXTENSION_SCOPES = [
  'workflow:read',
  'documents:read',
  'applications:duplicate_check',
  'applications:create',
  'profile:read',
] as const;

export type ExtensionScope = (typeof EXTENSION_SCOPES)[number];

export interface ExtensionTokenRecord {
  id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  token_prefix: string;
  scopes: ExtensionScope[];
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  replaced_by_token_id: string | null;
}

export interface ExtensionActor {
  tokenId: string;
  userId: string;
  workspaceId: string;
  scopes: ExtensionScope[];
  expiresAt: string;
}

const TOKEN_PATTERN = /^jqx_(dev|live)_[A-Za-z0-9]{43}$/;
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function randomBase62(length: number): string {
  let result = '';
  while (result.length < length) {
    for (const byte of randomBytes(length)) {
      // 248 is the largest multiple of 62 below 256; rejection avoids modulo bias.
      if (byte >= 248) continue;
      result += BASE62[byte % 62];
      if (result.length === length) break;
    }
  }
  return result;
}

/** 43 base62 characters carry slightly more than 256 bits of entropy. */
export function mintExtensionSecret(): { token: string; prefix: string; hash: string } {
  const token = `jqx_${env().EXTENSION_TOKEN_ENV}_${randomBase62(43)}`;
  // Retain four random characters after the environment marker so operators
  // can distinguish tokens without persisting enough material to authenticate.
  return { token, prefix: token.slice(0, 12), hash: extensionTokenHash(token) };
}

export function extensionTokenHash(token: string): string {
  return createHmac('sha256', env().EXTENSION_TOKEN_PEPPER).update(token).digest('hex');
}

export function isExtensionToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

export function hasScope(actor: ExtensionActor, scope: ExtensionScope): boolean {
  return actor.scopes.includes(scope);
}

/** Constant-time comparison helper used by unit tests and future pepper rotation tooling. */
export function hashesEqual(left: string, right: string): boolean {
  return left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

/**
 * Extension bearer token -> live token + live workspace membership. Revocation,
 * expiry, suspension, and membership removal all fail identically to avoid leaking
 * token metadata. The raw bearer token is never returned or logged.
 */
export async function extensionActor(c: Context): Promise<ExtensionActor | null> {
  const raw = bearer(c);
  if (!raw || !isExtensionToken(raw)) return null;

  const hash = extensionTokenHash(raw);
  const { data, error } = await admin()
    .from('extension_tokens')
    .select('id, workspace_id, user_id, scopes, expires_at, last_used_at, revoked_at')
    .eq('token_hash', hash)
    .maybeSingle();
  if (error || !data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) return null;

  const [accountResult, membershipResult] = await Promise.all([
    admin().from('user_accounts').select('status').eq('user_id', data.user_id).maybeSingle(),
    admin().from('workspace_members').select('id, status').eq('workspace_id', data.workspace_id).eq('user_id', data.user_id).maybeSingle(),
  ]);
  if (accountResult.error || accountResult.data?.status !== 'ACTIVE' || membershipResult.error || !membershipResult.data || membershipResult.data.status !== 'ACTIVE') return null;

  const lastUsed = data.last_used_at ? new Date(data.last_used_at).getTime() : 0;
  if (lastUsed < Date.now() - 60_000) {
    // Coarse usage metadata only. Authentication does not fail if this advisory
    // write loses a race; the token was already fully validated above.
    void admin()
      .from('extension_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id)
      .then(() => undefined);
  }

  return {
    tokenId: data.id,
    userId: data.user_id,
    workspaceId: data.workspace_id,
    scopes: data.scopes as ExtensionScope[],
    expiresAt: data.expires_at,
  };
}

export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ');
}

export function normalizeJobUrl(rawUrl: unknown): string {
  const value = String(rawUrl ?? '').trim();
  if (!value) return '';
  try {
    const parsed = new URL(value);
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^utm_/i.test(key)) parsed.searchParams.delete(key);
    }
    const pairs = [...parsed.searchParams.entries()].sort(([ak, av], [bk, bv]) =>
      ak.localeCompare(bk) || av.localeCompare(bv),
    );
    parsed.search = '';
    for (const [key, item] of pairs) parsed.searchParams.append(key, item);
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.pathname = parsed.pathname.toLowerCase();
    let normalized = parsed.toString();
    if (!parsed.search && normalized.endsWith('/')) normalized = normalized.slice(0, -1);
    return normalized;
  } catch {
    return value.toLowerCase();
  }
}
