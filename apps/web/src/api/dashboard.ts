import { supabase } from '../supabase';
import {
  readDashboardLayout,
  writeDashboardLayout,
  type DashboardType,
  type DashboardWidgetLayout,
} from '../lib/dashboard';

interface ProfilePreferencesRow {
  ui_preferences: unknown;
}

export interface DashboardApplication {
  id: string;
  user_id: string;
  company_name: string;
  role_title: string;
  stage: string;
  status: string;
  outcome: string | null;
  priority: string;
  work_arrangement: string | null;
  applied_at: string;
  last_activity_at: string;
}

export async function fetchDashboardLayout(
  userId: string,
  workspaceId: string,
  type: DashboardType
): Promise<{ layout: DashboardWidgetLayout[]; preferences: Record<string, unknown> }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('ui_preferences')
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  const raw = (data as ProfilePreferencesRow | null)?.ui_preferences;
  const preferences = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  return { layout: readDashboardLayout(preferences, workspaceId, type), preferences };
}

export async function saveDashboardLayout(
  userId: string,
  workspaceId: string,
  type: DashboardType,
  layout: DashboardWidgetLayout[],
  currentPreferences: unknown
): Promise<Record<string, unknown>> {
  const nextPreferences = writeDashboardLayout(currentPreferences, workspaceId, type, layout);
  const { data, error } = await supabase
    .from('profiles')
    .update({ ui_preferences: nextPreferences })
    .eq('user_id', userId)
    .select('ui_preferences')
    .single();
  if (error) throw error;
  return ((data as ProfilePreferencesRow | null)?.ui_preferences ?? nextPreferences) as Record<string, unknown>;
}

export async function fetchDashboardApplications(
  workspaceId: string,
  ownerId?: string
): Promise<DashboardApplication[]> {
  let query = supabase
    .from('applications')
    .select('id,user_id,company_name,role_title,stage,status,outcome,priority,work_arrangement,applied_at,last_activity_at')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .order('last_activity_at', { ascending: false })
    .limit(1000);
  if (ownerId) query = query.eq('user_id', ownerId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DashboardApplication[];
}
