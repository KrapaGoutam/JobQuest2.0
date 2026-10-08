// Browser-safe AI Hub read types (AI-1D). Mirrors the DB CHECK enums and the
// AI-1C constants (apps/api/src/lib/aiContract/constants.ts) without importing
// any server-side validation/hashing code. tests/unit/ai-hub-ui.test.ts fails if
// these lists drift from the server constants.

export const AI_RUN_STATUS_VALUES = [
  'QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'AWAITING_APPROVAL', 'CANCELLED',
] as const;
export type AiRunStatus = (typeof AI_RUN_STATUS_VALUES)[number];

export const AI_PRIORITY_VALUES = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW', 'INFO'] as const;
export type AiPriority = (typeof AI_PRIORITY_VALUES)[number];

export interface AiRunRow {
  id: string;
  provider: string;
  workflow: string;
  status: AiRunStatus;
  trigger_type: string;
  created_at: string;
  completed_at: string | null;
}

export interface AiFindingRow {
  id: string;
  kind: string;
  provider: string;
  status: string;
  priority: AiPriority;
  title: string;
  summary: string | null;
  evidence: string | null; // plain text only, <= 500 chars
  created_at: string;
}

export interface AiHubSnapshot {
  runs: AiRunRow[];
  findings: AiFindingRow[];
  pendingSuggestions: number;
}

export const AI_RUN_STATUS_LABELS: Record<AiRunStatus, string> = {
  QUEUED: 'Queued',
  RUNNING: 'Running',
  SUCCEEDED: 'Succeeded',
  PARTIAL: 'Partial',
  FAILED: 'Failed',
  AWAITING_APPROVAL: 'Awaiting approval',
  CANCELLED: 'Cancelled',
};

export function aiRunStatusLabel(status: string): string {
  return (AI_RUN_STATUS_LABELS as Record<string, string>)[status] ?? 'Unknown';
}

export function aiRunStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'muted' {
  if (status === 'SUCCEEDED') return 'success';
  if (status === 'PARTIAL' || status === 'AWAITING_APPROVAL') return 'warning';
  if (status === 'FAILED') return 'danger';
  if (status === 'RUNNING' || status === 'QUEUED') return 'info';
  return 'muted';
}

export function aiWorkflowLabel(workflow: string): string {
  return workflow.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function isAiHubEmpty(s: AiHubSnapshot): boolean {
  return s.runs.length === 0 && s.findings.length === 0 && s.pendingSuggestions === 0;
}

export type AiHubTab = 'overview' | 'history';

export function aiHubTabFromPath(path: string): AiHubTab {
  return path === '/ai-hub/history' ? 'history' : 'overview';
}

export function aiHubPathForTab(tab: AiHubTab): string {
  return tab === 'history' ? '/ai-hub/history' : '/ai-hub';
}
