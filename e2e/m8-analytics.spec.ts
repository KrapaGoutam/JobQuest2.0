import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const shotsDir = resolve('migration-upgrade/m8/screenshots');
const evidenceDir = resolve('migration-upgrade/m8/evidence');
mkdirSync(shotsDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });

const shot = (page: Page, name: string) => page.screenshot({ path: `${shotsDir}/${name}.png`, fullPage: false });
const settle = (page: Page) => page.waitForTimeout(500);
const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name, exact: true }).click();
const dismissToasts = async (page: Page) => {
  const closeButtons = page.getByRole('button', { name: 'Close notification' });
  while (await closeButtons.count()) await closeButtons.first().click();
};

async function audit(page: Page, context: string) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return {
    context,
    total: r.violations.length,
    critical: r.violations.filter((v) => v.impact === 'critical').length,
    serious: r.violations.filter((v) => v.impact === 'serious').length,
    violations: r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.map((n) => ({
        html: n.html,
        failureSummary: n.failureSummary,
      })),
    })),
    blocking: r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').length,
  };
}

test.describe('Milestone 8 · Search Analytics, Reports & Goals E2E', () => {
  test.setTimeout(240_000);

  test('analytics overview, stage timing, aging report, weekly goals, export, dark/light modes, a11y', async ({ page }) => {
    const run = randomBytes(3).toString('hex');
    const username = `m8_e2e_${run}`;
    const password = `Analytics-Run-${run}-P@ss!`;
    const evidence: Record<string, unknown> = { run, started_at: new Date().toISOString() };

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // 1. Register new user
    const reg = page.getByRole('form', { name: 'Register' });
    await reg.getByLabel('Username (required)').fill(username);
    await reg.getByLabel('Password (required)').fill(password);
    await reg.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByTestId('recovery-codes').locator('li')).toHaveCount(10);
    await page.getByRole('button', { name: 'I saved them' }).click();
    await expect(page.getByTestId('new-application-btn')).toBeVisible();

    // 2. Create sample applications to populate pipeline and analytics
    await page.getByTestId('new-application-btn').click();
    const createDialog = page.getByRole('dialog', { name: 'New Job Application' });
    await expect(createDialog).toBeVisible();
    await page.locator('#app-company').fill('Apex Fintech');
    await page.locator('#app-role').fill('Staff Backend Engineer');
    await page.locator('#app-source').fill('=2+2');
    await page.getByRole('button', { name: 'Create Application' }).click();
    await expect(createDialog).toBeHidden();
    await settle(page);

    await page.getByTestId('new-application-btn').click();
    await expect(createDialog).toBeVisible();
    await page.locator('#app-company').fill('Starlight AI');
    await page.locator('#app-role').fill('Machine Learning Architect');
    await page.locator('#app-source').fill('LinkedIn');
    await page.getByRole('button', { name: 'Create Application' }).click();
    await expect(createDialog).toBeHidden();
    await settle(page);

    // 3. Navigate to Analytics view via primary sidebar navigation
    await nav(page, 'Analytics');
    await settle(page);

    // Verify main header and date range selector
    await expect(page.getByRole('heading', { name: 'Analytics', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: '90d' })).toBeVisible();

    // Check headings in Overview tab
    await expect(page.getByRole('heading', { name: 'Am I keeping pace?' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What is open right now?' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Where do applications stop?' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Which sources work?' })).toBeVisible();
    await expect(page.getByTestId('analytics-total-applications')).toHaveText('2');
    await expect(page.getByText('=2+2', { exact: true })).toBeVisible();
    await expect(page.getByText('LinkedIn', { exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/NaN|undefined/);

    // Date presets reload the same range-scoped data without losing current-state panels.
    await page.getByRole('button', { name: '30d' }).click();
    await expect(page.getByTestId('analytics-total-applications')).toHaveText('2');

    // Export both supported formats and inspect the downloaded payloads.
    const csvDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const csvDownload = await csvDownloadPromise;
    expect(csvDownload.suggestedFilename()).toBe('jobquest-analytics-30d.csv');
    const csvPath = await csvDownload.path();
    expect(csvPath).not.toBeNull();
    const csv = readFileSync(csvPath!, 'utf8');
    expect(csv).toContain('--- SEARCH SUMMARY ---');
    expect(csv).toContain("'=2+2,1");

    const jsonDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'JSON' }).click();
    const jsonDownload = await jsonDownloadPromise;
    expect(jsonDownload.suggestedFilename()).toBe('jobquest-analytics-30d.json');
    const jsonPath = await jsonDownload.path();
    expect(jsonPath).not.toBeNull();
    const json = JSON.parse(readFileSync(jsonPath!, 'utf8')) as {
      overview: { total_applications: number };
      timing: unknown;
    };
    expect(json.overview.total_applications).toBe(2);
    expect(json.timing).not.toBeNull();
    await dismissToasts(page);

    // Screenshot Y1 · Analytics overview (light mode)
    await shot(page, 'Y1-analytics-light');
    evidence['Y1_screenshot'] = 'Y1-analytics-light.png';

    // A11y audit: Overview light
    const a11yOverview = await audit(page, 'analytics-overview-light');
    console.log('A11Y OVERVIEW VIOLATIONS:', JSON.stringify(a11yOverview.violations, null, 2));
    expect(a11yOverview.critical).toBe(0);
    expect(a11yOverview.serious).toBe(0);
    evidence['a11y_overview'] = a11yOverview;

    // Toggle Dark Mode via ThemeToggle radio
    const darkRadio = page.getByRole('radio', { name: 'Dark mode' });
    if (await darkRadio.isVisible()) {
      await darkRadio.click();
      await settle(page);
    }

    // Screenshot Y2 · Analytics overview (dark mode)
    await shot(page, 'Y2-analytics-dark');
    evidence['Y2_screenshot'] = 'Y2-analytics-dark.png';

    // 4. Tab: Stage Timing
    // Switch back to light mode
    const lightRadio = page.getByRole('radio', { name: 'Light mode' });
    if (await lightRadio.isVisible()) {
      await lightRadio.click();
      await settle(page);
    }
    await page.getByRole('tab', { name: 'Stage timing' }).click();
    await settle(page);

    await expect(page.getByRole('heading', { name: 'How long does each step take?' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What is stuck right now?' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Does following up help?' })).toBeVisible();

    // Screenshot Y3 · Stage timing (light mode)
    await shot(page, 'Y3-stage-timing-light');
    evidence['Y3_screenshot'] = 'Y3-stage-timing-light.png';

    const a11yTiming = await audit(page, 'analytics-stage-timing-light');
    expect(a11yTiming.critical).toBe(0);
    expect(a11yTiming.serious).toBe(0);
    evidence['a11y_timing'] = a11yTiming;

    // 5. Tab: Aging Report
    // Toggle dark mode for aging report per Gate 02B spec
    if (await darkRadio.isVisible()) {
      await darkRadio.click();
      await settle(page);
    }
    await page.getByRole('tab', { name: 'Aging' }).click();
    await settle(page);

    await expect(page.getByText('New', { exact: true })).toBeVisible();
    await expect(page.getByText('Waiting', { exact: true })).toBeVisible();
    await expect(page.getByText('Follow-Up Recommended', { exact: true })).toBeVisible();
    await expect(page.getByText('Stale', { exact: true })).toBeVisible();
    await expect(page.getByText('Long Waiting', { exact: true })).toBeVisible();
    await expect(page.getByText(/Review quiet applications/i)).toBeVisible();

    // Screenshot Y4 · Aging report (dark mode)
    await shot(page, 'Y4-aging-report-dark');
    evidence['Y4_screenshot'] = 'Y4-aging-report-dark.png';

    const a11yAging = await audit(page, 'analytics-aging-dark');
    expect(a11yAging.critical).toBe(0);
    expect(a11yAging.serious).toBe(0);
    evidence['a11y_aging'] = a11yAging;

    // 6. Tab: Goals
    // Switch back to light mode for R3 Goals
    if (await lightRadio.isVisible()) {
      await lightRadio.click();
      await settle(page);
    }

    // A manager can scope analytics and goals to an individual workspace member.
    const memberFilter = page.getByLabel('Filter by workspace member');
    await expect(memberFilter.locator('option')).toHaveCount(2);
    await memberFilter.selectOption({ index: 1 });
    await page.getByRole('tab', { name: 'Goals' }).click();
    await settle(page);

    await expect(page.getByRole('heading', { name: 'Weekly Activity Targets' })).toBeVisible();
    await expect(page.getByText('This week').first()).toBeVisible();
    await expect(page.getByText('Recent History').first()).toBeVisible();

    // Edit targets dialog
    await page.getByRole('button', { name: 'Edit targets' }).click();
    const goalModal = page.getByRole('dialog', { name: 'Edit Weekly Search Goals' });
    await expect(goalModal).toBeVisible();

    await goalModal.getByRole('spinbutton').first().fill('18');
    await goalModal.getByRole('button', { name: 'Save Goals' }).click();
    await settle(page);
    await dismissToasts(page);

    // Screenshot R3 · Goals (light mode)
    await shot(page, 'R3-goals-light');
    evidence['R3_screenshot'] = 'R3-goals-light.png';

    const a11yGoals = await audit(page, 'analytics-goals-light');
    expect(a11yGoals.critical).toBe(0);
    expect(a11yGoals.serious).toBe(0);
    evidence['a11y_goals'] = a11yGoals;

    // Mobile layout preserves navigation, filters, and tab access.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('heading', { name: 'Analytics', level: 1 })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Goals' })).toBeVisible();
    await shot(page, 'Y5-analytics-mobile');
    evidence['Y5_screenshot'] = 'Y5-analytics-mobile.png';

    const a11yMobile = await audit(page, 'analytics-goals-mobile');
    expect(a11yMobile.critical).toBe(0);
    expect(a11yMobile.serious).toBe(0);
    evidence['a11y_mobile'] = a11yMobile;

    evidence['completed_at'] = new Date().toISOString();
    writeFileSync(`${evidenceDir}/m8-e2e.json`, JSON.stringify(evidence, null, 2));
  });
});
