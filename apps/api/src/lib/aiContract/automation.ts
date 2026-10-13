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
  if (!schedule.enabled || schedule.cadence === 'manual_only') return null;
  const { localTime, timezone } = schedule;
  if (!localTime || !TIME.test(localTime) || !timezone || !isIanaTimeZone(timezone)) return null;
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return null;

  // Local calendar date "today" in the automation's zone.
  const local = new Date(nowMs + zoneOffsetAt(nowMs, timezone));
  const y = local.getUTCFullYear();
  const mo = local.getUTCMonth();
  const d = local.getUTCDate();

  // 8 days always contains the next occurrence of any weekly / selected-day schedule, even across a DST change.
  for (let add = 0; add <= 8; add++) {
    const day = new Date(Date.UTC(y, mo, d + add));
    const isoWeekday = day.getUTCDay() === 0 ? 7 : day.getUTCDay();
    if (!runsOnWeekday(schedule, isoWeekday)) continue;
    const stamp = `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}-${String(day.getUTCDate()).padStart(2, '0')}T${localTime}:00`;
    const r = localToInstant(stamp, timezone);
    const ms = r.ok
      ? Date.parse(r.iso)
      : Date.parse(`${stamp}Z`) - zoneOffsetAt(Date.parse(`${stamp}Z`) - 86_400_000, timezone); // gap: first instant after it
    if (ms > nowMs) return new Date(ms).toISOString();
  }
  return null;
}

// ---- derived run state ---------------------------------------------------------------------------------------------

/** The slice of an `ai_runs` row the derivation needs. error_detail is deliberately not part of it. */
export interface AutomationRunSlice {
  status: string;
  created_at: string;
  completed_at: string | null;
  error_category: string | null;
}

export interface AutomationRunState {
  lastRunAt: string | null;
  lastStatus: string | null;
  lastSuccessAt: string | null;
  /** Normalized category only (never provider error text). */
  lastErrorCategory: string | null;
}

const stamp = (r: AutomationRunSlice) => r.completed_at ?? r.created_at;

/**
 * Derive the operational state from the automation's matching runs (same owner, workflow and provider). `latest` is
 * the most recent run of any status, `latestSuccess` the most recent SUCCEEDED run. Nothing is duplicated into the
 * configuration row, so there is no second source of truth to drift.
 */
export function deriveAutomationRunState(latest: AutomationRunSlice | null, latestSuccess: AutomationRunSlice | null): AutomationRunState {
  const failed = latest !== null && (latest.status === 'FAILED' || latest.status === 'PARTIAL');
  return {
    lastRunAt: latest ? stamp(latest) : null,
    lastStatus: latest ? latest.status : null,
    lastSuccessAt: latestSuccess ? stamp(latestSuccess) : null,
    lastErrorCategory: failed ? latest.error_category : null,
  };
}

// ---- Run Now contract ----------------------------------------------------------------------------------------------

/**
 * Run Now readiness. AI-11A deliberately ships the CONTRACT, not the execution: JobQuest has no executor and the
 * provider owns execution, so creating a QUEUED run nobody will ever pick up would fabricate state.
 *
 * Future (AI-11F/G, once a provider adapter can accept work) the action is
 *   POST /api/ai/automations/:id/run-now  (CSRF, owner only, AI Hub kill switch)
 *   -> inserts ai_runs { workflow, provider, trigger_type: 'manual', status: 'QUEUED',
 *        external_run_id: 'manual:<automationId>:<clientKey>' }   (idempotent on the existing unique index)
 *   -> the adapter claims the run and finalizes it through the existing rpc_ai_finalize_run lifecycle.
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
