import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';

vi.mock('../../apps/web/src/supabase', () => ({ supabase: { from: () => { throw new Error('unexpected'); }, rpc: () => { throw new Error('unexpected'); } } }));

import * as C from '../../apps/api/src/lib/aiContract';
import * as W from '../../apps/web/src/lib/aiAutomation';
import { AutomationCard, AutomationFormFields, AutomationsView, type AutomationsViewProps } from '../../apps/web/src/components/ai/AutomationsPanel';
import { AiAutomationSettings } from '../../apps/web/src/views/AiAutomationSettings';
import { AiHubOverview, NextAutomationCard } from '../../apps/web/src/views/AiHubView';
import { fetchAiHubSnapshot } from '../../apps/web/src/api/aiHub';
import { fetchAutomations, saveAutomation, deleteAutomation, AutomationApiError } from '../../apps/web/src/api/aiAutomations';
import { isAiHubEmpty, type AiHubSnapshot } from '../../apps/web/src/lib/aiHub';

const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
const noop = () => undefined;
const WS = '11111111-1111-4111-8111-111111111111';
const SESSION = { access_token: 'tok', token_type: 'bearer' } as const;

const view = (over: Partial<W.AutomationView> = {}): W.AutomationView => ({
  id: 'a1', name: 'Weekday Morning Digest', workflow: 'daily_brief', enabled: true, provider: 'claude', cadence: 'weekdays', localTime: '08:00',
  timezone: 'America/Chicago', weekdays: [], sections: ['email_triage', 'followups'], delivery: ['ai_hub', 'email_summary'],
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  state: { lastRunAt: null, lastStatus: null, lastSuccessAt: null, lastErrorCategory: null, nextExpectedRunAt: '2026-10-14T13:00:00.000Z' },
  runNow: { ready: false, reason: 'NO_EXECUTOR' }, ...over,
});
const form = (over: Partial<W.AutomationFormState> = {}): W.AutomationFormState => ({ ...W.emptyAutomationForm('America/Chicago'), name: 'Digest', ...over });
const viewProps = (over: Partial<AutomationsViewProps> = {}): AutomationsViewProps => ({
  load: { status: 'ready', automations: [view()] }, busyId: null, actionError: null, onNew: noop, onEdit: noop, onToggle: noop, onDelete: noop, onRetry: noop, ...over,
});

describe('client/server contract sync', () => {
  it('every vocabulary, limit and label matches the server contract', () => {
    expect([...W.AUTOMATION_CADENCES]).toEqual([...C.AUTOMATION_CADENCES]);
    expect([...W.AUTOMATION_PROVIDERS]).toEqual([...C.AUTOMATION_PROVIDERS]);
    expect([...W.AUTOMATION_SECTIONS]).toEqual([...C.AUTOMATION_SECTIONS]);
    expect([...W.AUTOMATION_DELIVERY]).toEqual([...C.AUTOMATION_DELIVERY]);
    expect([...W.AUTOMATION_WORKFLOWS]).toEqual([...C.AI_WORKFLOWS]);
    expect([...W.AUTOMATION_COMPOSITE_WORKFLOWS]).toEqual([...C.AUTOMATION_COMPOSITE_WORKFLOWS]);
    expect(W.AUTOMATION_NAME_MAX).toBe(C.AUTOMATION_NAME_MAX);
    expect(W.AUTOMATION_LIMIT).toBe(C.AUTOMATION_LIMIT);
    for (const c of C.AUTOMATION_CADENCES) expect(W.CADENCE_LABELS[c]).toBeTruthy();
    for (const p of C.AUTOMATION_PROVIDERS) expect(W.PROVIDER_LABELS[p]).toBeTruthy();
    for (const s of C.AUTOMATION_SECTIONS) expect(W.SECTION_LABELS[s]).toBeTruthy();
    for (const d of C.AUTOMATION_DELIVERY) expect(W.DELIVERY_LABELS[d]).toBeTruthy();
    for (const w of C.AI_WORKFLOWS) expect(W.WORKFLOW_LABELS[w]).toBeTruthy();
    expect(W.WEEKDAY_LABELS.map((d) => d.value)).toEqual([...C.AUTOMATION_WEEKDAYS]);
  });

  it('whatever the form produces, the server contract accepts (every cadence)', () => {
    const cases: Array<Partial<W.AutomationFormState>> = [
      { cadence: 'daily' }, { cadence: 'weekdays' }, { cadence: 'weekly', weekdays: [7], localTime: '19:00', name: 'Weekly Job Search Review', workflow: 'other' },
      { cadence: 'selected_days', weekdays: [6, 7, 6] }, { cadence: 'manual_only' },
      { workflow: 'email_triage', sections: ['followups'] }, // the form drops sections a single-purpose workflow cannot carry
      { delivery: ['email_summary'] }, // ai_hub is always added
    ];
    for (const c of cases) {
      const r = C.validateAutomation(W.formToBody(form(c)));
      expect(r.ok, JSON.stringify(c)).toBe(true);
    }
  });
});

describe('form helpers', () => {
  it('sections display in vocabulary order regardless of storage order', () => {
    expect(W.orderedSections(['recruiter_intel', 'followups', 'email_triage'])).toEqual(['email_triage', 'recruiter_intel', 'followups']);
    expect(W.orderedSections([])).toEqual([]);
  });

  it('formToBody normalizes away fields the cadence/workflow cannot carry', () => {
    expect(W.formToBody(form({ cadence: 'manual_only', weekdays: [1], localTime: '08:00', timezone: 'UTC' }))).toMatchObject({ localTime: null, timezone: null, weekdays: [] });
    expect(W.formToBody(form({ cadence: 'daily', weekdays: [1, 2] })).weekdays).toEqual([]);
    expect(W.formToBody(form({ cadence: 'selected_days', weekdays: [5, 1] })).weekdays).toEqual([1, 5]);
    expect(W.formToBody(form({ workflow: 'job_discovery', sections: ['followups'] })).sections).toEqual([]);
    expect(W.formToBody(form({ workflow: 'daily_brief', sections: ['followups'] })).sections).toEqual(['followups']);
    expect(W.formToBody(form({ delivery: ['email_summary'] })).delivery).toEqual(['ai_hub', 'email_summary']);
    expect(W.formToBody(form({ name: '  Padded  ' })).name).toBe('Padded');
  });

  it('pre-validates required fields per cadence (server stays the authority)', () => {
    expect(W.validateAutomationForm(form())).toEqual({});
    expect(W.validateAutomationForm(form({ name: '  ' })).name).toBeTruthy();
    expect(W.validateAutomationForm(form({ name: 'x'.repeat(81) })).name).toBeTruthy();
    expect(W.validateAutomationForm(form({ localTime: '' })).localTime).toBeTruthy();
    expect(W.validateAutomationForm(form({ timezone: 'Mars/Phobos' })).timezone).toBeTruthy();
    expect(W.validateAutomationForm(form({ timezone: 'EST' })).timezone).toBeTruthy();
    expect(W.validateAutomationForm(form({ cadence: 'weekly', weekdays: [] })).weekdays).toBeTruthy();
    expect(W.validateAutomationForm(form({ cadence: 'weekly', weekdays: [1, 2] })).weekdays).toBeTruthy();
    expect(W.validateAutomationForm(form({ cadence: 'selected_days', weekdays: [] })).weekdays).toBeTruthy();
    expect(W.validateAutomationForm(form({ cadence: 'selected_days', weekdays: [3] }))).toEqual({});
    expect(W.validateAutomationForm(form({ cadence: 'manual_only', localTime: '', timezone: '' }))).toEqual({});
  });

  it('view -> form -> body round-trips an existing automation', () => {
    const v = view({ cadence: 'selected_days', weekdays: [1, 3, 5], localTime: '09:30' });
    expect(W.formToBody(W.automationToForm(v, 'UTC'))).toEqual({
      name: v.name, workflow: 'daily_brief', enabled: true, provider: 'claude', cadence: 'selected_days', localTime: '09:30', timezone: 'America/Chicago',
      weekdays: [1, 3, 5], sections: ['email_triage', 'followups'], delivery: ['ai_hub', 'email_summary'],
    });
    expect(W.automationToForm(view({ cadence: 'manual_only', localTime: null, timezone: null }), 'Europe/Paris')).toMatchObject({ localTime: '08:00', timezone: 'Europe/Paris' });
  });
});

describe('presentation helpers', () => {
  it('describes schedules in plain language', () => {
    expect(W.describeSchedule(view())).toBe('Weekdays at 8:00 AM · America/Chicago');
    expect(W.describeSchedule(view({ cadence: 'weekly', weekdays: [7], localTime: '19:00' }))).toBe('Sundays at 7:00 PM · America/Chicago');
    expect(W.describeSchedule(view({ cadence: 'daily', localTime: '00:05' }))).toBe('Every day at 12:05 AM · America/Chicago');
    expect(W.describeSchedule(view({ cadence: 'daily', localTime: '12:00' }))).toBe('Every day at 12:00 PM · America/Chicago');
    expect(W.describeSchedule(view({ cadence: 'selected_days', weekdays: [5, 1, 3], localTime: '09:30' }))).toBe('Mon, Wed, Fri at 9:30 AM · America/Chicago');
    expect(W.describeSchedule(view({ cadence: 'manual_only', localTime: null, timezone: null }))).toBe('Manual only');
  });

  it('renders run instants in the automation\'s own zone, with the zone named', () => {
    expect(W.formatInZone('2026-10-14T13:00:00.000Z', 'America/Chicago')).toBe('Wed, Oct 14, 8:00 AM CDT');
    expect(W.formatInZone('2026-11-02T14:00:00.000Z', 'America/Chicago')).toBe('Mon, Nov 2, 8:00 AM CST');
    expect(W.formatInZone('2026-10-14T13:00:00.000Z', 'Asia/Tokyo')).toContain('10:00 PM');
    expect(W.formatInZone(null, 'UTC')).toBe('—');
    expect(W.formatInZone('garbage', 'UTC')).toBe('—');
    expect(W.formatInZone('2026-10-14T13:00:00.000Z', 'Mars/Phobos')).toBe('2026-10-14T13:00:00.000Z');
  });

  it('health is a single honest label: disabled > failed > partial > healthy > waiting', () => {
    const h = (over: Partial<W.AutomationView['state']>, a: Partial<W.AutomationView> = {}) => W.automationHealth({ ...view(a), state: { ...view().state, ...over } });
    expect(h({}, { enabled: false })).toEqual({ label: 'Disabled', variant: 'muted' });
    expect(h({ lastStatus: 'FAILED', lastRunAt: 'x' }).label).toBe('Last run failed');
    expect(h({ lastStatus: 'PARTIAL', lastRunAt: 'x' }).label).toBe('Last run partial');
    expect(h({ lastStatus: 'SUCCEEDED', lastRunAt: 'x' })).toEqual({ label: 'Healthy', variant: 'success' });
    expect(h({ lastStatus: 'RUNNING', lastRunAt: 'x' }).label).toBe('In progress');
    expect(h({}).label).toBe('Waiting for first run');
    expect(h({}, { cadence: 'manual_only' }).label).toBe('Manual');
    expect(h({ lastStatus: 'FAILED', lastRunAt: 'x' }, { enabled: false }).label).toBe('Disabled'); // a disabled automation is never "failing"
  });

  it('next automation = soonest enabled scheduled one; summary counts failures among enabled only', () => {
    const early = view({ id: 'e', name: 'Early', state: { ...view().state, nextExpectedRunAt: '2026-10-14T11:00:00.000Z' } });
    const late = view({ id: 'l', name: 'Late' });
    const off = view({ id: 'o', name: 'Off', enabled: false, state: { ...view().state, nextExpectedRunAt: '2026-10-14T01:00:00.000Z', lastStatus: 'FAILED' } });
    const manual = view({ id: 'm', name: 'Manual', cadence: 'manual_only', state: { ...view().state, nextExpectedRunAt: null } });
    expect(W.nextAutomation([late, off, manual, early])?.id).toBe('e');
    expect(W.nextAutomation([off, manual])).toBeNull();
    expect(W.nextAutomation([])).toBeNull();
    const failing = view({ id: 'f', state: { ...view().state, lastStatus: 'FAILED' } });
    expect(W.summarizeAutomations([late, off, manual, failing])).toMatchObject({ total: 4, enabled: 3, failing: 1 });
  });
});

describe('Automations settings UI', () => {
  it('renders loading, error (with retry), empty and list states', () => {
    expect(html(createElement(AutomationsView, viewProps({ load: { status: 'loading' } })))).toContain('Loading automations');
    const err = html(createElement(AutomationsView, viewProps({ load: { status: 'error', message: 'Couldn’t load automations. The rest of Settings is unaffected.' } })));
    expect(err).toContain('role="alert"');
    expect(err).toContain('Try again');
    const empty = html(createElement(AutomationsView, viewProps({ load: { status: 'ready', automations: [] } })));
    expect(empty).toContain('No automations yet');
    expect(empty).toContain('New automation');
    const list = html(createElement(AutomationsView, viewProps()));
    expect(list).toContain('Weekday Morning Digest');
    expect(list).toContain('Weekdays at 8:00 AM · America/Chicago');
    expect(list).toContain('Sections: Email triage, Follow-ups');
    expect(html(createElement(AutomationsView, viewProps({ load: { status: 'ready', automations: [view({ sections: ['followups', 'calendar_review', 'email_triage'] })] } })))).toContain('Sections: Email triage, Calendar review, Follow-ups');
    expect(list).toContain('Delivery: AI Hub, Email summary');
    expect(list).toContain('Wed, Oct 14, 8:00 AM CDT');
    expect(list).toContain('No runs yet');
  });

  it('New automation is disabled while loading/failed and at the limit', () => {
    const btn = (p: AutomationsViewProps) => /<button[^>]*>New automation<\/button>/.exec(html(createElement(AutomationsView, p)))![0];
    expect(btn(viewProps({ load: { status: 'loading' } }))).toContain('disabled');
    expect(btn(viewProps({ load: { status: 'error', message: 'x' } }))).toContain('disabled');
    expect(btn(viewProps())).not.toContain('disabled');
    const full = viewProps({ load: { status: 'ready', automations: Array.from({ length: W.AUTOMATION_LIMIT }, (_, i) => view({ id: `a${i}`, name: `A${i}` })) } });
    expect(btn(full)).toContain('disabled');
    expect(html(createElement(AutomationsView, full))).toContain(`Limit of ${W.AUTOMATION_LIMIT} reached`);
  });

  it('AI-11G: there is no fabricated "Run now"; "Run in provider" is an honest, explained action (JobQuest cannot wake a provider)', () => {
    const on = html(createElement(AutomationCard, { automation: view(), busy: false, onEdit: noop, onToggle: noop, onDelete: noop }));
    expect(on).not.toContain('>Run now<');
    expect(/<button[^>]*disabled[^>]*>Run in provider<\/button>/.test(on)).toBe(false);
    expect(on).toContain('aria-describedby="run-provider-a1"');
    expect(on).toContain('id="run-provider-a1"');
    expect(on).toContain('JobQuest can’t start a provider run itself');
    const disabled = html(createElement(AutomationCard, { automation: view({ enabled: false, runNow: { ready: false, reason: 'AUTOMATION_DISABLED' } }), busy: false, onEdit: noop, onToggle: noop, onDelete: noop }));
    expect(/<button[^>]*disabled[^>]*>Run in provider<\/button>/.test(disabled)).toBe(true);
    expect(disabled).toContain('Enable this automation to run it in the provider.');
    expect(disabled).toContain('Next expected</dt><dd style="margin:0">Disabled');
    // A manual-only provider has no scheduler adapter: no setup or run-in-provider action.
    const manual = html(createElement(AutomationCard, { automation: view({ provider: 'manual' }), busy: false, onEdit: noop, onToggle: noop, onDelete: noop }));
    expect(manual).not.toContain('Run in provider');
    expect(manual).not.toContain('Set up in');
  });

  it('shows operational state: last run, last success, normalized error and health', () => {
    const v = view({ state: { lastRunAt: '2026-10-13T13:01:00Z', lastStatus: 'FAILED', lastSuccessAt: '2026-10-12T13:01:00Z', lastErrorCategory: 'CONNECTOR_AUTH_EXPIRED', nextExpectedRunAt: '2026-10-14T13:00:00.000Z' } });
    const out = html(createElement(AutomationCard, { automation: v, busy: false, onEdit: noop, onToggle: noop, onDelete: noop }));
    expect(out).toContain('Last run failed');
    expect(out).toContain('Connector authorization expired');
    expect(out).toContain('Tue, Oct 13, 8:01 AM CDT');
    expect(out).toContain('Mon, Oct 12, 8:01 AM CDT');
    expect(out).not.toMatch(/stack|trace|exception/i);
  });

  it('the enable switch is labelled and the card exposes edit/delete', () => {
    const out = html(createElement(AutomationCard, { automation: view(), busy: false, onEdit: noop, onToggle: noop, onDelete: noop }));
    expect(out).toContain('role="switch"');
    expect(out).toContain('aria-checked="true"');
    expect(out).toContain('aria-label="Disable Weekday Morning Digest"');
    expect(out).toContain('>Edit<');
    expect(out).toContain('>Delete<');
  });

  const fields = (f: W.AutomationFormState, errors = {}) => html(createElement(AutomationFormFields, { form: f, errors, disabled: false, zoneOptions: ['America/Chicago', 'UTC'], onChange: noop }));

  it('the form shows exactly the controls the cadence and workflow need', () => {
    const weekdays = fields(form());
    for (const label of ['Name', 'Workflow', 'Provider', 'Cadence', 'Time', 'Time zone', 'Sections', 'Delivery', 'Enabled']) expect(weekdays, label).toContain(label);
    expect(weekdays).not.toContain('>Day<');
    expect(weekdays).not.toContain('Mon</span>');
    expect(fields(form({ cadence: 'weekly', weekdays: [7] }))).toContain('>Day<');
    const selected = fields(form({ cadence: 'selected_days', weekdays: [1, 3] }));
    for (const d of W.WEEKDAY_LABELS) expect(selected).toContain(`>${d.short}<`);
    const manual = fields(form({ cadence: 'manual_only' }));
    expect(manual).not.toContain('>Time<');
    expect(manual).not.toContain('Time zone');
    expect(fields(form({ workflow: 'email_triage' }))).not.toContain('Sections');
    expect(fields(form({ workflow: 'other' }))).toContain('Sections');
    for (const p of ['Claude', 'ChatGPT', 'Gemini', 'Manual']) expect(weekdays).toContain(`>${p}<`);
    expect(weekdays).not.toContain('>System<');
  });

  it('AI Hub delivery is always on; email is a saved preference with an honest note', () => {
    const out = fields(form({ delivery: ['ai_hub', 'email_summary'] }));
    expect(/<input[^>]*checked[^>]*disabled|<input[^>]*disabled[^>]*checked/.test(out)).toBe(true); // ai_hub checkbox: checked + locked
    expect(out).toContain('sending email isn’t available yet');
  });

  it('field errors are announced and tied to their inputs', () => {
    const out = fields(form({ name: '' }), { name: 'Enter a name.', localTime: 'Choose a time.' });
    expect(out).toContain('role="alert"');
    expect(out).toContain('Enter a name.');
    expect(out).toContain('aria-invalid="true"');
  });

  it('keeps provider credentials out of the Automations form (Providers owns them)', () => {
    const out = fields(form());
    expect(out).not.toMatch(/token|secret|password|api key|bearer|oauth|client id/i);
    expect(out).toContain('Connect providers under Providers above');
    const src = readFileSync('apps/web/src/components/ai/AutomationsPanel.tsx', 'utf8') + readFileSync('apps/web/src/api/aiAutomations.ts', 'utf8');
    expect(src).not.toMatch(/supabase|\/mcp|connector-tokens|oauth|localStorage|sessionStorage/i);
  });

  it('Settings -> AI & Automation renders the Automations section only with a session, and the old read-only workflow list stays', () => {
    const anon = html(createElement(AiAutomationSettings, { activeWorkspaceId: WS }));
    expect(anon).not.toContain('id="ai-automations"');
    expect(anon).toContain('Daily Digest'); // the Workflows reference is unchanged
    // The pre-existing provider panels read window.location while rendering; give them one (node has no DOM).
    vi.stubGlobal('window', { location: { origin: 'https://jobquest.example' } });
    let signedIn: string;
    try { signedIn = html(createElement(AiAutomationSettings, { activeWorkspaceId: WS, session: SESSION, currentUserId: null })); } finally { vi.unstubAllGlobals(); }
    expect(signedIn).toContain('id="ai-automations"');
    expect(signedIn).toContain('Loading automations');
    expect(signedIn.indexOf('id="ai-providers"')).toBeLessThan(signedIn.indexOf('id="ai-automations"'));
    expect(signedIn.indexOf('id="ai-automations"')).toBeLessThan(signedIn.indexOf('id="ai-workflows"'));
    // Provider setup is untouched.
    for (const p of ['Claude', 'Gemini', 'ChatGPT']) expect(signedIn).toContain(p);
  });
});

describe('AI Hub Overview integration', () => {
  const overview = (list: W.AutomationView[]) => W.summarizeAutomations(list);

  it('shows the next automation, its provider, schedule and health', () => {
    const out = html(createElement(NextAutomationCard, { overview: overview([view()]) }));
    expect(out).toContain('Next automation');
    expect(out).toContain('Weekday Morning Digest');
    expect(out).toContain('Wed, Oct 14, 8:00 AM CDT');
    expect(out).toContain('Claude');
    expect(out).toContain('Enabled');
    expect(out).toContain('Waiting for first run');
  });

  it('is truthful when there is nothing to show, and surfaces failures', () => {
    expect(html(createElement(NextAutomationCard, { overview: overview([]) }))).toContain('No automations yet');
    expect(html(createElement(NextAutomationCard, { overview: overview([view({ enabled: false })]) }))).toContain('No automations are enabled');
    expect(html(createElement(NextAutomationCard, { overview: overview([view({ cadence: 'manual_only', state: { ...view().state, nextExpectedRunAt: null } })]) }))).toContain('manual-only');
    const failing = view({ state: { ...view().state, lastStatus: 'FAILED' } });
    expect(html(createElement(NextAutomationCard, { overview: overview([failing]) }))).toContain('1 automation needs attention');
    expect(html(createElement(NextAutomationCard, { overview: overview([failing, view({ id: 'b', name: 'B', state: { ...view().state, lastStatus: 'PARTIAL' } })]) }))).toContain('2 automations need attention');
  });

  it('the card is additive: absent when not loaded, and an automation alone makes the Overview non-empty', () => {
    const base: AiHubSnapshot = { runs: [], findings: [], pendingSuggestions: 0 };
    expect(isAiHubEmpty(base)).toBe(true);
    expect(html(createElement(AiHubOverview, { snapshot: { ...base, runs: [{ id: 'r', provider: 'claude', workflow: 'daily_brief', status: 'SUCCEEDED', trigger_type: 'manual', created_at: '2026-10-12T00:00:00Z', started_at: null, completed_at: null, error_category: null, counts: {} }] } }))).not.toContain('Next automation');
    const withAuto: AiHubSnapshot = { ...base, automation: overview([view()]) };
    expect(isAiHubEmpty(withAuto)).toBe(false);
    expect(html(createElement(AiHubOverview, { snapshot: withAuto }))).toContain('Next automation');
    expect(isAiHubEmpty({ ...base, automation: overview([]) })).toBe(true);
  });
});

describe('API client and snapshot isolation', () => {
  const stubFetch = (handler: (url: string, init: { method?: string; body?: string; headers: Record<string, string> }) => { status: number; body: unknown }) => {
    const calls: Array<{ url: string; method: string; body: unknown; auth?: string; csrf?: string }> = [];
    vi.stubGlobal('document', { cookie: 'jq_csrf=abc' });
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: { method?: string; body?: string; headers: Record<string, string> }) => {
      calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.authorization, csrf: init.headers['x-jq-csrf'] });
      const r = handler(url, init);
      return { status: r.status, json: async () => r.body };
    }));
    return calls;
  };

  it('reads with a bearer GET; writes are CSRF-protected POSTs with the workspace in the body (never PUT/PATCH/DELETE)', async () => {
    const calls = stubFetch((url) => (url.includes('/delete') ? { status: 200, body: { id: 'a1' } } : url.endsWith('/ai/automations') && !url.includes('?') ? { status: 201, body: { id: 'n1', created: true } } : url.includes('?') ? { status: 200, body: { automations: [view()] } } : { status: 200, body: { id: 'a1', created: false } }));
    try {
      expect(await fetchAutomations(WS, SESSION)).toHaveLength(1);
      expect(await saveAutomation(WS, SESSION, null, form())).toEqual({ id: 'n1', created: true });
      expect(await saveAutomation(WS, SESSION, 'a1', form({ cadence: 'manual_only' }))).toEqual({ id: 'a1', created: false });
      await deleteAutomation(WS, SESSION, 'a1');
      expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
        `GET /api/ai/automations?workspace_id=${WS}`, 'POST /api/ai/automations', 'POST /api/ai/automations/a1', 'POST /api/ai/automations/a1/delete',
      ]);
      expect(calls.every((c) => c.auth === 'Bearer tok')).toBe(true);
      expect(calls.slice(1).every((c) => c.csrf === 'abc')).toBe(true);
      expect(calls[1]!.body).toMatchObject({ workspace_id: WS, name: 'Digest', provider: 'claude', cadence: 'weekdays' });
      expect(calls[2]!.body).toMatchObject({ workspace_id: WS, localTime: null, timezone: null, cadence: 'manual_only' });
      expect(calls[3]!.body).toEqual({ workspace_id: WS });
    } finally { vi.unstubAllGlobals(); }
  });

  it('surfaces the server\'s safe code, message and field', async () => {
    stubFetch(() => ({ status: 422, body: { error: { code: 'INVALID_INPUT', message: 'Choose a valid IANA time zone, for example America/Chicago.', field: 'timezone' } } }));
    try {
      await expect(saveAutomation(WS, SESSION, null, form())).rejects.toMatchObject({ code: 'INVALID_INPUT', field: 'timezone', message: expect.stringContaining('IANA') });
      await expect(saveAutomation(WS, SESSION, null, form())).rejects.toBeInstanceOf(AutomationApiError);
      await expect(fetchAutomations(WS, SESSION)).rejects.toBeInstanceOf(AutomationApiError);
    } finally { vi.unstubAllGlobals(); }
  });

  it('the Overview snapshot loads automations when signed in, and a failure never breaks the rest of it (existing behaviour unchanged)', async () => {
    const client = {
      from() {
        const q: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'order', 'limit', 'gte', 'in', 'range']) q[m] = () => q;
        q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(res);
        return q;
      },
    } as never;
    // No session -> no automation request at all, snapshot shape identical to before AI-11A.
    const none = await fetchAiHubSnapshot('ws-1', client);
    expect(none).not.toHaveProperty('automation');

    const calls = stubFetch((url) => (url.includes('/ai/automations') ? { status: 200, body: { automations: [view()] } } : { status: 200, body: { count: 0 } }));
    try {
      const snap = await fetchAiHubSnapshot('ws-1', client, new Date(), 'UTC', SESSION);
      expect(snap.automation).toMatchObject({ total: 1, enabled: 1, failing: 0 });
      expect(calls.some((c) => c.url.startsWith('/api/ai/automations'))).toBe(true);
    } finally { vi.unstubAllGlobals(); }

    stubFetch((url) => (url.includes('/ai/automations') ? { status: 500, body: { error: { code: 'READ_FAILED' } } } : { status: 200, body: { count: 0 } }));
    try {
      const snap = await fetchAiHubSnapshot('ws-1', client, new Date(), 'UTC', SESSION);
      expect(snap).not.toHaveProperty('automation');
      expect(snap.runs).toEqual([]);
    } finally { vi.unstubAllGlobals(); }
  });
});
