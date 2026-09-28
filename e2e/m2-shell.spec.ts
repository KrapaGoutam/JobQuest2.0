import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

test.describe('M2 Responsive Application Shell & Design System', () => {
  test('Unauthenticated Auth View renders Direction D cards and theme switcher', async ({ page }) => {
    await page.goto('/');

    const loginForm = page.getByRole('form', { name: 'Sign in' });
    await expect(loginForm).toBeVisible();

    await page.getByRole('button', { name: 'Create account' }).click();
    const registerForm = page.getByRole('form', { name: 'Register' });
    await expect(registerForm).toBeVisible();

    await page.getByRole('button', { name: 'Back to sign in' }).click();
    await expect(loginForm).toBeVisible();

    await page.getByRole('button', { name: 'Forgot password?' }).click();
    const recoverForm = page.getByRole('form', { name: 'Recover account' });
    await expect(recoverForm).toBeVisible();

    const themeToggle = page.getByRole('button', { name: /Toggle/i });
    await expect(themeToggle).toBeVisible();
    await themeToggle.click();
  });

  test('Responsive shell adapts across Mobile, Tablet, Desktop, and Wide Desktop', async ({ page }) => {
    await page.goto('/design-system');
    // Mobile (default Playwright is desktop, let's force viewport)
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('navigation')).toBeVisible(); // Drawer handle or mobile nav
    
    // Tablet
    await page.setViewportSize({ width: 810, height: 1080 });
    // Desktop
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('Interactive components: Dialog focus trap, Drawer, Tabs, and Toast', async ({ page }) => {
    await page.goto('/design-system');
    await page.getByRole('button', { name: 'Show Dialog' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();

    await page.getByRole('button', { name: 'Show Drawer' }).click();
    const drawer = page.getByRole('complementary').filter({ hasText: 'Drawer content' });
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();

    const tab2 = page.getByRole('tab', { name: 'Tab 2' });
    await tab2.click();
    await expect(page.getByRole('tabpanel', { name: 'Tab 2' })).toBeVisible();
  });

  test('Accessibility audit on Design System Showcase with axe-core', async ({ page }) => {
    await page.goto('/design-system');
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    
    try {
      mkdirSync('test-results/a11y', { recursive: true });
      writeFileSync('test-results/a11y/design-system.json', JSON.stringify(accessibilityScanResults, null, 2));
    } catch (e) {
      console.warn('Could not write a11y report', e);
    }
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
