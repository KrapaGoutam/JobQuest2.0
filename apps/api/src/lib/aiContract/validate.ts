// Validation + normalization for jobquest.ai-result. Hand-rolled (no new
// dependency) because unknown-field COUNTING is a contract requirement that
// zod's strip mode does not report. Never throws on provider input.
import {
  AI_CONTRACT_NAME, AI_CONTRACT_VERSION, AI_EVENT_PATTERN, AI_FINDING_KINDS, AI_LIMITS,
  AI_MAX_SUPPORTED_MINOR, AI_PRIORITIES, AI_PROVIDERS, AI_SOURCE_TYPES, AI_SUGGESTION_ACTIONS,
  AI_SUGGESTION_TARGET_TYPES, AI_SUPPORTED_MAJORS, AI_WORKFLOWS,
  type AiFindingKind, type AiSuggestionTargetType, type AiTriggerType,
} from './constants';
import { buildDedupeKey, canonicalizeUrl, type DedupeInput } from './dedupe';
import type {
  AiFinding, AiIngestRunInput, AiIssue, AiResult, AiSourceRef, AiSuggestion, AiValidationResult,
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
  daily_brief: { date: 'string', highlights: 'strings', total_items: 'number' },
  email_event: { from_domain: 'string', company: 'string', role_title: 'string', next_step: 'string', deadline: 'timestamp' },
  job_lead: { company: 'string', role_title: 'string', location: 'string', salary_text: 'string', remote: 'boolean', job_url: 'url', external_job_id: 'string', fit_notes: 'string' },
  recruiter_intel: { recruiter_name: 'string', company: 'string', channel: 'string', role_title: 'string' },
  calendar_event: { start_at: 'timestamp', end_at: 'timestamp', location: 'string', attendee_count: 'number', join_url: 'url' },
};

function payload(c: Ctx, kind: AiFindingKind, v: unknown, path: string): JsonRecord {
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

// ---- items -----------------------------------------------------------------

const DEDUPE_KEYS = ['source_type', 'source_id', 'event', 'date', 'job_url', 'external_job_id', 'company', 'title', 'name', 'channel'] as const;
const FINDING_KEYS = ['kind', 'dedupe', 'category', 'priority', 'confidence', 'title', 'summary', 'occurred_at', 'due_at', 'source', 'match', 'evidence', 'payload'] as const;

function finding(c: Ctx, raw: unknown, path: string): AiFinding | null {
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

  const body = kind ? payload(c, kind, raw.payload, `${path}.payload`) : {};

  let dedupe_key = '';
  if (kind && title) {
    const r = buildDedupeKey(kind, { ...dedupeIn, title: dedupeIn.title ?? title, summary });
    if (r.ok) dedupe_key = r.key; else c.err(`${path}.dedupe`, 'dedupe', r.reason);
  }
  if (c.errors.length > e0 || !kind || !title || !priority) return null;
  return { kind, dedupe_key, category, priority, confidence: conf, title, summary, occurred_at, due_at, source_ref, match_hints: hints, evidence, payload: body };
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
    const r = finding(c, f, `findings[${i}]`);
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
