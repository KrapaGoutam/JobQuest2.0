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
import { buildSearchFilter, agingRange, type AgingFilter, type ApplicationSort } from '../types/applications';

/*
 * Applications data layer (M3). Hybrid contract (Gate 03 RPC_DOMAIN_OPERATIONS §1):
 *  - reads and simple field edits: direct Data API under RLS;
 *  - lifecycle changes (stage, outcome, archive, restore, keep active): atomic RPCs,
 *    which also append the application_events history. The database rejects direct
 *    lifecycle writes (migration 20260924310000), and CREATED / CAPTURED events are
 *    written by triggers, never by the client.
 */

export interface ApplicationFilters {
  stage?: string;
  status?: string;
  outcome?: string;
  priority?: string;
  aging?: AgingFilter;
  archiveState?: 'active' | 'archived' | 'all';
  ownerId?: string;
  search?: string;
}

export type { ApplicationSort } from '../types/applications';

export interface FetchApplicationsResult {
  applications: Application[];
  totalCount: number;
}

export const PAGE_SIZE = 50;

/**
 * Fetch one page of applications under RLS, with server-side filtering, sorting and pagination.
 */
export async function fetchApplications(
  workspaceId: string,
  filters: ApplicationFilters = {},
  sort: ApplicationSort = { field: 'last_activity_at', direction: 'desc' },
  page = 0,
  pageSize = PAGE_SIZE
): Promise<FetchApplicationsResult> {
  let query = supabase
    .from('applications')
    .select('*, job_snapshots(*)', { count: 'exact' })
    .eq('workspace_id', workspaceId);

  if (filters.archiveState === 'archived') {
    query = query.not('archived_at', 'is', null);
  } else if (filters.archiveState !== 'all') {
    query = query.is('archived_at', null);
  }
  if (filters.stage && filters.stage !== 'ALL') query = query.eq('stage', filters.stage);
  if (filters.status && filters.status !== 'ALL') query = query.eq('status', filters.status);
  if (filters.outcome && filters.outcome !== 'ALL') query = query.eq('outcome', filters.outcome);
  if (filters.priority && filters.priority !== 'ALL') query = query.eq('priority', filters.priority);
  if (filters.ownerId && filters.ownerId !== 'ALL') query = query.eq('user_id', filters.ownerId);

  if (filters.aging && filters.aging !== 'ALL') {
    // Aging bands apply to OPEN applications only (Gate 02B §4.5).
    const range = agingRange(filters.aging, new Date());
    query = query.eq('status', 'OPEN').lte('last_activity_at', range.to);
    if (range.from) query = query.gt('last_activity_at', range.from);
  }

  const orFilter = buildSearchFilter(filters.search ?? '');
  if (orFilter) query = query.or(orFilter);

  // Stable ordering: requested column, then id as a tie-breaker so pages never overlap.
  query = query.order(sort.field, { ascending: sort.direction === 'asc' }).order('id', { ascending: true });

  const from = page * pageSize;
  query = query.range(from, from + pageSize - 1);

  const { data, count, error } = await query;
  if (error) throw error;

  const applications = (data ?? []).map((row: Record<string, unknown>) => withSnapshot(row));
  return { applications, totalCount: count ?? applications.length };
}

function withSnapshot(row: Record<string, unknown>): Application {
  const snaps = row.job_snapshots;
  const job_snapshot = Array.isArray(snaps) ? (snaps[0] ?? null) : (snaps ?? null);
  const rest = { ...row };
  delete rest.job_snapshots;
  return { ...rest, job_snapshot } as Application;
}

/**
 * Per-stage counts for the stage filter pills, using every active filter except the stage
 * itself, so the counts describe the whole result set rather than the loaded page.
 */
export async function fetchStageCounts(
  workspaceId: string,
  stageIds: string[],
  filters: ApplicationFilters
): Promise<Record<string, number>> {
  const counts = await Promise.all(
    stageIds.map(async (stage) => {
      let q = supabase.from('applications').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('stage', stage);
      if (filters.archiveState === 'archived') q = q.not('archived_at', 'is', null);
      else if (filters.archiveState !== 'all') q = q.is('archived_at', null);
      if (filters.status && filters.status !== 'ALL') q = q.eq('status', filters.status);
      if (filters.outcome && filters.outcome !== 'ALL') q = q.eq('outcome', filters.outcome);
      if (filters.priority && filters.priority !== 'ALL') q = q.eq('priority', filters.priority);
      if (filters.ownerId && filters.ownerId !== 'ALL') q = q.eq('user_id', filters.ownerId);
      if (filters.aging && filters.aging !== 'ALL') {
        const range = agingRange(filters.aging, new Date());
        q = q.eq('status', 'OPEN').lte('last_activity_at', range.to);
        if (range.from) q = q.gt('last_activity_at', range.from);
      }
      const orFilter = buildSearchFilter(filters.search ?? '');
      if (orFilter) q = q.or(orFilter);
      const { count, error } = await q;
      if (error) throw error;
      return [stage, count ?? 0] as const;
    })
  );
  return Object.fromEntries(counts);
}

/** Counts of quiet OPEN applications across the whole workspace (not just the loaded page). */
export async function fetchAgingCounts(workspaceId: string): Promise<{ stale: number; longWaiting: number }> {
  const now = new Date();
  const count = async (band: 'STALE' | 'LONG_WAITING') => {
    const range = agingRange(band, now);
    let q = supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'OPEN')
      .is('archived_at', null)
      .lte('last_activity_at', range.to);
    if (range.from) q = q.gt('last_activity_at', range.from);
    const { count: n, error } = await q;
    if (error) throw error;
    return n ?? 0;
  };
  const [stale, longWaiting] = await Promise.all([count('STALE'), count('LONG_WAITING')]);
  return { stale, longWaiting };
}

/** Fetch a single application (with its snapshot); null when not visible under RLS. */
export async function fetchApplicationDetail(applicationId: string): Promise<Application | null> {
  const { data, error } = await supabase
    .from('applications')
    .select('*, job_snapshots(*)')
    .eq('id', applicationId)
    .maybeSingle();
  if (error) throw error;
  return data ? withSnapshot(data as Record<string, unknown>) : null;
}

/** Chronological history (newest first) from the append-only application_events table. */
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
  source?: string | null;
  tags?: string[];
  notes?: string | null;
  next_action?: string | null;
  next_action_date?: string | null;
  duplicate_override_flag?: boolean;
  resume_id?: string | null;
  snapshot?: {
    job_description?: string;
    requirements?: string;
    skills?: string;
  };
}

export interface CreateApplicationResult {
  application: Application;
  /** Set when the application was saved but its posting snapshot could not be captured. */
  snapshotError: string | null;
}

/**
 * Create an application (starts OPEN, unarchived). The database trigger records the
 * CREATED event, and a CAPTURED event when a posting snapshot is stored.
 */
export async function createApplication(payload: CreateApplicationPayload): Promise<CreateApplicationResult> {
  const { snapshot, resume_id, ...appData } = payload;

  const { data, error } = await supabase
    .from('applications')
    .insert({
      ...appData,
      stage: appData.stage ?? 'APPLIED',
      priority: appData.priority ?? 'MEDIUM',
    })
    .select('*')
    .single();
  if (error) throw error;
  const application = data as Application;

  let snapshotError: string | null = null;
  if (snapshot && (snapshot.job_description || snapshot.requirements || snapshot.skills)) {
    const snap = await supabase
      .from('job_snapshots')
      .insert({
        application_id: application.id,
        workspace_id: application.workspace_id,
        job_description: snapshot.job_description ?? null,
        requirements: snapshot.requirements ?? null,
        skills: snapshot.skills ?? null,
        raw_payload: { source: 'manual_form', version: 1 },
      })
      .select('*')
      .single();
    if (snap.error) snapshotError = snap.error.message;
    else application.job_snapshot = snap.data;
  }

  if (resume_id) {
    try {
      await supabase.rpc('rpc_link_application_document', {
        p_application_id: application.id,
        p_resume_id: resume_id,
        p_document_type: 'RESUME',
      });
    } catch {
      // non-fatal
    }
  }

  return { application, snapshotError };
}

/** Fields a client may edit directly. Lifecycle fields are excluded (RPC only). */
export type EditableApplicationFields = Pick<
  Application,
  | 'company_name' | 'role_title' | 'job_url' | 'external_job_id' | 'priority' | 'location'
  | 'work_arrangement' | 'employment_type' | 'salary_min' | 'salary_max' | 'salary_currency'
  | 'next_action' | 'next_action_date' | 'tags' | 'notes'
>;

/**
 * Update simple fields. Does not touch last_activity_at: aging measures time since the
 * last timeline activity (Gate 02B §4.5), and a metadata edit is not a timeline event.
 */
export async function updateApplication(
  applicationId: string,
  updates: Partial<EditableApplicationFields>
): Promise<Application> {
  const { data, error } = await supabase
    .from('applications')
    .update(updates)
    .eq('id', applicationId)
    .select('*')
    .single();
  if (error) throw error;
  return data as Application;
}

/** Atomic RPC: move to a new stage (never changes OPEN/CLOSED state). */
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

/** Atomic RPC: close with a terminal outcome (closure reason required for WITHDRAWN only). */
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

/** Atomic RPC: explicit "Keep Active" review (resets aging; no stage/state change). */
export async function keepApplicationActive(applicationId: string): Promise<{ id: string; last_activity_at: string }> {
  const { data, error } = await supabase.rpc('rpc_keep_application_active', { p_application_id: applicationId });
  if (error) throw error;
  return data;
}

/** Atomic RPC: soft archive. */
export async function archiveApplication(applicationId: string): Promise<{ id: string; archived_at: string }> {
  const { data, error } = await supabase.rpc('rpc_archive_application', { p_application_id: applicationId });
  if (error) throw error;
  return data;
}

/** Atomic RPC: restore from archive. */
export async function restoreApplication(applicationId: string): Promise<{ id: string; archived_at: null }> {
  const { data, error } = await supabase.rpc('rpc_restore_application', { p_application_id: applicationId });
  if (error) throw error;
  return data;
}

/** Atomic RPC: 3-tier duplicate detection (only records the caller may see are compared). */
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

const FALLBACK_WORKFLOW: CanonicalWorkflow = {
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

/** Canonical workflow (workspace override if present, else the system default). */
export async function fetchCanonicalWorkflow(workspaceId?: string | null): Promise<CanonicalWorkflow> {
  const { data, error } = await supabase
    .from('workflow_definitions')
    .select('workspace_id, is_default, stages, outcomes, closure_reasons');
  if (error) throw error;
  const rows = (data ?? []) as (CanonicalWorkflow & { workspace_id: string | null; is_default: boolean })[];
  const def = rows.find((d) => workspaceId && d.workspace_id === workspaceId) ?? rows.find((d) => d.is_default);
  if (!def) return FALLBACK_WORKFLOW;
  return { stages: def.stages, outcomes: def.outcomes, closure_reasons: def.closure_reasons };
}

export interface WorkspaceMemberInfo {
  user_id: string;
  role: string;
  username: string;
  display_name: string | null;
}

/** Workspace roster (members only; user_accounts itself is not reachable from the Data API). */
export async function fetchWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberInfo[]> {
  const { data, error } = await supabase.rpc('rpc_list_workspace_members', { p_workspace_id: workspaceId });
  if (error) throw error;
  return (data ?? []) as WorkspaceMemberInfo[];
}
