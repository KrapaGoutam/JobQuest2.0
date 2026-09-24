import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

/**
 * Recovery codes (ADR-038):
 *  - 10 codes per set; each code carries 160 bits from the CSPRNG.
 *  - Crockford Base32 (no I, L, O, U) → 32 chars, shown as 8 groups of 4.
 *  - The first 4 chars (20 bits) are a lookup hint stored in clear so we only
 *    run Argon2 against one row; the remaining 28 chars (140 bits) stay secret.
 *    Effective secret entropy per code = 140 bits (>= 128 required).
 *  - Only Argon2id verifiers are stored.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford
export const CODES_PER_SET = 10;
const CHARS = 32; // 32 * 5 bits = 160 bits
export const HINT_CHARS = 4;
export const SECRET_BITS = (CHARS - HINT_CHARS) * 5;

// OWASP-recommended Argon2id parameters (m = 19 MiB, t = 2, p = 1).
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

function encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function formatCode(raw: string): string {
  return raw.match(/.{1,4}/g)!.join('-');
}

/** Accept user input with dashes/spaces/lowercase and Crockford substitutions. */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

export interface GeneratedCode {
  display: string; // shown to the user exactly once
  hint: string;
  hash: string;
}

export async function generateCodeSet(): Promise<GeneratedCode[]> {
  const hints = new Set<string>();
  const out: GeneratedCode[] = [];
  while (out.length < CODES_PER_SET) {
    const raw = encode(randomBytes(20)).slice(0, CHARS); // 20 bytes = 160 bits
    const hint = raw.slice(0, HINT_CHARS);
    if (hints.has(hint)) continue; // hints must be unique per user (DB constraint)
    hints.add(hint);
    out.push({ display: formatCode(raw), hint, hash: await hash(raw, ARGON) });
  }
  return out;
}

export function verifyCode(storedHash: string, normalized: string): Promise<boolean> {
  return verify(storedHash, normalized);
}
