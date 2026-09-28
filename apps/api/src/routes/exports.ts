import { Hono } from 'hono';
import { buildApplicationsWorkbook, buildJsonArchive, CSV_EXPORT_TYPES, fetchExportRows, rowsToCsv, type CsvExportType } from '../services/export';
import { caller, resolveOwnerScope, routeError } from './scope';

export const exportsRoute = new Hono();

async function exportContext(c: Parameters<typeof caller>[0]) {
  const auth = await caller(c);
  if (!auth) throw Object.assign(new Error('Sign in required.'), { status: 401 });
  const workspaceId = c.req.query('workspace_id');
  if (!workspaceId) throw new Error('workspace_id is required.');
  const scope = await resolveOwnerScope(auth.client, auth.userId, workspaceId, c.req.query('owner_id'));
  return { auth, workspaceId, scope };
}

exportsRoute.get('/applications.xlsx', async (c) => {
  try {
    const { auth, workspaceId, scope } = await exportContext(c);
    const rows = await fetchExportRows(auth.client, workspaceId, scope.ownerId, 'applications');
    const workbook = await buildApplicationsWorkbook(rows);
    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    c.header('Content-Disposition', 'attachment; filename="jobquest-applications.xlsx"');
    return c.body(new Uint8Array(workbook));
  } catch (error) {
    if (typeof error === 'object' && error && 'status' in error && (error as { status: number }).status === 401) return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, 401);
    return routeError(c, error);
  }
});

exportsRoute.get('/json', async (c) => {
  try {
    const { auth, workspaceId, scope } = await exportContext(c);
    const archive = await buildJsonArchive(auth.client, workspaceId, scope.ownerId);
    c.header('Content-Type', 'application/json; charset=utf-8');
    c.header('Content-Disposition', 'attachment; filename="jobquest-export.json"');
    return c.body(JSON.stringify(archive, null, 2));
  } catch (error) {
    if (typeof error === 'object' && error && 'status' in error && (error as { status: number }).status === 401) return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, 401);
    return routeError(c, error);
  }
});

exportsRoute.get('/:type', async (c) => {
  try {
    const type = c.req.param('type') as CsvExportType;
    if (!CSV_EXPORT_TYPES.includes(type)) return c.json({ error: { code: 'NOT_FOUND', message: 'Unsupported export.' } }, 404);
    const { auth, workspaceId, scope } = await exportContext(c);
    const rows = await fetchExportRows(auth.client, workspaceId, scope.ownerId, type);
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="${type}.csv"`);
    return c.body(rowsToCsv(type, rows));
  } catch (error) {
    if (typeof error === 'object' && error && 'status' in error && (error as { status: number }).status === 401) return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, 401);
    return routeError(c, error);
  }
});
