import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DISCOVERY_PROFILE } from '../../apps/api/src/lib/aiContract';
import type { AppRow } from '../../apps/api/src/services/aiApplicationMatchService';
import { evaluateLeadApplicationMatch, matchLeadsToApplications, type LeadMatchInput } from '../../apps/api/src/services/aiLeadMatchService';
import { getJobLeadApplicationMatches, listJobLeads, toJobLead } from '../../apps/api/src/services/aiExternalIntelligenceService';
import { getJobDiscoveryProfile, saveJobDiscoveryProfile } from '../../apps/api/src/services/aiJobDiscoveryService';

// AI-11D service boundaries: the lead -> application match is derived and READ-ONLY, the discovery profile is owner
// scoped with a read-only provider view, and nothing in this phase can create or change an application.
const WS = '11111111-1111-4111-8111-aaaaaaaaaaaa';
const OWNER = '22222222-2222-4222-8222-bbbbbbbbbbbb';
const ON = { AI_HUB_ENABLED: 'true' };
const app = (over: Partial<AppRow> = {}): AppRow => ({
  id: '00000000-0000-4000-8000-000000000001', user_id: OWNER, company_name: 'Acme Inc.', role_title: 'QA Engineer', job_url: null, external_job_id: null, source: null,
  location: null, work_arrangement: null, stage: 'APPLIED', status: 'ACTIVE', outcome: null, archived_at: null,
  last_activity_at: '2026-09-28T10:00:00Z', created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-28T10:00:00Z', ...over,
});
const leadIn = (over: Partial<LeadMatchInput> = {}): Omit<LeadMatchInput, 'id' | 'ownerId'> => ({
  company: 'Acme', title: 'QA Engineer', location: 'Remote', workArrangement: 'remote', canonicalUrl: null, sourceUrl: null, externalJobId: null, sourceName: null,
  referenceDate: '2026-10-01T12:00:00Z', ...over,
});

/** A recording PostgREST-style chain: every call is logged by method name, awaiting it yields `rows`. */
function recorder(tables: Record<string, unknown[]>) {
  const calls: Array<{ table: string; ops: string[] }> = [];
  const client = {
    from(table: string) {
      const entry = { table, ops: [] as string[] };
      calls.push(entry);
      const chain: Record<string, unknown> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') return (res: (v: unknown) => void) => res({ data: tables[table] ?? [], error: null });
          return () => { entry.ops.push(prop); return chain; };
        },
      });
      return chain;
    },
  };
  return { client, calls };
}

describe('AI-11D lead -> application match (derived, read-only, conservative)', () => {
  it('MATCHED by the trusted identity: same job URL or same source job id', () => {
    const byUrl = evaluateLeadApplicationMatch([app({ job_url: 'https://jobs.example.com/p/1?utm_source=x', role_title: 'Different title' })], leadIn({ canonicalUrl: 'https://jobs.example.com/p/1' }));
    expect(byUrl).toMatchObject({ state: 'MATCHED', basis: 'canonical_url' });
    const byId = evaluateLeadApplicationMatch([app({ external_job_id: 'REQ-9', source: 'greenhouse', company_name: 'Other', role_title: 'Other' })], leadIn({ externalJobId: 'REQ-9', sourceName: 'greenhouse' }));
    expect(byId).toMatchObject({ state: 'MATCHED', basis: 'external_job_id' });
    expect(Object.keys(byUrl.application!).sort()).toEqual(['company', 'id', 'outcome', 'stage', 'status', 'title']); // no URL, no timestamps
  });

  it('MATCHED by company + role with agreeing context; company alone is never a match', () => {
    expect(evaluateLeadApplicationMatch([app()], leadIn())).toMatchObject({ state: 'MATCHED', application: { company: 'Acme Inc.', title: 'QA Engineer' } });
    expect(evaluateLeadApplicationMatch([app()], leadIn({ title: 'Data Scientist' })).state).toBe('UNMATCHED');
    expect(evaluateLeadApplicationMatch([app()], leadIn({ company: 'Other Corp' })).state).toBe('UNMATCHED');
    expect(evaluateLeadApplicationMatch([], leadIn()).state).toBe('UNMATCHED');
  });

  it('POSSIBLE is never authoritative: candidates are listed, none is selected', () => {
    const two = [app(), app({ id: '00000000-0000-4000-8000-000000000002', last_activity_at: '2026-09-29T10:00:00Z' })];
    const m = evaluateLeadApplicationMatch(two, leadIn());
    expect(m.state).toBe('POSSIBLE');
    expect(m.application).toBeNull();
    expect(m.possible).toHaveLength(2);
    const stale = evaluateLeadApplicationMatch([app({ last_activity_at: '2026-01-01T10:00:00Z', created_at: '2026-01-01T10:00:00Z' })], leadIn());
    expect(stale.state).toBe('POSSIBLE');
    expect(stale.application).toBeNull();
  });

  it('an archived application is never a candidate', () => {
    expect(evaluateLeadApplicationMatch([app({ archived_at: '2026-09-30T00:00:00Z' })], leadIn()).state).toBe('UNMATCHED');
  });

  it('the batch matcher only SELECTs the owner\'s live applications, scoped by workspace + owner (no write verb exists)', async () => {
    const { client, calls } = recorder({ applications: [app()] });
    const out = await matchLeadsToApplications(client, WS, [{ id: 'lead-1', ownerId: OWNER, ...leadIn() }, { id: 'lead-2', ownerId: OWNER, ...leadIn({ company: 'Nobody' }) }]);
    expect(out.get('lead-1')!.state).toBe('MATCHED');
    expect(out.get('lead-2')!.state).toBe('UNMATCHED');
    expect(calls).toHaveLength(1); // one bounded read per distinct owner
    expect(calls[0]!.table).toBe('applications');
    expect(calls[0]!.ops).toEqual(expect.arrayContaining(['select', 'eq', 'is']));
    for (const forbidden of ['insert', 'update', 'upsert', 'delete', 'rpc']) expect(calls[0]!.ops).not.toContain(forbidden);
  });

  it('a read failure rejects (callers degrade to "no match info"), and the list still returns its leads', async () => {
    const failing = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ order: () => ({ limit: () => Promise.resolve({ data: null, error: { code: 'X' } }) }) }) }) }) }) }) };
    await expect(matchLeadsToApplications(failing, WS, [{ id: 'l', ownerId: OWNER, ...leadIn() }])).rejects.toThrow('MATCH_READ_FAILED');
    const { client } = recorder({ ai_job_leads: [], applications: [] });
    const r = await listJobLeads({ workspaceId: WS, accessToken: 'x'.repeat(30) }, { sort: 'freshness' }, {}, { env: ON, client: client as never });
    expect(r.ok).toBe(true);
  });

  it('getJobLeadApplicationMatches validates its ids and workspace', async () => {
    const { client } = recorder({ ai_job_leads: [] });
    const ctx = { workspaceId: WS, accessToken: 'x'.repeat(30) };
    expect((await getJobLeadApplicationMatches(ctx, [], { env: ON, client: client as never })).ok).toBe(false);
    expect((await getJobLeadApplicationMatches(ctx, ['not-a-uuid'], { env: ON, client: client as never })).ok).toBe(false);
    expect((await getJobLeadApplicationMatches(ctx, Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`), { env: ON, client: client as never })).ok).toBe(false);
    expect((await getJobLeadApplicationMatches({ workspaceId: 'nope', accessToken: 'x'.repeat(30) }, ['00000000-0000-4000-8000-000000000001'], { env: ON, client: client as never })).ok).toBe(false);
    const ok = await getJobLeadApplicationMatches(ctx, ['00000000-0000-4000-8000-000000000001'], { env: ON, client: client as never });
    expect(ok).toEqual({ ok: true, data: {} }); // an unreadable / unknown id is simply absent
  });
});

describe('AI-11D lead list: freshness first, strict filters', () => {
  const leadRow = (over: Record<string, unknown> = {}) => ({
    id: 'r1', finding_id: 'f1', user_id: OWNER, company: 'Acme', title: 'QA Engineer', location: 'Remote', work_arrangement: 'remote', employment_type: 'full_time',
    source_name: 'greenhouse', source_url: 'https://jobs.example.com/p/1', canonical_url: 'https://jobs.example.com/p/1', external_job_id: 'REQ-1',
    posted_date: '2026-10-01', posted_at: '2026-10-01T10:00:00+00:00', discovered_at: '2026-10-01T11:00:00Z', freshness_at: '2026-10-01T10:00:00+00:00',
    remote_scope: 'us', remote_note: null, experience_min_years: 2, experience_max_years: null, fit_reasons: ['Selenium'], gap_reasons: ['2 years'],
    salary_min: null, salary_max: null, salary_currency: null, salary_period: null, experience_level: null, match_score: 82, required_skills: [], preferred_skills: [],
    description_truncated: false, description_length: null, finding: { provider: 'claude', status: 'NEW', priority: 'NORMAL', confidence: 0.8, summary: 's', payload: {} }, ...over,
  });

  it('maps the AI-11D columns; an unknown posting time stays null and the freshness key is not exposed as a posted time', () => {
    const l = toJobLead(leadRow());
    expect(l).toMatchObject({ postedAt: '2026-10-01T10:00:00+00:00', remoteScope: 'us', experienceMinYears: 2, experienceMaxYears: null, fitReasons: ['Selenium'], gapReasons: ['2 years'], canonicalUrl: 'https://jobs.example.com/p/1', externalJobId: 'REQ-1', applicationMatch: null });
    const unknown = toJobLead(leadRow({ posted_at: null, posted_date: null, freshness_at: '2026-10-01T11:00:00Z', remote_scope: null, location: 'Remote' }));
    expect(unknown.postedAt).toBeNull();
    expect(unknown.postedDate).toBeNull();
    expect(unknown.remoteScope).toBeNull(); // "Remote" alone is not "Remote US"
    expect(toJobLead(leadRow({ remote_scope: null, location: 'Remote - United States' })).remoteScope).toBe('us');
    expect(toJobLead(leadRow({ work_arrangement: 'hybrid', remote_scope: 'us' })).remoteScope).toBeNull();
    expect(toJobLead(leadRow({ fit_reasons: 'not-an-array', gap_reasons: null })).fitReasons).toEqual([]);
  });

  it('orders by freshness, then match, then id by default; sort / recentHours / remoteScope are strict', async () => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const chain: Record<string, unknown> = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') return (res: (v: unknown) => void) => res({ data: [], error: null });
        return (...args: unknown[]) => { calls.push({ method: prop, args }); return chain; };
      },
    });
    const db = { from: () => chain } as never;
    const ctx = { workspaceId: WS, accessToken: 'x'.repeat(30) };
    expect((await listJobLeads(ctx, {}, {}, { env: ON, client: db })).ok).toBe(true);
    const orders = calls.filter((c) => c.method === 'order').map((c) => c.args[0]);
    expect(orders.slice(0, 3)).toEqual(['freshness_at', 'match_score', 'id']);
    calls.length = 0;
    await listJobLeads(ctx, { remoteScope: 'us', recentHours: 24 }, {}, { env: ON, client: db });
    expect(calls.some((c) => c.method === 'eq' && c.args[0] === 'remote_scope' && c.args[1] === 'us')).toBe(true);
    expect(calls.some((c) => c.method === 'gte' && c.args[0] === 'freshness_at')).toBe(true);
    for (const bad of [{ sort: 'random' }, { recentHours: 5 }, { remoteScope: 'moon' }, { applicationId: 'x' }, { userId: OWNER }]) {
      const r = await listJobLeads(ctx, bad as never, {}, { env: ON, client: db });
      expect(r.ok, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('AI-11D discovery profile service', () => {
  it('returns the generic default with configured:false when nothing is saved, and the saved row mapped when it is', async () => {
    const ctx = { workspaceId: WS, accessToken: 'x'.repeat(30) };
    const none = await getJobDiscoveryProfile(ctx, { env: ON, client: recorder({ ai_job_discovery_profiles: [] }).client as never });
    expect(none).toEqual({ ok: true, data: { profile: DEFAULT_DISCOVERY_PROFILE, configured: false, updatedAt: null } });
    const row = { target_titles: ['QA Engineer'], include_restricted_remote: false, cities: ['Houston, TX'], work_arrangements: ['remote', 'hybrid'], employment_types: ['full_time'], freshness_window_hours: 48, allow_unknown_posted_date: false, max_experience_years: 3, experience_tolerance_years: 1, excluded_title_terms: ['Senior'], exclude_clearance: true, software_qa_gate: true, minimum_match_score: 60, maximum_results: 10, core_skills: ['SQL'], updated_at: '2026-10-01T00:00:00Z' };
    const saved = await getJobDiscoveryProfile(ctx, { env: ON, client: recorder({ ai_job_discovery_profiles: [row] }).client as never });
    expect(saved.ok && saved.data).toMatchObject({ configured: true, updatedAt: '2026-10-01T00:00:00Z', profile: { targetTitles: ['QA Engineer'], freshnessWindowHours: 48, softwareQaGate: true, maximumResults: 10 } });
  });

  it('the provider-visible profile contains only discovery criteria: no identity, credentials or other profile fields', async () => {
    const ctx = { workspaceId: WS, accessToken: 'x'.repeat(30) };
    const r = await getJobDiscoveryProfile(ctx, { env: ON, client: recorder({ ai_job_discovery_profiles: [{ user_id: OWNER, workspace_id: WS, email: 'a@b.c', display_name: 'Pat', target_titles: [] }] }).client as never });
    expect(JSON.stringify(r)).not.toMatch(/email|display_name|a@b\.c|Pat|user_id|workspace_id|token|secret/i);
    expect(Object.keys((r as { data: { profile: object } }).data.profile).sort()).toEqual(Object.keys(DEFAULT_DISCOVERY_PROFILE).sort());
  });

  it('save validates first, honours the kill switch, and goes through the service RPC with the session actor', async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const writer = { rpc: async (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return { data: { id: 'p1', created: true }, error: null }; } };
    const ctx = { workspaceId: WS, userId: OWNER };
    const bad = await saveJobDiscoveryProfile(ctx, { freshnessWindowHours: 5 }, { writer, aiHubEnabled: () => true });
    expect(bad).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT', field: 'freshnessWindowHours' } });
    expect(calls).toHaveLength(0);
    expect(await saveJobDiscoveryProfile(ctx, {}, { writer, aiHubEnabled: () => false })).toMatchObject({ ok: false, error: { code: 'AI_HUB_DISABLED' } });
    expect(await saveJobDiscoveryProfile({ workspaceId: 'x', userId: OWNER }, {}, { writer, aiHubEnabled: () => true })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    const ok = await saveJobDiscoveryProfile(ctx, { targetTitles: ['QA Engineer'], user_id: 'someone-else' }, { writer, aiHubEnabled: () => true });
    expect(ok).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT', field: 'user_id' } }); // identity fields are rejected, never honoured
    const good = await saveJobDiscoveryProfile(ctx, { targetTitles: ['QA Engineer'] }, { writer, aiHubEnabled: () => true });
    expect(good).toEqual({ ok: true, data: { created: true } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.fn).toBe('rpc_ai_job_discovery_profile_save');
    expect(calls[0]!.args).toMatchObject({ p_actor_id: OWNER, p_workspace_id: WS });
    expect((calls[0]!.args.p_profile as { target_titles: string[] }).target_titles).toEqual(['QA Engineer']);
    const denied = await saveJobDiscoveryProfile(ctx, {}, { writer: { rpc: async () => ({ data: null, error: { code: '42501' } }) }, aiHubEnabled: () => true });
    expect(denied).toMatchObject({ ok: false, error: { code: 'WORKSPACE_ACCESS_DENIED' } });
  });
});

describe('AI-11D never creates or changes an application; MCP stays read-only', () => {
  const read = (p: string) => readFileSync(p, 'utf8');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

  it('the new services and routes contain no write to applications, tasks or contacts and no application-creating RPC', () => {
    for (const f of ['apps/api/src/services/aiLeadMatchService.ts', 'apps/api/src/services/aiJobDiscoveryService.ts', 'apps/api/src/routes/aiJobDiscovery.ts', 'apps/api/src/lib/aiContract/discovery.ts']) {
      const src = strip(read(f));
      expect(src, f).not.toMatch(/\.(insert|update|upsert|delete)\(/);
      expect(src, f).not.toMatch(/rpc_ai_action|rpc_ai_create_application|create_application|rpc_ai_apply_status/);
      expect(src, f).not.toMatch(/from\('(applications|tasks|contacts|interviews)'\)\.(insert|update|delete)/);
    }
    expect(strip(read('apps/api/src/services/aiLeadMatchService.ts'))).toMatch(/from\('applications'\)\.select\(/);
  });

  it('the profile RPCs are service_role only and the profile table has owner-only SELECT and no client write grant', () => {
    const sql = read('supabase/migrations/20261102100000_ai_hub_fresh_job_discovery.sql');
    expect(sql).toMatch(/revoke all on function public\.rpc_ai_job_discovery_profile_save\(uuid, uuid, jsonb\) from public, anon, authenticated;/);
    expect(sql).toMatch(/grant execute on function public\.rpc_ai_job_discovery_profile_save\(uuid, uuid, jsonb\) to service_role;/);
    expect(sql).toMatch(/grant execute on function public\.rpc_ai_job_discovery_profile_get\(uuid, uuid\) to service_role;/);
    expect(sql).toMatch(/grant select on public\.ai_job_discovery_profiles to authenticated;/);
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*ai_job_discovery_profiles[^;]*to authenticated/i);
    expect(sql).toMatch(/using \(user_id = \(select auth\.uid\(\)\) and public\.is_workspace_member\(workspace_id\)\)/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).not.toMatch(/\bdrop table\b|\btruncate\b|delete from public\.(applications|tasks|contacts)/i); // additive, forward-only
  });

  it('MCP: 15 tools (AI-11E adds the recruiter profile read, AI-11G the two execution tools), one data write; the profile read is read-only, scoped ai:read and takes no arguments', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    const { MCP_TOOLS } = await import('../../apps/api/src/mcp/tools');
    const schemas = await import('../../apps/api/src/mcp/schemas');
    expect(MCP_TOOLS).toHaveLength(15);
    expect(MCP_TOOLS.filter((t) => t.annotations.readOnlyHint !== true).map((t) => t.name).sort()).toEqual(['jobquest_claim_ai_execution', 'jobquest_report_ai_execution_failure', 'jobquest_submit_ai_result']);
    const tool = MCP_TOOLS.find((t) => t.name === 'jobquest_get_job_discovery_profile')!;
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
    expect(tool.scope).toBe('ai:read');
    expect(schemas.getJobDiscoveryProfileInput.safeParse({}).success).toBe(true);
    for (const extra of ['workspaceId', 'workspace_id', 'userId', 'user_id', 'profile', 'targetTitles']) expect(schemas.getJobDiscoveryProfileInput.safeParse({ [extra]: 'x' }).success, extra).toBe(false);
    expect(tool.description).toMatch(/Read-only/);
    expect(MCP_TOOLS.map((t) => t.name).join(' ')).not.toMatch(/create_|update_|delete|set_|save|search_web|scrape|browse|fetch_url/);
    // the list tool accepts the new filters and still rejects identity / authority fields
    expect(schemas.listJobLeadsInput.safeParse({ sort: 'freshness', recentHours: 24, remoteScope: 'us' }).success).toBe(true);
    expect(schemas.listJobLeadsInput.safeParse({ recentHours: 5 }).success).toBe(false);
    expect(schemas.listJobLeadsInput.safeParse({ sort: 'x' }).success).toBe(false);
    for (const extra of ['user_id', 'workspace_id', 'applicationId', 'createApplication']) expect(schemas.listJobLeadsInput.safeParse({ [extra]: 'x' }).success, extra).toBe(false);
  });

  it('MCP and OAuth code add no web search / scraping, and the AI-11D API surface adds no provider credentials or scheduler', () => {
    for (const dir of ['apps/api/src/mcp']) {
      for (const f of readdirSync(dir)) expect(strip(read(`${dir}/${f}`)), f).not.toMatch(/playwright|puppeteer|cheerio|jsdom|linkedin\.com|indeed\.com|dice\.com|ziprecruiter|glassdoor/i);
    }
    for (const f of ['apps/api/src/services/aiJobDiscoveryService.ts', 'apps/api/src/services/aiLeadMatchService.ts', 'apps/api/src/routes/aiJobDiscovery.ts']) {
      expect(strip(read(f)), f).not.toMatch(/fetch\(|axios|playwright|puppeteer|setInterval|node-cron|CronCreate|openai|anthropic/i);
    }
    const sql = read('supabase/migrations/20261102100000_ai_hub_fresh_job_discovery.sql');
    expect(sql).not.toMatch(/api_key|client_secret|access_token|refresh_token/i); // no credentials of any kind
  });
});
