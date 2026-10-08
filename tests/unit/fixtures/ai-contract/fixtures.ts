// Sanitized, deterministic golden fixtures for jobquest.ai-result 1.0. No real personal data.
const base = (over: Record<string, unknown> = {}) => ({
  contract: 'jobquest.ai-result',
  schema_version: '1.0',
  provider: 'claude',
  workflow: 'email_triage',
  run: { external_run_id: 'run-fixture-1', generated_at: '2026-10-01T12:00:00Z', model_hint: 'fixture' },
  sources: [{ type: 'gmail', ref: 'msg-fixture', observed_at: '2026-10-01T11:59:00Z' }],
  findings: [] as unknown[],
  suggestions: [] as unknown[],
  metadata: {},
  ...over,
});

const gmailFinding = (event: string, over: Record<string, unknown> = {}) => ({
  kind: 'email_event',
  dedupe: { source_type: 'gmail', source_id: 'gmail-msg-001', event },
  category: event.toUpperCase(),
  priority: 'NORMAL',
  confidence: 0.97,
  title: `Example Corp: ${event}`,
  summary: 'Sanitized summary.',
  occurred_at: '2026-10-01T10:00:00-04:00',
  evidence: 'Short sanitized snippet.',
  match: { hints: { company: 'Example Corp', title: 'Engineer' } },
  payload: { company: 'Example Corp', role_title: 'Engineer' },
  ...over,
});

export const valid = {
  dailyBrief: base({
    workflow: 'daily_brief',
    findings: [{ kind: 'daily_brief', dedupe: { date: '2026-10-01' }, title: 'Daily brief 2026-10-01', priority: 'INFO', payload: { date: '2026-10-01', highlights: ['One interview today'], total_items: 3 } }],
  }),
  rejection: base({ findings: [gmailFinding('rejection', { priority: 'LOW' })] }),
  interview: base({ findings: [gmailFinding('interview', { priority: 'HIGH', due_at: '2026-10-05T15:00:00Z' })] }),
  assessment: base({ findings: [gmailFinding('assessment', { priority: 'HIGH', payload: { next_step: 'Complete online assessment', deadline: '2026-10-04T23:59:00Z' } })] }),
  jobLead: base({
    workflow: 'job_discovery',
    sources: [{ type: 'job_site', ref: 'board-1', observed_at: null }],
    findings: [{
      kind: 'job_lead', dedupe: { job_url: 'https://Jobs.Example.com/posting/42/?utm_source=x&b=2&a=1#apply' },
      title: 'Staff Engineer at Example Corp', confidence: 0.8,
      source: { url: 'https://jobs.example.com/posting/42' },
      payload: { company: 'Example Corp', role_title: 'Staff Engineer', remote: true, job_url: 'https://jobs.example.com/posting/42' },
    }],
  }),
  recruiter: base({
    workflow: 'recruiter_intel',
    findings: [{ kind: 'recruiter_intel', dedupe: { name: 'Pat Recruiter', company: 'Example Corp', channel: 'email' }, title: 'Recruiter contact: Pat Recruiter', payload: { recruiter_name: 'Pat Recruiter', company: 'Example Corp' } }],
  }),
  calendar: base({
    workflow: 'calendar_review',
    sources: [{ type: 'calendar', ref: 'cal-1', observed_at: null }],
    findings: [{
      kind: 'calendar_event', dedupe: { source_type: 'calendar', source_id: 'evt-001', event: 'invite' },
      title: 'Interview with Example Corp', occurred_at: '2026-10-05T15:00:00Z',
      payload: { start_at: '2026-10-05T15:00:00Z', end_at: '2026-10-05T16:00:00Z', attendee_count: 3 },
    }],
  }),
  suggestion: base({
    findings: [gmailFinding('rejection')],
    suggestions: [{ finding_index: 0, action: 'set_status', target: { type: 'application', id: '11111111-1111-4111-8111-111111111111' }, proposed: { status: 'REJECTED' }, confidence: 0.97 }],
  }),
};

// Cross-provider: same Event X observed by two providers (different run ids, wording and confidence).
export const crossProvider = {
  claude: base({ provider: 'claude', run: { external_run_id: 'claude-run', generated_at: '2026-10-01T12:00:00Z' }, findings: [gmailFinding('interview', { title: 'Interview invite (Claude wording)', confidence: 0.9 })] }),
  gemini: base({ provider: 'gemini', run: { external_run_id: 'gemini-run', generated_at: '2026-10-01T12:05:00Z' }, findings: [gmailFinding('interview', { title: 'Interview scheduled (Gemini wording)', confidence: 0.85 })] }),
};

// Meaningful change: same identity, changed content.
export const meaningfulChange = {
  before: base({ findings: [gmailFinding('interview', { due_at: '2026-10-05T15:00:00Z' })] }),
  after: base({ findings: [gmailFinding('interview', { due_at: '2026-10-06T09:00:00Z' })] }),
};

export const unknownFields = base({
  surprise: 1,
  findings: [gmailFinding('rejection', { extra_a: 1, extra_b: 'x', dedupe: { source_type: 'gmail', source_id: 'gmail-msg-001', event: 'rejection', junk: true } })],
});

export const invalid = {
  incompatibleMajor: base({ schema_version: '2.0' }),
  malformedVersion: base({ schema_version: 'one' }),
  oversizedEvidence: base({ findings: [gmailFinding('rejection', { evidence: 'é'.repeat(900) })] }),
  unsafeUrl: base({ findings: [{ kind: 'job_lead', dedupe: { company: 'Example Corp', title: 'Engineer' }, title: 'Lead', source: { url: 'javascript:alert(1)' } }] }),
  invalidTimestamp: base({ findings: [gmailFinding('rejection', { occurred_at: 'October 1st, 10am' })] }),
  badConfidence: base({ findings: [gmailFinding('rejection', { confidence: 97 })] }),
};

export const untrustedScope = base({
  user_id: '22222222-2222-4222-8222-222222222222',
  workspace_id: '33333333-3333-4333-8333-333333333333',
  findings: [gmailFinding('rejection', {
    user_id: '22222222-2222-4222-8222-222222222222',
    match: { application_id: '44444444-4444-4444-8444-444444444444', hints: { company: 'Example Corp' } },
  })],
});
