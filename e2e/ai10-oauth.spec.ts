import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// AI-10 focused check: Settings -> AI & Automation -> Providers + the OAuth 2.1 consent screen. Claude keeps its scoped
// bearer connector; Gemini and ChatGPT use pre-registered OAuth clients. Drives the REAL browser flow (client setup ->
// authorize -> consent -> callback -> token -> MCP), proves the client secret is shown once and never persisted, that the
// consent screen lists exactly the registered scopes and never a core-write permission, that a deny issues no code, and that
// revoking the client denies the next MCP call. No Gemini/ChatGPT account or network is involved (the provider callback is
// intercepted). NO screenshot is taken while a secret is on screen. Requires AI_HUB_ENABLED / VITE_AI_HUB_ENABLED = true.
const evidenceDir = resolve('test-results/evidence');
mkdirSync(evidenceDir, { recursive: true });

function environment() {
  const file = process.env.M1B_ENV_FILE ?? '.env.m1b-local';
  const values: Record<string, string> = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const index = line.indexOf('=');
      if (index > 0) values[line.slice(0, index)] = line.slice(index + 1).replace(/^"|"$/g, '');
    }
  }
  return values;
}

async function audit(page: Page, context: string) {
  await page.mouse.move(1, 1);
  await page.waitForTimeout(250);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return {
    context,
    violations: result.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })) })),
    blocking: result.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').length,
  };
}
const overflow = (page: Page) => page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));

const aiHubEnabled = (environment().VITE_AI_HUB_ENABLED ?? process.env.VITE_AI_HUB_ENABLED) === 'true'
  && (environment().AI_HUB_ENABLED ?? process.env.AI_HUB_ENABLED) === 'true';

test.describe('AI-10 OAuth provider cards and consent', () => {
  test.skip(!aiHubEnabled, 'AI Hub flags are off in this environment (default); run locally or in the dedicated AI-Hub CI job with AI_HUB_ENABLED and VITE_AI_HUB_ENABLED set');
  test.setTimeout(300_000);
  test.use({ reducedMotion: 'reduce', actionTimeout: 20_000 });

  test('Claude unchanged, Gemini OAuth client + consent + token + revocation, ChatGPT OAuth card, responsive layout and accessibility', async ({ page }) => {
    const run = randomBytes(3).toString('hex');
    const a11y: Awaited<ReturnType<typeof audit>>[] = [];
    const evidence: Record<string, unknown> = { run };
    const callback = 'https://gemini.example/oauth/callback';
    await page.route('https://gemini.example/**', (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: 'provider callback' }));

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle'); // let the single-use refresh rotation settle before the next reload
    await page.getByRole('button', { name: 'Create account' }).click();
    const register = page.getByRole('form', { name: 'Register' });
    await register.getByLabel('Username (required)').fill(`ai10_${run}`);
    await register.getByLabel('Password (required)').fill(`Providers-${run}-Harbor!`);
    await register.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByTestId('recovery-codes').locator('li')).toHaveCount(10);
    await page.getByRole('button', { name: 'I saved them' }).click();
    await page.goto('/applications');
    await page.waitForLoadState('networkidle'); // let the single-use refresh rotation settle before the next reload
    await expect(page.getByTestId('new-application-btn')).toBeVisible();
    const origin = new URL(page.url()).origin;

    // ---- 1) Claude keeps the scoped bearer connector; Gemini and ChatGPT are truthful OAuth cards -------------------------
    await page.goto('/settings/ai');
    await page.waitForLoadState('networkidle'); // let the single-use refresh rotation settle before the next reload
    const claude = page.getByTestId('claude-connector');
    const gemini = page.getByTestId('gemini-oauth');
    const chatgpt = page.getByTestId('chatgpt-oauth');
    await expect(claude.getByText('Not configured', { exact: true })).toBeVisible();
    await expect(claude.getByRole('button', { name: 'Set up Claude' })).toBeVisible();
    await expect(gemini.getByText('OAuth setup required', { exact: true })).toBeVisible();
    await expect(gemini.getByRole('button', { name: 'Set up Gemini' })).toBeVisible();
    await expect(chatgpt.getByText('OAuth setup required', { exact: true })).toBeVisible();
    await expect(chatgpt.getByRole('button', { name: 'Set up ChatGPT' })).toBeVisible();
    await expect(page.getByText(/^Connected$/)).toHaveCount(0);
    a11y.push(await audit(page, 'providers-empty-1280'));

    // ---- 2) Gemini OAuth client: the secret is shown once and never persisted ---------------------------------------------
    await gemini.getByRole('button', { name: 'Set up Gemini' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Set up Gemini OAuth' })).toBeVisible();
    await dialog.getByLabel('Provider callback URL').fill(callback);
    await dialog.getByRole('button', { name: 'Create OAuth client' }).click();
    await expect(dialog.getByRole('heading', { name: 'Gemini OAuth credentials' })).toBeVisible();
    const reveal = async (label: string) => (await dialog.locator('div', { has: page.locator('b', { hasText: new RegExp(`^${label}$`) }) }).last().locator('code').first().innerText()).trim();
    const clientId = await reveal('Client ID');
    const clientSecret = await reveal('Client secret');
    expect(clientId).toMatch(/^jq_oauth_(dev|live)_[A-Za-z0-9]{32}$/);
    expect(clientSecret).toMatch(/^jq_oauth_secret_(dev|live)_[A-Za-z0-9]{43}$/);
    expect(await reveal('Resource / audience')).toBe(`${origin}/api/mcp`);
    expect(await reveal('Scopes')).toBe('jobquest:read ai:read');
    expect(page.url()).not.toContain(clientSecret);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))).not.toContain(clientSecret);
    await dialog.getByRole('button', { name: 'Done, I copied it' }).click();
    await expect(dialog).toHaveCount(0);
    expect(await page.content()).not.toContain(clientSecret);
    await expect(gemini.getByText('OAuth client ready', { exact: true })).toBeVisible();
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(gemini.getByText('OAuth client ready', { exact: true })).toBeVisible();
    expect(await page.content()).not.toContain(clientSecret);

    // ---- 3) consent: browser flow, exact scopes, deny issues no code, approve issues one ---------------------------------
    const verifier = randomBytes(32).toString('base64url');
    const authorizeUrl = (state: string) => `/api/oauth/authorize?${new URLSearchParams({
      response_type: 'code', client_id: clientId, redirect_uri: callback, resource: `${origin}/api/mcp`, scope: 'jobquest:read ai:read',
      state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
    })}`;

    const deniedState = randomBytes(16).toString('base64url');
    await page.goto(authorizeUrl(deniedState));
    await page.waitForLoadState('networkidle'); // let the single-use refresh rotation settle before the next reload
    const consent = page.getByTestId('oauth-consent');
    await expect(consent.getByText('Authorize JobQuest access', { exact: true })).toBeVisible();
    await expect(consent.getByText('jobquest:read', { exact: true })).toBeVisible();
    await expect(consent.getByText('ai:read', { exact: true })).toBeVisible();
    await expect(consent.getByText('ai:ingest', { exact: true })).toHaveCount(0); // not registered, so not requestable
    await expect(consent.getByText(/cannot call JobQuest’s controlled-action execution endpoints/)).toBeVisible();
    for (const width of [1280, 768, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(consent.getByRole('button', { name: 'Allow access' })).toBeVisible();
      expect(await overflow(page), `consent horizontal overflow at ${width}px`).toBe(0);
      a11y.push(await audit(page, `consent-${width}`));
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await consent.getByRole('button', { name: 'Deny' }).click();
    await page.waitForURL(/gemini\.example\/oauth\/callback\?/);
    const deniedUrl = new URL(page.url());
    expect(deniedUrl.searchParams.get('error')).toBe('access_denied');
    expect(deniedUrl.searchParams.get('code')).toBeNull();
    expect(deniedUrl.searchParams.get('state')).toBe(deniedState);

    const state = randomBytes(16).toString('base64url');
    await page.goto(authorizeUrl(state));
    await page.waitForLoadState('networkidle'); // let the single-use refresh rotation settle before the next reload
    await page.getByTestId('oauth-consent').getByRole('button', { name: 'Allow access' }).click();
    await page.waitForURL(/gemini\.example\/oauth\/callback\?/);
    const approved = new URL(page.url());
    expect(approved.searchParams.get('state')).toBe(state);
    expect(approved.searchParams.get('iss')).toBe(origin);
    const code = approved.searchParams.get('code')!;
    expect(code).toMatch(/^jq_oac_/);

    // ---- 4) token + MCP: read tools only, no core-write tool; wrong verifier / reuse fail; revocation denies -------------
    const basic = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    const token = (data: Record<string, string>) => page.request.post('/api/oauth/token', { headers: { authorization: basic }, form: data, failOnStatusCode: false });
    const exchange = { grant_type: 'authorization_code', code, redirect_uri: callback, resource: `${origin}/api/mcp` };
    expect((await token({ ...exchange, code_verifier: randomBytes(32).toString('base64url') })).status()).toBe(400);
    const issued = await token({ ...exchange, code_verifier: verifier });
    expect(issued.status()).toBe(200);
    const tokens = await issued.json() as { access_token: string; refresh_token: string; scope: string };
    expect(tokens.scope).toBe('jobquest:read ai:read');
    expect((await token({ ...exchange, code_verifier: verifier })).status()).toBe(400);

    const rpc = (bearer: string) => page.request.post('/api/mcp', {
      headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, failOnStatusCode: false,
    });
    const listed = await rpc(tokens.access_token);
    expect(listed.status()).toBe(200);
    const names = [...(await listed.text()).matchAll(/"name":"(jobquest_[a-z_]+)"/g)].map((m) => m[1]!);
    expect(names).toContain('jobquest_list_applications');
    expect(names).not.toContain('jobquest_submit_ai_result');
    expect(names.join()).not.toMatch(/create_application|update_application|set_status|create_task|delete|execute/);
    evidence.oauth_read_tool_count = new Set(names).size;
    const noToken = await page.request.post('/api/mcp', { data: {}, headers: { 'content-type': 'application/json' }, failOnStatusCode: false });
    expect(noToken.status()).toBe(401);
    expect(noToken.headers()['www-authenticate']).toContain('resource_metadata=');

    // ---- 5) card state, ChatGPT untouched, revoke -> next MCP call denied ---------------------------------------------------
    await page.goto('/settings/ai');
    await page.waitForLoadState('networkidle'); // let the single-use refresh rotation settle before the next reload
    await expect(gemini.getByText('OAuth authorized', { exact: true })).toBeVisible();
    await expect(chatgpt.getByText('OAuth setup required', { exact: true })).toBeVisible(); // a Gemini client never lights up ChatGPT
    for (const width of [1280, 768, 375]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await overflow(page), `providers horizontal overflow at ${width}px`).toBe(0);
      a11y.push(await audit(page, `providers-authorized-${width}`));
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await gemini.getByRole('button', { name: 'Revoke' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Revoke client' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(gemini.getByText('OAuth setup required', { exact: true })).toBeVisible();
    const denied = await rpc(tokens.access_token);
    expect(denied.status()).toBe(401);
    expect(await denied.text()).not.toContain('jobquest_list_applications');
    expect((await token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, resource: `${origin}/api/mcp` })).status()).toBe(400);
    evidence.post_revocation_status = denied.status();
    a11y.push(await audit(page, 'providers-revoked-1280'));

    expect(a11y.flatMap((x) => x.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${x.context}:${v.id}`))).toEqual([]);
    evidence.a11y = a11y.map((x) => ({ context: x.context, violations: x.violations.length, blocking: x.blocking }));
    writeFileSync(resolve(evidenceDir, 'ai10-oauth.json'), JSON.stringify(evidence, null, 2)); // no secret or token value is ever part of the evidence
  });
});
