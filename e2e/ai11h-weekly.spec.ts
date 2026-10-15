import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

// AI-11H focused check: AI Hub -> Weekly Digest, Settings -> AI & Automation -> Automations (derived health, activity, run-key and
// timing copy) and Providers -> Other connector credentials (list safe metadata, revoke through the supported route). Synthetic data
// only, seeded through the service client of the LOCAL stack; no provider, mailbox or real account is involved. Requires
// AI_HUB_ENABLED / VITE_AI_HUB_ENABLED = true (the dedicated AI-Hub CI job sets them; no other spec does).
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

test.describe('AI-11H weekly digest, automation health, credentials', () => {
  test.skip(!aiHubEnabled, 'AI Hub flags are off in this environment (default); run locally or in the dedicated AI-Hub CI job with AI_HUB_ENABLED and VITE_AI_HUB_ENABLED set');
  test.setTimeout(300_000);
  test.use({ timezoneId: 'Europe/Berlin', reducedMotion: 'reduce', actionTimeout: 20_000 });

  test('weekly digest, health + activity, run key + timing copy, other credentials: responsive and accessible', async ({ page }) => {
    const run = randomBytes(3).toString('hex');
    const evidence: Record<string, unknown> = { run, profile_timezone: TZ };
    const a11y: Awaited<ReturnType<typeof audit>>[] = [];

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Create account' }).click();
    const register = page.getByRole('form', { name: 'Register' });
    await register.getByLabel('Username (required)').fill(`ai11h_${run}`);
    await register.getByLabel('Password (required)').fill(`Weekly-${run}-Harbor!`);
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

    // ---- seed (service client, LOCAL stack): an application this week, a completed task, one automation with a failed + a good run, one legacy token
    const ws = state.workspaceId;
    expect((await admin.from('applications').insert({ workspace_id: ws, user_id: state.userId, company_name: `Acme${run}`, role_title: 'Staff Engineer', stage: 'APPLIED' })).error).toBeNull();
    expect((await admin.from('tasks').insert({ workspace_id: ws, user_id: state.userId, title: `Done ${run}`, status: 'COMPLETED', completed_at: new Date().toISOString() })).error).toBeNull();
    const saved = await admin.rpc('rpc_ai_automation_save', {
      p_actor_id: state.userId, p_workspace_id: ws, p_id: null, p_name: 'Weekday Morning Digest', p_workflow: 'daily_brief', p_enabled: true, p_provider: 'claude',
      p_cadence: 'weekdays', p_local_time: '08:00', p_timezone: TZ, p_weekdays: [], p_sections: [], p_delivery: ['ai_hub'],
    });
    expect(saved.error).toBeNull();
    const automationId = (saved.data as { id: string }).id;
    const nowIso = new Date().toISOString();
    // distinct created_at so "the latest run" is unambiguous: a good manual run, then a failed scheduled one
    expect((await admin.from('ai_runs').insert({ workspace_id: ws, user_id: state.userId, provider: 'claude', workflow: 'daily_brief', status: 'SUCCEEDED', trigger_type: 'manual', automation_id: automationId, sources: [{ type: 'gmail', status: 'unavailable' }], started_at: nowIso, completed_at: nowIso, created_at: new Date(Date.now() - 120_000).toISOString() })).error).toBeNull();
    expect((await admin.from('ai_runs').insert({ workspace_id: ws, user_id: state.userId, provider: 'claude', workflow: 'daily_brief', status: 'FAILED', trigger_type: 'scheduled', automation_id: automationId, sources: [], error_category: 'SOURCE_UNAVAILABLE', started_at: nowIso, completed_at: nowIso, scheduled_for: nowIso })).error).toBeNull();
    const legacy = await admin.rpc('rpc_ai_create_connector_token', {
      p_actor_id: state.userId, p_workspace_id: ws, p_name: `Legacy ${run}`, p_token_prefix: 'jq_mcp_dev_lg01', p_token_hash: randomBytes(32).toString('hex'),
      p_scopes: ['jobquest:read', 'ai:read'], p_expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), p_provider: null,
    });
    expect(legacy.error).toBeNull();
    const legacyId = legacy.data as string;

    // ---- 1) WEEKLY DIGEST: sections, honest states, week navigation, three viewports ---------------------------------------------------
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/ai-hub/weekly');
      await page.waitForLoadState('networkidle');
      const weekly = page.getByTestId('weekly-digest');
      await expect(weekly).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Weekly Digest', exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(weekly.getByText('This week so far')).toBeVisible();
      for (const t of ['Week at a glance', 'Applications', 'Interviews and stage movement', 'Job-related email', 'Fresh job leads', 'Recruiter intelligence', 'Tasks and follow-ups', 'Goal progress', 'Automation health', 'Needs attention next']) {
        await expect(weekly.getByText(t, { exact: true }).first(), `${t} @${width}`).toBeVisible();
      }
      await expect(weekly.getByText('1 application submitted.')).toBeVisible();
      await expect(weekly.getByText(`Acme${run} — Staff Engineer`)).toBeVisible();
      await expect(weekly.getByText('Not set up').first()).toBeVisible(); // email / leads / recruiters never ran: not "zero"
      await expect(weekly.getByText('2 automation runs: 1 succeeded, 1 failed.')).toBeVisible();
      await expect(weekly.getByRole('button', { name: 'Next week' })).toBeDisabled();
      expect(await overflow(page), `weekly overflow @${width}`).toBe(0);
      await page.screenshot({ path: resolve(shotsDir, `ai11h-weekly-${width}.png`), fullPage: true });
      if (width !== 768) a11y.push(await audit(page, `weekly-${width}`));
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: 'Previous week' }).click();
    await expect(page.getByTestId('weekly-digest').getByText(/^Completed week · /)).toBeVisible();
    await expect(page.getByTestId('weekly-digest').getByText('No applications were submitted this week.')).toBeVisible(); // a clean empty state
    await page.getByRole('button', { name: 'This week' }).click();
    await expect(page.getByTestId('weekly-digest').getByText('This week so far')).toBeVisible();
    evidence.weekly = true;

    // ---- 2) AUTOMATIONS: derived health + reasons + activity ------------------------------------------------------------------------
    await page.goto('/settings/ai');
    await page.waitForLoadState('networkidle');
    const section = page.locator('section[aria-labelledby="ai-automations"]');
    const card = section.getByTestId('automation-card').filter({ hasText: 'Weekday Morning Digest' });
    await expect(card.getByText('Needs attention', { exact: true })).toBeVisible();
    await expect(card.getByTestId('automation-health-reasons').getByText(/The last run failed./)).toBeVisible();
    const activity = section.getByTestId('automation-activity');
    await expect(activity.getByText('Automation activity')).toBeVisible();
    await expect(activity.getByText(/success rate 50% of finished/)).toBeVisible();
    await expect(activity.getByText('1 unavailable, blocked or errored (gmail 1)')).toBeVisible();
    await expect(activity.getByText('Recent failures')).toBeVisible();
    await activity.getByLabel('Activity period').selectOption('7');
    await expect(activity.getByText(/success rate 50% of finished/)).toBeVisible();
    evidence.health = true;

    // ---- 3) RUN KEY + TIMING COPY (stable per instruction text; a new run gets a new key) ------------------------------------------
    await card.getByRole('button', { name: 'Run in provider' }).click();
    const dialog = page.getByRole('dialog');
    const note = dialog.getByTestId('manual-key-note');
    await expect(note).toBeVisible();
    const key1 = (await note.locator('code').innerText()).trim();
    expect(key1).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    await expect(dialog.getByLabel('Run-once instructions')).toContainText(`"clientKey": "${key1}"`);
    await expect(dialog.getByLabel('Run-once instructions')).not.toContainText('current UTC time');
    await expect(dialog.getByTestId('schedule-timing-notes').getByText(/America\/Chicago, the zone you chose/)).toBeVisible();
    await expect(dialog.getByTestId('schedule-timing-notes').getByText(/catch-up/)).toBeVisible();
    await dialog.getByRole('button', { name: 'New run (new key)' }).click();
    await expect(async () => {
      const key2 = (await note.locator('code').innerText()).trim();
      expect(key2).not.toBe(key1);
    }).toPass();
    expect(await overflow(page), 'setup dialog overflow @1280').toBe(0);
    await page.setViewportSize({ width: 375, height: 900 });
    expect(await overflow(page), 'setup dialog overflow @375').toBe(0);
    a11y.push(await audit(page, 'setup-dialog-375'));
    await dialog.getByRole('button', { name: 'Done' }).click();
    await page.setViewportSize({ width: 1280, height: 900 });
    evidence.runKey = true;

    // ---- 4) OTHER CONNECTOR CREDENTIALS: safe metadata, supported revoke --------------------------------------------------------------
    const creds = page.getByTestId('legacy-credentials');
    await expect(creds).toBeVisible();
    const row = creds.getByTestId('legacy-credential').filter({ hasText: `Legacy ${run}` });
    await expect(row).toHaveCount(1);
    await expect(row.getByText('jq_mcp_dev_lg01…')).toBeVisible();
    await expect(row.getByText('Not bound to a provider (cannot claim automation runs)')).toBeVisible();
    await expect(creds.getByText(/token_hash|secret|Bearer/i)).toHaveCount(0);
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await overflow(page), `credentials overflow @${width}`).toBe(0);
    }
    a11y.push(await audit(page, 'credentials-1280'));
    await row.getByRole('button', { name: new RegExp(`Revoke Legacy ${run}`) }).click();
    const confirm = page.getByRole('dialog');
    await expect(confirm.getByText(`Revoke “Legacy ${run}”?`)).toBeVisible();
    await confirm.getByRole('button', { name: 'Revoke credential' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('legacy-credentials').getByText('None of these credentials is active.')).toBeVisible();
    expect((await admin.from('ai_connector_tokens').select('revoked_at').eq('id', legacyId).single()).data?.revoked_at).not.toBeNull();
    evidence.credentials = true;

    const blocking = a11y.reduce((n, a) => n + a.blocking, 0);
    writeFileSync(resolve(evidenceDir, 'ai11h-weekly.json'), JSON.stringify({ ...evidence, a11y }, null, 2));
    expect(blocking, JSON.stringify(a11y.filter((a) => a.blocking > 0))).toBe(0);
  });
});
