/**
 * M6 unified action queue (approved dashboard D1 + Tasks T1). The queue is a READ
 * VIEW over existing domain state: canonical tasks, application next actions (M3),
 * interviews that need an outcome (M5) and quiet applications (M3 aging). Building
 * it never mutates anything; every action goes through the owning domain's RPC.
 */
import { dayKey, daysBetweenKeys } from './time';
import { compareUrgency, dueState, taskDay, type DueState, type Task } from '../types/tasks';

export type QueueKind = 'TASK' | 'FOLLOW_UP' | 'REMINDER' | 'NEXT_ACTION' | 'INTERVIEW_OUTCOME';

export interface NextActionSource {
  id: string;
  company_name: string;
  role_title: string;
  stage: string;
  priority: string;
  next_action: string;
  next_action_date: string | null;
  last_activity_at: string;
  user_id: string;
}
export interface OutcomeSource {
  id: string;
  interview_type: string;
  round_number: number;
  scheduled_at: string;
  user_id: string;
  applications: { id: string; company_name: string; role_title: string } | null;
}

export interface QueueItem {
  key: string;
  kind: QueueKind;
  title: string;
  subtitle: string;
  day: string | null;
  at: string | null;
  priority: string;
  state: DueState;
  ownerId: string;
  task?: Task;
  nextAction?: NextActionSource;
  interview?: OutcomeSource;
}

const INTERVIEW_TYPE_LABELS: Record<string, string> = {
  RECRUITER_SCREEN: 'Recruiter screen', HIRING_MANAGER: 'Hiring manager', TECHNICAL: 'Technical', CODING: 'Coding',
  BEHAVIORAL: 'Behavioral', PANEL: 'Panel', FINAL: 'Final interview', OFFER_CALL: 'Offer call', OTHER: 'Other',
};

export function taskSubtitle(t: Task): string {
  if (t.interviews && t.applications) return `${t.applications.company_name} · ${INTERVIEW_TYPE_LABELS[t.interviews.interview_type] ?? t.interviews.interview_type}`;
  if (t.applications) return `${t.applications.company_name} · ${t.applications.role_title}`;
  if (t.contacts) return `${t.contacts.full_name} · Contact`;
  if (t.recurrence_rule) return `Recurring ${t.recurrence_rule.toLowerCase().replace('biweekly', 'every 2 weeks')}`;
  return 'General';
}

export function buildQueue(
  input: { tasks: Task[]; nextActions: NextActionSource[]; outcomes: OutcomeSource[] },
  timeZone: string,
  now: number = Date.now(),
): QueueItem[] {
  const items: QueueItem[] = [];
  for (const t of input.tasks) {
    if (t.status !== 'PENDING') continue;
    items.push({
      key: `task:${t.id}`,
      kind: t.task_type,
      title: t.title,
      subtitle: taskSubtitle(t),
      day: taskDay(t, timeZone),
      at: t.due_at,
      priority: t.priority,
      state: dueState(t, timeZone, now),
      ownerId: t.user_id,
      task: t,
    });
  }
  for (const a of input.nextActions) {
    items.push({
      key: `next:${a.id}`,
      kind: 'NEXT_ACTION',
      title: a.next_action,
      subtitle: `${a.company_name} · ${a.role_title}`,
      day: a.next_action_date,
      at: null,
      priority: a.priority,
      state: dueState({ due_date: a.next_action_date, due_at: null }, timeZone, now),
      ownerId: a.user_id,
      nextAction: a,
    });
  }
  for (const i of input.outcomes) {
    items.push({
      key: `outcome:${i.id}`,
      kind: 'INTERVIEW_OUTCOME',
      title: `Record outcome: ${INTERVIEW_TYPE_LABELS[i.interview_type] ?? i.interview_type} · round ${i.round_number}`,
      subtitle: i.applications ? `${i.applications.company_name} · ${i.applications.role_title}` : 'Interview',
      day: dayKey(i.scheduled_at, timeZone),
      at: i.scheduled_at,
      priority: 'HIGH',
      // An interview that has started and has no outcome is due now (today if it was today).
      state: dayKey(i.scheduled_at, timeZone) < dayKey(now, timeZone) ? 'overdue' : 'today',
      ownerId: i.user_id,
      interview: i,
    });
  }
  return items.sort(compareUrgency);
}

export interface QueueSections {
  overdue: QueueItem[];
  today: QueueItem[];
  upcoming: QueueItem[];
  nodate: QueueItem[];
}
export function sectionQueue(items: QueueItem[]): QueueSections {
  return {
    overdue: items.filter((i) => i.state === 'overdue'),
    today: items.filter((i) => i.state === 'today'),
    upcoming: items.filter((i) => i.state === 'upcoming'),
    nodate: items.filter((i) => i.state === 'nodate'),
  };
}

/** Whole days overdue for an item, in the profile zone. */
export function daysOverdue(item: Pick<QueueItem, 'day'>, timeZone: string, now: number = Date.now()): number {
  if (!item.day) return 0;
  return Math.max(0, daysBetweenKeys(item.day, dayKey(now, timeZone)));
}

/** Start/end instants (ISO) of "today" in the profile zone, for server-side filters. */
export function todayBounds(timeZone: string, now: number = Date.now(), toUtc: (d: string, t: string, z: string) => string): { today: string; start: string; end: string; tomorrow: string } {
  const today = dayKey(now, timeZone);
  const [y, m, d] = today.split('-').map(Number);
  const tomorrow = new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10);
  const safe = (day: string) => {
    for (const t of ['00:00', '01:00', '02:00']) {
      try {
        return toUtc(day, t, timeZone);
      } catch {
        /* midnight skipped by a DST change in some zones */
      }
    }
    return `${day}T00:00:00.000Z`;
  };
  return { today, tomorrow, start: safe(today), end: safe(tomorrow) };
}
