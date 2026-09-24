/**
 * Integration harness: drives the REAL Node API in-process (app.request) against a
 * Supabase stack, keeps a per-actor cookie jar, records every API response (scanned in
 * B03), and writes SANITIZED evidence: no tokens, no keys, no passwords.
 *
 * Target selection (never implicit):
 *   M1B_ENV_FILE=.env.m1b-local  (default): local Supabase stack, from scripts/m1b-local-env.mjs
 *   M1B_ENV_FILE=.env.local               : the hosted DEV project (after the signing-key checkpoint)
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const ORIGIN = 'http://localhost:5173';
export const RUN = randomBytes(3).toString('hex');
export const ENV_FILE = process.env.M1B_ENV_FILE ?? '.env.m1b-local';

export function loadEnv(): boolean {
  if (!existsSync(ENV_FILE)) return false;
  for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const k = line.slice(0, i);
    if (/^[A-Z0-9_]+$/.test(k) && process.env[k] === undefined) process.env[k] = line.slice(i + 1).replace(/^"|"$/g, '');
  }
  // Test-only knobs: many registrations come from one machine; keep the real defaults elsewhere.
  process.env.REGISTER_IP_MAX_PER_HOUR = '500';
  process.env.AUTH_FAILURE_FLOOR_MS = '0';
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY && process.env.JQ_JWT_PRIVATE_JWK);
}

export function target(): string {
  return process.env.M1B_TARGET ?? (/127\.0\.0\.1|localhost/.test(process.env.SUPABASE_URL ?? '') ? 'local' : 'hosted-dev');
}

/** Every raw API response (status, headers, body) seen during the run: scanned in B03. */
export const transcript: { path: string; status: number; headers: string; body: string }[] = [];

let ipCounter = 0;
/** Unique documentation-range IPs per actor so shared DB rate-limit buckets never collide across runs. */
export function freshIp(): string {
  ipCounter += 1;
  const r = randomBytes(2);
  return `10.${r[0]}.${r[1]}.${ipCounter % 250}`;
}

export class Actor {
  jar = new Map<string, string>();
  token: string | null = null;
  userId: string | null = null;
  constructor(public ip: string = freshIp()) {}

  async call(path: string, body?: unknown, opts: { method?: string; csrf?: boolean; origin?: string | null; bearer?: string | null } = {}) {
    const { app } = await import('../../apps/api/src/app');
    const method = opts.method ?? (body === undefined ? 'GET' : 'POST');
    const headers: Record<string, string> = { 'x-real-ip': this.ip, 'user-agent': 'm1b-integration' };
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

  /** Browser-equivalent Data API client: supabase-js with the accessToken option. */
  db(token = this.token): SupabaseClient {
    return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
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

export function decodeJwt(token: string): { header: Record<string, unknown>; payload: Record<string, unknown> } {
  const [h, p] = token.split('.');
  return {
    header: JSON.parse(Buffer.from(h!, 'base64url').toString('utf8')),
    payload: JSON.parse(Buffer.from(p!, 'base64url').toString('utf8')),
  };
}

export const STRONG = () => `Quiet-harbor-${randomBytes(4).toString('hex')}-lantern`;

// ---------------------------------------------------------------------------------
// Sanitized evidence
// ---------------------------------------------------------------------------------
const evidence: Record<string, unknown> = { run: RUN, started_at: new Date().toISOString() };
const FORBIDDEN_IN_EVIDENCE = [
  /eyJ[A-Za-z0-9_-]{20,}/, // any JWT
  /jqr_[A-Za-z0-9_-]{20,}/, // refresh token
  /sb_secret_[A-Za-z0-9_-]{8,}/, // secret API key
  /"d"\s*:\s*"[A-Za-z0-9_-]{20,}"/, // private JWK component
  /\$argon2id\$/, // password or recovery-code verifier
  /Quiet-harbor-[0-9a-f]{8}-lantern/, // generated test passwords
];
export function record(id: string, data: unknown): void {
  const text = JSON.stringify(data);
  for (const re of FORBIDDEN_IN_EVIDENCE) {
    if (re.test(text)) throw new Error(`Evidence for ${id} would contain secret material (${re}); refusing to write it.`);
  }
  evidence.target = target();
  evidence[id] = data;
  mkdirSync('migration-upgrade/m1b/evidence', { recursive: true });
  writeFileSync(`migration-upgrade/m1b/evidence/integration-${target()}-${RUN}.json`, JSON.stringify(evidence, null, 2));
}
