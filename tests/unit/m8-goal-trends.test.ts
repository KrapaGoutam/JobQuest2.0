import { describe, expect, it } from 'vitest';
import {
  calculateGoalPercentage,
  calculateGoalStatus,
  calculateGoalStreak,
  calculateGoalTrends,
  formatGoalDateLabel,
} from '../../apps/web/src/lib/goalAnalytics';
import { dayKey, previousDayKey } from '../../apps/web/src/lib/time';
import type { GoalProgressResponse } from '../../apps/web/src/types/analytics';

describe('JobQuest 2.1-F — Analytics Goal Trends Calculation Unit Tests', () => {
  describe('Format date labels', () => {
    it('formats YYYY-MM-DD into short month and day', () => {
      expect(formatGoalDateLabel('2026-10-01')).toBe('Oct 1');
      expect(formatGoalDateLabel('2026-10-15')).toBe('Oct 15');
      expect(formatGoalDateLabel('2026-12-31')).toBe('Dec 31');
    });
  });

  describe('Scenario A — Goal reached', () => {
    it('computes 100% completion and status MET when actual equals target', () => {
      const pct = calculateGoalPercentage(10, 10);
      const status = calculateGoalStatus(10, 10);
      expect(pct).toBe(100);
      expect(status).toBe('MET');
    });
  });

  describe('Scenario B — Goal exceeded', () => {
    it('computes uncapped percentage (>100%) and status MET when actual exceeds target', () => {
      const pct = calculateGoalPercentage(13, 10);
      const status = calculateGoalStatus(13, 10);
      expect(pct).toBe(130);
      expect(status).toBe('MET');
    });

    it('computes fractional percentages accurately without capping', () => {
      const pct = calculateGoalPercentage(17, 12);
      expect(pct).toBe(141.7);
    });
  });

  describe('Scenario C — Goal missed', () => {
    it('computes percentage below 100% and status MISSED when actual is below target', () => {
      const pct = calculateGoalPercentage(6, 10);
      const status = calculateGoalStatus(6, 10);
      expect(pct).toBe(60);
      expect(status).toBe('MISSED');
    });
  });

  describe('Scenario D & E — No goal exclusion and success rate', () => {
    it('excludes days without configured goal from success rate denominator', () => {
      // 30 days total: 20 days had goals (12 reached, 8 missed), 10 days had no goal
      const points = [
        ...Array.from({ length: 12 }, (_, i) => ({
          actual: 10,
          target: 10,
          status: 'MET' as const,
        })),
        ...Array.from({ length: 8 }, (_, i) => ({
          actual: 5,
          target: 10,
          status: 'MISSED' as const,
        })),
        ...Array.from({ length: 10 }, (_, i) => ({
          actual: 3,
          target: null,
          status: 'NO_GOAL' as const,
        })),
      ];

      const eligible = points.filter((p) => p.target !== null && p.target > 0);
      expect(eligible.length).toBe(20);

      const reached = eligible.filter((p) => p.actual >= p.target!).length;
      expect(reached).toBe(12);

      const successRate = Math.round((reached / eligible.length) * 100);
      // Success rate is 12 / 20 = 60%, NOT 12 / 30 = 40%
      expect(successRate).toBe(60);
    });

    it('returns null percentage for days without target', () => {
      expect(calculateGoalPercentage(5, null)).toBeNull();
      expect(calculateGoalPercentage(5, undefined)).toBeNull();
      expect(calculateGoalPercentage(5, 0)).toBeNull();
      expect(calculateGoalStatus(5, null)).toBe('NO_GOAL');
    });
  });

  describe('Scenario F — Average applications', () => {
    it('calculates average applications per active goal day', () => {
      const mockProgress: GoalProgressResponse = {
        user_id: 'test-user',
        timezone: 'UTC',
        week_start: 1,
        active_goals: [
          {
            goal_type: 'APPLICATIONS',
            period_type: 'DAILY',
            target_value: 10,
            effective_date: '2026-10-01',
            period_start: '2026-10-06',
            period_end: '2026-10-07',
            actual: 8,
            percentage: 80,
            is_enabled: true,
          },
        ],
        history: [
          {
            goal_type: 'APPLICATIONS',
            period_type: 'DAILY',
            target_value: 10,
            effective_date: '2026-10-01',
            period_start: '2026-10-01',
            period_end: '2026-10-02',
            actual: 8,
            percentage: 80,
            status: 'MISSED',
          },
          {
            goal_type: 'APPLICATIONS',
            period_type: 'DAILY',
            target_value: 10,
            effective_date: '2026-10-01',
            period_start: '2026-10-02',
            period_end: '2026-10-03',
            actual: 12,
            percentage: 120,
            status: 'MET',
          },
          {
            goal_type: 'APPLICATIONS',
            period_type: 'DAILY',
            target_value: 10,
            effective_date: '2026-10-01',
            period_start: '2026-10-03',
            period_end: '2026-10-04',
            actual: 6,
            percentage: 60,
            status: 'MISSED',
          },
          {
            goal_type: 'APPLICATIONS',
            period_type: 'DAILY',
            target_value: 10,
            effective_date: '2026-10-01',
            period_start: '2026-10-04',
            period_end: '2026-10-05',
            actual: 10,
            percentage: 100,
            status: 'MET',
          },
          {
            goal_type: 'APPLICATIONS',
            period_type: 'DAILY',
            target_value: 10,
            effective_date: '2026-10-01',
            period_start: '2026-10-05',
            period_end: '2026-10-06',
            actual: 6,
            percentage: 60,
            status: 'MISSED',
          },
        ],
        versions: [],
      };

      const trends = calculateGoalTrends({
        progress: mockProgress,
        now: Date.parse('2026-10-06T12:00:00Z'),
      });

      expect(trends.hasGoal).toBe(true);
      expect(trends.totalEligibleDays).toBe(5);
      expect(trends.daysReached).toBe(2);
      expect(trends.daysMissed).toBe(3);
      expect(trends.successRate).toBe(40);
      // Total: 8 + 12 + 6 + 10 + 6 = 42 across 5 days = 8.4
      expect(trends.totalApplications).toBe(42);
      expect(trends.averageDailyApplications).toBe(8.4);
    });
  });

  describe('Scenario G — Historical target change', () => {
    it('preserves distinct targets for each historical date when goal changes', () => {
      // Oct 1-5: Daily Goal = 10
      // Oct 6: Daily Goal changed to 15
      const mockProgress: GoalProgressResponse = {
        user_id: 'test-user',
        timezone: 'UTC',
        week_start: 1,
        active_goals: [
          {
            goal_type: 'APPLICATIONS',
            period_type: 'DAILY',
            target_value: 15,
            effective_date: '2026-10-06',
            period_start: '2026-10-06',
            period_end: '2026-10-07',
            actual: 15,
            percentage: 100,
            is_enabled: true,
          },
        ],
        history: [
          {
            goal_type: 'APPLICATIONS',
            period_type: 'DAILY',
            target_value: 10,
            effective_date: '2026-10-01',
            period_start: '2026-10-01',
            period_end: '2026-10-02',
            actual: 8,
            percentage: 80,
            status: 'MISSED',
          },
          {
            goal_type: 'APPLICATIONS',
            period_type: 'DAILY',
            target_value: 10,
            effective_date: '2026-10-01',
            period_start: '2026-10-02',
            period_end: '2026-10-03',
            actual: 12,
            percentage: 120,
            status: 'MET',
          },
          {
            goal_type: 'APPLICATIONS',
            period_type: 'DAILY',
            target_value: 10,
            effective_date: '2026-10-01',
            period_start: '2026-10-03',
            period_end: '2026-10-04',
            actual: 6,
            percentage: 60,
            status: 'MISSED',
          },
          {
            goal_type: 'APPLICATIONS',
            period_type: 'DAILY',
            target_value: 10,
            effective_date: '2026-10-01',
            period_start: '2026-10-04',
            period_end: '2026-10-05',
            actual: 10,
            percentage: 100,
            status: 'MET',
          },
          {
            goal_type: 'APPLICATIONS',
            period_type: 'DAILY',
            target_value: 10,
            effective_date: '2026-10-01',
            period_start: '2026-10-05',
            period_end: '2026-10-06',
            actual: 9,
            percentage: 90,
            status: 'MISSED',
          },
          {
            goal_type: 'APPLICATIONS',
            period_type: 'DAILY',
            target_value: 15,
            effective_date: '2026-10-06',
            period_start: '2026-10-06',
            period_end: '2026-10-07',
            actual: 15,
            percentage: 100,
            status: 'MET',
          },
        ],
        versions: [
          {
            id: 'v2',
            goal_type: 'APPLICATIONS',
            period_type: 'DAILY',
            target_value: 15,
            effective_date: '2026-10-06',
            is_enabled: true,
            created_at: '2026-10-06T00:00:00Z',
            updated_at: '2026-10-06T00:00:00Z',
          },
          {
            id: 'v1',
            goal_type: 'APPLICATIONS',
            period_type: 'DAILY',
            target_value: 10,
            effective_date: '2026-10-01',
            is_enabled: true,
            created_at: '2026-10-01T00:00:00Z',
            updated_at: '2026-10-01T00:00:00Z',
          },
        ],
      };

      const trends = calculateGoalTrends({
        progress: mockProgress,
        now: Date.parse('2026-10-06T18:00:00Z'),
      });

      expect(trends.trendPoints).toHaveLength(6);
      // Oct 1-5 must preserve their original target of 10
      expect(trends.trendPoints[0]!.target).toBe(10);
      expect(trends.trendPoints[0]!.percentage).toBe(80);
      expect(trends.trendPoints[1]!.target).toBe(10);
      expect(trends.trendPoints[1]!.percentage).toBe(120);
      expect(trends.trendPoints[2]!.target).toBe(10);
      expect(trends.trendPoints[2]!.percentage).toBe(60);
      expect(trends.trendPoints[3]!.target).toBe(10);
      expect(trends.trendPoints[3]!.percentage).toBe(100);
      expect(trends.trendPoints[4]!.target).toBe(10);
      expect(trends.trendPoints[4]!.percentage).toBe(90);

      // Oct 6 reflects the new target of 15
      expect(trends.trendPoints[5]!.target).toBe(15);
      expect(trends.trendPoints[5]!.percentage).toBe(100);

      // Verify that past periods were NOT retroactively rewritten with 15
      expect(trends.trendPoints.slice(0, 5).every((p) => p.target === 10)).toBe(true);
    });
  });

  describe('Scenario H — Timezone and day boundaries', () => {
    it('produces day keys consistent with 2.1-B profile timezone semantics', () => {
      // 2026-10-06T02:00:00Z in America/Chicago is 2026-10-05 21:00 (yesterday)
      const chicagoKey = dayKey('2026-10-06T02:00:00Z', 'America/Chicago');
      expect(chicagoKey).toBe('2026-10-05');

      const prev = previousDayKey(chicagoKey);
      expect(prev).toBe('2026-10-04');

      // 2026-10-06T15:00:00Z in America/Chicago is 2026-10-06 10:00 (today)
      const todayInChicago = dayKey('2026-10-06T15:00:00Z', 'America/Chicago');
      expect(todayInChicago).toBe('2026-10-06');
    });
  });

  describe('Streak calculations', () => {
    it('calculates consecutive eligible days reached', () => {
      const points = [
        { actual: 5, target: 10 }, // Missed
        { actual: 10, target: 10 }, // Met
        { actual: 12, target: 10 }, // Met
        { actual: 15, target: 10 }, // Met
      ];
      expect(calculateGoalStreak(points)).toBe(3);
    });

    it('does not count no-goal days as failures or streak breaks', () => {
      const points = [
        { actual: 10, target: 10 }, // Met
        { actual: 3, target: null }, // No goal day
        { actual: 12, target: 10 }, // Met
      ];
      // Eligible days are index 0 and 2; both met -> streak of 2
      expect(calculateGoalStreak(points)).toBe(2);
    });

    it('does not break streak if the current day is in-progress and below target', () => {
      const points = [
        { actual: 10, target: 10, status: 'MET' },
        { actual: 12, target: 10, status: 'MET' },
        { actual: 4, target: 10, status: 'CURRENT' }, // today in-progress
      ];
      // Streak from completed days remains 2
      expect(calculateGoalStreak(points)).toBe(2);
    });

    it('includes current day in streak if it already reached target', () => {
      const points = [
        { actual: 10, target: 10, status: 'MET' },
        { actual: 12, target: 10, status: 'MET' },
        { actual: 11, target: 10, status: 'CURRENT' }, // today reached!
      ];
      // All 3 count
      expect(calculateGoalStreak(points)).toBe(3);
    });

    it('returns 0 when most recent completed day missed target', () => {
      const points = [
        { actual: 10, target: 10, status: 'MET' },
        { actual: 4, target: 10, status: 'MISSED' },
      ];
      expect(calculateGoalStreak(points)).toBe(0);
    });
  });

  describe('Empty and boundary states', () => {
    it('handles null progress gracefully without throwing', () => {
      const trends = calculateGoalTrends({ progress: null });
      expect(trends.hasGoal).toBe(false);
      expect(trends.totalEligibleDays).toBe(0);
      expect(trends.daysReached).toBe(0);
      expect(trends.daysMissed).toBe(0);
      expect(trends.successRate).toBeNull();
      expect(trends.averageDailyApplications).toBe(0);
      expect(trends.currentStreak).toBe(0);
      expect(trends.trendPoints).toEqual([]);
    });

    it('handles goal configured with 0 applications', () => {
      const mockProgress: GoalProgressResponse = {
        user_id: 'test-user',
        timezone: 'UTC',
        week_start: 1,
        active_goals: [
          {
            goal_type: 'APPLICATIONS',
            period_type: 'DAILY',
            target_value: 10,
            effective_date: '2026-10-01',
            period_start: '2026-10-01',
            period_end: '2026-10-02',
            actual: 0,
            percentage: 0,
            is_enabled: true,
          },
        ],
        history: [
          {
            goal_type: 'APPLICATIONS',
            period_type: 'DAILY',
            target_value: 10,
            effective_date: '2026-10-01',
            period_start: '2026-10-01',
            period_end: '2026-10-02',
            actual: 0,
            percentage: 0,
            status: 'MISSED',
          },
        ],
        versions: [],
      };

      const trends = calculateGoalTrends({ progress: mockProgress });
      expect(trends.hasGoal).toBe(true);
      expect(trends.totalEligibleDays).toBe(1);
      expect(trends.daysReached).toBe(0);
      expect(trends.daysMissed).toBe(1);
      expect(trends.successRate).toBe(0);
      expect(trends.averageDailyApplications).toBe(0);
      expect(trends.currentStreak).toBe(0);
      expect(trends.trendPoints[0]!.actual).toBe(0);
      expect(trends.trendPoints[0]!.percentage).toBe(0);
    });
  });

  describe('Targeted UI behavior (Section 22)', () => {
    const multiDayProgress: GoalProgressResponse = {
      user_id: 'test-user',
      timezone: 'UTC',
      week_start: 1,
      active_goals: [
        {
          goal_type: 'APPLICATIONS',
          period_type: 'DAILY',
          target_value: 10,
          effective_date: '2026-10-01',
          period_start: '2026-10-10',
          period_end: '2026-10-11',
          actual: 8,
          percentage: 80,
          is_enabled: true,
        },
      ],
      history: [
        {
          goal_type: 'APPLICATIONS',
          period_type: 'DAILY',
          target_value: 10,
          effective_date: '2026-10-01',
          period_start: '2026-10-01',
          period_end: '2026-10-02',
          actual: 10,
          percentage: 100,
          status: 'MET',
        },
        {
          goal_type: 'APPLICATIONS',
          period_type: 'DAILY',
          target_value: 10,
          effective_date: '2026-10-01',
          period_start: '2026-10-02',
          period_end: '2026-10-03',
          actual: 7,
          percentage: 70,
          status: 'MISSED',
        },
        {
          goal_type: 'APPLICATIONS',
          period_type: 'DAILY',
          target_value: 10,
          effective_date: '2026-10-01',
          period_start: '2026-10-03',
          period_end: '2026-10-04',
          actual: 12,
          percentage: 120,
          status: 'MET',
        },
        {
          goal_type: 'APPLICATIONS',
          period_type: 'DAILY',
          target_value: 0, // no goal configured for this historical day
          effective_date: '2026-10-01',
          period_start: '2026-10-04',
          period_end: '2026-10-05',
          actual: 4,
          percentage: 0,
        },
        {
          goal_type: 'APPLICATIONS',
          period_type: 'DAILY',
          target_value: 10,
          effective_date: '2026-10-01',
          period_start: '2026-10-05',
          period_end: '2026-10-06',
          actual: 11,
          percentage: 110,
          status: 'MET',
        },
      ],
      versions: [],
    };

    it('range changes update and filter dataset cleanly', () => {
      // Full range: 5 points
      const full = calculateGoalTrends({ progress: multiDayProgress });
      expect(full.trendPoints).toHaveLength(5);

      // Sub-range: 2026-10-02 to 2026-10-04
      const subset = calculateGoalTrends({
        progress: multiDayProgress,
        startDate: '2026-10-02',
        endDate: '2026-10-04',
      });
      expect(subset.trendPoints).toHaveLength(3);
      expect(subset.trendPoints.map((p) => p.date)).toEqual([
        '2026-10-02',
        '2026-10-03',
        '2026-10-04',
      ]);
    });

    it('missing historical target does not fabricate completion or target', () => {
      const trends = calculateGoalTrends({ progress: multiDayProgress });
      const noGoalPoint = trends.trendPoints.find((p) => p.date === '2026-10-04');
      expect(noGoalPoint).toBeDefined();
      expect(noGoalPoint!.target).toBeNull();
      expect(noGoalPoint!.percentage).toBeNull();
      expect(noGoalPoint!.status).toBe('NO_GOAL');
      expect(noGoalPoint!.actual).toBe(4); // real actual count preserved
    });

    it('summary metrics correctly calculate reached, missed, eligible, and streak', () => {
      const trends = calculateGoalTrends({ progress: multiDayProgress });
      // Out of 5 points: 4 have target=10 (Oct 1, 2, 3, 5), 1 has no target (Oct 4)
      expect(trends.totalEligibleDays).toBe(4);
      // Reached: Oct 1 (10>=10), Oct 3 (12>=10), Oct 5 (11>=10) -> 3
      expect(trends.daysReached).toBe(3);
      // Missed: Oct 2 (7<10) -> 1
      expect(trends.daysMissed).toBe(1);
      // Success rate: 3 / 4 = 75%
      expect(trends.successRate).toBe(75);
      // Oct 4 (no goal) does not count as missed
      expect(trends.daysMissed).toBe(1);
      // Streak: Oct 5 met (1), Oct 4 (no goal, skipped), Oct 3 met (2), Oct 2 missed (break) -> streak is 2
      expect(trends.currentStreak).toBe(2);
    });
  });
});
