import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

// AI-6 focused check: Job Leads, Email and Recruiter Intel pages plus Daily Digest integration
// (states, filters, details, pagination, unsafe URL suppression, long content, dismiss, responsive
// layout at 375/768/1280, keyboard, accessibility). Requires the local stack and AI_HUB_ENABLED /
// VITE_AI_HUB_ENABLED = true in the env file chosen by M1B_ENV_FILE or in the process environment.
// The flags are NOT enabled for any other spec.
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

test.describe('AI-6 external intelligence sources', () => {
  test.skip(!aiHubEnabled, 'AI Hub flags are off in this environment (default); run locally with AI_HUB_ENABLED and VITE_AI_HUB_ENABLED set');
  test.setTimeout(420_000);
  test.use({ timezoneId: 'Europe/Berlin', reducedMotion: 'reduce', actionTimeout: 20_000 });

  test('states, filters, details, pagination, dismiss, digest integration, responsive layout and accessibility', async ({ page }) => {
    const run = randomBytes(3).toString('hex');
    const evidence: Record<string, unknown> = { run, profile_timezone: TZ };
    const a11y: Awaited<ReturnType<typeof audit>>[] = [];

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Create account' }).click();
    const register = page.getByRole('form', { name: 'Register' });
    await register.getByLabel('Username (required)').fill(`ai6_${run}`);
    await register.getByLabel('Password (required)').fill(`Sources-${run}-Harbor!`);
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
    const applicationsBefore = (await admin.from('applications').select('id', { count: 'exact', head: true }).eq('workspace_id', state.workspaceId)).count ?? 0;

    // ---- 1) NOT CONFIGURED: no source has ever run -------------------------------------------------------
    for (const [path, title] of [['/ai-hub/job-leads', 'Job Leads is not configured'], ['/ai-hub/email', 'Email Intelligence is not configured'], ['/ai-hub/recruiters', 'Recruiter Intelligence is not configured']] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Open AI settings' })).toBeVisible();
    }
    await page.goto('/ai-hub/job-leads');
    await page.screenshot({ path: resolve(shotsDir, 'ai6-job-leads-not-configured-1280.png'), fullPage: true });
    a11y.push(await audit(page, 'job-leads-not-configured-1280'));

    // ---- 2) EMPTY (source ran, nothing stored) ---------------------------------------------------------------
    const now = new Date().toISOString();
    const runs = ['job_discovery', 'email_triage', 'recruiter_intel'].map((workflow) => ({ ...owner, provider: 'claude', workflow, status: 'SUCCEEDED', trigger_type: 'scheduled', started_at: now, completed_at: now }));
    expect((await admin.from('ai_runs').insert(runs)).error).toBeNull();
    await page.goto('/ai-hub/job-leads');
    await expect(page.getByRole('heading', { name: 'No job leads yet.' })).toBeVisible();
    await page.goto('/ai-hub/email');
    await expect(page.getByRole('heading', { name: 'No email intelligence yet.' })).toBeVisible();
    await page.goto('/ai-hub/recruiters');
    await expect(page.getByRole('heading', { name: 'No recruiter intelligence yet.' })).toBeVisible();

    // ---- seed: 23 job leads (pagination), a long/hostile one, 3 emails, 2 recruiters ---------------------
    const longTitle = `Very long unbroken title ${'x'.repeat(150)} <b>not bold</b>`;
    const leadFindings = Array.from({ length: 23 }, (_, i) => ({
      ...owner, kind: 'job_lead', provider: i % 5 === 0 ? 'chatgpt' : 'claude', status: 'NEW', priority: 'NORMAL', title: `Lead ${i}`, summary: `Summary ${i}`,
      dedupe_key: `url:https://jobs.example.com/${run}/${i}`, payload: { version: '1.0', company: `Company ${i}`, role_title: `Engineer ${i}`, match_reasoning: 'Matches the profile.' } as Record<string, unknown>,
    }));
    leadFindings.push({
      ...owner, kind: 'job_lead', provider: 'claude', status: 'NEW', priority: 'NORMAL', title: 'Long lead', summary: 'Long content lead',
      dedupe_key: `url:https://jobs.example.com/${run}/long`, payload: { version: '1.0', company: 'Longco', role_title: longTitle },
    });
    const inserted = await admin.from('ai_findings').insert(leadFindings).select('id, dedupe_key');
    expect(inserted.error).toBeNull();
    const idOf = (suffix: string) => inserted.data!.find((r) => r.dedupe_key.endsWith(`/${suffix}`))!.id as string;
    const description = `About the role\n${'Build reliable, well-tested systems. '.repeat(40)}\n\nRequirements\n- TypeScript\n- PostgreSQL <script>alert(1)</script>`;
    const children = leadFindings.map((f, i) => {
      const long = f.title === 'Long lead';
      return {
        finding_id: idOf(long ? 'long' : String(i)), ...owner, company: long ? 'Longco' : `Company ${i}`, title: long ? longTitle : `Engineer ${i}`,
        location: i % 2 === 0 ? 'Austin, TX' : 'Remote', work_arrangement: i % 2 === 0 ? 'hybrid' : 'remote', employment_type: 'full_time',
        source_name: 'Example Jobs', source_url: long ? 'https://user:secret@jobs.example.com/long' : `https://jobs.example.com/${run}/${i}`,
        canonical_url: long ? null : `https://jobs.example.com/${run}/${i}`, posted_date: '2026-09-28',
        salary_min: i === 0 ? 150000 : null, salary_max: i === 0 ? 190000 : null, salary_currency: i === 0 ? 'USD' : null, salary_period: i === 0 ? 'year' : null,
        match_score: i === 0 ? 92 : i === 1 ? 79 : i === 2 ? 80 : null, required_skills: ['TypeScript', 'PostgreSQL'], preferred_skills: ['Kubernetes'],
        description: i === 0 || long ? description : null, description_truncated: i === 0, description_length: i === 0 ? 31000 : long ? description.length : null,
      };
    });
    expect((await admin.from('ai_job_leads').insert(children)).error).toBeNull();
    const emailFindings = [
      { kind: 'email_event', category: 'interview_invitation', priority: 'HIGH', title: 'Interview invitation from Mailco', summary: 'Invitation to interview.', evidence: 'We would like to schedule an interview.', occurred_at: new Date(Date.now() - 5_000).toISOString(), due_at: new Date(Date.now() + 2 * 86_400_000).toISOString(), co: 'Mailco' },
      { kind: 'email_event', category: 'rejection', priority: 'LOW', title: 'Rejection from Otherco', summary: 'Not moving forward.', evidence: null, occurred_at: new Date(Date.now() - 5 * 86_400_000).toISOString(), due_at: null, co: 'Otherco' },
      { kind: 'email_event', category: 'application_confirmation', priority: 'INFO', title: `Application received ${longTitle}`, summary: null, evidence: null, occurred_at: new Date(Date.now() - 9 * 86_400_000).toISOString(), due_at: null, co: 'Longco' },
    ].map((e, i) => ({
      ...owner, kind: e.kind, provider: 'claude', status: 'NEW', category: e.category, priority: e.priority, title: e.title, summary: e.summary, evidence: e.evidence,
      occurred_at: e.occurred_at, due_at: e.due_at, dedupe_key: `ev:${run}${i}`,
      payload: { version: '1.0', sender_name: 'Pat Recruiter', sender_domain: 'example.com', subject: 'Re: your application', company: e.co, role_title: 'Engineer', next_step: i === 0 ? 'Reply with availability' : undefined },
    }));
    expect((await admin.from('ai_findings').insert(emailFindings)).error).toBeNull();
    const recruiterFindings = [
      { name: 'Pat Verified', verification: 'verified', extra: { profile_url: 'https://example.com/team/pat', related_job: { job_url: `https://jobs.example.com/${run}/0`, company: 'Company 0', title: 'Engineer 0' } } },
      { name: 'Sam Unverified', verification: 'uncertain', extra: { uncertain_fields: ['role'], related_job: { company: 'Company 9', title: 'Engineer 9' } } },
    ].map((r, i) => ({
      ...owner, kind: 'recruiter_intel', provider: i === 0 ? 'claude' : 'chatgpt', status: 'NEW', priority: 'NORMAL', title: r.name, summary: 'Public listing.',
      source_ref: { url: 'https://example.com/team' }, dedupe_key: `recruiter:${run}${i}`,
      payload: { version: '1.0', recruiter_name: r.name, company: 'Company 0', role_title: 'Technical Recruiter', relationship: 'recruiter', verification: r.verification, source_name: 'Team page', ...r.extra },
    }));
    expect((await admin.from('ai_findings').insert(recruiterFindings)).error).toBeNull();

    // ---- 3) JOB LEADS: populated, pagination, filters ----------------------------------------------------
    await page.goto('/ai-hub/job-leads');
    await expect(page.getByRole('heading', { name: 'Job Leads', level: 2 })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Job leads' }).getByRole('article')).toHaveCount(20);
    await expect(page.getByRole('navigation', { name: 'Job leads pagination' })).toBeVisible();
    await page.getByRole('navigation', { name: 'Job leads pagination' }).getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('list', { name: 'Job leads' }).getByRole('article')).toHaveCount(4);
    await expect(page.getByText('Page 2', { exact: true })).toBeVisible();
    await page.getByRole('navigation', { name: 'Job leads pagination' }).getByRole('button', { name: 'Previous' }).click();

    // credential-bearing source URL is not rendered as a link; the hostile title is text
    await page.getByLabel('Company', { exact: true }).fill('Longco');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByRole('list', { name: 'Job leads' }).getByRole('article')).toHaveCount(1);
    await expect(page.getByText(/Very long unbroken title/).first()).toBeVisible();
    await expect(page.locator('b', { hasText: 'not bold' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Open posting/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Reset filters' }).click();

    // min score + strong match
    await page.getByLabel('Minimum AI match (0–100)').fill('80');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    const cards = page.getByRole('list', { name: 'Job leads' }).getByRole('article');
    await expect(cards).toHaveCount(2); // scores 92 and 80 (79 excluded; unscored never strong)
    await expect(page.getByText('Strong match (AI match 80+)').first()).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Showing 2 job leads on page 1.' })).toHaveCount(1);
    await page.getByLabel('Provider').selectOption('chatgpt'); // lead 0 (92) was found by ChatGPT; lead 2 (80) by Claude
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(cards).toHaveCount(1);
    await expect(page.getByText('AI match 92/100')).toBeVisible();
    await page.getByLabel('Minimum AI match (0–100)').fill('150');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByText('Enter a whole number from 0 to 100').first()).toBeVisible();
    await page.getByRole('button', { name: 'Reset filters' }).click();

    // arrangement + location
    await page.getByLabel('Work arrangement').selectOption('hybrid');
    await page.getByLabel('Location').fill('austin');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(cards.filter({ hasText: 'Austin' })).not.toHaveCount(0);
    await expect(cards.filter({ hasNotText: 'Austin' })).toHaveCount(0); // every remaining card matches the filter
    await page.getByRole('button', { name: 'Reset filters' }).click();

    // date validation
    await page.getByLabel('Discovered from').fill('2026-10-05');
    await page.getByLabel('Discovered to').fill('2026-10-01');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'on or before' })).toBeVisible();
    await page.getByRole('button', { name: 'Reset filters' }).click();

    // ---- 4) JOB LEAD DETAIL: JD with truncation notice, keyboard, copy, no application actions ----------------
    await page.getByLabel('Search company or title').fill('Engineer 0');
    await page.keyboard.press('Enter'); // the form submits from the keyboard
    await expect(cards).toHaveCount(1);
    await expect(page.getByText('AI match 92/100')).toBeVisible();
    await expect(page.getByText('Published salary: USD 150,000 – 190,000 per year')).toBeVisible();
    const trigger = page.getByRole('button', { name: /View details: Engineer 0 at Company 0/ });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Job description' })).toBeVisible();
    await expect(dialog.getByText('Build reliable, well-tested systems.').first()).toBeVisible();
    await expect(dialog.getByText(/shortened to fit the 30,000-character limit/)).toBeVisible();
    await expect(dialog.getByText(/provider’s own estimate/).first()).toBeVisible();
    await expect(dialog.locator('script')).toHaveCount(0);
    await expect(dialog.getByRole('region', { name: 'Job description text' })).toHaveAttribute('tabindex', '0');
    for (const forbidden of ['Apply now', 'Create application', 'Add to applications', 'Contact recruiter']) await expect(dialog.getByRole('button', { name: forbidden })).toHaveCount(0);
    a11y.push(await audit(page, 'job-lead-detail-1280'));
    await page.screenshot({ path: resolve(shotsDir, 'ai6-job-lead-detail-1280.png') });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    // ---- 5) DISMISS: the only write action (AI row only) -------------------------------------------------------
    await page.getByLabel('Search company or title').fill('Engineer 3');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(cards).toHaveCount(1);
    await page.getByRole('button', { name: /Dismiss Engineer 3 at Company 3/ }).click();
    await page.getByRole('button', { name: 'Confirm dismiss' }).click();
    await expect(page.getByRole('heading', { name: 'No results match these filters.' })).toBeVisible();
    await page.getByLabel('Status').selectOption('DISMISSED');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(cards.getByText('Dismissed', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Reset filters' }).click();
    expect((await admin.from('applications').select('id', { count: 'exact', head: true }).eq('workspace_id', state.workspaceId)).count ?? 0).toBe(applicationsBefore);

    // ---- 6) EMAIL ----------------------------------------------------------------------------------------------
    await page.goto('/ai-hub/email');
    await expect(page.getByRole('heading', { name: 'Email Intelligence', level: 2 })).toBeVisible();
    const emails = page.getByRole('article'); // AI-11B: the list is split into Job related / Other mail and High / Medium / Low sections
    await expect(emails).toHaveCount(3);
    await expect(page.getByText('Pat Recruiter (example.com)').first()).toBeVisible();
    await expect(page.getByText('We would like to schedule an interview.')).toBeVisible();
    await expect(page.getByText('cannot send, reply to or change any email')).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Reply|Send|Archive|Delete)/ })).toHaveCount(0);
    await page.getByLabel('Needs attention only').check();
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(emails).toHaveCount(1);
    await expect(page.getByText('Needs attention').first()).toBeVisible();
    await page.getByRole('button', { name: 'Reset filters' }).click();
    await page.getByLabel('Category').selectOption('rejection');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(emails).toHaveCount(1);
    await expect(page.getByText('Rejection from Otherco')).toBeVisible();
    await page.getByRole('button', { name: 'Reset filters' }).click();
    await page.getByLabel('Company', { exact: true }).fill('mailco');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(emails).toHaveCount(1);
    await page.getByRole('button', { name: 'Reset filters' }).click();
    await expect(page.locator('b', { hasText: 'not bold' })).toHaveCount(0);

    // ---- 7) RECRUITERS -----------------------------------------------------------------------------------------
    await page.goto('/ai-hub/recruiters');
    await expect(page.getByRole('heading', { name: 'Recruiters to connect with', level: 2 })).toBeVisible(); // AI-11E: grouped page
    const recruiters = page.getByRole('article'); // AI-11E: the list is split into Job-linked / Target companies / Other groups
    await expect(recruiters).toHaveCount(2);
    await expect(recruiters.getByText('Verified', { exact: true })).toBeVisible();
    await expect(recruiters.getByText('Uncertain', { exact: true })).toBeVisible();
    await expect(page.getByText('Not verified: the company or role association was not proven (role)')).toBeVisible();
    await expect(page.getByText('Engineer 0 at Company 0', { exact: true })).toBeVisible(); // resolved inside the owner's scope
    await expect(page.getByText(/reported by the provider; not in your job leads/)).toBeVisible();
    await expect(page.getByText(/contactable/i)).toHaveCount(0);
    await page.getByLabel('Provider').selectOption('chatgpt');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(recruiters).toHaveCount(1);
    await page.getByRole('button', { name: 'Reset filters' }).click();

    // ---- 8) OVERVIEW + TABS ------------------------------------------------------------------------------------------
    await page.goto('/ai-hub');
    await expect(page.getByRole('heading', { name: 'New job leads' })).toBeVisible().catch(() => undefined);
    await expect(page.getByText('New job leads').first()).toBeVisible();
    await expect(page.getByText('Email needing attention')).toBeVisible();
    await expect(page.getByText('Recruiter intel').first()).toBeVisible();
    for (const tab of ['Overview', 'Daily Digest', 'Job Leads', 'Email', 'Recruiter Intel', 'Calendar', 'History']) await expect(page.getByRole('tab', { name: tab })).toBeVisible(); // AI-7: Calendar is operational
    await page.getByRole('button', { name: 'Open Job Leads' }).click();
    await expect(page).toHaveURL(/\/ai-hub\/job-leads$/);

    // ---- 9) DAILY DIGEST integration ---------------------------------------------------------------------------------
    await page.goto('/ai-hub/digest');
    await page.getByRole('button', { name: 'Save a JobQuest digest for today' }).click();
    await expect(page.getByText('Saved today’s JobQuest digest.')).toBeVisible();
    const avail = page.getByRole('list', { name: 'Source availability' });
    // AI-11C canonical sections: leads, job-related email and recruiters are composed from the stored AI-6 records
    await expect(avail.getByText('Recent job leads: Available')).toBeVisible();
    await expect(avail.getByText('Job-related email: Available')).toBeVisible();
    await expect(avail.getByText('Recruiters: Available')).toBeVisible();
    await expect(page.getByText('Recent jobs', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Needs attention' })).toBeVisible();

    // ---- 10) RESPONSIVE + ACCESSIBILITY on all three pages --------------------------------------------------------------
    for (const path of ['/ai-hub/job-leads', '/ai-hub/email', '/ai-hub/recruiters']) {
      await page.goto(path);
      for (const w of [375, 768, 1280]) {
        await page.setViewportSize({ width: w, height: 900 });
        await expect(page.getByRole('search')).toBeVisible();
        const x = await overflow(page);
        // the page container itself must not be clipped (the document can report 0 overflow while an inner container hides content)
        const clipped = await page.evaluate(() => { const m = document.querySelector('main.page'); return m ? m.scrollWidth - m.clientWidth : 0; });
        expect(clipped, `no clipped content inside main at ${w}px on ${path}`).toBe(0);
        evidence[`overflow_${path.split('/').pop()}_${w}`] = x;
        expect(x, `no horizontal scroll on ${path} at ${w}px`).toBe(0);
        await page.screenshot({ path: resolve(shotsDir, `ai6-${path.split('/').pop()}-${w}.png`), fullPage: true });
        a11y.push(await audit(page, `${path}-${w}`));
      }
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    // detail dialog on a phone
    await page.goto('/ai-hub/job-leads');
    await page.setViewportSize({ width: 375, height: 800 });
    await page.getByLabel('Search company or title').fill('Engineer 0');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await page.getByRole('button', { name: /View details: Engineer 0/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await overflow(page), 'no horizontal scroll with the detail dialog at 375px').toBe(0);
    a11y.push(await audit(page, 'job-lead-detail-375'));
    await page.screenshot({ path: resolve(shotsDir, 'ai6-job-lead-detail-375.png') });

    evidence.a11y = a11y;
    writeFileSync(resolve(evidenceDir, 'ai6-sources.json'), JSON.stringify(evidence, null, 2));
    for (const result of a11y) expect(result.blocking, `${result.context}: ${JSON.stringify(result.violations)}`).toBe(0);
  });
});
