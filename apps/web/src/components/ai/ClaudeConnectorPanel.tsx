import type { PublicSession } from '../../api';
import { CLAUDE_PROVIDER } from '../../lib/providerConnectors';
import { ProviderConnectorPanel, ProviderConnectorView, type ClaudeConnectorViewProps, type ClaudeLoad, type ClaudeRevealed } from './ProviderConnectorPanel';

// AI-4 entry points, kept so Claude's usage (and its tests) are unchanged. The implementation is the generic
// ProviderConnectorPanel (AI-9), shared with Gemini and ChatGPT.
export type { ClaudeConnectorViewProps, ClaudeLoad, ClaudeRevealed };

export function ClaudeConnectorView(props: ClaudeConnectorViewProps) {
  return <ProviderConnectorView {...props} provider={CLAUDE_PROVIDER} />;
}

export function ClaudeConnectorPanel({ activeWorkspaceId, session }: { activeWorkspaceId: string | null; session: PublicSession }) {
  return <ProviderConnectorPanel provider={CLAUDE_PROVIDER} activeWorkspaceId={activeWorkspaceId} session={session} />;
}
