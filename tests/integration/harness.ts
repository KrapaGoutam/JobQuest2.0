/**
 * Integration harness: drives the REAL Node façade in-process (app.request) against the
 * dev Supabase project, keeps a per-actor cookie jar, records every API response for
 * the T03 leak scan, and writes SANITIZED evidence (no tokens, no alias strings).
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const ALIAS = 'auth.jobquest.internal';
export const ORIGIN = 'http://localhost:5173';
export const RUN = randomBytes(3).toString('hex');

export function loadEnv(): boolean {
  if (!existsSync('.env.local')) return false;
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^"|"$/g, '');
  }
  // Test-only knobs: many sign-ups come from one machine; keep the real defaults elsewhere.
  process.env.REGISTER_IP_MAX_PER_HOUR = '500';
  process.env.LOGIN_IP_MAX_PER_15M = '20';
  process.env.AUTH_FAILURE_FLOOR_MS = '0';
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY && process.env.SUPABASE_PUBLISHABLE_KEY);
}

/** Every raw API response (status, headers, body) seen during the run — scanned in T03. */
export const transcript: { path: string; status: number; headers: string; body: string }[] = [];

export class Actor {
  jar = new Map<string, string>();
  token: string | null = null;
  userId: string | null = null;
  constructor(public ip: string) {}

  async call(path: string, body?: unknown, opts: { method?: string; csrf?: boolean; origin?: string | null; bearer?: string | null } = {}) {
    const { app } = await import('../../apps/api/src/app');
    const method = opts.method ?? (body === undefined ? 'GET' : 'POST');
    const headers: Record<string, string> = { 'x-real-ip': this.ip };
    if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) headers.cookie = cookie;
    if (opts.csrf !== false && this.jar.get('jq_csrf')) headers['x-jq-csrf'] = this.jar.get('jq_csrf')!;
    const bearer = opts.bearer === undefined ? this.token : opts.bearer;
    if (bearer) headers.authorization = `Bearer ${bearer}`;
    const res = await app.request(`http://localhost/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    const setCookies = res.headers.getSetCookie();
    for (const sc of setCookies) {
      const [pair] = sc.split(';');
      const [k, ...v] = pair!.split('=');
      const val = v.join('=');
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(sc) || val === '') this.jar.delete(k!.trim());
      else this.jar.set(k!.trim(), val);
    }
    transcript.push({ path, status: res.status, headers: JSON.stringify([...res.headers.entries()]), body: text });
    let json: any = {};
    try { json = JSON.parse(text); } catch { /* non-JSON */ }
    if (json?.session?.access_token) this.token = json.session.access_token;
    if (json?.user?.id) this.userId = json.user.id;
    return { status: res.status, json, setCookies, headers: res.headers };
  }

  /** Direct browser-equivalent PostgREST client using this actor's access token. */
  db(token = this.token): SupabaseClient {
    return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      accessToken: async () => token,
    });
  }
}

export function anonDb(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
}
export function serviceDb(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
}

export function decodeJwt(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'));
}

export const STRONG = () => `Quiet-harbor-${randomBytes(4).toString('hex')}-lantern`;

// ---------------------------------------------------------------------------------
// Sanitized evidence
// ---------------------------------------------------------------------------------
const evidence: Record<string, unknown> = { run: RUN, started_at: new Date().toISOString() };
export function record(id: string, data: unknown): void {
  const text = JSON.stringify(data);
  if (text.includes(ALIAS) || /eyJ[A-Za-z0-9_-]{20,}/.test(text) || /sb_secret_/.test(text)) {
    throw new Error(`Evidence for ${id} would contain a secret/alias — refusing to write it.`);
  }
  evidence[id] = data;
  mkdirSync('migration-upgrade/m1/evidence', { recursive: true });
  writeFileSync(`migration-upgrade/m1/evidence/integration-${RUN}.json`, JSON.stringify(evidence, null, 2));
}
