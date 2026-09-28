import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../env';

/**
 * Service-role client: ONLY for explicit privileged auth operations (credential,
 * session and recovery RPCs). Never used for routine user CRUD, which goes browser →
 * Data API under RLS with the user's own access token.
 */
let adminClient: SupabaseClient | undefined;
export function admin(): SupabaseClient {
  adminClient ??= createClient(env().SUPABASE_URL, env().SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return adminClient;
}

/** Test hook. */
export function resetAdminClient(): void {
  adminClient = undefined;
}

/** A Data API client acting AS the caller (their JobQuest access token), under RLS. */
export function userClient(accessToken: string): SupabaseClient {
  return createClient(env().SUPABASE_URL, env().SUPABASE_PUBLISHABLE_KEY, {
    accessToken: async () => accessToken,
  });
}
