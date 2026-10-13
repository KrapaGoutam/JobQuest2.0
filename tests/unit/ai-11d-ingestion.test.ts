import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_DISCOVERY_PROFILE, discoveryProfileToRpc } from '../../apps/api/src/lib/aiContract';
import { ingestAiResult, type AiRpcClient, type AiTrustedContext } from '../../apps/api/src/services/aiIntegrationService';
import { external, jobLeadFinding } from './fixtures/ai-contract/external';

// AI-11D: the discovery policy backstop and the source-status plumbing inside the ingestion orchestration, with a scripted
// RPC client. Persistence (columns, RLS, dedupe against a real DB) is proven in tests/integration/ai-11d-discovery.test.ts.
vi.mock('../../apps/api/src/lib/db', () => ({ admin: () => { throw new Error('Invalid server environment: SUPABASE_URL'); } }));

const WS = '11111111-1111-4111-8111-aaaaaaaaaaaa';
const USER = '22222222-2222-4222-8222-bbbbbbbbbbbb';
const RUN = '33333333-3333-4333-8333-cccccccccccc';
const ON = { AI_HUB_ENABLED: 'true' };
const NOW = Date.parse('2026-10-01T12:00:00Z');
const ctx: AiTrustedContext = { workspaceId: WS, userId: USER, actorKind: 'SERVICE_INGEST', correlationId: 'corr-11d' };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

type Call = { fn: string; args: Record<string, unknown> };
type Reply = { data?: unknown; error?: { message: string; code?: string } } | Error;

function fake(profile: Record<string, unknown> | null | 'error', handler: (fn: string, args: Record<string, unknown>) => Reply | undefined = () => undefined) {
  const calls: Call[] = [];
  let finding = 0;
  const client: AiRpcClient = {
    async rpc(fn, args) {
      calls.push({ fn, args });
      const custom = handler(fn, args);
      if (custom instanceof Error) throw custom;
      if (custom) return { data: custom.data ?? null, error: custom.error ?? null };
      if (fn === 'rpc_ai_job_discovery_profile_get') return profile === 'error' ? { data: null, error: { message: 'boom' } } : { data: { profile }, error: null };
      if (fn === 'rpc_ai_ingest_run') return { data: { run_id: RUN, created: true, status: 'RUNNING' }, error: null };
      if (fn === 'rpc_ai_ingest_finding') return { data: { finding_id: `f-${++finding}`, outcome: 'created' }, error: null };
      if (fn === 'rpc_ai_resolve_job_lead_key') return { data: { dedupe_key: null }, error: null };
      if (fn === 'rpc_ai_upsert_job_lead') return { data: { job_lead_id: 'jl-1', outcome: 'created' }, error: null };
      if (fn === 'rpc_ai_create_suggestion') return { data: { created: true }, error: null };
      return { data: { run_id: RUN, changed: true, status: args.p_status }, error: null };
    },
  };
  return { client, calls, of: (fn: string) => calls.filter((c) => c.fn === fn), names: () => calls.map((c) => c.fn) };
}

const profile = (over: Record<string, unknown> = {}) => discoveryProfileToRpc({ ...DEFAULT_DISCOVERY_PROFILE, workArrangements: ['remote', 'hybrid', 'onsite'], cities: ['Houston, TX'], ...over });
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

/** A job_discovery envelope with one lead per tag; every lead is a distinct posting. */
function doc(leads: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) {
  return {
    ...clone(external.jobDiscovery),
    run: { external_run_id: 'run-11d-1', generated_at: '2026-10-01T12:00:00Z' },
    findings: leads.map((p, i) => jobLeadFinding(
      { dedupe: { job_url: `https://jobs.example.com/p/${i}` }, source: { url: `https://jobs.example.com/p/${i}` }, title: `${p.role_title ?? 'QA Engineer'} at Example Corp` },
      { job_url: `https://jobs.example.com/p/${i}`, external_job_id: `EX-${i}`, role_title: 'QA Engineer', work_arrangement: 'remote', remote_scope: 'us', location: 'Remote', posted_date: undefined, ...p },
    )),
    ...extra,
  };
}
const run = async (input: unknown, f: ReturnType<typeof fake>) => ({ result: await ingestAiResult(ctx, input, { client: f.client, env: ON, log: () => undefined, now: () => NOW }), f });
const storedTitles = (f: ReturnType<typeof fake>) => f.of('rpc_ai_upsert_job_lead').map((c) => (c.args.p_lead as { title: string }).title);

describe('AI-11D discovery policy at ingestion', () => {
  it('reads the owner profile once, with the trusted actor and workspace', async () => {
    const { f } = await run(doc([{ posted_at: hoursAgo(2) }]), fake(profile()));
    expect(f.of('rpc_ai_job_discovery_profile_get')).toHaveLength(1);
    expect(f.of('rpc_ai_job_discovery_profile_get')[0]!.args).toEqual({ p_actor_id: USER, p_workspace_id: WS });
  });

  it('stores a known fresh posting and drops a known stale one; filtered leads are counted, never stored, and do not make the run PARTIAL', async () => {
    const { result, f } = await run(doc([
      { role_title: 'Fresh QA', posted_at: hoursAgo(3) },
      { role_title: 'Stale QA', posted_at: hoursAgo(70) },
    ]), fake(profile()));
    expect(result.success).toBe(true);
    expect(result.status).toBe('SUCCEEDED');
    expect(storedTitles(f)).toEqual(['Fresh QA']);
    expect(f.of('rpc_ai_ingest_finding')).toHaveLength(1);
    expect(result.counts).toMatchObject({ findingsCreated: 1, filteredItems: 1, filteredStale: 1, filteredUnknownDate: 0, rejectedItems: 0 });
    const fin = f.of('rpc_ai_finalize_run')[0]!.args;
    expect(fin.p_status).toBe('SUCCEEDED');
    expect(fin.p_counts).toMatchObject({ findings_created: 1, filtered_items: 1, filtered_stale: 1 });
    expect(fin).not.toHaveProperty('p_error_category');
  });

  it('an unknown posting date is dropped by default and stored (with no invented date) when the profile allows it', async () => {
    const leads = [{ role_title: 'Undated QA' }];
    const strict = await run(doc(leads), fake(profile()));
    expect(storedTitles(strict.f)).toEqual([]);
    expect(strict.result.counts).toMatchObject({ filteredItems: 1, filteredUnknownDate: 1 });
    const lenient = await run(doc(leads), fake(profile({ allowUnknownPostedDate: true })));
    expect(storedTitles(lenient.f)).toEqual(['Undated QA']);
    const stored = lenient.f.of('rpc_ai_upsert_job_lead')[0]!.args.p_lead as Record<string, unknown>;
    expect(stored.posted_at).toBeNull();
    expect(stored.posted_date).toBeNull();
  });

  it('drops restricted remote, excluded titles and non-software quality roles; keeps the rest', async () => {
    const { result, f } = await run(doc([
      { role_title: 'QA Engineer', posted_at: hoursAgo(1), description: 'Write test cases and Selenium automation for our web application; Agile team.' },
      { role_title: 'Senior QA Engineer', posted_at: hoursAgo(1) },
      { role_title: 'QA Analyst', posted_at: hoursAgo(1), remote_scope: 'restricted', remote_note: 'Must reside in TX or FL' },
      { role_title: 'Quality Assurance Specialist', posted_at: hoursAgo(1), description: 'Maintain GMP records and ISO 9001 audits on the production floor.' },
      { role_title: 'Test Engineer', posted_at: hoursAgo(1), description: 'Selenium and Playwright automation, API tests in Postman, CI/CD.' },
    ]), fake(profile({ softwareQaGate: true })));
    expect(storedTitles(f)).toEqual(['QA Engineer', 'Test Engineer']);
    expect(result.counts.filteredItems).toBe(3);
    expect(result.status).toBe('SUCCEEDED');
  });

  it('caps the stored leads at the profile maximum, best provider score first', async () => {
    const leads = ['A', 'B', 'C', 'D'].map((t, i) => ({ role_title: `Role ${t}`, posted_at: hoursAgo(1), match_score: [50, 90, 70, 80][i] }));
    const { result, f } = await run(doc(leads), fake(profile({ maximumResults: 2 })));
    expect(storedTitles(f).sort()).toEqual(['Role B', 'Role D']);
    expect(result.counts).toMatchObject({ filteredItems: 2, filteredOverLimit: 2, findingsCreated: 2 });
  });

  it('skips a suggestion that points at a filtered lead instead of failing it', async () => {
    const d = doc([{ role_title: 'Stale QA', posted_at: hoursAgo(70) }, { role_title: 'Fresh QA', posted_at: hoursAgo(1) }]) as Record<string, unknown>;
    d.suggestions = [{ finding_index: 0, action: 'create_application', proposed: { reason: 'good fit', priority: 'LOW' } }, { finding_index: 1, action: 'create_application', proposed: { reason: 'good fit', priority: 'LOW' } }];
    const { result, f } = await run(d, fake(profile()));
    expect(result.counts).toMatchObject({ suggestionsSkipped: 1, suggestionsCreated: 1, suggestionsFailed: 0 });
    expect(result.status).toBe('SUCCEEDED');
    expect(f.of('rpc_ai_create_suggestion')).toHaveLength(1);
  });

  it('without a saved profile nothing is filtered (existing behaviour); a profile read failure never loses the run', async () => {
    const stale = [{ role_title: 'Old QA', posted_at: hoursAgo(500) }, { role_title: 'Senior Dev', posted_at: hoursAgo(1) }];
    const none = await run(doc(stale), fake(null));
    expect(storedTitles(none.f)).toEqual(['Old QA', 'Senior Dev']);
    expect(none.result.counts.filteredItems).toBe(0);
    const broken = await run(doc(stale), fake('error'));
    expect(storedTitles(broken.f)).toEqual(['Old QA', 'Senior Dev']);
    expect(broken.result.success).toBe(true);
  });

  it('only job_discovery runs are filtered: the same lead in another workflow is stored and the profile is not even read', async () => {
    const other = { ...doc([{ role_title: 'Old QA', posted_at: hoursAgo(500) }]), workflow: 'other' };
    const { f } = await run(other, fake(profile()));
    expect(f.of('rpc_ai_job_discovery_profile_get')).toHaveLength(0);
    expect(storedTitles(f)).toEqual(['Old QA']);
  });

  it('passes the cross-source logical key to the identity resolver and the new lead columns to the projection', async () => {
    const { f } = await run(doc([{ role_title: 'QA Engineer (Remote)', posted_at: hoursAgo(2), experience_min_years: 2, fit_reasons: ['Matches Selenium'], gap_reasons: ['Wants 2 years'] }]), fake(profile()));
    const resolve = f.of('rpc_ai_resolve_job_lead_key')[0]!.args;
    expect(resolve.p_logical_key).toMatch(/^[0-9a-f]{64}$/);
    const lead = f.of('rpc_ai_upsert_job_lead')[0]!.args.p_lead as Record<string, unknown>;
    expect(lead).toMatchObject({ posted_at: hoursAgo(2), remote_scope: 'us', experience_min_years: 2, fit_reasons: ['Matches Selenium'], gap_reasons: ['Wants 2 years'] });
    expect(lead.logical_key).toBe(resolve.p_logical_key);
  });

  it('forwards per-source status to the run so "unavailable" is recorded as unavailable', async () => {
    const d = doc([], {
      sources: [
        { type: 'job_site', ref: 'board-a', status: 'ok', count: 4 },
        { type: 'job_site', ref: 'board-b', status: 'unavailable', note: 'connector not enabled' },
        { type: 'web', ref: 'web search', status: 'zero', count: 0 },
      ],
    });
    const { f, result } = await run(d, fake(profile()));
    expect(result.success).toBe(true);
    const sources = f.of('rpc_ai_ingest_run')[0]!.args.p_sources as Array<Record<string, unknown>>;
    expect(sources.map((s) => s.status)).toEqual(['ok', 'unavailable', 'zero']);
    expect(sources[1]).toMatchObject({ ref: 'board-b', note: 'connector not enabled' });
    expect(result.status).toBe('SUCCEEDED'); // an empty discovery run is a valid outcome, not an error
  });
});
