// AI-11G: browser-side model of provider scheduling (presentation only; the server derives every state).
//
// "Connected to JobQuest" and "scheduled execution ready" are DIFFERENT facts and never share a badge:
//   connection   - JobQuest has a credential for the provider that may submit results;
//   scheduling   - the provider's own scheduled task has claimed and finished occurrences (proven by use, never typed in).
// JobQuest cannot create a schedule inside a provider, so setup is a copyable instruction set.

export type SchedulerProviderId = 'claude' | 'chatgpt' | 'gemini';
export type ProviderCredentialState = 'none' | 'active' | 'expired' | 'revoked';
export type SchedulerReadiness = 'UNSUPPORTED' | 'NOT_CONNECTED' | 'SETUP_REQUIRED' | 'UNVERIFIED' | 'READY';

/** GET /api/ai/automations/scheduler-status -> providers[] (apps/api/src/lib/aiContract/providerAdapters.ts). */
export interface ProviderSchedulerStatus {
  provider: SchedulerProviderId;
  label: string;
  connection: 'connected' | 'not_connected';
  canIngest: boolean;
  /** AI-11H: why the provider is not connected (additive; older servers omit it). */
  credential?: ProviderCredentialState;
  scheduler: SchedulerReadiness;
  scheduledJobQuestAccess: 'UNVERIFIED' | 'VERIFIED_BY_USE';
  scheduleAvailable: boolean;
  gmailAvailable: boolean;
  webSearchAvailable: boolean;
  executionClaimSupported: boolean;
  lastClaimAt: string | null;
  lastCompletedAt: string | null;
  limitations: string[];
}

/** GET /api/ai/automations/:id/setup. */
export interface AutomationSetup {
  automationId: string;
  automationName: string;
  provider: SchedulerProviderId;
  providerLabel: string;
  scheduleSummary: string;
  planSteps: Array<{ order: number; title: string }>;
  providerSteps: string[];
  scheduledInstructions: string;
  manualRunInstructions: string;
  /** AI-11H: idempotency key embedded in manualRunInstructions. */
  manualRunKey: string;
  validationSteps: string[];
  limitations: string[];
}
export interface AutomationSetupView { setup: AutomationSetup; status: ProviderSchedulerStatus }

export const SCHEDULER_LABELS: Record<SchedulerReadiness, string> = {
  UNSUPPORTED: 'Not applicable',
  NOT_CONNECTED: 'Connect the provider first',
  SETUP_REQUIRED: 'Needs setup',
  UNVERIFIED: 'Needs validation',
  READY: 'Ready',
};
export const SCHEDULER_HELP: Record<SchedulerReadiness, string> = {
  UNSUPPORTED: 'Choose Claude, ChatGPT or Gemini to run this automation on a schedule.',
  NOT_CONNECTED: 'The provider needs a JobQuest connection that is allowed to save AI findings (Settings → Providers).',
  SETUP_REQUIRED: 'Connected, but the provider’s own schedule has not run yet. Create it with the copied instructions.',
  UNVERIFIED: 'A scheduled run has started but none has finished successfully yet. Follow the validation steps.',
  READY: 'A scheduled run by this provider claimed an occurrence and finished. JobQuest still cannot start runs itself.',
};
export const SCHEDULER_VARIANT: Record<SchedulerReadiness, 'success' | 'warning' | 'info' | 'muted'> = {
  UNSUPPORTED: 'muted', NOT_CONNECTED: 'warning', SETUP_REQUIRED: 'info', UNVERIFIED: 'warning', READY: 'success',
};

/** The two Providers-page facts, kept separate. */
export function connectionLabel(s: Pick<ProviderSchedulerStatus, 'connection' | 'canIngest' | 'credential'>): string {
  if (s.connection !== 'connected') {
    if (s.credential === 'expired') return 'Not connected (credential expired)';
    if (s.credential === 'revoked') return 'Not connected (credential revoked)';
    return 'Not connected';
  }
  return s.canIngest ? 'Connected' : 'Connected, read-only (cannot save results)';
}

/**
 * AI-11H: the one readiness presentation. Distinguishes not connected / credential expired or revoked / setup required / unverified /
 * ready, and says so when an automation depends on a provider that cannot currently serve it. Derived from the server status only;
 * nothing here is a typed-in or hard-coded result for any provider.
 */
export interface SchedulerView { key: string; label: string; help: string; variant: 'success' | 'warning' | 'info' | 'muted' | 'danger' }
export function schedulerView(s: Pick<ProviderSchedulerStatus, 'scheduler' | 'credential' | 'connection' | 'canIngest' | 'label'>, opts: { hasAutomation?: boolean } = {}): SchedulerView {
  if (s.scheduler === 'NOT_CONNECTED') {
    const dep = opts.hasAutomation ? ` An automation uses ${s.label}, so its provider runs will be refused until this is fixed.` : '';
    if (s.credential === 'expired') return { key: 'EXPIRED', label: 'Credential expired', help: `The ${s.label} credential has expired or its authorization ended. Create or authorize a new one under Providers.${dep}`, variant: 'danger' };
    if (s.credential === 'revoked') return { key: 'REVOKED', label: 'Credential revoked', help: `The ${s.label} credential was revoked. Create or authorize a new one under Providers.${dep}`, variant: 'danger' };
    if (s.connection === 'connected' && !s.canIngest) return { key: 'READ_ONLY', label: SCHEDULER_LABELS.NOT_CONNECTED, help: 'Connected read-only. Reconnect with permission to save AI findings.' + dep, variant: 'warning' };
    return { key: 'NOT_CONNECTED', label: SCHEDULER_LABELS.NOT_CONNECTED, help: SCHEDULER_HELP.NOT_CONNECTED + dep, variant: SCHEDULER_VARIANT.NOT_CONNECTED };
  }
  return { key: s.scheduler, label: SCHEDULER_LABELS[s.scheduler], help: SCHEDULER_HELP[s.scheduler], variant: SCHEDULER_VARIANT[s.scheduler] };
}

export const isSchedulerProvider = (p: string): p is SchedulerProviderId => p === 'claude' || p === 'chatgpt' || p === 'gemini';

export function statusFor(list: readonly ProviderSchedulerStatus[] | null | undefined, provider: string): ProviderSchedulerStatus | null {
  return list?.find((s) => s.provider === provider) ?? null;
}

/** The setup action for an automation, or null when its provider has no scheduler adapter. */
export function setupActionLabel(provider: string): string | null {
  return isSchedulerProvider(provider) ? `Set up in ${provider === 'chatgpt' ? 'ChatGPT' : provider === 'claude' ? 'Claude' : 'Gemini'}` : null;
}

export const RUN_IN_PROVIDER_HELP =
  'JobQuest can’t start a provider run itself. “Run in provider” copies instructions you paste into the provider to run this automation once, now.';

// ---- AI-11H: scheduling clarity (presentation only; the server owns every occurrence calculation) -------------------------------

/** The catch-up window the server applies (AUTOMATION_CATCHUP_GRACE_MS = 3 h; mirrored for copy, drift-tested). */
export const CATCHUP_GRACE_HOURS = 3;

export interface ScheduleTimingInput {
  enabled: boolean;
  cadence: string;
  timezone: string | null;
  nextExpectedRunAt: string | null;
}

/**
 * Plain statements about WHEN and WHY, shown beside the copyable instructions. Order: what you set, what happens next, what a
 * missed run does, what disabled means, what an attended run is. `format` renders an instant in the automation's own zone.
 */
export function scheduleTimingNotes(a: ScheduleTimingInput, format: (iso: string | null, zone: string | null) => string): string[] {
  const notes: string[] = [];
  if (a.cadence === 'manual_only') {
    notes.push('This automation has no schedule: it only runs when you start it from the provider with the run-once instructions.');
  } else {
    notes.push(`Times are in ${a.timezone ?? 'the automation’s time zone'}, the zone you chose for this automation, not your browser’s.`);
    if (!a.enabled) notes.push('Disabled: JobQuest answers any provider claim with DISABLED and creates nothing, so a provider schedule that is still running does no work. Enable it to resume.');
    else if (a.nextExpectedRunAt) notes.push(`Next expected occurrence: ${format(a.nextExpectedRunAt, a.timezone)}. Set the provider schedule to that time, or a few minutes later, never earlier.`);
    notes.push(`If the provider misses an occurrence, a later claim within ${CATCHUP_GRACE_HOURS} hours still runs it (catch-up). After that the occurrence is skipped; only the latest eligible occurrence is ever run, and editing the schedule never replays older ones.`);
  }
  notes.push('A scheduled run is started by the provider’s own schedule. “Run in provider” is an attended Manual run that you paste into a chat; it never replaces or moves the next scheduled occurrence.');
  return notes;
}
