import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, List, RotateCw } from 'lucide-react';
import { fetchCalendarSources } from '../api/planning';
import { fetchWorkspaceMembers, type WorkspaceMemberInfo } from '../api/applications';
import { PlanningNav } from '../components/planning/PlanningNav';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Select } from '../components/ui/Select';
import { Skeleton } from '../components/ui/Skeleton';
import { useProfileTimeZone } from '../hooks/useProfileTimeZone';
import {
  calendarMonthDays,
  formatDateKey,
  isDateKey,
  monthAnchor,
  normalizeCalendarItems,
  shiftDateKey,
  shiftMonth,
  type CalendarItem,
  type CalendarItemType,
} from '../lib/planning';
import { dayKey, formatTime, zonedWallTimeToUtcIso } from '../lib/time';

const CATEGORY_META: Record<CalendarItemType, { label: string; short: string }> = {
  interview: { label: 'Interviews', short: 'Interview' },
  task: { label: 'Tasks & reminders', short: 'Task' },
  follow_up: { label: 'Follow-ups', short: 'Follow-up' },
  next_action: { label: 'Next actions', short: 'Next action' },
};

const WEEKDAYS_SUNDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_MONDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function statusMatches(item: CalendarItem, filter: string): boolean {
  if (filter === 'all') return true;
  const complete = item.status === 'completed' || item.status === 'cancelled';
  return filter === 'complete' ? complete : !complete;
}

function dayBoundary(day: string, timeZone: string): string {
  try {
    return zonedWallTimeToUtcIso(day, '00:00', timeZone);
  } catch {
    return zonedWallTimeToUtcIso(day, '01:00', timeZone);
  }
}

function CalendarEventRow({
  item,
  timeZone,
  ownerName,
  showOwner,
  onNavigate,
}: {
  item: CalendarItem;
  timeZone: string;
  ownerName?: string;
  showOwner: boolean;
  onNavigate: (path: string) => void;
}) {
  const time = item.startAt
    ? item.endAt
      ? `${formatTime(item.startAt, timeZone)}–${formatTime(item.endAt, timeZone)}`
      : formatTime(item.startAt, timeZone)
    : 'All day';
  return (
    <button type="button" className="calendar-event-row" onClick={() => onNavigate(item.sourcePath)}>
      <span className={`planning-kind planning-kind-${item.type}`}>{CATEGORY_META[item.type].short}</span>
      <span className="calendar-event-copy">
        <strong>{item.title}</strong>
        <span className="muted small">{item.context}</span>
      </span>
      <span className="calendar-event-meta">
        <span>{time}</span>
        <span className="muted">{item.status.replace(/_/g, ' ')}</span>
        {showOwner && ownerName ? <span className="muted">{ownerName}</span> : null}
      </span>
    </button>
  );
}

export function CalendarView({
  activeWorkspaceId,
  currentUserId,
  isManager,
  initialDate,
  onSelectDate,
  onNavigate,
}: {
  activeWorkspaceId: string | null;
  currentUserId: string | null;
  isManager: boolean;
  initialDate?: string | null;
  onSelectDate: (day: string | null) => void;
  onNavigate: (path: string) => void;
}) {
  const { timeZone, weekStart, loaded: timeLoaded } = useProfileTimeZone(currentUserId);
  const today = dayKey(Date.now(), timeZone);
  const validInitialDate = isDateKey(initialDate) ? initialDate : null;
  const [anchor, setAnchor] = useState(() => monthAnchor(validInitialDate ?? today));
  const [selectedDay, setSelectedDay] = useState<string | null>(validInitialDate);
  const [view, setView] = useState<'month' | 'agenda'>('month');
  const [statusFilter, setStatusFilter] = useState('open');
  const [ownerId, setOwnerId] = useState('');
  const [members, setMembers] = useState<WorkspaceMemberInfo[]>([]);
  const [categories, setCategories] = useState<Set<CalendarItemType>>(
    () => new Set(['interview', 'task', 'follow_up', 'next_action']),
  );
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isDateKey(initialDate)) {
      setSelectedDay(initialDate);
      setAnchor(monthAnchor(initialDate));
    } else {
      setSelectedDay(null);
    }
  }, [initialDate]);

  useEffect(() => {
    if (timeLoaded && !isDateKey(initialDate)) setAnchor(monthAnchor(dayKey(Date.now(), timeZone)));
  }, [initialDate, timeLoaded, timeZone]);

  useEffect(() => {
    if (!activeWorkspaceId || !isManager) {
      setMembers([]);
      setOwnerId('');
      return;
    }
    void fetchWorkspaceMembers(activeWorkspaceId).then(setMembers).catch(() => setMembers([]));
  }, [activeWorkspaceId, isManager]);

  const days = useMemo(() => calendarMonthDays(anchor, weekStart), [anchor, weekStart]);
  const rangeStart = days[0]!;
  const rangeEnd = shiftDateKey(days.at(-1)!, 1);

  const load = useCallback(async () => {
    if (!activeWorkspaceId || !timeLoaded) return;
    setLoading(true);
    setError(null);
    try {
      const source = await fetchCalendarSources(activeWorkspaceId, {
        startDay: rangeStart,
        endDayExclusive: rangeEnd,
        startIso: dayBoundary(rangeStart, timeZone),
        endIso: dayBoundary(rangeEnd, timeZone),
        ownerId: ownerId || undefined,
      });
      setItems(normalizeCalendarItems(source, timeZone));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load Calendar.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, ownerId, rangeEnd, rangeStart, timeLoaded, timeZone]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleItems = useMemo(
    () => items.filter((item) => categories.has(item.type) && statusMatches(item, statusFilter)),
    [categories, items, statusFilter],
  );
  const itemsByDay = useMemo(() => {
    const result = new Map<string, CalendarItem[]>();
    for (const item of visibleItems) {
      const list = result.get(item.day) ?? [];
      list.push(item);
      result.set(item.day, list);
    }
    return result;
  }, [visibleItems]);
  const agendaDays = selectedDay ? [selectedDay] : days.filter((day) => (itemsByDay.get(day)?.length ?? 0) > 0);
  const memberNames = useMemo(
    () => new Map(members.map((member) => [member.user_id, member.display_name || member.username])),
    [members],
  );

  const selectDay = (day: string, focus = false) => {
    setSelectedDay(day);
    setAnchor(monthAnchor(day));
    onSelectDate(day);
    if (focus) {
      window.setTimeout(() => document.querySelector<HTMLButtonElement>(`[data-calendar-day="${day}"]`)?.focus(), 0);
    }
  };
  const handleDayKey = (event: KeyboardEvent<HTMLButtonElement>, day: string) => {
    const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -7 : event.key === 'ArrowDown' ? 7 : 0;
    if (delta) {
      event.preventDefault();
      selectDay(shiftDateKey(day, delta), true);
      return;
    }
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const fromStart = (weekday - weekStart + 7) % 7;
      selectDay(shiftDateKey(day, event.key === 'Home' ? -fromStart : 6 - fromStart), true);
    }
  };
  const moveMonth = (delta: number) => {
    setAnchor((value) => shiftMonth(value, delta));
    setSelectedDay(null);
    onSelectDate(null);
  };
  const goToday = () => selectDay(today, true);
  const toggleCategory = (category: CalendarItemType) => {
    setCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };
  const monthLabel = formatDateKey(anchor, { month: 'long', year: 'numeric' });
  const weekdays = weekStart === 0 ? WEEKDAYS_SUNDAY : WEEKDAYS_MONDAY;

  return (
    <div className="planning-page" data-testid="calendar-view">
      <PlanningNav currentPath="/calendar" onNavigate={onNavigate} />
      <header className="planning-page-header">
        <div>
          <p className="eyebrow">Plan your search</p>
          <h1>Calendar</h1>
          <p className="muted">Interviews, tasks, follow-ups, and dated next actions in {timeZone.replace(/_/g, ' ')}.</p>
        </div>
        <div className="planning-header-actions">
          {isManager ? (
            <Select aria-label="Calendar owner" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
              <option value="">All members</option>
              {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name || member.username}</option>)}
            </Select>
          ) : null}
          <div className="segmented-control" aria-label="Calendar view">
            <button type="button" aria-pressed={view === 'month'} onClick={() => setView('month')}><CalendarDays size={15} /> Month</button>
            <button type="button" aria-pressed={view === 'agenda'} onClick={() => setView('agenda')}><List size={15} /> Agenda</button>
          </div>
        </div>
      </header>

      <Card className="planning-filter-card">
        <CardBody>
          <div className="planning-filter-row">
            <div className="calendar-period-controls">
              <Button variant="ghost" size="sm" aria-label="Previous month" onClick={() => moveMonth(-1)}><ChevronLeft size={16} /></Button>
              <strong aria-live="polite">{monthLabel}</strong>
              <Button variant="ghost" size="sm" aria-label="Next month" onClick={() => moveMonth(1)}><ChevronRight size={16} /></Button>
              <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
              {selectedDay ? <Button variant="ghost" size="sm" onClick={() => { setSelectedDay(null); onSelectDate(null); }}>Clear date</Button> : null}
            </div>
            <Select aria-label="Calendar status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="open">Open & upcoming</option>
              <option value="complete">Completed & cancelled</option>
              <option value="all">All status</option>
            </Select>
          </div>
          <div className="planning-category-filters" aria-label="Event types">
            {(Object.keys(CATEGORY_META) as CalendarItemType[]).map((category) => (
              <button key={category} type="button" className={`planning-filter-chip type-${category}`} aria-pressed={categories.has(category)} onClick={() => toggleCategory(category)}>
                {CATEGORY_META[category].label}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      {loading ? (
        <div className="planning-loading" role="status" aria-label="Loading Calendar"><Skeleton height={420} /></div>
      ) : error ? (
        <EmptyState icon={<RotateCw size={22} />} title="Calendar could not load" description={error} action={<Button onClick={() => void load()}>Try again</Button>} />
      ) : (
        <>
          {view === 'month' ? (
            <Card className="calendar-month-card desktop-calendar">
              <div className="calendar-table-wrap">
                <table className="calendar-month" aria-label={`${monthLabel} calendar`}>
                  <thead><tr>{weekdays.map((weekday) => <th key={weekday} scope="col">{weekday}</th>)}</tr></thead>
                  <tbody>
                    {Array.from({ length: 6 }, (_, week) => (
                      <tr key={week}>
                        {days.slice(week * 7, week * 7 + 7).map((day) => {
                          const dayItems = itemsByDay.get(day) ?? [];
                          const outside = day.slice(0, 7) !== anchor.slice(0, 7);
                          return (
                            <td key={day} className={`${outside ? 'outside' : ''} ${selectedDay === day ? 'selected' : ''}`}>
                              <button
                                type="button"
                                className="calendar-day-button"
                                data-calendar-day={day}
                                aria-label={`${formatDateKey(day, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}, ${dayItems.length} events`}
                                aria-pressed={selectedDay === day}
                                aria-current={day === today ? 'date' : undefined}
                                onClick={() => selectDay(day)}
                                onKeyDown={(event) => handleDayKey(event, day)}
                              >
                                <span className={day === today ? 'calendar-today' : ''}>{Number(day.slice(-2))}</span>
                              </button>
                              <ul className="calendar-cell-events" aria-hidden="true">
                                {dayItems.slice(0, 3).map((item) => <li key={item.id} className={`type-${item.type}`}>{item.startAt ? formatTime(item.startAt, timeZone) : ''} {item.title}</li>)}
                                {dayItems.length > 3 ? <li className="more">+{dayItems.length - 3} more</li> : null}
                              </ul>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          <section className={`${view === 'agenda' ? 'calendar-agenda-full' : 'calendar-agenda-panel'}`} aria-labelledby="calendar-agenda-heading">
            <div className="calendar-agenda-heading">
              <div>
                <h2 id="calendar-agenda-heading">{selectedDay ? formatDateKey(selectedDay, { weekday: 'long', month: 'long', day: 'numeric' }) : `${monthLabel} agenda`}</h2>
                <p className="muted small">Select an item to open its canonical application, contact, task, or interview screen.</p>
              </div>
              <Clock3 size={18} aria-hidden="true" />
            </div>
            {agendaDays.length === 0 || (selectedDay && !(itemsByDay.get(selectedDay)?.length)) ? (
              <EmptyState title={selectedDay ? 'No events on this date' : 'No events in this period'} description="Try another date, status, owner, or event type." />
            ) : (
              <div className="calendar-agenda-days">
                {agendaDays.map((day) => (
                  <section key={day} className="calendar-agenda-day" aria-label={formatDateKey(day, { weekday: 'long', month: 'long', day: 'numeric' })}>
                    {!selectedDay ? <h3>{formatDateKey(day, { weekday: 'short', month: 'short', day: 'numeric' })}</h3> : null}
                    <div className="calendar-event-list">
                      {(itemsByDay.get(day) ?? []).map((item) => (
                        <CalendarEventRow key={item.id} item={item} timeZone={timeZone} ownerName={memberNames.get(item.ownerId)} showOwner={isManager && !ownerId} onNavigate={onNavigate} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </section>
          <div className="mobile-calendar-note muted small">Month grid is replaced by this agenda on smaller screens for easier navigation.</div>
        </>
      )}
      <span className="sr-only" aria-live="polite">{loading ? 'Loading Calendar' : `${visibleItems.length} calendar items loaded`}</span>
    </div>
  );
}
