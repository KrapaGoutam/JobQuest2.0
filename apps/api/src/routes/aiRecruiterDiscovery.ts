import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { requireCsrfToken } from '../lib/security';
import { RECRUITER_PREFERENCE_KEYS } from '../lib/aiContract';
import { getRecruiterPreferences, saveRecruiterPreferences, type RecruiterPrefsError } from '../services/aiRecruiterDiscoveryService';
import { caller } from './scope';

/**
 * AI-11E: Recruiter Discovery preferences (Settings -> AI & Automation -> Recruiter Intelligence). Web-session authenticated (the
 * signed-in owner only); saving is CSRF-protected and honours the AI Hub kill switch. Providers get a READ-ONLY view through MCP
 * only. Nothing here searches for people, contacts anyone, or creates/changes an application, contact or task.
 */
export const aiRecruiterDiscovery = new Hono();

type ApiStatus = 400 | 401 | 403 | 404 | 422 | 500 | 503;
const STATUS: Record<string, ApiStatus> = {
  INVALID_INPUT: 422, INVALID_FILTER: 400, INVALID_CONTEXT: 400, WORKSPACE_ACCESS_DENIED: 403, FORBIDDEN: 403, NOT_FOUND: 404,
  AI_HUB_DISABLED: 503, READ_FAILED: 500, SAVE_FAILED: 500,
};
const unauth = (c: Context) => c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, 401);
const fail = (c: Context, e: { code: string; message: string; field?: string }) =>
  c.json({ error: { code: e.code, message: e.message, ...(e.field ? { field: e.field } : {}) } }, STATUS[e.code] ?? 500);

const workspaceQuery = z.object({ workspace_id: z.uuid() });
const ALLOWED_KEYS = new Set<string>(['workspace_id', ...RECRUITER_PREFERENCE_KEYS]);

aiRecruiterDiscovery.get('/preferences', async (c) => {
  const q = workspaceQuery.safeParse({ workspace_id: c.req.query('workspace_id') });
  if (!q.success) return fail(c, { code: 'INVALID_INPUT', message: 'A workspace is required.' });
  const actor = await caller(c);
  if (!actor) return unauth(c);
  const out = await getRecruiterPreferences({ workspaceId: q.data.workspace_id, accessToken: actor.token });
  return out.ok ? c.json(out.data) : fail(c, out.error);
});

aiRecruiterDiscovery.post('/preferences', requireCsrfToken, async (c) => {
  const raw: unknown = await c.req.json().catch(() => null);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw) || Object.keys(raw).some((k) => !ALLOWED_KEYS.has(k))) {
    return fail(c, { code: 'INVALID_INPUT', message: 'A workspace and valid recruiter preferences are required.' });
  }
  const { workspace_id, ...prefs } = raw as Record<string, unknown>;
  const ws = z.uuid().safeParse(workspace_id);
  if (!ws.success) return fail(c, { code: 'INVALID_INPUT', message: 'A workspace is required.' });
  const actor = await caller(c);
  if (!actor) return unauth(c);
  const out = await saveRecruiterPreferences({ workspaceId: ws.data, userId: actor.userId }, prefs);
  return out.ok ? c.json(out.data) : fail(c, out.error satisfies RecruiterPrefsError);
});
