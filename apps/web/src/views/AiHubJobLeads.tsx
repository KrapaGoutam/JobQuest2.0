import { useCallback, useEffect, useMemo, useState } from 'react';
import { dismissAiFinding, fetchJobLeadDescription, fetchJobLeadsPage, fetchSourceConfigured } from '../api/aiSources';
import { fetchLastDiscoveryRun, fetchLeadMatches } from '../api/aiJobDiscovery';
import type { PublicSession } from '../api';
import { discoveryRunSummary, type DiscoveryRunView } from '../lib/aiJobDiscovery';
import { useProfileTimeZone } from '../hooks/useProfileTimeZone';
import { formatInZone } from '../lib/time';
import { aiProviderLabel } from '../lib/aiHub';
import {
  AI_MATCH_NOTE, DEFAULT_JOB_LEAD_FILTERS, DISCOVERY_FRESHNESS_HOURS, EMPLOYMENT_TYPE_LABELS, JOB_EMPLOYMENT_TYPES, JOB_LEAD_SORTS, JOB_LEAD_SORT_LABELS, JOB_WORK_ARRANGEMENTS,
  STRONG_MATCH_THRESHOLD, WORK_ARRANGEMENT_LABELS, arrangementDisplay, clampScore, employmentTypeLabel, experienceDisplay, jobLeadExport, postedDisplay, resolveDateRange, workArrangementLabel,
  type EmailMatchApp, type EmailMatchView, type JobLeadFilters, type JobLeadView,
} from '../lib/aiSources';
import { Card, CardBody } from '../components/ui/Card';
import { Dialog } from '../components/ui/Dialog';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { Skeleton } from '../components/ui/Skeleton';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  DateRangeFields, DismissControl, ExternalLink, FilterField, ProviderSelect, ResultsSummary, SourceEmpty, SourceError, SourceFilterForm,
  SourceLoading, SourcePager, StatusSelect, useSourceConfigured, useSourceRows, wrap, type SourceLoadState,
} from './AiHubSourceParts';

// ---- presentational ----------------------------------------------------------------------------------

function MatchBadge({ lead }: { lead: JobLeadView }) {
  if (lead.matchScore === null) return <span className="muted small">No AI match score</span>;
  return (
    <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
      <StatusBadge variant={lead.strongMatch ? 'success' : 'muted'}>AI match {lead.matchScore}/100</StatusBadge>
      {lead.strongMatch && <span className="small">Strong match (AI match {STRONG_MATCH_THRESHOLD}+)</span>}
    </span>
  );
}

/**
 * AI-11D: whether a lead is already one of the owner's applications. Server-derived and read-only: a lead is never an
 * application, and a POSSIBLE match is only ever shown as "not confirmed". Nothing here creates or changes an application.
 */
function TrackedStatus({ lead, match, onOpenApplication }: { lead: JobLeadView; match?: EmailMatchView; onOpenApplication?: (id: string) => void }) {
  if (lead.applicationId || !match) return null;
  const open = (a: EmailMatchApp) => (onOpenApplication
    ? <Button key={a.id} variant="link" size="sm" onClick={() => onOpenApplication(a.id)} aria-label={`Open tracked application: ${a.title} at ${a.company}`} style={{ whiteSpace: 'normal', textAlign: 'left', height: 'auto', minHeight: '24px', maxWidth: '100%', ...wrap }}>Open application</Button>
    : null);
  if (match.state === 'MATCHED' && match.application) {
    return <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}><StatusBadge variant="success">Already tracked</StatusBadge>{open(match.application)}</span>;
  }
  if (match.state === 'POSSIBLE' && match.possible.length > 0) {
    return (
      <span className="small" style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
        <StatusBadge variant="muted">Possibly tracked, not confirmed</StatusBadge>
        {match.possible.slice(0, 2).map(open)}
      </span>
    );
  }
  return null;
}

function Reasons({ label, items, limit }: { label: string; items: string[]; limit?: number }) {
  if (items.length === 0) return null;
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <div className="small" style={{ display: 'grid', gap: '2px' }}>
      <strong>{label}</strong>
      <ul aria-label={label} style={{ margin: 0, paddingLeft: '18px' }}>{shown.map((r) => <li key={r} style={wrap}>{r}</li>)}</ul>
    </div>
  );
}

export function JobLeadCard({ lead, timeZone, currentUserId, nowMs, match, onOpen, onDismiss, onReviewAction, onOpenApplication }: {
  lead: JobLeadView; timeZone: string; currentUserId: string | null; nowMs?: number; match?: EmailMatchView; onOpen: (l: JobLeadView) => void; onDismiss?: (l: JobLeadView) => Promise<void>;
  /** AI-8: opens the Actions queue (the approval center). A lead is never converted from this card. */
  onReviewAction?: () => void; onOpenApplication?: (applicationId: string) => void;
}) {
  const meta = [lead.location && !/^remote$/i.test(lead.location.trim()) ? lead.location : null, arrangementDisplay(lead) || workArrangementLabel(lead.arrangement), employmentTypeLabel(lead.employmentType)].filter(Boolean).join(' · ');
  const posted = postedDisplay(lead, nowMs ?? Date.now());
  const experience = experienceDisplay(lead);
  const canDismiss = onDismiss && currentUserId === lead.ownerId && (lead.status === 'NEW' || lead.status === 'REVIEWED');
  return (
    <Card>
      <CardBody>
        <article aria-label={`${lead.title} at ${lead.company}`} style={{ display: 'grid', gap: '8px', ...wrap }}>
          <header style={{ display: 'grid', gap: '2px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, ...wrap }}>{lead.title}</h3>
            <span style={wrap}>{lead.company}</span>
          </header>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <MatchBadge lead={lead} />
            {lead.status === 'DISMISSED' && <StatusBadge variant="muted">Dismissed</StatusBadge>}
            {lead.applicationId && <StatusBadge variant="success">Application created</StatusBadge>}
            <TrackedStatus lead={lead} match={match} onOpenApplication={onOpenApplication} />
          </div>
          {meta && <span className="muted small" style={wrap}>{meta}</span>}
          {lead.salary && <span className="small">Published salary: {lead.salary}</span>}
          {experience && <span className="small">Experience: {experience}</span>}
          <Reasons label="Why it may fit" items={lead.fitReasons} limit={2} />
          <Reasons label="Concerns and gaps" items={lead.gapReasons} limit={2} />
          {lead.requiredSkills.length > 0 && <span className="small" style={wrap}><strong>Required:</strong> {lead.requiredSkills.slice(0, 8).join(', ')}{lead.requiredSkills.length > 8 ? ', …' : ''}</span>}
          <span className="muted small">
            {[posted, `Found ${formatInZone(lead.discoveredAt, timeZone, { dateStyle: 'medium' })}`, `${aiProviderLabel(lead.provider)}`, lead.sourceName ? `via ${lead.sourceName}` : ''].filter(Boolean).join(' · ')}
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <Button variant="secondary" size="sm" onClick={() => onOpen(lead)} aria-label={`View details: ${lead.title} at ${lead.company}`}>View details</Button>
            {lead.sourceUrl && <ExternalLink href={lead.sourceUrl}>Open posting</ExternalLink>}
            {lead.applicationId && onOpenApplication && <Button variant="secondary" size="sm" onClick={() => onOpenApplication(lead.applicationId!)} aria-label={`Open application: ${lead.title} at ${lead.company}`}>Open application</Button>}
            {!lead.applicationId && lead.pendingAction && onReviewAction && currentUserId === lead.ownerId && <Button variant="primary" size="sm" onClick={onReviewAction} aria-label={`Review create application action: ${lead.title} at ${lead.company}`}>Review application action</Button>}
            {canDismiss && <DismissControl label={`${lead.title} at ${lead.company}`} onDismiss={() => onDismiss(lead)} />}
          </div>
        </article>
      </CardBody>
    </Card>
  );
}

export type DescriptionState = { status: 'idle' } | { status: 'loading' } | { status: 'error' } | { status: 'ready'; text: string | null };

export function JobLeadDetail({ lead, description, timeZone, nowMs, onClose, onRetry, onCopy, copied }: {
  lead: JobLeadView; description: DescriptionState; timeZone: string; nowMs?: number; onClose: () => void; onRetry?: () => void; onCopy?: () => void; copied?: boolean;
}) {
  const rows: Array<[string, string | null]> = [
    ['Company', lead.company], ['Location', lead.location], ['Work arrangement', arrangementDisplay(lead) || workArrangementLabel(lead.arrangement) || null],
    ['Location note', lead.remoteNote],
    ['Employment type', employmentTypeLabel(lead.employmentType) || null], ['Published salary', lead.salary], ['Experience', experienceDisplay(lead)],
    ['Source', lead.sourceName], ['Posted', postedDisplay(lead, nowMs ?? Date.now())],
    ['Discovered', formatInZone(lead.discoveredAt, timeZone, { dateStyle: 'medium', timeStyle: 'short' })], ['Found by', aiProviderLabel(lead.provider)],
  ];
  return (
    <Dialog isOpen onClose={onClose} title={`${lead.title} — ${lead.company}`} maxWidth={680}>
      <div style={{ display: 'grid', gap: '14px', ...wrap }}>
        <MatchBadge lead={lead} />
        <p className="muted small" style={{ margin: 0 }}>{AI_MATCH_NOTE}</p>
        <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, auto) 1fr', gap: '6px 12px', margin: 0 }}>
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt className="muted small">{k}</dt>
              <dd style={{ margin: 0, ...wrap }}>{v}</dd>
            </div>
          ))}
        </dl>
        {lead.summary && <p style={{ margin: 0, ...wrap }}>{lead.summary}</p>}
        {(lead.fitReasons.length > 0 || lead.gapReasons.length > 0) && (
          <section aria-label="Fit and gaps" style={{ display: 'grid', gap: '8px' }}>
            <Reasons label="Why it may fit" items={lead.fitReasons} />
            <Reasons label="Concerns and gaps" items={lead.gapReasons} />
          </section>
        )}
        {lead.matchReasoning && (
          <section aria-label="Match reasoning" style={{ display: 'grid', gap: '2px' }}>
            <h4 style={{ margin: 0, fontSize: '14px' }}>Why it may match (AI estimate)</h4>
            <p style={{ margin: 0, ...wrap }}>{lead.matchReasoning}</p>
          </section>
        )}
        {(lead.requiredSkills.length > 0 || lead.preferredSkills.length > 0) && (
          <section aria-label="Skills" style={{ display: 'grid', gap: '6px' }}>
            {lead.requiredSkills.length > 0 && <div><h4 style={{ margin: '0 0 4px', fontSize: '14px' }}>Required skills</h4><ul style={{ margin: 0, paddingLeft: '18px' }}>{lead.requiredSkills.map((s) => <li key={s} style={wrap}>{s}</li>)}</ul></div>}
            {lead.preferredSkills.length > 0 && <div><h4 style={{ margin: '0 0 4px', fontSize: '14px' }}>Preferred skills</h4><ul style={{ margin: 0, paddingLeft: '18px' }}>{lead.preferredSkills.map((s) => <li key={s} style={wrap}>{s}</li>)}</ul></div>}
          </section>
        )}
        <section aria-label="Job description" style={{ display: 'grid', gap: '6px' }}>
          <h4 style={{ margin: 0, fontSize: '14px' }}>Job description</h4>
          {description.status === 'loading' && <div role="status" aria-label="Loading job description"><Skeleton height={16} width="60%" /><Skeleton height={64} /></div>}
          {description.status === 'error' && (
            <div role="alert" style={{ display: 'grid', gap: '6px' }}>
              <span>The job description could not be loaded.</span>
              {onRetry && <div><Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button></div>}
            </div>
          )}
          {description.status === 'ready' && description.text === null && <span className="muted small">No job description was provided.</span>}
          {description.status === 'ready' && description.text !== null && (
            <>
              {lead.descriptionTruncated && (
                <p className="small" role="note" style={{ margin: 0 }}>
                  This description was shortened to fit the {`30,000`}-character limit{lead.descriptionLength ? ` (the source had ${lead.descriptionLength.toLocaleString('en-US')} characters)` : ''}. It is not the complete posting; use the source link for the full text.
                </p>
              )}
              {/* tabIndex makes the scrollable region keyboard-reachable; text is escaped plain text. */}
              <div tabIndex={0} role="region" aria-label="Job description text" style={{ maxHeight: '320px', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: '10px', border: '1px solid var(--color-border)', borderRadius: '6px' }}>
                {description.text}
              </div>
            </>
          )}
        </section>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {lead.sourceUrl && <ExternalLink href={lead.sourceUrl}>Open source posting</ExternalLink>}
          {onCopy && <Button variant="secondary" size="sm" onClick={onCopy}>Copy details as JSON</Button>}
          {copied && <span role="status" className="small">Copied.</span>}
        </div>
      </div>
    </Dialog>
  );
}

export interface JobLeadsPanelProps {
  state: SourceLoadState<JobLeadView>;
  draft: JobLeadFilters;
  page: number;
  timeZone: string;
  currentUserId: string | null;
  configured: boolean | null;
  filtered: boolean;
  message?: string | null;
  /** Server-derived application matches by lead id (optional context). */
  matches?: Record<string, EmailMatchView>;
  matchesUnavailable?: boolean;
  /** The newest discovery run: tells "a quiet market" apart from "the search did not run". */
  lastRun?: DiscoveryRunView | null;
  nowMs?: number;
  onDraft: (f: JobLeadFilters) => void;
  onApply: () => void;
  onReset: () => void;
  onPage: (p: number) => void;
  onRetry?: () => void;
  onOpen: (l: JobLeadView) => void;
  onDismiss?: (l: JobLeadView) => Promise<void>;
  onOpenSettings?: () => void;
  onReviewAction?: () => void;
  onOpenApplication?: (applicationId: string) => void;
}

export function AiHubJobLeadsPanel(p: JobLeadsPanelProps) {
  const d = p.draft;
  const set = (patch: Partial<JobLeadFilters>) => p.onDraft({ ...d, ...patch });
  const minInvalid = d.minScore.trim() !== '' && clampScore(d.minScore) === null;
  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <h2 style={{ margin: 0, fontSize: '18px' }}>Job Leads</h2>
      <p className="muted small" style={{ margin: 0 }}>Recently posted jobs your AI provider found, freshest first. A job lead is not an application and nothing is applied for you. AI match is the provider’s own estimate.</p>
      {p.lastRun && (
        <p className="small" role="status" data-testid="discovery-run-summary" style={{ margin: 0 }}>
          <strong>Last discovery:</strong> {aiProviderLabel(p.lastRun.provider)} · {formatInZone(p.lastRun.at, p.timeZone, { dateStyle: 'medium', timeStyle: 'short' })}. {discoveryRunSummary(p.lastRun)}
        </p>
      )}
      <SourceFilterForm label="Job lead filters" onApply={p.onApply} onReset={p.onReset} message={p.message}>
        <FilterField label="Search company or title" grow={2}><Input type="search" value={d.search} maxLength={80} onChange={(e) => set({ search: e.target.value })} /></FilterField>
        <FilterField label="Company"><Input value={d.company} maxLength={80} onChange={(e) => set({ company: e.target.value })} /></FilterField>
        <FilterField label="Location"><Input value={d.location} maxLength={80} onChange={(e) => set({ location: e.target.value })} /></FilterField>
        <FilterField label="Sort by">
          <Select value={d.sort} onChange={(e) => set({ sort: e.target.value })}>
            {JOB_LEAD_SORTS.map((s) => <option key={s} value={s}>{JOB_LEAD_SORT_LABELS[s]}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Newest within">
          <Select value={d.recent} onChange={(e) => set({ recent: e.target.value })}>
            <option value="ALL">Any time</option>
            {DISCOVERY_FRESHNESS_HOURS.map((h) => <option key={h} value={String(h)}>Last {h} hours</option>)}
          </Select>
        </FilterField>
        <FilterField label="Work arrangement">
          <Select value={d.arrangement} onChange={(e) => set({ arrangement: e.target.value })}>
            <option value="ALL">Any arrangement</option>
            {JOB_WORK_ARRANGEMENTS.map((a) => <option key={a} value={a}>{WORK_ARRANGEMENT_LABELS[a]}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Employment type">
          <Select value={d.employmentType} onChange={(e) => set({ employmentType: e.target.value })}>
            <option value="ALL">Any type</option>
            {JOB_EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{EMPLOYMENT_TYPE_LABELS[t]}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Minimum AI match (0–100)">
          <Input type="number" inputMode="numeric" min={0} max={100} step={1} value={d.minScore} onChange={(e) => set({ minScore: e.target.value })} aria-invalid={minInvalid || undefined} aria-describedby={minInvalid ? 'job-lead-min-msg' : undefined} />
        </FilterField>
        <div style={{ flex: '1 1 150px', alignSelf: 'center' }}>
          <Checkbox label="Remote — US only" checked={d.remoteUs} onChange={(e) => set({ remoteUs: e.target.checked })} />
        </div>
        <ProviderSelect value={d.provider} onChange={(v) => set({ provider: v })} />
        <StatusSelect value={d.status} onChange={(v) => set({ status: v })} />
        <DateRangeFields label="Discovered" value={d.discovered} onChange={(v) => set({ discovered: v })} />
        <DateRangeFields label="Posted" value={d.posted} onChange={(v) => set({ posted: v })} />
      </SourceFilterForm>
      {minInvalid && <p id="job-lead-min-msg" role="alert" style={{ margin: 0 }}>Enter a whole number from 0 to 100.</p>}

      {p.state.status === 'loading' && <SourceLoading label="job leads" />}
      {p.state.status === 'error' && <SourceError label="Job leads" onRetry={p.onRetry} />}
      {p.state.status === 'ready' && (
        <>
          <ResultsSummary count={p.state.rows.length} hasNext={p.state.hasNext} page={p.page} noun="job lead" />
          {p.matchesUnavailable && <p className="muted small" role="status" style={{ margin: 0 }}>Checking whether a lead is already tracked is unavailable right now. Leads are shown without it.</p>}
          {p.state.rows.length === 0
            ? <SourceEmpty kind="job_leads" configured={p.configured} filtered={p.filtered} onOpenSettings={p.onOpenSettings} />
            : (
              <ul aria-label="Job leads" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '12px' }}>
                {p.state.rows.map((l) => <li key={l.id}><JobLeadCard lead={l} timeZone={p.timeZone} currentUserId={p.currentUserId} nowMs={p.nowMs} match={p.matches?.[l.id]} onOpen={p.onOpen} onDismiss={p.onDismiss} onReviewAction={p.onReviewAction} onOpenApplication={p.onOpenApplication} /></li>)}
              </ul>
            )}
          <SourcePager page={p.page} hasNext={p.state.hasNext} onPage={p.onPage} label="Job leads" />
        </>
      )}
    </div>
  );
}

// ---- container -------------------------------------------------------------------------------------------

export function AiHubJobLeads({ activeWorkspaceId, currentUserId, session = null, onNavigate }: { activeWorkspaceId: string | null; currentUserId: string | null; session?: PublicSession | null; onNavigate?: (path: string) => void }) {
  const { timeZone, loaded } = useProfileTimeZone(currentUserId);
  const [draft, setDraft] = useState<JobLeadFilters>(DEFAULT_JOB_LEAD_FILTERS);
  const [applied, setApplied] = useState<JobLeadFilters>(DEFAULT_JOB_LEAD_FILTERS);
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [nowMs] = useState(() => Date.now());
  const [matches, setMatches] = useState<Record<string, EmailMatchView>>({});
  const [matchesUnavailable, setMatchesUnavailable] = useState(false);
  const [lastRun, setLastRun] = useState<DiscoveryRunView | null>(null);
  const enabled = Boolean(activeWorkspaceId) && loaded;
  const { state, retry } = useSourceRows<JobLeadView>(enabled, [activeWorkspaceId, applied, page, timeZone], () => fetchJobLeadsPage(activeWorkspaceId!, applied, timeZone, page));
  const configured = useSourceConfigured(enabled, () => fetchSourceConfigured(activeWorkspaceId!, 'job_leads'), [activeWorkspaceId]);
  const filtered = JSON.stringify(applied) !== JSON.stringify(DEFAULT_JOB_LEAD_FILTERS);

  // Source health of the newest discovery run. Optional context: a failure hides the line, never the leads.
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    fetchLastDiscoveryRun(activeWorkspaceId!).then((r) => { if (!cancelled) setLastRun(r); }, () => { if (!cancelled) setLastRun(null); });
    return () => { cancelled = true; };
  }, [enabled, activeWorkspaceId]);

  // "Already tracked": derived by the server for the leads on screen (never trusts a provider id). Optional context.
  const leadIds = useMemo(() => (state.status === 'ready' ? state.rows.filter((r) => !r.applicationId).map((r) => r.id) : []), [state]);
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
    const dr = resolveDateRange(draft.discovered, timeZone);
    if (!dr.ok) { setMessage(`Discovered dates: ${dr.message}`); return; }
    const pr = resolveDateRange(draft.posted, timeZone);
    if (!pr.ok) { setMessage(`Posted dates: ${pr.message}`); return; }
    if (draft.minScore.trim() !== '' && clampScore(draft.minScore) === null) { setMessage('Enter a whole number from 0 to 100 for the minimum AI match.'); return; }
    setMessage(null); setPage(0); setApplied(draft);
  }, [draft, timeZone]);
  const onReset = useCallback(() => { setMessage(null); setDraft(DEFAULT_JOB_LEAD_FILTERS); setApplied(DEFAULT_JOB_LEAD_FILTERS); setPage(0); }, []);

  // Detail dialog: the long description is fetched for one lead at a time.
  const [selected, setSelected] = useState<JobLeadView | null>(null);
  const [description, setDescription] = useState<DescriptionState>({ status: 'idle' });
  const [descAttempt, setDescAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!selected || !activeWorkspaceId) return undefined;
    if (!selected.hasDescription) { setDescription({ status: 'ready', text: null }); return undefined; }
    let cancelled = false;
    setDescription({ status: 'loading' });
    fetchJobLeadDescription(activeWorkspaceId, selected.id).then(
      (text) => { if (!cancelled) setDescription({ status: 'ready', text }); },
      () => { if (!cancelled) setDescription({ status: 'error' }); },
    );
    return () => { cancelled = true; };
  }, [selected, activeWorkspaceId, descAttempt]);
  const onCopy = useCallback(() => {
    if (!selected) return;
    const body = JSON.stringify({ ...jobLeadExport(selected), description: description.status === 'ready' ? description.text : null }, null, 2);
    navigator.clipboard?.writeText(body).then(() => setCopied(true), () => setCopied(false));
  }, [selected, description]);
  const close = () => { setSelected(null); setDescription({ status: 'idle' }); setCopied(false); };

  const onDismiss = useCallback(async (l: JobLeadView) => { await dismissAiFinding(l.id); retry(); }, [retry]);

  return (
    <>
      <AiHubJobLeadsPanel
        state={state} draft={draft} page={page} timeZone={timeZone} currentUserId={currentUserId} configured={configured} filtered={filtered} message={message}
        matches={matches} matchesUnavailable={matchesUnavailable} lastRun={lastRun} nowMs={nowMs}
        onDraft={setDraft} onApply={onApply} onReset={onReset} onPage={setPage} onRetry={retry} onOpen={setSelected} onDismiss={onDismiss}
        onOpenSettings={onNavigate ? () => onNavigate('/settings/ai') : undefined}
        onReviewAction={onNavigate ? () => onNavigate('/ai-hub/actions') : undefined}
        onOpenApplication={onNavigate && activeWorkspaceId ? (id) => onNavigate(`/w/${activeWorkspaceId}/applications/${id}`) : undefined}
      />
      {selected && <JobLeadDetail lead={selected} description={description} timeZone={timeZone} nowMs={nowMs} onClose={close} onRetry={() => setDescAttempt((n) => n + 1)} onCopy={onCopy} copied={copied} />}
    </>
  );
}

