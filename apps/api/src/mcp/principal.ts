// AI-3: the trusted identity every MCP tool consumes. Tool handlers never see a
// token, a hash or a request header; they receive exactly this object, and no tool
// accepts userId / workspaceId / role as input. A future OAuth bearer verifier maps
// into the same shape (credentialType 'oauth'), so tools do not change.
import type { ConnectorScope } from '../lib/aiConnectorTokens';

export type McpScope = ConnectorScope;
export type McpCredentialType = 'connector_token' | 'oauth';

export interface McpPrincipal {
  userId: string;
  workspaceId: string;
  scopes: readonly McpScope[];
  credentialType: McpCredentialType;
  /** Token record id (safe to log). */
  credentialId: string;
  /** Non-secret display prefix (safe to log). */
  credentialPrefix: string;
  /** auth_sessions row this credential owns; used only to mint the short-lived RLS token. */
  sessionId: string;
}

export const hasMcpScope = (principal: McpPrincipal, scope: McpScope): boolean => principal.scopes.includes(scope);
