// AI-11G: browser-side model of provider scheduling (presentation only; the server derives every state).
//
// "Connected to JobQuest" and "scheduled execution ready" are DIFFERENT facts and never share a badge:
//   connection   - JobQuest has a credential for the provider that may submit results;
//   scheduling   - the provider's own scheduled task has claimed and finished occurrences (proven by use, never typed in).
// JobQuest cannot create a schedule inside a provider, so setup is a copyable instruction set.

export type SchedulerProviderId = 'claude' | 'chatgpt' | 'gemini';
export type SchedulerReadiness = 'UNSUPPORTED' | 'NOT_CONNECTED' | 'SETUP_REQUIRED' | 'UNVERIFIED' | 'READY';

/** GET /api/ai/automations/scheduler-status -> providers[] (apps/api/src/lib/aiContract/providerAdapters.ts). */
export interface ProviderSchedulerStatus {
  provider: SchedulerProviderId;
  label: string;
  connection: 'connected' | 'not_connected';
  canIngest: boolean;
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
export function connectionLabel(s: Pick<ProviderSchedulerStatus, 'connection' | 'canIngest'>): string {
  if (s.connection !== 'connected') return 'Not connected';
  return s.canIngest ? 'Connected' : 'Connected, read-only (cannot save results)';
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
