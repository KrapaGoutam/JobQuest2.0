// AI-2B/AI-6: shared, INTERNAL helpers for the read services (filter parsing, pagination, error
// shaping, row coercion). Not part of the public read API: aiReadService keeps its read-only export
// surface and aiExternalIntelligenceService reuses these so both enforce identical bounds.
import { userClient } from '../lib/db';
import { isAiHubServerEnabled } from '../lib/aiHubConfig';
import { isCalendarDate } from '../lib/calendarDate';
import type { JsonRecord } from '../lib/aiContract';
import {
  AI_READ_DEFAULT_PAGE_SIZE, AI_READ_MAX_PAGE, AI_READ_MAX_PAGE_SIZE,
  type AiPage, type AiPageRequest, type AiReadClient, type AiReadContext, type AiReadDeps, type AiReadError, type AiReadErrorCode,
} from './aiReadService';

// ---- validation helpers -------------------------------------------------------

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

const err = (code: AiReadErrorCode, message: string): { ok: false; error: AiReadError } => ({ ok: false, error: { code, message } });
const MESSAGES: Record<AiReadErrorCode, string> = {
  AI_HUB_DISABLED: 'AI Hub is disabled on this server',
  INVALID_CONTEXT: 'Invalid read context',
  INVALID_FILTER: 'Invalid filter or pagination',
  NOT_FOUND: 'Not found',
  FORBIDDEN: 'Not permitted',
  READ_FAILED: 'AI data could not be read',
};
export const fail = (code: AiReadErrorCode, detail?: string) => err(code, detail ? `${MESSAGES[code]}: ${detail}` : MESSAGES[code]);

type Prepared = { ok: true; ws: string; db: AiReadClient } | { ok: false; error: AiReadError };
export function prepare(ctx: AiReadContext, deps: AiReadDeps): Prepared {
  if (!isAiHubServerEnabled(deps.env)) return fail('AI_HUB_DISABLED');
  if (typeof ctx?.workspaceId !== 'string' || !UUID.test(ctx.workspaceId)) return fail('INVALID_CONTEXT');
  if (!deps.client && (typeof ctx.accessToken !== 'string' || ctx.accessToken.length < 20)) return fail('INVALID_CONTEXT');
  let db: AiReadClient;
  try { db = deps.client ?? (userClient(ctx.accessToken!) as unknown as AiReadClient); } catch { return fail('READ_FAILED'); }
  return { ok: true, ws: ctx.workspaceId.toLowerCase(), db };
}

/** Strict: unknown keys, wrong types and out-of-contract values are rejected. */
export function parseFilters(raw: unknown, spec: Record<string, readonly string[] | 'uuid' | 'iso' | 'date'>): { ok: true; value: Record<string, string> } | { ok: false; error: AiReadError } {
  if (raw === undefined || raw === null) return { ok: true, value: {} };
  if (typeof raw !== 'object' || Array.isArray(raw)) return fail('INVALID_FILTER');
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue;
    const rule = spec[k];
    if (!rule) return fail('INVALID_FILTER', `unknown filter ${k}`);
    if (typeof v !== 'string') return fail('INVALID_FILTER', k);
    const good = rule === 'uuid' ? UUID.test(v) : rule === 'date' ? isCalendarDate(v) : rule === 'iso' ? ISO.test(v) && !Number.isNaN(Date.parse(v)) : rule.includes(v);
    if (!good) return fail('INVALID_FILTER', k);
    out[k] = rule === 'uuid' ? v.toLowerCase() : v;
  }
  return { ok: true, value: out };
}

export function parsePage(raw: AiPageRequest | undefined, limits: { def: number; max: number } = { def: AI_READ_DEFAULT_PAGE_SIZE, max: AI_READ_MAX_PAGE_SIZE }): { ok: true; page: number; size: number; from: number; to: number } | { ok: false; error: AiReadError } {
  const page = raw?.page ?? 0;
  const size = raw?.pageSize ?? limits.def;
  if (!Number.isInteger(page) || page < 0 || page > AI_READ_MAX_PAGE) return fail('INVALID_FILTER', 'page');
  if (!Number.isInteger(size) || size < 1 || size > limits.max) return fail('INVALID_FILTER', 'pageSize');
  return { ok: true, page, size, from: page * size, to: page * size + size }; // size+1 rows: lookahead
}

/** DB errors map to coarse codes; raw messages/SQL are never returned. */
export const dbFail = (e: { code?: string } | null | undefined) => (e?.code === '42501' ? fail('FORBIDDEN') : fail('READ_FAILED'));

export const rec = (v: unknown): JsonRecord => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as JsonRecord) : {});
export const s = (v: unknown): string => String(v);
export const sn = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
export const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
export const sliced = <T,>(rows: T[], page: number, size: number): AiPage<T> => ({ items: rows.slice(0, size), page, pageSize: size, hasNext: rows.length > size });
