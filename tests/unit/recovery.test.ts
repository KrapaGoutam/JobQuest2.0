import { describe, expect, it } from 'vitest';
import { generateCodeSet, normalizeCode, verifyCode, SECRET_BITS, HINT_CHARS } from '../../apps/api/src/lib/recovery';

describe('recovery codes (ADR-038)', () => {
  it('generates 10 unique, well-formed codes with >=128 secret bits and Argon2id verifiers only', async () => {
    const set = await generateCodeSet();
    expect(set).toHaveLength(10);
    expect(SECRET_BITS).toBeGreaterThanOrEqual(128);
    expect(new Set(set.map((c) => c.hint)).size).toBe(10);
    for (const c of set) {
      expect(c.display).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
      expect(c.hash.startsWith('$argon2id$')).toBe(true);
      expect(c.hash).not.toContain(normalizeCode(c.display));
      expect(c.hint).toBe(normalizeCode(c.display).slice(0, HINT_CHARS));
    }
  });

  it('verifies the right code (any formatting) and rejects a wrong one', async () => {
    const [a, b] = await generateCodeSet();
    expect(await verifyCode(a!.hash, normalizeCode(a!.display.toLowerCase().replace(/-/g, ' ')))).toBe(true);
    expect(await verifyCode(a!.hash, normalizeCode(b!.display))).toBe(false);
  });
});
