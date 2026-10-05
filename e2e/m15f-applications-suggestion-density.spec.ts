import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomBytes } from 'node:crypto';

test.describe('M15-F Applications suggestion density', () => {
  test('keeps quick actions compact, expandable, responsive, and functional', async ({ page }) => {
    const run = randomBytes(3).toString('hex');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Create account' }).click();

    const registration = page.getByRole('form', { name: 'Register' });
    await registration.getByLabel('Username (required)').fill(`m15f_density_${run}`);
    await registration.getByLabel('Password (required)').fill(`Density-${run}-Release-Key!`);
    await registration.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByTestId('recovery-codes')).toBeVisible();
    await page.getByRole('button', { name: 'I saved them' }).click();
    await page.goto('/applications');

    const quickInsert = page.getByRole('form', { name: 'Quick insert application' });
    for (let index = 1; index <= 8; index += 1) {
      await quickInsert.getByLabel('Company').fill(`Density Company ${index} ${run}`);
      await quickInsert.getByLabel('Role').fill(`Density Role ${index}`);
      await quickInsert.getByRole('button', { name: 'Insert (direct PostgREST)' }).click();
      await expect(page.getByTestId('application-row').filter({ hasText: `Density Company ${index} ${run}` })).toBeVisible();
    }

    const suggestions = page.getByRole('region', { name: 'Application quick actions' });
    const toggle = suggestions.getByTestId('application-suggestions-toggle');
    const table = page.getByRole('table', { name: 'Applications' });

    await expect(suggestions.getByTestId('application-suggestion')).toHaveCount(3);
    await expect(toggle).toHaveText('View 5 more');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(table).toBeVisible();
    const collapsedTableTop = (await table.boundingBox())?.y ?? 0;

    await toggle.click();
    await expect(suggestions.getByTestId('application-suggestion')).toHaveCount(8);
    await expect(toggle).toHaveText('Show fewer');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const expandedTableTop = (await table.boundingBox())?.y ?? 0;
    expect(expandedTableTop).toBeGreaterThan(collapsedTableTop);

    const firstSuggestion = suggestions.getByTestId('application-suggestion').first();
    const firstCompany = `Density Company 1 ${run}`;
    await firstSuggestion.getByRole('button', { name: /Interview/ }).click();
    await expect(page.getByTestId('application-row').filter({ hasText: firstCompany })).toContainText('Interview');

    await toggle.click();
    await expect(suggestions.getByTestId('application-suggestion')).toHaveCount(3);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    const a11y = await new AxeBuilder({ page })
      .include('[aria-label="Application quick actions"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(a11y.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')).toEqual([]);

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(suggestions.getByTestId('application-suggestion')).toHaveCount(2);
    await expect(toggle).toHaveText('View 6 more');
    await expect(page.getByRole('list', { name: 'Applications list' })).toBeVisible();
  });
});
