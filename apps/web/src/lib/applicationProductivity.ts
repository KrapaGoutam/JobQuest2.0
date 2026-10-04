import type { Application, ApplicationSort } from '../types/applications';
import { dayKey, formatInZone, zonedWallTimeToUtcIso } from './time';

export interface DateAddedRange {
  from: string;
  to: string;
}

export interface ApplicationMonthGroup {
  key: string;
  label: string;
  applications: Application[];
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
    const key = dayKey(application.created_at, timeZone).slice(0, 7);
    const group = groups.get(key);
    if (group) group.push(application);
    else groups.set(key, [application]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => direction === 'asc' ? left.localeCompare(right) : right.localeCompare(left))
    .map(([key, items]) => ({
      key,
      label: formatInZone(items[0]!.created_at, timeZone, { month: 'long', year: 'numeric' }),
      applications: items,
    }));
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
