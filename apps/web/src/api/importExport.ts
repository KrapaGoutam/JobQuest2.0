import { api, type PublicSession } from '../api';

export type ImportFormat = 'CSV' | 'XLSX' | 'JSON' | 'STRUCTURED_TEXT';
export type ImportMode = 'VALID_ROWS_ONLY' | 'ALL_OR_NOTHING';
export type DuplicateAction = 'SKIP' | 'IMPORT_ANYWAY' | 'UPDATE_EXISTING';

export interface ImportPreviewRow {
  row_number: number;
  validation_status: 'VALID' | 'WARNING' | 'INVALID' | 'DUPLICATE';
  data: Record<string, unknown>;
  summary: { company: string; job_title: string; date_applied: string };
  messages: string[];
  duplicate_id: string | null;
}

export interface ImportPreview {
  headers: string[];
  suggested_mapping: Record<string, string | null>;
  rows: ImportPreviewRow[];
  counts: { valid: number; warning: number; invalid: number; duplicate: number };
  total_rows: number;
}

export interface ImportResult {
  import_batch_id: string;
  status: 'COMPLETED' | 'REJECTED';
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  created_rows: number;
  updated_rows: number;
  skipped_rows: number;
  rejected_rows: number;
  created_application_ids: string[];
}

export interface ImportBatch extends Omit<ImportResult, 'import_batch_id' | 'created_application_ids'> {
  id: string;
  workspace_id: string;
  user_id: string;
  actor_id: string;
  input_format: ImportFormat;
  import_mode: ImportMode;
  duplicate_action: DuplicateAction;
  created_at: string;
  completed_at: string | null;
}

export interface ImportHistoryRow {
  id: string;
  row_number: number;
  validation_status: string;
  outcome: string;
  messages: string[];
  row_summary: Record<string, string>;
  application_id: string | null;
}

export interface ImportSource {
  workspace_id: string;
  owner_id: string;
  format: ImportFormat;
  content: string;
  mapping?: Record<string, string | null>;
}

function errorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const error = (data as { error?: { message?: string } }).error;
    if (error?.message) return error.message;
  }
  return fallback;
}

export async function previewImport(source: ImportSource, session: PublicSession): Promise<ImportPreview> {
  const response = await api<ImportPreview & { error?: { message: string } }>('/import/preview', source, session.access_token);
  if (response.status !== 200) throw new Error(errorMessage(response.data, 'Could not preview import.'));
  return response.data;
}

export async function commitImport(
  source: ImportSource,
  session: PublicSession,
  importMode: ImportMode,
  duplicateAction: DuplicateAction,
  rowActions: Record<string, DuplicateAction>,
): Promise<ImportResult> {
  const response = await api<{ result?: ImportResult; error?: { message: string } }>('/import', {
    ...source,
    import_mode: importMode,
    duplicate_action: duplicateAction,
    row_actions: rowActions,
  }, session.access_token);
  if (response.status !== 201 || !response.data.result) throw new Error(errorMessage(response.data, 'Could not commit import.'));
  return response.data.result;
}

export async function fetchImportHistory(workspaceId: string, ownerId: string, session: PublicSession): Promise<ImportBatch[]> {
  const params = new URLSearchParams({ workspace_id: workspaceId, owner_id: ownerId });
  const response = await api<{ batches?: ImportBatch[]; error?: { message: string } }>(`/import/history?${params}`, undefined, session.access_token);
  if (response.status !== 200) throw new Error(errorMessage(response.data, 'Could not load import history.'));
  return response.data.batches ?? [];
}

export async function fetchImportRows(batchId: string, session: PublicSession): Promise<ImportHistoryRow[]> {
  const response = await api<{ rows?: ImportHistoryRow[]; error?: { message: string } }>(`/import/history/${batchId}/rows`, undefined, session.access_token);
  if (response.status !== 200) throw new Error(errorMessage(response.data, 'Could not load import rows.'));
  return response.data.rows ?? [];
}

export async function fileContent(file: File, format: ImportFormat): Promise<string> {
  if (format !== 'XLSX') return file.text();
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export async function downloadExport(path: string, session: PublicSession, fallbackName: string): Promise<void> {
  const response = await fetch(`/api${path}`, { headers: { authorization: `Bearer ${session.access_token}` }, credentials: 'same-origin' });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(errorMessage(data, `Download failed (${response.status}).`));
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
