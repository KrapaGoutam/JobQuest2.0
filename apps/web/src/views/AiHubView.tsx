import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { fetchAiHubSnapshot } from '../api/aiHub';
import {
  aiHubPathForTab, aiRunStatusLabel, aiRunStatusVariant, aiWorkflowLabel, isAiHubEmpty,
  type AiHubSnapshot, type AiHubTab,
} from '../lib/aiHub';
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

const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
};

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

export function AiHubRunList({ snapshot }: { snapshot: AiHubSnapshot }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '8px' }}>
      {snapshot.runs.map((run) => (
        <li key={run.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <StatusBadge variant={aiRunStatusVariant(run.status)}>{aiRunStatusLabel(run.status)}</StatusBadge>
          <span>{aiWorkflowLabel(run.workflow)}</span>
          <span className="muted small">{run.provider} · {fmt(run.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}

export function AiHubOverview({ snapshot }: { snapshot: AiHubSnapshot }) {
  if (isAiHubEmpty(snapshot)) return <AiHubEmpty />;
  const latest = snapshot.runs[0];
  return (
    <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
      <Card>
        <CardHeader><CardTitle>Latest run</CardTitle></CardHeader>
        <CardBody>
          {latest ? (
            <div style={{ display: 'grid', gap: '4px' }}>
              <span><StatusBadge variant={aiRunStatusVariant(latest.status)}>{aiRunStatusLabel(latest.status)}</StatusBadge></span>
              <span>{aiWorkflowLabel(latest.workflow)}</span>
              <span className="muted small">{fmt(latest.created_at)}</span>
            </div>
          ) : <span className="muted">No runs yet.</span>}
        </CardBody>
      </Card>
      <Card>
        <CardHeader><CardTitle>Pending suggestions</CardTitle></CardHeader>
        <CardBody><strong style={{ fontSize: '22px' }}>{snapshot.pendingSuggestions}</strong></CardBody>
      </Card>
      <Card style={{ gridColumn: '1 / -1' }}>
        <CardHeader><CardTitle>Recent AI activity</CardTitle></CardHeader>
        <CardBody>
          {snapshot.findings.length === 0 ? <span className="muted">No findings yet.</span> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '8px' }}>
              {snapshot.findings.map((f) => (
                // Plain-text rendering only; React escapes all values.
                <li key={f.id}>
                  <div>{f.title}</div>
                  {f.summary && <div className="muted small">{f.summary}</div>}
                  {f.evidence && <div className="muted small">{f.evidence}</div>}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export function AiHubHistory({ snapshot }: { snapshot: AiHubSnapshot }) {
  if (snapshot.runs.length === 0) {
    return <EmptyState icon={<Sparkles size={22} />} title="No AI runs yet" description="Completed and failed AI runs will be listed here." />;
  }
  return <Card><CardBody><AiHubRunList snapshot={snapshot} /></CardBody></Card>;
}

/** Presentational shell: no data fetching, easy to render in every state. */
export function AiHubShell({
  tab, onTabChange, state, onRetry,
}: { tab: AiHubTab; onTabChange: (t: AiHubTab) => void; state: AiHubLoadState; onRetry?: () => void }) {
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
        <TabPanel id="overview">{body((s) => <AiHubOverview snapshot={s} />)}</TabPanel>
        <TabPanel id="history">{body((s) => <AiHubHistory snapshot={s} />)}</TabPanel>
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
  return (
    <AiHubShell
      tab={initialTab}
      onTabChange={onTabChange}
      state={state}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );
}
