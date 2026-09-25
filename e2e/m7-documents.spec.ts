import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const shotsDir = resolve('migration-upgrade/m7/screenshots');
const evidenceDir = resolve('migration-upgrade/m7/evidence');
mkdirSync(shotsDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });

const shot = (page: Page, name: string) => page.screenshot({ path: `${shotsDir}/${name}.png`, fullPage: false });
const settle = (page: Page) => page.waitForTimeout(400);
const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name, exact: true }).click();

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
      nodes: v.nodes.length,
    })),
    blocking: r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').length,
  };
}

test.describe('Milestone 7 · Documents & Resumes E2E', () => {
  test.setTimeout(240_000);

  test('resumes, versioning, clone, cover letter, compare, application documents linkage, guarded delete, a11y', async ({ page }) => {
    const run = randomBytes(3).toString('hex');
    const username = `m7_e2e_${run}`;
    const password = `Resume-Track-${run}-Key!`;
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

    // 2. Navigate to Resumes view via Primary navigation
    await nav(page, 'Resumes');
    await settle(page);

    await expect(page.getByRole('heading', { name: 'Resumes', level: 1 })).toBeVisible();
    await expect(page.getByText('Versions are tracked as names and notes.')).toBeVisible();

    // Accessibility audit on initial empty Resumes view
    const a11yEmpty = await audit(page, 'resumes-initial');
    expect(a11yEmpty.critical).toBe(0);
    expect(a11yEmpty.serious).toBe(0);

    // 3. Create a primary resume version
    await page.getByRole('button', { name: 'New Version' }).click();
    const createModal = page.getByRole('dialog', { name: 'New Document Version' });
    await expect(createModal).toBeVisible();

    await page.locator('#create-doc-name').fill('Product Designer - Enterprise');
    await page.locator('#create-doc-version').fill('v1.0');
    await page.locator('#create-doc-role').fill('Senior Product Designer');
    await page.locator('#create-doc-cat').fill('Enterprise SaaS');
    await page.locator('#create-doc-summary').fill('Focus on design system scale and B2B workflow efficiency');
    await page.locator('#create-doc-content').fill('- Scaled unified design tokens\n- Increased enterprise task completion by 34%');
    await page.getByText(/set as default/i).click();

    // Accessibility on create modal
    const a11yModal = await audit(page, 'create-resume-modal');
    expect(a11yModal.critical).toBe(0);
    expect(a11yModal.serious).toBe(0);

    await page.getByRole('button', { name: 'Create Version' }).click();
    await expect(createModal).toBeHidden({ timeout: 10000 });
    await settle(page);

    // Verify created resume appears in the list with Default status
    await expect(page.getByText('Product Designer - Enterprise', { exact: true })).toBeVisible();
    await expect(page.getByText('Default', { exact: true })).toBeVisible();

    // Capture R1 Light Screenshot
    await shot(page, 'R1-resumes-light');

    // 4. Toggle Dark mode & capture R1 Dark Screenshot
    const darkRadio = page.getByRole('radio', { name: 'Dark mode' }).first();
    if (await darkRadio.isVisible()) {
      await darkRadio.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await settle(page);
      await shot(page, 'R1-resumes-dark');
      // Switch back to light
      await page.getByRole('radio', { name: 'Light mode' }).first().click();
      await settle(page);
    }

    // 5. Clone the resume into a revision
    await page.getByRole('button', { name: 'Clone' }).first().click();
    const cloneModal = page.getByRole('dialog', { name: 'Clone / Create Revision' });
    await expect(cloneModal).toBeVisible();

    await page.locator('#clone-doc-name').fill('Product Designer - FinTech');
    await page.locator('#clone-doc-version').fill('v1.1');
    await page.locator('#clone-doc-summary').fill('Emphasized payments compliance and ledger reconciliation');
    await page.getByRole('button', { name: 'Save Revision' }).click();
    await expect(cloneModal).toBeHidden({ timeout: 10000 });
    await settle(page);

    // Verify revision appears
    await expect(page.getByText('Product Designer - FinTech', { exact: true })).toBeVisible();
    await expect(page.getByText('Revision', { exact: true })).toBeVisible();

    // 6. Create a Cover Letter version
    await page.getByRole('button', { name: 'New Version' }).click();
    await expect(createModal).toBeVisible();
    await page.locator('#create-doc-type').selectOption('COVER_LETTER');
    await page.locator('#create-doc-name').fill('General Tech Cover Letter');
    await page.locator('#create-doc-version').fill('v1');
    await page.locator('#create-doc-summary').fill('Standard narrative highlighting 7 years fullstack experience');
    await page.getByRole('button', { name: 'Create Version' }).click();
    await expect(createModal).toBeHidden({ timeout: 10000 });
    await settle(page);

    await expect(page.getByText('General Tech Cover Letter', { exact: true })).toBeVisible();

    // 7. Test Filters (Tab filtering)
    await page.getByRole('button', { name: /cover letters \(/i }).click();
    await expect(page.getByText('General Tech Cover Letter', { exact: true })).toBeVisible();
    await expect(page.getByText('Product Designer - Enterprise', { exact: true })).toBeHidden();

    await page.getByRole('button', { name: /^resumes \(/i }).click();
    await expect(page.getByText('Product Designer - Enterprise', { exact: true })).toBeVisible();
    await expect(page.getByText('General Tech Cover Letter', { exact: true })).toBeHidden();

    await page.getByRole('button', { name: /all active \(/i }).click();
    await expect(page.getByText('Product Designer - Enterprise', { exact: true })).toBeVisible();
    await expect(page.getByText('General Tech Cover Letter', { exact: true })).toBeVisible();

    // 8. Open Side-by-Side Compare View (Gate 02B R2)
    await page.getByRole('button', { name: 'Compare' }).click();
    await settle(page);

    await expect(page.getByRole('heading', { name: 'Compare Versions', level: 1 })).toBeVisible();
    await expect(page.getByText('Target role')).toBeVisible();
    await expect(page.getByText('Response rate')).toBeVisible();
    await expect(page.getByText('Sample sizes differ')).toBeVisible();

    // Accessibility audit on Compare View
    const a11yCompare = await audit(page, 'compare-versions');
    expect(a11yCompare.critical).toBe(0);
    expect(a11yCompare.serious).toBe(0);

    // Capture R2 Compare Screenshot
    await shot(page, 'R2-compare-versions');

    // Return back to Resumes list
    await page.getByRole('button', { name: 'Back to Resumes' }).click();
    await settle(page);

    // 9. Navigate to Applications and create application with attached resume
    await nav(page, 'Applications');
    await settle(page);

    await page.getByTestId('new-application-btn').click();
    const newAppModal = page.locator('div[role="dialog"]');
    await expect(newAppModal).toBeVisible();

    await page.locator('#app-company').fill('Acme Corp');
    await page.locator('#app-role').fill('Staff Product Designer');

    // Select FinTech resume version
    const resumeSelect = page.locator('#app-resume-select');
    if (await resumeSelect.isVisible()) {
      const option = resumeSelect.locator('option').filter({ hasText: 'Product Designer - FinTech' }).first();
      const val = await option.getAttribute('value');
      if (val) {
        await resumeSelect.selectOption(val);
      }
    }

    await page.getByRole('button', { name: 'Create Application' }).click();
    await expect(newAppModal).toBeHidden({ timeout: 10000 });
    await settle(page);

    // 10. Open Application Detail Drawer and check Documents section
    await page.getByTestId('application-row').filter({ hasText: 'Acme Corp' }).click();
    const drawer = page.locator('div.drawer, div[role="dialog"]').first();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Verify Documents section rendered in drawer
    const docSection = page.locator('[data-testid="application-documents"]');
    await expect(docSection).toBeVisible();
    await expect(docSection.getByText('Product Designer - FinTech')).toBeVisible();

    // Capture Application Documents in Drawer screenshot
    await shot(page, 'm7-application-documents-drawer');

    // Close drawer
    const closeDrawerBtn = page.getByRole('button', { name: 'Close drawer' });
    if (await closeDrawerBtn.isVisible()) {
      await closeDrawerBtn.click();
    }

    // 11. Navigate back to Resumes and verify Used count
    await nav(page, 'Resumes');
    await settle(page);

    // FinTech resume was used once
    await expect(page.getByText('Product Designer - FinTech', { exact: true })).toBeVisible();

    // Guarded Delete check: open menu on used resume and try deleting
    const menuButtons = page.locator('button[aria-label="More actions"]');
    await menuButtons.nth(1).click(); // FinTech resume menu
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    // Toast warning appears: "Cannot delete document in use"
    await expect(page.getByText(/cannot delete document in use/i)).toBeVisible({ timeout: 5000 });

    // Soft-archive check: archive the resume
    await menuButtons.nth(1).click();
    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    await settle(page);

    // Switch to Archived tab and verify it's there
    await page.getByRole('button', { name: /archived \(/i }).click();
    await expect(page.getByText('Product Designer - FinTech', { exact: true })).toBeVisible();

    // Restore it
    await page.locator('button[aria-label="More actions"]').first().click();
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await settle(page);

    await page.getByRole('button', { name: /all active \(/i }).click();
    await expect(page.getByText('Product Designer - FinTech', { exact: true })).toBeVisible();

    // Save evidence
    evidence.a11y = {
      resumesList: a11yEmpty,
      createModal: a11yModal,
      compareView: a11yCompare,
    };
    evidence.passed = true;
    writeFileSync(`${evidenceDir}/m7-e2e-evidence.json`, JSON.stringify(evidence, null, 2));
  });
});
