import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * M3 E2E (E2E-01..07): the applications workflow in a real browser against the Option B
 * API and Supabase (local stack by default; set M1_BASE_URL for a Vercel preview).
 * One registered user per run (the deployed register limit is 3/hour/IP).
 */
const shotsDir = resolve('migration-upgrade/m3/screenshots');
const evidenceDir = resolve('migration-upgrade/m3/evidence');
mkdirSync(shotsDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });

const target = process.env.M1_BASE_URL ? 'vercel-preview' : 'local';
const shot = (page: Page, name: string) => page.screenshot({ path: `${shotsDir}/${name}.png`, fullPage: false });
/** Let CSS transitions finish (theme switch animates colours) before measuring or capturing. */
const settle = (page: Page) => page.waitForTimeout(600);
const row = (page: Page, text: string) => page.getByTestId('application-row').filter({ hasText: text });

async function audit(page: Page, context: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const blocking = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  return {
    context,
    total: r.violations.length,
    critical: r.violations.filter((v) => v.impact === 'critical').length,
    serious: r.violations.filter((v) => v.impact === 'serious').length,
    violations: r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.length,
      targets: v.nodes.slice(0, 12).map((n) => {
        const d = (n.any[0]?.data ?? {}) as { fgColor?: string; bgColor?: string; contrastRatio?: number; expectedContrastRatio?: string };
        return { target: n.target.join(' '), fg: d.fgColor, bg: d.bgColor, ratio: d.contrastRatio, expected: d.expectedContrastRatio };
      }),
    })),
    blocking: blocking.length,
  };
}

test.describe('Milestone 3 — Applications Workflow & Data Grid', () => {
  test.setTimeout(240_000);

  test('applications lifecycle, duplicates, drawer/rail, keyboard, archive, responsive and accessibility', async ({ page }) => {
    const run = randomBytes(3).toString('hex');
    const company = `Starlight Dynamics ${run}`;
    const role = 'Staff Platform Architect';
    const jobUrl = `https://careers.starlight.example/jobs/${run}`;
    const evidence: Record<string, unknown> = { target, run, started_at: new Date().toISOString() };
    const a11y: unknown[] = [];

    // ---------------------------------------------------------------- E2E-00 register
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('jobquest_preview_rail_open'));
    const reg = page.getByRole('form', { name: 'Register' });
    await reg.getByLabel('Username (required)').fill(`m3_e2e_${run}`);
    await reg.getByLabel('Password (required)').fill(`Quantum-Pulse-${run}-Key!`);
    await reg.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByTestId('recovery-codes').locator('li')).toHaveCount(10);
    await page.getByRole('button', { name: 'I saved them' }).click();
    await expect(page.getByTestId('new-application-btn')).toBeVisible();

    // ---------------------------------------------------------------- E2E-04 create (+ snapshot)
    await page.getByTestId('new-application-btn').click();
    const createDialog = page.getByRole('dialog', { name: 'New Job Application' });
    await expect(createDialog).toBeVisible();
    await page.locator('#app-company').fill(company);
    await page.locator('#app-role').fill(role);
    await page.locator('#app-job-url').fill(jobUrl);
    await page.locator('#app-req-id').fill(`REQ-${run}`);
    await page.locator('#app-loc').fill('Seattle, WA');
    await page.locator('#app-arrangement').selectOption('Hybrid');
    await page.locator('#app-employment').selectOption('Full-time');
    await page.locator('#app-sal-min').fill('160000');
    await page.locator('#app-sal-max').fill('195000');
    await page.locator('#app-next-action').fill('Prepare technical portfolio presentation');
    await page.locator('#app-tags').fill('platform, typescript');
    await page.locator('#app-notes').fill('Referred by engineering director.');
    await page.getByRole('button', { name: /Add Job Posting Snapshot/ }).click();
    await page.locator('#app-snap-skills').fill('TypeScript, Kubernetes');
    await shot(page, 'applications-create-modal');
    a11y.push(await audit(page, 'create-dialog'));
    await page.getByRole('button', { name: 'Create Application' }).click();
    await expect(createDialog).toBeHidden();
    await expect(row(page, company)).toBeVisible();
    await expect(row(page, company)).toContainText(role);
    await expect(row(page, company)).toContainText('Open');
    evidence['E2E-04-create'] = 'PASS';

    // ---------------------------------------------------------------- E2E-04 duplicates + dirty guard
    await page.keyboard.press('q'); // global quick add opens the real form
    await expect(createDialog).toBeVisible();
    await page.locator('#app-company').fill(company);
    await page.locator('#app-role').fill(role);
    await expect(createDialog.getByText('Probable duplicate: Same company and role title')).toBeVisible({ timeout: 8000 });
    await page.locator('#app-job-url').fill(jobUrl);
    await expect(createDialog.getByTestId('duplicate-warning-strong')).toBeVisible({ timeout: 8000 });
    await expect(createDialog.getByRole('button', { name: 'Save anyway' })).toBeVisible();
    await shot(page, 'applications-duplicate-strong');
    // AC-CREATE-02: leaving with unsaved input asks first
    await createDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(createDialog.getByTestId('unsaved-changes')).toBeVisible();
    await createDialog.getByRole('button', { name: 'Keep editing' }).click();
    await expect(createDialog.getByTestId('unsaved-changes')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(createDialog.getByTestId('unsaved-changes')).toBeVisible();
    await createDialog.getByRole('button', { name: 'Discard changes' }).click();
    await expect(createDialog).toBeHidden();
    // AC-DUP-04: a failed check is reported honestly, never as "no duplicate"
    await page.route('**/rest/v1/rpc/rpc_check_application_duplicate', (r) => r.abort());
    await page.getByTestId('new-application-btn').click();
    await page.locator('#app-company').fill('Anything Corp');
    await expect(createDialog.getByText("Couldn't check for duplicates")).toBeVisible({ timeout: 8000 });
    await page.unroute('**/rest/v1/rpc/rpc_check_application_duplicate');
    await createDialog.getByRole('button', { name: 'Cancel' }).click();
    await createDialog.getByRole('button', { name: 'Discard changes' }).click();
    evidence['E2E-04-duplicates'] = { probable: 'shown', strong: 'shown with Save anyway', check_failure: 'honest warning', dirty_guard: 'PASS' };

    // Second record via the create form (for sorting / bulk / rail)
    await page.getByTestId('new-application-btn').click();
    await page.locator('#app-company').fill(`Acme Rockets ${run}`);
    await page.locator('#app-role').fill('Frontend Engineer');
    await page.locator('#app-stage-select').selectOption('SAVED');
    await page.getByRole('button', { name: 'Create Application' }).click();
    await expect(row(page, `Acme Rockets ${run}`)).toBeVisible();

    // ---------------------------------------------------------------- E2E-02 search, filter, sort
    const search = page.getByRole('textbox', { name: 'Search applications' });
    await search.fill('Starlight');
    await expect(row(page, company)).toBeVisible();
    await expect(row(page, `Acme Rockets ${run}`)).toBeHidden();
    await search.fill('NonExistentCorp, Inc (x)');
    await expect(page.getByText('No matching applications found')).toBeVisible();
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(row(page, company)).toBeVisible();
    await page.getByRole('group', { name: 'Filter by stage' }).getByRole('button', { name: /^Saved/ }).click();
    await expect(row(page, `Acme Rockets ${run}`)).toBeVisible();
    await expect(row(page, company)).toBeHidden();
    await page.getByRole('group', { name: 'Filter by stage' }).getByRole('button', { name: /^All Stages/ }).click();
    await page.getByRole('button', { name: 'Company · Role' }).click();
    await expect(page.getByRole('columnheader', { name: 'Company · Role' })).toHaveAttribute('aria-sort', 'ascending');
    await expect(page.getByTestId('application-row').first()).toContainText('Acme Rockets');
    await expect(page.getByLabel('Filter by aging')).toBeVisible();
    evidence['E2E-02-search-filter-sort'] = 'PASS';
    // AC-GRID-01: dense rows (44px + 1px border)
    const rowHeights = await page.getByTestId('application-row').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    expect(Math.max(...rowHeights)).toBeLessThanOrEqual(45);
    evidence['E2E-01-dense-rows'] = { row_heights_px: rowHeights };

    // ---------------------------------------------------------------- E2E-03 bulk selection
    await row(page, company).getByRole('checkbox').check();
    await expect(page.getByText('1 application selected')).toBeVisible();
    const bulk = page.getByRole('region', { name: 'Bulk actions toolbar' });
    await expect(bulk.getByRole('button', { name: 'Move Stage' })).toBeVisible();
    await expect(bulk.getByRole('button', { name: 'Mark Ghosted' })).toBeVisible();
    await expect(bulk.getByRole('button', { name: 'Archive' })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Select all applications on this page' }).check();
    await expect(page.getByText('2 applications selected')).toBeVisible();
    await shot(page, 'applications-bulk-selection');
    await bulk.getByRole('button', { name: 'Clear selection' }).click();
    await expect(bulk).toBeHidden();
    evidence['E2E-03-bulk'] = 'PASS';

    // ---------------------------------------------------------------- E2E-05 drawer + timeline
    await row(page, company).getByText(role).click();
    const drawer = page.getByRole('dialog', { name: `${role} · ${company}` });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('Application created')).toBeVisible();
    await expect(drawer.getByText('Job posting snapshot captured')).toBeVisible();
    await expect(drawer.getByText('by You').first()).toBeVisible();
    await shot(page, 'applications-detail-drawer');
    a11y.push(await audit(page, 'detail-drawer'));

    await drawer.getByRole('button', { name: 'Move Stage' }).click();
    const stageDialog = page.getByRole('dialog', { name: 'Move Stage' });
    await expect(stageDialog).toBeVisible();
    await stageDialog.locator('[data-stage="INTERVIEW"]').click();
    await stageDialog.locator('#stage-move-notes').fill('Passed initial phone screening.');
    await shot(page, 'applications-stage-modal');
    await stageDialog.getByRole('button', { name: 'Move to Interview' }).click();
    await expect(stageDialog).toBeHidden();
    await expect(drawer.getByText('Stage: Applied → Interview')).toBeVisible(); // drawer is live, not stale
    await expect(drawer.getByText('Passed initial phone screening.')).toBeVisible();

    await drawer.getByRole('button', { name: 'Keep Active' }).click();
    await expect(drawer.getByText('Reviewed application (Keep Active)')).toBeVisible();

    await drawer.getByRole('button', { name: 'Record Outcome' }).click();
    const outcomeDialog = page.getByRole('dialog', { name: 'Close Application: Record Outcome' });
    await expect(outcomeDialog).toBeVisible();
    await outcomeDialog.locator('[data-outcome="WITHDRAWN"]').click();
    await outcomeDialog.locator('#closure-reason-select').selectOption('OFFER_DECLINED');
    await shot(page, 'applications-outcome-modal');
    await outcomeDialog.getByRole('button', { name: 'Confirm Outcome' }).click();
    await expect(outcomeDialog).toBeHidden();
    await expect(drawer.getByText('Closed: Withdrawn')).toBeVisible();
    await expect(drawer.getByText('Reason: Offer declined')).toBeVisible();
    await drawer.getByRole('button', { name: 'Close drawer' }).click();
    await expect(drawer).toBeHidden();
    await expect(row(page, company)).toContainText('Withdrawn'); // state
    await expect(row(page, company)).toContainText('Interview'); // stage kept
    evidence['E2E-05-drawer-timeline'] = { live_refresh: 'PASS', events: ['CREATED', 'CAPTURED', 'STAGE_CHANGED', 'KEEP_ACTIVE', 'OUTCOME_CHANGED'], stage_kept_on_close: true };

    // ---------------------------------------------------------------- keyboard (AC-GRID-06)
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('j');
    await page.keyboard.press('k');
    await expect(page.locator('tr.table-row-active')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.keyboard.press('m');
    await expect(page.getByRole('dialog', { name: 'Move Stage' })).toBeVisible();
    await page.keyboard.press('j'); // shortcuts are inert while a dialog is open
    await page.getByRole('dialog', { name: 'Move Stage' }).getByRole('button', { name: 'Cancel' }).click();
    evidence['E2E-keyboard'] = 'PASS';

    // ---------------------------------------------------------------- archive with undo, archived view, restore
    await row(page, `Acme Rockets ${run}`).getByRole('button', { name: `Archive Frontend Engineer at Acme Rockets ${run}` }).click();
    await expect(row(page, `Acme Rockets ${run}`)).toBeHidden();
    await page.getByRole('status').filter({ hasText: 'Application archived' }).getByRole('button', { name: 'Undo' }).click();
    await expect(row(page, `Acme Rockets ${run}`)).toBeVisible();
    await row(page, `Acme Rockets ${run}`).getByRole('button', { name: `Archive Frontend Engineer at Acme Rockets ${run}` }).click();
    await expect(row(page, `Acme Rockets ${run}`)).toBeHidden();
    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(row(page, `Acme Rockets ${run}`)).toContainText('Archived');
    await shot(page, 'applications-archived-view');
    await row(page, `Acme Rockets ${run}`).getByRole('button', { name: `Restore Frontend Engineer at Acme Rockets ${run}` }).click();
    await expect(row(page, `Acme Rockets ${run}`)).toBeHidden();
    await page.getByRole('button', { name: 'Archived Only' }).click();
    await expect(row(page, `Acme Rockets ${run}`)).toBeVisible();
    evidence['E2E-archive-restore'] = { undo_toast: 'PASS', archived_view: 'PASS', restore: 'PASS' };

    // ---------------------------------------------------------------- light / dark
    await shot(page, 'applications-table-light');
    a11y.push(await audit(page, 'table-light'));
    await page.getByRole('radio', { name: 'Dark mode' }).first().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await settle(page); // theme colours animate (120–200ms); audit the final state, not mid-transition
    await shot(page, 'applications-table-dark');
    a11y.push(await audit(page, 'table-dark'));
    await page.getByRole('radio', { name: 'Light mode' }).first().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await settle(page);

    // ---------------------------------------------------------------- E2E-06 wide preview rail
    await page.setViewportSize({ width: 1720, height: 1000 });
    const rail = page.locator('aside[aria-label="Application quick preview"]');
    await expect(rail).toBeVisible(); // defaults open at >=1680px
    await row(page, company).getByText(role).click();
    await expect(rail).toContainText(company); // row click previews in place (no drawer)
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await shot(page, 'applications-wide-preview');
    a11y.push(await audit(page, 'wide-preview'));
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('p');
    await expect(rail).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('jobquest_preview_rail_open'))).toBe('false');
    await page.reload();
    await expect(page.getByTestId('new-application-btn')).toBeVisible();
    await expect(rail).toBeHidden(); // preference persisted across reload
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(rail).toBeVisible();
    await rail.getByRole('button', { name: 'Close preview rail' }).click();
    await expect(rail).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('jobquest_preview_rail_open'))).toBe('false');
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    evidence['E2E-06-preview-rail'] = { default_open: true, p_toggle: true, persisted_across_reload: true, close_button_persists: true };

    // ---------------------------------------------------------------- E2E-07 responsive
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.locator('aside[aria-label="Application quick preview"]')).toBeHidden();
    await shot(page, 'applications-desktop-1024');
    await page.setViewportSize({ width: 768, height: 1024 });
    await shot(page, 'applications-tablet-768');
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByTestId('application-card').filter({ hasText: company })).toBeVisible();
    await shot(page, 'applications-mobile');
    a11y.push(await audit(page, 'mobile-cards'));
    await page.getByRole('button', { name: `Open ${role} at ${company}` }).click();
    await expect(page.getByRole('dialog', { name: `${role} · ${company}` })).toBeVisible();
    await shot(page, 'applications-mobile-detail');
    await page.keyboard.press('Escape');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    evidence['E2E-07-responsive'] = { mobile_cards: 'PASS', mobile_detail_sheet: 'PASS', mobile_horizontal_overflow_px: overflow };

    // ---------------------------------------------------------------- accessibility summary
    const blocking = (a11y as { blocking: number }[]).reduce((n, a) => n + a.blocking, 0);
    evidence.a11y = a11y;
    evidence.status = blocking === 0 && overflow <= 0 ? 'PASS' : 'FAIL';
    writeFileSync(`${evidenceDir}/e2e-${target}-${run}.json`, JSON.stringify(evidence, null, 2));
    expect.soft(overflow).toBeLessThanOrEqual(0);
    expect(blocking, JSON.stringify(a11y, null, 2)).toBe(0);
  });
});
