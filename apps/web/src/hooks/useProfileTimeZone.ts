import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { isValidTimeZone } from '../lib/time';

/**
 * The signed-in user's profile time zone (profiles.timezone, IANA) and week start
 * (profiles.week_start: 0 = Sunday, 1 = Monday). Dates and times are always shown
 * and entered in this zone, never the browser's; weekly groupings use weekStart.
 * Shared across components so a change made in one place updates every open view.
 */
interface ProfileTime {
  userId: string;
  zone: string;
  weekStart: 0 | 1;
}
let cached: ProfileTime | null = null;
const listeners = new Set<(p: ProfileTime) => void>();

export function useProfileTimeZone(userId: string | null): {
  timeZone: string;
  weekStart: 0 | 1;
  loaded: boolean;
  setTimeZone: (zone: string) => Promise<void>;
} {
  const mine = cached && cached.userId === userId ? cached : null;
  const [zone, setZone] = useState<string>(mine?.zone ?? 'UTC');
  const [weekStart, setWeekStart] = useState<0 | 1>(mine?.weekStart ?? 1);
  const [loaded, setLoaded] = useState<boolean>(Boolean(mine));

  useEffect(() => {
    const onChange = (p: ProfileTime) => {
      setZone(p.zone);
      setWeekStart(p.weekStart);
    };
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  useEffect(() => {
    if (!userId || (cached && cached.userId === userId)) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('timezone, week_start')
      .eq('user_id', userId)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        const z = data?.timezone && isValidTimeZone(data.timezone) ? data.timezone : 'UTC';
        const w: 0 | 1 = data?.week_start === 0 ? 0 : 1;
        cached = { userId, zone: z, weekStart: w };
        setZone(z);
        setWeekStart(w);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setTimeZone = useCallback(
    async (z: string) => {
      if (!userId) return;
      const { error } = await supabase.from('profiles').update({ timezone: z }).eq('user_id', userId);
      if (error) throw new Error(error.message.includes('INVALID_TIMEZONE') ? 'That is not a valid time zone.' : error.message);
      cached = { userId, zone: z, weekStart: cached?.userId === userId ? cached.weekStart : 1 };
      listeners.forEach((l) => l(cached!));
    },
    [userId],
  );

  return { timeZone: zone, weekStart, loaded, setTimeZone };
}
