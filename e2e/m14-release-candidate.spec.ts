import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

const shotsDir = resolve('migration-upgrade/m14/screenshots');
const evidenceDir = resolve('migration-upgrade/m14/evidence');
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

test.describe('Milestone 14 · Release Candidate & Migration Parity E2E', () => {
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
      // Ignore if DB is unreachable
    }
  });

  test('Release Candidate Smoke, Global Search, Career Journal, Responsive Views, and Accessibility', async ({
    page,
  }) => {
    const run = randomBytes(3).toString('hex');
    const username = `rc_usr_${run}`;
    const password = `RC1-Parity-${run}-P@ss!`;

    const evidence: Record<string, unknown> = {
      run,
      preview_url: process.env.M1_BASE_URL || 'https://jobquest2-33y9un1oa-one-piece-5779.vercel.app',
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
    await expect(dismissCodes).toBeVisible({ timeout: 15000 });
    await dismissCodes.click();

    await expect(page.getByRole('button', { name: /Switch workspace/i })).toBeVisible({ timeout: 15000 });
    await settle(page);

    // 2. Dashboard View & Audit
    await shot(page, '01-rc-dashboard');
    evidence.screenshots = [...(evidence.screenshots as string[]), '01-rc-dashboard.png'];
    a11yResults.push(await audit(page, 'RC Dashboard'));

    // 3. Applications View & Audit
    await page.goto('/#/applications');
    await settle(page);
    await expect(page.getByTestId('new-application-btn')).toBeVisible({ timeout: 10000 });
    await shot(page, '02-rc-applications');
    evidence.screenshots = [...(evidence.screenshots as string[]), '02-rc-applications.png'];
    a11yResults.push(await audit(page, 'RC Applications'));

    // 4. Career Journal View & Entry Creation
    await page.goto('/#/journal');
    await settle(page);
    await expect(page.getByRole('heading', { name: 'Job Search Journal' })).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'New Entry' }).click();
    await settle(page);
    const journalDialog = page.getByRole('dialog', { name: 'New Journal Entry' });
    await expect(journalDialog).toBeVisible();

    await journalDialog.getByPlaceholder(/e\.g\. System Design/i).fill(`Candidate Release Reflection ${run}`);
    await journalDialog.locator('textarea').fill(
      'M14 Release Candidate verified. All migrations tested and reconciled. Zero data loss and zero foreign key orphans.'
    );
    await journalDialog.locator('select').first().selectOption('STRATEGY');
    await journalDialog.locator('#journal-pin-checkbox').check();
    await journalDialog.getByRole('button', { name: 'Create Entry' }).click();
    await settle(page);

    await expect(page.getByRole('heading', { name: `Candidate Release Reflection ${run}` })).toBeVisible();
    await shot(page, '03-rc-journal');
    evidence.screenshots = [...(evidence.screenshots as string[]), '03-rc-journal.png'];
    a11yResults.push(await audit(page, 'RC Career Journal'));

    // 5. Global Search Command Palette (Ctrl+K / trigger)
    const topbarSearch = page.getByRole('button', { name: /Search applications, contacts, notes, docs.../i });
    await topbarSearch.click();
    await settle(page);

    const searchDialog = page.getByRole('dialog', { name: /Global Search/i });
    await expect(searchDialog).toBeVisible({ timeout: 5000 });

    const searchInput = page.getByRole('combobox', { name: 'Search JobQuest workspace' });
    await expect(searchInput).toBeFocused();
    await searchInput.fill('Release');
    await settle(page);

    await shot(page, '04-rc-global-search');
    evidence.screenshots = [...(evidence.screenshots as string[]), '04-rc-global-search.png'];
    a11yResults.push(await audit(page, 'RC Global Search Modal'));

    // Close search dialog with Escape
    await page.keyboard.press('Escape');
    await settle(page);
    await expect(searchDialog).not.toBeVisible();

    // 6. Mobile Viewport Responsiveness
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/journal');
    await settle(page);
    await shot(page, '05-rc-mobile-view');
    evidence.screenshots = [...(evidence.screenshots as string[]), '05-rc-mobile-view.png'];

    // Verify zero blocking accessibility violations
    const totalBlocking = a11yResults.reduce((sum, r) => sum + r.blocking, 0);
    evidence.a11y = a11yResults;
    evidence.completed_at = new Date().toISOString();
    evidence.status = totalBlocking === 0 ? 'PASSED' : 'FAILED_A11Y';

    writeFileSync(
      resolve(evidenceDir, 'rc-preview-e2e.json'),
      JSON.stringify(evidence, null, 2),
      'utf8'
    );

    expect(totalBlocking).toBe(0);
  });
});
