import { describe, expect, it } from 'vitest';
import { checkPassword, normalizeUsername } from '../../apps/api/src/lib/credentials';

describe('username rules', () => {
  it('accepts approved characters and normalizes case', () => {
    expect(normalizeUsername('  Maya.Ortiz_2 ')).toEqual({ username: 'Maya.Ortiz_2', clean: 'maya.ortiz_2' });
  });
  it.each(['ab', 'a'.repeat(33), 'bad name', 'emoji😀', 'a@b', ''])('rejects %j', (u) => {
    expect(normalizeUsername(u)).toBeNull();
  });
});

describe('password policy', () => {
  it('enforces length, bcrypt 72-byte ceiling, username exclusion and strength', () => {
    expect(checkPassword('short1!')).toBe('TOO_SHORT');
    expect(checkPassword('é'.repeat(37))).toBe('TOO_LONG'); // 74 bytes
    expect(checkPassword('maya.ortiz-rocks-2026', 'maya.ortiz')).toBe('CONTAINS_USERNAME');
    expect(checkPassword('password123')).toBe('TOO_WEAK');
    expect(checkPassword('correct horse battery staple 42')).toBeNull();
  });
});
