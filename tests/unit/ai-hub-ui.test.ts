import { createElement } from '../../apps/web/node_modules/react';
import { renderToStaticMarkup } from '../../apps/web/node_modules/react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../apps/web/src/supabase', () => ({ supabase: { from: () => { throw new Error('unexpected'); } } }));

import { AI_RUN_STATUSES, AI_PRIORITIES } from '../../apps/api/src/lib/aiContract/constants';
import {
  AI_RUN_STATUS_VALUES, AI_PRIORITY_VALUES, aiHubPathForTab, aiHubTabFromPath, aiRunStatusLabel,
  type AiHubSnapshot,
} from '../../apps/web/src/lib/aiHub';
import { fetchAiHubSnapshot } from '../../apps/web/src/api/aiHub';
import { AiHubShell, type AiHubLoadState } from '../../apps/web/src/views/AiHubView';

const empty: AiHubSnapshot = { runs: [], findings: [], pendingSuggestions: 0 };
const render = (state: AiHubLoadState, tab: 'overview' | 'history' = 'overview') =>
  renderToStaticMarkup(createElement(AiHubShell, { tab, onTabChange: () => undefined, state }));

function fakeClient(opts: { fail?: boolean; runs?: unknown[]; findings?: unknown[]; count?: number } = {}) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(`from:${table}`);
      const result = opts.fail
        ? { data: null, error: { message: 'secret db detail' }, count: null }
        : { data: table === 'ai_runs' ? (opts.runs ?? []) : (opts.findings ?? []), error: null, count: opts.count ?? 0 };
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'limit']) q[m] = (...a: unknown[]) => { calls.push(`${m}:${a[0]}`); return q; };
      q.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
      return q;
    },
  };
  return { client: client as never, calls };
}

describe('AI-1D types stay aligned with AI-1C constants', () => {
  it('run statuses and priorities match', () => {
    expect([...AI_RUN_STATUS_VALUES]).toEqual([...AI_RUN_STATUSES]);
    expect([...AI_PRIORITY_VALUES]).toEqual([...AI_PRIORITIES]);
  });
  it('labels every canonical status', () => {
    for (const s of AI_RUN_STATUSES) expect(aiRunStatusLabel(s)).not.toBe('Unknown');
  });
});

describe('AI Hub shell', () => {
  it('renders heading, accessible tabs and the zero-record empty state', () => {
    const html = render({ status: 'ready', snapshot: empty });
    expect(html).toContain('<h1');
    expect(html).toContain('AI Hub');
    expect(html).toContain('aria-label="AI Hub sections"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('AI Hub is ready');
    expect(html).toContain('AI integrations have not been connected yet');
    expect(html).not.toMatch(/Connected account|Claude Hub|Gemini Hub|ChatGPT Hub/);
  });
  it('renders the History shell (empty)', () => {
    expect(render({ status: 'ready', snapshot: empty }, 'history')).toContain('No AI runs yet');
  });
  it('renders loading', () => {
    expect(render({ status: 'loading' })).toContain('Loading AI Hub');
  });
  it('renders a localized error without internals', () => {
    const html = render({ status: 'error' });
    expect(html).toContain('AI Hub data could not be loaded.');
    expect(html).toContain('unaffected');
    expect(html).not.toContain('secret db detail');
  });
  it('renders runs with canonical labels and escapes untrusted finding text', () => {
    const html = render({
      status: 'ready',
      snapshot: {
        runs: [{ id: 'r1', provider: 'claude', workflow: 'daily_brief', status: 'AWAITING_APPROVAL', trigger_type: 'manual', created_at: '2026-01-01T00:00:00Z', completed_at: null }],
        findings: [{ id: 'f1', kind: 'note', provider: 'claude', status: 'NEW', priority: 'NORMAL', title: '<img src=x onerror=alert(1)>', summary: null, evidence: '<script>x</script>', created_at: '2026-01-01T00:00:00Z' }],
        pendingSuggestions: 2,
      },
    });
    expect(html).toContain('Awaiting approval');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;img');
    expect(html).not.toMatch(/>(Accept|Ignore|Dismiss)</);
  });
});

describe('AI Hub routing helpers', () => {
  it('maps paths and tabs', () => {
    expect(aiHubTabFromPath('/ai-hub')).toBe('overview');
    expect(aiHubTabFromPath('/ai-hub/history')).toBe('history');
    expect(aiHubPathForTab('history')).toBe('/ai-hub/history');
    expect(aiHubPathForTab('overview')).toBe('/ai-hub');
  });
});

describe('AI Hub read layer', () => {
  it('only SELECTs, scoped to the workspace, via the supplied client', async () => {
    const { client, calls } = fakeClient({ runs: [{ id: 'r' }], count: 3 });
    const snap = await fetchAiHubSnapshot('ws-1', client);
    expect(snap.pendingSuggestions).toBe(3);
    expect(snap.runs).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith('from:')).sort()).toEqual(['from:ai_findings', 'from:ai_runs', 'from:ai_suggestions']);
    expect(calls.some((c) => /insert|update|delete|upsert|rpc/.test(c))).toBe(false);
    expect(calls).toContain('eq:workspace_id');
  });
  it('throws an opaque error on failure', async () => {
    const { client } = fakeClient({ fail: true });
    await expect(fetchAiHubSnapshot('ws-1', client)).rejects.toThrow('AI_HUB_LOAD_FAILED');
  });
  it('source contains no write calls or service-role usage', () => {
    for (const f of ['apps/web/src/api/aiHub.ts', 'apps/web/src/views/AiHubView.tsx']) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toMatch(/\.(insert|update|delete|upsert|rpc)\(|service_role|dangerouslySetInnerHTML/);
    }
  });
});

describe('navigation wiring', () => {
  it('exposes AI Hub in sidebar, mobile drawer and the /ai-hub route', () => {
    expect(readFileSync('apps/web/src/components/shell/Sidebar.tsx', 'utf8')).toContain("path: '/ai-hub', label: 'AI Hub'");
    expect(readFileSync('apps/web/src/components/shell/MobileNav.tsx', 'utf8')).toContain("path: '/ai-hub', label: 'AI Hub'");
    const app = readFileSync('apps/web/src/App.tsx', 'utf8');
    expect(app).toContain("routePath === '/ai-hub'");
    expect(app).toContain('<AiHubView');
  });
});
