import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { isValidTimeZone } from '../lib/time';

/**
 * The signed-in user's profile time zone (profiles.timezone, IANA). Interview times
 * are always shown and entered in this zone, never the browser's. Shared across
 * components so a change made in one dialog updates every open view.
 */
let cached: { userId: string; zone: string } | null = null;
const listeners = new Set<(zone: string) => void>();

export function useProfileTimeZone(userId: string | null): {
  timeZone: string;
  loaded: boolean;
  setTimeZone: (zone: string) => Promise<void>;
} {
  const [zone, setZone] = useState<string>(cached && cached.userId === userId ? cached.zone : 'UTC');
  const [loaded, setLoaded] = useState<boolean>(Boolean(cached && cached.userId === userId));

  useEffect(() => {
    const onChange = (z: string) => setZone(z);
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
      .select('timezone')
      .eq('user_id', userId)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        const z = data?.timezone && isValidTimeZone(data.timezone) ? data.timezone : 'UTC';
        cached = { userId, zone: z };
        setZone(z);
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
      cached = { userId, zone: z };
      listeners.forEach((l) => l(z));
    },
    [userId],
  );

  return { timeZone: zone, loaded, setTimeZone };
}
