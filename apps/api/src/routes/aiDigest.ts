import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { isAiHubServerEnabled } from '../lib/aiHubConfig';
import { requireCsrfToken } from '../lib/security';
import { generateSystemDigest } from '../services/aiDigestService';
import { buildWeeklyDigest } from '../services/aiWeeklyDigestService';
import { caller } from './scope';

/**
 * AI-5: JobQuest-generated Daily Digest. Web-session authenticated (the signed-in
 * owner only) and CSRF-protected. It computes the owner's deterministic facts for
 * TODAY (owner profile time zone) and stores them as a provider='system' digest via
 * the approved ingestion service. There is no date parameter: past snapshots cannot
 * be reconstructed. External providers submit their own digests through MCP.
 */
export const aiDigest = new Hono();

type ApiStatus = 400 | 401 | 403 | 422 | 500 | 503;
const fail = (c: Context, status: ApiStatus, code: string, message: string) => c.json({ error: { code, message } }, status);
const bodySchema = z.strictObject({ workspace_id: z.uuid() });

aiDigest.post('/generate', requireCsrfToken, async (c) => {
  const actor = await caller(c);
  if (!actor) return fail(c, 401, 'UNAUTHENTICATED', 'Sign in required.');
  if (!isAiHubServerEnabled()) return fail(c, 503, 'AI_HUB_DISABLED', 'AI Hub is disabled on this server.');
  const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, 'INVALID_INPUT', 'A workspace is required.');

  const out = await generateSystemDigest({ workspaceId: parsed.data.workspace_id, userId: actor.userId, accessToken: actor.token });
  if (!out.ok) return fail(c, out.error.code === 'READ_FAILED' ? 500 : 400, out.error.code, out.error.message);
  const r = out.data.ingest;
  if (!r.success) {
    const denied = r.errors.some((e) => e.dbCode === 'WORKSPACE_ACCESS_DENIED');
    return denied ? fail(c, 403, 'WORKSPACE_ACCESS_DENIED', 'Workspace access denied.') : fail(c, 500, 'DIGEST_GENERATE_FAILED', 'Could not store the digest.');
  }
  return c.json({ digest_date: out.data.digestDate, time_zone: out.data.timeZone, run_id: r.runId, duplicate: r.duplicateRun, counts: r.counts }, 200);
});

/**
 * AI-11H: Weekly Digest. GET, read-only, owner session. The week is the owner's profile-time-zone week (their week-start setting);
 * `week_start` is optional (default: the current week) and must be the first day of one of their weeks, 0..26 weeks back. Nothing is
 * stored: the report is rebuilt from the owner's records on every request (see aiWeeklyDigestService for the semantics).
 */
const weeklyQuery = z.strictObject({ workspace_id: z.uuid(), week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
aiDigest.get('/weekly', async (c) => {
  const actor = await caller(c);
  if (!actor) return fail(c, 401, 'UNAUTHENTICATED', 'Sign in required.');
  if (!isAiHubServerEnabled()) return fail(c, 503, 'AI_HUB_DISABLED', 'AI Hub is disabled on this server.');
  const q = weeklyQuery.safeParse({ workspace_id: c.req.query('workspace_id'), week_start: c.req.query('week_start') });
  if (!q.success) return fail(c, 422, 'INVALID_INPUT', 'A workspace and, optionally, a week start date are required.');
  const out = await buildWeeklyDigest({ workspaceId: q.data.workspace_id, userId: actor.userId, accessToken: actor.token }, { weekStart: q.data.week_start });
  if (!out.ok) return fail(c, out.error.code === 'READ_FAILED' ? 500 : out.error.code === 'INVALID_WEEK' ? 422 : out.error.code === 'WORKSPACE_ACCESS_DENIED' ? 403 : 400, out.error.code, out.error.message);
  return c.json(out.data, 200);
});
