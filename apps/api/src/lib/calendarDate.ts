// Date-only (YYYY-MM-DD) helpers. Pure UTC arithmetic on a calendar date: no time zone is
// involved here; the zone that DEFINES a digest date lives in aiDigestService.
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(v: string): boolean {
  return DATE.test(v) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);
}

export function shiftCalendarDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export const nextCalendarDate = (v: string): string => shiftCalendarDate(v, 1);
