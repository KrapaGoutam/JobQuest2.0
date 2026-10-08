// AI-3: bounded, READ-ONLY application reads for the MCP layer.
//
// Runs AS THE CALLER through RLS (a short-lived user token, same pattern as
// aiReadService), never the service-role client, so the existing applications
// policies (owner, plus ACTIVE manager visibility) stay the single authority.
// `workspaceId` is a narrowing filter chosen by trusted server code. Foreign or
// invisible ids are indistinguishable from missing ones (NOT_FOUND).
//
// The DTO is deliberately narrow for AI workflows: no notes, closure notes,
// salary, duplicate flags, raw job snapshots or workspace ids.
import { userClient } from '../lib/db';

export const APP_READ_DEFAULT_PAGE_SIZE = 20;
export const APP_READ_MAX_PAGE_SIZE = 50;
export const APP_READ_MAX_PAGE = 500;
export const APP_SEARCH_MAX_LENGTH = 64;

export const APPLICATION_STAGES = ['SAVED', 'PREPARING', 'APPLIED', 'ASSESSMENT', 'RECRUITER_SCREEN', 'INTERVIEW', 'FINAL_INTERVIEW', 'OFFER'] as const;
export const APPLICATION_STATUSES = ['OPEN', 'CLOSED'] as const;

export interface AppReadContext {
  workspaceId: string;
  /** Short-lived user token minted for the resolved principal; reads run under RLS as this user. */
  accessToken?: string;
}
export type AppReadClient = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
export interface AppReadDeps { client?: AppReadClient }

export interface ApplicationListFilters {
  status?: (typeof APPLICATION_STATUSES)[number];
  stage?: (typeof APPLICATION_STAGES)[number];
  /** Free text matched against company and role only. */
  search?: string;
}
export interface ApplicationPageRequest { page?: number; pageSize?: number }

export interface ApplicationDto {
  id: string;
  ownerId: string;
  companyName: string;
  roleTitle: string;
  stage: string;
  status: string;
  outcome: string | null;
  priority: string;
  location: string | null;
  workArrangement: string | null;
  employmentType: string | null;
  jobUrl: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  appliedAt: string | null;
  lastActivityAt: string;
  createdAt: string;
}
export interface ApplicationPage { items: ApplicationDto[]; page: number; pageSize: number; hasNext: boolean }

export type AppReadErrorCode = 'INVALID_CONTEXT' | 'INVALID_FILTER' | 'NOT_FOUND' | 'FORBIDDEN' | 'READ_FAILED';
export type AppReadResult<T> = { ok: true; data: T } | { ok: false; error: { code: AppReadErrorCode; message: string } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MESSAGES: Record<AppReadErrorCode, string> = {
  INVALID_CONTEXT: 'Invalid read context',
  INVALID_FILTER: 'Invalid filter or pagination',
  NOT_FOUND: 'Not found',
  FORBIDDEN: 'Not permitted',
  READ_FAILED: 'Application data could not be read',
};
const fail = (code: AppReadErrorCode, detail?: string) => ({ ok: false as const, error: { code, message: detail ? `${MESSAGES[code]}: ${detail}` : MESSAGES[code] } });
const dbFail = (e: { code?: string } | null | undefined) => (e?.code === '42501' ? fail('FORBIDDEN') : fail('READ_FAILED'));

const COLUMNS = 'id, user_id, company_name, role_title, stage, status, outcome, priority, location, work_arrangement, employment_type, job_url, next_action, next_action_date, applied_at, last_activity_at, created_at';

type Row = Record<string, unknown>;
const s = (v: unknown): string => String(v);
const sn = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const toApplication = (r: Row): ApplicationDto => ({
  id: s(r.id), ownerId: s(r.user_id), companyName: s(r.company_name), roleTitle: s(r.role_title), stage: s(r.stage),
  status: s(r.status), outcome: sn(r.outcome), priority: s(r.priority), location: sn(r.location),
  workArrangement: sn(r.work_arrangement), employmentType: sn(r.employment_type), jobUrl: sn(r.job_url),
  nextAction: sn(r.next_action), nextActionDate: sn(r.next_action_date), appliedAt: sn(r.applied_at),
  lastActivityAt: s(r.last_activity_at), createdAt: s(r.created_at),
});

function prepare(ctx: AppReadContext, deps: AppReadDeps): { ok: true; ws: string; db: AppReadClient } | ReturnType<typeof fail> {
  if (typeof ctx?.workspaceId !== 'string' || !UUID.test(ctx.workspaceId)) return fail('INVALID_CONTEXT');
  if (!deps.client && (typeof ctx.accessToken !== 'string' || ctx.accessToken.length < 20)) return fail('INVALID_CONTEXT');
  try {
    return { ok: true, ws: ctx.workspaceId.toLowerCase(), db: deps.client ?? (userClient(ctx.accessToken!) as unknown as AppReadClient) };
  } catch { return fail('READ_FAILED'); }
}

/**
 * Search text becomes a PostgREST filter value, so it is reduced to a conservative
 * alphabet first: nothing that could add filter clauses, wildcards or operators survives.
 */
export function sanitizeSearch(raw: string): string {
  return raw.normalize('NFKC').replace(/[^\p{L}\p{N} .'&+#-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, APP_SEARCH_MAX_LENGTH);
}

export async function listApplications(
  ctx: AppReadContext, filters: ApplicationListFilters = {}, page: ApplicationPageRequest = {}, deps: AppReadDeps = {},
): Promise<AppReadResult<ApplicationPage>> {
  const p = prepare(ctx, deps); if (!p.ok) return p;
  if (typeof filters !== 'object' || filters === null || Array.isArray(filters)) return fail('INVALID_FILTER');
  for (const k of Object.keys(filters)) if (!['status', 'stage', 'search'].includes(k)) return fail('INVALID_FILTER', `unknown filter ${k}`);
  if (filters.status !== undefined && !(APPLICATION_STATUSES as readonly string[]).includes(filters.status)) return fail('INVALID_FILTER', 'status');
  if (filters.stage !== undefined && !(APPLICATION_STAGES as readonly string[]).includes(filters.stage)) return fail('INVALID_FILTER', 'stage');
  if (filters.search !== undefined && (typeof filters.search !== 'string' || filters.search.length > APP_SEARCH_MAX_LENGTH * 2)) return fail('INVALID_FILTER', 'search');
  const pageIndex = page.page ?? 0;
  const size = page.pageSize ?? APP_READ_DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex > APP_READ_MAX_PAGE) return fail('INVALID_FILTER', 'page');
  if (!Number.isInteger(size) || size < 1 || size > APP_READ_MAX_PAGE_SIZE) return fail('INVALID_FILTER', 'pageSize');

  let q = p.db.from('applications').select(COLUMNS).eq('workspace_id', p.ws).is('archived_at', null);
  if (filters.status) q = q.eq('status', filters.status);
  if (filters.stage) q = q.eq('stage', filters.stage);
  const term = filters.search ? sanitizeSearch(filters.search) : '';
  if (term) q = q.or(`company_name.ilike.%${term}%,role_title.ilike.%${term}%`);
  const from = pageIndex * size;
  const { data, error } = await q
    .order('last_activity_at', { ascending: false }).order('id', { ascending: false })
    .range(from, from + size); // size+1 rows: lookahead for hasNext
  if (error) return dbFail(error);
  const rows = (data ?? []) as Row[];
  return { ok: true, data: { items: rows.slice(0, size).map(toApplication), page: pageIndex, pageSize: size, hasNext: rows.length > size } };
}

export async function getApplication(ctx: AppReadContext, applicationId: string, deps: AppReadDeps = {}): Promise<AppReadResult<ApplicationDto>> {
  const p = prepare(ctx, deps); if (!p.ok) return p;
  if (typeof applicationId !== 'string' || !UUID.test(applicationId)) return fail('INVALID_FILTER', 'applicationId');
  const { data, error } = await p.db.from('applications').select(COLUMNS)
    .eq('workspace_id', p.ws).eq('id', applicationId.toLowerCase()).maybeSingle();
  if (error) return dbFail(error);
  return data ? { ok: true, data: toApplication(data as Row) } : fail('NOT_FOUND');
}
