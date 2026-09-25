/** M6 · canonical tasks (migration 20260926100000). */
import { dayKey, daysBetweenKeys, formatTime } from '../lib/time';

export const TASK_TYPES = [
  { id: 'TASK', label: 'Task' },
  { id: 'FOLLOW_UP', label: 'Follow-up' },
  { id: 'REMINDER', label: 'Reminder' },
] as const;
export type TaskType = (typeof TASK_TYPES)[number]['id'];

export const TASK_PRIORITIES = [
  { id: 'LOW', label: 'Low' },
  { id: 'MEDIUM', label: 'Medium' },
  { id: 'HIGH', label: 'High' },
] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number]['id'];

/** ADR-023 / Gate 02B §6.2 recurrence rules. */
export const RECURRENCE_RULES = [
  { id: 'DAILY', label: 'Daily' },
  { id: 'WEEKDAYS', label: 'Weekdays' },
  { id: 'WEEKLY', label: 'Weekly' },
  { id: 'BIWEEKLY', label: 'Every 2 weeks' },
  { id: 'MONTHLY', label: 'Monthly' },
] as const;
export type RecurrenceRule = (typeof RECURRENCE_RULES)[number]['id'];

export interface Task {
  id: string;
  workspace_id: string;
  user_id: string;
  application_id: string | null;
  contact_id: string | null;
  interview_id: string | null;
  task_type: TaskType;
  title: string;
  details: string | null;
  due_date: string | null;
  due_at: string | null;
  priority: TaskPriority;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  completed_at: string | null;
  recurrence_rule: RecurrenceRule | null;
  parent_task_id: string | null;
  created_at: string;
  updated_at: string;
  applications?: { id: string; company_name: string; role_title: string; stage: string } | null;
  contacts?: { id: string; full_name: string; relationship_type: string } | null;
  interviews?: { id: string; interview_type: string; scheduled_at: string; round_number: number } | null;
}

/** Columns a client may write directly (matches the column-level grants). */
export const TASK_EDITABLE_FIELDS = [
  'application_id',
  'contact_id',
  'interview_id',
  'task_type',
  'title',
  'details',
  'due_date',
  'due_at',
  'priority',
  'recurrence_rule',
] as const;
export type TaskUpdate = Partial<Pick<Task, (typeof TASK_EDITABLE_FIELDS)[number]>>;

export type TaskTab = 'overdue' | 'today' | 'upcoming' | 'nodate' | 'completed';

export const typeLabel = (t: string) => TASK_TYPES.find((x) => x.id === t)?.label ?? t;
export const recurrenceLabel = (r: string | null) => (r ? RECURRENCE_RULES.find((x) => x.id === r)?.label ?? r : 'Does not repeat');

/** Calendar day of a task in the profile zone (date-only tasks never shift). */
export function taskDay(t: Pick<Task, 'due_date' | 'due_at'>, timeZone: string): string | null {
  if (t.due_date) return t.due_date;
  if (t.due_at) return dayKey(t.due_at, timeZone);
  return null;
}

export type DueState = 'overdue' | 'today' | 'upcoming' | 'nodate';
/** Overdue / today / upcoming relative to "now" in the profile zone. Timed items are
 *  overdue once their instant has passed; date-only items once their day has passed. */
export function dueState(t: Pick<Task, 'due_date' | 'due_at'>, timeZone: string, now: number = Date.now()): DueState {
  const day = taskDay(t, timeZone);
  if (!day) return 'nodate';
  const today = dayKey(now, timeZone);
  if (t.due_at && Date.parse(t.due_at) < now) return 'overdue';
  if (day < today) return 'overdue';
  if (day === today) return 'today';
  return 'upcoming';
}

/** "5d overdue", "Today", "4:30 PM", "Tomorrow", "Sep 30". */
export function dueLabel(t: Pick<Task, 'due_date' | 'due_at'>, timeZone: string, now: number = Date.now()): string {
  const day = taskDay(t, timeZone);
  if (!day) return 'No date';
  const today = dayKey(now, timeZone);
  const diff = daysBetweenKeys(today, day);
  if (diff < 0) return `${-diff}d overdue`;
  if (t.due_at) {
    const time = formatTime(t.due_at, timeZone);
    if (diff === 0) return Date.parse(t.due_at) < now ? `Overdue · ${time}` : time;
    if (diff === 1) return `Tomorrow · ${time}`;
  }
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y!, m! - 1, d!)));
}

/** Add whole days to a YYYY-MM-DD key. */
export function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

const PRIORITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
/** Most urgent first: earliest due, then timed before all-day on the same day, then priority. */
export function compareUrgency(
  a: { day: string | null; at: string | null; priority: string },
  b: { day: string | null; at: string | null; priority: string },
): number {
  if (a.day !== b.day) {
    if (!a.day) return 1;
    if (!b.day) return -1;
    return a.day < b.day ? -1 : 1;
  }
  if (a.at && b.at && a.at !== b.at) return a.at < b.at ? -1 : 1;
  if (a.at && !b.at) return -1;
  if (!a.at && b.at) return 1;
  return (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
}
