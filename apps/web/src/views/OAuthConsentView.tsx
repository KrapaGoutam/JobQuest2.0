import { useEffect, useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import type { PublicSession } from '../api';
import { decideOAuthAuthorizationRequest, getOAuthAuthorizationRequest, type OAuthAuthorizationRequest } from '../api/oauth';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';

const SCOPE_COPY: Record<string, string> = {
  'jobquest:read': 'Read tracked applications (never private notes, salary, or contacts)',
  'ai:read': 'Read AI Hub runs, findings, suggestions, leads, email summaries, recruiter intel, calendar intel, and digests',
  'ai:ingest': 'Save structured AI Hub findings and inert suggestions',
};

export function OAuthConsentView({ requestId, session }: { requestId: string | null; session: PublicSession }) {
  const [request, setRequest] = useState<OAuthAuthorizationRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);
  useEffect(() => {
    if (!requestId) { setError('This authorization request is malformed.'); return; }
    let live = true;
    getOAuthAuthorizationRequest(requestId, session)
      .then((value) => { if (live) setRequest(value); })
      .catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : 'This authorization request is invalid or expired.'); });
    return () => { live = false; };
  }, [requestId, session]);

  async function decide(approve: boolean) {
    if (!requestId) return;
    setBusy(approve ? 'approve' : 'deny'); setError(null);
    try {
      const redirect = await decideOAuthAuthorizationRequest(requestId, approve, session);
      window.location.assign(redirect);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record your consent decision.');
      setBusy(null);
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: '24px auto', width: '100%' }} data-testid="oauth-consent">
      <Card>
        <CardHeader><CardTitle>Authorize JobQuest access</CardTitle></CardHeader>
        <CardBody>
          {error ? <div className="banner danger" role="alert"><AlertTriangle size={18} /><span>{error}</span></div> : null}
          {!request && !error ? <p aria-live="polite">Loading authorization request…</p> : null}
          {request ? (
            <div style={{ display: 'grid', gap: 16 }}>
              <div className="banner info"><ShieldCheck size={18} /><span>
                <b>{request.client_name}</b> ({request.provider === 'chatgpt' ? 'ChatGPT' : 'Gemini'}) wants access to
                workspace <b>{request.workspace_name}</b> as your signed-in JobQuest account.
              </span></div>
              <div>
                <b>Permissions requested</b>
                <ul>{request.scopes.map((scope) => <li key={scope}><code>{scope}</code> — {SCOPE_COPY[scope] ?? 'Unsupported permission'}</li>)}</ul>
              </div>
              <div className="banner warning" role="note">
                The provider cannot call JobQuest’s controlled-action execution endpoints. Applications, tasks, contacts,
                email, and calendars cannot be changed through this OAuth connection. AI ingestion stores findings only.
              </div>
              <dl>
                <dt>Client</dt><dd><code>{request.client_id}</code></dd>
                <dt>Redirect</dt><dd style={{ overflowWrap: 'anywhere' }}>{request.redirect_uri}</dd>
                <dt>Token audience</dt><dd style={{ overflowWrap: 'anywhere' }}>{request.resource}</dd>
              </dl>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                <Button disabled={busy !== null} isLoading={busy === 'deny'} onClick={() => void decide(false)}>Deny</Button>
                <Button variant="primary" disabled={busy !== null} isLoading={busy === 'approve'} onClick={() => void decide(true)}>Allow access</Button>
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
