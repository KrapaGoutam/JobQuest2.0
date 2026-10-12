import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

// AI-7 focused check: the Calendar page (states, views, filters, pagination, details, reschedule / cancellation,
// all-day, deadlines, unsafe links, long content, dismiss), the Overview card, the Daily Digest calendar section,
// the seven-tab shell and its clipping regression, responsive layout at 375/768/1280 and accessibility.
// Synthetic data only: rows are seeded through the service client of the LOCAL stack. No calendar, provider or
// real account is involved. Requires AI_HUB_ENABLED / VITE_AI_HUB_ENABLED = true in the env file chosen by
// M1B_ENV_FILE or in the process environment (the dedicated AI-Hub CI job sets them; no other spec does).
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

/**
 * The AI-6 shell defect: a wide tab row made the AI Hub wider than the viewport, so `main` clipped content silently
 * while the document reported 0 overflow. `scrollWidth === clientWidth` alone cannot see that, so this also checks that
 * no rendered element (outside the tab row, which scrolls inside itself by design) sits outside `main`, that the shell
 * fits the viewport, and that every tab - including the last - can be reached.
 */
async function clippingProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const main = document.querySelector('main.page');
    if (!main) return ['main.page not found'];
    const mr = main.getBoundingClientRect();
    if (main.scrollWidth - main.clientWidth > 0) problems.push(`main scrolls horizontally by ${main.scrollWidth - main.clientWidth}px`);
    const shell = document.querySelector('.ai-hub-tabs-wrapper');
    if (shell && shell.getBoundingClientRect().right > window.innerWidth + 1) problems.push('AI Hub shell is wider than the viewport');
    const tablist = document.querySelector('[role="tablist"]');
    for (const el of Array.from(main.querySelectorAll('*'))) {
      if (problems.length > 6) break;
      if (tablist && tablist.contains(el)) continue;
      if (el.closest('.sr-only')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > mr.right + 1 || r.left < mr.left - 1) {
        problems.push(`${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(' ')[0]}` : ''} spans ${Math.round(r.left)}..${Math.round(r.right)} but main is ${Math.round(mr.left)}..${Math.round(mr.right)}`);
      }
    }
    return problems;
  });
}

// ---- time helpers: owner-zone days, independent of the machine zone ---------------------------------------------------------
const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const addDays = (key: string, n: number) => new Date(Date.parse(`${key}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const offsetMs = (ms: number) => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms));
  const n = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - Math.floor(ms / 1000) * 1000;
};
/** UTC ISO instant of `hhmm` on the owner-zone day `dayOffset` days from today. */
function at(dayOffset: number, hhmm: string): string {
  const naive = Date.parse(`${addDays(dayKey(new Date()), dayOffset)}T${hhmm}:00Z`);
  const first = naive - offsetMs(naive);
  return new Date(naive - offsetMs(first)).toISOString();
}
const dateOf = (dayOffset: number) => addDays(dayKey(new Date()), dayOffset);

const aiHubEnabled = (environment().VITE_AI_HUB_ENABLED ?? process.env.VITE_AI_HUB_ENABLED) === 'true'
  && (environment().AI_HUB_ENABLED ?? process.env.AI_HUB_ENABLED) === 'true';

test.describe('AI-7 calendar intelligence', () => {
  test.skip(!aiHubEnabled, 'AI Hub flags are off in this environment (default); run locally or in the dedicated AI-Hub CI job with AI_HUB_ENABLED and VITE_AI_HUB_ENABLED set');
  test.setTimeout(480_000);
  // the machine/browser zone differs from the profile zone on purpose: times must follow the PROFILE zone
  test.use({ timezoneId: 'Europe/Berlin', reducedMotion: 'reduce', actionTimeout: 20_000 });

  test('states, views, filters, details, reschedule / cancellation, digest, overview, shell clipping, responsive layout and accessibility', async ({ page }) => {
    const run = randomBytes(3).toString('hex');
    const evidence: Record<string, unknown> = { run, profile_timezone: TZ };
    const a11y: Awaited<ReturnType<typeof audit>>[] = [];

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Create account' }).click();
    const register = page.getByRole('form', { name: 'Register' });
    await register.getByLabel('Username (required)').fill(`ai7_${run}`);
    await register.getByLabel('Password (required)').fill(`Calendar-${run}-Harbor!`);
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
    const list = page.getByRole('list', { name: 'Calendar intelligence' });
    const cards = list.getByRole('article');
    const apply = () => page.getByRole('button', { name: 'Apply filters' }).click();
    const reset = () => page.getByRole('button', { name: 'Reset filters' }).click();
    const view = (name: string) => page.getByRole('group', { name: 'Calendar view' }).getByRole('button', { name });

    // ---- 1) NOT CONFIGURED: the calendar workflow has never run -----------------------------------------------------
    await page.goto('/ai-hub/calendar');
    await expect(page.getByRole('heading', { name: 'Calendar Intelligence is not configured' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open AI settings' })).toBeVisible();
    await expect(page.getByText(/Nothing upcoming/)).toHaveCount(0); // never presented as "zero events"
    for (const tab of ['Overview', 'Daily Digest', 'Job Leads', 'Email', 'Recruiter Intel', 'Calendar', 'History']) await expect(page.getByRole('tab', { name: tab })).toBeVisible();
    await page.screenshot({ path: resolve(shotsDir, 'ai7-calendar-not-configured-1280.png'), fullPage: true });
    a11y.push(await audit(page, 'calendar-not-configured-1280'));

    // ---- 2) ZERO: the workflow ran successfully and found nothing ---------------------------------------------------
    const now = new Date().toISOString();
    expect((await admin.from('ai_runs').insert({ ...owner, provider: 'claude', workflow: 'calendar_review', status: 'SUCCEEDED', trigger_type: 'scheduled', started_at: now, completed_at: now })).error).toBeNull();
    await page.goto('/ai-hub/calendar');
    await expect(page.getByRole('heading', { name: 'Nothing upcoming.' })).toBeVisible();
    await view('Today').click();
    await expect(page.getByRole('heading', { name: 'Nothing scheduled today.' })).toBeVisible();
    await view('This week').click();
    await expect(page.getByRole('heading', { name: 'Nothing scheduled this week.' })).toBeVisible();
    await view('Past').click();
    await expect(page.getByRole('heading', { name: 'No past calendar items.' })).toBeVisible();
    await view('Upcoming').click();

    // ---- seed (synthetic): events, a deadline, an all-day item, a reschedule, a cancellation, a past item, 24 extras ----
    type Seed = { key: string; title: string; category: string; status?: string; provider?: string; sort: string; start?: string | null; end?: string | null; deadline?: string | null;
      allDay?: boolean; startDate?: string; endDate?: string; company?: string; jobTitle?: string; jobUrl?: string; location?: string | null; meeting?: string | null; eventUrl?: string | null;
      original?: string | null; moves?: number; cancelledAt?: string | null; summary?: string | null; evidence?: string | null; zone?: string | null };
    const leadUrl = `https://jobs.example.com/${run}/acme-platform`;
    const seeds: Seed[] = [
      { key: 'A', title: 'Acme screening call (today)', category: 'recruiter_call', sort: at(0, '12:00'), start: at(0, '12:00'), end: at(0, '12:30'), company: 'Acme', jobTitle: 'Platform Engineer', location: 'Phone', summary: 'Intro call.' },
      { key: 'B', title: 'Acme technical interview', category: 'interview', sort: at(2, '10:00'), start: at(2, '10:00'), end: at(2, '11:00'), company: 'Acme', jobTitle: 'Platform Engineer', jobUrl: leadUrl,
        location: 'Video call', meeting: 'https://meet.example.com/acme-tech', eventUrl: 'https://calendar.example.com/event/acme-tech', summary: 'Second-round technical interview.', evidence: 'Invitation: technical interview with the platform team.', zone: TZ },
      { key: 'C', title: 'Acme coding assessment due', category: 'assessment_deadline', sort: at(3, '17:00'), deadline: at(3, '17:00'), company: 'Acme', summary: 'Complete the online assessment.' },
      { key: 'D', title: 'Acme application closes', category: 'application_deadline', sort: at(4, '00:00'), allDay: true, startDate: dateOf(4), endDate: dateOf(4), company: 'Acme' },
      { key: 'E', title: 'Acme onsite loop', category: 'interview', status: 'rescheduled', sort: at(5, '14:00'), start: at(5, '14:00'), end: at(5, '16:00'), original: at(4, '14:00'), moves: 1, company: 'Acme', location: 'Austin office', zone: 'Europe/Berlin' },
      { key: 'F', title: 'Acme final round', category: 'interview', status: 'cancelled', provider: 'chatgpt', sort: at(6, '09:00'), start: at(6, '09:00'), end: at(6, '10:00'), original: at(5, '09:00'), moves: 1, cancelledAt: at(0, '08:00'), company: 'Acme' }, // moved once, then cancelled
      { key: 'G', title: 'Globex intro call (past)', category: 'recruiter_call', sort: at(-3, '15:00'), start: at(-3, '15:00'), company: 'Globex' },
      { key: 'H', title: `Hostile ${'x'.repeat(160)} <b>not bold</b> <img src=x onerror=alert(1)>`, category: 'other', sort: at(7, '09:00'), start: at(7, '09:00'), company: 'Hostileco',
        eventUrl: 'https://user:secret@cred.example.com/event', location: `Long location ${'y'.repeat(200)}`, summary: `Summary <script>alert(1)</script> ${'z'.repeat(300)}` },
    ];
    for (let i = 0; i < 24; i += 1) seeds.push({ key: `X${i}`, title: `Bulk item ${String(i).padStart(2, '0')}`, category: 'follow_up', sort: at(10 + i, '09:00'), deadline: at(10 + i, '09:00'), company: 'Bulkco' });
    const findings = seeds.map((s) => ({
      ...owner, kind: 'calendar_event', provider: s.provider ?? 'claude', status: 'NEW', category: s.category, priority: s.category === 'interview' ? 'HIGH' : 'NORMAL',
      title: s.title, summary: s.summary ?? null, evidence: s.evidence ?? null, occurred_at: s.sort, due_at: s.deadline ?? null, dedupe_key: `cal:${run}${s.key}`, confidence: 0.9,
      payload: { version: '1.0', status: s.status ?? 'scheduled', ...(s.jobUrl ? { job_url: s.jobUrl } : {}) } as Record<string, unknown>,
    }));
    const inserted = await admin.from('ai_findings').insert(findings).select('id, dedupe_key');
    expect(inserted.error).toBeNull();
    const idOf = (key: string) => inserted.data!.find((r) => r.dedupe_key === `cal:${run}${key}`)!.id as string;
    const children = seeds.map((s) => ({
      finding_id: idOf(s.key), ...owner, category: s.category, is_deadline: ['assessment_deadline', 'application_deadline', 'take_home_deadline', 'follow_up'].includes(s.category),
      status: s.status ?? 'scheduled', all_day: s.allDay ?? false, start_at: s.allDay ? null : s.start ?? null, end_at: s.allDay ? null : s.end ?? null,
      start_date: s.allDay ? s.startDate : null, end_date: s.allDay ? s.endDate : null, deadline_at: s.deadline ?? null, sort_at: s.sort, time_zone: s.zone === undefined ? TZ : s.zone,
      calendar_source: 'google_calendar', source_event_id: `evt-${run}-${s.key}`, source_event_url: s.eventUrl ?? null, company: s.company ?? null, job_title: s.jobTitle ?? null,
      location: s.location ?? null, meeting_url: s.meeting ?? null, organizer_name: s.key === 'B' ? 'Pat Recruiter' : null, organizer_domain: s.key === 'B' ? 'acme.example.com' : null,
      original_start_at: s.original ?? null, reschedule_count: s.moves ?? 0, cancelled_at: s.cancelledAt ?? null, logical_key: null,
    }));
    expect((await admin.from('ai_calendar_events').insert(children)).error).toBeNull();
    // a stored job lead for B's posting, and an email about B's interview: both are resolved at read time, in the owner's scope
    const leadFinding = await admin.from('ai_findings').insert({ ...owner, kind: 'job_lead', provider: 'claude', status: 'NEW', priority: 'NORMAL', title: 'Platform Engineer lead', dedupe_key: `url:${leadUrl}`, payload: { version: '1.0', company: 'Acme', role_title: 'Platform Engineer' } }).select('id').single();
    expect(leadFinding.error).toBeNull();
    expect((await admin.from('ai_job_leads').insert({ finding_id: leadFinding.data!.id, ...owner, company: 'Acme', title: 'Platform Engineer', canonical_url: leadUrl, source_url: leadUrl })).error).toBeNull();
    expect((await admin.from('ai_findings').insert({
      ...owner, kind: 'email_event', provider: 'claude', status: 'NEW', category: 'interview_invitation', priority: 'HIGH', title: 'Acme interview invitation email', occurred_at: at(-1, '09:00'), due_at: at(2, '10:00'),
      dedupe_key: `ev:${run}mail`, payload: { version: '1.0', sender_name: 'Pat Recruiter', sender_domain: 'acme.example.com', subject: 'Interview', company: 'Acme' },
    })).error).toBeNull();

    // ---- 3) UPCOMING: chronological, deadline vs event, reschedule, cancellation, all-day, links, owner-zone times ---------
    await page.goto('/ai-hub/calendar');
    await expect(page.getByRole('heading', { name: 'Calendar Intelligence', level: 2 })).toBeVisible();
    await expect(cards).toHaveCount(20);
    await expect(page.getByRole('navigation', { name: 'Calendar intelligence pagination' })).toBeVisible();
    await page.getByLabel('Company').fill('Acme');
    await apply();
    await expect(page.getByRole('heading', { name: 'Acme technical interview', level: 4 })).toBeVisible();
    const titles = await list.getByRole('heading', { level: 4 }).allTextContents();
    const pos = (t: string) => titles.findIndex((x) => x.includes(t));
    const order = ['technical interview', 'coding assessment due', 'application closes', 'onsite loop', 'final round'].map(pos);
    expect(order.every((i) => i >= 0), JSON.stringify(titles)).toBe(true);
    expect([...order].sort((a, b) => a - b), 'items are chronological').toEqual(order);
    const card = (name: string | RegExp) => cards.filter({ has: page.getByRole('heading', { level: 4, name }) });
    const b = card('Acme technical interview');
    await expect(b.getByText('Scheduled event', { exact: true })).toBeVisible();
    await expect(b.getByText(/10:00 AM–11:00 AM C[DS]T/).first()).toBeVisible(); // the PROFILE zone, not the browser zone (Berlin)
    await expect(b.getByText('Pat Recruiter (acme.example.com)')).toBeVisible();
    await expect(b.getByRole('link', { name: /meet\.example\.com/ })).toHaveAttribute('href', 'https://meet.example.com/acme-tech');
    await expect(b.getByRole('link', { name: /meet\.example\.com/ })).toHaveAttribute('rel', /noopener/);
    await expect(b.getByText('Platform Engineer at Acme')).toBeVisible(); // stored job lead resolved by exact job URL
    await expect(b.getByText('Also reported by email')).toBeVisible();
    await expect(b.getByText('Acme interview invitation email')).toBeVisible();
    await expect(b.getByText('Invitation: technical interview with the platform team.')).toBeVisible();
    const c = card('Acme coding assessment due');
    await expect(c.getByText('Deadline', { exact: true })).toBeVisible();
    await expect(c.getByText(/Due .* 5:00 PM C[DS]T/).first()).toBeVisible();
    await expect(c.getByText('Scheduled event')).toHaveCount(0);
    const d = card('Acme application closes');
    await expect(d.getByText(/Due .* · All day/).first()).toBeVisible();
    const e = card('Acme onsite loop');
    await expect(e.getByText('Rescheduled', { exact: true })).toBeVisible();
    await expect(e.getByText('Moved from')).toBeVisible();
    await expect(e.getByText(/Europe\/Berlin: /)).toBeVisible(); // the source zone, when it differs from the display zone
    const f = card('Acme final round');
    await expect(f.getByText('Cancelled', { exact: true }).first()).toBeVisible();
    await expect(f.getByText('Was scheduled for')).toBeVisible();
    await expect(f.getByRole('heading', { level: 4 })).toHaveCSS('text-decoration-line', 'line-through');
    await expect(f.getByText('ChatGPT', { exact: false }).first()).toBeVisible();
    evidence.upcoming_titles = titles;

    // ---- 4) VIEWS: Today / This week / Past / Date range -------------------------------------------------------------
    await view('Today').click();
    await expect(page.getByRole('heading', { name: 'Acme screening call (today)', level: 4 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Acme technical interview', level: 4 })).toHaveCount(0);
    await view('This week').click();
    await expect(page.getByRole('heading', { name: 'Acme screening call (today)', level: 4 })).toBeVisible();
    await reset();
    await view('Past').click();
    await expect(page.getByRole('heading', { name: 'Globex intro call (past)', level: 4 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Acme technical interview', level: 4 })).toHaveCount(0);
    await view('Date range').click();
    await expect(page.getByLabel('Event from')).toBeVisible();
    await page.getByLabel('Event from').fill(dateOf(2));
    await page.getByLabel('Event to').fill(dateOf(3));
    await apply();
    await expect(page.getByRole('heading', { name: 'Acme technical interview', level: 4 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Acme coding assessment due', level: 4 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Acme application closes', level: 4 })).toHaveCount(0);
    await page.getByLabel('Event from').fill(dateOf(5));
    await page.getByLabel('Event to').fill(dateOf(2));
    await apply();
    await expect(page.getByRole('alert').filter({ hasText: 'on or before' })).toBeVisible();
    await reset();
    await expect(view('Upcoming')).toHaveAttribute('aria-pressed', 'true');

    // ---- 5) FILTERS --------------------------------------------------------------------------------------------------
    await page.getByLabel('Category').selectOption('assessment_deadline');
    await apply();
    await expect(cards).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Acme coding assessment due', level: 4 })).toBeVisible();
    await reset();
    await page.getByLabel('Event status').selectOption('cancelled');
    await apply();
    await expect(cards).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Acme final round', level: 4 })).toBeVisible();
    await reset();
    await page.getByLabel('Provider').selectOption('chatgpt');
    await apply();
    await expect(cards).toHaveCount(1);
    await reset();
    await page.getByLabel('Company').fill('nomatch');
    await apply();
    await expect(page.getByRole('heading', { name: 'No results match these filters.' })).toBeVisible();
    await reset();

    // ---- 6) PAGINATION ------------------------------------------------------------------------------------------------
    await expect(cards).toHaveCount(20);
    const pager = page.getByRole('navigation', { name: 'Calendar intelligence pagination' });
    await pager.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Page 2', { exact: true })).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(0);
    await pager.getByRole('button', { name: 'Previous' }).click();
    await expect(page.getByText('Page 1', { exact: true })).toBeVisible();

    // ---- 7) HOSTILE / LONG CONTENT, UNSAFE LINKS --------------------------------------------------------------------------
    await page.getByLabel('Company').fill('Hostileco');
    await apply();
    await expect(cards).toHaveCount(1);
    await expect(page.getByText(/Hostile x{20}/).first()).toBeVisible();
    await expect(page.locator('b', { hasText: 'not bold' })).toHaveCount(0);
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /cred\.example\.com/ })).toHaveCount(0); // credential-bearing link is not rendered
    expect(await overflow(page)).toBe(0);
    await reset();

    // ---- 8) NO CALENDAR MUTATION; the only write is the owner-only dismiss -------------------------------------------------------
    await expect(page.getByRole('button', { name: /^(Reschedule|Cancel event|Accept|Decline|Edit|Add to calendar|RSVP|Create task|Create application)/ })).toHaveCount(0);
    await expect(page.getByText('cannot create, change, accept or cancel calendar events')).toBeVisible();
    await view('Past').click();
    await page.getByRole('button', { name: /Dismiss Globex intro call/ }).click();
    await page.getByRole('button', { name: 'Confirm dismiss' }).click();
    await expect(page.getByRole('heading', { name: 'No past calendar items.' })).toBeVisible();
    expect((await admin.from('ai_findings').select('status').eq('id', idOf('G')).single()).data!.status).toBe('DISMISSED');
    expect((await admin.from('applications').select('id', { count: 'exact', head: true }).eq('workspace_id', state.workspaceId)).count ?? 0).toBe(applicationsBefore);
    await page.getByLabel(/^Status/).selectOption('DISMISSED'); // (the Event status select starts with "Event")
    await apply();
    await expect(cards.getByText('Dismissed', { exact: true })).toBeVisible();
    await reset();

    // ---- 9) OVERVIEW card -----------------------------------------------------------------------------------------------------
    await page.goto('/ai-hub');
    await expect(page.getByText(/\d+ interviews? · \d+ deadlines?/)).toBeVisible();
    await expect(page.getByText('upcoming', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Open Calendar' }).click();
    await expect(page).toHaveURL(/\/ai-hub\/calendar$/);

    // ---- 10) DAILY DIGEST calendar section (real aggregation, saved through the ingestion boundary) -----------------------------------
    await page.goto('/ai-hub/digest');
    await page.getByRole('button', { name: 'Save a JobQuest digest for today' }).click();
    await expect(page.getByText('Saved today’s JobQuest digest.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Source availability' }).getByText('Calendar: Available')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Calendar' }).first()).toBeVisible();
    await expect(page.getByText(/CANCELLED/).first()).toBeVisible(); // a cancellation inside the week is always surfaced
    await expect(page.getByText(/rescheduled from/).first()).toBeVisible();

    // ---- 11) SEVEN-TAB SHELL: clipping regression + reachability on every size and every tab ------------------------------------------
    // Tabs are visited by clicking them (in-app navigation, as a user does). Refresh tokens are single-use with replay
    // detection, so a burst of full reloads is not a realistic navigation pattern and would sign the test user out.
    const tabs: Array<[string, string]> = [['Overview', '/ai-hub'], ['Daily Digest', '/ai-hub/digest'], ['Job Leads', '/ai-hub/job-leads'], ['Email', '/ai-hub/email'],
      ['Recruiter Intel', '/ai-hub/recruiters'], ['Calendar', '/ai-hub/calendar'], ['History', '/ai-hub/history']];
    for (const w of [375, 768, 1280]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto('/ai-hub');
      await page.waitForLoadState('networkidle');
      for (const [tabName, path] of tabs) {
        await expect(page.getByRole('form', { name: 'Sign in' }), `session must survive on ${path} at ${w}px (landed on ${page.url()})`).toHaveCount(0);
        const tab = page.getByRole('tab', { name: tabName, exact: true });
        await expect(tab, `AI Hub "${tabName}" navigation should render on ${path} at ${w}px`).toBeVisible();
        await tab.scrollIntoViewIfNeeded();
        await tab.click();
        await expect(page, `clicking "${tabName}" should open ${path} at ${w}px`).toHaveURL(new RegExp(`${path}$`));
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        const problems = await clippingProblems(page);
        expect(problems, `no clipped content on ${path} at ${w}px`).toEqual([]);
        expect(await overflow(page), `no horizontal scroll on ${path} at ${w}px`).toBe(0);
      }
      // the last tab is reachable inside the scrolling tab row at every size
      const history = page.getByRole('tab', { name: 'History', exact: true });
      await history.scrollIntoViewIfNeeded();
      await expect(history).toBeVisible();
      const reachable = await history.evaluate((el) => {
        const row = el.closest('[role="tablist"]')!.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return r.left >= row.left - 1 && r.right <= row.right + 1;
      });
      expect(reachable, `History tab fully inside the tab row at ${w}px`).toBe(true);
    }

    // ---- 12) RESPONSIVE + ACCESSIBILITY on the populated Calendar page ---------------------------------------------------------------
    for (const w of [375, 768, 1280]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto('/ai-hub/calendar');
      await page.getByLabel('Company').fill('Acme');
      await apply();
      await expect(page.getByRole('heading', { name: 'Acme technical interview', level: 4 })).toBeVisible();
      expect(await overflow(page), `no horizontal scroll at ${w}px`).toBe(0);
      expect(await clippingProblems(page), `no clipped content at ${w}px`).toEqual([]);
      evidence[`overflow_calendar_${w}`] = await overflow(page);
      await page.screenshot({ path: resolve(shotsDir, `ai7-calendar-${w}.png`), fullPage: true });
      a11y.push(await audit(page, `calendar-populated-${w}`));
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ai-hub/calendar');
    await view('Date range').click();
    a11y.push(await audit(page, 'calendar-date-range-controls-1280'));
    await page.goto('/ai-hub');
    a11y.push(await audit(page, 'overview-with-calendar-card-1280'));

    // keyboard: the view buttons and the form are reachable and operable without a pointer
    await page.goto('/ai-hub/calendar');
    await view('Today').focus();
    await page.keyboard.press('Enter');
    await expect(view('Today')).toHaveAttribute('aria-pressed', 'true');

    evidence.a11y = a11y;
    writeFileSync(resolve(evidenceDir, 'ai7-calendar.json'), JSON.stringify(evidence, null, 2));
    for (const result of a11y) expect(result.blocking, `${result.context}: ${JSON.stringify(result.violations)}`).toBe(0);
  });
});
