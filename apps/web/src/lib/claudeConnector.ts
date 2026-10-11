// AI-4: pure helpers for the Claude connector setup UX. No React, no network, no
// storage. Claude is "attended connector capable": it reaches JobQuest's /api/mcp
// from Anthropic's cloud using a fixed `Authorization: Bearer` header carrying a
// JobQuest connector token (AI-3). JobQuest never stores Claude credentials and
// there is no live connection state; token metadata is the only evidence.

export const CLAUDE_CONNECTOR_NAME = 'Claude connector';
export const CLAUDE_AUTH_HEADER_NAME = 'Authorization';
export const CLAUDE_EXPIRY_CHOICES = [7, 30, 90] as const;
export type ClaudeExpiryDays = (typeof CLAUDE_EXPIRY_CHOICES)[number];
export const CLAUDE_DEFAULT_EXPIRY_DAYS: ClaudeExpiryDays = 30;

export type ClaudePresetId = 'read' | 'read_ingest';
export interface ClaudePreset { id: ClaudePresetId; label: string; description: string; scopes: readonly string[] }

/** Only scopes the AI-3 server accepts; there is deliberately no write/admin/wildcard preset. */
export const CLAUDE_PRESETS: readonly ClaudePreset[] = [
  {
    id: 'read',
    label: 'Read only',
    description: 'Claude can read your applications and AI Hub history. Recommended.',
    scopes: ['jobquest:read', 'ai:read'],
  },
  {
    id: 'read_ingest',
    label: 'Read + AI findings',
    description: 'Also lets Claude save structured AI findings. It cannot change applications, tasks or contacts.',
    scopes: ['jobquest:read', 'ai:read', 'ai:ingest'],
  },
];
export const CLAUDE_DEFAULT_PRESET: ClaudePresetId = 'read';

export const presetScopes = (id: ClaudePresetId): string[] => [...(CLAUDE_PRESETS.find((p) => p.id === id) ?? CLAUDE_PRESETS[0]!).scopes];

const SCOPE_LABELS: Record<string, string> = {
  'jobquest:read': 'Read applications',
  'ai:read': 'Read AI history',
  'ai:ingest': 'Save AI findings',
};
export const scopeLabel = (scope: string): string => SCOPE_LABELS[scope] ?? scope;

/** `<current app origin>/api/mcp` — never a hard-coded host. */
export function buildMcpUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/api/mcp`;
}

/** The fixed request-header value Claude must send. Only ever built from a just-created token held in component state. */
export const bearerHeaderValue = (token: string): string => `Bearer ${token}`;

export interface ConnectorTokenMetadata {
  id: string;
  workspace_id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
}

/** Name is a UI convention only (metadata); security never depends on it. */
export const isClaudeConnectorToken = (t: Pick<ConnectorTokenMetadata, 'name'>): boolean => t.name.toLowerCase().startsWith('claude');

/** Re-derive status client-side so a token that expired while the page was open is never shown as active. */
export function effectiveStatus(t: Pick<ConnectorTokenMetadata, 'status' | 'revoked_at' | 'expires_at'>, now = Date.now()): ConnectorTokenMetadata['status'] {
  if (t.revoked_at || t.status === 'REVOKED') return 'REVOKED';
  if (t.status === 'EXPIRED' || new Date(t.expires_at).getTime() <= now) return 'EXPIRED';
  return 'ACTIVE';
}

export type ClaudeProviderState = 'NOT_CONFIGURED' | 'CONNECTOR_READY';

export interface ClaudeProviderSummary {
  state: ClaudeProviderState;
  /** Label for the provider card. Never "Connected": a token existing is not evidence of a session. */
  label: 'Not configured' | 'Connector ready';
  active: ConnectorTokenMetadata[];
  previous: ConnectorTokenMetadata[];
}

export function summarizeClaudeConnectors(tokens: readonly ConnectorTokenMetadata[], now = Date.now()): ClaudeProviderSummary {
  const mine = tokens.filter(isClaudeConnectorToken);
  const active = mine.filter((t) => effectiveStatus(t, now) === 'ACTIVE');
  const previous = mine.filter((t) => effectiveStatus(t, now) !== 'ACTIVE');
  return {
    state: active.length > 0 ? 'CONNECTOR_READY' : 'NOT_CONFIGURED',
    label: active.length > 0 ? 'Connector ready' : 'Not configured',
    active,
    previous,
  };
}

/** Evidence of use, not of a live session. */
export function lastUsedLabel(value: string | null, format: (iso: string) => string): string {
  return value ? `Last used ${format(value)}` : 'Not used yet';
}

export const CLAUDE_SETUP_STEPS: readonly string[] = [
  'In Claude, open Customize → Connectors.',
  'Choose Add custom connector and name it “JobQuest”.',
  'Enter the JobQuest remote MCP URL shown here.',
  'Choose fixed request-header authentication.',
  'Add the header name Authorization with the value Bearer followed by your connector token.',
  'Finish connecting, then enable the JobQuest connector for the conversation.',
];

export const CLAUDE_SECURITY_NOTES: readonly string[] = [
  'This connector can only use the permissions you selected above.',
  'Treat the token like a password. If it is exposed, revoke it here.',
  'Claude only receives data your own JobQuest permissions allow.',
  'Never paste your JobQuest password, a Supabase key or any signing key into Claude.',
];
