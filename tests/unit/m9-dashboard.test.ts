import { describe, expect, it } from "vitest";
import {
  DASHBOARD_TIERS,
  DASHBOARD_WIDGETS,
  createDefaultDashboardLayout,
  groupDashboardLayout,
  normalizeDashboardLayout,
  readDashboardLayout,
  writeDashboardLayout,
  weeklyPulseDelta,
} from "../../apps/web/src/lib/dashboard";

describe("Milestone 9 — dashboard registry and preferences", () => {
  it("preserves the complete unique 30-widget contract verbatim", () => {
    expect(DASHBOARD_WIDGETS).toHaveLength(30);
    expect(new Set(DASHBOARD_WIDGETS.map((widget) => widget.id)).size).toBe(30);
    expect(
      DASHBOARD_WIDGETS.find((widget) => widget.id === "applications-today")
        ?.name,
    ).toBe("Applications Today");
    expect(
      DASHBOARD_WIDGETS.find((widget) => widget.id === "daily-goal-chart")
        ?.name,
    ).toBe("Daily Target vs Actual");
    expect(
      DASHBOARD_WIDGETS.find((widget) => widget.id === "calendar-preview")
        ?.name,
    ).toBe("Calendar Preview");
    expect(
      DASHBOARD_WIDGETS.every((widget) =>
        DASHBOARD_TIERS.some((tier) => tier.id === widget.tier),
      ),
    ).toBe(true);
  });

  it("uses Direction C defaults while retaining the manager month view and stable sizes", () => {
    const user = createDefaultDashboardLayout("user");
    const manager = createDefaultDashboardLayout("manager");
    expect(
      user.filter((item) => item.enabled).map((item) => item.widgetId),
    ).toEqual([
      "applications-week",
      "active-applications",
      "upcoming-interviews",
      "responses",
      "offers",
      "weekly-goals",
      "activity-chart",
      "job-funnel",
      "reminder-center",
      "aging-applications",
      "recent-activity",
      "health-summary",
    ]);
    expect(
      manager.find((item) => item.widgetId === "aging-applications")?.enabled,
    ).toBe(true);
    expect(user.find((item) => item.widgetId === "activity-chart")?.width).toBe(
      3,
    );
    expect(
      user.find((item) => item.widgetId === "recent-activity")?.width,
    ).toBe(2);
  });

  it("maps all widgets into Direction C placements and calculates deltas from chronological weeks", () => {
    expect(
      DASHBOARD_WIDGETS.every((widget) =>
        ["pulse", "work", "progress", "widgets"].includes(widget.placement),
      ),
    ).toBe(true);
    expect(
      DASHBOARD_WIDGETS.find((widget) => widget.id === "applications-week")
        ?.placement,
    ).toBe("pulse");
    expect(
      DASHBOARD_WIDGETS.find((widget) => widget.id === "aging-applications")
        ?.placement,
    ).toBe("work");
    expect(
      DASHBOARD_WIDGETS.find((widget) => widget.id === "activity-chart")
        ?.placement,
    ).toBe("progress");
    expect(
      DASHBOARD_WIDGETS.find((widget) => widget.id === "recent-activity")
        ?.placement,
    ).toBe("widgets");
    const weeks = [
      { week_start: "2026-09-21", applied: 12, responses: 3 },
      { week_start: "2026-09-07", applied: 5, responses: 1 },
      { week_start: "2026-09-14", applied: 8, responses: 4 },
    ];
    expect(weeklyPulseDelta(weeks, "applied")).toBe(4);
    expect(weeklyPulseDelta(weeks, "responses")).toBe(-1);
  });

  it("normalizes malformed values, removes unknown duplicates, and restores missing widgets", () => {
    const normalized = normalizeDashboardLayout(
      [
        { widgetId: "responses", enabled: false, width: 3, height: 2 },
        { widgetId: "responses", enabled: true },
        { widgetId: "not-a-widget", enabled: true },
        { widgetId: "offers", enabled: "yes", width: 99 },
        null,
      ],
      "user",
    );
    expect(normalized).toHaveLength(30);
    expect(normalized[0]).toEqual({
      widgetId: "responses",
      enabled: false,
      position: 0,
      width: 3,
      height: 2,
    });
    expect(normalized[1]).toMatchObject({
      widgetId: "offers",
      enabled: true,
      width: 1,
    });
    expect(normalized.every((item, index) => item.position === index)).toBe(
      true,
    );
  });

  it("round-trips a workspace/type layout without overwriting unrelated preferences", () => {
    const layout = createDefaultDashboardLayout("user");
    layout[0] = { ...layout[0]!, enabled: true };
    const preferences = writeDashboardLayout(
      { themeDensity: "compact" },
      "workspace-a",
      "user",
      layout,
    );
    expect(preferences.themeDensity).toBe("compact");
    expect(
      readDashboardLayout(preferences, "workspace-a", "user")[0]!.enabled,
    ).toBe(true);
    expect(
      readDashboardLayout(preferences, "workspace-b", "user")[0]!.enabled,
    ).toBe(false);
  });

  it("groups enabled widgets into the approved three-tier order", () => {
    const grouped = groupDashboardLayout(createDefaultDashboardLayout("user"));
    expect(grouped.map((tier) => tier.id)).toEqual([
      "actions",
      "pipeline",
      "context",
    ]);
    expect(
      grouped
        .flatMap((tier) => tier.widgets)
        .every(({ definition }) => Boolean(definition)),
    ).toBe(true);
  });
});
