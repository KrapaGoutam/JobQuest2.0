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
