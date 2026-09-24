import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
// @ts-expect-error: plain ESM script without type declarations
import { knownSecretsFromEnv, scanText } from '../../scripts/lib/secret-scan.mjs';

type Finding = { rule: string; index: number };
const scan = (t: string, o?: object) => scanText(t, o) as Finding[];
const rules = (t: string, o?: object) => scan(t, o).map((f) => f.rule);

/*
 * All "true secret" fixtures are generated at runtime from the CSPRNG. No realistic
 * secret-shaped literal is committed, so the tracked-file scan stays meaningful.
 */
const rand = (n: number) => randomBytes(n).toString('base64url');
const hex = (n: number) => randomBytes(n).toString('hex');
const P = { sbSecret: ['sb', 'secret', ''].join('_'), sbp: ['sbp', ''].join('_') };

async function hsJwt(payload: Record<string, unknown>) {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuedAt().sign(randomBytes(32));
}

describe('secret scanner: TRUE secret fixtures FAIL', () => {
  it('Supabase secret API key (complete structure)', () => {
    expect(rules(`const k = "${P.sbSecret}${rand(24)}";`)).toContain('supabase-secret-key');
  });
  it('legacy service_role JWT (decoded role claim)', async () => {
    expect(rules(`x=${await hsJwt({ role: 'service_role', iss: 'supabase' })}`)).toContain('privileged-jwt');
  });
  it('PEM private key block', () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    expect(rules(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())).toContain('pem-private-key');
  });
  it('private JWK (JWT signing key with a "d" component)', async () => {
    const { privateKey } = await generateKeyPair('ES256', { extractable: true });
    expect(rules(JSON.stringify(await exportJWK(privateKey)))).toContain('jwk-private-key');
  });
  it('database URL with an embedded password', () => {
    expect(rules(`DB=postgresql://postgres.abcdefghijklmnopqrst:${rand(18)}@aws-0-us-west-2.pooler.supabase.com:5432/postgres`)).toContain('database-url-with-password');
  });
  it('access tokens: Supabase PAT, GitHub token, JobQuest refresh / extension tokens', () => {
    expect(rules(`${P.sbp}${hex(20)}`)).toContain('supabase-personal-access-token');
    expect(rules(`ghp_${rand(30).replace(/[-_]/g, 'a').slice(0, 36)}`)).toContain('github-token');
    expect(rules(`jqr_${rand(32)}`)).toContain('jobquest-refresh-token');
    expect(rules(`jqe_live_${hex(20)}`)).toContain('jobquest-extension-token');
  });
  it('server-only secret variable names inside a browser bundle', () => {
    expect(rules('const a = process.env.JQ_JWT_PRIVATE_JWK')).toContain('server-secret-env-name');
  });
  it('known secret values from the environment, whatever their format', () => {
    const secret = `rotated-${rand(20)}`;
    const known = knownSecretsFromEnv({ SUPABASE_SECRET_KEY: secret });
    expect(rules(`blob ${secret} blob`, { knownSecrets: known })).toContain('known-secret-value');
  });
  it('findings never include the matched value', () => {
    const value = `${P.sbSecret}${rand(24)}`;
    expect(JSON.stringify(scan(value))).not.toContain(value);
  });
});

describe('secret scanner: known harmless literals PASS', () => {
  it('supabase-js key-type check literal (the M1 false positive)', () => {
    expect(scan('const isKey=e=>e.startsWith(`sb_publishable_`)||e.startsWith(`sb_secret_`),wa=`sb_te')).toEqual([]);
  });
  it('publishable key and anon-role JWT (browser-safe by design)', async () => {
    expect(scan(`k="sb_publishable_${rand(24)}"; t="${await hsJwt({ role: 'anon' })}"`)).toEqual([]);
  });
  it('public JWK (no private component)', async () => {
    const { publicKey } = await generateKeyPair('ES256', { extractable: true });
    expect(scan(JSON.stringify(await exportJWK(publicKey)))).toEqual([]);
  });
  it('database URL placeholders and password-less URLs', () => {
    expect(scan('postgresql://postgres:[YOUR-PASSWORD]@db.ref.supabase.co:5432/postgres')).toEqual([]);
    expect(scan('postgres://localhost:5432/app')).toEqual([]);
  });
  it('detector literals in test harnesses (e.g. the $argon2id$ marker, the old alias domain)', () => {
    expect(scan("html.includes('$argon2id$') || html.includes('jqr_') || x.includes('auth.jobquest.internal')")).toEqual([]);
  });
  it('variable names are allowed in source mode (docs, env.ts, CI) but not in bundles', () => {
    expect(scan('SUPABASE_SECRET_KEY=', { mode: 'source' })).toEqual([]);
    expect(rules('SUPABASE_SECRET_KEY=')).toEqual(['server-secret-env-name']);
  });
  it('an exact allowlisted fixture passes, while the same structure elsewhere still fails', () => {
    const fixture = `${P.sbSecret}${rand(24)}`;
    const allowlist = [{ value: fixture, reason: 'documented test fixture' }];
    expect(scan(fixture, { allowlist })).toEqual([]);
    expect(rules(`${P.sbSecret}${rand(24)}`, { allowlist })).toEqual(['supabase-secret-key']);
  });
});
