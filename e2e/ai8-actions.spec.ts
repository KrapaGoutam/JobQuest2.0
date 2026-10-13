import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

// AI-8 focused check: the Actions page (human approval center): states, filters, the review dialog, preview without
// mutation, cancel, confirm, double click, "already converted", ambiguous matches, stale-state protection, task creation,
// status change, history, the Pending actions metric (Overview + Daily Digest), the eight-tab shell and its clipping
// regression, responsive layout at 375/768/1280 and accessibility. Synthetic data only: rows are seeded through the
// service client of the LOCAL stack. No Claude, mailbox, calendar or real account is involved. Requires AI_HUB_ENABLED /
// VITE_AI_HUB_ENABLED = true (the dedicated AI-Hub CI job sets them; no other spec does).
const TZ = 'America/Chicago';
const evidenceDir = resolve('test-results/evidence');
const shotsDir = resolve('test-results/screenshots');
mkdirSync(evidenceDir, { recursive: true });
mkdirSync(shotsDir, { recursive: true });

function environment() {
  const file = process.env.M1B_ENV_FILE ?? '.env.m1b-local';
  const values: Record<string, string> = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const index = line.indexOf('=');
      if (index > 0) values[line.slice(0, index)] = line.slice(index + 1).replace(/^"|"$/g, '');
    }
  }
  return values;
}
const serviceClient = () => {
  const env = environment();
  return createClient(env.SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
};

async function audit(page: Page, context: string) {
  // Measure the resting state: park the pointer (no hover colours) and let any colour transition settle, so the contrast result is deterministic.
  await page.mouse.move(1, 1);
  await page.waitForTimeout(250);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return {
    context,
    violations: result.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })) })),
    blocking: result.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').length,
  };
}
const overflow = (page: Page) => page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));

/** The AI-6 shell defect guard (see ai7-calendar.spec.ts): nothing may sit outside `main`, and the shell must fit the viewport. */
async function clippingProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const main = document.querySelector('main.page');
    if (!main) return ['main.page not found'];
    const mr = main.getBoundingClientRect();
    if (main.scrollWidth - main.clientWidth > 0) problems.push(`main scrolls horizontally by ${main.scrollWidth - main.clientWidth}px`);
    const shell = document.querySelector('.ai-hub-tabs-wrapper');
    if (shell && shell.getBoundingClientRect().right > window.innerWidth + 1) problems.push('AI Hub shell is wider than the viewport');
    const tablist = document.querySelector('[role="tablist"]');
    for (const el of Array.from(main.querySelectorAll('*'))) {
      if (problems.length > 6) break;
      if (tablist && tablist.contains(el)) continue;
      if (el.closest('.sr-only')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > mr.right + 1 || r.left < mr.left - 1) problems.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} spans ${Math.round(r.left)}..${Math.round(r.right)} but main is ${Math.round(mr.left)}..${Math.round(mr.right)}`);
    }
    return problems;
  });
}

const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const addDays = (key: string, n: number) => new Date(Date.parse(`${key}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const offsetMs = (ms: number) => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms));
  const n = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - Math.floor(ms / 1000) * 1000;
};
function at(dayOffset: number, hhmm: string): string {
  const naive = Date.parse(`${addDays(dayKey(new Date()), dayOffset)}T${hhmm}:00Z`);
  const first = naive - offsetMs(naive);
  return new Date(naive - offsetMs(first)).toISOString();
}
const dateOf = (dayOffset: number) => addDays(dayKey(new Date()), dayOffset);

const aiHubEnabled = (environment().VITE_AI_HUB_ENABLED ?? process.env.VITE_AI_HUB_ENABLED) === 'true'
  && (environment().AI_HUB_ENABLED ?? process.env.AI_HUB_ENABLED) === 'true';

test.describe('AI-8 controlled actions', () => {
  test.skip(!aiHubEnabled, 'AI Hub flags are off in this environment (default); run locally or in the dedicated AI-Hub CI job with AI_HUB_ENABLED and VITE_AI_HUB_ENABLED set');
  test.setTimeout(600_000);
  test.use({ timezoneId: 'Europe/Berlin', reducedMotion: 'reduce', actionTimeout: 20_000 });

  test('preview, cancel, confirm, duplicates, ambiguity, stale state, tasks, status, history, metrics, shell clipping, responsive layout and accessibility', async ({ page }) => {
    const run = randomBytes(3).toString('hex');
    const evidence: Record<string, unknown> = { run, profile_timezone: TZ };
    const a11y: Awaited<ReturnType<typeof audit>>[] = [];

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Create account' }).click();
    const register = page.getByRole('form', { name: 'Register' });
    await register.getByLabel('Username (required)').fill(`ai8_${run}`);
    await register.getByLabel('Password (required)').fill(`Actions-${run}-Harbor!`);
    await register.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByTestId('recovery-codes').locator('li')).toHaveCount(10);
    await page.getByRole('button', { name: 'I saved them' }).click();
    await page.goto('/applications');
    await expect(page.getByTestId('new-application-btn')).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const s = (window as unknown as { __jqState?: { user?: { id?: string; active_workspace_id?: string }; activeWs?: string } }).__jqState;
      return Boolean(s?.user?.id && (s.activeWs ?? s.user.active_workspace_id));
    })).toBe(true);
    const state = await page.evaluate(() => {
      const s = (window as unknown as { __jqState?: { user?: { id?: string; active_workspace_id?: string }; activeWs?: string } }).__jqState;
      return { userId: s?.user?.id ?? '', workspaceId: s?.activeWs ?? s?.user?.active_workspace_id ?? '' };
    });
    const admin = serviceClient();
    expect((await admin.from('profiles').update({ timezone: TZ }).eq('user_id', state.userId)).error).toBeNull();
    const owner = { workspace_id: state.workspaceId, user_id: state.userId };

    const cards = page.getByRole('list', { name: 'Pending actions' }).getByRole('article');
    const dialog = page.getByRole('dialog');
    const filters = page.getByRole('search', { name: 'Action filters' });
    const review = (summary: string) => page.getByRole('button', { name: `Review: ${summary}` });
    const countApps = async (company: string) => (await admin.from('applications').select('id', { count: 'exact', head: true }).eq('workspace_id', owner.workspace_id).eq('company_name', company)).count ?? 0;
    const countTasks = async (title: string) => (await admin.from('tasks').select('id', { count: 'exact', head: true }).eq('workspace_id', owner.workspace_id).eq('title', title)).count ?? 0;
    const appRows = async (company: string) => (await admin.from('applications').select('*').eq('workspace_id', owner.workspace_id).eq('company_name', company)).data ?? [];
    const execCount = async () => (await admin.from('ai_action_executions').select('id', { count: 'exact', head: true }).eq('workspace_id', owner.workspace_id)).count ?? 0;
    const tabs = ['Overview', 'Daily Digest', 'Job Leads', 'Email', 'Recruiter Intel', 'Calendar', 'Actions', 'History'];

    // ---- 1) EMPTY: nothing is waiting; the eight-tab navigation includes Actions ------------------------------------------
    await page.goto('/ai-hub/actions');
    await expect(page.getByRole('heading', { name: 'Actions', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No actions are waiting for your review.' })).toBeVisible();
    for (const tab of tabs) await expect(page.getByRole('tab', { name: tab, exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Actions', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(/Execute all|Approve all|Accept all/)).toHaveCount(0);
    a11y.push(await audit(page, 'actions-empty-1280'));

    // ---- seed (synthetic): leads, tasks and status proposals, existing applications -----------------------------------------
    const now = new Date().toISOString();
    expect((await admin.from('ai_runs').insert({ ...owner, provider: 'claude', workflow: 'job_discovery', status: 'SUCCEEDED', trigger_type: 'scheduled', started_at: now, completed_at: now })).error).toBeNull();
    const finding = async (key: string, f: Record<string, unknown>) => {
      const r = await admin.from('ai_findings').insert({ ...owner, status: 'NEW', priority: 'NORMAL', confidence: 0.85, dedupe_key: `e2e:${run}:${key}`, ...f }).select('id').single();
      expect(r.error).toBeNull();
      return r.data!.id as string;
    };
    const suggest = async (findingId: string, action: string, proposed: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
      const r = await admin.from('ai_suggestions').insert({ ...owner, finding_id: findingId, action, proposed, confidence: 0.9, ...extra }).select('id').single();
      expect(r.error).toBeNull();
      return r.data!.id as string;
    };
    const lead = async (key: string, company: string, title: string, o: { location?: string } = {}) => {
      const url = `https://jobs.example.com/${run}/${key}`;
      const id = await finding(`lead-${key}`, { kind: 'job_lead', provider: 'claude', title: `${title} at ${company}`, summary: 'Strong overlap with the search profile.', evidence: 'Matches TypeScript and PostgreSQL.', payload: { version: '1.0', company, role_title: title, job_url: url } });
      expect((await admin.from('ai_job_leads').insert({
        finding_id: id, ...owner, company, title, location: o.location ?? 'Austin, TX', work_arrangement: 'hybrid', employment_type: 'full_time', source_name: 'Example Jobs', source_url: url, canonical_url: url,
        external_job_id: `EX-${run}-${key}`, posted_date: dateOf(-2), salary_min: 150000, salary_max: 190000, salary_currency: 'USD', salary_period: 'year', match_score: 88,
        description: 'Build reliable systems.\n\nRequirements\n- TypeScript\n- PostgreSQL', required_skills: ['TypeScript', 'PostgreSQL'], preferred_skills: ['Kubernetes'],
      })).error).toBeNull();
      return id;
    };
    const email = async (key: string, company: string, title: string, dueOffset: number | null) => finding(`mail-${key}`, {
      kind: 'email_event', provider: 'claude', category: 'interview_invitation', priority: 'HIGH', title: `${company} update (${key})`, summary: 'The recruiter wrote back.',
      evidence: 'We would like to move you forward.', occurred_at: at(-1, '09:00'), due_at: dueOffset === null ? null : at(dueOffset, '17:00'),
      payload: { version: '1.0', sender_name: 'Pat Recruiter', sender_domain: 'example.com', subject: 'Update', company, role_title: title },
    });
    const orbitLead = await lead('orbit', 'Orbit Labs', 'Platform Engineer');
    const orbitLeadTwin = await suggest(orbitLead, 'create_application', { reason: 'Second proposal for the same lead' });
    const orbitSuggestion = await suggest(orbitLead, 'create_application', {});
    const deltaLead = await lead('delta', 'Delta Co', 'Site Reliability Engineer', { location: 'Remote - US' });
    const deltaSuggestion = await suggest(deltaLead, 'create_application', {});
    // two existing "Delta Co / Site Reliability Engineer" applications in different places: an AMBIGUOUS match
    for (const location of ['Denver, CO', 'Boston, MA']) {
      expect((await admin.from('applications').insert({ ...owner, company_name: 'Delta Co', role_title: 'Site Reliability Engineer', stage: 'APPLIED', location })).error).toBeNull();
    }
    const orbitTaskFinding = await email('task', 'Orbit Labs', 'Platform Engineer', 3);
    await suggest(orbitTaskFinding, 'create_task', { title: 'Prepare for the Orbit Labs assessment', priority: 'HIGH' });
    const orbitStatusFinding = await email('status', 'Orbit Labs', 'Platform Engineer', null);
    await suggest(orbitStatusFinding, 'set_status', { stage: 'INTERVIEW', reason: 'The recruiter invited you to interview.' });
    const deltaTaskFinding = await email('deltatask', 'Delta Co', 'Site Reliability Engineer', 2);
    await suggest(deltaTaskFinding, 'create_task', { title: 'Follow up with Delta Co' });
    expect((await admin.from('applications').insert({ ...owner, company_name: 'Stale Co', role_title: 'Developer', stage: 'APPLIED' })).error).toBeNull();
    const staleFinding = await email('stale', 'Stale Co', 'Developer', null);
    await suggest(staleFinding, 'set_status', { stage: 'OFFER' });
    // AI-9: a PENDING legacy suggestion whose free-form proposal fails the strict action schema is not actionable. It must not
    // appear in the queue and must not inflate any count (the 7 / 1 assertions below would show 8 / 2 if it did).
    expect((await admin.from('ai_suggestions').insert({ ...owner, finding_id: staleFinding, action: 'create_task', proposed: { anything: 'goes' }, confidence: 0.5 })).error).toBeNull();
    void orbitSuggestion; void deltaSuggestion; void orbitLeadTwin;

    // ---- 2) PENDING: cards, Review-only, filters, no bulk controls ---------------------------------------------------------------
    await page.goto('/ai-hub/actions');
    await expect(cards).toHaveCount(7);
    await expect(page.getByRole('button', { name: /^Pending \(7\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Execute|^Accept|^Approve/ })).toHaveCount(0);
    await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
    await expect(page.getByText('Several possible matches')).toHaveCount(2); // the Delta lead and the Delta task: never auto-resolved
    await filters.getByLabel('Action').selectOption('create_task');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(cards).toHaveCount(2);
    await filters.getByLabel('Action').selectOption('ALL');
    await filters.getByLabel('Source').selectOption('job_lead');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(cards).toHaveCount(3);
    await filters.getByLabel('Provider').selectOption('gemini');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByRole('heading', { name: 'No actions match these filters.' })).toBeVisible();
    await page.getByRole('button', { name: 'Reset filters' }).click();
    await expect(cards).toHaveCount(7);
    a11y.push(await audit(page, 'actions-pending-1280'));
    await page.screenshot({ path: resolve(shotsDir, 'ai8-actions-pending-1280.png'), fullPage: true });

    // ---- 3) JOB LEAD -> APPLICATION: preview mutates nothing, Cancel creates nothing -------------------------------------------------
    const orbitApp = 'Create application: Platform Engineer at Orbit Labs';
    const appsBefore = await countApps('Orbit Labs');
    const execBefore = await execCount();
    await review(orbitApp).first().click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Create application', level: 2 })).toBeVisible();
    for (const section of ['Action', 'Source', 'Match status', 'Current state', 'Proposed state']) await expect(dialog.getByRole('region', { name: section })).toBeVisible();
    await expect(dialog.getByText('No existing application')).toBeVisible();
    await expect(dialog.getByText('Saved (no applied date is claimed)')).toBeVisible();
    await expect(dialog.getByText('Orbit Labs', { exact: true }).first()).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Create application' })).toBeEnabled();
    expect(await countApps('Orbit Labs'), 'preview creates nothing').toBe(appsBefore);
    a11y.push(await audit(page, 'review-dialog-create-application-1280'));
    await page.screenshot({ path: resolve(shotsDir, 'ai8-review-create-application-1280.png') });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await review(orbitApp).first().click();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    expect(await countApps('Orbit Labs'), 'cancel creates nothing').toBe(appsBefore);
    expect(await execCount(), 'cancel records nothing').toBe(execBefore);
    await expect(cards).toHaveCount(7);

    // confirm creates exactly one application, even on a double click
    await review(orbitApp).first().click();
    await dialog.getByRole('button', { name: 'Create application' }).dblclick();
    await expect(dialog.getByRole('status').filter({ hasText: 'Created the application Platform Engineer at Orbit Labs.' })).toBeVisible();
    expect(await countApps('Orbit Labs')).toBe(1);
    const [orbit] = await appRows('Orbit Labs');
    expect(orbit).toMatchObject({ stage: 'SAVED', status: 'OPEN', role_title: 'Platform Engineer', work_arrangement: 'Hybrid', employment_type: 'Full-time', duplicate_override_flag: false });
    expect((await admin.from('ai_action_executions').select('status, action_type, target_id').eq('workspace_id', owner.workspace_id)).data).toEqual([expect.objectContaining({ status: 'SUCCEEDED', action_type: 'create_application', target_id: orbit!.id })]);
    expect((await admin.from('ai_findings').select('application_id, status').eq('id', orbitLead).single()).data).toMatchObject({ application_id: orbit!.id, status: 'ACCEPTED' });
    expect((await admin.from('ai_job_leads').select('id').eq('finding_id', orbitLead)).data).toHaveLength(1); // the lead is preserved
    a11y.push(await audit(page, 'review-dialog-success-1280'));
    await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(dialog).toHaveCount(0);
    // the twin proposal for the same (now converted) lead is moot and gone from the queue; only one conversion exists
    await expect(cards).toHaveCount(5);
    await expect(page.getByRole('button', { name: /^Pending \(5\)/ })).toBeVisible();
    expect((await admin.from('ai_suggestions').select('status').eq('finding_id', orbitLead)).data!.map((r) => r.status).sort()).toEqual(['ACCEPTED', 'SUPERSEDED']);
    expect(await countApps('Orbit Labs')).toBe(1);

    // ---- 4) TASK: due date from the finding deadline, editable; one task even on a double click ---------------------------------------
    const taskSummary = 'Create task: Prepare for the Orbit Labs assessment';
    await review(taskSummary).click();
    await expect(dialog.getByRole('heading', { name: 'Create task', level: 2 })).toBeVisible();
    await expect(dialog.getByText('Strong match', { exact: true })).toBeVisible();
    await expect(dialog.getByLabel('Due date (from the finding deadline)')).toHaveValue(dateOf(3));
    await expect(dialog.getByLabel('Title')).toHaveValue('Prepare for the Orbit Labs assessment');
    await dialog.getByLabel('Title').fill('Prepare for the Orbit Labs assessment (edited)');
    await dialog.getByLabel('Due date (from the finding deadline)').fill(dateOf(4));
    a11y.push(await audit(page, 'review-dialog-create-task-1280'));
    await dialog.getByRole('button', { name: 'Create task' }).dblclick();
    await expect(dialog.getByRole('status').filter({ hasText: 'Created the task' })).toBeVisible();
    expect(await countTasks('Prepare for the Orbit Labs assessment (edited)')).toBe(1);
    const taskRow = (await admin.from('tasks').select('*').eq('workspace_id', owner.workspace_id).eq('title', 'Prepare for the Orbit Labs assessment (edited)').single()).data!;
    expect(taskRow).toMatchObject({ due_date: dateOf(4), priority: 'HIGH', application_id: orbit!.id, status: 'PENDING', user_id: state.userId });
    await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(cards).toHaveCount(4);

    // ---- 5) STATUS: current -> proposed, the existing stage RPC, one event ---------------------------------------------------------------
    await review('Change status to Interview').click();
    await expect(dialog.getByRole('heading', { name: 'Change status to Interview', level: 2 })).toBeVisible();
    await expect(dialog.getByRole('region', { name: 'Current state' })).toContainText('Saved');
    await expect(dialog.getByRole('region', { name: 'Proposed state' })).toContainText('Interview');
    await expect(dialog.getByRole('region', { name: 'Current state' })).toContainText('Orbit Labs — Platform Engineer');
    a11y.push(await audit(page, 'review-dialog-set-status-1280'));
    await dialog.getByRole('button', { name: 'Change status to Interview' }).click();
    await expect(dialog.getByRole('status').filter({ hasText: 'Changed Orbit Labs — Platform Engineer to Interview.' })).toBeVisible();
    expect((await appRows('Orbit Labs'))[0]!.stage).toBe('INTERVIEW');
    expect((await admin.from('application_events').select('event_type, payload').eq('application_id', orbit!.id).eq('event_type', 'STAGE_CHANGED')).data).toEqual([expect.objectContaining({ payload: expect.objectContaining({ from_stage: 'SAVED', to_stage: 'INTERVIEW' }) })]);
    await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(cards).toHaveCount(3);

    // ---- 6) AMBIGUOUS: nothing is pre-selected; the human chooses; duplicates need an explicit confirmation ---------------------------------
    const deltaApp = 'Create application: Site Reliability Engineer at Delta Co';
    const deltaBefore = await countApps('Delta Co');
    await review(deltaApp).click();
    await expect(dialog.getByText('Several possible matches')).toBeVisible();
    await expect(dialog.getByRole('radio')).toHaveCount(3);
    await expect(dialog.getByRole('radio', { checked: true })).toHaveCount(0);
    await expect(dialog.getByRole('link', { name: /Open application/ })).toHaveCount(2);
    const confirmApp = dialog.getByRole('button', { name: 'Create application' });
    await expect(confirmApp).toBeDisabled();
    await expect(dialog.getByText('Choose to use an existing application or create a new one.')).toBeVisible();
    await dialog.getByRole('radio', { name: 'Create a new application anyway' }).check();
    await expect(confirmApp).toBeDisabled(); // still needs the explicit duplicate confirmation
    await dialog.getByRole('checkbox', { name: /I understand a similar application already exists/ }).check();
    await expect(confirmApp).toBeEnabled();
    a11y.push(await audit(page, 'review-dialog-ambiguous-1280'));
    await page.screenshot({ path: resolve(shotsDir, 'ai8-review-ambiguous-1280.png') });
    // the human instead links the lead to the Boston application: no new application is created
    await dialog.getByRole('radio', { name: /Boston/ }).check().catch(async () => { await dialog.getByRole('radio').nth(1).check(); });
    await expect(confirmApp).toBeEnabled();
    await confirmApp.click();
    await expect(dialog.getByRole('status').filter({ hasText: 'Linked to the existing application' })).toBeVisible();
    expect(await countApps('Delta Co')).toBe(deltaBefore);
    expect((await admin.from('ai_findings').select('application_id').eq('id', deltaLead).single()).data!.application_id).not.toBeNull();
    await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(cards).toHaveCount(2);

    // ambiguous task: the human must pick an application or explicitly choose none
    await review('Create task: Follow up with Delta Co').click();
    const confirmTask = dialog.getByRole('button', { name: 'Create task' });
    await expect(confirmTask).toBeDisabled();
    await dialog.getByRole('radio', { name: 'Create the task without an application' }).check();
    await expect(confirmTask).toBeEnabled();
    await confirmTask.click();
    await expect(dialog.getByRole('status').filter({ hasText: 'Created the task' })).toBeVisible();
    expect((await admin.from('tasks').select('application_id').eq('workspace_id', owner.workspace_id).eq('title', 'Follow up with Delta Co').single()).data!.application_id).toBeNull();
    await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(cards).toHaveCount(1);

    // ---- 7) STALE: the record changed after the review: nothing is overwritten and the review regenerates -------------------------------------
    await review('Change status to Offer').click();
    await expect(dialog.getByRole('heading', { name: 'Change status to Offer', level: 2 })).toBeVisible();
    await expect(dialog.getByRole('region', { name: 'Current state' })).toContainText('Applied');
    const [stale] = await appRows('Stale Co');
    expect((await admin.from('applications').update({ notes: 'edited in another tab' }).eq('id', stale!.id)).error).toBeNull();
    await dialog.getByRole('button', { name: 'Change status to Offer' }).click();
    await expect(dialog.getByText('The underlying record changed. Review the updated action before confirming.')).toBeVisible();
    expect((await appRows('Stale Co'))[0]).toMatchObject({ stage: 'APPLIED', notes: 'edited in another tab' }); // not overwritten
    a11y.push(await audit(page, 'review-dialog-stale-1280'));
    await page.screenshot({ path: resolve(shotsDir, 'ai8-review-stale-1280.png') });
    await dialog.getByRole('button', { name: 'Change status to Offer' }).click(); // the regenerated review is confirmed
    await expect(dialog.getByRole('status').filter({ hasText: 'Changed Stale Co — Developer to Offer.' })).toBeVisible();
    expect((await appRows('Stale Co'))[0]!.stage).toBe('OFFER');
    await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'No actions are waiting for your review.' })).toBeVisible();

    // ---- 8) HISTORY: completed actions are listed; failures would be too ---------------------------------------------------------------------------
    await page.getByRole('button', { name: 'Completed and failed' }).click();
    const history = page.getByRole('list', { name: 'Completed and failed actions' });
    await expect(history.getByRole('listitem')).toHaveCount(6);
    await expect(history.getByText('Completed')).toHaveCount(6);
    await expect(history.getByText('Create application').first()).toBeVisible();
    await expect(history.getByRole('button', { name: 'Open tasks' }).first()).toBeVisible();
    a11y.push(await audit(page, 'actions-history-1280'));
    await page.screenshot({ path: resolve(shotsDir, 'ai8-actions-history-1280.png'), fullPage: true });
    expect((await admin.from('ai_action_executions').select('status').eq('workspace_id', owner.workspace_id)).data!.every((r) => r.status === 'SUCCEEDED')).toBe(true);

    // ---- 9) The Pending actions metric follows the queue: Overview card and Daily Digest line ------------------------------------------------
    const metricFinding = await email('metric', 'Metric Co', 'Engineer', null);
    await suggest(metricFinding, 'create_task', { title: 'Metric task' });
    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    await page.goto('/ai-hub');
    await expect(page.getByText('1 action awaiting your review')).toBeVisible();
    await page.getByRole('tab', { name: 'Daily Digest', exact: true }).click();
    await expect(page.getByText('1 action awaiting your review.')).toBeVisible();
    await page.getByRole('button', { name: 'Review in Actions' }).click();
    await expect(page).toHaveURL(/\/ai-hub\/actions$/);
    await expect(cards).toHaveCount(1);
    // the Job Leads page shows the conversion (the link was written by JobQuest after it created the application)
    await page.getByRole('tab', { name: 'Job Leads', exact: true }).click();
    await expect(page.getByText('Application created').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open application: Platform Engineer at Orbit Labs' })).toBeVisible();

    // ---- 10) EIGHT-TAB SHELL: clipping regression + reachability on every size and every tab; the Actions page at each size ----------------------------
    const paths: Array<[string, string]> = [['Overview', '/ai-hub'], ['Daily Digest', '/ai-hub/digest'], ['Job Leads', '/ai-hub/job-leads'], ['Email', '/ai-hub/email'],
      ['Recruiter Intel', '/ai-hub/recruiters'], ['Calendar', '/ai-hub/calendar'], ['Actions', '/ai-hub/actions'], ['History', '/ai-hub/history']];
    for (const w of [375, 768, 1280]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto('/ai-hub');
      await page.waitForLoadState('networkidle');
      for (const [tabName, path] of paths) {
        await expect(page.getByRole('form', { name: 'Sign in' }), `session must survive on ${path} at ${w}px (landed on ${page.url()})`).toHaveCount(0);
        const tab = page.getByRole('tab', { name: tabName, exact: true });
        await expect(tab, `AI Hub "${tabName}" navigation should render on ${path} at ${w}px`).toBeVisible();
        await tab.scrollIntoViewIfNeeded();
        await tab.click();
        await expect(page, `clicking "${tabName}" should open ${path} at ${w}px`).toHaveURL(new RegExp(`${path}$`));
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        expect(await clippingProblems(page), `no clipped content on ${path} at ${w}px`).toEqual([]);
        expect(await overflow(page), `no horizontal scroll on ${path} at ${w}px`).toBe(0);
      }
      for (const edge of ['Actions', 'History']) {
        const tab = page.getByRole('tab', { name: edge, exact: true });
        await tab.scrollIntoViewIfNeeded();
        const reachable = await tab.evaluate((el) => {
          const row = el.closest('[role="tablist"]')!.getBoundingClientRect();
          const r = el.getBoundingClientRect();
          return r.left >= row.left - 1 && r.right <= row.right + 1;
        });
        expect(reachable, `${edge} tab fully inside the tab row at ${w}px`).toBe(true);
      }
      await page.getByRole('tab', { name: 'Actions', exact: true }).click();
      await expect(cards).toHaveCount(1);
      await page.screenshot({ path: resolve(shotsDir, `ai8-actions-${w}.png`), fullPage: true });
      a11y.push(await audit(page, `actions-populated-${w}`));
      // the review dialog fits the viewport and is keyboard-operable
      await review('Create task: Metric task').click();
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box!.x, `dialog left edge at ${w}px`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `dialog right edge at ${w}px`).toBeLessThanOrEqual(w + 1);
      expect(await overflow(page), `no horizontal scroll with the dialog open at ${w}px`).toBe(0);
      a11y.push(await audit(page, `review-dialog-${w}`));
      await page.screenshot({ path: resolve(shotsDir, `ai8-review-${w}.png`) });
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      evidence[`overflow_actions_${w}`] = await overflow(page);
    }

    evidence.a11y = a11y;
    writeFileSync(resolve(evidenceDir, 'ai8-actions.json'), JSON.stringify(evidence, null, 2));
    for (const result of a11y) expect(result.blocking, `${result.context}: ${JSON.stringify(result.violations)}`).toBe(0);
  });
});
