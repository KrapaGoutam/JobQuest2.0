import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle, Check, CircleCheck, CircleX, Copy, History, Plug, Puzzle,
  RefreshCw, ShieldCheck, Trash2,
} from 'lucide-react';
import type { PublicSession } from '../api';
import {
  createExtensionToken, listExtensionTokens, revokeExtensionToken, rotateExtensionToken,
  type ExtensionTokenMetadata,
} from '../api/extension';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';

interface ExtensionSettingsViewProps {
  activeWorkspaceId: string | null;
  activeWorkspaceName: string;
  session: PublicSession;
}

interface RevealedToken {
  raw: string;
  metadata: ExtensionTokenMetadata;
}

function formatDate(value: string | null): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function copyFallback(value: string): boolean {
  const field = document.createElement('textarea');
  field.value = value;
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.append(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  return copied;
}

export function ExtensionSettingsView({ activeWorkspaceId, activeWorkspaceName, session }: ExtensionSettingsViewProps) {
  const [tokens, setTokens] = useState<ExtensionTokenMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('Chrome on this computer');
  const [expires, setExpires] = useState<30 | 90 | 365>(90);
  const [revealed, setRevealed] = useState<RevealedToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmToken, setConfirmToken] = useState<{ token: ExtensionTokenMetadata; action: 'revoke' | 'rotate' } | null>(null);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) { setTokens([]); setIsLoading(false); return; }
    setIsLoading(true);
    try { setTokens(await listExtensionTokens(activeWorkspaceId, session)); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load extension tokens.'); }
    finally { setIsLoading(false); }
  }, [activeWorkspaceId, session]);

  useEffect(() => { void load(); }, [load]);

  async function createToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeWorkspaceId || !name.trim()) return;
    setBusyId('create'); setError(null);
    try {
      const result = await createExtensionToken({ workspace_id: activeWorkspaceId, name: name.trim(), expires_in_days: expires }, session);
      setCreateOpen(false);
      setRevealed({ raw: result.token, metadata: result.metadata });
      setCopied(false);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create extension token.'); }
    finally { setBusyId(null); }
  }

  async function copyToken() {
    if (!revealed) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(revealed.raw);
      else if (!copyFallback(revealed.raw)) throw new Error('copy failed');
      setCopied(true);
    } catch { setError('Copy failed. Select the token and copy it manually.'); }
  }

  async function confirmAction() {
    if (!confirmToken) return;
    const { token, action } = confirmToken;
    setBusyId(token.id); setError(null);
    try {
      if (action === 'revoke') {
        await revokeExtensionToken(token.id, session);
      } else {
        const result = await rotateExtensionToken(token.id, session);
        setRevealed({ raw: result.token, metadata: result.metadata });
        setCopied(false);
      }
      setConfirmToken(null);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Could not ${action} extension token.`); }
    finally { setBusyId(null); }
  }

  function closeReveal() {
    setRevealed(null);
    setCopied(false);
  }

  if (!activeWorkspaceId) return <div role="alert">Select a workspace to manage browser connections.</div>;

  return (
    <div className="extension-settings-page">
      <header className="extension-settings-heading">
        <div>
          <p className="eyebrow">Settings · Browser extension</p>
          <h1>Browser extension</h1>
          <p className="muted">Connect JobQuest Capture to save jobs from any posting page. Each token is bound to one workspace.</p>
        </div>
        <Button variant="primary" leftIcon={<Plug size={16} />} onClick={() => setCreateOpen(true)}>Connect a browser</Button>
      </header>

      {error ? <div className="extension-settings-alert" role="alert"><AlertTriangle size={18} /><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Dismiss error">×</button></div> : null}

      <Card>
        <CardHeader>
          <CardTitle>Connections for {activeWorkspaceName}</CardTitle>
          <span className="small muted">Tokens never include your password.</span>
        </CardHeader>
        <CardBody className="extension-token-card-body">
          {isLoading ? <p role="status" className="muted">Loading browser connections…</p> : tokens.length === 0 ? (
            <div className="extension-token-empty">
              <Puzzle size={30} aria-hidden="true" />
              <h3>No browsers connected</h3>
              <p className="muted">Create a token, then paste it into the JobQuest Capture extension.</p>
              <Button variant="primary" onClick={() => setCreateOpen(true)}>Connect a browser</Button>
            </div>
          ) : (
            <div className="extension-token-table-wrap">
              <table className="extension-token-table">
                <thead><tr><th>Name</th><th>Created</th><th>Last used</th><th>Expires</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>{tokens.map((token) => (
                  <tr key={token.id} className={token.status === 'REVOKED' ? 'revoked' : ''}>
                    <td><span className="extension-token-name"><Puzzle size={16} /><span><b>{token.name}</b><code>{token.token_prefix}…</code></span></span></td>
                    <td>{formatDate(token.created_at)}</td>
                    <td>{formatDate(token.last_used_at)}</td>
                    <td>{formatDate(token.expires_at)}</td>
                    <td><span className={`extension-token-status ${token.status.toLowerCase()}`}>{token.status.toLowerCase()}</span></td>
                    <td>{token.status === 'ACTIVE' || token.status === 'EXPIRING' ? <span className="extension-token-actions">
                      <Button size="sm" leftIcon={<RefreshCw size={14} />} isLoading={busyId === token.id} onClick={() => setConfirmToken({ token, action: 'rotate' })}>Replace</Button>
                      <Button size="sm" variant="danger-outline" leftIcon={<Trash2 size={14} />} disabled={busyId === token.id} onClick={() => setConfirmToken({ token, action: 'revoke' })}>Revoke</Button>
                    </span> : <span className="muted small">{token.revoked_at ? formatDate(token.revoked_at) : 'No actions'}</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle><ShieldCheck size={18} /> What a token can do</CardTitle></CardHeader>
        <CardBody className="extension-scope-grid">
          {[
            ['Read your workflow stages and outcomes', true],
            ['Check for duplicate applications', true],
            ['Create applications and immutable job snapshots', true],
            ['List your active resumes', true],
            ['Edit or delete existing records', false],
            ['Access other workspaces or your password', false],
          ].map(([label, allowed]) => <span key={String(label)}><span className={allowed ? 'scope-yes' : 'scope-no'}>{allowed ? <CircleCheck size={17} /> : <CircleX size={17} />}</span>{label}</span>)}
        </CardBody>
      </Card>

      <Dialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Connect a browser"
        description="Create a workspace-bound connection for JobQuest Capture."
        footer={<><span className="small muted"><History size={14} /> Recorded in audit history</span><span className="grow" /><Button onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" form="extension-token-form" variant="primary" isLoading={busyId === 'create'}>Create token</Button></>}
      >
        <form id="extension-token-form" className="extension-token-form" onSubmit={createToken}>
          <label htmlFor="extension-token-name">Name <span aria-hidden="true">*</span></label>
          <Input id="extension-token-name" value={name} maxLength={64} required autoFocus onChange={(event) => setName(event.target.value)} />
          <span className="small muted">Use a label such as “Work laptop · Chrome”.</span>
          <div className="extension-token-fields">
            <div><label>Workspace</label><div className="extension-readonly-field">{activeWorkspaceName}</div><span className="small muted">Captures are saved here.</span></div>
            <div><label htmlFor="extension-token-expiry">Expires</label><Select id="extension-token-expiry" value={expires} onChange={(event) => setExpires(Number(event.target.value) as 30 | 90 | 365)} options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: '1 year' }]} /><span className="small muted">You can replace it at any time.</span></div>
          </div>
          <div><label>Access</label><div className="extension-fixed-access"><span><Check size={15} /> Capture jobs and check duplicates</span><span><Check size={15} /> Read workflow and resumes</span></div><span className="small muted">Fixed least-privilege access; tokens cannot edit or delete existing records.</span></div>
        </form>
      </Dialog>

      <Dialog
        isOpen={Boolean(revealed)}
        onClose={closeReveal}
        title="Copy your token"
        description="Paste this into JobQuest Capture · Settings. It is shown only once."
        footer={<><span className="grow" /><Button variant="primary" onClick={closeReveal}>Done, I copied it</Button></>}
      >
        {revealed ? <div className="extension-reveal">
          <div className="extension-secret"><code>{revealed.raw}</code><Button size="sm" variant="primary" leftIcon={copied ? <Check size={14} /> : <Copy size={14} />} onClick={() => void copyToken()}>{copied ? 'Copied' : 'Copy'}</Button></div>
          <dl><dt>Name</dt><dd>{revealed.metadata.name}</dd><dt>Workspace</dt><dd>{activeWorkspaceName}</dd><dt>Expires</dt><dd>{formatDate(revealed.metadata.expires_at)}</dd></dl>
          <div className="banner danger"><AlertTriangle size={17} /><span>Treat this token like a password. If you lose it, replace it; JobQuest cannot show it again.</span></div>
        </div> : null}
      </Dialog>

      <Dialog
        isOpen={Boolean(confirmToken)}
        onClose={() => setConfirmToken(null)}
        title={confirmToken?.action === 'rotate' ? `Replace “${confirmToken.token.name}”?` : `Revoke “${confirmToken?.token.name ?? ''}”?`}
        description={confirmToken?.action === 'rotate' ? 'The current token stops working immediately. A replacement is shown once.' : 'The extension on that browser stops working immediately. Applications it already saved are kept.'}
        footer={<><span className="grow" /><Button onClick={() => setConfirmToken(null)}>Cancel</Button><Button variant={confirmToken?.action === 'rotate' ? 'primary' : 'danger'} isLoading={Boolean(confirmToken && busyId === confirmToken.token.id)} onClick={() => void confirmAction()}>{confirmToken?.action === 'rotate' ? 'Replace token' : 'Revoke token'}</Button></>}
      ><p className="muted">{confirmToken ? `${confirmToken.token.token_prefix}… · expires ${formatDate(confirmToken.token.expires_at)}` : ''}</p></Dialog>
    </div>
  );
}
