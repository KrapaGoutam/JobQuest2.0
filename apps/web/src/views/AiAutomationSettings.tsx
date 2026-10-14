import { useProfileTimeZone } from '../hooks/useProfileTimeZone';
import {
  AI_PROVIDER_LABELS, AI_WRITE_ACTIONS_ENABLED,
} from '../lib/aiHubFlags';
import {
  AI_WORKFLOW_DEFINITIONS, AI_WORKFLOW_STATUS_LABELS, PROVIDER_COMPATIBILITY_LABELS, workflowAvailability,
} from '../lib/aiWorkflowDefinitions';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { ClaudeConnectorPanel } from '../components/ai/ClaudeConnectorPanel';
import { ProviderConnectorPanel } from '../components/ai/ProviderConnectorPanel';
import { PROVIDER_CONNECTORS } from '../lib/providerConnectors';
import { OAuthProviderPanel } from '../components/ai/OAuthProviderPanel';
import { AutomationsPanel } from '../components/ai/AutomationsPanel';
import { JobDiscoveryPanel } from '../components/ai/JobDiscoveryPanel';
import { RecruiterDiscoveryPanel } from '../components/ai/RecruiterDiscoveryPanel';
import type { PublicSession } from '../api';

// Settings -> AI & Automation (AI-1F1). General settings and the Workflows reference are
// read-only; AI-11D adds Job Discovery (WHAT jobs the user wants; providers read it, JobQuest never searches); AI-11A adds Automations (provider-neutral schedule definitions). AI-4 adds the Claude connector setup (scoped connector token for the
// remote MCP endpoint); AI-9 adds Gemini and ChatGPT cards on the same generic connector-token panel, each with truthful
// capability notes (configured is not the same as automation-capable). Rendered only when
// the AI Hub is exposed (see isAiHubExposed); failures are local to this panel.

const rowStyle = { display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' as const, padding: '6px 0' };

export function AiAutomationSettings({ activeWorkspaceId, session, currentUserId = null }: { activeWorkspaceId: string | null; session?: PublicSession; currentUserId?: string | null }) {
  const { timeZone } = useProfileTimeZone(currentUserId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <section aria-labelledby="ai-general">
        <Card>
          <CardHeader><CardTitle><span id="ai-general">General</span></CardTitle></CardHeader>
          <CardBody>
            <div style={rowStyle}><span>AI Hub</span><b>Enabled in this build</b></div>
            <div style={rowStyle}><span>Automations</span><b>Defined below; run by your AI provider</b></div>
            <div style={rowStyle}><span>Automatic write actions</span><b>{AI_WRITE_ACTIONS_ENABLED ? 'Enabled' : 'Disabled'}</b></div>
            <div style={rowStyle}><span>Human-approved actions</span><b>Available: you review and confirm each change in Actions</b></div>
            <p className="muted" style={{ margin: '8px 0 0', fontSize: '13px' }}>
              Workspace settings can never override a system-level shutdown.
            </p>
          </CardBody>
        </Card>
      </section>

      <section aria-labelledby="ai-providers">
        <Card>
          <CardHeader><CardTitle><span id="ai-providers">Providers</span></CardTitle></CardHeader>
          <CardBody>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {AI_PROVIDER_LABELS.map((p) => (
                <li key={p.id} style={session ? { padding: '10px 0', borderTop: p.id === 'claude' ? undefined : '1px solid var(--color-border)' } : rowStyle}>
                  {p.id === 'claude' && session
                    ? <ClaudeConnectorPanel activeWorkspaceId={activeWorkspaceId} session={session} />
                    : session && (p.id === 'gemini' || p.id === 'chatgpt')
                      ? <OAuthProviderPanel provider={p.id} activeWorkspaceId={activeWorkspaceId} session={session} />
                      : session
                        ? <ProviderConnectorPanel provider={PROVIDER_CONNECTORS[p.id]} activeWorkspaceId={activeWorkspaceId} session={session} />
                      : <><span>{p.label}</span><b>Not configured</b></>}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </section>

      {session && (
        <section aria-labelledby="ai-job-discovery">
          <Card>
            <CardHeader><CardTitle><span id="ai-job-discovery">Job Discovery</span></CardTitle></CardHeader>
            <CardBody><JobDiscoveryPanel activeWorkspaceId={activeWorkspaceId} session={session} /></CardBody>
          </Card>
        </section>
      )}

      {session && (
        <section aria-labelledby="ai-recruiter-intelligence">
          <Card>
            <CardHeader><CardTitle><span id="ai-recruiter-intelligence">Recruiter Intelligence</span></CardTitle></CardHeader>
            <CardBody><RecruiterDiscoveryPanel activeWorkspaceId={activeWorkspaceId} session={session} /></CardBody>
          </Card>
        </section>
      )}

      {session && (
        <section aria-labelledby="ai-automations">
          <Card>
            <CardHeader><CardTitle><span id="ai-automations">Automations</span></CardTitle></CardHeader>
            <CardBody><AutomationsPanel activeWorkspaceId={activeWorkspaceId} session={session} defaultTimeZone={timeZone} /></CardBody>
          </Card>
        </section>
      )}

      <section aria-labelledby="ai-workflows">
        <Card>
          <CardHeader><CardTitle><span id="ai-workflows">Workflows</span></CardTitle></CardHeader>
          <CardBody>
            <p className="muted" style={{ margin: '0 0 8px', fontSize: '13px' }}>
              Workflows are descriptions of what an AI provider can do for you. JobQuest does not run them: you create the
              schedule in the provider (for example a Claude scheduled task), and results arrive as AI findings. Define when each
              should run under Automations above.
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '12px' }}>
              {AI_WORKFLOW_DEFINITIONS.map((def) => {
                const status = workflowAvailability(def);
                return (
                  <li key={def.id} style={{ display: 'grid', gap: '4px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <b style={{ fontSize: '14px' }}>{def.name}</b>
                      <StatusBadge variant={status === 'AVAILABLE' ? 'success' : status === 'DISABLED' ? 'danger' : 'muted'}>{AI_WORKFLOW_STATUS_LABELS[status]}</StatusBadge>
                    </div>
                    <span>{def.purpose}</span>
                    <span className="muted">Recommended cadence: {def.recommendedCadence}. Provider schedule state is not tracked by JobQuest.</span>
                    <span className="muted">Claude: {PROVIDER_COMPATIBILITY_LABELS[def.providers.claude]} · ChatGPT: {PROVIDER_COMPATIBILITY_LABELS[def.providers.chatgpt]} · Gemini: {PROVIDER_COMPATIBILITY_LABELS[def.providers.gemini]}</span>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      </section>

      <section aria-labelledby="ai-privacy">
        <Card>
          <CardHeader><CardTitle><span id="ai-privacy">Data &amp; Privacy</span></CardTitle></CardHeader>
          <CardBody>
            <p style={{ margin: 0, fontSize: '13px' }}>
              The AI Hub stores structured findings only — raw email bodies are not stored. Retention and cleanup are
              not active yet, and email rules are not configured yet.
            </p>
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
