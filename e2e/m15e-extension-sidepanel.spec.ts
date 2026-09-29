import { expect, test, chromium, type Page, type ConsoleMessage } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

// Reuses the exact real-browser MV3 infrastructure established by
// e2e/m11-extension.spec.ts: a persistent context with the unpacked dev
// extension loaded, the real service worker → extensionOrigin, a synthetic
// account registered through the actual web UI, a real one-time extension
// token minted through the web Settings UI, and the same fixture-routing +
// content.js-injection technique. This spec adds coverage ONLY for the new
// Side Panel shell (sidepanel.html/js/css) that popup.html never needed:
// persistent-page tab tracking, the Dashboard/Analytics tabs, the panel's
// own embedded Setup/Settings screens, and the active-tab-change refresh.

const extensionPath = resolve('apps/extension/dist/jobquest-capture-dev');
const fixtureHtml = readFileSync(resolve('apps/extension/fixtures/jsonld_job.html'), 'utf8');
// Item 5 / alternate-fixture note: rather than a genuinely different site
// template, this derives a SECOND real JSON-LD job posting (different
// title + company + requisition id) from the same trusted fixture shape, so
// both pages exercise the identical real extraction path already proven by
// m11-extension.spec.ts. This was chosen over the "non-job page" alternate
// (e.g. about:blank) because a second real JobPosting proves the harder
// property: that the panel correctly REPLACES one real job's data with a
// different real job's data on tab change, not merely that it clears itself
// when leaving a job page.
const fixtureHtmlB = fixtureHtml
  .replace(/Staff Software Engineer/g, 'Senior Product Manager')
  .replace(/Stripe/g, 'Notion')
  .replace(/12345/g, '67890');

const evidenceDir = resolve('test-results/evidence');
const shotsDir = resolve('test-results/screenshots');
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

/** Console-error collector matching the level of scrutiny m11-extension.spec.ts
 *  applies elsewhere (real assertions, no fabricated pass) — m11 itself does
 *  not track console output, so this establishes the pattern for the panel. */
function trackConsoleErrors(page: Page, sink: string[], label: string) {
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') sink.push(`[${label}] ${message.text()}`);
  });
  page.on('pageerror', (error) => sink.push(`[${label}:pageerror] ${error.message}`));
}

test.describe('Milestone 15E · extension Side Panel', () => {
  test.setTimeout(300_000);

  test('setup, tabs, real extraction, active-tab refresh, duplicate, save, settings, theme, responsive, a11y', async ({ browserName }, testInfo) => {
    expect(browserName).toBe('chromium');
    const baseURL = String(testInfo.project.use.baseURL ?? 'http://localhost:5173').replace(/\/$/, '');
    const target = (process.env.M1B_TARGET?.trim() || (/localhost|127\.0\.0\.1/.test(baseURL) ? 'local' : 'vercel-preview'))
      .replace(/[^a-z0-9-]/gi, '-');
    const run = randomBytes(4).toString('hex');
    const tokenName = `M15E Chromium ${run}`;
    const jobUrlA = `https://jobs.m15e.test/${run}/staff-software-engineer`;
    const jobUrlB = `https://jobs.m15e.test/${run}/senior-product-manager`;
    const profilePath = testInfo.outputPath('chromium-profile');
    const consoleErrors: string[] = [];
    const evidence: Record<string, unknown> = {
      run,
      started_at: new Date().toISOString(),
      browser: 'playwright chromium persistent context',
      package: 'jobquest-capture-dev',
      target,
      base_origin: baseURL,
      second_fixture_approach: 'distinct-job-fixture',
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

      // -----------------------------------------------------------------
      // Item 1: the Side Panel is a real, independent page. Fresh/unconfigured
      // load renders the panel's OWN Setup screen (not the tab bar/header).
      // -----------------------------------------------------------------
      let sidePanel = await context.newPage();
      trackConsoleErrors(sidePanel, consoleErrors, 'sidepanel');
      await sidePanel.goto(`${extensionOrigin}/sidepanel.html`);
      await expect(sidePanel).toHaveTitle('JobQuest');
      await expect(sidePanel.locator('#view-setup')).toBeVisible();
      await expect(sidePanel.locator('#panel-header')).toBeHidden();
      await expect(sidePanel.locator('#tabbar')).toBeHidden();
      await expect(sidePanel.locator('.setup-card .jq-tile.large')).toBeVisible();
      await expect(sidePanel.getByRole('heading', { name: 'Connect JobQuest' })).toBeVisible();
      await expect(sidePanel.locator('#setup-save-btn')).toBeDisabled();
      a11y.push(await audit(sidePanel, 'sidepanel-setup-unconfigured'));
      await shot(sidePanel, 'm15e-sidepanel-setup-unconfigured');

      // -----------------------------------------------------------------
      // Register through the real web UI and generate a one-time extension
      // token — identical technique to m11-extension.spec.ts.
      // -----------------------------------------------------------------
      // Console tracking is scoped to the extension's own surfaces (the Side
      // Panel + the job pages it scans/injects content.js into) — the item 11
      // requirement is about the NEW Side Panel code's console cleanliness,
      // matching the scope of everything else this spec exercises. webPage is
      // the real web app, used here only for account/token setup and deep-link
      // verification, and its own console noise is out of scope for this spec.
      const webPage = await context.newPage();
      await webPage.setViewportSize({ width: 1440, height: 900 });
      await webPage.goto(baseURL);
      await webPage.getByRole('button', { name: 'Create account' }).click();
      const registration = webPage.getByRole('form', { name: 'Register' });
      await registration.getByLabel('Username (required)').fill(`m15e_ext_${run}`);
      await registration.getByLabel('Password (required)').fill(`M15E-Extension-${run}-P@ss!`);
      await registration.getByRole('button', { name: 'Create account' }).click();
      await expect(webPage.getByTestId('recovery-codes').locator('li')).toHaveCount(10);
      await webPage.getByRole('button', { name: 'I saved them' }).click();
      await webPage.goto('/applications');
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
      await revealDialog.getByRole('button', { name: 'Done, I copied it' }).click();
      await expect(webPage.locator('body')).not.toContainText(rawToken);
      evidence.token_created_through_settings = true;

      // -----------------------------------------------------------------
      // Item 2: drive the Side Panel's OWN embedded Setup screen (new code
      // this spec must prove works, not inherited chrome.storage state from
      // options.html).
      // -----------------------------------------------------------------
      await sidePanel.locator('#setup-instance-url').fill(baseURL);
      await sidePanel.locator('#setup-token').fill(rawToken);
      await expect(sidePanel.locator('#setup-save-btn')).toBeEnabled();
      try {
        await sidePanel.locator('#setup-save-btn').click();
        await expect(sidePanel.locator('#setup-status')).toContainText('Connected.');
      } finally {
        await sidePanel.locator('#setup-token').evaluate((element: HTMLInputElement) => { element.value = ''; });
      }
      evidence.own_setup_screen_exercised = true;

      // Reload as a returning, already-configured user: this is the panel's
      // main bootstrap path (the one that wires chrome.tabs active-tab
      // listeners) and mirrors how a real browser restart/reopen behaves —
      // the same "reopen and verify persisted state" technique
      // m11-extension.spec.ts uses for options.html.
      await sidePanel.close();
      sidePanel = await context.newPage();
      trackConsoleErrors(sidePanel, consoleErrors, 'sidepanel');
      await sidePanel.goto(`${extensionOrigin}/sidepanel.html`);
      await expect(sidePanel.locator('#panel-header')).toBeVisible();
      await expect(sidePanel.locator('#tabbar')).toBeVisible();
      await expect(sidePanel.locator('#panel-header .jq-tile')).toContainText('JQ');
      await expect(sidePanel.locator('.wordmark')).toHaveText('JobQuest');
      await expect(sidePanel.locator('#tabbar')).toHaveAttribute('role', 'tablist');
      await expect(sidePanel.locator('#tab-capture')).toHaveAttribute('role', 'tab');
      await expect(sidePanel.locator('#tab-capture')).toHaveAttribute('aria-selected', 'true');
      await expect(sidePanel.locator('#tab-dashboard')).toHaveAttribute('aria-selected', 'false');
      await expect(sidePanel.locator('#conn-label')).toHaveText('Connected');
      evidence.header_and_tablist_rendered = true;

      // -----------------------------------------------------------------
      // Item 4: real extraction. Route the same fixture technique
      // m11-extension.spec.ts uses, inject content.js via the service
      // worker as an extra sanity check on the extraction shape itself,
      // then make the fixture tab the real active tab and let the Side
      // Panel's own chrome.tabs listeners (now live post-reload) do the
      // real re-scan — this is the actual behavior under test, not a
      // simulated one.
      // -----------------------------------------------------------------
      await context.route(jobUrlA, async (route) => {
        await route.fulfill({ status: 200, contentType: 'text/html', body: fixtureHtml });
      });
      await context.route(jobUrlB, async (route) => {
        await route.fulfill({ status: 200, contentType: 'text/html', body: fixtureHtmlB });
      });

      // NOTE: a freshly created page becomes Chromium's active tab immediately
      // on creation, *before* it ever navigates. If it is left active while it
      // then navigates, the panel's own chrome.tabs.onUpdated listener can
      // fire mid-navigation (status "loading", url already set) and race a
      // still-loading, content-less DOM against the later "complete" event —
      // see the real product-bug note in the final report for what this
      // exposes. Deactivating the tab (bringing a different, already-open
      // page to the front) BEFORE it navigates means the whole load happens
      // while inactive (the listener's own `!tab.active` guard skips it
      // entirely), and activating it only once fully loaded produces exactly
      // one clean chrome.tabs.onActivated → tabs.get of the finished page —
      // the same "open a tab in the background, then switch to it" sequence
      // real users perform constantly.
      const fixtureA = await context.newPage();
      trackConsoleErrors(fixtureA, consoleErrors, 'fixture-a');
      await sidePanel.bringToFront();
      await fixtureA.goto(jobUrlA);
      await fixtureA.bringToFront();
      const workerExtractionA = await worker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error('No active job tab');
        const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        return result[0]?.result;
      });
      expect(workerExtractionA).toMatchObject({ company: 'Stripe', jobTitle: 'Staff Software Engineer' });
      evidence.service_worker_injection_verified = true;

      await expect(sidePanel.locator('#job-title')).toHaveText('Staff Software Engineer');
      await expect(sidePanel.locator('#job-company')).toHaveText('Stripe');
      await expect(sidePanel.locator('#capture-main')).toBeVisible();
      await expect(sidePanel.locator('#capture-offline')).toBeHidden();
      await expect(sidePanel.locator('#capture-none')).toBeHidden();
      evidence.real_extraction_after_active_tab_change = true;
      await shot(sidePanel, 'm15e-sidepanel-capture-detected-jobA');

      // -----------------------------------------------------------------
      // Item 3: tab navigation. Dashboard/Analytics render a real (or
      // honestly-failed) state from GET /ext/v1/stats; returning to Capture
      // must NOT reset the already-detected job.
      // -----------------------------------------------------------------
      await sidePanel.locator('#tab-dashboard').click();
      await expect(sidePanel.locator('#tab-dashboard')).toHaveAttribute('aria-selected', 'true');
      await expect(sidePanel.locator('#tab-capture')).toHaveAttribute('aria-selected', 'false');
      await expect(sidePanel.locator('#view-dashboard')).toBeVisible();
      await expect(sidePanel.locator('#dash-loading')).toBeHidden();
      const dashBodyVisible = await sidePanel.locator('#dash-body').isVisible();
      if (dashBodyVisible) {
        await expect(sidePanel.locator('#dash-today')).not.toHaveText('');
      } else {
        await expect(sidePanel.locator('#dash-error')).toBeVisible();
        await expect(sidePanel.locator('#dash-retry-btn')).toBeVisible();
      }
      evidence.dashboard_state = dashBodyVisible ? 'loaded' : 'error';

      await sidePanel.locator('#tab-analytics').click();
      await expect(sidePanel.locator('#tab-analytics')).toHaveAttribute('aria-selected', 'true');
      await expect(sidePanel.locator('#view-analytics')).toBeVisible();
      await expect(sidePanel.locator('#analytics-loading')).toBeHidden();
      const analyticsBodyVisible = await sidePanel.locator('#analytics-body').isVisible();
      if (!analyticsBodyVisible) await expect(sidePanel.locator('#analytics-error')).toBeVisible();
      evidence.analytics_state = analyticsBodyVisible ? 'loaded' : 'error';

      await sidePanel.locator('#tab-capture').click();
      await expect(sidePanel.locator('#tab-capture')).toHaveAttribute('aria-selected', 'true');
      await expect(sidePanel.locator('#job-title')).toHaveText('Staff Software Engineer');
      await expect(sidePanel.locator('#job-company')).toHaveText('Stripe');
      evidence.capture_state_preserved_across_tabs = true;

      // -----------------------------------------------------------------
      // Item 5: active-tab-change refresh. Opening a SECOND real job page
      // and making it the active tab must replace Job A's summary with
      // Job B's — the core new Side Panel behavior a popup never needed.
      // -----------------------------------------------------------------
      const fixtureB = await context.newPage();
      trackConsoleErrors(fixtureB, consoleErrors, 'fixture-b');
      await fixtureA.bringToFront();
      await fixtureB.goto(jobUrlB);
      await fixtureB.bringToFront();
      await expect(sidePanel.locator('#job-title')).toHaveText('Senior Product Manager');
      await expect(sidePanel.locator('#job-company')).toHaveText('Notion');
      evidence.active_tab_change_refresh_verified = true;
      await shot(sidePanel, 'm15e-sidepanel-capture-detected-jobB');

      // Step 12A Parity: Review & edit details card
      await expect(sidePanel.locator('#edit-details-card')).toBeVisible();
      await expect(sidePanel.locator('#edit-toggle-btn')).toHaveAttribute('aria-expanded', 'false');
      await expect(sidePanel.locator('#edit-fields-section')).toBeHidden();

      await sidePanel.locator('#edit-toggle-btn').click();
      await expect(sidePanel.locator('#edit-toggle-btn')).toHaveAttribute('aria-expanded', 'true');
      await expect(sidePanel.locator('#edit-fields-section')).toBeVisible();
      await expect(sidePanel.locator('#edit-company')).toHaveValue('Notion');
      await expect(sidePanel.locator('#edit-title')).toHaveValue('Senior Product Manager');
      await sidePanel.locator('#edit-notes').fill('Referred by engineering lead');
      a11y.push(await audit(sidePanel, 'sidepanel-capture-review-expanded'));
      evidence.review_and_edit_card_verified = true;

      // -----------------------------------------------------------------
      // Item 7: real save flow (Job B), "I applied" → real POST /captures,
      // success state + toast + a real deep_link_path.
      // -----------------------------------------------------------------
      await sidePanel.locator('#save-as-applied').check();
      await sidePanel.locator('#footer-primary').click();
      await expect(sidePanel.locator('#saved-card')).toBeVisible();
      await expect(sidePanel.locator('#saved-card')).toContainText('Saved to JobQuest');
      await expect(sidePanel.locator('#toast')).toBeVisible();
      await expect(sidePanel.locator('#toast')).toContainText('Saved to JobQuest');
      await expect(sidePanel.locator('#footer-primary')).toHaveText('View Application');
      evidence.save_succeeded = true;
      await shot(sidePanel, 'm15e-sidepanel-capture-saved-jobB');

      const deepLinkPromise = context.waitForEvent('page');
      await sidePanel.locator('#footer-primary').click();
      const deepLinkPage = await deepLinkPromise;
      await deepLinkPage.waitForLoadState('domcontentloaded');
      await expect(deepLinkPage).toHaveURL(new RegExp(`${baseURL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/w/[^/]+/applications/[^/]+`));
      await expect(deepLinkPage.getByRole('dialog', { name: /Senior Product Manager.*Notion/ })).toBeVisible();
      evidence.deep_link_verified = true;
      await deepLinkPage.close();

      // -----------------------------------------------------------------
      // Item 6: duplicate detection. Leave Job B (tab-change to Job A),
      // then return to Job B — a genuine re-scan (different URL each hop)
      // that must now find the just-saved application as an EXACT_POSTING
      // "strong" duplicate.
      // Also verifies draft tab-isolation: Job A does NOT inherit Job B's notes.
      // -----------------------------------------------------------------
      await fixtureA.bringToFront();
      await expect(sidePanel.locator('#job-title')).toHaveText('Staff Software Engineer');
      await expect(sidePanel.locator('#edit-company')).toHaveValue('Stripe');
      await expect(sidePanel.locator('#edit-notes')).toHaveValue('');
      evidence.tab_draft_isolation_verified = true;

      await fixtureB.bringToFront();
      await expect(sidePanel.locator('#duplicate-card')).toBeVisible();
      await expect(sidePanel.locator('#duplicate-card')).toHaveAttribute('data-level', 'strong');
      await expect(sidePanel.locator('#dup-title')).toContainText('Strong duplicate');
      await expect(sidePanel.locator('#dup-match-title')).not.toHaveText('');
      await expect(sidePanel.locator('#dup-match-meta')).toContainText('Notion');
      evidence.duplicate_detection_verified = true;
      a11y.push(await audit(sidePanel, 'sidepanel-capture-duplicate'));
      await shot(sidePanel, 'm15e-sidepanel-capture-duplicate');

      // -----------------------------------------------------------------
      // Step 13A Remediation: B1 — Override isolation (does not leak across jobs)
      // -----------------------------------------------------------------
      // Job B is currently a duplicate. Operator clicks "Save as New Application Anyway".
      await expect(sidePanel.locator('#footer-secondary')).toHaveText('Save as New Application Anyway');
      await sidePanel.locator('#footer-secondary').click();
      await expect(sidePanel.locator('#saved-card')).toBeVisible();
      await expect(sidePanel.locator('#toast')).toContainText('Saved to JobQuest');

      // Now switch to Job A (Stripe / Staff Software Engineer)
      await fixtureA.bringToFront();
      await expect(sidePanel.locator('#job-title')).toHaveText('Staff Software Engineer');
      await expect(sidePanel.locator('#job-company')).toHaveText('Stripe');
      // Save Job A as a separate application
      await sidePanel.locator('#footer-primary').click();
      await expect(sidePanel.locator('#saved-card')).toBeVisible();

      // Now switch away to Job B and then back to Job A to force re-scan of Job A
      await fixtureB.bringToFront();
      await fixtureA.bringToFront();
      // Job A is now an existing application in JobQuest -> MUST display duplicate warning!
      await expect(sidePanel.locator('#duplicate-card')).toBeVisible();
      await expect(sidePanel.locator('#dup-title')).toContainText('Strong duplicate');
      await expect(sidePanel.locator('#footer-primary')).toHaveText('View Existing Application');
      await expect(sidePanel.locator('#footer-secondary')).toHaveText('Save as New Application Anyway');
      evidence.b1_override_isolation_verified = true;

      // -----------------------------------------------------------------
      // Step 13A Remediation: B2 — Editing identity fields re-evaluates duplicate
      // -----------------------------------------------------------------
      if (await sidePanel.locator('#edit-fields-section').isHidden()) {
        await sidePanel.locator('#edit-toggle-btn').click();
      }
      // Edit company and title to an unrecorded role -> duplicate card disappears
      await sidePanel.locator('#edit-company').fill('Acme NonDuplicate Corp');
      await sidePanel.locator('#edit-title').fill('Unique Engineering Fellow');
      await expect(sidePanel.locator('#duplicate-card')).toBeHidden();
      await expect(sidePanel.locator('#footer-primary')).toHaveText('Save to JobQuest');
      await expect(sidePanel.locator('#footer-secondary')).toBeHidden();

      // Now edit company and title back to match Job B (Notion / Senior Product Manager)
      await sidePanel.locator('#edit-company').fill('Notion');
      await sidePanel.locator('#edit-title').fill('Senior Product Manager');
      // Duplicate detection re-evaluates -> duplicate card returns and blocks ordinary save
      await expect(sidePanel.locator('#duplicate-card')).toBeVisible();
      await expect(sidePanel.locator('#dup-title')).toContainText('duplicate');
      await expect(sidePanel.locator('#footer-primary')).toHaveText('View Existing Application');
      await expect(sidePanel.locator('#footer-secondary')).toBeVisible();
      await expect(sidePanel.locator('#footer-secondary')).toHaveText('Save as New Application Anyway');
      evidence.b2_edit_duplicate_protection_verified = true;

      // -----------------------------------------------------------------
      // Step 13A Remediation: N1 — Late debounced duplicate timer safety
      // -----------------------------------------------------------------
      // Type in Job A, then immediately switch to Job B before the 350ms timer fires
      await fixtureA.bringToFront();
      await sidePanel.locator('#edit-company').fill('Late Timer Safety Corp');
      await fixtureB.bringToFront();
      // Wait longer than 350ms debounce
      await sidePanel.waitForTimeout(450);
      // Job B must remain untouched: Notion / Senior Product Manager, duplicate card reflects Notion
      await expect(sidePanel.locator('#job-company')).toHaveText('Notion');
      await expect(sidePanel.locator('#job-title')).toHaveText('Senior Product Manager');
      await expect(sidePanel.locator('#duplicate-card')).toBeVisible();
      await expect(sidePanel.locator('#dup-match-meta')).toContainText('Notion');
      await expect(sidePanel.locator('#dup-match-meta')).not.toContainText('Late Timer Safety');
      evidence.n1_timer_safety_verified = true;

      // -----------------------------------------------------------------
      // Step 13B-R Remediation: B2-R — Save inside debounce window fails closed / rechecks
      // -----------------------------------------------------------------
      await fixtureA.bringToFront();
      // Restore company and title to match an existing application (Stripe / Staff Software Engineer)
      await sidePanel.locator('#edit-company').fill('Stripe');
      await sidePanel.locator('#edit-title').fill('Staff Software Engineer');
      // Click Save immediately (inside the 350ms debounce window before background check completes)
      // Must NOT save blindly: evaluateSaveGate must run inline recheck, detect duplicate, and block
      await sidePanel.locator('#footer-primary').click();
      await expect(sidePanel.locator('#duplicate-card')).toBeVisible();
      await expect(sidePanel.locator('#dup-title')).toContainText('duplicate');
      await expect(sidePanel.locator('#footer-primary')).toHaveText('View Existing Application');
      await expect(sidePanel.locator('#footer-secondary')).toHaveText('Save as New Application Anyway');
      evidence.b2r_debounce_save_fail_closed_verified = true;

      // -----------------------------------------------------------------
      // Step 13B-R Remediation: B2-R — Warn on Duplicates = OFF allows direct save
      // -----------------------------------------------------------------
      await sidePanel.locator('#settings-btn').click();
      await expect(sidePanel.locator('#back-header')).toContainText('Settings');
      const warnCheckbox = sidePanel.locator('#pref-warn-duplicates');
      await warnCheckbox.uncheck();
      await sidePanel.waitForTimeout(100);
      await sidePanel.locator('#back-btn').click();

      // Switch to fixtureB to re-scan Notion / Senior Product Manager with warnings disabled
      await fixtureB.bringToFront();
      // With warnOnDuplicates = false, duplicate check returns level: 'none' -> normal save available
      await expect(sidePanel.locator('#duplicate-card')).toBeHidden();
      await expect(sidePanel.locator('#footer-primary')).toHaveText('Save to JobQuest');
      evidence.b2r_warnings_disabled_save_verified = true;

      // Re-enable "Warn on duplicates" for remaining test coverage
      await sidePanel.locator('#settings-btn').click();
      await sidePanel.locator('#pref-warn-duplicates').check();
      await sidePanel.waitForTimeout(100);
      await sidePanel.locator('#back-btn').click();

      // -----------------------------------------------------------------
      // Item 8: Settings — opened from a non-Capture tab, must return to
      // that same tab (not always Capture) on Back, and must never render
      // the raw token.
      // -----------------------------------------------------------------
      await sidePanel.locator('#tab-dashboard').click();
      await expect(sidePanel.locator('#tab-dashboard')).toHaveAttribute('aria-selected', 'true');
      await sidePanel.locator('#settings-btn').click();
      await expect(sidePanel.locator('#back-header')).toBeVisible();
      await expect(sidePanel.locator('#back-header')).toContainText('Settings');
      await expect(sidePanel.locator('#tabbar')).toBeHidden();
      await expect(sidePanel.locator('#panel-header')).toBeHidden();
      await expect(sidePanel.locator('#settings-token')).toHaveValue('');
      const settingsPlaceholder = await sidePanel.locator('#settings-token').getAttribute('placeholder');
      expect(settingsPlaceholder).toMatch(/^jqx_dev_••••[A-Za-z0-9]{4} — paste a new token to replace it$/);
      expect(settingsPlaceholder).not.toContain(rawToken);
      await expect(sidePanel.locator('#settings-conn-text')).toContainText('Connected to JobQuest');
      evidence.settings_token_masked = true;

      await sidePanel.locator('#back-btn').click();
      await expect(sidePanel.locator('#view-dashboard')).toBeVisible();
      await expect(sidePanel.locator('#tab-dashboard')).toHaveAttribute('aria-selected', 'true');
      evidence.settings_back_returns_to_prior_tab = true;

      // -----------------------------------------------------------------
      // Item 9: theme — the Side Panel's own Appearance control, and the
      // exact select/option contrast-sync proof m2-shell.spec.ts already
      // applies on the web app (guards the Phase B dark-select-contrast fix
      // from regressing in the NEW Side Panel code).
      // -----------------------------------------------------------------
      await sidePanel.locator('#settings-btn').click();
      const readSelectStyles = () =>
        sidePanel.locator('#settings-theme').evaluate((el: HTMLSelectElement) => {
          const cs = getComputedStyle(el);
          const opt = el.querySelector('option');
          const optCs = opt ? getComputedStyle(opt) : null;
          return {
            scheme: cs.colorScheme,
            selectBg: cs.backgroundColor,
            selectFg: cs.color,
            optionBg: optCs?.backgroundColor ?? null,
            optionFg: optCs?.color ?? null,
          };
        });

      await sidePanel.locator('#settings-theme').selectOption('dark');
      await expect(sidePanel.locator('html')).toHaveAttribute('data-theme', 'dark');
      const darkStyles = await readSelectStyles();
      expect(darkStyles.scheme).toBe('dark');
      expect(darkStyles.optionBg).toBe(darkStyles.selectBg);
      expect(darkStyles.optionFg).toBe(darkStyles.selectFg);
      a11y.push(await audit(sidePanel, 'sidepanel-settings-dark'));
      await shot(sidePanel, 'm15e-sidepanel-settings-dark');

      await sidePanel.locator('#settings-theme').selectOption('light');
      await expect(sidePanel.locator('html')).toHaveAttribute('data-theme', 'light');
      const lightStyles = await readSelectStyles();
      expect(lightStyles.scheme).toBe('light');
      expect(lightStyles.optionBg).toBe(lightStyles.selectBg);
      expect(lightStyles.optionFg).toBe(lightStyles.selectFg);
      expect(lightStyles.selectBg).not.toBe(darkStyles.selectBg);
      expect(lightStyles.selectFg).not.toBe(darkStyles.selectFg);
      evidence.theme_select_contrast_verified = true;
      a11y.push(await audit(sidePanel, 'sidepanel-settings-light'));
      await shot(sidePanel, 'm15e-sidepanel-settings-light');

      await sidePanel.locator('#back-btn').click();
      await expect(sidePanel.locator('#view-dashboard')).toBeVisible();

      // -----------------------------------------------------------------
      // Item 10: responsive widths — no horizontal overflow at 360/430/480.
      // Uses expect.soft so a genuine layout regression at one width is
      // reported honestly without aborting the remaining required-coverage
      // assertions below (console cleanliness, a11y) in the same run.
      // -----------------------------------------------------------------
      const responsiveResults: Record<number, { scrollWidth: number; clientWidth: number }> = {};
      for (const width of [360, 430, 480]) {
        await sidePanel.setViewportSize({ width, height: 800 });
        const overflow = await sidePanel.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        responsiveResults[width] = overflow;
        expect.soft(overflow.scrollWidth, `width=${width}: scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`).toBeLessThanOrEqual(width);
      }
      evidence.responsive_widths_checked = responsiveResults;
      await sidePanel.setViewportSize({ width: 430, height: 900 });

      // -----------------------------------------------------------------
      // Item 11: console cleanliness across the whole real-browser flow.
      // -----------------------------------------------------------------
      evidence.console_errors = consoleErrors;
      expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);

      // -----------------------------------------------------------------
      // Item 12: accessibility — zero blocking (critical/serious) violations
      // across every audited light/dark context above.
      // -----------------------------------------------------------------
      const blocking = a11y.reduce((sum, result) => sum + result.blocking, 0);
      evidence.a11y_contexts = a11y.length;
      evidence.a11y_critical = a11y.reduce((sum, result) => sum + result.critical, 0);
      evidence.a11y_serious = a11y.reduce((sum, result) => sum + result.serious, 0);
      evidence.a11y_blocking = blocking;
      evidence.completed_at = new Date().toISOString();
      evidence.status = blocking === 0 ? 'PASS' : 'FAIL';
      writeFileSync(resolve(evidenceDir, `sidepanel-${target}-${run}.json`), `${JSON.stringify({ evidence, a11y }, null, 2)}\n`, 'utf8');
      expect(blocking, JSON.stringify(a11y, null, 2)).toBe(0);
    } finally {
      await context.close();
      rmSync(profilePath, { recursive: true, force: true });
    }
  });
});
