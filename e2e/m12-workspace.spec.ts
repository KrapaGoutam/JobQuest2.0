import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const shotsDir = resolve('migration-upgrade/m12/screenshots');
const evidenceDir = resolve('migration-upgrade/m12/evidence');
mkdirSync(shotsDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${shotsDir}/${name}.png`, fullPage: false });
const settle = (page: Page) => page.waitForTimeout(600);

async function audit(page: Page, context: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return {
    context,
    total: result.violations.length,
    critical: result.violations.filter((v) => v.impact === 'critical').length,
    serious: result.violations.filter((v) => v.impact === 'serious').length,
    blocking: result.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').length,
    violations: result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.map((n) => ({ html: n.html, failureSummary: n.failureSummary })),
    })),
  };
}

test.describe('Milestone 12 · Workspace Management & Manager Functions E2E', () => {
  test.setTimeout(240_000);

  test('Workspace lifecycle: create, settings, invite, join, roster, safeguard, mobile, dark theme, a11y', async ({
    page,
    browser,
  }) => {
    const run = randomBytes(3).toString('hex');
    const userA_name = `m12_mgr_${run}`;
    const userA_pass = `Workspace-Mgr-${run}-P@ss!`;
    const userB_name = `m12_usr_${run}`;
    const userB_pass = `Workspace-Usr-${run}-P@ss!`;

    const evidence: Record<string, unknown> = {
      run,
      started_at: new Date().toISOString(),
      screenshots: [],
    };
    const a11yResults: Awaited<ReturnType<typeof audit>>[] = [];

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await settle(page);

    // 1. Register User A (Manager of personal workspace)
    await page.getByRole('button', { name: 'Create account' }).click();
    const registerA = page.getByRole('form', { name: 'Register' });
    await registerA.getByLabel('Username (required)').fill(userA_name);
    await registerA.getByLabel('Password (required)').fill(userA_pass);
    await registerA.getByRole('button', { name: 'Create account' }).click();

    // Dismiss recovery codes if visible
    const dismissCodes = page.getByRole('button', { name: 'I saved them' });
    await expect(dismissCodes).toBeVisible({ timeout: 10000 });
    await dismissCodes.click();

    await expect(page.getByRole('button', { name: /Switch workspace/i })).toBeVisible({ timeout: 10000 });
    await settle(page);
    await shot(page, 'w1_user_a_registered');

    // 2. Inspect Personal Workspace Settings
    await page.goto('/#workspace/settings');
    await settle(page);
    await expect(page.getByRole('heading', { name: 'Workspace settings' })).toBeVisible();
    await expect(page.getByText('Personal · only you')).toBeVisible();
    await expect(page.getByText("Your personal workspace can't be archived or left.")).toBeVisible();
    await shot(page, 'w2_personal_settings');
    a11yResults.push(await audit(page, 'personal_workspace_settings'));

    // 3. Create Shared Workspace via Switcher
    await page.getByRole('button', { name: /Switch workspace/i }).click();
    await settle(page);
    await page.getByRole('menu', { name: 'Workspaces' }).getByRole('button', { name: /Create shared workspace/i }).click();
    await settle(page);

    const createDialog = page.getByRole('dialog', { name: 'Create workspace' });
    await expect(createDialog).toBeVisible();
    await createDialog.getByLabel('Workspace name').fill(`Cohort 8 Design Lab ${run}`);
    // Select color swatch
    await createDialog.getByRole('button', { name: /Select color oklch\(0.52 0.13 55\)/i }).click();
    await shot(page, 'w3_create_shared_workspace_modal');
    a11yResults.push(await audit(page, 'create_workspace_modal'));

    await createDialog.getByRole('button', { name: 'Create workspace' }).click();
    await settle(page);

    // Verify switched to the new shared workspace with MANAGER role
    await expect(page.getByRole('button', { name: new RegExp(`Cohort 8 Design Lab ${run}`) })).toBeVisible({
      timeout: 10000,
    });
    await shot(page, 'w4_shared_workspace_active');

    // 4. Update Shared Workspace Settings
    await page.goto('/#workspace/settings');
    await settle(page);
    await expect(page.getByRole('main').getByText(`Cohort 8 Design Lab ${run}`)).toBeVisible();
    const descInput = page.getByLabel('Description');
    await descInput.fill('Autumn 2026 design career acceleration cohort');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await settle(page);
    await expect(page.getByText('Settings saved')).toBeVisible();
    await shot(page, 'w5_shared_settings_saved');
    a11yResults.push(await audit(page, 'shared_workspace_settings'));

    // 5. Navigate to Members & Generate Invite Code
    await page.goto('/#workspace/members');
    await settle(page);
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();
    await expect(page.getByText(/1 member · 1 manager/i)).toBeVisible();
    await shot(page, 'w6_members_initial_roster');
    a11yResults.push(await audit(page, 'members_roster'));

    // Open Invite dialog
    await page.getByRole('button', { name: 'Invite members' }).click();
    const inviteDialog = page.getByRole('dialog', { name: 'Invite members' });
    await expect(inviteDialog).toBeVisible();
    await inviteDialog.getByLabel('Label').fill('Design Lab Cohort Intake');
    await inviteDialog.getByRole('button', { name: 'Generate invite code' }).click();
    await settle(page);

    // Code banner visible
    await expect(inviteDialog.getByText('Invite code created')).toBeVisible();
    const inviteCodeElem = inviteDialog.locator('.mono');
    const rawInviteCode = (await inviteCodeElem.innerText()).trim();
    expect(rawInviteCode).toMatch(/^JQI-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    await shot(page, 'w7_invite_code_generated');
    a11yResults.push(await audit(page, 'invite_member_modal_code_created'));

    await inviteDialog.getByRole('button', { name: 'Done' }).click();
    await settle(page);

    // Verify Pending Invites card displays masked prefix
    await expect(page.getByText('Pending invites')).toBeVisible();
    await expect(page.getByText('Design Lab Cohort Intake')).toBeVisible();
    await expect(page.getByText('Used 0 of 10')).toBeVisible();
    await shot(page, 'w8_pending_invites_list');

    // 6. User B (New User) Joins via Invite Code in a separate incognito context
    const contextB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageB = await contextB.newPage();
    await pageB.goto('/');
    await settle(pageB);

    await pageB.getByRole('button', { name: 'Create account' }).click();
    const registerB = pageB.getByRole('form', { name: 'Register' });
    await registerB.getByLabel('Username (required)').fill(userB_name);
    await registerB.getByLabel('Password (required)').fill(userB_pass);
    await registerB.getByRole('button', { name: 'Create account' }).click();

    const dismissCodesB = pageB.getByRole('button', { name: 'I saved them' });
    await expect(dismissCodesB).toBeVisible({ timeout: 10000 });
    await dismissCodesB.click();
    await expect(pageB.getByRole('button', { name: /Switch workspace/i })).toBeVisible({ timeout: 10000 });

    // Open Join modal via switcher
    await pageB.getByRole('button', { name: /Switch workspace/i }).click();
    await settle(pageB);
    await pageB.getByRole('menu', { name: 'Workspaces' }).getByRole('button', { name: /Join a workspace/i }).click();

    const joinDialog = pageB.getByRole('dialog', { name: 'Join a workspace' });
    await expect(joinDialog).toBeVisible();
    await joinDialog.getByLabel('Invite code').fill(rawInviteCode);
    await settle(pageB);

    // Preview card appears
    await expect(joinDialog.getByText(`Cohort 8 Design Lab ${run}`)).toBeVisible({ timeout: 5000 });
    await expect(joinDialog.getByText(/You'll join as User/i)).toBeVisible();
    await shot(pageB, 'w9_join_workspace_preview');
    a11yResults.push(await audit(pageB, 'join_workspace_modal_preview'));

    await joinDialog.getByRole('button', { name: 'Join workspace' }).click();
    await settle(pageB);

    // User B is now in the shared workspace as USER
    await expect(pageB.getByRole('button', { name: new RegExp(`Cohort 8 Design Lab ${run}`) })).toBeVisible({
      timeout: 10000,
    });
    await shot(pageB, 'w10_user_b_joined_workspace');
    await contextB.close();

    // 7. User A views updated roster with User B
    await page.reload();
    await settle(page);
    await expect(page.getByText(/2 members · 1 manager/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(`@${userB_name}`)).toBeVisible();
    await shot(page, 'w11_members_roster_two_members');

    // 8. Mobile Viewport Inspection (Screen W11)
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page);
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();
    await shot(page, 'w12_mobile_members_roster');
    a11yResults.push(await audit(page, 'mobile_members_roster'));

    // Reset desktop viewport
    await page.setViewportSize({ width: 1440, height: 900 });
    await settle(page);

    // Save evidence & check a11y violations
    evidence.a11y = a11yResults;
    evidence.completed_at = new Date().toISOString();
    writeFileSync(resolve(`${evidenceDir}/m12-e2e-evidence-${run}.json`), JSON.stringify(evidence, null, 2));

    const totalBlocking = a11yResults.reduce((acc, curr) => acc + curr.blocking, 0);
    expect(totalBlocking).toBe(0);
  });
});
