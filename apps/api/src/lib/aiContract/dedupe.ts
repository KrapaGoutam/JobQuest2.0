// Deterministic dedupe keys (DATA_MODEL_PLAN §5). Provider is deliberately NOT an
// input: two providers seeing the same event must converge on one finding.
import { sha256Hex } from './canonical';
import { AI_LIMITS, type AiFindingKind } from './constants';

export interface DedupeInput {
  source_type?: string | null;
  source_id?: string | null;
  event?: string | null;
  date?: string | null; // YYYY-MM-DD (daily_brief)
  job_url?: string | null;
  external_job_id?: string | null;
  company?: string | null;
  title?: string | null;
  name?: string | null;
  channel?: string | null;
  summary?: string | null;
}

const TRACKING_PARAM = /^(utm_.*|gclid|fbclid|msclkid|mc_cid|mc_eid|igshid|_hsenc|_hsmi|trk|trackingid)$/i;

/** Lowercase scheme/host, drop fragment, credentials, tracking params; sort query; trim trailing slash. */
export function canonicalizeUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  u.hash = '';
  u.username = '';
  u.password = '';
  const kept = [...u.searchParams.entries()].filter(([k]) => !TRACKING_PARAM.test(k));
  kept.sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1));
  u.search = '';
  for (const [k, v] of kept) u.searchParams.append(k, v);
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '') || '/';
  return u.toString();
}

/** Casefold + collapse whitespace; used for name/company/title identity tuples. */
export const normalizeIdentityText = (s: string | null | undefined): string =>
  (s ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

const clean = (s: string | null | undefined): string => (s ?? '').trim();
const isIsoDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) &&
  new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

export type DedupeResult = { ok: true; key: string } | { ok: false; reason: string };
const ok = (key: string): DedupeResult =>
  key.length <= AI_LIMITS.dedupeKey && /^[\x21-\x7e]+$/.test(key) ? { ok: true, key } : { ok: false, reason: 'dedupe key out of range' };

export function buildDedupeKey(kind: AiFindingKind, i: DedupeInput): DedupeResult {
  switch (kind) {
    case 'email_event':
    case 'calendar_event': {
      const st = clean(i.source_type).toLowerCase(), id = clean(i.source_id), ev = clean(i.event).toLowerCase();
      if (!st || !id || !ev) return { ok: false, reason: 'dedupe requires source_type, source_id and event' };
      return ok(`ev:${sha256Hex(`${st}|${id}|${ev}`)}`);
    }
    case 'job_lead': {
      if (clean(i.job_url)) {
        const c = canonicalizeUrl(clean(i.job_url));
        if (!c) return { ok: false, reason: 'dedupe job_url is not a valid http(s) URL' };
        const k = `url:${c}`;
        return /^[\x21-\x7e]{1,255}$/.test(k) ? { ok: true, key: k } : ok(`urlsha:${sha256Hex(c)}`);
      }
      if (clean(i.external_job_id)) {
        const st = clean(i.source_type).toLowerCase();
        if (!st) return { ok: false, reason: 'external_job_id requires source_type' };
        return ok(`job:${sha256Hex(`${st}|${clean(i.external_job_id)}`)}`);
      }
      const co = normalizeIdentityText(i.company), ti = normalizeIdentityText(i.title);
      if (!co || !ti) return { ok: false, reason: 'job lead needs job_url, external_job_id or company+title' };
      return ok(`jobct:${sha256Hex(`${co}|${ti}`)}`);
    }
    case 'daily_brief': {
      const d = clean(i.date);
      return isIsoDate(d) ? ok(`daily_brief:${d}`) : { ok: false, reason: 'daily_brief requires date YYYY-MM-DD' };
    }
    case 'recruiter_intel': {
      const n = normalizeIdentityText(i.name), c = normalizeIdentityText(i.company), ch = normalizeIdentityText(i.channel);
      if (!n || !c) return { ok: false, reason: 'recruiter_intel requires name and company' };
      return ok(`recruiter:${sha256Hex(`${n}|${c}|${ch}`)}`);
    }
    default: {
      const t = normalizeIdentityText(i.title), s = normalizeIdentityText(i.summary);
      if (!t) return { ok: false, reason: 'note/other requires title for content identity' };
      return ok(`${kind}:${sha256Hex(`${t}|${s}`)}`);
    }
  }
}
