import { beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { exportJWK, generateKeyPair, decodeProtectedHeader, decodeJwt } from 'jose';

beforeAll(async () => {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  const jwk = { ...(await exportJWK(privateKey)), kid: 'unit-test-kid', key_ops: ['sign', 'verify'] };
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_placeholder';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_placeholder';
  process.env.JQ_JWT_PRIVATE_JWK = JSON.stringify(jwk);
  const { resetEnvCache } = await import('../../apps/api/src/env');
  const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
  resetEnvCache(); resetSigningMaterial();
});

describe('Option B access tokens', () => {
  it('mints ES256 tokens with exactly the approved claim contract', async () => {
    const { mintAccessToken } = await import('../../apps/api/src/lib/tokens');
    const t = await mintAccessToken('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');
    expect(decodeProtectedHeader(t.access_token)).toEqual({ alg: 'ES256', kid: 'unit-test-kid', typ: 'JWT' });
    const claims = decodeJwt(t.access_token);
    expect(Object.keys(claims).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'jti', 'role', 'session_id', 'sub']);
    expect(claims.role).toBe('authenticated');
    expect(claims.exp! - claims.iat!).toBe(900);
  });
  it('verifies its own tokens and rejects tampered or expired ones', async () => {
    const { mintAccessToken, verifyAccessToken } = await import('../../apps/api/src/lib/tokens');
    const t = await mintAccessToken('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');
    expect((await verifyAccessToken(t.access_token))?.sub).toBe('11111111-1111-4111-8111-111111111111');
    const [h, , s] = t.access_token.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ ...decodeJwt(t.access_token), sub: '33333333-3333-4333-8333-333333333333' })).toString('base64url');
    expect(await verifyAccessToken(`${h}.${forgedBody}.${s}`)).toBeNull();
    const expired = await mintAccessToken('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', -5);
    expect(await verifyAccessToken(expired.access_token)).toBeNull();
  });
  it('refresh tokens are 256-bit random and stored only as SHA-256', async () => {
    const { newRefreshToken, sha256Hex } = await import('../../apps/api/src/lib/tokens');
    const a = newRefreshToken(); const b = newRefreshToken();
    expect(a.token).toMatch(/^jqr_[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(sha256Hex(a.token));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('Option B password verifiers', () => {
  it('Argon2id PHC strings with the configured parameters; rehash detection', async () => {
    const { hashPassword, verifyPassword, needsRehash } = await import('../../apps/api/src/lib/passwords');
    const phc = await hashPassword('Correct-horse-battery-9');
    expect(phc.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    expect(await verifyPassword(phc, 'Correct-horse-battery-9')).toBe(true);
    expect(await verifyPassword(phc, 'wrong')).toBe(false);
    expect(needsRehash(phc)).toBe(false);
    expect(needsRehash('$argon2id$v=19$m=4096,t=1,p=1$c2FsdA$aGFzaA')).toBe(true);
  });
});

describe('service-role boundary (static)', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
  it('admin() (service role) is used only by the auth routes and the rate limiter, never for user CRUD', () => {
    const users = files('apps/api/src').filter((p) => /\badmin\(\)/.test(readFileSync(p, 'utf8'))).map((p) => p.replace(/\\/g, '/')).sort();
    expect(users).toEqual(['apps/api/src/lib/db.ts', 'apps/api/src/lib/rateLimit.ts', 'apps/api/src/routes/auth.ts']);
    const authSrc = readFileSync('apps/api/src/routes/auth.ts', 'utf8');
    for (const table of ['applications', 'workspaces', 'workspace_members', 'workflow_definitions']) {
      expect(authSrc).not.toContain(`from('${table}')`);
    }
  });
  it('browser code never references server secrets or the signing key', () => {
    for (const p of files('apps/web/src')) {
      expect(readFileSync(p, 'utf8')).not.toMatch(/SUPABASE_SECRET_KEY|JQ_JWT_PRIVATE_JWK|service_role|sb_secret_/);
    }
  });
});
