import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { PublicSession } from '../../api';
import { listConnectorTokens, revokeConnectorToken } from '../../api/aiConnectors';
import { effectiveStatus, lastUsedLabel, scopeLabel, type ConnectorTokenMetadata } from '../../lib/claudeConnector';
import { legacyCredentials, providerOfCredential } from '../../lib/providerConnectors';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

// AI-11H: "Other connector credentials". Connector credentials the provider cards do not show: tokens with no provider (older ones, or
// created without choosing one) and tokens bound to a provider that connects with OAuth. It lists SAFE METADATA ONLY (name, prefix,
// scopes, dates, provider, state) and revokes through the existing supported route (POST /api/ai/connector-tokens/:id/revoke). It is
// rendered only when such credentials exist, so the normal OAuth-first provider cards stay uncluttered. No raw token, hash or secret
// ever reaches the browser from that API, and none is created here.

export type LegacyLoad =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; tokens: ConnectorTokenMetadata[] };

const row: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start', padding: '8px 0', borderTop: '1px solid var(--color-border)' };
const small: CSSProperties = { margin: '4px 0 0', fontSize: '13px' };
const day = (iso: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));
const when = (iso: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

function CredentialRow({ t, now, onRevoke }: { t: ConnectorTokenMetadata; now?: number; onRevoke?: () => void }) {
  const status = effectiveStatus(t, now);
  return (
    <li style={row} data-testid="legacy-credential">
      <div style={{ minWidth: 0 }}>
        <div><b>{t.name}</b> <code>{t.token_prefix}…</code> <span className={`extension-token-status ${status.toLowerCase()}`}>{status.toLowerCase()}</span></div>
        <div className="muted" style={small}>Provider: {providerOfCredential(t)}{t.provider ? '' : ' (cannot claim automation runs)'}</div>
        <div className="muted" style={small}>{t.scopes.map(scopeLabel).join(' · ')}</div>
        <div className="muted" style={small}>
          Created {day(t.created_at)} · {status === 'REVOKED' && t.revoked_at ? `Revoked ${day(t.revoked_at)}` : `${status === 'EXPIRED' ? 'Expired' : 'Expires'} ${day(t.expires_at)}`} · {lastUsedLabel(t.last_used_at, when)}
        </div>
      </div>
      {onRevoke ? <Button size="sm" variant="danger-outline" onClick={onRevoke} aria-label={`Revoke ${t.name} (${t.token_prefix})`}>Revoke</Button> : null}
    </li>
  );
}

export interface LegacyCredentialsViewProps {
  load: LegacyLoad;
  now?: number;
  revokeTarget: ConnectorTokenMetadata | null;
  revoking: boolean;
  revokeError: string | null;
  onAskRevoke(t: ConnectorTokenMetadata): void;
  onCancelRevoke(): void;
  onConfirmRevoke(): void;
  onRetry(): void;
}

/** Presentational (rendered on the server in tests). Renders nothing when there is nothing to manage. */
export function LegacyCredentialsView(p: LegacyCredentialsViewProps) {
  if (p.load.status === 'loading') return null;
  if (p.load.status === 'error') {
    return (
      <p role="alert" className="muted" style={{ ...small, color: 'var(--color-danger)' }} data-testid="legacy-credentials-error">
        Couldn’t check for other connector credentials. <button type="button" onClick={p.onRetry} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>Try again</button>
      </p>
    );
  }
  const { active, inactive } = legacyCredentials(p.load.tokens, p.now);
  if (active.length === 0 && inactive.length === 0) return null;
  return (
    <section aria-labelledby="legacy-credentials-title" data-testid="legacy-credentials" style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
      <b id="legacy-credentials-title">Other connector credentials</b>
      <p className="muted" style={small}>
        Credentials the provider cards above don’t list: older credentials that aren’t bound to a provider, and token credentials for providers that now connect with OAuth. Revoke any you no longer use. The token itself is never shown again.
      </p>
      {p.revokeError ? <p role="alert" style={{ ...small, color: 'var(--color-danger)' }}>{p.revokeError}</p> : null}
      {active.length === 0 ? <p className="muted" style={small}>None of these credentials is active.</p> : (
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }} aria-label="Active other connector credentials">
          {active.map((t) => <CredentialRow key={t.id} t={t} now={p.now} onRevoke={() => p.onAskRevoke(t)} />)}
        </ul>
      )}
      {inactive.length > 0 ? (
        <details style={{ marginTop: '8px' }}>
          <summary style={{ cursor: 'pointer', fontSize: '13px' }}>Show {inactive.length} expired or revoked</summary>
          <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }} aria-label="Expired or revoked other connector credentials">
            {inactive.map((t) => <CredentialRow key={t.id} t={t} now={p.now} />)}
          </ul>
        </details>
      ) : null}
      <Dialog
        isOpen={Boolean(p.revokeTarget)}
        onClose={p.onCancelRevoke}
        title={`Revoke “${p.revokeTarget?.name ?? ''}”?`}
        description="Anything still using this credential loses access to JobQuest immediately. Findings it already saved are kept. This cannot be undone."
        footer={<><span className="grow" /><Button onClick={p.onCancelRevoke}>Cancel</Button><Button variant="danger" isLoading={p.revoking} onClick={p.onConfirmRevoke}>Revoke credential</Button></>}
      >
        <p className="muted">{p.revokeTarget ? `${p.revokeTarget.token_prefix}… · ${providerOfCredential(p.revokeTarget)} · expires ${day(p.revokeTarget.expires_at)}` : ''}</p>
      </Dialog>
    </section>
  );
}

export function LegacyCredentialsPanel({ activeWorkspaceId, session }: { activeWorkspaceId: string | null; session: PublicSession }) {
  const [load, setLoad] = useState<LegacyLoad>({ status: 'loading' });
  const [revokeTarget, setRevokeTarget] = useState<ConnectorTokenMetadata | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!activeWorkspaceId) return undefined;
    let live = true;
    listConnectorTokens(activeWorkspaceId, session).then(
      (tokens) => live && setLoad({ status: 'ready', tokens }),
      () => live && setLoad({ status: 'error', message: 'Could not load connector credentials.' }),
    );
    return () => { live = false; };
  }, [activeWorkspaceId, attempt, session.access_token]);

  const confirm = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    setRevokeError(null);
    try { await revokeConnectorToken(revokeTarget.id, session); setRevokeTarget(null); refresh(); }
    catch { setRevokeError('Couldn’t revoke the credential. Try again.'); setRevokeTarget(null); }
    finally { setRevoking(false); }
  };

  return (
    <LegacyCredentialsView
      load={activeWorkspaceId ? load : { status: 'ready', tokens: [] }}
      revokeTarget={revokeTarget} revoking={revoking} revokeError={revokeError}
      onAskRevoke={setRevokeTarget} onCancelRevoke={() => setRevokeTarget(null)} onConfirmRevoke={() => void confirm()} onRetry={refresh}
    />
  );
}
