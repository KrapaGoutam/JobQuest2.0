import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

// AI-5 focused Daily Digest check (one page, three widths). Requires the local stack and
// AI_HUB_ENABLED / VITE_AI_HUB_ENABLED = true in the env file chosen by M1B_ENV_FILE.
const TZ = 'America/Chicago';
const evidenceDir = resolve('test-results/evidence');
const shotsDir = resolve('test-results/screenshots');
mkdirSync(evidenceDir, { recursive: true });
mkdirSync(shotsDir, { recursive: true });

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
const serviceClient = () => {
  const env = environment();
  return createClient(env.SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
};
const dayKey = (days = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + days * 86_400_000));

async function audit(page: Page, context: string) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return {
    context,
    violations: result.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })) })),
    blocking: result.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').length,
  };
}
const overflow = (page: Page) => page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));

const payload = (date: string, over: Record<string, unknown> = {}) => ({
  version: '1.0', digest_date: date, time_zone: TZ, generated_at: new Date().toISOString(),
  summary: { applications_added: 2, active_applications: 14, follow_ups: 1, pending_suggestions: 3 },
  priorities: [{ title: 'Follow up with Example Corp about the technical interview', detail: 'Next action is due today', priority: 'HIGH', source: 'jobquest' }],
  sections: {
    applications: { status: 'available', count: 2, items: [{ title: 'Example Corp — Staff Engineer', source: 'jobquest' }] },
    job_leads: { status: 'not_configured', items: [] },
    email_activity: { status: 'zero', count: 0, items: [] },
  },
  ...over,
});

test.describe('AI-5 Daily Digest', () => {
  test.setTimeout(300_000);
  test.use({ timezoneId: 'Europe/Berlin', reducedMotion: 'reduce', actionTimeout: 20_000 });

  test('states, filters, snapshot history, responsive layout and accessibility', async ({ page }) => {
    const run = randomBytes(3).toString('hex');
    const evidence: Record<string, unknown> = { run, profile_timezone: TZ, browser_timezone: 'Europe/Berlin' };
    const a11y: Awaited<ReturnType<typeof audit>>[] = [];

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Create account' }).click();
    const register = page.getByRole('form', { name: 'Register' });
    await register.getByLabel('Username (required)').fill(`ai5_${run}`);
    await register.getByLabel('Password (required)').fill(`Digest-${run}-Harbor!`);
    await register.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByTestId('recovery-codes').locator('li')).toHaveCount(10);
    await page.getByRole('button', { name: 'I saved them' }).click();
    await page.goto('/applications');
    await expect(page.getByTestId('new-application-btn')).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const s = (window as unknown as { __jqState?: { user?: { id?: string; active_workspace_id?: string }; activeWs?: string } }).__jqState;
      return Boolean(s?.user?.id && (s.activeWs ?? s.user.active_workspace_id));
    })).toBe(true);
    const state = await page.evaluate(() => {
      const s = (window as unknown as { __jqState?: { user?: { id?: string; active_workspace_id?: string }; activeWs?: string } }).__jqState;
      return { userId: s?.user?.id ?? '', workspaceId: s?.activeWs ?? s?.user?.active_workspace_id ?? '' };
    });
    const admin = serviceClient();
    expect((await admin.from('profiles').update({ timezone: TZ }).eq('user_id', state.userId)).error).toBeNull();
    const finding = (provider: string, date: string, title: string, p: Record<string, unknown>) => ({
      workspace_id: state.workspaceId, user_id: state.userId, kind: 'daily_brief', provider, title, summary: 'Stored digest.',
      dedupe_key: `daily_brief:${date}:${provider}`, priority: 'INFO', payload: p,
    });

    // 1) No digest for today yet: explicit message + clearly-labelled live metrics (not a stored digest).
    await page.goto('/ai-hub/digest');
    await expect(page.getByRole('heading', { name: 'Daily Digest', level: 2 })).toBeVisible();
    await expect(page.getByText('No Daily Digest has been generated for today.')).toBeVisible();
    await expect(page.getByText('Current numbers, not a stored digest.')).toBeVisible();
    await page.screenshot({ path: resolve(shotsDir, 'ai5-digest-empty-1280.png'), fullPage: true });
    a11y.push(await audit(page, 'today-empty-1280'));

    // 2) Save a JobQuest (system) digest through the real route; it appears for Today.
    await page.getByRole('button', { name: 'Save a JobQuest digest for today' }).click();
    await expect(page.getByText('Saved today’s JobQuest digest.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Source availability' })).toBeVisible();
    await expect(page.getByText('Job Leads: Not configured')).toBeVisible();
    await expect(page.getByText('Email Activity: Not configured')).toBeVisible();

    // 3) Historical + second-provider fixtures (service role stands in for a scheduled provider run).
    const longTitle = `Very long unbroken title ${'x'.repeat(120)} <b>not bold</b>`;
    const seed = [
      finding('claude', dayKey(0), 'Claude digest today', payload(dayKey(0))),
      finding('claude', dayKey(-1), 'Claude digest yesterday', payload(dayKey(-1), { priorities: [{ title: longTitle, priority: 'CRITICAL' }] })),
      finding('chatgpt', dayKey(-3), 'ChatGPT digest', payload(dayKey(-3))),
      finding('claude', dayKey(-40), 'Legacy-format digest', { date: dayKey(-40), highlights: ['legacy'] }),
    ];
    expect((await admin.from('ai_findings').insert(seed)).error).toBeNull();

    await page.goto('/ai-hub/digest');
    await expect(page.getByText(/Combined view of 2 providers/)).toBeVisible();
    for (const w of [375, 768, 1280]) {
      await page.setViewportSize({ width: w, height: 900 });
      await expect(page.getByRole('heading', { name: 'Daily Digest', level: 2 })).toBeVisible();
      evidence[`overflow_today_${w}`] = await overflow(page);
      expect(await overflow(page), `no horizontal scroll at ${w}px`).toBe(0);
      await page.screenshot({ path: resolve(shotsDir, `ai5-digest-today-${w}.png`), fullPage: true });
      a11y.push(await audit(page, `today-${w}`));
    }

    // 4) Provider filter (label is associated; Claude only hides the combined card).
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByLabel('Provider').selectOption('claude');
    await expect(page.getByText(/Combined view/)).toHaveCount(0);
    await expect(page.getByText(/^Claude · Generated/).first()).toBeVisible();
    await page.getByLabel('Provider').selectOption('ALL');

    // 5) Yesterday: stored snapshot with a long/HTML-ish title rendered as text; no layout break.
    await page.getByRole('button', { name: 'Yesterday' }).click();
    await expect(page.getByText(/Very long unbroken title/)).toBeVisible();
    await expect(page.locator('b', { hasText: 'not bold' })).toHaveCount(0);
    for (const w of [375, 768]) {
      await page.setViewportSize({ width: w, height: 900 });
      expect(await overflow(page), `no horizontal scroll (yesterday) at ${w}px`).toBe(0);
    }
    await page.screenshot({ path: resolve(shotsDir, 'ai5-digest-yesterday-375.png'), fullPage: true });
    a11y.push(await audit(page, 'yesterday-375'));
    await page.setViewportSize({ width: 1280, height: 900 });

    // 6) Custom range: labelled date controls, accessible validation, historical + unsupported payload.
    await page.getByRole('button', { name: 'Custom range' }).click();
    await page.getByLabel('From date').fill(dayKey(-45));
    await page.getByLabel('To date').fill(dayKey(-50));
    await expect(page.getByRole('alert').filter({ hasText: 'on or before' })).toBeVisible();
    await page.getByLabel('From date').fill(dayKey(-50));
    await page.getByLabel('To date').fill(dayKey(-30));
    await expect(page.getByText('format this version of JobQuest cannot display')).toBeVisible();
    a11y.push(await audit(page, 'custom-1280'));
    await page.getByLabel('From date').fill(dayKey(-20));
    await page.getByLabel('To date').fill(dayKey(-10));
    await expect(page.getByText('No Daily Digests in this range.')).toBeVisible();

    // 7) Keyboard: presets are reachable and operable without a mouse.
    await page.getByRole('button', { name: 'Last 7 days' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Last 7 days' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/^ChatGPT · Generated/).first()).toBeVisible();

    // 8) Old digests stay snapshots: adding applications later does not change the stored yesterday digest.
    const before = (await admin.from('ai_findings').select('payload').eq('dedupe_key', `daily_brief:${dayKey(-1)}:claude`).eq('user_id', state.userId).single()).data!.payload;
    await admin.from('applications').insert({ workspace_id: state.workspaceId, user_id: state.userId, company_name: `Late ${run}`, role_title: 'Engineer' });
    const after = (await admin.from('ai_findings').select('payload').eq('dedupe_key', `daily_brief:${dayKey(-1)}:claude`).eq('user_id', state.userId).single()).data!.payload;
    expect(after).toEqual(before);

    // 9) Other AI Hub tabs are intact.
    await page.getByRole('tab', { name: 'History' }).click();
    await expect(page).toHaveURL(/\/ai-hub\/history$/);
    await page.getByRole('tab', { name: 'Overview' }).click();
    await expect(page).toHaveURL(/\/ai-hub$/);

    evidence.a11y = a11y;
    writeFileSync(resolve(evidenceDir, 'ai5-digest.json'), JSON.stringify(evidence, null, 2));
    for (const result of a11y) expect(result.blocking, `${result.context}: ${JSON.stringify(result.violations)}`).toBe(0);
  });
});
