import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

// AI-9 focused check: Settings -> AI & Automation -> Providers. Claude stays as it was; Gemini and ChatGPT get truthful cards
// on the SAME connector-token infrastructure. Creates a Gemini credential through the real UI/API, proves the raw token is
// shown once and never persisted (storage, URL, page after close/reload), proves a read-only credential discovers the read
// tools only, revokes it and proves the next MCP call is denied. No Gemini/ChatGPT account, mailbox, calendar or network is
// involved (CI never depends on a provider). NO screenshot is ever taken while a token is on screen. Requires AI_HUB_ENABLED /
// VITE_AI_HUB_ENABLED = true (the dedicated AI-Hub CI job sets them; no other spec does).
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

test.describe('AI-9 provider cards', () => {
  test.skip(!aiHubEnabled, 'AI Hub flags are off in this environment (default); run locally or in the dedicated AI-Hub CI job with AI_HUB_ENABLED and VITE_AI_HUB_ENABLED set');
  test.setTimeout(300_000);
  test.use({ reducedMotion: 'reduce', actionTimeout: 20_000 });

  test('Claude unchanged, Gemini credential lifecycle (shown once, never persisted, revoked and denied), truthful ChatGPT plan state, responsive layout and accessibility', async ({ page }) => {
    const run = randomBytes(3).toString('hex');
    const a11y: Awaited<ReturnType<typeof audit>>[] = [];
    const evidence: Record<string, unknown> = { run };

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Create account' }).click();
    const register = page.getByRole('form', { name: 'Register' });
    await register.getByLabel('Username (required)').fill(`ai9_${run}`);
    await register.getByLabel('Password (required)').fill(`Providers-${run}-Harbor!`);
    await register.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByTestId('recovery-codes').locator('li')).toHaveCount(10);
    await page.getByRole('button', { name: 'I saved them' }).click();
    await page.goto('/applications');
    await expect(page.getByTestId('new-application-btn')).toBeVisible();

    // ---- 1) three provider cards, each truthful before anything is configured ---------------------------------------------
    await page.goto('/settings/ai');
    const claude = page.getByTestId('claude-connector');
    const gemini = page.getByTestId('gemini-connector');
    const chatgpt = page.getByTestId('chatgpt-connector');
    await expect(claude.getByText('Not configured', { exact: true })).toBeVisible();
    await expect(claude.getByRole('button', { name: 'Set up Claude' })).toBeVisible();
    await expect(claude.getByText('stores no Claude credentials')).toBeVisible();
    await expect(gemini.getByText('Not configured', { exact: true })).toBeVisible();
    await expect(gemini.getByRole('button', { name: 'Set up Gemini' })).toBeVisible();
    await expect(gemini.getByText('Approval required', { exact: false }).first()).toBeVisible();
    await expect(chatgpt.getByText('Plugin setup required', { exact: true })).toBeVisible();
    await expect(chatgpt.getByText('Not available on this plan')).toBeVisible();
    await expect(page.getByTestId('chatgpt-connector').getByText(/MCP connected/i)).toHaveCount(0);
    await expect(page.getByText(/^Connected$/)).toHaveCount(0);
    a11y.push(await audit(page, 'providers-empty-1280'));

    // ---- 2) Gemini credential: default is Read only / 30 days; the token is shown once ---------------------------------------
    await gemini.getByRole('button', { name: 'Set up Gemini' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Set up Gemini' })).toBeVisible();
    await expect(dialog.getByRole('radio', { name: /Read only/ })).toBeChecked();
    await expect(dialog.getByLabel('Expires')).toHaveValue('30');
    await dialog.getByRole('button', { name: 'Create credential' }).click();
    await expect(dialog.getByRole('heading', { name: 'Add JobQuest to Gemini' })).toBeVisible();
    const tokenText = (await dialog.locator('.extension-secret code').first().innerText()).trim();
    expect(tokenText).toMatch(/^jq_mcp_/);
    await expect(dialog.getByText('Custom apps')).toBeVisible();

    // the token must not be anywhere it should not be - checked WHILE it is on screen
    expect(page.url()).not.toContain(tokenText);
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(stored).not.toContain(tokenText);

    // a read-only credential discovers the read tools only (no write tool), and works until revoked
    const endpoint = '/api/mcp';
    const rpc = (token: string, method: string, params: Record<string, unknown> = {}) => page.request.post(endpoint, {
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      data: { jsonrpc: '2.0', id: 1, method, params },
      failOnStatusCode: false,
    });
    const listed = await rpc(tokenText, 'tools/list');
    expect(listed.status()).toBe(200);
    const body = await listed.text();
    const names = [...body.matchAll(/"name":"(jobquest_[a-z_]+)"/g)].map((m) => m[1]!);
    expect(names).toContain('jobquest_list_applications');
    expect(names).not.toContain('jobquest_submit_ai_result');
    expect(names.join()).not.toMatch(/create_application|update_application|set_status|create_task|delete/);
    evidence.gemini_read_only_tool_count = new Set(names).size;

    await dialog.getByRole('button', { name: 'Done, I copied it' }).click();
    await expect(dialog).toHaveCount(0);
    expect(await page.content()).not.toContain(tokenText);
    await expect(gemini.getByText('Connector credential ready')).toBeVisible();
    await expect(gemini.getByText('Gemini connector')).toBeVisible();
    await expect(gemini.getByText('Not used yet').first()).toBeVisible();
    await expect(claude.getByText('Not configured', { exact: true })).toBeVisible(); // a Gemini credential never lights up Claude
    await expect(chatgpt.getByText('Plugin setup required', { exact: true })).toBeVisible();

    // reload: metadata survives, the secret never does
    await page.reload();
    await expect(gemini.getByText('Connector credential ready')).toBeVisible();
    expect(await page.content()).not.toContain(tokenText);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))).not.toContain(tokenText);

    // ---- 3) responsive layout and accessibility with a credential present --------------------------------------------------
    for (const width of [1280, 768, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(gemini.getByText('Connector credential ready')).toBeVisible();
      expect(await overflow(page), `horizontal overflow at ${width}px`).toBe(0);
      a11y.push(await audit(page, `providers-ready-${width}`));
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    // ---- 4) revoke: the card says so and the next MCP call is denied ---------------------------------------------------------
    await gemini.getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Revoke “Gemini connector”?' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Revoke credential' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(gemini.getByText('Credential revoked')).toBeVisible();
    const denied = await rpc(tokenText, 'tools/list');
    expect(denied.status()).toBe(401);
    expect(await denied.text()).not.toContain('jobquest_list_applications');
    evidence.post_revocation_status = denied.status();
    a11y.push(await audit(page, 'providers-revoked-1280'));

    expect(a11y.flatMap((x) => x.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${x.context}:${v.id}`))).toEqual([]);
    evidence.a11y = a11y.map((x) => ({ context: x.context, violations: x.violations.length, blocking: x.blocking }));
    writeFileSync(resolve(evidenceDir, 'ai9-providers.json'), JSON.stringify(evidence, null, 2)); // no token value is ever part of the evidence
  });
});
