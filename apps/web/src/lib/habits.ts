/**
 * M6 habit progress, derived at query time (Gate 02B §8.1: "Streak calculation:
 * dynamically derived … based on user's timezone; resilient to weekend skips for
 * weekday habits"). Inputs are calendar-day keys already in the profile zone, so
 * nothing here depends on the browser's zone. Weeks start on profiles.week_start.
 */
export type HabitFrequency = 'DAILY' | 'WEEKDAYS' | 'WEEKLY';

export interface HabitLike {
  frequency: HabitFrequency;
  target_count: number;
}
export interface HabitLogLike {
  log_date: string;
  completed_count: number;
  target_count: number;
}
export type PeriodState = 'done' | 'partial' | 'missed';
export interface HabitProgress {
  /** Count in the current period (today, or this week for weekly habits). */
  current: number;
  target: number;
  done: boolean;
  /** False on weekends for weekday habits. */
  scheduledToday: boolean;
  currentStreak: number;
  bestStreak: number;
  /** Oldest → newest, the last 14 periods ending with the current one. */
  heat: PeriodState[];
}

export const LOOKBACK_DAYS = 365;

const toUtc = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
};
export const shiftKey = (key: string, days: number) => new Date(toUtc(key) + days * 86_400_000).toISOString().slice(0, 10);
const weekday = (key: string) => new Date(toUtc(key)).getUTCDay(); // 0 = Sunday
/** First day of the week containing `key` (weekStart 0 = Sunday, 1 = Monday). */
export function weekStartKey(key: string, weekStart: 0 | 1): string {
  return shiftKey(key, -((weekday(key) - weekStart + 7) % 7));
}

interface Period {
  key: string;
  count: number;
  target: number;
}

/** Periods newest → oldest, covering the lookback window. */
function periods(habit: HabitLike, logs: HabitLogLike[], today: string, weekStart: 0 | 1): Period[] {
  const byDay = new Map(logs.map((l) => [l.log_date, l]));
  const out: Period[] = [];
  if (habit.frequency === 'WEEKLY') {
    let start = weekStartKey(today, weekStart);
    for (let i = 0; i < Math.ceil(LOOKBACK_DAYS / 7); i++) {
      let count = 0;
      let target = 0;
      for (let d = 0; d < 7; d++) {
        const l = byDay.get(shiftKey(start, d));
        if (l) {
          count += l.completed_count;
          target = Math.max(target, l.target_count);
        }
      }
      out.push({ key: start, count, target: target || habit.target_count });
      start = shiftKey(start, -7);
    }
    return out;
  }
  for (let i = 0; i <= LOOKBACK_DAYS; i++) {
    const key = shiftKey(today, -i);
    if (habit.frequency === 'WEEKDAYS' && (weekday(key) === 0 || weekday(key) === 6)) continue; // weekends skipped
    const l = byDay.get(key);
    out.push({ key, count: l?.completed_count ?? 0, target: l?.target_count ?? habit.target_count });
  }
  return out;
}

const stateOf = (p: Period): PeriodState => (p.count >= p.target ? 'done' : p.count > 0 ? 'partial' : 'missed');

export function habitProgress(habit: HabitLike, logs: HabitLogLike[], today: string, weekStart: 0 | 1): HabitProgress {
  const ps = periods(habit, logs, today, weekStart);
  const scheduledToday = !(habit.frequency === 'WEEKDAYS' && (weekday(today) === 0 || weekday(today) === 6));
  const currentPeriod = habit.frequency === 'WEEKLY' || scheduledToday ? ps[0] : undefined;
  const current = currentPeriod?.count ?? 0;
  const target = currentPeriod ? (currentPeriod.count > 0 ? currentPeriod.target : habit.target_count) : habit.target_count;
  const done = currentPeriod ? current >= target : false;

  // The unfinished current period does not break a streak yet.
  let i = 0;
  if (currentPeriod && stateOf(currentPeriod) !== 'done') i = 1;
  let currentStreak = 0;
  for (; i < ps.length && stateOf(ps[i]!) === 'done'; i++) currentStreak++;

  let bestStreak = 0;
  let run = 0;
  for (let k = ps.length - 1; k >= 0; k--) {
    if (stateOf(ps[k]!) === 'done') {
      run++;
      bestStreak = Math.max(bestStreak, run);
    } else {
      run = 0;
    }
  }

  const heat = ps.slice(0, 14).map(stateOf).reverse();
  return { current, target, done, scheduledToday, currentStreak, bestStreak, heat };
}
