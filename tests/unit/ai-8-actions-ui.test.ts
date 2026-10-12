import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';

vi.mock('../../apps/web/src/supabase', () => ({ supabase: { from: () => { throw new Error('unexpected'); }, rpc: () => { throw new Error('unexpected'); } } }));

import * as C from '../../apps/api/src/lib/aiContract';
import { AI_ACTION_ERROR_CODES } from '../../apps/api/src/services/aiActionService';
import * as W from '../../apps/web/src/lib/aiActions';
import { AI_HUB_TABS, aiHubPathForTab, aiHubTabFromPath, type AiHubSnapshot } from '../../apps/web/src/lib/aiHub';
import { ActionCard, AiHubActionsPanel, HistoryRow, ReviewBody, type ActionsPanelProps } from '../../apps/web/src/views/AiHubActions';
import { AiHubDigestPanel } from '../../apps/web/src/views/AiHubDigest';
import { JobLeadCard } from '../../apps/web/src/views/AiHubJobLeads';
import { AiHubOverview, AiHubShell } from '../../apps/web/src/views/AiHubView';
import { fetchPendingActionCount } from '../../apps/web/src/api/aiActions';
import { toJobLeadView, type JobLeadRow } from '../../apps/web/src/lib/aiSources';

const noop = () => undefined;
const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
const WS = '11111111-1111-4111-8111-111111111111';

const card = (over: Partial<W.ActionCardRow> = {}): W.ActionCardRow => ({
  suggestionId: 's1', findingId: 'f1', action: 'create_application', summary: 'Create application: Staff Engineer at Example Corp', provider: 'claude', kind: 'job_lead',
  priority: 'NORMAL', confidence: 0.82, evidence: 'Strong overlap with the search profile.', findingTitle: 'Staff Engineer at Example Corp', createdAt: '2026-10-12T12:00:00Z',
  target: { match: 'NONE', label: null }, ...over,
});
const preview = (over: Partial<W.ActionPreviewData> = {}): W.ActionPreviewData => ({
  suggestionId: 's1', findingId: 'f1', action: 'create_application', summary: 'Create application: Staff Engineer at Example Corp', confirmLabel: 'Create application', provider: 'claude',
  source: { kind: 'job_lead', title: 'Staff Engineer at Example Corp', evidence: 'Overlap.', priority: 'NORMAL', confidence: 0.8, occurredAt: null, dueAt: null },
  state: 'READY', blocked: null, existing: null, match: { result: 'NONE', candidates: [], selectedId: null },
  current: [{ label: 'Application', value: 'None found for this job' }], proposed: [{ label: 'Company', value: 'Example Corp' }, { label: 'Initial stage', value: 'Saved (no applied date is claimed)' }],
  warnings: [], requires: { applicationSelection: false, duplicateConfirmation: false }, choices: { createNew: true, useExisting: false, noApplication: false },
  editable: null, fingerprint: 'f'.repeat(64), ...over,
});
const cand = (id: string, extra: Partial<W.ActionPreviewMatchCandidate> = {}): W.ActionPreviewMatchCandidate => ({ id, company: 'Example Corp', title: 'Staff Engineer', stage: 'APPLIED', status: 'OPEN', outcome: null, basis: 'company_title', jobUrl: null, ...extra });

describe('client/server contract sync', () => {
  it('action types, error categories and stage labels match the server', () => {
    expect([...W.AI_ACTION_TYPE_VALUES]).toEqual([...C.AI_ACTION_TYPES]);
    expect([...W.ACTION_ERROR_CODES].sort()).toEqual([...AI_ACTION_ERROR_CODES].filter((c) => c.startsWith('ACTION_')).sort());
    expect(Object.keys(W.STAGE_LABELS)).toEqual([...C.AI_ACTION_STAGES]);
    for (const a of C.AI_ACTION_TYPES) expect(W.aiActionTypeLabel(a), a).not.toBe('Unsupported action');
    for (const c of W.ACTION_ERROR_CODES) expect(W.ACTION_ERROR_MESSAGES[c].length, c).toBeGreaterThan(10);
  });
  it('error text is user-safe: raw or unknown server text is never shown', () => {
    expect(W.actionErrorMessage('ACTION_STALE', 'ignored')).toBe('The underlying record changed. Review the updated action before confirming.');
    expect(W.actionErrorMessage('ACTION_EXECUTION_FAILED', 'duplicate key value violates unique constraint "x"')).not.toMatch(/duplicate key|constraint/);
    expect(W.actionErrorMessage('SOMETHING_ELSE', 'select * from secrets')).toBe('Something went wrong. Nothing was changed.');
    expect(W.actionErrorMessage(undefined)).toBe('Something went wrong. Nothing was changed.');
    expect(W.actionErrorMessage('ACTION_CONFLICT', 'This application is already at that stage.')).toBe('This application is already at that stage.');
    expect(W.actionNeedsRefresh('ACTION_STALE')).toBe(true);
    expect(W.actionNeedsRefresh('ACTION_VALIDATION_FAILED')).toBe(false);
  });
});

describe('request shaping', () => {
  it('sends only non-default filters', () => {
    expect(W.actionQueueQuery(WS, W.DEFAULT_ACTION_FILTERS, 0)).toBe(`workspace_id=${WS}&page=0`);
    const q = new URLSearchParams(W.actionQueueQuery(WS, { action: 'create_task', kind: 'email_event', provider: 'claude', dateFrom: '2026-10-01', dateTo: '2026-10-12' }, 2.9));
    expect(Object.fromEntries(q)).toEqual({ workspace_id: WS, page: '2', action: 'create_task', kind: 'email_event', provider: 'claude', date_from: '2026-10-01', date_to: '2026-10-12' });
  });
  it('the execute body carries the reviewed fingerprint and the human\'s choices - never a record id the human did not pick', () => {
    const p = preview();
    expect(W.executeBody(WS, p, { ...W.initialChoice(p) })).toEqual({ workspace_id: WS, suggestion_id: 's1', expected_fingerprint: 'f'.repeat(64), decision: 'create_new' });
    const strong = preview({ match: { result: 'STRONG', candidates: [cand('a1')], selectedId: 'a1' } });
    expect(W.executeBody(WS, strong, { ...W.initialChoice(strong), mode: 'new', applicationId: null, confirmDuplicate: true })).toMatchObject({ decision: 'create_new', confirm_duplicate: true });
    expect(W.executeBody(WS, strong, { ...W.initialChoice(strong), mode: 'existing', applicationId: 'a1' })).toMatchObject({ decision: 'use_existing', application_id: 'a1' });
    const task = preview({ action: 'create_task', editable: { title: 'Prep', details: null, dueDate: '2026-11-02', priority: 'HIGH', dueDateSource: 'suggestion' }, match: { result: 'AMBIGUOUS', candidates: [cand('a1'), cand('a2')], selectedId: null }, choices: { createNew: true, useExisting: false, noApplication: true } });
    const none = W.executeBody(WS, task, { ...W.initialChoice(task), mode: 'none' });
    expect(none).toMatchObject({ decision: 'no_application', edits: { title: 'Prep', due_date: '2026-11-02', priority: 'HIGH', details: null } });
    expect(none).not.toHaveProperty('application_id');
    expect(W.executeBody(WS, task, { ...W.initialChoice(task), mode: 'existing', applicationId: 'a2' })).toMatchObject({ application_id: 'a2' });
  });
});

describe('confirm readiness (the button waits for the human\'s decisions)', () => {
  it('create_application: none -> ready; exact/strong/ambiguous need an explicit choice; a duplicate needs the checkbox', () => {
    const none = preview();
    expect(W.confirmReadiness(none, W.initialChoice(none)).ready).toBe(true);
    const amb = preview({ match: { result: 'AMBIGUOUS', candidates: [cand('a1'), cand('a2')], selectedId: null }, requires: { applicationSelection: true, duplicateConfirmation: true }, choices: { createNew: true, useExisting: true, noApplication: false } });
    const c0 = W.initialChoice(amb);
    expect(c0.mode).toBeNull();
    expect(W.confirmReadiness(amb, c0).ready).toBe(false);
    expect(W.confirmReadiness(amb, { ...c0, mode: 'existing' }).ready).toBe(false);
    expect(W.confirmReadiness(amb, { ...c0, mode: 'existing', applicationId: 'a1' }).ready).toBe(true);
    expect(W.confirmReadiness(amb, { ...c0, mode: 'new' }).ready).toBe(false);
    expect(W.confirmReadiness(amb, { ...c0, mode: 'new', confirmDuplicate: true }).ready).toBe(true);
    const strong = preview({ match: { result: 'STRONG', candidates: [cand('a1')], selectedId: 'a1' } });
    expect(W.initialChoice(strong)).toMatchObject({ mode: 'existing', applicationId: 'a1' });
  });
  it('create_task: a title is required, ambiguity needs a choice, no-application is allowed', () => {
    const t = preview({ action: 'create_task', editable: { title: 'Prep', details: null, dueDate: null, priority: 'MEDIUM', dueDateSource: 'none' }, match: { result: 'AMBIGUOUS', candidates: [cand('a1'), cand('a2')], selectedId: null } });
    const c = W.initialChoice(t);
    expect(W.confirmReadiness(t, c).ready).toBe(false);
    expect(W.confirmReadiness(t, { ...c, mode: 'none' }).ready).toBe(true);
    expect(W.confirmReadiness(t, { ...c, mode: 'none', title: '  ' }).ready).toBe(false);
    expect(W.confirmReadiness(t, { ...c, mode: 'none', dueDate: '2026-2-3' }).ready).toBe(false);
    const solo = preview({ action: 'create_task', editable: { title: 'Prep', details: null, dueDate: null, priority: 'MEDIUM', dueDateSource: 'none' }, match: { result: 'NONE', candidates: [], selectedId: null } });
    expect(W.initialChoice(solo).mode).toBe('none');
    expect(W.confirmReadiness(solo, W.initialChoice(solo)).ready).toBe(true);
  });
  it('set_status: needs a resolved application; blocked / already-executed previews can never be confirmed', () => {
    const s = preview({ action: 'set_status', match: { result: 'AMBIGUOUS', candidates: [cand('a1'), cand('a2')], selectedId: null } });
    expect(W.confirmReadiness(s, W.initialChoice(s)).ready).toBe(false);
    expect(W.confirmReadiness(s, { ...W.initialChoice(s), mode: 'existing', applicationId: 'a2' }).ready).toBe(true);
    for (const state of ['BLOCKED', 'ALREADY_EXECUTED'] as const) {
      const p = preview({ state, blocked: { code: 'ACTION_CONFLICT', message: 'No.' } });
      expect(W.confirmReadiness(p, { ...W.initialChoice(p), mode: 'new' }).ready).toBe(false);
    }
  });
});

describe('Actions page states', () => {
  const base = (over: Partial<ActionsPanelProps> = {}): ActionsPanelProps => ({
    view: 'pending', onView: noop, queue: { status: 'loading' }, history: { status: 'loading' }, draft: W.DEFAULT_ACTION_FILTERS, filtered: false, page: 0, historyPage: 0,
    timeZone: 'America/Chicago', workspaceId: WS, onDraft: noop, onApply: noop, onReset: noop, onPage: noop, onHistoryPage: noop, onRetry: noop, onReview: noop, onOpen: noop, ...over,
  });
  const q = (items: W.ActionCardRow[], extra: Partial<W.ActionQueuePage> = {}) => ({ status: 'ready' as const, data: { items, page: 0, pageSize: 10, hasNext: false, pendingTotal: items.length, ...extra } });
  it('loading, error (retry), empty and filtered-empty are distinct and announced', () => {
    expect(html(createElement(AiHubActionsPanel, base()))).toContain('role="status"');
    const err = html(createElement(AiHubActionsPanel, base({ queue: { status: 'error' } })));
    expect(err).toContain('role="alert"'); expect(err).toContain('Try again'); expect(err).not.toMatch(/stack trace|sql error|permission denied/i);
    expect(html(createElement(AiHubActionsPanel, base({ queue: q([]) })))).toContain('No actions are waiting for your review.');
    expect(html(createElement(AiHubActionsPanel, base({ queue: q([]), filtered: true })))).toContain('No actions match these filters.');
  });
  it('pending actions render as articles with ONLY a Review button - never Execute, Accept or a bulk control', () => {
    const out = html(createElement(AiHubActionsPanel, base({ queue: q([card(), card({ suggestionId: 's2', action: 'set_status', summary: 'Change status to Interview', kind: 'email_event', target: { match: 'STRONG', label: 'Example Corp — Staff Engineer' } })]) })));
    expect(out).toContain('aria-label="Pending actions"');
    expect((out.match(/<article/g) ?? []).length).toBe(2);
    expect(out).toContain('>Review<');
    expect(out).toContain('Strong match · Example Corp — Staff Engineer');
    expect(out).toContain('Pending (2)');
    expect(out).not.toMatch(/Execute|Accept|Approve all|Execute all|Accept all|Select all|Confirm all/i);
    expect(out).not.toMatch(/type="checkbox"/);
  });
  it('filters: action, source, provider and a date range, applied together', () => {
    const out = html(createElement(AiHubActionsPanel, base()));
    for (const l of ['Action', 'Source', 'Provider', 'Suggested from', 'Suggested to', 'Apply filters', 'Reset filters']) expect(out).toContain(l);
    for (const a of ['Create application', 'Create task', 'Change status']) expect(out).toContain(a);
    expect(out).toContain('role="search"');
  });
  it('history lists completed and failed actions with bounded text and an open link only for successes', () => {
    const rows: W.ActionHistoryRow[] = [
      { id: 'e1', suggestionId: 's1', action: 'create_task', status: 'SUCCEEDED', targetType: 'task', targetId: 't1', label: 'Prep for Example', errorCategory: null, requestedAt: '2026-10-12T12:00:00Z', completedAt: '2026-10-12T12:00:05Z' },
      { id: 'e2', suggestionId: 's2', action: 'set_status', status: 'FAILED', targetType: 'application', targetId: null, label: 'Example', errorCategory: 'ACTION_EXECUTION_FAILED', requestedAt: '2026-10-12T13:00:00Z', completedAt: '2026-10-12T13:00:02Z' },
      { id: 'e3', suggestionId: 's3', action: 'set_status', status: 'CONFLICT', targetType: 'application', targetId: 'a1', label: 'Example', errorCategory: 'ACTION_STALE', requestedAt: '2026-10-12T14:00:00Z', completedAt: '2026-10-12T14:00:01Z' },
    ];
    const out = html(createElement(AiHubActionsPanel, base({ view: 'history', history: { status: 'ready', data: { items: rows, page: 0, pageSize: 20, hasNext: false } } })));
    expect(out).toContain('Completed'); expect(out).toContain('Failed'); expect(out).toContain('Not applied');
    expect((out.match(/Open tasks/g) ?? []).length).toBe(1);
    expect(out).not.toContain('Open application');
    expect(html(createElement(AiHubActionsPanel, base({ view: 'history', history: { status: 'ready', data: { items: [], page: 0, pageSize: 20, hasNext: false } } })))).toContain('No actions have been applied yet.');
    expect(html(createElement(HistoryRow, { row: rows[0]!, timeZone: 'UTC', workspaceId: WS, onOpen: noop }))).toContain('Prep for Example');
  });
  it('a card is labelled and shows provider, confidence, evidence and the target/match state', () => {
    const out = html(createElement(ActionCard, { item: card({ target: { match: 'AMBIGUOUS', label: null } }), timeZone: 'UTC', onReview: noop }));
    expect(out).toContain('aria-label="Create application: Staff Engineer at Example Corp"');
    expect(out).toContain('Claude'); expect(out).toContain('Confidence 82%'); expect(out).toContain('Strong overlap'); expect(out).toContain('Several possible matches');
  });
});

describe('review dialog body', () => {
  const body = (p: W.ActionPreviewData, c: Partial<W.ReviewChoice> = {}) => html(createElement(ReviewBody, { preview: p, choice: { ...W.initialChoice(p), ...c }, onChoice: noop, workspaceId: WS, onOpen: noop }));
  it('shows action, source, match status, current and proposed state', () => {
    const out = body(preview());
    for (const s of ['aria-label="Action"', 'aria-label="Source"', 'aria-label="Match status"', 'aria-label="Current state"', 'aria-label="Proposed state"']) expect(out).toContain(s);
    expect(out).toContain('No existing application'); expect(out).toContain('Saved (no applied date is claimed)');
  });
  it('an ambiguous match lists candidates as a radio group with an Open link each, and nothing is pre-selected', () => {
    const p = preview({ match: { result: 'AMBIGUOUS', candidates: [cand('a1', { stage: 'APPLIED' }), cand('a2', { stage: 'INTERVIEW' })], selectedId: null }, requires: { applicationSelection: true, duplicateConfirmation: true }, choices: { createNew: true, useExisting: true, noApplication: false }, warnings: ['More than one existing application could be this job. Choose one, or explicitly create a new one.'] });
    const out = body(p);
    expect((out.match(/type="radio"/g) ?? []).length).toBe(3); // two candidates + "create a new application anyway"
    expect(out).not.toMatch(/checked=""/);
    expect(out).toContain('Possible existing applications'); expect(out).toContain('Several possible matches');
    expect((out.match(/Open application/g) ?? []).length).toBe(2);
    expect(out).toContain(`/w/${WS}/applications/a1`);
    expect(out).toContain('Create a new application anyway');
    expect(out).toContain('aria-label="Warnings"');
  });
  it('the duplicate confirmation checkbox only appears after "create anyway" is chosen', () => {
    const p = preview({ match: { result: 'STRONG', candidates: [cand('a1')], selectedId: 'a1' }, choices: { createNew: true, useExisting: true, noApplication: false } });
    expect(body(p)).not.toContain('I understand a similar application already exists');
    expect(body(p, { mode: 'new', applicationId: null })).toContain('I understand a similar application already exists');
  });
  it('a task review exposes the editable safe fields and the due-date source', () => {
    const p = preview({ action: 'create_task', summary: 'Create task: Prep', confirmLabel: 'Create task', editable: { title: 'Prep', details: 'n', dueDate: '2026-10-20', priority: 'HIGH', dueDateSource: 'finding_deadline' }, choices: { createNew: true, useExisting: false, noApplication: true }, match: { result: 'AMBIGUOUS', candidates: [cand('a1'), cand('a2')], selectedId: null } });
    const out = body(p);
    expect(out).toContain('Task details (you can edit these)'); expect(out).toContain('Due date (from the finding deadline)'); expect(out).toContain('value="2026-10-20"');
    expect(out).toContain('Create the task without an application');
  });
});

describe('Overview, Daily Digest and Job Leads integration', () => {
  const snap = (over: Partial<AiHubSnapshot> = {}): AiHubSnapshot => ({ runs: [], findings: [], pendingSuggestions: 3, ...over });
  it('the Overview shows a Pending actions card only when the count is known, with a link to the queue', () => {
    expect(html(createElement(AiHubOverview, { snapshot: snap() }))).not.toContain('Pending actions');
    const out = html(createElement(AiHubOverview, { snapshot: snap({ pendingActions: 3 }), onOpenTab: noop }));
    expect(out).toContain('Pending actions'); expect(out).toContain('3 actions awaiting your review'); expect(out).toContain('Open Actions');
    expect(html(createElement(AiHubOverview, { snapshot: snap({ pendingActions: 1 }) }))).toContain('1 action awaiting your review');
    expect(html(createElement(AiHubOverview, { snapshot: snap({ pendingActions: 0 }) }))).toContain('Nothing waiting for your review');
  });
  it('the Daily Digest only links to the queue; it cannot execute anything', () => {
    const props = { state: { status: 'ready', rows: [], hasNext: false }, preset: 'today', customFrom: '', customTo: '', provider: 'ALL', page: 0, today: '2026-10-12', timeZone: 'UTC', onPreset: noop, onCustom: noop, onProvider: noop, onPage: noop } as never;
    const out = html(createElement(AiHubDigestPanel, { ...(props as object), pendingActions: 2, onOpenActions: noop } as never));
    expect(out).toContain('2 actions awaiting your review.'); expect(out).toContain('Review in Actions');
    expect(html(createElement(AiHubDigestPanel, { ...(props as object), pendingActions: 0, onOpenActions: noop } as never))).not.toContain('Review in Actions');
    const src = readFileSync('apps/web/src/views/AiHubDigest.tsx', 'utf8');
    expect(src).not.toMatch(/executeAiAction|\/ai\/actions\/execute/);
  });
  const leadRow = (finding: Partial<JobLeadRow['finding']> = {}): JobLeadRow => ({
    finding_id: 'f1', user_id: 'u1', company: 'Example Corp', title: 'Staff Engineer', location: null, work_arrangement: null, employment_type: null, source_name: null, source_url: null, posted_date: null,
    discovered_at: '2026-10-12T12:00:00Z', salary_min: null, salary_max: null, salary_currency: null, salary_period: null, experience_level: null, match_score: 80, required_skills: [], preferred_skills: [],
    description_truncated: false, description_length: null, finding: { provider: 'claude', status: 'NEW', priority: 'NORMAL', confidence: 0.8, summary: null, payload: {}, ...finding },
  });
  it('a lead links to the queue when an action is pending, and shows "Application created" once converted (the link is JobQuest\'s, not the provider\'s)', () => {
    const pending = { ...toJobLeadView(leadRow()), pendingAction: true };
    const out = html(createElement(JobLeadCard, { lead: pending, timeZone: 'UTC', currentUserId: 'u1', onOpen: noop, onReviewAction: noop, onOpenApplication: noop }));
    expect(out).toContain('Review application action'); expect(out).not.toContain('Application created');
    const converted = toJobLeadView(leadRow({ application_id: '22222222-2222-4222-8222-222222222222' }));
    expect(converted.applicationId).toBe('22222222-2222-4222-8222-222222222222');
    const out2 = html(createElement(JobLeadCard, { lead: { ...converted, pendingAction: true }, timeZone: 'UTC', currentUserId: 'u1', onOpen: noop, onReviewAction: noop, onOpenApplication: noop }));
    expect(out2).toContain('Application created'); expect(out2).toContain('Open application'); expect(out2).not.toContain('Review application action');
    // someone else's lead never offers the owner-only review shortcut
    expect(html(createElement(JobLeadCard, { lead: pending, timeZone: 'UTC', currentUserId: 'other', onOpen: noop, onReviewAction: noop }))).not.toContain('Review application action');
  });
  it('the pending count uses the owner-scoped, supported-action query only', async () => {
    const calls: string[] = [];
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in']) q[m] = (...a: unknown[]) => { calls.push(`${m}:${JSON.stringify(a)}`); return q; };
    q.then = (res: (v: unknown) => unknown) => Promise.resolve({ count: 4, error: null }).then(res);
    expect(await fetchPendingActionCount(WS, 'u1', { from: () => q } as never)).toBe(4);
    expect(calls).toEqual(expect.arrayContaining([`eq:["user_id","u1"]`, `eq:["status","PENDING"]`, `in:["action",["create_application","create_task","set_status"]]`]));
  });
});

describe('navigation and wiring', () => {
  it('Actions is the 7th of eight tabs; every path round-trips; the shell renders all eight', () => {
    expect(AI_HUB_TABS).toHaveLength(8);
    expect(AI_HUB_TABS[6]).toMatchObject({ id: 'actions', label: 'Actions', path: '/ai-hub/actions' });
    for (const t of AI_HUB_TABS) { expect(aiHubTabFromPath(t.path)).toBe(t.id); expect(aiHubPathForTab(t.id)).toBe(t.path); }
    const shell = html(createElement(AiHubShell, { tab: 'actions', onTabChange: noop, state: { status: 'loading' }, actions: createElement('p', null, 'ACTIONS-SLOT') }));
    expect(shell).toContain('ACTIONS-SLOT');
    for (const t of AI_HUB_TABS) expect(shell).toContain(t.label);
  });
  it('the App routes /ai-hub/actions behind the existing AI Hub exposure check, with the AI Hub page title', () => {
    const app = readFileSync('apps/web/src/App.tsx', 'utf8');
    expect(app).toContain("case '/ai-hub/actions'");
    expect(app).toMatch(/AI_HUB_PATHS\.includes\(routePath\)/);
  });
  it('the browser calls only the JobQuest action API: no MCP, no direct core table writes from the Actions code', () => {
    for (const f of ['apps/web/src/api/aiActions.ts', 'apps/web/src/views/AiHubActions.tsx', 'apps/web/src/lib/aiActions.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/\/api\/mcp|jobquest_submit|from\('(applications|tasks|contacts|interviews)'\)\s*\.(insert|update|delete|upsert)/);
    }
    const api = readFileSync('apps/web/src/api/aiActions.ts', 'utf8');
    expect(api).toContain("'/ai/actions/execute'");
    expect((api.match(/api</g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
  it('there is no bulk approval anywhere in the Actions UI', () => {
    const src = readFileSync('apps/web/src/views/AiHubActions.tsx', 'utf8');
    expect(src).not.toMatch(/approve all|execute all|accept all|select all|confirm all/i);
    expect((src.match(/executeAiAction\(/g) ?? []).length).toBe(1); // one call site: the review dialog's Confirm
  });
});
