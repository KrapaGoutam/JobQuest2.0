import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays } from 'lucide-react';
import type { PublicSession } from '../api';
import { fetchDigestPage, fetchLiveMetrics, generateTodayDigest, type LiveMetrics } from '../api/aiDigest';
import { useProfileTimeZone } from '../hooks/useProfileTimeZone';
import { formatInZone } from '../lib/time';
import { aiPriorityLabel } from '../lib/aiHub';
import { pendingActionsText } from '../lib/aiActions';
import { fetchPendingActionCount } from '../api/aiActions';
import {
  DIGEST_PRESETS, DIGEST_PROVIDER_FILTERS, DIGEST_SECTION_STATUS_LABELS, combineDigests, digestEmptyText, digestKindLabel, digestLayout, digestProviderLabel,
  digestSourceLabel, formatDigestDate, groupByUrgency, groupDigestsByDate, headlineMetrics, hiddenCount, resolveDigestRange, sourceAvailability, todayKey,
  type DigestDayGroup, type DigestEntry, type DigestItem, type DigestPreset, type DigestRow, type DigestSection, type DigestSectionKey, type DigestSectionStatus,
  type DigestUrgency, type ParsedDigest,
} from '../lib/aiDigest';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';

export type DigestLoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: DigestRow[]; hasNext: boolean };

const wrap = { overflowWrap: 'anywhere' as const, minWidth: 0 };
const statusVariant = (s: DigestSectionStatus) => (s === 'available' ? 'success' : s === 'zero' ? 'info' : s === 'unavailable' ? 'warning' : 'muted');
const URGENCY_VARIANT: Record<DigestUrgency, 'danger' | 'info' | 'muted'> = { HIGH: 'danger', MEDIUM: 'info', LOW: 'muted' };
const URGENCY_LABEL: Record<DigestUrgency, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };

/** What the digest card needs to act on an item. Every handler only NAVIGATES; the digest never changes a record. */
interface DigestActions { timeZone: string; onOpenApplication?: (id: string) => void; onOpenTab?: (path: string) => void }

// ---- legacy layout (payload 1.0, e.g. provider narratives) ------------------------------------------------------------

function ItemList({ items }: { items: DigestItem[] }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '8px' }}>
      {items.map((it, i) => (
        <li key={`${it.title}-${i}`} style={{ display: 'grid', gap: '2px', ...wrap }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline', flexWrap: 'wrap' }}>
            {it.url
              ? <a href={it.url} target="_blank" rel="noopener noreferrer" style={wrap}>{it.title}<span className="sr-only"> (opens in a new tab)</span></a>
              : <span style={{ fontWeight: 600, ...wrap }}>{it.title}</span>}
            {(it.priority === 'CRITICAL' || it.priority === 'HIGH') && <StatusBadge variant={it.priority === 'CRITICAL' ? 'danger' : 'warning'}>{aiPriorityLabel(it.priority)}</StatusBadge>}
          </div>
          {it.detail && <span className="muted small" style={wrap}>{it.detail}</span>}
          <span className="muted small">
            {[it.source ? digestSourceLabel(it.source) : '', it.providers?.length ? `Reported by ${it.providers.map(digestProviderLabel).join(', ')}` : ''].filter(Boolean).join(' · ')}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, section }: { title: string; section: DigestSection }) {
  return (
    <section aria-label={title} style={{ display: 'grid', gap: '6px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0, fontSize: '14px' }}>{title}</h4>
        <StatusBadge variant={statusVariant(section.status)}>
          {section.status === 'available' && section.count !== null ? `${section.count} · ` : ''}{DIGEST_SECTION_STATUS_LABELS[section.status]}
        </StatusBadge>
      </div>
      {section.status === 'available' && section.items.length > 0 && <ItemList items={section.items} />}
      {section.status === 'available' && section.items.length === 0 && <span className="muted small">Counted by the provider; no item details were included.</span>}
      {section.status === 'zero' && <span className="muted small">Checked: nothing to report.</span>}
      {section.status === 'not_configured' && <span className="muted small">This source is not configured yet, so nothing was checked.</span>}
      {section.status === 'unavailable' && <span className="muted small">The last run for this source failed, so nothing could be checked.</span>}
    </section>
  );
}

// ---- canonical layout (AI-11C) -----------------------------------------------------------------------------------------
// Every string below comes from stored digest data and is rendered as React text (escaped): email subjects, job titles,
// recruiter names and calendar titles are untrusted DATA, never instructions, and nothing here changes a record.

function ItemCard({ item, actions, compact }: { item: DigestItem; actions: DigestActions; compact?: boolean }) {
  const kind = digestKindLabel(item.kind);
  const app = item.application;
  return (
    <li style={{ display: 'grid', gap: '4px', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: '8px', ...wrap }}>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline', flexWrap: 'wrap' }}>
        {item.url
          ? <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, ...wrap }}>{item.title}<span className="sr-only"> (opens in a new tab)</span></a>
          : <span style={{ fontWeight: 600, ...wrap }}>{item.title}</span>}
        {item.urgency && <StatusBadge variant={URGENCY_VARIANT[item.urgency]}>{URGENCY_LABEL[item.urgency]} urgency</StatusBadge>}
        {!item.urgency && (item.priority === 'CRITICAL' || item.priority === 'HIGH') && <StatusBadge variant={item.priority === 'CRITICAL' ? 'danger' : 'warning'}>{aiPriorityLabel(item.priority)}</StatusBadge>}
        {typeof item.score === 'number' && <StatusBadge variant={item.score >= 80 ? 'success' : 'muted'}>AI match {item.score}/100</StatusBadge>}
        {item.verification && <StatusBadge variant={item.verification === 'verified' ? 'success' : 'muted'}>{item.verification === 'verified' ? 'Public source cited' : 'Unverified'}</StatusBadge>}
      </div>
      <span className="muted small" style={wrap}>{[kind, item.company].filter(Boolean).join(' · ')}</span>
      {item.attention && compact ? (
        <span className="muted small">Also listed under Needs attention.</span>
      ) : (
        <>
          {item.detail && <span className="small" style={wrap}>{item.detail}</span>}
          {item.deadlineAt && <span className="small" style={wrap}><strong>Due</strong> {formatInZone(item.deadlineAt, actions.timeZone, { dateStyle: 'medium', timeStyle: 'short' })}</span>}
          {item.action && <span className="small" style={wrap}><strong>Next:</strong> {item.action}</span>}
          {item.tags && item.tags.length > 0 && <span className="muted small" style={wrap}>{item.tags.join(' · ')}</span>}
        </>
      )}
      {app && actions.onOpenApplication && !(item.attention && compact) && (
        <div>
          <Button
            variant="link" size="sm" onClick={() => actions.onOpenApplication!(app.id)} aria-label={`Open application ${app.label}`}
            style={{ whiteSpace: 'normal', textAlign: 'left', height: 'auto', minHeight: '24px', maxWidth: '100%', ...wrap }}
          >{app.label}</Button>
        </div>
      )}
    </li>
  );
}

const cardList = { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '8px' } as const;

function CardList({ items, actions, label, compact }: { items: DigestItem[]; actions: DigestActions; label: string; compact?: boolean }) {
  return <ul aria-label={label} style={cardList}>{items.map((it, i) => <ItemCard key={`${it.ref?.id ?? it.title}-${i}`} item={it} actions={actions} compact={compact} />)}</ul>;
}

function CanonicalSection({ sectionKey, title, tab, section, actions }: { sectionKey: DigestSectionKey; title: string; tab?: string; section: DigestSection; actions: DigestActions }) {
  const id = `digest-sec-${sectionKey}`;
  const hidden = hiddenCount(section);
  const grouped = sectionKey === 'job_email' || sectionKey === 'other_email';
  const groups = grouped ? groupByUrgency(section.items) : [];
  return (
    <section aria-labelledby={id} style={{ display: 'grid', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <h4 id={id} style={{ margin: 0, fontSize: '14px' }}>{title}</h4>
        <StatusBadge variant={statusVariant(section.status)}>
          {section.status === 'available' && section.count !== null ? `${section.count} · ` : ''}{DIGEST_SECTION_STATUS_LABELS[section.status]}
        </StatusBadge>
        {tab && actions.onOpenTab && (
          <Button variant="link" size="sm" onClick={() => actions.onOpenTab!(tab)} aria-label={`View all ${title.toLowerCase()} in AI Hub`}>View all</Button>
        )}
      </div>
      {section.status === 'available' && section.items.length > 0 && !grouped && <CardList items={section.items} actions={actions} label={title} />}
      {section.status === 'available' && section.items.length > 0 && grouped && groups.map((g) => {
        const gid = `${id}-${g.urgency}`;
        const body = <CardList items={g.items} actions={actions} label={`${title}, ${URGENCY_LABEL[g.urgency]} urgency`} compact />;
        return g.urgency === 'LOW' && sectionKey === 'other_email' ? (
          <details key={g.urgency}>
            <summary className="small" style={{ cursor: 'pointer' }}>{URGENCY_LABEL[g.urgency]} urgency ({g.items.length}), collapsed</summary>
            <div style={{ marginTop: '8px' }}>{body}</div>
          </details>
        ) : (
          <div key={g.urgency} role="group" aria-labelledby={gid} style={{ display: 'grid', gap: '6px' }}>
            <h5 id={gid} style={{ margin: 0, fontSize: '13px' }}>{URGENCY_LABEL[g.urgency]} urgency <span className="muted small">({g.items.length})</span></h5>
            {body}
          </div>
        );
      })}
      {section.status === 'available' && section.items.length === 0 && <span className="muted small">Counted, but no item details were stored.</span>}
      {hidden > 0 && <span className="muted small">Showing {section.items.length} of {section.count}.</span>}
      {section.status !== 'available' && <span className="muted small">{digestEmptyText(sectionKey, section.status)}</span>}
    </section>
  );
}

function CanonicalBody({ digest, actions }: { digest: ParsedDigest; actions: DigestActions }) {
  const sources = sourceAvailability(digest);
  const metrics = headlineMetrics(digest);
  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      {metrics.length > 0 && (
        <dl aria-label="Summary" style={{ margin: 0, display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
          {metrics.map((m) => (
            <div key={m.key} style={{ display: 'grid', gap: '2px' }}>
              <dd style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>{m.value}</dd>
              <dt className="muted small">{m.label}</dt>
            </div>
          ))}
        </dl>
      )}
      {sources.length > 0 && (
        <ul aria-label="Source availability" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {sources.map((s) => <li key={s.key}><StatusBadge variant={statusVariant(s.status)}>{s.title}: {DIGEST_SECTION_STATUS_LABELS[s.status]}</StatusBadge></li>)}
        </ul>
      )}
      {digest.priorities.length > 0 && (
        <section aria-label="Top Priorities" style={{ display: 'grid', gap: '6px' }}>
          <h4 style={{ margin: 0, fontSize: '14px' }}>Top Priorities</h4>
          <ItemList items={digest.priorities} />
        </section>
      )}
      {digestLayout(digest).map(({ key, title, tab }) => {
        const section = digest.sections[key];
        return section ? <CanonicalSection key={key} sectionKey={key} title={title} tab={tab} section={section} actions={actions} /> : null;
      })}
    </div>
  );
}

// ---- body / cards ---------------------------------------------------------------------------------------------------------

function DigestBody({ digest, actions }: { digest: ParsedDigest; actions: DigestActions }) {
  if (digest.canonical) return <CanonicalBody digest={digest} actions={actions} />;
  const sources = sourceAvailability(digest);
  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      {digest.summary.length > 0 && (
        <dl aria-label="Summary" style={{ margin: 0, display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
          {digest.summary.map((m) => (
            <div key={m.key} style={{ display: 'grid', gap: '2px' }}>
              <dd style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>{m.value}</dd>
              <dt className="muted small">{m.label}</dt>
            </div>
          ))}
        </dl>
      )}
      {sources.length > 0 && (
        <ul aria-label="Source availability" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {sources.map((s) => <li key={s.key}><StatusBadge variant={statusVariant(s.status)}>{s.title}: {DIGEST_SECTION_STATUS_LABELS[s.status]}</StatusBadge></li>)}
        </ul>
      )}
      {digest.priorities.length > 0 && (
        <section aria-label="Top Priorities" style={{ display: 'grid', gap: '6px' }}>
          <h4 style={{ margin: 0, fontSize: '14px' }}>Top Priorities</h4>
          <ItemList items={digest.priorities} />
        </section>
      )}
      {digestLayout(digest).map(({ key, title }) => {
        const section = digest.sections[key];
        return section ? <Section key={key} title={title} section={section} /> : null;
      })}
      {digest.priorities.length === 0 && sources.length === 0 && digest.summary.length === 0 && (
        <span className="muted small">This digest contains no details.</span>
      )}
    </div>
  );
}

function DigestCard({ date, heading, entry, digest, actions }: { date: string; heading: string; entry: Pick<DigestEntry, 'provider' | 'createdAt'> | null; digest: ParsedDigest | null; actions: DigestActions }) {
  const timeZone = actions.timeZone;
  const generated = digest?.generatedAt ?? entry?.createdAt ?? null;
  return (
    <Card>
      <header style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', display: 'grid', gap: '4px', ...wrap }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>{formatDigestDate(date) || 'Digest'}</h3>
        <span className="muted small">
          {heading}{generated ? ` · Generated ${formatInZone(generated, timeZone, { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
        </span>
      </header>
      <CardBody>
        {digest
          ? <DigestBody digest={digest} actions={actions} />
          : <span className="muted">This digest uses a format this version of JobQuest cannot display.</span>}
      </CardBody>
    </Card>
  );
}

function DayGroup({ group, provider, actions }: { group: DigestDayGroup; provider: string; actions: DigestActions }) {
  const parsed = group.entries.filter((e): e is DigestEntry & { digest: ParsedDigest } => e.digest !== null);
  const combine = provider === 'ALL' && parsed.length > 1;
  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      {combine && (
        <DigestCard
          date={group.date}
          heading={`Combined view of ${parsed.length} providers (${parsed.map((p) => digestProviderLabel(p.provider)).join(', ')})`}
          entry={null}
          digest={combineDigests(parsed.map((p) => ({ provider: p.provider, digest: p.digest })))}
          actions={actions}
        />
      )}
      {group.entries.map((e) => (
        <DigestCard key={e.id} date={group.date} heading={digestProviderLabel(e.provider)} entry={e} digest={e.digest} actions={actions} />
      ))}
    </div>
  );
}

// ---- panel (presentational) -----------------------------------------------------------------

export interface DigestPanelProps {
  state: DigestLoadState;
  preset: DigestPreset;
  customFrom: string;
  customTo: string;
  provider: string;
  page: number;
  today: string;
  timeZone: string;
  rangeMessage?: string | null;
  live?: { status: 'loading' } | { status: 'error' } | { status: 'ready'; metrics: LiveMetrics } | null;
  generate?: { status: 'idle' | 'working' | 'error' | 'done'; message?: string } | null;
  onPreset: (p: DigestPreset) => void;
  onCustom: (from: string, to: string) => void;
  onProvider: (p: string) => void;
  onPage: (p: number) => void;
  onRetry?: () => void;
  onGenerate?: () => void;
  /** AI-8: supported actions awaiting THIS user's review (null/absent = unknown or none to show). The digest never executes anything. */
  pendingActions?: number | null;
  onOpenActions?: () => void;
  /** Navigation only (the digest never changes a record): open one of the owner's applications, or an AI Hub tab. */
  onOpenApplication?: (id: string) => void;
  onOpenTab?: (path: string) => void;
}

function LiveCard({ live, onGenerate, generate }: { live: NonNullable<DigestPanelProps['live']>; onGenerate?: () => void; generate?: DigestPanelProps['generate'] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Live JobQuest metrics</CardTitle></CardHeader>
      <CardBody>
        <p className="muted small" style={{ margin: '0 0 8px' }}>Current numbers, not a stored digest. They will change as your data changes.</p>
        {live.status === 'loading' && <div role="status" aria-live="polite" aria-label="Loading live metrics"><Skeleton height={40} /></div>}
        {live.status === 'error' && <p role="alert" style={{ margin: 0 }}>Live metrics could not be loaded.</p>}
        {live.status === 'ready' && (
          <dl aria-label="Live metrics" style={{ margin: 0, display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
            {([['Applications added today', live.metrics.applicationsAdded], ['Active applications', live.metrics.activeApplications], ['Follow-ups due', live.metrics.followUps], ['Pending suggestions', live.metrics.pendingSuggestions]] as const).map(([label, value]) => (
              <div key={label} style={{ display: 'grid', gap: '2px' }}>
                <dd style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>{value}</dd>
                <dt className="muted small">{label}</dt>
              </div>
            ))}
          </dl>
        )}
        {onGenerate && (
          <div style={{ marginTop: '12px', display: 'grid', gap: '6px' }}>
            <div><Button variant="secondary" onClick={onGenerate} isLoading={generate?.status === 'working'}>Save a JobQuest digest for today</Button></div>
            <span className="muted small">Builds today’s snapshot from what JobQuest already holds: needs attention, job and other email, upcoming, recent job leads, recruiters and follow-ups. A section reads “Not configured” until its source has run, “Unavailable” when its last run failed, and “None found” when it ran and found nothing. Nothing is searched or changed.</span>
          </div>
        )}
        {generate?.status === 'error' && <p role="alert" style={{ margin: '8px 0 0' }}>{generate.message ?? 'Could not save the digest.'}</p>}
      </CardBody>
    </Card>
  );
}

export function AiHubDigestPanel(p: DigestPanelProps) {
  const groups = useMemo(() => (p.state.status === 'ready' ? groupDigestsByDate(p.state.rows) : []), [p.state]);
  const range = resolveDigestRange(p.preset, p.today, { from: p.customFrom, to: p.customTo });
  const empty = p.state.status === 'ready' && groups.length === 0;
  const filtered = p.provider !== 'ALL';
  const noDigestToday = empty && p.preset === 'today';
  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <h2 style={{ margin: 0, fontSize: '18px' }}>Daily Digest</h2>
      {typeof p.pendingActions === 'number' && p.pendingActions > 0 && (
        <p role="status" style={{ margin: 0, display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span>{pendingActionsText(p.pendingActions)}.</span>
          {p.onOpenActions && <Button variant="secondary" size="sm" onClick={p.onOpenActions}>Review in Actions</Button>}
        </p>
      )}
      <div role="group" aria-label="Digest date range" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {DIGEST_PRESETS.map((d) => (
          <Button key={d.id} variant={p.preset === d.id ? 'primary' : 'secondary'} aria-pressed={p.preset === d.id} onClick={() => p.onPreset(d.id)}>{d.label}</Button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {p.preset === 'custom' && (
          <>
            <label className="small" style={{ display: 'grid', gap: '2px', flex: '1 1 150px' }}>
              <span className="muted">From date</span>
              <Input type="date" value={p.customFrom} max={p.today} onChange={(e) => p.onCustom(e.target.value, p.customTo)} aria-invalid={!range.ok} aria-describedby={!range.ok ? 'digest-range-msg' : undefined} />
            </label>
            <label className="small" style={{ display: 'grid', gap: '2px', flex: '1 1 150px' }}>
              <span className="muted">To date</span>
              <Input type="date" value={p.customTo} max={p.today} onChange={(e) => p.onCustom(p.customFrom, e.target.value)} aria-invalid={!range.ok} aria-describedby={!range.ok ? 'digest-range-msg' : undefined} />
            </label>
          </>
        )}
        <label className="small" style={{ display: 'grid', gap: '2px', minWidth: '150px', flex: '1 1 150px' }}>
          <span className="muted">Provider</span>
          <Select value={p.provider} onChange={(e) => p.onProvider(e.target.value)}>
            {DIGEST_PROVIDER_FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </Select>
        </label>
      </div>
      {!range.ok && <p id="digest-range-msg" role="alert" style={{ margin: 0 }}>{range.message}</p>}
      {p.rangeMessage && <p role="status" style={{ margin: 0 }}>{p.rangeMessage}</p>}

      {range.ok && p.state.status === 'loading' && (
        <div role="status" aria-live="polite" aria-label="Loading Daily Digest" style={{ display: 'grid', gap: '10px' }}>
          <Skeleton height={20} width="40%" /><Skeleton height={96} /><Skeleton height={96} />
        </div>
      )}
      {range.ok && p.state.status === 'error' && (
        <div role="alert">
          <EmptyState
            icon={<AlertTriangle size={22} />}
            title="Daily Digest could not be loaded."
            description="Your JobQuest applications and the rest of AI Hub are unaffected."
            action={p.onRetry ? <Button variant="secondary" onClick={p.onRetry}>Try again</Button> : undefined}
          />
        </div>
      )}
      {range.ok && empty && (
        <EmptyState
          icon={<CalendarDays size={22} />}
          title={noDigestToday ? 'No Daily Digest has been generated for today.' : p.preset === 'yesterday' ? 'No Daily Digest was stored for yesterday.' : 'No Daily Digests in this range.'}
          description={filtered ? `Nothing stored for ${digestProviderLabel(p.provider)}. Try All providers.` : 'Digests appear here after a scheduled provider task or a saved JobQuest digest.'}
        />
      )}
      {range.ok && noDigestToday && p.live && <LiveCard live={p.live} onGenerate={p.onGenerate} generate={p.generate} />}
      {p.generate?.status === 'done' && <p role="status" style={{ margin: 0 }}>{p.generate.message}</p>}
      {range.ok && p.state.status === 'ready' && groups.map((g) => (
        <DayGroup key={g.date || 'undated'} group={g} provider={p.provider} actions={{ timeZone: p.timeZone, onOpenApplication: p.onOpenApplication, onOpenTab: p.onOpenTab }} />
      ))}
      {range.ok && p.state.status === 'ready' && (p.page > 0 || p.state.hasNext) && (
        <nav aria-label="Digest pagination" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Button variant="secondary" disabled={p.page === 0} onClick={() => p.onPage(p.page - 1)}>Previous</Button>
          <span className="muted small" aria-live="polite">Page {p.page + 1}</span>
          <Button variant="secondary" disabled={!p.state.hasNext} onClick={() => p.onPage(p.page + 1)}>Next</Button>
        </nav>
      )}
    </div>
  );
}

// ---- container --------------------------------------------------------------------------------------

/** Owns range/provider/page and its own failure state, isolated from Overview and History. */
export function AiHubDigest({ activeWorkspaceId, currentUserId, session, onNavigate }: { activeWorkspaceId: string | null; currentUserId: string | null; session?: PublicSession | null; onNavigate?: (path: string) => void }) {
  const { timeZone, loaded } = useProfileTimeZone(currentUserId);
  const today = todayKey(new Date(), timeZone);
  const [preset, setPreset] = useState<DigestPreset>('today');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [provider, setProvider] = useState('ALL');
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DigestLoadState>({ status: 'loading' });
  const [live, setLive] = useState<NonNullable<DigestPanelProps['live']>>({ status: 'loading' });
  const [generate, setGenerate] = useState<NonNullable<DigestPanelProps['generate']>>({ status: 'idle' });
  const range = resolveDigestRange(preset, today, custom);
  const from = range.ok ? range.dateFrom : '';
  const to = range.ok ? range.dateTo : '';

  useEffect(() => {
    if (!activeWorkspaceId || !loaded || !from) return undefined;
    let cancelled = false;
    setState({ status: 'loading' });
    fetchDigestPage(activeWorkspaceId, { dateFrom: from, dateTo: to, provider }, page).then(
      (r) => { if (!cancelled) setState({ status: 'ready', ...r }); },
      () => { if (!cancelled) setState({ status: 'error' }); },
    );
    return () => { cancelled = true; };
  }, [activeWorkspaceId, loaded, from, to, provider, page, attempt]);

  const [pendingActions, setPendingActions] = useState<number | null>(null);
  useEffect(() => {
    if (!activeWorkspaceId || !currentUserId || !session) return undefined;
    let cancelled = false;
    fetchPendingActionCount(activeWorkspaceId, session).then(
      (n) => { if (!cancelled) setPendingActions(n); },
      () => { if (!cancelled) setPendingActions(null); }, // isolated: the digest renders without it
    );
    return () => { cancelled = true; };
  }, [activeWorkspaceId, currentUserId, session?.access_token]); // the count only needs a fresh token, not a new session object

  const needLive = preset === 'today' && state.status === 'ready' && state.rows.length === 0;
  useEffect(() => {
    if (!needLive || !activeWorkspaceId || !currentUserId) return undefined;
    let cancelled = false;
    setLive({ status: 'loading' });
    fetchLiveMetrics(activeWorkspaceId, currentUserId, today, timeZone).then(
      (metrics) => { if (!cancelled) setLive({ status: 'ready', metrics }); },
      () => { if (!cancelled) setLive({ status: 'error' }); },
    );
    return () => { cancelled = true; };
  }, [needLive, activeWorkspaceId, currentUserId, today, timeZone]);

  const onGenerate = useCallback(() => {
    if (!activeWorkspaceId || !session) return;
    setGenerate({ status: 'working' });
    generateTodayDigest(activeWorkspaceId, session).then(
      (r) => { setGenerate({ status: 'done', message: r.duplicate ? 'Today’s JobQuest digest was already saved.' : 'Saved today’s JobQuest digest.' }); setAttempt((n) => n + 1); },
      (e: unknown) => setGenerate({ status: 'error', message: e instanceof Error ? e.message : 'Could not save the digest.' }),
    );
  }, [activeWorkspaceId, session]);

  return (
    <AiHubDigestPanel
      state={state} preset={preset} customFrom={custom.from} customTo={custom.to} provider={provider} page={page}
      today={today} timeZone={timeZone} live={needLive ? live : null} generate={generate}
      onPreset={(p) => { setPreset(p); setPage(0); setGenerate({ status: 'idle' }); }}
      onCustom={(f, t) => { setCustom({ from: f, to: t }); setPage(0); }}
      onProvider={(p) => { setProvider(p); setPage(0); }}
      onPage={setPage}
      onRetry={() => setAttempt((n) => n + 1)}
      onGenerate={session ? onGenerate : undefined}
      pendingActions={pendingActions}
      onOpenActions={onNavigate ? () => onNavigate('/ai-hub/actions') : undefined}
      onOpenApplication={onNavigate && activeWorkspaceId ? (id) => onNavigate(`/w/${activeWorkspaceId}/applications/${id}`) : undefined}
      onOpenTab={onNavigate}
    />
  );
}
