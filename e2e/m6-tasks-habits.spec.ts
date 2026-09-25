import { test, expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

/**
 * M6 · Tasks, Habits & Unified Queue E2E (Gate 02B 04-tasks T1–T6, 06 H1–H3, dashboard D1).
 * One registered user per run (the deployed register limit is 3/hour/IP).
 * Browser zone Europe/Berlin; profile zone America/Chicago — dates follow the profile.
 */
const shotsDir = resolve('migration-upgrade/m6/screenshots');
const evidenceDir = resolve('migration-upgrade/m6/evidence');
mkdirSync(shotsDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });

const target = process.env.M1_BASE_URL ? 'vercel-preview' : process.env.M1B_TARGET === 'hosted-dev' ? 'local-servers-hosted-dev' : 'local';
const shot = (page: Page, name: string) => page.screenshot({ path: `${shotsDir}/${name}.png`, fullPage: false });
const settle = (page: Page) => page.waitForTimeout(400);
const TZ = 'America/Chicago';
const dayIn = (days: number) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + days * 86_400_000));

/** Service client for one fixture step (backdating an application); reads the same env file as the servers. */
function serviceClient() {
  const file = process.env.M1B_ENV_FILE ?? '.env.m1b-local';
  const env: Record<string, string> = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i > 0) env[line.slice(0, i)] = line.slice(i + 1).replace(/^"|"$/g, '');
    }
  }
  return createClient(env.SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
}

async function audit(page: Page, context: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return {
    context,
    total: r.violations.length,
    critical: r.violations.filter((v) => v.impact === 'critical').length,
    serious: r.violations.filter((v) => v.impact === 'serious').length,
    violations: r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.length,
      targets: v.nodes.slice(0, 6).map((n) => {
        const d = (n.any[0]?.data ?? {}) as { fgColor?: string; bgColor?: string; contrastRatio?: number };
        return { target: n.target.join(' '), html: n.html.slice(0, 160), fg: d.fgColor, bg: d.bgColor, ratio: d.contrastRatio };
      }),
    })),
    blocking: r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').length,
  };
}
async function expectClosed(dialog: Locator) {
  try {
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  } catch {
    throw new Error(`Dialog stayed open: ${(await dialog.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 600)}`);
  }
}
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name, exact: true }).click();

test.use({ timezoneId: 'Europe/Berlin' });

test.describe('Milestone 6 — Tasks, Habits & Unified Queue E2E', () => {
  test.setTimeout(300_000);
  test.use({ actionTimeout: 15_000 });

  test('tasks, recurrence, next actions, queue, habits, contacts/interviews integration, mobile, keyboard, states, a11y', async ({ page }) => {
    const run = randomBytes(3).toString('hex');
    const evidence: Record<string, unknown> = { target, run, started_at: new Date().toISOString(), browser_time_zone: 'Europe/Berlin', profile_time_zone: TZ };
    const a11y: Awaited<ReturnType<typeof audit>>[] = [];
    const meridian = `Meridian Bank ${run}`;
    const quietCo = `Vantage Retail ${run}`;

    // ------------------------------------------------------------ register + profile zone
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const reg = page.getByRole('form', { name: 'Register' });
    await reg.getByLabel('Username (required)').fill(`m6_e2e_${run}`);
    await reg.getByLabel('Password (required)').fill(`Queue-Pulse-${run}-Key!`);
    await reg.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByTestId('recovery-codes').locator('li')).toHaveCount(10);
    await page.getByRole('button', { name: 'I saved them' }).click();
    await expect(page.getByTestId('new-application-btn')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notifications' })).toBeVisible(); // no fake unread count

    // ------------------------------------------------------------ fixtures through the UI
    await page.getByTestId('new-application-btn').click();
    await page.locator('#app-company').fill(meridian);
    await page.locator('#app-role').fill('UX Designer');
    await page.locator('#app-stage-select').selectOption('APPLIED');
    await page.locator('#app-next-action').fill('Final follow-up or close');
    await page.locator('#app-next-action-date').fill(dayIn(-4));
    await page.getByRole('button', { name: 'Create Application' }).click();
    await expect(page.getByTestId('application-row').filter({ hasText: meridian })).toBeVisible();
    await page.getByTestId('new-application-btn').click();
    await page.locator('#app-company').fill(quietCo);
    await page.locator('#app-role').fill('Designer');
    await page.getByRole('button', { name: 'Create Application' }).click();
    await expect(page.getByTestId('application-row').filter({ hasText: quietCo })).toBeVisible();

    // Profile zone via the M5 control (shared profile setting).
    await nav(page, 'Interviews');
    await page.getByRole('button', { name: 'Schedule interview' }).first().click();
    const idlg = page.getByRole('dialog', { name: 'Schedule interview' });
    await idlg.getByRole('button', { name: 'Change' }).click();
    await idlg.getByLabel('Profile time zone').selectOption(TZ);
    // Interview tomorrow with the M6 reminder (canonical REMINDER task).
    await idlg.getByLabel(/^Application\*?$/).selectOption({ label: `${meridian} · UX Designer (Applied)` });
    await idlg.getByLabel(/^Date\*?$/).fill(dayIn(1));
    await idlg.getByLabel(/^Time\*?$/).fill('14:30');
    await expect(idlg.getByRole('checkbox', { name: /Remind me 1 hour before/ })).toBeChecked();
    await idlg.getByRole('button', { name: 'Schedule', exact: true }).click();
    await expectClosed(idlg);

    // Contact with a follow-up date (M4 form) → canonical FOLLOW_UP task.
    await nav(page, 'Contacts');
    await page.getByRole('button', { name: 'New contact' }).click();
    await page.locator('#contact-name').fill(`Jonah Wells ${run}`);
    await page.locator('#next-follow-up').fill(dayIn(2));
    await page.getByRole('dialog', { name: 'New contact' }).getByRole('button', { name: 'Save contact' }).click();
    await expectClosed(page.getByRole('dialog', { name: 'New contact' }));

    // ------------------------------------------------------------ T1 today: next action is overdue
    await nav(page, 'Tasks & Follow-ups');
    await expect(page.getByRole('heading', { name: 'Tasks & Follow-ups', level: 1 })).toBeVisible();
    const rows = page.getByTestId('queue-row');
    const nextRow = rows.filter({ hasText: 'Final follow-up or close' });
    await expect(nextRow).toHaveAttribute('data-kind', 'NEXT_ACTION');
    await expect(nextRow).toHaveAttribute('data-state', 'overdue');
    await expect(nextRow).toContainText('4d overdue');
    evidence['E2E-01-next-action-in-queue'] = 'PASS';

    // ------------------------------------------------------------ T3 new recurring task
    await page.getByRole('button', { name: 'New task' }).click();
    const tdlg = page.getByRole('dialog', { name: 'New task' });
    await tdlg.getByLabel(/^Title\*?$/).fill('Update portfolio case study');
    await tdlg.getByRole('radio', { name: 'High' }).click();
    await tdlg.getByRole('button', { name: 'Today', exact: true }).click();
    await tdlg.getByLabel(/^Repeat/).selectOption('WEEKLY');
    await expect(tdlg.getByTestId('recurrence-hint')).toContainText('When you complete it, the next one is created for');
    await shot(page, 'task-new-recurring');
    a11y.push(await audit(page, 'task-form'));
    await tdlg.getByRole('button', { name: 'Create task' }).click();
    await expectClosed(tdlg);
    const weekly = rows.filter({ hasText: 'Update portfolio case study' });
    await expect(weekly).toHaveAttribute('data-state', 'today');

    // T4 new follow-up linked to the application (tomorrow) and a timed reminder.
    await page.getByRole('button', { name: 'New follow-up' }).click();
    const fdlg = page.getByRole('dialog', { name: 'New follow-up' });
    await fdlg.getByRole('button', { name: 'Create follow-up' }).click();
    await expect(fdlg.getByText('Enter a title.')).toBeVisible(); // validation
    await fdlg.getByLabel(/^Title\*?$/).fill('Send 2nd follow-up');
    await fdlg.getByLabel(/^Follow up on\*?$/).selectOption({ label: `${meridian} · UX Designer` });
    await fdlg.getByRole('button', { name: 'Tomorrow', exact: true }).click();
    await shot(page, 'task-new-follow-up');
    await fdlg.getByRole('button', { name: 'Create follow-up' }).click();
    await expectClosed(fdlg);
    evidence['E2E-02-create'] = 'PASS';
    await shot(page, 'tasks-list-light');
    a11y.push(await audit(page, 'tasks-list'));
    const dark = page.getByRole('radio', { name: 'Dark mode' });
    if (await dark.isVisible()) {
      await dark.click();
      await settle(page);
      await shot(page, 'tasks-list-dark');
      a11y.push(await audit(page, 'tasks-list-dark'));
      await page.getByRole('radio', { name: 'Light mode' }).click();
    }

    // ------------------------------------------------------------ complete recurring + undo
    await weekly.getByRole('button', { name: 'Complete Update portfolio case study' }).click();
    await expect(page.getByText('Completed: Update portfolio case study')).toBeVisible();
    await expect(page.getByTestId('completed-row').filter({ hasText: 'Update portfolio case study' })).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).first().click();
    await expect(weekly).toBeVisible();
    await weekly.getByRole('button', { name: 'Complete Update portfolio case study' }).click();
    await expect(page.getByTestId('completed-row').filter({ hasText: 'Update portfolio case study' })).toBeVisible();
    await page.getByRole('tab', { name: /Upcoming/ }).click();
    await expect(rows.filter({ hasText: 'Update portfolio case study' })).toBeVisible(); // next weekly occurrence
    await expect(rows.filter({ hasText: 'Send 2nd follow-up' })).toHaveAttribute('data-kind', 'FOLLOW_UP');
    await expect(rows.filter({ hasText: `Follow up with Jonah Wells ${run}` })).toHaveAttribute('data-kind', 'FOLLOW_UP'); // from the contact form
    const rem = rows.filter({ hasText: 'Interview: Recruiter Screen · round 1' });
    await expect(rem).toHaveAttribute('data-kind', 'REMINDER');
    await expect(rem).toContainText('Tomorrow · 1:30 PM'); // 1 hour before 2:30 PM, in the profile zone
    evidence['E2E-03-recurrence-undo-reminders'] = 'PASS';

    // ------------------------------------------------------------ Done, set next
    await page.getByRole('tab', { name: /Today/ }).click();
    await nextRow.getByRole('button', { name: /^Done, set next/ }).click();
    const dsn = page.getByRole('dialog', { name: 'Done, set next' });
    await dsn.getByLabel(/^Next action\*?$/).fill('Send thank-you note');
    await dsn.getByRole('button', { name: 'In 1 week' }).click();
    await shot(page, 'task-done-set-next');
    await dsn.getByRole('button', { name: 'Save next action' }).click();
    await expectClosed(dsn);
    await expect(rows.filter({ hasText: 'Final follow-up or close' })).toHaveCount(0);
    evidence['E2E-04-done-set-next'] = 'PASS';

    // ------------------------------------------------------------ T2 detail, edit, snooze, cancel
    await page.getByRole('tab', { name: /Upcoming/ }).click();
    const fu = rows.filter({ hasText: 'Send 2nd follow-up' });
    await fu.getByRole('button', { name: 'Open Send 2nd follow-up' }).click();
    const detail = page.getByTestId('task-detail');
    await expect(detail).toContainText(meridian);
    await shot(page, 'task-detail');
    a11y.push(await audit(page, 'task-detail'));
    await detail.getByRole('button', { name: 'Edit', exact: true }).click();
    const edlg = page.getByRole('dialog', { name: 'Edit follow-up' });
    await edlg.getByLabel(/^Title\*?$/).fill('Send 2nd follow-up (with portfolio)');
    await edlg.getByRole('button', { name: 'Save changes' }).click();
    await expectClosed(edlg);
    const fu2 = rows.filter({ hasText: 'Send 2nd follow-up (with portfolio)' });
    await fu2.getByRole('button', { name: /^Snooze/ }).click();
    await page.getByRole('menuitem', { name: 'Next week' }).click();
    await expect(page.getByText('Snoozed: Send 2nd follow-up (with portfolio)')).toBeVisible();
    await fu2.getByRole('button', { name: 'Open Send 2nd follow-up (with portfolio)' }).click();
    await page.getByTestId('task-detail').getByRole('button', { name: 'Cancel task' }).click();
    await page.getByRole('dialog', { name: 'Cancel this task?' }).getByRole('button', { name: 'Cancel task' }).click();
    await expect(fu2).toHaveCount(0);
    evidence['E2E-05-edit-snooze-cancel'] = 'PASS';

    // ------------------------------------------------------------ filters + keyboard
    await page.getByRole('button', { name: 'Next actions', exact: true }).click();
    await expect(rows.filter({ hasText: 'Send thank-you note' })).toBeVisible();
    await expect(rows.filter({ hasText: 'Update portfolio case study' })).toHaveCount(0);
    await page.getByRole('button', { name: 'All types', exact: true }).click();
    await page.getByRole('tab', { name: /Upcoming/ }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: /No date/ })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: /Today/ })).toHaveAttribute('aria-selected', 'true');
    evidence['E2E-06-filters-keyboard'] = 'PASS';
    a11y.push(await audit(page, 'tasks-list-after-actions'));

    // ------------------------------------------------------------ error + retry
    await page.route(/\/rest\/v1\/tasks\?/, (r) => r.abort());
    await page.getByRole('tab', { name: /No date/ }).click();
    await expect(page.getByRole('status', { name: 'Loading tasks' })).toBeVisible();
    await expect(page.getByText(/Could not load tasks/)).toBeVisible({ timeout: 30_000 });
    await page.unroute(/\/rest\/v1\/tasks\?/);
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText('No undated items')).toBeVisible();
    evidence['E2E-07-error-retry-empty'] = 'PASS';

    // Overdue task linked to the contact (queue ordering: overdue first).
    await page.getByRole('button', { name: 'New task' }).first().click();
    const odlg = page.getByRole('dialog', { name: 'New task' });
    await odlg.getByLabel(/^Title\*?$/).fill('Ask Jonah for intro');
    await odlg.getByLabel(/^Linked to/).selectOption({ label: `Jonah Wells ${run}` });
    await odlg.getByLabel('Date', { exact: true }).fill(dayIn(-2));
    await odlg.getByRole('button', { name: 'Create task' }).click();
    await expectClosed(odlg);

    // ------------------------------------------------------------ D1 dashboard + quiet review
    const svc = serviceClient();
    const { data: quietApp } = await svc.from('applications').select('id').eq('company_name', quietCo).single();
    await svc.from('applications').update({ last_activity_at: new Date(Date.now() - 40 * 86_400_000).toISOString() }).eq('id', quietApp!.id);
    await nav(page, 'Dashboard');
    await expect(page.getByRole('heading', { name: 'What needs attention today', level: 1 })).toBeVisible();
    await expect(page.getByTestId('dash-interview').first()).toContainText(meridian);
    const quietRow = page.getByTestId('dash-quiet').filter({ hasText: quietCo });
    await expect(quietRow).toContainText('Long Waiting · 40d');
    await expect(page.getByTestId('dash-stats')).toContainText('1 to review');
    await expect(page.getByTestId('dash-stats')).toContainText('1 overdue');
    await expect(page.getByTestId('queue-row').first()).toContainText('Ask Jonah for intro');
    await expect(page.getByTestId('queue-row').first()).toContainText('2d overdue');
    await shot(page, 'dashboard-light');
    a11y.push(await audit(page, 'dashboard'));
    await quietRow.getByRole('button', { name: `Keep ${quietCo} active` }).click();
    await expect(quietRow).toHaveCount(0);
    await expect(page.getByTestId('dash-stats')).toContainText('0 to review');
    evidence['E2E-08-dashboard-review'] = 'PASS';

    // ------------------------------------------------------------ application drawer integration
    await nav(page, 'Applications');
    await page.getByTestId('application-row').filter({ hasText: meridian }).getByText('UX Designer').click();
    const drawer = page.getByRole('dialog', { name: `UX Designer · ${meridian}` });
    const tcard = drawer.getByTestId('application-tasks');
    await expect(tcard).toContainText('Interview: Recruiter Screen · round 1'); // reminder linked via the interview
    await tcard.getByRole('button', { name: 'Add task' }).click();
    const adlg = page.getByRole('dialog', { name: 'New task' });
    await expect(adlg.getByLabel(/^Linked to/)).toHaveValue(/^a:/);
    await adlg.getByLabel(/^Title\*?$/).fill('Prepare salary answer');
    await adlg.getByRole('button', { name: 'Create task' }).click();
    await expectClosed(adlg);
    await expect(tcard).toContainText('Prepare salary answer');
    await drawer.getByRole('button', { name: 'Close drawer' }).click();
    evidence['E2E-09-application-integration'] = 'PASS';

    // ------------------------------------------------------------ H1/H2 habits
    await nav(page, 'Habits');
    await expect(page.getByText('No active habits')).toBeVisible();
    await page.getByRole('button', { name: 'New habit' }).first().click();
    const hdlg = page.getByRole('dialog', { name: 'New habit' });
    await hdlg.getByLabel(/^Name\*?$/).fill('Apply to 3 roles');
    await hdlg.getByRole('button', { name: 'Increase target' }).click();
    await hdlg.getByRole('button', { name: 'Increase target' }).click();
    await shot(page, 'habit-edit');
    a11y.push(await audit(page, 'habit-form'));
    await hdlg.getByRole('button', { name: 'Save' }).click();
    await expectClosed(hdlg);
    await page.getByRole('button', { name: 'New habit' }).first().click();
    await hdlg.getByLabel(/^Name\*?$/).fill('Review pipeline');
    await hdlg.getByRole('radio', { name: 'Weekly' }).click();
    await hdlg.getByRole('button', { name: 'Save' }).click();
    await expectClosed(hdlg);
    const counted = page.getByTestId('habit-row').filter({ hasText: 'Apply to 3 roles' });
    await counted.getByRole('button', { name: 'Increase Apply to 3 roles' }).click();
    await expect(counted).toContainText('1 / 3');
    await counted.getByRole('button', { name: 'Increase Apply to 3 roles' }).click();
    await expect(counted).toContainText('2 / 3');
    await counted.getByRole('button', { name: 'Decrease Apply to 3 roles' }).click();
    await expect(counted).toContainText('1 / 3');
    const weeklyHabit = page.getByTestId('habit-row').filter({ hasText: 'Review pipeline' });
    await weeklyHabit.getByRole('button', { name: 'Check in Review pipeline this week' }).click();
    await expect(weeklyHabit).toHaveAttribute('data-done', 'true');
    await expect(weeklyHabit.getByTestId('habit-streak')).toContainText('1 weeks');
    await expect(page.getByTestId('habits-summary')).toContainText('1 of 2 done');
    await expect(page.getByText(/Weekly habits use your week start \(Monday\)/)).toBeVisible();
    await shot(page, 'habits-light');
    a11y.push(await audit(page, 'habits'));
    // Pause: leaves Today, keeps history.
    await counted.getByRole('button', { name: 'Edit Apply to 3 roles' }).click();
    const hedit = page.getByRole('dialog', { name: 'Edit habit' });
    await hedit.getByRole('checkbox', { name: /Active/ }).uncheck();
    await hedit.getByRole('button', { name: 'Save' }).click();
    await expectClosed(hedit);
    await expect(counted).toHaveCount(0);
    await page.getByRole('tab', { name: /History/ }).click();
    await expect(page.getByTestId('habit-history-row').filter({ hasText: 'Apply to 3 roles' })).toContainText('paused');
    evidence['E2E-10-habits'] = 'PASS';

    // ------------------------------------------------------------ mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page);
    await nav(page, 'Dashboard').catch(async () => { await page.goto('/#/dashboard'); });
    await expect(page.getByRole('heading', { name: 'What needs attention today', level: 1 })).toBeVisible();
    await shot(page, 'dashboard-mobile');
    await page.goto(page.url().replace(/#.*$/, '#/tasks'));
    await expect(page.getByRole('heading', { name: 'Tasks & Follow-ups', level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(page, 'tasks-mobile');
    a11y.push(await audit(page, 'tasks-mobile'));
    await page.goto(page.url().replace(/#.*$/, '#/habits'));
    await expect(page.getByRole('heading', { name: 'Habits', level: 1 })).toBeVisible();
    await shot(page, 'habits-mobile');
    evidence['E2E-11-mobile'] = { overflow_px: overflow };
    await page.setViewportSize({ width: 1440, height: 900 });

    const blocking = a11y.reduce((n, a) => n + a.blocking, 0);
    evidence.completed_at = new Date().toISOString();
    evidence.status = blocking === 0 ? 'PASS' : 'FAIL';
    writeFileSync(`${evidenceDir}/e2e-${target}-${run}.json`, JSON.stringify({ evidence, a11y }, null, 2), 'utf8');
    expect(blocking, JSON.stringify(a11y, null, 2)).toBe(0);
  });
});
