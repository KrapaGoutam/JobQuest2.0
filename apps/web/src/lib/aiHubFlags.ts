// AI Hub feature gating (AI-1F1). The single place precedence is decided.
//
//   1. Environment kill switch (server-side AI_HUB_ENABLED) OFF -> SYSTEM_DISABLED
//   2. Frontend build flag (VITE_AI_HUB_ENABLED) OFF            -> FRONTEND_DISABLED
//   3. Both ON                                                  -> AVAILABLE
//      (workspace workflow config then decides what may run; it can never
//       override 1 or 2.)
//
// Default-safe: anything other than the literal string 'true' (case-insensitive,
// trimmed) is OFF, so a missing or malformed value never exposes the AI Hub.
// The browser cannot read the server kill switch, so it is only passed in when a
// caller actually knows it (e.g. a future server status endpoint); `undefined`
// means "unknown" and does not block.

export type AiHubAvailability = 'AVAILABLE' | 'SYSTEM_DISABLED' | 'FRONTEND_DISABLED';

export function parseAiFlag(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

export function resolveAiHubAvailability(input: {
  envKillSwitch?: unknown;
  frontendFlag?: unknown;
}): AiHubAvailability {
  if (input.envKillSwitch !== undefined && !parseAiFlag(input.envKillSwitch)) return 'SYSTEM_DISABLED';
  if (!parseAiFlag(input.frontendFlag)) return 'FRONTEND_DISABLED';
  return 'AVAILABLE';
}

export function isAiHubExposed(frontendFlag: unknown = import.meta.env.VITE_AI_HUB_ENABLED): boolean {
  return resolveAiHubAvailability({ frontendFlag }) === 'AVAILABLE';
}

/** Paths owned by the AI Hub surface (views + AI settings). */
export function isAiHubPath(path: string): boolean {
  return path === '/ai-hub' || path.startsWith('/ai-hub/') || path === '/settings/ai';
}

/** AI write actions stay OFF throughout AI-1; controlled actions belong to AI-11. */
export const AI_WRITE_ACTIONS_ENABLED = false as const;

export const AI_WORKFLOW_LABELS: Record<string, string> = {
  daily_brief: 'Morning brief',
  email_triage: 'Email triage',
  job_discovery: 'Job discovery',
  recruiter_intel: 'Recruiter research',
  calendar_review: 'Calendar review',
};

export const AI_PROVIDER_LABELS = [
  { id: 'claude', label: 'Claude' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'chatgpt', label: 'ChatGPT' },
] as const;

/** No provider connection exists in AI-1, so no workflow can run or be enabled. */
export function workflowStatus(storedEnabled: boolean | undefined): string {
  return storedEnabled
    ? 'Stored as enabled, but cannot run until provider setup'
    : 'Unavailable until provider setup';
}
