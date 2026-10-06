import { dayKey, previousDayKey } from "./time";
import type { GoalProgressResponse } from "../types/analytics";

export type DashboardWidgetKind =
  "kpi" | "goal" | "chart" | "insight" | "activity" | "action";
export type DashboardTierId = "actions" | "pipeline" | "context";
export type DashboardSize = 1 | 2 | 3;
export type DashboardType = "user" | "manager";
export type DashboardPlacement = "pulse" | "work" | "progress" | "widgets";

export interface DashboardWidgetDefinition {
  id: string;
  name: string;
  kind: DashboardWidgetKind;
  tier: DashboardTierId;
  placement: DashboardPlacement;
}

export interface DashboardWidgetLayout {
  widgetId: string;
  enabled: boolean;
  position: number;
  width: DashboardSize;
  height: DashboardSize;
}

export interface DashboardTier {
  id: DashboardTierId;
  label: string;
  description: string;
}

export const DASHBOARD_TIERS: readonly DashboardTier[] = Object.freeze([
  {
    id: "actions",
    label: "Needs your attention",
    description: "Follow-ups, interviews, and applications waiting on you",
  },
  {
    id: "pipeline",
    label: "Current pipeline",
    description: "Where your active applications stand right now",
  },
  {
    id: "context",
    label: "Trends & context",
    description: "Longer-run patterns that explain progress",
  },
]);

const ACTION_IDS = new Set([
  "follow-ups-due",
  "overdue-follow-ups",
  "upcoming-interviews",
  "reminder-center",
  "pinned-applications",
  "health-summary",
  "calendar-preview",
]);
const PIPELINE_IDS = new Set([
  "applications-today",
  "applications-week",
  "applications-month",
  "active-applications",
  "responses",
  "rejections",
  "ghosted",
  "offers",
  "acceptances",
  "job-funnel",
  "applications-stage",
  "daily-goals",
  "daily-goal-chart",
  "weekly-goals",
  "goal-comparison",
]);

const RAW_WIDGETS = [
  ["applications-today", "Applications Today", "kpi"],
  ["applications-week", "Applications This Week", "kpi"],
  ["applications-month", "Applications This Month", "kpi"],
  ["active-applications", "Active Applications", "kpi"],
  ["follow-ups-due", "Follow-Ups Due", "kpi"],
  ["overdue-follow-ups", "Overdue Follow-Ups", "kpi"],
  ["upcoming-interviews", "Upcoming Interviews", "kpi"],
  ["responses", "Responses", "kpi"],
  ["rejections", "Rejections", "kpi"],
  ["ghosted", "Ghosted", "kpi"],
  ["offers", "Offers", "kpi"],
  ["acceptances", "Acceptances", "kpi"],
  ["daily-goals", "Daily Goal Progress", "goal"],
  ["daily-goal-chart", "Daily Target vs Actual", "chart"],
  ["weekly-goals", "Weekly Goal Progress", "goal"],
  ["goal-comparison", "Goal Achievement Comparison", "goal"],
  ["activity-chart", "Application Activity Chart", "chart"],
  ["job-funnel", "Job Funnel", "chart"],
  ["applications-stage", "Applications by Stage", "chart"],
  ["applications-source", "Applications by Source", "insight"],
  [
    "applications-work-arrangement",
    "Applications by Work Arrangement",
    "insight",
  ],
  ["resume-performance", "Resume Performance", "insight"],
  ["goal-trends", "Goal Trends", "goal"],
  ["reminder-center", "Reminder Center", "action"],
  ["aging-applications", "Aging Applications", "insight"],
  ["stage-duration", "Stage-Duration Summary", "insight"],
  ["recent-activity", "Recent Activity", "activity"],
  ["pinned-applications", "Pinned Applications", "action"],
  ["health-summary", "Application Health Summary", "insight"],
  ["calendar-preview", "Calendar Preview", "action"],
] as const;

const PULSE_IDS = new Set([
  "applications-today",
  "applications-week",
  "applications-month",
  "active-applications",
  "responses",
  "offers",
  "acceptances",
]);
const WORK_IDS = new Set([
  "follow-ups-due",
  "overdue-follow-ups",
  "upcoming-interviews",
  "reminder-center",
  "aging-applications",
  "calendar-preview",
]);
const PROGRESS_IDS = new Set([
  "daily-goals",
  "daily-goal-chart",
  "weekly-goals",
  "goal-comparison",
  "activity-chart",
  "job-funnel",
  "applications-stage",
]);

export const DASHBOARD_WIDGETS: readonly DashboardWidgetDefinition[] =
  Object.freeze(
    RAW_WIDGETS.map(([id, name, kind]) =>
      Object.freeze({
        id,
        name,
        kind,
        tier: ACTION_IDS.has(id)
          ? "actions"
          : PIPELINE_IDS.has(id)
            ? "pipeline"
            : "context",
        placement: PULSE_IDS.has(id)
          ? "pulse"
          : WORK_IDS.has(id)
            ? "work"
            : PROGRESS_IDS.has(id)
              ? "progress"
              : "widgets",
      }),
    ),
  );

export const DASHBOARD_WIDGET_IDS = new Set(
  DASHBOARD_WIDGETS.map((widget) => widget.id),
);

const USER_DEFAULT_IDS = new Set([
  "applications-week",
  "active-applications",
  "upcoming-interviews",
  "responses",
  "offers",
  "weekly-goals",
  "activity-chart",
  "job-funnel",
  "aging-applications",
  "reminder-center",
  "recent-activity",
  "health-summary",
]);
const MANAGER_DEFAULT_IDS = new Set([
  "applications-month",
  "active-applications",
  "upcoming-interviews",
  "offers",
  "activity-chart",
  "goal-comparison",
  "overdue-follow-ups",
  "job-funnel",
  "aging-applications",
  "stage-duration",
  "recent-activity",
]);
const WIDE_IDS = new Set(["activity-chart", "job-funnel"]);
const MEDIUM_IDS = new Set([
  "weekly-goals",
  "goal-comparison",
  "recent-activity",
]);

function size(value: unknown, fallback: DashboardSize): DashboardSize {
  return value === 1 || value === 2 || value === 3 ? value : fallback;
}

export function createDefaultDashboardLayout(
  type: DashboardType,
): DashboardWidgetLayout[] {
  const enabled = type === "manager" ? MANAGER_DEFAULT_IDS : USER_DEFAULT_IDS;
  return DASHBOARD_WIDGETS.map((widget, position) => ({
    widgetId: widget.id,
    enabled: enabled.has(widget.id),
    position,
    width: WIDE_IDS.has(widget.id) ? 3 : MEDIUM_IDS.has(widget.id) ? 2 : 1,
    height: 1,
  }));
}

export function normalizeDashboardLayout(
  value: unknown,
  type: DashboardType,
): DashboardWidgetLayout[] {
  const defaults = createDefaultDashboardLayout(type);
  if (!Array.isArray(value)) return defaults;

  const byId = new Map(defaults.map((item) => [item.widgetId, item]));
  const seen = new Set<string>();
  const normalized: DashboardWidgetLayout[] = [];

  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const raw = candidate as Record<string, unknown>;
    const widgetId = typeof raw.widgetId === "string" ? raw.widgetId : "";
    const fallback = byId.get(widgetId);
    if (!fallback || seen.has(widgetId)) continue;
    seen.add(widgetId);
    normalized.push({
      widgetId,
      enabled:
        typeof raw.enabled === "boolean" ? raw.enabled : fallback.enabled,
      position: normalized.length,
      width: size(raw.width, fallback.width),
      height: size(raw.height, fallback.height),
    });
  }

  for (const fallback of defaults) {
    if (!seen.has(fallback.widgetId))
      normalized.push({ ...fallback, position: normalized.length });
  }
  return normalized;
}

export function readDashboardLayout(
  preferences: unknown,
  workspaceId: string,
  type: DashboardType,
): DashboardWidgetLayout[] {
  if (
    !preferences ||
    typeof preferences !== "object" ||
    Array.isArray(preferences)
  ) {
    return createDefaultDashboardLayout(type);
  }
  const root = preferences as Record<string, unknown>;
  const dashboards = root.dashboards;
  if (
    !dashboards ||
    typeof dashboards !== "object" ||
    Array.isArray(dashboards)
  ) {
    return createDefaultDashboardLayout(type);
  }
  const workspace = (dashboards as Record<string, unknown>)[workspaceId];
  if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) {
    return createDefaultDashboardLayout(type);
  }
  return normalizeDashboardLayout(
    (workspace as Record<string, unknown>)[type],
    type,
  );
}

export function writeDashboardLayout(
  preferences: unknown,
  workspaceId: string,
  type: DashboardType,
  layout: DashboardWidgetLayout[],
): Record<string, unknown> {
  const root =
    preferences &&
    typeof preferences === "object" &&
    !Array.isArray(preferences)
      ? { ...(preferences as Record<string, unknown>) }
      : {};
  const priorDashboards = root.dashboards;
  const dashboards =
    priorDashboards &&
    typeof priorDashboards === "object" &&
    !Array.isArray(priorDashboards)
      ? { ...(priorDashboards as Record<string, unknown>) }
      : {};
  const priorWorkspace = dashboards[workspaceId];
  const workspace =
    priorWorkspace &&
    typeof priorWorkspace === "object" &&
    !Array.isArray(priorWorkspace)
      ? { ...(priorWorkspace as Record<string, unknown>) }
      : {};
  workspace[type] = normalizeDashboardLayout(layout, type);
  dashboards[workspaceId] = workspace;
  root.dashboards = dashboards;
  return root;
}

export function groupDashboardLayout(layout: DashboardWidgetLayout[]) {
  const definitionById = new Map(
    DASHBOARD_WIDGETS.map((widget) => [widget.id, widget]),
  );
  return DASHBOARD_TIERS.map((tier) => ({
    ...tier,
    widgets: layout
      .filter(
        (item) =>
          item.enabled && definitionById.get(item.widgetId)?.tier === tier.id,
      )
      .map((item) => ({
        layout: item,
        definition: definitionById.get(item.widgetId)!,
      })),
  })).filter((tier) => tier.widgets.length > 0);
}

export function weeklyPulseDelta(
  points: Array<{ week_start: string; applied: number; responses: number }>,
  metric: "applied" | "responses",
): number {
  const ordered = [...points].sort((a, b) =>
    a.week_start.localeCompare(b.week_start),
  );
  return ordered.length < 2
    ? 0
    : ordered.at(-1)![metric] - ordered.at(-2)![metric];
}

export interface DailyGoalCalculationInput {
  today?: { total_applications?: number } | null;
  goalProgress?: GoalProgressResponse | null;
  applications: Array<{ applied_at?: string | null }>;
  timeZone: string;
}

export interface DailyGoalMetrics {
  hasGoal: boolean;
  todayCount: number;
  yesterdayCount: number;
  target: number | null;
  remaining: number | null;
  percentage: number | null;
  isMet: boolean;
  isExceeded: boolean;
  yesterdayDelta: number;
}

export function calculateDailyGoalMetrics(
  data: DailyGoalCalculationInput,
  now: number = Date.now(),
): DailyGoalMetrics {
  const timeZone = data.timeZone || "UTC";
  const todayKey = dayKey(now, timeZone);
  const yesterdayKey = previousDayKey(todayKey);

  const dailyGoal = data.goalProgress?.active_goals?.find(
    (g) =>
      g.goal_type === "APPLICATIONS" &&
      g.period_type === "DAILY" &&
      g.is_enabled !== false,
  );

  const hasGoal = Boolean(
    dailyGoal &&
      typeof dailyGoal.target_value === "number" &&
      dailyGoal.target_value > 0,
  );
  const target = hasGoal && dailyGoal ? dailyGoal.target_value : null;

  // Today's applications count: prefer daily goal's certified actual if goal is active,
  // else fallback to today.total_applications or direct applications filter
  const todayCount =
    hasGoal && dailyGoal && typeof dailyGoal.actual === "number"
      ? dailyGoal.actual
      : (data.today?.total_applications ??
        data.applications.filter(
          (a) =>
            Boolean(a.applied_at) &&
            dayKey(a.applied_at!, timeZone) === todayKey,
        ).length);

  // Yesterday's applications count: prefer goal history if present, else filter applications
  const yesterdayHistory = data.goalProgress?.history?.find(
    (h) =>
      h.goal_type === "APPLICATIONS" &&
      h.period_type === "DAILY" &&
      h.period_start === yesterdayKey,
  );
  const yesterdayCount =
    yesterdayHistory !== undefined &&
    typeof yesterdayHistory.actual === "number"
      ? yesterdayHistory.actual
      : data.applications.filter(
          (a) =>
            Boolean(a.applied_at) &&
            dayKey(a.applied_at!, timeZone) === yesterdayKey,
        ).length;

  const remaining = target !== null ? Math.max(0, target - todayCount) : null;
  const percentage =
    target !== null && target > 0
      ? Math.round((todayCount / target) * 100)
      : null;
  const isMet = target !== null ? todayCount >= target : false;
  const isExceeded = target !== null ? todayCount > target : false;
  const yesterdayDelta = todayCount - yesterdayCount;

  return {
    hasGoal,
    todayCount,
    yesterdayCount,
    target,
    remaining,
    percentage,
    isMet,
    isExceeded,
    yesterdayDelta,
  };
}
