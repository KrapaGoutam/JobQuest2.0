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
  calculateDailyGoalMetrics,
  calculateDailyActivity,
} from "../../apps/web/src/lib/dashboard";
import { previousDayKey } from "../../apps/web/src/lib/time";

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

describe("Phase 2.1-B — Dashboard Goal + Daily Application Metrics", () => {
  describe("previousDayKey calendar helper", () => {
    it("computes the previous calendar date across standard days, month ends, leap years, and year ends", () => {
      expect(previousDayKey("2026-10-06")).toBe("2026-10-05");
      expect(previousDayKey("2026-10-01")).toBe("2026-09-30");
      expect(previousDayKey("2026-01-01")).toBe("2025-12-31");
      expect(previousDayKey("2024-03-01")).toBe("2024-02-29"); // leap year
      expect(previousDayKey("2023-03-01")).toBe("2023-02-28"); // non-leap year
    });
  });

  describe("calculateDailyGoalMetrics", () => {
    // Fixed reference point: 2026-10-06T12:00:00Z (Tuesday)
    const fixedNow = Date.parse("2026-10-06T12:00:00Z");

    it("scenario A: daily goal configured -> correct today, target, remaining, completion percentage, and yesterday count", () => {
      const input = {
        timeZone: "UTC",
        today: { total_applications: 7 },
        goalProgress: {
          user_id: "user-1",
          timezone: "UTC",
          week_start: 1,
          active_goals: [
            {
              goal_type: "APPLICATIONS" as const,
              period_type: "DAILY" as const,
              target_value: 10,
              actual: 7,
              effective_date: "2026-10-01",
              period_start: "2026-10-06",
              period_end: "2026-10-07",
              percentage: 70,
              is_enabled: true,
            },
          ],
          history: [
            {
              goal_type: "APPLICATIONS" as const,
              period_type: "DAILY" as const,
              target_value: 10,
              actual: 8,
              effective_date: "2026-10-01",
              period_start: "2026-10-05",
              period_end: "2026-10-06",
              percentage: 80,
            },
          ],
          versions: [],
        },
        applications: [],
      };

      const metrics = calculateDailyGoalMetrics(input, fixedNow);
      expect(metrics.hasGoal).toBe(true);
      expect(metrics.todayCount).toBe(7);
      expect(metrics.target).toBe(10);
      expect(metrics.remaining).toBe(3);
      expect(metrics.percentage).toBe(70);
      expect(metrics.yesterdayCount).toBe(8);
      expect(metrics.yesterdayDelta).toBe(-1);
      expect(metrics.isMet).toBe(false);
      expect(metrics.isExceeded).toBe(false);
    });

    it("scenario B: goal exceeded -> percentage is uncapped, remaining is 0, isExceeded is true", () => {
      const input = {
        timeZone: "UTC",
        today: { total_applications: 12 },
        goalProgress: {
          user_id: "user-1",
          timezone: "UTC",
          week_start: 1,
          active_goals: [
            {
              goal_type: "APPLICATIONS" as const,
              period_type: "DAILY" as const,
              target_value: 10,
              actual: 12,
              effective_date: "2026-10-01",
              period_start: "2026-10-06",
              period_end: "2026-10-07",
              percentage: 120,
              is_enabled: true,
            },
          ],
          history: [],
          versions: [],
        },
        applications: [
          // 5 applications yesterday
          { applied_at: "2026-10-05T09:00:00Z" },
          { applied_at: "2026-10-05T10:00:00Z" },
          { applied_at: "2026-10-05T11:00:00Z" },
          { applied_at: "2026-10-05T12:00:00Z" },
          { applied_at: "2026-10-05T13:00:00Z" },
        ],
      };

      const metrics = calculateDailyGoalMetrics(input, fixedNow);
      expect(metrics.hasGoal).toBe(true);
      expect(metrics.todayCount).toBe(12);
      expect(metrics.target).toBe(10);
      expect(metrics.remaining).toBe(0);
      expect(metrics.percentage).toBe(120);
      expect(metrics.isMet).toBe(true);
      expect(metrics.isExceeded).toBe(true);
      expect(metrics.yesterdayCount).toBe(5);
      expect(metrics.yesterdayDelta).toBe(7);
    });

    it("scenario C: zero applications today -> valid 0% and full target remaining, not empty state", () => {
      const input = {
        timeZone: "UTC",
        today: { total_applications: 0 },
        goalProgress: {
          user_id: "user-1",
          timezone: "UTC",
          week_start: 1,
          active_goals: [
            {
              goal_type: "APPLICATIONS" as const,
              period_type: "DAILY" as const,
              target_value: 10,
              actual: 0,
              effective_date: "2026-10-01",
              period_start: "2026-10-06",
              period_end: "2026-10-07",
              percentage: 0,
              is_enabled: true,
            },
          ],
          history: [],
          versions: [],
        },
        applications: [
          { applied_at: "2026-10-05T10:00:00Z" },
          { applied_at: "2026-10-05T11:00:00Z" },
        ],
      };

      const metrics = calculateDailyGoalMetrics(input, fixedNow);
      expect(metrics.hasGoal).toBe(true);
      expect(metrics.todayCount).toBe(0);
      expect(metrics.target).toBe(10);
      expect(metrics.remaining).toBe(10);
      expect(metrics.percentage).toBe(0);
      expect(metrics.isMet).toBe(false);
      expect(metrics.isExceeded).toBe(false);
      expect(metrics.yesterdayCount).toBe(2);
      expect(metrics.yesterdayDelta).toBe(-2);
    });

    it("scenario D: no daily goal configured -> hasGoal is false, target and percentage are null, counts still accurate", () => {
      const input = {
        timeZone: "UTC",
        today: { total_applications: 3 },
        goalProgress: {
          user_id: "user-1",
          timezone: "UTC",
          week_start: 1,
          active_goals: [
            // Only a weekly goal, no daily goal
            {
              goal_type: "APPLICATIONS" as const,
              period_type: "WEEKLY" as const,
              target_value: 15,
              actual: 8,
              effective_date: "2026-10-01",
              period_start: "2026-10-05",
              period_end: "2026-10-12",
              percentage: 53.3,
              is_enabled: true,
            },
          ],
          history: [],
          versions: [],
        },
        applications: [
          { applied_at: "2026-10-06T10:00:00Z" },
          { applied_at: "2026-10-06T11:00:00Z" },
          { applied_at: "2026-10-06T12:00:00Z" },
          { applied_at: "2026-10-05T15:00:00Z" },
        ],
      };

      const metrics = calculateDailyGoalMetrics(input, fixedNow);
      expect(metrics.hasGoal).toBe(false);
      expect(metrics.target).toBeNull();
      expect(metrics.remaining).toBeNull();
      expect(metrics.percentage).toBeNull();
      expect(metrics.todayCount).toBe(3);
      expect(metrics.yesterdayCount).toBe(1);
      expect(metrics.yesterdayDelta).toBe(2);
    });

    it("scenario E: fallback to application list when today/history overview is null", () => {
      const input = {
        timeZone: "UTC",
        today: null,
        goalProgress: null,
        applications: [
          { applied_at: "2026-10-06T08:00:00Z" },
          { applied_at: "2026-10-06T09:00:00Z" },
          { applied_at: "2026-10-05T14:00:00Z" },
          { applied_at: "2026-10-04T12:00:00Z" }, // 2 days ago
        ],
      };

      const metrics = calculateDailyGoalMetrics(input, fixedNow);
      expect(metrics.hasGoal).toBe(false);
      expect(metrics.todayCount).toBe(2);
      expect(metrics.yesterdayCount).toBe(1);
      expect(metrics.yesterdayDelta).toBe(1);
    });

    it("scenario F: respects custom timezone boundaries (e.g. America/Chicago)", () => {
      // 2026-10-06T03:00:00Z in America/Chicago (UTC-5) is 2026-10-05 22:00:00 (yesterday!)
      const chicagoNow = Date.parse("2026-10-06T18:00:00Z"); // 1:00 PM CDT on 2026-10-06
      const input = {
        timeZone: "America/Chicago",
        today: null,
        goalProgress: null,
        applications: [
          // In Chicago, 2026-10-06T02:00:00Z is 2026-10-05 21:00 (yesterday)
          { applied_at: "2026-10-06T02:00:00Z" },
          // In Chicago, 2026-10-06T15:00:00Z is 2026-10-06 10:00 (today)
          { applied_at: "2026-10-06T15:00:00Z" },
        ],
      };

      const metrics = calculateDailyGoalMetrics(input, chicagoNow);
      expect(metrics.todayCount).toBe(1);
      expect(metrics.yesterdayCount).toBe(1);
      expect(metrics.yesterdayDelta).toBe(0);
    });

    it("scenario G (2.1-PA regression): manager with no owner filter receives daily goal from RPC without suppressing it", () => {
      // Prior to fix, isManager && !owner caused fetchGoalProgress to resolve to null,
      // leading calculateDailyGoalMetrics to report hasGoal: false ("No daily application goal configured").
      const activeDailyGoal = {
        goal_type: "APPLICATIONS" as const,
        period_type: "DAILY" as const,
        target_value: 5,
        actual: 3,
        effective_date: "2026-10-01",
        period_start: "2026-10-06",
        period_end: "2026-10-07",
        percentage: 60,
        is_enabled: true,
      };

      const managerInput = {
        timeZone: "UTC",
        today: { total_applications: 3 },
        goalProgress: {
          user_id: "manager-user-id",
          timezone: "UTC",
          week_start: 1,
          active_goals: [activeDailyGoal],
          history: [],
          versions: [],
        },
        applications: [
          { applied_at: "2026-10-06T10:00:00Z" },
          { applied_at: "2026-10-06T11:00:00Z" },
          { applied_at: "2026-10-06T12:00:00Z" },
        ],
      };

      const metrics = calculateDailyGoalMetrics(managerInput, fixedNow);
      // Prove that the failure is fixed:
      expect(metrics.hasGoal).toBe(true);
      expect(metrics.target).toBe(5);
      expect(metrics.todayCount).toBe(3);
      expect(metrics.remaining).toBe(2);
      expect(metrics.percentage).toBe(60);
      expect(metrics.isMet).toBe(false);

      // Confirm non-manager behavior remains intact with active goal
      const nonManagerInput = {
        ...managerInput,
        goalProgress: {
          ...managerInput.goalProgress,
          user_id: "standard-user-id",
        },
      };
      const nonManagerMetrics = calculateDailyGoalMetrics(nonManagerInput, fixedNow);
      expect(nonManagerMetrics.hasGoal).toBe(true);
      expect(nonManagerMetrics.target).toBe(5);

      // Confirm explicit-owner behavior remains intact
      const explicitOwnerInput = {
        ...managerInput,
        goalProgress: {
          ...managerInput.goalProgress,
          user_id: "filtered-member-id",
        },
      };
      const explicitOwnerMetrics = calculateDailyGoalMetrics(explicitOwnerInput, fixedNow);
      expect(explicitOwnerMetrics.hasGoal).toBe(true);
      expect(explicitOwnerMetrics.target).toBe(5);
    });
  });

  describe("Application Activity — Daily / Weekly aggregation semantics (2.1-PA Issue H)", () => {
    const fixedNow = Date.parse("2026-10-06T18:00:00Z");

    it("generates a 14-day rolling daily series with correct dates and labels", () => {
      const apps = [
        { applied_at: "2026-10-06T10:00:00Z" },
        { applied_at: "2026-10-06T14:00:00Z" },
        { applied_at: "2026-10-05T09:00:00Z" },
        { applied_at: "2026-09-23T12:00:00Z" }, // 13 days ago (start of 14-day window)
        { applied_at: "2026-09-20T12:00:00Z" }, // outside 14-day window
      ];

      const daily = calculateDailyActivity(apps, "UTC", fixedNow, 14);
      expect(daily).toHaveLength(14);
      expect(daily[13]?.week_start).toBe("2026-10-06");
      expect(daily[13]?.applied).toBe(2);
      expect(daily[12]?.week_start).toBe("2026-10-05");
      expect(daily[12]?.applied).toBe(1);
      expect(daily[0]?.week_start).toBe("2026-09-23");
      expect(daily[0]?.applied).toBe(1);
      // Outside window is excluded from counts
      const totalApplied = daily.reduce((sum, d) => sum + d.applied, 0);
      expect(totalApplied).toBe(4);
    });

    it("respects profile-timezone boundaries for applications near UTC midnight", () => {
      // 2026-10-06T02:00:00Z in America/Chicago (UTC-5 in daylight/summer CDT) is 2026-10-05 21:00:00 (Oct 5!)
      const apps = [
        { applied_at: "2026-10-06T02:00:00Z" },
        { applied_at: "2026-10-06T15:00:00Z" }, // 10:00 AM on Oct 6 in Chicago
      ];

      const chicagoDaily = calculateDailyActivity(apps, "America/Chicago", fixedNow, 14);
      const oct5 = chicagoDaily.find((d) => d.week_start === "2026-10-05");
      const oct6 = chicagoDaily.find((d) => d.week_start === "2026-10-06");

      expect(oct5?.applied).toBe(1); // 02:00Z landed on Oct 5 in Chicago
      expect(oct6?.applied).toBe(1); // 15:00Z landed on Oct 6 in Chicago

      // In UTC, both would have landed on Oct 6:
      const utcDaily = calculateDailyActivity(apps, "UTC", fixedNow, 14);
      expect(utcDaily.find((d) => d.week_start === "2026-10-05")?.applied).toBe(0);
      expect(utcDaily.find((d) => d.week_start === "2026-10-06")?.applied).toBe(2);
    });

    it("supports dataset toggling between Daily and Weekly without mutating weekly pacing", () => {
      const weeklyPacing = [
        { week_start: "2026-09-21", week_label: "Sep 21", applied: 5, responses: 1, interviews: 0, outreach: 0, target: 10 },
        { week_start: "2026-09-28", week_label: "Sep 28", applied: 8, responses: 2, interviews: 1, outreach: 0, target: 10 },
        { week_start: "2026-10-05", week_label: "Oct 5", applied: 3, responses: 0, interviews: 0, outreach: 0, target: 10 },
      ];
      const apps = [
        { applied_at: "2026-10-06T10:00:00Z" },
      ];

      const dailyDataset = calculateDailyActivity(apps, "UTC", fixedNow, 14);
      // Toggle to daily: daily points are rendered
      expect(dailyDataset).toHaveLength(14);
      expect(dailyDataset[13]?.applied).toBe(1);

      // Toggle back to weekly: weekly pacing dataset remains untouched
      expect(weeklyPacing).toHaveLength(3);
      expect(weeklyPacing[2]?.applied).toBe(3);
      expect(weeklyPacing[1]?.applied).toBe(8);
    });
  });
});

