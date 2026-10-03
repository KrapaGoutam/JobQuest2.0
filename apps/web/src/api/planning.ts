import { supabase } from '../supabase';
import type { Interview } from '../types/interviews';
import type { Task } from '../types/tasks';
import type {
  CalendarSourceData,
  PlanningApplication,
  PlanningEvent,
  TimelineSourceData,
} from '../lib/planning';

const TASK_SELECT = `
  *,
  applications(id, company_name, role_title, stage),
  contacts(id, full_name, relationship_type),
  interviews(id, interview_type, scheduled_at, round_number)
`;

const INTERVIEW_SELECT = `
  *,
  applications(id, company_name, role_title, stage, status, archived_at),
  interview_contacts(contact_id, contacts(id, full_name, relationship_type))
`;

const APPLICATION_SELECT = [
  'id',
  'workspace_id',
  'user_id',
  'company_name',
  'role_title',
  'stage',
  'status',
  'outcome',
  'closed_at',
  'next_action',
  'next_action_date',
  'applied_at',
  'archived_at',
  'created_at',
  'last_activity_at',
].join(',');

export interface PlanningRange {
  startDay: string;
  endDayExclusive: string;
  startIso: string;
  endIso: string;
  ownerId?: string;
}

function withOwner<T>(query: T, ownerId?: string): T {
  if (!ownerId) return query;
  return (query as T & { eq: (column: string, value: string) => T }).eq('user_id', ownerId);
}

/** Bounded canonical sources for the visible Calendar period. */
export async function fetchCalendarSources(workspaceId: string, range: PlanningRange): Promise<CalendarSourceData> {
  let tasks = supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('workspace_id', workspaceId)
    .or(`and(due_date.gte.${range.startDay},due_date.lt.${range.endDayExclusive}),and(due_at.gte.${range.startIso},due_at.lt.${range.endIso})`)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(1000);
  let interviews = supabase
    .from('interviews')
    .select(INTERVIEW_SELECT)
    .eq('workspace_id', workspaceId)
    .gte('scheduled_at', range.startIso)
    .lt('scheduled_at', range.endIso)
    .order('scheduled_at')
    .limit(500);
  let applications = supabase
    .from('applications')
    .select(APPLICATION_SELECT)
    .eq('workspace_id', workspaceId)
    .eq('status', 'OPEN')
    .is('archived_at', null)
    .not('next_action', 'is', null)
    .not('next_action_date', 'is', null)
    .gte('next_action_date', range.startDay)
    .lt('next_action_date', range.endDayExclusive)
    .order('next_action_date')
    .limit(500);

  tasks = withOwner(tasks, range.ownerId);
  interviews = withOwner(interviews, range.ownerId);
  applications = withOwner(applications, range.ownerId);

  const [taskResult, interviewResult, applicationResult] = await Promise.all([tasks, interviews, applications]);
  const error = taskResult.error ?? interviewResult.error ?? applicationResult.error;
  if (error) throw new Error(`Could not load Calendar: ${error.message}`);
  return {
    tasks: (taskResult.data ?? []) as Task[],
    interviews: (interviewResult.data ?? []) as Interview[],
    applications: (applicationResult.data ?? []) as unknown as PlanningApplication[],
  };
}

/** Cross-application history and real ranges for Timeline/Duration mode. */
export async function fetchTimelineSources(workspaceId: string, range: PlanningRange): Promise<TimelineSourceData> {
  let applications = supabase
    .from('applications')
    .select(APPLICATION_SELECT)
    .eq('workspace_id', workspaceId)
    .lt('created_at', range.endIso)
    .order('last_activity_at', { ascending: false })
    .limit(500);
  let events = supabase
    .from('application_events')
    .select(`*, applications!inner(id, user_id, company_name, role_title)`)
    .eq('workspace_id', workspaceId)
    .gte('created_at', range.startIso)
    .lt('created_at', range.endIso)
    .order('created_at')
    .limit(2000);
  let interviews = supabase
    .from('interviews')
    .select(INTERVIEW_SELECT)
    .eq('workspace_id', workspaceId)
    .gte('scheduled_at', new Date(Date.parse(range.startIso) - 24 * 60 * 60 * 1000).toISOString())
    .lt('scheduled_at', range.endIso)
    .order('scheduled_at')
    .limit(500);
  let tasks = supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('workspace_id', workspaceId)
    .not('application_id', 'is', null)
    .or(`and(due_date.gte.${range.startDay},due_date.lt.${range.endDayExclusive}),and(due_at.gte.${range.startIso},due_at.lt.${range.endIso})`)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(1000);

  if (range.ownerId) {
    applications = applications.eq('user_id', range.ownerId);
    events = events.eq('applications.user_id', range.ownerId);
    interviews = interviews.eq('user_id', range.ownerId);
    tasks = tasks.eq('user_id', range.ownerId);
  }

  const [applicationResult, eventResult, interviewResult, taskResult] = await Promise.all([
    applications,
    events,
    interviews,
    tasks,
  ]);
  const error = applicationResult.error ?? eventResult.error ?? interviewResult.error ?? taskResult.error;
  if (error) throw new Error(`Could not load Timeline: ${error.message}`);
  return {
    applications: (applicationResult.data ?? []) as unknown as PlanningApplication[],
    events: (eventResult.data ?? []) as unknown as PlanningEvent[],
    interviews: (interviewResult.data ?? []) as Interview[],
    tasks: (taskResult.data ?? []) as Task[],
  };
}

export type ArchiveDomain = 'applications' | 'contacts' | 'habits' | 'documents';

export interface ArchiveItem {
  id: string;
  domain: ArchiveDomain;
  title: string;
  context: string;
  archivedAt: string;
  ownerId: string;
  sourcePath: string;
}

export async function fetchArchiveItems(workspaceId: string, ownerId?: string): Promise<ArchiveItem[]> {
  let applications = supabase
    .from('applications')
    .select('id, workspace_id, user_id, company_name, role_title, stage, archived_at')
    .eq('workspace_id', workspaceId)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })
    .limit(200);
  let contacts = supabase
    .from('contacts')
    .select('id, workspace_id, user_id, full_name, company_name, relationship_type, archived_at')
    .eq('workspace_id', workspaceId)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })
    .limit(200);
  let habits = supabase
    .from('habits')
    .select('id, user_id, title, frequency, archived_at')
    .eq('workspace_id', workspaceId)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })
    .limit(100);
  let documents = supabase
    .from('resumes')
    .select('id, user_id, name, document_type, version_label, target_role, archived_at')
    .eq('workspace_id', workspaceId)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })
    .limit(200);
  if (ownerId) {
    applications = applications.eq('user_id', ownerId);
    contacts = contacts.eq('user_id', ownerId);
    habits = habits.eq('user_id', ownerId);
    documents = documents.eq('user_id', ownerId);
  }

  const [applicationResult, contactResult, habitResult, documentResult] = await Promise.all([
    applications,
    contacts,
    habits,
    documents,
  ]);
  const error = applicationResult.error ?? contactResult.error ?? habitResult.error ?? documentResult.error;
  if (error) throw new Error(`Could not load Archive: ${error.message}`);

  const items: ArchiveItem[] = [];
  for (const row of applicationResult.data ?? []) {
    if (!row.archived_at) continue;
    items.push({
      id: row.id,
      domain: 'applications',
      title: row.company_name,
      context: `${row.role_title} · ${String(row.stage).replace(/_/g, ' ')}`,
      archivedAt: row.archived_at,
      ownerId: row.user_id,
      sourcePath: `/w/${encodeURIComponent(row.workspace_id)}/applications/${encodeURIComponent(row.id)}`,
    });
  }
  for (const row of contactResult.data ?? []) {
    if (!row.archived_at) continue;
    items.push({
      id: row.id,
      domain: 'contacts',
      title: row.full_name,
      context: [row.company_name, String(row.relationship_type).replace(/_/g, ' ')].filter(Boolean).join(' · '),
      archivedAt: row.archived_at,
      ownerId: row.user_id,
      sourcePath: `/w/${encodeURIComponent(row.workspace_id)}/contacts/${encodeURIComponent(row.id)}`,
    });
  }
  for (const row of habitResult.data ?? []) {
    if (!row.archived_at) continue;
    items.push({
      id: row.id,
      domain: 'habits',
      title: row.title,
      context: String(row.frequency).replace(/_/g, ' '),
      archivedAt: row.archived_at,
      ownerId: row.user_id,
      sourcePath: '/habits',
    });
  }
  for (const row of documentResult.data ?? []) {
    if (!row.archived_at) continue;
    items.push({
      id: row.id,
      domain: 'documents',
      title: row.name,
      context: [String(row.document_type).replace(/_/g, ' '), row.version_label, row.target_role].filter(Boolean).join(' · '),
      archivedAt: row.archived_at,
      ownerId: row.user_id,
      sourcePath: '/resumes',
    });
  }
  return items.sort((left, right) => right.archivedAt.localeCompare(left.archivedAt));
}
