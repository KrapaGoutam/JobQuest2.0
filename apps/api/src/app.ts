import { Hono } from 'hono';
import { auth } from './routes/auth';
import { workflow } from './routes/workflow';
import { imports } from './routes/imports';
import { exportsRoute } from './routes/exports';
import { requireSameOriginJson, securityHeaders } from './lib/security';

/** JobQuest Node API (M1B, Auth Option B). Same origin as the SPA, mounted at /api. */
export const app = new Hono().basePath('/api');

app.use('*', securityHeaders);
app.use('*', requireSameOriginJson);

app.get('/health', (c) => c.json({ status: 'ok' }));
app.route('/auth', auth);
app.route('/workflow', workflow);
app.route('/import', imports);
app.route('/exports', exportsRoute);

app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404));
app.onError((err, c) => {
  console.error('Unhandled API error', err?.name); // never log bodies, passwords or tokens
  return c.json({ error: { code: 'INTERNAL', message: 'Internal error.' } }, 500);
});
