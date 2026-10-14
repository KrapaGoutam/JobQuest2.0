// Validation + normalization for jobquest.ai-result. Hand-rolled (no new
// dependency) because unknown-field COUNTING is a contract requirement that
// zod's strip mode does not report. Never throws on provider input.
import {
  AI_CONTRACT_NAME, AI_CONTRACT_VERSION, AI_EVENT_PATTERN, DIGEST_LIMITS, DIGEST_MAX_MINOR, DIGEST_PAYLOAD_VERSION, DIGEST_REF_TYPES, DIGEST_SECTION_ITEM_LIMITS,
  DIGEST_SECTION_KEYS, DIGEST_SECTION_STATUSES, DIGEST_SUMMARY_KEYS, AI_FINDING_KINDS, AI_LIMITS,
  AI_MAX_SUPPORTED_MINOR, AI_PRIORITIES, AI_PROVIDERS, AI_SOURCE_TYPES, AI_SUGGESTION_ACTIONS,
  AI_SOURCE_STATUSES, AI_SUGGESTION_TARGET_TYPES, AI_SUPPORTED_MAJORS, AI_WORKFLOWS, DISCOVERY_LIMITS, JOB_REMOTE_SCOPES,
  EMAIL_ACTION_STATES, EMAIL_CATEGORIES, EMAIL_GROUPS, EMAIL_STAGE_HINTS, EMAIL_URGENCIES, JOB_DESCRIPTION_MAX_CHARS, JOB_EMPLOYMENT_TYPES, JOB_SALARY_PERIODS, JOB_WORK_ARRANGEMENTS,
  RECRUITER_DISCOVERY_MODES, RECRUITER_EMAIL_BASES, RECRUITER_LIMITS, RECRUITER_RELATIONSHIPS, RECRUITER_UNCERTAIN_FIELDS, RECRUITER_VERIFICATION_BASES, RECRUITER_VERIFICATIONS, SOURCE_PAYLOAD_VERSION,
  CALENDAR_CATEGORIES, CALENDAR_CATEGORY_ALIASES, CALENDAR_DEADLINE_CATEGORIES, CALENDAR_LIMITS, CALENDAR_PAYLOAD_VERSION,
  CALENDAR_RAW_KEYS, CALENDAR_STATUSES,
  type AiFindingKind, type AiPriority, type AiProvider, type AiSuggestionTargetType, type AiTriggerType, type CalendarCategory, type CalendarStatus,
  type EmailUrgency,
} from './constants';
import { emailCategoryGroup, resolveEmailUrgency } from './emailTriage';
import { isActionType, validateActionProposal } from './actions';
import { buildDedupeKey, calendarLogicalKey, canonicalizeUrl, isIsoDate, recruiterIdentity, type DedupeInput } from './dedupe';
import { isPersonalEmailDomain, isSpeculativeWhy, sanitizeConnectionNote, sanitizeEmailDraft } from './recruiter';
import { effectiveRemoteScope, leadLogicalKey } from './discovery';
import { isIanaTimeZone, localMidnight, localToInstant, stringOffsetMinutes, zoneOffsetMinutes } from './calendarTime';
import type {
  AiCalendarProjection, AiFinding, AiIngestRunInput, AiIssue, AiJobLeadProjection, AiRecruiterProjection, AiResult, AiSourceRef, AiSuggestion, AiValidationResult,
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
  /** Reference instant (ms) for time-relative rules: the run's generated_at, so a submission validates identically every time. */
  refTime = Date.now();
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
  // Date.parse rolls impossible days over (Feb 30 -> Mar 2); an impossible calendar date is invalid, never "fixed".
  if (Number.isNaN(t) || year < 2000 || year > 2100 || !isIsoDate(v.trim().slice(0, 10))) { c.err(path, 'timestamp', 'invalid or out-of-range date'); return null; }
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
// Kinds with dedicated validators (daily_brief, job_lead, email_event, recruiter_intel, calendar_event) do not use this table.
const PAYLOAD_SCHEMAS: Partial<Record<AiFindingKind, Record<string, PField>>> = {};

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
const DIGEST_ITEM_KEYS = [
  'title', 'detail', 'priority', 'source', 'url', 'occurred_at',
  // 1.1 (all optional; absent = not known)
  'kind', 'company', 'urgency', 'deadline_at', 'action', 'score', 'tags', 'ref', 'application', 'attention', 'verification',
] as const;
const DIGEST_SECTION_FIELDS = ['status', 'count', 'items'] as const;
const DIGEST_VERIFICATIONS = ['verified', 'uncertain'] as const;
const KIND_SHAPE = /^[a-z][a-z0-9_]{0,31}$/;

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
  // 1.1 fields. Everything is bounded plain data; none of it is ever interpreted as an instruction.
  const kindRaw = text(c, raw.kind, `${path}.kind`, 32);
  const kind = kindRaw && KIND_SHAPE.test(kindRaw) ? kindRaw : null;
  if (kindRaw && !kind) c.err(`${path}.kind`, 'kind', 'must be lower_snake_case, at most 32 characters');
  const company = text(c, raw.company, `${path}.company`, 80, { truncate: true });
  const urgency = raw.urgency === undefined || raw.urgency === null ? null : oneOf(c, raw.urgency, `${path}.urgency`, EMAIL_URGENCIES);
  const deadline = timestamp(c, raw.deadline_at, `${path}.deadline_at`);
  const action = text(c, raw.action, `${path}.action`, 160, { truncate: true });
  const verification = raw.verification === undefined || raw.verification === null ? null : oneOf(c, raw.verification, `${path}.verification`, DIGEST_VERIFICATIONS);
  let score: number | null = null;
  if (raw.score !== undefined && raw.score !== null) {
    if (typeof raw.score !== 'number' || !Number.isInteger(raw.score) || raw.score < 0 || raw.score > 100) c.err(`${path}.score`, 'score', 'must be an integer 0..100');
    else score = raw.score;
  }
  let tags: string[] | null = null;
  if (raw.tags !== undefined && raw.tags !== null) {
    if (!Array.isArray(raw.tags) || raw.tags.length > 3) c.err(`${path}.tags`, 'tags', 'at most 3 short labels');
    else tags = raw.tags.map((t, i) => text(c, t, `${path}.tags[${i}]`, 30, { truncate: true })).filter((t): t is string => t !== null);
  }
  let ref: JsonRecord | null = null;
  if (raw.ref !== undefined && raw.ref !== null) {
    if (!isObj(raw.ref)) c.err(`${path}.ref`, 'type', 'must be an object');
    else {
      c.strip(raw.ref, ['type', 'id'], `${path}.ref`);
      const type = oneOf(c, raw.ref.type, `${path}.ref.type`, DIGEST_REF_TYPES);
      const id = typeof raw.ref.id === 'string' && UUID.test(raw.ref.id) ? raw.ref.id.toLowerCase() : null;
      if (!id) c.err(`${path}.ref.id`, 'uuid', 'must be a UUID');
      if (type && id) ref = { type, id };
    }
  }
  let application: JsonRecord | null = null;
  if (raw.application !== undefined && raw.application !== null) {
    if (!isObj(raw.application)) c.err(`${path}.application`, 'type', 'must be an object');
    else {
      c.strip(raw.application, ['id', 'label'], `${path}.application`);
      const id = typeof raw.application.id === 'string' && UUID.test(raw.application.id) ? raw.application.id.toLowerCase() : null;
      if (!id) c.err(`${path}.application.id`, 'uuid', 'must be a UUID');
      const label = text(c, raw.application.label, `${path}.application.label`, 120, { truncate: true });
      if (id && label) application = { id, label };
    }
  }
  if (c.errors.length > e0 || !title) return null;
  const out: JsonRecord = { title };
  if (detail) out.detail = detail;
  if (priority) out.priority = priority;
  if (source) out.source = source;
  if (u) out.url = u;
  if (occurred) out.occurred_at = occurred;
  if (kind) out.kind = kind;
  if (company) out.company = company;
  if (urgency) out.urgency = urgency;
  if (deadline) out.deadline_at = deadline;
  if (action) out.action = action;
  if (score !== null) out.score = score;
  if (tags && tags.length) out.tags = tags;
  if (ref) out.ref = ref;
  if (application) out.application = application;
  if (raw.attention === true) out.attention = true;
  if (verification) out.verification = verification;
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
  if (!ver || Number(ver[1]) !== 1) c.err(`${path}.version`, 'version', `must be "${DIGEST_PAYLOAD_VERSION}" or "1.0" (major 1)`);
  else if (Number(ver[2]) > DIGEST_MAX_MINOR) c.warn(`${path}.version`, 'version_minor_ahead', `digest minor is newer than ${DIGEST_PAYLOAD_VERSION}; additive fields dropped`);
  // A 1.0 digest stays 1.0 (it was written against that shape); anything newer is stored as the newest minor this server knows.
  out.version = ver && Number(ver[1]) === 1 && Number(ver[2]) === 0 ? '1.0' : DIGEST_PAYLOAD_VERSION;

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
        const items = digestItems(c, raw.items, `${sp}.items`, DIGEST_SECTION_ITEM_LIMITS[key] ?? DIGEST_LIMITS.itemsPerSection);
        if (!status) continue;
        if (status === 'available' && items.length === 0 && !(count && count > 0)) c.err(sp, 'section_inconsistent', '"available" needs items or a count > 0');
        else if (status === 'zero' && (items.length > 0 || (count ?? 0) > 0)) c.err(sp, 'section_inconsistent', '"zero" cannot carry items or a count > 0');
        else if ((status === 'not_configured' || status === 'unavailable') && (items.length > 0 || count !== null)) c.err(sp, 'section_inconsistent', `"${status}" cannot carry items or a count`);
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
  // AI-11D
  'posted_at', 'remote_scope', 'remote_note', 'experience_min_years', 'experience_max_years', 'fit_reasons', 'gap_reasons',
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
  let posted = calendarDate(c, v.posted_date, `${path}.posted_date`);

  // AI-11D: the exact posting instant. An unusable or future value becomes UNKNOWN (with a warning); it is never "now".
  let postedAt: string | null = null;
  if (v.posted_at !== undefined && v.posted_at !== null) {
    const raw = typeof v.posted_at === 'string' ? v.posted_at.trim() : '';
    const t = ISO_TS.test(raw) ? Date.parse(raw) : NaN;
    const y = Number.isFinite(t) ? new Date(t).getUTCFullYear() : 0;
    if (!Number.isFinite(t) || y < 2000 || y > 2100 || !isIsoDate(raw.slice(0, 10))) c.warn(`${path}.posted_at`, 'posted_at_unusable', 'posted_at must be ISO-8601 with an explicit offset; treated as unknown');
    else if (t > c.refTime + 10 * 60_000) c.warn(`${path}.posted_at`, 'posted_at_future', 'posted_at is in the future; treated as unknown');
    else postedAt = new Date(t).toISOString();
  }
  if (posted && posted > new Date(c.refTime + 86_400_000).toISOString().slice(0, 10)) { c.warn(`${path}.posted_date`, 'posted_date_future', 'posted_date is in the future; treated as unknown'); posted = null; }
  if (postedAt) {
    const atDate = postedAt.slice(0, 10);
    if (!posted) posted = atDate;
    else if (Math.abs(Date.parse(`${atDate}T00:00:00Z`) - Date.parse(`${posted}T00:00:00Z`)) > 86_400_000) { c.warn(`${path}.posted_date`, 'posted_date_conflict', 'posted_date disagrees with posted_at; the exact time wins'); posted = atDate; }
  }

  let remoteScope = enumField(c, v.remote_scope, `${path}.remote_scope`, JOB_REMOTE_SCOPES, {
    usa: 'us', united_states: 'us', us_only: 'us', nationwide: 'us', restricted_states: 'restricted', state_restricted: 'restricted', select_states: 'restricted',
    regional: 'region', specific_region: 'region',
  });
  if (remoteScope && arrangement !== 'remote') { c.warn(`${path}.remote_scope`, 'remote_scope_ignored', 'remote_scope applies only to remote roles'); remoteScope = null; }
  const remoteNote = text(c, v.remote_note, `${path}.remote_note`, SOURCE_KEY_LIMITS.short, { truncate: true });
  // A remote role whose geography the provider did not state: read it conservatively from the stated location/note only
  // (explicit "United States" => us, "must reside in ..." => restricted, a non-US region => region). Nothing stated => stays unknown.
  if (arrangement === 'remote' && !remoteScope) remoteScope = effectiveRemoteScope({ remote_scope: null, location, remote_note: remoteNote });
  const expYears = (raw: unknown, key: string): number | null => {
    if (raw === undefined || raw === null) return null;
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > 50) { c.warn(`${path}.${key}`, 'experience_years', 'must be a whole number of years 0-50 (only if the posting states it); dropped'); return null; }
    return raw;
  };
  let expMin = expYears(v.experience_min_years, 'experience_min_years');
  let expMax = expYears(v.experience_max_years, 'experience_max_years');
  if (expMin !== null && expMax !== null && expMin > expMax) { c.warn(`${path}.experience_min_years`, 'experience_range', 'experience_min_years is greater than experience_max_years; both dropped'); expMin = null; expMax = null; }
  const fitReasons = stringList(c, v.fit_reasons, `${path}.fit_reasons`, DISCOVERY_LIMITS.reasons, DISCOVERY_LIMITS.reasonChars);
  const gapReasons = stringList(c, v.gap_reasons, `${path}.gap_reasons`, DISCOVERY_LIMITS.reasons, DISCOVERY_LIMITS.reasonChars);

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
  put('source_name', sourceName); put('job_url', jobUrl); put('external_job_id', externalId); put('posted_date', posted); put('posted_at', postedAt);
  put('remote_scope', remoteScope); put('remote_note', remoteNote); put('experience_min_years', expMin); put('experience_max_years', expMax);
  put('fit_reasons', fitReasons); put('gap_reasons', gapReasons);
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
    posted_at: postedAt, remote_scope: remoteScope, remote_note: remoteNote, experience_min_years: expMin, experience_max_years: expMax,
    fit_reasons: fitReasons, gap_reasons: gapReasons,
    logical_key: leadLogicalKey({ company, title, location, work_arrangement: arrangement, remote_scope: remoteScope }),
  };
  return {
    payload: out, job,
    identity: { company, title, location, posted_date: posted, source_name: sourceName, external_job_id: externalId, job_url: ctx.dedupe.job_url ?? jobUrl },
  };
}

// ---- email_event ------------------------------------------------------------------------
// Intelligence about a job-search email, NOT a mailbox copy: no body, no attachments, no
// full address (display name + sender domain only), bounded subject/summary/evidence.

const EMAIL_KEYS = [
  'version', 'sender_name', 'sender_domain', 'from_domain', 'subject', 'company', 'role_title', 'next_step', 'action_summary', 'deadline', 'deadline_at',
  'needs_attention', 'group', 'urgency', 'action_state', 'draft_recommended', 'application_stage_hint',
] as const;
const RAW_BODY_KEYS = new Set(['body', 'raw_body', 'body_text', 'body_html', 'html', 'html_body', 'full_text', 'message_body', 'email_body', 'content', 'text', 'attachments']);
const DOMAIN = /^(?=.{3,255}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

function warnRawBody(c: Ctx, o: Obj, path: string) {
  for (const k of Object.keys(o)) if (RAW_BODY_KEYS.has(k)) c.warn(`${path}.${k}`, 'raw_body_rejected', 'message bodies and attachments are never stored; send a concise summary and a short evidence excerpt instead');
}

// Privacy (AI-11B): links (often tracking links), full addresses and phone numbers are never retained from email-derived text.
const URL_TEXT = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
const ADDRESS_TEXT = /[^\s<>"'(),;:]+@[^\s<>"'(),;:]+\.[^\s<>"'(),;:]+/g;
const PHONE_TEXT = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}\b|\+\d[\d\s.-]{8,}\d/g;
export function redactEmailText(value: string): string {
  return value.replace(URL_TEXT, '').replace(ADDRESS_TEXT, '').replace(PHONE_TEXT, '')
    .replace(/<\s*>|\(\s*\)|\[\s*\]/g, '').replace(/[ \t]{2,}/g, ' ').trim();
}
function redacted(c: Ctx, v: string | null, path: string): string | null {
  if (v === null) return null;
  const r = redactEmailText(v);
  if (r !== v) c.warn(path, 'email_text_redacted', 'links, email addresses and phone numbers are not stored');
  return r || null;
}

interface EmailParts extends SourceParts {
  dueFromDeadline: string | null;
  urgency: EmailUrgency | null;
  /** true = needs action, false = explicitly none, null = the provider did not say. */
  actionNeeded: boolean | null;
}

function emailPayload(c: Ctx, v: unknown, path: string, raw: Obj, category: string | null): EmailParts {
  warnRawBody(c, raw, path.replace(/\.payload$/, ''));
  const out: JsonRecord = { version: SOURCE_PAYLOAD_VERSION };
  const empty: EmailParts = { payload: {}, identity: {}, dueFromDeadline: null, urgency: null, actionNeeded: null };
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
  const subject = redacted(c, text(c, o.subject, `${path}.subject`, SOURCE_KEY_LIMITS.short, { truncate: true }), `${path}.subject`);
  const company = text(c, o.company, `${path}.company`, SOURCE_KEY_LIMITS.short);
  const role = text(c, o.role_title, `${path}.role_title`, SOURCE_KEY_LIMITS.medium);
  // `action_summary` is the canonical AI-11B name for what AI-6 called `next_step`: ONE stored field (`next_step`).
  const nextIn = text(c, o.next_step, `${path}.next_step`, SOURCE_KEY_LIMITS.medium, { truncate: true });
  const actionIn = text(c, o.action_summary, `${path}.action_summary`, SOURCE_KEY_LIMITS.medium, { truncate: true });
  if (nextIn && actionIn && nextIn !== actionIn) c.warn(`${path}.next_step`, 'action_summary_preferred', 'both action_summary and next_step were sent; action_summary is used');
  const next = redacted(c, actionIn ?? nextIn, `${path}.action_summary`);
  const deadlineIn = timestamp(c, o.deadline, `${path}.deadline`);
  const deadlineAtIn = timestamp(c, o.deadline_at, `${path}.deadline_at`);
  if (deadlineIn && deadlineAtIn && deadlineIn !== deadlineAtIn) c.warn(`${path}.deadline`, 'deadline_at_preferred', 'both deadline_at and deadline were sent; deadline_at is used');
  const deadline = deadlineAtIn ?? deadlineIn; // never invented: absent stays null
  let attention: boolean | null = null;
  if (o.needs_attention !== undefined && o.needs_attention !== null) {
    if (typeof o.needs_attention === 'boolean') attention = o.needs_attention; else c.err(`${path}.needs_attention`, 'type', 'must be a boolean');
  }

  // ---- AI-11B triage fields -----------------------------------------------------------------------------------
  const derivedGroup = emailCategoryGroup(category);
  const group = enumField(c, o.group, `${path}.group`, EMAIL_GROUPS);
  if (group && derivedGroup && group !== derivedGroup) c.err(`${path}.group`, 'email_group', `group "${group}" does not match category "${category}" (${derivedGroup})`);
  const urgencyRaw = o.urgency === undefined || o.urgency === null ? null : typeof o.urgency === 'string' ? o.urgency.trim().toUpperCase() : o.urgency;
  const urgency = urgencyRaw === null ? null : oneOf(c, urgencyRaw, `${path}.urgency`, EMAIL_URGENCIES, false);
  const actionState = enumField(c, o.action_state, `${path}.action_state`, EMAIL_ACTION_STATES);
  if (actionState) {
    if (attention !== null && attention !== (actionState === 'needs_action')) c.warn(`${path}.needs_attention`, 'needs_attention_conflict', 'needs_attention disagrees with action_state; action_state is used');
    attention = actionState === 'needs_action';
  }
  const actionNeeded = actionState ? actionState === 'needs_action' : attention === true ? true : null;
  let draft: boolean | null = null;
  if (o.draft_recommended !== undefined && o.draft_recommended !== null) {
    if (typeof o.draft_recommended !== 'boolean') c.err(`${path}.draft_recommended`, 'type', 'must be a boolean');
    else if (o.draft_recommended && actionNeeded !== true) c.warn(`${path}.draft_recommended`, 'draft_without_action', 'draft_recommended needs an action-needed email; dropped');
    else draft = o.draft_recommended; // a recommendation only: JobQuest never drafts or sends mail
  }
  let hint: string | null = null;
  if (o.application_stage_hint !== undefined && o.application_stage_hint !== null) {
    const h = typeof o.application_stage_hint === 'string' ? o.application_stage_hint.trim().toUpperCase().replace(/[\s-]+/g, '_') : o.application_stage_hint;
    const checked = oneOf(c, h, `${path}.application_stage_hint`, EMAIL_STAGE_HINTS, false);
    if (checked && derivedGroup === 'other') c.warn(`${path}.application_stage_hint`, 'stage_hint_not_job_related', 'a stage hint applies to job-related mail only; dropped');
    else hint = checked; // a hint only: it never changes an application
  }

  const put = (k: string, val: JsonValue | null) => { if (val !== null) out[k] = val; };
  put('sender_name', senderName); put('sender_domain', domain); put('subject', subject); put('company', company);
  put('role_title', role); put('next_step', next); put('deadline', deadline); put('needs_attention', attention);
  put('group', derivedGroup); put('action_state', actionState); put('draft_recommended', draft); put('application_stage_hint', hint);
  if (byteLen(out) > AI_LIMITS.payloadBytes) c.err(path, 'too_large', 'email payload too large');
  return { payload: out, identity: { sender: [senderName, domain].filter(Boolean).join('|'), subject }, dueFromDeadline: deadline, urgency, actionNeeded };
}

// ---- recruiter_intel -----------------------------------------------------------------------
// AI-11E. A person is reported only with a cited PUBLIC source. Verified needs a named basis. A work email is kept only when a
// source is cited, it is a business address and it was published or returned by a prospecting tool (never inferred). No phone
// number is stored. Drafts are text for a human to review; JobQuest never sends them.

const RECRUITER_KEYS = [
  'version', 'recruiter_name', 'role_title', 'company', 'relationship', 'verification', 'uncertain_fields', 'source_name',
  'profile_url', 'channel', 'contact_email', 'contact_phone', 'contact_source_url', 'related_job',
  // AI-11E
  'verification_basis', 'person_id', 'posting_contact', 'why', 'discovery_mode', 'contact_email_basis', 'draft_note', 'draft_email',
] as const;
const RELATED_JOB_KEYS = ['job_url', 'external_job_id', 'source_name', 'company', 'title', 'location', 'posted_date'] as const;
const EMAIL_ADDR = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;

interface RecruiterParts extends SourceParts { recruiter?: AiRecruiterProjection }

function recruiterPayload(c: Ctx, v: unknown, path: string, ctx: { sourceUrl: string | null }): RecruiterParts {
  const empty: RecruiterParts = { payload: {}, identity: {} };
  if (!isObj(v)) { c.err(path, 'required', 'a recruiter_intel payload with recruiter_name and company is required'); return empty; }
  c.strip(v, RECRUITER_KEYS, path);
  const e0 = c.errors.length;
  sourceVersion(c, v.version, path);
  // Public identity text never carries contact details: an address or phone number pasted into a name or title is removed.
  const plain = (s: string | null, p: string): string | null => {
    if (s === null) return null;
    const r = redactContact(s);
    if (r.replace(/\s+/g, ' ') !== s.replace(/\s+/g, ' ')) c.warn(p, 'contact_text_redacted', 'email addresses and phone numbers are not stored');
    return r || null;
  };
  const name = plain(text(c, v.recruiter_name, `${path}.recruiter_name`, SOURCE_KEY_LIMITS.short, { required: true }), `${path}.recruiter_name`);
  const company = plain(text(c, v.company, `${path}.company`, SOURCE_KEY_LIMITS.short, { required: true }), `${path}.company`);
  const role = plain(text(c, v.role_title, `${path}.role_title`, SOURCE_KEY_LIMITS.short), `${path}.role_title`);
  const relationship = enumField(c, v.relationship, `${path}.relationship`, RECRUITER_RELATIONSHIPS, {
    talent: 'talent_acquisition', ta: 'talent_acquisition', hiring_manager: 'hiring_manager', tech_recruiter: 'technical_recruiter',
    qa_lead: 'qa_manager', test_manager: 'qa_manager', eng_manager: 'engineering_manager', head_of_engineering: 'engineering_leader',
  });
  const profileUrl = url(c, v.profile_url, `${path}.profile_url`);
  const sourceName = text(c, v.source_name, `${path}.source_name`, 100);
  const channel = text(c, v.channel, `${path}.channel`, 64);
  // A recruiter is only ever reported with a public source citation (profile or source URL).
  if (!profileUrl && !ctx.sourceUrl) c.err(path, 'recruiter_source_required', 'a public source URL (source.url or payload.profile_url) is required; do not report recruiters without one');

  // A provider's stable person id is identity only (scoped by source_name); it is never displayed or returned.
  const personId = text(c, v.person_id, `${path}.person_id`, AI_LIMITS.id);

  // Work email: cited, business, and actually published / returned by a prospecting tool. Never guessed or inferred. No phone is stored.
  const emailRaw = text(c, v.contact_email, `${path}.contact_email`, 254);
  const contactSource = url(c, v.contact_source_url, `${path}.contact_source_url`);
  const emailBasis = enumField(c, v.contact_email_basis, `${path}.contact_email_basis`, RECRUITER_EMAIL_BASES);
  let email: string | null = null;
  if (emailRaw) {
    if (!EMAIL_ADDR.test(emailRaw)) c.err(`${path}.contact_email`, 'email', 'not a valid email address');
    else if (isPersonalEmailDomain(emailRaw)) c.warn(`${path}.contact_email`, 'contact_personal_email_dropped', 'personal mailboxes are never stored; only a work email returned by a cited source is accepted');
    else if (!contactSource) c.warn(`${path}.contact_email`, 'contact_uncited_dropped', 'contact details without contact_source_url are dropped; never guess or infer contact details');
    else email = emailRaw.toLowerCase();
  }
  if (v.contact_phone !== undefined && v.contact_phone !== null) c.warn(`${path}.contact_phone`, 'contact_phone_not_stored', 'phone numbers are never stored; use the cited public profile instead');

  // Verification: the provider's claim is honoured only with a named basis and a cited public URL; otherwise it is uncertain, visibly.
  let verification = enumField(c, v.verification, `${path}.verification`, RECRUITER_VERIFICATIONS) ?? 'uncertain';
  const basis = enumField(c, v.verification_basis, `${path}.verification_basis`, RECRUITER_VERIFICATION_BASES);
  if (verification === 'verified' && (!name || !company || (!profileUrl && !ctx.sourceUrl))) verification = 'uncertain';
  if (verification === 'verified' && !basis) {
    verification = 'uncertain';
    c.warn(`${path}.verification`, 'verified_without_basis', 'verified requires verification_basis (company_page, professional_profile, job_posting, prospecting_source or other_public_source); recorded as uncertain');
  }
  let uncertain: string[] = [];
  if (v.uncertain_fields !== undefined && v.uncertain_fields !== null) {
    if (!Array.isArray(v.uncertain_fields)) c.err(`${path}.uncertain_fields`, 'type', 'must be an array');
    else uncertain = [...new Set(v.uncertain_fields.map((x) => oneOf(c, slug(x), `${path}.uncertain_fields`, RECRUITER_UNCERTAIN_FIELDS, false)).filter((x): x is (typeof RECRUITER_UNCERTAIN_FIELDS)[number] => x !== null))];
  }
  if (uncertain.length > 0) verification = 'uncertain';

  // "Why this person" is bounded evidence, not enthusiasm or a guess about hiring. Contact details never belong in it.
  let why = text(c, v.why, `${path}.why`, RECRUITER_LIMITS.whyChars, { truncate: true });
  if (why) {
    why = redactContact(why);
    if (!why || isSpeculativeWhy(why)) { c.warn(`${path}.why`, 'why_speculative_dropped', 'the explanation must state evidence (a stored lead, the target list, a verified role); it was dropped'); why = null; }
  }

  // Outreach drafts: optional, bounded, never sent. Unsupported claims, links and contact details are refused (not edited).
  let draftNote: string | null = null, draftEmail: { subject: string; body: string } | null = null;
  if (v.draft_note !== undefined && v.draft_note !== null) {
    if (typeof v.draft_note !== 'string') c.err(`${path}.draft_note`, 'type', 'must be a string');
    else {
      const r = sanitizeConnectionNote(v.draft_note);
      if (r.ok) draftNote = r.value; else c.warn(`${path}.draft_note`, `draft_${r.reason}`, `the connection note was dropped (${r.reason.replace(/_/g, ' ')}); notes are at most ${RECRUITER_LIMITS.noteChars} characters with no links, contact details or claims JobQuest cannot support`);
    }
  }
  if (v.draft_email !== undefined && v.draft_email !== null) {
    if (!isObj(v.draft_email)) c.err(`${path}.draft_email`, 'type', 'must be an object');
    else {
      c.strip(v.draft_email, ['subject', 'body'], `${path}.draft_email`);
      const subject = typeof v.draft_email.subject === 'string' ? v.draft_email.subject : '';
      const body = typeof v.draft_email.body === 'string' ? v.draft_email.body : '';
      if (!subject.trim() || !body.trim()) c.warn(`${path}.draft_email`, 'draft_empty', 'an email draft needs a subject and a body; it was dropped');
      else {
        const r = sanitizeEmailDraft(subject, body);
        if (r.ok) draftEmail = r.value; else c.warn(`${path}.draft_email`, `draft_${r.reason}`, `the email draft was dropped (${r.reason.replace(/_/g, ' ')}); no links, contact details or claims JobQuest cannot support`);
      }
    }
  }

  const postingContact = v.posting_contact === true || basis === 'job_posting';
  if (v.posting_contact !== undefined && v.posting_contact !== null && typeof v.posting_contact !== 'boolean') c.err(`${path}.posting_contact`, 'type', 'must be a boolean');
  const modeHint = enumField(c, v.discovery_mode, `${path}.discovery_mode`, RECRUITER_DISCOVERY_MODES);

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

  // Identity comes from the validated payload only (a provider's free-text `dedupe` object never overrides it).
  const identity: DedupeInput = { name, company, role, profile_url: profileUrl, source_name: sourceName?.toLowerCase() ?? null, person_id: personId, email };
  const ident = recruiterIdentity(identity);
  if (!ident.ok) { c.err(path, 'dedupe', ident.reason); return empty; }

  const out: JsonRecord = { version: SOURCE_PAYLOAD_VERSION, recruiter_name: name, company, company_key: ident.companyKey, verification };
  const put = (k: string, val: JsonValue | null) => { if (val !== null && val !== undefined && !(Array.isArray(val) && val.length === 0)) out[k] = val; };
  put('role_title', role); put('relationship', relationship); put('uncertain_fields', uncertain); put('source_name', sourceName);
  put('profile_url', profileUrl); put('channel', channel); put('contact_email', email); put('contact_email_basis', email ? emailBasis ?? 'published' : null);
  put('contact_source_url', email ? contactSource : null); put('related_job', relatedJob); put('related_job_key', relatedKey);
  put('verification_basis', verification === 'verified' ? basis : null); put('posting_contact', postingContact ? true : null);
  put('why', why); put('draft_note', draftNote); put('draft_email', draftEmail);
  // Server-derived identity (never provider input): every tier this person can be recognised by, so a later submission that
  // reaches the same person through a different tier resolves to this finding instead of creating a duplicate.
  put('profile_key', ident.profileKey); put('person_key', ident.personKey); put('identity_keys', ident.keys);
  if (byteLen(out) > AI_LIMITS.payloadBytes) c.err(path, 'too_large', 'recruiter payload too large');
  const recruiter: AiRecruiterProjection = {
    candidate_keys: ident.keys, profile_key: ident.profileKey, person_key: ident.personKey, company_key: ident.companyKey, mode_hint: modeHint,
    has_related_job: relatedJob !== null, posting_contact: postingContact, relationship, role_title: role, verification,
    verification_basis: verification === 'verified' ? basis : null,
  };
  return { payload: out, identity, recruiter };
}

/** Email addresses and phone numbers are never retained from free text a provider attached to a person (links are kept: they are the citation). */
function redactContact(s: string): string {
  return s.replace(ADDRESS_TEXT, '').replace(PHONE_TEXT, '').replace(/<\s*>|\(\s*\)|\[\s*\]/g, '').replace(/[ \t]{2,}/g, ' ').trim();
}

// ---- calendar_event (AI-7) -----------------------------------------------------------------
// Calendar INTELLIGENCE about job-search events: normalized times, a closed category, a lifecycle
// status, bounded text and safe https links. Never an attendee list, an invite body or a raw provider
// event, and never a credential-bearing link. Nothing is invented: absent facts stay absent.
//
// Time contract (exact):
//   timed event      start_at (ISO-8601 WITH offset) OR start_local + time_zone. end optional (start-only is valid).
//   all-day event    all_day:true + start_date (YYYY-MM-DD) [+ end_date, inclusive]. Times are ignored with a warning.
//   deadline         deadline_at | deadline_local + time_zone | deadline_date (date-only), else start_at is the due time.
//   invalid          end before start, unknown/invalid time_zone, malformed timestamp, local time that does not exist (DST gap).
//   ambiguous local time (DST fall-back) resolves to its first occurrence with a warning.
//   an explicit offset is an absolute instant and always wins over a conflicting time_zone (warned).

const CALENDAR_KEYS = [
  'version', 'status', 'start_at', 'end_at', 'start_local', 'end_local', 'all_day', 'start_date', 'end_date', 'time_zone',
  'deadline_at', 'deadline_local', 'deadline_date', 'source_event_url', 'organizer_name', 'organizer_domain', 'company', 'job_title', 'job_url',
  'location', 'meeting_url', 'previous_event', 'cancelled_at', 'attendee_count',
] as const;
const CALENDAR_PREVIOUS_KEYS = ['source_event_id', 'start_at', 'start_local'] as const;
const SECRET_URL_PARAM = /(^|[_-])(token|secret|password|passwd|pwd|auth|authorization|apikey|key|sig|signature|code|session|sid|jwt|credential|access)([_-]|$)/i;

/** https only, no credentials, no fragment, and query parameters that look like secrets are removed (warned). */
function safeHttpsUrl(c: Ctx, v: unknown, path: string): string | null {
  const s = text(c, v, path, AI_LIMITS.url);
  if (s === null) return null;
  let u: URL;
  try { u = new URL(s); } catch { c.err(path, 'url', 'invalid URL'); return null; }
  if (u.protocol !== 'https:') { c.err(path, 'url_scheme', 'only https URLs are allowed'); return null; }
  if (u.username || u.password) { c.err(path, 'url_credentials', 'URLs with credentials are not allowed'); return null; }
  u.hash = '';
  let removed = false;
  for (const k of [...u.searchParams.keys()]) if (SECRET_URL_PARAM.test(k)) { u.searchParams.delete(k); removed = true; }
  if (removed) c.warn(path, 'url_secret_param_removed', 'query parameters that look like secrets were removed from the link');
  return u.toString();
}

/** One instant from an offset timestamp and/or a wall-clock time in the source zone. */
function calendarInstant(c: Ctx, iso: unknown, local: unknown, path: string, field: string, zone: string | null): string | null {
  const hasIso = iso !== undefined && iso !== null, hasLocal = local !== undefined && local !== null;
  if (!hasIso && !hasLocal) return null;
  let fromIso: string | null = null, fromLocal: string | null = null;
  if (hasIso) {
    fromIso = timestamp(c, iso, `${path}.${field}_at`);
    if (fromIso && zone && typeof iso === 'string') {
      const off = stringOffsetMinutes(iso);
      if (off !== null && off !== zoneOffsetMinutes(fromIso, zone)) c.warn(`${path}.${field}_at`, 'offset_zone_mismatch', 'the UTC offset does not match time_zone at that instant; the offset (an absolute instant) is used');
    }
  }
  if (hasLocal) {
    if (typeof local !== 'string') c.err(`${path}.${field}_local`, 'type', 'must be a local date-time string YYYY-MM-DDTHH:mm');
    else if (!zone) c.err(`${path}.${field}_local`, 'time_zone_required', 'a local time needs a valid IANA time_zone');
    else {
      const r = localToInstant(local, zone);
      if (!r.ok) c.err(`${path}.${field}_local`, r.reason === 'nonexistent' ? 'nonexistent_local_time' : 'local_time', r.reason === 'nonexistent' ? 'that wall-clock time does not exist in the zone (daylight saving gap)' : 'must be a valid local date-time YYYY-MM-DDTHH:mm');
      else {
        if (r.ambiguous) c.warn(`${path}.${field}_local`, 'ambiguous_local_time', 'the wall-clock time occurs twice (daylight saving fall-back); the first occurrence is used');
        fromLocal = r.iso;
      }
    }
  }
  if (fromIso && fromLocal && fromIso !== fromLocal) c.warn(`${path}.${field}_local`, 'local_time_ignored', 'the local time disagrees with the offset timestamp; the offset timestamp is used');
  return fromIso ?? fromLocal;
}

interface CalendarParts extends SourceParts {
  calendar: AiCalendarProjection | null;
  category: string | null;
  sortAt: string | null;
  dueAt: string | null;
}

function calendarPayload(
  c: Ctx, v: unknown, path: string,
  ctx: { dedupe: DedupeInput; title: string | null; category: string | null; categoryPath: string },
): CalendarParts {
  const empty: CalendarParts = { payload: {}, identity: {}, calendar: null, category: null, sortAt: null, dueAt: null };
  if (!isObj(v)) { c.err(path, 'required', 'a calendar_event payload with a start time or deadline is required'); return empty; }
  for (const k of CALENDAR_RAW_KEYS) if (k in v) c.warn(`${path}.${k}`, 'raw_calendar_rejected', 'attendee lists, invite bodies and raw calendar events are never stored; send a concise summary instead');
  c.strip(v, CALENDAR_KEYS, path);
  const e0 = c.errors.length;
  sourceVersion(c, v.version, path);

  // Closed category. A lifecycle word as the category ("reschedule", "cancellation") becomes category other + that status.
  const catSlug = ctx.category === null ? null : String(slug(ctx.category));
  let category: CalendarCategory | null = null;
  let aliasStatus: CalendarStatus | null = null;
  const alias = catSlug ? (CALENDAR_CATEGORY_ALIASES as Record<string, CalendarStatus | undefined>)[catSlug] : undefined;
  if (alias) { aliasStatus = alias; category = 'other'; c.warn(ctx.categoryPath, 'category_alias', `"${catSlug}" is a status; stored as category other with status ${alias}`); }
  else if (catSlug && (CALENDAR_CATEGORIES as readonly string[]).includes(catSlug)) category = catSlug as CalendarCategory;
  else c.err(ctx.categoryPath, 'calendar_category', `must be one of: ${CALENDAR_CATEGORIES.join(', ')}`);
  const isDeadline = category !== null && (CALENDAR_DEADLINE_CATEGORIES as readonly string[]).includes(category);

  // A lifecycle word used as the category wins over a default/explicit "scheduled" status (the provider is telling us it changed).
  const explicitStatus = enumField(c, v.status, `${path}.status`, CALENDAR_STATUSES, { confirmed: 'scheduled', accepted: 'scheduled', canceled: 'cancelled', moved: 'rescheduled' });
  const status: CalendarStatus = aliasStatus && (!explicitStatus || explicitStatus === 'scheduled') ? aliasStatus : explicitStatus ?? 'scheduled';

  const zoneRaw = text(c, v.time_zone, `${path}.time_zone`, 64);
  let zone: string | null = null;
  if (zoneRaw) { if (isIanaTimeZone(zoneRaw)) zone = zoneRaw; else c.err(`${path}.time_zone`, 'time_zone', 'must be an IANA time zone such as America/Chicago'); }

  let allDay = false;
  if (v.all_day !== undefined && v.all_day !== null) { if (typeof v.all_day === 'boolean') allDay = v.all_day; else c.err(`${path}.all_day`, 'type', 'must be a boolean'); }
  const startDateRaw = calendarDate(c, v.start_date, `${path}.start_date`);
  const endDateRaw = calendarDate(c, v.end_date, `${path}.end_date`);
  const deadlineDateRaw = calendarDate(c, v.deadline_date, `${path}.deadline_date`);
  let startAt = calendarInstant(c, v.start_at, v.start_local, path, 'start', zone);
  let endAt = calendarInstant(c, v.end_at, v.end_local, path, 'end', zone);
  let deadlineAt = calendarInstant(c, v.deadline_at, v.deadline_local, path, 'deadline', zone);
  const deadlineGiven = deadlineAt !== null || deadlineDateRaw !== null;

  let startDate = startDateRaw, endDate = endDateRaw;
  if (isDeadline && !allDay && !deadlineAt && !startAt && deadlineDateRaw) { allDay = true; startDate = deadlineDateRaw; }
  else if (!allDay && startDate && !startAt && !(isDeadline && deadlineAt)) allDay = true; // a date with no time is an all-day item
  if (isDeadline && allDay && deadlineDateRaw) startDate = deadlineDateRaw;

  if (allDay) {
    if (startAt || endAt || deadlineAt) { c.warn(path, 'all_day_time_ignored', 'an all-day item is a calendar date; the times were ignored'); startAt = null; endAt = null; deadlineAt = null; }
    if (!startDate) c.err(`${path}.start_date`, 'all_day_date_required', 'an all-day item needs start_date (YYYY-MM-DD)');
    else {
      endDate = endDate ?? startDate;
      if (endDate < startDate) c.err(`${path}.end_date`, 'end_before_start', 'end_date must not be before start_date');
    }
  } else {
    startDate = null; endDate = null;
    if (isDeadline) {
      deadlineAt = deadlineAt ?? startAt;
      if (!deadlineAt) c.err(`${path}.deadline_at`, 'calendar_time_required', 'a deadline needs deadline_at (or deadline_local + time_zone, deadline_date, or start_at)');
    } else if (!startAt) c.err(`${path}.start_at`, 'calendar_time_required', 'start_at (or start_local with time_zone) is required');
    if (endAt && !startAt) { c.warn(`${path}.end_at`, 'end_without_start', 'end ignored: there is no start'); endAt = null; }
    if (endAt && startAt && endAt < startAt) c.err(`${path}.end_at`, 'end_before_start', 'end must not be before start');
  }
  if (!isDeadline && deadlineGiven) { c.warn(`${path}.deadline_at`, 'deadline_ignored', 'deadline fields only apply to deadline categories'); deadlineAt = null; }

  const sortAt = allDay ? (startDate ? localMidnight(startDate, zone) : null) : isDeadline ? deadlineAt : startAt;

  const location = text(c, v.location, `${path}.location`, CALENDAR_LIMITS.location);
  const company = text(c, v.company, `${path}.company`, SOURCE_KEY_LIMITS.short);
  const jobTitle = text(c, v.job_title, `${path}.job_title`, SOURCE_KEY_LIMITS.medium);
  // The public posting this event relates to (association is resolved at read time inside the caller's scope; never a database id).
  const jobUrl = url(c, v.job_url, `${path}.job_url`);
  const meetingUrl = safeHttpsUrl(c, v.meeting_url, `${path}.meeting_url`);
  const eventUrl = safeHttpsUrl(c, v.source_event_url, `${path}.source_event_url`);
  const orgRaw = text(c, v.organizer_name, `${path}.organizer_name`, CALENDAR_LIMITS.organizerName);
  const organizerName = orgRaw ? orgRaw.replace(/<[^>]*>/g, '').replace(/\S+@\S+/g, '').replace(/\s+/g, ' ').trim() || null : null;
  const domRaw = text(c, v.organizer_domain, `${path}.organizer_domain`, 255);
  let organizerDomain: string | null = null;
  if (domRaw) {
    const d = (domRaw.includes('@') ? domRaw.slice(domRaw.lastIndexOf('@') + 1) : domRaw).replace(/[>\s]/g, '').toLowerCase();
    if (DOMAIN.test(d)) organizerDomain = d; else c.err(`${path}.organizer_domain`, 'domain', 'must be a domain such as example.com');
  }
  let attendeeCount: number | null = null;
  if (v.attendee_count !== undefined && v.attendee_count !== null) {
    if (typeof v.attendee_count !== 'number' || !Number.isInteger(v.attendee_count) || v.attendee_count < 0 || v.attendee_count > CALENDAR_LIMITS.attendeeCount) c.err(`${path}.attendee_count`, 'attendee_count', `must be an integer 0..${CALENDAR_LIMITS.attendeeCount} (a count only; attendee lists are never stored)`);
    else attendeeCount = v.attendee_count;
  }
  const cancelledAt = timestamp(c, v.cancelled_at, `${path}.cancelled_at`);

  // previous_event: the identity/time this item replaced (reschedule or cancellation). Provider ids are public calendar ids, never database ids.
  let prevId: string | null = null, prevStart: string | null = null;
  if (v.previous_event !== undefined && v.previous_event !== null) {
    if (!isObj(v.previous_event)) c.err(`${path}.previous_event`, 'type', 'must be an object');
    else {
      c.strip(v.previous_event, CALENDAR_PREVIOUS_KEYS, `${path}.previous_event`);
      prevId = text(c, v.previous_event.source_event_id, `${path}.previous_event.source_event_id`, AI_LIMITS.id);
      prevStart = calendarInstant(c, v.previous_event.start_at, v.previous_event.start_local, `${path}.previous_event`, 'start', zone);
    }
  }
  if (c.errors.length > e0 || !category || !sortAt) return empty;

  const calendarSource = ctx.dedupe.source_name ?? null;
  const sourceEventId = ctx.dedupe.source_id ?? null;
  const logical = calendarLogicalKey({ company, category, title: ctx.title, start_at: sortAt });
  const prevLogical = prevStart ? calendarLogicalKey({ company, category, title: ctx.title, start_at: prevStart }) : null;

  const out: JsonRecord = { version: CALENDAR_PAYLOAD_VERSION, status, all_day: allDay };
  const put = (k: string, val: JsonValue | null) => { if (val !== null && val !== undefined) out[k] = val; };
  put('start_at', startAt); put('end_at', endAt); put('start_date', startDate); put('end_date', endDate); put('deadline_at', deadlineAt);
  put('time_zone', zone); put('calendar_source', calendarSource); put('source_event_id', sourceEventId); put('source_event_url', eventUrl);
  put('organizer_name', organizerName); put('organizer_domain', organizerDomain); put('company', company); put('job_title', jobTitle); put('job_url', jobUrl);
  put('location', location); put('meeting_url', meetingUrl); put('cancelled_at', cancelledAt); put('attendee_count', attendeeCount);
  if (prevId || prevStart) out.previous_event = { ...(prevId ? { source_event_id: prevId } : {}), ...(prevStart ? { start_at: prevStart } : {}) };
  if (byteLen(out) > AI_LIMITS.payloadBytes) c.err(path, 'too_large', 'calendar payload too large');

  const calendar: AiCalendarProjection = {
    category, is_deadline: isDeadline, status, all_day: allDay, start_at: startAt, end_at: endAt, start_date: startDate, end_date: endDate,
    deadline_at: deadlineAt, sort_at: sortAt, time_zone: zone, calendar_source: calendarSource, source_event_id: sourceEventId,
    previous_source_event_id: prevId, source_event_url: eventUrl, company, job_title: jobTitle, location, meeting_url: meetingUrl,
    organizer_name: organizerName, organizer_domain: organizerDomain, original_start_at: prevStart, cancelled_at: cancelledAt,
    logical_key: logical, previous_logical_key: prevLogical, payload_version: CALENDAR_PAYLOAD_VERSION,
  };
  return {
    payload: out, calendar, category, sortAt, dueAt: isDeadline ? sortAt : null,
    identity: { company, category, start_at: sortAt },
  };
}

// ---- items -----------------------------------------------------------------

const DEDUPE_KEYS = ['source_type', 'source_id', 'event', 'date', 'job_url', 'external_job_id', 'company', 'title', 'name', 'channel', 'source_name', 'location', 'posted_date', 'profile_url', 'role'] as const;
const FINDING_KEYS = ['kind', 'dedupe', 'category', 'priority', 'confidence', 'title', 'summary', 'occurred_at', 'due_at', 'source', 'match', 'evidence', 'payload'] as const;

function finding(c: Ctx, raw: unknown, path: string, provider: AiProvider | null): AiFinding | null {
  if (!isObj(raw)) { c.err(path, 'type', 'must be an object'); return null; }
  c.strip(raw, FINDING_KEYS, path);
  const e0 = c.errors.length;
  const kind = oneOf(c, raw.kind, `${path}.kind`, AI_FINDING_KINDS);
  let title = text(c, raw.title, `${path}.title`, AI_LIMITS.title, { required: true });
  let summary = text(c, raw.summary, `${path}.summary`, AI_LIMITS.summary);
  const category = text(c, raw.category, `${path}.category`, AI_LIMITS.category);
  const explicitPriority = raw.priority === undefined || raw.priority === null ? null : oneOf(c, raw.priority, `${path}.priority`, AI_PRIORITIES);
  let priority: AiPriority | null = raw.priority === undefined || raw.priority === null ? 'NORMAL' : explicitPriority;
  const conf = confidence(c, raw.confidence, `${path}.confidence`);
  const occurred_at = timestamp(c, raw.occurred_at, `${path}.occurred_at`);
  const due_at = timestamp(c, raw.due_at, `${path}.due_at`);
  // Evidence: deterministic truncation (never stores more than 500 chars of source text).
  let evidence = text(c, raw.evidence, `${path}.evidence`, AI_LIMITS.evidence, { truncate: true });

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
  let occurredOut = occurred_at;
  let categoryOut = category;
  let calendar: AiCalendarProjection | undefined;
  let recruiter: AiRecruiterProjection | undefined;
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
    const r = emailPayload(c, raw.payload, `${path}.payload`, raw, categoryOut);
    body = r.payload; identity = { ...r.identity, occurred_at };
    if (!dueAt && r.dueFromDeadline) dueAt = r.dueFromDeadline;
    // Email-derived free text keeps no links, addresses or phone numbers.
    title = redacted(c, title, `${path}.title`);
    if (!title) c.err(`${path}.title`, 'required', 'must not be empty');
    summary = redacted(c, summary, `${path}.summary`);
    evidence = redacted(c, evidence, `${path}.evidence`);
    // ONE stored urgency: the existing priority, adjusted by deterministic rules (never invented, never an opaque score).
    if (categoryOut) {
      const u = resolveEmailUrgency({ category: categoryOut, urgency: r.urgency, priority: explicitPriority, actionNeeded: r.actionNeeded, dueAt, refTime: c.refTime });
      if (u.conflict) c.warn(`${path}.payload.urgency`, 'priority_urgency_conflict', 'urgency and priority disagree; urgency is used');
      if (u.adjusted) c.warn(`${path}.payload.urgency`, 'urgency_adjusted', `urgency adjusted: ${u.adjusted}`);
      priority = u.priority;
    }
  } else if (kind === 'recruiter_intel') {
    const r = recruiterPayload(c, raw.payload, `${path}.payload`, { sourceUrl });
    body = r.payload; identity = r.identity; if (r.recruiter) recruiter = r.recruiter;
    // A person's free text never keeps phone numbers or email addresses (links stay: they are the citation).
    // If nothing is left once an address or number is removed, the title falls back to the validated name and company (never the raw text).
    title = redactContact(title ?? '') || (typeof body.recruiter_name === 'string' ? `${body.recruiter_name}, ${String(body.company ?? '')}` : title);
    if (summary) summary = redactContact(summary) || null;
    if (evidence) evidence = redactContact(evidence) || null;
  } else if (kind === 'calendar_event') {
    // The finding time is the item's chronological anchor (its start, or its deadline), not a provider-supplied value.
    const r = calendarPayload(c, raw.payload, `${path}.payload`, { dedupe: dedupeIn, title, category, categoryPath: `${path}.category` });
    body = r.payload; identity = r.identity;
    if (r.calendar) { calendar = r.calendar; categoryOut = r.category; occurredOut = r.sortAt; dueAt = r.dueAt; }
  } else if (kind) {
    body = payload(c, kind, raw.payload, `${path}.payload`, dedupeIn.date);
  }

  let dedupe_key = '';
  if (kind && title) {
    const merged: DedupeInput = { ...identity };
    for (const [k, val] of Object.entries(dedupeIn)) {
      // Calendar identity is derived from the validated payload (company/title/start), never from free dedupe text.
      if (kind === 'calendar_event' && (k === 'company' || k === 'title')) continue;
      // Recruiter identity is derived from the validated payload, never from free dedupe text.
      if (kind === 'recruiter_intel') continue;
      if (val !== null && val !== undefined && val !== '') (merged as Record<string, unknown>)[k] = val;
    }
    const r = buildDedupeKey(kind, { ...merged, provider, title: kind === 'job_lead' ? merged.title ?? title : kind === 'calendar_event' ? title : dedupeIn.title ?? title, summary });
    if (r.ok) dedupe_key = r.key; else c.err(`${path}.dedupe`, 'dedupe', r.reason);
  }
  if (c.errors.length > e0 || !kind || !title || !priority) return null;
  return {
    kind, dedupe_key, category: categoryOut, priority, confidence: conf, title, summary, occurred_at: occurredOut, due_at: dueAt, source_ref,
    match_hints: hints, evidence, payload: body, ...(jobLead ? { job_lead: jobLead } : {}), ...(calendar ? { calendar } : {}), ...(recruiter ? { recruiter } : {}),
  };
}

const SUGGESTION_KEYS = ['finding_index', 'action', 'target', 'proposed', 'confidence'] as const;
function suggestion(c: Ctx, raw: unknown, path: string, findingKinds: readonly AiFindingKind[]): AiSuggestion | null {
  const findingCount = findingKinds.length;
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
  let proposed = boundedRecord(c, raw.proposed, `${path}.proposed`, AI_LIMITS.proposedBytes);
  const conf = confidence(c, raw.confidence, `${path}.confidence`);
  // AI-8: a human-approvable action has a strict payload schema, and the SERVER resolves every internal record.
  // A provider-supplied target is therefore ignored (never trusted) for these actions.
  if (action && isActionType(action)) {
    const checked = validateActionProposal(action, raw.proposed === undefined || raw.proposed === null ? {} : raw.proposed);
    if (!checked.ok) c.err(`${path}.proposed`, 'action_invalid', checked.message);
    else {
      proposed = checked.normalized;
      if (target) { c.warn(`${path}.target`, 'target_ignored', 'the server resolves the target of an executable action; the provided target is ignored'); target = null; }
      const kind = Number.isInteger(idx) ? findingKinds[idx as number] : undefined;
      if (action === 'create_application' && kind !== undefined && kind !== 'job_lead') c.err(`${path}.action`, 'action_invalid', 'create_application applies only to a job_lead finding');
    }
  }
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

  const generated = run.generated_at ? Date.parse(run.generated_at) : NaN;
  if (Number.isFinite(generated)) c.refTime = generated;

  const sources: AiSourceRef[] = [];
  if (input.sources !== undefined) {
    if (!Array.isArray(input.sources)) c.err('sources', 'type', 'must be an array');
    else if (input.sources.length > AI_LIMITS.sourcesPerRun) c.err('sources', 'too_many', `max ${AI_LIMITS.sourcesPerRun}`);
    else input.sources.forEach((s: unknown, i: number) => {
      const p = `sources[${i}]`;
      if (!isObj(s)) { c.err(p, 'type', 'must be an object'); return; }
      c.strip(s, ['type', 'ref', 'observed_at', 'status', 'count', 'note'], p);
      const e0 = c.errors.length;
      const type = oneOf(c, s.type, `${p}.type`, AI_SOURCE_TYPES);
      const ref = text(c, s.ref, `${p}.ref`, AI_LIMITS.id, { required: true });
      const observed_at = timestamp(c, s.observed_at, `${p}.observed_at`);
      // AI-11D source health: unavailable / blocked / error / skipped are NOT the same as zero results.
      const status = oneOf(c, s.status, `${p}.status`, AI_SOURCE_STATUSES, false);
      let count: number | undefined;
      if (s.count !== undefined && s.count !== null) {
        if (typeof s.count !== 'number' || !Number.isInteger(s.count) || s.count < 0 || s.count > 100_000) c.err(`${p}.count`, 'count', 'must be a whole number 0-100000');
        else count = s.count;
      }
      const note = text(c, s.note, `${p}.note`, DISCOVERY_LIMITS.sourceNoteChars, { truncate: true });
      if (c.errors.length === e0 && type && ref) sources.push({ type, ref, observed_at, ...(status ? { status } : {}), ...(count !== undefined ? { count } : {}), ...(note ? { note } : {}) });
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
    const r = suggestion(c, isObj(s) && mapped !== undefined ? { ...s, finding_index: mapped } : s, `suggestions[${i}]`, findings.map((f) => f.kind));
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
