import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../apps/web/src/supabase', () => ({ supabase: { from: () => { throw new Error('unexpected'); } } }));

import { AI_PROVIDERS, AI_WORKFLOWS } from '../../apps/api/src/lib/aiContract/constants';
import {
  AI_PROVIDER_VALUES, AI_WORKFLOW_VALUES, DEFAULT_RUN_FILTERS, HISTORY_PAGE_SIZE, allowlistedPayloadItems,
  formatConfidence, pageRange, safeHttpUrl, sliceRunsPage,
  type AiFindingDetailRow, type AiRunDetailRow, type AiRunRow,
} from '../../apps/web/src/lib/aiHub';
import { fetchAiFindingDetail, fetchAiRunDetail, fetchAiRunsPage } from '../../apps/web/src/api/aiHub';
import { AiHubShell, type AiHubLoadState } from '../../apps/web/src/views/AiHubView';
import { AiHubHistoryPanel } from '../../apps/web/src/views/AiHubHistory';
import { FindingDetailBody, RunDetailBody } from '../../apps/web/src/views/AiHubDetails';

const run = (o: Partial<AiRunRow> = {}): AiRunRow => ({
  id: 'r1', provider: 'claude', workflow: 'email_triage', status: 'SUCCEEDED', trigger_type: 'manual',
  created_at: '2026-01-01T00:00:00Z', started_at: '2026-01-01T00:00:00Z', completed_at: '2026-01-01T00:00:30Z',
  error_category: null, counts: { findings: 4 }, ...o,
});
const finding = (o: Partial<AiFindingDetailRow> = {}): AiFindingDetailRow => ({
  id: 'f1', kind: 'job_lead', provider: 'gemini', status: 'NEW', priority: 'HIGH', title: 'Lead', summary: null,
  evidence: null, created_at: '2026-01-01T00:00:00Z', confidence: '0.920', occurred_at: null, run_id: 'r1', category: null,
  due_at: null, application_id: null, source_ref: {}, payload: {}, ...o,
});
const overview = (state: AiHubLoadState) =>
  renderToStaticMarkup(createElement(AiHubShell, { tab: 'overview', onTabChange: () => undefined, state }));
const hist = (over: Partial<Parameters<typeof AiHubHistoryPanel>[0]> = {}) =>
  renderToStaticMarkup(createElement(AiHubHistoryPanel, {
    state: { status: 'ready', rows: [run()], hasNext: false }, filters: DEFAULT_RUN_FILTERS, page: 0,
    onFiltersChange: () => undefined, onPageChange: () => undefined, ...over,
  }));

function fakeClient(opts: { fail?: boolean; data?: unknown } = {}) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(`from:${table}`);
      const result = opts.fail ? { data: null, error: { message: 'secret db detail' }, count: null } : { data: opts.data ?? [], error: null, count: 0 };
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'limit', 'gte', 'in', 'range', 'maybeSingle']) {
        q[m] = (...a: unknown[]) => { calls.push(`${m}:${a.map((x) => JSON.stringify(x)).join(',')}`); return q; };
      }
      q.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
      return q;
    },
  };
  return { client: client as never, calls };
}

describe('AI-1E Overview', () => {
  it('zero data shows the real empty state (no fake data)', () => {
    const html = overview({ status: 'ready', snapshot: { runs: [], findings: [], pendingSuggestions: 0 } });
    expect(html).toContain('AI Hub is ready');
    expect(html).not.toMatch(/Recent findings|Latest run/);
  });
  it('shows latest run, activity, attention, pending rows and findings', () => {
    const html = overview({ status: 'ready', snapshot: {
      runs: [run({ status: 'PARTIAL' })], findings: [finding()], pendingSuggestions: 2, recentRunCount: 5, attentionRunCount: 1,
      pendingSuggestionRows: [{ id: 's1', action: 'create_task', target_type: 'application', created_at: '2026-01-01T00:00:00Z' }],
    } });
    for (const t of ['Latest run', 'Partial', 'Email triage · Claude', 'runs in the last 7 days', 'failed or partial runs', 'Create task', 'Recent findings', '92% confidence']) {
      expect(html).toContain(t);
    }
    expect(html).not.toMatch(/>(Accept|Ignore|Dismiss|Delete)</);
  });
  it('failed status is a text label, not colour alone', () => {
    const html = overview({ status: 'ready', snapshot: { runs: [run({ status: 'FAILED' })], findings: [], pendingSuggestions: 0 } });
    expect(html).toContain('Failed');
  });
});

describe('AI-1E History', () => {
  it('filter values match the AI-1C constants', () => {
    expect([...AI_PROVIDER_VALUES]).toEqual([...AI_PROVIDERS]);
    expect([...AI_WORKFLOW_VALUES]).toEqual([...AI_WORKFLOWS]);
  });
  it('renders labelled filters and run rows', () => {
    const html = hist({ onOpenRun: () => undefined });
    expect(html).toContain('aria-label="History filters"');
    for (const l of ['Status', 'Provider', 'Workflow', 'All statuses', 'Email triage', '30s', '4 findings']) expect(html).toContain(l);
  });
  it('pagination controls appear only when needed', () => {
    expect(hist()).not.toContain('History pagination');
    const html = hist({ state: { status: 'ready', rows: [run()], hasNext: true }, page: 1 });
    expect(html).toContain('Page 2');
    expect(html).toContain('Previous');
    expect(html).toContain('Next');
  });
  it('empty, filtered-empty and localized error states', () => {
    const none = { status: 'ready' as const, rows: [], hasNext: false };
    expect(hist({ state: none })).toContain('No AI runs yet');
    expect(hist({ state: none, filters: { ...DEFAULT_RUN_FILTERS, status: 'FAILED' } })).toContain('No runs match these filters');
    const err = hist({ state: { status: 'error' } });
    expect(err).toContain('AI run history could not be loaded.');
    expect(err).toContain('role="alert"');
  });
  it('pagination helpers', () => {
    expect(pageRange(0)).toEqual({ from: 0, to: HISTORY_PAGE_SIZE });
    expect(pageRange(2)).toEqual({ from: 40, to: 40 + HISTORY_PAGE_SIZE });
    const rows = Array.from({ length: HISTORY_PAGE_SIZE + 1 }, (_, i) => i);
    expect(sliceRunsPage(rows).hasNext).toBe(true);
    expect(sliceRunsPage(rows).rows).toHaveLength(HISTORY_PAGE_SIZE);
    expect(sliceRunsPage([1, 2]).hasNext).toBe(false);
  });
});

describe('AI-1E read queries', () => {
  it('runs page: newest first, filters + range, workspace scoped, SELECT only', async () => {
    const { client, calls } = fakeClient({ data: [{ id: 'a' }] });
    const r = await fetchAiRunsPage('ws-1', { status: 'FAILED', provider: 'claude', workflow: 'ALL' }, 2, client);
    expect(r.hasNext).toBe(false);
    expect(calls).toContain('eq:"workspace_id","ws-1"');
    expect(calls).toContain('eq:"status","FAILED"');
    expect(calls).toContain('eq:"provider","claude"');
    expect(calls.some((c) => c.startsWith('eq:"workflow"'))).toBe(false);
    expect(calls).toContain('order:"created_at",{"ascending":false}');
    expect(calls).toContain('range:40,60');
    expect(calls.some((c) => /insert|update|delete|upsert|rpc/.test(c))).toBe(false);
  });
  it('detail queries are workspace scoped, bounded, and never select error_detail', async () => {
    const a = fakeClient({ data: { id: 'r' } });
    const f = fakeClient({ data: { id: 'f' } });
    await fetchAiRunDetail('ws-1', 'r', a.client);
    await fetchAiFindingDetail('ws-1', 'f', f.client);
    expect(a.calls).toContain('eq:"workspace_id","ws-1"');
    expect(f.calls).toContain('eq:"workspace_id","ws-1"');
    expect([...a.calls, ...f.calls].join(' ')).not.toContain('error_detail');
    expect(a.calls.filter((c) => c.startsWith('from:'))).toEqual(['from:ai_runs', 'from:ai_findings']);
  });
  it('failed loads reject opaquely', async () => {
    const { client } = fakeClient({ fail: true });
    await expect(fetchAiRunsPage('ws', DEFAULT_RUN_FILTERS, 0, client)).rejects.toThrow('AI_HUB_LOAD_FAILED');
    await expect(fetchAiRunDetail('ws', 'r', client)).rejects.toThrow('AI_HUB_LOAD_FAILED');
    await expect(fetchAiFindingDetail('ws', 'f', client)).rejects.toThrow('AI_HUB_LOAD_FAILED');
  });
});

describe('AI-1E detail rendering and untrusted content', () => {
  it('run detail shows metadata, safe error category and linked findings', () => {
    const d: AiRunDetailRow = { ...run({ status: 'PARTIAL', error_category: 'PARTIAL_READ' }), schema_version: '1.0', sources: ['gmail'] };
    const html = renderToStaticMarkup(createElement(RunDetailBody, { run: d, findings: [finding()] }));
    for (const t of ['Partial', 'Email triage', 'Claude', 'Manual', '1.0', 'Partial read', 'findings: 4', 'gmail', 'Lead']) expect(html).toContain(t);
  });
  it('finding detail: allowlisted fields only, escaped text, no raw JSON', () => {
    const html = renderToStaticMarkup(createElement(FindingDetailBody, { finding: finding({
      summary: '<b>bold</b>', evidence: '<script>1</script>',
      payload: { company: '<img src=x onerror=1>', role_title: 'Eng', secret_blob: 'LEAKED', nested: { a: 1 } },
    }) }));
    expect(html).toContain('92%');
    expect(html).toContain('Eng');
    expect(html).toContain('&lt;b&gt;bold');
    expect(html).not.toContain('<script>1');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toMatch(/LEAKED|secret_blob|nested|&quot;a&quot;/);
  });
  it('unknown kinds show no payload; null confidence is hidden', () => {
    expect(allowlistedPayloadItems('future_kind', { a: 'b' })).toEqual([]);
    expect(allowlistedPayloadItems('note', { a: 'b' })).toEqual([]);
    expect(formatConfidence(null)).toBeNull();
    expect(formatConfidence(0.925)).toBe('93%');
    expect(formatConfidence('0.500')).toBe('50%');
    expect(formatConfidence(7)).toBeNull();
    expect(renderToStaticMarkup(createElement(FindingDetailBody, { finding: finding({ confidence: null }) }))).not.toContain('Confidence');
  });
  it('unsafe URLs never become links; safe ones get noopener', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'https://u:p@evil.com', 'not a url', 42]) expect(safeHttpUrl(bad)).toBeNull();
    const html = renderToStaticMarkup(createElement(FindingDetailBody, { finding: finding({
      source_ref: { url: 'javascript:alert(1)' }, payload: { job_url: 'javascript:alert(2)' },
    }) }));
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('javascript:');
    const ok = renderToStaticMarkup(createElement(FindingDetailBody, { finding: finding({ payload: { job_url: 'https://example.com/j' } }) }));
    expect(ok).toContain('href="https://example.com/j"');
    expect(ok).toContain('rel="noopener noreferrer"');
  });
});

describe('AI-1E read-only guarantees and audit scope filter', () => {
  it('no mutation APIs or raw JSON dumps in AI Hub UI sources', () => {
    for (const f of ['api/aiHub.ts', 'views/AiHubView.tsx', 'views/AiHubHistory.tsx', 'views/AiHubDetails.tsx', 'lib/aiHub.ts']) {
      const src = readFileSync(`apps/web/src/${f}`, 'utf8');
      expect(src).not.toMatch(/\.(insert|update|delete|upsert|rpc)\(|service_role|dangerouslySetInnerHTML|JSON\.stringify/);
    }
  });
  it('audit history has a client-side AI scope filter without changing the fetch', () => {
    const src = readFileSync('apps/web/src/views/AuditHistoryView.tsx', 'utf8');
    expect(src).toContain("startsWith('AI_')");
    expect(src).toContain('listWorkspaceAuditEvents(activeWorkspaceId, 100)');
  });
});
