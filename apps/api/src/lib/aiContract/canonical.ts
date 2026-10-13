import { createHash } from 'node:crypto';

/** Deterministic JSON: sorted object keys, no whitespace, undefined dropped. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('non-finite number');
    return JSON.stringify(value === undefined ? null : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

export const sha256Hex = (input: string): string => createHash('sha256').update(input, 'utf8').digest('hex');

/**
 * Content FINGERPRINT of a normalized finding (TS-side, for tests/diagnostics).
 * NOT the stored ai_findings.content_hash: that is computed in SQL by
 * rpc_ai_ingest_finding and callers can never supply it. Do not compare the two.
 */
export const contentFingerprint = (value: unknown): string => sha256Hex(canonicalJson(value));
