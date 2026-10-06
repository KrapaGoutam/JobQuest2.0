import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TriangleAlert,
  Clock,
  CalendarDays,
  Moon,
  RefreshCw,
  Video,
  Phone,
  MapPin,
  CircleX,
  SlidersHorizontal,
  Plus,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Select";
import { EmptyState } from "../components/ui/EmptyState";
import { useProfileTimeZone } from "../hooks/useProfileTimeZone";
import {
  fetchNextActions,
  fetchOutcomesNeeded,
  fetchQueueTasks,
  fetchQuietApplications,
  type QuietApplication,
} from "../api/tasks";
import { fetchInterviews } from "../api/interviews";
import {
  fetchCanonicalWorkflow,
  fetchWorkspaceMembers,
  type WorkspaceMemberInfo,
} from "../api/applications";
import { QueueRow, useQueueActions } from "../components/tasks/QueueRow";
import { ReviewActions } from "../components/tasks/ReviewActions";
import {
  buildQueue,
  sectionQueue,
  todayBounds,
  type QueueItem,
} from "../lib/queue";
import {
  typeLabel,
  formatLabel,
  upcomingBand,
  type Interview,
} from "../types/interviews";
import type { CanonicalWorkflow } from "../types/applications";
import {
  dayKey,
  daysBetweenKeys,
  formatInZone,
  formatTime,
  zonedWallTimeToUtcIso,
} from "../lib/time";
import { weekStartKey } from "../lib/habits";
import { fetchAnalyticsOverview, fetchGoalProgress, fetchStageTiming } from "../api/analytics";
import {
  fetchDashboardApplications,
  fetchDashboardLayout,
  saveDashboardLayout,
} from "../api/dashboard";
import {
  createDefaultDashboardLayout,
  DASHBOARD_WIDGETS,
  type DashboardType,
  type DashboardWidgetLayout,
} from "../lib/dashboard";
import {
  DashboardWidgetCard,
  type DashboardWidgetData,
} from "../components/dashboard/DashboardWidgets";
import { DashboardCustomizeDialog } from "../components/dashboard/DashboardCustomizeDialog";
import {
  DashboardProgress,
  SearchPulse,
} from "../components/dashboard/DashboardPanels";
import { useToast } from "../context/ToastContext";

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
export function DashboardView({
  activeWorkspaceId: ws,
  isManager,
  currentUserId,
  onNavigate,
}: DashboardViewProps) {
  const { addToast } = useToast();
  const { timeZone, weekStart } = useProfileTimeZone(currentUserId);
  const [ownerId, setOwnerId] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [quiet, setQuiet] = useState<{
    items: QuietApplication[];
    total: number;
  }>({ items: [], total: 0 });
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<CanonicalWorkflow | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberInfo[]>([]);
  const dashboardType: DashboardType = isManager ? "manager" : "user";
  const [layout, setLayout] = useState<DashboardWidgetLayout[]>(() =>
    createDefaultDashboardLayout(dashboardType),
  );
  const [preferences, setPreferences] = useState<Record<string, unknown>>({});
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [widgetData, setWidgetData] = useState<DashboardWidgetData | null>(
    null,
  );
  const seq = useRef(0);

  useEffect(() => {
    if (!ws) return;
    fetchCanonicalWorkflow(ws)
      .then(setWorkflow)
      .catch(() => setWorkflow(null));
    if (isManager)
      fetchWorkspaceMembers(ws)
        .then(setMembers)
        .catch(() => setMembers([]));
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
        setLayoutError(
          (cause as Error).message || "Saved layout could not be loaded.",
        );
      });
    return () => {
      active = false;
    };
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
      const [
        tasks,
        next,
        outcomes,
        upcoming,
        q,
        todayOverview,
        weekOverview,
        monthOverview,
        allOverview,
        timing,
        applications,
        goalProgress,
      ] = await Promise.all([
        fetchQueueTasks(
          ws,
          {
            today: tb.today,
            tomorrow: tb.tomorrow,
            end: tb.end,
            now: new Date().toISOString(),
          },
          { ownerId: owner },
        ),
        fetchNextActions(ws, { dueOnOrBefore: tb.today, ownerId: owner }),
        fetchOutcomesNeeded(ws, owner),
        fetchInterviews(ws, "upcoming", { ownerId: owner }, 0, 20),
        fetchQuietApplications(ws, owner),
        fetchAnalyticsOverview(ws, {
          ...analyticsOptions,
          startDate: todayKey,
        }),
        fetchAnalyticsOverview(ws, { ...analyticsOptions, startDate: weekKey }),
        fetchAnalyticsOverview(ws, {
          ...analyticsOptions,
          startDate: monthKey,
        }),
        fetchAnalyticsOverview(ws, { userId: owner || null }),
        fetchStageTiming(ws, { userId: owner || null }),
        fetchDashboardApplications(ws, owner),
        fetchGoalProgress(ws, { userId: owner || null }),
      ]);
      if (mine !== seq.current) return;
      const nextQueue = buildQueue(
        { tasks, nextActions: next, outcomes },
        timeZone,
      );
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
        goalProgress,
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
  }, [ws, ownerId, timeZone, weekStart, isManager]);
  useEffect(() => {
    void load();
  }, [load]);

  const actions = useQueueActions({
    timeZone,
    workflow,
    onChanged: () => void load(),
  });
  const s = useMemo(() => sectionQueue(queue), [queue]);
  const thisWeek = interviews.filter(
    (i) =>
      upcomingBand(i.scheduled_at, timeZone, Date.now(), weekStart) ===
      "THIS_WEEK",
  );
  const ownerName = (uid: string) => {
    if (!isManager) return null;
    if (uid === currentUserId) return "You";
    const m = members.find((x) => x.user_id === uid);
    return m ? m.display_name || m.username : null;
  };
  const enabledWidgets = useMemo(
    () =>
      new Set(
        layout.filter((item) => item.enabled).map((item) => item.widgetId),
      ),
    [layout],
  );
  const visibleWidgets = useMemo(
    () =>
      layout
        .filter((item) => item.enabled)
        .map((item) => ({
          layout: item,
          definition: DASHBOARD_WIDGETS.find(
            (widget) => widget.id === item.widgetId,
          )!,
        }))
        .filter((item) => item.definition.placement === "widgets"),
    [layout],
  );
  const saveLayout = async (nextLayout: DashboardWidgetLayout[]) => {
    if (!ws || !currentUserId)
      throw new Error("A signed-in profile and workspace are required.");
    try {
      const nextPreferences = await saveDashboardLayout(
        currentUserId,
        ws,
        dashboardType,
        nextLayout,
        preferences,
      );
      setLayout(nextLayout);
      setPreferences(nextPreferences);
      setLayoutError(null);
      addToast({ type: "success", title: "Dashboard layout saved" });
    } catch (cause) {
      addToast({
        type: "danger",
        title: "Dashboard layout could not be saved",
      });
      throw cause;
    }
  };

  if (!ws)
    return (
      <EmptyState
        title="No workspace selected"
        description="Choose a workspace to see what needs attention."
      />
    );
  const loading = loadedKey !== viewKey;
  const today = dayKey(Date.now(), timeZone);

  return (
    <div className="page dash">
      <header className="dashboard-header">
        <div>
          <div className="small muted" data-testid="dash-date">
            {formatInZone(new Date().toISOString(), timeZone, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </div>
          <h1>Job search cockpit</h1>
          <p>Focus on what needs attention, then keep your search moving.</p>
        </div>
        <div className="dashboard-header-actions">
          {isManager && (
            <>
              <label className="sr-only" htmlFor="dash-owner">
                Owner
              </label>
              <Select
                id="dash-owner"
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
              >
                <option value="">Owner: all members</option>
                {members.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.user_id === currentUserId
                      ? "You"
                      : member.display_name || member.username}
                  </option>
                ))}
              </Select>
            </>
          )}
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
      </header>

      <nav
        className="attention-bar"
        aria-label="Items needing attention"
        data-testid="dash-stats"
      >
        <button type="button" onClick={() => onNavigate("/tasks")}>
          <TriangleAlert size={15} aria-hidden="true" />
          <span>
            <b>{s.overdue.length}</b> overdue
          </span>
        </button>
        <button type="button" onClick={() => onNavigate("/tasks")}>
          <Clock size={15} aria-hidden="true" />
          <span>
            <b>{s.today.length}</b> due today
          </span>
        </button>
        <button type="button" onClick={() => onNavigate("/interviews")}>
          <CalendarDays size={15} aria-hidden="true" />
          <span>
            <b>{thisWeek.length}</b> interviews this week
          </span>
        </button>
        <button type="button" onClick={() => onNavigate("/analytics/aging")}>
          <Moon size={15} aria-hidden="true" />
          <span>
            <b>{quiet.total}</b> to review
          </span>
        </button>
      </nav>

      {error && (
        <div role="alert" className="banner danger small">
          Could not load your queue: {error}
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<RefreshCw size={13} />}
            onClick={() => void load()}
          >
            Retry
          </Button>
        </div>
      )}

      {layoutError && (
        <div role="status" className="banner info small">
          Saved dashboard preferences could not be loaded. Safe defaults are in
          use.
        </div>
      )}

      {loading || !widgetData ? (
        <div
          className="pulse-card dashboard-zone-loading"
          role="status"
          aria-label="Loading search pulse"
        >
          <div className="skel" />
          <div className="skel" />
          <div className="skel" />
        </div>
      ) : (
        <SearchPulse
          data={widgetData}
          enabled={enabledWidgets}
          onNavigate={onNavigate}
        />
      )}

      <div className="zone-heading">
        <div>
          <h2>Today’s work</h2>
          <p>Most urgent first</p>
        </div>
      </div>

      <div className="dash-grid">
        <section className="card dash-queue" aria-labelledby="dash-queue-h">
          <div className="card-h">
            <h2 id="dash-queue-h">Today's queue</h2>
            <span className="small muted">
              Next actions and tasks, most urgent first
            </span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className="linkish small"
              onClick={() => onNavigate("/tasks")}
            >
              All tasks
            </button>
          </div>
          {loading ? (
            <div
              role="status"
              aria-label="Loading queue"
              className="col"
              style={{ gap: 8, padding: 16 }}
            >
              {[0, 1, 2].map((n) => (
                <div key={n} className="skel" style={{ height: 44 }} />
              ))}
            </div>
          ) : s.overdue.length + s.today.length === 0 ? (
            <EmptyState
              title="All caught up"
              description="Nothing is overdue or due today."
            />
          ) : (
            <div className="dash-queue-scroll">
              {s.overdue.length > 0 && (
                <div role="group" aria-label="Overdue">
                  <div className="band danger">
                    <TriangleAlert size={13} aria-hidden="true" />
                    OVERDUE · {s.overdue.length}
                  </div>
                  {s.overdue.map((i) => (
                    <QueueRow
                      key={i.key}
                      item={i}
                      timeZone={timeZone}
                      onComplete={actions.complete}
                      onSnooze={actions.snooze}
                      ownerName={ownerName(i.ownerId)}
                      compact
                    />
                  ))}
                </div>
              )}
              {s.today.length > 0 && (
                <div role="group" aria-label="Due today">
                  <div className="band warning">
                    <Clock size={13} aria-hidden="true" />
                    DUE TODAY · {s.today.length}
                  </div>
                  {s.today.map((i) => (
                    <QueueRow
                      key={i.key}
                      item={i}
                      timeZone={timeZone}
                      onComplete={actions.complete}
                      onSnooze={actions.snooze}
                      ownerName={ownerName(i.ownerId)}
                      compact
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <div className="col" style={{ gap: 12, minWidth: 0 }}>
          {(enabledWidgets.has("upcoming-interviews") ||
            enabledWidgets.has("calendar-preview")) && (
            <section className="card" aria-labelledby="dash-int-h">
              <div className="card-h">
                <h2 id="dash-int-h">Upcoming interviews</h2>
                <span style={{ flex: 1 }} />
                <button
                  type="button"
                  className="linkish small"
                  onClick={() => onNavigate("/interviews")}
                >
                  All interviews
                </button>
              </div>
              {loading ? (
                <div
                  className="skel"
                  style={{ height: 48, margin: 16 }}
                  role="status"
                  aria-label="Loading interviews"
                />
              ) : interviews.length === 0 ? (
                <div className="small muted" style={{ padding: "12px 16px" }}>
                  No upcoming interviews.
                </div>
              ) : (
                interviews.slice(0, 4).map((i) => {
                  const Icon = FORMAT_ICON[i.format] ?? Video;
                  const diff = daysBetweenKeys(
                    today,
                    dayKey(i.scheduled_at, timeZone),
                  );
                  return (
                    <div
                      key={i.id}
                      className="dash-int"
                      data-testid="dash-interview"
                    >
                      <div className="dtile" aria-hidden="true">
                        <span>
                          {formatInZone(i.scheduled_at, timeZone, {
                            weekday: "short",
                          }).toUpperCase()}
                        </span>
                        <b>
                          {formatInZone(i.scheduled_at, timeZone, {
                            day: "numeric",
                          })}
                        </b>
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="b ell">
                          {i.applications?.company_name}
                        </div>
                        <div className="small muted ell">
                          {typeLabel(i.interview_type)} · round {i.round_number}
                          {diff === 0
                            ? " · today"
                            : diff === 1
                              ? " · tomorrow"
                              : ""}
                        </div>
                      </div>
                      <div className="small" style={{ textAlign: "right" }}>
                        <div>{formatTime(i.scheduled_at, timeZone)}</div>
                        <div
                          className="muted row"
                          style={{ gap: 4, justifyContent: "flex-end" }}
                        >
                          <Icon size={12} aria-hidden="true" />
                          {formatLabel(i.format)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </section>
          )}

          {enabledWidgets.has("aging-applications") && (
            <section className="card" aria-labelledby="dash-quiet-h">
              <div className="card-h">
                <h2 id="dash-quiet-h">Review quiet applications</h2>
                <span className="small muted">{quiet.total} · 31+ days</span>
                <span style={{ flex: 1 }} />
                <button
                  type="button"
                  className="linkish small"
                  onClick={() => onNavigate("/applications")}
                >
                  Review all
                </button>
              </div>
              {loading ? (
                <div
                  className="skel"
                  style={{ height: 48, margin: 16 }}
                  role="status"
                  aria-label="Loading quiet applications"
                />
              ) : quiet.items.length === 0 ? (
                <div className="small muted" style={{ padding: "12px 16px" }}>
                  No quiet applications. Everything has recent activity.
                </div>
              ) : (
                quiet.items.slice(0, 3).map((a) => (
                  <div
                    key={a.id}
                    className="dash-quiet"
                    data-testid="dash-quiet"
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="b ell">{a.company_name}</div>
                      <div className="small danger-t row" style={{ gap: 4 }}>
                        <CircleX size={12} aria-hidden="true" />
                        Long Waiting ·{" "}
                        {daysBetweenKeys(
                          dayKey(a.last_activity_at, timeZone),
                          today,
                        )}
                        d
                        {ownerName(a.user_id) && (
                          <span className="muted">
                            {" "}
                            · {ownerName(a.user_id)}
                          </span>
                        )}
                      </div>
                    </div>
                    <ReviewActions
                      application={a}
                      onChanged={() => void load()}
                    />
                  </div>
                ))
              )}
              <div
                className="small muted"
                style={{
                  padding: "8px 16px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>
                  Suggested reviews only. Changes happen only when you choose an
                  action.
                </span>
                <span style={{ flex: 1 }} />
                {quiet.items.length > 3 && (
                  <button
                    type="button"
                    className="linkish small"
                    onClick={() => onNavigate("/analytics/aging")}
                  >
                    Review {quiet.items.length - 3} more
                  </button>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      {!loading && widgetData && (
        <DashboardProgress
          data={widgetData}
          enabled={enabledWidgets}
          isManagerAggregate={isManager && !ownerId}
        />
      )}

      <section
        className="dashboard-zone dash-insights"
        aria-labelledby="dash-insights-h"
      >
        <div className="zone-heading">
          <div>
            <h2 id="dash-insights-h">Your widgets</h2>
            <p>
              {visibleWidgets.length} visible · add context without losing focus
            </p>
          </div>
        </div>
        {loading || !widgetData ? (
          <div
            className="dash-widget-grid"
            role="status"
            aria-label="Loading dashboard widgets"
          >
            {[0, 1, 2].map((item) => (
              <div key={item} className="card skel dash-widget-skeleton" />
            ))}
          </div>
        ) : (
          <div className="dash-widget-grid" data-testid="dashboard-widgets">
            {visibleWidgets.map(({ definition, layout: itemLayout }) => (
              <DashboardWidgetCard
                key={definition.id}
                definition={definition}
                layout={itemLayout}
                data={widgetData}
                onNavigate={onNavigate}
              />
            ))}
            <button
              type="button"
              className="add-widget-tile"
              onClick={() => setCustomizeOpen(true)}
            >
              <Plus size={20} aria-hidden="true" />
              <strong>Add widget</strong>
              <span>Choose from all 30 dashboard widgets</span>
            </button>
          </div>
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
