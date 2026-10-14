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
  /** Recruiter (AI-11E): the provider's stable person id (scoped by source_name) and a cited work email. */
  person_id?: string | null;
  email?: string | null;
  // email_event fallback when no stable message id exists.
  occurred_at?: string | null;
  sender?: string | null;
  subject?: string | null;
  // AI-7 calendar identity inputs. `source_name` is the calendar provider ("google_calendar", "outlook").
  /** Closed calendar category (interview, assessment_deadline, ...). */
  category?: string | null;
  /** Normalized sort instant (UTC ISO) of the event/deadline. */
  start_at?: string | null;
}

/**
 * Cross-provider identity of a calendar item: same company + category + title + start MINUTE. Title alone is
 * never an identity (two "Interview" events on different dates stay distinct because the start is part of it).
 * The organizer domain is NOT hashed (a provider may not know it); the resolve step uses it only as a guard.
 */
export function calendarLogicalKey(i: { company?: string | null; category?: string | null; title?: string | null; start_at?: string | null }): string | null {
  const co = normalizeIdentityText(i.company), cat = normalizeIdentityText(i.category), ti = normalizeIdentityText(i.title);
  const t = i.start_at ? Date.parse(i.start_at) : NaN;
  if (!cat || !ti || Number.isNaN(t)) return null;
  const minute = new Date(Math.floor(t / 60_000) * 60_000).toISOString();
  return sha256Hex(`${co}|${cat}|${ti}|${minute}`);
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

const LEGAL_SUFFIX = /\b(incorporated|inc|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|plc|gmbh|lp|llp)\b\.?/g;
/** Company identity without legal suffixes or punctuation ("Acme, Inc." = "ACME"). Shared by job-lead, recruiter and target-company identity. */
export const companyIdentityKey = (s: string | null | undefined): string =>
  normalizeIdentityText(s).replace(/[.,]/g, ' ').replace(LEGAL_SUFFIX, ' ').replace(/[^a-z0-9&+# ]+/g, ' ').replace(/\s+/g, ' ').trim();

const clean = (s: string | null | undefined): string => (s ?? '').trim();
export const isIsoDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) &&
  new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

export type DedupeResult = { ok: true; key: string } | { ok: false; reason: string };
const ok = (key: string): DedupeResult =>
  key.length <= AI_LIMITS.dedupeKey && /^[\x21-\x7e]+$/.test(key) ? { ok: true, key } : { ok: false, reason: 'dedupe key out of range' };

export interface RecruiterIdentity {
  ok: true;
  /**
   * Candidate dedupe keys, STRONGEST FIRST; keys[0] is the key a NEW finding is stored under. Later entries only exist so a
   * second submission that reaches the same person through a different tier resolves to the existing finding:
   *   1. canonical public profile URL    2. provider person id (scoped by source)    3. verified work email
   *   4. normalized name + normalized company (conservative fallback)    5. pre-AI-11E name + company + role (lookup only)
   * Never first name alone; never the name without the company, so one name at two companies stays two people.
   */
  keys: string[];
  /** Hashes of the strong identities, stored server-side so a weaker tier can never merge two DIFFERENT strong identities. */
  profileKey: string | null;
  personKey: string | null;
  companyKey: string;
}

/** Pure; the validated payload is the only input (provider free text in `dedupe` never overrides it). */
export function recruiterIdentity(i: DedupeInput): RecruiterIdentity | { ok: false; reason: string } {
  const n = normalizeIdentityText(i.name), c = normalizeIdentityText(i.company), r = normalizeIdentityText(i.role);
  const ck = companyIdentityKey(i.company);
  if (!n || !c || !ck) return { ok: false, reason: 'recruiter_intel requires name and company' };
  const keys: string[] = [];
  let profileKey: string | null = null, personKey: string | null = null;
  if (clean(i.profile_url)) {
    const u = canonicalizeUrl(clean(i.profile_url));
    if (!u) return { ok: false, reason: 'dedupe profile_url is not a valid http(s) URL' };
    profileKey = sha256Hex(u);
    keys.push(`recruiter:url:${profileKey}`);
  }
  const src = normalizeIdentityText(i.source_name), pid = clean(i.person_id);
  if (src && pid) { personKey = sha256Hex(`${src}|${pid}`); keys.push(`recruiter:pid:${personKey}`); }
  const email = clean(i.email).toLowerCase();
  if (email) keys.push(`recruiter:email:${sha256Hex(email)}`);
  keys.push(`recruiter:nc:${sha256Hex(`${n}|${ck}`)}`);
  if (r) keys.push(`recruiter:${sha256Hex(`${n}|${c}|${r}`)}`);
  return { ok: true, keys, profileKey, personKey, companyKey: ck };
}

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
      // Primary identity: the calendar provider + its stable event id. A reschedule or cancellation of the
      // same provider event keeps the id, so it updates ONE finding instead of creating a second active event.
      const src = normalizeIdentityText(i.source_name), id = clean(i.source_id);
      if (id) {
        if (!src) return { ok: false, reason: 'calendar events with a source_id need dedupe.source_name (the calendar provider, e.g. google_calendar)' };
        return ok(`cal:${sha256Hex(`${src}|${id}`)}`);
      }
      // Fallback ONLY when the provider exposes no event id: company + category + title + start minute.
      const logical = calendarLogicalKey({ company: i.company, category: i.category, title: i.title, start_at: i.start_at });
      if (!logical) return { ok: false, reason: 'calendar event needs dedupe.source_name + source_id, or category + title + a start time' };
      return ok(`calfb:${logical}`);
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
      const r = recruiterIdentity(i);
      return r.ok ? ok(r.keys[0]!) : r;
    }
    default: {
      const t = normalizeIdentityText(i.title), s = normalizeIdentityText(i.summary);
      if (!t) return { ok: false, reason: 'note/other requires title for content identity' };
      return ok(`${kind}:${sha256Hex(`${t}|${s}`)}`);
    }
  }
}
