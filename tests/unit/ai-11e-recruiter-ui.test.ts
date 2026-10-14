import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import * as C from '../../apps/api/src/lib/aiContract';
import { toRecruiterIntel } from '../../apps/api/src/services/aiExternalIntelligenceService';
import * as W from '../../apps/web/src/lib/aiSources';
import * as R from '../../apps/web/src/lib/aiRecruiterDiscovery';
import { AiHubRecruitersPanel, RecruiterCard, groupRecruiters, type RecruiterPanelProps } from '../../apps/web/src/views/AiHubRecruiters';
import { RecruiterPreferenceFields } from '../../apps/web/src/components/ai/RecruiterDiscoveryPanel';

// AI-11E browser side: the Recruiter Intel page (grouped, verified / uncertain, why, drafts that are never sent, read-only application
// relation, source health) and the Recruiter Intelligence settings form. Server behaviour is covered in the other ai-11e suites.
vi.mock('../../apps/web/src/supabase', () => ({ supabase: { from: () => { throw new Error('unexpected'); }, rpc: () => { throw new Error('unexpected'); } } }));

const noop = () => undefined;
const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);

const row = (payload: Record<string, unknown> = {}, over: Partial<W.RecruiterRow> = {}): W.RecruiterRow => ({
  id: 'r1', user_id: 'u1', provider: 'claude', status: 'NEW', confidence: 0.7, title: 'Pat', summary: null, source_ref: { url: 'https://example.com/team' },
  created_at: '2026-10-01T15:00:00Z', updated_at: '2026-10-01T15:00:00Z',
  payload: {
    recruiter_name: 'Pat Recruiter', role_title: 'Technical Recruiter', company: 'Example Corp', relationship: 'technical_recruiter', verification: 'verified', verification_basis: 'company_page',
    source_name: 'Team page', profile_url: 'https://example.com/team/pat', why: 'Technical recruiting role is shown on the careers page.', discovery_mode: 'job_linked', ...payload,
  }, ...over,
});
const view = (payload: Record<string, unknown> = {}, over: Partial<W.RecruiterRow> = {}) => W.toRecruiterView(row(payload, over));
const props = (over: Partial<RecruiterPanelProps> = {}): RecruiterPanelProps => ({
  state: { status: 'ready', rows: [view()], hasNext: false }, draft: W.DEFAULT_RECRUITER_FILTERS, page: 0, timeZone: 'America/Chicago', currentUserId: 'u1',
  configured: true, filtered: false, onDraft: noop, onApply: noop, onReset: noop, onPage: noop, onDismiss: async () => undefined, ...over,
});
const panel = (over: Partial<RecruiterPanelProps> = {}) => html(createElement(AiHubRecruitersPanel, props(over)));

describe('AI-11E client/server contract sync', () => {
  it('vocabularies, limits and defaults mirror the server', () => {
    expect([...R.RECRUITER_PREFERRED_ROLES]).toEqual([...C.RECRUITER_PREFERRED_ROLES]);
    expect(R.RECRUITER_LIMITS).toMatchObject({ targetCompanies: C.RECRUITER_LIMITS.targetCompanies, companyChars: C.RECRUITER_LIMITS.companyChars, maxNewContactsMax: C.RECRUITER_LIMITS.maxNewContactsMax, suppressionDays: C.RECRUITER_LIMITS.suppressionDays });
    expect(R.DEFAULT_RECRUITER_PREFERENCES).toEqual(C.DEFAULT_RECRUITER_PREFERENCES);
    for (const r of C.RECRUITER_RELATIONSHIPS) expect(W.RELATIONSHIP_LABELS[r], r).toBeTruthy();
    for (const b of C.RECRUITER_VERIFICATION_BASES) expect(W.VERIFICATION_BASIS_LABELS[b], b).toBeTruthy();
    for (const r of C.RECRUITER_PREFERRED_ROLES) expect(R.RECRUITER_PREFERRED_ROLE_LABELS[r], r).toBeTruthy();
    expect(W.RECRUITER_MODE_FILTERS.filter((m) => m.id !== 'ALL').map((m) => m.id)).toEqual([...C.RECRUITER_DISCOVERY_MODES]);
    expect(W.RECRUITER_VERIFICATION_FILTERS.filter((m) => m.id !== 'ALL').map((m) => m.id)).toEqual([...C.RECRUITER_VERIFICATIONS]);
  });

  it('the browser view and the server DTO read a stored row the same way', () => {
    const payload = {
      recruiter_name: 'Pat', company: 'Acme', role_title: 'QA Manager', relationship: 'qa_manager', verification: 'verified', verification_basis: 'job_posting', posting_contact: true,
      why: 'Named in the posting.', discovery_mode: 'job_linked', draft_note: 'Hi Pat, I would value connecting.', draft_email: { subject: 'Hello', body: 'Body' },
      contact_email: 'pat@acme.example.com', contact_source_url: 'https://acme.example.com/contact', contact_phone: '555',
    };
    const r = row(payload, { updated_at: '2026-10-03T10:00:00Z' });
    const web = W.toRecruiterView(r), api = toRecruiterIntel({ ...r });
    expect(web).toMatchObject({ name: api.name, why: api.why, verificationBasis: api.verificationBasis, discoveryMode: api.discoveryMode, postingContact: api.postingContact, draftNote: api.draftNote, draftEmail: api.draftEmail, lastSeenAt: api.lastSeenAt });
    expect(web.verified).toBe(api.verification === 'verified');
    expect(web.contact).toEqual(api.contact);
    expect(JSON.stringify(web)).not.toContain('555');
  });
});

describe('AI-11E Recruiter Intel page', () => {
  it('groups by the server-verified mode: job-linked, target companies, other; empty groups are omitted', () => {
    const rows = [
      view({ discovery_mode: 'job_linked' }, { id: 'a' }), view({ discovery_mode: 'target_company', recruiter_name: 'Tia' }, { id: 'b' }),
      view({ discovery_mode: undefined, recruiter_name: 'Old' }, { id: 'c' }), view({ discovery_mode: 'job_linked', recruiter_name: 'Jo' }, { id: 'd' }),
    ];
    const g = groupRecruiters(rows);
    expect(g.map((x) => [x.id, x.rows.map((r) => r.id)])).toEqual([['job_linked', ['a', 'd']], ['target_company', ['b']], ['other', ['c']]]);
    expect(groupRecruiters([rows[0]!]).map((x) => x.id)).toEqual(['job_linked']);
    expect(groupRecruiters([])).toEqual([]);
    // an unknown / spoofed mode value is not trusted
    expect(view({ discovery_mode: 'everyone' }).discoveryMode).toBeNull();
    const h = panel({ state: { status: 'ready', rows, hasNext: false } });
    for (const t of ['Job-linked', 'Target companies', 'Other', 'recruiter-group-job_linked', 'recruiter-group-target_company', 'recruiter-group-other']) expect(h).toContain(t);
  });

  it('shows company, role, person, public role, Verified / Uncertain, why, source and profile', () => {
    const h = panel();
    for (const t of ['Recruiters to connect with', 'Pat Recruiter', 'Technical Recruiter · Example Corp', 'Verified', 'Technical recruiter', 'Why this person', 'Technical recruiting role is shown on the careers page.', 'Team page', 'Public profile', 'Verified by', 'company page', 'First surfaced', 'Found by', 'Claude']) expect(h).toContain(t);
  });

  it('shows the role being hired for when the stored lead is known, and says so honestly when only the provider reported it', () => {
    const v = view({ related_job: { company: 'Example Corp', title: 'QA Engineer' } });
    v.relatedLead = { id: 'lead-1', company: 'Example Corp', title: 'Senior QA Engineer' };
    expect(html(createElement(RecruiterCard, { item: v, timeZone: 'UTC', currentUserId: 'u1' }))).toContain('Role being hired for');
    expect(html(createElement(RecruiterCard, { item: v, timeZone: 'UTC', currentUserId: 'u1' }))).toContain('Senior QA Engineer at Example Corp');
    const unresolved = view({ related_job: { company: 'Example Corp', title: 'QA Engineer' } });
    expect(html(createElement(RecruiterCard, { item: unresolved, timeZone: 'UTC', currentUserId: 'u1' }))).toContain('reported by the provider; not in your job leads');
  });

  it('marks an uncertain person visibly and never upgrades it', () => {
    const h = html(createElement(RecruiterCard, { item: view({ verification: 'uncertain', verification_basis: 'company_page', uncertain_fields: ['role'] }), timeZone: 'UTC', currentUserId: 'u1' }));
    expect(h).toContain('Uncertain');
    expect(h).not.toContain('>Verified<');
    expect(h).not.toContain('Verified by');
    expect(h).toContain('Not verified: the company or role association was not proven (role)');
  });

  it('shows a work email only with its cited source, and never a phone number', () => {
    const withEmail = html(createElement(RecruiterCard, { item: view({ contact_email: 'pat@example.com', contact_source_url: 'https://example.com/contact', contact_phone: '+1 555 0100' }), timeZone: 'UTC', currentUserId: 'u1' }));
    expect(withEmail).toContain('pat@example.com');
    expect(withEmail).toContain('cited source');
    expect(withEmail).not.toContain('555');
    const uncited = html(createElement(RecruiterCard, { item: view({ contact_email: 'pat@example.com' }), timeZone: 'UTC', currentUserId: 'u1' }));
    expect(uncited).not.toContain('pat@example.com');
  });

  it('draft outreach text is labelled a draft, is never sent, and the page has no send / connect / contact control', () => {
    const h = html(createElement(RecruiterCard, {
      item: view({ draft_note: 'Hi Pat, I would value connecting about QA roles.', draft_email: { subject: 'QA automation engineer', body: 'Hello Pat, a short note.' } }), timeZone: 'UTC', currentUserId: 'u1',
    }));
    expect(h).toContain('Draft connection note (not sent)');
    expect(h).toContain('Draft email (not sent)');
    expect(h).toContain('Hi Pat, I would value connecting about QA roles.');
    expect(h).toContain('Subject: QA automation engineer');
    expect(h).toContain('JobQuest never sends it');
    const buttons = [...h.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, '').trim());
    expect(buttons.every((b) => /^(Copy|Dismiss)/.test(b)), buttons.join('|')).toBe(true);
    expect(h).not.toMatch(/mailto:|href="[^"]*linkedin\.com\/messaging|Send message|Send email|Send request|Contacted|Mark as contacted/i);
  });

  it('a draft containing markup renders as inert text', () => {
    const evil = '<img src=x onerror=alert(1)><script>alert(2)</script>';
    const h = html(createElement(RecruiterCard, { item: view({ draft_note: evil, why: evil, recruiter_name: evil }), timeZone: 'UTC', currentUserId: 'u1' }));
    expect(h).not.toContain('<script>');
    expect(h).not.toContain('<img src=x');
    expect(h).toContain('&lt;script&gt;');
  });

  it('shows the application relation read-only, from the related lead only', () => {
    const v = view();
    v.relatedLead = { id: 'lead-1', company: 'Example Corp', title: 'QA Engineer' };
    const matched: W.EmailMatchView = { state: 'MATCHED', application: { id: 'app-1', company: 'Example Corp', title: 'QA Engineer', stage: 'APPLIED', status: 'ACTIVE', outcome: null }, possible: [] };
    const h = panel({ state: { status: 'ready', rows: [v], hasNext: false }, matches: { 'lead-1': matched } });
    expect(h).toContain('You already have an application for this job');
    const possible = panel({ state: { status: 'ready', rows: [v], hasNext: false }, matches: { 'lead-1': { state: 'POSSIBLE', application: null, possible: [matched.application!] } } });
    expect(possible).toContain('Possibly tracked, not confirmed');
    expect(possible).not.toContain('You already have an application');
    expect(panel({ state: { status: 'ready', rows: [v], hasNext: false }, matches: { other: matched } })).not.toContain('application for this job');
    expect(panel({ matches: { 'lead-1': matched } })).not.toContain('You already have an application'); // no related lead = no relation
    expect(panel({ state: { status: 'ready', rows: [v], hasNext: false }, matchesUnavailable: true })).toContain('Contacts are shown without it');
  });

  it('offers the filters: show (all / job-linked / target company), verification, company, provider, status', () => {
    const h = panel();
    for (const t of ['Show', 'Job-linked', 'Target company', 'Verification', 'Verified', 'Uncertain', 'Company', 'Provider', 'Status', 'Search name or company']) expect(h).toContain(t);
  });

  it('source health: a source that could not be reached is never reported as "no recruiter exists"', () => {
    const run = (statuses: string[]) => W_run(statuses);
    const none = panel({ lastRun: run(['blocked', 'unavailable']) });
    expect(none).toContain('could not search any source');
    expect(none).toContain('not the same as no recruiter existing');
    const quiet = panel({ lastRun: run(['zero', 'zero']) });
    expect(quiet).toContain('searched 2 sources and found no new contact');
    expect(quiet).not.toContain('could not search');
    expect(panel({ lastRun: run(['ok', 'blocked']) })).toContain('1 returned results, 1 blocked');
    expect(panel({ lastRun: run([]) })).toContain('did not report per-source status');
    expect(panel({ lastRun: null })).not.toContain('Last recruiter research');
    for (const s of C.AI_SOURCE_STATUSES) expect(R.recruiterRunSummary(W_run([s])), s).toBeTruthy();
  });

  it('states: loading, error, empty, not configured', () => {
    expect(panel({ state: { status: 'loading' } })).toContain('Loading recruiter intelligence');
    expect(panel({ state: { status: 'error' } })).toContain('Recruiter intelligence could not be loaded.');
    expect(panel({ state: { status: 'ready', rows: [], hasNext: false } })).toContain('No recruiter intelligence yet.');
    expect(panel({ state: { status: 'ready', rows: [], hasNext: false }, configured: false })).toContain('Recruiter Intelligence is not configured');
    expect(W.SOURCE_NOT_CONFIGURED.recruiters).toContain('Settings → AI & Automation → Recruiter Intelligence');
  });
});

function W_run(statuses: string[]) {
  return R.toDiscoveryRunView({
    id: 'run-1', provider: 'claude', status: 'SUCCEEDED', created_at: '2026-10-01T10:00:00Z', completed_at: '2026-10-01T10:05:00Z',
    sources: statuses.map((status, i) => ({ type: 'web', ref: `s${i}`, observed_at: '2026-10-01T10:00:00Z', status })), counts: {},
  });
}

describe('AI-11E Recruiter Intelligence settings form', () => {
  const form = (over: Partial<R.RecruiterFormState> = {}): R.RecruiterFormState => ({ ...R.prefsToForm(R.DEFAULT_RECRUITER_PREFERENCES), ...over });

  it('validates the same bounds as the server', () => {
    expect(R.validateRecruiterForm(form())).toEqual({});
    expect(R.validateRecruiterForm(form({ targetNetworkingEnabled: true }))).toMatchObject({ targetCompanies: expect.stringContaining('at least one company') });
    expect(R.validateRecruiterForm(form({ targetNetworkingEnabled: true, targetCompanies: 'Acme' }))).toEqual({});
    expect(R.validateRecruiterForm(form({ targetCompanies: Array.from({ length: 26 }, (_, i) => `Co ${i}`).join('\n') }))).toHaveProperty('targetCompanies');
    expect(R.validateRecruiterForm(form({ targetCompanies: 'x'.repeat(121) }))).toHaveProperty('targetCompanies');
    expect(R.validateRecruiterForm(form({ preferredRoles: [] }))).toHaveProperty('preferredRoles');
    for (const bad of ['0', '11', '2.5', '', 'abc']) expect(R.validateRecruiterForm(form({ maxNewContactsPerRun: bad })), bad).toHaveProperty('maxNewContactsPerRun');
    expect(R.validateRecruiterForm(form({ maxNewContactsPerRun: '10' }))).toEqual({});
  });

  it('turns the form into the saved shape: one line per company, duplicates folded, roles in a stable order', () => {
    const p = R.formToPrefs(form({ targetCompanies: ' Acme \n\nacme\nGlobex  Corp\n', preferredRoles: ['qa_manager', 'technical_recruiter'], maxNewContactsPerRun: '4' }));
    expect(p).toMatchObject({ targetCompanies: ['Acme', 'Globex Corp'], preferredRoles: ['technical_recruiter', 'qa_manager'], maxNewContactsPerRun: 4 });
    expect(R.prefsToForm(p).targetCompanies).toBe('Acme\nGlobex Corp');
    // what the browser sends is exactly what the server accepts
    expect(C.parseRecruiterPreferences(p).ok).toBe(true);
    expect(C.parseRecruiterPreferences(R.formToPrefs(form({ targetCompanies: 'Acme\nGlobex' }))).ok).toBe(true);
  });

  it('renders the controls with labels and no scheduling or provider controls', () => {
    const h = html(createElement(RecruiterPreferenceFields, { form: form({ targetCompanies: 'Acme\nGlobex' }), errors: { targetCompanies: 'Add at least one company.' }, disabled: false, onChange: noop }));
    for (const t of ['Job-linked recruiter research', 'Target-company networking', 'Target companies', 'Preferred roles', 'Technical recruiter', 'QA / test manager', 'Maximum new contacts per run', 'Allow draft outreach text', 'never sends them', 'Add at least one company.', 'Acme']) expect(h).toContain(t);
    expect(h).not.toMatch(/cron|schedule|every day|weekday|api key|token|password|secret|provider/i);
  });

  it('describes saved preferences in one honest line', () => {
    expect(R.describePreferences({ ...R.DEFAULT_RECRUITER_PREFERENCES, targetCompanies: ['A'], targetNetworkingEnabled: true })).toBe('job-linked research on · target-company networking on · 1 target company · up to 5 new contacts per run');
    expect(R.describePreferences({ ...R.DEFAULT_RECRUITER_PREFERENCES, jobLinkedEnabled: false, maxNewContactsPerRun: 1 })).toContain('job-linked research off');
  });
});

describe('AI-11E write boundary of the new web code', () => {
  it('the Recruiter Intel page only reads (plus the single dismiss RPC); the settings client talks to the JobQuest API only', () => {
    const strip = (s: string) => s.replace(/\/\/.*$/gm, '');
    for (const f of ['apps/web/src/views/AiHubRecruiters.tsx', 'apps/web/src/lib/aiRecruiterDiscovery.ts', 'apps/web/src/components/ai/RecruiterDiscoveryPanel.tsx']) {
      const src = strip(readFileSync(f, 'utf8'));
      expect(src, f).not.toMatch(/(?<!searchParams)\.(insert|update|delete|upsert)\(|service_role|dangerouslySetInnerHTML|innerHTML|\bapi\(|\.rpc\(|from\('(applications|contacts|tasks|interviews)'\)/);
      expect(src, f).not.toMatch(/mailto:|window\.open|location\.href\s*=|fetch\(|XMLHttpRequest|sendBeacon/);
    }
    const apiSrc = strip(readFileSync('apps/web/src/api/aiRecruiterDiscovery.ts', 'utf8'));
    expect([...apiSrc.matchAll(/api<[^(]*\(\s*[`'"]([^`'"?]+)/g)].map((m) => m[1])).toEqual(['/ai/recruiter-discovery/preferences', '/ai/recruiter-discovery/preferences']);
    expect(apiSrc).not.toMatch(/\.(insert|update|delete|upsert)\(|\.rpc\(|mcp/i);
  });
});
