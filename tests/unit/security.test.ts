import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_unit_test_placeholder';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_placeholder';
  process.env.APP_ORIGINS = 'http://localhost:5173';
  process.env.JQ_JWT_PRIVATE_JWK = '{"placeholder":"unit-test-not-a-key"}'; // presence only; never parsed here
});

async function call(path: string, init: RequestInit) {
  const { app } = await import('../../apps/api/src/app');
  return app.request(`http://localhost/api${path}`, init);
}

describe('CSRF defense in depth (no network needed)', () => {
  it('rejects state-changing requests from a foreign or missing Origin', async () => {
    const r1 = await call('/auth/login', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' });
    expect(r1.status).toBe(403);
    const r2 = await call('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(r2.status).toBe(403);
  });
  it('rejects non-JSON bodies (blocks HTML form posts)', async () => {
    const r = await call('/auth/login', { method: 'POST', headers: { origin: 'http://localhost:5173', 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=b' });
    expect(r.status).toBe(415);
  });
  it('requires the double-submit CSRF token on cookie-authenticated routes', async () => {
    const r = await call('/auth/refresh', { method: 'POST', headers: { origin: 'http://localhost:5173', 'content-type': 'application/json', cookie: 'jq_rt=x; jq_csrf=abc' }, body: '{}' });
    expect(r.status).toBe(403);
    const ok = await call('/auth/refresh', { method: 'POST', headers: { origin: 'http://localhost:5173', 'content-type': 'application/json', cookie: 'jq_csrf=abc', 'x-jq-csrf': 'abc' }, body: '{}' });
    expect(ok.status).toBe(401); // passes CSRF, then fails auth (no refresh cookie)
  });
  it('sets hardening headers and emits no CORS allowance', async () => {
    const r = await call('/health', { method: 'GET', headers: { origin: 'https://evil.example' } });
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
  });
});
