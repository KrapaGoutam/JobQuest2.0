import { AlertTriangle } from 'lucide-react';
import {
  aiErrorCategoryLabel, aiFindingKindLabel, aiFindingStatusLabel, aiPriorityLabel, aiProviderLabel,
  aiRunStatusLabel, aiRunStatusVariant, aiTriggerLabel, aiWorkflowLabel, allowlistedPayloadItems,
  findingSourceUrl, formatConfidence, runCountEntries, runDurationLabel,
  type AiFindingDetailRow, type AiFindingRow, type AiRunDetailRow,
} from '../lib/aiHub';
import { Dialog } from '../components/ui/Dialog';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';

// All values below come from the database and may originate from an external AI
// provider: they are rendered as React text children only (escaped), never as HTML.

export const fmtTime = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
};

export type DetailState<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

const priorityVariant = (p: string): 'danger' | 'warning' | 'muted' =>
  p === 'CRITICAL' ? 'danger' : p === 'HIGH' ? 'warning' : 'muted';

export function FindingList({ findings, onOpen }: { findings: AiFindingRow[]; onOpen?: (id: string) => void }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '10px' }}>
      {findings.map((f) => {
        const conf = formatConfidence(f.confidence);
        return (
          <li key={f.id} style={{ display: 'grid', gap: '2px' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <StatusBadge variant={priorityVariant(f.priority)}>{aiPriorityLabel(f.priority)}</StatusBadge>
              <span className="muted small">{aiFindingKindLabel(f.kind)}</span>
              {conf && <span className="muted small">{conf} confidence</span>}
            </div>
            {onOpen ? (
              <button
                type="button"
                onClick={() => onOpen(f.id)}
                style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline', overflowWrap: 'anywhere' }}
                aria-label={`View finding: ${f.title}`}
              >
                {f.title}
              </button>
            ) : <div style={{ overflowWrap: 'anywhere' }}>{f.title}</div>}
            {f.summary && <div className="muted small" style={{ overflowWrap: 'anywhere' }}>{f.summary}</div>}
            <div className="muted small">
              {aiProviderLabel(f.provider)} · {aiFindingStatusLabel(f.status)} · {fmtTime(f.occurred_at ?? f.created_at)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Fields({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, auto) 1fr', gap: '6px 12px', margin: 0 }}>
      {rows.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt className="muted small">{k}</dt>
          <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const ExternalLink = ({ href }: { href: string }) => (
  <a href={href} target="_blank" rel="noopener noreferrer">{href}</a>
);

export function FindingDetailBody({ finding }: { finding: AiFindingDetailRow }) {
  const payload = allowlistedPayloadItems(finding.kind, finding.payload);
  const source = findingSourceUrl(finding.source_ref);
  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <Fields
        rows={[
          ['Type', aiFindingKindLabel(finding.kind)],
          ['Status', aiFindingStatusLabel(finding.status)],
          ['Priority', aiPriorityLabel(finding.priority)],
          ['Confidence', formatConfidence(finding.confidence)],
          ['Provider', aiProviderLabel(finding.provider)],
          ['Occurred', fmtTime(finding.occurred_at)],
          ['Due', fmtTime(finding.due_at)],
          ['Created', fmtTime(finding.created_at)],
          ['Related application', finding.application_id ? 'Linked to an application' : ''],
          ['Source', source ? <ExternalLink href={source} /> : ''],
        ]}
      />
      {finding.summary && <p style={{ margin: 0, overflowWrap: 'anywhere' }}>{finding.summary}</p>}
      {finding.evidence && (
        <blockquote className="muted small" style={{ margin: 0, paddingLeft: '10px', borderLeft: '2px solid var(--color-border)', overflowWrap: 'anywhere' }}>
          {finding.evidence}
        </blockquote>
      )}
      {payload.length > 0 && (
        <Fields
          rows={payload.map((p): [string, React.ReactNode] => [
            p.label,
            p.items ? <ul style={{ margin: 0, paddingLeft: '18px' }}>{p.items.map((t, i) => <li key={i}>{t}</li>)}</ul>
              : p.href ? <ExternalLink href={p.href} /> : p.text,
          ])}
        />
      )}
    </div>
  );
}

export function RunDetailBody({
  run, findings, onOpenFinding,
}: { run: AiRunDetailRow; findings: AiFindingRow[]; onOpenFinding?: (id: string) => void }) {
  const counts = runCountEntries(run.counts);
  const sources = Array.isArray(run.sources) ? run.sources.filter((s): s is string => typeof s === 'string') : [];
  const duration = runDurationLabel(run);
  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <Fields
        rows={[
          ['Status', <StatusBadge key="s" variant={aiRunStatusVariant(run.status)}>{aiRunStatusLabel(run.status)}</StatusBadge>],
          ['Workflow', aiWorkflowLabel(run.workflow)],
          ['Provider', aiProviderLabel(run.provider)],
          ['Trigger', aiTriggerLabel(run.trigger_type)],
          ['Schema version', run.schema_version],
          ['Started', fmtTime(run.started_at)],
          ['Completed', fmtTime(run.completed_at)],
          ['Duration', duration],
          ['Error category', run.error_category ? aiErrorCategoryLabel(run.error_category) : ''],
          ['Counts', counts.length ? counts.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ') : ''],
          ['Sources', sources.length ? sources.join(', ') : ''],
          ['Findings', String(findings.length)],
        ]}
      />
      {findings.length > 0 && <FindingList findings={findings} onOpen={onOpenFinding} />}
    </div>
  );
}

function DetailStateBody<T>({ state, onRetry, children }: { state: DetailState<T>; onRetry?: () => void; children: (d: T) => React.ReactNode }) {
  if (state.status === 'loading') {
    return <div role="status" aria-label="Loading details"><Skeleton height={16} width="50%" /><Skeleton height={48} /></div>;
  }
  if (state.status === 'error') {
    return (
      <div role="alert" style={{ display: 'grid', gap: '8px' }}>
        <span><AlertTriangle size={16} aria-hidden="true" /> Details could not be loaded.</span>
        {onRetry && <div><Button variant="secondary" onClick={onRetry}>Try again</Button></div>}
      </div>
    );
  }
  return <>{children(state.data)}</>;
}

export function RunDetailDialog({
  state, onClose, onRetry, onOpenFinding,
}: {
  state: DetailState<{ run: AiRunDetailRow; findings: AiFindingRow[] }>;
  onClose: () => void; onRetry?: () => void; onOpenFinding?: (id: string) => void;
}) {
  return (
    <Dialog isOpen onClose={onClose} title="Run details" maxWidth={560}>
      <DetailStateBody state={state} onRetry={onRetry}>
        {(d) => <RunDetailBody run={d.run} findings={d.findings} onOpenFinding={onOpenFinding} />}
      </DetailStateBody>
    </Dialog>
  );
}

export function FindingDetailDialog({
  state, onClose, onRetry,
}: { state: DetailState<AiFindingDetailRow>; onClose: () => void; onRetry?: () => void }) {
  return (
    <Dialog isOpen onClose={onClose} title={state.status === 'ready' ? state.data.title : 'Finding details'} maxWidth={560}>
      <DetailStateBody state={state} onRetry={onRetry}>
        {(f) => <FindingDetailBody finding={f} />}
      </DetailStateBody>
    </Dialog>
  );
}
