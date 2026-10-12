import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ClipboardCheck } from 'lucide-react';
import type { PublicSession } from '../api';
import { ActionApiError, executeAiAction, fetchActionHistory, fetchActionPreview, fetchActionQueue, ignoreSuggestion, type ActionExecuted } from '../api/aiActions';
import { useProfileTimeZone } from '../hooks/useProfileTimeZone';
import { formatInZone } from '../lib/time';
import { aiProviderLabel, formatConfidence } from '../lib/aiHub';
import {
  ACTION_PROVIDER_FILTERS, ACTION_SOURCE_FILTERS, AI_ACTION_LABELS, AI_ACTION_TYPE_VALUES, DEFAULT_ACTION_FILTERS, HISTORY_STATUS_LABELS,
  MATCH_BASIS_LABELS, actionErrorMessage, actionNeedsRefresh, aiActionTypeLabel, confirmReadiness, executeBody, historyStatusVariant, initialChoice,
  matchLabel, stageText,
  type ActionCardRow, type ActionFilters, type ActionHistoryPage, type ActionHistoryRow, type ActionPreviewData, type ActionQueuePage, type ReviewChoice,
} from '../lib/aiActions';
import { Card, CardBody } from '../components/ui/Card';
import { Dialog } from '../components/ui/Dialog';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { StatusBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { FilterField, ResultsSummary, SourceError, SourceLoading, SourcePager, wrap } from './AiHubSourceParts';

// AI-8: the human approval center. Nothing here executes on its own: a card only offers "Review"; the review dialog
// shows the current and proposed state; the action-specific Confirm button is the only thing that sends the (CSRF
// protected) execute request, once, and the server re-validates everything. There is no bulk approval.

type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

const typeVariant = (a: string) => (a === 'set_status' ? 'warning' : 'info') as 'warning' | 'info';
const fmt = (iso: string, tz: string) => formatInZone(iso, tz, { dateStyle: 'medium', timeStyle: 'short' });

// ---- cards ------------------------------------------------------------------------------------------------------------

export function ActionCard({ item, timeZone, onReview }: { item: ActionCardRow; timeZone: string; onReview: (i: ActionCardRow) => void }) {
  const conf = formatConfidence(item.confidence);
  const label = aiActionTypeLabel(item.action);
  return (
    <Card>
      <CardBody>
        <article aria-label={item.summary} style={{ display: 'grid', gap: '8px', ...wrap }}>
          <header style={{ display: 'grid', gap: '4px' }}>
            <span><StatusBadge variant={typeVariant(item.action)}>{label}</StatusBadge></span>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, ...wrap }}>{item.summary}</h3>
          </header>
          <span className="small" style={wrap}><strong>From:</strong> {item.findingTitle}</span>
          {item.evidence && <blockquote className="small muted" style={{ margin: 0, paddingLeft: '10px', borderLeft: '2px solid var(--border, #ccc)', ...wrap }}>{item.evidence}</blockquote>}
          <span className="small" style={wrap}>
            <strong>Target:</strong>{' '}
            {item.action === 'create_application' || item.target.match
              ? `${matchLabel(item.target.match)}${item.target.label ? ` · ${item.target.label}` : ''}`
              : 'Resolved when you review'}
          </span>
          <span className="muted small">
            {[aiProviderLabel(item.provider), conf ? `Confidence ${conf}` : '', `Suggested ${fmt(item.createdAt, timeZone)}`].filter(Boolean).join(' · ')}
          </span>
          <div><Button variant="primary" size="sm" onClick={() => onReview(item)} aria-label={`Review: ${item.summary}`}>Review</Button></div>
        </article>
      </CardBody>
    </Card>
  );
}

// ---- review dialog ------------------------------------------------------------------------------------------------------

type ReviewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; preview: ActionPreviewData; choice: ReviewChoice; submitting: boolean; error: string | null; notice: string | null }
  | { status: 'done'; result: ActionExecuted };

function Lines({ title, lines }: { title: string; lines: Array<{ label: string; value: string }> }) {
  return (
    <section aria-label={title} style={{ display: 'grid', gap: '4px', minWidth: 0 }}>
      <h3 style={{ margin: 0, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.04em' }} className="muted">{title}</h3>
      <dl style={{ margin: 0, display: 'grid', gap: '4px' }}>
        {lines.map((l) => (
          <div key={l.label} style={{ display: 'grid', gap: '0' }}>
            <dt className="muted small">{l.label}</dt>
            <dd style={{ margin: 0, ...wrap }}>{l.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ReviewBody({ preview, choice, onChoice, workspaceId, onOpen }: {
  preview: ActionPreviewData; choice: ReviewChoice; onChoice: (c: ReviewChoice) => void; workspaceId: string; onOpen: (path: string) => void;
}) {
  const set = (patch: Partial<ReviewChoice>) => onChoice({ ...choice, ...patch });
  const m = preview.match;
  const conf = formatConfidence(preview.source.confidence);
  const appPath = (id: string) => `/w/${workspaceId}/applications/${id}`;
  const candidates = m?.candidates ?? [];
  const pickExisting = preview.choices.useExisting && candidates.length > 0;
  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <section aria-label="Action" style={{ display: 'grid', gap: '2px' }}>
        <h3 style={{ margin: 0, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.04em' }} className="muted">Action</h3>
        <strong style={wrap}>{preview.summary}</strong>
      </section>
      <section aria-label="Source" style={{ display: 'grid', gap: '4px', ...wrap }}>
        <h3 style={{ margin: 0, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.04em' }} className="muted">Source</h3>
        <span>{preview.source.title}</span>
        <span className="muted small">{[aiProviderLabel(preview.provider), conf ? `Confidence ${conf}` : ''].filter(Boolean).join(' · ')}</span>
        {preview.source.evidence && <blockquote className="small muted" style={{ margin: 0, paddingLeft: '10px', borderLeft: '2px solid var(--border, #ccc)' }}>{preview.source.evidence}</blockquote>}
      </section>
      {m && (
        <section aria-label="Match status" style={{ display: 'grid', gap: '4px' }}>
          <h3 style={{ margin: 0, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.04em' }} className="muted">Match status</h3>
          <span><StatusBadge variant={m.result === 'NONE' ? 'muted' : m.result === 'AMBIGUOUS' ? 'warning' : 'info'}>{matchLabel(m.result)}</StatusBadge></span>
        </section>
      )}
      <div style={{ display: 'grid', gap: '14px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <Lines title="Current state" lines={preview.current.length ? preview.current : [{ label: 'State', value: 'No change yet' }]} />
        <Lines title="Proposed state" lines={preview.proposed} />
      </div>

      {preview.warnings.length > 0 && (
        <ul aria-label="Warnings" style={{ margin: 0, paddingLeft: '18px', display: 'grid', gap: '4px' }}>
          {preview.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}

      {preview.action === 'create_task' && preview.editable && (
        <fieldset style={{ display: 'grid', gap: '10px', border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, marginBottom: '6px' }}>Task details (you can edit these)</legend>
          <FilterField label="Title"><Input value={choice.title} maxLength={255} onChange={(e) => set({ title: e.target.value })} /></FilterField>
          <FilterField label={`Due date${preview.editable.dueDateSource === 'finding_deadline' ? ' (from the finding deadline)' : ''}`}>
            <Input type="date" value={choice.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
          </FilterField>
          <FilterField label="Priority">
            <Select value={choice.priority} onChange={(e) => set({ priority: e.target.value })}>
              <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option>
            </Select>
          </FilterField>
          <FilterField label="Notes"><Input value={choice.details} maxLength={1000} onChange={(e) => set({ details: e.target.value })} /></FilterField>
        </fieldset>
      )}

      {(pickExisting || preview.choices.noApplication || preview.choices.createNew) && preview.state === 'READY' && (
        <fieldset style={{ display: 'grid', gap: '8px', border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, marginBottom: '6px' }}>
            {preview.action === 'create_application' ? 'Possible existing applications' : preview.action === 'create_task' ? 'Application for this task' : 'Which application?'}
          </legend>
          {pickExisting && candidates.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', minHeight: '32px', flex: '1 1 240px', ...wrap }}>
                <input type="radio" name="application" checked={choice.mode === 'existing' && choice.applicationId === c.id}
                  onChange={() => set({ mode: 'existing', applicationId: c.id })} />
                <span>
                  {c.company} — {c.title}
                  <span className="muted small"> · {c.status === 'CLOSED' ? `Closed (${c.outcome ?? ''})` : stageText(c.stage)} · {MATCH_BASIS_LABELS[c.basis] ?? c.basis}</span>
                </span>
              </label>
              <a href={appPath(c.id)} onClick={(e) => { e.preventDefault(); onOpen(appPath(c.id)); }} style={{ minHeight: '24px', display: 'inline-flex', alignItems: 'center' }}>
                Open application<span className="sr-only">: {c.company}, {c.title}</span>
              </a>
            </div>
          ))}
          {preview.action === 'create_task' && preview.choices.noApplication && (
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', minHeight: '32px' }}>
              <input type="radio" name="application" checked={choice.mode === 'none'} onChange={() => set({ mode: 'none', applicationId: null })} />
              <span>Create the task without an application</span>
            </label>
          )}
          {preview.action === 'create_application' && preview.choices.createNew && (
            <>
              <label style={{ display: 'flex', gap: '8px', alignItems: 'center', minHeight: '32px' }}>
                <input type="radio" name="application" checked={choice.mode === 'new'} onChange={() => set({ mode: 'new', applicationId: null })} />
                <span>{m && m.result !== 'NONE' ? 'Create a new application anyway' : 'Create a new application'}</span>
              </label>
              {choice.mode === 'new' && m && m.result !== 'NONE' && (
                <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginLeft: '24px', minHeight: '32px' }}>
                  <input type="checkbox" checked={choice.confirmDuplicate} onChange={(e) => set({ confirmDuplicate: e.target.checked })} />
                  <span>I understand a similar application already exists and want another one.</span>
                </label>
              )}
            </>
          )}
        </fieldset>
      )}
    </div>
  );
}

export function ReviewDialog({ workspaceId, session, item, onClose, onDone, onOpen }: {
  workspaceId: string; session: PublicSession | null; item: ActionCardRow | null; onClose: () => void; onDone: () => void; onOpen: (path: string) => void;
}) {
  const [state, setState] = useState<ReviewState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // One in-flight request at a time: a double click can run the handler twice before React re-renders.
  const busy = useRef(false);
  // A refreshed access token must not reload the review and discard what the human already chose or typed.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const suggestionId = item?.suggestionId ?? null;
  useEffect(() => {
    if (!suggestionId) return undefined;
    let cancelled = false;
    setState((s) => (s.status === 'ready' ? s : { status: 'loading' }));
    fetchActionPreview(workspaceId, sessionRef.current, suggestionId).then(
      (preview) => { if (!cancelled) setState((prev) => ({ status: 'ready', preview, choice: initialChoice(preview), submitting: false, error: null, notice: prev.status === 'ready' ? prev.notice : null })); },
      (e: unknown) => { if (!cancelled) setState({ status: 'error', message: actionErrorMessage(e instanceof ActionApiError ? e.code : undefined, e instanceof ActionApiError ? e.message : undefined) }); },
    );
    return () => { cancelled = true; };
  }, [workspaceId, suggestionId, attempt]);

  const confirm = useCallback(async () => {
    if (state.status !== 'ready' || state.submitting || busy.current) return;
    busy.current = true;
    const { preview, choice } = state;
    setState({ ...state, submitting: true, error: null });
    try {
      const result = await executeAiAction(sessionRef.current, executeBody(workspaceId, preview, choice));
      setState({ status: 'done', result });
      onDone(); // the lock stays on: this review is finished
    } catch (e) {
      busy.current = false;
      const code = e instanceof ActionApiError ? e.code : undefined;
      const message = actionErrorMessage(code, e instanceof ActionApiError ? e.message : undefined);
      if (actionNeedsRefresh(code)) { setState({ ...state, submitting: false, error: null, notice: message }); setAttempt((n) => n + 1); return; } // regenerate the preview
      setState({ ...state, submitting: false, error: message });
    }
  }, [state, workspaceId, onDone]);
  const ignore = useCallback(async () => {
    if (state.status !== 'ready' || state.submitting || busy.current) return;
    setState({ ...state, submitting: true, error: null });
    try { await ignoreSuggestion(state.preview.suggestionId); onDone(); onClose(); } catch { setState({ ...state, submitting: false, error: 'Could not ignore this suggestion. Try again.' }); }
  }, [state, onDone, onClose]);

  if (!item) return null;
  const ready = state.status === 'ready' ? state : null;
  const verdict = ready ? confirmReadiness(ready.preview, ready.choice) : { ready: false, reason: null };
  const title = ready ? ready.preview.confirmLabel : item.summary;
  const existingPath = (t: { targetType: 'application' | 'task'; targetId: string }) => (t.targetType === 'application' ? `/w/${workspaceId}/applications/${t.targetId}` : '/tasks');
  return (
    <Dialog
      isOpen
      onClose={onClose}
      title={title}
      description="Review the change below. Nothing happens until you confirm."
      maxWidth={640}
      footer={
        state.status === 'done'
          ? <Button variant="primary" onClick={onClose}>Close</Button>
          : (
            <>
              <Button variant="secondary" onClick={onClose} disabled={ready?.submitting}>Cancel</Button>
              {ready && ready.preview.state === 'READY' && <Button variant="ghost" onClick={ignore} disabled={ready.submitting}>Ignore suggestion</Button>}
              {ready && ready.preview.state === 'READY' && (
                <Button variant="primary" onClick={confirm} isLoading={ready.submitting} disabled={!verdict.ready || ready.submitting}>{ready.preview.confirmLabel}</Button>
              )}
            </>
          )
      }
    >
      <div style={{ display: 'grid', gap: '12px' }}>
        {state.status === 'loading' && <SourceLoading label="the action review" />}
        {state.status === 'error' && <div role="alert"><p style={{ margin: 0 }}>{state.message}</p><Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>Try again</Button></div>}
        {state.status === 'done' && (
          <div role="status" style={{ display: 'grid', gap: '8px' }}>
            <p style={{ margin: 0, display: 'flex', gap: '6px', alignItems: 'center' }}><CheckCircle2 size={16} aria-hidden="true" /> {state.result.message}</p>
            <div>
              <Button variant="secondary" onClick={() => onOpen(existingPath({ targetType: state.result.targetType, targetId: state.result.targetId }))}>
                {state.result.targetType === 'application' ? 'Open application' : 'Open tasks'}
              </Button>
            </div>
          </div>
        )}
        {ready && (
          <>
            {ready.notice && <p role="status" style={{ margin: 0, fontWeight: 600 }}>{ready.notice}</p>}
            {ready.preview.state === 'ALREADY_EXECUTED' || (ready.preview.state === 'BLOCKED' && ready.preview.blocked) ? (
              <div role="status" style={{ display: 'grid', gap: '8px' }}>
                <p style={{ margin: 0 }}>{ready.preview.state === 'ALREADY_EXECUTED' && ready.preview.action === 'create_application' ? 'Already converted. This job lead is already an application.' : actionErrorMessage(ready.preview.blocked?.code, ready.preview.blocked?.message)}</p>
                {ready.preview.existing && (
                  <div><Button variant="secondary" onClick={() => onOpen(existingPath(ready.preview.existing!))}>{ready.preview.existing.targetType === 'application' ? 'Open existing application' : 'Open tasks'}</Button></div>
                )}
              </div>
            ) : null}
            <ReviewBody preview={ready.preview} choice={ready.choice} workspaceId={workspaceId} onOpen={onOpen}
              onChoice={(c) => setState({ ...ready, choice: c })} />
            {ready.preview.state === 'READY' && !verdict.ready && verdict.reason && <p className="muted small" style={{ margin: 0 }} id="confirm-hint">{verdict.reason}</p>}
            {ready.error && <p role="alert" style={{ margin: 0, fontWeight: 600 }}>{ready.error}</p>}
          </>
        )}
      </div>
    </Dialog>
  );
}

// ---- history ------------------------------------------------------------------------------------------------------------

export function HistoryRow({ row, timeZone, workspaceId, onOpen }: { row: ActionHistoryRow; timeZone: string; workspaceId: string; onOpen: (path: string) => void }) {
  const path = row.targetId && row.status === 'SUCCEEDED' ? (row.targetType === 'application' ? `/w/${workspaceId}/applications/${row.targetId}` : '/tasks') : null;
  return (
    <Card>
      <CardBody>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', ...wrap }}>
          <div style={{ display: 'grid', gap: '2px', minWidth: 0, flex: '1 1 240px' }}>
            <span style={wrap}><strong>{aiActionTypeLabel(row.action)}</strong>{row.label ? ` · ${row.label}` : ''}</span>
            <span className="muted small">{fmt(row.completedAt ?? row.requestedAt, timeZone)}</span>
          </div>
          <StatusBadge variant={historyStatusVariant(row.status)}>{HISTORY_STATUS_LABELS[row.status] ?? row.status}</StatusBadge>
          {path && <Button variant="secondary" size="sm" onClick={() => onOpen(path)}>{row.targetType === 'application' ? 'Open application' : 'Open tasks'}</Button>}
        </div>
      </CardBody>
    </Card>
  );
}

// ---- page -----------------------------------------------------------------------------------------------------------------

export interface ActionsPanelProps {
  view: 'pending' | 'history';
  onView: (v: 'pending' | 'history') => void;
  queue: Load<ActionQueuePage>;
  history: Load<ActionHistoryPage>;
  draft: ActionFilters;
  filtered: boolean;
  page: number;
  historyPage: number;
  timeZone: string;
  workspaceId: string;
  onDraft: (f: ActionFilters) => void;
  onApply: () => void;
  onReset: () => void;
  onPage: (p: number) => void;
  onHistoryPage: (p: number) => void;
  onRetry: () => void;
  onReview: (i: ActionCardRow) => void;
  onOpen: (path: string) => void;
}

export function AiHubActionsPanel(p: ActionsPanelProps) {
  const d = p.draft;
  const set = (patch: Partial<ActionFilters>) => p.onDraft({ ...d, ...patch });
  const total = p.queue.status === 'ready' ? p.queue.data.pendingTotal : null;
  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <h2 style={{ margin: 0, fontSize: '18px' }}>Actions</h2>
      <p className="muted small" style={{ margin: 0 }}>
        AI can propose changes, but nothing happens until you review and confirm each one here. JobQuest re-checks the record before applying it, and it never sends email, changes your calendar, contacts recruiters or deletes anything.
      </p>
      <div role="group" aria-label="Actions view" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <Button variant={p.view === 'pending' ? 'primary' : 'secondary'} aria-pressed={p.view === 'pending'} onClick={() => p.onView('pending')}>
          Pending{total !== null ? ` (${total})` : ''}
        </Button>
        <Button variant={p.view === 'history' ? 'primary' : 'secondary'} aria-pressed={p.view === 'history'} onClick={() => p.onView('history')}>Completed and failed</Button>
      </div>

      {p.view === 'pending' && (
        <>
          <form role="search" aria-label="Action filters" onSubmit={(e) => { e.preventDefault(); p.onApply(); }} style={{ display: 'grid', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <FilterField label="Action">
                <Select value={d.action} onChange={(e) => set({ action: e.target.value })}>
                  <option value="ALL">All actions</option>
                  {AI_ACTION_TYPE_VALUES.map((a) => <option key={a} value={a}>{AI_ACTION_LABELS[a]}</option>)}
                </Select>
              </FilterField>
              <FilterField label="Source">
                <Select value={d.kind} onChange={(e) => set({ kind: e.target.value })}>
                  {ACTION_SOURCE_FILTERS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </Select>
              </FilterField>
              <FilterField label="Provider">
                <Select value={d.provider} onChange={(e) => set({ provider: e.target.value })}>
                  {ACTION_PROVIDER_FILTERS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </Select>
              </FilterField>
              <FilterField label="Suggested from"><Input type="date" value={d.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} /></FilterField>
              <FilterField label="Suggested to"><Input type="date" value={d.dateTo} onChange={(e) => set({ dateTo: e.target.value })} /></FilterField>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button type="submit" variant="primary">Apply filters</Button>
              <Button type="button" variant="secondary" onClick={p.onReset}>Reset filters</Button>
            </div>
          </form>
          {p.queue.status === 'loading' && <SourceLoading label="pending actions" />}
          {p.queue.status === 'error' && <SourceError label="Pending actions" onRetry={p.onRetry} />}
          {p.queue.status === 'ready' && (
            <>
              <ResultsSummary count={p.queue.data.items.length} hasNext={p.queue.data.hasNext} page={p.page} noun="pending action" />
              {p.queue.data.items.length === 0
                ? (
                  <EmptyState
                    icon={<ClipboardCheck size={22} />}
                    title={p.filtered ? 'No actions match these filters.' : 'No actions are waiting for your review.'}
                    description={p.filtered ? 'Try widening or resetting the filters.' : 'When your AI provider proposes a change, it appears here. Nothing is applied until you confirm it.'}
                  />
                )
                : (
                  <ul aria-label="Pending actions" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '12px' }}>
                    {p.queue.data.items.map((i) => <li key={i.suggestionId}><ActionCard item={i} timeZone={p.timeZone} onReview={p.onReview} /></li>)}
                  </ul>
                )}
              <SourcePager page={p.page} hasNext={p.queue.data.hasNext} onPage={p.onPage} label="Pending actions" />
            </>
          )}
        </>
      )}

      {p.view === 'history' && (
        <>
          {p.history.status === 'loading' && <SourceLoading label="completed actions" />}
          {p.history.status === 'error' && <SourceError label="Action history" onRetry={p.onRetry} />}
          {p.history.status === 'ready' && (
            <>
              <ResultsSummary count={p.history.data.items.length} hasNext={p.history.data.hasNext} page={p.historyPage} noun="completed action" />
              {p.history.data.items.length === 0
                ? <EmptyState icon={<ClipboardCheck size={22} />} title="No actions have been applied yet." description="Actions you confirm, and any that could not be applied, are listed here." />
                : (
                  <ul aria-label="Completed and failed actions" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '10px' }}>
                    {p.history.data.items.map((r) => <li key={r.id}><HistoryRow row={r} timeZone={p.timeZone} workspaceId={p.workspaceId} onOpen={p.onOpen} /></li>)}
                  </ul>
                )}
              <SourcePager page={p.historyPage} hasNext={p.history.data.hasNext} onPage={p.onHistoryPage} label="Action history" />
            </>
          )}
        </>
      )}
    </div>
  );
}

export function AiHubActions({ activeWorkspaceId, currentUserId, session, onNavigate, onChanged }: {
  activeWorkspaceId: string | null; currentUserId: string | null; session: PublicSession | null; onNavigate: (path: string) => void; onChanged?: () => void;
}) {
  const { timeZone, loaded } = useProfileTimeZone(currentUserId);
  const [view, setView] = useState<'pending' | 'history'>('pending');
  const [draft, setDraft] = useState<ActionFilters>(DEFAULT_ACTION_FILTERS);
  const [applied, setApplied] = useState<ActionFilters>(DEFAULT_ACTION_FILTERS);
  const [page, setPage] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [queue, setQueue] = useState<Load<ActionQueuePage>>({ status: 'loading' });
  const [history, setHistory] = useState<Load<ActionHistoryPage>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [reviewing, setReviewing] = useState<ActionCardRow | null>(null);
  const enabled = Boolean(activeWorkspaceId) && loaded && Boolean(session);

  useEffect(() => {
    if (!enabled || view !== 'pending') return undefined;
    let cancelled = false;
    setQueue({ status: 'loading' });
    fetchActionQueue(activeWorkspaceId!, session, applied, page).then(
      (data) => { if (!cancelled) setQueue({ status: 'ready', data }); },
      () => { if (!cancelled) setQueue({ status: 'error' }); }, // isolated: the rest of AI Hub is unaffected
    );
    return () => { cancelled = true; };
  }, [enabled, activeWorkspaceId, session, applied, page, attempt, view]);
  useEffect(() => {
    if (!enabled || view !== 'history') return undefined;
    let cancelled = false;
    setHistory({ status: 'loading' });
    fetchActionHistory(activeWorkspaceId!, session, historyPage).then(
      (data) => { if (!cancelled) setHistory({ status: 'ready', data }); },
      () => { if (!cancelled) setHistory({ status: 'error' }); },
    );
    return () => { cancelled = true; };
  }, [enabled, activeWorkspaceId, session, historyPage, attempt, view]);

  const filtered = JSON.stringify(applied) !== JSON.stringify(DEFAULT_ACTION_FILTERS);
  const done = useCallback(() => { setAttempt((n) => n + 1); onChanged?.(); }, [onChanged]);
  const open = useCallback((path: string) => { setReviewing(null); onNavigate(path); }, [onNavigate]);
  if (!activeWorkspaceId) return null;
  return (
    <>
      <AiHubActionsPanel
        view={view} onView={setView} queue={queue} history={history} draft={draft} filtered={filtered} page={page} historyPage={historyPage}
        timeZone={timeZone} workspaceId={activeWorkspaceId}
        onDraft={setDraft} onApply={() => { setPage(0); setApplied(draft); }} onReset={() => { setDraft(DEFAULT_ACTION_FILTERS); setApplied(DEFAULT_ACTION_FILTERS); setPage(0); }}
        onPage={setPage} onHistoryPage={setHistoryPage} onRetry={() => setAttempt((n) => n + 1)} onReview={setReviewing} onOpen={open}
      />
      {reviewing && (
        <ReviewDialog workspaceId={activeWorkspaceId} session={session} item={reviewing} onClose={() => setReviewing(null)} onDone={done} onOpen={open} />
      )}
    </>
  );
}
