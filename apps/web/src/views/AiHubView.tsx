import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { fetchAiFindingDetail, fetchAiHubSnapshot, fetchAiRunDetail } from '../api/aiHub';
import {
  RECENT_WINDOW_DAYS, aiHubPathForTab, aiProviderLabel, aiRunStatusLabel, aiRunStatusVariant,
  aiSuggestionActionLabel, aiWorkflowLabel, isAiHubEmpty,
  type AiFindingDetailRow, type AiFindingRow, type AiHubSnapshot, type AiHubTab, type AiRunDetailRow, type AiRunRow,
} from '../lib/aiHub';
import {
  FindingDetailDialog, FindingList, RunDetailDialog, fmtTime, type DetailState,
} from './AiHubDetails';
import { AiHubHistory } from './AiHubHistory';
import { Tabs, TabList, Tab, TabPanel } from '../components/ui/Tabs';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';

export type AiHubLoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; snapshot: AiHubSnapshot };

const fmt = fmtTime;

export function AiHubLoading() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading AI Hub" style={{ display: 'grid', gap: '10px' }}>
      <Skeleton height={18} width="40%" />
      <Skeleton height={64} />
      <Skeleton height={64} />
    </div>
  );
}

export function AiHubError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div role="alert">
      <EmptyState
        icon={<AlertTriangle size={22} />}
        title="AI Hub data could not be loaded."
        description="Your JobQuest applications and other features are unaffected."
        action={onRetry ? <Button variant="secondary" onClick={onRetry}>Try again</Button> : undefined}
      />
    </div>
  );
}

export function AiHubEmpty() {
  return (
    <EmptyState
      icon={<Sparkles size={22} />}
      title="AI Hub is ready"
      description="AI integrations have not been connected yet. Future AI workflows will appear here after provider setup."
    />
  );
}

const bigNumber = { fontSize: '22px', fontWeight: 700 } as const;

export function AiHubOverview({ snapshot, onOpenFinding, onOpenRun }: {
  snapshot: AiHubSnapshot; onOpenFinding?: (id: string) => void; onOpenRun?: (run: AiRunRow) => void;
}) {
  if (isAiHubEmpty(snapshot)) return <AiHubEmpty />;
  const latest = snapshot.runs[0];
  const attention = snapshot.attentionRunCount ?? 0;
  const rows = snapshot.pendingSuggestionRows ?? [];
  return (
    <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
      <Card>
        <CardHeader><CardTitle>Latest run</CardTitle></CardHeader>
        <CardBody>
          {latest ? (
            <div style={{ display: 'grid', gap: '4px' }}>
              <span><StatusBadge variant={aiRunStatusVariant(latest.status)}>{aiRunStatusLabel(latest.status)}</StatusBadge></span>
              <span>{aiWorkflowLabel(latest.workflow)} · {aiProviderLabel(latest.provider)}</span>
              <span className="muted small">
                {fmt(latest.started_at ?? latest.created_at)}
                {latest.completed_at ? ` – ${fmt(latest.completed_at)}` : ''}
              </span>
              {onOpenRun && <div><Button variant="secondary" onClick={() => onOpenRun(latest)}>View details</Button></div>}
            </div>
          ) : <span className="muted">No runs yet.</span>}
        </CardBody>
      </Card>
      <Card>
        <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
        <CardBody>
          <strong style={bigNumber}>{snapshot.recentRunCount ?? 0}</strong>
          <div className="muted small">runs in the last {RECENT_WINDOW_DAYS} days</div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader><CardTitle>Needs attention</CardTitle></CardHeader>
        <CardBody>
          <strong style={bigNumber}>{attention}</strong>
          <div className="muted small">
            {attention > 0 ? `failed or partial runs in the last ${RECENT_WINDOW_DAYS} days` : `No failed or partial runs in the last ${RECENT_WINDOW_DAYS} days`}
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader><CardTitle>Pending suggestions</CardTitle></CardHeader>
        <CardBody>
          <strong style={bigNumber}>{snapshot.pendingSuggestions}</strong>
          {rows.length > 0 && (
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: '4px' }}>
              {rows.map((r) => (
                <li key={r.id} className="muted small">
                  {aiSuggestionActionLabel(r.action)}{r.target_type ? ` · ${r.target_type.replace(/_/g, ' ')}` : ''} · {fmt(r.created_at)}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <Card style={{ gridColumn: '1 / -1' }}>
        <CardHeader><CardTitle>Recent findings</CardTitle></CardHeader>
        <CardBody>
          {snapshot.findings.length === 0
            ? <span className="muted">No findings yet.</span>
            : <FindingList findings={snapshot.findings} onOpen={onOpenFinding} />}
        </CardBody>
      </Card>
    </div>
  );
}

/** Presentational shell: no data fetching, easy to render in every state. */
export function AiHubShell({
  tab, onTabChange, state, onRetry, history, onOpenFinding, onOpenRun,
}: {
  tab: AiHubTab; onTabChange: (t: AiHubTab) => void; state: AiHubLoadState; onRetry?: () => void;
  /** History owns its own data/failure state so it is isolated from Overview. */
  history?: ReactNode; onOpenFinding?: (id: string) => void; onOpenRun?: (run: AiRunRow) => void;
}) {
  const body = (render: (s: AiHubSnapshot) => ReactNode) =>
    state.status === 'loading' ? <AiHubLoading />
      : state.status === 'error' ? <AiHubError onRetry={onRetry} />
        : render(state.snapshot);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '1000px', margin: '0 auto' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>AI Hub</h1>
        <p className="muted" style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
          AI-powered job-search intelligence and workflow insights.
        </p>
      </div>
      <Tabs id="ai-hub" activeTab={tab} onTabChange={(t) => onTabChange(t as AiHubTab)}>
        <TabList aria-label="AI Hub sections">
          <Tab id="overview">Overview</Tab>
          <Tab id="history">History</Tab>
        </TabList>
        <TabPanel id="overview">
          {body((s) => <AiHubOverview snapshot={s} onOpenFinding={onOpenFinding} onOpenRun={onOpenRun} />)}
        </TabPanel>
        <TabPanel id="history">{history}</TabPanel>
      </Tabs>
    </div>
  );
}

export interface AiHubViewProps {
  activeWorkspaceId: string | null;
  initialTab: AiHubTab;
  onNavigate: (path: string) => void;
}

export function AiHubView({ activeWorkspaceId, initialTab, onNavigate }: AiHubViewProps) {
  const [state, setState] = useState<AiHubLoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!activeWorkspaceId) return undefined;
    let cancelled = false;
    setState({ status: 'loading' });
    fetchAiHubSnapshot(activeWorkspaceId).then(
      (snapshot) => { if (!cancelled) setState({ status: 'ready', snapshot }); },
      () => { if (!cancelled) setState({ status: 'error' }); }, // isolated: never rethrown
    );
    return () => { cancelled = true; };
  }, [activeWorkspaceId, attempt]);
  const onTabChange = useCallback((t: AiHubTab) => onNavigate(aiHubPathForTab(t)), [onNavigate]);

  // Detail surfaces: one at a time, each with its own isolated load/failure state.
  const [selection, setSelection] = useState<{ kind: 'run' | 'finding'; id: string } | null>(null);
  const [runDetail, setRunDetail] = useState<DetailState<{ run: AiRunDetailRow; findings: AiFindingRow[] }>>({ status: 'loading' });
  const [findingDetail, setFindingDetail] = useState<DetailState<AiFindingDetailRow>>({ status: 'loading' });
  const [detailAttempt, setDetailAttempt] = useState(0);
  useEffect(() => {
    if (!selection || !activeWorkspaceId) return undefined;
    let cancelled = false;
    if (selection.kind === 'run') {
      setRunDetail({ status: 'loading' });
      fetchAiRunDetail(activeWorkspaceId, selection.id).then(
        (data) => { if (!cancelled) setRunDetail({ status: 'ready', data }); },
        () => { if (!cancelled) setRunDetail({ status: 'error' }); },
      );
    } else {
      setFindingDetail({ status: 'loading' });
      fetchAiFindingDetail(activeWorkspaceId, selection.id).then(
        (data) => { if (!cancelled) setFindingDetail({ status: 'ready', data }); },
        () => { if (!cancelled) setFindingDetail({ status: 'error' }); },
      );
    }
    return () => { cancelled = true; };
  }, [selection, activeWorkspaceId, detailAttempt]);
  const openRun = useCallback((run: AiRunRow) => setSelection({ kind: 'run', id: run.id }), []);
  const openFinding = useCallback((id: string) => setSelection({ kind: 'finding', id }), []);
  const close = useCallback(() => setSelection(null), []);
  const retryDetail = useCallback(() => setDetailAttempt((n) => n + 1), []);
  return (
    <>
      <AiHubShell
        tab={initialTab}
        onTabChange={onTabChange}
        state={state}
        onRetry={() => setAttempt((n) => n + 1)}
        onOpenFinding={openFinding}
        onOpenRun={openRun}
        history={<AiHubHistory activeWorkspaceId={activeWorkspaceId} onOpenRun={openRun} />}
      />
      {selection?.kind === 'run' && (
        <RunDetailDialog state={runDetail} onClose={close} onRetry={retryDetail} onOpenFinding={openFinding} />
      )}
      {selection?.kind === 'finding' && (
        <FindingDetailDialog state={findingDetail} onClose={close} onRetry={retryDetail} />
      )}
    </>
  );
}
