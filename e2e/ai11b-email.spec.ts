import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

// AI-11B focused check: the Email Intelligence page - Job related / Other mail groups, High / Medium / Low sections,
// the Needs attention headline, quick filters, the derived application link, a hint-only stage suggestion, no mail-client
// actions, responsive layout at 375/768/1280 and accessibility. Requires the local stack and AI_HUB_ENABLED /
// VITE_AI_HUB_ENABLED = true in the env file chosen by M1B_ENV_FILE. The flags are NOT enabled for any other spec.
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

async function audit(page: Page, context: string) {
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

test.describe('AI-11B email intelligence & triage', () => {
  test.skip(!aiHubEnabled, 'AI Hub flags are off in this environment (default); run locally with AI_HUB_ENABLED and VITE_AI_HUB_ENABLED set');
  test.setTimeout(300_000);
  test.use({ timezoneId: 'Europe/Berlin', reducedMotion: 'reduce', actionTimeout: 20_000 });

  test('groups, urgency sections, filters, application link, hint-only stage, no mail actions, responsive layout and accessibility', async ({ page }) => {
    const run = randomBytes(3).toString('hex');
    const evidence: Record<string, unknown> = { run };
    const a11y: Awaited<ReturnType<typeof audit>>[] = [];

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Create account' }).click();
    const register = page.getByRole('form', { name: 'Register' });
    await register.getByLabel('Username (required)').fill(`ai11b_${run}`);
    await register.getByLabel('Password (required)').fill(`Triage-${run}-Harbor!`);
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
    const owner = { workspace_id: state.workspaceId, user_id: state.userId };

    // ---- seed: one application the server can match, six emails across both groups -------------------------
    const acme = `Acme${run}`;
    const app = await admin.from('applications').insert({ ...owner, company_name: `${acme} Inc.`, role_title: 'QA Engineer', stage: 'INTERVIEW' }).select('id, stage, updated_at').single();
    expect(app.error).toBeNull();
    const appBefore = app.data!;
    const hour = 3_600_000;
    const emails = [
      { key: 'a', category: 'interview_scheduling', priority: 'HIGH', title: 'Acme: interview scheduling', summary: 'Recruiter requested availability for a 30-minute screen.', at: Date.now() - 2 * hour, due: Date.now() + 5 * hour,
        p: { company: acme, role_title: 'QA Engineer', sender_name: 'Pat Recruiter', sender_domain: 'acme.example', next_step: 'Reply with two available times', action_state: 'needs_action', needs_attention: true, draft_recommended: true, application_stage_hint: 'INTERVIEW', group: 'job_related' } },
      { key: 'b', category: 'follow_up', priority: 'NORMAL', title: 'Acme: follow-up', summary: 'Checking in about next steps.', at: Date.now() - 30 * hour, due: null,
        p: { company: acme, sender_name: 'Pat Recruiter', sender_domain: 'acme.example', group: 'job_related' } },
      { key: 'c', category: 'application_confirmation', priority: 'LOW', title: 'Zeta: application received', summary: 'Application for Software Test Engineer was received.', at: Date.now() - 50 * hour, due: null,
        p: { company: `Zeta${run}`, role_title: 'Software Test Engineer', sender_name: 'Zeta Careers', sender_domain: 'zeta.example', action_state: 'no_action', application_stage_hint: 'APPLIED', group: 'job_related' } },
      { key: 'd', category: 'important_account', priority: 'HIGH', title: 'Bank: new sign-in', summary: 'New sign-in requires review.', at: Date.now() - 1 * hour, due: null,
        p: { sender_name: 'Bank', sender_domain: 'bank.example', next_step: 'Review account activity', action_state: 'needs_action', needs_attention: true, group: 'other' } },
      { key: 'e', category: 'newsletter', priority: 'LOW', title: 'Weekly engineering newsletter', summary: 'This week in engineering.', at: Date.now() - 8 * hour, due: null,
        p: { sender_name: 'Eng Weekly', sender_domain: 'news.example', action_state: 'no_action', group: 'other' } },
      { key: 'f', category: 'interview_invitation', priority: 'HIGH', title: 'Legacy: interview invitation', summary: 'An AI-6 style invitation.', at: Date.now() - 3 * hour, due: null,
        p: { company: `Legacy${run}`, sender_name: 'Lee', sender_domain: 'legacy.example' } },
    ];
    expect((await admin.from('ai_findings').insert(emails.map((e) => ({
      ...owner, kind: 'email_event', provider: 'claude', status: 'NEW', category: e.category, priority: e.priority, title: e.title, summary: e.summary,
      occurred_at: new Date(e.at).toISOString(), due_at: e.due ? new Date(e.due).toISOString() : null, dedupe_key: `ev:${run}${e.key}`,
      payload: { version: '1.0', subject: `Subject ${e.key}`, ...e.p },
    })))).error).toBeNull();
    const appsBefore = (await admin.from('applications').select('id', { count: 'exact', head: true }).eq('workspace_id', state.workspaceId)).count ?? 0;

    // ---- the page --------------------------------------------------------------------------------------------
    await page.goto('/ai-hub/email');
    await expect(page.getByRole('heading', { name: 'Email Intelligence', level: 2 })).toBeVisible();
    const cards = page.getByRole('article');
    await expect(cards).toHaveCount(6);
    await expect(page.getByTestId('email-high-count')).toHaveText('3'); // a, d, f are open and HIGH
    await expect(page.getByText('high-urgency emails need attention')).toBeVisible();

    // groups and urgency sections, in order
    await expect(page.getByRole('heading', { name: /^Job related/, level: 3 })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Other mail/, level: 3 })).toBeVisible();
    const order = await page.locator('main h3, main h4').evaluateAll((els) => els.map((e) => e.textContent?.replace(/\s+/g, ' ').trim()));
    const text = order.join(' | ');
    expect(text.indexOf('Job related')).toBeLessThan(text.indexOf('Other mail'));
    expect(text).toMatch(/Job related \(4\) \| High urgency \(2\) \| Medium urgency \(1\) \| Low urgency \(1\) \| Other mail \(2\) \| High urgency \(1\) \| Low urgency \(1\)/);

    // a job-related card: bounded facts, action, deadline, derived application, hint-only stage
    const a = page.getByRole('article', { name: 'Acme: interview scheduling' });
    for (const t of ['Pat Recruiter (acme.example)', 'Recruiter requested availability for a 30-minute screen.', 'Interview scheduling', 'High urgency', 'Reply with two available times', 'Deadline']) await expect(a.getByText(t).first()).toBeVisible();
    await expect(a.getByText('2h ago')).toBeVisible();
    await expect(a.getByRole('button', { name: 'Open application QA Engineer — Interview' })).toBeVisible(); // matched by the server
    await expect(a.getByText('Interview (a hint only; your application is not changed)')).toBeVisible();
    await expect(a.getByText('A reply draft is recommended. JobQuest does not write or send email.')).toBeVisible();
    const b = page.getByRole('article', { name: 'Acme: follow-up' });
    await expect(b.getByText('Possible match, not confirmed')).toBeVisible(); // company only: never presented as the application
    const c = page.getByRole('article', { name: 'Zeta: application received' });
    await expect(c.getByText('No action needed')).toBeVisible();
    await expect(c.getByText('No matching application')).toBeVisible();
    const d = page.getByRole('article', { name: 'Bank: new sign-in' });
    await expect(d.getByText('Review account activity')).toBeVisible();
    await expect(d.getByText('Application')).toHaveCount(0); // other mail has no application line

    // not a mail client
    await expect(page.getByText('cannot send, reply to or change any email')).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Reply|Send|Archive|Delete|Compose|Create draft|Mark)/ })).toHaveCount(0);

    // quick filters
    const group = page.getByRole('group', { name: 'Mail type' });
    const urgency = page.getByRole('group', { name: 'Urgency' });
    await group.getByRole('button', { name: 'Other mail' }).click();
    await expect(cards).toHaveCount(2);
    await expect(page.getByRole('heading', { name: /^Job related/ })).toHaveCount(0);
    await expect(group.getByRole('button', { name: 'Other mail' })).toHaveAttribute('aria-pressed', 'true');
    await group.getByRole('button', { name: 'Job related' }).click();
    await expect(cards).toHaveCount(4);
    await urgency.getByRole('button', { name: 'High' }).click();
    await expect(cards).toHaveCount(2); // a and the legacy invitation
    await urgency.getByRole('button', { name: 'Low' }).click();
    await expect(cards).toHaveCount(1);
    await group.getByRole('button', { name: 'All' }).click();
    await expect(cards).toHaveCount(2); // Low in both groups
    await urgency.getByRole('button', { name: 'Any urgency' }).click();
    await expect(cards).toHaveCount(6);

    // category (canonical, also matching the AI-6 spelling), needs attention, company
    await page.getByLabel('Category').selectOption('interview');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(cards).toHaveCount(1);
    await expect(page.getByText('Legacy: interview invitation')).toBeVisible();
    await page.getByRole('button', { name: 'Reset filters' }).click();
    await expect(cards).toHaveCount(6);
    await page.getByLabel('Needs attention only').check();
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(cards).toHaveCount(4); // a, d, f (HIGH) and b (follow-up category, no explicit state)
    await expect(page.getByText('Weekly engineering newsletter')).toHaveCount(0);
    await page.getByRole('button', { name: 'Reset filters' }).click();
    await page.getByLabel('Company', { exact: true }).fill('zeta');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(cards).toHaveCount(1);
    await page.getByRole('button', { name: 'Reset filters' }).click();
    await expect(cards).toHaveCount(6);

    // the application link opens the application; nothing about it changed
    await a.getByRole('button', { name: 'Open application QA Engineer — Interview' }).click();
    await expect(page).toHaveURL(new RegExp(`/applications/${appBefore.id}`));
    const appAfter = (await admin.from('applications').select('stage, updated_at').eq('id', appBefore.id).single()).data!;
    expect(appAfter).toEqual({ stage: appBefore.stage, updated_at: appBefore.updated_at });
    expect((await admin.from('applications').select('id', { count: 'exact', head: true }).eq('workspace_id', state.workspaceId)).count ?? 0).toBe(appsBefore);
    expect((await admin.from('tasks').select('id', { count: 'exact', head: true }).eq('workspace_id', state.workspaceId)).count ?? 0).toBe(0);

    // ---- responsive + accessibility ---------------------------------------------------------------------------
    await page.goto('/ai-hub/email');
    await expect(cards).toHaveCount(6);
    for (const w of [375, 768, 1280]) {
      await page.setViewportSize({ width: w, height: 900 });
      await expect(page.getByRole('search')).toBeVisible();
      const x = await overflow(page);
      const clipped = await page.evaluate(() => { const m = document.querySelector('main.page'); return m ? m.scrollWidth - m.clientWidth : 0; });
      expect(clipped, `no clipped content inside main at ${w}px`).toBe(0);
      expect(x, `no horizontal scroll at ${w}px`).toBe(0);
      evidence[`overflow_${w}`] = x;
      await page.screenshot({ path: resolve(shotsDir, `ai11b-email-${w}.png`), fullPage: true });
      a11y.push(await audit(page, `email-${w}`));
    }
    // keyboard: the quick filters are real buttons in the tab order
    await page.setViewportSize({ width: 1280, height: 900 });
    await group.getByRole('button', { name: 'Job related' }).focus();
    await page.keyboard.press('Enter');
    await expect(group.getByRole('button', { name: 'Job related' })).toHaveAttribute('aria-pressed', 'true');

    evidence.a11y = a11y;
    writeFileSync(resolve(evidenceDir, 'ai11b-email.json'), JSON.stringify(evidence, null, 2));
    for (const result of a11y) expect(result.blocking, `${result.context}: ${JSON.stringify(result.violations)}`).toBe(0);
  });
});
