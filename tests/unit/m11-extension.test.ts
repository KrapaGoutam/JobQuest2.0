import { beforeAll, describe, expect, it } from 'vitest';

describe('Milestone 11 — extension token and duplicate primitives', () => {
  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_unit_test_placeholder';
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_placeholder';
    process.env.JQ_JWT_PRIVATE_JWK = '{"placeholder":"unit-test-not-a-key"}';
    process.env.EXTENSION_TOKEN_PEPPER = 'unit-test-extension-pepper-32-bytes-minimum';
    process.env.EXTENSION_TOKEN_ENV = 'dev';
    const { resetEnvCache } = await import('../../apps/api/src/env');
    resetEnvCache();
  });

  it('mints high-entropy jqx secrets while exposing only the configured prefix', async () => {
    const { extensionTokenHash, hashesEqual, isExtensionToken, mintExtensionSecret } = await import('../../apps/api/src/lib/extensionTokens');
    const first = mintExtensionSecret();
    const second = mintExtensionSecret();
    expect(first.token).toMatch(/^jqx_dev_[A-Za-z0-9]{43}$/);
    expect(first.prefix).toBe(first.token.slice(0, 12));
    expect(first.token).not.toBe(second.token);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.hash).not.toBe(second.hash);
    expect(extensionTokenHash(first.token)).toBe(first.hash);
    expect(hashesEqual(extensionTokenHash(first.token), first.hash)).toBe(true);
    expect(isExtensionToken(first.token)).toBe(true);
    expect(isExtensionToken('jqx_dev_too-short')).toBe(false);
  });

  it('normalizes URLs exactly for extension duplicate identity', async () => {
    const { normalizeJobUrl } = await import('../../apps/api/src/lib/extensionTokens');
    expect(normalizeJobUrl('HTTPS://EXAMPLE.COM/JOBS/42/?utm_source=x&b=2&a=1')).toBe('https://example.com/jobs/42/?a=1&b=2');
    expect(normalizeJobUrl('https://example.com/JOBS/42/?utm_medium=email')).toBe('https://example.com/jobs/42');
    expect(normalizeJobUrl('not a URL')).toBe('not a url');
  });

  it('normalizes punctuation conservatively without collapsing seniority or role variants', async () => {
    const { normalizeText } = await import('../../apps/api/src/lib/extensionTokens');
    expect(normalizeText('  L’Oreal  —  QA  ')).toBe("l'oreal - qa");
    expect(normalizeText('AT&T / Platform @ Home')).toBe('at&t / platform @ home');
    expect(normalizeText('QA Engineer')).not.toBe(normalizeText('Senior QA Engineer'));
    expect(normalizeText('QA Analyst')).not.toBe(normalizeText('QA Engineer'));
  });
});
