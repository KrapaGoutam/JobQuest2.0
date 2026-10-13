import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { fetchAiFindingDetail, fetchAiHubSnapshot, fetchAiRunDetail } from '../api/aiHub';
import {
  AI_HUB_TABS, RECENT_WINDOW_DAYS, aiHubPathForTab, aiProviderLabel, aiRunStatusLabel, aiRunStatusVariant,
  aiSuggestionActionLabel, aiWorkflowLabel, isAiHubEmpty,
  type AiFindingDetailRow, type AiFindingRow, type AiHubSnapshot, type AiHubTab, type AiRunDetailRow, type AiRunRow,
} from '../lib/aiHub';
import {
  FindingDetailDialog, FindingList, RunDetailDialog, fmtTime, type DetailState,
} from './AiHubDetails';
import { AiHubHistory } from './AiHubHistory';
import { AiHubDigest } from './AiHubDigest';
import { AiHubJobLeads } from './AiHubJobLeads';
import { AiHubEmail } from './AiHubEmail';
import { AiHubRecruiters } from './AiHubRecruiters';
import { AiHubCalendar } from './AiHubCalendar';
import { AiHubActions } from './AiHubActions';
import { useProfileTimeZone } from '../hooks/useProfileTimeZone';
import type { PublicSession } from '../api';
import { Tabs, TabList, Tab, TabPanel } from '../components/ui/Tabs';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { pendingActionsText } from '../lib/aiActions';
import { PROVIDER_LABELS as AUTOMATION_PROVIDER_LABELS, automationHealth, describeSchedule, formatInZone, type AutomationOverview } from '../lib/aiAutomation';

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

export function AiHubOverview({ snapshot, onOpenFinding, onOpenRun, onOpenTab }: {
  snapshot: AiHubSnapshot; onOpenFinding?: (id: string) => void; onOpenRun?: (run: AiRunRow) => void; onOpenTab?: (tab: AiHubTab) => void;
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
      {snapshot.sources && (
        <>
          <SourceCard title="New job leads" value={snapshot.sources.newJobLeads} hint="waiting for your review" tab="job-leads" action="Open Job Leads" onOpenTab={onOpenTab} />
          <SourceCard title="Email needing attention" value={snapshot.sources.emailAttention} hint="job-search emails to act on" tab="email" action="Open Email" onOpenTab={onOpenTab} />
          <SourceCard title="Recruiter intel" value={snapshot.sources.recruiterIntel} hint="cited public findings" tab="recruiters" action="Open Recruiter Intel" onOpenTab={onOpenTab} />
        </>
      )}
      {snapshot.calendar && (
        <Card>
          <CardHeader><CardTitle>Calendar</CardTitle></CardHeader>
          <CardBody>
            <strong style={bigNumber}>{snapshot.calendar.upcoming}</strong>
            <div className="muted small">upcoming</div>
            <div className="small" style={{ marginTop: '4px' }}>{snapshot.calendar.interviews} interview{snapshot.calendar.interviews === 1 ? '' : 's'} · {snapshot.calendar.deadlines} deadline{snapshot.calendar.deadlines === 1 ? '' : 's'}</div>
            {onOpenTab && <div style={{ marginTop: '8px' }}><Button variant="secondary" size="sm" onClick={() => onOpenTab('calendar')}>Open Calendar</Button></div>}
          </CardBody>
        </Card>
      )}
      {snapshot.automation && <NextAutomationCard overview={snapshot.automation} />}
      {snapshot.pendingActions !== undefined && (
        <Card>
          <CardHeader><CardTitle>Pending actions</CardTitle></CardHeader>
          <CardBody>
            <strong style={bigNumber}>{snapshot.pendingActions}</strong>
            <div className="muted small">{snapshot.pendingActions === 0 ? 'Nothing waiting for your review' : pendingActionsText(snapshot.pendingActions)}</div>
            {onOpenTab && <div style={{ marginTop: '8px' }}><Button variant="secondary" size="sm" onClick={() => onOpenTab('actions')}>Open Actions</Button></div>}
          </CardBody>
        </Card>
      )}
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

/** AI-11A: the soonest enabled, scheduled automation and a one-line health summary. Definitions only; JobQuest runs nothing. */
export function NextAutomationCard({ overview }: { overview: AutomationOverview }) {
  const next = overview.next;
  const health = next ? automationHealth(next) : null;
  return (
    <Card>
      <CardHeader><CardTitle>Next automation</CardTitle></CardHeader>
      <CardBody>
        {next && health ? (
          <div style={{ display: 'grid', gap: '4px' }}>
            <strong>{next.name}</strong>
            <span>{formatInZone(next.state.nextExpectedRunAt, next.timezone)}</span>
            <span className="muted small">{AUTOMATION_PROVIDER_LABELS[next.provider]} · {describeSchedule(next)}</span>
            <span><StatusBadge variant="success">Enabled</StatusBadge> <StatusBadge variant={health.variant}>{health.label}</StatusBadge></span>
          </div>
        ) : (
          <span className="muted">
            {overview.total === 0 ? 'No automations yet. Add one in Settings → AI & Automation.' : overview.enabled === 0 ? 'No automations are enabled.' : 'No scheduled runs (enabled automations are manual-only).'}
          </span>
        )}
        {overview.failing > 0 && (
          <div className="small" style={{ marginTop: '6px' }} role="status">
            {overview.failing} automation{overview.failing === 1 ? '' : 's'} need{overview.failing === 1 ? 's' : ''} attention (last run failed or was partial).
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function SourceCard({ title, value, hint, tab, action, onOpenTab }: {
  title: string; value: number; hint: string; tab: AiHubTab; action: string; onOpenTab?: (tab: AiHubTab) => void;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardBody>
        <strong style={bigNumber}>{value}</strong>
        <div className="muted small">{hint}</div>
        {onOpenTab && <div style={{ marginTop: '8px' }}><Button variant="secondary" size="sm" onClick={() => onOpenTab(tab)}>{action}</Button></div>}
      </CardBody>
    </Card>
  );
}

/** Presentational shell: no data fetching, easy to render in every state. */
export function AiHubShell({
  tab, onTabChange, state, onRetry, history, digest, jobLeads, email, recruiters, calendar, actions, onOpenFinding, onOpenRun,
}: {
  tab: AiHubTab; onTabChange: (t: AiHubTab) => void; state: AiHubLoadState; onRetry?: () => void;
  /** Each section owns its own data/failure state so it is isolated from Overview and from the others. */
  history?: ReactNode; digest?: ReactNode; jobLeads?: ReactNode; email?: ReactNode; recruiters?: ReactNode; calendar?: ReactNode; actions?: ReactNode;
  onOpenFinding?: (id: string) => void; onOpenRun?: (run: AiRunRow) => void;
}) {
  const body = (render: (s: AiHubSnapshot) => ReactNode) =>
    state.status === 'loading' ? <AiHubLoading />
      : state.status === 'error' ? <AiHubError onRetry={onRetry} />
        : render(state.snapshot);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '1000px', minWidth: 0, margin: '0 auto' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>AI Hub</h1>
        <p className="muted" style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
          AI-powered job-search intelligence and workflow insights.
        </p>
      </div>
      <Tabs id="ai-hub" className="ai-hub-tabs-wrapper" activeTab={tab} onTabChange={(t) => onTabChange(t as AiHubTab)}>
        <TabList aria-label="AI Hub sections" className="ai-hub-tabs">
          {AI_HUB_TABS.map((t) => <Tab key={t.id} id={t.id}>{t.label}</Tab>)}
        </TabList>
        <TabPanel id="overview">
          {body((s) => <AiHubOverview snapshot={s} onOpenFinding={onOpenFinding} onOpenRun={onOpenRun} onOpenTab={onTabChange} />)}
        </TabPanel>
        <TabPanel id="digest">{digest}</TabPanel>
        <TabPanel id="job-leads">{jobLeads}</TabPanel>
        <TabPanel id="email">{email}</TabPanel>
        <TabPanel id="recruiters">{recruiters}</TabPanel>
        <TabPanel id="calendar">{calendar}</TabPanel>
        <TabPanel id="actions">{actions}</TabPanel>
        <TabPanel id="history">{history}</TabPanel>
      </Tabs>
    </div>
  );
}

export interface AiHubViewProps {
  activeWorkspaceId: string | null;
  initialTab: AiHubTab;
  onNavigate: (path: string) => void;
  currentUserId?: string | null;
  session?: PublicSession | null;
}

export function AiHubView({ activeWorkspaceId, initialTab, onNavigate, currentUserId = null, session = null }: AiHubViewProps) {
  const [state, setState] = useState<AiHubLoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const { timeZone, loaded: zoneLoaded } = useProfileTimeZone(currentUserId);
  useEffect(() => {
    if (!activeWorkspaceId || (currentUserId && !zoneLoaded)) return undefined; // wait for the profile zone when there is a user
    let cancelled = false;
    setState({ status: 'loading' });
    fetchAiHubSnapshot(activeWorkspaceId, undefined, undefined, timeZone, session).then(
      (snapshot) => { if (!cancelled) setState({ status: 'ready', snapshot }); },
      () => { if (!cancelled) setState({ status: 'error' }); }, // isolated: never rethrown
    );
    return () => { cancelled = true; };
  }, [activeWorkspaceId, attempt, timeZone, zoneLoaded, currentUserId, session?.access_token]); // a refreshed token should refetch, a new session object should not
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
        digest={initialTab === 'digest' ? <AiHubDigest activeWorkspaceId={activeWorkspaceId} currentUserId={currentUserId} session={session} onNavigate={onNavigate} /> : null}
        jobLeads={initialTab === 'job-leads' ? <AiHubJobLeads activeWorkspaceId={activeWorkspaceId} currentUserId={currentUserId} onNavigate={onNavigate} /> : null}
        email={initialTab === 'email' ? <AiHubEmail activeWorkspaceId={activeWorkspaceId} currentUserId={currentUserId} onNavigate={onNavigate} /> : null}
        recruiters={initialTab === 'recruiters' ? <AiHubRecruiters activeWorkspaceId={activeWorkspaceId} currentUserId={currentUserId} onNavigate={onNavigate} /> : null}
        calendar={initialTab === 'calendar' ? <AiHubCalendar activeWorkspaceId={activeWorkspaceId} currentUserId={currentUserId} onNavigate={onNavigate} /> : null}
        actions={initialTab === 'actions' ? <AiHubActions activeWorkspaceId={activeWorkspaceId} currentUserId={currentUserId} session={session} onNavigate={onNavigate} onChanged={() => setAttempt((n) => n + 1)} /> : null}
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
