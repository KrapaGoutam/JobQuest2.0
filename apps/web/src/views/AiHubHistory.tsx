import { useEffect, useState } from 'react';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { fetchAiRunsPage } from '../api/aiHub';
import {
  AI_PROVIDER_VALUES, AI_RUN_STATUS_VALUES, AI_WORKFLOW_VALUES, DEFAULT_RUN_FILTERS, aiErrorCategoryLabel,
  aiProviderLabel, aiRunStatusLabel, aiRunStatusVariant, aiWorkflowLabel, runCountEntries, runDurationLabel,
  type AiRunFilters, type AiRunRow,
} from '../lib/aiHub';
import { Card, CardBody } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { fmtTime } from './AiHubDetails';

export type HistoryState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: AiRunRow[]; hasNext: boolean };

const FILTERS: Array<{ key: keyof AiRunFilters; label: string; all: string; options: Array<[string, string]> }> = [
  { key: 'status', label: 'Status', all: 'All statuses', options: AI_RUN_STATUS_VALUES.map((v) => [v, aiRunStatusLabel(v)]) },
  { key: 'provider', label: 'Provider', all: 'All providers', options: AI_PROVIDER_VALUES.map((v) => [v, aiProviderLabel(v)]) },
  { key: 'workflow', label: 'Workflow', all: 'All workflows', options: AI_WORKFLOW_VALUES.map((v) => [v, aiWorkflowLabel(v)]) },
];

function RunRow({ run, onOpen }: { run: AiRunRow; onOpen?: (run: AiRunRow) => void }) {
  const duration = runDurationLabel(run);
  const results = runCountEntries(run.counts).find(([k]) => /finding|result|item/.test(k));
  return (
    <li style={{ padding: '10px 0', borderBottom: '1px solid var(--color-border)', display: 'grid', gap: '4px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <StatusBadge variant={aiRunStatusVariant(run.status)}>{aiRunStatusLabel(run.status)}</StatusBadge>
        {onOpen ? (
          <button
            type="button"
            onClick={() => onOpen(run)}
            style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline' }}
            aria-label={`View run details: ${aiWorkflowLabel(run.workflow)}, ${aiRunStatusLabel(run.status)}`}
          >
            {aiWorkflowLabel(run.workflow)}
          </button>
        ) : <span>{aiWorkflowLabel(run.workflow)}</span>}
        <span className="muted small">{aiProviderLabel(run.provider)}</span>
      </div>
      <div className="muted small">
        {fmtTime(run.started_at ?? run.created_at)}
        {duration ? ` · ${duration}` : ''}
        {results ? ` · ${results[1]} ${results[0].replace(/_/g, ' ')}` : ''}
        {run.error_category ? ` · ${aiErrorCategoryLabel(run.error_category)}` : ''}
      </div>
    </li>
  );
}

/** Presentational (no fetching): filters, run list, pagination. */
export function AiHubHistoryPanel({
  state, filters, page, onFiltersChange, onPageChange, onOpenRun, onRetry,
}: {
  state: HistoryState; filters: AiRunFilters; page: number;
  onFiltersChange: (f: AiRunFilters) => void; onPageChange: (p: number) => void;
  onOpenRun?: (run: AiRunRow) => void; onRetry?: () => void;
}) {
  const filtered = FILTERS.some((f) => filters[f.key] !== 'ALL');
  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      <div role="group" aria-label="History filters" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <label key={f.key} className="small" style={{ display: 'grid', gap: '2px', minWidth: '150px', flex: '1 1 150px' }}>
            <span className="muted">{f.label}</span>
            <Select
              value={filters[f.key]}
              onChange={(e) => onFiltersChange({ ...filters, [f.key]: e.target.value })}
            >
              <option value="ALL">{f.all}</option>
              {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </label>
        ))}
      </div>
      {state.status === 'loading' && (
        <div role="status" aria-live="polite" aria-label="Loading AI run history" style={{ display: 'grid', gap: '10px' }}>
          <Skeleton height={48} /><Skeleton height={48} />
        </div>
      )}
      {state.status === 'error' && (
        <div role="alert">
          <EmptyState
            icon={<AlertTriangle size={22} />}
            title="AI run history could not be loaded."
            description="The rest of AI Hub and your JobQuest data are unaffected."
            action={onRetry ? <Button variant="secondary" onClick={onRetry}>Try again</Button> : undefined}
          />
        </div>
      )}
      {state.status === 'ready' && state.rows.length === 0 && (
        <EmptyState
          icon={<Sparkles size={22} />}
          title={filtered || page > 0 ? 'No runs match these filters' : 'No AI runs yet'}
          description={filtered || page > 0 ? 'Try clearing a filter.' : 'Completed and failed AI runs will be listed here.'}
          action={filtered ? <Button variant="secondary" onClick={() => onFiltersChange(DEFAULT_RUN_FILTERS)}>Clear filters</Button> : undefined}
        />
      )}
      {state.status === 'ready' && state.rows.length > 0 && (
        <Card>
          <CardBody>
            <ul aria-label="AI run history" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {state.rows.map((r) => <RunRow key={r.id} run={r} onOpen={onOpenRun} />)}
            </ul>
          </CardBody>
        </Card>
      )}
      {state.status === 'ready' && (page > 0 || state.hasNext) && (
        <nav aria-label="History pagination" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Button variant="secondary" disabled={page === 0} onClick={() => onPageChange(page - 1)}>Previous</Button>
          <span className="muted small" aria-live="polite">Page {page + 1}</span>
          <Button variant="secondary" disabled={!state.hasNext} onClick={() => onPageChange(page + 1)}>Next</Button>
        </nav>
      )}
    </div>
  );
}

/** Container: owns filters/page and its own failure state, isolated from Overview. */
export function AiHubHistory({ activeWorkspaceId, onOpenRun }: { activeWorkspaceId: string | null; onOpenRun: (run: AiRunRow) => void }) {
  const [filters, setFilters] = useState<AiRunFilters>(DEFAULT_RUN_FILTERS);
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<HistoryState>({ status: 'loading' });
  useEffect(() => {
    if (!activeWorkspaceId) return undefined;
    let cancelled = false;
    setState({ status: 'loading' });
    fetchAiRunsPage(activeWorkspaceId, filters, page).then(
      (r) => { if (!cancelled) setState({ status: 'ready', ...r }); },
      () => { if (!cancelled) setState({ status: 'error' }); },
    );
    return () => { cancelled = true; };
  }, [activeWorkspaceId, filters, page, attempt]);
  return (
    <AiHubHistoryPanel
      state={state}
      filters={filters}
      page={page}
      onFiltersChange={(f) => { setFilters(f); setPage(0); }}
      onPageChange={setPage}
      onOpenRun={onOpenRun}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );
}
