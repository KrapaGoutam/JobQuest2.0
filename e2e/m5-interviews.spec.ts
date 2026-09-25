import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * M5 · Interviews & Debriefs E2E (Gate 02B 05-interviews.html I1–I5).
 * One registered user per run (the deployed register limit is 3/hour/IP).
 * The browser runs in Europe/Berlin while the profile uses America/Chicago and
 * then Asia/Kolkata: every time on screen must follow the PROFILE zone.
 */
const shotsDir = resolve('migration-upgrade/m5/screenshots');
const evidenceDir = resolve('migration-upgrade/m5/evidence');
mkdirSync(shotsDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });

const target = process.env.M1_BASE_URL ? 'vercel-preview' : process.env.M1B_TARGET === 'hosted-dev' ? 'local-servers-hosted-dev' : 'local';
const shot = (page: Page, name: string) => page.screenshot({ path: `${shotsDir}/${name}.png`, fullPage: false });
const settle = (page: Page) => page.waitForTimeout(500);

async function audit(page: Page, context: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const blocking = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  return {
    context,
    total: r.violations.length,
    critical: r.violations.filter((v) => v.impact === 'critical').length,
    serious: r.violations.filter((v) => v.impact === 'serious').length,
    violations: r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.length,
      targets: v.nodes.slice(0, 6).map((n) => n.target.join(' ')),
    })),
    blocking: blocking.length,
  };
}

/** YYYY-MM-DD for `days` from now, on the calendar of `timeZone`. */
function dayIn(timeZone: string, days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Wait for a dialog to close; if it stays open, fail with the text it shows (validation/server error). */
async function expectClosed(dialog: import('@playwright/test').Locator) {
  try {
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  } catch {
    throw new Error(`Dialog stayed open: ${(await dialog.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 600)}`);
  }
}

test.use({ timezoneId: 'Europe/Berlin' });

test.describe('Milestone 5 — Interviews & Debriefs E2E', () => {
  test.setTimeout(240_000);
  test.use({ actionTimeout: 15_000 });

  test('schedule, prepare, edit, debrief, explicit stage move, time zones, application drawer, mobile, keyboard, states, a11y', async ({ page }) => {
    const run = randomBytes(3).toString('hex');
    const company = `Halcyon Health ${run}`;
    const role = 'Senior Product Designer';
    const evidence: Record<string, unknown> = { target, run, started_at: new Date().toISOString(), browser_time_zone: 'Europe/Berlin' };
    const a11y: Awaited<ReturnType<typeof audit>>[] = [];

    // ---------------------------------------------------------------- register (Option B)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const reg = page.getByRole('form', { name: 'Register' });
    await reg.getByLabel('Username (required)').fill(`m5_e2e_${run}`);
    await reg.getByLabel('Password (required)').fill(`Interview-Pulse-${run}-Key!`);
    await reg.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByTestId('recovery-codes').locator('li')).toHaveCount(10);
    await page.getByRole('button', { name: 'I saved them' }).click();
    await expect(page.getByTestId('new-application-btn')).toBeVisible();
    // The workspace switcher reflects the real membership (personal workspace creator = MANAGER).
    await expect(page.getByRole('button', { name: /Switch workspace/ })).toContainText('MANAGER');

    // ---------------------------------------------------------------- application at Recruiter Screen
    await page.getByTestId('new-application-btn').click();
    await page.locator('#app-company').fill(company);
    await page.locator('#app-role').fill(role);
    await page.locator('#app-stage-select').selectOption('RECRUITER_SCREEN');
    await page.getByRole('button', { name: 'Create Application' }).click();
    const appRow = page.getByTestId('application-row').filter({ hasText: company });
    await expect(appRow).toBeVisible();

    // ---------------------------------------------------------------- contact (participant)
    await page.click('a[href="#/contacts"], button:has-text("Contacts")');
    await expect(page.locator('h1:has-text("Contacts")')).toBeVisible();
    await page.getByRole('button', { name: 'New contact' }).click();
    await page.locator('#contact-name').fill(`Dana Cole ${run}`);
    await page.locator('#contact-company').fill(company);
    await page.getByRole('dialog', { name: 'New contact' }).getByRole('button', { name: 'Save contact' }).click();
    await expect(page.getByRole('dialog', { name: 'New contact' })).toBeHidden();

    // ---------------------------------------------------------------- I1 empty state
    await page.click('a[href="#/interviews"], button:has-text("Interviews")');
    await expect(page.getByRole('heading', { name: 'Interviews', level: 1 })).toBeVisible();
    await expect(page.getByText('No upcoming interviews')).toBeVisible();
    evidence['E2E-01-route-empty'] = 'PASS';

    // ---------------------------------------------------------------- I3 schedule (profile zone America/Chicago, keep stage)
    await page.getByRole('button', { name: 'Schedule interview' }).first().click();
    const dlg = page.getByRole('dialog', { name: 'Schedule interview' });
    await expect(dlg).toBeVisible();
    await dlg.getByRole('button', { name: 'Change' }).click();
    await dlg.getByLabel('Profile time zone').selectOption('America/Chicago');
    await expect(dlg.getByTestId('profile-timezone')).toContainText('America/Chicago');
    await dlg.getByLabel(/^Application\*?$/).selectOption({ label: `${company} · ${role} (Recruiter Screen)` });
    await dlg.getByLabel(/^Interview type\*?$/).selectOption('RECRUITER_SCREEN');
    const upcomingDay = dayIn('America/Chicago', 3);
    await dlg.getByLabel(/^Date\*?$/).fill(upcomingDay);
    await dlg.getByLabel(/^Time\*?$/).fill('14:30');
    await dlg.getByLabel(/^Duration\*?$/).selectOption('30');
    await dlg.getByLabel('Meeting link').fill('https://zoom.example/j/8812');
    await dlg.getByRole('checkbox', { name: `Dana Cole ${run}` }).check();
    await dlg.getByLabel('Preparation notes').fill('Salary range answer: 150–175k. Ask about the patient-app rewrite.');
    await dlg.getByLabel('Questions expected').fill('Why Halcyon? Walk through a project with measurable impact.');
    await expect(dlg.getByRole('radio', { name: 'Keep at Recruiter Screen' })).toHaveAttribute('aria-checked', 'true');
    await expect(dlg.getByRole('radio', { name: 'Move to Interview' })).toBeVisible();
    await shot(page, 'interview-schedule');
    a11y.push(await audit(page, 'schedule-form'));
    await dlg.getByRole('button', { name: 'Schedule', exact: true }).click();
    await expectClosed(dlg);

    const row = page.getByTestId('interview-row').filter({ hasText: company }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('2:30 PM');
    await expect(row).toContainText('Recruiter screen · round 1');
    await expect(row).toContainText(`with Dana Cole ${run}`);
    await expect(page.getByTestId('interview-summary')).toContainText('1 upcoming');
    evidence['E2E-02-schedule'] = 'PASS';

    // A second interview after the US daylight-saving change renders in CST.
    await page.getByRole('button', { name: 'Schedule interview' }).first().click();
    await dlg.getByLabel(/^Application\*?$/).selectOption({ label: `${company} · ${role} (Recruiter Screen)` });
    await dlg.getByLabel(/^Interview type\*?$/).selectOption('TECHNICAL');
    await dlg.getByLabel(/^Date\*?$/).fill('2026-11-02');
    await dlg.getByLabel(/^Time\*?$/).fill('14:30');
    await dlg.getByRole('button', { name: 'Schedule', exact: true }).click();
    await expectClosed(dlg);
    const dstRow = page.getByTestId('interview-row').filter({ hasText: 'Technical · round 2' });
    await expect(dstRow).toContainText('2:30 PM');
    await dstRow.getByRole('button', { name: /^Open Technical/ }).first().click();
    await expect(page.getByTestId('interview-when')).toContainText('Mon, Nov 2 · 2:30 PM–3:15 PM CST');
    // A time inside the spring-forward gap is rejected with a clear message.
    await page.getByRole('button', { name: 'Schedule interview' }).first().click();
    await dlg.getByLabel(/^Application\*?$/).selectOption({ label: `${company} · ${role} (Recruiter Screen)` });
    await dlg.getByLabel(/^Date\*?$/).fill('2027-03-14');
    await dlg.getByLabel(/^Time\*?$/).fill('02:30');
    await dlg.getByRole('button', { name: 'Schedule', exact: true }).click();
    await expect(dlg.getByText(/does not exist on 2027-03-14 in America\/Chicago/)).toBeVisible();
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    evidence['E2E-03-dst'] = { cst_after_fall_back: 'PASS', spring_forward_gap_rejected: 'PASS' };

    // ---------------------------------------------------------------- I2 detail: preparation + questions, edit
    await row.getByRole('button', { name: /^Open Recruiter screen/ }).first().click();
    const detail = page.getByTestId('interview-detail');
    await expect(detail).toBeVisible();
    await expect(page.getByTestId('interview-when')).toContainText('2:30 PM–3:00 PM CDT');
    await expect(detail.getByLabel('Preparation notes')).toHaveValue(/Salary range answer/);
    await expect(detail.getByLabel('Questions expected')).toHaveValue(/Why Halcyon/);
    await detail.getByLabel('Preparation notes').fill('Salary range answer: 160–180k. Ask about team size.');
    await detail.getByRole('button', { name: 'Save preparation notes' }).click();
    await expect(detail.getByRole('button', { name: 'Save preparation notes' })).toBeHidden();
    await shot(page, 'interview-detail');
    a11y.push(await audit(page, 'interview-detail'));
    await shot(page, 'interview-preparation');
    evidence['E2E-04-preparation'] = 'PASS';

    await detail.getByRole('button', { name: 'Edit interview' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit interview' });
    await expect(edit.getByLabel(/^Time\*?$/)).toHaveValue('14:30');
    await edit.getByLabel(/^Time\*?$/).fill('15:00');
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expectClosed(edit);
    await expect(row).toContainText('3:00 PM');
    evidence['E2E-05-edit'] = 'PASS';

    // ---------------------------------------------------------------- profile zone change re-renders every time
    await page.getByRole('button', { name: 'Schedule interview' }).first().click();
    await dlg.getByRole('button', { name: 'Change' }).click();
    await dlg.getByLabel('Profile time zone').selectOption('Asia/Kolkata');
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    // 15:00 CDT = 20:00Z = 01:30 IST the next day.
    await expect(row).toContainText('1:30 AM');
    await page.getByRole('button', { name: 'Schedule interview' }).first().click();
    await dlg.getByRole('button', { name: 'Change' }).click();
    await dlg.getByLabel('Profile time zone').selectOption('America/Chicago');
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await expect(row).toContainText('3:00 PM');
    evidence['E2E-06-profile-timezone'] = { chicago: '3:00 PM', kolkata: '1:30 AM', browser_zone_ignored: true };

    // ---------------------------------------------------------------- list screenshots (light + dark)
    await shot(page, 'interviews-list-light');
    a11y.push(await audit(page, 'interviews-list'));
    const dark = page.getByRole('radio', { name: 'Dark mode' });
    if (await dark.isVisible()) {
      await dark.click();
      await settle(page);
      await shot(page, 'interviews-list-dark');
      a11y.push(await audit(page, 'interviews-list-dark'));
      await page.getByRole('radio', { name: 'Light mode' }).click();
      await settle(page);
    }
    await shot(page, 'interviews-manager-view'); // personal-workspace MANAGER: owner filter shown
    await expect(page.getByLabel('Owner')).toBeVisible();

    // ---------------------------------------------------------------- application drawer: schedule (explicit stage move) + debrief
    await page.click('a[href="#/applications"], button:has-text("Applications")');
    await expect(appRow).toBeVisible();
    await expect(appRow).toContainText('Recruiter Screen'); // scheduling did not move the stage
    await appRow.getByText(role).click();
    const drawer = page.getByRole('dialog', { name: `${role} · ${company}` });
    await expect(drawer).toBeVisible();
    const section = drawer.getByTestId('application-interviews');
    await expect(section).toContainText('Interviews · 2');
    await section.getByRole('button', { name: 'Schedule interview' }).click();
    const dlg2 = page.getByRole('dialog', { name: 'Schedule interview' });
    await dlg2.getByLabel(/^Interview type\*?$/).selectOption('PANEL');
    await dlg2.getByLabel(/^Date\*?$/).fill(dayIn('America/Chicago', -1));
    await dlg2.getByLabel(/^Time\*?$/).fill('10:00');
    await dlg2.getByRole('radio', { name: 'Move to Interview' }).click();
    await dlg2.getByRole('button', { name: 'Schedule', exact: true }).click();
    await expectClosed(dlg2);
    await expect(drawer.getByText('Stage: Recruiter Screen → Interview')).toBeVisible({ timeout: 10_000 });
    await expect(drawer.getByText(/Interview scheduled: Panel · round 3/)).toBeVisible();
    evidence['E2E-07-explicit-stage-move'] = 'PASS';

    const needs = section.locator('li[data-status="needs_outcome"]');
    await expect(needs).toHaveCount(1);
    await needs.getByRole('button', { name: 'Record outcome' }).click();
    const out = page.getByRole('dialog', { name: 'How did it go?' });
    await expect(out).toBeVisible();
    await out.getByRole('radio', { name: 'Advanced' }).click();
    await out.getByLabel('Next step they mentioned').fill('Decision by early October');
    await out.getByLabel('Questions they asked').fill('Walk through the design-system migration.');
    await out.getByLabel(/^Notes(\(optional\))?$/).fill('Strong rapport with the panel.');
    await out.getByRole('radio', { name: 'To send' }).click();
    await out.getByLabel(/^Next action(\(optional\))?$/).fill('Send thank-you note');
    await shot(page, 'interview-debrief');
    a11y.push(await audit(page, 'debrief-form'));
    await out.getByRole('button', { name: 'Save outcome' }).click();
    await expectClosed(out);
    await expect(section.locator('li[data-status="completed"]')).toContainText('Advanced');
    await expect(drawer.getByText('Panel completed: Advanced')).toBeVisible({ timeout: 10_000 });
    await expect(drawer.getByText('Send thank-you note')).toBeVisible();
    // The debrief did not move the stage: still Interview (from the explicit move only).
    await expect(drawer.getByText('Stage: Interview →')).toHaveCount(0);
    await shot(page, 'application-interview-section');
    a11y.push(await audit(page, 'application-drawer-interviews'));
    await drawer.getByRole('button', { name: 'Close drawer' }).click();
    evidence['E2E-08-debrief'] = 'PASS';

    // ---------------------------------------------------------------- past tab + debrief detail
    await page.click('a[href="#/interviews"], button:has-text("Interviews")');
    await page.getByRole('tab', { name: /Past/ }).click();
    const pastRow = page.getByTestId('interview-row').filter({ hasText: 'Panel · round 3' });
    await expect(pastRow).toContainText('Advanced');
    await pastRow.getByRole('button', { name: /^Open Panel/ }).first().click();
    await expect(page.getByTestId('interview-debrief')).toContainText('Decision by early October');

    // ---------------------------------------------------------------- keyboard: tabs + open with Enter
    await page.getByRole('tab', { name: /Past/ }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: /Needs outcome/ })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: /Upcoming/ })).toHaveAttribute('aria-selected', 'true');
    await row.getByRole('button', { name: /^Open Recruiter screen/ }).first().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('interview-when')).toContainText('3:00 PM');
    evidence['E2E-09-keyboard'] = 'PASS';

    // ---------------------------------------------------------------- error + retry, loading
    await page.route(/\/rest\/v1\/interviews\?/, (r) => r.abort());
    await page.getByRole('tab', { name: /Past/ }).click();
    await expect(page.getByRole('status', { name: 'Loading interviews' })).toBeVisible(); // no stale rows from the previous tab
    await expect(page.getByText(/Could not load interviews/)).toBeVisible({ timeout: 30_000 }); // after supabase-js retries
    await page.unroute(/\/rest\/v1\/interviews\?/);
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByTestId('interview-row').first()).toBeVisible();
    evidence['E2E-10-error-retry'] = 'PASS';

    // ---------------------------------------------------------------- I5 mobile
    await page.getByRole('tab', { name: /Upcoming/ }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page);
    await expect(page.getByRole('heading', { name: 'Interviews', level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(page, 'interviews-mobile');
    await row.getByRole('button', { name: /^Open Recruiter screen/ }).first().click();
    const sheet = page.getByRole('dialog', { name: 'Recruiter screen' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('link', { name: /Join video/ })).toBeVisible();
    await expect(sheet.getByLabel('Questions expected')).toHaveValue(/Why Halcyon/);
    await shot(page, 'interview-mobile-detail');
    a11y.push(await audit(page, 'mobile-interview'));
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    evidence['E2E-11-mobile'] = { overflow_px: overflow };
    await page.setViewportSize({ width: 1440, height: 900 });

    const blocking = a11y.reduce((n, a) => n + a.blocking, 0);
    evidence.completed_at = new Date().toISOString();
    evidence.status = blocking === 0 ? 'PASS' : 'FAIL';
    writeFileSync(`${evidenceDir}/e2e-${target}-${run}.json`, JSON.stringify({ evidence, a11y }, null, 2), 'utf8');
    expect(blocking, JSON.stringify(a11y, null, 2)).toBe(0);
  });
});
