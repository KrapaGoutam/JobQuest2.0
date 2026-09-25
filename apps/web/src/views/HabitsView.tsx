import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Minus, Check, Flame, Pencil, RefreshCw, Undo2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { Select } from '../components/ui/Select';
import { Tabs, TabList, Tab } from '../components/ui/Tabs';
import { EmptyState } from '../components/ui/EmptyState';
import { HabitDialog } from '../components/habits/HabitDialog';
import { useToast } from '../context/ToastContext';
import { useProfileTimeZone } from '../hooks/useProfileTimeZone';
import { fetchHabitLogs, fetchHabits, restoreHabit, setHabitLog, type Habit, type HabitLog } from '../api/habits';
import { fetchWorkspaceMembers, type WorkspaceMemberInfo } from '../api/applications';
import { habitProgress, LOOKBACK_DAYS, shiftKey, type HabitProgress } from '../lib/habits';
import { dayKey, formatInZone } from '../lib/time';

type HabitTab = 'today' | 'all' | 'history';
const CADENCE = { DAILY: 'Daily', WEEKDAYS: 'Weekdays', WEEKLY: 'Weekly' } as const;

function Heat({ heat, label }: { heat: HabitProgress['heat']; label: string }) {
  const done = heat.filter((h) => h === 'done').length;
  return (
    <div className="heat" role="img" aria-label={`${label}: ${done} of the last ${heat.length} periods done`}>
      {heat.map((h, i) => <i key={i} className={h === 'done' ? 'f' : h === 'partial' ? 'p' : ''} />)}
    </div>
  );
}

export function HabitsView({ activeWorkspaceId: ws, isManager, currentUserId }: { activeWorkspaceId: string | null; isManager: boolean; currentUserId: string | null }) {
  const { addToast } = useToast();
  const { timeZone, weekStart } = useProfileTimeZone(currentUserId);
  const [tab, setTab] = useState<HabitTab>('today');
  const [ownerId, setOwnerId] = useState('');
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberInfo[]>([]);
  const [dialog, setDialog] = useState<{ editing: Habit | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const seq = useRef(0);
  const today = dayKey(Date.now(), timeZone);

  useEffect(() => {
    if (ws && isManager) fetchWorkspaceMembers(ws).then(setMembers).catch(() => setMembers([]));
  }, [ws, isManager]);

  const viewKey = `${ws}|${ownerId}|${timeZone}`;
  const load = useCallback(async () => {
    if (!ws) return;
    const mine = ++seq.current;
    const key = `${ws}|${ownerId}|${timeZone}`;
    setError(null);
    try {
      const hs = await fetchHabits(ws, { ownerId: ownerId || undefined, includeArchived: true });
      const ls = await fetchHabitLogs(hs.map((h) => h.id), shiftKey(dayKey(Date.now(), timeZone), -LOOKBACK_DAYS));
      if (mine !== seq.current) return;
      setHabits(hs);
      setLogs(ls);
      setLoadedKey(key);
    } catch (e) {
      if (mine === seq.current) {
        setError((e as Error).message);
        setLoadedKey(key);
      }
    }
  }, [ws, ownerId, timeZone]);
  useEffect(() => {
    void load();
  }, [load]);

  const progress = useMemo(() => {
    const byHabit = new Map<string, HabitLog[]>();
    for (const l of logs) byHabit.set(l.habit_id, [...(byHabit.get(l.habit_id) ?? []), l]);
    return new Map(habits.map((h) => [h.id, habitProgress(h, byHabit.get(h.id) ?? [], today, weekStart)]));
  }, [habits, logs, today, weekStart]);

  const setCount = async (h: Habit, count: number) => {
    setBusy(h.id);
    try {
      await setHabitLog(h.id, today, count);
      await load();
    } catch (e) {
      addToast({ title: (e as Error).message, type: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  const ownerName = (uid: string) => {
    if (!isManager) return null;
    if (uid === currentUserId) return 'You';
    const m = members.find((x) => x.user_id === uid);
    return m ? m.display_name || m.username : null;
  };

  if (!ws) return <EmptyState title="No workspace selected" description="Choose a workspace to see its habits." />;
  const active = habits.filter((h) => !h.archived_at && h.is_active);
  const shown = tab === 'today' ? active : habits.filter((h) => !h.archived_at);
  const archived = habits.filter((h) => h.archived_at);
  const doneToday = active.filter((h) => progress.get(h.id)?.done).length;

  const row = (h: Habit) => {
    const p = progress.get(h.id)!;
    const unit = h.unit_label ? ` ${h.unit_label}` : '';
    const periodWord = h.frequency === 'WEEKLY' ? 'this week' : 'today';
    const periods = h.frequency === 'WEEKLY' ? 'weeks' : 'days';
    const canLog = h.is_active && !h.archived_at && p.scheduledToday;
    return (
      <div key={h.id} className="hrow" data-testid="habit-row" data-done={p.done}>
        {h.target_count === 1 ? (
          <button
            type="button"
            className={`circ-btn lg ${p.done ? 'on' : ''}`}
            aria-pressed={p.done}
            aria-label={`${p.done ? 'Undo check-in for' : 'Check in'} ${h.title} ${periodWord}`}
            disabled={!canLog || busy === h.id || (h.frequency === 'WEEKLY' && p.done && p.current > 0 && !logs.some((l) => l.habit_id === h.id && l.log_date === today))}
            onClick={() => void setCount(h, p.done ? 0 : 1)}
          >
            <Check size={14} aria-hidden="true" className="circ-check" />
          </button>
        ) : (
          <span className="tile hab-count" aria-hidden="true">{p.current}<span className="muted">/{p.target}</span></span>
        )}
        <div style={{ minWidth: 0 }}>
          <div className="b ell">{h.title}</div>
          <div className="small muted ell">
            {CADENCE[h.frequency]}{h.target_count > 1 ? ` · target ${h.target_count}${unit}` : ''}{!h.is_active ? ' · paused' : ''}{ownerName(h.user_id) ? ` · ${ownerName(h.user_id)}` : ''}
          </div>
        </div>
        <div className="row small" style={{ gap: 8 }}>
          {h.target_count > 1 ? (
            (() => {
              const todays = logs.find((l) => l.habit_id === h.id && l.log_date === today)?.completed_count ?? 0;
              return (
                <>
                  <button type="button" className="cnt-btn" aria-label={`Decrease ${h.title}`} disabled={!canLog || todays === 0 || busy === h.id} onClick={() => void setCount(h, todays - 1)}><Minus size={14} /></button>
                  <span className="b" style={{ minWidth: 40, textAlign: 'center' }} aria-live="polite">{p.current} / {p.target}</span>
                  <button type="button" className="cnt-btn" aria-label={`Increase ${h.title}`} disabled={!canLog || busy === h.id} onClick={() => void setCount(h, todays + 1)}><Plus size={14} /></button>
                </>
              );
            })()
          ) : (
            <span className={p.done ? 'success-t' : 'muted'}>{!p.scheduledToday ? 'Not scheduled today' : p.done ? `Done ${periodWord}` : `Not yet ${periodWord}`}</span>
          )}
        </div>
        <div className="row small" style={{ gap: 5 }} data-testid="habit-streak">
          {p.currentStreak > 0 ? (<><Flame size={14} className="warning-t" aria-hidden="true" /><b>{p.currentStreak}</b> {periods}</>) : <span className="muted">No streak</span>}
        </div>
        <div className="hab-heat"><Heat heat={p.heat} label={`${h.title}, last 14 periods`} /></div>
        <IconButton icon={<Pencil size={14} />} aria-label={`Edit ${h.title}`} variant="ghost" size="sm" onClick={() => setDialog({ editing: h })} />
      </div>
    );
  };

  const body = () => {
    if (loadedKey !== viewKey) {
      return (
        <div role="status" aria-label="Loading habits" className="col" style={{ gap: 8, padding: 16 }}>
          {[0, 1].map((n) => <div key={n} className="skel" style={{ height: 52 }} />)}
        </div>
      );
    }
    if (error) {
      return (
        <div role="alert" className="col" style={{ padding: 24, gap: 10, alignItems: 'flex-start' }}>
          <span className="danger-t">Could not load habits: {error}</span>
          <Button size="sm" variant="secondary" leftIcon={<RefreshCw size={13} />} onClick={() => void load()}>Retry</Button>
        </div>
      );
    }
    if (tab === 'history') {
      if (!habits.length) return <EmptyState title="No history yet" description="Check in on a habit to start its history." />;
      return (
        <div className="col">
          {habits.map((h) => {
            const p = progress.get(h.id)!;
            const count = logs.filter((l) => l.habit_id === h.id).length;
            return (
              <div key={h.id} className="hrow hist" data-testid="habit-history-row">
                <span />
                <div style={{ minWidth: 0 }}>
                  <div className="b ell">{h.title}</div>
                  <div className="small muted">{CADENCE[h.frequency]}{h.archived_at ? ' · archived' : !h.is_active ? ' · paused' : ''}</div>
                </div>
                <div className="small">{count} check-in {count === 1 ? 'day' : 'days'} (365d)</div>
                <div className="small">Best: <b>{p.bestStreak}</b> {h.frequency === 'WEEKLY' ? 'weeks' : 'days'}</div>
                <div className="hab-heat"><Heat heat={p.heat} label={`${h.title}, last 14 periods`} /></div>
                {h.archived_at ? (
                  <IconButton icon={<Undo2 size={14} />} aria-label={`Restore ${h.title}`} variant="ghost" size="sm" onClick={() => restoreHabit(h.id).then(load).catch((e: Error) => addToast({ title: e.message, type: 'danger' }))} />
                ) : <span />}
              </div>
            );
          })}
        </div>
      );
    }
    if (!shown.length) {
      return (
        <EmptyState
          title={tab === 'today' ? 'No active habits' : 'No habits yet'}
          description="Build a daily, weekday or weekly routine and track your streaks."
          action={<Button variant="primary" leftIcon={<Plus size={14} />} onClick={() => setDialog({ editing: null })}>New habit</Button>}
        />
      );
    }
    return (
      <>
        <div className="hrow th" aria-hidden="true"><span /><span>Habit</span><span>Progress</span><span>Streak</span><span>Last 14 periods</span><span /></div>
        {shown.map(row)}
      </>
    );
  };

  return (
    <div className="page">
      <div className="page-title">
        <h1>Habits</h1>
        <span className="muted" data-testid="habits-summary">
          {formatInZone(new Date().toISOString(), timeZone, { weekday: 'short', month: 'short', day: 'numeric' })} · {doneToday} of {active.length} done
        </span>
        <span style={{ flex: 1 }} />
        {isManager && (
          <>
            <label className="sr-only" htmlFor="habit-owner">Owner</label>
            <Select id="habit-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} style={{ width: 190 }}>
              <option value="">Owner: all members</option>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.user_id === currentUserId ? 'You' : m.display_name || m.username}</option>)}
            </Select>
          </>
        )}
        <Button variant="primary" leftIcon={<Plus size={14} />} onClick={() => setDialog({ editing: null })}>New habit</Button>
      </div>
      <Tabs id="habits-tabs" activeTab={tab} onTabChange={(t) => setTab(t as HabitTab)}>
        <TabList aria-label="Habit views">
          <Tab id="today" count={active.length}>Today</Tab>
          <Tab id="all" count={habits.filter((h) => !h.archived_at).length}>All habits</Tab>
          <Tab id="history">History</Tab>
        </TabList>
      </Tabs>
      <div className="card" role="tabpanel" id={`habits-tabs-panel-${tab}`} aria-labelledby={`habits-tabs-tab-${tab}`} tabIndex={0} style={{ overflow: 'hidden' }}>
        {body()}
      </div>
      <div className="row small muted" style={{ gap: 14, flexWrap: 'wrap' }}>
        <span className="row" style={{ gap: 5 }}><span className="heat-key f" aria-hidden="true" />Done</span>
        <span className="row" style={{ gap: 5 }}><span className="heat-key p" aria-hidden="true" />Partial</span>
        <span className="row" style={{ gap: 5 }}><span className="heat-key" aria-hidden="true" />Missed</span>
        <span>Weekly habits use your week start ({weekStart === 0 ? 'Sunday' : 'Monday'}). Streaks look back up to 365 days.{archived.length ? ` ${archived.length} archived (see History).` : ''}</span>
      </div>
      {currentUserId && (
        <HabitDialog
          isOpen={dialog !== null}
          onClose={() => setDialog(null)}
          workspaceId={ws}
          ownerId={currentUserId}
          editing={dialog?.editing ?? null}
          onSaved={(m) => {
            addToast({ title: m, type: 'success' });
            void load();
          }}
        />
      )}
    </div>
  );
}
