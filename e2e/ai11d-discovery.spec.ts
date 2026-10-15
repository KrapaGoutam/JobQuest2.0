import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

// AI-11D focused check: Settings -> AI & Automation -> Job Discovery (the canonical profile: what the user wants, with no
// credentials) and the upgraded AI Hub Job Leads page (freshest first, honest posted / remote wording, fit and gap reasons,
// the read-only "already tracked" status, discovery source health), at 375/768/1280 with accessibility audits. Requires the
// local stack and AI_HUB_ENABLED / VITE_AI_HUB_ENABLED = true in the env file chosen by M1B_ENV_FILE.
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

test.describe('AI-11D fresh job discovery', () => {
  test.skip(!aiHubEnabled, 'AI Hub flags are off in this environment (default); run locally with AI_HUB_ENABLED and VITE_AI_HUB_ENABLED set');
  test.setTimeout(300_000);
  test.use({ timezoneId: TZ, reducedMotion: 'reduce', actionTimeout: 20_000 });

  test('Job Discovery profile settings and the freshness-first Job Leads page: wording, matching, source health, responsive layout and accessibility', async ({ page }) => {
    const run = randomBytes(3).toString('hex');
    const evidence: Record<string, unknown> = { run };
    const a11y: Awaited<ReturnType<typeof audit>>[] = [];

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Create account' }).click();
    const register = page.getByRole('form', { name: 'Register' });
    await register.getByLabel('Username (required)').fill(`ai11d_${run}`);
    await register.getByLabel('Password (required)').fill(`Discover-${run}-Harbor!`);
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

    // ---- 1) SETTINGS: Job Discovery is its own concept, separate from Providers and Automations ----------------------
    await page.goto('/settings/ai');
    await page.waitForLoadState('networkidle');
    const section = page.locator('section[aria-labelledby="ai-job-discovery"]');
    await expect(page.locator('#ai-job-discovery')).toHaveText('Job Discovery');
    await expect(section.getByTestId('discovery-summary')).toContainText('No profile saved yet');
    await expect(section.getByText(/Which provider searches is set under Providers/)).toBeVisible();
    await expect(section.getByText(/token|secret|password|api key|oauth/i)).toHaveCount(0); // WHAT, never WHO or credentials
    const order = await page.locator('main section[aria-labelledby]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-labelledby')));
    expect(order.indexOf('ai-providers')).toBeLessThan(order.indexOf('ai-job-discovery'));
    expect(order.indexOf('ai-job-discovery')).toBeLessThan(order.indexOf('ai-automations'));
    a11y.push(await audit(page, 'settings-empty-1280'));

    // validation points at the field before any request
    await section.getByRole('button', { name: 'Save discovery profile' }).click();
    await expect(section.getByText('Saved.')).toBeVisible(); // the generic default is valid: remote, full-time, 24 hours
    await section.getByLabel('Posted within').selectOption('72');
    await section.locator('label').filter({ hasText: /^Hybrid$/ }).click();
    await section.getByRole('button', { name: 'Save discovery profile' }).click();
    await expect(section.getByText('Add at least one city for hybrid or onsite roles.')).toBeVisible();
    await section.getByLabel('Minimum AI match (0–100)').fill('101');
    await section.getByRole('button', { name: 'Save discovery profile' }).click();
    await expect(section.getByText('A whole number 0–100.')).toBeVisible();
    await section.getByLabel('Minimum AI match (0–100)').fill('60');

    // the QA / testing starter fills the form (browser data), the user reviews and saves
    await section.getByRole('button', { name: 'Load QA / testing starter' }).click();
    await expect(section.getByLabel('Target job titles')).toHaveValue(/SDET/);
    await expect(section.getByLabel('Cities for hybrid or onsite roles')).toHaveValue('Houston, TX');
    await section.getByLabel('Maximum results per run').fill('12');
    await section.getByRole('button', { name: 'Save discovery profile' }).click();
    await expect(section.getByText('Saved.')).toBeVisible();
    await expect(section.getByTestId('discovery-summary')).toContainText('Saved profile:');
    const row = (await admin.from('ai_job_discovery_profiles').select('*').eq('user_id', state.userId).single()).data!;
    expect(row).toMatchObject({ freshness_window_hours: 72, minimum_match_score: 60, maximum_results: 12, software_qa_gate: true, cities: ['Houston, TX'] });
    expect(row.target_titles).toContain('QA Automation Engineer');
    expect(row.work_arrangements.sort()).toEqual(['hybrid', 'remote']);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(section.getByLabel('Posted within')).toHaveValue('72');
    await expect(section.getByLabel('Maximum results per run')).toHaveValue('12');
    expect((await admin.from('ai_workflow_configs').select('id', { count: 'exact', head: true }).eq('user_id', state.userId)).count).toBe(0); // no automation was created implicitly
    a11y.push(await audit(page, 'settings-profile-1280'));
    for (const w of [768, 375]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(150);
      expect(await overflow(page), `settings overflow @${w}`).toBe(0);
      a11y.push(await audit(page, `settings-${w}`));
    }
    await page.setViewportSize({ width: 375, height: 900 });
    await page.screenshot({ path: resolve(shotsDir, 'ai11d-settings-375.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });

    // ---- 2) JOB LEADS: seed leads, one application, one discovery run --------------------------------------------------
    const hour = 3_600_000;
    const acme = `Acme${run}`;
    const app = await admin.from('applications').insert({ ...owner, company_name: `${acme} Inc.`, role_title: 'QA Engineer', stage: 'APPLIED' }).select('id, stage, updated_at').single();
    expect(app.error).toBeNull();
    const seeds = [
      { key: 'a', title: 'QA Engineer', company: acme, location: 'Remote - United States', arrangement: 'remote', scope: 'us', postedAt: Date.now() - 3 * hour, score: 70, fit: ['Uses Selenium and Playwright'], gap: ['Wants 2 years of SQL'], exp: 2 },
      { key: 'b', title: 'Software Test Engineer', company: `Zeta${run}`, location: 'Remote', arrangement: 'remote', scope: 'restricted', postedAt: Date.now() - 1 * hour, score: 90, fit: ['API testing focus'], gap: ['Remote only in TX and FL'], exp: null, note: 'Must reside in TX or FL' },
      { key: 'c', title: 'QA Analyst', company: `Yodel${run}`, location: 'Houston, TX', arrangement: 'hybrid', scope: null, postedAt: null, score: 85, fit: [], gap: [], exp: null },
      { key: 'd', title: 'SDET', company: `Xylo${run}`, location: 'Remote', arrangement: 'remote', scope: null, postedAt: Date.now() - 20 * hour, score: 60, fit: [], gap: [], exp: null },
    ];
    const findings = seeds.map((s) => ({
      ...owner, kind: 'job_lead', provider: 'claude', status: 'NEW', priority: 'NORMAL', title: `${s.title} at ${s.company}`, summary: `Summary ${s.key}`,
      dedupe_key: `url:https://jobs.example.com/${run}/${s.key}`, payload: { version: '1.0', company: s.company, role_title: s.title, match_reasoning: 'Matches the profile.' },
    }));
    const inserted = await admin.from('ai_findings').insert(findings).select('id, dedupe_key');
    expect(inserted.error).toBeNull();
    const idOf = (k: string) => inserted.data!.find((r) => r.dedupe_key.endsWith(`/${k}`))!.id as string;
    expect((await admin.from('ai_job_leads').insert(seeds.map((s) => ({
      finding_id: idOf(s.key), ...owner, company: s.company, title: s.title, location: s.location, work_arrangement: s.arrangement, employment_type: 'full_time',
      source_name: 'example jobs', source_url: `https://jobs.example.com/${run}/${s.key}`, canonical_url: `https://jobs.example.com/${run}/${s.key}`,
      posted_at: s.postedAt ? new Date(s.postedAt).toISOString() : null, posted_date: s.postedAt ? new Date(s.postedAt).toISOString().slice(0, 10) : null,
      freshness_at: new Date(s.postedAt ?? Date.now() - 30 * 60_000).toISOString(), remote_scope: s.scope, remote_note: (s as { note?: string }).note ?? null,
      experience_min_years: s.exp, fit_reasons: s.fit, gap_reasons: s.gap, match_score: s.score, required_skills: ['Selenium'], preferred_skills: [],
    })))).error).toBeNull();
    const seedRun = async (status: string, sources: unknown[]) => {
      const r = await admin.rpc('rpc_ai_ingest_run', { p_actor_id: state.userId, p_workspace_id: state.workspaceId, p_provider: 'claude', p_workflow: 'job_discovery', p_external_run_id: `e2e-${run}-${status}-${Math.random().toString(36).slice(2, 7)}`, p_trigger_type: 'manual', p_schema_version: '1.0', p_status: 'RUNNING', p_sources: sources });
      expect(r.error).toBeNull();
      expect((await admin.rpc('rpc_ai_finalize_run', { p_actor_id: state.userId, p_run_id: r.data.run_id, p_status: status })).error).toBeNull();
    };
    await seedRun('SUCCEEDED', [{ type: 'job_site', ref: 'board', status: 'unavailable', note: 'connector off' }, { type: 'web', ref: 'search', status: 'blocked' }]);
    const appsBefore = (await admin.from('applications').select('id, stage, updated_at').eq('workspace_id', state.workspaceId).order('id')).data;

    await page.goto('/ai-hub/job-leads');
    await expect(page.getByRole('heading', { name: 'Job Leads', level: 2 })).toBeVisible();
    const cards = page.getByRole('article');
    await expect(cards).toHaveCount(4);

    // freshest first: the best known posting time; a lead with no posted time sorts by when it was found (30 min ago here) and is never shown as a posted time
    const titles = async () => cards.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    expect(await titles()).toEqual([
      `QA Analyst at Yodel${run}`, `Software Test Engineer at Zeta${run}`, `QA Engineer at ${acme}`, `SDET at Xylo${run}`,
    ]);
    const zeta = page.getByRole('article', { name: `Software Test Engineer at Zeta${run}` });
    await expect(zeta.getByText('Posted 1h ago')).toBeVisible();
    await expect(zeta.getByText('Remote — restricted locations')).toBeVisible(); // never presented as Remote - US
    await expect(zeta.getByText('Remote — US')).toHaveCount(0);
    await expect(zeta.getByText('API testing focus')).toBeVisible();
    await expect(zeta.getByText('Remote only in TX and FL')).toBeVisible();
    await expect(zeta.getByText('Concerns and gaps')).toBeVisible();
    const yodel = page.getByRole('article', { name: `QA Analyst at Yodel${run}` });
    await expect(yodel.getByText('Posted date unknown')).toBeVisible();
    await expect(yodel.getByText('Hybrid')).toBeVisible();
    const a = page.getByRole('article', { name: `QA Engineer at ${acme}` });
    await expect(a.getByText('Posted 3h ago')).toBeVisible();
    await expect(a.getByText('Remote — US')).toBeVisible();
    await expect(a.getByText('Experience: 2+ years stated')).toBeVisible();
    await expect(a.getByText('Uses Selenium and Playwright')).toBeVisible();
    const d = page.getByRole('article', { name: `SDET at Xylo${run}` });
    await expect(d.getByText('Remote — location scope not stated')).toBeVisible(); // "remote" alone is not Remote US

    // already tracked: derived, read-only, explained; the lead stays visible; nothing is created or changed
    await expect(a.getByText('Already tracked')).toBeVisible();
    await expect(a.getByRole('button', { name: `Open tracked application: QA Engineer at ${acme} Inc.` })).toBeVisible();
    await expect(zeta.getByText(/Already tracked|Possibly tracked/)).toHaveCount(0);
    await expect(page.getByText(/Apply now|Create application|Add to applications/)).toHaveCount(0);

    // source health: a run whose every source was unavailable / blocked is NOT "no new jobs"
    const health = page.getByTestId('discovery-run-summary');
    await expect(health).toContainText('could not search any source');
    await expect(health).toContainText('not the same as no new jobs');
    await seedRun('SUCCEEDED', [{ type: 'job_site', ref: 'board', status: 'zero', count: 0 }, { type: 'web', ref: 'search', status: 'unavailable' }]);
    await page.reload();
    await expect(page.getByTestId('discovery-run-summary')).toContainText('found nothing new');
    await expect(page.getByTestId('discovery-run-summary')).not.toContainText('could not search');

    // sort / recency / remote-US controls
    const apply = () => page.getByRole('button', { name: 'Apply filters' }).click();
    await page.getByLabel('Sort by').selectOption('match');
    await apply();
    await expect(cards.first()).toHaveAttribute('aria-label', `Software Test Engineer at Zeta${run}`);
    expect(await titles()).toEqual([`Software Test Engineer at Zeta${run}`, `QA Analyst at Yodel${run}`, `QA Engineer at ${acme}`, `SDET at Xylo${run}`]);
    await page.getByLabel('Sort by').selectOption('freshness');
    await page.getByLabel('Newest within').selectOption('12');
    await apply();
    await expect(cards).toHaveCount(3); // the 20-hour-old lead drops out
    await expect(page.getByRole('article', { name: `SDET at Xylo${run}` })).toHaveCount(0);
    await page.getByLabel('Newest within').selectOption('ALL');
    await page.locator('label').filter({ hasText: 'Remote — US only' }).click();
    await apply();
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toHaveAttribute('aria-label', `QA Engineer at ${acme}`);
    await page.getByRole('button', { name: 'Reset filters' }).click();
    await expect(cards).toHaveCount(4);

    // the lead dialog shows every reason and the honest posted time
    await a.getByRole('button', { name: `View details: QA Engineer at ${acme}` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Why it may fit')).toBeVisible();
    await expect(dialog.getByText('Wants 2 years of SQL')).toBeVisible();
    await expect(dialog.getByText('Posted 3h ago')).toBeVisible();
    await page.keyboard.press('Escape');

    // nothing core changed by any of the above
    expect((await admin.from('applications').select('id, stage, updated_at').eq('workspace_id', state.workspaceId).order('id')).data).toEqual(appsBefore);
    expect((await admin.from('ai_findings').select('status').eq('user_id', state.userId).eq('kind', 'job_lead').neq('status', 'NEW')).data).toEqual([]);

    // ---- 3) layout and accessibility at three widths ------------------------------------------------------------------
    for (const w of [1280, 768, 375]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(150);
      await expect(cards).toHaveCount(4);
      expect(await overflow(page), `job leads overflow @${w}`).toBe(0);
      a11y.push(await audit(page, `job-leads-${w}`));
      await page.screenshot({ path: resolve(shotsDir, `ai11d-job-leads-${w}.png`), fullPage: true });
    }

    evidence.a11y = a11y;
    evidence.blocking = a11y.reduce((n, r) => n + r.blocking, 0);
    writeFileSync(resolve(evidenceDir, 'ai11d-discovery-e2e.json'), JSON.stringify(evidence, null, 2));
    expect(evidence.blocking, JSON.stringify(a11y.filter((r) => r.blocking).map((r) => [r.context, r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)]))).toBe(0);
  });
});
