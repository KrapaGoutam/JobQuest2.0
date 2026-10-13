import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PublicSession } from '../api';
import { fetchEmailMatches } from '../api/aiEmail';
import { dismissAiFinding, fetchEmailHighUrgencyCount, fetchEmailPage, fetchSourceConfigured } from '../api/aiSources';
import { useProfileTimeZone } from '../hooks/useProfileTimeZone';
import { formatInZone } from '../lib/time';
import { aiProviderLabel } from '../lib/aiHub';
import {
  DEFAULT_EMAIL_FILTERS, EMAIL_GROUP_LABELS, EMAIL_GROUPS, EMAIL_JOB_CATEGORIES, EMAIL_CATEGORY_LABELS, EMAIL_OTHER_CATEGORIES,
  EMAIL_STAGE_HINT_LABELS, EMAIL_URGENCIES, EMAIL_URGENCY_LABELS, emailCategoryLabel, groupEmailViews, relativeAge, resolveDateRange, stageLabel,
  type EmailFilters, type EmailMatchApp, type EmailMatchView, type EmailUrgency, type EmailView,
} from '../lib/aiSources';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  DateRangeFields, DismissControl, FilterField, ProviderSelect, ResultsSummary, SourceEmpty, SourceError, SourceFilterForm,
  SourceLoading, SourcePager, StatusSelect, useSourceConfigured, useSourceRows, wrap, type SourceLoadState,
} from './AiHubSourceParts';

// Email INTELLIGENCE, not an email client: classification, urgency, a short summary and a bounded evidence excerpt. JobQuest
// never stores message bodies, attachments or full sender addresses, and this page cannot reply, draft, send, archive, delete
// or mark anything in a mailbox. Everything shown originates from an external AI provider: it is untrusted text, rendered as
// React text children (escaped). The application link and stage hint are context only - nothing here changes an application.

const URGENCY_VARIANT: Record<EmailUrgency, 'danger' | 'info' | 'muted'> = { HIGH: 'danger', MEDIUM: 'info', LOW: 'muted' };

function ApplicationLine({ app, onOpen }: { app: EmailMatchApp; onOpen?: (id: string) => void }) {
  const label = `${app.title} — ${app.outcome === 'REJECTED' ? 'Rejected' : stageLabel(app.stage)}`;
  return onOpen
    ? <Button variant="link" size="sm" onClick={() => onOpen(app.id)} aria-label={`Open application ${label}`} style={{ whiteSpace: 'normal', textAlign: 'left', height: 'auto', minHeight: '24px', maxWidth: '100%', ...wrap }}>{label}</Button>
    : <span>{label}</span>;
}

function ApplicationMatch({ match, onOpen }: { match: EmailMatchView; onOpen?: (id: string) => void }) {
  if (match.state === 'NOT_APPLICABLE') return null;
  if (match.state === 'MATCHED' && match.application) return <ApplicationLine app={match.application} onOpen={onOpen} />;
  if (match.state === 'POSSIBLE') {
    return (
      <span style={{ display: 'grid', gap: '2px' }}>
        <span>Possible match, not confirmed</span>
        {match.possible.map((a) => <ApplicationLine key={a.id} app={a} onOpen={onOpen} />)}
      </span>
    );
  }
  return <span className="muted">No matching application</span>;
}

export function EmailCard({ item, timeZone, currentUserId, match, nowMs, onDismiss, onOpenApplication }: {
  item: EmailView; timeZone: string; currentUserId: string | null; match?: EmailMatchView; nowMs?: number;
  onDismiss?: (e: EmailView) => Promise<void>; onOpenApplication?: (applicationId: string) => void;
}) {
  const from = item.senderName ?? item.company ?? item.senderDomain ?? 'Unknown sender';
  const sender = [item.senderName, item.senderDomain ? `(${item.senderDomain})` : ''].filter(Boolean).join(' ');
  const hint = [item.company, item.roleTitle].filter(Boolean).join(' · ');
  const canDismiss = onDismiss && currentUserId === item.ownerId && (item.status === 'NEW' || item.status === 'REVIEWED');
  const age = nowMs !== undefined ? relativeAge(item.receivedAt, nowMs) : '';
  const received = item.receivedAt ? formatInZone(item.receivedAt, timeZone, { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const action = item.actionState === 'no_action' ? 'No action needed' : item.nextStep;
  const rows: Array<[string, ReactNode]> = [
    ['From', sender], ['Company and role', hint], ['Subject', item.subject],
    ['Received', received ? `${age ? `${age} · ` : ''}${received}` : ''],
    ['Action', action], ['Deadline', item.deadline ? formatInZone(item.deadline, timeZone, { dateStyle: 'medium', timeStyle: 'short' }) : ''],
    ['Application', item.group === 'job_related' && match ? <ApplicationMatch match={match} onOpen={onOpenApplication} /> : ''],
    ['Suggested stage', item.stageHint ? `${EMAIL_STAGE_HINT_LABELS[item.stageHint] ?? 'Other'} (a hint only; your application is not changed)` : ''],
    ['Reply draft', item.draftRecommended ? 'A reply draft is recommended. JobQuest does not write or send email.' : ''],
  ];
  return (
    <Card>
      <CardBody>
        <article aria-label={item.title} style={{ display: 'grid', gap: '8px', ...wrap }}>
          <header style={{ display: 'grid', gap: '4px' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <StatusBadge variant={URGENCY_VARIANT[item.urgency]}>{EMAIL_URGENCY_LABELS[item.urgency]} urgency</StatusBadge>
              {item.category && <StatusBadge variant="info">{emailCategoryLabel(item.category)}</StatusBadge>}
              {item.needsAttention && <StatusBadge variant="warning">Needs attention</StatusBadge>}
              {item.status === 'DISMISSED' && <StatusBadge variant="muted">Dismissed</StatusBadge>}
            </div>
            <p className="muted small" style={{ margin: 0, ...wrap }}>{from}</p>
            <h5 style={{ margin: 0, fontSize: '16px', fontWeight: 600, ...wrap }}>{item.title}</h5>
          </header>
          {item.summary && <p style={{ margin: 0, ...wrap }}>{item.summary}</p>}
          <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(80px, max-content) minmax(0, 1fr)', gap: '4px 12px', margin: 0 }}>
            {rows.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt className="muted small">{k}</dt>
                <dd style={{ margin: 0, ...wrap }}>{v}</dd>
              </div>
            ))}
          </dl>
          {item.evidence && (
            <blockquote className="muted small" style={{ margin: 0, paddingLeft: '10px', borderLeft: '2px solid var(--color-border)', ...wrap }}>
              <span className="sr-only">Evidence excerpt: </span>{item.evidence}
            </blockquote>
          )}
          <span className="muted small">{aiProviderLabel(item.provider)}</span>
          {canDismiss && <div><DismissControl label={item.title} onDismiss={() => onDismiss(item)} /></div>}
        </article>
      </CardBody>
    </Card>
  );
}

function QuickFilter({ label, value, options, onPick }: { label: string; value: string; options: ReadonlyArray<{ id: string; label: string }>; onPick: (id: string) => void }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
      {options.map((o) => (
        <Button key={o.id} type="button" size="sm" variant={value === o.id ? 'primary' : 'secondary'} aria-pressed={value === o.id} onClick={() => onPick(o.id)}>{o.label}</Button>
      ))}
    </div>
  );
}

const GROUP_OPTIONS = [{ id: 'ALL', label: 'All' }, ...EMAIL_GROUPS.map((g) => ({ id: g, label: EMAIL_GROUP_LABELS[g] }))];
const URGENCY_OPTIONS = [{ id: 'ALL', label: 'Any urgency' }, ...EMAIL_URGENCIES.map((u) => ({ id: u, label: EMAIL_URGENCY_LABELS[u] }))];

export interface EmailPanelProps {
  state: SourceLoadState<EmailView>;
  draft: EmailFilters;
  page: number;
  timeZone: string;
  currentUserId: string | null;
  configured: boolean | null;
  filtered: boolean;
  message?: string | null;
  /** Open (NEW) HIGH-urgency emails in the workspace; null = unavailable. */
  highCount?: number | null;
  /** Server-derived application matches by email id. */
  matches?: Record<string, EmailMatchView>;
  matchesUnavailable?: boolean;
  /** Reference instant for "2h ago"; omitted = absolute times only (deterministic rendering). */
  nowMs?: number;
  onDraft: (f: EmailFilters) => void;
  /** Group and urgency apply immediately (they are the primary filters). */
  onQuick?: (patch: Partial<EmailFilters>) => void;
  onApply: () => void;
  onReset: () => void;
  onPage: (p: number) => void;
  onRetry?: () => void;
  onDismiss?: (e: EmailView) => Promise<void>;
  onOpenSettings?: () => void;
  onOpenApplication?: (applicationId: string) => void;
}

export function AiHubEmailPanel(p: EmailPanelProps) {
  const d = p.draft;
  const set = (patch: Partial<EmailFilters>) => p.onDraft({ ...d, ...patch });
  const quick = (patch: Partial<EmailFilters>) => (p.onQuick ? p.onQuick(patch) : set(patch));
  const sections = p.state.status === 'ready' ? groupEmailViews(p.state.rows) : [];
  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <h2 style={{ margin: 0, fontSize: '18px' }}>Email Intelligence</h2>
      <p className="muted small" style={{ margin: 0 }}>Mail your AI provider triaged. JobQuest keeps only a short summary and a brief excerpt — never the full message — and cannot send, reply to or change any email.</p>

      <section aria-label="Needs attention" style={{ display: 'flex', gap: '10px', alignItems: 'baseline', flexWrap: 'wrap', ...wrap }}>
        <span style={{ fontSize: '28px', fontWeight: 700 }} data-testid="email-high-count">{p.highCount ?? '—'}</span>
        <span>{p.highCount === 1 ? 'high-urgency email needs attention' : 'high-urgency emails need attention'}</span>
        {p.highCount === null && <span className="muted small">(count unavailable)</span>}
      </section>

      <div style={{ display: 'grid', gap: '8px' }}>
        <QuickFilter label="Mail type" value={d.group} options={GROUP_OPTIONS} onPick={(id) => quick({ group: id })} />
        <QuickFilter label="Urgency" value={d.urgency} options={URGENCY_OPTIONS} onPick={(id) => quick({ urgency: id })} />
      </div>

      <SourceFilterForm label="Email filters" onApply={p.onApply} onReset={p.onReset} message={p.message}>
        <FilterField label="Category">
          <Select value={d.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="ALL">All categories</option>
            <optgroup label={EMAIL_GROUP_LABELS.job_related}>
              {EMAIL_JOB_CATEGORIES.map((c) => <option key={c} value={c}>{EMAIL_CATEGORY_LABELS[c]}</option>)}
            </optgroup>
            <optgroup label={EMAIL_GROUP_LABELS.other}>
              {EMAIL_OTHER_CATEGORIES.map((c) => <option key={c} value={c}>{EMAIL_CATEGORY_LABELS[c]}</option>)}
            </optgroup>
          </Select>
        </FilterField>
        <FilterField label="Company"><Input value={d.company} maxLength={80} onChange={(e) => set({ company: e.target.value })} /></FilterField>
        <ProviderSelect value={d.provider} onChange={(v) => set({ provider: v })} />
        <StatusSelect value={d.status} onChange={(v) => set({ status: v })} />
        <DateRangeFields label="Received" value={d.received} onChange={(v) => set({ received: v })} />
        <label className="small" style={{ display: 'flex', gap: '6px', alignItems: 'center', flex: '1 1 150px', minHeight: '40px' }}>
          <input type="checkbox" checked={d.needsAttention} onChange={(e) => set({ needsAttention: e.target.checked })} />
          <span>Needs attention only</span>
        </label>
      </SourceFilterForm>

      {p.state.status === 'loading' && <SourceLoading label="email intelligence" />}
      {p.state.status === 'error' && <SourceError label="Email intelligence" onRetry={p.onRetry} />}
      {p.state.status === 'ready' && (
        <>
          <ResultsSummary count={p.state.rows.length} hasNext={p.state.hasNext} page={p.page} noun="email item" />
          {p.matchesUnavailable && <p className="muted small" role="status" style={{ margin: 0 }}>Application matching is unavailable right now. Emails are shown without it.</p>}
          {p.state.rows.length === 0
            ? <SourceEmpty kind="email" configured={p.configured} filtered={p.filtered} onOpenSettings={p.onOpenSettings} />
            : sections.map((s) => (
              <section key={s.group} aria-labelledby={`email-group-${s.group}`} style={{ display: 'grid', gap: '12px' }}>
                <h3 id={`email-group-${s.group}`} style={{ margin: 0, fontSize: '17px' }}>{s.label} <span className="muted small">({s.total})</span></h3>
                {s.buckets.map((b) => (
                  <section key={b.urgency} aria-labelledby={`email-${s.group}-${b.urgency}`} style={{ display: 'grid', gap: '8px' }}>
                    <h4 id={`email-${s.group}-${b.urgency}`} style={{ margin: 0, fontSize: '15px' }}>{EMAIL_URGENCY_LABELS[b.urgency]} urgency <span className="muted small">({b.items.length})</span></h4>
                    <ul aria-label={`${s.label}, ${EMAIL_URGENCY_LABELS[b.urgency]} urgency`} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '12px' }}>
                      {b.items.map((e) => (
                        <li key={e.id}>
                          <EmailCard item={e} timeZone={p.timeZone} currentUserId={p.currentUserId} match={p.matches?.[e.id]} nowMs={p.nowMs}
                            onDismiss={p.onDismiss} onOpenApplication={p.onOpenApplication} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </section>
            ))}
          <SourcePager page={p.page} hasNext={p.state.hasNext} onPage={p.onPage} label="Email intelligence" />
        </>
      )}
    </div>
  );
}

export function AiHubEmail({ activeWorkspaceId, currentUserId, session, onNavigate }: {
  activeWorkspaceId: string | null; currentUserId: string | null; session?: PublicSession | null; onNavigate?: (path: string) => void;
}) {
  const { timeZone, loaded } = useProfileTimeZone(currentUserId);
  const [draft, setDraft] = useState<EmailFilters>(DEFAULT_EMAIL_FILTERS);
  const [applied, setApplied] = useState<EmailFilters>(DEFAULT_EMAIL_FILTERS);
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [highCount, setHighCount] = useState<number | null>(null);
  const [matches, setMatches] = useState<Record<string, EmailMatchView>>({});
  const [matchesUnavailable, setMatchesUnavailable] = useState(false);
  const [nowMs] = useState(() => Date.now());
  const enabled = Boolean(activeWorkspaceId) && loaded;
  const { state, retry } = useSourceRows<EmailView>(enabled, [activeWorkspaceId, applied, page, timeZone], () => fetchEmailPage(activeWorkspaceId!, applied, timeZone, page));
  const configured = useSourceConfigured(enabled, () => fetchSourceConfigured(activeWorkspaceId!, 'email'), [activeWorkspaceId]);
  const filtered = JSON.stringify(applied) !== JSON.stringify(DEFAULT_EMAIL_FILTERS);

  // Headline count: independent of the page and filters; a failure reads as "unavailable", never as zero.
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    fetchEmailHighUrgencyCount(activeWorkspaceId!).then((n) => { if (!cancelled) setHighCount(n); }, () => { if (!cancelled) setHighCount(null); });
    return () => { cancelled = true; };
  }, [enabled, activeWorkspaceId, state.status === 'ready' ? state.rows : null]);

  // Application matches are derived by the server for the job-related items on screen. Optional context: a failure never hides the list.
  const jobRelatedIds = useMemo(() => (state.status === 'ready' ? state.rows.filter((r) => r.group === 'job_related').map((r) => r.id) : []), [state]);
  useEffect(() => {
    if (!enabled || !session || jobRelatedIds.length === 0) { setMatches({}); setMatchesUnavailable(false); return undefined; }
    let cancelled = false;
    fetchEmailMatches(activeWorkspaceId!, session, jobRelatedIds).then(
      (m) => { if (!cancelled) { setMatches(m); setMatchesUnavailable(false); } },
      () => { if (!cancelled) { setMatches({}); setMatchesUnavailable(true); } },
    );
    return () => { cancelled = true; };
  }, [enabled, session, activeWorkspaceId, jobRelatedIds]);

  const apply = useCallback((next: EmailFilters) => {
    const r = resolveDateRange(next.received, timeZone);
    if (!r.ok) { setMessage(`Received dates: ${r.message}`); return; }
    setMessage(null); setPage(0); setApplied(next);
  }, [timeZone]);
  const onApply = useCallback(() => apply(draft), [apply, draft]);
  const onQuick = useCallback((patch: Partial<EmailFilters>) => { const next = { ...draft, ...patch }; setDraft(next); apply(next); }, [apply, draft]);
  const onReset = useCallback(() => { setMessage(null); setDraft(DEFAULT_EMAIL_FILTERS); setApplied(DEFAULT_EMAIL_FILTERS); setPage(0); }, []);
  const onDismiss = useCallback(async (e: EmailView) => { await dismissAiFinding(e.id); retry(); }, [retry]);
  return (
    <AiHubEmailPanel
      state={state} draft={draft} page={page} timeZone={timeZone} currentUserId={currentUserId} configured={configured} filtered={filtered} message={message}
      highCount={highCount} matches={matches} matchesUnavailable={matchesUnavailable} nowMs={nowMs}
      onDraft={setDraft} onQuick={onQuick} onApply={onApply} onReset={onReset} onPage={setPage} onRetry={retry} onDismiss={onDismiss}
      onOpenSettings={onNavigate ? () => onNavigate('/settings/ai') : undefined}
      onOpenApplication={onNavigate && activeWorkspaceId ? (id) => onNavigate(`/w/${activeWorkspaceId}/applications/${id}`) : undefined}
    />
  );
}
