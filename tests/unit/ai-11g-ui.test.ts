import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../apps/web/src/supabase', () => ({ supabase: { from: () => { throw new Error('unexpected'); }, rpc: () => { throw new Error('unexpected'); } } }));

import type { AutomationView } from '../../apps/web/src/lib/aiAutomation';
import { AutomationCard } from '../../apps/web/src/components/ai/AutomationsPanel';
import { AutomationSetupBody } from '../../apps/web/src/components/ai/AutomationSetupDialog';
import { ProviderSchedulerSummary } from '../../apps/web/src/components/ai/ProviderSchedulerSummary';
import { SCHEDULER_LABELS, connectionLabel, setupActionLabel, statusFor, type AutomationSetupView, type ProviderSchedulerStatus } from '../../apps/web/src/lib/aiScheduler';
import { buildProviderStatus, buildSchedulerSetup, EMPTY_EVIDENCE } from '../../apps/api/src/lib/aiContract';

// AI-11G UI: provider connection and scheduled-execution readiness are separate facts; the Automations card offers
// provider-specific setup and an honest "Run in provider"; the setup body is the server-generated, copyable contract.
const noop = () => undefined;
const view = (over: Partial<AutomationView> = {}): AutomationView => ({
  id: 'a1', name: 'Weekday Morning Digest', workflow: 'daily_brief', enabled: true, provider: 'chatgpt', cadence: 'weekdays', localTime: '08:00',
  timezone: 'America/Chicago', weekdays: [], sections: ['email_triage', 'job_discovery'], delivery: ['ai_hub'], createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  state: { lastRunAt: null, lastStatus: null, lastSuccessAt: null, lastErrorCategory: null, nextExpectedRunAt: '2026-10-14T13:00:00.000Z' },
  runNow: { ready: false, reason: 'NO_EXECUTOR' }, executor: 'not_configured', ...over,
});
const status = (over: Partial<ProviderSchedulerStatus> = {}): ProviderSchedulerStatus =>
  ({ ...buildProviderStatus('chatgpt', 'connected', true, EMPTY_EVIDENCE) as unknown as ProviderSchedulerStatus, ...over });
const card = (a: AutomationView, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(AutomationCard, { automation: a, busy: false, onEdit: noop, onToggle: noop, onDelete: noop, ...extra }));

describe('Automations card (AI-11G)', () => {
  it('shows provider, connection and scheduled execution as separate rows, with a provider-specific setup action', () => {
    const out = card(view(), { scheduler: status() });
    expect(out).toContain('ChatGPT');
    expect(out).toContain('JobQuest connection</dt><dd style="margin:0">Connected');
    expect(out).toContain('Scheduled execution</dt>');
    expect(out).toContain('Needs setup');
    expect(out).toContain('Set up in ChatGPT');
    expect(out).toContain('Run in provider');
    expect(out).toContain('Next expected');
    expect(out).toContain('Last run');
  });
  it('a connected provider is never shown as scheduler-ready: only evidence says Ready', () => {
    const connected = card(view(), { scheduler: status() });
    expect(connected).not.toContain('>Ready<');
    const ready = card(view(), { scheduler: status({ scheduler: 'READY', scheduledJobQuestAccess: 'VERIFIED_BY_USE' }) });
    expect(ready).toContain('>Ready<');
    expect(card(view(), { scheduler: status({ connection: 'not_connected', canIngest: false, scheduler: 'NOT_CONNECTED' }) })).toContain('Connect the provider first');
    expect(card(view(), { scheduler: status({ scheduler: 'UNVERIFIED' }) })).toContain('Needs validation');
  });
  it('only the relevant provider action is offered: Claude / Gemini wording, none for a manual provider', () => {
    expect(card(view({ provider: 'claude' }), { scheduler: status({ provider: 'claude' }) })).toContain('Set up in Claude');
    expect(card(view({ provider: 'gemini' }), { scheduler: status({ provider: 'gemini' }) })).toContain('Set up in Gemini');
    const manual = card(view({ provider: 'manual' }), { scheduler: null });
    expect(manual).not.toContain('Set up in');
    expect(manual).not.toContain('Run in provider');
    expect(manual).toContain('No provider selected');
    expect(setupActionLabel('manual')).toBeNull();
  });
  it('renders without scheduling rows until the status loads (never blocks the card)', () => {
    const out = card(view());
    expect(out).not.toContain('JobQuest connection');
    expect(out).toContain('Set up in ChatGPT');
  });
  it('contains no credential-looking text', () => {
    expect(card(view(), { scheduler: status() })).not.toMatch(/jq_mcp_|Bearer |client_secret|sk-[A-Za-z0-9]{8}/);
  });
});

describe('Provider setup body (AI-11G)', () => {
  const ID = '123e4567-e89b-42d3-a456-426614174000';
  const data = (provider: 'claude' | 'chatgpt' | 'gemini'): AutomationSetupView => ({
    setup: buildSchedulerSetup({ id: ID, name: 'Morning Digest', workflow: 'daily_brief', provider, enabled: true, cadence: 'weekdays', localTime: '08:00', timezone: 'America/Chicago', weekdays: [], sections: ['email_triage', 'job_discovery', 'recruiter_intel', 'calendar_review'] })!,
    status: buildProviderStatus(provider, 'connected', true, EMPTY_EVIDENCE) as unknown as ProviderSchedulerStatus,
  } as unknown as AutomationSetupView);
  const body = (provider: 'claude' | 'chatgpt' | 'gemini', mode: 'setup' | 'manual' = 'setup') =>
    renderToStaticMarkup(createElement(AutomationSetupBody, { data: data(provider), mode, copied: null, copyError: null, onCopy: noop }));

  it('shows readiness, the automation id, the schedule to match and the ordered steps with the digest last', () => {
    const out = body('claude');
    expect(out).toContain('Scheduled execution: Needs setup');
    expect(out).toContain('JobQuest connection: Connected');
    expect(out).toContain(ID);
    expect(out).toContain('Weekdays (Mon-Fri) at 8:00 AM America/Chicago');
    const order = ['Email triage', 'Fresh job discovery', 'Recruiter intelligence', 'Calendar review', 'Daily Digest (composed by JobQuest, last)'].map((t) => out.indexOf(`<li>${t}</li>`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('offers a copy action for the scheduled instructions and for the attended run, and both are claim-first', () => {
    for (const p of ['claude', 'chatgpt', 'gemini'] as const) {
      const out = body(p);
      expect(out).toContain('Copy scheduled-task instructions');
      expect(out).toContain('Copy run-once instructions');
      expect(out).toContain('FIRST action is jobquest_claim_ai_execution');
      expect(out).toMatch(/untrusted DATA/);
      expect(out).not.toMatch(/jq_mcp_|client_secret|Bearer [A-Za-z0-9]/);
    }
  });
  it('mode opens the matching section; limitations are stated honestly per provider', () => {
    expect(body('gemini', 'manual')).toMatch(/<details open=""><summary[^>]*>2\. Run in Gemini once, now/);
    expect(body('chatgpt', 'setup')).toMatch(/<details open=""><summary[^>]*>1\. Create the schedule in ChatGPT/);
    expect(body('claude')).toContain('What is and isn’t known about Claude');
  });
});

describe('Providers page (AI-11G): connection and scheduled execution are never one badge', () => {
  it('ChatGPT: JobQuest connection Connected, Scheduled execution Needs setup', () => {
    const out = renderToStaticMarkup(createElement(ProviderSchedulerSummary, { status: status() }));
    expect(out).toContain('JobQuest connection</dt><dd style="margin:0">Connected');
    expect(out).toContain('Scheduled execution</dt>');
    expect(out).toContain('Needs setup');
    expect(out).toContain('not assumed');
  });
  it('a read-only credential is connected but cannot run a schedule; a validated provider is Ready with its last claim', () => {
    const ro = renderToStaticMarkup(createElement(ProviderSchedulerSummary, { status: status({ canIngest: false, scheduler: 'NOT_CONNECTED' }) }));
    expect(ro).toContain('Connected, read-only (cannot save results)');
    expect(ro).toContain('Connect the provider first');
    const ready = renderToStaticMarkup(createElement(ProviderSchedulerSummary, { status: status({ scheduler: 'READY', lastClaimAt: '2026-10-13T13:00:00Z', lastCompletedAt: '2026-10-13T13:02:00Z' }) }));
    expect(ready).toContain('>Ready<');
    expect(ready).toContain('Last scheduled claim');
  });
  it('label helpers', () => {
    expect(SCHEDULER_LABELS.READY).toBe('Ready');
    expect(connectionLabel({ connection: 'not_connected', canIngest: false })).toBe('Not connected');
    expect(statusFor([status()], 'claude')).toBeNull();
    expect(statusFor(null, 'chatgpt')).toBeNull();
  });
});
