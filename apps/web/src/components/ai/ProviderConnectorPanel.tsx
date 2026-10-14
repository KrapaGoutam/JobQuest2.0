import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { AlertTriangle, Check, Copy, ShieldCheck } from 'lucide-react';
import type { PublicSession } from '../../api';
import { createConnectorToken, listConnectorTokens, revokeConnectorToken } from '../../api/aiConnectors';
import {
  CLAUDE_DEFAULT_EXPIRY_DAYS, CLAUDE_DEFAULT_PRESET, CLAUDE_EXPIRY_CHOICES, bearerHeaderValue,
  buildMcpUrl, effectiveStatus, lastUsedLabel, scopeLabel,
  type ClaudeExpiryDays, type ClaudePresetId, type ConnectorTokenMetadata,
} from '../../lib/claudeConnector';
import { CLAUDE_PROVIDER, presetScopesFor, summarizeProvider, type CapabilityStatus, type ProviderConnectorConfig } from '../../lib/providerConnectors';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Select } from '../ui/Select';

// AI-4 / AI-9: Settings -> AI & Automation -> Providers -> <provider>. One generic panel serves Claude, Gemini and ChatGPT
// (same connector-token API, no provider credential table); the provider only changes copy and truthful capability notes.
// Claude is an ATTENDED connector: JobQuest issues a scoped token, the user pastes it into
// Claude's custom-connector header, and token metadata is the only evidence of
// use. The raw token lives ONLY in this component's `revealed` state (shown once,
// cleared on close/unmount); it is never written to storage, the URL or a cache.

export type ProviderLoad =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; tokens: ConnectorTokenMetadata[] };
export type ClaudeLoad = ProviderLoad;

export interface ClaudeRevealed { token: string; metadata: ConnectorTokenMetadata }

export interface ProviderConnectorViewProps {
  /** Defaults to Claude so the AI-4 usage is unchanged. */
  provider?: ProviderConnectorConfig;
  load: ProviderLoad;
  mcpUrl: string;
  setupOpen: boolean;
  preset: ClaudePresetId;
  expiry: ClaudeExpiryDays;
  creating: boolean;
  createError: string | null;
  revealed: ClaudeRevealed | null;
  copied: 'token' | 'url' | 'header' | null;
  copyError: string | null;
  revokeTarget: ConnectorTokenMetadata | null;
  revoking: boolean;
  revokeError: string | null;
  now?: number;
  onOpenSetup(): void;
  onCloseSetup(): void;
  onPreset(id: ClaudePresetId): void;
  onExpiry(days: ClaudeExpiryDays): void;
  onCreate(): void;
  onCopy(kind: 'token' | 'url' | 'header'): void;
  onCloseReveal(): void;
  onAskRevoke(token: ConnectorTokenMetadata): void;
  onCancelRevoke(): void;
  onConfirmRevoke(): void;
}
export type ClaudeConnectorViewProps = ProviderConnectorViewProps;

const rowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', padding: '6px 0', alignItems: 'center' };
const mutedSmall: CSSProperties = { margin: '4px 0 0', fontSize: '13px' };

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}
const formatDay = (iso: string): string => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));

function TokenRow({ token, now, onRevoke }: { token: ConnectorTokenMetadata; now?: number; onRevoke?: () => void }) {
  const status = effectiveStatus(token, now);
  return (
    <li style={{ ...rowStyle, alignItems: 'flex-start', borderTop: '1px solid var(--color-border)' }}>
      <div style={{ minWidth: 0 }}>
        <div><b>{token.name}</b> <code>{token.token_prefix}…</code> <span className={`extension-token-status ${status.toLowerCase()}`}>{status.toLowerCase()}</span></div>
        <div className="muted" style={mutedSmall}>{token.scopes.map(scopeLabel).join(' · ')}</div>
        <div className="muted" style={mutedSmall}>
          Created {formatDay(token.created_at)} · {status === 'REVOKED' && token.revoked_at ? `Revoked ${formatDay(token.revoked_at)}` : `${status === 'EXPIRED' ? 'Expired' : 'Expires'} ${formatDay(token.expires_at)}`} · {lastUsedLabel(token.last_used_at, formatDate)}
        </div>
      </div>
      {onRevoke ? <Button size="sm" variant="danger-outline" onClick={onRevoke}>Revoke</Button> : null}
    </li>
  );
}

const CAPABILITY_LABELS: Record<CapabilityStatus, string> = {
  VERIFIED: 'Verified', DOCUMENTED: 'Documented', 'APPROVAL-GATED': 'Approval required', 'PLAN-GATED': 'Not available on this plan',
  'NOT SUPPORTED': 'Not supported', 'NOT TESTED': 'Not tested',
};

export function ProviderConnectorView(p: ProviderConnectorViewProps) {
  const cfg = p.provider ?? CLAUDE_PROVIDER;
  const summary = p.load.status === 'ready' ? summarizeProvider(cfg, p.load.tokens, p.now) : null;
  const preset = cfg.presets.find((x) => x.id === p.preset) ?? cfg.presets[0]!;
  return (
    <div data-testid={cfg.testId}>
      <div style={rowStyle}>
        <span>{cfg.name}</span>
        <span style={{ display: 'inline-flex', gap: '10px', alignItems: 'center' }}>
          <b>{p.load.status === 'loading' ? 'Checking…' : p.load.status === 'error' ? 'Status unavailable' : summary!.label}</b>
          {p.load.status === 'ready' ? <Button size="sm" variant={summary!.active.length === 0 ? 'primary' : 'secondary'} onClick={p.onOpenSetup}>{summary!.active.length === 0 ? cfg.setupButton : cfg.addAnotherButton}</Button> : null}
        </span>
      </div>
      <p className="muted" style={mutedSmall}>{cfg.intro}</p>
      {cfg.capabilities.length > 0 ? (
        <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }} aria-label={`${cfg.name} capabilities`}>
          {cfg.capabilities.map((c) => (
            <li key={c.label} className="muted" style={mutedSmall}><b>{c.label}:</b> {CAPABILITY_LABELS[c.status]}. {c.text}</li>
          ))}
        </ul>
      ) : null}
      {summary && cfg.showLapsedState && summary.lastUsedAt ? <p className="muted" style={mutedSmall}>{lastUsedLabel(summary.lastUsedAt, formatDate)}</p> : null}

      {p.load.status === 'error' ? <p role="alert" style={{ ...mutedSmall, color: 'var(--color-danger)' }}>{p.load.message}</p> : null}
      {p.revokeError ? <p role="alert" style={{ ...mutedSmall, color: 'var(--color-danger)' }}>{p.revokeError}</p> : null}

      {summary && summary.active.length > 0 ? (
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }} aria-label={cfg.activeListLabel}>
          {summary.active.map((t) => <TokenRow key={t.id} token={t} now={p.now} onRevoke={() => p.onAskRevoke(t)} />)}
        </ul>
      ) : null}
      {summary && summary.previous.length > 0 ? (
        <details style={{ marginTop: '8px' }}>
          <summary>Previous credentials ({summary.previous.length})</summary>
          <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
            {summary.previous.map((t) => <TokenRow key={t.id} token={t} now={p.now} />)}
          </ul>
        </details>
      ) : null}

      <Dialog
        isOpen={p.setupOpen}
        onClose={p.onCloseSetup}
        title={cfg.setupTitle}
        description={cfg.setupDescription}
        footer={<><span className="grow" /><Button onClick={p.onCloseSetup}>Cancel</Button><Button variant="primary" isLoading={p.creating} onClick={p.onCreate}>{cfg.createButton}</Button></>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {p.createError ? <div className="banner danger" role="alert"><AlertTriangle size={17} /><span>{p.createError}</span></div> : null}
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 600, marginBottom: '6px' }}>Permissions</legend>
            {cfg.presets.map((x) => (
              <label key={x.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '4px 0' }}>
                <input type="radio" name={`${cfg.id}-preset`} value={x.id} checked={p.preset === x.id} onChange={() => p.onPreset(x.id)} />
                <span><b>{x.label}</b>{x.id === CLAUDE_DEFAULT_PRESET ? ' (recommended)' : ''}<br /><span className="muted" style={{ fontSize: '13px' }}>{x.description}</span></span>
              </label>
            ))}
            <span className="muted" style={{ fontSize: '13px' }}>{cfg.presetGrantNote(preset.scopes.map(scopeLabel).join(', '))}</span>
          </fieldset>
          <div>
            <label htmlFor={`${cfg.id}-expiry`} style={{ fontWeight: 600 }}>Expires</label>
            <Select id={`${cfg.id}-expiry`} value={String(p.expiry)} onChange={(e) => p.onExpiry(Number(e.target.value) as ClaudeExpiryDays)} options={CLAUDE_EXPIRY_CHOICES.map((d) => ({ value: String(d), label: `${d} days` }))} />
            <span className="muted" style={{ fontSize: '13px' }}>Credentials always expire. You can revoke one at any time.</span>
          </div>
        </div>
      </Dialog>

      <Dialog
        isOpen={Boolean(p.revealed)}
        onClose={p.onCloseReveal}
        title={cfg.revealTitle}
        description={cfg.revealDescription}
        maxWidth={620}
        footer={<><span className="grow" /><Button variant="primary" onClick={p.onCloseReveal}>Done, I copied it</Button></>}
      >
        {p.revealed ? (
          <div className="extension-reveal">
            {p.copyError ? <div className="banner danger" role="alert"><AlertTriangle size={17} /><span>{p.copyError}</span></div> : null}
            <div>
              <b>Connector token</b>
              <div className="extension-secret"><code>{p.revealed.token}</code><Button size="sm" variant="primary" leftIcon={p.copied === 'token' ? <Check size={14} /> : <Copy size={14} />} onClick={() => p.onCopy('token')}>{p.copied === 'token' ? 'Copied' : 'Copy token'}</Button></div>
            </div>
            <div>
              <b>Remote MCP URL</b>
              <div className="extension-secret"><code>{p.mcpUrl}</code><Button size="sm" leftIcon={p.copied === 'url' ? <Check size={14} /> : <Copy size={14} />} onClick={() => p.onCopy('url')}>{p.copied === 'url' ? 'Copied' : 'Copy URL'}</Button></div>
            </div>
            <div>
              <b>Request header</b>
              <div className="extension-secret"><code>{cfg.authHeaderName}: {bearerHeaderValue('<connector token>')}</code><Button size="sm" leftIcon={p.copied === 'header' ? <Check size={14} /> : <Copy size={14} />} onClick={() => p.onCopy('header')}>{p.copied === 'header' ? 'Copied' : 'Copy header value'}</Button></div>
              <span className="muted" style={{ fontSize: '13px' }}>The copied value is “Bearer ” followed by your token.</span>
            </div>
            <div>
              <b>{cfg.inProviderHeading}</b>
              <ol style={{ margin: '6px 0 0', paddingLeft: '20px' }}>{cfg.setupSteps.map((s) => <li key={s}>{s}</li>)}</ol>
            </div>
            <div className="banner info"><ShieldCheck size={17} /><ul style={{ margin: 0, paddingLeft: '18px' }}>{cfg.securityNotes.map((n) => <li key={n}>{n}</li>)}</ul></div>
            <dl>
              <dt>Name</dt><dd>{p.revealed.metadata.name}</dd>
              <dt>Access</dt><dd>{p.revealed.metadata.scopes.map(scopeLabel).join(', ')}</dd>
              <dt>Expires</dt><dd>{formatDate(p.revealed.metadata.expires_at)}</dd>
            </dl>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        isOpen={Boolean(p.revokeTarget)}
        onClose={p.onCancelRevoke}
        title={`Revoke “${p.revokeTarget?.name ?? ''}”?`}
        description={cfg.revokeDescription}
        footer={<><span className="grow" /><Button onClick={p.onCancelRevoke}>Cancel</Button><Button variant="danger" isLoading={p.revoking} onClick={p.onConfirmRevoke}>Revoke credential</Button></>}
      >
        <p className="muted">{p.revokeTarget ? `${p.revokeTarget.token_prefix}… · expires ${formatDay(p.revokeTarget.expires_at)}` : ''}</p>
      </Dialog>
    </div>
  );
}

async function writeClipboard(value: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
  await navigator.clipboard.writeText(value);
}

export function ProviderConnectorPanel({ provider, activeWorkspaceId, session }: { provider: ProviderConnectorConfig; activeWorkspaceId: string | null; session: PublicSession }) {
  const [load, setLoad] = useState<ProviderLoad>({ status: 'loading' });
  const [setupOpen, setSetupOpen] = useState(false);
  const [preset, setPreset] = useState<ClaudePresetId>(CLAUDE_DEFAULT_PRESET);
  const [expiry, setExpiry] = useState<ClaudeExpiryDays>(CLAUDE_DEFAULT_EXPIRY_DAYS);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // Ephemeral: the ONLY place the raw token exists on the client.
  const [revealed, setRevealed] = useState<ClaudeRevealed | null>(null);
  const [copied, setCopied] = useState<'token' | 'url' | 'header' | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ConnectorTokenMetadata | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!activeWorkspaceId) return;
    try { setLoad({ status: 'ready', tokens: await listConnectorTokens(activeWorkspaceId, session) }); }
    catch (cause) { setLoad({ status: 'error', message: cause instanceof Error ? cause.message : 'Could not load connector credentials.' }); }
  }, [activeWorkspaceId, session]);

  useEffect(() => { setLoad({ status: 'loading' }); void refresh(); }, [refresh]);

  async function create() {
    if (!activeWorkspaceId) return;
    setCreating(true); setCreateError(null);
    try {
      const result = await createConnectorToken(
        { workspace_id: activeWorkspaceId, name: provider.connectorName, scopes: presetScopesFor(provider, preset), expires_in_days: expiry, provider: provider.id },
        session,
      );
      setSetupOpen(false);
      setCopied(null); setCopyError(null);
      setRevealed({ token: result.token, metadata: result.metadata });
      await refresh();
    } catch (cause) { setCreateError(cause instanceof Error ? cause.message : 'Could not create the connector credential.'); }
    finally { setCreating(false); }
  }

  async function copy(kind: 'token' | 'url' | 'header') {
    if (!revealed) return;
    const value = kind === 'token' ? revealed.token : kind === 'url' ? buildMcpUrl(window.location.origin) : bearerHeaderValue(revealed.token);
    try { await writeClipboard(value); setCopied(kind); setCopyError(null); }
    catch { setCopyError('Copy failed. Select the text and copy it manually.'); }
  }

  async function confirmRevoke() {
    if (!revokeTarget) return;
    setRevoking(true); setRevokeError(null);
    try { await revokeConnectorToken(revokeTarget.id, session); setRevokeTarget(null); await refresh(); }
    catch (cause) { setRevokeError(cause instanceof Error ? cause.message : 'Could not revoke the connector credential.'); setRevokeTarget(null); }
    finally { setRevoking(false); }
  }

  if (!activeWorkspaceId) return <div style={rowStyle}><span>{provider.name}</span><b>Select a workspace</b></div>;

  return (
    <ProviderConnectorView
      provider={provider}
      load={load}
      mcpUrl={buildMcpUrl(window.location.origin)}
      setupOpen={setupOpen}
      preset={preset}
      expiry={expiry}
      creating={creating}
      createError={createError}
      revealed={revealed}
      copied={copied}
      copyError={copyError}
      revokeTarget={revokeTarget}
      revoking={revoking}
      revokeError={revokeError}
      onOpenSetup={() => { setCreateError(null); setSetupOpen(true); }}
      onCloseSetup={() => setSetupOpen(false)}
      onPreset={setPreset}
      onExpiry={setExpiry}
      onCreate={() => void create()}
      onCopy={(k) => void copy(k)}
      onCloseReveal={() => { setRevealed(null); setCopied(null); setCopyError(null); }}
      onAskRevoke={(t) => { setRevokeError(null); setRevokeTarget(t); }}
      onCancelRevoke={() => setRevokeTarget(null)}
      onConfirmRevoke={() => void confirmRevoke()}
    />
  );
}
