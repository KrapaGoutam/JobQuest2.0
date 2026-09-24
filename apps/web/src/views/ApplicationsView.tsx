import { type FormEvent } from 'react';
import { Card, CardHeader, CardTitle, CardBody, CardBand } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { StatusBadge } from '../components/ui/StatusBadge';
import { StagePips } from '../components/ui/StagePips';
import { ShieldCheck, RefreshCw, Plus, KeyRound } from 'lucide-react';
import type { PublicSession, PublicUser } from '../api';

export interface ApplicationRecord {
  id: string;
  company_name: string;
  role_title: string;
  stage: string;
  status: string;
  user_id: string;
  archived_at: string | null;
}

export interface WorkflowDef {
  stages: { id: string; label: string }[];
  outcomes: { id: string; label: string }[];
}

export interface ApplicationsViewProps {
  user: PublicUser | null;
  session: PublicSession | null;
  apps: ApplicationRecord[];
  wfDirect: WorkflowDef | null;
  wfNode: WorkflowDef | null;
  recoveryCodes: string[] | null;
  leakResults: Record<string, boolean> | null;
  probeStatus: string;
  log?: string[];
  onRefresh: () => Promise<unknown>;
  onLogout: (scope: 'local' | 'global') => Promise<void>;
  onCreateApp: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onStageChange: (id: string, stage: string) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onLoadWorkflow: () => Promise<void>;
  onPasswordChange: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onRegenerateCodes: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onLeakCheck: () => Promise<void>;
  onDismissCodes: () => void;
}

export function ApplicationsView({
  user,
  session,
  apps,
  wfDirect,
  wfNode,
  recoveryCodes,
  leakResults,
  probeStatus,
  log = [],
  onRefresh,
  onLogout,
  onCreateApp,
  onStageChange,
  onArchive,
  onLoadWorkflow,
  onPasswordChange,
  onRegenerateCodes,
  onLeakCheck,
  onDismissCodes,
}: ApplicationsViewProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Recovery Codes Banner if just registered or regenerated */}
      {recoveryCodes && (
        <section aria-label="Recovery codes">
          <Card style={{ borderColor: 'var(--color-warning)' }}>
            <CardBand type="warning">
              <span>Recovery codes: shown once. Save them now.</span>
            </CardBand>
            <CardBody>
              <ol data-testid="recovery-codes" style={{ margin: '8px 0', paddingLeft: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '6px' }}>
                {recoveryCodes.map((code) => (
                  <li key={code}>
                    <code style={{ fontSize: '13px', background: 'var(--color-surface-2)', padding: '2px 6px', borderRadius: '4px' }}>
                      {code}
                    </code>
                  </li>
                ))}
              </ol>
              <Button variant="primary" size="sm" onClick={onDismissCodes} style={{ marginTop: '8px' }}>
                I saved them
              </Button>
            </CardBody>
          </Card>
        </section>
      )}

      {/* Session Strip */}
      <section aria-label="Session">
        <Card>
          <CardBody style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <b>{user?.username}</b>
              <span className="muted">·</span>
              <span className="muted small">
                Session expires {session?.expires_at ? new Date(session.expires_at * 1000).toLocaleTimeString() : '?'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Button variant="secondary" size="sm" leftIcon={<RefreshCw size={13} />} onClick={() => void onRefresh()}>
                Refresh now
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void onLogout('local')}>
                Sign out
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void onLogout('global')}>
                Sign out everywhere
              </Button>
            </div>
          </CardBody>
        </Card>
      </section>

      {/* Applications Region */}
      <section aria-label="Applications">
        <Card>
          <CardHeader action={<StatusBadge count={apps.length} variant="accent">Applications</StatusBadge>}>
            <CardTitle>Applications in active workspace ({apps.length})</CardTitle>
          </CardHeader>
          <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Quick Add Form */}
            <form onSubmit={onCreateApp} style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
              <Input name="company" placeholder="Company" required aria-label="Company" style={{ minWidth: '180px' }} />
              <Input name="role" placeholder="Role" required aria-label="Role" style={{ minWidth: '180px' }} />
              <Select name="stage" aria-label="Stage" defaultValue="APPLIED" style={{ minWidth: '140px' }}>
                {(wfDirect?.stages ?? [{ id: 'APPLIED', label: 'Applied' }]).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
              <Button variant="primary" leftIcon={<Plus size={14} />}>
                Insert (direct PostgREST)
              </Button>
            </form>

            {/* Table of Applications */}
            <Table>
              <TableHeader>
                <tr>
                  <TableHead>Company & Role</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead align="right">Actions</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {apps.length === 0 ? (
                  <tr>
                    <TableCell colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>
                      No applications recorded yet in this workspace.
                    </TableCell>
                  </tr>
                ) : (
                  apps.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell>
                        <div style={{ fontWeight: 600 }}>
                          {app.company_name} · {app.role_title}
                        </div>
                        {app.archived_at && <span className="muted xs">Archived</span>}
                      </TableCell>
                      <TableCell>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <StagePips stage={app.stage} />
                          <StatusBadge stage={app.stage} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge variant="muted">{app.status || 'Active'}</StatusBadge>
                      </TableCell>
                      <TableCell align="right">
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <Button size="sm" variant="secondary" onClick={() => void onStageChange(app.id, 'INTERVIEW')}>
                            → Interview
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void onArchive(app.id)}>
                            Archive
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardBody>
        </Card>
      </section>

      {/* Canonical Workflow Section */}
      <section aria-label="Workflow">
        <Card>
          <CardHeader action={<Button size="sm" variant="secondary" onClick={() => void onLoadWorkflow()}>Load (PostgREST + Node)</Button>}>
            <CardTitle>Canonical Workflow (Data API + Node)</CardTitle>
          </CardHeader>
          <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
            <div>
              <b>PostgREST:</b> {wfDirect?.stages ? wfDirect.stages.map((s) => s.label).join(' → ') : 'Click load to query'}
              {wfDirect?.outcomes && <span> | outcomes: {wfDirect.outcomes.map((o) => o.label).join(', ')}</span>}
            </div>
            <div>
              <b>Node API:</b> {wfNode?.stages ? wfNode.stages.map((s) => s.label).join(' → ') : 'Pending'}
            </div>
          </CardBody>
        </Card>
      </section>

      {/* Account Security Section */}
      <section aria-label="Account security">
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <KeyRound size={16} className="primary-t" />
              <CardTitle>Account Security</CardTitle>
            </div>
          </CardHeader>
          <CardBody style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {/* Change Password */}
            <form onSubmit={onPasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <b>Change Password</b>
              <Input
                name="current"
                type="password"
                placeholder="Current password"
                required
                aria-label="Current password"
                autoComplete="current-password"
              />
              <Input
                name="next"
                type="password"
                placeholder="New password"
                required
                aria-label="New password"
                autoComplete="new-password"
              />
              <Button variant="secondary" size="sm" style={{ alignSelf: 'flex-start' }}>
                Change
              </Button>
            </form>

            {/* Regenerate Recovery Codes */}
            <form onSubmit={onRegenerateCodes} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <b>Regenerate Recovery Codes</b>
              <Input
                name="password"
                type="password"
                placeholder="Password to confirm"
                required
                aria-label="Password to regenerate codes"
              />
              <Button variant="secondary" size="sm" style={{ alignSelf: 'flex-start' }}>
                Regenerate
              </Button>
            </form>
          </CardBody>
        </Card>
      </section>

      {/* Leak Self-Check Section */}
      <section aria-label="Leak self-check">
        <Card>
          <CardHeader action={<Button size="sm" variant="secondary" leftIcon={<ShieldCheck size={14} />} onClick={() => void onLeakCheck()}>Scan for exposed identity or credentials</Button>}>
            <CardTitle>B03 Exposure Self-Check</CardTitle>
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

      {/* Log Strip for Activity and E2E Verification */}
      {log.length > 0 && (
        <section aria-label="Log">
          <Card>
            <CardHeader>
              <CardTitle>Activity Log</CardTitle>
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
  );
}
