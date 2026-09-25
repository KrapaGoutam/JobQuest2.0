import { supabase } from '../supabase';
import type {
  Application,
  ApplicationStage,
  ApplicationOutcome,
  ClosureReason,
  ApplicationPriority,
  WorkArrangement,
  EmploymentType,
  DuplicateCheckResult,
  CanonicalWorkflow,
  ApplicationEvent,
} from '../types/applications';

export interface ApplicationFilters {
  stage?: string;
  status?: string;
  outcome?: string;
  priority?: string;
  agingBand?: string;
  archiveState?: 'active' | 'archived' | 'all';
  ownerId?: string;
  search?: string;
}

export interface ApplicationSort {
  field: keyof Application | 'company_name' | 'role_title' | 'stage' | 'priority' | 'applied_at' | 'last_activity_at';
  direction: 'asc' | 'desc';
}

export interface FetchApplicationsResult {
  applications: Application[];
  totalCount: number;
}

/**
 * Fetch applications from PostgREST under RLS with server-side filtering, sorting & pagination.
 */
export async function fetchApplications(
  workspaceId: string,
  filters: ApplicationFilters = {},
  sort: ApplicationSort = { field: 'last_activity_at', direction: 'desc' },
  page = 0,
  pageSize = 50
): Promise<FetchApplicationsResult> {
  let query = supabase
    .from('applications')
    .select('*, job_snapshots(*)', { count: 'exact' })
    .eq('workspace_id', workspaceId);

  // Archive filtering
  if (filters.archiveState === 'archived') {
    query = query.not('archived_at', 'is', null);
  } else if (filters.archiveState === 'all') {
    // Include both
  } else {
    // Default: active only
    query = query.is('archived_at', null);
  }

  // Stage filter
  if (filters.stage && filters.stage !== 'ALL') {
    query = query.eq('stage', filters.stage);
  }

  // Status & outcome filter
  if (filters.status && filters.status !== 'ALL') {
    query = query.eq('status', filters.status);
  }
  if (filters.outcome && filters.outcome !== 'ALL') {
    query = query.eq('outcome', filters.outcome);
  }

  // Priority filter
  if (filters.priority && filters.priority !== 'ALL') {
    query = query.eq('priority', filters.priority);
  }

  // Manager owner filter
  if (filters.ownerId && filters.ownerId !== 'ALL') {
    query = query.eq('user_id', filters.ownerId);
  }

  // Search filter across text columns
  if (filters.search && filters.search.trim().length > 0) {
    const s = filters.search.trim();
    query = query.or(`company_name.ilike.%${s}%,role_title.ilike.%${s}%,location.ilike.%${s}%,notes.ilike.%${s}%`);
  }

  // Sorting
  query = query.order(sort.field, { ascending: sort.direction === 'asc' });

  // Pagination
  const from = page * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) throw error;

  const applications = (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    job_snapshot: Array.isArray(row.job_snapshots) ? (row.job_snapshots[0] as unknown) ?? null : (row.job_snapshots as unknown) ?? null,
  })) as Application[];

  return {
    applications,
    totalCount: count ?? applications.length,
  };
}

/**
 * Fetch a single application detail with its job snapshot.
 */
export async function fetchApplicationDetail(applicationId: string): Promise<Application | null> {
  const { data, error } = await supabase
    .from('applications')
    .select('*, job_snapshots(*)')
    .eq('id', applicationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    ...data,
    job_snapshot: Array.isArray(data.job_snapshots) ? data.job_snapshots[0] ?? null : data.job_snapshots ?? null,
  } as Application;
}

/**
 * Fetch chronological event history for an application.
 */
export async function fetchApplicationEvents(applicationId: string): Promise<ApplicationEvent[]> {
  const { data, error } = await supabase
    .from('application_events')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as ApplicationEvent[];
}

export interface CreateApplicationPayload {
  workspace_id: string;
  user_id: string;
  company_name: string;
  role_title: string;
  stage?: ApplicationStage;
  priority?: ApplicationPriority;
  location?: string | null;
  work_arrangement?: WorkArrangement | null;
  employment_type?: EmploymentType | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string;
  job_url?: string | null;
  external_job_id?: string | null;
  tags?: string[];
  notes?: string | null;
  next_action?: string | null;
  next_action_date?: string | null;
  duplicate_override_flag?: boolean;
  snapshot?: {
    job_description?: string;
    requirements?: string;
    skills?: string;
  };
}

/**
 * Create a new application and optionally capture its job snapshot.
 */
export async function createApplication(payload: CreateApplicationPayload): Promise<Application> {
  const { snapshot, ...appData } = payload;

  const { data, error } = await supabase
    .from('applications')
    .insert({
      ...appData,
      stage: appData.stage ?? 'APPLIED',
      priority: appData.priority ?? 'MEDIUM',
      status: 'OPEN',
      applied_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) throw error;
  const createdApp = data as Application;

  // Insert job snapshot if provided
  if (snapshot && (snapshot.job_description || snapshot.requirements || snapshot.skills)) {
    const { data: snapData } = await supabase
      .from('job_snapshots')
      .insert({
        application_id: createdApp.id,
        workspace_id: createdApp.workspace_id,
        job_description: snapshot.job_description ?? null,
        requirements: snapshot.requirements ?? null,
        skills: snapshot.skills ?? null,
      })
      .select('*')
      .single();

    createdApp.job_snapshot = snapData;
  }

  // Insert initial CREATED / APPLIED event
  await supabase.from('application_events').insert({
    application_id: createdApp.id,
    workspace_id: createdApp.workspace_id,
    actor_id: createdApp.user_id,
    event_type: 'CREATED',
    payload: {
      company: createdApp.company_name,
      role: createdApp.role_title,
      stage: createdApp.stage,
    },
  });

  return createdApp;
}

/**
 * Update an existing application's fields.
 */
export async function updateApplication(
  applicationId: string,
  updates: Partial<Application>,
  snapshotUpdates?: { job_description?: string; requirements?: string; skills?: string }
): Promise<Application> {
  const { data, error } = await supabase
    .from('applications')
    .update({
      ...updates,
      last_activity_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicationId)
    .select('*')
    .single();

  if (error) throw error;
  const updatedApp = data as Application;

  if (snapshotUpdates) {
    const { data: existingSnap } = await supabase
      .from('job_snapshots')
      .select('id')
      .eq('application_id', applicationId)
      .maybeSingle();

    if (existingSnap) {
      await supabase
        .from('job_snapshots')
        .update(snapshotUpdates)
        .eq('application_id', applicationId);
    } else {
      await supabase.from('job_snapshots').insert({
        application_id: applicationId,
        workspace_id: updatedApp.workspace_id,
        ...snapshotUpdates,
      });
    }
  }

  return updatedApp;
}

/**
 * Atomic RPC: Transition application to a new stage.
 */
export async function moveApplicationStage(
  applicationId: string,
  newStage: ApplicationStage,
  notes?: string
): Promise<{ id: string; old_stage: string; new_stage: string }> {
  const { data, error } = await supabase.rpc('rpc_move_application_stage', {
    p_application_id: applicationId,
    p_new_stage: newStage,
    p_notes: notes ?? null,
  });

  if (error) throw error;
  return data;
}

/**
 * Atomic RPC: Close application with an outcome and optional closure reason.
 */
export async function setApplicationOutcome(
  applicationId: string,
  outcome: ApplicationOutcome,
  closureReason?: ClosureReason | null,
  closureNotes?: string | null
): Promise<{ id: string; status: string; outcome: string }> {
  const { data, error } = await supabase.rpc('rpc_set_application_outcome', {
    p_application_id: applicationId,
    p_outcome: outcome,
    p_closure_reason: closureReason ?? null,
    p_closure_notes: closureNotes ?? null,
  });

  if (error) throw error;
  return data;
}

/**
 * Atomic RPC: Refresh application activity timestamp without altering stage or outcome.
 */
export async function keepApplicationActive(applicationId: string): Promise<{ id: string; last_activity_at: string }> {
  const { data, error } = await supabase.rpc('rpc_keep_application_active', {
    p_application_id: applicationId,
  });

  if (error) throw error;
  return data;
}

/**
 * Atomic RPC: Soft archive application.
 */
export async function archiveApplication(applicationId: string): Promise<{ id: string; archived_at: string }> {
  const { data, error } = await supabase.rpc('rpc_archive_application', {
    p_application_id: applicationId,
  });

  if (error) throw error;
  return data;
}

/**
 * Atomic RPC: Restore soft-archived application.
 */
export async function restoreApplication(applicationId: string): Promise<{ id: string; archived_at: null }> {
  const { data, error } = await supabase.rpc('rpc_restore_application', {
    p_application_id: applicationId,
  });

  if (error) throw error;
  return data;
}

/**
 * Atomic RPC: 3-tier duplicate detection check.
 */
export async function checkApplicationDuplicate(
  workspaceId: string,
  companyName: string,
  roleTitle: string,
  jobUrl?: string | null,
  externalJobId?: string | null
): Promise<DuplicateCheckResult> {
  const { data, error } = await supabase.rpc('rpc_check_application_duplicate', {
    p_workspace_id: workspaceId,
    p_company_name: companyName,
    p_role_title: roleTitle,
    p_job_url: jobUrl ?? null,
    p_external_job_id: externalJobId ?? null,
  });

  if (error) throw error;
  return (data ?? { tier: 'NONE', matches: [] }) as DuplicateCheckResult;
}

/**
 * Fetch canonical workflow definition (stages, outcomes, closure reasons).
 */
export async function fetchCanonicalWorkflow(workspaceId?: string | null): Promise<CanonicalWorkflow> {
  let query = supabase.from('workflow_definitions').select('*');
  if (workspaceId) {
    query = query.or(`workspace_id.eq.${workspaceId},is_default.eq.true`);
  } else {
    query = query.eq('is_default', true);
  }

  const { data, error } = await query;
  if (error) throw error;

  const def = (data ?? []).find((d: Record<string, unknown>) => d.workspace_id === workspaceId) ?? data?.[0];
  if (!def) {
    // Fallback to default canonical spec
    return {
      stages: [
        { id: 'SAVED', label: 'Saved', order: 1 },
        { id: 'PREPARING', label: 'Preparing', order: 2 },
        { id: 'APPLIED', label: 'Applied', order: 3 },
        { id: 'ASSESSMENT', label: 'Assessment', order: 4 },
        { id: 'RECRUITER_SCREEN', label: 'Recruiter Screen', order: 5 },
        { id: 'INTERVIEW', label: 'Interview', order: 6 },
        { id: 'FINAL_INTERVIEW', label: 'Final Interview', order: 7 },
        { id: 'OFFER', label: 'Offer', order: 8 },
      ],
      outcomes: [
        { id: 'ACCEPTED', label: 'Accepted', terminal_state: 'CLOSED' },
        { id: 'REJECTED', label: 'Rejected', terminal_state: 'CLOSED' },
        { id: 'WITHDRAWN', label: 'Withdrawn', terminal_state: 'CLOSED' },
        { id: 'GHOSTED', label: 'Ghosted', terminal_state: 'CLOSED' },
        { id: 'POSITION_CLOSED', label: 'Position Closed', terminal_state: 'CLOSED' },
      ],
      closure_reasons: [
        { id: 'OFFER_DECLINED', label: 'Offer declined', for_outcome: 'WITHDRAWN' },
        { id: 'GENERAL_WITHDRAWAL', label: 'Withdrew', for_outcome: 'WITHDRAWN' },
        { id: 'COMPENSATION_MISMATCH', label: 'Compensation mismatch', for_outcome: 'WITHDRAWN' },
        { id: 'LOCATION_UNSUITABLE', label: 'Location unsuitable', for_outcome: 'WITHDRAWN' },
        { id: 'OTHER', label: 'Other', for_outcome: 'WITHDRAWN' },
      ],
    };
  }

  return {
    stages: def.stages,
    outcomes: def.outcomes,
    closure_reasons: def.closure_reasons,
  };
}

export interface WorkspaceMemberInfo {
  user_id: string;
  role: string;
  username: string;
  display_name: string | null;
}

/**
 * Fetch workspace members for manager filtering.
 */
export async function fetchWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberInfo[]> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('user_id, role, user_accounts(username, profiles(display_name))')
    .eq('workspace_id', workspaceId);

  if (error) return [];
  return (data ?? []).map((row: Record<string, unknown>): WorkspaceMemberInfo => {
    const acc = (Array.isArray(row.user_accounts) ? row.user_accounts[0] : row.user_accounts) as Record<string, unknown> | undefined;
    const prof = (Array.isArray(acc?.profiles) ? acc.profiles[0] : acc?.profiles) as Record<string, unknown> | undefined;
    return {
      user_id: String(row.user_id),
      role: String(row.role),
      username: typeof acc?.username === 'string' ? acc.username : 'Member',
      display_name: typeof prof?.display_name === 'string' ? prof.display_name : null,
    };
  });
}
