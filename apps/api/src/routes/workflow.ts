import { Hono } from 'hono';
import { bearer } from '../lib/security';
import { userClient } from '../lib/supabase';

/**
 * Canonical workflow for non-browser clients (future extension, imports).
 * Reads through RLS AS the caller — the façade adds no privilege here.
 */
export const workflow = new Hono();

workflow.get('/', async (c) => {
  const token = bearer(c);
  if (!token) return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, 401);
  const { data, error } = await userClient(token)
    .from('workflow_definitions')
    .select('id, version, is_default, stages, outcomes, closure_reasons')
    .is('workspace_id', null)
    .maybeSingle();
  if (error) return c.json({ error: { code: 'INTERNAL', message: 'Could not load workflow.' } }, 500);
  if (!data) return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, 401);
  return c.json({ workflow: data });
});
