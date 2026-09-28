import { supabase } from '../supabase';

export interface JournalEntry {
  id: string;
  workspace_id: string;
  user_id: string;
  application_id: string | null;
  entry_type: 'REFLECTION' | 'STRATEGY' | 'INTERVIEW_PREP' | 'NOTE' | 'POST_MORTEM';
  title: string | null;
  content: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  legacy_id?: number | null;
  applications?: {
    id: string;
    company_name: string;
    role_title: string;
    stage: string;
  } | null;
}

export interface JournalFilters {
  entryType?: string;
  applicationId?: string;
  searchQuery?: string;
  pinnedOnly?: boolean;
}

export async function fetchJournalEntries(
  workspaceId: string,
  filters?: JournalFilters
): Promise<JournalEntry[]> {
  let query = supabase
    .from('journal_entries')
    .select(`
      id,
      workspace_id,
      user_id,
      application_id,
      entry_type,
      title,
      content,
      is_pinned,
      created_at,
      updated_at,
      applications (
        id,
        company_name,
        role_title,
        stage
      )
    `)
    .eq('workspace_id', workspaceId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters?.entryType) {
    query = query.eq('entry_type', filters.entryType);
  }

  if (filters?.applicationId) {
    query = query.eq('application_id', filters.applicationId);
  }

  if (filters?.pinnedOnly) {
    query = query.eq('is_pinned', true);
  }

  if (filters?.searchQuery && filters.searchQuery.trim()) {
    const term = `%${filters.searchQuery.trim()}%`;
    query = query.or(`title.ilike.${term},content.ilike.${term}`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as unknown as JournalEntry[]) || [];
}

export async function createJournalEntry(
  workspaceId: string,
  entry: {
    title?: string | null;
    content: string;
    entry_type: 'REFLECTION' | 'STRATEGY' | 'INTERVIEW_PREP' | 'NOTE' | 'POST_MORTEM';
    application_id?: string | null;
    is_pinned?: boolean;
  }
): Promise<string> {
  const { data, error } = await supabase.rpc('rpc_create_journal_entry', {
    p_workspace_id: workspaceId,
    p_title: entry.title || null,
    p_content: entry.content,
    p_entry_type: entry.entry_type,
    p_application_id: entry.application_id || null,
    p_is_pinned: entry.is_pinned ?? false,
  });

  if (error) throw new Error(error.message);
  return data as string;
}

export async function updateJournalEntry(
  entryId: string,
  entry: {
    title?: string | null;
    content: string;
    entry_type: 'REFLECTION' | 'STRATEGY' | 'INTERVIEW_PREP' | 'NOTE' | 'POST_MORTEM';
    application_id?: string | null;
    is_pinned?: boolean;
  }
): Promise<boolean> {
  const { data, error } = await supabase.rpc('rpc_update_journal_entry', {
    p_entry_id: entryId,
    p_title: entry.title || null,
    p_content: entry.content,
    p_entry_type: entry.entry_type,
    p_application_id: entry.application_id || null,
    p_is_pinned: entry.is_pinned ?? false,
  });

  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function deleteJournalEntry(entryId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('rpc_delete_journal_entry', {
    p_entry_id: entryId,
  });

  if (error) throw new Error(error.message);
  return Boolean(data);
}
