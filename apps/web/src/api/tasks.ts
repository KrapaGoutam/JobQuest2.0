import { supabase } from '../supabase';
import { TASK_EDITABLE_FIELDS, type Task, type TaskTab, type TaskType, type TaskUpdate } from '../types/tasks';
import type { NextActionSource, OutcomeSource } from '../lib/queue';

const SELECT = `
  *,
  applications(id, company_name, role_title, stage),
  contacts(id, full_name, relationship_type),
  interviews(id, interview_type, scheduled_at, round_number)
`;
export const TASKS_PAGE_SIZE = 50;

export interface TaskFilters {
  ownerId?: string;
  taskType?: TaskType | 'NEXT_ACTION' | '';
}
export interface DayBounds {
  today: string;
  tomorrow: string;
  /** "now" as ISO; timed items before it are overdue. */
  now: string;
  /** Start of tomorrow in the profile zone (ISO). */
  end: string;
}

// PostgREST builder generics are deep; the helper only needs these methods.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;
function applyTab(q: Q, tab: TaskTab, b: DayBounds): Q {
  if (tab === 'completed') return q.eq('status', 'COMPLETED');
  q = q.eq('status', 'PENDING');
  if (tab === 'overdue') return q.or(`due_date.lt.${b.today},due_at.lt.${b.now}`);
  if (tab === 'today') return q.or(`due_date.eq.${b.today},and(due_at.gte.${b.now},due_at.lt.${b.end})`);
  if (tab === 'upcoming') return q.or(`due_date.gte.${b.tomorrow},due_at.gte.${b.end}`);
  return q.is('due_date', null).is('due_at', null);
}

/** One tab of the tasks list, filtered and bounded on the server. */
export async function fetchTasks(workspaceId: string, tab: TaskTab, b: DayBounds, filters: TaskFilters = {}, page = 0): Promise<{ tasks: Task[]; total: number }> {
  let q: Q = supabase.from('tasks').select(SELECT, { count: 'exact' }).eq('workspace_id', workspaceId);
  q = applyTab(q, tab, b);
  if (filters.ownerId) q = q.eq('user_id', filters.ownerId);
  if (filters.taskType && filters.taskType !== 'NEXT_ACTION') q = q.eq('task_type', filters.taskType);
  q =
    tab === 'completed'
      ? q.order('completed_at', { ascending: false })
      : q.order('due_date', { ascending: true, nullsFirst: false }).order('due_at', { ascending: true, nullsFirst: false }).order('created_at');
  const { data, error, count } = await q.range(page * TASKS_PAGE_SIZE, page * TASKS_PAGE_SIZE + TASKS_PAGE_SIZE - 1);
  if (error) throw new Error(`Could not load tasks: ${error.message}`);
  return { tasks: (data ?? []) as Task[], total: count ?? 0 };
}

export async function countTasks(workspaceId: string, tab: TaskTab, b: DayBounds, filters: TaskFilters = {}): Promise<number> {
  let q: Q = supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId);
  q = applyTab(q, tab, b);
  if (filters.ownerId) q = q.eq('user_id', filters.ownerId);
  if (filters.taskType && filters.taskType !== 'NEXT_ACTION') q = q.eq('task_type', filters.taskType);
  const { count, error } = await q;
  if (error) throw new Error(`Could not count tasks: ${error.message}`);
  return count ?? 0;
}

/** Tasks completed today (profile zone), for the "Completed today" band and undo. */
export async function fetchCompletedSince(workspaceId: string, sinceIso: string, filters: TaskFilters = {}): Promise<Task[]> {
  let q: Q = supabase.from('tasks').select(SELECT).eq('workspace_id', workspaceId).eq('status', 'COMPLETED').gte('completed_at', sinceIso);
  if (filters.ownerId) q = q.eq('user_id', filters.ownerId);
  const { data, error } = await q.order('completed_at', { ascending: false }).limit(20);
  if (error) throw new Error(`Could not load tasks: ${error.message}`);
  return (data ?? []) as Task[];
}

/** Every pending dated or undated task that belongs in the queue up to `untilDay` (bounded). */
export async function fetchQueueTasks(workspaceId: string, b: DayBounds, filters: TaskFilters = {}, limit = 300): Promise<Task[]> {
  let q: Q = supabase
    .from('tasks')
    .select(SELECT)
    .eq('workspace_id', workspaceId)
    .eq('status', 'PENDING')
    .or(`due_date.lt.${b.tomorrow},due_at.lt.${b.end}`);
  if (filters.ownerId) q = q.eq('user_id', filters.ownerId);
  const { data, error } = await q.order('due_date', { ascending: true, nullsFirst: false }).limit(limit);
  if (error) throw new Error(`Could not load tasks: ${error.message}`);
  return (data ?? []) as Task[];
}

export async function fetchTasksFor(link: { applicationId?: string; contactId?: string }): Promise<Task[]> {
  let q: Q = supabase.from('tasks').select(SELECT).eq('status', 'PENDING');
  if (link.applicationId) q = q.eq('application_id', link.applicationId);
  if (link.contactId) q = q.eq('contact_id', link.contactId);
  const { data, error } = await q.order('due_date', { ascending: true, nullsFirst: false }).limit(50);
  if (error) throw new Error(`Could not load tasks: ${error.message}`);
  return (data ?? []) as Task[];
}

/** Application next actions due today or earlier (or all dated, for the tasks tabs). */
export async function fetchNextActions(workspaceId: string, opts: { dueOnOrBefore?: string; dueAfter?: string; ownerId?: string } = {}): Promise<NextActionSource[]> {
  let q: Q = supabase
    .from('applications')
    .select('id, company_name, role_title, stage, priority, next_action, next_action_date, last_activity_at, user_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'OPEN')
    .is('archived_at', null)
    .not('next_action', 'is', null);
  if (opts.dueOnOrBefore) q = q.lte('next_action_date', opts.dueOnOrBefore);
  if (opts.dueAfter) q = q.gt('next_action_date', opts.dueAfter);
  if (opts.ownerId) q = q.eq('user_id', opts.ownerId);
  const { data, error } = await q.order('next_action_date', { ascending: true, nullsFirst: false }).limit(200);
  if (error) throw new Error(`Could not load next actions: ${error.message}`);
  return (data ?? []) as NextActionSource[];
}

export async function fetchOutcomesNeeded(workspaceId: string, ownerId?: string): Promise<OutcomeSource[]> {
  let q: Q = supabase
    .from('interviews')
    .select('id, interview_type, round_number, scheduled_at, user_id, applications(id, company_name, role_title)')
    .eq('workspace_id', workspaceId)
    .is('outcome', null)
    .lt('scheduled_at', new Date().toISOString());
  if (ownerId) q = q.eq('user_id', ownerId);
  const { data, error } = await q.order('scheduled_at', { ascending: true }).limit(50);
  if (error) throw new Error(`Could not load interviews: ${error.message}`);
  return (data ?? []) as OutcomeSource[];
}

export interface NewTask {
  workspace_id: string;
  user_id: string;
  task_type: TaskType;
  title: string;
  details?: string | null;
  due_date?: string | null;
  due_at?: string | null;
  priority: string;
  recurrence_rule?: string | null;
  application_id?: string | null;
  contact_id?: string | null;
  interview_id?: string | null;
}
export async function createTask(t: NewTask): Promise<Task> {
  const { data, error } = await supabase.from('tasks').insert(t).select(SELECT).single();
  if (error) throw new Error(friendly(error.message));
  return data as Task;
}
export async function updateTask(id: string, updates: TaskUpdate): Promise<void> {
  const payload: Record<string, unknown> = {};
  for (const k of TASK_EDITABLE_FIELDS) if (k in updates) payload[k] = updates[k];
  const { error } = await supabase.from('tasks').update(payload).eq('id', id);
  if (error) throw new Error(friendly(error.message));
}
export async function completeTask(id: string): Promise<{ next_task_id: string | null }> {
  const { data, error } = await supabase.rpc('rpc_complete_task', { p_task_id: id });
  if (error) throw new Error(friendly(error.message));
  return data as { next_task_id: string | null };
}
export async function reopenTask(id: string): Promise<void> {
  const { error } = await supabase.rpc('rpc_reopen_task', { p_task_id: id });
  if (error) throw new Error(friendly(error.message));
}
export async function cancelTask(id: string): Promise<void> {
  const { error } = await supabase.rpc('rpc_cancel_task', { p_task_id: id });
  if (error) throw new Error(friendly(error.message));
}
export async function completeNextAction(applicationId: string, next: string | null, nextDate: string | null): Promise<void> {
  const { error } = await supabase.rpc('rpc_complete_next_action', { p_application_id: applicationId, p_next_action: next, p_next_action_date: nextDate });
  if (error) throw new Error(friendly(error.message));
}
export async function snoozeNextAction(applicationId: string, day: string): Promise<void> {
  const { error } = await supabase.from('applications').update({ next_action_date: day }).eq('id', applicationId);
  if (error) throw new Error(friendly(error.message));
}
export async function setContactFollowUp(contactId: string, day: string | null): Promise<void> {
  const { error } = await supabase.rpc('rpc_set_contact_follow_up', { p_contact_id: contactId, p_due_date: day });
  if (error) throw new Error(friendly(error.message));
}
export async function completeContactFollowUp(contactId: string): Promise<void> {
  const { error } = await supabase.rpc('rpc_complete_contact_follow_up', { p_contact_id: contactId });
  if (error) throw new Error(friendly(error.message));
}

/** Records a task may link to: the owner's applications, contacts and upcoming interviews. */
export async function fetchLinkTargets(workspaceId: string, ownerId: string) {
  const [apps, contacts, interviews] = await Promise.all([
    supabase.from('applications').select('id, company_name, role_title').eq('workspace_id', workspaceId).eq('user_id', ownerId).is('archived_at', null).order('last_activity_at', { ascending: false }).limit(200),
    supabase.from('contacts').select('id, full_name').eq('workspace_id', workspaceId).eq('user_id', ownerId).is('archived_at', null).order('full_name').limit(200),
    supabase.from('interviews').select('id, interview_type, round_number, scheduled_at, applications(company_name)').eq('workspace_id', workspaceId).eq('user_id', ownerId).is('outcome', null).order('scheduled_at').limit(100),
  ]);
  return {
    applications: (apps.data ?? []) as { id: string; company_name: string; role_title: string }[],
    contacts: (contacts.data ?? []) as { id: string; full_name: string }[],
    interviews: (interviews.data ?? []) as unknown as { id: string; interview_type: string; round_number: number; scheduled_at: string; applications: { company_name: string } | null }[],
  };
}

export interface QuietApplication {
  id: string;
  company_name: string;
  role_title: string;
  last_activity_at: string;
  user_id: string;
}
/** Long Waiting (31+ days) applications for the review list (M3 aging; ADR-027). */
export async function fetchQuietApplications(workspaceId: string, ownerId?: string): Promise<{ items: QuietApplication[]; total: number }> {
  const cutoff = new Date(Date.now() - 31 * 86_400_000).toISOString();
  let q: Q = supabase
    .from('applications')
    .select('id, company_name, role_title, last_activity_at, user_id', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .eq('status', 'OPEN')
    .is('archived_at', null)
    .lte('last_activity_at', cutoff);
  if (ownerId) q = q.eq('user_id', ownerId);
  const { data, error, count } = await q.order('last_activity_at', { ascending: true }).limit(5);
  if (error) throw new Error(`Could not load quiet applications: ${error.message}`);
  return { items: (data ?? []) as QuietApplication[], total: count ?? 0 };
}

const MESSAGES: Record<string, string> = {
  TASK_LINK_FORBIDDEN: 'Tasks can only link to records that belong to the same person.',
  TASK_LINK_MISMATCH: 'That interview belongs to a different application.',
  TASK_NOT_PENDING: 'This task is already finished.',
  TASK_REOPEN_CONFLICT: 'The next occurrence has already changed, so this can’t be undone.',
  NO_NEXT_ACTION: 'This application has no next action.',
  NO_FOLLOW_UP: 'There is no open follow-up for this contact.',
  NOT_AUTHORIZED: 'You do not have access to this record.',
  chk_task_reminder_due: 'Reminders need a date.',
  chk_task_follow_up_link: 'Follow-ups need an application, interview or contact.',
  chk_task_recurrence_due: 'Repeating tasks need a due date.',
};
function friendly(message: string): string {
  const key = Object.keys(MESSAGES).find((k) => message.includes(k));
  return key ? MESSAGES[key]! : message;
}
