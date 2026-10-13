import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { isAiHubServerEnabled } from '../lib/aiHubConfig';
import {
  CONNECTOR_EXPIRY_DAYS, CONNECTOR_PUBLIC_COLUMNS, CONNECTOR_SCOPES, DEFAULT_CONNECTOR_EXPIRY_DAYS,
  DEFAULT_CONNECTOR_SCOPES, mintConnectorSecret, publicConnector, type ConnectorTokenRecord,
} from '../lib/aiConnectorTokens';
import { admin } from '../lib/db';
import { requireCsrfToken } from '../lib/security';
import { caller } from './scope';

/**
 * AI-3: MCP connector-token management. Web-session authenticated (the signed-in
 * owner only), CSRF-protected for mutations. The raw token is returned ONLY by
 * create and never again; list returns metadata (never a hash or session id).
 * There is no update: create a new token instead. Revocation always works, even
 * when the AI Hub kill switch is off; creation does not.
 */
export const aiConnectors = new Hono();

type ApiStatus = 400 | 401 | 403 | 404 | 422 | 500 | 503;
const fail = (c: Context, status: ApiStatus, code: string, message: string) => c.json({ error: { code, message } }, status);

const createSchema = z.strictObject({
  workspace_id: z.uuid(),
  name: z.string().trim().min(1).max(64),
  scopes: z.array(z.enum(CONNECTOR_SCOPES)).min(1).max(CONNECTOR_SCOPES.length).optional(),
  expires_in_days: z.union(CONNECTOR_EXPIRY_DAYS.map((d) => z.literal(d)) as [z.ZodLiteral<7>, z.ZodLiteral<30>, z.ZodLiteral<90>]).default(DEFAULT_CONNECTOR_EXPIRY_DAYS),
});

aiConnectors.get('/', async (c) => {
  const actor = await caller(c);
  if (!actor) return fail(c, 401, 'UNAUTHENTICATED', 'Sign in required.');
  let query = actor.client
    .from('ai_connector_tokens')
    .select(CONNECTOR_PUBLIC_COLUMNS)
    .eq('user_id', actor.userId)
    .order('created_at', { ascending: false })
    .limit(100);
  const workspaceId = c.req.query('workspace_id');
  if (workspaceId) {
    if (!z.uuid().safeParse(workspaceId).success) return fail(c, 422, 'INVALID_INPUT', 'Invalid workspace.');
    query = query.eq('workspace_id', workspaceId);
  }
  const { data, error } = await query;
  if (error) return fail(c, 500, 'TOKEN_LIST_FAILED', 'Could not load connector tokens.');
  return c.json({ tokens: (data as ConnectorTokenRecord[]).map(publicConnector) });
});

aiConnectors.post('/', requireCsrfToken, async (c) => {
  const actor = await caller(c);
  if (!actor) return fail(c, 401, 'UNAUTHENTICATED', 'Sign in required.');
  if (!isAiHubServerEnabled()) return fail(c, 503, 'AI_HUB_DISABLED', 'AI Hub is disabled on this server.');
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, 'INVALID_INPUT', 'A workspace, a name and supported scopes/expiration are required.');
  const body = parsed.data;

  const secret = mintConnectorSecret();
  const scopes = [...new Set(body.scopes ?? DEFAULT_CONNECTOR_SCOPES)];
  const expiresAt = new Date(Date.now() + body.expires_in_days * 86_400_000).toISOString();
  const { data: tokenId, error } = await admin().rpc('rpc_ai_create_connector_token', {
    p_actor_id: actor.userId,
    p_workspace_id: body.workspace_id,
    p_name: body.name,
    p_token_prefix: secret.prefix,
    p_token_hash: secret.hash,
    p_scopes: scopes,
    p_expires_at: expiresAt,
  });
  if (error || !tokenId) {
    if (error?.code === '42501') return fail(c, 403, 'WORKSPACE_ACCESS_DENIED', 'Workspace access denied.');
    if (error?.code === '53400') return fail(c, 422, 'TOKEN_LIMIT', 'Too many active connector tokens. Revoke one first.');
    return fail(c, 400, 'TOKEN_CREATE_FAILED', 'Could not create connector token.');
  }
  const { data } = await actor.client.from('ai_connector_tokens').select(CONNECTOR_PUBLIC_COLUMNS).eq('id', tokenId).single();
  if (!data) return fail(c, 500, 'TOKEN_CREATE_FAILED', 'Could not create connector token.');
  return c.json({ token: secret.token, metadata: publicConnector(data as ConnectorTokenRecord) }, 201);
});

aiConnectors.post('/:id/revoke', requireCsrfToken, async (c) => {
  const actor = await caller(c);
  if (!actor) return fail(c, 401, 'UNAUTHENTICATED', 'Sign in required.');
  const id = z.uuid().safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 404, 'TOKEN_NOT_FOUND', 'Connector token not found.');
  const { data, error } = await admin().rpc('rpc_ai_revoke_connector_token', {
    p_actor_id: actor.userId,
    p_token_id: id.data,
    p_reason: 'USER_REVOKED',
  });
  if (error?.code === 'P0002') return fail(c, 404, 'TOKEN_NOT_FOUND', 'Connector token not found.');
  if (error) return fail(c, 400, 'TOKEN_REVOKE_FAILED', 'Could not revoke connector token.');
  return c.json({ revoked: data === true });
});
