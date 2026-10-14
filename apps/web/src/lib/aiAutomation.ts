// AI-11A: browser-side automation helpers. Browser-safe mirror of apps/api/src/lib/aiContract/automation.ts
// (tests/unit/ai-11a-automation-ui.test.ts fails on drift). The server is the validation authority: this file only
// pre-checks required fields so the form can point at a field before the round trip.
//
// An automation is provider-neutral: WHICH workflow, WHICH provider, WHEN (bounded cadence + IANA zone), which
// sections and delivery preferences. Operational state is derived by the server from ai_runs; nothing here stores it.

export const AUTOMATION_CADENCES = ['daily', 'weekdays', 'selected_days', 'weekly', 'manual_only'] as const;
export const AUTOMATION_PROVIDERS = ['claude', 'chatgpt', 'gemini', 'manual'] as const;
export const AUTOMATION_SECTIONS = ['email_triage', 'job_discovery', 'recruiter_intel', 'calendar_review', 'followups', 'goal_summary'] as const;
export const AUTOMATION_DELIVERY = ['ai_hub', 'email_summary'] as const;
export const AUTOMATION_WORKFLOWS = ['daily_brief', 'email_triage', 'job_discovery', 'recruiter_intel', 'calendar_review', 'other'] as const;
export const AUTOMATION_COMPOSITE_WORKFLOWS = ['daily_brief', 'other'] as const;
export const AUTOMATION_NAME_MAX = 80;
export const AUTOMATION_LIMIT = 10;

export type AutomationCadence = (typeof AUTOMATION_CADENCES)[number];
export type AutomationProvider = (typeof AUTOMATION_PROVIDERS)[number];
export type AutomationSection = (typeof AUTOMATION_SECTIONS)[number];
export type AutomationDelivery = (typeof AUTOMATION_DELIVERY)[number];
export type AutomationWorkflow = (typeof AUTOMATION_WORKFLOWS)[number];

export const CADENCE_LABELS: Record<AutomationCadence, string> = {
  daily: 'Every day', weekdays: 'Weekdays (Mon–Fri)', selected_days: 'Selected days', weekly: 'Weekly', manual_only: 'Manual only (no schedule)',
};
export const PROVIDER_LABELS: Record<AutomationProvider, string> = { claude: 'Claude', chatgpt: 'ChatGPT', gemini: 'Gemini', manual: 'Manual' };
export const WORKFLOW_LABELS: Record<AutomationWorkflow, string> = {
  daily_brief: 'Daily Digest', email_triage: 'Email triage', job_discovery: 'Job discovery', recruiter_intel: 'Recruiter intelligence',
  calendar_review: 'Calendar review', other: 'Custom review',
};
export const SECTION_LABELS: Record<AutomationSection, string> = {
  email_triage: 'Email triage', job_discovery: 'Job discovery', recruiter_intel: 'Recruiter intelligence', calendar_review: 'Calendar review',
  followups: 'Follow-ups', goal_summary: 'Goal summary',
};
export const DELIVERY_LABELS: Record<AutomationDelivery, string> = { ai_hub: 'AI Hub', email_summary: 'Email summary' };
/** ISO weekdays: 1 = Monday .. 7 = Sunday. */
export const WEEKDAY_LABELS: ReadonlyArray<{ value: number; short: string; long: string }> = [
  { value: 1, short: 'Mon', long: 'Monday' }, { value: 2, short: 'Tue', long: 'Tuesday' }, { value: 3, short: 'Wed', long: 'Wednesday' },
  { value: 4, short: 'Thu', long: 'Thursday' }, { value: 5, short: 'Fri', long: 'Friday' }, { value: 6, short: 'Sat', long: 'Saturday' },
  { value: 7, short: 'Sun', long: 'Sunday' },
];
export const RUN_NOW_REASON_LABELS: Record<string, string> = {
  AI_HUB_DISABLED: 'The AI Hub is turned off.',
  AUTOMATION_DISABLED: 'Enable this automation first.',
  NO_EXECUTOR: 'Run Now isn’t available yet: no provider scheduler is connected, so JobQuest can’t start a provider run. Create the schedule in your provider; results arrive as AI findings.',
};
/** Provider-neutral executor readiness (derived by the server). */
export const EXECUTOR_LABELS: Record<string, string> = {
  configured: 'Connected', not_configured: 'Not connected yet', unavailable: 'Unavailable',
};
export const TRIGGER_LABELS: Record<string, string> = { scheduled: 'Scheduled', manual: 'Manual', retry: 'Retry' };
export const RUN_STATUS_LABELS: Record<string, string> = {
  QUEUED: 'Queued', RUNNING: 'Running', SUCCEEDED: 'Succeeded', PARTIAL: 'Partial', FAILED: 'Failed', AWAITING_APPROVAL: 'Awaiting approval', CANCELLED: 'Cancelled',
};

/** One recent run of an automation (GET /api/ai/automations/:id/runs). */
export interface AutomationRunView {
  id: string; status: string; trigger: string; scheduledFor: string | null; startedAt: string | null; completedAt: string | null;
  createdAt: string; errorCategory: string | null;
}

/** Shape returned by GET /api/ai/automations (see apps/api/src/services/aiAutomationService.ts). */
export interface AutomationView {
  id: string;
  name: string;
  workflow: AutomationWorkflow;
  enabled: boolean;
  provider: AutomationProvider;
  cadence: AutomationCadence;
  localTime: string | null;
  timezone: string | null;
  weekdays: number[];
  sections: AutomationSection[];
  delivery: AutomationDelivery[];
  createdAt: string;
  updatedAt: string;
  state: {
    lastRunAt: string | null;
    lastStatus: string | null;
    lastTrigger?: string | null;
    lastSuccessAt: string | null;
    lastFailureAt?: string | null;
    lastErrorCategory: string | null;
    nextExpectedRunAt: string | null;
  };
  runNow: { ready: boolean; reason: string | null };
  executor?: 'configured' | 'not_configured' | 'unavailable';
}

export interface AutomationFormState {
  name: string;
  workflow: AutomationWorkflow;
  enabled: boolean;
  provider: AutomationProvider;
  cadence: AutomationCadence;
  localTime: string;
  timezone: string;
  weekdays: number[];
  sections: AutomationSection[];
  delivery: AutomationDelivery[];
}

export function emptyAutomationForm(timeZone: string): AutomationFormState {
  return {
    name: '', workflow: 'daily_brief', enabled: false, provider: 'claude', cadence: 'weekdays', localTime: '08:00', timezone: timeZone || 'UTC',
    weekdays: [], sections: [], delivery: ['ai_hub'],
  };
}

export function automationToForm(a: AutomationView, fallbackZone: string): AutomationFormState {
  return {
    name: a.name, workflow: a.workflow, enabled: a.enabled, provider: a.provider, cadence: a.cadence, localTime: a.localTime ?? '08:00',
    timezone: a.timezone ?? fallbackZone, weekdays: [...a.weekdays], sections: [...a.sections], delivery: [...a.delivery],
  };
}

/** The request body (minus workspace_id). Fields that do not apply to the cadence are normalized away. */
export function formToBody(f: AutomationFormState): Record<string, unknown> {
  const scheduled = f.cadence !== 'manual_only';
  const takesDays = f.cadence === 'weekly' || f.cadence === 'selected_days';
  const composite = (AUTOMATION_COMPOSITE_WORKFLOWS as readonly string[]).includes(f.workflow);
  return {
    name: f.name.trim(), workflow: f.workflow, enabled: f.enabled, provider: f.provider, cadence: f.cadence,
    localTime: scheduled ? f.localTime : null, timezone: scheduled ? f.timezone.trim() : null,
    weekdays: takesDays ? [...f.weekdays].sort((a, b) => a - b) : [],
    sections: composite ? f.sections : [], delivery: f.delivery.includes('ai_hub') ? f.delivery : ['ai_hub', ...f.delivery],
  };
}

export type AutomationFormErrors = Partial<Record<'name' | 'localTime' | 'timezone' | 'weekdays', string>>;

export function isTimeZoneName(zone: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return /^(UTC|[A-Za-z_]+(\/[A-Za-z0-9_+-]+){1,2})$/.test(zone); } catch { return false; }
}

/** Required-field pre-check; the server re-validates everything. */
export function validateAutomationForm(f: AutomationFormState): AutomationFormErrors {
  const e: AutomationFormErrors = {};
  const name = f.name.trim();
  if (!name) e.name = 'Enter a name.';
  else if (name.length > AUTOMATION_NAME_MAX) e.name = `Use ${AUTOMATION_NAME_MAX} characters or fewer.`;
  if (f.cadence !== 'manual_only') {
    if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(f.localTime)) e.localTime = 'Choose a time.';
    if (!isTimeZoneName(f.timezone.trim())) e.timezone = 'Enter a valid time zone, for example America/Chicago.';
    if (f.cadence === 'weekly' && f.weekdays.length !== 1) e.weekdays = 'Choose one day.';
    if (f.cadence === 'selected_days' && f.weekdays.length < 1) e.weekdays = 'Choose at least one day.';
  }
  return e;
}

// ---- presentation ---------------------------------------------------------------------------------------------

const hhmm = (t: string) => {
  const [h, m] = t.split(':').map(Number) as [number, number];
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const dayName = (d: number) => WEEKDAY_LABELS.find((w) => w.value === d)?.long ?? '';

/** Sections in the canonical vocabulary order (the form's order), whatever order storage returns them in. */
export const orderedSections = (list: readonly AutomationSection[]): AutomationSection[] => AUTOMATION_SECTIONS.filter((s) => list.includes(s));

/** "Weekdays at 8:00 AM · America/Chicago", "Sundays at 7:00 PM · …", "Manual only". */
export function describeSchedule(a: Pick<AutomationView, 'cadence' | 'localTime' | 'timezone' | 'weekdays'>): string {
  if (a.cadence === 'manual_only' || !a.localTime) return 'Manual only';
  const at = `${hhmm(a.localTime)}${a.timezone ? ` · ${a.timezone}` : ''}`;
  switch (a.cadence) {
    case 'daily': return `Every day at ${at}`;
    case 'weekdays': return `Weekdays at ${at}`;
    case 'weekly': return `${dayName(a.weekdays[0] ?? 0)}s at ${at}`;
    default: return `${[...a.weekdays].sort((x, y) => x - y).map((d) => WEEKDAY_LABELS.find((w) => w.value === d)?.short ?? '').join(', ')} at ${at}`;
  }
}

/** A run instant rendered in the AUTOMATION's own zone ("Tue, Oct 13, 8:00 AM CDT"), so what you set is what you read. */
export function formatInZone(iso: string | null | undefined, zone: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone ?? 'UTC', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(d);
  } catch { return d.toISOString(); }
}

export type AutomationHealth = { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'muted' };

/** One badge: disabled > failing > healthy > waiting. Derived from the server-computed state only. */
export function automationHealth(a: Pick<AutomationView, 'enabled' | 'cadence' | 'state'>): AutomationHealth {
  if (!a.enabled) return { label: 'Disabled', variant: 'muted' };
  if (a.state.lastStatus === 'FAILED') return { label: 'Last run failed', variant: 'danger' };
  if (a.state.lastStatus === 'PARTIAL') return { label: 'Last run partial', variant: 'warning' };
  if (a.state.lastStatus === 'SUCCEEDED') return { label: 'Healthy', variant: 'success' };
  if (a.state.lastRunAt) return { label: 'In progress', variant: 'info' };
  return { label: a.cadence === 'manual_only' ? 'Manual' : 'Waiting for first run', variant: 'info' };
}

/** The enabled, scheduled automation that is expected to run soonest (Overview "Next automation" card). */
export function nextAutomation(list: readonly AutomationView[]): AutomationView | null {
  let best: AutomationView | null = null;
  for (const a of list) {
    if (!a.enabled || !a.state.nextExpectedRunAt) continue;
    if (!best || a.state.nextExpectedRunAt < (best.state.nextExpectedRunAt ?? '')) best = a;
  }
  return best;
}

export interface AutomationOverview { total: number; enabled: number; failing: number; next: AutomationView | null }
export function summarizeAutomations(list: readonly AutomationView[]): AutomationOverview {
  return {
    total: list.length,
    enabled: list.filter((a) => a.enabled).length,
    failing: list.filter((a) => a.enabled && (a.state.lastStatus === 'FAILED' || a.state.lastStatus === 'PARTIAL')).length,
    next: nextAutomation(list),
  };
}
