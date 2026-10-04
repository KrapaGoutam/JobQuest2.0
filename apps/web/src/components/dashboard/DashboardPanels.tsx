import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Check, Target } from "lucide-react";
import type { DashboardWidgetData } from "./DashboardWidgets";
import {
  FunnelRows,
  GoalRing,
  PaceChart,
  ProgressTrack,
  ScopeTag,
} from "../analytics/AnalyticsCharts";
import { Card } from "../ui/Card";
import { weeklyPulseDelta } from "../../lib/dashboard";

type Period = "today" | "week" | "month";

function Delta({ value }: { value: number }) {
  if (!value) return <span className="pulse-delta neutral">No change</span>;
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`pulse-delta ${value > 0 ? "positive" : "negative"}`}>
      <Icon size={12} aria-hidden="true" />
      {Math.abs(value)} vs prior week
    </span>
  );
}

export function SearchPulse({
  data,
  enabled,
}: {
  data: DashboardWidgetData;
  enabled: Set<string>;
}) {
  const [period, setPeriod] = useState<Period>("week");
  const overview = data[period];
  const active = data.applications.filter(
    (app) => app.status === "OPEN",
  ).length;
  const weekly = useMemo(
    () =>
      [...data.all.weekly_pacing].sort((a, b) =>
        a.week_start.localeCompare(b.week_start),
      ),
    [data.all.weekly_pacing],
  );
  const appDelta =
    period === "week" ? weeklyPulseDelta(weekly, "applied") : null;
  const responseDelta =
    period === "week" ? weeklyPulseDelta(weekly, "responses") : null;
  const goalPeriod = period === 'today' ? 'DAILY' : period === 'week' ? 'WEEKLY' : 'MONTHLY';
  const applicationGoal = data.goalProgress?.active_goals.find((goal) => goal.goal_type === 'APPLICATIONS' && goal.period_type === goalPeriod);
  const cells = [
    {
      id: "applications",
      show: [
        "applications-today",
        "applications-week",
        "applications-month",
      ].some((id) => enabled.has(id)),
      label: "Applications",
      value: overview.total_applications,
      delta: appDelta,
    },
    {
      id: "responses",
      show: enabled.has("responses"),
      label: "Responses",
      value: overview.response_count,
      delta: responseDelta,
    },
    {
      id: "interviews",
      show:
        enabled.has("upcoming-interviews") || enabled.has("calendar-preview"),
      label: "Interviews",
      value: overview.interview_count,
    },
    {
      id: "offers",
      show: enabled.has("offers"),
      label: "Offers",
      value: overview.offer_count,
    },
    {
      id: "active",
      show: enabled.has("active-applications"),
      label: "Active",
      value: active,
    },
  ];
  return (
    <section className="dashboard-zone" aria-labelledby="search-pulse-title">
      <div className="zone-heading">
        <div>
          <h2 id="search-pulse-title">Search pulse</h2>
          <p>Momentum at a glance</p>
        </div>
        <div
          className="period-switch"
          role="radiogroup"
          aria-label="Search pulse period"
        >
          {(["today", "week", "month"] as Period[]).map((item) => (
            <button
              type="button"
              role="radio"
              aria-checked={period === item}
              key={item}
              onClick={() => setPeriod(item)}
            >
              {item === "today" ? "Today" : item === "week" ? "Week" : "Month"}
            </button>
          ))}
        </div>
      </div>
      <div className="pulse-card">
        {cells
          .filter((cell) => cell.show)
          .map((cell) => (
            <div className="pulse-cell" key={cell.id}>
              <span>{cell.label}</span>
              <strong>{cell.value}</strong>
              {cell.delta === null || cell.delta === undefined ? (
                <small>
                  {period === "today"
                    ? "Today"
                    : period === "week"
                      ? "This week"
                      : "This month"}
                </small>
              ) : (
                <Delta value={cell.delta} />
              )}
            </div>
          ))}
        {(enabled.has("weekly-goals") ||
          enabled.has("daily-goals") ||
          enabled.has("goal-comparison")) && (
          <div className="pulse-cell pulse-goal">
            <span>Goal</span>
            {applicationGoal ? <GoalRing value={applicationGoal.actual} target={applicationGoal.target_value} label={`${period} application goal`} /> : <small>No {period} application goal</small>}
          </div>
        )}
      </div>
    </section>
  );
}

export function DashboardProgress({
  data,
  enabled,
  isManagerAggregate,
}: {
  data: DashboardWidgetData;
  enabled: Set<string>;
  isManagerAggregate: boolean;
}) {
  const [pipelineMode, setPipelineMode] = useState<"historical" | "current">(
    "historical",
  );
  const applicationGoal = data.goalProgress?.active_goals.find((goal) => goal.goal_type === 'APPLICATIONS');
  const networkingGoal = data.goalProgress?.active_goals.find((goal) => goal.goal_type === 'NETWORKING');
  const aggregateTarget = data.week.active_goal?.target_applications;
  const target = applicationGoal?.target_value ?? aggregateTarget ?? 0;
  const actual = applicationGoal?.actual ?? (isManagerAggregate ? data.week.total_applications : 0);
  const showActivity =
    enabled.has("activity-chart") || enabled.has("goal-trends");
  const showPipeline =
    enabled.has("job-funnel") || enabled.has("applications-stage");
  const showGoal = [
    "weekly-goals",
    "daily-goals",
    "daily-goal-chart",
    "goal-comparison",
  ].some((id) => enabled.has(id));
  if (!showActivity && !showPipeline && !showGoal) return null;
  return (
    <section className="dashboard-zone" aria-labelledby="progress-title">
      <div className="zone-heading">
        <div>
          <h2 id="progress-title">Progress</h2>
          <p>Activity, pipeline, and goal pacing</p>
        </div>
      </div>
      <div className="dashboard-progress-grid">
        {showActivity && (
          <Card className="analytics-card dashboard-activity">
            <header className="analytics-card-head">
              <div>
                <h3>Application activity</h3>
                <p>Latest 12 weeks</p>
              </div>
              <ScopeTag tone="fixed">12 weeks</ScopeTag>
            </header>
            <PaceChart points={data.all.weekly_pacing} compact />
          </Card>
        )}
        {showPipeline && (
          <Card className="analytics-card dashboard-pipeline">
            <header className="analytics-card-head">
              <div>
                <h3>Pipeline</h3>
                <p>
                  {pipelineMode === "historical"
                    ? "Every stage reached"
                    : "Open applications now"}
                </p>
              </div>
              <div
                className="mini-switch"
                role="group"
                aria-label="Pipeline view"
              >
                <button
                  type="button"
                  aria-pressed={pipelineMode === "historical"}
                  onClick={() => setPipelineMode("historical")}
                >
                  Ever reached
                </button>
                <button
                  type="button"
                  aria-pressed={pipelineMode === "current"}
                  onClick={() => setPipelineMode("current")}
                >
                  Open now
                </button>
              </div>
            </header>
            <FunnelRows
              rows={
                pipelineMode === "historical"
                  ? data.all.historical_funnel
                  : data.all.current_pipeline
              }
              total={data.all.total_applications}
              current={pipelineMode === "current"}
            />
          </Card>
        )}
        {showGoal && (
          <Card className="analytics-card dashboard-goal">
            <header className="analytics-card-head">
              <div>
                <h3>Goal progress</h3>
                <p>
                  {isManagerAggregate
                    ? "Workspace application target"
                    : "Your search target"}
                </p>
              </div>
              {applicationGoal && <ScopeTag tone="fixed">{applicationGoal.period_type.toLowerCase()}</ScopeTag>}
            </header>
            {target > 0 ? <div className="dashboard-goal-body">
              <GoalRing value={actual} target={target} />
              <div>
                <span className="goal-status">
                  {actual >= target ? (
                    <>
                      <Check size={14} /> Target met
                    </>
                  ) : (
                    <>
                      <Target size={14} /> {Math.max(0, target - actual)} to go
                    </>
                  )}
                </span>
                {!isManagerAggregate && networkingGoal && (
                  <>
                    <div className="goal-inline">
                      <span>Outreach</span>
                      <b>
                        {networkingGoal.actual} / {networkingGoal.target_value}
                      </b>
                    </div>
                    <ProgressTrack value={networkingGoal.actual} max={networkingGoal.target_value} />
                  </>
                )}
              </div>
            </div> : <p className="analytics-note">No active application goal. Add one from Analytics.</p>}
            {isManagerAggregate && (
              <p className="analytics-note">
                Member-level goal comparison is shown after selecting an owner.
              </p>
            )}
          </Card>
        )}
      </div>
    </section>
  );
}
