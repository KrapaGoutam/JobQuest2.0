import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { requireCsrfToken } from '../lib/security';
import {
  confirmAiAction, countActionablePendingActions, listAiActionHistory, listAiActionQueue, previewAiAction,
  type AiActionContext, type AiActionError, type AiActionQueueFilters,
} from '../services/aiActionService';
import { isActionType } from '../lib/aiContract';
import { caller } from './scope';

/**
 * AI-8: human-approved controlled actions. Web-session authenticated (the signed-in owner only). Preview is a read;
 * execute is a separate, CSRF-protected POST that re-reads and re-validates everything server-side. These routes are
 * NOT exposed through MCP: a provider can only PROPOSE (jobquest_submit_ai_result); a person approves here.
 */
export const aiActions = new Hono();

type ApiStatus = 400 | 401 | 403 | 404 | 409 | 422 | 500 | 503;
const STATUS: Record<string, ApiStatus> = {
  ACTION_UNAUTHORIZED: 403, ACTION_TARGET_NOT_FOUND: 404, ACTION_STALE: 409, ACTION_AMBIGUOUS: 409, ACTION_ALREADY_EXECUTED: 409,
  ACTION_CONFLICT: 409, ACTION_VALIDATION_FAILED: 422, ACTION_NOT_SUPPORTED: 422, ACTION_EXECUTION_FAILED: 500, AI_HUB_DISABLED: 503,
  INVALID_CONTEXT: 400, READ_FAILED: 500,
};
const fail = (c: Context, e: AiActionError) => c.json({ error: { code: e.code, message: e.message, ...(e.existing ? { existing: e.existing } : {}) } }, STATUS[e.code] ?? 500);
const unauth = (c: Context) => c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, 401);

const workspaceQuery = z.object({ workspace_id: z.uuid() });
const executeBody = z.strictObject({
  workspace_id: z.uuid(),
  suggestion_id: z.uuid(),
  expected_fingerprint: z.string().min(8).max(128),
  decision: z.enum(['create_new', 'use_existing', 'no_application']).optional(),
  application_id: z.uuid().nullable().optional(),
  confirm_duplicate: z.boolean().optional(),
  edits: z.strictObject({
    title: z.string().max(400).optional(),
    details: z.string().max(2000).nullable().optional(),
    due_date: z.string().max(10).nullable().optional(),
    priority: z.string().max(16).optional(),
  }).optional(),
});

async function context(c: Context, workspaceId: string): Promise<AiActionContext | null> {
  const actor = await caller(c);
  if (!actor) return null;
  return { workspaceId, userId: actor.userId, accessToken: actor.token };
}

aiActions.get('/queue', async (c) => {
  const q = workspaceQuery.safeParse({ workspace_id: c.req.query('workspace_id') });
  if (!q.success) return fail(c, { code: 'INVALID_CONTEXT', message: 'A workspace is required.' });
  const ctx = await context(c, q.data.workspace_id);
  if (!ctx) return unauth(c);
  const action = c.req.query('action');
  if (action !== undefined && !isActionType(action)) return fail(c, { code: 'ACTION_VALIDATION_FAILED', message: 'Invalid action filter.' });
  const filters: AiActionQueueFilters = {
    ...(action ? { action } : {}), ...(c.req.query('provider') ? { provider: c.req.query('provider')! } : {}), ...(c.req.query('kind') ? { kind: c.req.query('kind')! } : {}),
    ...(c.req.query('date_from') ? { dateFrom: c.req.query('date_from')! } : {}), ...(c.req.query('date_to') ? { dateTo: c.req.query('date_to')! } : {}),
  };
  const out = await listAiActionQueue(ctx, filters, Number(c.req.query('page') ?? 0));
  return out.ok ? c.json(out.data) : fail(c, out.error);
});

/** The canonical actionable-pending count (same definition as the queue). Drives the Overview card and the Daily Digest line. */
aiActions.get('/count', async (c) => {
  const q = workspaceQuery.safeParse({ workspace_id: c.req.query('workspace_id') });
  if (!q.success) return fail(c, { code: 'INVALID_CONTEXT', message: 'A workspace is required.' });
  const ctx = await context(c, q.data.workspace_id);
  if (!ctx) return unauth(c);
  const out = await countActionablePendingActions(ctx);
  return out.ok ? c.json(out.data) : fail(c, out.error);
});

aiActions.get('/history', async (c) => {
  const q = workspaceQuery.safeParse({ workspace_id: c.req.query('workspace_id') });
  if (!q.success) return fail(c, { code: 'INVALID_CONTEXT', message: 'A workspace is required.' });
  const ctx = await context(c, q.data.workspace_id);
  if (!ctx) return unauth(c);
  const out = await listAiActionHistory(ctx, Number(c.req.query('page') ?? 0));
  return out.ok ? c.json(out.data) : fail(c, out.error);
});

aiActions.get('/preview', async (c) => {
  const q = workspaceQuery.extend({ suggestion_id: z.uuid() }).safeParse({ workspace_id: c.req.query('workspace_id'), suggestion_id: c.req.query('suggestion_id') });
  if (!q.success) return fail(c, { code: 'INVALID_CONTEXT', message: 'A workspace and suggestion are required.' });
  const ctx = await context(c, q.data.workspace_id);
  if (!ctx) return unauth(c);
  const out = await previewAiAction(ctx, q.data.suggestion_id);
  return out.ok ? c.json(out.data) : fail(c, out.error);
});

aiActions.post('/execute', requireCsrfToken, async (c) => {
  const parsed = executeBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, { code: 'ACTION_VALIDATION_FAILED', message: 'The confirmation request is not valid.' });
  const b = parsed.data;
  const ctx = await context(c, b.workspace_id);
  if (!ctx) return unauth(c);
  const out = await confirmAiAction(ctx, b.suggestion_id, {
    expectedFingerprint: b.expected_fingerprint,
    ...(b.decision ? { decision: b.decision } : {}),
    ...(b.application_id !== undefined ? { applicationId: b.application_id } : {}),
    ...(b.confirm_duplicate !== undefined ? { confirmDuplicate: b.confirm_duplicate } : {}),
    ...(b.edits ? { edits: { ...(b.edits.title !== undefined ? { title: b.edits.title } : {}), ...(b.edits.details !== undefined ? { details: b.edits.details } : {}), ...(b.edits.due_date !== undefined ? { dueDate: b.edits.due_date } : {}), ...(b.edits.priority !== undefined ? { priority: b.edits.priority } : {}) } } : {}),
  });
  return out.ok ? c.json(out.data, 200) : fail(c, out.error);
});
