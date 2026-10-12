import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync } from 'node:fs';
import {
  DIGEST_LIMITS, DIGEST_SECTION_KEYS as SERVER_SECTIONS, DIGEST_SECTION_STATUSES, DIGEST_SUMMARY_KEYS as SERVER_SUMMARY,
} from '../../apps/api/src/lib/aiContract';
import { AI_WORKFLOWS } from '../../apps/api/src/lib/aiContract';
import { CONNECTOR_SCOPES as MCP_SCOPES } from '../../apps/api/src/lib/aiConnectorTokens';
import {
  DIGEST_SECTION_KEYS, DIGEST_SECTION_ORDER, DIGEST_SECTION_STATUS_VALUES, DIGEST_SUMMARY_KEYS, combineDigests, formatDigestDate,
  groupDigestsByDate, parseDigestPayload, resolveDigestRange, shiftDay, todayKey, type DigestRow,
} from '../../apps/web/src/lib/aiDigest';
import { aiHubPathForTab, aiHubTabFromPath } from '../../apps/web/src/lib/aiHub';
import {
  AI_WORKFLOW_DEFINITIONS, AI_WORKFLOW_STATUS_LABELS, workflowAvailability,
} from '../../apps/web/src/lib/aiWorkflowDefinitions';
import { AiHubDigestPanel, type DigestPanelProps } from '../../apps/web/src/views/AiHubDigest';
import { AiHubShell } from '../../apps/web/src/views/AiHubView';
import { digestPayload } from './fixtures/ai-contract/fixtures';

const noop = () => undefined;
const row = (over: Partial<DigestRow> & { payload?: Record<string, unknown> } = {}): DigestRow => ({
  id: 'd1', user_id: 'u1', provider: 'claude', status: 'NEW', title: 'Daily digest', summary: null,
  created_at: '2026-10-01T12:00:00Z', payload: digestPayload(), ...over,
});
const props = (over: Partial<DigestPanelProps> = {}): DigestPanelProps => ({
  state: { status: 'ready', rows: [row()], hasNext: false }, preset: 'last7', customFrom: '', customTo: '', provider: 'ALL', page: 0,
  today: '2026-10-01', timeZone: 'America/Chicago', onPreset: noop, onCustom: noop, onProvider: noop, onPage: noop, ...over,
});
const html = (over: Partial<DigestPanelProps> = {}) => renderToStaticMarkup(createElement(AiHubDigestPanel, props(over)));

describe('client/server digest contract sync', () => {
  it('section keys, statuses and summary keys match the server contract', () => {
    expect([...DIGEST_SECTION_KEYS]).toEqual([...SERVER_SECTIONS]);
    expect([...DIGEST_SECTION_STATUS_VALUES]).toEqual([...DIGEST_SECTION_STATUSES]);
    expect([...DIGEST_SUMMARY_KEYS]).toEqual([...SERVER_SUMMARY]);
    expect(DIGEST_SECTION_ORDER.map((s) => s.key).sort()).toEqual([...SERVER_SECTIONS].sort());
    expect(DIGEST_LIMITS.itemsPerSection).toBe(5);
  });
});

describe('parseDigestPayload (untrusted stored payload)', () => {
  it('parses a 1.0 digest and keeps zero and not_configured distinct', () => {
    const d = parseDigestPayload(digestPayload())!;
    expect(d.digestDate).toBe('2026-10-01');
    expect(d.sections.email_activity).toEqual({ status: 'zero', count: 0, items: [] });
    expect(d.sections.job_leads).toEqual({ status: 'not_configured', count: null, items: [] });
    expect(d.sections.recruiter_intel).toBeUndefined();
    expect(d.summary.map((s) => s.key)).toEqual(['applications_added', 'active_applications', 'follow_ups', 'pending_suggestions']);
  });
  it.each([null, 'x', {}, { version: '2.0', digest_date: '2026-10-01' }, { version: '1.0' }, { version: '1.0', digest_date: '2026-02-30' }, { date: '2026-10-01', highlights: ['legacy'] }])(
    'rejects unsupported/legacy payload %j instead of guessing', (p) => { expect(parseDigestPayload(p)).toBeNull(); });
  it('drops unsafe links and malformed items; only http(s) links survive', () => {
    const d = parseDigestPayload(digestPayload({ priorities: [{ title: 'ok', url: 'javascript:alert(1)' }, { title: 'linked', url: 'https://example.com/x' }, { nope: 1 }, 'str'] }))!;
    expect(d.priorities).toEqual([{ title: 'ok' }, { title: 'linked', url: 'https://example.com/x' }]);
  });
  it('items under a zero/not_configured section are never displayed', () => {
    const d = parseDigestPayload(digestPayload({ sections: { email_activity: { status: 'zero', items: [{ title: 'sneaky' }] } } }))!;
    expect(d.sections.email_activity!.items).toEqual([]);
  });
});

describe('combined (All providers) view is deterministic', () => {
  const claude = parseDigestPayload(digestPayload({ summary: { follow_ups: 2 }, priorities: [{ title: 'Call Acme', priority: 'HIGH' }], sections: { applications: { status: 'available', count: 2, items: [{ title: 'Acme — Engineer' }] }, job_leads: { status: 'not_configured', items: [] } } }))!;
  const system = parseDigestPayload(digestPayload({ summary: { follow_ups: 3, applications_added: 1 }, priorities: [{ title: 'call acme' }, { title: 'Review suggestions' }], sections: { applications: { status: 'available', count: 1, items: [{ title: 'Acme — Engineer' }, { title: 'Beta — PM' }] }, job_leads: { status: 'zero', count: 0, items: [] } } }))!;
  it('uses max counts, dedupes items with provenance, and prefers the most informative section status', () => {
    const c = combineDigests([{ provider: 'claude', digest: claude }, { provider: 'system', digest: system }]);
    expect(c.summary.find((s) => s.key === 'follow_ups')!.value).toBe(3); // max, never the sum
    expect(c.sections.applications!.count).toBe(2);
    expect(c.sections.applications!.items.map((i) => [i.title, i.providers])).toEqual([['Acme — Engineer', ['claude', 'system']], ['Beta — PM', ['system']]]);
    expect(c.sections.job_leads!.status).toBe('zero'); // checked-and-empty beats not configured
    expect(c.priorities[0]).toMatchObject({ title: 'Call Acme', priority: 'HIGH' });
    expect(c.priorities.map((p) => [p.title, p.providers])).toEqual([['Call Acme', ['claude', 'system']], ['Review suggestions', ['system']]]); // case-insensitive exact title; no fuzzy merging
  });
  it('is order independent for the facts it reports', () => {
    const a = combineDigests([{ provider: 'claude', digest: claude }, { provider: 'system', digest: system }]);
    const b = combineDigests([{ provider: 'system', digest: system }, { provider: 'claude', digest: claude }]);
    expect(b.summary).toEqual(a.summary);
    expect(b.sections.job_leads).toEqual(a.sections.job_leads);
  });
});

describe('date ranges (owner profile time zone)', () => {
  it('Today, Yesterday and Last 7 days resolve from the zone-local today', () => {
    const now = new Date('2026-10-12T02:30:00Z');
    expect(todayKey(now, 'America/Chicago')).toBe('2026-10-11');
    expect(todayKey(now, 'UTC')).toBe('2026-10-12');
    expect(resolveDigestRange('today', '2026-10-11', { from: '', to: '' })).toEqual({ ok: true, dateFrom: '2026-10-11', dateTo: '2026-10-11' });
    expect(resolveDigestRange('yesterday', '2026-10-11', { from: '', to: '' })).toEqual({ ok: true, dateFrom: '2026-10-10', dateTo: '2026-10-10' });
    expect(resolveDigestRange('last7', '2026-10-11', { from: '', to: '' })).toEqual({ ok: true, dateFrom: '2026-10-05', dateTo: '2026-10-11' });
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('validates custom ranges', () => {
    expect(resolveDigestRange('custom', '2026-10-11', { from: '', to: '' })).toMatchObject({ ok: false });
    expect(resolveDigestRange('custom', '2026-10-11', { from: '2026-10-05', to: '2026-10-01' })).toMatchObject({ ok: false, message: expect.stringMatching(/on or before/) });
    expect(resolveDigestRange('custom', '2026-10-11', { from: '2024-01-01', to: '2026-01-01' })).toMatchObject({ ok: false });
    expect(resolveDigestRange('custom', '2026-10-11', { from: '2026-10-01', to: '2026-10-05' })).toEqual({ ok: true, dateFrom: '2026-10-01', dateTo: '2026-10-05' });
  });
  it('formats a calendar day without time-zone drift', () => {
    expect(formatDigestDate('2026-10-11')).toMatch(/October 11, 2026/);
    expect(formatDigestDate('nope')).toBe('');
  });
  it('groups newest date first and keeps providers of one date together', () => {
    const g = groupDigestsByDate([row({ id: 'a', payload: digestPayload({ digest_date: '2026-09-30' }) }), row({ id: 'b', provider: 'system' }), row({ id: 'c' })]);
    expect(g.map((x) => [x.date, x.entries.map((e) => e.id)])).toEqual([['2026-10-01', ['b', 'c']], ['2026-09-30', ['a']]]);
  });
});

describe('Daily Digest panel states', () => {
  it('loading: announces status and shows no digest content', () => {
    const h = html({ state: { status: 'loading' } });
    expect(h).toContain('role="status"');
    expect(h).toContain('Loading Daily Digest');
    expect(h).not.toContain('Top Priorities');
  });
  it('error: isolated alert with retry and reassurance', () => {
    const h = html({ state: { status: 'error' }, onRetry: noop });
    expect(h).toContain('role="alert"');
    expect(h).toContain('Daily Digest could not be loaded.');
    expect(h).toContain('Try again');
  });
  it('today without a stored digest: explicit message, live metrics labelled as not stored', () => {
    const h = html({ preset: 'today', state: { status: 'ready', rows: [], hasNext: false }, live: { status: 'ready', metrics: { applicationsAdded: 2, activeApplications: 9, followUps: 1, pendingSuggestions: 3 } }, onGenerate: noop });
    expect(h).toContain('No Daily Digest has been generated for today.');
    expect(h).toContain('Live JobQuest metrics');
    expect(h).toContain('not a stored digest');
    expect(h).toContain('Save a JobQuest digest for today');
  });
  it('yesterday and range empties do not show live metrics or fabricate a digest', () => {
    const y = html({ preset: 'yesterday', state: { status: 'ready', rows: [], hasNext: false } });
    expect(y).toContain('No Daily Digest was stored for yesterday.');
    expect(y).not.toContain('Live JobQuest metrics');
    expect(html({ preset: 'last7', state: { status: 'ready', rows: [], hasNext: false }, provider: 'chatgpt' })).toContain('Nothing stored for ChatGPT');
  });
  it('renders a stored digest: header, summary, priorities, sections and distinct source states', () => {
    const h = html();
    expect(h).toContain('Daily Digest');
    expect(h).toContain('October 1, 2026');
    expect(h).toContain('Claude');
    expect(h).toContain('Generated');
    expect(h).toContain('Top Priorities');
    expect(h).toContain('Follow up with Example Corp');
    expect(h).toContain('Applications');
    expect(h).toContain('Job Leads: Not configured'); // availability chips
    expect(h).toContain('Email Activity: None found');
    expect(h).toContain('This source is not configured yet');
    expect(h).toContain('Checked: nothing to report.');
    expect(h).not.toContain('Recruiter Intelligence'); // omitted when the digest does not report it
  });
  it('shows a Combined view only for All providers with more than one digest on a date', () => {
    const two = { status: 'ready' as const, rows: [row({ id: 'a' }), row({ id: 'b', provider: 'system' })], hasNext: false };
    expect(html({ state: two })).toContain('Combined view of 2 providers');
    expect(html({ state: two, provider: 'claude' })).not.toContain('Combined view');
  });
  it('unsupported payloads degrade gracefully; long titles wrap; HTML in titles is escaped', () => {
    expect(html({ state: { status: 'ready', rows: [row({ payload: { date: '2026-10-01' } })], hasNext: false } })).toContain('format this version of JobQuest cannot display');
    const long = 'L'.repeat(150);
    const h = html({ state: { status: 'ready', rows: [row({ payload: digestPayload({ priorities: [{ title: `<img src=x onerror=alert(1)>${long}` }] }) })], hasNext: false } });
    expect(h).toContain('overflow-wrap:anywhere');
    expect(h).not.toContain('<img');
    expect(h).toContain('&lt;img');
  });
  it('custom range: labelled date inputs and an inline accessible error for a bad range', () => {
    const h = html({ preset: 'custom', customFrom: '2026-10-05', customTo: '2026-10-01' });
    expect(h).toContain('From date');
    expect(h).toContain('To date');
    expect(h).toContain('aria-invalid="true"');
    expect(h).toContain('on or before');
  });
  it('controls are labelled; presets expose aria-pressed; pagination appears only when needed', () => {
    const h = html({ state: { status: 'ready', rows: [row()], hasNext: true }, page: 1 });
    expect(h).toContain('aria-label="Digest date range"');
    expect(h).toContain('aria-pressed="true"');
    expect(h).toContain('Provider');
    expect(h).toContain('Digest pagination');
    expect(html()).not.toContain('Digest pagination');
  });
  it('external links open safely', () => {
    const h = html({ state: { status: 'ready', rows: [row({ payload: digestPayload({ priorities: [{ title: 'Read posting', url: 'https://example.com/job' }] }) })], hasNext: false } });
    expect(h).toContain('rel="noopener noreferrer"');
  });
});

describe('AI Hub navigation', () => {
  it('adds a Daily Digest tab and route without breaking Overview/History', () => {
    expect(aiHubTabFromPath('/ai-hub/digest')).toBe('digest');
    expect(aiHubPathForTab('digest')).toBe('/ai-hub/digest');
    expect(aiHubTabFromPath('/ai-hub')).toBe('overview');
    expect(aiHubTabFromPath('/ai-hub/history')).toBe('history');
    const shell = renderToStaticMarkup(createElement(AiHubShell, { tab: 'digest', onTabChange: noop, state: { status: 'loading' }, digest: createElement('p', null, 'DIGEST-SLOT') }));
    for (const label of ['Overview', 'Daily Digest', 'History']) expect(shell).toContain(label);
    expect(shell).toContain('DIGEST-SLOT');
    for (const hidden of ['Job Leads', 'Recruiter Intel', 'Calendar']) expect(shell).not.toContain(hidden); // no empty fake product pages
  });
  it('is registered behind the existing AI Hub exposure check only', () => {
    const app = readFileSync('apps/web/src/App.tsx', 'utf8');
    expect(app).toMatch(/routePath === '\/ai-hub\/digest'/);
    expect(app).toMatch(/if \(!isAiHubExposed\(\)\) return notFoundView/);
  });
});

describe('workflow definitions', () => {
  it('cover the five required workflows with canonical ids, valid scopes and existing templates', () => {
    expect(AI_WORKFLOW_DEFINITIONS.map((d) => d.name)).toEqual(['Daily Digest', 'Job Discovery', 'Email Triage', 'Recruiter Intelligence', 'Calendar Intelligence']);
    for (const d of AI_WORKFLOW_DEFINITIONS) {
      expect(AI_WORKFLOWS, d.id).toContain(d.id);
      for (const s of d.requiredScopes) expect(MCP_SCOPES, `${d.id}:${s}`).toContain(s);
      expect(existsSync(d.claudeTemplate), d.claudeTemplate).toBe(true);
      expect(d.recommendedCadence.length).toBeGreaterThan(0);
    }
  });
  it('never claims a workflow is Running (no JobQuest scheduler exists) and separates source readiness', () => {
    expect(Object.values(AI_WORKFLOW_STATUS_LABELS).join()).not.toMatch(/running/i);
    const by = Object.fromEntries(AI_WORKFLOW_DEFINITIONS.map((d) => [d.id, d]));
    expect(workflowAvailability(by.daily_brief!)).toBe('AVAILABLE');
    expect(workflowAvailability(by.daily_brief!, { claudeConnected: false })).toBe('PROVIDER_SETUP_REQUIRED');
    expect(workflowAvailability(by.email_triage!)).toBe('SOURCE_NOT_IMPLEMENTED');
    expect(workflowAvailability(by.daily_brief!, { disabled: true })).toBe('DISABLED');
  });
  it('the API has no scheduler dependency or timer', () => {
    const files = ['apps/api/package.json', 'package.json', 'vercel.json'].filter(existsSync).map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(files).not.toMatch(/node-cron|"crons"|node-schedule|agenda/);
  });
});
