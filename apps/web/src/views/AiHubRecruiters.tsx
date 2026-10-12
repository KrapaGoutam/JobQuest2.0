import { useCallback, useState } from 'react';
import { dismissAiFinding, fetchRecruiterPage, fetchSourceConfigured } from '../api/aiSources';
import { useProfileTimeZone } from '../hooks/useProfileTimeZone';
import { formatInZone } from '../lib/time';
import { aiProviderLabel, formatConfidence } from '../lib/aiHub';
import { DEFAULT_RECRUITER_FILTERS, relationshipLabel, resolveDateRange, type RecruiterFilters, type RecruiterView } from '../lib/aiSources';
import { Card, CardBody } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  DateRangeFields, DismissControl, ExternalLink, FilterField, ProviderSelect, ResultsSummary, SourceEmpty, SourceError, SourceFilterForm,
  SourceLoading, SourcePager, StatusSelect, useSourceConfigured, useSourceRows, wrap, type SourceLoadState,
} from './AiHubSourceParts';

// Recruiter intelligence is cited, public-source research. Nothing here is inferred: a person is shown
// only with the source the provider cited, uncertain facts are labelled, and contact details appear
// only when the provider cited where it found them. There is no "contactable" state and no outreach.

export function RecruiterCard({ item, timeZone, currentUserId, onDismiss }: { item: RecruiterView; timeZone: string; currentUserId: string | null; onDismiss?: (r: RecruiterView) => Promise<void> }) {
  const conf = formatConfidence(item.confidence);
  const canDismiss = onDismiss && currentUserId === item.ownerId && (item.status === 'NEW' || item.status === 'REVIEWED');
  const job = item.relatedLead
    ? `${item.relatedLead.title} at ${item.relatedLead.company} (stored job lead)`
    : item.relatedJob && (item.relatedJob.title || item.relatedJob.company)
      ? `${[item.relatedJob.title, item.relatedJob.company].filter(Boolean).join(' at ')} (reported by the provider; not in your job leads)`
      : '';
  return (
    <Card>
      <CardBody>
        <article aria-label={`${item.name}, ${item.company}`} style={{ display: 'grid', gap: '8px', ...wrap }}>
          <header style={{ display: 'grid', gap: '4px' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <StatusBadge variant={item.verified ? 'success' : 'warning'}>{item.verified ? 'Public source cited' : 'Unverified'}</StatusBadge>
              {item.relationship && <StatusBadge variant="muted">{relationshipLabel(item.relationship)}</StatusBadge>}
              {item.status === 'DISMISSED' && <StatusBadge variant="muted">Dismissed</StatusBadge>}
            </div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, ...wrap }}>{item.name}</h3>
            <span style={wrap}>{[item.roleTitle, item.company].filter(Boolean).join(' · ')}</span>
          </header>
          {item.uncertainFields.length > 0 && <p className="small" style={{ margin: 0 }}>The provider marked these as uncertain: {item.uncertainFields.join(', ')}.</p>}
          {item.summary && <p style={{ margin: 0, ...wrap }}>{item.summary}</p>}
          <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, auto) 1fr', gap: '4px 12px', margin: 0 }}>
            {job && <><dt className="muted small">Related job</dt><dd style={{ margin: 0, ...wrap }}>{job}</dd></>}
            {(item.sourceUrl || item.sourceName) && (
              <>
                <dt className="muted small">Public source</dt>
                <dd style={{ margin: 0, ...wrap }}>{item.sourceUrl ? <ExternalLink href={item.sourceUrl}>{item.sourceName ?? 'Source page'}</ExternalLink> : item.sourceName}</dd>
              </>
            )}
            {item.profileUrl && <><dt className="muted small">Public profile</dt><dd style={{ margin: 0, ...wrap }}><ExternalLink href={item.profileUrl}>Profile page</ExternalLink></dd></>}
            {item.contact && (
              <>
                <dt className="muted small">Public contact</dt>
                <dd style={{ margin: 0, ...wrap }}>
                  {[item.contact.email, item.contact.phone].filter(Boolean).join(' · ')} — <ExternalLink href={item.contact.sourceUrl}>cited source</ExternalLink>
                </dd>
              </>
            )}
            <dt className="muted small">Discovered</dt>
            <dd style={{ margin: 0 }}>{formatInZone(item.discoveredAt, timeZone, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
            <dt className="muted small">Found by</dt>
            <dd style={{ margin: 0 }}>{aiProviderLabel(item.provider)}{conf ? ` · ${conf} confidence` : ''}</dd>
          </dl>
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
  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <h2 style={{ margin: 0, fontSize: '18px' }}>Recruiter Intelligence</h2>
      <p className="muted small" style={{ margin: 0 }}>Recruiters and hiring contacts your AI provider found in public sources, each with the source it cited. JobQuest does not guess contact details or contact anyone for you.</p>
      <SourceFilterForm label="Recruiter filters" onApply={p.onApply} onReset={p.onReset} message={p.message}>
        <FilterField label="Search name or company" grow={2}><Input type="search" value={d.search} maxLength={80} onChange={(e) => set({ search: e.target.value })} /></FilterField>
        <FilterField label="Company"><Input value={d.company} maxLength={80} onChange={(e) => set({ company: e.target.value })} /></FilterField>
        <ProviderSelect value={d.provider} onChange={(v) => set({ provider: v })} />
        <StatusSelect value={d.status} onChange={(v) => set({ status: v })} />
        <DateRangeFields label="Discovered" value={d.discovered} onChange={(v) => set({ discovered: v })} />
      </SourceFilterForm>

      {p.state.status === 'loading' && <SourceLoading label="recruiter intelligence" />}
      {p.state.status === 'error' && <SourceError label="Recruiter intelligence" onRetry={p.onRetry} />}
      {p.state.status === 'ready' && (
        <>
          <ResultsSummary count={p.state.rows.length} hasNext={p.state.hasNext} page={p.page} noun="recruiter" />
          {p.state.rows.length === 0
            ? <SourceEmpty kind="recruiters" configured={p.configured} filtered={p.filtered} onOpenSettings={p.onOpenSettings} />
            : (
              <ul aria-label="Recruiter intelligence" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '12px' }}>
                {p.state.rows.map((r) => <li key={r.id}><RecruiterCard item={r} timeZone={p.timeZone} currentUserId={p.currentUserId} onDismiss={p.onDismiss} /></li>)}
              </ul>
            )}
          <SourcePager page={p.page} hasNext={p.state.hasNext} onPage={p.onPage} label="Recruiter intelligence" />
        </>
      )}
    </div>
  );
}

export function AiHubRecruiters({ activeWorkspaceId, currentUserId, onNavigate }: { activeWorkspaceId: string | null; currentUserId: string | null; onNavigate?: (path: string) => void }) {
  const { timeZone, loaded } = useProfileTimeZone(currentUserId);
  const [draft, setDraft] = useState<RecruiterFilters>(DEFAULT_RECRUITER_FILTERS);
  const [applied, setApplied] = useState<RecruiterFilters>(DEFAULT_RECRUITER_FILTERS);
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const enabled = Boolean(activeWorkspaceId) && loaded;
  const { state, retry } = useSourceRows<RecruiterView>(enabled, [activeWorkspaceId, applied, page, timeZone], () => fetchRecruiterPage(activeWorkspaceId!, applied, timeZone, page));
  const configured = useSourceConfigured(enabled, () => fetchSourceConfigured(activeWorkspaceId!, 'recruiters'), [activeWorkspaceId]);
  const filtered = JSON.stringify(applied) !== JSON.stringify(DEFAULT_RECRUITER_FILTERS);
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
      onDraft={setDraft} onApply={onApply} onReset={onReset} onPage={setPage} onRetry={retry} onDismiss={onDismiss}
      onOpenSettings={onNavigate ? () => onNavigate('/settings/ai') : undefined}
    />
  );
}
