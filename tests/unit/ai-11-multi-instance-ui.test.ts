import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';

vi.mock('../../apps/web/src/supabase', () => ({ supabase: { from: () => { throw new Error('unexpected'); }, rpc: () => { throw new Error('unexpected'); } } }));

import type * as W from '../../apps/web/src/lib/aiAutomation';
import { AutomationsView, type AutomationsViewProps } from '../../apps/web/src/components/ai/AutomationsPanel';

// AI-11 multi-instance automations (UI): several cards of the same workflow + provider render side by side, each distinguishable
// by name, schedule, status and next expected run, and keyed by the automation id.
const noop = () => undefined;
const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
const view = (id: string, name: string, localTime: string, over: Partial<W.AutomationView> = {}): W.AutomationView => ({
  id, name, workflow: 'email_triage', enabled: true, provider: 'claude', cadence: 'daily', localTime, timezone: 'America/Chicago', weekdays: [], sections: [],
  delivery: ['ai_hub'], createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  state: { lastRunAt: null, lastStatus: null, lastTrigger: null, lastSuccessAt: null, lastFailureAt: null, lastErrorCategory: null, nextExpectedRunAt: `2026-10-14T${localTime}:00.000Z` },
  runNow: { ready: false, reason: 'NO_EXECUTOR' }, executor: 'not_configured', ...over,
} as W.AutomationView);
const props = (automations: W.AutomationView[]): AutomationsViewProps => ({
  load: { status: 'ready', automations }, busyId: null, actionError: null, onNew: noop, onEdit: noop, onToggle: noop, onDelete: noop, onRetry: noop,
});

describe('multi-instance automations UI', () => {
  const trio = [view('a1', 'Email Intelligence — Morning', '08:00'), view('a2', 'Email Intelligence — Midday', '12:30'), view('a3', 'Email Intelligence — Evening', '16:30', { enabled: false })];

  it('renders one distinguishable card per automation even when workflow and provider are identical', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const out = html(createElement(AutomationsView, props(trio)));
    expect(out.match(/data-testid="automation-card"/g)).toHaveLength(3);
    for (const [name, at] of [['Email Intelligence — Morning', '8:00'], ['Email Intelligence — Midday', '12:30'], ['Email Intelligence — Evening', '4:30']] as const) {
      expect(out).toContain(name);
      expect(out).toMatch(new RegExp(at));
    }
    expect(out).toContain('Disable Email Intelligence — Morning'); // per-card control carries the card's own name
    expect(out).toContain('Enable Email Intelligence — Evening'); // the disabled sibling is independent
    expect(out).toContain('Disabled');
    expect(errors.mock.calls.filter((c) => /unique "key"|same key/i.test(String(c[0])))).toHaveLength(0); // no React key collision
    errors.mockRestore();
  });

  it('cards are keyed by the automation id, never by workflow or provider', () => {
    const src = readFileSync('apps/web/src/components/ai/AutomationsPanel.tsx', 'utf8');
    expect(src).toMatch(/<AutomationCard key=\{a\.id\}/);
    expect(src).not.toMatch(/key=\{[^}]*(workflow|provider)/);
  });

  it('the create form still offers every workflow and provider (no option is removed once one exists)', () => {
    const src = readFileSync('apps/web/src/components/ai/AutomationsPanel.tsx', 'utf8');
    expect(src).toMatch(/workflowOptions = AUTOMATION_WORKFLOWS\.map/);
    expect(src).not.toMatch(/disabled=\{[^}]*(existing|taken|used)/i);
  });
});
