// Validation + normalization for jobquest.ai-result. Hand-rolled (no new
// dependency) because unknown-field COUNTING is a contract requirement that
// zod's strip mode does not report. Never throws on provider input.
import {
  AI_CONTRACT_NAME, AI_CONTRACT_VERSION, AI_EVENT_PATTERN, DIGEST_LIMITS, DIGEST_PAYLOAD_VERSION, DIGEST_SECTION_KEYS, DIGEST_SECTION_STATUSES, DIGEST_SUMMARY_KEYS, AI_FINDING_KINDS, AI_LIMITS,
  AI_MAX_SUPPORTED_MINOR, AI_PRIORITIES, AI_PROVIDERS, AI_SOURCE_TYPES, AI_SUGGESTION_ACTIONS,
  AI_SUGGESTION_TARGET_TYPES, AI_SUPPORTED_MAJORS, AI_WORKFLOWS,
  EMAIL_CATEGORIES, JOB_DESCRIPTION_MAX_CHARS, JOB_EMPLOYMENT_TYPES, JOB_SALARY_PERIODS, JOB_WORK_ARRANGEMENTS,
  RECRUITER_RELATIONSHIPS, RECRUITER_UNCERTAIN_FIELDS, RECRUITER_VERIFICATIONS, SOURCE_PAYLOAD_VERSION,
  type AiFindingKind, type AiProvider, type AiSuggestionTargetType, type AiTriggerType,
} from './constants';
import { buildDedupeKey, canonicalizeUrl, isIsoDate, type DedupeInput } from './dedupe';
import type {
  AiFinding, AiIngestRunInput, AiIssue, AiJobLeadProjection, AiResult, AiSourceRef, AiSuggestion, AiValidationResult,
  JsonRecord, JsonValue,
} from './types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Scope/authority fields a provider must never control. Dropped, counted, and warned about. */
const UNTRUSTED_SCOPE_KEYS = new Set(['user_id', 'workspace_id', 'actor_id', 'application_id', 'account_id', 'tenant_id']);

class Ctx {
  errors: AiIssue[] = [];
  warnings: AiIssue[] = [];
  unknown = 0;
  err(path: string, code: string, message: string) { this.errors.push({ path, code, message }); }
  warn(path: string, code: string, message: string) { this.warnings.push({ path, code, message }); }
  /** Drop + count every key outside the allowlist. */
  strip(o: Obj, allowed: readonly string[], path: string) {
    for (const k of Object.keys(o)) {
      if (allowed.includes(k)) continue;
      this.unknown++;
      if (UNTRUSTED_SCOPE_KEYS.has(k)) this.warn(`${path}.${k}`, 'untrusted_scope_field', 'scope/authority field ignored; server derives it');
    }
  }
}

// ---- primitives -----------------------------------------------------------

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function text(c: Ctx, v: unknown, path: string, max: number, opts: { required?: boolean; truncate?: boolean } = {}): string | null {
  if (v === undefined || v === null) {
    if (opts.required) c.err(path, 'required', 'required');
    return null;
  }
  if (typeof v !== 'string') { c.err(path, 'type', 'must be a string'); return null; }
  let s = v.normalize('NFC').replace(CONTROL, '').trim();
  if (!s) { if (opts.required) c.err(path, 'required', 'must not be empty'); return null; }
  const cps = [...s];
  if (cps.length > max) {
    if (!opts.truncate) { c.err(path, 'too_long', `max ${max} characters`); return null; }
    s = cps.slice(0, max).join('').trimEnd();
    c.warn(path, 'truncated', `truncated to ${max} characters`);
  }
  return s;
}

function oneOf<T extends string>(c: Ctx, v: unknown, path: string, allowed: readonly T[], required = true): T | null {
  if (v === undefined || v === null) { if (required) c.err(path, 'required', 'required'); return null; }
  if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return v as T;
  c.err(path, 'enum', `must be one of: ${allowed.join(', ')}`);
  return null;
}

/** Requires an explicit offset (Z or +-hh:mm); locale/ambiguous strings are rejected. */
const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
function timestamp(c: Ctx, v: unknown, path: string, required = false): string | null {
  if (v === undefined || v === null) { if (required) c.err(path, 'required', 'required'); return null; }
  if (typeof v !== 'string' || !ISO_TS.test(v.trim())) { c.err(path, 'timestamp', 'must be ISO-8601 with explicit timezone offset'); return null; }
  const t = Date.parse(v.trim());
  const year = new Date(t).getUTCFullYear();
  if (Number.isNaN(t) || year < 2000 || year > 2100) { c.err(path, 'timestamp', 'invalid or out-of-range date'); return null; }
  return new Date(t).toISOString();
}

/** Confidence is canonically 0..1 at 3 decimals (numeric(4,3)). 0..100 is NOT accepted. */
function confidence(c: Ctx, v: unknown, path: string): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) { c.err(path, 'confidence', 'must be a number between 0 and 1'); return null; }
  return Math.round(v * 1000) / 1000;
}

function url(c: Ctx, v: unknown, path: string): string | null {
  const s = text(c, v, path, AI_LIMITS.url);
  if (s === null) return null;
  let u: URL;
  try { u = new URL(s); } catch { c.err(path, 'url', 'invalid URL'); return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') { c.err(path, 'url_scheme', 'only http(s) URLs are allowed'); return null; }
  if (u.username || u.password) { c.err(path, 'url_credentials', 'URLs with credentials are not allowed'); return null; }
  return u.toString();
}

const byteLen = (v: unknown) => Buffer.byteLength(JSON.stringify(v), 'utf8');

/** Bounded plain-JSON record: depth<=4, finite numbers, strings<=1000, no scope keys, size-capped. */
function boundedRecord(c: Ctx, v: unknown, path: string, maxBytes: number, reserved: readonly string[] = []): JsonRecord {
  if (v === undefined || v === null) return {};
  if (!isObj(v)) { c.err(path, 'type', 'must be an object'); return {}; }
  const clean = (x: unknown, depth: number): JsonValue | undefined => {
    if (x === null || typeof x === 'boolean') return x as JsonValue;
    if (typeof x === 'number') return Number.isFinite(x) ? x : undefined;
    if (typeof x === 'string') return [...x].slice(0, 1000).join('').replace(CONTROL, '');
    if (depth >= 4) { c.unknown++; return undefined; }
    if (Array.isArray(x)) return x.slice(0, 50).map((e) => clean(e, depth + 1)).filter((e): e is JsonValue => e !== undefined);
    if (isObj(x)) {
      const out: JsonRecord = {};
      for (const k of Object.keys(x).sort()) {
        if (UNTRUSTED_SCOPE_KEYS.has(k) || reserved.includes(k)) { c.unknown++; c.warn(`${path}.${k}`, 'reserved_key', 'reserved key dropped'); continue; }
        const r = clean(x[k], depth + 1);
        if (r !== undefined) out[k] = r;
      }
      return out;
    }
    c.unknown++;
    return undefined;
  };
  const out = clean(v, 0) as JsonRecord;
  if (byteLen(out) > maxBytes) { c.err(path, 'too_large', `max ${maxBytes} bytes`); return {}; }
  return out;
}

// ---- typed payloads --------------------------------------------------------

type PField = 'string' | 'number' | 'boolean' | 'url' | 'timestamp' | 'strings';
const PAYLOAD_SCHEMAS: Partial<Record<AiFindingKind, Record<string, PField>>> = {
  calendar_event: { start_at: 'timestamp', end_at: 'timestamp', location: 'string', attendee_count: 'number', join_url: 'url' },
};

function payload(c: Ctx, kind: AiFindingKind, v: unknown, path: string, dedupeDate?: string | null): JsonRecord {
  if (kind === 'daily_brief') return digestPayload(c, v, path, dedupeDate);
  const schema = PAYLOAD_SCHEMAS[kind];
  // note/other: bounded free-form record. Server-owned `seen_by` is always reserved.
  if (!schema) return boundedRecord(c, v, path, AI_LIMITS.payloadBytes, ['seen_by']);
  if (v === undefined || v === null) return {};
  if (!isObj(v)) { c.err(path, 'type', 'must be an object'); return {}; }
  c.strip(v, Object.keys(schema), path);
  const out: JsonRecord = {};
  for (const [k, t] of Object.entries(schema)) {
    const raw = v[k];
    if (raw === undefined || raw === null) continue;
    const p = `${path}.${k}`;
    let r: JsonValue | null = null;
    if (t === 'string') r = text(c, raw, p, 500);
    else if (t === 'url') r = url(c, raw, p);
    else if (t === 'timestamp') r = timestamp(c, raw, p);
    else if (t === 'number') { if (typeof raw === 'number' && Number.isFinite(raw)) r = raw; else c.err(p, 'type', 'must be a number'); }
    else if (t === 'boolean') { if (typeof raw === 'boolean') r = raw; else c.err(p, 'type', 'must be a boolean'); }
    else if (t === 'strings') {
      if (!Array.isArray(raw)) c.err(p, 'type', 'must be an array of strings');
      else r = raw.slice(0, 20).map((s, i) => text(c, s, `${p}[${i}]`, 500)).filter((s): s is string => s !== null);
    }
    if (r !== null) out[k] = r;
  }
  return out;
}

// ---- Daily Digest payload (AI-5) ---------------------------------------------

const DIGEST_KEYS = ['version', 'digest_date', 'time_zone', 'generated_at', 'summary', 'priorities', 'sections'] as const;
const DIGEST_ITEM_KEYS = ['title', 'detail', 'priority', 'source', 'url', 'occurred_at'] as const;
const DIGEST_SECTION_FIELDS = ['status', 'count', 'items'] as const;

function isValidTimeZone(z: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch { return false; }
}

function digestItem(c: Ctx, raw: unknown, path: string): JsonRecord | null {
  if (!isObj(raw)) { c.err(path, 'type', 'must be an object'); return null; }
  c.strip(raw, DIGEST_ITEM_KEYS, path);
  const e0 = c.errors.length;
  const title = text(c, raw.title, `${path}.title`, DIGEST_LIMITS.itemTitle, { required: true });
  const detail = text(c, raw.detail, `${path}.detail`, DIGEST_LIMITS.itemDetail, { truncate: true });
  const priority = raw.priority === undefined || raw.priority === null ? null : oneOf(c, raw.priority, `${path}.priority`, AI_PRIORITIES);
  const source = raw.source === undefined || raw.source === null ? null : oneOf(c, raw.source, `${path}.source`, AI_SOURCE_TYPES);
  const u = url(c, raw.url, `${path}.url`);
  const occurred = timestamp(c, raw.occurred_at, `${path}.occurred_at`);
  if (c.errors.length > e0 || !title) return null;
  const out: JsonRecord = { title };
  if (detail) out.detail = detail;
  if (priority) out.priority = priority;
  if (source) out.source = source;
  if (u) out.url = u;
  if (occurred) out.occurred_at = occurred;
  return out;
}

function digestItems(c: Ctx, raw: unknown, path: string, max: number): JsonRecord[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) { c.err(path, 'type', 'must be an array'); return []; }
  if (raw.length > max) { c.err(path, 'too_many', `max ${max} items (keep the digest concise)`); return []; }
  return raw.map((x, i) => digestItem(c, x, `${path}[${i}]`)).filter((x): x is JsonRecord => x !== null);
}

const digestCount = (c: Ctx, v: unknown, path: string): number | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > DIGEST_LIMITS.count) { c.err(path, 'count', `must be an integer 0..${DIGEST_LIMITS.count}`); return null; }
  return v;
};

/**
 * Normalizes a versioned Daily Digest payload. The server never invents counts or
 * items: absent summary keys stay absent (= not reported), and a section's status
 * must agree with its items so "zero" and "not configured" can never be conflated.
 */
function digestPayload(c: Ctx, v: unknown, path: string, dedupeDate: string | null | undefined): JsonRecord {
  if (!isObj(v)) { c.err(path, 'required', 'a Daily Digest payload object is required'); return {}; }
  c.strip(v, DIGEST_KEYS, path);
  const out: JsonRecord = {};

  const ver = typeof v.version === 'string' ? /^(\d{1,3})\.(\d{1,3})$/.exec(v.version) : null;
  if (!ver || Number(ver[1]) !== 1) c.err(`${path}.version`, 'version', `must be "${DIGEST_PAYLOAD_VERSION}" (major 1)`);
  else if (Number(ver[2]) > 0) c.warn(`${path}.version`, 'version_minor_ahead', 'digest minor is newer than 1.0; additive fields dropped');
  out.version = DIGEST_PAYLOAD_VERSION;

  const date = text(c, v.digest_date, `${path}.digest_date`, 10) ?? dedupeDate ?? null;
  if (!date || !isIsoDate(date)) c.err(`${path}.digest_date`, 'digest_date', 'must be a valid calendar date YYYY-MM-DD');
  else if (dedupeDate && date !== dedupeDate) c.err(`${path}.digest_date`, 'digest_date_mismatch', 'must equal dedupe.date');
  else out.digest_date = date;

  const tz = text(c, v.time_zone, `${path}.time_zone`, 64);
  if (tz) { if (isValidTimeZone(tz)) out.time_zone = tz; else c.err(`${path}.time_zone`, 'time_zone', 'must be an IANA time zone'); }
  const generated = timestamp(c, v.generated_at, `${path}.generated_at`);
  if (generated) out.generated_at = generated;

  if (v.summary !== undefined && v.summary !== null) {
    if (!isObj(v.summary)) c.err(`${path}.summary`, 'type', 'must be an object');
    else {
      c.strip(v.summary, DIGEST_SUMMARY_KEYS, `${path}.summary`);
      const sum: JsonRecord = {};
      for (const k of DIGEST_SUMMARY_KEYS) { const n = digestCount(c, v.summary[k], `${path}.summary.${k}`); if (n !== null) sum[k] = n; }
      out.summary = sum;
    }
  }

  out.priorities = digestItems(c, v.priorities, `${path}.priorities`, DIGEST_LIMITS.priorities);

  const sections: JsonRecord = {};
  if (v.sections !== undefined && v.sections !== null) {
    if (!isObj(v.sections)) c.err(`${path}.sections`, 'type', 'must be an object');
    else {
      c.strip(v.sections, DIGEST_SECTION_KEYS, `${path}.sections`);
      for (const key of DIGEST_SECTION_KEYS) {
        const raw = v.sections[key];
        if (raw === undefined || raw === null) continue;
        const sp = `${path}.sections.${key}`;
        if (!isObj(raw)) { c.err(sp, 'type', 'must be an object'); continue; }
        c.strip(raw, DIGEST_SECTION_FIELDS, sp);
        const status = oneOf(c, raw.status, `${sp}.status`, DIGEST_SECTION_STATUSES);
        const count = digestCount(c, raw.count, `${sp}.count`);
        const items = digestItems(c, raw.items, `${sp}.items`, DIGEST_LIMITS.itemsPerSection);
        if (!status) continue;
        if (status === 'available' && items.length === 0 && !(count && count > 0)) c.err(sp, 'section_inconsistent', '"available" needs items or a count > 0');
        else if (status === 'zero' && (items.length > 0 || (count ?? 0) > 0)) c.err(sp, 'section_inconsistent', '"zero" cannot carry items or a count > 0');
        else if (status === 'not_configured' && (items.length > 0 || count !== null)) c.err(sp, 'section_inconsistent', '"not_configured" cannot carry items or a count');
        else sections[key] = { status, ...(status === 'zero' ? { count: 0 } : count !== null ? { count } : {}), items };
      }
    }
  }
  out.sections = sections;

  if (byteLen(out) > AI_LIMITS.payloadBytes) c.err(path, 'too_large', `digest payload exceeds ${AI_LIMITS.payloadBytes} bytes; shorten items`);
  return out;
}

// ---- External intelligence payloads (AI-6) ------------------------------------
// job_lead / email_event / recruiter_intel. Providers submit untrusted text; everything below
// is allow-listed, bounded and normalized. Nothing is invented: absent facts stay absent.

const SOURCE_KEY_LIMITS = { short: 200, medium: 300, long: 1000, skill: 100, skills: 30 } as const;
const slug = (v: unknown): unknown => (typeof v === 'string' ? v.trim().toLowerCase().replace(/[\s-]+/g, '_') : v);

function sourceVersion(c: Ctx, v: unknown, path: string) {
  if (v === undefined || v === null) return;
  const m = typeof v === 'string' ? /^(\d{1,3})\.(\d{1,3})$/.exec(v) : null;
  if (!m || Number(m[1]) !== 1) c.err(`${path}.version`, 'version', `must be "${SOURCE_PAYLOAD_VERSION}" (major 1)`);
}

function enumField<T extends string>(c: Ctx, v: unknown, path: string, allowed: readonly T[], aliases: Record<string, T> = {}): T | null {
  if (v === undefined || v === null) return null;
  const s = slug(v);
  return oneOf(c, typeof s === 'string' ? aliases[s] ?? s : s, path, allowed, false);
}

function stringList(c: Ctx, v: unknown, path: string, maxItems: number, maxLen: number): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) { c.err(path, 'type', 'must be an array of strings'); return []; }
  if (v.length > maxItems) c.warn(path, 'truncated', `only the first ${maxItems} entries are kept`);
  const out: string[] = [];
  v.slice(0, maxItems).forEach((x, i) => {
    const t = text(c, x, `${path}[${i}]`, maxLen, { truncate: true });
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  });
  return out;
}

const hostOf = (u: string | null): string | null => {
  if (!u) return null;
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, '') || null; } catch { return null; }
};

/** Calendar date as stated by the source: YYYY-MM-DD, or the date part of an ISO timestamp. */
function calendarDate(c: Ctx, v: unknown, path: string): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') { c.err(path, 'type', 'must be a YYYY-MM-DD date'); return null; }
  const s = v.trim();
  const d = isIsoDate(s) ? s : ISO_TS.test(s) ? s.slice(0, 10) : '';
  if (!d || !isIsoDate(d) || Number(d.slice(0, 4)) < 2000 || Number(d.slice(0, 4)) > 2100) { c.err(path, 'date', 'must be a valid YYYY-MM-DD date'); return null; }
  return d;
}

/**
 * Plain-text job description. HTML is never stored: tags are removed (block tags become line
 * breaks), entities decoded once, control characters dropped, whitespace tidied. Over-long text
 * is truncated and FLAGGED (never silently presented as complete).
 */
export function normalizeJobDescription(raw: string): { text: string | null; truncated: boolean; length: number; htmlStripped: boolean } {
  let s = raw.normalize('NFC').replace(/\r\n?/g, '\n');
  const htmlStripped = /<\/?[a-z][^>]*>|<!--/i.test(s);
  if (htmlStripped) {
    s = s.replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<\/?(p|div|br|ul|ol|li|h[1-6]|tr|table|section|article|header|footer)\b[^>]*>/gi, '\n')
      .replace(/<\/?[a-z][^>]*>/gi, '');
  }
  s = s.replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&amp;/gi, '&');
  s = s.replace(/<\/?[a-z][^>]*>/gi, ''); // also removes tags that arrived entity-encoded
  s = s.replace(CONTROL, '').replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!s) return { text: null, truncated: false, length: 0, htmlStripped };
  const cps = [...s];
  if (cps.length <= JOB_DESCRIPTION_MAX_CHARS) return { text: s, truncated: false, length: cps.length, htmlStripped };
  return { text: cps.slice(0, JOB_DESCRIPTION_MAX_CHARS).join('').trimEnd(), truncated: true, length: cps.length, htmlStripped };
}

interface SourceParts { payload: JsonRecord; identity: DedupeInput }

const JOB_KEYS = [
  'version', 'company', 'role_title', 'location', 'work_arrangement', 'remote', 'employment_type', 'source_name', 'job_url',
  'external_job_id', 'posted_date', 'salary_min', 'salary_max', 'salary_currency', 'salary_period', 'salary_text',
  'experience_level', 'required_experience', 'match_score', 'match_reasoning', 'required_skills', 'preferred_skills',
  'fit_notes', 'description',
] as const;

function salaryInt(c: Ctx, v: unknown, path: string): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 10_000_000) { c.err(path, 'salary', 'must be an integer between 0 and 10,000,000 (only if the posting publishes it)'); return null; }
  return v;
}

function jobLeadPayload(
  c: Ctx, v: unknown, path: string, ctx: { dedupe: DedupeInput; sourceUrl: string | null },
): SourceParts & { job: AiJobLeadProjection | null } {
  const empty = { payload: {}, identity: {}, job: null };
  if (!isObj(v)) { c.err(path, 'required', 'a job_lead payload with company and role_title is required'); return empty; }
  c.strip(v, JOB_KEYS, path);
  const e0 = c.errors.length;
  sourceVersion(c, v.version, path);
  const company = text(c, v.company, `${path}.company`, SOURCE_KEY_LIMITS.short) ?? ctx.dedupe.company ?? null;
  const title = text(c, v.role_title, `${path}.role_title`, SOURCE_KEY_LIMITS.medium) ?? ctx.dedupe.title ?? null;
  if (!company || !title) { c.err(path, 'job_lead_identity', 'company and role_title are required'); return empty; }
  const location = text(c, v.location, `${path}.location`, SOURCE_KEY_LIMITS.short);
  let arrangement = enumField(c, v.work_arrangement, `${path}.work_arrangement`, JOB_WORK_ARRANGEMENTS, { on_site: 'onsite', in_office: 'onsite', office: 'onsite' });
  if (v.remote !== undefined && v.remote !== null) {
    if (typeof v.remote !== 'boolean') c.err(`${path}.remote`, 'type', 'must be a boolean');
    else if (v.remote && !arrangement) arrangement = 'remote'; // legacy 1.0 flag
  }
  const employment = enumField(c, v.employment_type, `${path}.employment_type`, JOB_EMPLOYMENT_TYPES, { fulltime: 'full_time', parttime: 'part_time', intern: 'internship', contractor: 'contract' });
  const jobUrl = url(c, v.job_url, `${path}.job_url`);
  const canonical = jobUrl ? canonicalizeUrl(jobUrl) : null;
  const externalId = text(c, v.external_job_id, `${path}.external_job_id`, AI_LIMITS.id);
  const sourceName = (text(c, v.source_name, `${path}.source_name`, 64) ?? hostOf(jobUrl ?? ctx.sourceUrl))?.toLowerCase() ?? null;
  const posted = calendarDate(c, v.posted_date, `${path}.posted_date`);

  // Salary: only what the posting explicitly publishes. An inverted range is dropped, not "fixed".
  let salaryMin = salaryInt(c, v.salary_min, `${path}.salary_min`);
  let salaryMax = salaryInt(c, v.salary_max, `${path}.salary_max`);
  if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
    c.warn(`${path}.salary_min`, 'salary_range', 'salary_min is greater than salary_max; salary dropped');
    salaryMin = null; salaryMax = null;
  }
  const curRaw = text(c, v.salary_currency, `${path}.salary_currency`, 3);
  let currency: string | null = null;
  if (curRaw) { if (/^[A-Za-z]{3}$/.test(curRaw)) currency = curRaw.toUpperCase(); else c.err(`${path}.salary_currency`, 'currency', 'must be a 3-letter ISO 4217 code'); }
  const period = enumField(c, v.salary_period, `${path}.salary_period`, JOB_SALARY_PERIODS, { yearly: 'year', annual: 'year', annually: 'year', monthly: 'month', weekly: 'week', daily: 'day', hourly: 'hour' });
  const salaryText = text(c, v.salary_text, `${path}.salary_text`, SOURCE_KEY_LIMITS.short);

  const experience = text(c, v.experience_level, `${path}.experience_level`, 60);
  const requiredExp = text(c, v.required_experience, `${path}.required_experience`, SOURCE_KEY_LIMITS.medium);
  let score: number | null = null;
  if (v.match_score !== undefined && v.match_score !== null) {
    if (typeof v.match_score !== 'number' || !Number.isFinite(v.match_score) || v.match_score < 0 || v.match_score > 100) c.err(`${path}.match_score`, 'match_score', 'must be a number between 0 and 100');
    else score = Math.round(v.match_score);
  }
  const reasoning = text(c, v.match_reasoning, `${path}.match_reasoning`, SOURCE_KEY_LIMITS.long, { truncate: true });
  const required = stringList(c, v.required_skills, `${path}.required_skills`, SOURCE_KEY_LIMITS.skills, SOURCE_KEY_LIMITS.skill);
  const preferred = stringList(c, v.preferred_skills, `${path}.preferred_skills`, SOURCE_KEY_LIMITS.skills, SOURCE_KEY_LIMITS.skill);
  const fit = text(c, v.fit_notes, `${path}.fit_notes`, SOURCE_KEY_LIMITS.long, { truncate: true });

  let desc: ReturnType<typeof normalizeJobDescription> | null = null;
  if (v.description !== undefined && v.description !== null) {
    if (typeof v.description !== 'string') c.err(`${path}.description`, 'type', 'must be a plain-text string');
    else {
      desc = normalizeJobDescription(v.description);
      if (desc.htmlStripped) c.warn(`${path}.description`, 'html_stripped', 'HTML markup removed; only plain text is stored');
      if (desc.truncated) c.warn(`${path}.description`, 'description_truncated', `description truncated to ${JOB_DESCRIPTION_MAX_CHARS} characters (original ${desc.length})`);
    }
  }

  const out: JsonRecord = { version: SOURCE_PAYLOAD_VERSION, company, role_title: title };
  const put = (k: string, val: JsonValue | null) => { if (val !== null && val !== undefined && !(Array.isArray(val) && val.length === 0)) out[k] = val; };
  put('location', location); put('work_arrangement', arrangement); put('employment_type', employment);
  put('source_name', sourceName); put('job_url', jobUrl); put('external_job_id', externalId); put('posted_date', posted);
  put('salary_min', salaryMin); put('salary_max', salaryMax); put('salary_currency', currency); put('salary_period', period); put('salary_text', salaryText);
  put('experience_level', experience); put('required_experience', requiredExp);
  put('match_score', score); put('match_reasoning', reasoning);
  put('required_skills', required); put('preferred_skills', preferred); put('fit_notes', fit);
  if (desc?.text) { out.description_truncated = desc.truncated; out.description_length = desc.length; }
  if (byteLen(out) > AI_LIMITS.payloadBytes) c.err(path, 'too_large', `job_lead payload (without description) exceeds ${AI_LIMITS.payloadBytes} bytes`);
  if (c.errors.length > e0) return empty;

  const job: AiJobLeadProjection = {
    company, title, location, work_arrangement: arrangement, employment_type: employment, source_name: sourceName,
    source_url: jobUrl ?? ctx.sourceUrl, canonical_url: canonical ?? (ctx.sourceUrl ? canonicalizeUrl(ctx.sourceUrl) : null),
    external_job_id: externalId, posted_date: posted, salary_min: salaryMin, salary_max: salaryMax, salary_currency: currency,
    salary_period: period, experience_level: experience, match_score: score, description: desc?.text ?? null,
    description_truncated: desc?.truncated ?? false, description_length: desc?.text ? desc.length : null,
    required_skills: required, preferred_skills: preferred, payload_version: SOURCE_PAYLOAD_VERSION,
  };
  return {
    payload: out, job,
    identity: { company, title, location, posted_date: posted, source_name: sourceName, external_job_id: externalId, job_url: ctx.dedupe.job_url ?? jobUrl },
  };
}

// ---- email_event ------------------------------------------------------------------------
// Intelligence about a job-search email, NOT a mailbox copy: no body, no attachments, no
// full address (display name + sender domain only), bounded subject/summary/evidence.

const EMAIL_KEYS = ['version', 'sender_name', 'sender_domain', 'from_domain', 'subject', 'company', 'role_title', 'next_step', 'deadline', 'needs_attention'] as const;
const RAW_BODY_KEYS = new Set(['body', 'raw_body', 'body_text', 'body_html', 'html', 'html_body', 'full_text', 'message_body', 'email_body', 'content', 'text', 'attachments']);
const DOMAIN = /^(?=.{3,255}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

function warnRawBody(c: Ctx, o: Obj, path: string) {
  for (const k of Object.keys(o)) if (RAW_BODY_KEYS.has(k)) c.warn(`${path}.${k}`, 'raw_body_rejected', 'message bodies and attachments are never stored; send a concise summary and a short evidence excerpt instead');
}

function emailPayload(c: Ctx, v: unknown, path: string, raw: Obj): SourceParts & { dueFromDeadline: string | null } {
  warnRawBody(c, raw, path.replace(/\.payload$/, ''));
  const out: JsonRecord = { version: SOURCE_PAYLOAD_VERSION };
  const empty = { payload: {}, identity: {}, dueFromDeadline: null };
  if (v !== undefined && v !== null && !isObj(v)) { c.err(path, 'type', 'must be an object'); return empty; }
  const o: Obj = isObj(v) ? v : {};
  warnRawBody(c, o, path);
  c.strip(o, EMAIL_KEYS, path);
  sourceVersion(c, o.version, path);
  // Display name only: drop any address-like text so a full address is never retained.
  const nameRaw = text(c, o.sender_name, `${path}.sender_name`, SOURCE_KEY_LIMITS.short);
  const senderName = nameRaw ? nameRaw.replace(/<[^>]*>/g, '').replace(/\S+@\S+/g, '').replace(/\s+/g, ' ').trim() || null : null;
  const domRaw = text(c, o.sender_domain ?? o.from_domain, `${path}.sender_domain`, 255);
  let domain: string | null = null;
  if (domRaw) {
    const d = (domRaw.includes('@') ? domRaw.slice(domRaw.lastIndexOf('@') + 1) : domRaw).replace(/[>\s]/g, '').toLowerCase();
    if (DOMAIN.test(d)) domain = d; else c.err(`${path}.sender_domain`, 'domain', 'must be a sender domain such as example.com');
  }
  const subject = text(c, o.subject, `${path}.subject`, SOURCE_KEY_LIMITS.short, { truncate: true });
  const company = text(c, o.company, `${path}.company`, SOURCE_KEY_LIMITS.short);
  const role = text(c, o.role_title, `${path}.role_title`, SOURCE_KEY_LIMITS.medium);
  const next = text(c, o.next_step, `${path}.next_step`, SOURCE_KEY_LIMITS.medium, { truncate: true });
  const deadline = timestamp(c, o.deadline, `${path}.deadline`);
  let attention: boolean | null = null;
  if (o.needs_attention !== undefined && o.needs_attention !== null) {
    if (typeof o.needs_attention === 'boolean') attention = o.needs_attention; else c.err(`${path}.needs_attention`, 'type', 'must be a boolean');
  }
  const put = (k: string, val: JsonValue | null) => { if (val !== null) out[k] = val; };
  put('sender_name', senderName); put('sender_domain', domain); put('subject', subject); put('company', company);
  put('role_title', role); put('next_step', next); put('deadline', deadline); put('needs_attention', attention);
  if (byteLen(out) > AI_LIMITS.payloadBytes) c.err(path, 'too_large', 'email payload too large');
  return { payload: out, identity: { sender: [senderName, domain].filter(Boolean).join('|'), subject }, dueFromDeadline: deadline };
}

// ---- recruiter_intel -----------------------------------------------------------------------

const RECRUITER_KEYS = [
  'version', 'recruiter_name', 'role_title', 'company', 'relationship', 'verification', 'uncertain_fields', 'source_name',
  'profile_url', 'channel', 'contact_email', 'contact_phone', 'contact_source_url', 'related_job',
] as const;
const RELATED_JOB_KEYS = ['job_url', 'external_job_id', 'source_name', 'company', 'title', 'location', 'posted_date'] as const;
const EMAIL_ADDR = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
const PHONE = /^\+?[0-9][0-9 ().-]{5,24}[0-9]$/;

function recruiterPayload(c: Ctx, v: unknown, path: string, ctx: { sourceUrl: string | null }): SourceParts {
  const empty = { payload: {}, identity: {} };
  if (!isObj(v)) { c.err(path, 'required', 'a recruiter_intel payload with recruiter_name and company is required'); return empty; }
  c.strip(v, RECRUITER_KEYS, path);
  const e0 = c.errors.length;
  sourceVersion(c, v.version, path);
  const name = text(c, v.recruiter_name, `${path}.recruiter_name`, SOURCE_KEY_LIMITS.short, { required: true });
  const company = text(c, v.company, `${path}.company`, SOURCE_KEY_LIMITS.short, { required: true });
  const role = text(c, v.role_title, `${path}.role_title`, SOURCE_KEY_LIMITS.short);
  const relationship = enumField(c, v.relationship, `${path}.relationship`, RECRUITER_RELATIONSHIPS, { talent: 'talent_acquisition', ta: 'talent_acquisition', hiring_manager: 'hiring_manager' });
  const profileUrl = url(c, v.profile_url, `${path}.profile_url`);
  const sourceName = text(c, v.source_name, `${path}.source_name`, 100);
  const channel = text(c, v.channel, `${path}.channel`, 64);
  // A recruiter is only ever reported with a public source citation (profile or source URL).
  if (!profileUrl && !ctx.sourceUrl) c.err(path, 'recruiter_source_required', 'a public source URL (source.url or payload.profile_url) is required; do not report recruiters without one');

  // Public contact details only when a cited source URL accompanies them. Never guessed or inferred.
  const emailRaw = text(c, v.contact_email, `${path}.contact_email`, 254);
  const phoneRaw = text(c, v.contact_phone, `${path}.contact_phone`, 32);
  const contactSource = url(c, v.contact_source_url, `${path}.contact_source_url`);
  let email: string | null = null, phone: string | null = null;
  if (emailRaw) { if (EMAIL_ADDR.test(emailRaw)) email = emailRaw.toLowerCase(); else c.err(`${path}.contact_email`, 'email', 'not a valid email address'); }
  if (phoneRaw) { if (PHONE.test(phoneRaw)) phone = phoneRaw; else c.err(`${path}.contact_phone`, 'phone', 'not a valid phone number'); }
  if ((email || phone) && !contactSource) {
    c.warn(`${path}.contact_email`, 'contact_uncited_dropped', 'contact details without contact_source_url are dropped; never guess or infer contact details');
    email = null; phone = null;
  }

  let verification = enumField(c, v.verification, `${path}.verification`, RECRUITER_VERIFICATIONS) ?? 'uncertain';
  if (verification === 'verified' && (!name || !company || (!profileUrl && !ctx.sourceUrl))) verification = 'uncertain';
  let uncertain: string[] = [];
  if (v.uncertain_fields !== undefined && v.uncertain_fields !== null) {
    if (!Array.isArray(v.uncertain_fields)) c.err(`${path}.uncertain_fields`, 'type', 'must be an array');
    else uncertain = [...new Set(v.uncertain_fields.map((x) => oneOf(c, slug(x), `${path}.uncertain_fields`, RECRUITER_UNCERTAIN_FIELDS, false)).filter((x): x is (typeof RECRUITER_UNCERTAIN_FIELDS)[number] => x !== null))];
  }
  if (uncertain.length > 0) verification = 'uncertain';

  // related_job: a contract-local reference by public job identity. JobQuest computes the lead's
  // dedupe key itself and resolves it inside the caller's own workspace at read time; a database id
  // supplied by the provider is never accepted.
  let relatedJob: JsonRecord | null = null;
  let relatedKey: string | null = null;
  if (v.related_job !== undefined && v.related_job !== null) {
    if (!isObj(v.related_job)) c.err(`${path}.related_job`, 'type', 'must be an object');
    else {
      const r = v.related_job;
      c.strip(r, RELATED_JOB_KEYS, `${path}.related_job`);
      const rp = `${path}.related_job`;
      const rUrl = url(c, r.job_url, `${rp}.job_url`);
      const rExt = text(c, r.external_job_id, `${rp}.external_job_id`, AI_LIMITS.id);
      const rSrc = (text(c, r.source_name, `${rp}.source_name`, 64) ?? hostOf(rUrl))?.toLowerCase() ?? null;
      const rCo = text(c, r.company, `${rp}.company`, SOURCE_KEY_LIMITS.short);
      const rTitle = text(c, r.title, `${rp}.title`, SOURCE_KEY_LIMITS.medium);
      const rLoc = text(c, r.location, `${rp}.location`, SOURCE_KEY_LIMITS.short);
      const rPosted = calendarDate(c, r.posted_date, `${rp}.posted_date`);
      const rel: JsonRecord = {};
      for (const [k, val] of Object.entries({ job_url: rUrl, external_job_id: rExt, source_name: rSrc, company: rCo, title: rTitle, location: rLoc, posted_date: rPosted })) if (val) rel[k] = val;
      if (Object.keys(rel).length > 0) {
        relatedJob = rel;
        const k = buildDedupeKey('job_lead', { job_url: rUrl, external_job_id: rExt, source_name: rSrc, company: rCo, title: rTitle, location: rLoc, posted_date: rPosted });
        if (k.ok) relatedKey = k.key; else c.warn(rp, 'related_job_unresolvable', 'related_job does not identify a job strongly enough to link');
      }
    }
  }
  if (c.errors.length > e0 || !name || !company) return empty;

  const out: JsonRecord = { version: SOURCE_PAYLOAD_VERSION, recruiter_name: name, company, verification };
  const put = (k: string, val: JsonValue | null) => { if (val !== null && val !== undefined && !(Array.isArray(val) && val.length === 0)) out[k] = val; };
  put('role_title', role); put('relationship', relationship); put('uncertain_fields', uncertain); put('source_name', sourceName);
  put('profile_url', profileUrl); put('channel', channel); put('contact_email', email); put('contact_phone', phone);
  put('contact_source_url', email || phone ? contactSource : null); put('related_job', relatedJob); put('related_job_key', relatedKey);
  if (byteLen(out) > AI_LIMITS.payloadBytes) c.err(path, 'too_large', 'recruiter payload too large');
  return { payload: out, identity: { name, company, role, profile_url: profileUrl } };
}

// ---- items -----------------------------------------------------------------

const DEDUPE_KEYS = ['source_type', 'source_id', 'event', 'date', 'job_url', 'external_job_id', 'company', 'title', 'name', 'channel', 'source_name', 'location', 'posted_date', 'profile_url', 'role'] as const;
const FINDING_KEYS = ['kind', 'dedupe', 'category', 'priority', 'confidence', 'title', 'summary', 'occurred_at', 'due_at', 'source', 'match', 'evidence', 'payload'] as const;

function finding(c: Ctx, raw: unknown, path: string, provider: AiProvider | null): AiFinding | null {
  if (!isObj(raw)) { c.err(path, 'type', 'must be an object'); return null; }
  c.strip(raw, FINDING_KEYS, path);
  const e0 = c.errors.length;
  const kind = oneOf(c, raw.kind, `${path}.kind`, AI_FINDING_KINDS);
  const title = text(c, raw.title, `${path}.title`, AI_LIMITS.title, { required: true });
  const summary = text(c, raw.summary, `${path}.summary`, AI_LIMITS.summary);
  const category = text(c, raw.category, `${path}.category`, AI_LIMITS.category);
  const priority = raw.priority === undefined || raw.priority === null ? 'NORMAL' : oneOf(c, raw.priority, `${path}.priority`, AI_PRIORITIES);
  const conf = confidence(c, raw.confidence, `${path}.confidence`);
  const occurred_at = timestamp(c, raw.occurred_at, `${path}.occurred_at`);
  const due_at = timestamp(c, raw.due_at, `${path}.due_at`);
  // Evidence: deterministic truncation (never stores more than 500 chars of source text).
  const evidence = text(c, raw.evidence, `${path}.evidence`, AI_LIMITS.evidence, { truncate: true });

  let dedupeIn: DedupeInput = {};
  if (!isObj(raw.dedupe)) c.err(`${path}.dedupe`, 'required', 'dedupe identity object is required');
  else {
    c.strip(raw.dedupe, DEDUPE_KEYS, `${path}.dedupe`);
    const d = raw.dedupe;
    dedupeIn = {
      source_type: text(c, d.source_type, `${path}.dedupe.source_type`, 32),
      source_id: text(c, d.source_id, `${path}.dedupe.source_id`, AI_LIMITS.id),
      event: text(c, d.event, `${path}.dedupe.event`, 48),
      date: text(c, d.date, `${path}.dedupe.date`, 10),
      job_url: text(c, d.job_url, `${path}.dedupe.job_url`, AI_LIMITS.url),
      external_job_id: text(c, d.external_job_id, `${path}.dedupe.external_job_id`, AI_LIMITS.id),
      company: text(c, d.company, `${path}.dedupe.company`, 200),
      title: text(c, d.title, `${path}.dedupe.title`, 300),
      name: text(c, d.name, `${path}.dedupe.name`, 200),
      channel: text(c, d.channel, `${path}.dedupe.channel`, 64),
      source_name: text(c, d.source_name, `${path}.dedupe.source_name`, 64)?.toLowerCase() ?? null,
      location: text(c, d.location, `${path}.dedupe.location`, 200),
      posted_date: text(c, d.posted_date, `${path}.dedupe.posted_date`, 10),
      profile_url: text(c, d.profile_url, `${path}.dedupe.profile_url`, AI_LIMITS.url),
      role: text(c, d.role, `${path}.dedupe.role`, 200),
    };
    if (dedupeIn.event && !AI_EVENT_PATTERN.test(dedupeIn.event.toLowerCase())) c.err(`${path}.dedupe.event`, 'event', 'must be a short snake_case token');
    if (dedupeIn.source_type && !(AI_SOURCE_TYPES as readonly string[]).includes(dedupeIn.source_type.toLowerCase())) c.err(`${path}.dedupe.source_type`, 'enum', `must be one of: ${AI_SOURCE_TYPES.join(', ')}`);
  }

  // source: optional provenance (no raw content)
  const source_ref: JsonRecord = {};
  if (dedupeIn.source_type) source_ref.type = dedupeIn.source_type.toLowerCase();
  if (dedupeIn.source_id) source_ref.provider_message_id = dedupeIn.source_id;
  if (raw.source !== undefined && raw.source !== null) {
    if (!isObj(raw.source)) c.err(`${path}.source`, 'type', 'must be an object');
    else {
      c.strip(raw.source, ['thread_id', 'url'], `${path}.source`);
      const thread = text(c, raw.source.thread_id, `${path}.source.thread_id`, AI_LIMITS.id);
      const u = url(c, raw.source.url, `${path}.source.url`);
      if (thread) source_ref.thread_id = thread;
      if (u) { source_ref.url = u; source_ref.canonical_url = canonicalizeUrl(u) ?? u; }
    }
  }
  if (byteLen(source_ref) > AI_LIMITS.sourceRefBytes) c.err(`${path}.source`, 'too_large', 'source_ref too large');

  // match: provider supplies hints only; application_id is never trusted.
  const hints: AiFinding['match_hints'] = { company: null, title: null, job_url: null, external_job_id: null };
  if (raw.match !== undefined && raw.match !== null) {
    if (!isObj(raw.match)) c.err(`${path}.match`, 'type', 'must be an object');
    else {
      c.strip(raw.match, ['hints', 'application_id'], `${path}.match`);
      if (raw.match.application_id !== undefined) {
        // stripped (counted by strip() is skipped for allow-listed key, so count here)
        c.unknown++;
        c.warn(`${path}.match.application_id`, 'untrusted_scope_field', 'provider application_id ignored; matching is server-owned');
      }
      if (isObj(raw.match.hints)) {
        const h = raw.match.hints;
        c.strip(h, ['company', 'title', 'job_url', 'external_job_id'], `${path}.match.hints`);
        hints.company = text(c, h.company, `${path}.match.hints.company`, 200);
        hints.title = text(c, h.title, `${path}.match.hints.title`, 300);
        hints.job_url = url(c, h.job_url, `${path}.match.hints.job_url`);
        hints.external_job_id = text(c, h.external_job_id, `${path}.match.hints.external_job_id`, AI_LIMITS.id);
      } else if (raw.match.hints !== undefined) c.err(`${path}.match.hints`, 'type', 'must be an object');
    }
  }

  // External-source kinds (AI-6) get dedicated validators that also contribute identity inputs.
  let body: JsonRecord = {};
  let identity: DedupeInput = {};
  let jobLead: AiJobLeadProjection | undefined;
  let dueAt = due_at;
  let categoryOut = category;
  const sourceUrl = typeof source_ref.url === 'string' ? source_ref.url : null;
  if (kind === 'job_lead') {
    const r = jobLeadPayload(c, raw.payload, `${path}.payload`, { dedupe: dedupeIn, sourceUrl });
    body = r.payload; identity = r.identity; if (r.job) jobLead = r.job;
  } else if (kind === 'email_event') {
    // Classification is a closed set; the received time is required (it anchors date filters and the fallback identity).
    const cat = category === null ? null : String(slug(category));
    if (!cat || !(EMAIL_CATEGORIES as readonly string[]).includes(cat)) c.err(`${path}.category`, 'email_category', `must be one of: ${EMAIL_CATEGORIES.join(', ')}`);
    else categoryOut = cat;
    if (!occurred_at) c.err(`${path}.occurred_at`, 'required', 'the email received time is required');
    const r = emailPayload(c, raw.payload, `${path}.payload`, raw);
    body = r.payload; identity = { ...r.identity, occurred_at };
    if (!dueAt && r.dueFromDeadline) dueAt = r.dueFromDeadline;
  } else if (kind === 'recruiter_intel') {
    const r = recruiterPayload(c, raw.payload, `${path}.payload`, { sourceUrl });
    body = r.payload; identity = r.identity;
  } else if (kind) {
    body = payload(c, kind, raw.payload, `${path}.payload`, dedupeIn.date);
  }

  let dedupe_key = '';
  if (kind && title) {
    const merged: DedupeInput = { ...identity };
    for (const [k, val] of Object.entries(dedupeIn)) if (val !== null && val !== undefined && val !== '') (merged as Record<string, unknown>)[k] = val;
    const r = buildDedupeKey(kind, { ...merged, provider, title: kind === 'job_lead' ? merged.title ?? title : dedupeIn.title ?? title, summary });
    if (r.ok) dedupe_key = r.key; else c.err(`${path}.dedupe`, 'dedupe', r.reason);
  }
  if (c.errors.length > e0 || !kind || !title || !priority) return null;
  return {
    kind, dedupe_key, category: categoryOut, priority, confidence: conf, title, summary, occurred_at, due_at: dueAt, source_ref,
    match_hints: hints, evidence, payload: body, ...(jobLead ? { job_lead: jobLead } : {}),
  };
}

const SUGGESTION_KEYS = ['finding_index', 'action', 'target', 'proposed', 'confidence'] as const;
function suggestion(c: Ctx, raw: unknown, path: string, findingCount: number): AiSuggestion | null {
  if (!isObj(raw)) { c.err(path, 'type', 'must be an object'); return null; }
  c.strip(raw, SUGGESTION_KEYS, path); // `status` etc. are dropped: a suggestion can never arrive pre-decided
  const e0 = c.errors.length;
  const idx = raw.finding_index;
  if (!Number.isInteger(idx) || (idx as number) < 0 || (idx as number) >= findingCount) c.err(`${path}.finding_index`, 'range', 'must reference an accepted finding');
  const action = oneOf(c, raw.action, `${path}.action`, AI_SUGGESTION_ACTIONS);
  let target: AiSuggestion['target'] = null;
  if (raw.target !== undefined && raw.target !== null) {
    if (!isObj(raw.target)) c.err(`${path}.target`, 'type', 'must be an object');
    else {
      c.strip(raw.target, ['type', 'id', 'application_id'], `${path}.target`);
      // Plan shape {application_id} is normalized to {type,id}; the RPC verifies ownership.
      const appId = raw.target.application_id;
      const legacy = appId != null && raw.target.type === undefined && raw.target.id === undefined;
      const type: AiSuggestionTargetType | null = legacy ? 'application' : oneOf(c, raw.target.type, `${path}.target.type`, AI_SUGGESTION_TARGET_TYPES);
      const id = legacy ? appId : raw.target.id;
      if (id !== undefined && id !== null) {
        if (typeof id !== 'string' || !UUID.test(id)) c.err(`${path}.target.id`, 'uuid', 'must be a UUID');
        else if (type) target = { type, id: id.toLowerCase() };
      }
    }
  }
  const proposed = boundedRecord(c, raw.proposed, `${path}.proposed`, AI_LIMITS.proposedBytes);
  const conf = confidence(c, raw.confidence, `${path}.confidence`);
  if (c.errors.length > e0 || !action) return null;
  return { finding_index: idx as number, action, target, proposed, confidence: conf };
}

// ---- envelope --------------------------------------------------------------

function parseSchemaVersion(c: Ctx, v: unknown, path = 'schema_version'): string | null {
  const m = typeof v === 'string' ? /^(\d{1,3})\.(\d{1,3})$/.exec(v) : null;
  if (!m) { c.err(path, 'version_malformed', 'must be MAJOR.MINOR'); return null; }
  const major = Number(m[1]), minor = Number(m[2]);
  if (!AI_SUPPORTED_MAJORS.includes(major)) { c.err(path, 'version_unsupported', `unsupported major version ${major}`); return null; }
  if (minor > AI_MAX_SUPPORTED_MINOR) c.warn(path, 'version_minor_ahead', `minor ${minor} is newer than ${AI_CONTRACT_VERSION}; additive fields beyond ${AI_CONTRACT_VERSION} are dropped`);
  return AI_CONTRACT_VERSION; // normalized to what this build actually understood
}

const TOP_KEYS = ['contract', 'schema_version', 'provider', 'workflow', 'run', 'sources', 'findings', 'suggestions', 'metadata'] as const;

export function validateAiResult(input: unknown): AiValidationResult {
  const c = new Ctx();
  const fail = (): AiValidationResult => ({ success: false, data: null, errors: c.errors, warnings: c.warnings, unknownFieldCount: c.unknown, rejectedItemCount: 0 });
  if (!isObj(input)) { c.err('', 'type', 'contract must be an object'); return fail(); }
  c.strip(input, TOP_KEYS, '');

  if (input.contract !== undefined && input.contract !== AI_CONTRACT_NAME) c.err('contract', 'contract_name', `must be "${AI_CONTRACT_NAME}"`);
  const schema_version = parseSchemaVersion(c, input.schema_version);
  const provider = oneOf(c, input.provider, 'provider', AI_PROVIDERS);
  const workflow = oneOf(c, input.workflow, 'workflow', AI_WORKFLOWS);

  let run: AiResult['run'] = { external_run_id: null, generated_at: '', model_hint: null };
  if (!isObj(input.run)) c.err('run', 'required', 'run object is required');
  else {
    c.strip(input.run, ['external_run_id', 'generated_at', 'model_hint'], 'run');
    run = {
      external_run_id: text(c, input.run.external_run_id, 'run.external_run_id', AI_LIMITS.externalRunId),
      generated_at: timestamp(c, input.run.generated_at, 'run.generated_at', true) ?? '',
      model_hint: text(c, input.run.model_hint, 'run.model_hint', AI_LIMITS.modelHint),
    };
  }

  const sources: AiSourceRef[] = [];
  if (input.sources !== undefined) {
    if (!Array.isArray(input.sources)) c.err('sources', 'type', 'must be an array');
    else if (input.sources.length > AI_LIMITS.sourcesPerRun) c.err('sources', 'too_many', `max ${AI_LIMITS.sourcesPerRun}`);
    else input.sources.forEach((s: unknown, i: number) => {
      const p = `sources[${i}]`;
      if (!isObj(s)) { c.err(p, 'type', 'must be an object'); return; }
      c.strip(s, ['type', 'ref', 'observed_at'], p);
      const e0 = c.errors.length;
      const type = oneOf(c, s.type, `${p}.type`, AI_SOURCE_TYPES);
      const ref = text(c, s.ref, `${p}.ref`, AI_LIMITS.id, { required: true });
      const observed_at = timestamp(c, s.observed_at, `${p}.observed_at`);
      if (c.errors.length === e0 && type && ref) sources.push({ type, ref, observed_at });
    });
  }

  const metadata = boundedRecord(c, input.metadata, 'metadata', AI_LIMITS.metadataBytes);
  if (c.errors.length) return fail(); // envelope invalid: items are not processed

  let rejected = 0;
  const findings: AiFinding[] = [];
  const findingIdx = new Map<number, number>(); // input index -> accepted index
  const rawFindings: unknown = input.findings === undefined ? [] : input.findings;
  const rawSug: unknown = input.suggestions === undefined ? [] : input.suggestions;
  if (!Array.isArray(rawFindings)) c.err('findings', 'type', 'must be an array');
  else if (rawFindings.length > AI_LIMITS.findingsPerRun) c.err('findings', 'too_many', `max ${AI_LIMITS.findingsPerRun}`);
  if (!Array.isArray(rawSug)) c.err('suggestions', 'type', 'must be an array');
  else if (rawSug.length > AI_LIMITS.suggestionsPerRun) c.err('suggestions', 'too_many', `max ${AI_LIMITS.suggestionsPerRun}`);
  if (c.errors.length || !Array.isArray(rawFindings) || !Array.isArray(rawSug)) return fail();

  rawFindings.forEach((f: unknown, i: number) => {
    const r = finding(c, f, `findings[${i}]`, provider);
    if (!r) { rejected++; return; }
    // Same-run duplicate identity: keep the first.
    if (findings.some((x) => x.kind === r.kind && x.dedupe_key === r.dedupe_key)) { c.warn(`findings[${i}]`, 'duplicate_in_run', 'duplicate identity within run; dropped'); return; }
    findingIdx.set(i, findings.length);
    findings.push(r);
  });

  const suggestions: AiSuggestion[] = [];
  rawSug.forEach((s: unknown, i: number) => {
    // finding_index refers to the INPUT array; remap to accepted findings.
    const inIdx = isObj(s) ? s.finding_index : undefined;
    const mapped = typeof inIdx === 'number' ? findingIdx.get(inIdx) : undefined;
    const r = suggestion(c, isObj(s) && mapped !== undefined ? { ...s, finding_index: mapped } : s, `suggestions[${i}]`, findings.length);
    if (r) suggestions.push(r); else rejected++;
  });

  if (!provider || !workflow || !schema_version) return fail();
  return {
    success: true,
    data: { contract: AI_CONTRACT_NAME, schema_version, provider, workflow, run, sources, findings, suggestions, metadata },
    errors: c.errors, warnings: c.warnings, unknownFieldCount: c.unknown, rejectedItemCount: rejected,
  };
}

/** Normalized run params for rpc_ai_ingest_run. Workspace/user are supplied by the server, never the provider. */
export function toIngestRunInput(r: AiResult, triggerType: AiTriggerType = 'manual'): AiIngestRunInput {
  return { provider: r.provider, workflow: r.workflow, triggerType, externalRunId: r.run.external_run_id, schemaVersion: r.schema_version, sources: r.sources };
}
