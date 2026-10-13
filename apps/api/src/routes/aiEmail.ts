import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { EMAIL_MATCH_LOOKUP_MAX, getEmailApplicationMatches } from '../services/aiExternalIntelligenceService';
import { caller } from './scope';

/**
 * AI-11B: read-only helpers for the AI Hub Email page. Web-session authenticated; nothing here writes and nothing is
 * exposed through a provider. The Email page reads the intelligence rows itself under RLS and asks this route for the
 * server-derived match between each job-related email and the signed-in owner's existing applications.
 */
export const aiEmail = new Hono();

const STATUS: Record<string, 400 | 403 | 404 | 500 | 503> = { AI_HUB_DISABLED: 503, INVALID_CONTEXT: 400, INVALID_FILTER: 400, FORBIDDEN: 403, NOT_FOUND: 404, READ_FAILED: 500 };
const unauth = (c: Context) => c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, 401);

const query = z.object({
  workspace_id: z.uuid(),
  ids: z.string().max(EMAIL_MATCH_LOOKUP_MAX * 37).transform((v) => v.split(',').filter(Boolean)).pipe(z.array(z.uuid()).min(1).max(EMAIL_MATCH_LOOKUP_MAX)),
});

aiEmail.get('/matches', async (c) => {
  const q = query.safeParse({ workspace_id: c.req.query('workspace_id'), ids: c.req.query('ids') ?? '' });
  if (!q.success) return c.json({ error: { code: 'INVALID_FILTER', message: 'A workspace and up to 50 email ids are required.' } }, 400);
  const actor = await caller(c);
  if (!actor) return unauth(c);
  const out = await getEmailApplicationMatches({ workspaceId: q.data.workspace_id, accessToken: actor.token }, q.data.ids);
  return out.ok ? c.json({ matches: out.data }) : c.json({ error: { code: out.error.code, message: out.error.message } }, STATUS[out.error.code] ?? 500);
});
