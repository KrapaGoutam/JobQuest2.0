import { describe, expect, it } from 'vitest';
import {
  NonexistentLocalTimeError,
  dayKey,
  daysBetweenKeys,
  formatSlot,
  formatTime,
  isValidTimeZone,
  utcIsoToZonedWallTime,
  zoneAbbreviation,
  zonedWallTimeToUtcIso,
} from '../../apps/web/src/lib/time';

describe('M5 time zones: wall time → UTC (storage)', () => {
  it('converts a normal wall time in a DST zone (CDT = UTC−5)', () => {
    expect(zonedWallTimeToUtcIso('2026-09-24', '14:30', 'America/Chicago')).toBe('2026-09-24T19:30:00.000Z');
  });
  it('uses standard time after the fall-back (CST = UTC−6)', () => {
    expect(zonedWallTimeToUtcIso('2026-11-02', '14:30', 'America/Chicago')).toBe('2026-11-02T20:30:00.000Z');
  });
  it('resolves an ambiguous fall-back time to its first occurrence', () => {
    // 2026-11-01 01:30 happens twice in Chicago: 06:30Z (CDT) and 07:30Z (CST).
    expect(zonedWallTimeToUtcIso('2026-11-01', '01:30', 'America/Chicago')).toBe('2026-11-01T06:30:00.000Z');
  });
  it('rejects a time inside the spring-forward gap', () => {
    expect(() => zonedWallTimeToUtcIso('2026-03-08', '02:30', 'America/Chicago')).toThrow(NonexistentLocalTimeError);
    expect(zonedWallTimeToUtcIso('2026-03-08', '03:00', 'America/Chicago')).toBe('2026-03-08T08:00:00.000Z');
  });
  it('handles Europe/London across its own (different) DST dates', () => {
    expect(zonedWallTimeToUtcIso('2026-03-28', '09:00', 'Europe/London')).toBe('2026-03-28T09:00:00.000Z');
    expect(zonedWallTimeToUtcIso('2026-03-30', '09:00', 'Europe/London')).toBe('2026-03-30T08:00:00.000Z');
  });
  it('handles half-hour offsets without DST (Asia/Kolkata = UTC+5:30)', () => {
    expect(zonedWallTimeToUtcIso('2026-06-01', '10:00', 'Asia/Kolkata')).toBe('2026-06-01T04:30:00.000Z');
  });
  it('handles a 30-minute DST shift (Australia/Lord_Howe)', () => {
    expect(zonedWallTimeToUtcIso('2026-01-15', '12:00', 'Australia/Lord_Howe')).toBe('2026-01-15T01:00:00.000Z'); // +11
    expect(zonedWallTimeToUtcIso('2026-06-15', '12:00', 'Australia/Lord_Howe')).toBe('2026-06-15T01:30:00.000Z'); // +10:30
  });
  it('round-trips UTC → wall time → UTC for every hour of a DST-change week', () => {
    for (let h = 0; h < 24 * 7; h++) {
      const iso = new Date(Date.UTC(2026, 10, 29, 0) + h * 3_600_000).toISOString(); // Oct 29 – Nov 5 (US fall-back)
      const wall = utcIsoToZonedWallTime(iso, 'America/Chicago');
      const back = zonedWallTimeToUtcIso(wall.date, wall.time, 'America/Chicago');
      // The second 01:xx of fall-back maps to the first occurrence by design.
      const expected = iso === '2026-11-01T07:00:00.000Z' ? '2026-11-01T06:00:00.000Z' : iso;
      expect(back, iso).toBe(expected);
    }
  });
});

describe('M5 time zones: display in the profile zone (not the browser zone)', () => {
  const iso = '2026-09-24T19:30:00.000Z';
  it('renders the same instant differently per profile zone', () => {
    expect(formatTime(iso, 'America/Chicago')).toBe('2:30 PM');
    expect(formatTime(iso, 'Asia/Kolkata')).toBe('1:00 AM');
    expect(formatTime(iso, 'UTC')).toBe('7:30 PM');
  });
  it('puts the instant on the right calendar day in each zone', () => {
    expect(dayKey(iso, 'America/Chicago')).toBe('2026-09-24');
    expect(dayKey(iso, 'Asia/Kolkata')).toBe('2026-09-25');
  });
  it('labels the slot with the zone abbreviation in force at that instant', () => {
    expect(formatSlot(iso, 30, 'America/Chicago')).toBe('Thu, Sep 24 · 2:30 PM–3:00 PM CDT');
    expect(zoneAbbreviation('2026-12-01T12:00:00Z', 'America/Chicago')).toBe('CST');
  });
  it('edits round-trip through the wall-clock form', () => {
    expect(utcIsoToZonedWallTime(iso, 'America/Chicago')).toEqual({ date: '2026-09-24', time: '14:30' });
  });
  it('counts calendar days between day keys across DST', () => {
    expect(daysBetweenKeys('2026-10-31', '2026-11-02')).toBe(2);
  });
  it('validates IANA names', () => {
    expect(isValidTimeZone('America/Chicago')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
  });
});

describe('M5 time zones: picker list', () => {
  it('offers modern IANA names, UTC first, and always the current zone', async () => {
    const { supportedTimeZones } = await import('../../apps/web/src/lib/time');
    const zones = supportedTimeZones('America/Argentina/Buenos_Aires');
    expect(zones[0]).toBe('UTC');
    expect(zones).toContain('Asia/Kolkata');
    expect(zones).not.toContain('Asia/Calcutta');
    expect(zones).toContain('America/Argentina/Buenos_Aires');
  });
});
