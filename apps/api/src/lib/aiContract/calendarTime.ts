// Calendar time semantics (AI-7). No server-local-time assumption anywhere: every conversion goes
// through Intl with an explicit IANA zone, so daylight-saving rules come from the platform tz database.
//
//   * Storage is always an absolute UTC instant (ISO string, ms precision) plus the SOURCE zone name.
//   * A wall-clock time ("2026-03-08T10:00") needs a zone. A time inside a spring-forward gap does not
//     exist and is rejected; an ambiguous time (clocks fall back) resolves to its FIRST occurrence.
//   * All-day items are calendar DATES, never instants; they are anchored at local midnight only to
//     give them a sort position.

export function isIanaTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length === 0 || zone.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true; } catch { return false; }
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function wallFormatter(zone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    fmtCache.set(zone, f);
  }
  return f;
}

interface Wall { year: number; month: number; day: number; hour: number; minute: number; second: number }
function wall(epochMs: number, zone: string): Wall {
  const out: Record<string, number> = {};
  for (const p of wallFormatter(zone).formatToParts(new Date(epochMs))) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return { year: out.year!, month: out.month!, day: out.day!, hour: out.hour === 24 ? 0 : out.hour!, minute: out.minute!, second: out.second! };
}

/** Offset of `zone` from UTC at `epochMs` in ms (east positive). */
export function zoneOffsetAt(epochMs: number, zone: string): number {
  const w = wall(epochMs, zone);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(epochMs / 1000) * 1000;
}

export type LocalResolution =
  | { ok: true; iso: string; ambiguous: boolean }
  | { ok: false; reason: 'nonexistent' | 'malformed' };

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;

/** Wall-clock `YYYY-MM-DDTHH:mm[:ss]` in `zone` -> UTC ISO instant. */
export function localToInstant(local: string, zone: string): LocalResolution {
  const m = LOCAL.exec(local.trim());
  if (!m || !isIanaTimeZone(zone)) return { ok: false, reason: 'malformed' };
  const [y, mo, d, h, mi, s] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return { ok: false, reason: 'malformed' };
  if (new Date(Date.UTC(y, mo - 1, d)).getUTCDate() !== d) return { ok: false, reason: 'malformed' }; // e.g. Feb 30
  const naive = Date.UTC(y, mo - 1, d, h, mi, s);
  // Offsets in force a day before and after bracket any DST transition; keep candidates that round-trip.
  const candidates = [...new Set([zoneOffsetAt(naive - 86_400_000, zone), zoneOffsetAt(naive, zone), zoneOffsetAt(naive + 86_400_000, zone)].map((off) => naive - off))]
    .filter((t) => {
      const w = wall(t, zone);
      return w.year === y && w.month === mo && w.day === d && w.hour === h && w.minute === mi && w.second === s;
    })
    .sort((a, b) => a - b);
  if (candidates.length === 0) return { ok: false, reason: 'nonexistent' };
  return { ok: true, iso: new Date(candidates[0]!).toISOString(), ambiguous: candidates.length > 1 };
}

/** UTC instant of local midnight at the start of `date` (YYYY-MM-DD) in `zone` (UTC when zone is null/invalid). */
export function localMidnight(date: string, zone: string | null): string {
  const z = zone && isIanaTimeZone(zone) ? zone : 'UTC';
  const r = localToInstant(`${date}T00:00:00`, z);
  if (r.ok) return r.iso;
  // Midnight skipped by DST (a few zones): use the first valid instant of that day.
  const naive = Date.parse(`${date}T00:00:00Z`);
  return new Date(naive - zoneOffsetAt(naive + 3_600_000, z)).toISOString();
}

/** Offset text of `iso` (e.g. "-05:00") must agree with the zone at that instant; returns the zone's offset in minutes. */
export function zoneOffsetMinutes(iso: string, zone: string): number {
  return Math.round(zoneOffsetAt(Date.parse(iso), zone) / 60_000);
}

/** Offset (minutes) written in an ISO string with explicit offset; Z = 0. */
export function stringOffsetMinutes(ts: string): number | null {
  if (/Z$/i.test(ts.trim())) return 0;
  const m = /([+-])(\d{2}):(\d{2})$/.exec(ts.trim());
  if (!m) return null;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}
