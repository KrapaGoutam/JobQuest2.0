import { supabase } from '../supabase';
import {
  CONTACT_EDITABLE_FIELDS,
  CONTACT_SEARCH_COLUMNS,
  type Contact,
  type Company,
  type ContactFilters,
  type ContactSort,
  type ContactRelationshipType,
  type ContactInteractionType,
  type ContactUpdate,
} from '../types/contacts';
import { buildSearchFilter } from '../types/applications';

/** Most recent interaction date from an embedded, newest-first interaction list. */
function withLastContact(c: Contact): Contact {
  return { ...c, last_contact_at: c.contact_interactions?.[0]?.interaction_date ?? null };
}

export interface FetchContactsResult {
  contacts: Contact[];
  totalCount: number;
}

export const CONTACTS_PAGE_SIZE = 50;

/**
 * Fetch contacts list with server-side filters, sorting, and pagination under RLS.
 */
export async function fetchContacts(
  workspaceId: string,
  filters: ContactFilters = {},
  sort: ContactSort = { field: 'next_follow_up_date', direction: 'asc' },
  page = 0,
  pageSize = CONTACTS_PAGE_SIZE
): Promise<FetchContactsResult> {
  let query = supabase
    .from('contacts')
    .select(
      `
      *,
      companies(id, name, website),
      application_contacts(
        application_id,
        contact_id,
        workspace_id,
        role_in_process,
        created_at,
        applications(id, company_name, role_title, stage, status)
      ),
      contact_interactions(interaction_date)
    `,
      { count: 'exact' }
    )
    .eq('workspace_id', workspaceId)
    // Last contact = newest interaction (one row per contact, server-side).
    .order('interaction_date', { referencedTable: 'contact_interactions', ascending: false })
    .limit(1, { referencedTable: 'contact_interactions' });

  // Archive state filter
  if (filters.archiveState === 'archived') {
    query = query.not('archived_at', 'is', null);
  } else if (filters.archiveState !== 'all') {
    query = query.is('archived_at', null);
  }

  // Relationship type
  if (filters.relationshipType && filters.relationshipType !== 'ALL') {
    query = query.eq('relationship_type', filters.relationshipType);
  }

  // Company name
  if (filters.company && filters.company.trim()) {
    const literal = filters.company.trim().slice(0, 100).replace(/[\\%_]/g, (ch) => `\\${ch}`);
    query = query.ilike('company_name', `%${literal}%`);
  }

  // Follow-up due only: due on or before today
  if (filters.followUpDueOnly) {
    const today = new Date().toISOString().split('T')[0];
    query = query.not('next_follow_up_date', 'is', null).lte('next_follow_up_date', today);
  }

  // Owner filter for managers
  if (filters.ownerId) {
    query = query.eq('user_id', filters.ownerId);
  }

  // Search across name, company, email, job title and exact tag. Untrusted input is
  // quoted and LIKE-escaped so it cannot add filter clauses (see buildSearchFilter).
  const searchFilter = filters.search ? buildSearchFilter(filters.search, CONTACT_SEARCH_COLUMNS) : null;
  if (searchFilter) {
    query = query.or(searchFilter);
  }

  // Sorting
  const nullsFirst = sort.field === 'next_follow_up_date' && sort.direction === 'asc';
  query = query.order(sort.field, { ascending: sort.direction === 'asc', nullsFirst });

  // Pagination
  const from = page * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(`fetchContacts failed: ${error.message}`);
  }

  return {
    contacts: ((data || []) as Contact[]).map(withLastContact),
    totalCount: count ?? (data?.length || 0),
  };
}

/**
 * Fetch full contact details including interactions timeline and linked applications.
 */
export async function fetchContactDetail(contactId: string): Promise<Contact> {
  const { data, error } = await supabase
    .from('contacts')
    .select(
      `
      *,
      companies(*),
      application_contacts(
        application_id,
        contact_id,
        workspace_id,
        role_in_process,
        created_at,
        applications(id, company_name, role_title, stage, status)
      ),
      contact_interactions(*)
    `
    )
    .eq('id', contactId)
    .single();

  if (error) {
    throw new Error(`fetchContactDetail failed: ${error.message}`);
  }

  const contact = data as Contact;
  if (contact.contact_interactions) {
    contact.contact_interactions.sort(
      (a, b) => new Date(b.interaction_date).getTime() - new Date(a.interaction_date).getTime()
    );
  }

  return withLastContact(contact);
}

export interface CreateContactParams {
  workspace_id: string;
  full_name: string;
  relationship_type?: ContactRelationshipType;
  company_name?: string;
  job_title?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  relationship_notes?: string;
  notes?: string;
  next_follow_up_date?: string;
  application_id?: string;
  role_in_process?: string;
}

/**
 * Create contact atomically via rpc_create_contact, upserting company and optionally linking application.
 */
export async function createContact(params: CreateContactParams): Promise<Contact> {
  const { data, error } = await supabase.rpc('rpc_create_contact', {
    p_workspace_id: params.workspace_id,
    p_full_name: params.full_name,
    p_relationship_type: params.relationship_type || 'CONTACT',
    p_company_name: params.company_name?.trim() || null,
    p_job_title: params.job_title?.trim() || null,
    p_email: params.email?.trim() || null,
    p_phone: params.phone?.trim() || null,
    p_linkedin_url: params.linkedin_url?.trim() || null,
    p_notes: (params.notes ?? params.relationship_notes)?.trim() || null,
    p_next_follow_up_date: params.next_follow_up_date || null,
    p_application_id: params.application_id || null,
    p_role_in_process: params.role_in_process || null,
  });

  if (error) {
    throw new Error(`rpc_create_contact failed: ${error.message}`);
  }

  return data as Contact;
}

/**
 * Direct update of simple contact fields under RLS. Only whitelisted columns are sent;
 * archive state and ownership change through RPCs (the database also enforces this).
 */
export async function updateContact(contactId: string, updates: ContactUpdate): Promise<Contact> {
  const payload: Record<string, unknown> = {};
  for (const key of CONTACT_EDITABLE_FIELDS) {
    if (key in updates) payload[key] = updates[key];
  }
  const { data, error } = await supabase
    .from('contacts')
    .update(payload)
    .eq('id', contactId)
    .select()
    .single();

  if (error) {
    throw new Error(`updateContact failed: ${error.message}`);
  }

  return data as Contact;
}

/**
 * Archive a contact via RPC.
 */
export async function archiveContact(contactId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('rpc_archive_contact', {
    p_contact_id: contactId,
  });

  if (error) {
    throw new Error(`rpc_archive_contact failed: ${error.message}`);
  }

  return Boolean(data);
}

/**
 * Restore an archived contact via RPC.
 */
export async function restoreContact(contactId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('rpc_restore_contact', {
    p_contact_id: contactId,
  });

  if (error) {
    throw new Error(`rpc_restore_contact failed: ${error.message}`);
  }

  return Boolean(data);
}

export interface LogInteractionParams {
  contact_id: string;
  interaction_type: ContactInteractionType;
  interaction_date?: string;
  notes?: string;
  next_follow_up_date?: string;
}

/**
 * Log an interaction with a contact via RPC.
 */
export async function logContactInteraction(params: LogInteractionParams): Promise<string> {
  const { data, error } = await supabase.rpc('rpc_log_contact_interaction', {
    p_contact_id: params.contact_id,
    p_interaction_type: params.interaction_type,
    p_interaction_date: params.interaction_date || new Date().toISOString(),
    p_notes: params.notes || null,
    p_next_follow_up_date: params.next_follow_up_date || null,
  });

  if (error) {
    throw new Error(`rpc_log_contact_interaction failed: ${error.message}`);
  }

  return data as string; // new interaction id
}

/**
 * Link a contact to an application.
 */
export async function linkApplicationContact(
  applicationId: string,
  contactId: string,
  roleInProcess = 'CONTACT'
): Promise<boolean> {
  const { data, error } = await supabase.rpc('rpc_link_application_contact', {
    p_application_id: applicationId,
    p_contact_id: contactId,
    p_role_in_process: roleInProcess,
  });

  if (error) {
    throw new Error(`rpc_link_application_contact failed: ${error.message}`);
  }

  return Boolean(data);
}

/**
 * Unlink a contact from an application.
 */
export async function unlinkApplicationContact(applicationId: string, contactId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('rpc_unlink_application_contact', {
    p_application_id: applicationId,
    p_contact_id: contactId,
  });

  if (error) {
    throw new Error(`rpc_unlink_application_contact failed: ${error.message}`);
  }

  return Boolean(data);
}

/**
 * Fetch companies in workspace.
 */
export async function fetchCompanies(workspaceId: string): Promise<Company[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`fetchCompanies failed: ${error.message}`);
  }

  return (data || []) as Company[];
}

/**
 * Fetch member users in workspace (for manager owner filter).
 */
export async function fetchWorkspaceMembers(
  workspaceId: string
): Promise<Array<{ user_id: string; username: string; role: string }>> {
  const { data, error } = await supabase.rpc('rpc_list_workspace_members', {
    p_workspace_id: workspaceId,
  });

  if (error) {
    // Fallback query if RPC unavailable
    const fb = await supabase
      .from('workspace_members')
      .select('user_id, role')
      .eq('workspace_id', workspaceId);
    if (fb.error) return [];
    return fb.data.map((m: { user_id: string; role: string }) => ({
      user_id: m.user_id,
      username: m.user_id.slice(0, 8),
      role: m.role,
    }));
  }

  return (data || []) as Array<{ user_id: string; username: string; role: string }>;
}
