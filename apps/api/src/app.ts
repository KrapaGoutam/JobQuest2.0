import { Hono } from 'hono';
import { auth } from './routes/auth';
import { workflow } from './routes/workflow';
import { blockAliasLeaks, requireSameOriginJson, securityHeaders } from './lib/security';

/** JobQuest Node façade (M1). Same origin as the SPA, mounted at /api. */
export const app = new Hono().basePath('/api');

app.use('*', securityHeaders);
app.use('*', blockAliasLeaks);
app.use('*', requireSameOriginJson);

app.get('/health', (c) => c.json({ status: 'ok' }));
app.route('/auth', auth);
app.route('/workflow', workflow);

app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404));
app.onError((err, c) => {
  console.error('Unhandled API error', err?.name); // never log bodies, passwords or tokens
  return c.json({ error: { code: 'INTERNAL', message: 'Internal error.' } }, 500);
});
