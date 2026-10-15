import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RECRUITER_PREFERENCES } from '../../apps/api/src/lib/aiContract';
import { listRecruiterIntel, toRecruiterIntel } from '../../apps/api/src/services/aiExternalIntelligenceService';
import { getRecruiterPreferences, saveRecruiterPreferences } from '../../apps/api/src/services/aiRecruiterDiscoveryService';

// AI-11E service boundaries: the recruiter preferences are owner scoped with a read-only provider view, the recruiter read is read-only and
// workspace scoped, and nothing in this phase can send a message, contact someone, or create/change an application, contact or task.
const WS = '11111111-1111-4111-8111-aaaaaaaaaaaa';
const OWNER = '22222222-2222-4222-8222-bbbbbbbbbbbb';
const ON = { AI_HUB_ENABLED: 'true' };
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

/** A recording PostgREST-style chain: every call is logged, awaiting it yields `rows`. */
function recorder(tables: Record<string, unknown[]>) {
  const calls: Array<{ table: string; ops: Array<{ op: string; args: unknown[] }> }> = [];
  const client = {
    from(table: string) {
      const entry = { table, ops: [] as Array<{ op: string; args: unknown[] }> };
      calls.push(entry);
      const chain: Record<string, unknown> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') return (res: (v: unknown) => void) => res({ data: tables[table] ?? [], error: null });
          return (...args: unknown[]) => { entry.ops.push({ op: prop, args }); return chain; };
        },
      });
      return chain;
    },
  };
  return { client, calls };
}

describe('AI-11E recruiter preferences service', () => {
  it('returns the generic default with configured:false when nothing is saved, and the saved row mapped when it is', async () => {
    const ctx = { workspaceId: WS, accessToken: 'x'.repeat(30) };
    const none = await getRecruiterPreferences(ctx, { env: ON, client: recorder({ ai_recruiter_discovery_preferences: [] }).client as never });
    expect(none).toEqual({ ok: true, data: { preferences: DEFAULT_RECRUITER_PREFERENCES, configured: false, updatedAt: null } });
    const row = { job_linked_enabled: false, target_networking_enabled: true, target_companies: ['Acme', 'Globex'], preferred_roles: ['technical_recruiter'], max_new_contacts_per_run: 4, draft_outreach_enabled: false, updated_at: '2026-10-01T00:00:00Z' };
    const r = recorder({ ai_recruiter_discovery_preferences: [row] });
    const saved = await getRecruiterPreferences(ctx, { env: ON, client: r.client as never });
    expect(saved.ok && saved.data).toMatchObject({ configured: true, updatedAt: '2026-10-01T00:00:00Z', preferences: { jobLinkedEnabled: false, targetNetworkingEnabled: true, targetCompanies: ['Acme', 'Globex'], preferredRoles: ['technical_recruiter'], maxNewContactsPerRun: 4, draftOutreachEnabled: false } });
    // workspace scoped, read as the caller (RLS), only the table it owns
    expect(r.calls.map((c) => c.table)).toEqual(['ai_recruiter_discovery_preferences']);
    expect(r.calls[0]!.ops.some((o) => o.op === 'eq' && o.args[0] === 'workspace_id' && o.args[1] === WS)).toBe(true);
    expect(r.calls[0]!.ops.map((o) => o.op)).not.toEqual(expect.arrayContaining(['insert', 'update', 'delete', 'upsert']));
  });

  it('the provider-visible view carries only recruiter preferences: no identity, credentials or other profile fields', async () => {
    const ctx = { workspaceId: WS, accessToken: 'x'.repeat(30) };
    const r = await getRecruiterPreferences(ctx, { env: ON, client: recorder({ ai_recruiter_discovery_preferences: [{ user_id: OWNER, workspace_id: WS, email: 'a@b.c', display_name: 'Pat', target_companies: ['Acme'] }] }).client as never });
    expect(JSON.stringify(r)).not.toMatch(/email|display_name|a@b\.c|Pat|user_id|workspace_id|token|secret/i);
    expect(Object.keys((r as { data: { preferences: object } }).data.preferences).sort()).toEqual(Object.keys(DEFAULT_RECRUITER_PREFERENCES).sort());
  });

  it('save validates first, honours the kill switch, and goes through the service RPC with the session actor', async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const writer = { rpc: async (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return { data: { id: 'p1', created: true }, error: null }; } };
    const ctx = { workspaceId: WS, userId: OWNER };
    const deps = { writer, aiHubEnabled: () => true };
    expect(await saveRecruiterPreferences(ctx, { maxNewContactsPerRun: 99 }, deps)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT', field: 'maxNewContactsPerRun' } });
    expect(await saveRecruiterPreferences(ctx, { targetNetworkingEnabled: true }, deps)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT', field: 'targetCompanies' } });
    expect(calls).toHaveLength(0);
    expect(await saveRecruiterPreferences(ctx, {}, { writer, aiHubEnabled: () => false })).toMatchObject({ ok: false, error: { code: 'AI_HUB_DISABLED' } });
    expect(await saveRecruiterPreferences({ workspaceId: 'x', userId: OWNER }, {}, deps)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    // identity / authority / provider fields are rejected, never honoured
    for (const k of ['user_id', 'workspace_id', 'provider', 'role']) expect(await saveRecruiterPreferences(ctx, { [k]: 'x' }, deps), k).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT', field: k } });
    const good = await saveRecruiterPreferences(ctx, { targetCompanies: ['Acme', 'ACME Inc.'], targetNetworkingEnabled: true }, deps);
    expect(good).toEqual({ ok: true, data: { created: true } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.fn).toBe('rpc_ai_recruiter_prefs_save');
    expect(calls[0]!.args).toMatchObject({ p_actor_id: OWNER, p_workspace_id: WS });
    expect((calls[0]!.args.p_prefs as { target_companies: string[] }).target_companies).toEqual(['Acme']);
    const denied = await saveRecruiterPreferences(ctx, {}, { writer: { rpc: async () => ({ data: null, error: { code: '42501' } }) }, aiHubEnabled: () => true });
    expect(denied).toMatchObject({ ok: false, error: { code: 'WORKSPACE_ACCESS_DENIED' } });
    const failed = await saveRecruiterPreferences(ctx, {}, { writer: { rpc: async () => ({ data: null, error: { code: 'XX000' } }) }, aiHubEnabled: () => true });
    expect(failed).toMatchObject({ ok: false, error: { code: 'SAVE_FAILED' } });
  });
});

describe('AI-11E recruiter read service', () => {
  const row = (payload: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
    id: '00000000-0000-4000-8000-0000000000a1', user_id: OWNER, provider: 'claude', status: 'NEW', confidence: 0.8, title: 'Pat, Acme', summary: 'Cited.',
    source_ref: { url: 'https://acme.example.com/team' }, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-02T10:00:00Z', payload, ...over,
  });

  it('maps the canonical fields: why, basis, mode, posting contact, drafts, last seen; and never a phone, a provider id or an identity key', () => {
    const dto = toRecruiterIntel(row({
      recruiter_name: 'Pat', company: 'Acme', role_title: 'Technical Recruiter', relationship: 'technical_recruiter', verification: 'verified', verification_basis: 'job_posting', posting_contact: true,
      why: 'Named as the contact in the posting.', discovery_mode: 'job_linked', draft_note: 'Hi Pat, I would value connecting.', draft_email: { subject: 'Hello', body: 'Body' },
      contact_email: 'pat@acme.example.com', contact_phone: '+1 555 0100', contact_source_url: 'https://acme.example.com/contact', person_key: 'abc', profile_key: 'def', identity_keys: ['k'], person_id: 'p-9',
    }));
    expect(dto).toMatchObject({
      name: 'Pat', verification: 'verified', verificationBasis: 'job_posting', postingContact: true, why: 'Named as the contact in the posting.', discoveryMode: 'job_linked',
      draftNote: 'Hi Pat, I would value connecting.', draftEmail: { subject: 'Hello', body: 'Body' }, lastSeenAt: '2026-10-02T10:00:00Z', discoveredAt: '2026-10-01T10:00:00Z',
      contact: { email: 'pat@acme.example.com', sourceUrl: 'https://acme.example.com/contact' }, applicationMatch: null,
    });
    expect(JSON.stringify(dto)).not.toMatch(/555|person_key|profile_key|identity_keys|person_id|p-9|abc|def/);
  });

  it('shows uncertain people as uncertain with no basis, and ignores an unknown mode or a half-written email draft', () => {
    const dto = toRecruiterIntel(row({ recruiter_name: 'Sam', company: 'Acme', verification: 'uncertain', verification_basis: 'company_page', discovery_mode: 'everyone', draft_email: { subject: 'No body' } }));
    expect(dto).toMatchObject({ verification: 'uncertain', verificationBasis: null, discoveryMode: null, draftEmail: null, contact: null });
  });

  it('a work email without its cited source is not shown', () => {
    expect(toRecruiterIntel(row({ recruiter_name: 'Sam', company: 'Acme', contact_email: 'sam@acme.example.com' })).contact).toBeNull();
  });

  it('list filters (verification, relationship, mode, company, provider, status) are validated and read-only; unknown filters and bad ids are refused', async () => {
    const ctx = { workspaceId: WS, accessToken: 'x'.repeat(30) };
    const r = recorder({ ai_findings: [row({ recruiter_name: 'Pat', company: 'Acme', verification: 'verified' })] });
    const out = await listRecruiterIntel(ctx, { verification: 'verified', relationship: 'technical_recruiter', mode: 'job_linked', company: 'Acme', status: 'ACTIVE' }, undefined, { env: ON, client: r.client as never });
    expect(out.ok).toBe(true);
    const eqs = r.calls[0]!.ops.filter((o) => o.op === 'eq').map((o) => `${String(o.args[0])}=${String(o.args[1])}`);
    expect(eqs).toEqual(expect.arrayContaining(['workspace_id=' + WS, 'kind=recruiter_intel', 'payload->>verification=verified', 'payload->>relationship=technical_recruiter', 'payload->>discovery_mode=job_linked']));
    expect(r.calls[0]!.ops.map((o) => o.op)).not.toEqual(expect.arrayContaining(['insert', 'update', 'delete', 'upsert']));
    expect(await listRecruiterIntel(ctx, { verification: 'maybe' } as never, undefined, { env: ON, client: recorder({}).client as never })).toMatchObject({ ok: false, error: { code: 'INVALID_FILTER' } });
    expect(await listRecruiterIntel(ctx, { mode: 'everyone' } as never, undefined, { env: ON, client: recorder({}).client as never })).toMatchObject({ ok: false });
    expect(await listRecruiterIntel(ctx, { user_id: OWNER } as never, undefined, { env: ON, client: recorder({}).client as never })).toMatchObject({ ok: false });
    expect(await listRecruiterIntel(ctx, { relatedLeadId: 'not-a-uuid' } as never, undefined, { env: ON, client: recorder({}).client as never })).toMatchObject({ ok: false, error: { code: 'INVALID_FILTER' } });
  });

  it('a related-lead filter that names a lead the caller cannot read matches nothing (cross-workspace linkage is impossible)', async () => {
    const ctx = { workspaceId: WS, accessToken: 'x'.repeat(30) };
    const r = recorder({ ai_findings: [], ai_job_leads: [] });
    const out = await listRecruiterIntel(ctx, { relatedLeadId: '99999999-9999-4999-8999-999999999999' }, undefined, { env: ON, client: r.client as never });
    expect(out.ok && out.data.items).toEqual([]);
    // the lead lookups are scoped to the caller's workspace
    for (const c of r.calls.filter((x) => x.table === 'ai_job_leads' || x.table === 'ai_findings')) expect(c.ops.some((o) => o.op === 'eq' && o.args[0] === 'workspace_id' && o.args[1] === WS)).toBe(true);
  });
});

describe('AI-11E never sends, contacts or changes core data; MCP stays read-only', () => {
  it('the recruiter code contains no write to applications, tasks or contacts, no application-creating RPC and no messaging', () => {
    for (const f of ['apps/api/src/lib/aiContract/recruiter.ts', 'apps/api/src/services/aiRecruiterDiscoveryService.ts', 'apps/api/src/routes/aiRecruiterDiscovery.ts']) {
      const src = strip(read(f));
      expect(src, f).not.toMatch(/\.(insert|update|upsert|delete)\(/);
      expect(src, f).not.toMatch(/rpc_ai_action|rpc_ai_create_application|create_application|rpc_ai_apply_status|create_contact|create_task/);
      expect(src, f).not.toMatch(/from\('(applications|tasks|contacts|interviews)'\)/);
      expect(src, f).not.toMatch(/fetch\(|axios|playwright|puppeteer|nodemailer|sendgrid|resend|smtp|mailto:|linkedin\.com|setInterval|node-cron|openai|anthropic/i);
    }
  });

  it('the ingestion recruiter policy calls only the four recruiter RPCs plus the approved ingestion RPCs', () => {
    const src = strip(read('apps/api/src/services/aiIntegrationService.ts'));
    const policy = /async function recruiterPolicy[\s\S]*?\n}\n/.exec(src)?.[0] ?? '';
    expect(policy.length).toBeGreaterThan(500);
    const rpcs = [...policy.matchAll(/'(rpc_[a-z_]+)'/g)].map((m) => m[1]);
    expect([...new Set(rpcs)].sort()).toEqual(['rpc_ai_recruiter_active_companies', 'rpc_ai_recruiter_prefs_get', 'rpc_ai_resolve_recruiter_key']);
  });

  it('the recruiter RPCs are service_role only and the preferences table has owner-only SELECT and no client write grant', () => {
    const sql = read('supabase/migrations/20261103100000_ai_hub_recruiter_intelligence.sql');
    for (const sig of ['rpc_ai_recruiter_prefs_save(uuid, uuid, jsonb)', 'rpc_ai_recruiter_prefs_get(uuid, uuid)', 'rpc_ai_resolve_recruiter_key(uuid, uuid, text[], text, text)', 'rpc_ai_recruiter_active_companies(uuid, uuid, text[], timestamptz)']) {
      expect(sql).toContain(`revoke all on function public.${sig} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${sig} to service_role;`);
    }
    expect(sql).toMatch(/grant select on public\.ai_recruiter_discovery_preferences to authenticated;/);
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*ai_recruiter_discovery_preferences[^;]*to authenticated/i);
    expect(sql).toMatch(/using \(user_id = \(select auth\.uid\(\)\) and public\.is_workspace_member\(workspace_id\)\)/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/set search_path = ''/);
    expect(sql).not.toMatch(/\bdrop table\b|\btruncate\b|delete from public\.(applications|tasks|contacts)|alter table public\.(applications|contacts|tasks)/i); // additive, forward-only
    expect(sql).not.toMatch(/api_key|client_secret|access_token|refresh_token|create table public\.ai_recruiter(?!_discovery_preferences)/i); // no credentials, no second people table
    expect([...sql.matchAll(/create table public\.([a-z_]+)/g)].map((m) => m[1])).toEqual(['ai_recruiter_discovery_preferences']);
  });

  it('MCP: 15 tools (12 reads + submit + the two AI-11G execution tools); the recruiter profile read is read-only, scoped ai:read and takes no arguments; the recruiter list stays read-only', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    const { MCP_TOOLS } = await import('../../apps/api/src/mcp/tools');
    const schemas = await import('../../apps/api/src/mcp/schemas');
    expect(MCP_TOOLS).toHaveLength(15);
    expect(MCP_TOOLS.filter((t) => t.annotations.readOnlyHint !== true).map((t) => t.name).sort()).toEqual(['jobquest_claim_ai_execution', 'jobquest_report_ai_execution_failure', 'jobquest_submit_ai_result']);
    const tool = MCP_TOOLS.find((t) => t.name === 'jobquest_get_recruiter_discovery_profile')!;
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
    expect(tool.scope).toBe('ai:read');
    expect(schemas.getRecruiterDiscoveryProfileInput.safeParse({}).success).toBe(true);
    for (const extra of ['workspaceId', 'workspace_id', 'userId', 'user_id', 'preferences', 'targetCompanies']) expect(schemas.getRecruiterDiscoveryProfileInput.safeParse({ [extra]: 'x' }).success, extra).toBe(false);
    expect(tool.description).toMatch(/Read-only/);
    const list = MCP_TOOLS.find((t) => t.name === 'jobquest_list_recruiter_intel')!;
    expect(list.annotations).toMatchObject({ readOnlyHint: true });
    expect(list.description).toMatch(/Searches nothing, sends nothing/);
    expect(schemas.listRecruiterIntelInput.safeParse({ verification: 'verified', relationship: 'qa_manager', mode: 'target_company', relatedLeadId: '99999999-9999-4999-8999-999999999999', company: 'Acme' }).success).toBe(true);
    expect(schemas.listRecruiterIntelInput.safeParse({ verification: 'maybe' }).success).toBe(false);
    expect(schemas.listRecruiterIntelInput.safeParse({ relatedLeadId: 'x' }).success).toBe(false);
    for (const extra of ['user_id', 'workspace_id', 'send', 'sendEmail', 'contact', 'outreach', 'createContact', 'applicationId']) expect(schemas.listRecruiterIntelInput.safeParse({ [extra]: 'x' }).success, extra).toBe(false);
    expect(MCP_TOOLS.map((t) => t.name).join(' ')).not.toMatch(/create_|update_|delete|set_|save|send|linkedin|outreach|contact_|search_web|scrape|browse|fetch_url|enrich/);
  });

  it('MCP and API code add no people-search, scraping, email lookup or outbound messaging', () => {
    for (const f of readdirSync('apps/api/src/mcp')) {
      expect(strip(read(`apps/api/src/mcp/${f}`)), f).not.toMatch(/playwright|puppeteer|cheerio|jsdom|linkedin\.com|apollo\.io|hunter\.io|zoominfo|rocketreach|nodemailer|sendgrid/i);
    }
    const idx = strip(read('apps/api/package.json'));
    expect(idx).not.toMatch(/nodemailer|sendgrid|puppeteer|playwright|cheerio|linkedin|apollo|hunter/i);
  });
});
