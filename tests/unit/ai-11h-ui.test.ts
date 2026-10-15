import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../apps/web/src/supabase', () => ({ supabase: { from: () => { throw new Error('unexpected'); }, rpc: () => { throw new Error('unexpected'); } } }));

import { AiHubWeeklyPanel } from '../../apps/web/src/views/AiHubWeekly';
import { AutomationActivity } from '../../apps/web/src/components/ai/AutomationActivity';
import { LegacyCredentialsView } from '../../apps/web/src/components/ai/LegacyCredentialsPanel';
import { AutomationSetupBody } from '../../apps/web/src/components/ai/AutomationSetupDialog';
import { AutomationCard } from '../../apps/web/src/components/ai/AutomationsPanel';
import { WEEKLY_SECTION_KEYS, formatWeekRange, nextWeek, orderedWeeklySections, previousWeek, type WeeklyDigest } from '../../apps/web/src/lib/aiWeekly';
import { CATCHUP_GRACE_HOURS, connectionLabel, scheduleTimingNotes, schedulerView, type ProviderSchedulerStatus } from '../../apps/web/src/lib/aiScheduler';
import { formatDuration, formatPercent, healthOf, INSIGHT_WINDOWS, type AutomationInsights, type AutomationView } from '../../apps/web/src/lib/aiAutomation';
import { formatInZone } from '../../apps/web/src/lib/aiAutomation';
import { legacyCredentials } from '../../apps/web/src/lib/providerConnectors';
import type { ConnectorTokenMetadata } from '../../apps/web/src/lib/claudeConnector';
import {
  AUTOMATION_CATCHUP_GRACE_MS, WEEKLY_SECTION_KEYS as API_WEEKLY_KEYS, buildProviderStatus, buildSchedulerSetup, composeWeeklyDigest, EMPTY_EVIDENCE, type WeeklyInput,
} from '../../apps/api/src/lib/aiContract';
import { INSIGHT_WINDOWS as API_WINDOWS } from '../../apps/api/src/services/aiAutomationInsightsService';

// AI-11H UI: Weekly Digest page, automation activity + health detail, legacy credential management, stable-key / timing copy, readiness.
const noop = () => undefined;

// ---- Weekly ------------------------------------------------------------------------------------------------------------------------
const input = (over: Partial<WeeklyInput> = {}): WeeklyInput => ({
  weekStart: '2026-10-05', currentWeekStart: '2026-10-12', timeZone: 'America/Chicago', windowStart: '2026-10-05T05:00:00.000Z', windowEnd: '2026-10-12T05:00:00.000Z',
  now: new Date('2026-10-14T15:00:00Z'), includeAttention: true, includeAutomationNow: false,
  applications: { added: 2, items: [{ label: '<img src=x onerror=alert(1)> — Dev', stage: 'APPLIED', at: '2026-10-06T15:00:00Z' }] },
  stage: { changes: 0, outcomes: 0, items: [], truncated: false }, interviews: { count: 0, items: [] },
  email: { health: 'failed', job: 0, other: 0, needsAction: 0, high: 0, items: [] }, leads: { health: 'ok', count: 0, strong: 0, items: [] },
  recruiters: { health: 'never', count: 0, verified: 0, items: [] }, tasks: { completed: 1, openDue: 0, items: [] }, goals: [{ type: 'APPLICATIONS', target: 5, actual: 2 }],
  automations: { configured: 0, runs: { total: 0, succeeded: 0, partial: 0, failed: 0, scheduled: 0, manual: 0, retry: 0, sourceProblems: 0 }, attention: null },
  attention: { interviews: [], interviewCount: 0, tasks: [], taskCount: 0, overdueTasks: 0, followUps: [], followUpCount: 0, emailsNeedingAction: 0 },
  ...over,
});
const digest = (over: Partial<WeeklyInput> = {}) => composeWeeklyDigest(input(over)) as unknown as WeeklyDigest;
const panel = (state: Parameters<typeof AiHubWeeklyPanel>[0]['state']) => renderToStaticMarkup(createElement(AiHubWeeklyPanel, { state, onWeek: noop, onRetry: noop }));

describe('Weekly Digest page', () => {
  it('mirrors the server section vocabulary and ordering', () => {
    expect([...WEEKLY_SECTION_KEYS]).toEqual([...API_WEEKLY_KEYS]);
    const d = digest();
    expect(orderedWeeklySections([...d.sections].reverse()).map((s) => s.key)).toEqual([...WEEKLY_SECTION_KEYS].filter((k) => d.sections.some((s) => s.key === k)));
  });
  it('renders the sections, the owner’s week, source states and the reading notes', () => {
    const out = panel({ status: 'ready', digest: digest() });
    expect(out).toContain('data-testid="weekly-digest"');
    expect(out).toContain('Oct 5 – Oct 11, 2026');
    expect(out).toContain('Completed week');
    for (const t of ['Week at a glance', 'Applications', 'Interviews and stage movement', 'Job-related email', 'Fresh job leads', 'Recruiter intelligence', 'Tasks and follow-ups', 'Goal progress', 'Automation health', 'Needs attention next']) expect(out).toContain(t);
    expect(out).toContain('Could not be checked'); // email: unavailable, not zero
    expect(out).toContain('unknown, not zero');
    expect(out).toContain('Not set up'); // recruiters never ran
    expect(out).toContain('Applications: 2 of 5');
    expect(out).toContain('aria-label="How to read this report"');
  });
  it('untrusted record text is escaped, never rendered as markup', () => {
    const out = panel({ status: 'ready', digest: digest() });
    expect(out).not.toContain('<img src=x');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
  it('navigation: previous is bounded by the oldest week, next by the current week; a past week offers "This week"', () => {
    const d = digest();
    expect(previousWeek(d)).toBe('2026-09-28');
    expect(nextWeek(d)).toBe('2026-10-12');
    expect(previousWeek({ weekStart: d.oldestWeekStart, oldestWeekStart: d.oldestWeekStart })).toBeNull();
    expect(nextWeek({ weekStart: d.currentWeekStart, currentWeekStart: d.currentWeekStart })).toBeNull();
    const past = panel({ status: 'ready', digest: d });
    expect(past).toContain('Previous week');
    expect(past).toContain('Next week');
    expect(past).toContain('This week');
    const now = digest({ weekStart: '2026-10-12', currentWeekStart: '2026-10-12', windowStart: '2026-10-12T05:00:00.000Z', windowEnd: '2026-10-19T05:00:00.000Z' });
    const current = panel({ status: 'ready', digest: now });
    expect(current).toContain('This week so far');
    expect(current).not.toContain('>This week<');
    expect(current).toMatch(/<button[^>]*disabled[^>]*>(?:<[^>]*>)*Next week/);
    expect(formatWeekRange('2026-12-28', '2027-01-03')).toBe('Dec 28 – Jan 3, 2027');
  });
  it('loading and error states are accessible and never show a raw backend error', () => {
    expect(panel({ status: 'loading' })).toMatch(/role="status"[^>]*aria-label="Loading the weekly digest"|aria-label="Loading the weekly digest"[^>]*role="status"/);
    const err = panel({ status: 'error', message: 'Something went wrong while building the report. Your data is unchanged.' });
    expect(err).toContain('couldn’t load');
    expect(err).toContain('Try again');
    expect(err).not.toMatch(/PGRST|stack|SELECT|at \w+\.\w+ \(/);
  });
});

// ---- Automation activity + health ----------------------------------------------------------------------------------------------------
const analytics = (over: Partial<AutomationInsights['analytics']> = {}): AutomationInsights['analytics'] => ({
  windowDays: 30, totalRuns: 6, finishedRuns: 5, inFlightRuns: 1, succeeded: 3, partial: 1, failed: 1, cancelled: 0, successRate: 0.6,
  byTrigger: { scheduled: 4, manual: 1, retry: 1 }, retries: { attempts: 1, recovered: 0 },
  byProvider: [{ key: 'claude', runs: 4, succeeded: 3, partial: 0, failed: 1 }, { key: 'gemini', runs: 2, succeeded: 0, partial: 1, failed: 0 }],
  byWorkflow: [{ key: 'daily_brief', runs: 6, succeeded: 3, partial: 1, failed: 1 }], avgCompletionMs: 125_000,
  sourceProblems: { total: 2, byType: [{ key: 'gmail', count: 2 }] },
  recentFailures: [{ runId: 'r9', automationId: 'a1', provider: 'claude', workflow: 'daily_brief', at: '2026-10-13T13:00:00Z', errorCategory: 'SOURCE_UNAVAILABLE', trigger: 'scheduled' }], ...over,
});
const insights = (over: Partial<AutomationInsights> = {}): AutomationInsights => ({ generatedAt: '2026-10-14T15:00:00Z', windowDays: 30, health: {}, analytics: analytics(), truncated: false, ...over });
const activity = (props: Partial<Parameters<typeof AutomationActivity>[0]> = {}) => renderToStaticMarkup(createElement(AutomationActivity, {
  insights: insights(), state: 'ready', days: 30, automations: [{ id: 'a1', name: 'Morning digest' }], onDays: noop, onRetry: noop, formatAt: (i: string) => i.slice(0, 10), ...props,
}));

describe('Automation activity (Part C)', () => {
  it('shows only meaningful, derived numbers with plain labels and an accessible period control', () => {
    const out = activity();
    expect(out).toContain('data-testid="automation-activity"');
    expect(out).toContain('aria-label="Activity period"');
    expect(out).toContain('Last 7 days');
    expect(out).toContain('success rate 60% of finished');
    expect(out).toContain('4 scheduled · 1 manual · 1 retry');
    expect(out).toContain('2 min 05 s');
    expect(out).toContain('2 unavailable, blocked or errored (gmail 2)');
    expect(out).toContain('Claude: 4 runs · 3 succeeded · 1 failed');
    expect(out).toContain('Morning digest');
    expect(out).toContain('nothing here is stored');
    expect(out).not.toMatch(/error_detail|Bearer|secret/i);
  });
  it('empty, loading and error states', () => {
    expect(activity({ insights: insights({ analytics: analytics({ totalRuns: 0, finishedRuns: 0, inFlightRuns: 0, successRate: null }) }) })).toContain('No automation runs in the last 30 days');
    expect(activity({ state: 'loading', insights: null })).toContain('Loading activity');
    const err = activity({ state: 'error', insights: null });
    expect(err).toContain('Couldn’t load activity');
    expect(err).toContain('automations are unaffected');
  });
  it('helpers and the period list match the server', () => {
    expect([...INSIGHT_WINDOWS]).toEqual([...API_WINDOWS]);
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(1)).toBe('100%');
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(42_000)).toBe('42 s');
    expect(formatDuration(3_725_000)).toBe('1 h 02 min');
  });
});

const view = (over: Partial<AutomationView> = {}): AutomationView => ({
  id: 'a1', name: 'Morning digest', workflow: 'daily_brief', enabled: true, provider: 'claude', cadence: 'weekdays', localTime: '08:00', timezone: 'America/Chicago',
  weekdays: [], sections: [], delivery: ['ai_hub'], createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  state: { lastRunAt: '2026-10-14T13:00:00Z', lastStatus: 'FAILED', lastSuccessAt: null, lastErrorCategory: 'TIMEOUT', nextExpectedRunAt: '2026-10-15T13:00:00.000Z' },
  runNow: { ready: false, reason: 'NO_EXECUTOR' }, executor: 'not_configured', ...over,
});
const card = (a: AutomationView, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(AutomationCard, { automation: a, busy: false, onEdit: noop, onToggle: noop, onDelete: noop, ...extra }));

describe('Automation card health (Part B)', () => {
  const health = (over: Record<string, unknown> = {}) => ({
    state: 'needs_attention', label: 'Needs attention', variant: 'warning', reasons: ['The provider credential has expired or its authorization ended. Reconnect it under Providers.', 'The last run failed (timeout).'],
    interventionRequired: true, retry: { attempt: 2, limit: 3, inFlight: false, exhausted: false }, lastRunAt: null, lastSuccessAt: null, lastFailureAt: null, lastTrigger: 'scheduled', nextExpectedRunAt: null, ...over,
  });
  it('without insights it falls back to the basic state badge (never claims provider readiness)', () => {
    const out = card(view());
    expect(out).toContain('Last run failed');
    expect(out).not.toContain('data-testid="automation-health-reasons"');
    expect(healthOf(view(), null).detail).toBeNull();
  });
  it('with insights it shows the derived state, the reasons (what to do) and the retry attempt', () => {
    const ins = insights({ health: { a1: health() as never } });
    const out = card(view(), { insights: ins });
    expect(out).toContain('Needs attention');
    expect(out).toContain('data-testid="automation-health-reasons"');
    expect(out).toContain('Reconnect it under Providers');
    expect(out).toContain('Retry attempt 2 of 3');
    expect(out).toContain('aria-label="Status details for Morning digest"');
  });
});

// ---- Legacy credentials (Part F) ----------------------------------------------------------------------------------------------------
const NOW = Date.parse('2026-10-14T15:00:00Z');
const tok = (over: Partial<ConnectorTokenMetadata> = {}): ConnectorTokenMetadata => ({
  id: 't1', workspace_id: 'w1', name: 'Old gemini test', token_prefix: 'jq_mcp_ab12', scopes: ['jobquest:read', 'ai:read'], created_at: '2026-09-01T10:00:00Z',
  expires_at: '2026-12-01T10:00:00Z', last_used_at: '2026-10-10T10:00:00Z', revoked_at: null, revoked_reason: null, provider: null, status: 'ACTIVE', ...over,
});
const legacy = (tokens: ConnectorTokenMetadata[], extra: Partial<Parameters<typeof LegacyCredentialsView>[0]> = {}) => renderToStaticMarkup(createElement(LegacyCredentialsView, {
  load: { status: 'ready', tokens }, now: NOW, revokeTarget: null, revoking: false, revokeError: null, onAskRevoke: noop, onCancelRevoke: noop, onConfirmRevoke: noop, onRetry: noop, ...extra,
}));

describe('Other connector credentials (Part F)', () => {
  it('selects what the provider cards cannot show: unbound tokens and OAuth-provider tokens, but not a Claude-named token on the Claude card', () => {
    const l = legacyCredentials([
      tok({ id: 'unbound' }), tok({ id: 'claude-card', name: 'Claude connector', provider: 'claude' }), tok({ id: 'oauth', name: 'gem', provider: 'gemini' }),
      tok({ id: 'old', revoked_at: '2026-10-01T00:00:00Z', status: 'REVOKED' }), tok({ id: 'exp', expires_at: '2026-10-01T00:00:00Z', status: 'EXPIRED' }),
    ], NOW);
    expect(l.active.map((t) => t.id).sort()).toEqual(['oauth', 'unbound']);
    expect(l.inactive.map((t) => t.id).sort()).toEqual(['exp', 'old']);
  });
  it('lists SAFE metadata only: name, prefix, scopes, dates, provider, state and a revoke action', () => {
    const out = legacy([tok()]);
    expect(out).toContain('data-testid="legacy-credentials"');
    expect(out).toContain('Other connector credentials');
    expect(out).toContain('Old gemini test');
    expect(out).toContain('jq_mcp_ab12…');
    expect(out).toContain('Not bound to a provider');
    expect(out).toContain('cannot claim automation runs');
    expect(out).toMatch(/Created .*Expires .*Last used/);
    expect(out).toContain('aria-label="Revoke Old gemini test (jq_mcp_ab12)"');
    expect(out).not.toMatch(/token_hash|secret|Bearer|authorization/i);
    expect(out).not.toMatch(/jq_mcp_[A-Za-z0-9_-]{16,}/); // never a full token
  });
  it('shows the provider when bound, and offers no revoke action for expired / revoked history', () => {
    const out = legacy([tok({ provider: 'gemini', name: 'gem' }), tok({ id: 'x', status: 'REVOKED', revoked_at: '2026-10-01T00:00:00Z', name: 'gone' })]);
    expect(out).toContain('Provider: Gemini');
    expect(out).toContain('Show 1 expired or revoked');
    expect((out.match(/>Revoke</g) ?? []).length).toBe(1);
  });
  it('renders nothing for no credentials or while loading (the OAuth-first cards stay uncluttered); errors are quiet and recoverable', () => {
    expect(legacy([])).toBe('');
    expect(legacy([tok({ provider: 'claude', name: 'Claude connector' })])).toBe('');
    expect(renderToStaticMarkup(createElement(LegacyCredentialsView, { load: { status: 'loading' }, revokeTarget: null, revoking: false, revokeError: null, onAskRevoke: noop, onCancelRevoke: noop, onConfirmRevoke: noop, onRetry: noop }))).toBe('');
    const err = renderToStaticMarkup(createElement(LegacyCredentialsView, { load: { status: 'error', message: 'x' }, revokeTarget: null, revoking: false, revokeError: null, onAskRevoke: noop, onCancelRevoke: noop, onConfirmRevoke: noop, onRetry: noop }));
    expect(err).toContain('role="alert"');
    expect(err).toContain('Try again');
    expect(legacy([tok()], { revokeError: 'Couldn’t revoke the credential. Try again.' })).toContain('Couldn’t revoke the credential');
  });
  it('uses the existing supported revoke route and creates no new mechanism', () => {
    const src = readFileSync('apps/web/src/components/ai/LegacyCredentialsPanel.tsx', 'utf8');
    expect(src).toContain("revokeConnectorToken(revokeTarget.id, session)");
    expect(readFileSync('apps/web/src/api/aiConnectors.ts', 'utf8')).toContain('/ai/connector-tokens/${encodeURIComponent(id)}/revoke');
    expect(src).not.toMatch(/createConnectorToken|localStorage|sessionStorage/);
  });
});

// ---- Setup copy: stable key + timing (Parts D/E) ----------------------------------------------------------------------------------------
const setupAuto = { id: '123e4567-e89b-42d3-a456-426614174000', name: 'Morning digest', workflow: 'daily_brief' as const, provider: 'claude' as const, enabled: true, cadence: 'weekdays' as const, localTime: '08:00', timezone: 'America/Chicago', weekdays: [], sections: ['email_triage' as const] };
const status = (over: Partial<ProviderSchedulerStatus> = {}): ProviderSchedulerStatus => ({ ...(buildProviderStatus('claude', 'connected', true, EMPTY_EVIDENCE) as unknown as ProviderSchedulerStatus), ...over });
const setupBody = (a: AutomationView, extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(AutomationSetupBody, {
  data: { setup: buildSchedulerSetup(setupAuto, 'mabcdef0123456789abc') as never, status: status() }, mode: 'manual', copied: null, copyError: null, onCopy: noop, automation: a, ...extra,
}));

describe('Setup instructions: run key and timing', () => {
  it('shows the generated run key, explains that re-pasting is safe, and offers a new run on request', () => {
    const out = setupBody(view(), { onNewRun: noop });
    expect(out).toContain('data-testid="manual-key-note"');
    expect(out).toContain('mabcdef0123456789abc');
    expect(out).toContain('Pasting the <b>same</b> text again');
    expect(out).toContain('New run (new key)');
    expect(out).toContain('&quot;clientKey&quot;: &quot;mabcdef0123456789abc&quot;');
    expect(setupBody(view())).not.toContain('New run (new key)');
  });
  it('states timezone, next occurrence, catch-up and disabled behaviour plainly', () => {
    const fmt = (iso: string | null, zone: string | null) => formatInZone(iso, zone);
    const enabled = scheduleTimingNotes({ enabled: true, cadence: 'weekdays', timezone: 'America/Chicago', nextExpectedRunAt: '2026-10-15T13:00:00.000Z' }, fmt).join('\n');
    expect(enabled).toMatch(/America\/Chicago, the zone you chose/);
    expect(enabled).toMatch(/Next expected occurrence: .*8:00 AM CDT/);
    expect(enabled).toMatch(/within 3 hours still runs it \(catch-up\)/);
    expect(enabled).toMatch(/never replays older ones|editing the schedule never replays/);
    expect(enabled).toMatch(/Run in provider.*Manual run.*never replaces or moves the next scheduled occurrence/);
    const disabled = scheduleTimingNotes({ enabled: false, cadence: 'weekdays', timezone: 'America/Chicago', nextExpectedRunAt: null }, fmt).join('\n');
    expect(disabled).toMatch(/Disabled: JobQuest answers any provider claim with DISABLED/);
    expect(disabled).not.toMatch(/Next expected occurrence/);
    expect(scheduleTimingNotes({ enabled: true, cadence: 'manual_only', timezone: null, nextExpectedRunAt: null }, fmt)[0]).toMatch(/no schedule/);
    const out = setupBody(view());
    expect(out).toContain('data-testid="schedule-timing-notes"');
    expect(out).toContain('aria-label="When this runs"');
  });
  it('the catch-up window in the copy equals the server grace', () => {
    expect(CATCHUP_GRACE_HOURS * 3_600_000).toBe(AUTOMATION_CATCHUP_GRACE_MS);
  });
});

// ---- Provider readiness (Part G) ---------------------------------------------------------------------------------------------------
describe('Provider readiness distinguishes the real states (Part G)', () => {
  const s = (over: Partial<ProviderSchedulerStatus>) => status({ connection: 'not_connected', canIngest: false, scheduler: 'NOT_CONNECTED', credential: 'none', ...over });
  it('not connected / expired / revoked / read-only / setup required / unverified / ready are all different, derived from state only', () => {
    const labels = [
      schedulerView(s({})).label, schedulerView(s({ credential: 'expired' })).label, schedulerView(s({ credential: 'revoked' })).label,
      schedulerView(s({ connection: 'connected', credential: 'active' })).key,
      schedulerView(status({ scheduler: 'SETUP_REQUIRED' })).label, schedulerView(status({ scheduler: 'UNVERIFIED' })).label, schedulerView(status({ scheduler: 'READY' })).label,
    ];
    expect(labels).toEqual(['Connect the provider first', 'Credential expired', 'Credential revoked', 'READ_ONLY', 'Needs setup', 'Needs validation', 'Ready']);
    expect(schedulerView(s({ credential: 'expired' })).variant).toBe('danger');
  });
  it('an automation that depends on an unavailable provider says so; connection copy names the lapse', () => {
    expect(schedulerView(s({ credential: 'revoked' }), { hasAutomation: true }).help).toMatch(/An automation uses Claude, so its provider runs will be refused/);
    expect(schedulerView(s({ credential: 'revoked' })).help).not.toMatch(/An automation uses/);
    expect(connectionLabel(s({ credential: 'expired' }))).toBe('Not connected (credential expired)');
    expect(connectionLabel(s({ credential: 'revoked' }))).toBe('Not connected (credential revoked)');
    expect(connectionLabel(s({}))).toBe('Not connected');
  });
  it('READY is never hard-coded: only the server’s evidence-derived scheduler value yields it', () => {
    for (const p of ['claude', 'chatgpt', 'gemini'] as const) {
      expect(schedulerView(status({ provider: p, scheduler: 'SETUP_REQUIRED' })).key).not.toBe('READY');
    }
    for (const f of ['apps/web/src/lib/aiScheduler.ts', 'apps/web/src/components/ai/ProviderSchedulerSummary.tsx']) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/scheduler:\s*'READY'|provider ===? '(claude|chatgpt|gemini)' \? 'READY'/);
    }
  });
});
