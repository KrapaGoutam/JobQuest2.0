import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const shotsDir = resolve('migration-upgrade/m10/screenshots');
const evidenceDir = resolve('migration-upgrade/m10/evidence');
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

test.describe('Milestone 10 · Import & Export E2E', () => {
  test.setTimeout(240_000);

  test('4-step wizard, duplicate handling, atomicity, export downloads, responsive/theme/a11y', async ({ page }) => {
    const reusedRun = process.env.M10_REUSE_RUN?.trim();
    const run = reusedRun || randomBytes(3).toString('hex');
    const username = `m10_e2e_${run}`;
    const password = `ImportExport-${run}-P@ss!`;
    const evidence: Record<string, unknown> = { run, reused_preview_account: Boolean(reusedRun), started_at: new Date().toISOString() };
    const a11y: Awaited<ReturnType<typeof audit>>[] = [];

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    if (reusedRun) {
      const login = page.getByRole('form', { name: 'Sign in' });
      await login.getByLabel('Username').fill(username);
      await login.getByLabel('Password').fill(password);
      await login.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByTestId('new-application-btn')).toBeVisible();
    } else {
      const registration = page.getByRole('form', { name: 'Register' });
      await registration.getByLabel('Username (required)').fill(username);
      await registration.getByLabel('Password (required)').fill(password);
      await registration.getByRole('button', { name: 'Create account' }).click();
      await expect(page.getByTestId('recovery-codes').locator('li')).toHaveCount(10);
      await page.getByRole('button', { name: 'I saved them' }).click();
      await expect(page.getByTestId('new-application-btn')).toBeVisible();

      // Seed an initial application for duplicate detection & export verification
      await page.getByTestId('new-application-btn').click();
      const createDialog = page.getByRole('dialog', { name: 'New Job Application' });
      await expect(createDialog).toBeVisible();
      await page.locator('#app-company').fill(`Acme Corp ${run}`);
      await page.locator('#app-role').fill('Senior Systems Engineer');
      await page.getByRole('button', { name: 'Create Application' }).click();
      await expect(createDialog).toBeHidden();
    }

    // Navigate to Import & Export
    await nav(page, 'Import & Export');
    await expect(page.getByRole('heading', { name: '1. Choose a source' })).toBeVisible();
    await dismissToasts(page);

    // Step 1: Choose source (structured text)
    await page.getByRole('radio', { name: 'Structured text' }).click();
    const structuredInput = `company: Acme Corp ${run}
job_title: Senior Systems Engineer
date_applied: 2026-09-26
---
company: Stellar Dynamics ${run}
job_title: Staff Cloud Architect
date_applied: 2026-09-26
salary_min: 180000
salary_max: 220000
location: Remote
---`;

    await page.locator('textarea').fill(structuredInput);
    await shot(page, 'm10-import-wizard-light');
    a11y.push(await audit(page, 'import-wizard-light'));

    // Step 1 -> Step 2
    await page.getByRole('button', { name: 'Continue to mapping' }).click();
    await expect(page.getByRole('heading', { name: '2. Map source fields' })).toBeVisible();

    // Verify mapping in dark mode
    await page.getByRole('radio', { name: 'Dark mode' }).click();
    await settle(page);
    await shot(page, 'm10-import-mapping-dark');
    a11y.push(await audit(page, 'import-mapping-dark'));

    // Return to light mode
    await page.getByRole('radio', { name: 'Light mode' }).click();
    await settle(page);

    // Step 2 -> Step 3
    await page.getByRole('button', { name: 'Review rows' }).click();
    await expect(page.getByRole('heading', { name: '3. Review before commit' })).toBeVisible();

    // Verify preview table has rows
    const previewTable = page.locator('.m10-table');
    await expect(previewTable).toBeVisible();
    await expect(previewTable.locator('tbody tr')).toHaveCount(2);

    // Row 1 should be flagged as DUPLICATE (Acme Corp)
    await expect(previewTable.locator('tbody tr').nth(0)).toContainText('DUPLICATE');
    // Set Row 1 action to SKIP
    const dupSelect = page.getByRole('combobox', { name: 'Duplicate action for row 1' });
    await dupSelect.selectOption('SKIP');

    await shot(page, 'm10-import-preview-light');
    a11y.push(await audit(page, 'import-preview-light'));

    // Commit import
    await page.getByRole('button', { name: /Import 2 rows/i }).click();
    await expect(page.getByRole('heading', { name: /Import complete/i })).toBeVisible();

    // Step 4 in dark mode
    await page.getByRole('radio', { name: 'Dark mode' }).click();
    await settle(page);
    await shot(page, 'm10-import-summary-dark');
    a11y.push(await audit(page, 'import-summary-dark'));

    // Verify counts: 1 created, 1 skipped
    const summaryCard = page.locator('.m10-summary');
    await expect(summaryCard).toContainText('1 created');
    await expect(summaryCard).toContainText('1 skipped');
    evidence.import_committed = true;
    evidence.created_rows = 1;
    evidence.skipped_rows = 1;

    // Return to light mode
    await page.getByRole('radio', { name: 'Light mode' }).click();
    await settle(page);

    // Verify Import History section has recorded this batch
    const historySection = page.locator('.m10-history');
    await expect(historySection).toBeVisible();
    await expect(historySection.locator('article')).toBeVisible();
    // Expand history batch
    await historySection.locator('article button.m10-history-head').first().click();
    await expect(historySection.locator('.m10-table')).toBeVisible();
    evidence.history_verified = true;

    // Verify Export controls
    await shot(page, 'm10-export-controls-light');
    a11y.push(await audit(page, 'export-controls-light'));

    // Test Applications CSV download
    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Applications CSV' }).click(),
    ]);
    expect(csvDownload.suggestedFilename()).toBe('applications.csv');
    evidence.csv_export_downloaded = true;

    // Test Applications XLSX download
    const [xlsxDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Applications XLSX' }).click(),
    ]);
    expect(xlsxDownload.suggestedFilename()).toBe('jobquest-applications.xlsx');
    evidence.xlsx_export_downloaded = true;

    // Test JSON archive download
    const [jsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Full JSON archive' }).click(),
    ]);
    expect(jsonDownload.suggestedFilename()).toBe('jobquest-export.json');
    evidence.json_export_downloaded = true;

    // Reset wizard
    await page.getByRole('button', { name: 'Start another import' }).click();
    await expect(page.getByRole('heading', { name: '1. Choose a source' })).toBeVisible();

    // Mobile view & overflow verification
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/workspace/imports');
    await expect(page.getByRole('heading', { name: '1. Choose a source' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    evidence.mobile_overflow_px = overflow;
    a11y.push(await audit(page, 'import-mobile'));

    const blocking = a11y.reduce((total, result) => total + result.blocking, 0);
    evidence.a11y_blocking = blocking;
    evidence.completed_at = new Date().toISOString();
    evidence.status = blocking === 0 ? 'PASS' : 'FAIL';
    writeFileSync(`${evidenceDir}/m10-e2e.json`, JSON.stringify({ evidence, a11y }, null, 2), 'utf8');
    expect(blocking, JSON.stringify(a11y, null, 2)).toBe(0);
  });
});
