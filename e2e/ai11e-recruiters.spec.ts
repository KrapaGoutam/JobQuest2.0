import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

// AI-11E focused check: Settings -> AI & Automation -> Recruiter Intelligence (WHO is useful to connect with: target companies, roles,
// bounds; no credentials, no scheduling) and the upgraded AI Hub Recruiter Intel page (job-linked / target-company groups, Verified vs
// Uncertain, evidence-based "why", drafts that are never sent, the read-only application relation, recruiter source health), at
// 375/768/1280 with accessibility audits. Requires the local stack and AI_HUB_ENABLED / VITE_AI_HUB_ENABLED = true in the env file
// chosen by M1B_ENV_FILE.
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

test.describe('AI-11E recruiter intelligence', () => {
  test.skip(!aiHubEnabled, 'AI Hub flags are off in this environment (default); run locally with AI_HUB_ENABLED and VITE_AI_HUB_ENABLED set');
  test.setTimeout(300_000);
  test.use({ timezoneId: TZ, reducedMotion: 'reduce', actionTimeout: 20_000 });

  test('Recruiter Intelligence settings and the Recruiter Intel page: groups, verification, drafts, application relation, source health, responsive layout and accessibility', async ({ page }) => {
    const run = randomBytes(3).toString('hex');
    const evidence: Record<string, unknown> = { run };
    const a11y: Awaited<ReturnType<typeof audit>>[] = [];

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Create account' }).click();
    const register = page.getByRole('form', { name: 'Register' });
    await register.getByLabel('Username (required)').fill(`ai11e_${run}`);
    await register.getByLabel('Password (required)').fill(`Recruit-${run}-Harbor!`);
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

    // ---- 1) SETTINGS: Recruiter Intelligence is its own concept, separate from Job Discovery, Providers and Automations -----------
    await page.goto('/settings/ai');
    await page.waitForLoadState('networkidle');
    const section = page.locator('section[aria-labelledby="ai-recruiter-intelligence"]');
    await expect(page.locator('#ai-recruiter-intelligence')).toHaveText('Recruiter Intelligence');
    await expect(section.getByTestId('recruiter-prefs-summary')).toContainText('Nothing saved yet');
    await expect(section.getByText(/Which provider researches is set under Providers/)).toBeVisible();
    await expect(section.getByText(/token|secret|password|api key|oauth|cron|schedule|every day/i)).toHaveCount(0); // WHO is useful, never credentials or timing
    const order = await page.locator('main section[aria-labelledby]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-labelledby')));
    expect(order.indexOf('ai-job-discovery')).toBeLessThan(order.indexOf('ai-recruiter-intelligence'));
    expect(order.indexOf('ai-recruiter-intelligence')).toBeLessThan(order.indexOf('ai-automations'));
    a11y.push(await audit(page, 'settings-empty-1280'));

    // validation points at the field before any request
    await section.locator('label').filter({ hasText: /Target-company networking/ }).click();
    await section.getByRole('button', { name: 'Save recruiter preferences' }).click();
    await expect(section.getByText('Add at least one company to turn on target-company networking.')).toBeVisible();
    const acme = `Acme${run}`, globex = `Globex${run}`;
    await section.getByLabel('Target companies').fill(`${acme}\n${globex}\n${acme.toUpperCase()}\n`);
    await section.getByLabel('Maximum new contacts per run').fill('11');
    await section.getByRole('button', { name: 'Save recruiter preferences' }).click();
    await expect(section.getByText('A whole number 1–10.')).toBeVisible();
    await section.getByLabel('Maximum new contacts per run').fill('3');
    await section.locator('label').filter({ hasText: 'Hiring manager (when verifiable)' }).click();
    await section.getByRole('button', { name: 'Save recruiter preferences' }).click();
    await expect(section.getByText('Saved.')).toBeVisible();
    await expect(section.getByTestId('recruiter-prefs-summary')).toContainText('Saved preferences:');
    await expect(section.getByTestId('recruiter-prefs-summary')).toContainText('2 target companies'); // the repeated spelling counted once
    const row = (await admin.from('ai_recruiter_discovery_preferences').select('*').eq('user_id', state.userId).single()).data!;
    expect(row).toMatchObject({ job_linked_enabled: true, target_networking_enabled: true, target_companies: [acme, globex], max_new_contacts_per_run: 3, draft_outreach_enabled: true });
    expect(row.preferred_roles).toContain('hiring_manager');
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(section.getByLabel('Maximum new contacts per run')).toHaveValue('3');
    await expect(section.getByLabel('Target companies')).toHaveValue(`${acme}\n${globex}`);
    expect((await admin.from('ai_workflow_configs').select('id', { count: 'exact', head: true }).eq('user_id', state.userId)).count).toBe(0); // no automation was created implicitly
    a11y.push(await audit(page, 'settings-prefs-1280'));
    for (const w of [768, 375]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(150);
      expect(await overflow(page), `settings overflow @${w}`).toBe(0);
      a11y.push(await audit(page, `settings-${w}`));
    }
    await page.setViewportSize({ width: 375, height: 900 });
    await page.screenshot({ path: resolve(shotsDir, 'ai11e-settings-375.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });

    // ---- 2) RECRUITER INTEL: seed a lead, an application and four people --------------------------------------------------------
    const leadUrl = `https://jobs.example.com/${run}/qa`;
    const leadFinding = await admin.from('ai_findings').insert({ ...owner, kind: 'job_lead', provider: 'claude', status: 'NEW', priority: 'NORMAL', title: `QA Engineer at ${acme}`, summary: 'Lead', dedupe_key: `url:${leadUrl}`, payload: { version: '1.0', company: acme, role_title: 'QA Engineer' } }).select('id').single();
    expect(leadFinding.error).toBeNull();
    expect((await admin.from('ai_job_leads').insert({
      finding_id: leadFinding.data!.id, ...owner, company: acme, title: 'QA Engineer', location: 'Remote', work_arrangement: 'remote', employment_type: 'full_time', source_name: 'example jobs',
      source_url: leadUrl, canonical_url: leadUrl, posted_at: new Date(Date.now() - 3_600_000).toISOString(), freshness_at: new Date(Date.now() - 3_600_000).toISOString(), remote_scope: 'us', match_score: 80,
    })).error).toBeNull();
    const app = await admin.from('applications').insert({ ...owner, company_name: `${acme} Inc.`, role_title: 'QA Engineer', stage: 'APPLIED' }).select('id, stage, updated_at').single();
    expect(app.error).toBeNull();

    const people = [
      { key: 'a', name: `Riley Jobs${run}`, company: acme, role: 'Technical Recruiter', rel: 'technical_recruiter', verification: 'verified', basis: 'job_posting', posting: true, mode: 'job_linked',
        why: 'Named as the contact in the posting.', related: { job_url: leadUrl, company: acme, title: 'QA Engineer' }, note: 'Hi Riley, I work in QA automation and would value connecting about the QA Engineer role.' },
      { key: 'b', name: `Tia Target${run}`, company: globex, role: 'QA Manager', rel: 'qa_manager', verification: 'uncertain', basis: null, posting: false, mode: 'target_company',
        why: 'Company is on your target list.', uncertain: ['role'], note: 'Hi Tia, I am a QA automation engineer and would value connecting.', email: { subject: 'QA automation engineer', body: 'Hi Tia,\n\nI work in QA automation and would welcome a short conversation.\n\nThanks' } },
      { key: 'c', name: `Olu Other${run}`, company: `Initech${run}`, role: 'Talent Acquisition Partner', rel: 'talent_acquisition', verification: 'verified', basis: 'company_page', posting: false, mode: null,
        why: 'Technical recruiting role is shown on the careers page.', contact: { email: `olu${run}@example.org`, source: 'https://example.org/contact' } },
      { key: 'd', name: `Dee Dismissed${run}`, company: `Hooli${run}`, role: 'Technical Recruiter', rel: 'technical_recruiter', verification: 'verified', basis: 'company_page', posting: false, mode: 'target_company', why: null, dismissed: true },
    ];
    const inserted = await admin.from('ai_findings').insert(people.map((p) => ({
      ...owner, kind: 'recruiter_intel', provider: 'claude', status: p.dismissed ? 'DISMISSED' : 'NEW', priority: 'NORMAL', confidence: 0.7, title: `${p.name}, ${p.company}`, summary: `Summary ${p.key}`,
      source_ref: { url: `https://${p.company.toLowerCase()}.example.com/team` }, dedupe_key: `recruiter:e2e:${run}:${p.key}`,
      payload: {
        version: '1.0', recruiter_name: p.name, company: p.company, company_key: p.company.toLowerCase(), role_title: p.role, relationship: p.rel, verification: p.verification,
        ...(p.basis ? { verification_basis: p.basis } : {}), ...(p.uncertain ? { uncertain_fields: p.uncertain } : {}), ...(p.posting ? { posting_contact: true } : {}), ...(p.mode ? { discovery_mode: p.mode } : {}),
        ...(p.why ? { why: p.why } : {}), source_name: `${p.company} team page`, profile_url: `https://${p.company.toLowerCase()}.example.com/team/${p.key}`,
        ...(p.related ? { related_job: p.related, related_job_key: `url:${leadUrl}` } : {}), ...(p.note ? { draft_note: p.note } : {}), ...(p.email ? { draft_email: p.email } : {}),
        ...(p.contact ? { contact_email: p.contact.email, contact_source_url: p.contact.source, contact_email_basis: 'published' } : {}),
      },
    }))).select('id');
    expect(inserted.error).toBeNull();
    const seedRun = async (status: string, sources: unknown[]) => {
      const r = await admin.rpc('rpc_ai_ingest_run', { p_actor_id: state.userId, p_workspace_id: state.workspaceId, p_provider: 'claude', p_workflow: 'recruiter_intel', p_external_run_id: `e2e-${run}-${status}-${Math.random().toString(36).slice(2, 7)}`, p_trigger_type: 'manual', p_schema_version: '1.0', p_status: 'RUNNING', p_sources: sources });
      expect(r.error).toBeNull();
      expect((await admin.rpc('rpc_ai_finalize_run', { p_actor_id: state.userId, p_run_id: r.data.run_id, p_status: status })).error).toBeNull();
    };
    await seedRun('SUCCEEDED', [{ type: 'web', ref: 'prospecting tool', status: 'unavailable', note: 'connector off' }, { type: 'web', ref: 'careers pages', status: 'blocked' }]);
    const core = async () => {
      const counts: Record<string, number> = {};
      for (const t of ['contacts', 'tasks', 'interviews']) counts[t] = (await admin.from(t).select('id', { count: 'exact', head: true }).eq('workspace_id', state.workspaceId)).count ?? 0;
      return { counts, apps: (await admin.from('applications').select('id, stage, updated_at').eq('workspace_id', state.workspaceId).order('id')).data };
    };
    const coreBefore = await core();

    await page.goto('/ai-hub/recruiters');
    await expect(page.getByRole('heading', { name: 'Recruiters to connect with', level: 2 })).toBeVisible();
    const cards = page.getByRole('article');
    await expect(cards).toHaveCount(3); // the dismissed person is hidden by the default Active view

    // groups
    for (const [id, title] of [['job_linked', 'Job-linked'], ['target_company', 'Target companies'], ['other', 'Other']] as const) {
      await expect(page.getByTestId(`recruiter-group-${id}`).getByRole('heading', { name: title, level: 3 })).toBeVisible();
    }
    const jobLinked = page.getByTestId('recruiter-group-job_linked');
    const riley = jobLinked.getByRole('article', { name: `Riley Jobs${run}, ${acme}` });
    await expect(riley.getByText('Verified', { exact: true })).toBeVisible();
    await expect(riley.getByText('Named in the posting')).toBeVisible();
    await expect(riley.getByText('Technical recruiter', { exact: true })).toBeVisible();
    await expect(riley.getByText('Named as the contact in the posting.')).toBeVisible();
    await expect(riley.getByText('Role being hired for')).toBeVisible();
    await expect(riley.getByText(`QA Engineer at ${acme}`)).toBeVisible(); // the stored lead, resolved in the owner scope
    await expect(riley.getByText('job posting', { exact: false }).first()).toBeVisible();
    // the application relation is derived and read-only
    await expect(riley.getByText('You already have an application for this job')).toBeVisible();

    const target = page.getByTestId('recruiter-group-target_company');
    const tia = target.getByRole('article', { name: `Tia Target${run}, ${globex}` });
    await expect(tia.getByText('Uncertain', { exact: true })).toBeVisible(); // never silently upgraded
    await expect(tia.getByText('Verified', { exact: true })).toHaveCount(0);
    await expect(tia.getByText(/Not verified: the company or role association was not proven \(role\)/)).toBeVisible();
    await expect(tia.getByText('Company is on your target list.')).toBeVisible();
    await expect(tia.getByText(/application for this job/)).toHaveCount(0);

    const other = page.getByTestId('recruiter-group-other');
    const olu = other.getByRole('article', { name: `Olu Other${run}, Initech${run}` });
    await expect(olu.getByText(`olu${run}@example.org`)).toBeVisible();
    await expect(olu.getByRole('link', { name: /cited source/ })).toBeVisible();
    await expect(page.getByText(/phone|\+1 /i)).toHaveCount(0);

    // drafts: labelled, copyable, never sent; no outreach control anywhere
    await riley.getByText('Draft connection note (not sent)').click();
    await expect(riley.getByText('Hi Riley, I work in QA automation')).toBeVisible();
    await expect(riley.getByText(/JobQuest never sends it/)).toBeVisible();
    await tia.getByText('Draft email (not sent)').click();
    await expect(tia.getByText(/Subject: QA automation engineer/)).toBeVisible();
    await expect(riley.getByRole('button', { name: `Copy the connection note for Riley Jobs${run}` })).toBeVisible();
    await expect(cards.getByRole('button', { name: /send|message|connect with|contact|email them|follow/i })).toHaveCount(0); // the cards offer Copy and Dismiss only
    await expect(page.locator('a[href*="linkedin.com/messaging"]')).toHaveCount(0);
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);

    // source health: a run whose every source was unavailable / blocked is NOT "no recruiter exists"
    const health = page.getByTestId('recruiter-run-summary');
    await expect(health).toContainText('could not search any source');
    await expect(health).toContainText('not the same as no recruiter existing');
    await seedRun('SUCCEEDED', [{ type: 'web', ref: 'careers pages', status: 'zero', count: 0 }, { type: 'web', ref: 'prospecting tool', status: 'unavailable' }]);
    await page.reload();
    await expect(page.getByTestId('recruiter-run-summary')).toContainText('found no new contact');
    await expect(page.getByTestId('recruiter-run-summary')).not.toContainText('could not search');

    // filters: show / verification / status
    const apply = () => page.getByRole('button', { name: 'Apply filters' }).click();
    await page.getByLabel('Show').selectOption('target_company');
    await apply();
    await expect(cards).toHaveCount(1);
    await expect(page.getByRole('article', { name: `Tia Target${run}, ${globex}` })).toBeVisible();
    await page.getByLabel('Show').selectOption('ALL');
    await page.getByLabel('Verification').selectOption('verified');
    await apply();
    await expect(cards).toHaveCount(2);
    await expect(page.getByRole('article', { name: `Tia Target${run}, ${globex}` })).toHaveCount(0);
    await page.getByLabel('Verification').selectOption('uncertain');
    await apply();
    await expect(cards).toHaveCount(1);
    await page.getByRole('button', { name: 'Reset filters' }).click();
    await expect(cards).toHaveCount(3);
    await page.getByLabel('Status').selectOption('ALL');
    await apply();
    await expect(cards).toHaveCount(4);
    await expect(page.getByRole('article', { name: `Dee Dismissed${run}, Hooli${run}` }).getByText('Dismissed', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Reset filters' }).click();
    await expect(cards).toHaveCount(3);

    // nothing core changed by any of the above
    expect(await core()).toEqual(coreBefore);
    expect((await admin.from('ai_findings').select('status').eq('user_id', state.userId).eq('kind', 'recruiter_intel').eq('status', 'REVIEWED')).data).toEqual([]);

    // ---- 3) layout and accessibility at three widths (drafts opened so their content is audited) -----------------------------
    for (const w of [1280, 768, 375]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(150);
      await expect(cards).toHaveCount(3);
      expect(await overflow(page), `recruiters overflow @${w}`).toBe(0);
      a11y.push(await audit(page, `recruiters-${w}`));
      await page.screenshot({ path: resolve(shotsDir, `ai11e-recruiters-${w}.png`), fullPage: true });
    }

    evidence.a11y = a11y;
    evidence.blocking = a11y.reduce((n, r) => n + r.blocking, 0);
    writeFileSync(resolve(evidenceDir, 'ai11e-recruiters-e2e.json'), JSON.stringify(evidence, null, 2));
    expect(evidence.blocking, JSON.stringify(a11y.filter((r) => r.blocking).map((r) => [r.context, r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)]))).toBe(0);
  });
});
