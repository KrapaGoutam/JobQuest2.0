import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const shotsDir = resolve('migration-upgrade/m9/screenshots');
const evidenceDir = resolve('migration-upgrade/m9/evidence');
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
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return {
    context,
    total: result.violations.length,
    critical: result.violations.filter((violation) => violation.impact === 'critical').length,
    serious: result.violations.filter((violation) => violation.impact === 'serious').length,
    blocking: result.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious').length,
    violations: result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      nodes: violation.nodes.map((node) => ({ html: node.html, failureSummary: node.failureSummary })),
    })),
  };
}

test.describe('Milestone 9 · Dashboard parity E2E', () => {
  test.setTimeout(240_000);

  test('30-widget customization, persistence, drill-through, responsive/theme/a11y', async ({ page }) => {
    const run = randomBytes(3).toString('hex');
    const username = `m9_e2e_${run}`;
    const password = `Dashboard-Run-${run}-P@ss!`;
    const evidence: Record<string, unknown> = { run, started_at: new Date().toISOString() };
    const a11y: Awaited<ReturnType<typeof audit>>[] = [];

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const registration = page.getByRole('form', { name: 'Register' });
    await registration.getByLabel('Username (required)').fill(username);
    await registration.getByLabel('Password (required)').fill(password);
    await registration.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByTestId('recovery-codes').locator('li')).toHaveCount(10);
    await page.getByRole('button', { name: 'I saved them' }).click();
    await expect(page.getByTestId('new-application-btn')).toBeVisible();

    const applications: Array<readonly [string, string]> = [
      ['Northstar Systems', 'Platform Engineer'],
      ['Lantern Labs', 'Product Engineer'],
    ];
    for (const [company, role] of applications) {
      await page.getByTestId('new-application-btn').click();
      const createDialog = page.getByRole('dialog', { name: 'New Job Application' });
      await expect(createDialog).toBeVisible();
      await page.locator('#app-company').fill(`${company} ${run}`);
      await page.locator('#app-role').fill(role);
      await page.getByRole('button', { name: 'Create Application' }).click();
      await expect(createDialog).toBeHidden();
    }

    const dashboardStartedAt = Date.now();
    await nav(page, 'Dashboard');
    await expect(page.getByRole('heading', { name: 'What needs attention today', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your dashboard', level: 2 })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Loading dashboard widgets' })).toHaveCount(0);
    const dashboardFirstReadyMs = Date.now() - dashboardStartedAt;
    expect(dashboardFirstReadyMs).toBeLessThan(10_000);
    evidence.dashboard_first_ready_ms = dashboardFirstReadyMs;
    evidence.dashboard_first_ready_budget_ms = 10_000;
    await expect(page.locator('[data-widget-id="applications-month"]')).toBeVisible();
    await expect(page.locator('[data-widget-id="active-applications"]')).toContainText('2');
    await expect(page.locator('body')).not.toContainText(/NaN|undefined/);
    await dismissToasts(page);
    await shot(page, 'D1-dashboard-light');
    a11y.push(await audit(page, 'dashboard-light'));

    await page.getByRole('button', { name: 'Customize' }).click();
    const customize = page.getByRole('dialog', { name: 'Customize dashboard' });
    await expect(customize).toBeVisible();
    const rows = customize.locator('.dash-customize-row');
    await expect(rows).toHaveCount(30);
    await expect(customize.getByText('30 visible')).toHaveCount(0);
    a11y.push(await audit(page, 'dashboard-customize-dialog'));

    const todayCheckbox = customize.getByRole('checkbox', { name: 'Show Applications Today' });
    await todayCheckbox.focus();
    await page.keyboard.press('Space');
    await expect(todayCheckbox).toBeChecked();
    const weekCheckbox = customize.getByRole('checkbox', { name: 'Show Applications This Week' });
    await weekCheckbox.locator('..').click();
    await expect(weekCheckbox).toBeChecked();
    const monthCheckbox = customize.getByRole('checkbox', { name: 'Show Applications This Month' });
    await monthCheckbox.locator('..').click();
    await expect(monthCheckbox).not.toBeChecked();
    await customize.getByLabel('Width for Applications Today').selectOption('2');

    const moveTodayDown = customize.getByRole('button', { name: 'Move Applications Today down' });
    await moveTodayDown.focus();
    await page.keyboard.press('Enter');
    await expect(rows.nth(0)).toContainText('Applications This Week');
    await expect(rows.nth(1)).toContainText('Applications Today');
    await shot(page, 'D2-customize-dialog');
    await customize.getByRole('button', { name: 'Save layout' }).click();
    await expect(customize).toBeHidden();
    await expect(page.getByText('Dashboard layout saved')).toBeVisible();
    await dismissToasts(page);
    await expect(page.locator('[data-widget-id="applications-month"]')).toHaveCount(0);
    const pipelineWidgets = page.getByTestId('dashboard-tier-pipeline').locator('[data-widget-id]');
    await expect(pipelineWidgets.nth(0)).toHaveAttribute('data-widget-id', 'applications-week');
    await expect(pipelineWidgets.nth(1)).toHaveAttribute('data-widget-id', 'applications-today');
    await expect(page.locator('[data-widget-id="applications-today"]')).toHaveCSS('grid-column', 'span 2');

    await page.reload();
    await expect(page.getByRole('status', { name: 'Loading dashboard widgets' })).toHaveCount(0);
    await expect(page.locator('[data-widget-id="applications-month"]')).toHaveCount(0);
    await expect(page.getByTestId('dashboard-tier-pipeline').locator('[data-widget-id]').nth(0)).toHaveAttribute('data-widget-id', 'applications-week');
    evidence.custom_layout_persisted = true;

    await page.locator('[data-widget-id="aging-applications"]').getByRole('button', { name: 'Open Aging Applications' }).click();
    await expect(page).toHaveURL(/#\/analytics\/aging$/);
    await expect(page.getByRole('heading', { name: 'Analytics', level: 1 })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Aging' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(/Review quiet applications/i)).toBeVisible();
    evidence.aging_drill_through = true;

    await page.goto('/#/dashboard');
    await expect(page.getByRole('status', { name: 'Loading dashboard widgets' })).toHaveCount(0);
    await page.getByRole('radio', { name: 'Dark mode' }).click();
    await settle(page);
    await shot(page, 'D3-dashboard-dark');
    a11y.push(await audit(page, 'dashboard-dark'));

    await page.getByRole('radio', { name: 'Light mode' }).click();
    await settle(page);
    await page.getByRole('button', { name: 'Customize' }).click();
    await customize.getByRole('button', { name: 'Reset defaults' }).click();
    await customize.getByRole('button', { name: 'Save layout' }).click();
    await expect(customize).toBeHidden();
    await expect(page.locator('[data-widget-id="applications-month"]')).toBeVisible();
    await expect(page.locator('[data-widget-id="applications-today"]')).toHaveCount(0);
    await dismissToasts(page);
    evidence.reset_defaults = true;

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/dashboard');
    await expect(page.getByRole('heading', { name: 'What needs attention today', level: 1 })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Loading dashboard widgets' })).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(page, 'D4-dashboard-mobile');
    a11y.push(await audit(page, 'dashboard-mobile'));

    const blocking = a11y.reduce((total, result) => total + result.blocking, 0);
    evidence.mobile_overflow_px = overflow;
    evidence.widget_registry_count = 30;
    evidence.a11y_blocking = blocking;
    evidence.completed_at = new Date().toISOString();
    evidence.status = blocking === 0 ? 'PASS' : 'FAIL';
    writeFileSync(`${evidenceDir}/m9-e2e.json`, JSON.stringify({ evidence, a11y }, null, 2), 'utf8');
    expect(blocking, JSON.stringify(a11y, null, 2)).toBe(0);
  });
});
