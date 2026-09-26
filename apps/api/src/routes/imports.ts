import { Hono } from 'hono';
import { buildPreview, MAX_IMPORT_BYTES, parseImport, suggestedField, type ImportFormat, type PreviewRow } from '../services/import';
import { csvEscape } from '../services/export';
import { caller, resolveOwnerScope, routeError } from './scope';

export const imports = new Hono();

interface ImportRequest {
  workspace_id?: string;
  owner_id?: string;
  format?: ImportFormat;
  content?: string;
  mapping?: Record<string, string | null>;
  import_mode?: 'VALID_ROWS_ONLY' | 'ALL_OR_NOTHING';
  duplicate_action?: 'SKIP' | 'IMPORT_ANYWAY' | 'UPDATE_EXISTING';
  row_actions?: Record<string, 'SKIP' | 'IMPORT_ANYWAY' | 'UPDATE_EXISTING'>;
}

async function prepare(c: Parameters<typeof caller>[0], request: ImportRequest) {
  const auth = await caller(c);
  if (!auth) throw Object.assign(new Error('Sign in required.'), { status: 401 });
  if (!request.workspace_id || !request.format || typeof request.content !== 'string') throw new Error('workspace_id, format, and content are required.');
  if (!['CSV', 'XLSX', 'JSON', 'STRUCTURED_TEXT'].includes(request.format)) throw new Error('Unsupported import format.');
  if (Buffer.byteLength(request.content, request.format === 'XLSX' ? 'base64' : 'utf8') > MAX_IMPORT_BYTES) throw new Error('Import input exceeds the 5 MB limit.');
  const scope = await resolveOwnerScope(auth.client, auth.userId, request.workspace_id, request.owner_id);
  if (!scope.ownerId) throw new Error('An individual owner is required for imports.');
  const parsed = await parseImport(request.format, request.content);
  const { data: existing, error } = await auth.client
    .from('applications')
    .select('id, company_name, role_title, applied_at, job_url')
    .eq('workspace_id', request.workspace_id)
    .eq('user_id', scope.ownerId);
  if (error) throw new Error(error.message);
  const rows = buildPreview(parsed, request.mapping, existing ?? []);
  return { auth, scope, parsed, rows };
}

imports.post('/preview', async (c) => {
  try {
    const request = await c.req.json<ImportRequest>();
    const { parsed, rows } = await prepare(c, request);
    const suggested_mapping = Object.fromEntries(parsed.headers.map((header) => {
      try { return [header, suggestedField(header)]; }
      catch (error) { return [header, null, (error as Error).message]; }
    }).map((entry) => [entry[0], entry[1]]));
    const counts = rows.reduce((sum, row) => ({
      valid: sum.valid + (row.validation_status === 'VALID' ? 1 : 0),
      warning: sum.warning + (row.validation_status === 'WARNING' ? 1 : 0),
      invalid: sum.invalid + (row.validation_status === 'INVALID' ? 1 : 0),
      duplicate: sum.duplicate + (row.validation_status === 'DUPLICATE' ? 1 : 0),
    }), { valid: 0, warning: 0, invalid: 0, duplicate: 0 });
    return c.json({ headers: parsed.headers, suggested_mapping, rows, counts, total_rows: rows.length });
  } catch (error) {
    if (typeof error === 'object' && error && 'status' in error && (error as { status: number }).status === 401) {
      return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, 401);
    }
    return routeError(c, error);
  }
});

imports.post('/', async (c) => {
  try {
    const request = await c.req.json<ImportRequest>();
    if (!request.import_mode || !['VALID_ROWS_ONLY', 'ALL_OR_NOTHING'].includes(request.import_mode)) throw new Error('Choose a valid import mode.');
    if (!request.duplicate_action || !['SKIP', 'IMPORT_ANYWAY', 'UPDATE_EXISTING'].includes(request.duplicate_action)) throw new Error('Choose a valid duplicate action.');
    const { auth, scope, rows } = await prepare(c, request);
    const committedRows = rows.map((row) => ({
      ...row,
      duplicate_action: request.row_actions?.[String(row.row_number)] ?? request.duplicate_action,
    } satisfies PreviewRow));
    const { data, error } = await auth.client.rpc('rpc_commit_import', {
      p_workspace_id: request.workspace_id,
      p_owner_id: scope.ownerId,
      p_input_format: request.format,
      p_import_mode: request.import_mode,
      p_duplicate_action: request.duplicate_action,
      p_rows: committedRows,
    });
    if (error) throw new Error(error.message);
    return c.json({ result: data }, 201);
  } catch (error) {
    if (typeof error === 'object' && error && 'status' in error && (error as { status: number }).status === 401) {
      return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, 401);
    }
    return routeError(c, error);
  }
});

imports.get('/history', async (c) => {
  try {
    const auth = await caller(c);
    if (!auth) return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, 401);
    const workspaceId = c.req.query('workspace_id');
    if (!workspaceId) throw new Error('workspace_id is required.');
    const scope = await resolveOwnerScope(auth.client, auth.userId, workspaceId, c.req.query('owner_id'));
    let query = auth.client.from('import_batches').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(50);
    if (scope.ownerId) query = query.eq('user_id', scope.ownerId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return c.json({ batches: data ?? [] });
  } catch (error) { return routeError(c, error); }
});

imports.get('/history/:id/rows', async (c) => {
  try {
    const auth = await caller(c);
    if (!auth) return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, 401);
    const { data, error } = await auth.client.from('import_rows').select('*').eq('batch_id', c.req.param('id')).order('row_number');
    if (error) throw new Error(error.message);
    return c.json({ rows: data ?? [] });
  } catch (error) { return routeError(c, error); }
});

imports.get('/history/:id/errors.csv', async (c) => {
  try {
    const auth = await caller(c);
    if (!auth) return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }, 401);
    const { data, error } = await auth.client.from('import_rows').select('row_number, validation_status, outcome, messages, row_summary').eq('batch_id', c.req.param('id')).in('validation_status', ['INVALID', 'WARNING']).order('row_number');
    if (error) throw new Error(error.message);
    interface ImportRowSummary {
      company?: string;
      job_title?: string;
      date_applied?: string;
    }
    interface ImportRowErrorRecord {
      row_number: number;
      validation_status: string;
      outcome: string;
      messages?: string | null;
      row_summary?: ImportRowSummary | null;
    }
    const lines = [
      ['row_number', 'validation_status', 'outcome', 'company', 'job_title', 'date_applied', 'messages'].map(csvEscape).join(','),
      ...((data ?? []) as unknown as ImportRowErrorRecord[]).map((row) => [row.row_number, row.validation_status, row.outcome, row.row_summary?.company, row.row_summary?.job_title, row.row_summary?.date_applied, row.messages].map(csvEscape).join(',')),
    ];
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="import-${c.req.param('id')}-errors.csv"`);
    return c.body(`\ufeff${lines.join('\r\n')}`);
  } catch (error) { return routeError(c, error); }
});
