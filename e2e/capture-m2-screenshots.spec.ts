import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('migration-upgrade/m2/screenshots');
mkdirSync(outDir, { recursive: true });

test.describe('M2 Visual Regression Baseline Captures', () => {
  test('Capture M2 visual baselines', async ({ page }) => {
    // 1. Desktop Light Shell (/applications)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/design-system');
    await page.waitForLoadState('networkidle');

    // Force light mode
    await page.getByRole('radio', { name: 'Light mode' }).first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/desktop-light.png`, fullPage: false });

    // 2. Desktop Dark Shell
    await page.getByRole('radio', { name: 'Dark mode' }).first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/desktop-dark.png`, fullPage: false });

    // Switch back to light for remaining captures
    await page.getByRole('radio', { name: 'Light mode' }).first().click();
    await page.waitForTimeout(300);

    // 3. Wide Desktop Shell (1680 x 1050)
    await page.setViewportSize({ width: 1680, height: 1050 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/wide-desktop.png`, fullPage: false });

    // 4. Tablet Shell (768 x 1024)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/tablet-rail.png`, fullPage: false });

    // 5. Mobile Shell (375 x 667)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/mobile-shell.png`, fullPage: false });

    // 6. Component Showcase (Desktop 1280 x 800)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole('tab', { name: 'Buttons & Actions' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${outDir}/component-showcase.png`, fullPage: false });

    // 7. Table Foundation Tab
    await page.getByRole('tab', { name: 'Table Primitives' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${outDir}/table-foundation.png`, fullPage: false });

    // 8. Dialog Modal
    await page.getByRole('tab', { name: 'Dialogs & Drawers' }).click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Open Modal Dialog' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/dialog-modal.png`, fullPage: false });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // 9. Drawer / Sheet
    await page.getByRole('button', { name: 'Open Slide-in Drawer' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/drawer-sheet.png`, fullPage: false });
    await page.getByRole('button', { name: 'Close drawer' }).click();
    await page.waitForTimeout(200);

    // 10. Auth View
    await page.goto('/');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/auth-view.png`, fullPage: false });
  });
});
