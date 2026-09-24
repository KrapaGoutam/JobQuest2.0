import { isIP } from 'node:net';
import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod';
import { env } from '../env';
import { admin } from '../lib/db';
import { checkPassword, normalizeUsername } from '../lib/credentials';
import { burnVerify, hashPassword, needsRehash, verifyPassword } from '../lib/passwords';
import { generateCodeSet, HINT_CHARS, normalizeCode, verifyCode } from '../lib/recovery';
import { limiter, type LimitResult } from '../lib/rateLimit';
import {
  bearer, clearSessionCookies, clientIp, floor, REFRESH_COOKIE, requireCsrfToken, setSessionCookies,
} from '../lib/security';
import { mintAccessToken, newRefreshToken, sha256Hex, verifyAccessToken, type AccessClaims, type MintedAccess } from '../lib/tokens';

/**
 * Auth Option B (M1B): the Node API owns credentials (Argon2id) and sessions
 * (auth_sessions + rotating single-use refresh tokens), and mints short-lived ES256
 * access tokens that the Supabase Data API verifies. There is no Supabase Auth user and
 * no synthetic identity. The service role is used only for these explicit privileged
 * auth operations. User data access is browser → Data API under RLS.
 */
export const auth = new Hono();

export const limits = {
  loginIp: limiter('login-ip', () => env().LOGIN_IP_MAX_PER_15M, 15 * 60),
  registerIp: limiter('register-ip', () => env().REGISTER_IP_MAX_PER_HOUR, 60 * 60),
  recoveryIp: limiter('recovery-ip', () => env().RECOVERY_IP_MAX_PER_HOUR, 60 * 60),
  passwordUser: limiter('password-user', () => env().PASSWORD_CHANGE_MAX_PER_HOUR, 60 * 60),
};

type Status = 200 | 201 | 401 | 403 | 409 | 422 | 429 | 500;
function fail(c: Context, status: Status, code: string, message: string) {
  return c.json({ error: { code, message } }, status);
}
function throttled(c: Context, r: LimitResult, code = 'RATE_LIMITED') {
  c.header('Retry-After', String(Math.max(1, r.retryAfterSeconds)));
  return fail(c, 429, code, 'Too many attempts. Try again later.');
}
async function body<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T> | null> {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}
const nowIso = () => new Date().toISOString();

interface PublicUser { id: string; username: string; display_name: string | null; active_workspace_id: string | null }

async function publicUser(userId: string): Promise<PublicUser | null> {
  const { data } = await admin()
    .from('user_accounts')
    .select('user_id, username, profiles(display_name, last_active_workspace_id)')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return null;
  const p = (Array.isArray(data.profiles) ? data.profiles[0] : data.profiles) as { display_name: string | null; last_active_workspace_id: string | null } | null;
  return { id: data.user_id, username: data.username, display_name: p?.display_name ?? null, active_workspace_id: p?.last_active_workspace_id ?? null };
}

/** Create an app-owned session, set the HttpOnly refresh cookie, mint the first access token. */
async function startSession(c: Context, userId: string): Promise<MintedAccess> {
  const rt = newRefreshToken();
  const { data: sessionId, error } = await admin().rpc('rpc_create_session', {
    p_user_id: userId,
    p_refresh_hash: rt.hash,
    p_session_seconds: env().SESSION_MAX_SECONDS,
    p_refresh_seconds: env().REFRESH_TOKEN_TTL_SECONDS,
    p_user_agent: c.req.header('user-agent') ?? null,
    p_ip_hash: sha256Hex(clientIp(c)),
  });
  if (error || !sessionId) throw new Error('session creation failed');
  setSessionCookies(c, rt.token);
  return mintAccessToken(userId, sessionId as string);
}

/** Bearer access token → verified claims of a LIVE session, or null. */
async function authenticate(c: Context): Promise<AccessClaims | null> {
  const token = bearer(c);
  if (!token) return null;
  const claims = await verifyAccessToken(token);
  if (!claims) return null;
  const { data } = await admin().rpc('rpc_session_is_live', { p_session_id: claims.session_id, p_user_id: claims.sub });
  return data === true ? claims : null;
}

const optionalEmail = z.union([z.literal(''), z.email().max(255)]).optional();
const optionalPhone = z.union([z.literal(''), z.string().regex(/^\+?[0-9 ()-]{6,32}$/)]).optional();

// ---------------------------------------------------------------------------------
// POST /register
// ---------------------------------------------------------------------------------
auth.post('/register', async (c) => {
  const ip = await limits.registerIp.hit(clientIp(c));
  if (!ip.allowed) return throttled(c, ip);
  const b = await body(c, z.object({
    username: z.string(), password: z.string(), display_name: z.string().max(128).optional(),
    email: optionalEmail, phone: optionalPhone,
  }));
  if (!b) return fail(c, 422, 'INVALID_INPUT', 'Username and password are required; email and phone must be valid if given.');
  const name = normalizeUsername(b.username);
  if (!name) return fail(c, 422, 'INVALID_USERNAME', 'Use 3–32 letters, digits, dot, dash or underscore.');
  const problem = checkPassword(b.password, name.username);
  if (problem) return fail(c, 422, problem, 'Choose a stronger password.');

  const taken = await admin().from('user_accounts').select('user_id').eq('username_clean', name.clean).maybeSingle();
  if (taken.data) return fail(c, 409, 'USERNAME_TAKEN', 'That username is taken.');

  const codes = await generateCodeSet();
  const { data, error } = await admin().rpc('rpc_register_account', {
    p_username: name.username,
    p_password_hash: await hashPassword(b.password),
    p_display_name: b.display_name ?? '',
    p_email: b.email ?? '',
    p_phone: b.phone ?? '',
    p_code_hashes: codes.map((x) => x.hash),
    p_code_hints: codes.map((x) => x.hint),
  });
  if (error?.code === '23505') return fail(c, 409, 'USERNAME_TAKEN', 'That username is taken.');
  const row = (data as { user_id: string }[] | null)?.[0];
  if (error || !row) return fail(c, 500, 'INTERNAL', 'Could not create the account.');

  const session = await startSession(c, row.user_id);
  return c.json({ user: await publicUser(row.user_id), session, recovery_codes: codes.map((x) => x.display) }, 201);
});

// ---------------------------------------------------------------------------------
// POST /login
// ---------------------------------------------------------------------------------
auth.post('/login', async (c) => {
  const started = Date.now();
  const ip = await limits.loginIp.hit(clientIp(c));
  if (!ip.allowed) return throttled(c, ip);
  const b = await body(c, z.object({ username: z.string(), password: z.string().max(1024) }));
  const name = b ? normalizeUsername(b.username) : null;
  const generic = async () => {
    await floor(started, env().AUTH_FAILURE_FLOOR_MS);
    return fail(c, 401, 'INVALID_CREDENTIALS', 'Username or password is incorrect.');
  };
  if (!b || !name) { await burnVerify(b?.password ?? ''); return generic(); }

  const acct = await admin().from('user_accounts')
    .select('user_id, status, locked_until').eq('username_clean', name.clean).maybeSingle();
  const account = acct.data as { user_id: string; status: string; locked_until: string | null } | null;
  if (account?.locked_until && account.locked_until > nowIso()) {
    await floor(started, env().AUTH_FAILURE_FLOOR_MS);
    c.header('Retry-After', String(Math.ceil((Date.parse(account.locked_until) - Date.now()) / 1000)));
    return fail(c, 429, 'ACCOUNT_LOCKED', 'Too many attempts. Try again later.');
  }
  const cred = account
    ? (await admin().from('user_credentials').select('password_hash').eq('user_id', account.user_id).maybeSingle()).data as { password_hash: string } | null
    : null;
  if (!account || !cred) { await burnVerify(b.password); return generic(); }

  const ok = await verifyPassword(cred.password_hash, b.password);
  if (!ok || account.status !== 'ACTIVE') {
    if (!ok) {
      await admin().rpc('rpc_record_auth_failure', {
        p_user_id: account.user_id, p_kind: 'login', p_max: env().LOGIN_MAX_FAILURES, p_lock_minutes: env().LOGIN_LOCK_MINUTES,
      });
    }
    return generic();
  }
  await admin().rpc('rpc_clear_login_failures', { p_user_id: account.user_id });
  if (needsRehash(cred.password_hash)) {
    await admin().from('user_credentials').update({ password_hash: await hashPassword(b.password) }).eq('user_id', account.user_id);
  }
  const session = await startSession(c, account.user_id);
  return c.json({ user: await publicUser(account.user_id), session });
});

// ---------------------------------------------------------------------------------
// POST /refresh: single-use rotation with replay detection (no grace window)
// ---------------------------------------------------------------------------------
auth.post('/refresh', requireCsrfToken, async (c) => {
  const presented = getCookie(c, REFRESH_COOKIE);
  if (!presented) return fail(c, 401, 'NO_SESSION', 'Sign in required.');
  const next = newRefreshToken();
  const { data, error } = await admin().rpc('rpc_rotate_refresh_token', {
    p_token_hash: sha256Hex(presented),
    p_new_hash: next.hash,
    p_refresh_seconds: env().REFRESH_TOKEN_TTL_SECONDS,
  });
  const r = (data as { status: string; session_id: string | null; user_id: string | null }[] | null)?.[0];
  if (error || !r) return fail(c, 500, 'INTERNAL', 'Could not refresh the session.');
  if (r.status !== 'ok' || !r.user_id || !r.session_id) {
    clearSessionCookies(c);
    return r.status === 'reused'
      ? fail(c, 401, 'REFRESH_REUSED', 'Session ended for your protection. Sign in again.')
      : fail(c, 401, 'SESSION_EXPIRED', 'Sign in required.');
  }
  setSessionCookies(c, next.token);
  return c.json({ session: await mintAccessToken(r.user_id, r.session_id) });
});

// ---------------------------------------------------------------------------------
// POST /logout {scope: 'local' | 'global'}
// ---------------------------------------------------------------------------------
auth.post('/logout', requireCsrfToken, async (c) => {
  const b = await body(c, z.object({ scope: z.enum(['local', 'global']).default('local') }));
  const scope = b?.scope ?? 'local';
  let userId: string | null = null;
  let sessionId: string | null = null;
  const presented = getCookie(c, REFRESH_COOKIE);
  if (presented) {
    const { data } = await admin().rpc('rpc_session_for_refresh', { p_token_hash: sha256Hex(presented) });
    const row = (data as { session_id: string; user_id: string }[] | null)?.[0];
    if (row) { userId = row.user_id; sessionId = row.session_id; }
  }
  if (!userId) {
    const claims = await authenticate(c);
    if (claims) { userId = claims.sub; sessionId = claims.session_id; }
  }
  let revoked = 0;
  if (userId) {
    const { data } = await admin().rpc('rpc_revoke_sessions', {
      p_user_id: userId, p_session_id: sessionId, p_all: scope === 'global', p_except_session: null,
      p_reason: scope === 'global' ? 'LOGOUT_ALL' : 'LOGOUT',
    });
    revoked = Number(data ?? 0);
  }
  clearSessionCookies(c);
  return c.json({ ok: true, sessions_revoked: revoked });
});

// ---------------------------------------------------------------------------------
// GET /me
// ---------------------------------------------------------------------------------
auth.get('/me', async (c) => {
  const claims = await authenticate(c);
  if (!claims) return fail(c, 401, 'UNAUTHENTICATED', 'Sign in required.');
  const user = await publicUser(claims.sub);
  return user ? c.json({ user }) : fail(c, 401, 'UNAUTHENTICATED', 'Sign in required.');
});

// ---------------------------------------------------------------------------------
// POST /password: logged-in change. Policy: the CURRENT session stays valid;
// every OTHER session is revoked immediately (rpc_change_password, atomic).
// ---------------------------------------------------------------------------------
auth.post('/password', requireCsrfToken, async (c) => {
  const started = Date.now();
  const claims = await authenticate(c);
  if (!claims) return fail(c, 401, 'UNAUTHENTICATED', 'Sign in required.');
  const lim = await limits.passwordUser.hit(claims.sub);
  if (!lim.allowed) return throttled(c, lim);
  const b = await body(c, z.object({ current_password: z.string().max(1024), new_password: z.string() }));
  if (!b) return fail(c, 422, 'INVALID_INPUT', 'Current and new password are required.');
  const [acct, cred] = await Promise.all([
    admin().from('user_accounts').select('username').eq('user_id', claims.sub).single(),
    admin().from('user_credentials').select('password_hash').eq('user_id', claims.sub).single(),
  ]);
  if (!cred.data || !(await verifyPassword(cred.data.password_hash, b.current_password))) {
    await floor(started, env().AUTH_FAILURE_FLOOR_MS);
    return fail(c, 401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
  }
  const problem = checkPassword(b.new_password, acct.data?.username);
  if (problem) return fail(c, 422, problem, 'Choose a stronger password.');
  if (b.new_password === b.current_password) return fail(c, 422, 'PASSWORD_UNCHANGED', 'Choose a different password.');
  const { data, error } = await admin().rpc('rpc_change_password', {
    p_user_id: claims.sub, p_new_hash: await hashPassword(b.new_password), p_keep_session: claims.session_id,
  });
  if (error) return fail(c, 500, 'INTERNAL', 'Could not change the password.');
  return c.json({ ok: true, current_session: 'kept', other_sessions_revoked: Number(data ?? 0) });
});

// ---------------------------------------------------------------------------------
// POST /recover {username, code, new_password}: single-use code; ALL sessions revoked
// ---------------------------------------------------------------------------------
auth.post('/recover', async (c) => {
  const started = Date.now();
  const ip = await limits.recoveryIp.hit(clientIp(c));
  if (!ip.allowed) return throttled(c, ip);
  const b = await body(c, z.object({ username: z.string(), code: z.string().max(64), new_password: z.string() }));
  const name = b ? normalizeUsername(b.username) : null;
  const generic = async () => {
    await floor(started, env().AUTH_FAILURE_FLOOR_MS);
    return fail(c, 401, 'INVALID_RECOVERY', 'Username or recovery code is incorrect.');
  };
  if (!b || !name) return generic();
  // Validate the new password BEFORE touching a code, so a weak password never burns one.
  const problem = checkPassword(b.new_password, name.username);
  if (problem) return fail(c, 422, problem, 'Choose a stronger password.');

  const acct = await admin().from('user_accounts')
    .select('user_id, recovery_locked_until').eq('username_clean', name.clean).maybeSingle();
  const account = acct.data as { user_id: string; recovery_locked_until: string | null } | null;
  if (!account) { await burnVerify(b.code); return generic(); }
  if (account.recovery_locked_until && account.recovery_locked_until > nowIso()) {
    await floor(started, env().AUTH_FAILURE_FLOOR_MS);
    return fail(c, 429, 'RECOVERY_LOCKED', 'Too many attempts. Try again later.');
  }
  const code = normalizeCode(b.code);
  const { data: candidates } = await admin().from('auth_recovery_codes')
    .select('id, code_hash').eq('user_id', account.user_id).eq('code_hint', code.slice(0, HINT_CHARS)).eq('is_used', false);
  let matched: string | null = null;
  for (const row of (candidates ?? []) as { id: string; code_hash: string }[]) {
    if (await verifyCode(row.code_hash, code)) { matched = row.id; break; }
  }
  if (!matched) {
    if (!candidates?.length) await burnVerify(b.code);
    await admin().rpc('rpc_record_auth_failure', {
      p_user_id: account.user_id, p_kind: 'recovery', p_max: env().RECOVERY_MAX_FAILURES, p_lock_minutes: env().RECOVERY_LOCK_MINUTES,
    });
    return generic();
  }
  const ipText = clientIp(c);
  const { data: remaining, error } = await admin().rpc('rpc_recover_account', {
    p_user_id: account.user_id, p_code_id: matched, p_new_hash: await hashPassword(b.new_password),
    p_ip: isIP(ipText) ? ipText : null,
  });
  if (error) return generic(); // e.g. the code was consumed concurrently
  const session = await startSession(c, account.user_id);
  return c.json({ user: await publicUser(account.user_id), session, remaining_codes: Number(remaining), other_sessions: 'revoked' });
});

// ---------------------------------------------------------------------------------
// POST /recovery-codes {password}: regenerate; the old set is invalidated atomically
// ---------------------------------------------------------------------------------
auth.post('/recovery-codes', requireCsrfToken, async (c) => {
  const started = Date.now();
  const claims = await authenticate(c);
  if (!claims) return fail(c, 401, 'UNAUTHENTICATED', 'Sign in required.');
  const b = await body(c, z.object({ password: z.string().max(1024) }));
  const cred = await admin().from('user_credentials').select('password_hash').eq('user_id', claims.sub).single();
  if (!b || !cred.data || !(await verifyPassword(cred.data.password_hash, b.password))) {
    await floor(started, env().AUTH_FAILURE_FLOOR_MS);
    return fail(c, 401, 'INVALID_CREDENTIALS', 'Password is incorrect.');
  }
  const codes = await generateCodeSet();
  const { error } = await admin().rpc('rpc_replace_recovery_codes', {
    p_user_id: claims.sub, p_code_hashes: codes.map((x) => x.hash), p_code_hints: codes.map((x) => x.hint),
  });
  if (error) return fail(c, 500, 'INTERNAL', 'Could not regenerate codes.');
  return c.json({ recovery_codes: codes.map((x) => x.display) });
});
