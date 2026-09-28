import { supabase } from '../supabase';
import type { HabitFrequency } from '../lib/habits';

export interface Habit {
  id: string;
  workspace_id: string;
  user_id: string;
  title: string;
  description: string | null;
  frequency: HabitFrequency;
  target_count: number;
  unit_label: string | null;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
}
export interface HabitLog {
  id: string;
  habit_id: string;
  log_date: string;
  completed_count: number;
  target_count: number;
}

export const HABIT_EDITABLE_FIELDS = ['title', 'description', 'frequency', 'target_count', 'unit_label', 'is_active'] as const;
export type HabitUpdate = Partial<Pick<Habit, (typeof HABIT_EDITABLE_FIELDS)[number]>>;

export async function fetchHabits(workspaceId: string, opts: { ownerId?: string; includeArchived?: boolean } = {}): Promise<Habit[]> {
  let q = supabase.from('habits').select('*').eq('workspace_id', workspaceId);
  if (!opts.includeArchived) q = q.is('archived_at', null);
  if (opts.ownerId) q = q.eq('user_id', opts.ownerId);
  const { data, error } = await q.order('created_at').limit(100);
  if (error) throw new Error(`Could not load habits: ${error.message}`);
  return (data ?? []) as Habit[];
}

/** Logs for the given habits from `fromDay` (bounded: habits × lookback). */
export async function fetchHabitLogs(habitIds: string[], fromDay: string): Promise<HabitLog[]> {
  if (!habitIds.length) return [];
  const { data, error } = await supabase
    .from('habit_logs')
    .select('id, habit_id, log_date, completed_count, target_count')
    .in('habit_id', habitIds)
    .gte('log_date', fromDay)
    .order('log_date')
    .limit(5000);
  if (error) throw new Error(`Could not load habit history: ${error.message}`);
  return (data ?? []) as HabitLog[];
}

export async function createHabit(h: { workspace_id: string; user_id: string } & Required<Pick<Habit, 'title' | 'frequency' | 'target_count'>> & HabitUpdate): Promise<Habit> {
  const { data, error } = await supabase.from('habits').insert(h).select().single();
  if (error) throw new Error(error.message);
  return data as Habit;
}
export async function updateHabit(id: string, updates: HabitUpdate): Promise<void> {
  const payload: Record<string, unknown> = {};
  for (const k of HABIT_EDITABLE_FIELDS) if (k in updates) payload[k] = updates[k];
  const { error } = await supabase.from('habits').update(payload).eq('id', id);
  if (error) throw new Error(error.message);
}
export async function setHabitLog(habitId: string, day: string, count: number): Promise<void> {
  const { error } = await supabase.rpc('rpc_set_habit_log', { p_habit_id: habitId, p_log_date: day, p_count: count });
  if (error) {
    const m = error.message;
    throw new Error(m.includes('HABIT_PAUSED') ? 'This habit is paused. Resume it to check in.' : m.includes('FUTURE_DATE') ? 'You can’t check in for a future day.' : m);
  }
}
export async function archiveHabit(id: string): Promise<void> {
  const { error } = await supabase.rpc('rpc_archive_habit', { p_habit_id: id });
  if (error) throw new Error(error.message);
}
export async function restoreHabit(id: string): Promise<void> {
  const { error } = await supabase.rpc('rpc_restore_habit', { p_habit_id: id });
  if (error) throw new Error(error.message);
}
