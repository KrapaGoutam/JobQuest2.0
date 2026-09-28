import { useState, type FormEvent } from 'react';
import { Card, CardHeader, CardTitle, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { KeyRound, ShieldCheck, Activity, Bug } from 'lucide-react';
import { ExtensionSettingsView } from './ExtensionSettingsView';
import type { PublicSession } from '../api';

export interface SettingsViewProps {
  activeWorkspaceId: string | null;
  activeWorkspaceName: string;
  session: PublicSession;
  onPasswordChange: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onRegenerateCodes: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onLeakCheck: () => Promise<void>;
  leakResults: Record<string, boolean> | null;
  probeStatus: number | null;
  log: string[];
  wfDirect: any;
  wfNode: any;
  onLoadWorkflow: () => Promise<void>;
  recoveryCodes: string[] | null;
  onDismissCodes: () => void;
  onRefreshSession: () => Promise<unknown>;
  onLogout: (scope: 'local' | 'global') => Promise<void>;
}

export function SettingsView({
  activeWorkspaceId,
  activeWorkspaceName,
  session,
  onPasswordChange,
  onRegenerateCodes,
  onLeakCheck,
  leakResults,
  probeStatus,
  log,
  wfDirect,
  wfNode,
  onLoadWorkflow,
  recoveryCodes,
  onDismissCodes,
  onRefreshSession,
  onLogout,
}: SettingsViewProps) {
  const [tab, setTab] = useState<'account' | 'extension' | 'diagnostics'>('account');

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <header>
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 16px 0' }}>Settings</h1>
        <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
          <button
            onClick={() => setTab('account')}
            style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', fontWeight: tab === 'account' ? 700 : 400, color: tab === 'account' ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
          >
            Account & Security
          </button>
          <button
            onClick={() => setTab('extension')}
            style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', fontWeight: tab === 'extension' ? 700 : 400, color: tab === 'extension' ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
          >
            Browser Extension
          </button>
          <button
            onClick={() => setTab('diagnostics')}
            style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', fontWeight: tab === 'diagnostics' ? 700 : 400, color: tab === 'diagnostics' ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
          >
            Diagnostics
          </button>
        </div>
      </header>

      {tab === 'account' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Recovery Codes Banner */}
          {recoveryCodes && (
            <section aria-label="Recovery codes">
              <Card style={{ borderColor: 'var(--color-warning)' }}>
                <CardBody>
                  <div style={{ fontWeight: 600, color: 'var(--color-warning)', marginBottom: '6px' }}>
                    Recovery codes: shown once. Save them now.
                  </div>
                  <ol
                    data-testid="recovery-codes"
                    style={{
                      margin: '8px 0',
                      paddingLeft: '24px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '6px',
                    }}
                  >
                    {recoveryCodes.map((code) => (
                      <li key={code}>
                        <code style={{ fontSize: '13px', background: 'var(--color-surface-2)', padding: '2px 6px', borderRadius: '4px' }}>
                          {code}
                        </code>
                      </li>
                    ))}
                  </ol>
                  {onDismissCodes && (
                    <Button variant="primary" size="sm" onClick={onDismissCodes} style={{ marginTop: '8px' }}>
                      I saved them
                    </Button>
                  )}
                </CardBody>
              </Card>
            </section>
          )}

          <section aria-label="Account security">
            <Card>
              <CardHeader>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <KeyRound size={16} className="primary-t" />
                  <CardTitle>Account Security</CardTitle>
                </div>
              </CardHeader>
              <CardBody style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                <form onSubmit={onPasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <b>Change Password</b>
                  <Input name="current" type="password" placeholder="Current password" required aria-label="Current password" autoComplete="current-password" />
                  <Input name="next" type="password" placeholder="New password" required aria-label="New password" autoComplete="new-password" />
                  <Button variant="secondary" size="sm" style={{ alignSelf: 'flex-start' }}>
                    Change
                  </Button>
                </form>

                <form onSubmit={onRegenerateCodes} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <b>Regenerate Recovery Codes</b>
                  <Input name="password" type="password" placeholder="Password to confirm" required aria-label="Password to regenerate codes" />
                  <Button variant="secondary" size="sm" style={{ alignSelf: 'flex-start' }}>
                    Regenerate
                  </Button>
                </form>
              </CardBody>
            </Card>
          </section>

          <section aria-label="Session management">
            <Card>
              <CardHeader>
                <CardTitle>Session Management</CardTitle>
              </CardHeader>
              <CardBody style={{ display: 'flex', gap: '12px' }}>
                <Button variant="secondary" onClick={() => void onRefreshSession()}>
                  Refresh Session
                </Button>
                <Button variant="danger-outline" onClick={() => void onLogout('global')}>
                  Sign Out Everywhere
                </Button>
              </CardBody>
            </Card>
          </section>
        </div>
      )}

      {tab === 'extension' && (
        <ExtensionSettingsView
          activeWorkspaceId={activeWorkspaceId}
          activeWorkspaceName={activeWorkspaceName}
          session={session}
        />
      )}

      {tab === 'diagnostics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <section aria-label="Workflow">
            <Card>
              <CardHeader action={<Button size="sm" variant="secondary" onClick={() => void onLoadWorkflow()}>Load (PostgREST + Node)</Button>}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Bug size={16} className="primary-t" />
                  <CardTitle>Canonical Workflow (Data API + Node)</CardTitle>
                </div>
              </CardHeader>
              <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                <div>
                  <b>PostgREST:</b> {wfDirect?.stages ? wfDirect.stages.map((s: any) => s.label).join(' → ') : 'Click load to query'}
                  {wfDirect?.outcomes && <span> | outcomes: {wfDirect.outcomes.map((o: any) => o.label).join(', ')}</span>}
                </div>
                <div>
                  <b>Node API:</b> {wfNode?.stages ? wfNode.stages.map((s: any) => s.label).join(' → ') : 'Pending'}
                </div>
              </CardBody>
            </Card>
          </section>

          <section aria-label="Leak self-check">
            <Card>
              <CardHeader action={<Button size="sm" variant="secondary" leftIcon={<ShieldCheck size={14} />} onClick={() => void onLeakCheck()}>Scan for exposed identity or credentials</Button>}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={16} className="primary-t" />
                  <CardTitle>B03 Exposure Self-Check</CardTitle>
                </div>
              </CardHeader>
              <CardBody>
                {leakResults && (
                  <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {Object.entries(leakResults).map(([key, isFound]) => (
                      <li key={key} data-leak={key} data-found={String(isFound)} style={{ fontSize: '13px' }}>
                        <b>{key}:</b>{' '}
                        <span style={{ color: isFound ? 'var(--color-danger)' : 'var(--color-success)', fontWeight: 600 }}>
                          {isFound ? 'FOUND (exposure)' : 'clean'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {probeStatus && (
                  <div data-testid="auth-user-probe-status" style={{ marginTop: '10px', fontSize: '13px' }}>
                    Supabase /auth/v1/user with my token → HTTP {probeStatus}
                  </div>
                )}
              </CardBody>
            </Card>
          </section>

          {log.length > 0 && (
            <section aria-label="Log">
              <Card>
                <CardHeader>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Activity size={16} className="primary-t" />
                    <CardTitle>Activity Log</CardTitle>
                  </div>
                </CardHeader>
                <CardBody>
                  <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }} className="mono muted">
                    {log.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
