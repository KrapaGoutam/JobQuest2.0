import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

let currentToken: string | null = null;
export function setAccessToken(t: string | null): void {
  currentToken = t;
}

/**
 * Direct browser → PostgREST client (hybrid architecture tier 1).
 * `accessToken` mode: the token lives only in memory; supabase-js never persists a
 * session and `supabase.auth.*` is disabled, so no GoTrue user object is fetched.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  accessToken: async () => currentToken,
});
