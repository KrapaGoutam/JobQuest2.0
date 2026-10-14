import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PublicSession } from '../api';
import { dismissAiFinding, fetchRecruiterPage, fetchSourceConfigured } from '../api/aiSources';
import { fetchLeadMatches } from '../api/aiJobDiscovery';
import { fetchLastRecruiterRun } from '../api/aiRecruiterDiscovery';
import { useProfileTimeZone } from '../hooks/useProfileTimeZone';
import { formatInZone } from '../lib/time';
import { aiProviderLabel, formatConfidence } from '../lib/aiHub';
import {
  DEFAULT_RECRUITER_FILTERS, RECRUITER_MODE_FILTERS, RECRUITER_VERIFICATION_FILTERS, VERIFICATION_BASIS_LABELS, relationshipLabel, resolveDateRange,
  type EmailMatchView, type RecruiterFilters, type RecruiterModeFilter, type RecruiterVerificationFilter, type RecruiterView,
} from '../lib/aiSources';
import { recruiterRunSummary, type DiscoveryRunView } from '../lib/aiRecruiterDiscovery';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  DateRangeFields, DismissControl, ExternalLink, FilterField, ProviderSelect, ResultsSummary, SourceEmpty, SourceError, SourceFilterForm,
  SourceLoading, SourcePager, StatusSelect, useSourceConfigured, useSourceRows, wrap, type SourceLoadState,
} from './AiHubSourceParts';

// Recruiter intelligence is cited, public-source research. Nothing here is inferred: a person is shown only with the source the
// provider cited, a person JobQuest could not verify is labelled UNCERTAIN, and a work email appears only when the provider cited where
// it found it. Outreach text is a DRAFT for the owner to read and copy; there is no send, no "contacted" state and no way to change an
// application, contact or task from here.

// ---- grouping (pure) ---------------------------------------------------------------------------------------

export type RecruiterGroupId = 'job_linked' | 'target_company' | 'other';
export interface RecruiterGroup { id: RecruiterGroupId; title: string; description: string; rows: RecruiterView[] }

const GROUPS: ReadonlyArray<Omit<RecruiterGroup, 'rows'>> = [
  { id: 'job_linked', title: 'Job-linked', description: 'People researched for a job lead JobQuest already holds.' },
  { id: 'target_company', title: 'Target companies', description: 'Networking contacts at companies on your target list.' },
  { id: 'other', title: 'Other', description: 'Earlier research or contacts not tied to a job lead or your target list.' },
];

/** Splits one page of results by the (server-verified) discovery mode. Empty groups are omitted; order within a group is preserved. */
export function groupRecruiters(rows: readonly RecruiterView[]): RecruiterGroup[] {
  return GROUPS.map((g) => ({ ...g, rows: rows.filter((r) => (r.discoveryMode ?? 'other') === g.id) })).filter((g) => g.rows.length > 0);
}

// ---- presentational ----------------------------------------------------------------------------------------

function ApplicationRelation({ match }: { match?: EmailMatchView }) {
  if (!match) return null;
  if (match.state === 'MATCHED' && match.application) {
    return <StatusBadge variant="success">You already have an application for this job</StatusBadge>;
  }
  if (match.state === 'POSSIBLE' && match.possible.length > 0) return <StatusBadge variant="muted">Possibly tracked, not confirmed</StatusBadge>;
  return null;
}

function Draft({ title, label, text, copyLabel }: { title: string; label: string; text: string; copyLabel: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); }
  };
  return (
    <details>
      <summary style={{ cursor: 'pointer' }}>{title}</summary>
      <div style={{ display: 'grid', gap: '6px', marginTop: '6px' }}>
        <p className="muted small" style={{ margin: 0 }}>{label}</p>
        <p style={{ margin: 0, whiteSpace: 'pre-wrap', ...wrap }}>{text}</p>
        <div><Button size="sm" variant="secondary" onClick={copy} aria-label={copyLabel}>{copied ? 'Copied' : 'Copy'}</Button></div>
      </div>
    </details>
  );
}

export function RecruiterCard({ item, timeZone, currentUserId, match, onDismiss }: {
  item: RecruiterView; timeZone: string; currentUserId: string | null; match?: EmailMatchView; onDismiss?: (r: RecruiterView) => Promise<void>;
}) {
  const conf = formatConfidence(item.confidence);
  const canDismiss = onDismiss && currentUserId === item.ownerId && (item.status === 'NEW' || item.status === 'REVIEWED');
  const job = item.relatedLead
    ? `${item.relatedLead.title} at ${item.relatedLead.company}`
    : item.relatedJob && (item.relatedJob.title || item.relatedJob.company)
      ? `${[item.relatedJob.title, item.relatedJob.company].filter(Boolean).join(' at ')} (reported by the provider; not in your job leads)`
      : '';
  const basis = item.verificationBasis ? VERIFICATION_BASIS_LABELS[item.verificationBasis] : null;
  const seenLater = item.lastSeenAt && item.lastSeenAt !== item.discoveredAt && Date.parse(item.lastSeenAt) - Date.parse(item.discoveredAt) > 60_000;
  return (
    <Card>
      <CardBody>
        <article aria-label={`${item.name}, ${item.company}`} style={{ display: 'grid', gap: '8px', ...wrap }}>
          <header style={{ display: 'grid', gap: '4px' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <StatusBadge variant={item.verified ? 'success' : 'warning'}>{item.verified ? 'Verified' : 'Uncertain'}</StatusBadge>
              {item.relationship && <StatusBadge variant="muted">{relationshipLabel(item.relationship)}</StatusBadge>}
              {item.postingContact && <StatusBadge variant="muted">Named in the posting</StatusBadge>}
              <ApplicationRelation match={match} />
              {item.status === 'DISMISSED' && <StatusBadge variant="muted">Dismissed</StatusBadge>}
            </div>
            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600, ...wrap }}>{item.name}</h4>
            <span style={wrap}>{[item.roleTitle, item.company].filter(Boolean).join(' · ')}</span>
          </header>
          {!item.verified && (
            <p className="small" style={{ margin: 0 }}>
              Not verified: the company or role association was not proven{item.uncertainFields.length > 0 ? ` (${item.uncertainFields.join(', ')})` : ''}. Check the source before you rely on it.
            </p>
          )}
          {item.why && <p style={{ margin: 0, ...wrap }}><strong>Why this person: </strong>{item.why}</p>}
          {item.summary && <p style={{ margin: 0, ...wrap }}>{item.summary}</p>}
          <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, auto) 1fr', gap: '4px 12px', margin: 0 }}>
            {job && <><dt className="muted small">Role being hired for</dt><dd style={{ margin: 0, ...wrap }}>{job}</dd></>}
            {item.verified && basis && <><dt className="muted small">Verified by</dt><dd style={{ margin: 0 }}>{basis}</dd></>}
            {(item.sourceUrl || item.sourceName) && (
              <>
                <dt className="muted small">Public source</dt>
                <dd style={{ margin: 0, ...wrap }}>{item.sourceUrl ? <ExternalLink href={item.sourceUrl}>{item.sourceName ?? 'Source page'}</ExternalLink> : item.sourceName}</dd>
              </>
            )}
            {item.profileUrl && <><dt className="muted small">Public profile</dt><dd style={{ margin: 0, ...wrap }}><ExternalLink href={item.profileUrl}>Profile page</ExternalLink></dd></>}
            {item.contact && (
              <>
                <dt className="muted small">Work email</dt>
                <dd style={{ margin: 0, ...wrap }}>{item.contact.email} — <ExternalLink href={item.contact.sourceUrl}>cited source</ExternalLink></dd>
              </>
            )}
            <dt className="muted small">First surfaced</dt>
            <dd style={{ margin: 0 }}>{formatInZone(item.discoveredAt, timeZone, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
            {seenLater && <><dt className="muted small">Last surfaced</dt><dd style={{ margin: 0 }}>{formatInZone(item.lastSeenAt, timeZone, { dateStyle: 'medium', timeStyle: 'short' })}</dd></>}
            <dt className="muted small">Found by</dt>
            <dd style={{ margin: 0 }}>{aiProviderLabel(item.provider)}{conf ? ` · ${conf} confidence` : ''}</dd>
          </dl>
          {item.draftNote && <Draft title="Draft connection note (not sent)" label="A draft for you to review and edit. JobQuest never sends it." text={item.draftNote} copyLabel={`Copy the connection note for ${item.name}`} />}
          {item.draftEmail && (
            <Draft title="Draft email (not sent)" label="A draft for you to review and edit. JobQuest never sends it." text={`Subject: ${item.draftEmail.subject}\n\n${item.draftEmail.body}`} copyLabel={`Copy the email draft for ${item.name}`} />
          )}
          {canDismiss && <div><DismissControl label={`${item.name}, ${item.company}`} onDismiss={() => onDismiss(item)} /></div>}
        </article>
      </CardBody>
    </Card>
  );
}

export interface RecruiterPanelProps {
  state: SourceLoadState<RecruiterView>;
  draft: RecruiterFilters;
  page: number;
  timeZone: string;
  currentUserId: string | null;
  configured: boolean | null;
  filtered: boolean;
  message?: string | null;
  /** Server-derived application relation of each person's related lead, by lead id (optional, read-only context). */
  matches?: Record<string, EmailMatchView>;
  matchesUnavailable?: boolean;
  lastRun?: DiscoveryRunView | null;
  onDraft: (f: RecruiterFilters) => void;
  onApply: () => void;
  onReset: () => void;
  onPage: (p: number) => void;
  onRetry?: () => void;
  onDismiss?: (r: RecruiterView) => Promise<void>;
  onOpenSettings?: () => void;
}

export function AiHubRecruitersPanel(p: RecruiterPanelProps) {
  const d = p.draft;
  const set = (patch: Partial<RecruiterFilters>) => p.onDraft({ ...d, ...patch });
  const groups = useMemo(() => (p.state.status === 'ready' ? groupRecruiters(p.state.rows) : []), [p.state]);
  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <h2 style={{ margin: 0, fontSize: '18px' }}>Recruiters to connect with</h2>
      <p className="muted small" style={{ margin: 0 }}>Recruiters and hiring contacts your AI provider found in public sources, each with the source it cited. JobQuest does not guess contact details, send anything or contact anyone for you; you decide whether and how to reach out.</p>
      {p.lastRun && (
        <p className="small" role="status" data-testid="recruiter-run-summary" style={{ margin: 0 }}>
          <strong>Last recruiter research:</strong> {aiProviderLabel(p.lastRun.provider)} · {formatInZone(p.lastRun.at, p.timeZone, { dateStyle: 'medium', timeStyle: 'short' })}. {recruiterRunSummary(p.lastRun)}
        </p>
      )}
      <SourceFilterForm label="Recruiter filters" onApply={p.onApply} onReset={p.onReset} message={p.message}>
        <FilterField label="Search name or company" grow={2}><Input type="search" value={d.search} maxLength={80} onChange={(e) => set({ search: e.target.value })} /></FilterField>
        <FilterField label="Company"><Input value={d.company} maxLength={80} onChange={(e) => set({ company: e.target.value })} /></FilterField>
        <FilterField label="Show">
          <Select value={d.mode} onChange={(e) => set({ mode: e.target.value as RecruiterModeFilter })}>
            {RECRUITER_MODE_FILTERS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Verification">
          <Select value={d.verification} onChange={(e) => set({ verification: e.target.value as RecruiterVerificationFilter })}>
            {RECRUITER_VERIFICATION_FILTERS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </Select>
        </FilterField>
        <ProviderSelect value={d.provider} onChange={(v) => set({ provider: v })} />
        <StatusSelect value={d.status} onChange={(v) => set({ status: v })} />
        <DateRangeFields label="Discovered" value={d.discovered} onChange={(v) => set({ discovered: v })} />
      </SourceFilterForm>

      {p.state.status === 'loading' && <SourceLoading label="recruiter intelligence" />}
      {p.state.status === 'error' && <SourceError label="Recruiter intelligence" onRetry={p.onRetry} />}
      {p.state.status === 'ready' && (
        <>
          <ResultsSummary count={p.state.rows.length} hasNext={p.state.hasNext} page={p.page} noun="recruiter" />
          {p.matchesUnavailable && <p className="muted small" role="status" style={{ margin: 0 }}>Checking whether you already have an application for a job is unavailable right now. Contacts are shown without it.</p>}
          {p.state.rows.length === 0
            ? <SourceEmpty kind="recruiters" configured={p.configured} filtered={p.filtered} onOpenSettings={p.onOpenSettings} />
            : groups.map((g): ReactNode => (
              <section key={g.id} aria-labelledby={`recruiter-group-${g.id}`} data-testid={`recruiter-group-${g.id}`} style={{ display: 'grid', gap: '10px' }}>
                <div>
                  <h3 id={`recruiter-group-${g.id}`} style={{ margin: 0, fontSize: '16px' }}>{g.title}</h3>
                  <p className="muted small" style={{ margin: 0 }}>{g.description}</p>
                </div>
                <ul aria-label={`${g.title} recruiters`} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '12px' }}>
                  {g.rows.map((r) => <li key={r.id}><RecruiterCard item={r} timeZone={p.timeZone} currentUserId={p.currentUserId} match={r.relatedLead ? p.matches?.[r.relatedLead.id] : undefined} onDismiss={p.onDismiss} /></li>)}
                </ul>
              </section>
            ))}
          <SourcePager page={p.page} hasNext={p.state.hasNext} onPage={p.onPage} label="Recruiter intelligence" />
        </>
      )}
    </div>
  );
}

export function AiHubRecruiters({ activeWorkspaceId, currentUserId, session = null, onNavigate }: {
  activeWorkspaceId: string | null; currentUserId: string | null; session?: PublicSession | null; onNavigate?: (path: string) => void;
}) {
  const { timeZone, loaded } = useProfileTimeZone(currentUserId);
  const [draft, setDraft] = useState<RecruiterFilters>(DEFAULT_RECRUITER_FILTERS);
  const [applied, setApplied] = useState<RecruiterFilters>(DEFAULT_RECRUITER_FILTERS);
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [matches, setMatches] = useState<Record<string, EmailMatchView>>({});
  const [matchesUnavailable, setMatchesUnavailable] = useState(false);
  const [lastRun, setLastRun] = useState<DiscoveryRunView | null>(null);
  const enabled = Boolean(activeWorkspaceId) && loaded;
  const { state, retry } = useSourceRows<RecruiterView>(enabled, [activeWorkspaceId, applied, page, timeZone], () => fetchRecruiterPage(activeWorkspaceId!, applied, timeZone, page));
  const configured = useSourceConfigured(enabled, () => fetchSourceConfigured(activeWorkspaceId!, 'recruiters'), [activeWorkspaceId]);
  const filtered = JSON.stringify(applied) !== JSON.stringify(DEFAULT_RECRUITER_FILTERS);

  // Source health of the newest recruiter run. Optional context: a failure hides the line, never the contacts.
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    fetchLastRecruiterRun(activeWorkspaceId!).then((r) => { if (!cancelled) setLastRun(r); }, () => { if (!cancelled) setLastRun(null); });
    return () => { cancelled = true; };
  }, [enabled, activeWorkspaceId]);

  // Whether the related job is already one of the owner's applications: server-derived and read-only (never a provider id). Optional context.
  const leadIds = useMemo(() => (state.status === 'ready' ? [...new Set(state.rows.flatMap((r) => (r.relatedLead ? [r.relatedLead.id] : [])))] : []), [state]);
  useEffect(() => {
    if (!enabled || !session || leadIds.length === 0) { setMatches({}); setMatchesUnavailable(false); return undefined; }
    let cancelled = false;
    fetchLeadMatches(activeWorkspaceId!, session, leadIds).then(
      (m) => { if (!cancelled) { setMatches(m); setMatchesUnavailable(false); } },
      () => { if (!cancelled) { setMatches({}); setMatchesUnavailable(true); } },
    );
    return () => { cancelled = true; };
  }, [enabled, session, activeWorkspaceId, leadIds]);

  const onApply = useCallback(() => {
    const r = resolveDateRange(draft.discovered, timeZone);
    if (!r.ok) { setMessage(`Discovered dates: ${r.message}`); return; }
    setMessage(null); setPage(0); setApplied(draft);
  }, [draft, timeZone]);
  const onReset = useCallback(() => { setMessage(null); setDraft(DEFAULT_RECRUITER_FILTERS); setApplied(DEFAULT_RECRUITER_FILTERS); setPage(0); }, []);
  const onDismiss = useCallback(async (r: RecruiterView) => { await dismissAiFinding(r.id); retry(); }, [retry]);
  return (
    <AiHubRecruitersPanel
      state={state} draft={draft} page={page} timeZone={timeZone} currentUserId={currentUserId} configured={configured} filtered={filtered} message={message}
      matches={matches} matchesUnavailable={matchesUnavailable} lastRun={lastRun}
      onDraft={setDraft} onApply={onApply} onReset={onReset} onPage={setPage} onRetry={retry} onDismiss={onDismiss}
      onOpenSettings={onNavigate ? () => onNavigate('/settings/ai') : undefined}
    />
  );
}
