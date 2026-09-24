import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod';
import type { Session } from '@supabase/supabase-js';
import { env, ALIAS_DOMAIN } from '../env';
import { admin, authClient } from '../lib/supabase';
import { checkPassword, normalizeUsername } from '../lib/credentials';
import { generateCodeSet, normalizeCode, verifyCode, HINT_CHARS, CODES_PER_SET } from '../lib/recovery';
import { SlidingWindowLimiter } from '../lib/rateLimit';
import {
  REFRESH_COOKIE, bearer, clearSessionCookies, clientIp, floor,
  requireCsrfToken, setSessionCookies,
} from '../lib/security';

// ---------------------------------------------------------------------------------
// Per-IP limiters (in-memory, see rateLimit.ts). Per-account limits are in Postgres.
// ---------------------------------------------------------------------------------
export const limiters = {
  loginIp: () => (limitersState.loginIp ??= new SlidingWindowLimiter(env().LOGIN_IP_MAX_PER_15M, 15 * 60_000)),
  registerIp: () => (limitersState.registerIp ??= new SlidingWindowLimiter(env().REGISTER_IP_MAX_PER_HOUR, 60 * 60_000)),
  recoverIp: () => (limitersState.recoverIp ??= new SlidingWindowLimiter(env().RECOVERY_IP_MAX_PER_HOUR, 60 * 60_000)),
  passwordUser: () => (limitersState.passwordUser ??= new SlidingWindowLimiter(3, 60 * 60_000)),
};
const limitersState: Partial<Record<keyof typeof limiters, SlidingWindowLimiter>> = {};
export function resetLimiters(): void {
  for (const k of Object.keys(limitersState) as (keyof typeof limiters)[]) delete limitersState[k];
}

// ---------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------
type ErrorCode =
  | 'INVALID_INPUT' | 'USERNAME_TAKEN' | 'WEAK_PASSWORD' | 'INVALID_CREDENTIALS'
  | 'RATE_LIMITED' | 'UNAUTHENTICATED' | 'INVALID_RECOVERY' | 'INTERNAL';

function fail(c: Context, status: 400 | 401 | 403 | 409 | 422 | 429 | 500, code: ErrorCode, message: string, retryAfter?: number) {
  if (retryAfter) c.header('Retry-After', String(retryAfter));
  return c.json({ error: { code, message } }, status);
}

/** Public session shape. Deliberately excludes GoTrue's `user` object (it holds the alias). */
function publicSession(s: Session) {
  return { access_token: s.access_token, expires_at: s.expires_at, token_type: 'bearer' as const };
}

async function accountByUsername(clean: string) {
  const { data } = await admin()
    .from('user_accounts')
    .select('user_id, username, status, failed_login_count, locked_until, failed_recovery_count, recovery_locked_until')
    .eq('username_clean', clean)
    .maybeSingle();
  return data;
}

/** Internal alias lives only in auth.users (service role). Never stored in public tables. */
async function aliasFor(userId: string): Promise<string | null> {
  const { data } = await admin().auth.admin.getUserById(userId);
  const email = data.user?.email ?? null;
  return email && email.endsWith(`@${ALIAS_DOMAIN}`) ? email : null;
}

async function passwordGrant(alias: string, password: string, ip: string) {
  const { data, error } = await authClient(ip).auth.signInWithPassword({ email: alias, password });
  return error || !data.session ? { session: null, status: error?.status } : { session: data.session, status: 200 };
}

/** Validates a bearer access token with GoTrue (checks signature + live session). */
async function authenticate(c: Context): Promise<{ userId: string; token: string } | null> {
  const token = bearer(c);
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) return null;
  return { userId: data.user.id, token };
}

async function profileSummary(userId: string) {
  const [{ data: acct }, { data: prof }] = await Promise.all([
    admin().from('user_accounts').select('username').eq('user_id', userId).single(),
    admin().from('profiles').select('display_name, last_active_workspace_id').eq('user_id', userId).single(),
  ]);
  return {
    id: userId,
    username: acct?.username as string,
    display_name: (prof?.display_name as string | null) ?? null,
    active_workspace_id: (prof?.last_active_workspace_id as string | null) ?? null,
  };
}

// ---------------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------------
export const auth = new Hono();

const RegisterBody = z.object({
  username: z.string(),
  password: z.string(),
  email: z.email().max(255).optional().or(z.literal('')),
  phone: z.string().max(32).regex(/^\+?[0-9 ()-]{6,32}$/).optional().or(z.literal('')),
  display_name: z.string().max(128).optional(),
});

auth.post('/register', async (c) => {
  const ip = clientIp(c);
  const lim = limiters.registerIp().hit(ip);
  if (!lim.allowed) return fail(c, 429, 'RATE_LIMITED', 'Too many sign-ups from this network. Try later.', lim.retryAfterSeconds);

  const parsed = RegisterBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 400, 'INVALID_INPUT', 'Check the form fields.');
  const name = normalizeUsername(parsed.data.username);
  if (!name) return fail(c, 422, 'INVALID_INPUT', 'Username must be 3–32 letters, numbers, dot, dash or underscore.');
  const problem = checkPassword(parsed.data.password, name.username);
  if (problem) return fail(c, 422, 'WEAK_PASSWORD', `Password rejected: ${problem}.`);
  if (await accountByUsername(name.clean)) return fail(c, 409, 'USERNAME_TAKEN', 'That username is taken.');

  // 1) Supabase Auth identity with a random internal alias (not derived from any public id).
  const alias = `id_${randomUUID()}@${ALIAS_DOMAIN}`;
  const created = await admin().auth.admin.createUser({
    email: alias,
    password: parsed.data.password,
    email_confirm: true, // no confirmation mail is ever requested
  });
  if (created.error || !created.data.user) return fail(c, 500, 'INTERNAL', 'Could not create account.');
  const userId = created.data.user.id;

  // 2) Recovery codes + atomic bootstrap (account, profile, personal workspace, MANAGER, codes).
  const codes = await generateCodeSet();
  const boot = await admin().rpc('rpc_bootstrap_account', {
    p_user_id: userId,
    p_username: name.username,
    p_display_name: parsed.data.display_name ?? '',
    p_email: parsed.data.email ?? '',
    p_phone: parsed.data.phone ?? '',
    p_code_hashes: codes.map((x) => x.hash),
    p_code_hints: codes.map((x) => x.hint),
  });
  if (boot.error) {
    // Compensation: never leave an orphan Auth identity behind.
    await admin().auth.admin.deleteUser(userId);
    if (boot.error.code === '23505') return fail(c, 409, 'USERNAME_TAKEN', 'That username is taken.');
    return fail(c, 500, 'INTERNAL', 'Could not create account.');
  }

  // 3) Sign in so the caller leaves registration with a session.
  const grant = await passwordGrant(alias, parsed.data.password, ip);
  if (!grant.session) return fail(c, 500, 'INTERNAL', 'Account created; please sign in.');
  setSessionCookies(c, grant.session.refresh_token);
  return c.json(
    {
      user: await profileSummary(userId),
      workspace: { id: boot.data as string, name: 'Personal', role: 'MANAGER' },
      recovery_codes: codes.map((x) => x.display), // shown exactly once
      session: publicSession(grant.session),
    },
    201,
  );
});

const LoginBody = z.object({ username: z.string().max(64), password: z.string().max(200) });

auth.post('/login', async (c) => {
  const started = Date.now();
  const e = env();
  const ip = clientIp(c);
  const ipLim = limiters.loginIp().hit(ip);
  if (!ipLim.allowed) return fail(c, 429, 'RATE_LIMITED', 'Too many attempts. Try again later.', ipLim.retryAfterSeconds);

  const parsed = LoginBody.safeParse(await c.req.json().catch(() => null));
  const generic = async () => {
    await floor(started, e.AUTH_FAILURE_FLOOR_MS);
    return fail(c, 401, 'INVALID_CREDENTIALS', 'Username or password is incorrect.');
  };
  if (!parsed.success) return generic();
  const name = normalizeUsername(parsed.data.username);
  if (!name) return generic();

  const acct = await accountByUsername(name.clean);
  if (!acct || acct.status !== 'ACTIVE') return generic();
  if (acct.locked_until && new Date(acct.locked_until) > new Date()) {
    const retry = Math.ceil((new Date(acct.locked_until).getTime() - Date.now()) / 1000);
    return fail(c, 429, 'RATE_LIMITED', 'Too many attempts. Try again later.', retry);
  }

  const alias = await aliasFor(acct.user_id);
  const grant = alias ? await passwordGrant(alias, parsed.data.password, ip) : { session: null, status: 400 };
  if (!grant.session) {
    if (grant.status === 429) {
      // Supabase Auth's own per-IP limiter tripped (would throttle every user behind the façade).
      console.error('SUPABASE_AUTH_RATE_LIMIT_HIT on password grant');
      return fail(c, 429, 'RATE_LIMITED', 'Service busy. Try again shortly.', 60);
    }
    const failures = acct.failed_login_count + 1;
    const lock = failures >= e.LOGIN_MAX_FAILURES;
    await admin()
      .from('user_accounts')
      .update({
        failed_login_count: lock ? 0 : failures,
        locked_until: lock ? new Date(Date.now() + e.LOGIN_LOCK_MINUTES * 60_000).toISOString() : acct.locked_until,
      })
      .eq('user_id', acct.user_id);
    return generic();
  }

  await admin().from('user_accounts').update({ failed_login_count: 0, locked_until: null }).eq('user_id', acct.user_id);
  setSessionCookies(c, grant.session.refresh_token);
  return c.json({ user: await profileSummary(acct.user_id), session: publicSession(grant.session) });
});

// Refresh rotates the refresh token (HttpOnly cookie) and returns a new access token.
auth.post('/refresh', requireCsrfToken, async (c) => {
  const rt = getCookie(c, REFRESH_COOKIE);
  if (!rt) return fail(c, 401, 'UNAUTHENTICATED', 'No session.');
  const { data, error } = await authClient(clientIp(c)).auth.refreshSession({ refresh_token: rt });
  if (error || !data.session) {
    clearSessionCookies(c);
    return fail(c, 401, 'UNAUTHENTICATED', 'Session expired. Please sign in.');
  }
  setSessionCookies(c, data.session.refresh_token);
  return c.json({ session: publicSession(data.session) });
});

const LogoutBody = z.object({ scope: z.enum(['local', 'global']).default('local') });

auth.post('/logout', requireCsrfToken, async (c) => {
  const who = await authenticate(c);
  const parsed = LogoutBody.safeParse(await c.req.json().catch(() => ({})));
  if (who) await admin().auth.admin.signOut(who.token, parsed.success ? parsed.data.scope : 'local');
  clearSessionCookies(c);
  return c.json({ ok: true });
});

auth.get('/me', async (c) => {
  const who = await authenticate(c);
  if (!who) return fail(c, 401, 'UNAUTHENTICATED', 'Sign in required.');
  return c.json({ user: await profileSummary(who.userId) });
});

const PasswordBody = z.object({ current_password: z.string().max(200), new_password: z.string().max(200) });

auth.post('/password', requireCsrfToken, async (c) => {
  const who = await authenticate(c);
  if (!who) return fail(c, 401, 'UNAUTHENTICATED', 'Sign in required.');
  const lim = limiters.passwordUser().hit(who.userId);
  if (!lim.allowed) return fail(c, 429, 'RATE_LIMITED', 'Too many password changes.', lim.retryAfterSeconds);
  const parsed = PasswordBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 400, 'INVALID_INPUT', 'Check the form fields.');
  const { data: acct } = await admin().from('user_accounts').select('username').eq('user_id', who.userId).single();
  const problem = checkPassword(parsed.data.new_password, acct?.username);
  if (problem) return fail(c, 422, 'WEAK_PASSWORD', `Password rejected: ${problem}.`);

  // Re-verify the current password without keeping the probe session.
  const alias = await aliasFor(who.userId);
  const probe = alias ? await passwordGrant(alias, parsed.data.current_password, clientIp(c)) : { session: null };
  if (!probe.session) return fail(c, 401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
  await admin().auth.admin.signOut(probe.session.access_token, 'local');

  const upd = await admin().auth.admin.updateUserById(who.userId, { password: parsed.data.new_password });
  if (upd.error) return fail(c, 500, 'INTERNAL', 'Could not change password.');
  // Policy (Gate 03 T09): keep this session, revoke every other session.
  await admin().auth.admin.signOut(who.token, 'others');
  return c.json({ ok: true, other_sessions_revoked: true });
});

const RecoverBody = z.object({ username: z.string().max(64), code: z.string().max(80), new_password: z.string().max(200) });

auth.post('/recover', async (c) => {
  const started = Date.now();
  const e = env();
  const ip = clientIp(c);
  const ipLim = limiters.recoverIp().hit(ip);
  if (!ipLim.allowed) return fail(c, 429, 'RATE_LIMITED', 'Too many recovery attempts.', ipLim.retryAfterSeconds);
  const parsed = RecoverBody.safeParse(await c.req.json().catch(() => null));
  const generic = async () => {
    await floor(started, e.AUTH_FAILURE_FLOOR_MS);
    return fail(c, 401, 'INVALID_RECOVERY', 'Username or recovery code is incorrect.');
  };
  if (!parsed.success) return generic();
  const name = normalizeUsername(parsed.data.username);
  const acct = name ? await accountByUsername(name.clean) : null;
  if (!acct || acct.status !== 'ACTIVE') return generic();
  if (acct.recovery_locked_until && new Date(acct.recovery_locked_until) > new Date()) {
    const retry = Math.ceil((new Date(acct.recovery_locked_until).getTime() - Date.now()) / 1000);
    return fail(c, 429, 'RATE_LIMITED', 'Recovery is locked for this account. Try later.', retry);
  }

  const code = normalizeCode(parsed.data.code);
  const { data: rows } = await admin()
    .from('auth_recovery_codes')
    .select('id, code_hash')
    .eq('user_id', acct.user_id)
    .eq('code_hint', code.slice(0, HINT_CHARS))
    .eq('is_used', false);
  let matchId: string | null = null;
  for (const r of rows ?? []) if (await verifyCode(r.code_hash, code)) matchId = r.id;

  if (!matchId) {
    const failures = acct.failed_recovery_count + 1;
    const lock = failures >= e.RECOVERY_MAX_FAILURES;
    await admin().from('user_accounts').update({
      failed_recovery_count: lock ? 0 : failures,
      recovery_locked_until: lock ? new Date(Date.now() + e.RECOVERY_LOCK_MINUTES * 60_000).toISOString() : acct.recovery_locked_until,
    }).eq('user_id', acct.user_id);
    return generic();
  }
  const problem = checkPassword(parsed.data.new_password, acct.username);
  if (problem) return fail(c, 422, 'WEAK_PASSWORD', `Password rejected: ${problem}.`);

  // Consume atomically (the is_used=false predicate makes a concurrent replay lose).
  const { data: consumed } = await admin()
    .from('auth_recovery_codes')
    .update({ is_used: true, used_at: new Date().toISOString(), used_ip: ip === 'unknown' ? null : ip })
    .eq('id', matchId)
    .eq('is_used', false)
    .select('id');
  if (!consumed?.length) return generic();

  const upd = await admin().auth.admin.updateUserById(acct.user_id, { password: parsed.data.new_password });
  if (upd.error) return fail(c, 500, 'INTERNAL', 'Could not reset password.');

  // Revoke every existing session using only supported APIs: sign in once, sign out globally.
  const alias = await aliasFor(acct.user_id);
  const s1 = alias ? await passwordGrant(alias, parsed.data.new_password, ip) : { session: null };
  if (s1.session) await admin().auth.admin.signOut(s1.session.access_token, 'global');
  const s2 = alias ? await passwordGrant(alias, parsed.data.new_password, ip) : { session: null };
  await admin().from('user_accounts')
    .update({ failed_recovery_count: 0, recovery_locked_until: null, failed_login_count: 0, locked_until: null })
    .eq('user_id', acct.user_id);
  const { count } = await admin().from('auth_recovery_codes')
    .select('id', { count: 'exact', head: true }).eq('user_id', acct.user_id).eq('is_used', false);
  if (!s2.session) return c.json({ ok: true, remaining_codes: count ?? 0, session: null });
  setSessionCookies(c, s2.session.refresh_token);
  return c.json({ ok: true, remaining_codes: count ?? 0, all_other_sessions_revoked: true, session: publicSession(s2.session) });
});

const RegenerateBody = z.object({ password: z.string().max(200) });

auth.post('/recovery-codes', requireCsrfToken, async (c) => {
  const who = await authenticate(c);
  if (!who) return fail(c, 401, 'UNAUTHENTICATED', 'Sign in required.');
  const parsed = RegenerateBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 400, 'INVALID_INPUT', 'Password required.');
  const alias = await aliasFor(who.userId);
  const probe = alias ? await passwordGrant(alias, parsed.data.password, clientIp(c)) : { session: null };
  if (!probe.session) return fail(c, 401, 'INVALID_CREDENTIALS', 'Password is incorrect.');
  await admin().auth.admin.signOut(probe.session.access_token, 'local');
  const codes = await generateCodeSet();
  const rep = await admin().rpc('rpc_replace_recovery_codes', {
    p_user_id: who.userId,
    p_code_hashes: codes.map((x) => x.hash),
    p_code_hints: codes.map((x) => x.hint),
  });
  if (rep.error) return fail(c, 500, 'INTERNAL', 'Could not regenerate codes.');
  return c.json({ recovery_codes: codes.map((x) => x.display), count: CODES_PER_SET });
});
