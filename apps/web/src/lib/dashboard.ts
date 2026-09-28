export type DashboardWidgetKind = 'kpi' | 'goal' | 'chart' | 'insight' | 'activity' | 'action';
export type DashboardTierId = 'actions' | 'pipeline' | 'context';
export type DashboardSize = 1 | 2 | 3;
export type DashboardType = 'user' | 'manager';

export interface DashboardWidgetDefinition {
  id: string;
  name: string;
  kind: DashboardWidgetKind;
  tier: DashboardTierId;
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
  { id: 'actions', label: 'Needs your attention', description: 'Follow-ups, interviews, and applications waiting on you' },
  { id: 'pipeline', label: 'Current pipeline', description: 'Where your active applications stand right now' },
  { id: 'context', label: 'Trends & context', description: 'Longer-run patterns that explain progress' },
]);

const ACTION_IDS = new Set([
  'follow-ups-due', 'overdue-follow-ups', 'upcoming-interviews', 'reminder-center',
  'pinned-applications', 'health-summary', 'calendar-preview',
]);
const PIPELINE_IDS = new Set([
  'applications-today', 'applications-week', 'applications-month', 'active-applications',
  'responses', 'rejections', 'ghosted', 'offers', 'acceptances', 'job-funnel',
  'applications-stage', 'daily-goals', 'daily-goal-chart', 'weekly-goals', 'goal-comparison',
]);

const RAW_WIDGETS = [
  ['applications-today', 'Applications Today', 'kpi'],
  ['applications-week', 'Applications This Week', 'kpi'],
  ['applications-month', 'Applications This Month', 'kpi'],
  ['active-applications', 'Active Applications', 'kpi'],
  ['follow-ups-due', 'Follow-Ups Due', 'kpi'],
  ['overdue-follow-ups', 'Overdue Follow-Ups', 'kpi'],
  ['upcoming-interviews', 'Upcoming Interviews', 'kpi'],
  ['responses', 'Responses', 'kpi'],
  ['rejections', 'Rejections', 'kpi'],
  ['ghosted', 'Ghosted', 'kpi'],
  ['offers', 'Offers', 'kpi'],
  ['acceptances', 'Acceptances', 'kpi'],
  ['daily-goals', 'Daily Goal Progress', 'goal'],
  ['daily-goal-chart', 'Daily Target vs Actual', 'chart'],
  ['weekly-goals', 'Weekly Goal Progress', 'goal'],
  ['goal-comparison', 'Goal Achievement Comparison', 'goal'],
  ['activity-chart', 'Application Activity Chart', 'chart'],
  ['job-funnel', 'Job Funnel', 'chart'],
  ['applications-stage', 'Applications by Stage', 'chart'],
  ['applications-source', 'Applications by Source', 'insight'],
  ['applications-work-arrangement', 'Applications by Work Arrangement', 'insight'],
  ['resume-performance', 'Resume Performance', 'insight'],
  ['goal-trends', 'Goal Trends', 'goal'],
  ['reminder-center', 'Reminder Center', 'action'],
  ['aging-applications', 'Aging Applications', 'insight'],
  ['stage-duration', 'Stage-Duration Summary', 'insight'],
  ['recent-activity', 'Recent Activity', 'activity'],
  ['pinned-applications', 'Pinned Applications', 'action'],
  ['health-summary', 'Application Health Summary', 'insight'],
  ['calendar-preview', 'Calendar Preview', 'action'],
] as const;

export const DASHBOARD_WIDGETS: readonly DashboardWidgetDefinition[] = Object.freeze(
  RAW_WIDGETS.map(([id, name, kind]) => Object.freeze({
    id,
    name,
    kind,
    tier: ACTION_IDS.has(id) ? 'actions' : PIPELINE_IDS.has(id) ? 'pipeline' : 'context',
  }))
);

export const DASHBOARD_WIDGET_IDS = new Set(DASHBOARD_WIDGETS.map((widget) => widget.id));

const USER_DEFAULT_IDS = new Set([
  'applications-month', 'active-applications', 'upcoming-interviews', 'responses',
  'activity-chart', 'weekly-goals', 'reminder-center', 'job-funnel',
  'recent-activity', 'health-summary',
]);
const MANAGER_DEFAULT_IDS = new Set([
  'applications-month', 'active-applications', 'upcoming-interviews', 'offers',
  'activity-chart', 'goal-comparison', 'overdue-follow-ups', 'job-funnel',
  'aging-applications', 'stage-duration', 'recent-activity',
]);
const WIDE_IDS = new Set(['activity-chart', 'job-funnel']);
const MEDIUM_IDS = new Set(['weekly-goals', 'goal-comparison', 'recent-activity']);

function size(value: unknown, fallback: DashboardSize): DashboardSize {
  return value === 1 || value === 2 || value === 3 ? value : fallback;
}

export function createDefaultDashboardLayout(type: DashboardType): DashboardWidgetLayout[] {
  const enabled = type === 'manager' ? MANAGER_DEFAULT_IDS : USER_DEFAULT_IDS;
  return DASHBOARD_WIDGETS.map((widget, position) => ({
    widgetId: widget.id,
    enabled: enabled.has(widget.id),
    position,
    width: WIDE_IDS.has(widget.id) ? 3 : MEDIUM_IDS.has(widget.id) ? 2 : 1,
    height: 1,
  }));
}

export function normalizeDashboardLayout(value: unknown, type: DashboardType): DashboardWidgetLayout[] {
  const defaults = createDefaultDashboardLayout(type);
  if (!Array.isArray(value)) return defaults;

  const byId = new Map(defaults.map((item) => [item.widgetId, item]));
  const seen = new Set<string>();
  const normalized: DashboardWidgetLayout[] = [];

  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue;
    const raw = candidate as Record<string, unknown>;
    const widgetId = typeof raw.widgetId === 'string' ? raw.widgetId : '';
    const fallback = byId.get(widgetId);
    if (!fallback || seen.has(widgetId)) continue;
    seen.add(widgetId);
    normalized.push({
      widgetId,
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : fallback.enabled,
      position: normalized.length,
      width: size(raw.width, fallback.width),
      height: size(raw.height, fallback.height),
    });
  }

  for (const fallback of defaults) {
    if (!seen.has(fallback.widgetId)) normalized.push({ ...fallback, position: normalized.length });
  }
  return normalized;
}

export function readDashboardLayout(
  preferences: unknown,
  workspaceId: string,
  type: DashboardType
): DashboardWidgetLayout[] {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
    return createDefaultDashboardLayout(type);
  }
  const root = preferences as Record<string, unknown>;
  const dashboards = root.dashboards;
  if (!dashboards || typeof dashboards !== 'object' || Array.isArray(dashboards)) {
    return createDefaultDashboardLayout(type);
  }
  const workspace = (dashboards as Record<string, unknown>)[workspaceId];
  if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) {
    return createDefaultDashboardLayout(type);
  }
  return normalizeDashboardLayout((workspace as Record<string, unknown>)[type], type);
}

export function writeDashboardLayout(
  preferences: unknown,
  workspaceId: string,
  type: DashboardType,
  layout: DashboardWidgetLayout[]
): Record<string, unknown> {
  const root = preferences && typeof preferences === 'object' && !Array.isArray(preferences)
    ? { ...(preferences as Record<string, unknown>) }
    : {};
  const priorDashboards = root.dashboards;
  const dashboards = priorDashboards && typeof priorDashboards === 'object' && !Array.isArray(priorDashboards)
    ? { ...(priorDashboards as Record<string, unknown>) }
    : {};
  const priorWorkspace = dashboards[workspaceId];
  const workspace = priorWorkspace && typeof priorWorkspace === 'object' && !Array.isArray(priorWorkspace)
    ? { ...(priorWorkspace as Record<string, unknown>) }
    : {};
  workspace[type] = normalizeDashboardLayout(layout, type);
  dashboards[workspaceId] = workspace;
  root.dashboards = dashboards;
  return root;
}

export function groupDashboardLayout(layout: DashboardWidgetLayout[]) {
  const definitionById = new Map(DASHBOARD_WIDGETS.map((widget) => [widget.id, widget]));
  return DASHBOARD_TIERS.map((tier) => ({
    ...tier,
    widgets: layout
      .filter((item) => item.enabled && definitionById.get(item.widgetId)?.tier === tier.id)
      .map((item) => ({ layout: item, definition: definitionById.get(item.widgetId)! })),
  })).filter((tier) => tier.widgets.length > 0);
}
