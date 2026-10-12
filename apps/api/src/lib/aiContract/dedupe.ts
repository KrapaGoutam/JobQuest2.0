// Deterministic dedupe keys (DATA_MODEL_PLAN §5). Provider is deliberately NOT an
// input for events/leads/recruiters: two providers seeing the same event must converge
// on one finding. The single exception is the Daily Digest (AI-5): each provider's
// digest is its own snapshot, so provider is part of the daily_brief identity.
import { sha256Hex } from './canonical';
import { AI_LIMITS, type AiFindingKind } from './constants';

export interface DedupeInput {
  source_type?: string | null;
  source_id?: string | null;
  event?: string | null;
  date?: string | null; // YYYY-MM-DD (daily_brief)
  provider?: string | null; // daily_brief only
  job_url?: string | null;
  external_job_id?: string | null;
  company?: string | null;
  title?: string | null;
  name?: string | null;
  channel?: string | null;
  summary?: string | null;
  // AI-6 identity inputs (all optional; the strongest available wins).
  /** Job board / ATS name, lowercased by the key builder (e.g. "greenhouse", "linkedin"). */
  source_name?: string | null;
  location?: string | null;
  posted_date?: string | null; // YYYY-MM-DD, only when the source states it
  /** Recruiter: public profile URL (canonicalized). */
  profile_url?: string | null;
  role?: string | null;
  // email_event fallback when no stable message id exists.
  occurred_at?: string | null;
  sender?: string | null;
  subject?: string | null;
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
export const isIsoDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) &&
  new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

export type DedupeResult = { ok: true; key: string } | { ok: false; reason: string };
const ok = (key: string): DedupeResult =>
  key.length <= AI_LIMITS.dedupeKey && /^[\x21-\x7e]+$/.test(key) ? { ok: true, key } : { ok: false, reason: 'dedupe key out of range' };

export function buildDedupeKey(kind: AiFindingKind, i: DedupeInput): DedupeResult {
  switch (kind) {
    case 'email_event': {
      // Primary identity: the provider's stable message id (one finding per message).
      // `event` is optional (default "message") so re-classifying the same message updates
      // one finding instead of creating a second one. Subject lines alone never identify an email.
      const st = clean(i.source_type).toLowerCase(), id = clean(i.source_id), ev = clean(i.event).toLowerCase() || 'message';
      if (st && id) return ok(`ev:${sha256Hex(`${st}|${id}|${ev}`)}`);
      // Fallback ONLY when no message id exists: source + received timestamp + sender + normalized subject.
      const ts = clean(i.occurred_at), sender = normalizeIdentityText(i.sender), subject = normalizeIdentityText(i.subject);
      if (st && ts && sender && subject) return ok(`emfb:${sha256Hex(`${st}|${ts}|${sender}|${subject}`)}`);
      return { ok: false, reason: 'email_event requires source_type and a stable source_id (message id), or source_type + received time + sender + subject' };
    }
    case 'calendar_event': {
      const st = clean(i.source_type).toLowerCase(), id = clean(i.source_id), ev = clean(i.event).toLowerCase();
      if (!st || !id || !ev) return { ok: false, reason: 'dedupe requires source_type, source_id and event' };
      return ok(`ev:${sha256Hex(`${st}|${id}|${ev}`)}`);
    }
    case 'job_lead': {
      // Provider is deliberately NOT part of the identity. Strongest available identity wins:
      //  1. external job id (scoped by source name, since ids are only unique per board)
      //  2. canonical job URL
      //  3. company + title + location + posted date
      //  4. company + title + source name
      const src = normalizeIdentityText(i.source_name);
      const ext = clean(i.external_job_id);
      if (ext && src) return ok(`job:${sha256Hex(`${src}|${ext}`)}`);
      if (clean(i.job_url)) {
        const c = canonicalizeUrl(clean(i.job_url));
        if (!c) return { ok: false, reason: 'dedupe job_url is not a valid http(s) URL' };
        const k = `url:${c}`;
        return /^[!-~]{1,255}$/.test(k) ? { ok: true, key: k } : ok(`urlsha:${sha256Hex(c)}`);
      }
      const co = normalizeIdentityText(i.company), ti = normalizeIdentityText(i.title);
      const loc = normalizeIdentityText(i.location), posted = clean(i.posted_date);
      if (co && ti && loc && posted && isIsoDate(posted)) return ok(`jobclp:${sha256Hex(`${co}|${ti}|${loc}|${posted}`)}`);
      if (co && ti && src) return ok(`jobcts:${sha256Hex(`${co}|${ti}|${src}`)}`);
      return { ok: false, reason: 'job lead needs external_job_id with source_name, job_url, company+title+location+posted_date, or company+title+source_name' };
    }
    case 'daily_brief': {
      const d = clean(i.date), pr = clean(i.provider).toLowerCase();
      if (!isIsoDate(d)) return { ok: false, reason: 'daily_brief requires date YYYY-MM-DD' };
      if (!/^[a-z]{2,16}$/.test(pr)) return { ok: false, reason: 'daily_brief requires a provider' };
      return ok(`daily_brief:${d}:${pr}`);
    }
    case 'recruiter_intel': {
      // Prefer the public profile/source identity; fall back to name + company + role. Provider and
      // contact channel are NOT identity, so two providers researching one person converge.
      const n = normalizeIdentityText(i.name), c = normalizeIdentityText(i.company), r = normalizeIdentityText(i.role);
      if (!n || !c) return { ok: false, reason: 'recruiter_intel requires name and company' };
      if (clean(i.profile_url)) {
        const u = canonicalizeUrl(clean(i.profile_url));
        if (!u) return { ok: false, reason: 'dedupe profile_url is not a valid http(s) URL' };
        return ok(`recruiter:url:${sha256Hex(u)}`);
      }
      return ok(`recruiter:${sha256Hex(`${n}|${c}|${r}`)}`);
    }
    default: {
      const t = normalizeIdentityText(i.title), s = normalizeIdentityText(i.summary);
      if (!t) return { ok: false, reason: 'note/other requires title for content identity' };
      return ok(`${kind}:${sha256Hex(`${t}|${s}`)}`);
    }
  }
}
