import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { requireCsrfToken } from '../lib/security';
import {
  deleteAutomation, listAutomations, saveAutomation,
  type AutomationContext, type AutomationError,
} from '../services/aiAutomationService';
import { caller } from './scope';

/**
 * AI-11A: AI Hub automation definitions (Settings -> AI & Automation -> Automations). Web-session authenticated
 * (the signed-in owner only); mutations are CSRF-protected and creating/updating honours the AI Hub kill switch
 * (deleting never does). NOT exposed through MCP: a provider can never read or change an automation definition.
 * There is deliberately no Run Now route yet: each automation reports a `runNow` readiness contract instead.
 */
export const aiAutomations = new Hono();

type ApiStatus = 400 | 401 | 403 | 404 | 409 | 422 | 500 | 503;
const STATUS: Record<string, ApiStatus> = {
  INVALID_INPUT: 422, AUTOMATION_NOT_FOUND: 404, AUTOMATION_CONFLICT: 409, AUTOMATION_LIMIT: 422, WORKSPACE_ACCESS_DENIED: 403,
  AI_HUB_DISABLED: 503, READ_FAILED: 500, SAVE_FAILED: 500,
};
const fail = (c: Context, e: AutomationError) => c.json({ error: { code: e.code, message: e.message, ...(e.field ? { field: e.field } : {}) } }, STATUS[e.code] ?? 500);
const unauth = (c: Context) => c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, 401);

const workspaceQuery = z.object({ workspace_id: z.uuid() });
const ALLOWED_KEYS = new Set(['workspace_id', 'name', 'workflow', 'enabled', 'provider', 'cadence', 'localTime', 'timezone', 'weekdays', 'sections', 'delivery']);

async function context(c: Context, workspaceId: string): Promise<AutomationContext | null> {
  const actor = await caller(c);
  return actor ? { workspaceId, userId: actor.userId, accessToken: actor.token } : null;
}

/** Splits `{ workspace_id, ...definition }`; unknown keys (user_id, owner, ...) are rejected, never honoured. */
async function parseBody(c: Context): Promise<{ workspaceId: string; definition: Record<string, unknown> } | null> {
  const raw: unknown = await c.req.json().catch(() => null);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { workspace_id, ...definition } = raw as Record<string, unknown>;
  if (Object.keys(raw).some((k) => !ALLOWED_KEYS.has(k))) return null;
  const ws = z.uuid().safeParse(workspace_id);
  return ws.success ? { workspaceId: ws.data, definition } : null;
}

aiAutomations.get('/', async (c) => {
  const q = workspaceQuery.safeParse({ workspace_id: c.req.query('workspace_id') });
  if (!q.success) return fail(c, { code: 'INVALID_INPUT', message: 'A workspace is required.' });
  const ctx = await context(c, q.data.workspace_id);
  if (!ctx) return unauth(c);
  const out = await listAutomations(ctx);
  return out.ok ? c.json({ automations: out.data }) : fail(c, out.error);
});

aiAutomations.post('/', requireCsrfToken, async (c) => {
  const body = await parseBody(c);
  if (!body) return fail(c, { code: 'INVALID_INPUT', message: 'A workspace and a valid automation are required.' });
  const ctx = await context(c, body.workspaceId);
  if (!ctx) return unauth(c);
  const out = await saveAutomation(ctx, null, body.definition);
  return out.ok ? c.json(out.data, 201) : fail(c, out.error);
});

// Mutations are POST-only like every other JobQuest route (the Vercel entry exports no PUT/PATCH).
aiAutomations.post('/:id', requireCsrfToken, async (c) => {
  const id = z.uuid().safeParse(c.req.param('id'));
  if (!id.success) return fail(c, { code: 'AUTOMATION_NOT_FOUND', message: 'Automation not found.' });
  const body = await parseBody(c);
  if (!body) return fail(c, { code: 'INVALID_INPUT', message: 'A workspace and a valid automation are required.' });
  const ctx = await context(c, body.workspaceId);
  if (!ctx) return unauth(c);
  const out = await saveAutomation(ctx, id.data, body.definition);
  return out.ok ? c.json(out.data, 200) : fail(c, out.error);
});

aiAutomations.post('/:id/delete', requireCsrfToken, async (c) => {
  const id = z.uuid().safeParse(c.req.param('id'));
  const q = workspaceQuery.safeParse(await c.req.json().catch(() => null));
  if (!id.success) return fail(c, { code: 'AUTOMATION_NOT_FOUND', message: 'Automation not found.' });
  if (!q.success) return fail(c, { code: 'INVALID_INPUT', message: 'A workspace is required.' });
  const ctx = await context(c, q.data.workspace_id);
  if (!ctx) return unauth(c);
  const out = await deleteAutomation(ctx, id.data);
  return out.ok ? c.json(out.data) : fail(c, out.error);
});
