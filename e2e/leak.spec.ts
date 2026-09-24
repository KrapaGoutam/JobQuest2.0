import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

/**
 * M1B B03 (browser half), plus B11/B12 in a real browser. Auth Option B must expose no
 * private identity and no credential material to page script, storage, DOM, console
 * or network bodies. The HttpOnly refresh cookie legitimately appears in Set-Cookie
 * headers only, which page script cannot read.
 */
const FORBIDDEN = [
  { name: 'argon2_verifier', re: /\$argon2id\$/ },
  { name: 'credential_field', re: /password_hash|code_hash|token_hash/ },
  { name: 'refresh_token', re: /jqr_[A-Za-z0-9_-]{20,}/ },
  { name: 'synthetic_email', re: /@auth\.|id_[0-9a-f-]{36}@/ },
  { name: 'private_jwk', re: /"d"\s*:\s*"[A-Za-z0-9_-]{20,}"/ },
  { name: 'secret_api_key', re: /sb_secret_[A-Za-z0-9_-]{16,}/ },
];

test('B03 (browser) · no private identity or credential material reaches the browser; B11/B12 direct Data API', async ({ page, context }) => {
  const run = randomBytes(3).toString('hex');
  const username = `m1b_e2e_${run}`;
  const password = `Quiet-harbor-${run}-lantern`;
  const hits: string[] = [];
  const consoleLines: string[] = [];
  let responsesScanned = 0;
  let codeModulesSkipped = 0;
  let requestsScanned = 0;
  let authUserProbe: { status: number; bodyKeys: string[] } | null = null;
  const dataApiCalls: string[] = [];

  page.on('console', (m) => consoleLines.push(m.text()));
  page.on('request', (req) => {
    requestsScanned++;
    const url = new URL(req.url());
    if (url.pathname.startsWith('/rest/v1/')) dataApiCalls.push(`${req.method()} ${url.pathname}`);
    const headers = { ...req.headers() };
    delete headers.cookie; // the browser attaches the HttpOnly cookie to /api/auth; script cannot read it
    const blob = `${req.url()} ${JSON.stringify(headers)} ${req.postData() ?? ''}`;
    for (const f of FORBIDDEN) if (f.re.test(blob)) hits.push(`request:${url.pathname}:${f.name}`);
  });
  page.on('response', async (res) => {
    try {
      const url = new URL(res.url());
      const type = res.headers()['content-type'] ?? '';
      // JS/CSS modules are CODE, not runtime data. The dev server serves raw sources (including
      // this harness's detector literals and dependency identifiers). Code is scanned on the
      // production build by scripts/check-bundle.mjs (B23/B24) instead.
      if (/javascript|text\/css/.test(type)) { codeModulesSkipped++; return; }
      const body = await res.text();
      responsesScanned++;
      const headers = { ...res.headers() };
      delete headers['set-cookie']; // HttpOnly refresh cookie is delivered here by design
      for (const f of FORBIDDEN) if (f.re.test(body) || f.re.test(JSON.stringify(headers))) hits.push(`response:${url.pathname}:${f.name}`);
      if (url.pathname === '/auth/v1/user') {
        let keys: string[] = [];
        try { keys = Object.keys(JSON.parse(body)).sort(); } catch { /* not JSON */ }
        authUserProbe = { status: res.status(), bodyKeys: keys };
        if (res.status() === 200 || body.includes('@') || body.includes(username)) hits.push('response:/auth/v1/user:identity');
      }
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
  // B12: direct browser write; B11: direct browser read (list refresh)
  await page.getByLabel('Company').fill('Corvid Labs');
  await page.getByLabel('Role').fill('Staff Designer');
  await page.getByRole('button', { name: 'Insert (direct PostgREST)' }).click();
  await expect(page.getByText(/inserted application .* via direct PostgREST/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Applications' })).toContainText('Corvid Labs · Staff Designer');
  await page.getByRole('button', { name: '→ Interview' }).first().click();
  await expect(page.getByRole('region', { name: 'Applications' })).toContainText('INTERVIEW');

  await page.getByRole('button', { name: 'Refresh now' }).click();
  await expect(page.getByText('session refreshed (token rotated)')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  const login = page.getByRole('form', { name: 'Sign in' });
  await login.getByLabel('Username').fill(username);
  await login.getByLabel('Password').fill(password);
  await login.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('region', { name: 'Session' })).toContainText(username);
  await expect(page.getByRole('region', { name: 'Applications' })).toContainText('Corvid Labs');

  await page.getByRole('button', { name: 'Scan for exposed identity or credentials' }).click();
  await expect(page.getByTestId('auth-user-probe-status')).toBeVisible();
  await page.waitForLoadState('networkidle');
  const selfCheck = Object.fromEntries(
    await page.locator('[data-leak]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-leak'), e.getAttribute('data-found') === 'true'])),
  );

  const surfaces = await page.evaluate((patterns) => {
    const res = patterns.map((p) => new RegExp(p));
    const any = (t: string) => res.some((r) => r.test(t));
    return {
      localStorage: any(JSON.stringify({ ...localStorage })),
      sessionStorage: any(JSON.stringify({ ...sessionStorage })),
      documentCookie: any(document.cookie) || document.cookie.includes('jq_rt='),
      reactState: any(JSON.stringify((window as unknown as { __jqState?: unknown }).__jqState ?? {})),
      html: any(document.documentElement.outerHTML),
      localStorageKeys: Object.keys(localStorage),
      sessionStorageKeys: Object.keys(sessionStorage),
    };
  }, FORBIDDEN.map((f) => f.re.source));
  const allCookies = await context.cookies();
  const rt = allCookies.find((c) => c.name === 'jq_rt');
  const consoleLeak = consoleLines.some((l) => FORBIDDEN.some((f) => f.re.test(l)));

  const ok = hits.length === 0 && !Object.values(selfCheck).some(Boolean) && !surfaces.localStorage && !surfaces.sessionStorage
    && !surfaces.documentCookie && !surfaces.reactState && !surfaces.html && !consoleLeak && rt?.httpOnly === true;
  const evidence = {
    status: ok ? 'PASS' : 'FAIL',
    base_url: process.env.M1_BASE_URL ? 'vercel-preview' : 'local',
    supabase_target: process.env.M1B_TARGET ?? 'local',
    requests_scanned: requestsScanned, data_responses_scanned: responsesScanned, code_modules_skipped: codeModulesSkipped, network_hits: hits,
    harness_self_check: selfCheck, auth_v1_user_probe: authUserProbe, surfaces, console_contains_forbidden: consoleLeak,
    refresh_cookie: rt ? { httpOnly: rt.httpOnly, secure: rt.secure, sameSite: rt.sameSite, path: rt.path } : null,
    cookie_names: allCookies.map((c) => `${c.name}${c.httpOnly ? ' (HttpOnly)' : ''}`),
    direct_data_api_calls_from_browser: [...new Set(dataApiCalls)].sort(),
  };
  mkdirSync('migration-upgrade/m1b/evidence', { recursive: true });
  writeFileSync(`migration-upgrade/m1b/evidence/e2e-browser-${evidence.supabase_target}-${run}.json`, JSON.stringify(evidence, null, 2));

  expect(Object.keys(selfCheck)).toHaveLength(5); // the self-check really ran
  expect(authUserProbe).not.toBeNull();
  expect.soft(hits).toEqual([]);
  expect.soft(selfCheck).toEqual(Object.fromEntries(Object.keys(selfCheck).map((k) => [k, false])));
  expect(evidence.status).toBe('PASS');
});
