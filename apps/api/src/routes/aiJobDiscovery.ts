import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { requireCsrfToken } from '../lib/security';
import { DISCOVERY_PROFILE_KEYS } from '../lib/aiContract';
import { LEAD_MATCH_LOOKUP_MAX, getJobLeadApplicationMatches } from '../services/aiExternalIntelligenceService';
import { getJobDiscoveryProfile, saveJobDiscoveryProfile, type DiscoveryError } from '../services/aiJobDiscoveryService';
import { caller } from './scope';

/**
 * AI-11D: Job Discovery profile (Settings -> AI & Automation -> Job Discovery) and the read-only lead/application match
 * for the AI Hub Job Leads page. Web-session authenticated (the signed-in owner only); saving is CSRF-protected and honours
 * the AI Hub kill switch. Providers get a READ-ONLY view of the profile through MCP only; nothing here searches the web,
 * creates an application or changes one.
 */
export const aiJobDiscovery = new Hono();

type ApiStatus = 400 | 401 | 403 | 404 | 422 | 500 | 503;
const STATUS: Record<string, ApiStatus> = {
  INVALID_INPUT: 422, INVALID_FILTER: 400, INVALID_CONTEXT: 400, WORKSPACE_ACCESS_DENIED: 403, FORBIDDEN: 403, NOT_FOUND: 404,
  AI_HUB_DISABLED: 503, READ_FAILED: 500, SAVE_FAILED: 500,
};
const unauth = (c: Context) => c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, 401);
const fail = (c: Context, e: { code: string; message: string; field?: string }) =>
  c.json({ error: { code: e.code, message: e.message, ...(e.field ? { field: e.field } : {}) } }, STATUS[e.code] ?? 500);

const workspaceQuery = z.object({ workspace_id: z.uuid() });
const ALLOWED_KEYS = new Set<string>(['workspace_id', ...DISCOVERY_PROFILE_KEYS]);

aiJobDiscovery.get('/profile', async (c) => {
  const q = workspaceQuery.safeParse({ workspace_id: c.req.query('workspace_id') });
  if (!q.success) return fail(c, { code: 'INVALID_INPUT', message: 'A workspace is required.' });
  const actor = await caller(c);
  if (!actor) return unauth(c);
  const out = await getJobDiscoveryProfile({ workspaceId: q.data.workspace_id, accessToken: actor.token });
  return out.ok ? c.json(out.data) : fail(c, out.error);
});

aiJobDiscovery.post('/profile', requireCsrfToken, async (c) => {
  const raw: unknown = await c.req.json().catch(() => null);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw) || Object.keys(raw).some((k) => !ALLOWED_KEYS.has(k))) {
    return fail(c, { code: 'INVALID_INPUT', message: 'A workspace and a valid discovery profile are required.' });
  }
  const { workspace_id, ...profile } = raw as Record<string, unknown>;
  const ws = z.uuid().safeParse(workspace_id);
  if (!ws.success) return fail(c, { code: 'INVALID_INPUT', message: 'A workspace is required.' });
  const actor = await caller(c);
  if (!actor) return unauth(c);
  const out = await saveJobDiscoveryProfile({ workspaceId: ws.data, userId: actor.userId }, profile);
  return out.ok ? c.json(out.data) : fail(c, out.error satisfies DiscoveryError);
});

const matchQuery = z.object({
  workspace_id: z.uuid(),
  ids: z.string().max(LEAD_MATCH_LOOKUP_MAX * 37).transform((v) => v.split(',').filter(Boolean)).pipe(z.array(z.uuid()).min(1).max(LEAD_MATCH_LOOKUP_MAX)),
});

aiJobDiscovery.get('/matches', async (c) => {
  const q = matchQuery.safeParse({ workspace_id: c.req.query('workspace_id'), ids: c.req.query('ids') ?? '' });
  if (!q.success) return fail(c, { code: 'INVALID_FILTER', message: `A workspace and up to ${LEAD_MATCH_LOOKUP_MAX} lead ids are required.` });
  const actor = await caller(c);
  if (!actor) return unauth(c);
  const out = await getJobLeadApplicationMatches({ workspaceId: q.data.workspace_id, accessToken: actor.token }, q.data.ids);
  return out.ok ? c.json({ matches: out.data }) : fail(c, out.error);
});
