import { useCallback, useState } from 'react';
import { Inbox } from 'lucide-react';
import { dismissAiFinding, fetchSourceConfigured } from '../api/aiSources';
import { fetchCalendarPage } from '../api/aiCalendar';
import { useProfileTimeZone } from '../hooks/useProfileTimeZone';
import { formatInZone } from '../lib/time';
import { aiProviderLabel, formatConfidence } from '../lib/aiHub';
import {
  CALENDAR_CATEGORIES, CALENDAR_CATEGORY_LABELS, CALENDAR_NOTE, CALENDAR_STATUSES, CALENDAR_STATUS_LABELS, CALENDAR_VIEWS, DEFAULT_CALENDAR_FILTERS,
  calendarCategoryLabel, calendarDayHeading, calendarKindLabel, calendarSourceZoneNote, calendarStatusLabel, calendarWasLabel, calendarWhenLabel,
  calendarWindow, groupByDay, type CalendarEventView, type CalendarFilters, type CalendarViewId,
} from '../lib/aiCalendar';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  DateRangeFields, DismissControl, ExternalLink, FilterField, PriorityBadge, ProviderSelect, ResultsSummary, SourceEmpty, SourceError, SourceFilterForm,
  SourceLoading, SourcePager, StatusSelect, useSourceConfigured, useSourceRows, wrap, type SourceLoadState,
} from './AiHubSourceParts';

// Calendar INTELLIGENCE, not a calendar: stored observations from an AI provider. This page cannot create,
// change, accept, decline, reschedule or cancel anything, and it never contacts a calendar. The only action is
// the shared owner-only "dismiss" review step. Times are shown in the owner's profile zone; all-day items are dates.

const host = (u: string) => { try { return new URL(u).host; } catch { return u; } };

const EMPTY_TITLES: Record<CalendarViewId, string> = {
  upcoming: 'Nothing upcoming.', today: 'Nothing scheduled today.', week: 'Nothing scheduled this week.', past: 'No past calendar items.', custom: 'No items in this date range.',
};

const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'danger' | 'muted'> = { scheduled: 'info', tentative: 'muted', rescheduled: 'warning', cancelled: 'danger' };

export function CalendarCard({ item, timeZone, currentUserId, onDismiss, onOpenTab }: {
  item: CalendarEventView; timeZone: string; currentUserId: string | null; onDismiss?: (e: CalendarEventView) => Promise<void>; onOpenTab?: (path: string) => void;
}) {
  const cancelled = item.status === 'cancelled';
  const was = calendarWasLabel(item, timeZone);
  const zoneNote = calendarSourceZoneNote(item, timeZone);
  const conf = formatConfidence(item.confidence);
  const canDismiss = onDismiss && currentUserId === item.ownerId && (item.reviewStatus === 'NEW' || item.reviewStatus === 'REVIEWED');
  const role = [item.company, item.jobTitle].filter(Boolean).join(' · ');
  const organizer = [item.organizerName, item.organizerDomain ? `(${item.organizerDomain})` : ''].filter(Boolean).join(' ');
  const source = [item.calendarSource ? item.calendarSource.replace(/_/g, ' ') : '', aiProviderLabel(item.provider) ? `reported by ${aiProviderLabel(item.provider)}` : ''].filter(Boolean).join(' · ');
  const rows: Array<[string, React.ReactNode]> = [
    ['Source time zone', zoneNote],
    [cancelled ? 'Was scheduled for' : 'Moved from', item.status === 'rescheduled' || cancelled ? was : null],
    ['Cancelled', cancelled && item.cancelledAt ? formatInZone(item.cancelledAt, timeZone, { dateStyle: 'medium', timeStyle: 'short' }) : null],
    ['Company and role', role],
    ['Location', item.location],
    ['Meeting link', item.meetingUrl ? <ExternalLink href={item.meetingUrl}>{host(item.meetingUrl)}</ExternalLink> : null],
    ['Calendar link', item.sourceEventUrl ? <ExternalLink href={item.sourceEventUrl}>{host(item.sourceEventUrl)}</ExternalLink> : null],
    ['Organizer', organizer],
    ['Source', source],
    ['Related job lead', item.relatedLead ? (onOpenTab ? <Button variant="secondary" size="sm" onClick={() => onOpenTab('/ai-hub/job-leads')}>{item.relatedLead.title} at {item.relatedLead.company}</Button> : `${item.relatedLead.title} at ${item.relatedLead.company}`) : null],
    ['Tracked application', item.relatedApplication ? `${item.relatedApplication.role} at ${item.relatedApplication.company}` : null],
    ['Also reported by email', item.relatedEmails.length ? item.relatedEmails.map((m) => m.title).join('; ') : null],
    ['Confidence', conf],
    ['Discovered', formatInZone(item.discoveredAt, timeZone, { dateStyle: 'medium', timeStyle: 'short' })],
  ];
  return (
    <Card>
      <CardBody>
        <article aria-label={`${item.title}, ${calendarKindLabel(item).toLowerCase()}`} style={{ display: 'grid', gap: '8px', ...wrap }}>
          <header style={{ display: 'grid', gap: '4px' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <StatusBadge variant={item.isDeadline ? 'warning' : 'info'}>{calendarKindLabel(item)}</StatusBadge>
              <StatusBadge variant="muted">{calendarCategoryLabel(item.category)}</StatusBadge>
              {item.status !== 'scheduled' && <StatusBadge variant={STATUS_VARIANT[item.status] ?? 'muted'}>{calendarStatusLabel(item.status)}</StatusBadge>}
              <PriorityBadge priority={item.priority} />
              {item.reviewStatus === 'DISMISSED' && <StatusBadge variant="muted">Dismissed</StatusBadge>}
            </div>
            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600, textDecoration: cancelled ? 'line-through' : undefined, ...wrap }}>{item.title}</h4>
            <span style={wrap}>{calendarWhenLabel(item, timeZone)}</span>
          </header>
          {item.summary && <p style={{ margin: 0, ...wrap }}>{item.summary}</p>}
          <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, auto) 1fr', gap: '4px 12px', margin: 0 }}>
            {rows.filter((r) => r[1]).map(([k, v]) => (
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
          {canDismiss && <div><DismissControl label={item.title} onDismiss={() => onDismiss(item)} /></div>}
        </article>
      </CardBody>
    </Card>
  );
}

export interface CalendarPanelProps {
  state: SourceLoadState<CalendarEventView>;
  draft: CalendarFilters;
  page: number;
  timeZone: string;
  currentUserId: string | null;
  configured: boolean | null;
  filtered: boolean;
  message?: string | null;
  activeView: CalendarViewId;
  onDraft: (f: CalendarFilters) => void;
  onView: (v: CalendarViewId) => void;
  onApply: () => void;
  onReset: () => void;
  onPage: (p: number) => void;
  onRetry?: () => void;
  onDismiss?: (e: CalendarEventView) => Promise<void>;
  onOpenSettings?: () => void;
  onOpenTab?: (path: string) => void;
}

export function AiHubCalendarPanel(p: CalendarPanelProps) {
  const d = p.draft;
  const set = (patch: Partial<CalendarFilters>) => p.onDraft({ ...d, ...patch });
  const groups = p.state.status === 'ready' ? groupByDay(p.state.rows, p.timeZone) : [];
  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <h2 style={{ margin: 0, fontSize: '18px' }}>Calendar Intelligence</h2>
      <p className="muted small" style={{ margin: 0 }}>{CALENDAR_NOTE}</p>
      <div role="group" aria-label="Calendar view" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {CALENDAR_VIEWS.map((v) => (
          <Button key={v.id} type="button" size="sm" variant={p.activeView === v.id ? 'primary' : 'secondary'} aria-pressed={p.activeView === v.id} onClick={() => p.onView(v.id)}>{v.label}</Button>
        ))}
      </div>
      <SourceFilterForm label="Calendar filters" onApply={p.onApply} onReset={p.onReset} message={p.message}>
        {d.view === 'custom' && <DateRangeFields label="Event" value={d.range} onChange={(v) => set({ range: v })} invalid={Boolean(p.message)} describedBy="calendar-filters-msg" />}
        <FilterField label="Category">
          <Select value={d.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="ALL">All categories</option>
            {CALENDAR_CATEGORIES.map((c) => <option key={c} value={c}>{CALENDAR_CATEGORY_LABELS[c]}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Event status">
          <Select value={d.eventStatus} onChange={(e) => set({ eventStatus: e.target.value })}>
            <option value="ALL">Any status</option>
            {CALENDAR_STATUSES.map((s) => <option key={s} value={s}>{CALENDAR_STATUS_LABELS[s]}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Company"><Input value={d.company} maxLength={80} onChange={(e) => set({ company: e.target.value })} /></FilterField>
        <ProviderSelect value={d.provider} onChange={(v) => set({ provider: v })} />
        <StatusSelect value={d.status} onChange={(v) => set({ status: v })} />
      </SourceFilterForm>

      {p.state.status === 'loading' && <SourceLoading label="calendar intelligence" />}
      {p.state.status === 'error' && <SourceError label="Calendar intelligence" onRetry={p.onRetry} />}
      {p.state.status === 'ready' && (
        <>
          <ResultsSummary count={p.state.rows.length} hasNext={p.state.hasNext} page={p.page} noun="calendar item" />
          {p.state.rows.length === 0
            ? (!p.filtered && p.configured === false
              ? <SourceEmpty kind="calendar" configured={false} filtered={false} onOpenSettings={p.onOpenSettings} />
              : (
                <EmptyState
                  icon={<Inbox size={22} />}
                  title={p.filtered ? 'No results match these filters.' : EMPTY_TITLES[p.activeView]}
                  description={p.filtered ? 'Try widening or resetting the filters.' : 'Items appear here after a successful calendar run.'}
                />
              ))
            : (
              <ol aria-label="Calendar intelligence" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '16px' }}>
                {groups.map((g) => (
                  <li key={g.key} style={{ display: 'grid', gap: '8px', minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>{calendarDayHeading(g.key)}</h3>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '12px' }}>
                      {g.items.map((e) => <li key={e.id}><CalendarCard item={e} timeZone={p.timeZone} currentUserId={p.currentUserId} onDismiss={p.onDismiss} onOpenTab={p.onOpenTab} /></li>)}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          <SourcePager page={p.page} hasNext={p.state.hasNext} onPage={p.onPage} label="Calendar intelligence" />
        </>
      )}
    </div>
  );
}

export function AiHubCalendar({ activeWorkspaceId, currentUserId, onNavigate }: { activeWorkspaceId: string | null; currentUserId: string | null; onNavigate?: (path: string) => void }) {
  const { timeZone, weekStart, loaded } = useProfileTimeZone(currentUserId);
  const [draft, setDraft] = useState<CalendarFilters>(DEFAULT_CALENDAR_FILTERS);
  const [applied, setApplied] = useState<CalendarFilters>(DEFAULT_CALENDAR_FILTERS);
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const enabled = Boolean(activeWorkspaceId) && loaded;
  const { state, retry } = useSourceRows<CalendarEventView>(
    enabled, [activeWorkspaceId, applied, page, timeZone, weekStart],
    () => fetchCalendarPage(activeWorkspaceId!, applied, timeZone, weekStart, page),
  );
  const configured = useSourceConfigured(enabled, () => fetchSourceConfigured(activeWorkspaceId!, 'calendar'), [activeWorkspaceId]);
  // "filtered" ignores the view: an empty Today is not the same as a source that has nothing at all.
  const filtered = applied.provider !== 'ALL' || applied.status !== DEFAULT_CALENDAR_FILTERS.status || applied.category !== 'ALL' || applied.eventStatus !== 'ALL' || applied.company !== '';
  const check = useCallback((f: CalendarFilters) => {
    const w = calendarWindow(f.view, f.range, timeZone, new Date(), weekStart);
    return w.ok ? null : w.message;
  }, [timeZone, weekStart]);
  const apply = useCallback((f: CalendarFilters) => {
    const err = check(f);
    if (err) { setMessage(`Event dates: ${err}`); return; }
    setMessage(null); setPage(0); setApplied(f);
  }, [check]);
  const onView = useCallback((v: CalendarViewId) => {
    const next = { ...draft, view: v };
    setDraft(next);
    if (v === 'custom' && !next.range.from && !next.range.to) { setMessage(null); return; } // wait for dates
    apply(next);
  }, [draft, apply]);
  const onReset = useCallback(() => { setMessage(null); setDraft(DEFAULT_CALENDAR_FILTERS); setApplied(DEFAULT_CALENDAR_FILTERS); setPage(0); }, []);
  const onDismiss = useCallback(async (e: CalendarEventView) => { await dismissAiFinding(e.id); retry(); }, [retry]);
  return (
    <AiHubCalendarPanel
      state={state} draft={draft} page={page} timeZone={timeZone} currentUserId={currentUserId} configured={configured} filtered={filtered} message={message}
      activeView={draft.view}
      onDraft={setDraft} onView={onView} onApply={() => apply(draft)} onReset={onReset} onPage={setPage} onRetry={retry} onDismiss={onDismiss}
      onOpenSettings={onNavigate ? () => onNavigate('/settings/ai') : undefined} onOpenTab={onNavigate}
    />
  );
}
