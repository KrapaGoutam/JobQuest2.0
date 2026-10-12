import { describe, expect, it, vi } from 'vitest';
import { ingestAiResult, type AiRpcClient, type AiTrustedContext } from '../../apps/api/src/services/aiIntegrationService';
import { external, jobLeadFinding } from './fixtures/ai-contract/external';

// Orchestration of the AI-6 job-lead child projection with a scripted RPC client. Persistence
// semantics (child rows, dedupe, RLS, audit counts) are proven against a real DB in
// tests/integration/ai-6-sources.test.ts.
vi.mock('../../apps/api/src/lib/db', () => ({ admin: () => { throw new Error('Invalid server environment: SUPABASE_URL'); } }));

const WS = '11111111-1111-4111-8111-aaaaaaaaaaaa';
const USER = '22222222-2222-4222-8222-bbbbbbbbbbbb';
const RUN = '33333333-3333-4333-8333-cccccccccccc';
const ON = { AI_HUB_ENABLED: 'true' };
const ctx: AiTrustedContext = { workspaceId: WS, userId: USER, actorKind: 'SERVICE_INGEST', correlationId: 'corr-6' };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

type Call = { fn: string; args: Record<string, unknown> };
type Reply = { data?: unknown; error?: { message: string; code?: string } } | Error;

function fake(handler: (fn: string, args: Record<string, unknown>) => Reply | undefined = () => undefined) {
  const calls: Call[] = [];
  let finding = 0;
  const client: AiRpcClient = {
    async rpc(fn, args) {
      calls.push({ fn, args });
      const custom = handler(fn, args);
      if (custom instanceof Error) throw custom;
      if (custom) return { data: custom.data ?? null, error: custom.error ?? null };
      if (fn === 'rpc_ai_ingest_run') return { data: { run_id: RUN, created: true, status: 'RUNNING' }, error: null };
      if (fn === 'rpc_ai_ingest_finding') return { data: { finding_id: `f-${++finding}`, outcome: 'created' }, error: null };
      if (fn === 'rpc_ai_resolve_job_lead_key') return { data: { dedupe_key: null }, error: null };
      if (fn === 'rpc_ai_upsert_job_lead') return { data: { job_lead_id: 'jl-1', outcome: 'created' }, error: null };
      return { data: { run_id: RUN, changed: true, status: args.p_status }, error: null };
    },
  };
  return { client, calls, of: (fn: string) => calls.filter((c) => c.fn === fn), names: () => calls.map((c) => c.fn) };
}
const run = async (input: unknown, f = fake()) => ({ result: await ingestAiResult(ctx, input, { client: f.client, env: ON, log: () => undefined }), f });

describe('job lead projection orchestration', () => {
  it('resolves identity, ingests the parent finding, then projects the child (parent audited once by its own RPC)', async () => {
    const { result, f } = await run(external.jobDiscovery);
    expect(result.success).toBe(true);
    expect(f.names()).toEqual(['rpc_ai_ingest_run', 'rpc_ai_resolve_job_lead_key', 'rpc_ai_ingest_finding', 'rpc_ai_upsert_job_lead', 'rpc_ai_finalize_run']);
    const up = f.of('rpc_ai_upsert_job_lead')[0]!.args;
    expect(up).toMatchObject({ p_actor_id: USER, p_finding_id: 'f-1' });
    expect(up.p_lead).toMatchObject({ company: 'Example Corp', title: 'Staff Engineer', match_score: 86, canonical_url: 'https://jobs.example.com/posting/42', payload_version: '1.0' });
    expect((up.p_lead as { description: string }).description).toContain('Build reliable systems');
    // no audit RPC exists for the projection, and the finding payload does not carry the description
    expect(JSON.stringify(f.of('rpc_ai_ingest_finding')[0]!.args.p_payload)).not.toContain('Build reliable systems');
  });

  it('never sends identity, workspace or application ids from the provider', async () => {
    const { f } = await run(external.jobDiscovery);
    for (const c of f.calls) {
      expect(Object.keys(c.args)).not.toContain('p_application_id');
      expect(JSON.stringify(c.args.p_lead ?? {})).not.toMatch(/user_id|workspace_id|application_id/);
    }
    expect(f.of('rpc_ai_resolve_job_lead_key')[0]!.args).toMatchObject({ p_actor_id: USER, p_workspace_id: WS });
  });

  it('reuses the existing lead\'s dedupe key when the same posting is already stored (cross-provider, different identity tier)', async () => {
    const f = fake((fn) => (fn === 'rpc_ai_resolve_job_lead_key' ? { data: { dedupe_key: 'job:existing-key' } } : undefined));
    const { f: used } = await run({ ...clone(external.jobDiscovery), provider: 'chatgpt' }, f);
    expect(used.of('rpc_ai_ingest_finding')[0]!.args.p_dedupe_key).toBe('job:existing-key');
  });

  it('a resolver failure never blocks ingestion: the computed key is used', async () => {
    for (const reply of [{ error: { message: 'boom', code: 'XX000' } }, new Error('network'), { data: { dedupe_key: 'has space' } }] as Reply[]) {
      const f = fake((fn) => (fn === 'rpc_ai_resolve_job_lead_key' ? reply : undefined));
      const { result, f: used } = await run(external.jobDiscovery, f);
      expect(result.success).toBe(true);
      expect(String(used.of('rpc_ai_ingest_finding')[0]!.args.p_dedupe_key)).toMatch(/^job:[0-9a-f]{64}$/);
    }
  });

  it('skips resolution when the lead has neither URL nor external id', async () => {
    const doc = clone(external.jobDiscovery) as { findings: Array<Record<string, any>> };
    doc.findings = [jobLeadFinding({ dedupe: {}, source: undefined }, { job_url: undefined, external_job_id: undefined, source_name: 'Example Jobs', location: undefined })];
    const { result, f } = await run(doc);
    expect(result.success).toBe(true);
    expect(f.of('rpc_ai_resolve_job_lead_key')).toHaveLength(0);
    expect(f.of('rpc_ai_upsert_job_lead')).toHaveLength(1);
  });

  it('a duplicate or updated parent still projects (idempotent heal); a closed parent does not', async () => {
    for (const outcome of ['duplicate', 'updated']) {
      const { f } = await run(external.jobDiscovery, fake((fn) => (fn === 'rpc_ai_ingest_finding' ? { data: { finding_id: 'f-9', outcome } } : undefined)));
      expect(f.of('rpc_ai_upsert_job_lead')).toHaveLength(1);
    }
    const { result, f } = await run(external.jobDiscovery, fake((fn) => (fn === 'rpc_ai_ingest_finding' ? { data: { finding_id: 'f-9', outcome: 'unchanged_closed' } } : undefined)));
    expect(f.of('rpc_ai_upsert_job_lead')).toHaveLength(0);
    expect(result.counts.findingsClosed).toBe(1);
  });

  it('an item-scoped projection failure ends the run PARTIAL, keeps the stored finding and tells the provider to re-submit', async () => {
    const { result, f } = await run(external.jobDiscovery, fake((fn) => (fn === 'rpc_ai_upsert_job_lead' ? { error: { message: 'AI_FINDING_INVALID_JOB_LEAD', code: '22023' } } : undefined)));
    expect(result.success).toBe(true);
    expect(result.status).toBe('PARTIAL');
    expect(result.counts).toMatchObject({ findingsCreated: 1, findingsFailed: 1 });
    expect(result.errors[0]).toMatchObject({ code: 'PROJECT_JOB_LEAD_FAILED', path: 'findings[0]', dbCode: 'AI_FINDING_INVALID_JOB_LEAD', category: 'INTERNAL' });
    expect(result.errors[0]!.message).toMatch(/re-submit/);
    expect(f.of('rpc_ai_finalize_run')[0]!.args).toMatchObject({ p_status: 'PARTIAL' });
  });

  it('a CHECK violation in the child is item-scoped; a transport failure is systemic and stops the run', async () => {
    const check = await run(external.jobDiscovery, fake((fn) => (fn === 'rpc_ai_upsert_job_lead' ? { error: { message: 'violates check constraint', code: '23514' } } : undefined)));
    expect(check.result.status).toBe('PARTIAL');
    const doc = { ...clone(external.jobDiscovery), findings: [jobLeadFinding(), jobLeadFinding({ dedupe: { job_url: 'https://jobs.example.com/posting/43' }, source: { url: 'https://jobs.example.com/posting/43' } }, { job_url: 'https://jobs.example.com/posting/43', external_job_id: 'EX-43' })] };
    const sys = await run(doc, fake((fn) => (fn === 'rpc_ai_upsert_job_lead' ? new Error('network') : undefined)));
    expect(sys.result.status).toBe('FAILED');
    expect(sys.f.of('rpc_ai_ingest_finding')).toHaveLength(1); // stopped after the systemic failure
  });

  it('email and recruiter findings never touch the job-lead RPCs', async () => {
    for (const doc of [external.emailTriage, external.recruiterIntel]) {
      const { result, f } = await run(doc);
      expect(result.success).toBe(true);
      expect(f.of('rpc_ai_resolve_job_lead_key')).toHaveLength(0);
      expect(f.of('rpc_ai_upsert_job_lead')).toHaveLength(0);
    }
  });

  it('one malformed lead in a multi-source result yields PARTIAL while the others are stored', async () => {
    const doc = clone(external.multiSource) as { findings: Array<Record<string, any>> };
    doc.findings.push(jobLeadFinding({}, { match_score: 999 }));
    const { result, f } = await run(doc);
    expect(result.status).toBe('PARTIAL');
    expect(result.counts).toMatchObject({ findingsCreated: 3, rejectedItems: 1 });
    expect(f.of('rpc_ai_upsert_job_lead')).toHaveLength(1);
  });
});
