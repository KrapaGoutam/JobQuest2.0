import { useCallback, useState } from 'react';
import { dismissAiFinding, fetchEmailPage, fetchSourceConfigured } from '../api/aiSources';
import { useProfileTimeZone } from '../hooks/useProfileTimeZone';
import { formatInZone } from '../lib/time';
import { aiProviderLabel } from '../lib/aiHub';
import {
  DEFAULT_EMAIL_FILTERS, EMAIL_CATEGORIES, EMAIL_CATEGORY_LABELS, emailCategoryLabel, resolveDateRange, type EmailFilters, type EmailView,
} from '../lib/aiSources';
import { Card, CardBody } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  DateRangeFields, DismissControl, FilterField, PriorityBadge, ProviderSelect, ResultsSummary, SourceEmpty, SourceError, SourceFilterForm,
  SourceLoading, SourcePager, StatusSelect, useSourceConfigured, useSourceRows, wrap, type SourceLoadState,
} from './AiHubSourceParts';

// Email INTELLIGENCE, not an email client: classification, a short summary and a bounded evidence
// excerpt. JobQuest never stores message bodies, attachments or full sender addresses, and this page
// cannot reply, archive, delete or mark anything in a mailbox.

export function EmailCard({ item, timeZone, currentUserId, onDismiss }: { item: EmailView; timeZone: string; currentUserId: string | null; onDismiss?: (e: EmailView) => Promise<void> }) {
  const sender = [item.senderName, item.senderDomain ? `(${item.senderDomain})` : ''].filter(Boolean).join(' ');
  const hint = [item.company, item.roleTitle].filter(Boolean).join(' · ');
  const canDismiss = onDismiss && currentUserId === item.ownerId && (item.status === 'NEW' || item.status === 'REVIEWED');
  return (
    <Card>
      <CardBody>
        <article aria-label={item.title} style={{ display: 'grid', gap: '8px', ...wrap }}>
          <header style={{ display: 'grid', gap: '4px' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              {item.category && <StatusBadge variant="info">{emailCategoryLabel(item.category)}</StatusBadge>}
              {item.needsAttention && <StatusBadge variant="warning">Needs attention</StatusBadge>}
              <PriorityBadge priority={item.priority} />
              {item.status === 'DISMISSED' && <StatusBadge variant="muted">Dismissed</StatusBadge>}
            </div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, ...wrap }}>{item.title}</h3>
          </header>
          {item.summary && <p style={{ margin: 0, ...wrap }}>{item.summary}</p>}
          <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, auto) 1fr', gap: '4px 12px', margin: 0 }}>
            {[
              ['From', sender], ['Subject', item.subject], ['Received', item.receivedAt ? formatInZone(item.receivedAt, timeZone, { dateStyle: 'medium', timeStyle: 'short' }) : ''],
              ['Deadline', item.deadline ? formatInZone(item.deadline, timeZone, { dateStyle: 'medium', timeStyle: 'short' }) : ''], ['Company and role', hint], ['Next step', item.nextStep],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k as string} style={{ display: 'contents' }}>
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

export interface EmailPanelProps {
  state: SourceLoadState<EmailView>;
  draft: EmailFilters;
  page: number;
  timeZone: string;
  currentUserId: string | null;
  configured: boolean | null;
  filtered: boolean;
  message?: string | null;
  onDraft: (f: EmailFilters) => void;
  onApply: () => void;
  onReset: () => void;
  onPage: (p: number) => void;
  onRetry?: () => void;
  onDismiss?: (e: EmailView) => Promise<void>;
  onOpenSettings?: () => void;
}

export function AiHubEmailPanel(p: EmailPanelProps) {
  const d = p.draft;
  const set = (patch: Partial<EmailFilters>) => p.onDraft({ ...d, ...patch });
  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <h2 style={{ margin: 0, fontSize: '18px' }}>Email Intelligence</h2>
      <p className="muted small" style={{ margin: 0 }}>Job-search emails your AI provider classified. JobQuest keeps only a short summary and a brief excerpt — never the full message — and cannot send, reply to or change any email.</p>
      <SourceFilterForm label="Email filters" onApply={p.onApply} onReset={p.onReset} message={p.message}>
        <FilterField label="Category">
          <Select value={d.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="ALL">All categories</option>
            {EMAIL_CATEGORIES.map((c) => <option key={c} value={c}>{EMAIL_CATEGORY_LABELS[c]}</option>)}
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
          {p.state.rows.length === 0
            ? <SourceEmpty kind="email" configured={p.configured} filtered={p.filtered} onOpenSettings={p.onOpenSettings} />
            : (
              <ul aria-label="Email intelligence" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '12px' }}>
                {p.state.rows.map((e) => <li key={e.id}><EmailCard item={e} timeZone={p.timeZone} currentUserId={p.currentUserId} onDismiss={p.onDismiss} /></li>)}
              </ul>
            )}
          <SourcePager page={p.page} hasNext={p.state.hasNext} onPage={p.onPage} label="Email intelligence" />
        </>
      )}
    </div>
  );
}

export function AiHubEmail({ activeWorkspaceId, currentUserId, onNavigate }: { activeWorkspaceId: string | null; currentUserId: string | null; onNavigate?: (path: string) => void }) {
  const { timeZone, loaded } = useProfileTimeZone(currentUserId);
  const [draft, setDraft] = useState<EmailFilters>(DEFAULT_EMAIL_FILTERS);
  const [applied, setApplied] = useState<EmailFilters>(DEFAULT_EMAIL_FILTERS);
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const enabled = Boolean(activeWorkspaceId) && loaded;
  const { state, retry } = useSourceRows<EmailView>(enabled, [activeWorkspaceId, applied, page, timeZone], () => fetchEmailPage(activeWorkspaceId!, applied, timeZone, page));
  const configured = useSourceConfigured(enabled, () => fetchSourceConfigured(activeWorkspaceId!, 'email'), [activeWorkspaceId]);
  const filtered = JSON.stringify(applied) !== JSON.stringify(DEFAULT_EMAIL_FILTERS);
  const onApply = useCallback(() => {
    const r = resolveDateRange(draft.received, timeZone);
    if (!r.ok) { setMessage(`Received dates: ${r.message}`); return; }
    setMessage(null); setPage(0); setApplied(draft);
  }, [draft, timeZone]);
  const onReset = useCallback(() => { setMessage(null); setDraft(DEFAULT_EMAIL_FILTERS); setApplied(DEFAULT_EMAIL_FILTERS); setPage(0); }, []);
  const onDismiss = useCallback(async (e: EmailView) => { await dismissAiFinding(e.id); retry(); }, [retry]);
  return (
    <AiHubEmailPanel
      state={state} draft={draft} page={page} timeZone={timeZone} currentUserId={currentUserId} configured={configured} filtered={filtered} message={message}
      onDraft={setDraft} onApply={onApply} onReset={onReset} onPage={setPage} onRetry={retry} onDismiss={onDismiss}
      onOpenSettings={onNavigate ? () => onNavigate('/settings/ai') : undefined}
    />
  );
}
