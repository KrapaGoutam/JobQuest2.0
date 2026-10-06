import type { Application, ApplicationSort } from '../types/applications';
import { dayKey, formatInZone, previousDayKey, zonedWallTimeToUtcIso } from './time';

export interface DateAddedRange {
  from: string;
  to: string;
}

export interface ApplicationMonthGroup {
  key: string;
  label: string;
  applications: Application[];
}

export interface ApplicationDateGroup {
  key: string;
  label: string;
  applications: Application[];
}

export type ApplicationGrouping = 'none' | 'date' | 'month';

/** Extract valid date string for grouping; prefers created_at (Date Added) aligned with Month grouping, then applied_at. */
export function getApplicationGroupingDate(app: Application): string | null {
  const val = app.created_at || app.applied_at;
  if (!val) return null;
  const parsed = Date.parse(val);
  return Number.isNaN(parsed) ? null : val;
}

/** Advance a calendar key without relying on the browser's local time zone. */
export function nextDateKey(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) throw new Error('Expected date YYYY-MM-DD');
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

/** Convert inclusive profile-zone date inputs into a half-open timestamptz range. */
export function dateAddedBounds(
  range: DateAddedRange,
  timeZone: string,
): { from?: string; toExclusive?: string } {
  return {
    from: range.from ? zonedWallTimeToUtcIso(range.from, '00:00', timeZone) : undefined,
    toExclusive: range.to
      ? zonedWallTimeToUtcIso(nextDateKey(range.to), '00:00', timeZone)
      : undefined,
  };
}

/** Group only the supplied result set; callers retain their existing page boundary. */
export function groupApplicationsByMonth(
  applications: Application[],
  timeZone: string,
  direction: 'asc' | 'desc' = 'desc',
): ApplicationMonthGroup[] {
  const groups = new Map<string, Application[]>();
  for (const application of applications) {
    const rawDate = getApplicationGroupingDate(application);
    const key = rawDate ? dayKey(rawDate, timeZone).slice(0, 7) : 'undated';
    const group = groups.get(key);
    if (group) group.push(application);
    else groups.set(key, [application]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => {
      if (left === 'undated') return 1;
      if (right === 'undated') return -1;
      return direction === 'asc' ? left.localeCompare(right) : right.localeCompare(left);
    })
    .map(([key, items]) => ({
      key,
      label:
        key === 'undated'
          ? 'No application date'
          : formatInZone(getApplicationGroupingDate(items[0]!)!, timeZone, { month: 'long', year: 'numeric' }),
      applications: items,
    }));
}

/** Group applications into day-level buckets; callers retain their existing page boundary. */
export function groupApplicationsByDate(
  applications: Application[],
  timeZone: string,
  direction: 'asc' | 'desc' = 'desc',
  now: number | string = Date.now(),
): ApplicationDateGroup[] {
  const todayKey = dayKey(now, timeZone);
  const yesterdayKey = previousDayKey(todayKey);

  const groups = new Map<string, Application[]>();
  for (const application of applications) {
    const rawDate = getApplicationGroupingDate(application);
    const key = rawDate ? dayKey(rawDate, timeZone) : 'undated';
    const group = groups.get(key);
    if (group) group.push(application);
    else groups.set(key, [application]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => {
      if (left === 'undated') return 1;
      if (right === 'undated') return -1;
      return direction === 'asc' ? left.localeCompare(right) : right.localeCompare(left);
    })
    .map(([key, items]) => {
      if (key === 'undated') {
        return {
          key,
          label: 'No application date',
          applications: items,
        };
      }
      let label: string;
      if (key === todayKey) {
        label = 'Today';
      } else if (key === yesterdayKey) {
        label = 'Yesterday';
      } else {
        label = formatInZone(getApplicationGroupingDate(items[0]!)!, timeZone, {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        });
      }
      return {
        key,
        label,
        applications: items,
      };
    });
}

export function sortDirectionLabel(sort: ApplicationSort): string {
  if (sort.field === 'created_at' || sort.field === 'applied_at' || sort.field === 'last_activity_at') {
    return sort.direction === 'asc' ? 'Oldest to newest' : 'Newest to oldest';
  }
  if (sort.field === 'company_name' || sort.field === 'role_title') {
    return sort.direction === 'asc' ? 'A to Z' : 'Z to A';
  }
  return sort.direction === 'asc' ? 'Ascending' : 'Descending';
}
