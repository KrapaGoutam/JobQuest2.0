import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { allowedExtensionOrigins, env } from '../env';
import { admin } from '../lib/db';
import {
  EXTENSION_SCOPES,
  extensionActor,
  hasScope,
  mintExtensionSecret,
  normalizeJobUrl,
  normalizeText,
  type ExtensionActor,
  type ExtensionScope,
  type ExtensionTokenRecord,
} from '../lib/extensionTokens';
import { limiter } from '../lib/rateLimit';
import { requireCsrfToken } from '../lib/security';
import { caller } from './scope';

type ApiStatus = 400 | 401 | 403 | 404 | 409 | 415 | 422 | 429 | 500 | 503;
function fail(c: Context, status: ApiStatus, code: string, message: string) {
  return c.json({ error: { code, message } }, status);
}

async function jsonBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T> | null> {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}

function publicToken(row: ExtensionTokenRecord) {
  const now = Date.now();
  const status = row.revoked_at
    ? 'REVOKED'
    : new Date(row.expires_at).getTime() <= now
      ? 'EXPIRED'
      : new Date(row.expires_at).getTime() <= now + 7 * 86_400_000
        ? 'EXPIRING'
        : 'ACTIVE';
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    name: row.name,
    token_prefix: row.token_prefix,
    scopes: row.scopes,
    created_at: row.created_at,
    expires_at: row.expires_at,
    last_used_at: row.last_used_at,
    revoked_at: row.revoked_at,
    revoked_reason: row.revoked_reason,
    replaced_by_token_id: row.replaced_by_token_id,
    status,
  };
}

const createTokenSchema = z.object({
  workspace_id: z.uuid(),
  name: z.string().trim().min(1).max(64),
  expires_in_days: z.union([z.literal(30), z.literal(90), z.literal(365)]).default(90),
}).strict();

/** Web-session token management. Raw secrets are returned only by create/rotate. */
export const extensionManagement = new Hono();

extensionManagement.get('/tokens', async (c) => {
  const actor = await caller(c);
  if (!actor) return fail(c, 401, 'UNAUTHENTICATED', 'Sign in required.');
  let query = actor.client
    .from('extension_tokens')
    .select('id, workspace_id, user_id, name, token_prefix, scopes, created_at, expires_at, last_used_at, revoked_at, revoked_reason, replaced_by_token_id')
    .eq('user_id', actor.userId)
    .order('created_at', { ascending: false });
  const workspaceId = c.req.query('workspace_id');
  if (workspaceId) query = query.eq('workspace_id', workspaceId);
  const { data, error } = await query;
  if (error) return fail(c, 500, 'TOKEN_LIST_FAILED', 'Could not load extension tokens.');
  return c.json({ tokens: (data as ExtensionTokenRecord[]).map(publicToken) });
});

extensionManagement.post('/tokens', requireCsrfToken, async (c) => {
  const actor = await caller(c);
  if (!actor) return fail(c, 401, 'UNAUTHENTICATED', 'Sign in required.');
  const body = await jsonBody(c, createTokenSchema);
  if (!body) return fail(c, 422, 'INVALID_INPUT', 'Name, workspace, and a supported expiration are required.');

  const secret = mintExtensionSecret();
  const expiresAt = new Date(Date.now() + body.expires_in_days * 86_400_000).toISOString();
  const { data: tokenId, error } = await admin().rpc('rpc_create_extension_token', {
    p_actor_id: actor.userId,
    p_workspace_id: body.workspace_id,
    p_name: body.name,
    p_token_prefix: secret.prefix,
    p_token_hash: secret.hash,
    p_scopes: [...EXTENSION_SCOPES],
    p_expires_at: expiresAt,
  });
  if (error || !tokenId) {
    const denied = error?.code === '42501';
    return fail(c, denied ? 403 : 400, denied ? 'WORKSPACE_ACCESS_DENIED' : 'TOKEN_CREATE_FAILED', denied ? 'Workspace access denied.' : 'Could not create extension token.');
  }
  const { data } = await admin()
    .from('extension_tokens')
    .select('id, workspace_id, user_id, name, token_prefix, scopes, created_at, expires_at, last_used_at, revoked_at, revoked_reason, replaced_by_token_id')
    .eq('id', tokenId)
    .single();
  return c.json({ token: secret.token, metadata: publicToken(data as ExtensionTokenRecord) }, 201);
});

extensionManagement.post('/tokens/:id/revoke', requireCsrfToken, async (c) => {
  const actor = await caller(c);
  if (!actor) return fail(c, 401, 'UNAUTHENTICATED', 'Sign in required.');
  const id = z.uuid().safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 404, 'TOKEN_NOT_FOUND', 'Extension token not found.');
  const { data, error } = await admin().rpc('rpc_revoke_extension_token', {
    p_actor_id: actor.userId,
    p_token_id: id.data,
    p_reason: 'USER_REVOKED',
  });
  if (error?.code === 'P0002') return fail(c, 404, 'TOKEN_NOT_FOUND', 'Extension token not found.');
  if (error) return fail(c, 400, 'TOKEN_REVOKE_FAILED', 'Could not revoke extension token.');
  return c.json({ revoked: data === true });
});

extensionManagement.post('/tokens/:id/rotate', requireCsrfToken, async (c) => {
  const actor = await caller(c);
  if (!actor) return fail(c, 401, 'UNAUTHENTICATED', 'Sign in required.');
  const id = z.uuid().safeParse(c.req.param('id'));
  const body = await jsonBody(c, z.object({
    name: z.string().trim().min(1).max(64).optional(),
    expires_in_days: z.union([z.literal(30), z.literal(90), z.literal(365)]).default(90),
  }).strict());
  if (!id.success || !body) return fail(c, 422, 'INVALID_INPUT', 'A valid token and expiration are required.');

  const { data: old } = await admin()
    .from('extension_tokens')
    .select('name, scopes')
    .eq('id', id.data)
    .eq('user_id', actor.userId)
    .maybeSingle();
  if (!old) return fail(c, 404, 'TOKEN_NOT_FOUND', 'Extension token not found.');

  const secret = mintExtensionSecret();
  const expiresAt = new Date(Date.now() + body.expires_in_days * 86_400_000).toISOString();
  const { data: newId, error } = await admin().rpc('rpc_rotate_extension_token', {
    p_actor_id: actor.userId,
    p_token_id: id.data,
    p_name: body.name ?? old.name,
    p_token_prefix: secret.prefix,
    p_token_hash: secret.hash,
    p_scopes: old.scopes,
    p_expires_at: expiresAt,
  });
  if (error || !newId) {
    const missing = error?.code === 'P0002';
    return fail(c, missing ? 404 : 400, missing ? 'TOKEN_NOT_FOUND' : 'TOKEN_ROTATE_FAILED', missing ? 'Extension token not found.' : 'Only an active token can be replaced.');
  }
  const { data } = await admin()
    .from('extension_tokens')
    .select('id, workspace_id, user_id, name, token_prefix, scopes, created_at, expires_at, last_used_at, revoked_at, revoked_reason, replaced_by_token_id')
    .eq('id', newId)
    .single();
  return c.json({ token: secret.token, metadata: publicToken(data as ExtensionTokenRecord) }, 201);
});

// -----------------------------------------------------------------------------
// Extension bearer API v1
// -----------------------------------------------------------------------------

export const extensionV1 = new Hono();
const extensionRateLimit = limiter('extension-token', () => env().EXTENSION_TOKEN_RATE_LIMIT, 60);

extensionV1.use('*', async (c, next) => {
  const origin = c.req.header('origin');
  const allowed = allowedExtensionOrigins();
  if (origin && allowed.size > 0 && !allowed.has(origin)) {
    return fail(c, 403, 'EXTENSION_ORIGIN_REJECTED', 'Extension origin not allowed.');
  }
  if (origin && allowed.has(origin)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    c.header('Vary', 'Origin');
  }
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  return next();
});

async function authorize(c: Context, scope: ExtensionScope): Promise<
  { actor: ExtensionActor; response?: never } | { actor?: never; response: Response }
> {
  const actor = await extensionActor(c);
  if (!actor) return { response: fail(c, 401, 'EXTENSION_TOKEN_INVALID', 'Connection expired or revoked. Reconnect to JobQuest.') };
  const limit = await extensionRateLimit.hit(actor.tokenId).catch(() => null);
  if (!limit) return { response: fail(c, 503, 'RATE_LIMIT_UNAVAILABLE', 'JobQuest is temporarily unavailable.') };
  if (!limit.allowed) {
    c.header('Retry-After', String(Math.max(1, limit.retryAfterSeconds)));
    return { response: fail(c, 429, 'RATE_LIMITED', 'Too many extension requests. Try again shortly.') };
  }
  if (!hasScope(actor, scope)) return { response: fail(c, 403, 'SCOPE_REQUIRED', `Token requires ${scope}.`) };
  return { actor };
}

extensionV1.get('/me', async (c) => {
  const auth = await authorize(c, 'profile:read');
  if (auth.response) return auth.response;
  const [account, profile, workspace] = await Promise.all([
    admin().from('user_accounts').select('username').eq('user_id', auth.actor.userId).single(),
    admin().from('profiles').select('display_name').eq('user_id', auth.actor.userId).single(),
    admin().from('workspaces').select('id, name').eq('id', auth.actor.workspaceId).single(),
  ]);
  if (account.error || profile.error || workspace.error) return fail(c, 500, 'PROFILE_LOAD_FAILED', 'Could not load extension profile.');
  return c.json({
    user: { id: auth.actor.userId, username: account.data.username, display_name: profile.data.display_name },
    workspace: workspace.data,
    scopes: auth.actor.scopes,
    expires_at: auth.actor.expiresAt,
  });
});

extensionV1.get('/workflow', async (c) => {
  const auth = await authorize(c, 'workflow:read');
  if (auth.response) return auth.response;
  const specific = await admin()
    .from('workflow_definitions')
    .select('version, stages, outcomes, closure_reasons')
    .eq('workspace_id', auth.actor.workspaceId)
    .maybeSingle();
  const fallback = specific.data ? null : await admin()
    .from('workflow_definitions')
    .select('version, stages, outcomes, closure_reasons')
    .is('workspace_id', null)
    .single();
  const workflow = specific.data ?? fallback?.data;
  if (!workflow) return fail(c, 500, 'WORKFLOW_LOAD_FAILED', 'Could not load canonical workflow.');
  return c.json({
    workflow_version: workflow.version,
    stages: workflow.stages,
    statuses: [{ id: 'OPEN', label: 'Open' }, { id: 'CLOSED', label: 'Closed' }],
    outcomes: workflow.outcomes,
    closure_reasons: workflow.closure_reasons,
    capture_actions: [{ id: 'SAVED', label: 'Save for later' }, { id: 'APPLIED', label: 'Already applied' }],
    default_action: 'APPLIED',
  });
});

extensionV1.get('/documents', async (c) => {
  const auth = await authorize(c, 'documents:read');
  if (auth.response) return auth.response;
  if ((c.req.query('kind') ?? '').toLowerCase() !== 'resume') {
    return fail(c, 400, 'INVALID_DOCUMENT_KIND', 'Only kind=resume is supported.');
  }
  const { data, error } = await admin()
    .from('resumes')
    .select('id, name, version_label, target_role, category, is_default, updated_at')
    .eq('workspace_id', auth.actor.workspaceId)
    .eq('user_id', auth.actor.userId)
    .eq('document_type', 'RESUME')
    .eq('is_active', true)
    .is('archived_at', null)
    .order('name');
  if (error) return fail(c, 500, 'DOCUMENTS_LOAD_FAILED', 'Could not load resumes.');
  return c.json({ documents: data ?? [] });
});

const duplicateSchema = z.object({
  job_url: z.string().trim().max(2048).optional().default(''),
  external_job_id: z.string().trim().max(128).optional().default(''),
  source: z.string().trim().max(128).optional().default(''),
  company: z.string().trim().max(128).optional().default(''),
  job_title: z.string().trim().max(128).optional().default(''),
  location: z.string().trim().max(128).optional().default(''),
}).strict();

function sourceKey(source: string, jobUrl: string): string {
  if (source.trim()) return normalizeText(source);
  try { return new URL(jobUrl).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

extensionV1.post('/duplicates/check', async (c) => {
  const auth = await authorize(c, 'applications:duplicate_check');
  if (auth.response) return auth.response;
  const body = await jsonBody(c, duplicateSchema);
  if (!body) return fail(c, 422, 'INVALID_INPUT', 'Duplicate-check fields are invalid.');
  const { data, error } = await admin()
    .from('applications')
    .select('id, company_name, role_title, stage, status, applied_at, location, source, priority, updated_at, last_activity_at, job_url, external_job_id')
    .eq('workspace_id', auth.actor.workspaceId)
    .eq('user_id', auth.actor.userId)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) return fail(c, 500, 'DUPLICATE_CHECK_FAILED', 'Could not check for duplicates.');

  const rows = data ?? [];
  const normalizedUrl = normalizeJobUrl(body.job_url);
  const requestedSource = sourceKey(body.source, body.job_url);
  const strong = rows.filter((row) => {
    const urlMatch = Boolean(normalizedUrl && normalizeJobUrl(row.job_url) === normalizedUrl);
    const idMatch = Boolean(
      body.external_job_id
      && normalizeText(row.external_job_id) === normalizeText(body.external_job_id)
      && requestedSource
      && sourceKey(row.source ?? '', row.job_url ?? '') === requestedSource,
    );
    return urlMatch || idMatch;
  });
  const normalizedCompany = normalizeText(body.company);
  const normalizedTitle = normalizeText(body.job_title);
  const sameCompany = strong.length ? [] : rows.filter((row) => normalizedCompany && normalizeText(row.company_name) === normalizedCompany);
  const sameRole = sameCompany.filter((row) => normalizedTitle && normalizeText(row.role_title) === normalizedTitle);
  const matchType = strong.length ? 'EXACT_POSTING' : sameRole.length ? 'SAME_ROLE' : sameCompany.length ? 'COMPANY_ONLY' : 'NONE';
  const selected = (strong.length ? strong : sameRole.length ? sameRole : sameCompany).slice(0, 3);
  return c.json({
    match_type: matchType,
    has_duplicate: matchType === 'EXACT_POSTING' || matchType === 'SAME_ROLE',
    matches: selected.map((application) => ({
      id: application.id,
      application_id: application.id,
      match_type: matchType,
      deep_link_path: `/w/${auth.actor.workspaceId}/applications/${application.id}`,
      application,
    })),
  });
});

const captureSchema = z.object({
  company: z.string().trim().min(1).max(128),
  job_title: z.string().trim().min(1).max(128),
  stage: z.string().trim().min(1).max(32).default('APPLIED'),
  job_url: z.string().trim().max(2048).optional().nullable(),
  source: z.string().trim().max(128).optional().nullable(),
  external_job_id: z.string().trim().max(128).optional().nullable(),
  location: z.string().trim().max(128).optional().nullable(),
  work_arrangement: z.enum(['Remote', 'Hybrid', 'Onsite']).optional().nullable(),
  employment_type: z.enum(['Full-time', 'Contract', 'Part-time', 'Internship', 'Temporary', 'Other']).optional().nullable(),
  salary_min: z.number().nonnegative().optional().nullable(),
  salary_max: z.number().nonnegative().optional().nullable(),
  salary_currency: z.string().trim().length(3).default('USD'),
  tags: z.array(z.string().trim().min(1).max(64)).max(20).default([]),
  duplicate_override: z.boolean().default(false),
  notes: z.string().max(10_000).optional().nullable(),
  applied_at: z.iso.datetime().optional().nullable(),
  snapshot: z.object({
    description: z.string().max(100_000).optional().nullable(),
    requirements: z.string().max(100_000).optional().nullable(),
    skills: z.string().max(50_000).optional().nullable(),
    raw_payload: z.record(z.string(), z.unknown()).optional().nullable(),
  }).strict().default({}),
  resume_id: z.uuid().optional().nullable(),
  resume_label: z.string().trim().max(100).optional().nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.salary_min != null && value.salary_max != null && value.salary_max < value.salary_min) {
    ctx.addIssue({ code: 'custom', path: ['salary_max'], message: 'salary_max must be at least salary_min' });
  }
});

extensionV1.post('/captures', async (c) => {
  const auth = await authorize(c, 'applications:create');
  if (auth.response) return auth.response;
  const body = await jsonBody(c, captureSchema);
  if (!body) return fail(c, 422, 'INVALID_INPUT', 'Company, role, stage, and capture fields must be valid.');
  const { data, error } = await admin().rpc('rpc_extension_capture', {
    p_actor_id: auth.actor.userId,
    p_workspace_id: auth.actor.workspaceId,
    p_company_name: body.company,
    p_role_title: body.job_title,
    p_stage: body.stage,
    p_job_url: body.job_url ?? null,
    p_source: body.source ?? null,
    p_external_job_id: body.external_job_id ?? null,
    p_location: body.location ?? null,
    p_work_arrangement: body.work_arrangement ?? null,
    p_employment_type: body.employment_type ?? null,
    p_salary_min: body.salary_min ?? null,
    p_salary_max: body.salary_max ?? null,
    p_salary_currency: body.salary_currency,
    p_tags: body.tags,
    p_duplicate_override: body.duplicate_override,
    p_notes: body.notes ?? null,
    p_applied_at: body.applied_at ?? null,
    p_job_description: body.snapshot.description ?? null,
    p_requirements: body.snapshot.requirements ?? null,
    p_skills: body.snapshot.skills ?? null,
    p_raw_payload: body.snapshot.raw_payload ?? null,
    p_resume_id: body.resume_id ?? null,
    p_resume_label: body.resume_label ?? null,
  });
  if (error || !data) {
    const denied = error?.code === '42501';
    return fail(c, denied ? 403 : 400, denied ? 'CAPTURE_ACCESS_DENIED' : 'CAPTURE_FAILED', denied ? 'Capture access denied.' : 'Could not save this capture.');
  }
  return c.json(data, 201);
});
