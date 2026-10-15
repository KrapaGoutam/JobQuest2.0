import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

// AI-11A focused check: Settings -> AI & Automation -> Automations (provider-neutral schedule definitions) and the AI Hub
// Overview "Next automation" card. Create / validate / conflict / toggle / edit / delete, derived operational state from
// seeded ai_runs, Run Now shown as a disabled explained contract, Providers untouched, responsive layout and accessibility.
// Synthetic data only; runs are seeded through the service client of the LOCAL stack. No provider, mailbox or real account is
// involved. Requires AI_HUB_ENABLED / VITE_AI_HUB_ENABLED = true (the dedicated AI-Hub CI job sets them; no other spec does).
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

const aiHubEnabled = (environment().VITE_AI_HUB_ENABLED ?? process.env.VITE_AI_HUB_ENABLED) === 'true'
  && (environment().AI_HUB_ENABLED ?? process.env.AI_HUB_ENABLED) === 'true';

test.describe('AI-11A automation foundation', () => {
  test.skip(!aiHubEnabled, 'AI Hub flags are off in this environment (default); run locally or in the dedicated AI-Hub CI job with AI_HUB_ENABLED and VITE_AI_HUB_ENABLED set');
  test.setTimeout(300_000);
  test.use({ timezoneId: 'Europe/Berlin', reducedMotion: 'reduce', actionTimeout: 20_000 });

  test('create, validate, conflict, toggle, edit, derived state, Run Now contract, Overview card, delete, responsive and accessibility', async ({ page }) => {
    const run = randomBytes(3).toString('hex');
    const evidence: Record<string, unknown> = { run, profile_timezone: TZ };
    const a11y: Awaited<ReturnType<typeof audit>>[] = [];

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Create account' }).click();
    const register = page.getByRole('form', { name: 'Register' });
    await register.getByLabel('Username (required)').fill(`ai11a_${run}`);
    await register.getByLabel('Password (required)').fill(`Automate-${run}-Harbor!`);
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
    expect(state.userId).not.toBe('');
    const admin = serviceClient();
    expect((await admin.from('profiles').update({ timezone: TZ }).eq('user_id', state.userId)).error).toBeNull();

    const section = page.locator('section[aria-labelledby="ai-automations"]');
    const dialog = page.getByRole('dialog');
    const cards = section.getByTestId('automation-card');
    const card = (name: string) => cards.filter({ hasText: name });
    // The shared Checkbox hides its native input behind a styled box: a person clicks the label, so do the same.
    const tick = async (label: string) => { await dialog.locator('label').filter({ hasText: new RegExp(`^${label}$`) }).click(); await expect(dialog.getByRole('checkbox', { name: label, exact: true })).toBeChecked(); };

    // ---- 1) EMPTY: honest copy, Providers untouched ------------------------------------------------------------------
    await page.goto('/settings/ai');
    await page.waitForLoadState('networkidle');
    await expect(section.getByText('No automations yet')).toBeVisible();
    await expect(section.getByText('JobQuest can’t create that schedule or start a run itself', { exact: false })).toBeVisible();
    await expect(page.getByTestId('claude-connector')).toBeVisible(); // Providers is still its own card with its own credentials
    await expect(section.getByText(/token|secret|password/i)).toHaveCount(0);
    a11y.push(await audit(page, 'settings-empty-1280'));

    // ---- 2) CREATE the canonical weekday digest ------------------------------------------------------------------------
    await section.getByRole('button', { name: 'New automation' }).click();
    await expect(dialog.getByRole('heading', { name: 'New automation' })).toBeVisible();
    await expect(dialog.getByLabel('Time zone')).toHaveValue(TZ); // defaults to the profile zone
    await expect(dialog.getByLabel('Provider')).toHaveValue('claude');
    await expect(dialog.getByLabel('Cadence')).toHaveValue('weekdays');
    await expect(dialog.getByRole('textbox', { name: 'Time', exact: true })).toHaveValue('08:00');
    await expect(dialog.getByRole('checkbox', { name: 'AI Hub' })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: 'AI Hub' })).toBeDisabled();
    await expect(dialog.getByText(/Connect providers under Providers above/)).toBeVisible();
    a11y.push(await audit(page, 'dialog-new-1280'));
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Weekday Morning Digest');
    for (const s of ['Email triage', 'Job discovery', 'Recruiter intelligence', 'Calendar review', 'Follow-ups', 'Email summary']) await tick(s);
    await dialog.getByRole('switch', { name: 'Enabled' }).click();
    await dialog.getByRole('button', { name: 'Create automation' }).click();
    await expect(dialog).toHaveCount(0);
    const digest = card('Weekday Morning Digest');
    await expect(digest).toHaveCount(1);
    await expect(digest.getByText('Weekdays at 8:00 AM · America/Chicago')).toBeVisible();
    await expect(digest.getByText('Sections: Email triage, Job discovery, Recruiter intelligence, Calendar review, Follow-ups')).toBeVisible();
    await expect(digest.getByText('Delivery: AI Hub, Email summary')).toBeVisible();
    await expect(digest.getByText('Needs setup', { exact: true })).toBeVisible(); // AI-11H: derived health; the provider is not connected yet
    // Next expected is rendered in the AUTOMATION's zone (Chicago), not the browser's (Berlin).
    await expect(digest.locator('dd').first()).toHaveText(/^(Mon|Tue|Wed|Thu|Fri), \w{3} \d{1,2}, 8:00 AM C[DS]T$/);
    // AI-11G: there is no fake "Run now". JobQuest cannot wake a provider, so the honest action is "Run in provider" (copy instructions).
    await expect(digest.getByRole('button', { name: 'Run now' })).toHaveCount(0);
    await expect(digest.getByRole('button', { name: 'Set up in Claude' })).toBeVisible();
    await expect(digest.getByRole('button', { name: 'Run in provider' })).toBeEnabled();
    await expect(digest.getByText('JobQuest can’t start a provider run itself', { exact: false })).toBeVisible();
    const row = (await admin.from('ai_workflow_configs').select('*').eq('user_id', state.userId)).data ?? [];
    expect(row).toHaveLength(1);
    expect(row[0]).toMatchObject({ workflow: 'daily_brief', primary_provider: 'claude', cadence: 'weekdays', local_time: '08:00', timezone: TZ, enabled: true, delivery: ['ai_hub', 'email_summary'] });
    evidence.created = true;

    // ---- 3) VALIDATION: field errors, then a weekly Sunday review -----------------------------------------------------
    await section.getByRole('button', { name: 'New automation' }).click();
    await dialog.getByRole('button', { name: 'Create automation' }).click();
    await expect(dialog.getByText('Enter a name.')).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Weekly Job Search Review');
    await dialog.getByLabel('Workflow').selectOption('other');
    await dialog.getByLabel('Cadence').selectOption('weekly');
    await dialog.getByRole('button', { name: 'Create automation' }).click();
    await expect(dialog.getByText('Choose one day.')).toBeVisible();
    await dialog.getByRole('combobox', { name: 'Day', exact: true }).selectOption('7');
    await dialog.getByRole('textbox', { name: 'Time', exact: true }).fill('19:00');
    await dialog.getByLabel('Time zone').fill('Mars/Phobos');
    await dialog.getByRole('button', { name: 'Create automation' }).click();
    await expect(dialog.getByText('Enter a valid time zone')).toBeVisible();
    await dialog.getByLabel('Time zone').fill(TZ);
    await dialog.getByLabel('Provider').selectOption('gemini'); // provider is data, not architecture
    await expect(dialog.getByRole('switch', { name: 'Enabled' })).toHaveAttribute('aria-checked', 'false'); // new automations start disabled
    await dialog.getByRole('switch', { name: 'Enabled' }).click();
    await dialog.getByRole('button', { name: 'Create automation' }).click();
    await expect(dialog).toHaveCount(0);
    const weekly = card('Weekly Job Search Review');
    await expect(weekly.getByText('Sundays at 7:00 PM · America/Chicago')).toBeVisible();
    await expect(weekly.getByText('Custom review · Gemini')).toBeVisible();
    await expect(weekly.locator('dd').first()).toHaveText(/^Sun, \w{3} \d{1,2}, 7:00 PM C[DS]T$/);

    // ---- 4) SELECTED DAYS control + server conflict surfaced safely --------------------------------------------------
    await section.getByRole('button', { name: 'New automation' }).click();
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('weekday morning digest'); // same name, different case
    await dialog.getByLabel('Cadence').selectOption('selected_days');
    for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) await expect(dialog.locator('label').filter({ hasText: new RegExp('^' + d + '$') })).toBeVisible();
    await dialog.getByRole('button', { name: 'Create automation' }).click();
    await expect(dialog.getByText('Choose at least one day.')).toBeVisible();
    await tick('Sat');
    await tick('Sun');
    await dialog.getByRole('button', { name: 'Create automation' }).click();
    await expect(dialog.getByRole('alert').filter({ hasText: 'already exists' })).toBeVisible(); // 409 from the server, no database text
    await expect(dialog.getByText(/duplicate key|violates|constraint|SQLSTATE/i)).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(cards).toHaveCount(2);

    // ---- 5) TOGGLE ------------------------------------------------------------------------------------------------
    await digest.getByRole('switch', { name: 'Disable Weekday Morning Digest' }).click();
    await expect(digest.getByText('Disabled', { exact: true }).first()).toBeVisible();
    await expect(digest.locator('dd').first()).toHaveText('Disabled');
    await expect(digest.getByText('Enable this automation to run it in the provider.')).toBeVisible();
    await expect(digest.getByRole('button', { name: 'Run in provider' })).toBeDisabled();
    expect((await admin.from('ai_workflow_configs').select('enabled').eq('user_id', state.userId).eq('name', 'Weekday Morning Digest').single()).data?.enabled).toBe(false);
    await digest.getByRole('switch', { name: 'Enable Weekday Morning Digest' }).click();
    await expect(digest.getByText('Needs setup', { exact: true })).toBeVisible();

    // ---- 6) DERIVED STATE from ai_runs (seeded; the automation row stores none of it) -------------------------------
    const seed = async (status: string, error?: string) => {
      const r = await admin.rpc('rpc_ai_ingest_run', { p_actor_id: state.userId, p_workspace_id: state.workspaceId, p_provider: 'claude', p_workflow: 'daily_brief', p_external_run_id: `e2e-${run}-${status}` });
      expect(r.error).toBeNull();
      expect((await admin.rpc('rpc_ai_finalize_run', { p_actor_id: state.userId, p_run_id: r.data.run_id, p_status: status, ...(error ? { p_error_category: error } : {}) })).error).toBeNull();
    };
    await seed('SUCCEEDED');
    await page.reload();
    await expect(digest.getByText('Healthy')).toBeVisible();
    await expect(digest.getByText('Last success').locator('xpath=following-sibling::dd[1]')).not.toHaveText('—');
    await seed('FAILED', 'CONNECTOR_AUTH_EXPIRED');
    await page.reload();
    await expect(digest.getByText('Needs attention', { exact: true })).toBeVisible();
    await expect(digest.getByText('Connector authorization expired')).toBeVisible();
    await expect(weekly.getByText('Needs setup', { exact: true })).toBeVisible(); // a Gemini automation is unaffected by Claude's runs
    expect((await admin.from('ai_runs').select('id', { count: 'exact', head: true }).eq('user_id', state.userId)).count).toBe(2);

    // ---- 7) EDIT ------------------------------------------------------------------------------------------------------
    await digest.getByRole('button', { name: 'Edit' }).click();
    await expect(dialog.getByRole('heading', { name: 'Edit automation' })).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Weekday Morning Digest');
    await dialog.getByRole('textbox', { name: 'Time', exact: true }).fill('09:15');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(digest.getByText('Weekdays at 9:15 AM · America/Chicago')).toBeVisible();
    await expect(digest.locator('dd').first()).toHaveText(/9:15 AM C[DS]T$/);

    // ---- 7b) AI-11F: executor readiness, last failure, recent runs (scheduled vs manual), History trigger -----------------
    // AI-11G: connection and scheduled execution are separate facts. No Claude credential exists here, so the card says so honestly.
    await expect(digest.getByText('JobQuest connection').locator('xpath=following-sibling::dd[1]')).toHaveText('Not connected');
    await expect(digest.getByText('Scheduled execution').locator('xpath=following-sibling::dd[1]')).toHaveText('Connect the provider first');
    await expect(digest.getByText('Last failure').locator('xpath=following-sibling::dd[1]')).not.toHaveText('—');
    await expect(digest.getByRole('button', { name: 'Run now' })).toHaveCount(0);
    // Provider setup: server-generated, copyable, claim-first instructions that contain the automation id and no credential.
    await digest.getByRole('button', { name: 'Set up in Claude' }).click();
    const setup = page.getByRole('dialog');
    await expect(setup.getByText('Scheduled execution: Connect the provider first')).toBeVisible();
    await expect(setup.getByRole('button', { name: 'Copy scheduled-task instructions' })).toBeVisible();
    const instructions = await setup.getByLabel('Scheduled-task instructions').innerText();
    expect(instructions).toContain('FIRST action is jobquest_claim_ai_execution');
    expect(instructions).toContain('FRESH JobQuest tool call');
    expect(instructions).toMatch(/Automation ID: [0-9a-f-]{36}/);
    expect(instructions).not.toMatch(/jq_mcp_|Bearer [A-Za-z0-9]|client_secret/);
    await expect(setup.getByText('Email triage').first()).toBeVisible();
    await expect(setup.getByText('Daily Digest (composed by JobQuest, last)')).toBeVisible();
    await page.setViewportSize({ width: 375, height: 900 });
    expect(await overflow(page), 'setup dialog overflow @375').toBe(0);
    const sbox = await setup.boundingBox();
    expect(sbox!.x + sbox!.width).toBeLessThanOrEqual(376);
    a11y.push(await audit(page, 'automation-setup-dialog-375'));
    await page.setViewportSize({ width: 1280, height: 900 });
    await setup.getByRole('button', { name: 'Done' }).click();
    await expect(setup).toHaveCount(0);
    // Providers page: the same two facts, never one badge.
    const claudeScheduling = page.getByTestId('claude-scheduling');
    await expect(claudeScheduling.getByText('JobQuest connection').locator('xpath=following-sibling::dd[1]')).toHaveText('Not connected');
    await expect(claudeScheduling.getByText('Connect the provider first').first()).toBeVisible();
    await expect(page.getByTestId('chatgpt-scheduling')).toBeVisible();
    await expect(page.getByTestId('gemini-scheduling')).toBeVisible();
    // A scheduled occurrence requested through the real lifecycle RPC (service client of the LOCAL stack). Back-dated so the
    // latest-run derived state used by the Overview assertions below is unchanged.
    const cfgId = (await admin.from('ai_workflow_configs').select('id').eq('user_id', state.userId).eq('name', 'Weekday Morning Digest').single()).data!.id as string;
    const occ = await admin.rpc('rpc_ai_execution_request', { p_actor_id: state.userId, p_workspace_id: state.workspaceId, p_automation_id: cfgId, p_trigger_type: 'scheduled', p_scheduled_for: new Date(Math.floor(Date.now() / 1000) * 1000 + 5_000).toISOString(), p_client_key: null, p_retry_of_run_id: null });
    expect(occ.error).toBeNull();
    expect((await admin.from('ai_runs').update({ created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() }).eq('id', occ.data.run_id)).error).toBeNull();
    await page.reload();
    await digest.getByText('Recent runs').click();
    const history = digest.getByTestId('automation-history');
    await expect(history.getByText('Scheduled')).toBeVisible();
    await expect(history.getByText('Queued')).toBeVisible();
    await expect(history.getByText('Manual').first()).toBeVisible();
    await expect(history.getByText('Failed')).toBeVisible();
    await expect(history.getByText('Connector authorization expired')).toBeVisible();
    // The expanded history at phone width: no horizontal overflow, no critical/serious axe violations.
    await page.setViewportSize({ width: 375, height: 900 });
    expect(await overflow(page), 'history overflow @375').toBe(0);
    a11y.push(await audit(page, 'automation-history-open-375'));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ai-hub/history');
    await expect(page.getByTestId('run-trigger').filter({ hasText: 'Scheduled' }).first()).toBeVisible();
    await expect(page.getByTestId('run-trigger').filter({ hasText: 'Manual' }).first()).toBeVisible();
    await page.goto('/settings/ai');
    await expect(cards).toHaveCount(2);

    // ---- 8) RESPONSIVE + ACCESSIBILITY ------------------------------------------------------------------------------
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/settings/ai');
      await page.waitForLoadState('networkidle');
      await expect(cards).toHaveCount(2);
      expect(await overflow(page), `settings overflow @${width}`).toBe(0);
      await section.getByRole('button', { name: 'New automation' }).click();
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      expect(await overflow(page), `dialog overflow @${width}`).toBe(0);
      await page.screenshot({ path: resolve(shotsDir, `ai11a-dialog-${width}.png`) });
      if (width === 1280) a11y.push(await audit(page, 'dialog-new-populated-1280'));
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await page.screenshot({ path: resolve(shotsDir, `ai11a-settings-${width}.png`), fullPage: true });
      if (width === 1280) a11y.push(await audit(page, 'settings-populated-1280'));
    }
    evidence.responsive = [375, 768, 1280];

    // ---- 9) OVERVIEW card -----------------------------------------------------------------------------------------
    await page.goto('/ai-hub');
    const next = page.locator('.card', { has: page.getByText('Next automation', { exact: true }) });
    // Whichever is due first depends on the weekday this runs on; both are enabled and scheduled.
    await expect(next.getByText(/^(Weekday Morning Digest|Weekly Job Search Review)$/)).toBeVisible();
    await expect(next.getByText(/^(Claude · Weekdays at 9:15 AM|Gemini · Sundays at 7:00 PM) · America\/Chicago$/)).toBeVisible();
    await expect(next.getByText('1 automation needs attention')).toBeVisible();
    expect(await overflow(page)).toBe(0);
    await page.screenshot({ path: resolve(shotsDir, 'ai11a-overview-1280.png') });
    a11y.push(await audit(page, 'overview-1280'));

    // ---- 10) DELETE (confirmed; history is kept) ---------------------------------------------------------------------
    await page.goto('/settings/ai');
    await card('Weekly Job Search Review').getByRole('button', { name: 'Delete' }).click();
    await expect(dialog.getByRole('heading', { name: 'Delete automation?' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(cards).toHaveCount(2);
    await card('Weekly Job Search Review').getByRole('button', { name: 'Delete' }).click();
    await dialog.getByRole('button', { name: 'Delete automation' }).click();
    await expect(cards).toHaveCount(1);
    expect((await admin.from('ai_workflow_configs').select('id', { count: 'exact', head: true }).eq('user_id', state.userId)).count).toBe(1);
    expect((await admin.from('ai_runs').select('id', { count: 'exact', head: true }).eq('user_id', state.userId)).count).toBe(3);
    const audits = (await admin.from('audit_events').select('action').eq('workspace_id', state.workspaceId).like('action', 'AI_AUTOMATION_%')).data ?? [];
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(['AI_AUTOMATION_CREATED', 'AI_AUTOMATION_UPDATED', 'AI_AUTOMATION_DELETED']));

    evidence.accessibility = a11y.map((a) => ({ context: a.context, blocking: a.blocking, violations: a.violations.map((v) => v.id) }));
    writeFileSync(resolve(evidenceDir, `ai11a-automations-${run}.json`), JSON.stringify(evidence, null, 2));
    for (const a of a11y) expect(a.blocking, `${a.context}: ${JSON.stringify(a.violations)}`).toBe(0);
  });
});
