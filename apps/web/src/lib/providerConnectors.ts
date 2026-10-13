// AI-9: provider-neutral connector setup model for Settings -> AI & Automation -> Providers. Claude (AI-4), Gemini and
// ChatGPT all use the SAME scoped connector-token infrastructure (`ai_connector_tokens`, /api/ai/connector-tokens); a
// provider is only a naming/copy convention here. Pure: no React, no network, no storage. JobQuest stores no provider
// credential and has no live connection state - token metadata is the only evidence, and a token existing is never
// shown as "Connected".

import {
  CLAUDE_AUTH_HEADER_NAME, CLAUDE_CONNECTOR_NAME, CLAUDE_PRESETS, CLAUDE_SECURITY_NOTES, CLAUDE_SETUP_STEPS,
  effectiveStatus, type ClaudePreset, type ClaudePresetId, type ConnectorTokenMetadata,
} from './claudeConnector';

export type ConnectorProviderId = 'claude' | 'gemini' | 'chatgpt';
export type CapabilityStatus = 'VERIFIED' | 'DOCUMENTED' | 'APPROVAL-GATED' | 'PLAN-GATED' | 'NOT SUPPORTED' | 'NOT TESTED';

export interface CapabilityNote { label: string; status: CapabilityStatus; text: string }

export interface ProviderConnectorConfig {
  id: ConnectorProviderId;
  /** Display name ("Claude", "Gemini", "ChatGPT"). */
  name: string;
  /** Token name; the UI recognises a provider's credentials by this prefix (a convention only - security never depends on it). */
  connectorName: string;
  testId: string;
  setupButton: string;
  setupTitle: string;
  setupDescription: string;
  createButton: string;
  presets: readonly ClaudePreset[];
  presetGrantNote: (scopes: string) => string;
  intro: string;
  /** State labels. Never "Connected". */
  notConfiguredLabel: string;
  readyLabel: string;
  /** When true, a provider with only expired/revoked credentials shows that fact instead of "Not configured". */
  showLapsedState: boolean;
  activeListLabel: string;
  addAnotherButton: string;
  revealTitle: string;
  revealDescription: string;
  inProviderHeading: string;
  setupSteps: readonly string[];
  securityNotes: readonly string[];
  revokeDescription: string;
  authHeaderName: string;
  /** Truthful capability notes shown on the card (configured is NOT the same as automation-capable). */
  capabilities: readonly CapabilityNote[];
}

const GENERIC_SECURITY: readonly string[] = [
  'This credential can only use the permissions you selected above.',
  'Treat the token like a password. If it is exposed, revoke it here.',
  'It only returns data your own JobQuest permissions allow, and it can never change your applications, tasks or contacts.',
  'Never paste your JobQuest password, a Supabase key or any signing key into a provider.',
];

const presetsFor = (name: string): readonly ClaudePreset[] => [
  { id: 'read', label: 'Read only', description: `${name} can read your applications and AI Hub history. Recommended.`, scopes: ['jobquest:read', 'ai:read'] },
  { id: 'read_ingest', label: 'Read + AI findings', description: `Also lets ${name} save structured AI findings. It cannot change applications, tasks or contacts.`, scopes: ['jobquest:read', 'ai:read', 'ai:ingest'] },
];

/** Capability notes are the card-level view of PROVIDER_CAPABILITY_MATRIX.md; update both together after a provider gate. */
export const GEMINI_CAPABILITIES: readonly CapabilityNote[] = [
  { label: 'Custom app', status: 'NOT TESTED', text: 'Needs a personal US English account; the app is added in the Gemini web app.' },
  { label: 'Scheduled read', status: 'NOT TESTED', text: 'Not yet validated in a real Scheduled Action.' },
  { label: 'Scheduled save to JobQuest', status: 'APPROVAL-GATED', text: 'Google requires manual confirmation for custom-app writes.' },
];
export const CHATGPT_CAPABILITIES: readonly CapabilityNote[] = [
  { label: 'Direct MCP connector', status: 'PLAN-GATED', text: 'Not available on ChatGPT Plus (full MCP is a Business / Enterprise / Edu feature).' },
  { label: 'JobQuest plugin', status: 'NOT TESTED', text: 'Plugin setup required; whether your plan accepts a bearer credential is validated by you.' },
  { label: 'Scheduled save to JobQuest', status: 'NOT TESTED', text: 'Writes may pause for your approval.' },
];

export const CLAUDE_PROVIDER: ProviderConnectorConfig = {
  id: 'claude',
  name: 'Claude',
  connectorName: CLAUDE_CONNECTOR_NAME,
  testId: 'claude-connector',
  setupButton: 'Set up Claude',
  setupTitle: 'Set up Claude',
  setupDescription: 'Create a dedicated connector credential for Claude. It is shown only once.',
  createButton: 'Create credential',
  presets: CLAUDE_PRESETS,
  presetGrantNote: (scopes) => `Grants: ${scopes}. Claude can never change your applications.`,
  intro: 'Attended connector: Claude reads JobQuest only when you ask it to. Nothing runs automatically, and JobQuest stores no Claude credentials.',
  notConfiguredLabel: 'Not configured',
  readyLabel: 'Connector ready',
  showLapsedState: false,
  activeListLabel: 'Active Claude credentials',
  addAnotherButton: 'Add another credential',
  revealTitle: 'Add JobQuest to Claude',
  revealDescription: 'Copy these now. The token is shown only once; if you lose it, revoke it and create a new one.',
  inProviderHeading: 'In Claude',
  setupSteps: CLAUDE_SETUP_STEPS,
  securityNotes: CLAUDE_SECURITY_NOTES,
  revokeDescription: 'Claude loses access to JobQuest immediately. Findings it already saved are kept.',
  authHeaderName: CLAUDE_AUTH_HEADER_NAME,
  capabilities: [],
};

export const GEMINI_PROVIDER: ProviderConnectorConfig = {
  id: 'gemini',
  name: 'Gemini',
  connectorName: 'Gemini connector',
  testId: 'gemini-connector',
  setupButton: 'Set up Gemini',
  setupTitle: 'Set up Gemini',
  setupDescription: 'Create a dedicated connector credential for a Gemini custom app. It is shown only once.',
  createButton: 'Create credential',
  presets: presetsFor('Gemini'),
  presetGrantNote: (scopes) => `Grants: ${scopes}. Gemini can never change your applications.`,
  intro: 'Gemini custom app: Gemini reads JobQuest only when you or your Scheduled Action ask it to. JobQuest stores no Gemini credentials, and Google asks you to confirm custom-app writes.',
  notConfiguredLabel: 'Not configured',
  readyLabel: 'Connector credential ready',
  showLapsedState: true,
  activeListLabel: 'Active Gemini credentials',
  addAnotherButton: 'Add another credential',
  revealTitle: 'Add JobQuest to Gemini',
  revealDescription: 'Copy these now. The token is shown only once; if you lose it, revoke it and create a new one.',
  inProviderHeading: 'In Gemini',
  setupSteps: [
    'Open gemini.google.com (the web app) and choose Settings, then Connected Apps (open Personal Intelligence first if you do not see it).',
    'Under Custom apps, choose Add a custom app and enter the JobQuest remote MCP URL shown here, then Next.',
    'Follow Gemini’s on-screen instructions. If Gemini says the server does not support Dynamic Client Registration, open Show more under Advanced features and enter the credential it asks for.',
    'Use the value Authorization: Bearer followed by your token only where Gemini asks for a bearer token, API key or header. If Gemini only accepts OAuth client credentials, stop and report it.',
    'Type @ in a chat and choose JobQuest. Gemini will ask you to confirm any write.',
  ],
  securityNotes: GENERIC_SECURITY,
  revokeDescription: 'Gemini loses access to JobQuest immediately. Findings it already saved are kept.',
  authHeaderName: 'Authorization',
  capabilities: GEMINI_CAPABILITIES,
};

export const CHATGPT_PROVIDER: ProviderConnectorConfig = {
  id: 'chatgpt',
  name: 'ChatGPT',
  connectorName: 'ChatGPT plugin',
  testId: 'chatgpt-connector',
  setupButton: 'Create plugin credential',
  setupTitle: 'Create a ChatGPT plugin credential',
  setupDescription: 'ChatGPT Plus has no direct MCP connector. Create this credential only if your ChatGPT plugin accepts a bearer or API-key credential. It is shown only once.',
  createButton: 'Create credential',
  presets: presetsFor('ChatGPT'),
  presetGrantNote: (scopes) => `Grants: ${scopes}. ChatGPT can never change your applications.`,
  intro: 'Plugin setup required. ChatGPT Plus does not support a direct Claude-style MCP connector (Business / Enterprise / Edu only); the supported route is a private ChatGPT plugin you create yourself. JobQuest stores no ChatGPT credentials, and writes may pause for your approval.',
  notConfiguredLabel: 'Plugin setup required',
  readyLabel: 'Plugin credential ready',
  showLapsedState: true,
  activeListLabel: 'Active ChatGPT plugin credentials',
  addAnotherButton: 'Add another credential',
  revealTitle: 'Add JobQuest to a ChatGPT plugin',
  revealDescription: 'Copy these now. The token is shown only once; if you lose it, revoke it and create a new one.',
  inProviderHeading: 'In ChatGPT',
  setupSteps: [
    'In ChatGPT open Plugins and check whether your account offers Add custom MCP server (or Plugin Creator).',
    'Enter the JobQuest remote MCP URL shown here and note which authentication options ChatGPT offers.',
    'Only if ChatGPT offers a bearer / API-key option: paste the token into ChatGPT’s own credential field and create the plugin. If it offers only OAuth, stop and report it.',
    'Test in a regular chat first, then in Work. ChatGPT may pause for your approval before a plugin write.',
  ],
  securityNotes: GENERIC_SECURITY,
  revokeDescription: 'The ChatGPT plugin loses access to JobQuest immediately. Findings it already saved are kept.',
  authHeaderName: 'Authorization',
  capabilities: CHATGPT_CAPABILITIES,
};

export const PROVIDER_CONNECTORS: Record<ConnectorProviderId, ProviderConnectorConfig> = {
  claude: CLAUDE_PROVIDER, gemini: GEMINI_PROVIDER, chatgpt: CHATGPT_PROVIDER,
};

export const presetScopesFor = (config: ProviderConnectorConfig, id: ClaudePresetId): string[] =>
  [...(config.presets.find((p) => p.id === id) ?? config.presets[0]!).scopes];

/** Recognise a provider's credentials by name prefix. A UI convention only: another provider's token is never matched. */
export const isProviderToken = (config: ProviderConnectorConfig, t: Pick<ConnectorTokenMetadata, 'name'>): boolean =>
  t.name.toLowerCase().startsWith(config.id);

export type ProviderState = 'NOT_CONFIGURED' | 'CONNECTOR_READY' | 'EXPIRED' | 'REVOKED';

export interface ProviderSummary {
  state: ProviderState;
  /** Never "Connected": a credential existing is not evidence of a session. */
  label: string;
  active: ConnectorTokenMetadata[];
  previous: ConnectorTokenMetadata[];
  /** Most recent observed use across this provider's credentials (evidence of use, not of a live session). */
  lastUsedAt: string | null;
}

export function summarizeProvider(config: ProviderConnectorConfig, tokens: readonly ConnectorTokenMetadata[], now = Date.now()): ProviderSummary {
  const mine = tokens.filter((t) => isProviderToken(config, t));
  const active = mine.filter((t) => effectiveStatus(t, now) === 'ACTIVE');
  const previous = mine.filter((t) => effectiveStatus(t, now) !== 'ACTIVE');
  const used = mine.map((t) => t.last_used_at).filter((v): v is string => Boolean(v)).sort();
  const lastUsedAt = used.length ? used[used.length - 1]! : null;
  if (active.length > 0) return { state: 'CONNECTOR_READY', label: config.readyLabel, active, previous, lastUsedAt };
  if (config.showLapsedState && previous.length > 0) {
    // The newest credential decides what to say: a revoked one is not "expired" and vice versa.
    const newest = [...previous].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]!;
    const revoked = effectiveStatus(newest, now) === 'REVOKED';
    return { state: revoked ? 'REVOKED' : 'EXPIRED', label: revoked ? 'Credential revoked' : 'Credential expired', active, previous, lastUsedAt };
  }
  return { state: 'NOT_CONFIGURED', label: config.notConfiguredLabel, active, previous, lastUsedAt };
}
