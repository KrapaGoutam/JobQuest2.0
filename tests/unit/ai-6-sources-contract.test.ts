import { describe, expect, it } from 'vitest';
import {
  EMAIL_ATTENTION_CATEGORIES, EMAIL_CATEGORIES, JOB_DESCRIPTION_MAX_CHARS, STRONG_MATCH_THRESHOLD,
  buildDedupeKey, validateAiResult,
} from '../../apps/api/src/lib/aiContract';
import { normalizeJobDescription } from '../../apps/api/src/lib/aiContract/validate';
import {
  emailTriageFinding, external, invalidExternal, jobDescription, jobLeadFinding, recruiterIntelFinding,
} from './fixtures/ai-contract/external';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
type Loose = { provider?: string; findings: Array<Record<string, any>>; [k: string]: any };
const loose = (x: unknown): Loose => clone(x) as Loose;
const ok = (x: unknown) => {
  const r = validateAiResult(x);
  expect(r.errors, JSON.stringify(r.errors)).toEqual([]);
  expect(r.success).toBe(true);
  return r;
};
const codes = (x: unknown) => validateAiResult(x).errors.map((e) => e.code);
const warnCodes = (x: unknown) => validateAiResult(x).warnings.map((e) => e.code);
const first = (x: unknown) => ok(x).data!.findings[0]!;
const keyOf = (x: unknown) => first(x).dedupe_key;
const jobEnvelope = (finding: unknown, provider = 'claude') => ({ ...clone(external.jobDiscovery), provider, findings: [finding] });

describe('AI-6 golden fixtures', () => {
  it('accepts a job discovery result', () => {
    const f = first(external.jobDiscovery);
    expect(f.kind).toBe('job_lead');
    expect(f.job_lead).toMatchObject({
      company: 'Example Corp', title: 'Staff Engineer', location: 'Austin, TX', work_arrangement: 'hybrid', employment_type: 'full_time',
      source_name: 'example jobs', external_job_id: 'EX-42', posted_date: '2026-09-28', salary_min: 150000, salary_max: 190000,
      salary_currency: 'USD', salary_period: 'year', match_score: 86, required_skills: ['TypeScript', 'PostgreSQL'], preferred_skills: ['Kubernetes'],
      description_truncated: false, payload_version: '1.0',
    });
    expect(f.job_lead!.description).toBe(jobDescription);
  });

  it('keeps the description out of the stored finding payload (it lives in ai_job_leads)', () => {
    const f = first(external.jobDiscovery);
    expect(JSON.stringify(f.payload)).not.toContain('Build reliable systems');
    expect(f.payload).not.toHaveProperty('description');
    expect(f.payload).toMatchObject({ version: '1.0', company: 'Example Corp', role_title: 'Staff Engineer', match_score: 86 });
  });

  it('accepts an email triage result with a closed category and received time', () => {
    const f = first(external.emailTriage);
    expect(f.category).toBe('interview_invitation');
    expect(f.occurred_at).toBe('2026-10-01T14:30:00.000Z');
    expect(f.payload).toMatchObject({ sender_name: 'Pat Recruiter', sender_domain: 'example.com', subject: 'Interview with Example Corp', needs_attention: true });
    expect(f.source_ref).toMatchObject({ thread_id: 'thread-100', provider_message_id: 'gmail-msg-100' });
  });

  it('accepts a recruiter result and computes the related job key itself', () => {
    const f = first(external.recruiterIntel);
    expect(f.payload).toMatchObject({ recruiter_name: 'Pat Recruiter', company: 'Example Corp', verification: 'verified' });
    // Computed from the stated identity (URL only here); resolved against ai_job_leads by URL or external id at read time.
    expect(f.payload.related_job_key).toBe('url:https://jobs.example.com/posting/42');
  });

  it('accepts one envelope carrying all three source kinds', () => {
    const r = ok(external.multiSource);
    expect(r.data!.findings.map((f) => f.kind)).toEqual(['job_lead', 'email_event', 'recruiter_intel']);
    expect(r.rejectedItemCount).toBe(0);
  });

  it('reuses the existing workflows and finding kinds (no new enum values)', () => {
    for (const w of ['email_triage', 'job_discovery', 'recruiter_intel', 'daily_brief']) {
      expect(validateAiResult({ ...clone(external.jobDiscovery), workflow: w }).success).toBe(true);
    }
    expect(validateAiResult({ ...clone(external.jobDiscovery), workflow: 'daily_digest' }).success).toBe(false);
  });
});

describe('job lead validation', () => {
  it('truncates an over-long description, flags it and records the original length', () => {
    const r = ok(invalidExternal.oversizedDescription);
    const f = r.data!.findings[0]!;
    expect([...f.job_lead!.description!].length).toBe(JOB_DESCRIPTION_MAX_CHARS);
    expect(f.job_lead).toMatchObject({ description_truncated: true, description_length: 30_500 });
    expect(f.payload).toMatchObject({ description_truncated: true, description_length: 30_500 });
    expect(r.warnings.map((w) => w.code)).toContain('description_truncated');
  });

  it('stores plain text only: HTML is stripped and flagged', () => {
    const r = ok(invalidExternal.htmlDescription);
    const d = r.data!.findings[0]!.job_lead!.description!;
    expect(d).not.toMatch(/<|alert\(1\)/);
    expect(d).toContain('Hello & welcome');
    expect(d).toContain('- One');
    expect(r.warnings.map((w) => w.code)).toContain('html_stripped');
  });

  it('normalizeJobDescription is bounded and does not touch ordinary comparisons', () => {
    expect(normalizeJobDescription('Need 5 < 10 years & more').text).toBe('Need 5 < 10 years & more');
    expect(normalizeJobDescription('a\r\n\r\n\r\n\r\nb').text).toBe('a\n\nb');
    expect(normalizeJobDescription('&lt;b&gt;bold&lt;/b&gt;').text).toBe('bold');
    expect(normalizeJobDescription('   ').text).toBeNull();
  });

  it('rejects unsafe or credential-bearing URLs and invalid scores', () => {
    expect(codes(invalidExternal.badUrl)).toContain('url_scheme');
    expect(codes(invalidExternal.credentialUrl)).toContain('url_credentials');
    expect(codes(invalidExternal.badScore)).toContain('match_score');
    expect(codes(invalidExternal.scoreAsString)).toContain('match_score');
    expect(validateAiResult(invalidExternal.badScore).rejectedItemCount).toBe(1);
  });

  it('requires company and role, and a strong identity', () => {
    expect(codes(invalidExternal.missingJobIdentity)).toContain('dedupe');
    const noCompany = loose(external.jobDiscovery);
    delete noCompany.findings[0]!.payload.company;
    expect(codes(noCompany)).toContain('job_lead_identity');
    const noId = loose(external.jobDiscovery);
    noId.findings[0]!.dedupe = {}; delete noId.findings[0]!.payload.job_url; delete noId.findings[0]!.payload.external_job_id; delete noId.findings[0]!.source;
    delete noId.findings[0]!.payload.source_name; delete noId.findings[0]!.payload.posted_date; // location alone is not enough
    expect(codes(noId)).toContain('dedupe');
  });

  it('does not invent values: absent salary, date and score stay absent', () => {
    const lead = loose(external.jobDiscovery);
    for (const k of ['salary_min', 'salary_max', 'salary_currency', 'salary_period', 'posted_date', 'match_score', 'experience_level', 'description']) delete lead.findings[0]!.payload[k];
    const f = first(lead);
    expect(f.job_lead).toMatchObject({ salary_min: null, salary_max: null, salary_currency: null, posted_date: null, match_score: null, experience_level: null, description: null });
    for (const k of ['salary_min', 'posted_date', 'match_score']) expect(f.payload).not.toHaveProperty(k);
  });

  it('drops an inverted salary range instead of repairing it', () => {
    const lead = loose(external.jobDiscovery);
    Object.assign(lead.findings[0]!.payload, { salary_min: 200000, salary_max: 100000 });
    const r = validateAiResult(lead);
    expect(r.success).toBe(true);
    expect(r.data!.findings[0]!.job_lead).toMatchObject({ salary_min: null, salary_max: null });
    expect(r.warnings.map((w) => w.code)).toContain('salary_range');
  });

  it('accepts the legacy remote flag and normalizes aliases', () => {
    const lead = loose(external.jobDiscovery);
    delete lead.findings[0]!.payload.work_arrangement;
    Object.assign(lead.findings[0]!.payload, { remote: true, employment_type: 'Full-Time' });
    expect(first(lead).job_lead).toMatchObject({ work_arrangement: 'remote', employment_type: 'full_time' });
    lead.findings[0]!.payload.work_arrangement = 'On-Site';
    expect(first(lead).job_lead!.work_arrangement).toBe('onsite');
    lead.findings[0]!.payload.employment_type = 'gig';
    expect(codes(lead)).toContain('enum');
  });

  it('never trusts scope, workspace, user or application ids', () => {
    const r = ok(invalidExternal.untrustedIds);
    expect(r.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['untrusted_scope_field']));
    expect(JSON.stringify(r.data)).not.toMatch(/22222222|33333333|44444444/);
  });

  it('exposes a documented strong-match threshold', () => expect(STRONG_MATCH_THRESHOLD).toBe(80));
});

describe('job lead dedupe (provider is never part of identity)', () => {
  const lead = (dedupe: Record<string, unknown>, payload: Record<string, unknown> = {}, provider = 'claude') =>
    jobEnvelope(jobLeadFinding({ dedupe, source: undefined }, { job_url: undefined, external_job_id: undefined, source_name: undefined, posted_date: undefined, ...payload }), provider);

  it('same external id + source from different providers is one lead', () => {
    const a = lead({}, { external_job_id: 'EX-42', source_name: 'Greenhouse' }, 'claude');
    const b = lead({}, { external_job_id: 'EX-42', source_name: 'greenhouse', location: 'Different text' }, 'chatgpt');
    expect(keyOf(a)).toBe(keyOf(b));
    expect(keyOf(a)).toMatch(/^job:/);
  });

  it('the same external id on a different board is a different lead', () => {
    expect(keyOf(lead({}, { external_job_id: 'EX-42', source_name: 'Greenhouse' }))).not.toBe(keyOf(lead({}, { external_job_id: 'EX-42', source_name: 'Lever' })));
  });

  it('the external id wins over the URL', () => {
    const both = lead({ job_url: 'https://jobs.example.com/a' }, { external_job_id: 'EX-42', source_name: 'Greenhouse' });
    expect(keyOf(both)).toMatch(/^job:/);
  });

  it('the same canonical URL (tracking params, case, fragment) from different providers is one lead', () => {
    const a = lead({ job_url: 'https://Jobs.Example.com/posting/42/?utm_source=x#apply' }, {}, 'claude');
    const b = lead({ job_url: 'https://jobs.example.com/posting/42' }, {}, 'chatgpt');
    expect(keyOf(a)).toBe(keyOf(b));
    expect(keyOf(a)).toMatch(/^url:/);
  });

  it('falls back to the payload job_url when dedupe.job_url is absent', () => {
    expect(keyOf(lead({}, { job_url: 'https://jobs.example.com/posting/42' }))).toBe('url:https://jobs.example.com/posting/42');
  });

  it('company + title + location + posted date is a strong identity; different posting dates stay separate', () => {
    const a = lead({}, { posted_date: '2026-09-28' }, 'claude');
    const b = lead({}, { posted_date: '2026-09-28', company: ' EXAMPLE corp ' }, 'gemini');
    const c = lead({}, { posted_date: '2026-09-20' });
    expect(keyOf(a)).toBe(keyOf(b));
    expect(keyOf(a)).toMatch(/^jobclp:/);
    expect(keyOf(c)).not.toBe(keyOf(a));
  });

  it('company + title + source is the last resort and distinct openings stay separate', () => {
    const a = lead({}, { source_name: 'Example Jobs', location: undefined });
    expect(keyOf(a)).toMatch(/^jobcts:/);
    expect(keyOf(lead({}, { source_name: 'Example Jobs', location: undefined, role_title: 'Principal Engineer' }))).not.toBe(keyOf(a));
    expect(keyOf(lead({}, { source_name: 'Example Jobs', location: undefined, company: 'Other Corp' }))).not.toBe(keyOf(a));
  });

  it('refuses company + title alone (not a strong identity)', () => {
    expect(buildDedupeKey('job_lead', { company: 'A', title: 'B' }).ok).toBe(false);
  });

  it('derives the source name from the posting host when none is stated', () => {
    const a = lead({}, { job_url: undefined, external_job_id: 'EX-42' });
    expect(codes(a)).toContain('dedupe'); // no source and no URL: an id alone is not scoped
    const b = jobEnvelope(jobLeadFinding({ dedupe: {}, source: { url: 'https://boards.example.com/job/42' } }, { job_url: 'https://www.boards.example.com/job/42', source_name: undefined, external_job_id: 'EX-42' }));
    expect(first(b).job_lead!.source_name).toBe('boards.example.com');
    expect(keyOf(b)).toMatch(/^job:/);
  });
});

describe('email intelligence validation', () => {
  const email = (over: Record<string, unknown> = {}, payload: Record<string, unknown> = {}) => ({ ...clone(external.emailTriage), findings: [emailTriageFinding(over, payload)] });

  it('accepts exactly the approved categories, case-insensitively', () => {
    expect(EMAIL_CATEGORIES).toHaveLength(18); // 10 job-related + 4 other (AI-11B) + 4 legacy AI-6 spellings
    for (const c of EMAIL_CATEGORIES) expect(first(email({ category: c })).category).toBe(c);
    expect(first(email({ category: 'Interview Invitation' })).category).toBe('interview_invitation');
    expect(codes(invalidExternal.badEmailCategory)).toContain('email_category');
    expect(codes(email({ category: undefined }))).toContain('email_category');
    expect(EMAIL_ATTENTION_CATEGORIES.every((c) => (EMAIL_CATEGORIES as readonly string[]).includes(c))).toBe(true);
  });

  it('requires the received time and a stable identity', () => {
    expect(codes(email({ occurred_at: undefined }))).toContain('required');
    expect(codes(email({ dedupe: { source_type: 'gmail' } }, { subject: undefined }))).toContain('dedupe');
    expect(codes(invalidExternal.missingEmailIdentity)).toEqual([]); // sender + time + subject is the documented fallback
  });

  it('one message id is one finding regardless of classification wording; other messages are separate', () => {
    expect(keyOf(email({ category: 'follow_up' }))).toBe(keyOf(email({ category: 'recruiter_reply', title: 'Different wording' })));
    expect(keyOf(email({ dedupe: { source_type: 'gmail', source_id: 'gmail-msg-101' } }))).not.toBe(keyOf(email()));
    expect(keyOf(email())).toMatch(/^ev:/);
  });

  it('unrelated emails with the same subject do not collapse', () => {
    const a = email({ dedupe: { source_type: 'gmail', source_id: 'm-1' } }, { subject: 'Update' });
    const b = email({ dedupe: { source_type: 'gmail', source_id: 'm-2' } }, { subject: 'Update' });
    expect(keyOf(a)).not.toBe(keyOf(b));
  });

  it('uses the sender/time/subject fallback only when no message id exists', () => {
    const noId = (subject: string, sender = 'example.com', at = '2026-10-01T09:30:00-05:00') =>
      email({ dedupe: { source_type: 'gmail' }, occurred_at: at }, { subject, sender_domain: sender });
    expect(keyOf(noId('Hello'))).toMatch(/^emfb:/);
    expect(keyOf(noId('Hello'))).toBe(keyOf(noId('  HELLO ')));
    expect(keyOf(noId('Hello'))).not.toBe(keyOf(noId('Hello', 'other.com')));
    expect(keyOf(noId('Hello'))).not.toBe(keyOf(noId('Hello', 'example.com', '2026-10-02T09:30:00-05:00')));
  });

  it('never stores a message body or attachments; drops them with a warning', () => {
    const e = email({ body: 'FULL BODY SECRET', raw_body: 'x' }, { body: 'FULL BODY SECRET', html: '<p>x</p>', attachments: ['a.pdf'], content: 'y' });
    const r = ok(e);
    expect(JSON.stringify(r.data)).not.toMatch(/FULL BODY SECRET|<p>x<\/p>|a\.pdf/);
    expect(r.warnings.map((w) => w.code)).toContain('raw_body_rejected');
    expect(r.unknownFieldCount).toBeGreaterThan(0);
  });

  it('keeps a display name and domain, never a full sender address', () => {
    const f = first(email({}, { sender_name: 'Pat Recruiter <pat@example.com>', sender_domain: 'Pat <PAT@Example.com>' }));
    expect(f.payload.sender_name).toBe('Pat Recruiter');
    expect(f.payload.sender_domain).toBe('example.com');
    expect(JSON.stringify(f)).not.toMatch(/pat@example\.com/i);
    expect(codes(email({}, { sender_domain: 'not a domain' }))).toContain('domain');
  });

  it('bounds subject, summary and evidence', () => {
    const f = first(email({ evidence: 'e'.repeat(900) }, { subject: 's'.repeat(400) }));
    expect([...f.evidence!].length).toBeLessThanOrEqual(500);
    expect([...(f.payload.subject as string)].length).toBeLessThanOrEqual(200);
    expect(codes(email({ summary: 'x'.repeat(1001) }))).toContain('too_long');
  });

  it('turns the extracted deadline into the queryable due time when no due_at is given', () => {
    const f = first(email({ due_at: undefined }, { deadline: '2026-10-04T23:59:00Z' }));
    expect(f.due_at).toBe('2026-10-04T23:59:00.000Z');
    expect(f.payload.deadline).toBe('2026-10-04T23:59:00.000Z');
  });

  it('accepts the legacy from_domain alias', () => {
    expect(first(email({}, { sender_domain: undefined, from_domain: 'legacy.example.com' })).payload.sender_domain).toBe('legacy.example.com');
  });
});

describe('recruiter intelligence validation', () => {
  const rec = (over: Record<string, unknown> = {}, payload: Record<string, unknown> = {}) => ({ ...clone(external.recruiterIntel), findings: [recruiterIntelFinding(over, payload)] });

  it('requires a cited public source', () => {
    expect(codes(invalidExternal.recruiterWithoutSource)).toContain('recruiter_source_required');
    expect(validateAiResult(rec({ source: undefined }, { profile_url: 'https://example.com/in/pat' })).success).toBe(true);
    expect(validateAiResult(rec({ source: { url: 'https://example.com/team' } }, { profile_url: undefined })).success).toBe(true);
  });

  it('requires a name and company and rejects unsafe URLs', () => {
    expect(codes(rec({}, { recruiter_name: undefined }))).toContain('required');
    expect(codes(rec({}, { company: undefined }))).toContain('required');
    expect(codes(rec({}, { profile_url: 'javascript:alert(1)' }))).toContain('url_scheme');
  });

  it('drops contact details that are not backed by a cited contact source (no guessing)', () => {
    const r = ok(rec({}, { contact_email: 'pat.recruiter@example.com', contact_phone: '+1 555 010 0100' }));
    expect(r.data!.findings[0]!.payload).not.toHaveProperty('contact_email');
    expect(r.data!.findings[0]!.payload).not.toHaveProperty('contact_phone');
    expect(r.warnings.map((w) => w.code)).toContain('contact_uncited_dropped');
  });

  it('keeps contact details only with a contact_source_url, and validates their shape', () => {
    const r = ok(rec({}, { contact_email: 'Pat@Example.com', contact_source_url: 'https://example.com/contact' }));
    expect(r.data!.findings[0]!.payload).toMatchObject({ contact_email: 'pat@example.com', contact_source_url: 'https://example.com/contact' });
    expect(codes(rec({}, { contact_email: 'not-an-email', contact_source_url: 'https://example.com/contact' }))).toContain('email');
    expect(codes(rec({}, { contact_phone: 'abc', contact_source_url: 'https://example.com/contact' }))).toContain('phone');
  });

  it('defaults to uncertain and downgrades "verified" when the provider flags uncertain fields', () => {
    const noVerification = first(rec({}, { verification: undefined }));
    expect(noVerification.payload.verification).toBe('uncertain');
    const flagged = first(rec({}, { verification: 'verified', uncertain_fields: ['role'] }));
    expect(flagged.payload).toMatchObject({ verification: 'uncertain', uncertain_fields: ['role'] });
    expect(codes(rec({}, { uncertain_fields: ['salary'] }))).toContain('enum');
  });

  it('deduplicates across providers by profile URL, then by name + company + role', () => {
    const claude = rec({}, {});
    const chatgpt = { ...rec({ title: 'Different wording' }, { relationship: 'talent_acquisition' }), provider: 'chatgpt' };
    expect(keyOf(claude)).toBe(keyOf(chatgpt));
    expect(keyOf(claude)).toMatch(/^recruiter:url:/);
    const noProfile = (name: string, role = 'Recruiter', company = 'Example Corp') => rec({ source: { url: 'https://example.com/team' } }, { profile_url: undefined, recruiter_name: name, role_title: role, company });
    expect(keyOf(noProfile(' pat  RECRUITER '))).toBe(keyOf(noProfile('Pat Recruiter')));
    expect(keyOf(noProfile('Pat Recruiter'))).toMatch(/^recruiter:[0-9a-f]{64}$/);
    expect(keyOf(noProfile('Pat Recruiter', 'Hiring Manager'))).not.toBe(keyOf(noProfile('Pat Recruiter')));
    expect(keyOf(noProfile('Pat Recruiter', 'Recruiter', 'Other Corp'))).not.toBe(keyOf(noProfile('Pat Recruiter')));
  });

  it('associates a job lead by contract-local identity and never by database id', () => {
    const r = ok(rec({}, { related_job: { job_url: 'https://Jobs.Example.com/posting/42/?utm_source=x' } }));
    expect(r.data!.findings[0]!.payload.related_job_key).toBe('url:https://jobs.example.com/posting/42');
    const weak = validateAiResult(rec({}, { related_job: { company: 'Example Corp' } }));
    expect(weak.success).toBe(true);
    expect(weak.data!.findings[0]!.payload).not.toHaveProperty('related_job_key');
    expect(weak.warnings.map((w) => w.code)).toContain('related_job_unresolvable');
    const dbId = ok(rec({}, { related_job: { job_url: 'https://jobs.example.com/posting/42', finding_id: '11111111-1111-4111-8111-111111111111' } }));
    expect(JSON.stringify(dbId.data)).not.toContain('11111111-1111');
    expect(dbId.unknownFieldCount).toBeGreaterThan(0);
  });
});

describe('failure isolation', () => {
  it('rejects only the malformed finding; valid ones are kept (PARTIAL semantics)', () => {
    const mixed = { ...clone(external.multiSource), findings: [jobLeadFinding(), jobLeadFinding({}, { match_score: 500 }), emailTriageFinding(), recruiterIntelFinding({ source: undefined }, { profile_url: undefined })] };
    const r = validateAiResult(mixed);
    expect(r.success).toBe(true);
    expect(r.rejectedItemCount).toBe(2);
    expect(r.data!.findings.map((f) => f.kind)).toEqual(['job_lead', 'email_event']);
  });
});

describe('warnCodes helper sanity', () => {
  it('reports truncation without failing', () => expect(warnCodes(invalidExternal.oversizedDescription)).toContain('description_truncated'));
});
