import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Download, FileSpreadsheet, History, Upload } from 'lucide-react';
import type { PublicSession } from '../api';
import { fetchWorkspaceMembers, type WorkspaceMemberInfo } from '../api/applications';
import {
  commitImport, downloadExport, fetchImportHistory, fetchImportRows, fileContent, previewImport,
  type DuplicateAction, type ImportBatch, type ImportFormat, type ImportHistoryRow,
  type ImportMode, type ImportPreview, type ImportResult,
} from '../api/importExport';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';

const IMPORT_FIELDS = [
  'company', 'job_title', 'job_url', 'location', 'work_arrangement', 'employment_type',
  'date_applied', 'source', 'stage', 'priority', 'salary_min', 'salary_max',
  'salary_currency', 'salary_range', 'resume_version', 'cover_letter_version',
  'recruiter_name', 'recruiter_email', 'recruiter_phone', 'job_description', 'notes',
  'next_action', 'next_action_date', 'last_response_date', 'external_job_id', 'tags',
  'pinned', 'important', 'favorite',
];
const CSV_EXPORTS = [
  ['applications', 'Applications'], ['interviews', 'Interviews'], ['rejections', 'Rejections'],
  ['follow_ups', 'Follow-ups'], ['networking', 'Networking'], ['reminders', 'Reminders'],
  ['goals', 'Goals'], ['tasks', 'Tasks'], ['habits', 'Habits'], ['notes', 'Notes'],
  ['resume-analytics', 'Resume analytics'], ['aging', 'Aging report'], ['stage-duration', 'Stage duration'],
] as const;

interface ImportExportViewProps {
  activeWorkspaceId: string | null;
  currentUserId: string;
  isManager: boolean;
  session: PublicSession;
}

function StatusPill({ status }: { status: string }) {
  const danger = status === 'INVALID' || status === 'REJECTED';
  const warning = status === 'WARNING' || status === 'DUPLICATE' || status === 'NOT_COMMITTED';
  return <span className={`m10-pill ${danger ? 'danger' : warning ? 'warning' : 'success'}`}>{status.replaceAll('_', ' ')}</span>;
}

export function ImportExportView({ activeWorkspaceId, currentUserId, isManager, session }: ImportExportViewProps) {
  const [step, setStep] = useState(1);
  const [format, setFormat] = useState<ImportFormat>('CSV');
  const [content, setContent] = useState('');
  const [filename, setFilename] = useState('');
  const [ownerId, setOwnerId] = useState(currentUserId);
  const [exportOwnerId, setExportOwnerId] = useState(isManager ? 'ALL' : currentUserId);
  const [members, setMembers] = useState<WorkspaceMemberInfo[]>([]);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mode, setMode] = useState<ImportMode>('VALID_ROWS_ONLY');
  const [duplicateAction, setDuplicateAction] = useState<DuplicateAction>('SKIP');
  const [rowActions, setRowActions] = useState<Record<string, DuplicateAction>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [history, setHistory] = useState<ImportBatch[]>([]);
  const [historyRows, setHistoryRows] = useState<Record<string, ImportHistoryRow[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!activeWorkspaceId) return;
    try { setHistory(await fetchImportHistory(activeWorkspaceId, isManager ? 'ALL' : currentUserId, session)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load import history.'); }
  }, [activeWorkspaceId, currentUserId, isManager, session]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    void fetchWorkspaceMembers(activeWorkspaceId).then(setMembers).catch(() => setMembers([]));
    void loadHistory();
  }, [activeWorkspaceId, loadHistory]);

  const source = useMemo(() => activeWorkspaceId ? {
    workspace_id: activeWorkspaceId, owner_id: ownerId, format, content, mapping,
  } : null, [activeWorkspaceId, ownerId, format, content, mapping]);

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const nextFormat: ImportFormat = file.name.toLowerCase().endsWith('.xlsx') ? 'XLSX'
      : file.name.toLowerCase().endsWith('.json') ? 'JSON' : 'CSV';
    setFormat(nextFormat);
    setFilename(file.name);
    try { setContent(await fileContent(file, nextFormat)); }
    catch { setError('Could not read the selected file.'); }
  }

  async function openMapping() {
    if (!source || !content.trim()) return setError('Choose a file or enter structured text first.');
    setBusy(true); setError(null);
    try {
      const next = await previewImport({ ...source, mapping: undefined }, session);
      setPreview(next);
      setMapping(next.suggested_mapping);
      setStep(2);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not parse import.'); }
    finally { setBusy(false); }
  }

  async function reviewRows() {
    if (!source) return;
    if (Object.values(mapping).some((field) => !field)) return setError('Every source column must map to a supported field. Unknown fields cannot be ignored.');
    if (new Set(Object.values(mapping)).size !== Object.values(mapping).length) return setError('Each target field can be mapped only once.');
    setBusy(true); setError(null);
    try { setPreview(await previewImport(source, session)); setStep(3); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not validate import.'); }
    finally { setBusy(false); }
  }

  async function commit() {
    if (!source || !preview) return;
    setBusy(true); setError(null);
    try {
      const next = await commitImport(source, session, mode, duplicateAction, rowActions);
      setResult(next); setStep(4); await loadHistory();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not commit import.'); }
    finally { setBusy(false); }
  }

  function resetWizard() {
    setStep(1); setContent(''); setFilename(''); setMapping({}); setPreview(null);
    setResult(null); setRowActions({}); setError(null);
  }

  async function download(path: string, fallback: string) {
    if (!activeWorkspaceId) return;
    setBusy(true); setError(null);
    const params = new URLSearchParams({ workspace_id: activeWorkspaceId, owner_id: exportOwnerId });
    try { await downloadExport(`${path}?${params}`, session, fallback); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not download export.'); }
    finally { setBusy(false); }
  }

  async function toggleHistory(batchId: string) {
    if (historyRows[batchId]) {
      setHistoryRows((current) => { const next = { ...current }; delete next[batchId]; return next; });
      return;
    }
    try {
      const rows = await fetchImportRows(batchId, session);
      setHistoryRows((current) => ({ ...current, [batchId]: rows }));
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load row history.'); }
  }

  if (!activeWorkspaceId) return <div role="alert">Select a workspace to use import and export.</div>;

  return (
    <div className="m10-page">
      {error && <div className="m10-alert" role="alert"><AlertTriangle size={17} /> <span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Dismiss error">×</button></div>}

      <Card>
        <CardHeader><CardTitle>Import applications</CardTitle></CardHeader>
        <CardBody>
          <ol className="m10-steps" aria-label="Import progress">
            {['Choose source', 'Map fields', 'Review rows', 'Summary'].map((label, index) => (
              <li key={label} className={step === index + 1 ? 'current' : step > index + 1 ? 'done' : ''} aria-current={step === index + 1 ? 'step' : undefined}>
                <span>{index + 1}</span>{label}
              </li>
            ))}
          </ol>

          {step === 1 && <section aria-labelledby="m10-step-1" className="m10-panel">
            <h3 id="m10-step-1">1. Choose a source</h3>
            {isManager && <label>Import for
              <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
                {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name || member.username} ({member.role.toLowerCase()})</option>)}
              </select>
            </label>}
            <div className="m10-format-grid" role="radiogroup" aria-label="Import format">
              {(['CSV', 'XLSX', 'JSON', 'STRUCTURED_TEXT'] as ImportFormat[]).map((item) => <label key={item} className={format === item ? 'selected' : ''}>
                <input type="radio" name="format" value={item} checked={format === item} onChange={() => { setFormat(item); setContent(''); setFilename(''); }} />
                <FileSpreadsheet size={18} /> {item === 'STRUCTURED_TEXT' ? 'Structured text' : item}
              </label>)}
            </div>
            {format === 'STRUCTURED_TEXT' ? <label>Records separated by <code>---</code>
              <textarea rows={10} value={content} onChange={(event) => setContent(event.target.value)} placeholder={'company: Acme\njob_title: Engineer\ndate_applied: 2026-09-26\n---'} />
            </label> : <label className="m10-drop">Choose {format} file (maximum 5 MB, 1,000 rows)
              <input type="file" accept={format === 'XLSX' ? '.xlsx' : format === 'JSON' ? '.json,application/json' : '.csv,text/csv'} onChange={(event) => void chooseFile(event.target.files?.[0])} />
              {filename && <span>{filename}</span>}
            </label>}
            <div className="m10-actions"><Button variant="primary" disabled={busy || !content} onClick={() => void openMapping()} rightIcon={<ArrowRight size={14} />}>{busy ? 'Reading…' : 'Continue to mapping'}</Button></div>
          </section>}

          {step === 2 && preview && <section aria-labelledby="m10-step-2" className="m10-panel">
            <h3 id="m10-step-2">2. Map source fields</h3>
            <p className="muted small">Aliases are mapped automatically. Ownership, workspace, credential, and unknown fields must be resolved before review.</p>
            <div className="m10-mapping">
              {preview.headers.map((header) => <label key={header}><span>{header}</span><span aria-hidden="true">→</span>
                <select aria-label={`Map ${header}`} value={mapping[header] ?? ''} onChange={(event) => setMapping((current) => ({ ...current, [header]: event.target.value || null }))}>
                  <option value="">Select field</option>
                  {IMPORT_FIELDS.map((field) => <option key={field} value={field}>{field}</option>)}
                </select>
              </label>)}
            </div>
            <div className="m10-actions"><Button variant="secondary" onClick={() => setStep(1)} leftIcon={<ArrowLeft size={14} />}>Back</Button><Button variant="primary" disabled={busy} onClick={() => void reviewRows()} rightIcon={<ArrowRight size={14} />}>{busy ? 'Validating…' : 'Review rows'}</Button></div>
          </section>}

          {step === 3 && preview && <section aria-labelledby="m10-step-3" className="m10-panel">
            <h3 id="m10-step-3">3. Review before commit</h3>
            <div className="m10-counts" aria-label="Validation counts">
              <span><b>{preview.counts.valid}</b> valid</span><span><b>{preview.counts.warning}</b> warning</span><span><b>{preview.counts.invalid}</b> invalid</span><span><b>{preview.counts.duplicate}</b> duplicate</span>
            </div>
            <div className="m10-options">
              <label>Import mode<select value={mode} onChange={(event) => setMode(event.target.value as ImportMode)}><option value="VALID_ROWS_ONLY">Import valid rows only</option><option value="ALL_OR_NOTHING">All or nothing</option></select></label>
              <label>Default duplicate action<select value={duplicateAction} onChange={(event) => setDuplicateAction(event.target.value as DuplicateAction)}><option value="SKIP">Skip</option><option value="UPDATE_EXISTING">Update existing</option><option value="IMPORT_ANYWAY">Import as new</option></select></label>
            </div>
            <div className="m10-table-wrap" tabIndex={0} role="region" aria-label="Import rows preview"><table className="m10-table"><thead><tr><th>Row</th><th>Company</th><th>Job title</th><th>Date</th><th>Status</th><th>Messages / duplicate action</th></tr></thead><tbody>
              {preview.rows.map((row) => <tr key={row.row_number}><td>{row.row_number}</td><td>{row.summary.company}</td><td>{row.summary.job_title}</td><td>{row.summary.date_applied}</td><td><StatusPill status={row.validation_status} /></td><td>{row.validation_status === 'DUPLICATE' ? <select aria-label={`Duplicate action for row ${row.row_number}`} value={rowActions[String(row.row_number)] ?? duplicateAction} onChange={(event) => setRowActions((current) => ({ ...current, [String(row.row_number)]: event.target.value as DuplicateAction }))}><option value="SKIP">Skip</option><option value="UPDATE_EXISTING">Update existing</option><option value="IMPORT_ANYWAY">Import as new</option></select> : row.messages.join('; ') || 'Ready'}</td></tr>)}
            </tbody></table></div>
            <div className="m10-actions"><Button variant="secondary" onClick={() => setStep(2)} leftIcon={<ArrowLeft size={14} />}>Back</Button><Button variant="primary" disabled={busy} onClick={() => void commit()} leftIcon={<Upload size={14} />}>{busy ? 'Importing…' : `Import ${preview.total_rows} rows`}</Button></div>
          </section>}

          {step === 4 && result && <section aria-labelledby="m10-step-4" className="m10-panel m10-summary">
            <CheckCircle2 size={34} aria-hidden="true" /><h3 id="m10-step-4">Import {result.status === 'COMPLETED' ? 'complete' : 'rejected'}</h3>
            <p>Batch <code>{result.import_batch_id}</code></p>
            <div className="m10-counts"><span><b>{result.created_rows}</b> created</span><span><b>{result.updated_rows}</b> updated</span><span><b>{result.skipped_rows}</b> skipped</span><span><b>{result.rejected_rows}</b> rejected</span></div>
            {result.rejected_rows > 0 && <Button variant="secondary" leftIcon={<Download size={14} />} onClick={() => void downloadExport(`/import/history/${result.import_batch_id}/errors.csv`, session, 'import_errors.csv')}>Download import_errors.csv</Button>}
            <Button variant="primary" onClick={resetWizard}>Start another import</Button>
          </section>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Export workspace data</CardTitle></CardHeader>
        <CardBody className="m10-panel">
          <div className="m10-export-head"><p className="muted small">CSV and XLSX cells are protected against spreadsheet-formula injection. JSON is an archive only; restore is intentionally not available.</p>{isManager && <label>Owner scope<select value={exportOwnerId} onChange={(event) => setExportOwnerId(event.target.value)}><option value="ALL">Entire workspace</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name || member.username}</option>)}</select></label>}</div>
          <div className="m10-export-grid">
            {CSV_EXPORTS.map(([type, label]) => <Button key={type} variant="secondary" disabled={busy} leftIcon={<Download size={14} />} onClick={() => void download(`/exports/${type}`, `${type}.csv`)}>{label} CSV</Button>)}
            <Button variant="secondary" disabled={busy} leftIcon={<Download size={14} />} onClick={() => void download('/exports/applications.xlsx', 'jobquest-applications.xlsx')}>Applications XLSX</Button>
            <Button variant="secondary" disabled={busy} leftIcon={<Download size={14} />} onClick={() => void download('/exports/json', 'jobquest-export.json')}>Full JSON archive</Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle><span className="m10-title-icon"><History size={17} /> Import history</span></CardTitle></CardHeader>
        <CardBody>
          {history.length === 0 ? <p className="muted">No imports have been committed in this scope.</p> : <div className="m10-history">
            {history.map((batch) => <article key={batch.id}>
              <button type="button" className="m10-history-head" onClick={() => void toggleHistory(batch.id)} aria-expanded={Boolean(historyRows[batch.id])}>
                <span><b>{batch.input_format}</b> · {new Date(batch.created_at).toLocaleString()}</span><StatusPill status={batch.status} /><span>{batch.created_rows} created · {batch.updated_rows} updated · {batch.rejected_rows} rejected</span>
              </button>
              {historyRows[batch.id] && <div className="m10-table-wrap" tabIndex={0} role="region" aria-label={`Import rows for batch ${batch.id}`}><table className="m10-table"><thead><tr><th>Row</th><th>Summary</th><th>Validation</th><th>Outcome</th><th>Messages</th></tr></thead><tbody>{historyRows[batch.id]!.map((row) => <tr key={row.id}><td>{row.row_number}</td><td>{row.row_summary.company} · {row.row_summary.job_title}</td><td><StatusPill status={row.validation_status} /></td><td>{row.outcome}</td><td>{row.messages.join('; ') || '—'}</td></tr>)}</tbody></table></div>}
            </article>)}
          </div>}
        </CardBody>
      </Card>
    </div>
  );
}
