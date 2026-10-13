import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AI_ACTION_TYPES, AI_SUGGESTION_ACTIONS, validateActionProposal, validateAiResult } from '../../apps/api/src/lib/aiContract';
import {
  evaluateApplicationMatch, emptyHints, normalizeCompany, type AiMatchHints, type AppRow,
} from '../../apps/api/src/services/aiApplicationMatchService';
import { AI_ACTION_ERROR_CODES, aiActionError, hintsOf, previewAiAction, confirmAiAction } from '../../apps/api/src/services/aiActionService';
import { jobLeadFinding, emailTriageFinding } from './fixtures/ai-contract/external';

// AI-8 unit coverage: the closed action vocabulary and strict payloads, the Application matching hierarchy, the
// "provider cannot choose a record" contract rules, the MCP no-core-write guarantee, the API surface and the migration's
// access boundary. Database behaviour (idempotency, RLS, staleness, recovery) is proven in tests/integration/ai-8-actions.test.ts.

describe('closed action vocabulary', () => {
  it('only three executable actions, all already part of the AI-1A suggestion vocabulary', () => {
    expect([...AI_ACTION_TYPES].sort()).toEqual(['create_application', 'create_task', 'set_status']);
    for (const a of AI_ACTION_TYPES) expect(AI_SUGGESTION_ACTIONS).toContain(a);
    const migration = readFileSync('supabase/migrations/20261023100000_ai_hub_database_foundation.sql', 'utf8');
    for (const a of AI_ACTION_TYPES) expect(migration).toContain(`'${a}'`);
  });
  it('every failure category the spec names exists', () => {
    expect([...AI_ACTION_ERROR_CODES].sort()).toEqual([
      'ACTION_ALREADY_EXECUTED', 'ACTION_AMBIGUOUS', 'ACTION_CONFLICT', 'ACTION_EXECUTION_FAILED', 'ACTION_NOT_SUPPORTED',
      'ACTION_STALE', 'ACTION_TARGET_NOT_FOUND', 'ACTION_UNAUTHORIZED', 'ACTION_VALIDATION_FAILED',
    ]);
    expect(aiActionError('ACTION_STALE').error.message).toMatch(/changed/);
  });
});

describe('strict proposal payloads', () => {
  const ok = (a: (typeof AI_ACTION_TYPES)[number], p: unknown) => validateActionProposal(a, p);
  it('create_application accepts only priority and reason', () => {
    expect(ok('create_application', {}).ok).toBe(true);
    expect(ok('create_application', { priority: 'HIGH', reason: 'great fit' }).ok).toBe(true);
    for (const bad of [{ stage: 'SAVED' }, { company: 'x' }, { application_id: 'a' }, { priority: 'URGENT' }, { reason: 5 }]) expect(ok('create_application', bad).ok, JSON.stringify(bad)).toBe(false);
  });
  it('create_task needs a title; due date must be a real calendar date and never throws', () => {
    expect(ok('create_task', {}).ok).toBe(false);
    expect(ok('create_task', { title: '  ' }).ok).toBe(false);
    const good = ok('create_task', { title: ' Prep ', due_date: '2026-11-05', priority: 'HIGH' });
    expect(good).toMatchObject({ ok: true, value: { title: 'Prep', due_date: '2026-11-05', priority: 'HIGH', task_type: 'TASK' } });
    for (const d of ['2026-02-31', '2026-13-40', 'tomorrow', '2026-1-1', 20261105]) expect(() => ok('create_task', { title: 't', due_date: d })).not.toThrow();
    for (const d of ['2026-02-31', '2026-13-40', 'tomorrow']) expect(ok('create_task', { title: 't', due_date: d }).ok, d).toBe(false);
    expect(ok('create_task', { title: 't', task_type: 'REMINDER' }).ok).toBe(false);
    expect(ok('create_task', { title: 't', sql: 'drop table tasks' }).ok).toBe(false);
    expect(ok('create_task', { title: 'x'.repeat(256) }).ok).toBe(false);
  });
  it('set_status takes exactly one existing stage OR the REJECTED outcome - nothing invented', () => {
    expect(ok('set_status', { stage: 'INTERVIEW' }).ok).toBe(true);
    expect(ok('set_status', { outcome: 'REJECTED' }).ok).toBe(true);
    for (const bad of [{}, { stage: 'INTERVIEW', outcome: 'REJECTED' }, { stage: 'HIRED' }, { stage: 'AI_CREATED' }, { outcome: 'ACCEPTED' }, { outcome: 'WITHDRAWN' }, { status: 'OPEN' }, { stage: 'OFFER', application_id: 'a' }]) {
      expect(ok('set_status', bad).ok, JSON.stringify(bad)).toBe(false);
    }
    expect(ok('set_status', 'INTERVIEW').ok).toBe(false);
    expect(ok('set_status', null).ok).toBe(false);
    expect(ok('set_status', [1]).ok).toBe(false);
  });
});

describe('contract validator: a provider proposes, the server resolves', () => {
  const base = (findings: unknown[], suggestions: unknown[]) => ({
    contract: 'jobquest.ai-result', schema_version: '1.0', provider: 'claude', workflow: 'other', run: { external_run_id: 'r1', generated_at: '2026-10-12T12:00:00Z' },
    sources: [], findings, suggestions, metadata: {},
  });
  it('drops a provider-supplied target for executable actions (with a warning) and keeps it for inert ones', () => {
    const appId = '11111111-1111-4111-8111-111111111111';
    const r = validateAiResult(base([emailTriageFinding()], [
      { finding_index: 0, action: 'set_status', target: { type: 'application', id: appId }, proposed: { stage: 'INTERVIEW' } },
      { finding_index: 0, action: 'create_task', target: { application_id: appId }, proposed: { title: 'Prep' } },
      { finding_index: 0, action: 'link_contact', target: { type: 'application', id: appId }, proposed: {} },
    ]));
    expect(r.data!.suggestions.map((s) => s.target)).toEqual([null, null, { type: 'application', id: appId }]);
    expect(r.warnings.filter((w) => w.code === 'target_ignored')).toHaveLength(2);
  });
  it('rejects unknown actions, hidden fields, invalid stages and create_application on a non-lead', () => {
    const r = validateAiResult(base([emailTriageFinding(), jobLeadFinding()], [
      { finding_index: 0, action: 'execute_sql', proposed: {} },
      { finding_index: 0, action: 'update_anything', proposed: {} },
      { finding_index: 0, action: 'set_status', proposed: { stage: 'INTERVIEW', application_id: 'x' } },
      { finding_index: 0, action: 'set_status', proposed: { stage: 'NOPE' } },
      { finding_index: 0, action: 'create_application', proposed: {} }, // email finding
      { finding_index: 1, action: 'create_application', proposed: {} }, // job lead: ok
    ]));
    expect(r.data!.suggestions).toHaveLength(1);
    expect(r.data!.suggestions[0]).toMatchObject({ finding_index: 1, action: 'create_application' });
    expect(r.rejectedItemCount).toBe(5);
    expect(r.errors.map((e) => e.code).filter((c) => c === 'action_invalid')).toHaveLength(3);
  });
  it('normalizes the stored proposal', () => {
    const r = validateAiResult(base([emailTriageFinding()], [{ finding_index: 0, action: 'create_task', proposed: { title: '  Prep  ', details: null, priority: 'LOW' } }]));
    expect(r.data!.suggestions[0]!.proposed).toEqual({ title: 'Prep', priority: 'LOW' });
  });
});

describe('application matching hierarchy', () => {
  let n = 0;
  const app = (o: Partial<AppRow>): AppRow => ({
    id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, user_id: 'u1', company_name: 'Acme', role_title: 'Staff Engineer', job_url: null, external_job_id: null, source: null,
    location: null, work_arrangement: null, stage: 'APPLIED', status: 'OPEN', outcome: null, archived_at: null,
    last_activity_at: '2026-10-01T00:00:00Z', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...o,
  });
  const hints = (o: Partial<AiMatchHints>): AiMatchHints => ({ ...emptyHints(), ...o });
  const ev = (rows: AppRow[], h: Partial<AiMatchHints>) => evaluateApplicationMatch(rows, hints(h));

  it('exact: trusted external id, canonical URL (tracking params ignored), or a JobQuest-written link', () => {
    const a = app({ external_job_id: 'EX-1', source: 'Example Jobs' });
    expect(ev([a], { externalJobId: 'EX-1', sourceName: 'example jobs' })).toMatchObject({ result: 'EXACT', selected: { id: a.id } });
    expect(ev([a], { externalJobId: 'EX-1' })).toMatchObject({ result: 'EXACT' }); // unknown hint source is not a conflict
    const b = app({ job_url: 'https://jobs.example.com/p/42?utm_source=x#top' });
    expect(ev([b], { urls: ['https://JOBS.example.com/p/42/'] })).toMatchObject({ result: 'EXACT', candidates: [{ basis: 'canonical_url' }] });
    expect(ev([a, b], { linkedApplicationId: b.id })).toMatchObject({ result: 'EXACT', selected: { id: b.id } });
  });
  it('a board-specific id from a DIFFERENT source is not trusted on its own', () => {
    const a = app({ external_job_id: 'EX-1', source: 'LinkedIn', company_name: 'Other', role_title: 'Other' });
    expect(ev([a], { externalJobId: 'EX-1', sourceName: 'Indeed' }).result).toBe('NONE');
  });
  it('company alone is NEVER enough; neither is a title alone', () => {
    const a = app({ company_name: 'Acme', role_title: 'Designer' });
    expect(ev([a], { company: 'Acme' }).result).toBe('NONE');
    expect(ev([a], { company: 'Acme', title: 'Staff Engineer' }).result).toBe('NONE');
    expect(ev([a], { title: 'Designer' }).result).toBe('NONE');
    expect(ev([], { company: 'Acme', title: 'Designer' }).result).toBe('NONE');
  });
  it('strong: company + title with agreeing context or a nearby date, and no conflicting context', () => {
    const a = app({ location: 'Austin, TX' });
    expect(ev([a], { company: 'ACME, Inc.', title: 'staff  engineer', location: 'austin tx' })).toMatchObject({ result: 'STRONG', selected: { id: a.id } });
    expect(ev([a], { company: 'Acme', title: 'Staff Engineer', referenceDate: '2026-10-12T00:00:00Z' })).toMatchObject({ result: 'STRONG' }); // within 60 days
    expect(ev([a], { company: 'Acme', title: 'Staff Engineer', referenceDate: '2027-06-01T00:00:00Z' }).result).toBe('AMBIGUOUS'); // old and no context
  });
  it('conflicting context demotes to AMBIGUOUS (a human must decide); several candidates are AMBIGUOUS and never auto-selected', () => {
    const a = app({ location: 'Denver, CO' });
    expect(ev([a], { company: 'Acme', title: 'Staff Engineer', location: 'Boston' })).toMatchObject({ result: 'AMBIGUOUS', selected: null });
    const b = app({ location: 'Austin, TX' }), c = app({ location: 'Austin, TX' });
    const m = ev([b, c], { company: 'Acme', title: 'Staff Engineer', location: 'Austin, TX' });
    expect(m).toMatchObject({ result: 'AMBIGUOUS', selected: null });
    expect(m.candidates).toHaveLength(2);
    const dup1 = app({ job_url: 'https://x.example.com/1' }), dup2 = app({ job_url: 'https://x.example.com/1' });
    expect(ev([dup1, dup2], { urls: ['https://x.example.com/1'] })).toMatchObject({ result: 'AMBIGUOUS', selected: null });
  });
  it('archived applications are excluded; the strongest tier wins; ordering is deterministic', () => {
    const arch = app({ job_url: 'https://x.example.com/9', archived_at: '2026-10-02T00:00:00Z' });
    expect(ev([arch], { urls: ['https://x.example.com/9'] }).result).toBe('NONE');
    const exact = app({ job_url: 'https://x.example.com/2', last_activity_at: '2026-09-01T00:00:00Z' });
    const ctx = app({ last_activity_at: '2026-10-10T00:00:00Z' });
    const m = ev([ctx, exact], { urls: ['https://x.example.com/2'], company: 'Acme', title: 'Staff Engineer' });
    expect(m.result).toBe('EXACT');
    expect(m.candidates.map((c) => c.application.id)).toEqual([exact.id, ctx.id]);
    const older = app({ last_activity_at: '2026-08-01T00:00:00Z' }), newer = app({ last_activity_at: '2026-09-30T00:00:00Z' });
    const order = (rows: AppRow[]) => ev(rows, { company: 'Acme', title: 'Staff Engineer' }).candidates.map((c) => c.application.id);
    expect(order([older, newer])).toEqual(order([newer, older]));
    expect(order([older, newer])[0]).toBe(newer.id);
  });
  it('legal suffixes and punctuation do not split a company', () => {
    expect(normalizeCompany('Acme, Inc.')).toBe('acme');
    expect(normalizeCompany('ACME  Corporation')).toBe('acme');
    expect(normalizeCompany('Acme Labs')).toBe('acme labs');
  });
  it('hints come from the stored finding and only from allowlisted fields', () => {
    const lead = { company: 'Acme', title: 'Staff Engineer', location: 'Austin', canonical_url: 'https://j.example.com/1', source_url: 'https://j.example.com/1?x=1', external_job_id: 'E1', source_name: 'Ex', work_arrangement: 'remote', posted_date: '2026-09-28' };
    const h = hintsOf({ suggestion: {}, finding: { application_id: null, payload: {}, created_at: '2026-10-01T00:00:00Z' }, lead, calendar: null });
    expect(h).toMatchObject({ company: 'Acme', title: 'Staff Engineer', externalJobId: 'E1', sourceName: 'Ex', arrangement: 'remote', linkedApplicationId: null });
    expect(h.urls).toHaveLength(2);
    const email = hintsOf({ suggestion: {}, finding: { application_id: null, payload: { company: 'Acme', role_title: 'SRE', application_id: 'forged' }, occurred_at: '2026-10-02T00:00:00Z' }, lead: null, calendar: null });
    expect(email).toMatchObject({ company: 'Acme', title: 'SRE', referenceDate: '2026-10-02T00:00:00Z', linkedApplicationId: null });
  });
});

describe('service guard rails (no database needed)', () => {
  const ctx = { workspaceId: '11111111-1111-4111-8111-111111111111', userId: '22222222-2222-4222-8222-222222222222', accessToken: 'x'.repeat(40) };
  it('refuses when the AI Hub kill switch is off, and for a malformed context', async () => {
    const off = await previewAiAction(ctx, '33333333-3333-4333-8333-333333333333', { env: { AI_HUB_ENABLED: 'false' } });
    expect(off).toMatchObject({ ok: false, error: { code: 'AI_HUB_DISABLED' } });
    const bad = await previewAiAction({ ...ctx, workspaceId: 'nope' }, '33333333-3333-4333-8333-333333333333', { env: { AI_HUB_ENABLED: 'true' } });
    expect(bad).toMatchObject({ ok: false, error: { code: 'INVALID_CONTEXT' } });
    const noFp = await confirmAiAction(ctx, '33333333-3333-4333-8333-333333333333', { expectedFingerprint: '' }, { env: { AI_HUB_ENABLED: 'true' }, client: {} as never, service: {} as never });
    expect(noFp).toMatchObject({ ok: false, error: { code: 'ACTION_VALIDATION_FAILED' } });
  });
});

describe('no unattended path and no MCP core write', () => {
  it('the MCP registry still has exactly one write (submit AI result) and no core mutation tool', async () => {
    const { MCP_TOOLS } = await import('../../apps/api/src/mcp/tools');
    expect(MCP_TOOLS).toHaveLength(11);
    const writes = MCP_TOOLS.filter((t) => t.annotations.readOnlyHint !== true);
    expect(writes.map((t) => t.name)).toEqual(['jobquest_submit_ai_result']);
    const names = MCP_TOOLS.map((t) => t.name.toLowerCase()).join(' ');
    for (const banned of ['create_application', 'update_application', 'create_task', 'set_application_status', 'execute', 'approve', 'confirm', 'accept', 'action']) expect(names, banned).not.toContain(banned);
  });
  it('the MCP layer and the ingestion service never import the action service or call its RPCs', () => {
    for (const f of ['apps/api/src/mcp/tools.ts', 'apps/api/src/mcp/server.ts', 'apps/api/src/routes/mcp.ts', 'apps/api/src/services/aiIntegrationService.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/aiActionService|rpc_ai_action_|rpc_ai_apply_status_change|ai_action_executions/);
    }
  });
  it('the connector token scopes carry no action or core-write scope', () => {
    const src = readFileSync('apps/api/src/mcp/principal.ts', 'utf8');
    expect(src).not.toMatch(/ai:action|ai:execute|jobquest:write/);
  });
});

describe('API surface', () => {
  // CSRF / origin / strict-body behaviour of the execute route is proven over HTTP in tests/integration/ai-8-actions.test.ts.
  const origin = 'http://localhost:5173';
  it('requires a signed-in user for every read route', async () => {
    const { app } = await import('../../apps/api/src/app');
    const ws = '11111111-1111-4111-8111-111111111111';
    for (const path of [`/api/ai/actions/queue?workspace_id=${ws}`, `/api/ai/actions/history?workspace_id=${ws}`, `/api/ai/actions/preview?workspace_id=${ws}&suggestion_id=${ws}`]) {
      const res = await app.request(`http://localhost${path}`, { headers: { origin } });
      expect(res.status, path).toBe(401);
    }
  });
  it('the execute route accepts no free-form fields', () => {
    const src = readFileSync('apps/api/src/routes/aiActions.ts', 'utf8');
    expect(src).toContain('z.strictObject');
    expect(src).toContain('requireCsrfToken');
    expect(src).not.toMatch(/sql|rpc\(/i);
  });
});

describe('migration access boundary', () => {
  const sql = readFileSync('supabase/migrations/20261029100000_ai_hub_controlled_actions.sql', 'utf8');
  it('provenance writers are service_role only; the table is read-only to clients with the standard owner predicate', () => {
    expect(sql).toMatch(/revoke all on function public\.rpc_ai_action_claim[^;]*from public, anon, authenticated/);
    expect(sql).toMatch(/revoke all on function public\.rpc_ai_action_complete[^;]*from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.rpc_ai_action_claim[^;]*to service_role/);
    expect(sql).toMatch(/grant execute on function public\.rpc_ai_action_complete[^;]*to service_role/);
    expect(sql).toContain('grant select on public.ai_action_executions to authenticated');
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*ai_action_executions to authenticated/);
    expect(sql).toContain('public.can_access_owned_record(workspace_id, user_id)');
    expect(sql.match(/security definer/gi)).toHaveLength(2);
    expect(sql.match(/set search_path = ''/g)!.length).toBeGreaterThanOrEqual(3);
  });
  it('idempotency is a database guarantee (unique live indexes per suggestion, key and converted lead)', () => {
    expect(sql).toMatch(/uq_ai_action_exec_live_suggestion[\s\S]*where status in \('PENDING', 'SUCCEEDED'\)/);
    expect(sql).toContain('uq_ai_action_exec_live_key');
    expect(sql).toMatch(/uq_ai_action_exec_live_conversion[\s\S]*action_type = 'create_application'/);
  });
  it('the status guard is SECURITY INVOKER (runs as the caller) and reuses the existing status RPCs', () => {
    const fn = sql.slice(sql.indexOf('function public.rpc_ai_apply_status_change'), sql.indexOf('-- 5. Explicit EXECUTE'));
    expect(fn).toContain('security invoker');
    expect(fn).toContain('rpc_move_application_stage');
    expect(fn).toContain('rpc_set_application_outcome');
    expect(fn).not.toMatch(/update public\.applications|insert into public\./i);
  });
  it('adds no core table change and no destructive statement', () => {
    expect(sql).not.toMatch(/alter table public\.(applications|tasks|contacts|interviews)/i);
    expect(sql).not.toMatch(/drop table|truncate|delete from/i);
  });
});
