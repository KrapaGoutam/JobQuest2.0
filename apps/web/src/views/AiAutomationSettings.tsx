import { useEffect, useState } from 'react';
import { fetchAiWorkflowConfigs } from '../api/aiHub';
import {
  AI_PROVIDER_LABELS, AI_WRITE_ACTIONS_ENABLED,
} from '../lib/aiHubFlags';
import {
  AI_WORKFLOW_DEFINITIONS, AI_WORKFLOW_STATUS_LABELS, PROVIDER_COMPATIBILITY_LABELS, workflowAvailability,
} from '../lib/aiWorkflowDefinitions';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { ClaudeConnectorPanel } from '../components/ai/ClaudeConnectorPanel';
import type { PublicSession } from '../api';

// Settings -> AI & Automation (AI-1F1). Workflows and general settings are
// read-only. AI-4 adds the Claude connector setup (scoped connector token for the
// remote MCP endpoint); Gemini/ChatGPT remain "Not configured". Rendered only when
// the AI Hub is exposed (see isAiHubExposed); failures are local to this panel.

type Cfg = { status: 'loading' } | { status: 'error' } | { status: 'ready'; rows: Array<{ workflow: string; enabled: boolean }> };

const rowStyle = { display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' as const, padding: '6px 0' };

export function AiAutomationSettings({ activeWorkspaceId, session }: { activeWorkspaceId: string | null; session?: PublicSession }) {
  const [cfg, setCfg] = useState<Cfg>({ status: 'loading' });

  useEffect(() => {
    if (!activeWorkspaceId) return;
    let live = true;
    setCfg({ status: 'loading' });
    fetchAiWorkflowConfigs(activeWorkspaceId)
      .then((rows) => live && setCfg({ status: 'ready', rows }))
      .catch(() => live && setCfg({ status: 'error' }));
    return () => { live = false; };
  }, [activeWorkspaceId]);

  const stored = new Map(cfg.status === 'ready' ? cfg.rows.map((r) => [r.workflow, r.enabled]) : []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <section aria-labelledby="ai-general">
        <Card>
          <CardHeader><CardTitle><span id="ai-general">General</span></CardTitle></CardHeader>
          <CardBody>
            <div style={rowStyle}><span>AI Hub</span><b>Enabled in this build (read-only views)</b></div>
            <div style={rowStyle}><span>Automation</span><b>Not configured yet</b></div>
            <div style={rowStyle}><span>Write actions</span><b>{AI_WRITE_ACTIONS_ENABLED ? 'Enabled' : 'Disabled'}</b></div>
            <p className="muted" style={{ margin: '8px 0 0', fontSize: '13px' }}>
              Workflow settings can’t be changed yet. Workspace settings can never override a system-level shutdown.
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
                <li key={p.id} style={p.id === 'claude' && session ? undefined : rowStyle}>
                  {p.id === 'claude' && session
                    ? <ClaudeConnectorPanel activeWorkspaceId={activeWorkspaceId} session={session} />
                    : <><span>{p.label}</span><b>Not configured</b></>}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </section>

      <section aria-labelledby="ai-workflows">
        <Card>
          <CardHeader><CardTitle><span id="ai-workflows">Workflows</span></CardTitle></CardHeader>
          <CardBody>
            {cfg.status === 'error' && (
              <p role="alert" style={{ margin: '0 0 8px', color: 'var(--color-danger)' }}>
                Couldn’t load AI workflow settings. The rest of Settings is unaffected.
              </p>
            )}
            <p className="muted" style={{ margin: '0 0 8px', fontSize: '13px' }}>
              Workflows are descriptions of what an AI provider can do for you. JobQuest does not run them: you create the
              schedule in the provider (for example a Claude scheduled task), and results arrive as AI findings.
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '12px' }}>
              {AI_WORKFLOW_DEFINITIONS.map((def) => {
                const status = workflowAvailability(def, { disabled: stored.get(def.id) === false });
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
