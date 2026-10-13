// AI-6 golden fixtures for jobquest.ai-result 1.0 external intelligence sources.
// Sanitized and synthetic: no real people, companies, mailboxes or postings.
const base = (over: Record<string, unknown> = {}) => ({
  contract: 'jobquest.ai-result',
  schema_version: '1.0',
  provider: 'claude',
  workflow: 'job_discovery',
  run: { external_run_id: 'run-ext-1', generated_at: '2026-10-01T12:00:00Z', model_hint: 'fixture' },
  sources: [] as unknown[],
  findings: [] as unknown[],
  suggestions: [] as unknown[],
  metadata: {},
  ...over,
});

export const jobDescription = 'About the role\nBuild reliable systems.\n\nRequirements\n- TypeScript\n- PostgreSQL';

export const jobLeadFinding = (over: Record<string, unknown> = {}, payloadOver: Record<string, unknown> = {}) => ({
  kind: 'job_lead',
  dedupe: { job_url: 'https://jobs.example.com/posting/42' },
  title: 'Staff Engineer at Example Corp',
  summary: 'Strong overlap with the search profile.',
  priority: 'NORMAL',
  confidence: 0.8,
  source: { url: 'https://jobs.example.com/posting/42' },
  payload: {
    version: '1.0', company: 'Example Corp', role_title: 'Staff Engineer', location: 'Austin, TX', work_arrangement: 'hybrid',
    employment_type: 'full_time', source_name: 'Example Jobs', job_url: 'https://jobs.example.com/posting/42', external_job_id: 'EX-42',
    posted_date: '2026-09-28', salary_min: 150000, salary_max: 190000, salary_currency: 'usd', salary_period: 'year',
    experience_level: 'Senior', match_score: 86, match_reasoning: 'Matches TypeScript and PostgreSQL.',
    required_skills: ['TypeScript', 'PostgreSQL'], preferred_skills: ['Kubernetes'], description: jobDescription,
    ...payloadOver,
  },
  ...over,
});

export const emailTriageFinding = (over: Record<string, unknown> = {}, payloadOver: Record<string, unknown> = {}) => ({
  kind: 'email_event',
  dedupe: { source_type: 'gmail', source_id: 'gmail-msg-100' },
  category: 'interview_invitation',
  priority: 'HIGH',
  confidence: 0.95,
  title: 'Interview invitation from Example Corp',
  summary: 'Recruiter invites you to a 45 minute technical interview.',
  occurred_at: '2026-10-01T09:30:00-05:00',
  due_at: '2026-10-03T17:00:00-05:00',
  source: { thread_id: 'thread-100' },
  evidence: 'We would like to schedule a technical interview next week.',
  payload: {
    version: '1.0', sender_name: 'Pat Recruiter', sender_domain: 'example.com', subject: 'Interview with Example Corp',
    company: 'Example Corp', role_title: 'Staff Engineer', next_step: 'Reply with availability', needs_attention: true, ...payloadOver,
  },
  ...over,
});

export const recruiterIntelFinding = (over: Record<string, unknown> = {}, payloadOver: Record<string, unknown> = {}) => ({
  kind: 'recruiter_intel',
  dedupe: {},
  title: 'Pat Recruiter, Example Corp',
  summary: 'Lists Staff Engineer openings on the public team page.',
  confidence: 0.7,
  source: { url: 'https://example.com/team/pat-recruiter' },
  payload: {
    version: '1.0', recruiter_name: 'Pat Recruiter', role_title: 'Senior Technical Recruiter', company: 'Example Corp',
    relationship: 'recruiter', verification: 'verified', source_name: 'Example Corp team page',
    profile_url: 'https://example.com/team/pat-recruiter', related_job: { job_url: 'https://jobs.example.com/posting/42' },
    ...payloadOver,
  },
  ...over,
});

export const external = {
  jobDiscovery: base({
    workflow: 'job_discovery',
    run: { external_run_id: 'run-job-1', generated_at: '2026-10-01T12:00:00Z' },
    sources: [{ type: 'job_site', ref: 'example-jobs', observed_at: '2026-10-01T11:00:00Z' }],
    findings: [jobLeadFinding()],
  }),
  emailTriage: base({
    workflow: 'email_triage',
    run: { external_run_id: 'run-email-1', generated_at: '2026-10-01T12:00:00Z' },
    sources: [{ type: 'gmail', ref: 'label:job-search', observed_at: '2026-10-01T11:00:00Z' }],
    findings: [emailTriageFinding()],
  }),
  recruiterIntel: base({
    workflow: 'recruiter_intel',
    run: { external_run_id: 'run-recruiter-1', generated_at: '2026-10-01T12:00:00Z' },
    sources: [{ type: 'web', ref: 'example.com/team', observed_at: null }],
    findings: [recruiterIntelFinding()],
  }),
  /** One envelope carrying all three source kinds (workflow labels the run; the kind labels each finding). */
  multiSource: base({
    workflow: 'other',
    run: { external_run_id: 'run-multi-1', generated_at: '2026-10-01T12:00:00Z' },
    sources: [{ type: 'job_site', ref: 'example-jobs' }, { type: 'gmail', ref: 'label:job-search' }, { type: 'web', ref: 'example.com/team' }],
    findings: [jobLeadFinding(), emailTriageFinding(), recruiterIntelFinding()],
  }),
};

export const invalidExternal = {
  oversizedDescription: base({ findings: [jobLeadFinding({}, { description: 'x'.repeat(30_500) })] }),
  htmlDescription: base({ findings: [jobLeadFinding({}, { description: '<div><p>Hello &amp; welcome</p><script>alert(1)</script><ul><li>One</li><li>Two</li></ul></div>' })] }),
  badUrl: base({ findings: [jobLeadFinding({}, { job_url: 'ftp://jobs.example.com/42' })] }),
  credentialUrl: base({ findings: [jobLeadFinding({}, { job_url: 'https://user:pw@jobs.example.com/42' })] }),
  badScore: base({ findings: [jobLeadFinding({}, { match_score: 140 })] }),
  scoreAsString: base({ findings: [jobLeadFinding({}, { match_score: '90' })] }),
  badEmailCategory: base({ workflow: 'email_triage', findings: [emailTriageFinding({ category: 'marketing' })] }),
  missingEmailIdentity: base({ workflow: 'email_triage', findings: [emailTriageFinding({ dedupe: { source_type: 'gmail' } })] }),
  missingJobIdentity: base({ findings: [{ kind: 'job_lead', dedupe: {}, title: 'Mystery role', payload: { company: 'Example Corp', role_title: 'Mystery role' } }] }),
  recruiterWithoutSource: base({ workflow: 'recruiter_intel', findings: [recruiterIntelFinding({ source: undefined }, { profile_url: undefined, related_job: undefined })] }),
  untrustedIds: base({
    findings: [jobLeadFinding({
      workspace_id: '33333333-3333-4333-8333-333333333333', user_id: '22222222-2222-4222-8222-222222222222',
      match: { application_id: '44444444-4444-4444-8444-444444444444' },
    }, { application_id: '44444444-4444-4444-8444-444444444444', user_id: '22222222-2222-4222-8222-222222222222' })],
  }),
};
