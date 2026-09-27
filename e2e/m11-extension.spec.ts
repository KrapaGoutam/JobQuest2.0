import { expect, test, chromium, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const extensionPath = resolve('apps/extension/dist/jobquest-capture-dev');
const fixtureHtml = readFileSync(resolve('apps/extension/fixtures/jsonld_job.html'), 'utf8');
const evidenceDir = resolve('migration-upgrade/m11/evidence');
const shotsDir = resolve('migration-upgrade/m11/screenshots');
mkdirSync(evidenceDir, { recursive: true });
mkdirSync(shotsDir, { recursive: true });

declare const chrome: {
  storage: {
    local: {
      get(keys: string[]): Promise<Record<string, unknown>>;
      set(values: Record<string, unknown>): Promise<void>;
    };
  };
  tabs: {
    query(query: { active: boolean; currentWindow: boolean }): Promise<Array<{ id?: number }>>;
  };
  scripting: {
    executeScript(input: { target: { tabId: number }; files: string[] }): Promise<Array<{ result?: unknown }>>;
  };
};

type AuditResult = {
  context: string;
  total: number;
  critical: number;
  serious: number;
  blocking: number;
  violations: Array<{
    id: string;
    impact: string | null | undefined;
    description: string;
    nodes: Array<{ target: string[]; html: string; failureSummary: string | undefined }>;
  }>;
};

async function audit(page: Page, context: string): Promise<AuditResult> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const critical = result.violations.filter((violation) => violation.impact === 'critical').length;
  const serious = result.violations.filter((violation) => violation.impact === 'serious').length;
  return {
    context,
    total: result.violations.length,
    critical,
    serious,
    blocking: critical + serious,
    violations: result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      nodes: violation.nodes.map((node) => ({
        target: node.target.map(String),
        html: node.html,
        failureSummary: node.failureSummary,
      })),
    })),
  };
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: resolve(shotsDir, `${name}.png`), fullPage: true });
}

test.describe('Milestone 11 · unpacked MV3 extension', () => {
  test.setTimeout(300_000);

  test('setup, extraction, capture, duplicate, deep link, theme, revocation, a11y, and timings', async ({ browserName }, testInfo) => {
    expect(browserName).toBe('chromium');
    const baseURL = String(testInfo.project.use.baseURL ?? 'http://localhost:5173').replace(/\/$/, '');
    const run = randomBytes(4).toString('hex');
    const tokenName = `M11 Chromium ${run}`;
    const jobUrl = `https://jobs.m11.test/${run}/staff-software-engineer`;
    const profilePath = testInfo.outputPath('chromium-profile');
    const evidence: Record<string, unknown> = {
      run,
      started_at: new Date().toISOString(),
      browser: 'playwright chromium persistent context',
      package: 'jobquest-capture-dev',
    };
    const a11y: AuditResult[] = [];

    const context = await chromium.launchPersistentContext(profilePath, {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    try {
      let [worker] = context.serviceWorkers();
      if (!worker) worker = await context.waitForEvent('serviceworker');
      const extensionId = new URL(worker.url()).host;
      const extensionOrigin = `chrome-extension://${extensionId}`;
      evidence.extension_loaded = true;
      evidence.manifest_version = 3;

      // X1: fresh install starts unconfigured and remains keyboard-operable.
      const setupPopup = await context.newPage();
      await setupPopup.goto(`${extensionOrigin}/popup.html`);
      await expect(setupPopup.locator('body')).toHaveAttribute('data-state', 'X1');
      await setupPopup.keyboard.press('Tab');
      expect(await setupPopup.evaluate(() => document.activeElement?.tagName)).toBe('BUTTON');
      evidence.keyboard_focus_verified = true;
      a11y.push(await audit(setupPopup, 'popup-unconfigured'));
      await shot(setupPopup, 'm11-popup-unconfigured');
      await setupPopup.close();

      // Register through the real web UI and generate a one-time extension token.
      const webPage = await context.newPage();
      await webPage.setViewportSize({ width: 1440, height: 900 });
      await webPage.goto(baseURL);
      const registration = webPage.getByRole('form', { name: 'Register' });
      await registration.getByLabel('Username (required)').fill(`m11_ext_${run}`);
      await registration.getByLabel('Password (required)').fill(`M11-Extension-${run}-P@ss!`);
      await registration.getByRole('button', { name: 'Create account' }).click();
      await expect(webPage.getByTestId('recovery-codes').locator('li')).toHaveCount(10);
      await webPage.getByRole('button', { name: 'I saved them' }).click();
      await expect(webPage.getByTestId('new-application-btn')).toBeVisible();
      await webPage.evaluate(() => { window.location.hash = '#/settings/extension'; });
      await expect(webPage.getByRole('heading', { name: 'Browser extension' })).toBeVisible();

      await webPage.getByRole('button', { name: 'Connect a browser' }).first().click();
      const createDialog = webPage.getByRole('dialog', { name: 'Connect a browser' });
      await createDialog.locator('#extension-token-name').fill(tokenName);
      await createDialog.locator('#extension-token-expiry').selectOption('30');
      await createDialog.getByRole('button', { name: 'Create token' }).click();
      const revealDialog = webPage.getByRole('dialog', { name: 'Copy your token' });
      await expect(revealDialog).toBeVisible();
      const rawToken = (await revealDialog.locator('.extension-secret code').textContent())?.trim() ?? '';
      expect(rawToken).toMatch(/^jqx_dev_[A-Za-z0-9]{43}$/);
      evidence.token_created_through_settings = true;
      evidence.token_raw_revealed_once = true;
      await revealDialog.getByRole('button', { name: 'Done, I copied it' }).click();
      await expect(webPage.locator('body')).not.toContainText(rawToken);
      await expect(webPage.getByRole('row', { name: new RegExp(tokenName) })).toContainText('active');

      // Configure via the actual extension options page and verify local persistence.
      const optionsPage = await context.newPage();
      await optionsPage.goto(`${extensionOrigin}/options.html`);
      await expect(optionsPage.locator('#instance-url')).toHaveValue(baseURL);
      await optionsPage.locator('#instance-url').fill(baseURL);
      await optionsPage.locator('#api-token').fill(rawToken);
      await optionsPage.locator('#theme').selectOption('dark');
      try {
        await optionsPage.getByRole('button', { name: 'Save Settings' }).click();
        await expect(optionsPage.locator('#status-box')).toContainText('Connected. JobQuest accepted this token.');
      } finally {
        // Prevent Playwright error context snapshots from serializing a live token value.
        await optionsPage.locator('#api-token').evaluate((element: HTMLInputElement) => { element.value = ''; });
      }
      await expect(optionsPage.locator('html')).toHaveAttribute('data-theme', 'dark');
      a11y.push(await audit(optionsPage, 'extension-options-connected-dark'));
      await shot(optionsPage, 'm11-options-connected-dark');
      const storedSettings = await optionsPage.evaluate(async () => {
        const stored = await chrome.storage.local.get(['instanceUrl', 'apiToken', 'theme']);
        return {
          instanceUrl: stored.instanceUrl,
          tokenShapeValid: typeof stored.apiToken === 'string' && /^jqx_(?:dev|live)_[A-Za-z0-9]{43}$/.test(stored.apiToken),
          theme: stored.theme,
        };
      });
      expect(storedSettings).toEqual({ instanceUrl: baseURL, tokenShapeValid: true, theme: 'dark' });
      evidence.local_storage_persisted = true;

      // Route a real job page, then ask the MV3 service worker to inject the shipped content script.
      await context.route(jobUrl, async (route) => {
        await route.fulfill({ status: 200, contentType: 'text/html', body: fixtureHtml });
      });
      const fixturePage = await context.newPage();
      await fixturePage.goto(jobUrl);
      await fixturePage.bringToFront();
      const extractionStarted = Date.now();
      const extracted = await worker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error('No active job tab');
        const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        return result[0]?.result;
      });
      evidence.extraction_ms = Date.now() - extractionStarted;
      expect(extracted).toMatchObject({ company: 'Stripe', jobTitle: 'Staff Software Engineer' });
      await optionsPage.evaluate(async (pendingCapture) => {
        await chrome.storage.local.set({ pendingCapture });
      }, extracted);
      evidence.live_content_script_extraction = true;

      // X5: dark ready state with workflow loaded from the API and a NONE duplicate response.
      const readyStarted = Date.now();
      const popup = await context.newPage();
      await popup.goto(`${extensionOrigin}/popup.html`);
      await expect(popup.locator('body')).toHaveAttribute('data-state', 'X5');
      await expect(popup.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(popup.locator('#input-stage option')).not.toHaveCount(0);
      await expect(popup.locator('#input-company')).toHaveValue('Stripe');
      await expect(popup.locator('#input-title')).toHaveValue('Staff Software Engineer');
      evidence.popup_ready_ms = Date.now() - readyStarted;
      evidence.workflow_loaded = true;
      const duplicateTiming = await optionsPage.evaluate(async () => {
        const settings = await chrome.storage.local.get(['instanceUrl', 'apiToken']);
        if (typeof settings.instanceUrl !== 'string' || typeof settings.apiToken !== 'string') {
          throw new Error('Extension settings are unavailable');
        }
        const started = performance.now();
        const response = await fetch(`${settings.instanceUrl}/api/ext/v1/duplicates/check`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${settings.apiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company: 'Stripe',
            job_title: 'Staff Software Engineer',
            job_url: location.href,
            source: 'JSON-LD',
          }),
        });
        const result = await response.json() as { match_type?: string };
        return { elapsed: performance.now() - started, matchType: result.match_type };
      });
      evidence.duplicate_api_ms = Math.round(duplicateTiming.elapsed);
      expect(duplicateTiming.matchType).toBe('NONE');
      a11y.push(await audit(popup, 'popup-ready-dark'));
      await shot(popup, 'm11-popup-ready-dark');

      const captureStarted = Date.now();
      await popup.getByRole('button', { name: 'Save to JobQuest' }).click();
      await expect(popup.locator('body')).toHaveAttribute('data-state', 'X8');
      evidence.capture_api_ms = Date.now() - captureStarted;
      evidence.capture_succeeded = true;
      a11y.push(await audit(popup, 'popup-capture-success'));
      await shot(popup, 'm11-popup-capture-success');

      // The API-owned deep link opens the captured record in the authenticated web app.
      const deepLinkPromise = context.waitForEvent('page');
      await popup.getByRole('button', { name: 'Open in JobQuest' }).click();
      const deepLinkPage = await deepLinkPromise;
      await deepLinkPage.waitForLoadState('domcontentloaded');
      await expect(deepLinkPage).toHaveURL(new RegExp(`${baseURL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/w/[^/]+/applications/[^/]+`));
      await expect(deepLinkPage.getByRole('dialog', { name: /Staff Software Engineer.*Stripe/ })).toBeVisible();
      evidence.deep_link_verified = true;
      await deepLinkPage.close();
      await popup.close();

      // Reopening with the same extracted identity produces the canonical exact duplicate state.
      await optionsPage.evaluate(async (pendingCapture) => {
        await chrome.storage.local.set({ pendingCapture });
      }, extracted);
      const duplicatePopup = await context.newPage();
      const duplicateStarted = Date.now();
      await duplicatePopup.goto(`${extensionOrigin}/popup.html`);
      await expect(duplicatePopup.locator('body')).toHaveAttribute('data-state', 'X9');
      evidence.duplicate_popup_ms = Date.now() - duplicateStarted;
      await expect(duplicatePopup.locator('#dup-heading')).toContainText('Strong duplicate');
      await expect(duplicatePopup.getByRole('button', { name: 'Open Existing' })).toBeVisible();
      a11y.push(await audit(duplicatePopup, 'popup-exact-duplicate-dark'));
      await shot(duplicatePopup, 'm11-popup-exact-duplicate-dark');
      await duplicatePopup.close();

      // Revoke through Settings, then prove the persisted token is rejected as X2.
      await webPage.bringToFront();
      const tokenRow = webPage.getByRole('row', { name: new RegExp(tokenName) });
      await tokenRow.getByRole('button', { name: 'Revoke' }).click();
      const revokeDialog = webPage.getByRole('dialog', { name: new RegExp(`Revoke.*${tokenName}`) });
      await revokeDialog.getByRole('button', { name: 'Revoke token' }).click();
      await expect(tokenRow).toContainText('revoked');

      const revokedPopup = await context.newPage();
      await revokedPopup.goto(`${extensionOrigin}/popup.html`);
      await expect(revokedPopup.locator('body')).toHaveAttribute('data-state', 'X2');
      await expect(revokedPopup.getByRole('heading', { name: 'Connection expired or revoked' })).toBeVisible();
      evidence.revocation_enforced = true;
      a11y.push(await audit(revokedPopup, 'popup-revoked-dark'));
      await shot(revokedPopup, 'm11-popup-revoked-dark');

      const blocking = a11y.reduce((sum, result) => sum + result.blocking, 0);
      evidence.a11y_contexts = a11y.length;
      evidence.a11y_critical = a11y.reduce((sum, result) => sum + result.critical, 0);
      evidence.a11y_serious = a11y.reduce((sum, result) => sum + result.serious, 0);
      evidence.a11y_blocking = blocking;
      evidence.completed_at = new Date().toISOString();
      evidence.status = blocking === 0 ? 'PASS' : 'FAIL';
      writeFileSync(resolve(evidenceDir, `browser-local-${run}.json`), `${JSON.stringify({ evidence, a11y }, null, 2)}\n`, 'utf8');
      expect(blocking, JSON.stringify(a11y, null, 2)).toBe(0);
    } finally {
      await context.close();
      rmSync(profilePath, { recursive: true, force: true });
    }
  });
});
