import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const ALIAS = 'auth.jobquest.internal';

test('T03 (browser) · the internal identity never reaches the browser', async ({ page, context }) => {
  const run = randomBytes(3).toString('hex');
  const username = `m1_e2e_${run}`;
  const password = `Quiet-harbor-${run}-lantern`;
  const hits: string[] = [];
  const consoleLines: string[] = [];
  let responsesScanned = 0;
  let requestsScanned = 0;

  page.on('console', (m) => consoleLines.push(m.text()));
  page.on('request', (req) => {
    requestsScanned++;
    const blob = `${req.url()} ${JSON.stringify(req.headers())} ${req.postData() ?? ''}`;
    if (blob.includes(ALIAS)) hits.push(`request:${new URL(req.url()).pathname}`);
  });
  page.on('response', async (res) => {
    try {
      const body = await res.text();
      responsesScanned++;
      if (body.includes(ALIAS) || JSON.stringify(res.headers()).includes(ALIAS)) hits.push(`response:${new URL(res.url()).pathname}`);
    } catch { /* redirects / opaque */ }
  });

  await page.goto('/');
  const reg = page.getByRole('form', { name: 'Register' });
  await reg.getByLabel('Username (required)').fill(username);
  await reg.getByLabel('Password (required)').fill(password);
  await reg.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByTestId('recovery-codes').locator('li')).toHaveCount(10);
  await page.getByRole('button', { name: 'I saved them' }).click();

  await page.getByRole('button', { name: 'Load (PostgREST + Node)' }).click();
  await expect(page.getByText('PostgREST: Saved → Preparing')).toBeVisible();
  await page.getByLabel('Company').fill('Corvid Labs');
  await page.getByLabel('Role').fill('Staff Designer');
  await page.getByRole('button', { name: 'Insert (direct PostgREST)' }).click();
  await expect(page.getByText(/Corvid Labs · Staff Designer/)).toBeVisible();
  await page.getByRole('button', { name: 'Refresh now' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  const login = page.getByRole('form', { name: 'Sign in' });
  await login.getByLabel('Username').fill(username);
  await login.getByLabel('Password').fill(password);
  await login.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('region', { name: 'Session' })).toContainText(username);

  // The harness self-check also probes GoTrue /auth/v1/user with the in-memory token.
  await page.getByRole('button', { name: 'Scan for internal identity' }).click();
  const selfCheck = Object.fromEntries(
    await page.locator('[data-leak]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-leak'), e.getAttribute('data-found') === 'true'])),
  );

  const surfaces = await page.evaluate((alias) => ({
    localStorage: JSON.stringify({ ...localStorage }).includes(alias),
    sessionStorage: JSON.stringify({ ...sessionStorage }).includes(alias),
    documentCookie: document.cookie.includes(alias),
    reactState: JSON.stringify((window as unknown as { __jqState?: unknown }).__jqState ?? {}).includes(alias),
    html: document.documentElement.outerHTML.includes(alias),
    localStorageKeys: Object.keys(localStorage),
    sessionStorageKeys: Object.keys(sessionStorage),
  }), ALIAS);
  const allCookies = await context.cookies();
  const cookieLeak = allCookies.some((c) => c.value.includes(ALIAS));
  const consoleLeak = consoleLines.some((l) => l.includes(ALIAS));

  const evidence = {
    status: hits.length === 0 && !Object.values(selfCheck).some(Boolean) && !surfaces.localStorage && !surfaces.sessionStorage && !surfaces.documentCookie && !surfaces.reactState && !surfaces.html && !cookieLeak && !consoleLeak ? 'PASS' : 'FAIL',
    base_url: process.env.M1_BASE_URL ? 'vercel-preview' : 'local',
    requests_scanned: requestsScanned, responses_scanned: responsesScanned,
    network_hits: hits, harness_self_check: selfCheck, surfaces, all_cookies_contain_alias: cookieLeak,
    console_contains_alias: consoleLeak, cookie_names: allCookies.map((c) => `${c.name}${c.httpOnly ? ' (HttpOnly)' : ''}`),
  };
  mkdirSync('migration-upgrade/m1/evidence', { recursive: true });
  writeFileSync(`migration-upgrade/m1/evidence/e2e-leak-${evidence.base_url}-${run}.json`, JSON.stringify(evidence, null, 2));

  expect.soft(hits).toEqual([]);
  expect.soft(selfCheck).toEqual(Object.fromEntries(Object.keys(selfCheck).map((k) => [k, false])));
  expect(evidence.status).toBe('PASS');
});
