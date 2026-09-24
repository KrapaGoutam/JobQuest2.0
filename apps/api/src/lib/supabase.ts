import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../env';

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const;

/** Service-role client. Bypasses RLS — use only for the explicitly privileged paths. */
let adminClient: SupabaseClient | undefined;
export function admin(): SupabaseClient {
  adminClient ??= createClient(env().SUPABASE_URL, env().SUPABASE_SECRET_KEY, { auth: NO_SESSION });
  return adminClient;
}

/**
 * Fresh publishable-key client for GoTrue password/refresh grants. A new client per
 * call keeps sessions from different users from ever sharing in-memory state.
 * `clientIp` is forwarded so Supabase can (if it honours it) rate-limit per end user
 * rather than per façade instance — measured in M1 test T10b.
 */
export function authClient(clientIp?: string): SupabaseClient {
  return createClient(env().SUPABASE_URL, env().SUPABASE_PUBLISHABLE_KEY, {
    auth: NO_SESSION,
    global: { headers: clientIp ? { 'X-Forwarded-For': clientIp } : {} },
  });
}

/** Client that acts AS the end user: every query is evaluated by RLS with auth.uid(). */
export function userClient(accessToken: string): SupabaseClient {
  return createClient(env().SUPABASE_URL, env().SUPABASE_PUBLISHABLE_KEY, {
    auth: NO_SESSION,
    accessToken: async () => accessToken,
  });
}
