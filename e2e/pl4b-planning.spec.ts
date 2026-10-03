import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { zonedWallTimeToUtcIso } from '../apps/web/src/lib/time';

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

function serviceClient() {
  const env = environment();
  return createClient(env.SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
}

function profileDay(days = 0): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + days * 86_400_000));
}

async function audit(page: Page, context: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return {
    context,
    violations: result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        html: node.html,
        failureSummary: node.failureSummary,
      })),
    })),
    blocking: result.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious').length,
  };
}

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
}

test.use({ timezoneId: 'Europe/Berlin', reducedMotion: 'reduce' });

test.describe('PL-4B Calendar, Timeline, and Archive', () => {
  test.setTimeout(300_000);
  test.use({ actionTimeout: 20_000 });

  test('canonical events, honest ranges, archive restores, responsive layout, and accessibility', async ({ page }) => {
    const run = randomBytes(3).toString('hex');
    const company = `Atlas Planning ${run}`;
    const followUp = `Follow up with Rowan ${run}`;
    const taskTitle = `Prepare case study ${run}`;
    const archiveNames = {
      application: `Archived Orbit ${run}`,
      contact: `Archived Contact ${run}`,
      habit: `Archived Habit ${run}`,
      document: `Archived Resume ${run}`,
    };
    const a11y: Awaited<ReturnType<typeof audit>>[] = [];
    const evidence: Record<string, unknown> = { run, profile_timezone: TZ, browser_timezone: 'Europe/Berlin' };

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Create account' }).click();
    const register = page.getByRole('form', { name: 'Register' });
    await register.getByLabel('Username (required)').fill(`pl4b_${run}`);
    await register.getByLabel('Password (required)').fill(`Planning-${run}-Harbor!`);
    await register.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByTestId('recovery-codes').locator('li')).toHaveCount(10);
    await page.getByRole('button', { name: 'I saved them' }).click();
    await page.goto('/applications');
    await expect(page.getByTestId('new-application-btn')).toBeVisible();

    await expect.poll(() => page.evaluate(() => {
      const value = (window as unknown as { __jqState?: { user?: { active_workspace_id?: string }; activeWs?: string } }).__jqState;
      return value?.activeWs ?? value?.user?.active_workspace_id ?? '';
    })).toBeTruthy();
    const state = await page.evaluate(() => {
      const value = (window as unknown as { __jqState?: { user?: { id?: string; active_workspace_id?: string }; activeWs?: string } }).__jqState;
      return { userId: value?.user?.id ?? '', workspaceId: value?.activeWs ?? value?.user?.active_workspace_id ?? '' };
    });
    expect(state.userId).toBeTruthy();
    expect(state.workspaceId).toBeTruthy();

    const admin = serviceClient();
    await admin.from('profiles').update({ timezone: TZ, week_start: 1 }).eq('user_id', state.userId);
    const today = profileDay();
    const createdAt = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const stageAt = new Date(Date.now() - 6 * 86_400_000).toISOString();
    const interviewAt = zonedWallTimeToUtcIso(today, '14:30', TZ);
    const archivedAt = new Date(Date.now() - 2 * 86_400_000).toISOString();

    const primary = await admin.from('applications').insert({
      workspace_id: state.workspaceId,
      user_id: state.userId,
      company_name: company,
      role_title: 'Staff Product Engineer',
      stage: 'INTERVIEW',
      next_action: `Send thank-you note ${run}`,
      next_action_date: today,
      created_at: createdAt,
      last_activity_at: stageAt,
    }).select('id').single();
    expect(primary.error).toBeNull();
    const applicationId = primary.data!.id as string;
    const stageEvent = await admin.from('application_events').insert({
      application_id: applicationId,
      workspace_id: state.workspaceId,
      actor_id: state.userId,
      event_type: 'STAGE_CHANGED',
      payload: { from_stage: 'APPLIED', to_stage: 'INTERVIEW' },
      created_at: stageAt,
    });
    expect(stageEvent.error).toBeNull();
    const contact = await admin.from('contacts').insert({
      workspace_id: state.workspaceId,
      user_id: state.userId,
      full_name: `Rowan Recruiter ${run}`,
      relationship_type: 'RECRUITER',
    }).select('id').single();
    expect(contact.error).toBeNull();
    const fixtures = await Promise.all([
      admin.from('interviews').insert({
        workspace_id: state.workspaceId,
        user_id: state.userId,
        application_id: applicationId,
        interview_type: 'TECHNICAL',
        round_number: 2,
        scheduled_at: interviewAt,
        duration_minutes: 45,
        format: 'VIDEO',
      }),
      admin.from('tasks').insert({
        workspace_id: state.workspaceId,
        user_id: state.userId,
        application_id: applicationId,
        task_type: 'TASK',
        title: taskTitle,
        due_date: today,
        priority: 'HIGH',
      }),
      admin.from('tasks').insert({
        workspace_id: state.workspaceId,
        user_id: state.userId,
        contact_id: contact.data!.id,
        task_type: 'FOLLOW_UP',
        title: followUp,
        due_date: today,
        priority: 'MEDIUM',
      }),
    ]);
    for (const fixture of fixtures) expect(fixture.error).toBeNull();

    const archivedApplication = await admin.from('applications').insert({
      workspace_id: state.workspaceId, user_id: state.userId, company_name: archiveNames.application, role_title: 'Designer', archived_at: archivedAt,
    }).select('id').single();
    const archivedContact = await admin.from('contacts').insert({
      workspace_id: state.workspaceId, user_id: state.userId, full_name: archiveNames.contact, relationship_type: 'CONTACT', archived_at: archivedAt,
    }).select('id').single();
    const archivedHabit = await admin.from('habits').insert({
      workspace_id: state.workspaceId, user_id: state.userId, title: archiveNames.habit, frequency: 'DAILY', archived_at: archivedAt,
    }).select('id').single();
    const archivedDocument = await admin.from('resumes').insert({
      workspace_id: state.workspaceId, user_id: state.userId, name: archiveNames.document, document_type: 'RESUME', archived_at: archivedAt,
    }).select('id').single();
    for (const fixture of [archivedApplication, archivedContact, archivedHabit, archivedDocument]) expect(fixture.error).toBeNull();

    await page.goto(`/calendar?date=${today}`);
    await expect(page.getByTestId('calendar-view')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible();
    const agenda = page.locator('.calendar-event-list');
    await expect(agenda.getByText(taskTitle, { exact: true })).toBeVisible();
    await expect(agenda.getByText(followUp, { exact: true })).toHaveCount(1);
    await expect(agenda.getByText(`Send thank-you note ${run}`, { exact: true })).toBeVisible();
    await expect(agenda.getByText(/Technical · round 2/)).toBeVisible();
    await expect(page.getByLabel('Calendar owner')).toBeVisible();
    await page.getByRole('button', { name: 'Previous month' }).click();
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`calendar\\?date=${today}`));
    await page.screenshot({ path: `${shotsDir}/pl4b-calendar-desktop.png`, fullPage: false });
    a11y.push(await audit(page, 'calendar-desktop'));

    await page.getByRole('button', { name: 'Timeline', exact: true }).click();
    await expect(page.getByTestId('timeline-view')).toBeVisible();
    await expect(page.getByText('Stage changed to Interview')).toBeVisible();
    await expect(page.getByText(taskTitle, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Duration' }).click();
    await expect(page.locator('.timeline-bar.stage').first()).toBeVisible();
    await expect(page.locator('.timeline-bar.interview').first()).toBeVisible();
    await expect(page.getByText(/Point events never become invented bars/i)).toBeVisible();
    await page.screenshot({ path: `${shotsDir}/pl4b-timeline-desktop.png`, fullPage: false });
    a11y.push(await audit(page, 'timeline-duration-desktop'));

    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(page.getByTestId('archive-view')).toBeVisible();
    for (const name of Object.values(archiveNames)) await expect(page.getByText(name, { exact: true })).toBeVisible();
    await page.screenshot({ path: `${shotsDir}/pl4b-archive-desktop.png`, fullPage: false });
    a11y.push(await audit(page, 'archive-desktop'));

    const dark = page.getByRole('radio', { name: 'Dark mode' });
    if (await dark.isVisible()) {
      await dark.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running' && !animation.pending));
      a11y.push(await audit(page, 'archive-dark'));
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/calendar?date=${today}`);
    await expect(page.getByTestId('calendar-view')).toBeVisible();
    await expect(page.locator('.desktop-calendar')).toBeHidden();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    a11y.push(await audit(page, 'calendar-mobile'));
    await page.goto('/timeline?range=90&mode=duration');
    await expect(page.locator('.timeline-duration-grid')).toBeHidden();
    await expect(page.locator('.timeline-mobile-lanes')).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    a11y.push(await audit(page, 'timeline-mobile'));
    await page.goto('/archive');
    await expect(page.getByRole('button', { name: new RegExp(`Restore application ${archiveNames.application}`) })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    a11y.push(await audit(page, 'archive-mobile'));

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/archive');
    for (const [domain, name] of Object.entries(archiveNames) as [keyof typeof archiveNames, string][]) {
      const singular = domain === 'application' ? 'application' : domain === 'contact' ? 'contact' : domain === 'habit' ? 'habit' : 'document';
      const button = page.getByRole('button', { name: new RegExp(`Restore ${singular} ${name}`) });
      await button.click();
      await expect(page.getByText(name, { exact: true })).toHaveCount(0);
    }
    const restored = await Promise.all([
      admin.from('applications').select('archived_at').eq('id', archivedApplication.data!.id).single(),
      admin.from('contacts').select('archived_at').eq('id', archivedContact.data!.id).single(),
      admin.from('habits').select('archived_at').eq('id', archivedHabit.data!.id).single(),
      admin.from('resumes').select('archived_at').eq('id', archivedDocument.data!.id).single(),
    ]);
    expect(restored.every((result) => result.data?.archived_at === null)).toBe(true);

    evidence.calendar = 'PASS';
    evidence.timeline = 'PASS';
    evidence.archive_domains_restored = 4;
    evidence.mobile_overflow_px = 0;
    evidence.a11y = a11y;
    evidence.completed_at = new Date().toISOString();
    writeFileSync(`${evidenceDir}/pl4b-planning-${run}.json`, JSON.stringify(evidence, null, 2));
    expect(a11y.every((result) => result.blocking === 0), JSON.stringify(a11y, null, 2)).toBe(true);
  });
});
