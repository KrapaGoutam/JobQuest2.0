import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_TIERS,
  DASHBOARD_WIDGETS,
  createDefaultDashboardLayout,
  groupDashboardLayout,
  normalizeDashboardLayout,
  readDashboardLayout,
  writeDashboardLayout,
} from '../../apps/web/src/lib/dashboard';

describe('Milestone 9 — dashboard registry and preferences', () => {
  it('preserves the complete unique 30-widget contract verbatim', () => {
    expect(DASHBOARD_WIDGETS).toHaveLength(30);
    expect(new Set(DASHBOARD_WIDGETS.map((widget) => widget.id)).size).toBe(30);
    expect(DASHBOARD_WIDGETS.find((widget) => widget.id === 'applications-today')?.name).toBe('Applications Today');
    expect(DASHBOARD_WIDGETS.find((widget) => widget.id === 'daily-goal-chart')?.name).toBe('Daily Target vs Actual');
    expect(DASHBOARD_WIDGETS.find((widget) => widget.id === 'calendar-preview')?.name).toBe('Calendar Preview');
    expect(DASHBOARD_WIDGETS.every((widget) => DASHBOARD_TIERS.some((tier) => tier.id === widget.tier))).toBe(true);
  });

  it('retains legacy user and manager defaults with stable sizes', () => {
    const user = createDefaultDashboardLayout('user');
    const manager = createDefaultDashboardLayout('manager');
    expect(user.filter((item) => item.enabled).map((item) => item.widgetId)).toEqual([
      'applications-month', 'active-applications', 'upcoming-interviews', 'responses',
      'weekly-goals', 'activity-chart', 'job-funnel', 'reminder-center',
      'recent-activity', 'health-summary',
    ]);
    expect(manager.find((item) => item.widgetId === 'aging-applications')?.enabled).toBe(true);
    expect(user.find((item) => item.widgetId === 'activity-chart')?.width).toBe(3);
    expect(user.find((item) => item.widgetId === 'recent-activity')?.width).toBe(2);
  });

  it('normalizes malformed values, removes unknown duplicates, and restores missing widgets', () => {
    const normalized = normalizeDashboardLayout([
      { widgetId: 'responses', enabled: false, width: 3, height: 2 },
      { widgetId: 'responses', enabled: true },
      { widgetId: 'not-a-widget', enabled: true },
      { widgetId: 'offers', enabled: 'yes', width: 99 },
      null,
    ], 'user');
    expect(normalized).toHaveLength(30);
    expect(normalized[0]).toEqual({ widgetId: 'responses', enabled: false, position: 0, width: 3, height: 2 });
    expect(normalized[1]).toMatchObject({ widgetId: 'offers', enabled: false, width: 1 });
    expect(normalized.every((item, index) => item.position === index)).toBe(true);
  });

  it('round-trips a workspace/type layout without overwriting unrelated preferences', () => {
    const layout = createDefaultDashboardLayout('user');
    layout[0] = { ...layout[0]!, enabled: true };
    const preferences = writeDashboardLayout({ themeDensity: 'compact' }, 'workspace-a', 'user', layout);
    expect(preferences.themeDensity).toBe('compact');
    expect(readDashboardLayout(preferences, 'workspace-a', 'user')[0]!.enabled).toBe(true);
    expect(readDashboardLayout(preferences, 'workspace-b', 'user')[0]!.enabled).toBe(false);
  });

  it('groups enabled widgets into the approved three-tier order', () => {
    const grouped = groupDashboardLayout(createDefaultDashboardLayout('user'));
    expect(grouped.map((tier) => tier.id)).toEqual(['actions', 'pipeline', 'context']);
    expect(grouped.flatMap((tier) => tier.widgets).every(({ definition }) => Boolean(definition))).toBe(true);
  });
});
