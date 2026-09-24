import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as common from '@zxcvbn-ts/language-common';

const strength = new ZxcvbnFactory({
  dictionary: { ...common.dictionary },
  graphs: common.adjacencyGraphs,
});

/** Approved username rule (TARGET_SCHEMA chk_username_format). */
export const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

export function normalizeUsername(raw: string): { username: string; clean: string } | null {
  const username = raw.trim();
  if (!USERNAME_RE.test(username)) return null;
  return { username, clean: username.toLowerCase() };
}

export type PasswordProblem = 'TOO_SHORT' | 'TOO_LONG' | 'TOO_WEAK' | 'CONTAINS_USERNAME';

/**
 * Gate 03: >= 10 chars, zxcvbn score >= 2. Also <= 72 UTF-8 bytes because
 * Supabase Auth hashes with bcrypt (which would silently truncate beyond 72 bytes).
 */
export function checkPassword(password: string, username?: string): PasswordProblem | null {
  if (password.length < 10) return 'TOO_SHORT';
  if (Buffer.byteLength(password, 'utf8') > 72) return 'TOO_LONG';
  if (username && password.toLowerCase().includes(username.toLowerCase())) return 'CONTAINS_USERNAME';
  if (strength.check(password, username ? [username] : []).score < 2) return 'TOO_WEAK';
  return null;
}
