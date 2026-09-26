import ExcelJS from 'exceljs';
import type { SupabaseClient } from '@supabase/supabase-js';

export const CSV_EXPORT_TYPES = [
  'applications', 'interviews', 'rejections', 'follow_ups', 'networking',
  'reminders', 'goals', 'tasks', 'habits', 'notes', 'resume-analytics',
  'aging', 'stage-duration',
] as const;
export type CsvExportType = (typeof CSV_EXPORT_TYPES)[number];

const CSV_FIELDS: Record<CsvExportType, string[]> = {
  applications: ['id', 'owner_id', 'company', 'job_title', 'stage', 'status', 'outcome', 'priority', 'date_applied', 'source', 'job_url', 'location', 'work_arrangement', 'employment_type', 'salary_min', 'salary_max', 'salary_currency', 'next_action', 'next_action_date', 'last_response_date', 'external_job_id', 'tags', 'pinned', 'important', 'favorite', 'notes', 'created_at', 'updated_at'],
  interviews: ['id', 'owner_id', 'application_id', 'round_number', 'interview_type', 'scheduled_at', 'duration_minutes', 'format', 'location_or_link', 'interviewer_names', 'outcome', 'feedback_notes', 'next_step', 'thank_you_status'],
  rejections: ['id', 'owner_id', 'company', 'job_title', 'outcome', 'closure_reason', 'closure_notes', 'closed_at', 'date_applied'],
  follow_ups: ['id', 'owner_id', 'application_id', 'contact_id', 'interview_id', 'title', 'details', 'due_date', 'due_at', 'priority', 'status', 'completed_at'],
  networking: ['id', 'owner_id', 'company_name', 'full_name', 'job_title', 'relationship_type', 'email', 'phone', 'linkedin_url', 'next_follow_up_date', 'notes', 'tags'],
  reminders: ['id', 'owner_id', 'application_id', 'contact_id', 'interview_id', 'title', 'details', 'due_date', 'due_at', 'priority', 'status', 'completed_at', 'recurrence_rule'],
  goals: ['id', 'owner_id', 'period_type', 'target_applications', 'target_outreach', 'effective_date', 'created_at', 'updated_at'],
  tasks: ['id', 'owner_id', 'task_type', 'application_id', 'contact_id', 'interview_id', 'title', 'details', 'due_date', 'due_at', 'priority', 'status', 'completed_at', 'recurrence_rule'],
  habits: ['id', 'owner_id', 'title', 'description', 'frequency', 'target_count', 'unit_label', 'is_active', 'archived_at', 'created_at', 'updated_at'],
  notes: ['application_id', 'owner_id', 'company', 'job_title', 'notes', 'updated_at'],
  'resume-analytics': ['resume_id', 'owner_id', 'name', 'version_label', 'document_type', 'applications', 'responses', 'interviews', 'offers', 'acceptances'],
  aging: ['application_id', 'owner_id', 'company', 'job_title', 'stage', 'date_applied', 'last_activity_at', 'days_inactive', 'aging_category', 'next_action', 'next_action_date'],
  'stage-duration': ['event_id', 'application_id', 'actor_id', 'old_stage', 'new_stage', 'changed_at', 'notes'],
};

export function safeCell(value: unknown): string {
  const text = value == null ? '' : Array.isArray(value) || typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

export function csvEscape(value: unknown): string {
  return `"${safeCell(value).replaceAll('"', '""')}"`;
}

export function rowsToCsv(type: CsvExportType, rows: Record<string, unknown>[]): string {
  const fields = CSV_FIELDS[type];
  return [`\ufeff${fields.map(csvEscape).join(',')}`, ...rows.map((row) => fields.map((field) => csvEscape(row[field])).join(','))].join('\r\n');
}

function remap(row: Record<string, unknown>, aliases: Record<string, string> = {}): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [aliases[key] ?? key, value]));
}

async function queryOwned(
  client: SupabaseClient,
  table: string,
  workspaceId: string,
  ownerId: string | null,
  extra?: (query: ReturnType<ReturnType<SupabaseClient['from']>['select']>) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Record<string, unknown>[]> {
  const baseQuery = client.from(table).select('*').eq('workspace_id', workspaceId);
  const filteredQuery = ownerId ? baseQuery.eq('user_id', ownerId) : baseQuery;
  const { data, error } = extra ? await extra(filteredQuery) : await filteredQuery;
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

export async function fetchExportRows(
  client: SupabaseClient,
  workspaceId: string,
  ownerId: string | null,
  type: CsvExportType,
): Promise<Record<string, unknown>[]> {
  if (type === 'applications' || type === 'rejections' || type === 'notes' || type === 'aging') {
    const rows = await queryOwned(client, 'applications', workspaceId, ownerId, (q) => q.order('created_at'));
    if (type === 'applications') return rows.map((row) => remap(row, { user_id: 'owner_id', company_name: 'company', role_title: 'job_title', applied_at: 'date_applied' }));
    if (type === 'rejections') return rows.filter((row) => row.outcome === 'REJECTED').map((row) => ({
      id: row.id, owner_id: row.user_id, company: row.company_name, job_title: row.role_title,
      outcome: row.outcome, closure_reason: row.closure_reason, closure_notes: row.closure_notes,
      closed_at: row.closed_at, date_applied: String(row.applied_at ?? '').slice(0, 10),
    }));
    if (type === 'notes') return rows.filter((row) => row.notes).map((row) => ({
      application_id: row.id, owner_id: row.user_id, company: row.company_name,
      job_title: row.role_title, notes: row.notes, updated_at: row.updated_at,
    }));
    const now = Date.now();
    return rows.map((row) => {
      const days = Math.max(0, Math.floor((now - Date.parse(String(row.last_activity_at))) / 86_400_000));
      return {
        application_id: row.id, owner_id: row.user_id, company: row.company_name,
        job_title: row.role_title, stage: row.stage,
        date_applied: String(row.applied_at ?? '').slice(0, 10), last_activity_at: row.last_activity_at,
        days_inactive: days, aging_category: days >= 31 ? 'LONG_WAITING' : days >= 15 ? 'STALE' : 'CURRENT',
        next_action: row.next_action, next_action_date: row.next_action_date,
      };
    }).sort((a, b) => Number(b.days_inactive) - Number(a.days_inactive));
  }
  if (type === 'interviews') return (await queryOwned(client, 'interviews', workspaceId, ownerId)).map((row) => remap(row, { user_id: 'owner_id' }));
  if (type === 'networking') return (await queryOwned(client, 'contacts', workspaceId, ownerId)).map((row) => remap(row, { user_id: 'owner_id' }));
  if (type === 'goals') return (await queryOwned(client, 'goals', workspaceId, ownerId)).map((row) => remap(row, { user_id: 'owner_id' }));
  if (type === 'habits') return (await queryOwned(client, 'habits', workspaceId, ownerId)).map((row) => remap(row, { user_id: 'owner_id' }));
  if (type === 'tasks' || type === 'follow_ups' || type === 'reminders') {
    const taskType = type === 'follow_ups' ? 'FOLLOW_UP' : type === 'reminders' ? 'REMINDER' : null;
    const rows = await queryOwned(client, 'tasks', workspaceId, ownerId, taskType ? (q) => q.eq('task_type', taskType) : undefined);
    return rows.map((row) => remap(row, { user_id: 'owner_id' }));
  }
  if (type === 'stage-duration') {
    const query = client.from('application_events').select('*').eq('workspace_id', workspaceId).eq('event_type', 'STAGE_CHANGED').order('created_at');
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const visibleApps = new Set((await queryOwned(client, 'applications', workspaceId, ownerId)).map((row) => row.id));
    return ((data ?? []) as Record<string, unknown>[]).filter((row) => visibleApps.has(row.application_id)).map((row) => {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      return { event_id: row.id, application_id: row.application_id, actor_id: row.actor_id, old_stage: payload.old_stage, new_stage: payload.new_stage, changed_at: row.created_at, notes: payload.notes };
    });
  }
  const resumes = await queryOwned(client, 'resumes', workspaceId, ownerId);
  const applications = await queryOwned(client, 'applications', workspaceId, ownerId);
  const visibleIds = new Set(applications.map((row) => row.id));
  const { data: links, error } = await client.from('application_documents').select('application_id,resume_id').eq('workspace_id', workspaceId).not('resume_id', 'is', null);
  if (error) throw new Error(error.message);
  return resumes.map((resume) => {
    const appIds = new Set(((links ?? []) as Record<string, unknown>[]).filter((link) => link.resume_id === resume.id && visibleIds.has(link.application_id)).map((link) => link.application_id));
    const apps = applications.filter((app) => appIds.has(app.id));
    return {
      resume_id: resume.id, owner_id: resume.user_id, name: resume.name,
      version_label: resume.version_label, document_type: resume.document_type,
      applications: apps.length, responses: apps.filter((app) => app.last_response_date).length,
      interviews: apps.filter((app) => ['INTERVIEW', 'FINAL_INTERVIEW', 'OFFER'].includes(String(app.stage)) || app.outcome === 'ACCEPTED').length,
      offers: apps.filter((app) => app.stage === 'OFFER' || app.outcome === 'ACCEPTED').length,
      acceptances: apps.filter((app) => app.outcome === 'ACCEPTED').length,
    };
  });
}

export async function buildApplicationsWorkbook(rows: Record<string, unknown>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'JobQuest 2.0';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Applications', { views: [{ state: 'frozen', ySplit: 1 }] });
  const fields = CSV_FIELDS.applications;
  sheet.columns = fields.map((field) => ({ header: field, key: field, width: Math.min(40, Math.max(12, field.length + 2)) }));
  for (const row of rows) sheet.addRow(Object.fromEntries(fields.map((field) => [field, safeCell(row[field])])));
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(fields.length).letter}1` };
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    cell.alignment = { vertical: 'middle' };
  });
  sheet.getRow(1).height = 22;
  for (const field of ['company', 'job_title', 'location', 'next_action', 'notes']) {
    const column = sheet.getColumn(field);
    column.width = field === 'notes' ? 40 : 24;
  }
  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
}

export async function buildJsonArchive(
  client: SupabaseClient,
  workspaceId: string,
  ownerId: string | null,
): Promise<Record<string, unknown>> {
  const entries = await Promise.all(CSV_EXPORT_TYPES.map(async (type) => [type, await fetchExportRows(client, workspaceId, ownerId, type)] as const));
  return {
    export_version: 2,
    exported_at: new Date().toISOString(),
    workspace_id: workspaceId,
    owner_scope: ownerId ?? 'ALL',
    restore_supported: false,
    data: Object.fromEntries(entries),
  };
}
