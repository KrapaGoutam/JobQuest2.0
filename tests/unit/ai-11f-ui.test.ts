import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../apps/web/src/supabase', () => ({ supabase: { from: () => { throw new Error('unexpected'); }, rpc: () => { throw new Error('unexpected'); } } }));

import type { AutomationView } from '../../apps/web/src/lib/aiAutomation';
import { AutomationCard } from '../../apps/web/src/components/ai/AutomationsPanel';
import { AiHubHistoryPanel } from '../../apps/web/src/views/AiHubHistory';
import { DEFAULT_RUN_FILTERS, type AiRunRow } from '../../apps/web/src/lib/aiHub';

// AI-11F UI: the Automations card reports executor readiness, last failure and how the last run started, and Run now stays
// truthful; AI Hub History distinguishes scheduled / manual / retry runs. Presentational only (no network).
const noop = () => undefined;
const view = (over: Partial<AutomationView> = {}): AutomationView => ({
  id: 'a1', name: 'Weekday Morning Digest', workflow: 'daily_brief', enabled: true, provider: 'claude', cadence: 'weekdays', localTime: '08:00',
  timezone: 'America/Chicago', weekdays: [], sections: [], delivery: ['ai_hub'], createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  state: { lastRunAt: '2026-10-13T13:01:00Z', lastStatus: 'FAILED', lastTrigger: 'scheduled', lastSuccessAt: null, lastFailureAt: '2026-10-13T13:01:00Z', lastErrorCategory: 'TIMEOUT', nextExpectedRunAt: '2026-10-14T13:00:00.000Z' },
  runNow: { ready: false, reason: 'NO_EXECUTOR' }, executor: 'not_configured', ...over,
});
const card = (a: AutomationView, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(AutomationCard, { automation: a, busy: false, onEdit: noop, onToggle: noop, onDelete: noop, ...extra }));

describe('Automations card (AI-11F)', () => {
  it('shows executor readiness, the last failure and how the last run started; Run now says the real reason', () => {
    const out = card(view());
    expect(out).toContain('Provider scheduler</dt><dd style="margin:0">Not connected yet');
    expect(out).toContain('Last failure');
    expect(out).toContain('Last started by</dt><dd style="margin:0">Scheduled');
    expect(out).toContain('no provider scheduler is connected');
    expect(/<button[^>]*disabled[^>]*>Run now<\/button>/.test(out)).toBe(true);
  });
  it('a connected executor enables Run now; an unavailable one is labelled; legacy views without the fields still render', () => {
    const ready = card(view({ executor: 'configured', runNow: { ready: true, reason: null } }));
    expect(ready).toContain('Connected');
    expect(/<button[^>]*disabled[^>]*>Run now<\/button>/.test(ready)).toBe(false);
    expect(card(view({ executor: 'unavailable' }))).toContain('Unavailable');
    const legacy = view();
    delete (legacy as Partial<AutomationView>).executor;
    delete legacy.state.lastTrigger;
    delete legacy.state.lastFailureAt;
    const out = card(legacy);
    expect(out).not.toContain('Provider scheduler');
    expect(out).not.toContain('Last started by');
  });
  it('renders the supplied history slot (the panel lazily loads it)', () => {
    expect(card(view(), { history: createElement('div', { id: 'hist' }, 'Recent runs') })).toContain('id="hist"');
  });
});

describe('AI Hub History (AI-11F)', () => {
  const run = (o: Partial<AiRunRow>): AiRunRow => ({
    id: 'r1', provider: 'claude', workflow: 'daily_brief', status: 'SUCCEEDED', trigger_type: 'scheduled', created_at: '2026-10-13T13:00:00Z',
    started_at: '2026-10-13T13:00:00Z', completed_at: '2026-10-13T13:00:30Z', error_category: null, counts: {}, ...o,
  });
  it('labels scheduled, manual and retry runs beside provider and status, without exposing error text', () => {
    const html = renderToStaticMarkup(createElement(AiHubHistoryPanel, {
      state: { status: 'ready', rows: [run({}), run({ id: 'r2', trigger_type: 'manual', status: 'QUEUED' }), run({ id: 'r3', trigger_type: 'retry', status: 'FAILED', error_category: 'TIMEOUT' })], hasNext: false },
      filters: DEFAULT_RUN_FILTERS, page: 0, onFiltersChange: noop, onPageChange: noop,
    }));
    expect(html).toContain('· Scheduled');
    expect(html).toContain('· Manual');
    expect(html).toContain('· Retry');
    for (const status of ['Succeeded', 'Queued', 'Failed']) expect(html).toContain(status);
  });
});
