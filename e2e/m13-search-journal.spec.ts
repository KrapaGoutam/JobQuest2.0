import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

const shotsDir = resolve('migration-upgrade/m13/screenshots');
const evidenceDir = resolve('migration-upgrade/m13/evidence');
mkdirSync(shotsDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${shotsDir}/${name}.png`, fullPage: false });
const settle = (page: Page) => page.waitForTimeout(600);

async function audit(page: Page, context: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return {
    context,
    total: result.violations.length,
    critical: result.violations.filter((v) => v.impact === 'critical').length,
    serious: result.violations.filter((v) => v.impact === 'serious').length,
    blocking: result.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').length,
    violations: result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.map((n) => ({ html: n.html, failureSummary: n.failureSummary })),
    })),
  };
}

test.describe('Milestone 13 · Global Search, Hardening & Journal Parity E2E', () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    try {
      if (existsSync('.env.local')) {
        const env = readFileSync('.env.local', 'utf8');
        const match = env.match(/^SUPABASE_DB_URL=(.+)$/m);
        if (match?.[1]) {
          const client = new pg.Client({ connectionString: match[1].trim() });
          await client.connect();
          await client.query("delete from public.auth_rate_limits where bucket like '%register%'");
          await client.end();
        }
      }
    } catch {
      // Ignore if DB is unreachable or in non-DB environment
    }
  });

  test('Journal CRUD, Global Search palette, mobile responsiveness, dark mode, and a11y', async ({
    page,
  }) => {
    const run = randomBytes(3).toString('hex');
    const username = `m13_usr_${run}`;
    const password = `M13-Parity-${run}-P@ss!`;

    const evidence: Record<string, unknown> = {
      run,
      started_at: new Date().toISOString(),
      screenshots: [],
    };
    const a11yResults: Awaited<ReturnType<typeof audit>>[] = [];

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await settle(page);

    // 1. Register User
    await page.getByRole('button', { name: 'Create account' }).click();
    const registerForm = page.getByRole('form', { name: 'Register' });
    await registerForm.getByLabel('Username (required)').fill(username);
    await registerForm.getByLabel('Password (required)').fill(password);
    await registerForm.getByRole('button', { name: 'Create account' }).click();

    // Dismiss recovery codes if visible
    const dismissCodes = page.getByRole('button', { name: 'I saved them' });
    await expect(dismissCodes).toBeVisible({ timeout: 10000 });
    await dismissCodes.click();

    await expect(page.getByRole('button', { name: /Switch workspace/i })).toBeVisible({ timeout: 10000 });
    await settle(page);

    // 2. Navigate to Journal (/#/journal)
    await page.goto('/#/journal');
    await settle(page);

    await expect(page.getByRole('heading', { name: 'Job Search Journal' })).toBeVisible({ timeout: 10000 });
    await shot(page, 'm13_01_journal_empty');

    // 3. Create a new Journal Entry
    await page.getByRole('button', { name: 'New Entry' }).click();
    await settle(page);

    const dialog = page.getByRole('dialog', { name: 'New Journal Entry' });
    await expect(dialog).toBeVisible();

    await dialog.getByPlaceholder(/e\.g\. System Design/i).fill(`Quantum Architecture Strategy ${run}`);
    await dialog.locator('textarea').fill(
      'Deep dive notes into distributed consensus protocols, Paxos vs Raft leader election, and resilient state replication patterns across heterogeneous clouds.'
    );
    // Select type STRATEGY
    await dialog.locator('select').first().selectOption('STRATEGY');
    // Toggle pin
    await dialog.locator('#journal-pin-checkbox').check();

    await dialog.getByRole('button', { name: 'Create Entry' }).click();
    await settle(page);

    // Verify entry is visible in the list
    await expect(page.getByRole('heading', { name: `Quantum Architecture Strategy ${run}` })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unpin entry' })).toBeVisible();
    await shot(page, 'm13_02_journal_entry_created');
    a11yResults.push(await audit(page, 'journal_view'));

    // 4. Open Global Search by clicking topbar search button or shortcut
    const topbarSearch = page.getByRole('button', { name: /Search applications, contacts, notes, docs.../i });
    await topbarSearch.click();
    await settle(page);

    const searchDialog = page.getByRole('dialog', { name: /Global Search/i });
    await expect(searchDialog).toBeVisible({ timeout: 5000 });

    const searchInput = page.getByRole('combobox', { name: 'Search JobQuest workspace' });
    await expect(searchInput).toBeFocused();

    // Type search query
    await searchInput.fill('Quantum Architecture');
    await page.waitForTimeout(600); // debounce

    // Verify search result appears
    await expect(searchDialog.getByText(`Quantum Architecture Strategy ${run}`)).toBeVisible({ timeout: 5000 });
    await shot(page, 'm13_03_global_search_modal');
    a11yResults.push(await audit(page, 'global_search_modal'));

    // Switch domain pill to "Notes"
    await searchDialog.getByRole('button', { name: 'Notes' }).click();
    await settle(page);
    await expect(searchDialog.getByText(`Quantum Architecture Strategy ${run}`)).toBeVisible();

    // Close modal with Escape
    await page.keyboard.press('Escape');
    await settle(page);
    await expect(searchDialog).not.toBeVisible();

    // 5. Mobile Viewport (390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page);
    await shot(page, 'm13_04_mobile_journal');
    a11yResults.push(await audit(page, 'mobile_journal'));

    // Open search modal on mobile
    await page.keyboard.press('Control+k');
    await settle(page);
    await expect(page.getByRole('dialog', { name: /Global Search/i })).toBeVisible();
    await shot(page, 'm13_05_mobile_search');
    await page.keyboard.press('Escape');
    await settle(page);

    // 6. Dark Theme Verification
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await settle(page);
    await shot(page, 'm13_06_journal_dark_mode');

    // Open search in dark mode
    await page.keyboard.press('Control+k');
    await settle(page);
    await shot(page, 'm13_07_search_dark_mode');
    await page.keyboard.press('Escape');

    // Compile Evidence
    evidence.completed_at = new Date().toISOString();
    evidence.a11y = a11yResults;
    const blockingA11y = a11yResults.reduce((acc, r) => acc + r.blocking, 0);
    evidence.blocking_a11y_violations = blockingA11y;

    writeFileSync(
      resolve(evidenceDir, 'm13-search-journal-e2e-evidence.json'),
      JSON.stringify(evidence, null, 2),
      'utf8'
    );

    expect(blockingA11y).toBe(0);
  });
});
