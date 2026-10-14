import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import * as C from '../../apps/api/src/lib/aiContract';
import { emailNeedsAttention as serverNeedsAttention, isStrongMatch as serverStrong, toEmailEvent, toJobLead, toRecruiterIntel } from '../../apps/api/src/services/aiExternalIntelligenceService';
import * as W from '../../apps/web/src/lib/aiSources';
import { AI_HUB_TABS, aiHubPathForTab, aiHubTabFromPath } from '../../apps/web/src/lib/aiHub';
import { AiHubJobLeadsPanel, JobLeadDetail, type JobLeadsPanelProps } from '../../apps/web/src/views/AiHubJobLeads';
import { AiHubEmailPanel, type EmailPanelProps } from '../../apps/web/src/views/AiHubEmail';
import { AiHubRecruitersPanel, type RecruiterPanelProps } from '../../apps/web/src/views/AiHubRecruiters';
import { AiHubOverview, AiHubShell } from '../../apps/web/src/views/AiHubView';
import type { AiHubSnapshot } from '../../apps/web/src/lib/aiHub';

vi.mock('../../apps/web/src/supabase', () => ({ supabase: { from: () => { throw new Error('unexpected'); }, rpc: () => { throw new Error('unexpected'); } } }));

const noop = () => undefined;
const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);

// ---- fixtures ------------------------------------------------------------------------------------------------
const leadRow = (over: Partial<W.JobLeadRow> = {}): W.JobLeadRow => ({
  finding_id: 'f1', user_id: 'u1', company: 'Example Corp', title: 'Staff Engineer', location: 'Austin, TX', work_arrangement: 'hybrid', employment_type: 'full_time',
  source_name: 'Example Jobs', source_url: 'https://jobs.example.com/42', posted_date: '2026-09-28', discovered_at: '2026-10-01T12:00:00Z',
  salary_min: 150000, salary_max: 190000, salary_currency: 'USD', salary_period: 'year', experience_level: 'Senior', match_score: 86,
  required_skills: ['TypeScript', 'PostgreSQL'], preferred_skills: ['Kubernetes'], description_truncated: false, description_length: 120,
  finding: { provider: 'claude', status: 'NEW', priority: 'NORMAL', confidence: 0.8, summary: 'Strong overlap.', payload: { match_reasoning: 'Matches TypeScript.' } }, ...over,
});
const emailRow = (over: Partial<W.EmailRow> = {}): W.EmailRow => ({
  id: 'e1', user_id: 'u1', provider: 'claude', status: 'NEW', priority: 'HIGH', confidence: 0.9, category: 'interview_invitation', title: 'Interview invitation from Example Corp',
  summary: 'Recruiter invites you to interview.', evidence: 'We would like to schedule an interview.', occurred_at: '2026-10-01T14:30:00Z', due_at: '2026-10-03T22:00:00Z',
  created_at: '2026-10-01T15:00:00Z', payload: { sender_name: 'Pat Recruiter', sender_domain: 'example.com', subject: 'Interview', company: 'Example Corp', role_title: 'Engineer', next_step: 'Reply with availability' }, ...over,
});
const recruiterRow = (over: Partial<W.RecruiterRow> = {}): W.RecruiterRow => ({
  id: 'r1', user_id: 'u1', provider: 'claude', status: 'NEW', confidence: 0.7, title: 'Pat', summary: 'Lists openings.', source_ref: { url: 'https://example.com/team' },
  created_at: '2026-10-01T15:00:00Z',
  payload: { recruiter_name: 'Pat Recruiter', role_title: 'Technical Recruiter', company: 'Example Corp', relationship: 'recruiter', verification: 'verified', source_name: 'Team page', profile_url: 'https://example.com/team/pat' }, ...over,
});

describe('client/server contract sync', () => {
  it('enums and thresholds match the server contract', () => {
    expect([...W.EMAIL_CATEGORIES]).toEqual([...C.EMAIL_CATEGORIES]);
    expect([...W.EMAIL_ATTENTION_CATEGORIES]).toEqual([...C.EMAIL_ATTENTION_CATEGORIES]);
    expect([...W.JOB_WORK_ARRANGEMENTS]).toEqual([...C.JOB_WORK_ARRANGEMENTS]);
    expect([...W.JOB_EMPLOYMENT_TYPES]).toEqual([...C.JOB_EMPLOYMENT_TYPES]);
    expect(W.STRONG_MATCH_THRESHOLD).toBe(C.STRONG_MATCH_THRESHOLD);
    expect(W.JOB_DESCRIPTION_MAX_CHARS).toBe(C.JOB_DESCRIPTION_MAX_CHARS);
    for (const c of C.EMAIL_CATEGORIES) expect(W.emailCategoryLabel(c)).not.toBe('Other');
    for (const a of C.JOB_WORK_ARRANGEMENTS) expect(W.workArrangementLabel(a)).not.toBe('Other');
    for (const t of C.JOB_EMPLOYMENT_TYPES) expect(W.employmentTypeLabel(t)).toBeTruthy();
  });

  it('the SQL CHECK lists for ai_job_leads match the TypeScript constants', () => {
    const sql = readFileSync('supabase/migrations/20261027100000_ai_hub_external_intelligence.sql', 'utf8').replace(/\r\n/g, '\n');
    const list = (name: string) => [...new RegExp(`${name} check \\(([\\s\\S]*?)\\),?\\n`).exec(sql)![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    expect(list('chk_ai_job_leads_arrangement')).toEqual([...C.JOB_WORK_ARRANGEMENTS]);
    expect(list('chk_ai_job_leads_employment')).toEqual([...C.JOB_EMPLOYMENT_TYPES]);
    expect(list('chk_ai_job_leads_salary_period')).toEqual([...C.JOB_SALARY_PERIODS]);
    expect(sql).toContain(`char_length(description) <= ${C.JOB_DESCRIPTION_MAX_CHARS}`);
  });

  it('"needs attention" and "strong match" mean the same thing on both sides', () => {
    for (const status of ['NEW', 'REVIEWED']) for (const priority of ['HIGH', 'NORMAL']) for (const category of [...C.EMAIL_CATEGORIES, null]) for (const dueAt of [null, '2026-10-03T00:00:00Z']) for (const flag of [true, undefined]) {
      for (const action of [undefined, 'needs_action', 'no_action']) {
        const payload: Record<string, string | boolean> = { ...(flag ? { needs_attention: true } : {}), ...(action ? { action_state: action } : {}) };
        expect(W.emailNeedsAttention({ status, priority, category, dueAt, payload })).toBe(serverNeedsAttention({ status, priority, category, dueAt, payload }));
      }
    }
    for (const s of [null, 0, 79, 80, 100]) expect(W.isStrongMatch(s)).toBe(serverStrong(s));
    expect(W.isStrongMatch(null)).toBe(false);
    expect(W.isStrongMatch(80)).toBe(true);
    expect(W.isStrongMatch(79)).toBe(false);
  });

  it('the PostgREST attention filter lists exactly the attention categories', () => {
    for (const c of C.EMAIL_ATTENTION_CATEGORIES) expect(W.EMAIL_ATTENTION_OR).toContain(c);
    expect(W.EMAIL_ATTENTION_OR).toBe(C.EMAIL_ATTENTION_OR);
    for (const c of ['rejection', 'application_confirmation', 'other_job_search']) expect(W.EMAIL_ATTENTION_OR).not.toContain(c);
  });

  it('server and web row mappers agree on the displayed facts', () => {
    const web = W.toJobLeadView(leadRow());
    const server = toJobLead({ ...leadRow(), finding_id: 'f1' });
    expect(web).toMatchObject({ company: server.company, title: server.title, matchScore: server.matchScore, strongMatch: server.strongMatch, sourceUrl: server.sourceUrl, provider: server.provider });
    const asRow = (r: object) => r as Record<string, unknown>;
    expect(W.toEmailView(emailRow())).toMatchObject({ category: toEmailEvent(asRow(emailRow())).category, needsAttention: toEmailEvent(asRow(emailRow())).needsAttention });
    expect(W.toRecruiterView(recruiterRow())).toMatchObject({ name: toRecruiterIntel(asRow(recruiterRow())).name, verified: true });
  });
});

describe('navigation', () => {
  it('exposes Overview, Daily Digest, Job Leads, Email, Recruiter Intel, Calendar (AI-7), Actions (AI-8) and History', () => {
    expect(AI_HUB_TABS.map((t) => t.label)).toEqual(['Overview', 'Daily Digest', 'Job Leads', 'Email', 'Recruiter Intel', 'Calendar', 'Actions', 'History']);
    expect(AI_HUB_TABS.map((t) => t.path)).toEqual(['/ai-hub', '/ai-hub/digest', '/ai-hub/job-leads', '/ai-hub/email', '/ai-hub/recruiters', '/ai-hub/calendar', '/ai-hub/actions', '/ai-hub/history']);
    for (const t of AI_HUB_TABS) { expect(aiHubTabFromPath(t.path)).toBe(t.id); expect(aiHubPathForTab(t.id)).toBe(t.path); }
    expect(aiHubTabFromPath('/ai-hub/calendar')).toBe('calendar');
    expect(aiHubTabFromPath('/ai-hub/unknown')).toBe('overview');
    const shell = html(createElement(AiHubShell, { tab: 'job-leads', onTabChange: noop, state: { status: 'loading' }, jobLeads: createElement('p', null, 'LEADS-SLOT') }));
    for (const label of ['Job Leads', 'Email', 'Recruiter Intel', 'Calendar', 'Daily Digest', 'History', 'LEADS-SLOT']) expect(shell).toContain(label);
  });
  it('the App routes every tab behind the existing AI Hub exposure check', () => {
    const app = readFileSync('apps/web/src/App.tsx', 'utf8');
    expect(app).toMatch(/AI_HUB_PATHS\.includes\(routePath\)/);
    expect(app).toMatch(/if \(!isAiHubExposed\(\)\) return notFoundView/);
    for (const p of ['/ai-hub/job-leads', '/ai-hub/email', '/ai-hub/recruiters']) expect(app).toContain(`case '${p}'`);
  });
  it('Overview surfaces new job leads, email needing attention and recruiter intel when counts exist', () => {
    const snap: AiHubSnapshot = { runs: [], findings: [], pendingSuggestions: 2, sources: { newJobLeads: 4, emailAttention: 3, recruiterIntel: 1 } };
    const h = html(createElement(AiHubOverview, { snapshot: snap, onOpenTab: noop }));
    for (const t of ['New job leads', 'Email needing attention', 'Recruiter intel', 'Pending suggestions', 'Open Job Leads', 'Open Email', 'Open Recruiter Intel']) expect(h).toContain(t);
    const without = html(createElement(AiHubOverview, { snapshot: { ...snap, sources: undefined }, onOpenTab: noop }));
    expect(without).not.toContain('New job leads');
    expect(without).toContain('Pending suggestions'); // a source-count failure never breaks the rest
  });
});

describe('helpers', () => {
  it('shows only published salary, never invents one', () => {
    expect(W.salaryLabel(null, null, 'USD', 'year')).toBeNull();
    expect(W.salaryLabel(150000, 190000, 'USD', 'year')).toBe('USD 150,000 – 190,000 per year');
    expect(W.salaryLabel(120000, null, null, null)).toBe('from 120,000');
    expect(W.salaryLabel(null, 90000, 'EUR', null)).toBe('EUR up to 90,000');
    const v = W.toJobLeadView(leadRow({ salary_min: null, salary_max: null, experience_level: null, match_score: null }));
    expect(v).toMatchObject({ salary: null, experienceLevel: null, matchScore: null, strongMatch: false });
  });
  it('resolves inclusive date ranges in the profile time zone', () => {
    const r = W.resolveDateRange({ from: '2026-10-11', to: '2026-10-11' }, 'America/Chicago');
    expect(r).toEqual({ ok: true, since: '2026-10-11T05:00:00.000Z', before: '2026-10-12T05:00:00.000Z' });
    expect(W.resolveDateRange({ from: '', to: '' }, 'UTC')).toEqual({ ok: true, since: null, before: null });
    expect(W.resolveDateRange({ from: '2026-10-12', to: '2026-10-01' }, 'UTC')).toMatchObject({ ok: false });
    expect(W.resolveDateRange({ from: '2026-13-01', to: '' }, 'UTC')).toMatchObject({ ok: false });
  });
  it('sanitizes search text so it cannot alter filter syntax', () => {
    expect(W.sanitizeSearch('a),company.neq.(b')).not.toMatch(/[(),]/);
    expect(W.sanitizeSearch('x'.repeat(200)).length).toBe(W.SOURCE_SEARCH_MAX);
    expect(W.clampScore('')).toBeNull();
    expect(W.clampScore('101')).toBeNull();
    expect(W.clampScore('2.5')).toBeNull();
    expect(W.clampScore('80')).toBe(80);
  });
  it('suppresses unsafe URLs and ignores contact details without a cited source', () => {
    const lead = W.toJobLeadView(leadRow({ source_url: 'javascript:alert(1)' }));
    expect(lead.sourceUrl).toBeNull();
    expect(W.toJobLeadView(leadRow({ source_url: 'https://user:pw@jobs.example.com/1' })).sourceUrl).toBeNull();
    const rec = W.toRecruiterView(recruiterRow({ payload: { recruiter_name: 'Pat', company: 'X', contact_email: 'pat@x.example', profile_url: 'javascript:x', verification: 'uncertain' } }));
    expect(rec.contact).toBeNull();
    expect(rec.profileUrl).toBeNull();
    expect(rec.verified).toBe(false);
  });
});

// ---- panels ----------------------------------------------------------------------------------------------------------
const jobProps = (over: Partial<JobLeadsPanelProps> = {}): JobLeadsPanelProps => ({
  state: { status: 'ready', rows: [W.toJobLeadView(leadRow())], hasNext: false }, draft: W.DEFAULT_JOB_LEAD_FILTERS, page: 0, timeZone: 'America/Chicago', currentUserId: 'u1',
  configured: true, filtered: false, onDraft: noop, onApply: noop, onReset: noop, onPage: noop, onOpen: noop, onDismiss: async () => undefined, ...over,
});
const jobHtml = (over: Partial<JobLeadsPanelProps> = {}) => html(createElement(AiHubJobLeadsPanel, jobProps(over)));

describe('Job Leads page', () => {
  it('renders every state: loading, error, empty, not configured, populated', () => {
    expect(jobHtml({ state: { status: 'loading' } })).toContain('Loading job leads');
    const err = jobHtml({ state: { status: 'error' }, onRetry: noop });
    expect(err).toContain('Job leads could not be loaded.');
    expect(err).toContain('Try again');
    expect(err).toContain('unaffected');
    expect(jobHtml({ state: { status: 'ready', rows: [], hasNext: false }, configured: true })).toContain('No job leads yet.');
    const nc = jobHtml({ state: { status: 'ready', rows: [], hasNext: false }, configured: false, onOpenSettings: noop });
    expect(nc).toContain('Job Leads is not configured');
    expect(nc).toContain('Open AI settings');
    const filteredEmpty = jobHtml({ state: { status: 'ready', rows: [], hasNext: false }, configured: false, filtered: true });
    expect(filteredEmpty).toContain('No results match these filters.'); // filters never read as "not configured"
    expect(filteredEmpty).not.toContain('not configured');
  });

  it('shows the facts, the AI match with provenance and the strong-match threshold; nothing invented', () => {
    const h = jobHtml();
    for (const t of ['Staff Engineer', 'Example Corp', 'Austin, TX', 'Hybrid', 'Full-time', 'AI match 86/100', 'Strong match (AI match 80+)', 'USD 150,000 – 190,000 per year', 'Senior', 'TypeScript, PostgreSQL', 'Claude', 'via Example Jobs', 'Open posting', 'View details']) expect(h).toContain(t);
    const bare = jobHtml({ state: { status: 'ready', rows: [W.toJobLeadView(leadRow({ salary_min: null, salary_max: null, match_score: null, experience_level: null, posted_date: null }))], hasNext: false } });
    expect(bare).toContain('No AI match score');
    expect(bare).not.toContain('Published salary');
    expect(bare).not.toContain('Strong match');
    expect(bare).not.toMatch(/Posted [A-Z][a-z]{2} \d/); // no invented posting date
  });

  it('offers only inspect / open / dismiss: no apply, create-application, contact or status actions', () => {
    const h = jobHtml();
    expect(h).not.toMatch(/Apply now|>Apply<|Create application|Add to applications|Contact recruiter|Send|Change status/i);
    expect(h).toContain('Dismiss');
    expect(jobHtml({ currentUserId: 'someone-else' })).not.toContain('>Dismiss<'); // only the owner can review
    expect(jobHtml({ state: { status: 'ready', rows: [W.toJobLeadView(leadRow({ finding: { ...leadRow().finding, status: 'DISMISSED' } }))], hasNext: false } })).not.toContain('>Dismiss<');
  });

  it('has labelled filters, a search landmark, an announced summary and bounded pagination', () => {
    const h = jobHtml({ page: 1, state: { status: 'ready', rows: [W.toJobLeadView(leadRow())], hasNext: true } });
    for (const t of ['role="search"', 'aria-label="Job lead filters"', 'Search company or title', 'Company', 'Location', 'Work arrangement', 'Employment type', 'Minimum AI match (0–100)', 'Provider', 'Status', 'Discovered from', 'Discovered to', 'Posted from', 'Posted to', 'Apply filters', 'Reset filters']) expect(h).toContain(t);
    expect(h).toContain('Showing 1 job lead on page 2; more on the next page.');
    expect(h).toContain('aria-label="Job leads pagination"');
    expect(h).toContain('Previous');
    expect(h).toContain('Next');
    expect(jobHtml()).not.toContain('pagination'); // a single page shows no pager
  });

  it('surfaces validation messages accessibly', () => {
    expect(jobHtml({ message: 'Discovered dates: Enter valid dates.' })).toContain('role="alert"');
    expect(jobHtml({ draft: { ...W.DEFAULT_JOB_LEAD_FILTERS, minScore: '150' } })).toContain('aria-invalid="true"');
  });

  it('renders long and hostile content as escaped text that wraps', () => {
    const evil = '<img src=x onerror=alert(1)> ' + 'W'.repeat(400);
    const h = jobHtml({ state: { status: 'ready', rows: [W.toJobLeadView(leadRow({ title: evil, company: evil, location: evil }))], hasNext: false } });
    expect(h).not.toContain('<img');
    expect(h).toContain('&lt;img');
    expect(h).toContain('overflow-wrap:anywhere');
  });

  it('the detail view shows the description with a visible truncation notice and a keyboard-reachable scroll region', () => {
    const lead = W.toJobLeadView(leadRow({ description_truncated: true, description_length: 31000 }));
    const body = (d: Parameters<typeof JobLeadDetail>[0]['description']) => html(createElement(JobLeadDetail, { lead, description: d, timeZone: 'UTC', onClose: noop, onCopy: noop }));
    const ready = body({ status: 'ready', text: 'Line one\n<b>not bold</b>' });
    expect(ready).toContain('shortened');
    expect(ready).toContain('31,000');
    expect(ready).toContain('tabindex="0"');
    expect(ready).toContain('white-space:pre-wrap');
    expect(ready).toContain('&lt;b&gt;not bold&lt;/b&gt;');
    expect(ready).toContain('Copy details as JSON');
    expect(ready).toContain('Why it may match (AI estimate)');
    expect(ready).toContain('provider’s own estimate');
    expect(body({ status: 'loading' })).toContain('Loading job description');
    expect(body({ status: 'error' })).toContain('could not be loaded');
    expect(body({ status: 'ready', text: null })).toContain('No job description was provided.');
  });

  it('the copy export is structured and provider-neutral', () => {
    const exp = W.jobLeadExport(W.toJobLeadView(leadRow({ description: 'JD' })));
    expect(Object.keys(exp)).toEqual(expect.arrayContaining(['company', 'title', 'source_url', 'ai_match_score', 'required_skills', 'description']));
    expect(JSON.stringify(exp)).not.toMatch(/claude-|workspace|user_id/i);
  });
});

const emailProps = (over: Partial<EmailPanelProps> = {}): EmailPanelProps => ({
  state: { status: 'ready', rows: [W.toEmailView(emailRow())], hasNext: false }, draft: W.DEFAULT_EMAIL_FILTERS, page: 0, timeZone: 'America/Chicago', currentUserId: 'u1',
  configured: true, filtered: false, onDraft: noop, onApply: noop, onReset: noop, onPage: noop, onDismiss: async () => undefined, ...over,
});
const emailHtml = (over: Partial<EmailPanelProps> = {}) => html(createElement(AiHubEmailPanel, emailProps(over)));

describe('Email Intelligence page', () => {
  it('renders every state', () => {
    expect(emailHtml({ state: { status: 'loading' } })).toContain('Loading email intelligence');
    expect(emailHtml({ state: { status: 'error' } })).toContain('Email intelligence could not be loaded.');
    expect(emailHtml({ state: { status: 'ready', rows: [], hasNext: false } })).toContain('No email intelligence yet.');
    const nc = emailHtml({ state: { status: 'ready', rows: [], hasNext: false }, configured: false });
    expect(nc).toContain('Email Intelligence is not configured');
    expect(nc).toContain('never message bodies');
  });
  it('shows classification, summary, sender, dates, hints, deadline and the evidence excerpt', () => {
    const h = emailHtml();
    for (const t of ['Interview invitation', 'Needs attention', 'High urgency', 'Recruiter invites you to interview.', 'Pat Recruiter (example.com)', 'Example Corp · Engineer', 'Reply with availability', 'Evidence excerpt', 'We would like to schedule an interview.', 'Deadline', 'Received', 'Claude']) expect(h).toContain(t);
  });
  it('is intelligence, not a mail client: no reply/send/archive/delete/mark-read actions', () => {
    const h = emailHtml();
    expect(h).not.toMatch(/>Reply<|>Send<|Archive|Delete|Mark (as )?read|Compose/i);
    expect(h).toContain('cannot send, reply to or change any email');
  });
  it('has the category, attention, company, date, provider and status filters', () => {
    const h = emailHtml();
    for (const t of ['aria-label="Email filters"', 'Category', 'All categories', 'Recruiter reply', 'Interview invitation', 'Other job-search email', 'Needs attention only', 'Company', 'Received from', 'Received to', 'Provider', 'Status']) expect(h).toContain(t);
  });
  it('does not flag handled mail as needing attention', () => {
    const dismissed = W.toEmailView(emailRow({ status: 'DISMISSED' }));
    expect(dismissed.needsAttention).toBe(false);
    expect(emailHtml({ state: { status: 'ready', rows: [dismissed], hasNext: false } })).not.toContain('Needs attention</span>');
    expect(W.toEmailView(emailRow({ category: 'rejection', priority: 'LOW', due_at: null })).needsAttention).toBe(false);
  });
});

const recProps = (over: Partial<RecruiterPanelProps> = {}): RecruiterPanelProps => ({
  state: { status: 'ready', rows: [W.toRecruiterView(recruiterRow())], hasNext: false }, draft: W.DEFAULT_RECRUITER_FILTERS, page: 0, timeZone: 'America/Chicago', currentUserId: 'u1',
  configured: true, filtered: false, onDraft: noop, onApply: noop, onReset: noop, onPage: noop, onDismiss: async () => undefined, ...over,
});
const recHtml = (over: Partial<RecruiterPanelProps> = {}) => html(createElement(AiHubRecruitersPanel, recProps(over)));

describe('Recruiter Intelligence page', () => {
  it('renders every state', () => {
    expect(recHtml({ state: { status: 'loading' } })).toContain('Loading recruiter intelligence');
    expect(recHtml({ state: { status: 'error' } })).toContain('Recruiter intelligence could not be loaded.');
    expect(recHtml({ state: { status: 'ready', rows: [], hasNext: false } })).toContain('No recruiter intelligence yet.');
    expect(recHtml({ state: { status: 'ready', rows: [], hasNext: false }, configured: false })).toContain('Recruiter Intelligence is not configured');
  });
  it('shows name, role, company, public source, verification, provider and discovery date', () => {
    const h = recHtml();
    for (const t of ['Pat Recruiter', 'Technical Recruiter · Example Corp', 'Verified', 'Team page', 'Public profile', 'Found by', 'Claude', 'First surfaced']) expect(h).toContain(t);
  });
  it('labels unverified people and uncertain fields; never invents a contactable state', () => {
    const h = recHtml({ state: { status: 'ready', rows: [W.toRecruiterView(recruiterRow({ payload: { recruiter_name: 'Sam', company: 'Acme', verification: 'uncertain', uncertain_fields: ['role'] } }))], hasNext: false } });
    expect(h).toContain('Uncertain');
    expect(h).toContain('Not verified: the company or role association was not proven (role)');
    expect(h).not.toMatch(/contactable|verified email|Send message|>Connect</i);
    expect(h).not.toContain('Work email');
  });
  it('shows contact details only with their cited source, and links the related stored lead', () => {
    const view = W.toRecruiterView(recruiterRow({ payload: { recruiter_name: 'Pat', company: 'Acme', verification: 'verified', contact_email: 'pat@acme.example', contact_source_url: 'https://acme.example/contact', related_job: { company: 'Acme', title: 'Engineer' } } }));
    view.relatedLead = { id: 'f1', company: 'Acme', title: 'Staff Engineer' };
    const h = recHtml({ state: { status: 'ready', rows: [view], hasNext: false } });
    expect(h).toContain('pat@acme.example');
    expect(h).toContain('cited source');
    expect(h).toContain('Staff Engineer at Acme');
    const unresolved = W.toRecruiterView(recruiterRow({ payload: { recruiter_name: 'Pat', company: 'Acme', related_job: { company: 'Acme', title: 'Engineer' } } }));
    expect(recHtml({ state: { status: 'ready', rows: [unresolved], hasNext: false } })).toContain('reported by the provider; not in your job leads');
  });
});

describe('write boundary of the new web code', () => {
  it('only reads, plus the single owner-only dismiss RPC; no service role, innerHTML or core-table writes', () => {
    const files = ['apps/web/src/api/aiSources.ts', 'apps/web/src/lib/aiSources.ts', 'apps/web/src/views/AiHubJobLeads.tsx', 'apps/web/src/views/AiHubEmail.tsx', 'apps/web/src/views/AiHubRecruiters.tsx', 'apps/web/src/views/AiHubSourceParts.tsx'];
    for (const f of files) {
      const src = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/(?<!searchParams)\.(insert|update|delete|upsert)\(|service_role|dangerouslySetInnerHTML|innerHTML|api\(/);
      const rpcs = [...src.matchAll(/\.rpc\(\s*'([^']+)'/g)].map((m) => m[1]);
      expect(rpcs.every((r) => r === 'rpc_ai_dismiss_finding'), `${f}: ${rpcs.join()}`).toBe(true);
      expect(src, f).not.toMatch(/from\('(applications|contacts|tasks|interviews)'\)/);
    }
  });
});
