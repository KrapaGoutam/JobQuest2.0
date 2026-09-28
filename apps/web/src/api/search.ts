import { supabase } from '../supabase';

export type SearchDomain = 'application' | 'contact' | 'note' | 'interview' | 'document';

export interface SearchResultItem {
  id: string;
  domain: SearchDomain;
  title: string;
  subtitle: string;
  badge: string;
  snippet: string;
  deep_link: string;
  created_at: string;
}

export async function executeGlobalSearch(
  workspaceId: string,
  query: string,
  limit: number = 20
): Promise<SearchResultItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const { data, error } = await supabase.rpc('rpc_global_search', {
    p_query: trimmed,
    p_workspace_id: workspaceId,
    p_limit: limit,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data as SearchResultItem[]) || [];
}
