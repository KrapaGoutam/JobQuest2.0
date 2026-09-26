import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TriangleAlert, Clock, CalendarDays, Moon, RefreshCw, Video, Phone, MapPin, CircleX, SlidersHorizontal } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { EmptyState } from '../components/ui/EmptyState';
import { useProfileTimeZone } from '../hooks/useProfileTimeZone';
import { fetchNextActions, fetchOutcomesNeeded, fetchQueueTasks, fetchQuietApplications, type QuietApplication } from '../api/tasks';
import { fetchInterviews } from '../api/interviews';
import { fetchCanonicalWorkflow, fetchWorkspaceMembers, type WorkspaceMemberInfo } from '../api/applications';
import { QueueRow, useQueueActions } from '../components/tasks/QueueRow';
import { ReviewActions } from '../components/tasks/ReviewActions';
import { buildQueue, sectionQueue, todayBounds, type QueueItem } from '../lib/queue';
import { typeLabel, formatLabel, upcomingBand, type Interview } from '../types/interviews';
import type { CanonicalWorkflow } from '../types/applications';
import { dayKey, daysBetweenKeys, formatInZone, formatTime, zonedWallTimeToUtcIso } from '../lib/time';
import { weekStartKey } from '../lib/habits';
import { fetchAnalyticsOverview, fetchStageTiming } from '../api/analytics';
import { fetchDashboardApplications, fetchDashboardLayout, saveDashboardLayout } from '../api/dashboard';
import { createDefaultDashboardLayout, groupDashboardLayout, type DashboardType, type DashboardWidgetLayout } from '../lib/dashboard';
import { DashboardWidgetCard, type DashboardWidgetData } from '../components/dashboard/DashboardWidgets';
import { DashboardCustomizeDialog } from '../components/dashboard/DashboardCustomizeDialog';
import { useToast } from '../context/ToastContext';

const FORMAT_ICON = { VIDEO: Video, PHONE: Phone, ONSITE: MapPin } as const;

export interface DashboardViewProps {
  activeWorkspaceId: string | null;
  isManager: boolean;
  currentUserId: string | null;
  onNavigate: (path: string) => void;
}

/**
 * Approved dashboard D1/D2 (manager D7): "What needs my attention today?" — one
 * urgency queue (overdue, then due today), upcoming interviews and a review list for
 * quiet applications. A read view: every action goes through its domain's RPC.
 */
export function DashboardView({ activeWorkspaceId: ws, isManager, currentUserId, onNavigate }: DashboardViewProps) {
  const { addToast } = useToast();
  const { timeZone, weekStart } = useProfileTimeZone(currentUserId);
  const [ownerId, setOwnerId] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [quiet, setQuiet] = useState<{ items: QuietApplication[]; total: number }>({ items: [], total: 0 });
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<CanonicalWorkflow | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberInfo[]>([]);
  const dashboardType: DashboardType = isManager ? 'manager' : 'user';
  const [layout, setLayout] = useState<DashboardWidgetLayout[]>(() => createDefaultDashboardLayout(dashboardType));
  const [preferences, setPreferences] = useState<Record<string, unknown>>({});
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [widgetData, setWidgetData] = useState<DashboardWidgetData | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!ws) return;
    fetchCanonicalWorkflow(ws).then(setWorkflow).catch(() => setWorkflow(null));
    if (isManager) fetchWorkspaceMembers(ws).then(setMembers).catch(() => setMembers([]));
  }, [ws, isManager]);

  useEffect(() => {
    if (!ws || !currentUserId) {
      setLayout(createDefaultDashboardLayout(dashboardType));
      setPreferences({});
      return;
    }
    let active = true;
    setLayoutError(null);
    void fetchDashboardLayout(currentUserId, ws, dashboardType)
      .then((result) => {
        if (!active) return;
        setLayout(result.layout);
        setPreferences(result.preferences);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setLayout(createDefaultDashboardLayout(dashboardType));
        setLayoutError((cause as Error).message || 'Saved layout could not be loaded.');
      });
    return () => { active = false; };
  }, [ws, currentUserId, dashboardType]);

  const viewKey = `${ws}|${ownerId}|${timeZone}`;
  const load = useCallback(async () => {
    if (!ws) return;
    const mine = ++seq.current;
    const key = `${ws}|${ownerId}|${timeZone}`;
    setError(null);
    try {
      const tb = todayBounds(timeZone, Date.now(), zonedWallTimeToUtcIso);
      const owner = ownerId || undefined;
      const todayKey = dayKey(Date.now(), timeZone);
      const weekKey = weekStartKey(todayKey, weekStart);
      const monthKey = `${todayKey.slice(0, 7)}-01`;
      const analyticsOptions = { endDate: todayKey, userId: owner || null };
      const [tasks, next, outcomes, upcoming, q, todayOverview, weekOverview, monthOverview, allOverview, timing, applications] = await Promise.all([
        fetchQueueTasks(ws, { today: tb.today, tomorrow: tb.tomorrow, end: tb.end, now: new Date().toISOString() }, { ownerId: owner }),
        fetchNextActions(ws, { dueOnOrBefore: tb.today, ownerId: owner }),
        fetchOutcomesNeeded(ws, owner),
        fetchInterviews(ws, 'upcoming', { ownerId: owner }, 0, 20),
        fetchQuietApplications(ws, owner),
        fetchAnalyticsOverview(ws, { ...analyticsOptions, startDate: todayKey }),
        fetchAnalyticsOverview(ws, { ...analyticsOptions, startDate: weekKey }),
        fetchAnalyticsOverview(ws, { ...analyticsOptions, startDate: monthKey }),
        fetchAnalyticsOverview(ws, { userId: owner || null }),
        fetchStageTiming(ws, { userId: owner || null }),
        fetchDashboardApplications(ws, owner),
      ]);
      if (mine !== seq.current) return;
      const nextQueue = buildQueue({ tasks, nextActions: next, outcomes }, timeZone);
      setQueue(nextQueue);
      setInterviews(upcoming.interviews);
      setQuiet(q);
      setWidgetData({
        today: todayOverview,
        week: weekOverview,
        month: monthOverview,
        all: allOverview,
        timing,
        applications,
        queue: nextQueue,
        interviews: upcoming.interviews,
        quiet: q,
        timeZone,
      });
      setLoadedKey(key);
    } catch (e) {
      if (mine === seq.current) {
        setError((e as Error).message);
        setLoadedKey(key);
      }
    }
  }, [ws, ownerId, timeZone, weekStart]);
  useEffect(() => {
    void load();
  }, [load]);

  const actions = useQueueActions({ timeZone, workflow, onChanged: () => void load() });
  const s = useMemo(() => sectionQueue(queue), [queue]);
  const thisWeek = interviews.filter((i) => upcomingBand(i.scheduled_at, timeZone, Date.now(), weekStart) === 'THIS_WEEK');
  const ownerName = (uid: string) => {
    if (!isManager) return null;
    if (uid === currentUserId) return 'You';
    const m = members.find((x) => x.user_id === uid);
    return m ? m.display_name || m.username : null;
  };
  const widgetGroups = useMemo(() => groupDashboardLayout(layout), [layout]);
  const saveLayout = async (nextLayout: DashboardWidgetLayout[]) => {
    if (!ws || !currentUserId) throw new Error('A signed-in profile and workspace are required.');
    try {
      const nextPreferences = await saveDashboardLayout(currentUserId, ws, dashboardType, nextLayout, preferences);
      setLayout(nextLayout);
      setPreferences(nextPreferences);
      setLayoutError(null);
      addToast({ type: 'success', title: 'Dashboard layout saved' });
    } catch (cause) {
      addToast({ type: 'danger', title: 'Dashboard layout could not be saved' });
      throw cause;
    }
  };

  if (!ws) return <EmptyState title="No workspace selected" description="Choose a workspace to see what needs attention." />;
  const loading = loadedKey !== viewKey;
  const today = dayKey(Date.now(), timeZone);

  return (
    <div className="page dash">
      <div>
        <div className="small muted" data-testid="dash-date">{formatInZone(new Date().toISOString(), timeZone, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        <div className="page-title" style={{ marginTop: 2 }}>
          <h1>What needs attention today</h1>
          <span className="row small dash-stats" style={{ gap: 14, flexWrap: 'wrap' }} data-testid="dash-stats">
            <span className="row" style={{ gap: 5 }}><TriangleAlert size={14} className="danger-t" aria-hidden="true" /><b>{s.overdue.length}</b> overdue</span>
            <span className="row" style={{ gap: 5 }}><Clock size={14} className="warning-t" aria-hidden="true" /><b>{s.today.length}</b> due today</span>
            <span className="row" style={{ gap: 5 }}><CalendarDays size={14} className="muted" aria-hidden="true" /><b>{thisWeek.length}</b> interviews this week</span>
            <span className="row" style={{ gap: 5 }}><Moon size={14} className="muted" aria-hidden="true" /><b>{quiet.total}</b> to review</span>
          </span>
          <span style={{ flex: 1 }} />
          {isManager && (
            <>
              <label className="sr-only" htmlFor="dash-owner">Owner</label>
              <Select id="dash-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} style={{ width: 190 }}>
                <option value="">Owner: all members</option>
                {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.user_id === currentUserId ? 'You' : m.display_name || m.username}</option>)}
              </Select>
            </>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="banner danger small">
          Could not load your queue: {error}
          <Button size="sm" variant="secondary" leftIcon={<RefreshCw size={13} />} onClick={() => void load()}>Retry</Button>
        </div>
      )}

      {layoutError && (
        <div role="status" className="banner info small">
          Saved dashboard preferences could not be loaded. Safe defaults are in use.
        </div>
      )}

      <div className="dash-grid">
        <section className="card dash-queue" aria-labelledby="dash-queue-h">
          <div className="card-h">
            <h2 id="dash-queue-h">Today's queue</h2>
            <span className="small muted">Next actions and tasks, most urgent first</span>
            <span style={{ flex: 1 }} />
            <button type="button" className="linkish small" onClick={() => onNavigate('/tasks')}>All tasks</button>
          </div>
          {loading ? (
            <div role="status" aria-label="Loading queue" className="col" style={{ gap: 8, padding: 16 }}>
              {[0, 1, 2].map((n) => <div key={n} className="skel" style={{ height: 44 }} />)}
            </div>
          ) : s.overdue.length + s.today.length === 0 ? (
            <EmptyState title="All caught up" description="Nothing is overdue or due today." />
          ) : (
            <>
              {s.overdue.length > 0 && (
                <div role="group" aria-label="Overdue">
                  <div className="band danger"><TriangleAlert size={13} aria-hidden="true" />OVERDUE · {s.overdue.length}</div>
                  {s.overdue.map((i) => <QueueRow key={i.key} item={i} timeZone={timeZone} onComplete={actions.complete} onSnooze={actions.snooze} ownerName={ownerName(i.ownerId)} compact />)}
                </div>
              )}
              {s.today.length > 0 && (
                <div role="group" aria-label="Due today">
                  <div className="band warning"><Clock size={13} aria-hidden="true" />DUE TODAY · {s.today.length}</div>
                  {s.today.map((i) => <QueueRow key={i.key} item={i} timeZone={timeZone} onComplete={actions.complete} onSnooze={actions.snooze} ownerName={ownerName(i.ownerId)} compact />)}
                </div>
              )}
            </>
          )}
        </section>

        <div className="col" style={{ gap: 12, minWidth: 0 }}>
          <section className="card" aria-labelledby="dash-int-h">
            <div className="card-h">
              <h2 id="dash-int-h">Upcoming interviews</h2>
              <span style={{ flex: 1 }} />
              <button type="button" className="linkish small" onClick={() => onNavigate('/interviews')}>All interviews</button>
            </div>
            {loading ? (
              <div className="skel" style={{ height: 48, margin: 16 }} role="status" aria-label="Loading interviews" />
            ) : interviews.length === 0 ? (
              <div className="small muted" style={{ padding: '12px 16px' }}>No upcoming interviews.</div>
            ) : (
              interviews.slice(0, 4).map((i) => {
                const Icon = FORMAT_ICON[i.format] ?? Video;
                const diff = daysBetweenKeys(today, dayKey(i.scheduled_at, timeZone));
                return (
                  <div key={i.id} className="dash-int" data-testid="dash-interview">
                    <div className="dtile" aria-hidden="true">
                      <span>{formatInZone(i.scheduled_at, timeZone, { weekday: 'short' }).toUpperCase()}</span>
                      <b>{formatInZone(i.scheduled_at, timeZone, { day: 'numeric' })}</b>
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="b ell">{i.applications?.company_name}</div>
                      <div className="small muted ell">{typeLabel(i.interview_type)} · round {i.round_number}{diff === 0 ? ' · today' : diff === 1 ? ' · tomorrow' : ''}</div>
                    </div>
                    <div className="small" style={{ textAlign: 'right' }}>
                      <div>{formatTime(i.scheduled_at, timeZone)}</div>
                      <div className="muted row" style={{ gap: 4, justifyContent: 'flex-end' }}><Icon size={12} aria-hidden="true" />{formatLabel(i.format)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </section>

          <section className="card" aria-labelledby="dash-quiet-h">
            <div className="card-h">
              <h2 id="dash-quiet-h">Review quiet applications</h2>
              <span className="small muted">{quiet.total} · 31+ days</span>
              <span style={{ flex: 1 }} />
              <button type="button" className="linkish small" onClick={() => onNavigate('/applications')}>Review all</button>
            </div>
            {loading ? (
              <div className="skel" style={{ height: 48, margin: 16 }} role="status" aria-label="Loading quiet applications" />
            ) : quiet.items.length === 0 ? (
              <div className="small muted" style={{ padding: '12px 16px' }}>No quiet applications. Everything has recent activity.</div>
            ) : (
              quiet.items.slice(0, 3).map((a) => (
                <div key={a.id} className="dash-quiet" data-testid="dash-quiet">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="b ell">{a.company_name}</div>
                    <div className="small danger-t row" style={{ gap: 4 }}>
                      <CircleX size={12} aria-hidden="true" />
                      Long Waiting · {daysBetweenKeys(dayKey(a.last_activity_at, timeZone), today)}d
                      {ownerName(a.user_id) && <span className="muted"> · {ownerName(a.user_id)}</span>}
                    </div>
                  </div>
                  <ReviewActions application={a} onChanged={() => void load()} compact />
                </div>
              ))
            )}
            <div className="small muted" style={{ padding: '8px 16px 12px' }}>Suggestions only. Nothing is archived automatically.</div>
          </section>
        </div>
      </div>

      <section className="dash-insights" aria-labelledby="dash-insights-h">
        <div className="dash-insights-head">
          <div>
            <h2 id="dash-insights-h">Your dashboard</h2>
            <p className="small muted">Stable widgets, organized around action first and context second.</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<SlidersHorizontal size={14} aria-hidden="true" />}
            onClick={() => setCustomizeOpen(true)}
            disabled={!currentUserId}
          >
            Customize
          </Button>
        </div>

        {loading || !widgetData ? (
          <div className="dash-widget-grid" role="status" aria-label="Loading dashboard widgets">
            {[0, 1, 2, 3].map((item) => <div key={item} className="card skel dash-widget-skeleton" />)}
          </div>
        ) : widgetGroups.length === 0 ? (
          <div className="card empty">
            <strong>No dashboard widgets are visible</strong>
            <span className="small muted">Customize the dashboard to turn widgets back on.</span>
          </div>
        ) : (
          widgetGroups.map((group) => (
            <section key={group.id} className="dash-tier" aria-labelledby={`dash-tier-${group.id}`}>
              <div className="dash-tier-head">
                <h3 id={`dash-tier-${group.id}`}>{group.label}</h3>
                <span className="small muted">{group.description}</span>
              </div>
              <div className="dash-widget-grid" data-testid={`dashboard-tier-${group.id}`}>
                {group.widgets.map(({ definition, layout: itemLayout }) => (
                  <DashboardWidgetCard
                    key={definition.id}
                    definition={definition}
                    layout={itemLayout}
                    data={widgetData}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </section>

      <DashboardCustomizeDialog
        isOpen={customizeOpen}
        type={dashboardType}
        layout={layout}
        onClose={() => setCustomizeOpen(false)}
        onSave={saveLayout}
      />
      {actions.dialogs}
    </div>
  );
}
