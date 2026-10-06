import type {
  GoalPeriod,
  GoalProgressPoint,
  GoalProgressResponse,
  GoalType,
} from '../types/analytics';
import { dayKey } from './time';

export interface GoalTrendPoint {
  date: string; // 'YYYY-MM-DD'
  label: string; // formatted e.g. 'Oct 1'
  target: number | null; // target or null if no goal
  actual: number; // actual applications count
  percentage: number | null; // uncapped actual / target * 100, or null if no target
  status: 'MET' | 'MISSED' | 'NO_GOAL' | 'CURRENT';
}

export interface GoalAnalyticsSummary {
  hasGoal: boolean;
  goalType: GoalType;
  periodType: GoalPeriod;
  currentDailyTarget: number | null;
  todayCount: number | null;
  todayPercentage: number | null;
  totalEligibleDays: number;
  daysReached: number;
  daysMissed: number;
  successRate: number | null;
  totalApplications: number;
  averageDailyApplications: number;
  currentStreak: number;
  trendPoints: GoalTrendPoint[];
}

export interface CalculateGoalTrendsOptions {
  progress?: GoalProgressResponse | null;
  goalType?: GoalType;
  periodType?: GoalPeriod;
  startDate?: string;
  endDate?: string;
  timeZone?: string;
  now?: number;
}

/**
 * Format a YYYY-MM-DD key into a short display label (e.g. "Oct 1").
 */
export function formatGoalDateLabel(dateKey: string): string {
  if (!dateKey || !dateKey.includes('-')) return dateKey;
  const parts = dateKey.split('-').map(Number);
  const year = parts[0]!;
  const month = parts[1]!;
  const day = parts[2]!;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Calculate completion percentage (actual / target * 100).
 * Numeric values are NOT capped at 100%. Returns null if target is null/0.
 */
export function calculateGoalPercentage(
  actual: number,
  target: number | null | undefined,
): number | null {
  if (target === null || target === undefined || target <= 0) {
    return null;
  }
  return Math.round((actual / target) * 1000) / 10;
}

/**
 * Determine period status: MET (actual >= target), MISSED (actual < target),
 * CURRENT (in progress today and actual < target), or NO_GOAL.
 */
export function calculateGoalStatus(
  actual: number,
  target: number | null | undefined,
  isCurrent = false,
): 'MET' | 'MISSED' | 'NO_GOAL' | 'CURRENT' {
  if (target === null || target === undefined || target <= 0) {
    return 'NO_GOAL';
  }
  if (actual >= target) {
    return 'MET';
  }
  if (isCurrent) {
    return 'CURRENT';
  }
  return 'MISSED';
}

/**
 * Calculate consecutive eligible goal days where actual >= target.
 * Points must be ordered chronologically (oldest to newest).
 * - A day without a configured goal does not break the streak.
 * - An in-progress current day that hasn't reached the goal yet does not break
 *   a streak achieved through yesterday.
 */
export function calculateGoalStreak(
  points: Array<{ actual: number; target: number | null; status?: string }>,
): number {
  const eligible = points.filter(
    (p) => p.target !== null && typeof p.target === 'number' && p.target > 0,
  );
  if (eligible.length === 0) return 0;

  let streak = 0;
  for (let i = eligible.length - 1; i >= 0; i--) {
    const p = eligible[i]!;
    if (p.actual >= p.target!) {
      streak++;
    } else {
      // If the latest point is currently in progress, it hasn't failed yet
      if (p.status === 'CURRENT' && i === eligible.length - 1) {
        continue;
      }
      break;
    }
  }
  return streak;
}

/**
 * Primary calculation for goal analytics trends and summary metrics.
 */
export function calculateGoalTrends(
  options: CalculateGoalTrendsOptions,
): GoalAnalyticsSummary {
  const {
    progress,
    goalType = 'APPLICATIONS',
    periodType = 'DAILY',
    startDate,
    endDate,
    timeZone = progress?.timezone || 'UTC',
    now = Date.now(),
  } = options;

  const todayKey = dayKey(now, timeZone);

  // Check active goal for this metric
  const activeGoal = progress?.active_goals?.find(
    (g) => g.goal_type === goalType && g.is_enabled !== false,
  );

  // If there's an active goal of this type, determine its periodType
  const effectivePeriodType = activeGoal?.period_type || periodType;

  // Check if any version or active goal exists for this metric
  const hasConfiguredGoal = Boolean(
    activeGoal ||
      progress?.versions?.some(
        (v) => v.goal_type === goalType && v.is_enabled !== false,
      ),
  );

  const currentDailyTarget =
    activeGoal && effectivePeriodType === 'DAILY'
      ? activeGoal.target_value
      : null;
  const todayCount =
    activeGoal && effectivePeriodType === 'DAILY' ? activeGoal.actual : null;
  const todayPercentage =
    currentDailyTarget !== null && currentDailyTarget > 0 && todayCount !== null
      ? calculateGoalPercentage(todayCount, currentDailyTarget)
      : null;

  // Extract history points for this metric and period type
  const rawHistory: GoalProgressPoint[] = (progress?.history ?? []).filter(
    (h) => h.goal_type === goalType && h.period_type === effectivePeriodType,
  );

  // Sort chronologically ascending
  const sortedHistory = [...rawHistory].sort((a, b) =>
    a.period_start.localeCompare(b.period_start),
  );

  // Filter by date range bounds if provided
  const startKey = startDate ? startDate.slice(0, 10) : null;
  const endKey = endDate ? endDate.slice(0, 10) : null;

  const inRangeHistory = sortedHistory.filter((point) => {
    if (startKey && point.period_start < startKey) return false;
    if (endKey && point.period_start > endKey) return false;
    return true;
  });

  // Map to GoalTrendPoint
  const trendPoints: GoalTrendPoint[] = inRangeHistory.map((point) => {
    const isCurrent =
      point.period_start === todayKey || point.status === 'CURRENT';
    const target = point.target_value > 0 ? point.target_value : null;
    const actual = point.actual ?? 0;
    const percentage = calculateGoalPercentage(actual, target);
    const status = calculateGoalStatus(actual, target, isCurrent);

    return {
      date: point.period_start,
      label: formatGoalDateLabel(point.period_start),
      target,
      actual,
      percentage,
      status,
    };
  });

  // Eligible days are only days with a configured goal target > 0
  const eligiblePoints = trendPoints.filter(
    (p) => p.target !== null && p.target > 0,
  );
  const totalEligibleDays = eligiblePoints.length;

  const daysReached = eligiblePoints.filter((p) => p.actual >= p.target!).length;
  const daysMissed = eligiblePoints.filter(
    (p) => p.actual < p.target! && p.status !== 'CURRENT',
  ).length;

  // Success rate is strictly based on eligible goal days
  const successRate =
    totalEligibleDays > 0
      ? Math.round((daysReached / totalEligibleDays) * 100)
      : null;

  const totalApplications = trendPoints.reduce((sum, p) => sum + p.actual, 0);

  // Average daily applications on active days
  const averageDailyApplications =
    totalEligibleDays > 0
      ? Math.round((totalApplications / totalEligibleDays) * 10) / 10
      : trendPoints.length > 0
        ? Math.round((totalApplications / trendPoints.length) * 10) / 10
        : 0;

  const currentStreak = calculateGoalStreak(trendPoints);

  return {
    hasGoal: hasConfiguredGoal,
    goalType,
    periodType: effectivePeriodType,
    currentDailyTarget,
    todayCount,
    todayPercentage,
    totalEligibleDays,
    daysReached,
    daysMissed,
    successRate,
    totalApplications,
    averageDailyApplications,
    currentStreak,
    trendPoints,
  };
}
