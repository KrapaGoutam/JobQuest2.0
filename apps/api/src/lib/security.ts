import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { allowedOrigins } from '../env';

export const REFRESH_COOKIE = 'jq_rt';
export const CSRF_COOKIE = 'jq_csrf';
export const CSRF_HEADER = 'x-jq-csrf';
const THIRTY_DAYS = 60 * 60 * 24 * 30;

/** Client IP as seen by the platform edge (Vercel sets x-forwarded-for / x-real-ip). */
export function clientIp(c: Context): string {
  return (
    c.req.header('x-real-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

/**
 * CSRF layer 2 + 4 (Gate 03 §5): every state-changing request must come from an
 * allow-listed Origin (or Referer) and be application/json. No CORS headers are
 * emitted, so cross-origin browser reads are blocked by the same-origin policy.
 */
export const requireSameOriginJson: MiddlewareHandler = async (c, next) => {
  const method = c.req.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  const origins = allowedOrigins();
  const origin = c.req.header('origin');
  const referer = c.req.header('referer');
  const refererOrigin = referer ? safeOrigin(referer) : undefined;
  if (!(origin && origins.has(origin)) && !(!origin && refererOrigin && origins.has(refererOrigin))) {
    return c.json({ error: { code: 'ORIGIN_REJECTED', message: 'Request origin not allowed.' } }, 403);
  }
  const ct = c.req.header('content-type') ?? '';
  if (!ct.toLowerCase().startsWith('application/json')) {
    return c.json({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Use application/json.' } }, 415);
  }
  return next();
};

function safeOrigin(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/** CSRF layer 3: double-submit token (cookie value must equal header value). */
export const requireCsrfToken: MiddlewareHandler = async (c, next) => {
  const cookie = getCookie(c, CSRF_COOKIE);
  const header = c.req.header(CSRF_HEADER);
  if (!cookie || !header || cookie.length !== header.length ||
      !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
    return c.json({ error: { code: 'CSRF_REJECTED', message: 'Missing or invalid CSRF token.' } }, 403);
  }
  return next();
};

/** CSRF layer 1: HttpOnly + Secure + SameSite=Strict refresh cookie scoped to /api/auth. */
export function setSessionCookies(c: Context, refreshToken: string): void {
  setCookie(c, REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/api/auth',
    maxAge: THIRTY_DAYS,
  });
  // Readable by JS on purpose (double-submit token); carries no authority by itself.
  setCookie(c, CSRF_COOKIE, randomBytes(32).toString('base64url'), {
    httpOnly: false,
    secure: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: THIRTY_DAYS,
  });
}

export function clearSessionCookies(c: Context): void {
  deleteCookie(c, REFRESH_COOKIE, { path: '/api/auth', secure: true });
  deleteCookie(c, CSRF_COOKIE, { path: '/', secure: true });
}

export function bearer(c: Context): string | undefined {
  const h = c.req.header('authorization');
  return h?.startsWith('Bearer ') ? h.slice(7) : undefined;
}

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Cache-Control', 'no-store');
};

/** Equalize failure timing (username enumeration). */
export async function floor(startedAt: number, ms: number): Promise<void> {
  const wait = startedAt + ms - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
