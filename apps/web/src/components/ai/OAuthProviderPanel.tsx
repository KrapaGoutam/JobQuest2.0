import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, ShieldCheck } from 'lucide-react';
import type { PublicSession } from '../../api';
import { createOAuthClient, listOAuthClients, revokeOAuthClient, type OAuthClientMetadata, type OAuthProviderId } from '../../api/oauth';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

const PROVIDER_NAME: Record<OAuthProviderId, string> = { gemini: 'Gemini', chatgpt: 'ChatGPT' };
const DEFAULT_SCOPES = ['jobquest:read', 'ai:read'];

function endpoint(origin: string, path: string) { return `${origin}/api/oauth/${path}`; }
async function copy(value: string) {
  if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
  await navigator.clipboard.writeText(value);
}

export function OAuthProviderPanel({ provider, activeWorkspaceId, session }: {
  provider: OAuthProviderId; activeWorkspaceId: string | null; session: PublicSession;
}) {
  const name = PROVIDER_NAME[provider];
  const [clients, setClients] = useState<OAuthClientMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [redirectUri, setRedirectUri] = useState('');
  const [allowIngest, setAllowIngest] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<{ secret: string; client: OAuthClientMetadata } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<OAuthClientMetadata | null>(null);

  const refresh = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try { setClients((await listOAuthClients(activeWorkspaceId, session)).filter((client) => client.provider === provider)); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load OAuth clients.'); }
    finally { setLoading(false); }
  }, [activeWorkspaceId, provider, session]);
  useEffect(() => { void refresh(); }, [refresh]);

  const active = clients.filter((client) => !client.revoked_at);
  const authorized = active.reduce((sum, client) => sum + Number(client.active_grants || 0), 0);
  const label = authorized > 0 ? 'OAuth authorized' : active.length > 0 ? 'OAuth client ready' : 'OAuth setup required';

  async function create() {
    if (!activeWorkspaceId) return;
    setCreating(true); setError(null);
    try {
      const result = await createOAuthClient({
        workspace_id: activeWorkspaceId, provider, name: `${name} OAuth client`, redirect_uris: [redirectUri.trim()],
        scopes: allowIngest ? [...DEFAULT_SCOPES, 'ai:ingest'] : DEFAULT_SCOPES,
      }, session);
      setOpen(false); setRedirectUri(''); setAllowIngest(false); setRevealed({ secret: result.client_secret, client: result.client });
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create OAuth client.'); }
    finally { setCreating(false); }
  }

  async function revokeClient() {
    if (!revoke) return;
    try { await revokeOAuthClient(revoke.id, session); setRevoke(null); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not revoke OAuth client.'); setRevoke(null); }
  }

  if (!activeWorkspaceId) return <div><span>{name}</span><b>Select a workspace</b></div>;
  return (
    <div data-testid={`${provider}-oauth`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span>{name}</span>
        <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
          <b>{loading ? 'Checking…' : error && clients.length === 0 ? 'Status unavailable' : label}</b>
          {!loading ? <Button size="sm" variant={active.length ? 'secondary' : 'primary'} onClick={() => setOpen(true)}>{active.length ? 'Add OAuth client' : `Set up ${name}`}</Button> : null}
        </span>
      </div>
      <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
        Authorization Code + PKCE S256. Access is bound to this account, workspace, exact redirect URI, resource, and selected scopes.
      </p>
      {error ? <p role="alert" style={{ color: 'var(--color-danger)', fontSize: 13 }}>{error}</p> : null}
      {active.map((client) => (
        <div key={client.id} style={{ borderTop: '1px solid var(--color-border)', padding: '8px 0', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span><b>{client.name}</b><br /><code>{client.client_id}</code><br /><span className="muted">{client.active_grants} active grant{Number(client.active_grants) === 1 ? '' : 's'} · {client.scopes.join(' · ')}</span></span>
          <Button size="sm" variant="danger-outline" onClick={() => setRevoke(client)}>Revoke</Button>
        </div>
      ))}

      <Dialog isOpen={open} onClose={() => setOpen(false)} title={`Set up ${name} OAuth`}
        description={`Enter the exact callback URL ${name} shows. Redirect matching is exact.`}
        footer={<><span className="grow" /><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" isLoading={creating} onClick={() => void create()}>Create OAuth client</Button></>}>
        <div style={{ display: 'grid', gap: 14 }}>
          <label><b>Provider callback URL</b><input type="url" value={redirectUri} onChange={(e) => setRedirectUri(e.target.value)} placeholder="https://provider.example/oauth/callback" style={{ width: '100%' }} /></label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><input type="checkbox" checked={allowIngest} onChange={(e) => setAllowIngest(e.target.checked)} /><span><b>Allow AI findings</b><br /><span className="muted">Adds <code>ai:ingest</code>. It never permits core JobQuest writes.</span></span></label>
          <div className="banner info"><ShieldCheck size={17} /><span>JobQuest supports pre-registered confidential clients only. DCR and CIMD are intentionally not exposed.</span></div>
        </div>
      </Dialog>

      <Dialog isOpen={Boolean(revealed)} onClose={() => { setRevealed(null); setCopied(null); }} title={`${name} OAuth credentials`}
        description="Copy the client secret now. It is shown once and never stored in readable form." maxWidth={680}
        footer={<><span className="grow" /><Button variant="primary" onClick={() => { setRevealed(null); setCopied(null); }}>Done, I copied it</Button></>}>
        {revealed ? <div style={{ display: 'grid', gap: 12 }}>
          {([
            ['Client ID', revealed.client.client_id], ['Client secret', revealed.secret],
            ['Authorization URL', endpoint(window.location.origin, 'authorize')], ['Token URL', endpoint(window.location.origin, 'token')],
            ['Revocation URL', endpoint(window.location.origin, 'revoke')], ['Resource / audience', `${window.location.origin}/api/mcp`],
            ['Scopes', revealed.client.scopes.join(' ')],
          ] as Array<[string, string]>).map(([labelText, value]) => <div key={labelText}><b>{labelText}</b><div className="extension-secret"><code>{value}</code><Button size="sm" onClick={() => void copy(value).then(() => setCopied(labelText)).catch(() => setError('Copy failed.'))} leftIcon={copied === labelText ? <Check size={14} /> : <Copy size={14} />}>{copied === labelText ? 'Copied' : 'Copy'}</Button></div></div>)}
          <div className="banner warning"><AlertTriangle size={17} /><span>Keep the client secret private. Revoke this client if it is exposed; all of its OAuth grants will stop immediately.</span></div>
        </div> : null}
      </Dialog>

      <Dialog isOpen={Boolean(revoke)} onClose={() => setRevoke(null)} title={`Revoke ${name} OAuth client?`}
        description="This immediately revokes every grant and refresh token issued to this client."
        footer={<><span className="grow" /><Button onClick={() => setRevoke(null)}>Cancel</Button><Button variant="danger" onClick={() => void revokeClient()}>Revoke client</Button></>}>
        <p className="muted"><code>{revoke?.client_id}</code></p>
      </Dialog>
    </div>
  );
}
