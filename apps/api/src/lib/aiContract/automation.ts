// AI-11A: provider-neutral automation definition (pure; no I/O).
//
// An automation is one `ai_workflow_configs` row: WHICH workflow, WHICH provider, WHEN (a bounded cadence in an
// IANA zone), which sections and delivery preferences. It never holds credentials or provider schedule ids.
// Operational state is derived, not stored: last run / success / error come from `ai_runs`, and
// `next_expected_run_at` is computed here from the schedule. JobQuest does not run anything: providers own
// execution, so "next expected" is when the provider SHOULD run, not a promise. Mirrored for the browser by
// apps/web/src/lib/aiAutomation.ts (tests/unit/ai-11a-automation.test.ts fails on drift).

import { AI_WORKFLOWS } from './constants';
import { isIanaTimeZone, localToInstant, zoneOffsetAt } from './calendarTime';

export const AUTOMATION_CADENCES = ['daily', 'weekdays', 'selected_days', 'weekly', 'manual_only'] as const;
/** `system` (a future internal scheduler) is intentionally not selectable: no such scheduler exists. */
export const AUTOMATION_PROVIDERS = ['claude', 'chatgpt', 'gemini', 'manual'] as const;
export const AUTOMATION_SECTIONS = ['email_triage', 'job_discovery', 'recruiter_intel', 'calendar_review', 'followups', 'goal_summary'] as const;
export const AUTOMATION_DELIVERY = ['ai_hub', 'email_summary'] as const;
/** Only composite workflows carry sections; every other workflow IS its own section. */
export const AUTOMATION_COMPOSITE_WORKFLOWS = ['daily_brief', 'other'] as const;
/** ISO weekdays: 1 = Monday .. 7 = Sunday. */
export const AUTOMATION_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const AUTOMATION_NAME_MAX = 80;
export const AUTOMATION_LIMIT = 10;

export type AutomationCadence = (typeof AUTOMATION_CADENCES)[number];
export type AutomationProvider = (typeof AUTOMATION_PROVIDERS)[number];
export type AutomationSection = (typeof AUTOMATION_SECTIONS)[number];
export type AutomationDelivery = (typeof AUTOMATION_DELIVERY)[number];

/** The canonical, provider-neutral definition. */
export interface AutomationDefinition {
  name: string;
  workflow: (typeof AI_WORKFLOWS)[number];
  enabled: boolean;
  provider: AutomationProvider;
  cadence: AutomationCadence;
  /** "HH:MM" wall clock in `timezone`; null only for manual_only. */
  localTime: string | null;
  timezone: string | null;
  /** ISO weekdays (1 = Mon .. 7 = Sun), sorted, distinct. Empty unless weekly / selected_days. */
  weekdays: number[];
  sections: AutomationSection[];
  delivery: AutomationDelivery[];
}

export type AutomationValidation =
  | { ok: true; value: AutomationDefinition }
  | { ok: false; field: string; code: string; message: string };

const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const ZONE_SHAPE = /^(UTC|[A-Za-z_]+(\/[A-Za-z0-9_+-]+){1,2})$/;
const has = <T extends readonly string[]>(list: T, v: unknown): v is T[number] => typeof v === 'string' && (list as readonly string[]).includes(v);
const bad = (field: string, code: string, message: string): AutomationValidation => ({ ok: false, field, code, message });

/** Strict, normalizing validation of an automation definition. Unknown input never throws. */
export function validateAutomation(input: unknown): AutomationValidation {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return bad('body', 'INVALID_INPUT', 'An automation definition is required.');
  const i = input as Record<string, unknown>;

  const name = typeof i.name === 'string' ? i.name.trim() : '';
  if (name.length === 0 || name.length > AUTOMATION_NAME_MAX) return bad('name', 'INVALID_NAME', `Name must be 1-${AUTOMATION_NAME_MAX} characters.`);
  if (!has(AI_WORKFLOWS, i.workflow)) return bad('workflow', 'INVALID_WORKFLOW', 'Choose a supported workflow.');
  if (typeof i.enabled !== 'boolean') return bad('enabled', 'INVALID_ENABLED', 'Enabled must be true or false.');
  if (!has(AUTOMATION_PROVIDERS, i.provider)) return bad('provider', 'INVALID_PROVIDER', 'Choose Claude, ChatGPT, Gemini or Manual.');
  if (!has(AUTOMATION_CADENCES, i.cadence)) return bad('cadence', 'INVALID_CADENCE', 'Choose a supported cadence.');
  const cadence = i.cadence;

  const rawTime = i.localTime ?? null;
  const rawZone = i.timezone ?? null;
  if (rawTime !== null && (typeof rawTime !== 'string' || !TIME.test(rawTime))) return bad('localTime', 'INVALID_TIME', 'Time must be HH:MM (24-hour).');
  if (rawZone !== null && (typeof rawZone !== 'string' || !ZONE_SHAPE.test(rawZone) || !isIanaTimeZone(rawZone))) return bad('timezone', 'INVALID_TIMEZONE', 'Choose a valid IANA time zone, for example America/Chicago.');

  const days = i.weekdays ?? [];
  if (!Array.isArray(days) || days.length > 7 || !days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) return bad('weekdays', 'INVALID_WEEKDAYS', 'Days must be weekday numbers from 1 (Monday) to 7 (Sunday).');
  const weekdays = [...new Set(days as number[])].sort((a, b) => a - b);

  if (cadence === 'manual_only') {
    if (weekdays.length > 0) return bad('weekdays', 'INVALID_WEEKDAYS', 'A manual-only automation has no scheduled days.');
  } else {
    if (rawTime === null) return bad('localTime', 'INVALID_TIME', 'Choose a time for a scheduled automation.');
    if (rawZone === null) return bad('timezone', 'INVALID_TIMEZONE', 'Choose a time zone for a scheduled automation.');
    if ((cadence === 'daily' || cadence === 'weekdays') && weekdays.length > 0) return bad('weekdays', 'INVALID_WEEKDAYS', 'Days apply only to weekly and selected-day schedules.');
    if (cadence === 'weekly' && weekdays.length !== 1) return bad('weekdays', 'INVALID_WEEKDAYS', 'A weekly schedule needs exactly one day.');
    if (cadence === 'selected_days' && weekdays.length < 1) return bad('weekdays', 'INVALID_WEEKDAYS', 'Choose at least one day.');
  }

  const sectionsIn = i.sections ?? [];
  if (!Array.isArray(sectionsIn) || !sectionsIn.every((s) => has(AUTOMATION_SECTIONS, s))) return bad('sections', 'INVALID_SECTIONS', 'Choose supported sections only.');
  const sections = [...new Set(sectionsIn as AutomationSection[])].sort();
  if (sections.length > 0 && !(AUTOMATION_COMPOSITE_WORKFLOWS as readonly string[]).includes(i.workflow)) return bad('sections', 'INVALID_SECTIONS', 'Sections apply to the Daily Digest and custom reviews only.');

  const deliveryIn = i.delivery ?? ['ai_hub'];
  if (!Array.isArray(deliveryIn) || !deliveryIn.every((d) => has(AUTOMATION_DELIVERY, d))) return bad('delivery', 'INVALID_DELIVERY', 'Choose supported delivery destinations only.');
  const delivery = [...new Set(deliveryIn as AutomationDelivery[])].sort();
  if (!delivery.includes('ai_hub')) return bad('delivery', 'INVALID_DELIVERY', 'Results are always delivered to the AI Hub.');

  return {
    ok: true,
    value: { name, workflow: i.workflow, enabled: i.enabled, provider: i.provider, cadence, localTime: rawTime, timezone: rawZone, weekdays, sections, delivery },
  };
}

// ---- next expected run --------------------------------------------------------------------------------------------

type ScheduleFields = Pick<AutomationDefinition, 'enabled' | 'cadence' | 'localTime' | 'timezone' | 'weekdays'>;

function runsOnWeekday(s: ScheduleFields, isoWeekday: number): boolean {
  switch (s.cadence) {
    case 'daily': return true;
    case 'weekdays': return isoWeekday <= 5;
    case 'weekly':
    case 'selected_days': return s.weekdays.includes(isoWeekday);
    default: return false;
  }
}

/**
 * The next instant (strictly after `now`) at which the schedule says a run is expected, as an ISO string; null when
 * disabled, manual-only or invalid. Wall-clock semantics in the automation's own zone:
 *   * the local date/weekday come from the zone, never the server's clock zone;
 *   * a time inside a spring-forward gap does not exist and runs at the first valid instant after the gap
 *     (08:00-style times are unaffected; 02:30 on the DST day becomes 03:30 local);
 *   * an ambiguous time (clocks fall back) resolves to its FIRST occurrence.
 * Derived on read rather than stored: it is a pure function of the schedule, so it can never go stale.
 */
export function computeNextExpectedRun(schedule: ScheduleFields, now: Date = new Date()): string | null {
  const base = localBase(schedule, now);
  if (!base) return null;
  // 8 days always contains the next occurrence of any weekly / selected-day schedule, even across a DST change.
  for (let add = 0; add <= 8; add++) {
    const ms = occurrenceOnLocalDay(schedule, base, add);
    if (ms !== null && ms > base.nowMs) return new Date(ms).toISOString();
  }
  return null;
}

/** The local calendar date "today" in the automation's own zone, or null when the schedule can never fire. */
function localBase(schedule: ScheduleFields, now: Date): { nowMs: number; y: number; mo: number; d: number; localTime: string; timezone: string } | null {
  if (!schedule.enabled || schedule.cadence === 'manual_only') return null;
  const { localTime, timezone } = schedule;
  if (!localTime || !TIME.test(localTime) || !timezone || !isIanaTimeZone(timezone)) return null;
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return null;
  const local = new Date(nowMs + zoneOffsetAt(nowMs, timezone));
  return { nowMs, y: local.getUTCFullYear(), mo: local.getUTCMonth(), d: local.getUTCDate(), localTime, timezone };
}

/**
 * THE occurrence calculator: the instant (epoch ms) at which the schedule fires on the local date `base + add days`, or
 * null when the cadence skips that weekday. Both the next-run display and due evaluation use this one function, so the
 * UI and the executor can never disagree about "8:00".
 */
function occurrenceOnLocalDay(schedule: ScheduleFields, base: { y: number; mo: number; d: number; localTime: string; timezone: string }, add: number): number | null {
  const day = new Date(Date.UTC(base.y, base.mo, base.d + add));
  const isoWeekday = day.getUTCDay() === 0 ? 7 : day.getUTCDay();
  if (!runsOnWeekday(schedule, isoWeekday)) return null;
  const stamp = `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}-${String(day.getUTCDate()).padStart(2, '0')}T${base.localTime}:00`;
  const r = localToInstant(stamp, base.timezone);
  return r.ok
    ? Date.parse(r.iso)
    : Date.parse(`${stamp}Z`) - zoneOffsetAt(Date.parse(`${stamp}Z`) - 86_400_000, base.timezone); // gap: first instant after it
}

// ---- due evaluation (AI-11F) -------------------------------------------------------------------------------------------

/**
 * Catch-up window. An occurrence that is at most this far in the past is still claimable (the poller or the provider was
 * briefly down); anything older is SKIPPED, never replayed. Only the single most recent eligible occurrence is ever due, so
 * an outage can never produce a backlog. Three hours keeps a missed 08:00 digest useful until late morning without
 * running a "morning" digest in the afternoon.
 */
export const AUTOMATION_CATCHUP_GRACE_MS = 3 * 60 * 60 * 1000;

/** The latest scheduled instant in (now - graceMs, now], or null. Same occurrence calculator as computeNextExpectedRun. */
export function latestDueOccurrence(schedule: ScheduleFields, now: Date, graceMs: number = AUTOMATION_CATCHUP_GRACE_MS): string | null {
  const base = localBase(schedule, now);
  if (!base) return null;
  const back = Math.ceil(graceMs / 86_400_000) + 1; // a local day is 23-25h; one spare day covers any DST shift
  let best: number | null = null;
  for (let add = -back; add <= 1; add++) {
    const ms = occurrenceOnLocalDay(schedule, base, add);
    if (ms === null || ms > base.nowMs || ms <= base.nowMs - graceMs) continue;
    if (best === null || ms > best) best = ms;
  }
  return best === null ? null : new Date(best).toISOString();
}

/** The slice of an automation row due evaluation needs. `updatedAt` is when the configuration last changed. */
export interface DueCandidate extends ScheduleFields {
  id: string;
  workflow: AutomationDefinition['workflow'];
  provider: AutomationProvider | null;
  updatedAt: string;
}
export interface DueOccurrence { automationId: string; scheduledFor: string; workflow: DueCandidate['workflow']; provider: AutomationProvider }

/**
 * Which automation occurrences are due at `now`? Deterministic, bounded (at most one per automation, at most `limit`
 * automations considered) and ordered (scheduledFor, then id).
 *   * disabled, manual-only, provider-less or invalid schedules are never due;
 *   * an occurrence at or before the last configuration change is not due: a schedule edit (or re-enabling) never
 *     retroactively fires a slot the new configuration did not own, so the edit boundary cannot double-run.
 */
export function getDueOccurrences(candidates: readonly DueCandidate[], now: Date, graceMs: number = AUTOMATION_CATCHUP_GRACE_MS, limit: number = AUTOMATION_LIMIT): DueOccurrence[] {
  const out: DueOccurrence[] = [];
  for (const c of candidates.slice(0, limit)) {
    if (!c.provider) continue;
    const at = latestDueOccurrence(c, now, graceMs);
    if (at === null) continue;
    const changed = Date.parse(c.updatedAt);
    if (Number.isFinite(changed) && Date.parse(at) <= changed) continue;
    out.push({ automationId: c.id, scheduledFor: at, workflow: c.workflow, provider: c.provider });
  }
  return out.sort((a, b) => (a.scheduledFor < b.scheduledFor ? -1 : a.scheduledFor > b.scheduledFor ? 1 : a.automationId < b.automationId ? -1 : 1));
}

// ---- canonical occurrence identity ---------------------------------------------------------------------------------------

export const EXECUTION_TRIGGERS = ['scheduled', 'manual', 'retry'] as const;
export type ExecutionTrigger = (typeof EXECUTION_TRIGGERS)[number];
/** A retry is a NEW run linked to the failed one; at most this many retries per original run. */
export const EXECUTION_RETRY_LIMIT = 3;

/**
 * "20261103T140000Z": the unambiguous UTC form of a scheduled instant. rpc_ai_execution_request builds the identical string
 * in SQL, and the integration test pins both to the same value.
 */
export function occurrenceStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error('INVALID_OCCURRENCE');
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** The deterministic `ai_runs.external_run_id` of a scheduled occurrence: one automation + one instant = one execution. */
export const scheduledRunKey = (automationId: string, scheduledForIso: string): string => `auto:${automationId}:${occurrenceStamp(scheduledForIso)}`;
/** Run Now: the client supplies a fresh key per click; a retried request with the same key is the same execution. */
export const manualRunKey = (automationId: string, clientKey: string): string => `manual:${automationId}:${clientKey}`;
export const CLIENT_KEY = /^[A-Za-z0-9_-]{8,64}$/;

// ---- composite workflow ordering -----------------------------------------------------------------------------------------

export type ExecutionStep = AutomationSection | AutomationDefinition['workflow'];

/**
 * The canonical ordered step list an executor walks for one occurrence. Sections are stored alphabetically (a set), so
 * order is never read from storage: it is derived here. Evidence first, synthesis last:
 *   1 email triage -> 2 job discovery -> 3 recruiter intelligence -> 4 calendar review -> 5 follow-ups -> 6 goal summary
 *   -> the Daily Digest composition LAST, because it reads what the earlier steps produced.
 * A single-purpose workflow is its own single step. A custom review runs its sections in the same order (no digest).
 * Deliberately a bounded ordered list, not a DAG: dependencies are linear and fixed.
 */
export function executionPlan(a: Pick<AutomationDefinition, 'workflow' | 'sections'>): ExecutionStep[] {
  const ordered = AUTOMATION_SECTIONS.filter((s) => a.sections.includes(s));
  if (a.workflow === 'daily_brief') return [...ordered, 'daily_brief'];
  if (a.workflow === 'other') return ordered.length > 0 ? ordered : ['other'];
  return [a.workflow];
}

// ---- failure recording -----------------------------------------------------------------------------------------------------

export const EXECUTION_FAILURE_CATEGORIES = [
  'PROVIDER_UNAVAILABLE', 'CONNECTOR_AUTH_EXPIRED', 'SOURCE_UNAVAILABLE', 'PARTIAL_READ', 'SCHEMA_INVALID', 'TIMEOUT', 'RATE_LIMITED', 'INTERNAL',
] as const;
export type ExecutionFailureCategory = (typeof EXECUTION_FAILURE_CATEGORIES)[number];
export const EXECUTION_FAILURE_SUMMARY_MAX = 200;

/**
 * A persistent, user-visible failure summary: one short plain-text line. Strips control characters, URLs, e-mail
 * addresses and anything token-shaped (long opaque runs, Bearer/JWT), then truncates. Technical detail belongs in
 * operational logs, never in `ai_runs.error_detail`.
 */
export function sanitizeFailureSummary(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const s = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\bbearer\s+\S+/gi, '[redacted]')
    .replace(/\bey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]*)?/g, '[redacted]')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[link]')
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
    .replace(/[A-Za-z0-9_\-+/=.]{24,}/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > EXECUTION_FAILURE_SUMMARY_MAX ? `${s.slice(0, EXECUTION_FAILURE_SUMMARY_MAX - 1).trimEnd()}…` : s;
}

// ---- executor readiness (provider-neutral) ---------------------------------------------------------------------------------

/**
 * configured     a registered executor can accept work for this provider
 * not_configured no executor exists for this provider (every provider until AI-11G; `manual` never has one)
 * unavailable    one exists in principle but cannot run now (AI Hub kill switch off)
 * Derived, never stored: AI-11G adds a provider by registering it in REGISTERED_EXECUTORS (or its connection check),
 * with no schema change.
 */
export type ExecutorState = 'configured' | 'not_configured' | 'unavailable';
/** Providers with a connected scheduler adapter. Empty in AI-11F by design: no adapter exists yet (AI-11G). */
export const REGISTERED_EXECUTORS: readonly AutomationProvider[] = [];

export function executorState(provider: AutomationProvider, ctx: { aiHubEnabled: boolean; registered?: readonly AutomationProvider[] }): ExecutorState {
  if (provider === 'manual' || !(ctx.registered ?? REGISTERED_EXECUTORS).includes(provider)) return 'not_configured';
  return ctx.aiHubEnabled ? 'configured' : 'unavailable';
}

/**
 * The context an executor receives from a successful claim. Bounded and credential-free by construction: ids, enums,
 * the canonical schedule fields and the ordered plan. It never carries provider tokens, client secrets or DB credentials.
 * `externalRunId` is what the executor puts in `run.external_run_id` of jobquest_submit_ai_result so the result lands on
 * THIS run (the ingest RPC resumes an existing RUNNING run with that key and never starts a second one).
 */
export interface ExecutionClaim {
  runId: string;
  automationId: string | null;
  workflow: AutomationDefinition['workflow'];
  provider: AutomationProvider;
  trigger: ExecutionTrigger;
  scheduledFor: string | null;
  timezone: string | null;
  sections: AutomationSection[];
  delivery: AutomationDelivery[];
  plan: ExecutionStep[];
  externalRunId: string;
  retryOfRunId: string | null;
}

// ---- derived run state ---------------------------------------------------------------------------------------------

/** The slice of an `ai_runs` row the derivation needs. error_detail is deliberately not part of it. */
export interface AutomationRunSlice {
  status: string;
  created_at: string;
  completed_at: string | null;
  error_category: string | null;
  /** scheduled | manual | retry (AI-11F). Optional so older callers and fixtures stay valid. */
  trigger_type?: string | null;
}

export interface AutomationRunState {
  lastRunAt: string | null;
  lastStatus: string | null;
  /** How the latest run started: scheduled | manual | retry. */
  lastTrigger: string | null;
  lastSuccessAt: string | null;
  /** When the latest FAILED run ended (a later success does not erase it: it is the last failure, not the current state). */
  lastFailureAt: string | null;
  /** Normalized category only (never provider error text). */
  lastErrorCategory: string | null;
}

const stamp = (r: AutomationRunSlice) => r.completed_at ?? r.created_at;

/**
 * Derive the operational state from the automation's matching runs (same owner, workflow and provider). `latest` is
 * the most recent run of any status, `latestSuccess` the most recent SUCCEEDED run. Nothing is duplicated into the
 * configuration row, so there is no second source of truth to drift.
 */
export function deriveAutomationRunState(latest: AutomationRunSlice | null, latestSuccess: AutomationRunSlice | null, latestFailure: AutomationRunSlice | null = null): AutomationRunState {
  const failed = latest !== null && (latest.status === 'FAILED' || latest.status === 'PARTIAL');
  return {
    lastRunAt: latest ? stamp(latest) : null,
    lastStatus: latest ? latest.status : null,
    lastTrigger: latest ? latest.trigger_type ?? null : null,
    lastSuccessAt: latestSuccess ? stamp(latestSuccess) : null,
    lastFailureAt: latestFailure ? stamp(latestFailure) : null,
    lastErrorCategory: failed ? latest.error_category : null,
  };
}

// ---- Run Now contract ----------------------------------------------------------------------------------------------

/**
 * Run Now readiness. AI-11A shipped the contract; AI-11F makes the backend real and keeps it truthful:
 *   POST /api/ai/automations/:id/run-now  (CSRF, owner only, AI Hub kill switch)
 *   -> rpc_ai_execution_request inserts ai_runs { trigger_type: 'manual', status: 'QUEUED', automation_id,
 *        external_run_id: 'manual:<automationId>:<clientKey>' }   (idempotent)
 *   -> an executor claims it (rpc_ai_execution_claim: QUEUED -> RUNNING, exactly one winner) and finalizes it through
 *      the existing rpc_ai_finalize_run lifecycle. It is the SAME lifecycle as a scheduled occurrence.
 * It is only ready when an executor is configured for the provider (AI-11G registers them). Until then it stays
 * `NO_EXECUTOR`: a QUEUED run nobody can claim would be fabricated state, so none is ever created.
 * Reasons are ordered: the first failing check wins.
 */
export type RunNowReason = 'AI_HUB_DISABLED' | 'AUTOMATION_DISABLED' | 'NO_EXECUTOR';
export interface RunNowReadiness { ready: boolean; reason: RunNowReason | null }

export function runNowReadiness(a: Pick<AutomationDefinition, 'enabled'>, ctx: { aiHubEnabled: boolean; executorAvailable?: boolean }): RunNowReadiness {
  if (!ctx.aiHubEnabled) return { ready: false, reason: 'AI_HUB_DISABLED' };
  if (!a.enabled) return { ready: false, reason: 'AUTOMATION_DISABLED' };
  if (!ctx.executorAvailable) return { ready: false, reason: 'NO_EXECUTOR' };
  return { ready: true, reason: null };
}
