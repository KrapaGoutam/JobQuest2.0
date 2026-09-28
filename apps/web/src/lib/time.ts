/**
 * Time-zone handling for interviews (M5). Timestamps are stored in UTC
 * (timestamptz); everything a person sees or types is in their profile's IANA
 * time zone (profiles.timezone), never the browser's zone. All conversions go
 * through Intl, so daylight-saving rules come from the platform's tz database.
 */

const partsCache = new Map<string, Intl.DateTimeFormat>();

function wallClockFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(epochMs: number, timeZone: string): WallClock {
  const out: Record<string, number> = {};
  for (const p of wallClockFormatter(timeZone).formatToParts(new Date(epochMs))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year!,
    month: out.month!,
    day: out.day!,
    hour: out.hour === 24 ? 0 : out.hour!,
    minute: out.minute!,
    second: out.second!,
  };
}

/** Offset of `timeZone` from UTC at the instant `epochMs`, in milliseconds (east positive). */
export function zoneOffsetMs(epochMs: number, timeZone: string): number {
  const w = wallClock(epochMs, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

/** True when `timeZone` is an IANA name this platform understands. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export class NonexistentLocalTimeError extends Error {
  constructor(public readonly date: string, public readonly time: string, public readonly timeZone: string) {
    super(`${date} ${time} does not exist in ${timeZone} (the clocks skip that hour for daylight saving time).`);
    this.name = 'NonexistentLocalTimeError';
  }
}

/**
 * Convert a wall-clock date ('YYYY-MM-DD') and time ('HH:mm') in `timeZone` to a
 * UTC ISO string. An ambiguous time (clocks fall back) resolves to its first
 * occurrence; a time inside a spring-forward gap throws NonexistentLocalTimeError.
 */
export function zonedWallTimeToUtcIso(date: string, time: string, timeZone: string): string {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dm || !tm) throw new Error('Expected date YYYY-MM-DD and time HH:mm');
  const [y, mo, d, h, mi] = [Number(dm[1]), Number(dm[2]), Number(dm[3]), Number(tm[1]), Number(tm[2])];
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  // Try the offsets in force just before and just after the wall time; the
  // earlier valid instant wins, so an ambiguous time maps to its first occurrence.
  const candidates = [zoneOffsetMs(naive - 86_400_000, timeZone), zoneOffsetMs(naive, timeZone), zoneOffsetMs(naive + 86_400_000, timeZone)]
    .map((off) => naive - off)
    .filter((t, i, all) => all.indexOf(t) === i)
    .filter((t) => {
      const w = wallClock(t, timeZone);
      return w.year === y && w.month === mo && w.day === d && w.hour === h && w.minute === mi;
    })
    .sort((a, b) => a - b);
  if (candidates.length === 0) throw new NonexistentLocalTimeError(date, time, timeZone);
  return new Date(candidates[0]!).toISOString();
}

/** Wall-clock date ('YYYY-MM-DD') and time ('HH:mm') of a UTC instant in `timeZone` (for editing). */
export function utcIsoToZonedWallTime(iso: string, timeZone: string): { date: string; time: string } {
  const w = wallClock(Date.parse(iso), timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${w.year}-${pad(w.month)}-${pad(w.day)}`, time: `${pad(w.hour)}:${pad(w.minute)}` };
}

/** Calendar day key ('YYYY-MM-DD') of an instant in `timeZone`. */
export function dayKey(iso: string | number, timeZone: string): string {
  return utcIsoToZonedWallTime(typeof iso === 'number' ? new Date(iso).toISOString() : iso, timeZone).date;
}

/** Whole calendar days from `fromKey` to `toKey` (both 'YYYY-MM-DD'). */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  const p = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((p(toKey) - p(fromKey)) / 86_400_000);
}

/** Format an instant in `timeZone` with Intl options (en-US). */
export function formatInZone(iso: string, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, ...options }).format(new Date(iso));
}

/** Short zone label for an instant, e.g. "CDT", "CST", "GMT+5:30". */
export function zoneAbbreviation(iso: string, timeZone: string): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
    .formatToParts(new Date(iso))
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? timeZone;
}

/** "2:30 PM" */
export function formatTime(iso: string, timeZone: string): string {
  return formatInZone(iso, timeZone, { hour: 'numeric', minute: '2-digit' });
}

/** "Thu, Sep 24 · 2:30–3:00 PM CDT" */
export function formatSlot(iso: string, durationMinutes: number, timeZone: string): string {
  const end = new Date(Date.parse(iso) + durationMinutes * 60_000).toISOString();
  const day = formatInZone(iso, timeZone, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} · ${formatTime(iso, timeZone)}–${formatTime(end, timeZone)} ${zoneAbbreviation(iso, timeZone)}`;
}

/** Human label for a zone, e.g. "America/Chicago (CDT)". */
export function zoneLabel(timeZone: string, at: string = new Date().toISOString()): string {
  return `${timeZone.replace(/_/g, ' ')} (${zoneAbbreviation(at, timeZone)})`;
}

/** ICU still reports some zones by their legacy names; offer the current IANA names instead. */
const MODERN_NAMES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Europe/Kiev': 'Europe/Kyiv',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'America/Godthab': 'America/Nuuk',
  'Pacific/Truk': 'Pacific/Chuuk',
  'Pacific/Ponape': 'Pacific/Pohnpei',
  'Pacific/Enderbury': 'Pacific/Kanton',
};

/** IANA zones offered in the picker (modern names, sorted, always including `current`). */
export function supportedTimeZones(current?: string): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  const raw = intl.supportedValuesOf?.('timeZone') ?? [
    'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
    'Europe/London', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney',
  ];
  const set = new Set(raw.map((z) => MODERN_NAMES[z] ?? z));
  set.add('UTC');
  if (current) set.add(current);
  return [...set].sort((a, b) => (a === 'UTC' ? -1 : b === 'UTC' ? 1 : a.localeCompare(b)));
}
