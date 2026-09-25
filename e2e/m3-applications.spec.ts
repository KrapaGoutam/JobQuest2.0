import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const screenshotsDir = resolve('migration-upgrade/m3/screenshots');
const evidenceDir = resolve('migration-upgrade/m3/evidence');
mkdirSync(screenshotsDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });

test.describe('Milestone 3 — Applications Workflow & Data Grid', () => {
  test('Complete applications lifecycle, duplicate check, wide preview, accessibility, and visual capture', async ({ page }) => {
    const run = randomBytes(3).toString('hex');
    const username = `m3_tester_${run}`;
    const password = `Quantum-Pulse-${run}-Key!`;

    // 1. Register test user
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const reg = page.getByRole('form', { name: 'Register' });
    await reg.getByLabel('Username (required)').fill(username);
    await reg.getByLabel('Password (required)').fill(password);
    await reg.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByTestId('recovery-codes').locator('li')).toHaveCount(10);
    await page.getByRole('button', { name: 'I saved them' }).click();

    // Verify initial toolbar elements
    await expect(page.getByTestId('new-application-btn')).toBeVisible();
    await expect(page.getByPlaceholder('Search company, role, skills, notes (press / to focus)...')).toBeVisible();

    // 2. Open Create Application Modal
    await page.getByTestId('new-application-btn').click();
    await expect(page.getByRole('dialog', { name: 'New Job Application' })).toBeVisible();

    // Fill form
    await page.locator('#app-company').fill('Starlight Dynamics');
    await page.locator('#app-role').fill('Staff Platform Architect');
    await page.locator('#app-location').fill('Seattle, WA');
    await page.locator('#app-url').fill('https://careers.starlight.internal/jobs/9901');
    await page.locator('#app-ext-id').fill('REQ-9901');
    await page.locator('#app-work-arrangement').selectOption('HYBRID');
    await page.locator('#app-employment-type').selectOption('FULL_TIME');
    await page.locator('#app-salary-min').fill('160000');
    await page.locator('#app-salary-max').fill('195000');
    await page.locator('#app-next-action').fill('Prepare technical portfolio presentation');
    await page.locator('#app-notes').fill('Referred by engineering director. High priority target.');

    // Capture screenshot: Create modal
    await page.screenshot({ path: `${screenshotsDir}/applications-create-modal.png`, fullPage: false });

    // Submit creation
    await page.getByRole('button', { name: 'Create Application' }).click();
    await expect(page.getByRole('dialog', { name: 'New Job Application' })).not.toBeVisible();

    // Verify application row in table
    const tableRow = page.locator('tr').filter({ hasText: 'Starlight Dynamics' });
    await expect(tableRow).toBeVisible();
    await expect(tableRow).toContainText('Staff Platform Architect');
    await expect(tableRow).toContainText('Seattle, WA');

    // 3. Test Live Duplicate Detection
    await page.getByTestId('new-application-btn').click();
    await expect(page.getByRole('dialog', { name: 'New Job Application' })).toBeVisible();
    await page.locator('#app-company').fill('Starlight Dynamics');
    await page.locator('#app-role').fill('Staff Platform Architect');

    // Wait for debounced duplicate detection to flag duplicate
    await expect(page.locator('text=Exact Duplicate Found')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Starlight Dynamics · Staff Platform Architect')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog', { name: 'New Job Application' })).not.toBeVisible();

    // 4. Test Table Search & Filtering
    const searchInput = page.getByPlaceholder('Search company, role, skills, notes (press / to focus)...');
    await searchInput.fill('Starlight');
    await expect(tableRow).toBeVisible();

    await searchInput.fill('NonExistentCorp');
    await expect(page.getByText('No matching applications found')).toBeVisible();

    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(tableRow).toBeVisible();

    // 5. Test Row Selection & Bulk Action Bar
    const rowCheckbox = tableRow.locator('input[type="checkbox"]');
    await rowCheckbox.check();
    await expect(page.getByText('1 application selected')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Move Stage' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByText('1 application selected')).not.toBeVisible();

    // 6. Test Application Detail Drawer
    await tableRow.click();
    const drawer = page.getByRole('region', { name: 'Application Details' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('heading', { name: 'Staff Platform Architect' })).toBeVisible();
    await expect(drawer.getByText('Starlight Dynamics')).toBeVisible();

    // Check timeline shows CREATED event
    await expect(drawer.getByText('Application created in pipeline')).toBeVisible();

    // Capture screenshot: Detail Drawer
    await page.screenshot({ path: `${screenshotsDir}/applications-detail-drawer.png`, fullPage: false });

    // 7. Test Stage Move Dialog from Drawer
    await drawer.getByRole('button', { name: 'Move Stage' }).click();
    const stageDialog = page.getByRole('dialog', { name: 'Move Application Stage' });
    await expect(stageDialog).toBeVisible();
    await page.locator('#stage-select').selectOption('INTERVIEW');
    await page.locator('#stage-notes').fill('Passed initial phone screening; advancing to system design interview.');

    // Capture screenshot: Stage Move Dialog
    await page.screenshot({ path: `${screenshotsDir}/applications-stage-modal.png`, fullPage: false });

    await page.getByRole('button', { name: 'Update Stage' }).click();
    await expect(stageDialog).not.toBeVisible();
    await expect(drawer.getByText('INTERVIEW')).toBeVisible();
    await expect(drawer.getByText('Advanced stage to INTERVIEW')).toBeVisible();

    // 8. Test Set Outcome Dialog from Drawer
    await drawer.getByRole('button', { name: 'Set Outcome' }).click();
    const outcomeDialog = page.getByRole('dialog', { name: 'Set Application Outcome' });
    await expect(outcomeDialog).toBeVisible();

    // Capture screenshot: Outcome Dialog
    await page.screenshot({ path: `${screenshotsDir}/applications-outcome-modal.png`, fullPage: false });

    await outcomeDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(outcomeDialog).not.toBeVisible();

    // Close detail drawer
    await drawer.getByRole('button', { name: 'Close drawer' }).click();
    await expect(drawer).not.toBeVisible();

    // 9. Test Wide Desktop Preview Rail & 'P' Shortcut
    await page.setViewportSize({ width: 1720, height: 1000 });
    await page.waitForTimeout(300);
    const previewRail = page.locator('aside[aria-label="Application quick preview"]');
    await expect(previewRail).toBeVisible();
    await expect(previewRail).toContainText('Starlight Dynamics');

    // Capture screenshot: Wide Desktop with Preview Rail
    await page.screenshot({ path: `${screenshotsDir}/applications-wide-preview.png`, fullPage: false });

    // Test 'P' shortcut to toggle preview rail
    await page.keyboard.press('p');
    await expect(previewRail).not.toBeVisible();
    await page.keyboard.press('p');
    await expect(previewRail).toBeVisible();

    // Return to 1440x900 desktop viewport
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(200);

    // 10. Capture Applications Table Light & Dark
    await page.screenshot({ path: `${screenshotsDir}/applications-table-light.png`, fullPage: false });

    // Toggle Dark Mode
    await page.getByRole('radio', { name: 'Dark mode' }).first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({ path: `${screenshotsDir}/applications-table-dark.png`, fullPage: false });

    // Switch back to Light Mode
    await page.getByRole('radio', { name: 'Light mode' }).first().click();
    await page.waitForTimeout(200);

    // 11. Test Soft Archive & Restore
    const archiveRowBtn = tableRow.locator('button[title="Archive application"]');
    await archiveRowBtn.click();
    await expect(tableRow).not.toBeVisible();

    // Switch to Archived view
    await page.getByRole('button', { name: 'Archive' }).click();
    const archivedRow = page.locator('tr').filter({ hasText: 'Starlight Dynamics' });
    await expect(archivedRow).toBeVisible();
    await expect(archivedRow.getByText('Archived')).toBeVisible();

    // Capture screenshot: Archive State
    await page.screenshot({ path: `${screenshotsDir}/applications-archived-view.png`, fullPage: false });

    // Restore application
    const restoreRowBtn = archivedRow.locator('button[title="Restore application"]');
    await restoreRowBtn.click();
    await expect(archivedRow).not.toBeVisible();

    // Switch back to Active view
    await page.getByRole('button', { name: 'Archived Only' }).click();
    await expect(tableRow).toBeVisible();

    // 12. Test Mobile Viewport (Responsive Card Grid)
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    await expect(page.locator('text=Starlight Dynamics')).toBeVisible();
    await page.screenshot({ path: `${screenshotsDir}/applications-mobile.png`, fullPage: false });

    // 13. Accessibility Audit with axe-core on Applications View
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(200);

    const a11yAudit = await new AxeBuilder({ page })
      .disableRules(['color-contrast'])
      .analyze();

    const criticalViolations = a11yAudit.violations.filter((v) => v.impact === 'critical');
    expect(criticalViolations).toHaveLength(0);

    writeFileSync(
      `${evidenceDir}/m3-a11y-audit.json`,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          totalViolations: a11yAudit.violations.length,
          criticalViolations: criticalViolations.length,
          violations: a11yAudit.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            description: v.description,
            nodes: v.nodes.length,
          })),
          status: 'PASS',
        },
        null,
        2
      )
    );
  });
});
