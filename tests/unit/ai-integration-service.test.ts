import { describe, expect, it, vi } from 'vitest';
import { ingestAiResult, type AiRpcClient, type AiTrustedContext } from '../../apps/api/src/services/aiIntegrationService';
import { isAiHubServerEnabled } from '../../apps/api/src/lib/aiHubConfig';
import { crossProvider, invalid, untrustedScope, unknownFields, valid } from './fixtures/ai-contract/fixtures';

// Orchestration-only tests with a scripted RPC client. Persistence semantics
// (idempotency, dedupe, audit) are proven against a real DB in
// tests/integration/ai-2a-integration-service.test.ts.
vi.mock('../../apps/api/src/lib/db', () => ({ admin: () => { throw new Error('Invalid server environment: SUPABASE_URL'); } }));

const WS = '11111111-1111-4111-8111-aaaaaaaaaaaa';
const USER = '22222222-2222-4222-8222-bbbbbbbbbbbb';
const RUN = '33333333-3333-4333-8333-cccccccccccc';
const ON = { AI_HUB_ENABLED: 'true' };
const ctx: AiTrustedContext = { workspaceId: WS, userId: USER, actorKind: 'SERVICE_INGEST', correlationId: 'corr-1' };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

type Call = { fn: string; args: Record<string, unknown> };
type Reply = { data?: unknown; error?: { message: string; code?: string } } | Error;

function fake(handler: (fn: string, args: Record<string, unknown>, n: number) => Reply | undefined = () => undefined) {
  const calls: Call[] = [];
  let finding = 0, suggestion = 0;
  const client: AiRpcClient = {
    async rpc(fn, args) {
      calls.push({ fn, args });
      const custom = handler(fn, args, calls.filter((c) => c.fn === fn).length);
      if (custom instanceof Error) throw custom;
      if (custom) return { data: custom.data ?? null, error: custom.error ?? null };
      if (fn === 'rpc_ai_ingest_run') return { data: { run_id: RUN, created: true, status: 'RUNNING' }, error: null };
      if (fn === 'rpc_ai_ingest_finding') return { data: { finding_id: `f-${++finding}`, outcome: 'created' }, error: null };
      if (fn === 'rpc_ai_create_suggestion') return { data: { suggestion_id: `s-${++suggestion}`, created: true }, error: null };
      return { data: { run_id: RUN, changed: true, status: args.p_status }, error: null };
    },
  };
  return { client, calls, of: (fn: string) => calls.filter((c) => c.fn === fn) };
}
const dbErr = (message: string, code = '22023'): Reply => ({ error: { message, code } });
const run = (input: unknown, f = fake(), env: Record<string, string | undefined> = ON, c: AiTrustedContext = ctx) => {
  const logs: Record<string, unknown>[] = [];
  return ingestAiResult(c, input, { client: f.client, env, log: (e) => logs.push(e) }).then((result) => ({ result, logs, f }));
};

describe('server kill switch', () => {
  it('OFF rejects before any DB call, even for a valid payload', async () => {
    const f = fake();
    const { result } = await run(valid.rejection, f, { AI_HUB_ENABLED: 'false' });
    expect(result.success).toBe(false);
    expect(result.errors.map((e) => e.code)).toEqual(['AI_HUB_DISABLED']);
    expect(f.calls).toEqual([]);
    expect(result.runId).toBeNull();
  });
  it('missing flag defaults OFF; VITE_AI_HUB_ENABLED never authorizes the server', async () => {
    const f = fake();
    for (const env of [{}, { VITE_AI_HUB_ENABLED: 'true' }, { AI_HUB_ENABLED: '1' }, { AI_HUB_ENABLED: '' }]) {
      const { result } = await run(valid.rejection, f, env);
      expect(result.errors[0]?.code).toBe('AI_HUB_DISABLED');
    }
    expect(f.calls).toEqual([]);
    expect(isAiHubServerEnabled({ AI_HUB_ENABLED: ' TRUE ' })).toBe(true);
  });
  it('is evaluated before context/payload validation (disabled wins over invalid input)', async () => {
    const { result } = await run('not-an-object', fake(), {}, { ...ctx, workspaceId: 'bad' });
    expect(result.errors.map((e) => e.code)).toEqual(['AI_HUB_DISABLED']);
  });
});

describe('trusted context', () => {
  it.each([
    ['bad workspace', { workspaceId: 'x' }], ['bad user', { userId: '1' }], ['wrong actor kind', { actorKind: 'USER' }],
    ['retry without run id', { triggerType: 'retry' as const }], ['run id without retry', { retryOfRunId: RUN }],
    ['unapproved trigger', { triggerType: 'cron' }],
  ])('%s → INVALID_CONTEXT, nothing written', async (_n, patch) => {
    const f = fake();
    const { result } = await run(valid.rejection, f, ON, { ...ctx, ...(patch as object) } as AiTrustedContext);
    expect(result.errors.map((e) => e.code)).toEqual(['INVALID_CONTEXT']);
    expect(f.calls).toEqual([]);
  });
  it('provider-supplied scope can never override the trusted context', async () => {
    const { result, f } = await run(untrustedScope);
    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => w.code === 'untrusted_scope_field')).toBe(true);
    for (const c of f.calls) {
      const blob = JSON.stringify(c.args);
      expect(blob).not.toContain('22222222-2222-4222-8222-222222222222');
      expect(blob).not.toContain('33333333-3333-4333-8333-333333333333');
      expect(blob).not.toContain('44444444-4444-4444-8444-444444444444');
      expect(c.args.p_actor_id).toBe(USER);
    }
    expect(f.of('rpc_ai_ingest_run')[0]!.args.p_workspace_id).toBe(WS);
  });
  it('passes the trusted retry linkage through only for trigger retry', async () => {
    const f = fake();
    await run(valid.rejection, f, ON, { ...ctx, triggerType: 'retry', retryOfRunId: RUN });
    expect(f.of('rpc_ai_ingest_run')[0]!.args).toMatchObject({ p_trigger_type: 'retry', p_retry_of_run_id: RUN });
    const g = fake();
    await run(valid.rejection, g);
    expect(g.of('rpc_ai_ingest_run')[0]!.args).toMatchObject({ p_trigger_type: 'manual', p_retry_of_run_id: null });
  });
});

describe('validation first', () => {
  it('invalid envelope is rejected before run ingestion with validation detail preserved', async () => {
    const { result, f } = await run(invalid.incompatibleMajor);
    expect(result.errors.map((e) => e.code)).toEqual(['INVALID_AI_RESULT']);
    expect(result.validationErrors.map((e) => e.code)).toContain('version_unsupported');
    expect(f.calls).toEqual([]);
    expect(result.runId).toBeNull();
  });
  it('non-object input is rejected without throwing', async () => {
    for (const bad of [null, 5, 'x', []]) expect((await run(bad)).result.errors[0]?.code).toBe('INVALID_AI_RESULT');
  });
  it('only normalized contract fields reach the DB (unknown fields and application_id dropped)', async () => {
    const { result, f } = await run(unknownFields);
    expect(result.success).toBe(true);
    expect(result.unknownFieldCount).toBeGreaterThan(0);
    const blob = JSON.stringify(f.calls);
    expect(blob).not.toContain('surprise');
    expect(blob).not.toContain('extra_a');
    const finding = f.of('rpc_ai_ingest_finding')[0]!.args;
    expect(finding).not.toHaveProperty('p_application_id');
    expect(finding).not.toHaveProperty('p_content_hash');
    expect(Object.keys(finding).every((k) => k.startsWith('p_'))).toBe(true);
  });
  it('a minor-ahead version is normalized and its warning is kept', async () => {
    const { result, f } = await run({ ...clone(valid.rejection), schema_version: '1.7' });
    expect(result.warnings.some((w) => w.code === 'version_minor_ahead')).toBe(true);
    expect(f.of('rpc_ai_ingest_run')[0]!.args.p_schema_version).toBe('1.0');
    expect(f.of('rpc_ai_ingest_finding')[0]!.args.p_schema_version).toBe('1.0');
  });
});

describe('run lifecycle', () => {
  it('SUCCEEDED: run → findings → suggestions → finalize, counts computed by the service', async () => {
    const { result, f } = await run({ ...clone(valid.suggestion), run: { external_run_id: 'x', generated_at: '2026-10-01T12:00:00Z' } });
    expect(f.calls.map((c) => c.fn)).toEqual(['rpc_ai_ingest_run', 'rpc_ai_ingest_finding', 'rpc_ai_create_suggestion', 'rpc_ai_finalize_run']);
    expect(result).toMatchObject({ success: true, status: 'SUCCEEDED', runId: RUN, finalized: true, duplicateRun: false });
    expect(result.counts).toMatchObject({ findingsCreated: 1, suggestionsCreated: 1, rejectedItems: 0 });
    const fin = f.of('rpc_ai_finalize_run')[0]!.args;
    expect(fin).toMatchObject({ p_status: 'SUCCEEDED', p_actor_id: USER, p_run_id: RUN });
    expect(fin.p_counts).toMatchObject({ findings_created: 1, suggestions_created: 1, rejected_items: 0 });
    expect(fin).not.toHaveProperty('p_error_category');
    expect(f.of('rpc_ai_ingest_run')[0]!.args).toMatchObject({ p_status: 'RUNNING', p_provider: 'claude', p_external_run_id: 'x' });
  });
  it('maps every finding outcome into counts (created/duplicate/updated/unchanged_closed)', async () => {
    const outcomes = ['created', 'duplicate', 'updated', 'unchanged_closed'];
    const doc = clone(valid.rejection) as { findings: unknown[] };
    const base = doc.findings[0] as Record<string, any>;
    doc.findings = outcomes.map((_, i) => ({ ...base, dedupe: { ...base.dedupe, source_id: `m-${i}` } }));
    const { result } = await run(doc, fake((fn, _a, n) => (fn === 'rpc_ai_ingest_finding' ? { data: { finding_id: `f-${n}`, outcome: outcomes[n - 1] } } : undefined)));
    expect(result.counts).toMatchObject({ findingsCreated: 1, findingsDuplicate: 1, findingsUpdated: 1, findingsClosed: 1 });
    expect(result.status).toBe('SUCCEEDED');
  });
  it('rejected items → PARTIAL; valid items still ingested; rejection detail preserved', async () => {
    const doc = clone(valid.rejection) as { findings: unknown[] };
    doc.findings.push({ kind: 'email_event', title: '', dedupe: {} });
    const { result, f } = await run(doc);
    expect(result).toMatchObject({ success: true, status: 'PARTIAL', counts: { findingsCreated: 1, rejectedItems: 1 } });
    expect(result.validationErrors.length).toBeGreaterThan(0);
    expect(f.of('rpc_ai_ingest_finding')).toHaveLength(1);
    expect(f.of('rpc_ai_finalize_run')[0]!.args).toMatchObject({ p_status: 'PARTIAL', p_error_category: 'SCHEMA_INVALID' });
  });
  it('item-scoped DB refusal continues with the other findings and ends PARTIAL', async () => {
    const doc = clone(valid.rejection) as { findings: unknown[] };
    const base = doc.findings[0] as Record<string, any>;
    doc.findings = [0, 1, 2].map((i) => ({ ...base, dedupe: { ...base.dedupe, source_id: `m-${i}` } }));
    const { result, f } = await run(doc, fake((fn, _a, n) => (fn === 'rpc_ai_ingest_finding' && n === 2 ? dbErr('AI_FINDING_INVALID_PAYLOAD') : undefined)));
    expect(f.of('rpc_ai_ingest_finding')).toHaveLength(3);
    expect(result).toMatchObject({ success: true, status: 'PARTIAL', counts: { findingsCreated: 2, findingsFailed: 1 } });
    expect(result.errors[0]).toMatchObject({ code: 'INGEST_FINDING_FAILED', path: 'findings[1]', dbCode: 'AI_FINDING_INVALID_PAYLOAD', category: 'INTERNAL' });
  });
  it('every child failing item-by-item finalizes FAILED (nothing usable persisted)', async () => {
    const { result } = await run(valid.rejection, fake((fn) => (fn === 'rpc_ai_ingest_finding' ? dbErr('AI_FINDING_INVALID_TITLE') : undefined)));
    expect(result).toMatchObject({ success: false, status: 'FAILED', finalized: true });
  });
  it('CHECK violations are item-scoped; transport errors are systemic', async () => {
    const check = await run(valid.rejection, fake((fn) => (fn === 'rpc_ai_ingest_finding' ? dbErr('violates check constraint', '23514') : undefined)));
    expect(check.result.counts.findingsFailed).toBe(1);
    const doc = clone(valid.rejection) as { findings: unknown[] };
    const base = doc.findings[0] as Record<string, any>;
    doc.findings = [0, 1, 2].map((i) => ({ ...base, dedupe: { ...base.dedupe, source_id: `m-${i}` } }));
    const net = await run(doc, fake((fn) => (fn === 'rpc_ai_ingest_finding' ? new Error('fetch failed: password=hunter2') : undefined)));
    expect(net.f.of('rpc_ai_ingest_finding')).toHaveLength(1); // stopped at the first systemic failure
    expect(net.result.status).toBe('FAILED');
    expect(JSON.stringify(net.result)).not.toContain('hunter2');
    expect(JSON.stringify(net.logs)).not.toContain('hunter2');
  });
  it('systemic failure finalizes FAILED exactly once; a failing finalize is reported, never looped', async () => {
    const f = fake((fn) => (fn === 'rpc_ai_ingest_finding' ? dbErr('AI_RUN_NOT_OPEN') : fn === 'rpc_ai_finalize_run' ? dbErr('AI_RUN_INVALID_TRANSITION') : undefined));
    const { result } = await run(valid.rejection, f);
    expect(f.of('rpc_ai_finalize_run')).toHaveLength(1);
    expect(f.of('rpc_ai_finalize_run')[0]!.args).toMatchObject({ p_status: 'FAILED', p_error_category: 'INTERNAL' });
    expect(result.errors.map((e) => e.code)).toEqual(['INGEST_FINDING_FAILED', 'FINALIZE_RUN_FAILED']);
    expect(result).toMatchObject({ success: false, finalized: false, status: 'RUNNING' });
  });
  it('run creation failure writes no children and reports INGEST_RUN_FAILED with the controlled DB code', async () => {
    const f = fake((fn) => (fn === 'rpc_ai_ingest_run' ? dbErr('AI_RUN_CONFLICT', '23505') : undefined));
    const { result } = await run(valid.rejection, f);
    expect(result.errors[0]).toMatchObject({ code: 'INGEST_RUN_FAILED', dbCode: 'AI_RUN_CONFLICT' });
    expect(f.calls).toHaveLength(1);
    expect(result.runId).toBeNull();
  });
  it('fails closed (no throw) when the service-role client cannot be built', async () => {
    const result = await ingestAiResult(ctx, valid.rejection, { env: ON, log: () => undefined });
    expect(result.errors.map((e) => e.code)).toEqual(['SERVICE_UNAVAILABLE']);
    expect(JSON.stringify(result)).not.toContain('SUPABASE_URL');
  });
});

describe('duplicate runs', () => {
  const dup = (status: string) => fake((fn) => (fn === 'rpc_ai_ingest_run' ? { data: { run_id: RUN, created: false, status } } : undefined));
  it.each(['SUCCEEDED', 'PARTIAL'])('existing %s run: idempotent success, nothing re-ingested', async (status) => {
    const f = dup(status);
    const { result } = await run(valid.suggestion, f);
    expect(result).toMatchObject({ success: true, duplicateRun: true, status, runId: RUN });
    expect(f.calls.map((c) => c.fn)).toEqual(['rpc_ai_ingest_run']);
  });
  it.each(['FAILED', 'CANCELLED'])('existing %s run: RUN_NOT_OPEN, nothing re-ingested', async (status) => {
    const f = dup(status);
    const { result } = await run(valid.rejection, f);
    expect(result.success).toBe(false);
    expect(result.errors[0]?.code).toBe('RUN_NOT_OPEN');
    expect(f.calls).toHaveLength(1);
  });
  it('existing RUNNING run (interrupted attempt): resumes and finalizes', async () => {
    const f = dup('RUNNING');
    const { result } = await run(valid.rejection, f);
    expect(result).toMatchObject({ success: true, duplicateRun: true, status: 'SUCCEEDED' });
    expect(f.of('rpc_ai_ingest_finding')).toHaveLength(1);
    expect(f.of('rpc_ai_finalize_run')).toHaveLength(1);
  });
});

describe('suggestions', () => {
  it('maps finding_index to the persisted finding id; ids come from RPC output, never the payload', async () => {
    const doc = clone(valid.suggestion) as Record<string, any>;
    doc.findings.push({ ...doc.findings[0], dedupe: { ...doc.findings[0].dedupe, source_id: 'second' } });
    doc.suggestions[0].finding_index = 1;
    const { f } = await run(doc);
    expect(f.of('rpc_ai_create_suggestion')[0]!.args).toMatchObject({
      p_finding_id: 'f-2', p_action: 'set_status', p_target_type: 'application', p_target_id: '11111111-1111-4111-8111-111111111111',
      p_proposed: { status: 'REJECTED' },
    });
  });
  it('skips suggestions on unchanged_closed findings (not a failure)', async () => {
    const f = fake((fn) => (fn === 'rpc_ai_ingest_finding' ? { data: { finding_id: 'f-x', outcome: 'unchanged_closed' } } : undefined));
    const { result } = await run(valid.suggestion, f);
    expect(f.of('rpc_ai_create_suggestion')).toHaveLength(0);
    expect(result).toMatchObject({ status: 'SUCCEEDED', counts: { findingsClosed: 1, suggestionsSkipped: 1, suggestionsFailed: 0 } });
  });
  it('a finding whose ingestion failed leaves no orphan suggestion; run ends PARTIAL or FAILED', async () => {
    const doc = clone(valid.suggestion) as Record<string, any>;
    doc.findings.push({ ...doc.findings[0], dedupe: { ...doc.findings[0].dedupe, source_id: 'second' } });
    doc.suggestions.push({ ...doc.suggestions[0], finding_index: 1, proposed: { status: 'REJECTED', n: 2 } });
    const { result, f } = await run(doc, fake((fn, _a, n) => (fn === 'rpc_ai_ingest_finding' && n === 1 ? dbErr('AI_FINDING_INVALID_TITLE') : undefined)));
    expect(f.of('rpc_ai_create_suggestion')).toHaveLength(1);
    expect(result).toMatchObject({ status: 'PARTIAL', counts: { findingsFailed: 1, findingsCreated: 1, suggestionsFailed: 1, suggestionsCreated: 1 } });
    expect(result.errors.some((e) => e.code === 'CREATE_SUGGESTION_FAILED' && e.path === 'suggestions[0]')).toBe(true);
  });
  it('target ownership refusal is item-scoped (AI_SUGGESTION_TARGET_NOT_FOUND) → PARTIAL', async () => {
    const f = fake((fn) => (fn === 'rpc_ai_create_suggestion' ? dbErr('AI_SUGGESTION_TARGET_NOT_FOUND', 'P0002') : undefined));
    const { result } = await run(valid.suggestion, f);
    expect(result).toMatchObject({ status: 'PARTIAL', counts: { suggestionsFailed: 1 } });
  });
  it('the service has no accept/execute path: only the four ingest RPCs are ever called', async () => {
    const { f } = await run(valid.suggestion);
    expect(new Set(f.calls.map((c) => c.fn))).toEqual(new Set(['rpc_ai_ingest_run', 'rpc_ai_ingest_finding', 'rpc_ai_create_suggestion', 'rpc_ai_finalize_run']));
  });
  it('a duplicate pending proposal (created:false) is counted, not an error', async () => {
    const f = fake((fn) => (fn === 'rpc_ai_create_suggestion' ? { data: { suggestion_id: 's-1', created: false } } : undefined));
    const { result } = await run(valid.suggestion, f);
    expect(result).toMatchObject({ status: 'SUCCEEDED', counts: { suggestionsCreated: 0, suggestionsDuplicate: 1 } });
  });
});

describe('provider neutrality and observability', () => {
  it('cross-provider results use the same code path and send no provider into the dedupe key', async () => {
    const a = await run(crossProvider.claude);
    const b = await run(crossProvider.gemini);
    const key = (r: typeof a) => r.f.of('rpc_ai_ingest_finding')[0]!.args.p_dedupe_key;
    expect(key(a)).toBe(key(b));
    expect(a.f.of('rpc_ai_ingest_run')[0]!.args.p_provider).toBe('claude');
    expect(b.f.of('rpc_ai_ingest_run')[0]!.args.p_provider).toBe('gemini');
  });
  it('preserves provenance: sources on the run, source_ref on the finding', async () => {
    const { f } = await run(valid.jobLead);
    expect(f.of('rpc_ai_ingest_run')[0]!.args.p_sources).toEqual([{ type: 'job_site', ref: 'board-1', observed_at: null }]);
    expect(f.of('rpc_ai_ingest_finding')[0]!.args.p_source_ref).toMatchObject({ url: 'https://jobs.example.com/posting/42' });
  });
  it('logs one structured, payload-free entry with the correlation id', async () => {
    const { result, logs } = await run(valid.suggestion);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ event: 'ai_integration.ingest', correlationId: 'corr-1', provider: 'claude', workflow: 'email_triage', status: 'SUCCEEDED', runId: RUN });
    expect(typeof logs[0]!.elapsedMs).toBe('number');
    const blob = JSON.stringify(logs);
    expect(blob).not.toContain('Example Corp');
    expect(blob).not.toContain('Sanitized summary');
    expect(result.correlationId).toBe('corr-1');
  });
  it('generates a correlation id when the supplied one is malformed', async () => {
    const { result } = await run(valid.rejection, fake(), ON, { ...ctx, correlationId: 'bad id with spaces' });
    expect(result.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
