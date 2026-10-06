import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Plus, RefreshCw, TriangleAlert, Clock, CircleCheck, SquareCheck, Reply, BellRing, Flag } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Tabs, TabList, Tab } from '../components/ui/Tabs';
import { EmptyState } from '../components/ui/EmptyState';
import { Drawer } from '../components/ui/Drawer';
import { Dialog } from '../components/ui/Dialog';
import { FormField } from '../components/ui/FormField';
import { Input } from '../components/ui/Input';
import { useToast } from '../context/ToastContext';
import { useProfileTimeZone } from '../hooks/useProfileTimeZone';
import { countTasks, fetchCompletedSince, fetchNextActions, fetchOutcomesNeeded, fetchTasks, reopenTask, cancelTask, updateTask, snoozeNextAction, completeNextAction, TASKS_PAGE_SIZE, type DayBounds, type TaskFilters } from '../api/tasks';
import { fetchCanonicalWorkflow, fetchWorkspaceMembers, type WorkspaceMemberInfo } from '../api/applications';
import { TaskDialog } from '../components/tasks/TaskDialog';
import { TaskDetailPanel } from '../components/tasks/TaskDetailPanel';
import { QueueRow, useQueueActions } from '../components/tasks/QueueRow';
import { buildQueue, taskSubtitle, todayBounds, type NextActionSource, type OutcomeSource, type QueueItem } from '../lib/queue';
import { upcomingBand } from '../types/interviews';
import type { CanonicalWorkflow } from '../types/applications';
import { addDaysKey, type Task, type TaskTab, type TaskType } from '../types/tasks';
import { formatInZone, zonedWallTimeToUtcIso, dayKey, utcIsoToZonedWallTime } from '../lib/time';

const WIDE = '(min-width: 1100px)';
function useMedia(query: string): boolean {
  const [m, setM] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : true));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}

const TYPE_CHIPS: { id: TaskFilters['taskType']; label: string; icon?: ReactNode }[] = [
  { id: '', label: 'All types' },
  { id: 'TASK', label: 'Tasks', icon: <SquareCheck size={12} aria-hidden="true" /> },
  { id: 'FOLLOW_UP', label: 'Follow-ups', icon: <Reply size={12} aria-hidden="true" /> },
  { id: 'REMINDER', label: 'Reminders', icon: <BellRing size={12} aria-hidden="true" /> },
  { id: 'NEXT_ACTION', label: 'Next actions', icon: <Flag size={12} aria-hidden="true" /> },
];

function BulkSnoozeMenu({ onSnooze, disabled }: { onSnooze: (days: number) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: 'relative' }}>
      <Button size="sm" variant="secondary" disabled={disabled} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Snooze
      </Button>
      {open && (
        <div role="menu" className="menu-pop" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
          {[
            ['Tomorrow', 1],
            ['In 3 days', 3],
            ['Next week', 7],
          ].map(([l, d]) => (
            <button key={l as string} role="menuitem" type="button" onClick={() => { setOpen(false); onSnooze(d as number); }}>
              {l as string}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function BulkNextActionDialog({
  isOpen,
  onClose,
  timeZone,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  timeZone: string;
  onSave: (nextAction: string | null, date: string | null) => Promise<void>;
}) {
  const [next, setNext] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (isOpen) { setNext(''); setDate(''); setError(null); } }, [isOpen]);

  const save = async (withNext: boolean) => {
    if (withNext && !next.trim()) { setError('Describe the next step, or choose "No next action needed".'); return; }
    setSaving(true);
    try {
      await onSave(withNext ? next.trim() : null, withNext ? date || null : null);
      onClose();
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Bulk Set Next Action" description="Applies the same next action to all selected applications." maxWidth={500} footer={
      <>
        <Button variant="ghost" onClick={() => void save(false)} disabled={saving}>No next action needed</Button>
        <span style={{ flex: 1 }} />
        <Button variant="primary" onClick={() => void save(true)} isLoading={saving}>Save next action</Button>
      </>
    }>
      <div className="col" style={{ gap: 12 }}>
        {error && <div className="banner danger small">{error}</div>}
        <FormField label="Next action" required>
          {(p) => <Input {...p} value={next} maxLength={255} onChange={(e) => setNext(e.target.value)} />}
        </FormField>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {[
            { label: 'Tomorrow', value: addDaysKey(dayKey(Date.now(), timeZone), 1) },
            { label: 'In 1 week', value: addDaysKey(dayKey(Date.now(), timeZone), 7) },
            { label: 'In 2 weeks', value: addDaysKey(dayKey(Date.now(), timeZone), 14) },
          ].map((c) => (
            <button key={c.label} type="button" className={`chip sm ${date === c.value ? 'on' : ''}`} aria-pressed={date === c.value} onClick={() => setDate(c.value)}>
              {c.label}
            </button>
          ))}
        </div>
        <FormField label="Due" optional>
          {(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
        </FormField>
      </div>
    </Dialog>
  );
}

export interface TasksViewProps {
  activeWorkspaceId: string | null;
  isManager: boolean;
  currentUserId: string | null;
}

export function TasksView({ activeWorkspaceId: ws, isManager, currentUserId }: TasksViewProps) {
  const { addToast } = useToast();
  const { timeZone, weekStart } = useProfileTimeZone(currentUserId);
  const wide = useMedia(WIDE);
  const [tab, setTab] = useState<TaskTab>('today');
  const [typeFilter, setTypeFilter] = useState<TaskFilters['taskType']>('');
  const [ownerId, setOwnerId] = useState('');
  const [page, setPage] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<Task[]>([]);
  const [completedToday, setCompletedToday] = useState<Task[]>([]);
  const [nextActions, setNextActions] = useState<NextActionSource[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomeSource[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<TaskTab, number>>({ overdue: 0, today: 0, upcoming: 0, nodate: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkNextActionDialog, setBulkNextActionDialog] = useState(false);
  const [workflow, setWorkflow] = useState<CanonicalWorkflow | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberInfo[]>([]);
  const [dialog, setDialog] = useState<{ type: TaskType; editing: Task | null } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!ws) return;
    fetchCanonicalWorkflow(ws).then(setWorkflow).catch(() => setWorkflow(null));
    if (isManager) fetchWorkspaceMembers(ws).then(setMembers).catch(() => setMembers([]));
  }, [ws, isManager]);
  useEffect(() => {
    if (!wide) setSelectedKey(null);
  }, [wide]);
  useEffect(() => {
    setSelectedKeys(new Set());
  }, [tab, typeFilter, ownerId, page]);

  const filters: TaskFilters = useMemo(() => ({ ownerId: ownerId || undefined, taskType: typeFilter }), [ownerId, typeFilter]);
  const viewKey = `${ws}|${tab}|${ownerId}|${typeFilter}|${page}|${timeZone}`;

  const load = useCallback(async () => {
    if (!ws) return;
    const mine = ++seq.current;
    const key = `${ws}|${tab}|${ownerId}|${typeFilter}|${page}|${timeZone}`;
    setLoading(true);
    setError(null);
    try {
      const tb = todayBounds(timeZone, Date.now(), zonedWallTimeToUtcIso);
      const b: DayBounds = { today: tb.today, tomorrow: tb.tomorrow, end: tb.end, now: new Date().toISOString() };
      const onlyNext = typeFilter === 'NEXT_ACTION';
      const noNext = !!typeFilter && !onlyNext;
      const tabs: TaskTab[] = ['overdue', 'today', 'upcoming', 'nodate', 'completed'];
      const [list, overdue, done, na, oc, ...cs] = await Promise.all([
        onlyNext ? Promise.resolve({ tasks: [], total: 0 }) : fetchTasks(ws, tab, b, filters, page),
        tab === 'today' && !onlyNext ? fetchTasks(ws, 'overdue', b, filters, 0) : Promise.resolve({ tasks: [], total: 0 }),
        tab === 'today' && !onlyNext ? fetchCompletedSince(ws, tb.start, filters) : Promise.resolve([] as Task[]),
        noNext ? Promise.resolve([] as NextActionSource[]) : fetchNextActions(ws, { ownerId: filters.ownerId }),
        typeFilter ? Promise.resolve([] as OutcomeSource[]) : fetchOutcomesNeeded(ws, filters.ownerId),
        ...tabs.map((t) => (onlyNext ? Promise.resolve(0) : countTasks(ws, t, b, filters))),
      ]);
      if (mine !== seq.current) return;
      const naBucket = (n: NextActionSource) => (!n.next_action_date ? 'nodate' : n.next_action_date < tb.today ? 'overdue' : n.next_action_date === tb.today ? 'today' : 'upcoming');
      const c = Object.fromEntries(tabs.map((t, i) => [t, cs[i] as number])) as Record<TaskTab, number>;
      for (const n of na) c[naBucket(n) as TaskTab] += 1;
      for (const o of oc) c[o.scheduled_at < tb.start ? 'overdue' : 'today'] += 1;
      setTasks(list.tasks);
      setTotal(list.total);
      setOverdueTasks(overdue.tasks);
      setCompletedToday(done);
      setNextActions(na);
      setOutcomes(oc);
      setCounts(c);
      setLoadedKey(key);
    } catch (e) {
      if (mine === seq.current) {
        setError((e as Error).message);
        setLoadedKey(key);
      }
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [ws, tab, filters, page, ownerId, typeFilter, timeZone]);

  useEffect(() => {
    void load();
  }, [load]);

  const actions = useQueueActions({ timeZone, workflow, onChanged: () => void load() });

  const items = useMemo(() => {
    if (tab === 'completed') return [] as QueueItem[];
    const tb = todayBounds(timeZone, Date.now(), zonedWallTimeToUtcIso);
    const inTab = (n: NextActionSource) =>
      tab === 'nodate' ? !n.next_action_date : !!n.next_action_date && (tab === 'overdue' ? n.next_action_date < tb.today : tab === 'upcoming' ? n.next_action_date > tb.today : n.next_action_date <= tb.today);
    const outcomesInTab = tab === 'overdue' ? outcomes.filter((o) => o.scheduled_at < tb.start) : tab === 'today' ? outcomes : [];
    return buildQueue({ tasks: [...overdueTasks, ...tasks], nextActions: nextActions.filter(inTab), outcomes: outcomesInTab }, timeZone);
  }, [tab, tasks, overdueTasks, nextActions, outcomes, timeZone]);

  const selected = items.find((i) => i.key === selectedKey) ?? null;
  const ownerName = (uid: string) => {
    if (!isManager) return null;
    if (uid === currentUserId) return 'You';
    const m = members.find((x) => x.user_id === uid);
    return m ? m.display_name || m.username : null;
  };

  const toggleSelection = (key: string, checked: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
  };

  const handleBulkDismiss = async () => {
    const targets = items.filter(i => selectedKeys.has(i.key) && i.task);
    if (!targets.length) return;
    setBulkSaving(true);
    const results = await Promise.allSettled(targets.map(t => cancelTask(t.task!.id)));
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    if (succeeded === targets.length) {
      addToast({ title: `Dismissed ${succeeded} item(s)`, type: 'info' });
      setSelectedKeys(new Set());
    } else {
      addToast({ title: `Dismissed ${succeeded} item(s). ${targets.length - succeeded} failed.`, type: 'danger' });
      setSelectedKeys(new Set(targets.filter((_, i) => results[i]?.status === 'rejected').map(t => t.key)));
    }
    setBulkSaving(false);
    void load();
  };

  const performSnooze = async (item: QueueItem, days: number, tz: string) => {
    const today = dayKey(Date.now(), tz);
    if (item.kind === 'NEXT_ACTION') {
      return snoozeNextAction(item.nextAction!.id, addDaysKey(today, days));
    } else if (item.task?.due_at) {
      const w = utcIsoToZonedWallTime(item.task.due_at, tz);
      const base = w.date < today ? today : w.date;
      return updateTask(item.task.id, { due_at: zonedWallTimeToUtcIso(addDaysKey(base, days), w.time, tz) });
    } else if (item.task) {
      const base = item.task.due_date && item.task.due_date > today ? item.task.due_date : today;
      return updateTask(item.task.id, { due_date: addDaysKey(base, days), due_at: null });
    }
  };

  const handleBulkSnooze = async (days: number) => {
    const targets = items.filter(i => selectedKeys.has(i.key) && i.kind !== 'INTERVIEW_OUTCOME');
    if (!targets.length) return;
    setBulkSaving(true);
    const results = await Promise.allSettled(targets.map(t => performSnooze(t, days, timeZone)));
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    if (succeeded === targets.length) {
      addToast({ title: `Snoozed ${succeeded} item(s)`, type: 'info' });
      setSelectedKeys(new Set());
    } else {
      addToast({ title: `Snoozed ${succeeded} item(s). ${targets.length - succeeded} failed.`, type: 'danger' });
      setSelectedKeys(new Set(targets.filter((_, i) => results[i]?.status === 'rejected').map(t => t.key)));
    }
    setBulkSaving(false);
    void load();
  };

  const handleBulkNextAction = async (nextAction: string | null, date: string | null) => {
    const targets = items.filter(i => selectedKeys.has(i.key) && i.kind === 'NEXT_ACTION');
    if (!targets.length) return;
    setBulkSaving(true);
    const results = await Promise.allSettled(targets.map(t => completeNextAction(t.nextAction!.id, nextAction, date)));
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    if (succeeded === targets.length) {
      addToast({ title: `Updated ${succeeded} next action(s)`, type: 'success' });
      setSelectedKeys(new Set());
    } else {
      addToast({ title: `Updated ${succeeded} next action(s). ${targets.length - succeeded} failed.`, type: 'danger' });
      setSelectedKeys(new Set(targets.filter((_, i) => results[i]?.status === 'rejected').map(t => t.key)));
    }
    setBulkSaving(false);
    void load();
  };

  if (!ws) return <EmptyState title="No workspace selected" description="Choose a workspace to see its tasks." />;

  const row = (i: QueueItem) => (
    <QueueRow
      key={i.key}
      item={i}
      timeZone={timeZone}
      onComplete={actions.complete}
      onSnooze={actions.snooze}
      onCancel={actions.askCancel}
      onOpen={(it) => setSelectedKey(it.key)}
      selected={i.key === selectedKey}
      checked={selectedKeys.has(i.key)}
      onCheckChange={(c) => toggleSelection(i.key, c)}
      ownerName={ownerName(i.ownerId)}
    />
  );
  const band = (key: string, label: string, list: QueueItem[], tone: 'danger' | 'warning' | 'neutral', icon?: ReactNode) =>
    list.length > 0 && (
      <div role="group" aria-label={label} key={key}>
        <div className={`band ${tone}`}>{icon}{label.toUpperCase()} · {list.length}</div>
        {list.map(row)}
      </div>
    );

  const renderList = () => {
    if (loadedKey !== viewKey) {
      return (
        <div role="status" aria-label="Loading tasks" className="col" style={{ gap: 8, padding: 16 }}>
          {[0, 1, 2].map((n) => <div key={n} className="skel" style={{ height: 44 }} />)}
        </div>
      );
    }
    if (error) {
      return (
        <div role="alert" className="col" style={{ padding: 24, gap: 10, alignItems: 'flex-start' }}>
          <span className="danger-t">Could not load tasks: {error}</span>
          <Button size="sm" variant="secondary" leftIcon={<RefreshCw size={13} />} onClick={() => void load()}>Retry</Button>
        </div>
      );
    }
    if (tab === 'completed') {
      if (!tasks.length) return <EmptyState title="Nothing completed yet" description="Completed tasks and past recurring occurrences appear here." />;
      return (
        <>
          {tasks.map((t) => (
            <div key={t.id} className="trow done" data-testid="completed-row">
              <span className="circ-btn on" aria-hidden="true"><CircleCheck size={14} /></span>
              <div className="trow-main">
                <div className="ell" style={{ textDecoration: 'line-through' }}>{t.title}</div>
                <div className="small muted ell">{taskSubtitle(t)} · completed {t.completed_at ? formatInZone(t.completed_at, timeZone, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</div>
              </div>
              <span />
              <span />
              <span />
              <span className="trow-act">
                <Button size="sm" variant="ghost" onClick={() => reopenTask(t.id).then(() => void load()).catch((e: Error) => addToast({ title: e.message, type: 'danger' }))} aria-label={`Undo completion of ${t.title}`}>Undo</Button>
              </span>
            </div>
          ))}
          {pager}
        </>
      );
    }
    if (!items.length && !(tab === 'today' && completedToday.length)) {
      const msg: Record<TaskTab, [string, string]> = {
        overdue: ['Nothing overdue', 'You are all caught up.'],
        today: ['Nothing due today', 'Tasks, follow-ups, reminders and next actions due today show up here.'],
        upcoming: ['Nothing upcoming', 'Items with a future due date appear here.'],
        nodate: ['No undated items', 'Tasks without a due date stay here.'],
        completed: ['', ''],
      };
      return (
        <EmptyState
          title={msg[tab][0]}
          description={msg[tab][1]}
          action={<Button variant="primary" leftIcon={<Plus size={14} />} onClick={() => setDialog({ type: 'TASK', editing: null })}>New task</Button>}
        />
      );
    }
    if (tab === 'today') {
      return (
        <>
          {band('overdue', 'Overdue', items.filter((i) => i.state === 'overdue'), 'danger', <TriangleAlert size={13} aria-hidden="true" />)}
          {band('today', 'Due today', items.filter((i) => i.state === 'today'), 'warning', <Clock size={13} aria-hidden="true" />)}
          {completedToday.length > 0 && (
            <div role="group" aria-label="Completed today">
              <div className="band neutral"><CircleCheck size={13} aria-hidden="true" />COMPLETED TODAY · {completedToday.length}</div>
              {completedToday.map((t) => (
                <div key={t.id} className="trow done" data-testid="completed-row">
                  <span className="circ-btn on" aria-hidden="true"><CircleCheck size={14} /></span>
                  <div className="trow-main">
                    <div className="ell" style={{ textDecoration: 'line-through' }}>{t.title}</div>
                    <div className="small muted ell">{taskSubtitle(t)} · completed {t.completed_at ? formatInZone(t.completed_at, timeZone, { hour: 'numeric', minute: '2-digit' }) : ''}</div>
                  </div>
                  <span /><span /><span />
                  <span className="trow-act">
                    <Button size="sm" variant="ghost" onClick={() => reopenTask(t.id).then(() => void load()).catch((e: Error) => addToast({ title: e.message, type: 'danger' }))} aria-label={`Undo completion of ${t.title}`}>Undo</Button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      );
    }
    if (tab === 'upcoming') {
      const g = { THIS_WEEK: [] as QueueItem[], NEXT_WEEK: [] as QueueItem[], LATER: [] as QueueItem[] };
      for (const i of items) g[upcomingBand(`${i.day}T12:00:00Z`, 'UTC', Date.parse(`${todayBounds(timeZone, Date.now(), zonedWallTimeToUtcIso).today}T12:00:00Z`), weekStart)].push(i);
      return (
        <>
          {band('this', 'This week', g.THIS_WEEK, 'neutral')}
          {band('next', 'Next week', g.NEXT_WEEK, 'neutral')}
          {band('later', 'Later', g.LATER, 'neutral')}
          {pager}
        </>
      );
    }
    return (
      <>
        {items.map(row)}
        {pager}
      </>
    );
  };

  const pager = total > TASKS_PAGE_SIZE && (
    <div className="row small" style={{ padding: '10px 16px', gap: 8, justifyContent: 'space-between' }}>
      <span className="muted">{page * TASKS_PAGE_SIZE + 1}–{Math.min(total, (page + 1) * TASKS_PAGE_SIZE)} of {total} tasks</span>
      <span className="row" style={{ gap: 6 }}>
        <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
        <Button size="sm" variant="secondary" disabled={(page + 1) * TASKS_PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
      </span>
    </div>
  );

  const detail = selected && (
    <TaskDetailPanel
      key={selected.key}
      item={selected}
      timeZone={timeZone}
      ownerName={ownerName(selected.ownerId)}
      onClose={() => setSelectedKey(null)}
      onComplete={actions.complete}
      onEdit={(i) => i.task && setDialog({ type: i.task.task_type, editing: i.task })}
      onCancel={(i) => actions.askCancel(i)}
      onChanged={() => void load()}
      variant={wide ? 'panel' : 'sheet'}
    />
  );

  return (
    <div className="page int-page">
      <div className="page-title">
        <h1>Tasks &amp; Follow-ups</h1>
        <span className="muted" data-testid="tasks-summary">
          {counts.overdue + counts.today} need attention · {counts.upcoming} upcoming
        </span>
        <span style={{ flex: 1 }} />
        <Button variant="secondary" leftIcon={<Reply size={14} />} onClick={() => setDialog({ type: 'FOLLOW_UP', editing: null })}>New follow-up</Button>
        <Button variant="primary" leftIcon={<Plus size={14} />} onClick={() => setDialog({ type: 'TASK', editing: null })}>New task</Button>
      </div>
      <Tabs id="tasks-tabs" activeTab={tab} onTabChange={(t) => { setTab(t as TaskTab); setPage(0); setSelectedKey(null); setSelectedKeys(new Set()); }}>
        <TabList aria-label="Task views">
          <Tab id="overdue" count={counts.overdue}>Overdue</Tab>
          <Tab id="today" count={counts.today}>Today</Tab>
          <Tab id="upcoming" count={counts.upcoming}>Upcoming</Tab>
          <Tab id="nodate" count={counts.nodate}>No date</Tab>
          <Tab id="completed">Completed</Tab>
        </TabList>
      </Tabs>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="row" role="group" aria-label="Filter by type" style={{ gap: 6, flexWrap: 'wrap' }}>
          {TYPE_CHIPS.map((c) => (
            <button key={c.label} type="button" className={`chip sm ${typeFilter === c.id ? 'on' : ''}`} aria-pressed={typeFilter === c.id} onClick={() => { setTypeFilter(c.id); setPage(0); }}>
              {c.icon}{c.label}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        {items.length > 0 && tab !== "completed" && (<Button size="sm" variant="outline" onClick={() => { if (selectedKeys.size === items.length) setSelectedKeys(new Set()); else setSelectedKeys(new Set(items.map(i => i.key))); }}>{selectedKeys.size === items.length ? "Deselect all" : "Select all"}</Button>)}
        {isManager && (
          <>
            <label className="sr-only" htmlFor="task-owner-filter">Owner</label>
            <Select id="task-owner-filter" value={ownerId} onChange={(e) => { setOwnerId(e.target.value); setPage(0); }} style={{ width: 190 }}>
              <option value="">Owner: all members</option>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.user_id === currentUserId ? 'You' : m.display_name || m.username}</option>)}
            </Select>
          </>
        )}
      </div>
      {selectedKeys.size > 0 && (
        <div className="row bulk-bar fade-in" style={{ padding: '8px 12px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', gap: 12, alignItems: 'center' }}>
          <span className="small b">{selectedKeys.size} selected</span>
          <span style={{ flex: 1 }} />
          <BulkSnoozeMenu onSnooze={(d) => void handleBulkSnooze(d)} disabled={bulkSaving} />
          {Array.from(selectedKeys).some(k => items.find(i => i.key === k)?.kind === 'NEXT_ACTION') && (
            <Button size="sm" variant="secondary" onClick={() => setBulkNextActionDialog(true)} disabled={bulkSaving}>Set next action</Button>
          )}
          {Array.from(selectedKeys).some(k => items.find(i => i.key === k)?.task) && (
            <Button size="sm" variant="danger" onClick={() => void handleBulkDismiss()} disabled={bulkSaving}>Dismiss</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelectedKeys(new Set())} disabled={bulkSaving}>Cancel</Button>
        </div>
      )}
      <div className="int-body">
        <div className="card int-list" role="tabpanel" id={`tasks-tabs-panel-${tab}`} aria-labelledby={`tasks-tabs-tab-${tab}`} aria-busy={loading} tabIndex={0}>
          {renderList()}
        </div>
        {wide && detail}
      </div>
      {!wide && selected && (
        <Drawer isOpen onClose={() => setSelectedKey(null)} title={selected.title} width={Math.min(520, window.innerWidth)}>
          {detail}
        </Drawer>
      )}
      {currentUserId && (
        <TaskDialog
          isOpen={dialog !== null}
          onClose={() => setDialog(null)}
          workspaceId={ws}
          ownerId={currentUserId}
          timeZone={timeZone}
          editing={dialog?.editing ?? null}
          initialType={dialog?.type ?? 'TASK'}
          onSaved={(m) => {
            addToast({ title: m, type: 'success' });
            void load();
          }}
        />
      )}
      <BulkNextActionDialog
        isOpen={bulkNextActionDialog}
        onClose={() => setBulkNextActionDialog(false)}
        timeZone={timeZone}
        onSave={handleBulkNextAction}
      />
      {actions.dialogs}
    </div>
  );
}




