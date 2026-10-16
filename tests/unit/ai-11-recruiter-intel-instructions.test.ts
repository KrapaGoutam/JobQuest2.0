import { describe, expect, it } from 'vitest';
import {
  AI_LIMITS, CLAIMED_GUIDANCE, RECRUITER_DISCOVERY_MODES, RECRUITER_EMAIL_BASES, RECRUITER_EXAMPLE_PREFIX, RECRUITER_LIMITS, RECRUITER_RELATIONSHIPS,
  RECRUITER_SOURCE_NAME_MAX_CHARS, RECRUITER_UNCERTAIN_FIELDS, RECRUITER_VERIFICATIONS, RECRUITER_VERIFICATION_BASES, SCHEDULER_PROVIDERS,
  SUBMIT_ONCE_RULE, STEP_GUIDES, buildSchedulerSetup, claimSteps, resultEnvelopeRules, validateAiResult, type SetupAutomation,
} from '../../apps/api/src/lib/aiContract';

// AI-11 production hotfix (second incident): the first REAL Recruiter Intelligence run ended PARTIAL (SCHEMA_INVALID, 10 rejected items, 0 findings)
// because the generated instructions did not give the finding-level `title` / `dedupe` requirements, the enums, the public-URL requirement or the
// limits. The server validator was correct. The decisive tests build the result FROM THE GENERATED TEXT and run it through the real validator.
const ID = '123e4567-e89b-42d3-a456-426614174000';
const auto = (over: Partial<SetupAutomation> = {}): SetupAutomation => ({
  id: ID, name: 'Recruiter Intelligence', workflow: 'recruiter_intel', provider: 'chatgpt', enabled: true, cadence: 'manual_only', localTime: null, timezone: null,
  weekdays: [], sections: [], ...over,
});

const claimRules = claimSteps(['recruiter_intel'])[0]!.rules;
const text = claimRules.join('\n');

/** The finding a provider would copy from the generated instructions. */
function exampleFromInstructions(): Record<string, any> {
  const rule = claimRules.find((r) => r.startsWith(RECRUITER_EXAMPLE_PREFIX));
  expect(rule, 'the generated rules must carry an example recruiter_intel finding').toBeDefined();
  return JSON.parse(rule!.slice(RECRUITER_EXAMPLE_PREFIX.length)) as Record<string, any>;
}

const envelope = (findings: unknown[], over: Record<string, unknown> = {}) => ({
  contract: 'jobquest.ai-result', schema_version: '1.0', provider: 'chatgpt', workflow: 'recruiter_intel',
  run: { external_run_id: 'manual:dc6014c5:m0123456789abcdef012', generated_at: '2026-10-15T12:00:00-05:00' },
  sources: [{ type: 'web', ref: 'company careers page', status: 'ok', count: findings.length }],
  findings, ...over,
});
const person = (patch: (f: Record<string, any>) => void): Record<string, unknown> => {
  const f = structuredClone(exampleFromInstructions());
  patch(f);
  return f;
};
const codes = (r: ReturnType<typeof validateAiResult>) => r.errors.map((e) => e.code);
const rejects = (f: Record<string, unknown>, code?: string) => {
  const r = validateAiResult(envelope([f]));
  expect(r.rejectedItemCount).toBe(1);
  expect(r.data?.findings ?? []).toHaveLength(0);
  if (code) expect(codes(r)).toContain(code);
};
const accepts = (f: Record<string, unknown>) => {
  const r = validateAiResult(envelope([f]));
  expect(r.errors).toEqual([]);
  expect(r.rejectedItemCount).toBe(0);
  return r;
};

describe('the generated Recruiter Intelligence instructions document the findings[] contract (incident: GENERATED_INSTRUCTIONS_GAP)', () => {
  it('states the findings[] wrapper, kind "recruiter_intel", title, the dedupe object and the payload', () => {
    expect(text).toMatch(/ONE object inside the top-level `findings` array/);
    expect(text).toMatch(/`kind` \(exactly "recruiter_intel"\)/);
    expect(text).toMatch(/`title`/);
    expect(text).toMatch(/a `dedupe` object/);
    expect(text).toMatch(/`recruiter_name` and `company` are set/);
    expect(text).toMatch(/dedupe \(REQUIRED object\) must be present on every person; it may be an empty object \{\}/);
    const ex = exampleFromInstructions();
    expect(ex.kind).toBe('recruiter_intel');
    expect(typeof ex.title).toBe('string');
    expect(ex.dedupe).toEqual({});
    expect(ex.payload.version).toBe('1.0');
  });

  it('lists the exact canonical enum values and says not to invent alternatives', () => {
    expect(text).toContain('relationship: recruiter | talent_acquisition | hiring_manager | sourcer | other | technical_recruiter | qa_manager | engineering_manager | engineering_leader');
    expect(text).toContain('verification: verified | uncertain');
    expect(text).toContain('verification_basis: company_page | professional_profile | job_posting | prospecting_source | other_public_source');
    expect(text).toContain('discovery_mode: job_linked | target_company');
    expect(text).toContain('name | role | company | relationship | contact');
    expect(text).toMatch(/ONLY these exact lowercase values; do not invent alternative strings/);
  });

  it('requires a usable public http(s) source URL and says a label alone is not evidence', () => {
    expect(text).toMatch(/PUBLIC EVIDENCE \(required\)/);
    expect(text).toMatch(/payload\.profile_url/);
    expect(text).toMatch(/finding-level source\.url/);
    expect(text).toMatch(/plain absolute http:\/\/ or https:\/\/ URL/);
    expect(text).toMatch(/Never guess, construct or pattern-build a URL/);
    expect(text).toMatch(/A source_name label alone is NOT evidence/);
  });

  it('documents the validator-backed limits', () => {
    expect(text).toContain(`title <= ${AI_LIMITS.title} characters`);
    expect(text).toContain('title <= 300 characters');
    expect(text).toContain('payload.recruiter_name <= 200');
    expect(text).toContain('payload.company <= 200');
    expect(text).toContain(`source_name <= ${RECRUITER_SOURCE_NAME_MAX_CHARS}`);
    expect(text).toContain('source_name <= 100');
    expect(text).toContain(`<= ${RECRUITER_LIMITS.whyChars} characters`);
    expect(text).toContain('draft_note <= 300 characters');
    expect(text).toContain('subject <= 120 characters');
    expect(text).toContain('body <= 1200 characters');
    expect(text).toMatch(/REJECTS that whole person/);
  });

  it('preserves contact safety: never invent contact details, no phone numbers, drafts are suggestions, nothing is sent', () => {
    expect(text).toMatch(/never invent or infer an email, phone number or profile URL/);
    expect(text).toMatch(/Phone numbers are never stored/);
    expect(text).toMatch(/ONLY as payload\.contact_email together with contact_source_url/);
    expect(text).toMatch(/JobQuest never sends outreach/);
    expect(text).toMatch(/text for the OWNER to review, never sent by JobQuest/);
    expect(text).toContain(`contact_email_basis (${RECRUITER_EMAIL_BASES.join(' | ')})`);
  });

  it('stays broad: no job-family hard filter is introduced', () => {
    expect(text).toMatch(/NOT LIMITED TO ONE JOB FAMILY/);
    expect(text).toMatch(/hiring manager, engineering manager or engineering leader/);
    expect(text).not.toMatch(/\bQA only\b|only QA|SDET only|testing only/i);
  });

  it('keeps every earlier AI-11E rule (profile first, one person per company, public sources, never guess, never contact)', () => {
    expect(text).toMatch(/jobquest_get_recruiter_discovery_profile first/); expect(text).toMatch(/ONE useful person per company/);
    expect(text).toMatch(/PUBLIC sources only/); expect(text).toMatch(/Never guess a name/); expect(text).toMatch(/NEVER sent/);
    expect(text).toMatch(/Never contact anyone/); expect(text).toMatch(/"unavailable" .* is NOT "zero"/);
  });

  it('every provider setup carries the shared envelope facts and the submit-once rule', () => {
    for (const p of SCHEDULER_PROVIDERS) {
      const s = buildSchedulerSetup(auto({ provider: p }))!;
      for (const t of [s.scheduledInstructions, s.manualRunInstructions]) {
        expect(t).toContain('contract "jobquest.ai-result"');
        expect(t).toContain('schema_version "1.0"');
        expect(t).toContain(`provider "${p}"`);
        expect(t).toMatch(/`externalRunId` copied EXACTLY/);
        expect(t).toContain(SUBMIT_ONCE_RULE);
      }
    }
    expect(SUBMIT_ONCE_RULE).toMatch(/never resubmit a corrected result for a rejected or PARTIAL run/);
    expect(CLAIMED_GUIDANCE).toContain(SUBMIT_ONCE_RULE);
  });

  it('the claim text stays credential-free (the pattern the AI11G-06 integration test applies to the whole claim)', () => {
    const all = JSON.stringify({ rules: claimRules, guidance: CLAIMED_GUIDANCE, envelope: resultEnvelopeRules() });
    expect(all).not.toMatch(/jq_mcp_|Bearer|secret|password|service_role|client_secret|access_token/i);
  });

  it('is provider-neutral: one shared source, identical rules, no provider name', () => {
    expect(STEP_GUIDES.recruiter_intel.rules).toBe(claimSteps(['recruiter_intel'])[0]!.rules);
    const norm = (p: (typeof SCHEDULER_PROVIDERS)[number]) => buildSchedulerSetup(auto({ provider: p }), 'm0123456789abcdef012')!.scheduledInstructions.replace(/Claude|ChatGPT|Gemini|"(claude|chatgpt|gemini)"/g, 'P');
    expect(norm('claude')).toBe(norm('chatgpt'));
    expect(norm('chatgpt')).toBe(norm('gemini'));
    expect(text).not.toMatch(/gemini|chatgpt|claude/i);
  });

  it('tells providers that sources[].ref is a generic label, never a person, email, phone or profile link', () => {
    const env = resultEnvelopeRules().join('\n');
    expect(env).toMatch(/ref \(a short GENERIC label of where you looked/);
    expect(env).toMatch(/never a person's name, email address, phone number or profile link/);
    expect(env).toMatch(/people belong only in findings/);
    expect(CLAIMED_GUIDANCE).toMatch(/never a person's name, email address, phone number or profile link/);
  });
});

describe('validator round-trip: a result built ONLY from the generated instructions passes the real recruiter validator', () => {
  for (const provider of SCHEDULER_PROVIDERS) {
    it(`${provider}: the example person in a canonical envelope has 0 errors, 0 rejected items and 0 warnings`, () => {
      const r = validateAiResult(envelope([exampleFromInstructions()], { provider }));
      expect(r.errors).toEqual([]);
      expect(r.warnings).toEqual([]);
      expect(r.rejectedItemCount).toBe(0);
      expect(r.success).toBe(true);
      const f = r.data!.findings[0]!;
      expect(f.kind).toBe('recruiter_intel');
      expect(f.recruiter).toMatchObject({ relationship: 'technical_recruiter', verification: 'verified', verification_basis: 'company_page', mode_hint: 'job_linked', has_related_job: true });
      expect(f.payload).toMatchObject({ recruiter_name: 'Jordan Example', company: 'Example Corp', verification: 'verified', profile_url: 'https://careers.example.com/team/jordan-example' });
      expect(r.data!.sources[0]).toMatchObject({ type: 'web', status: 'ok' });
    });
  }

  it('ten people built from the example (the incident volume) are all accepted', () => {
    const people = Array.from({ length: 10 }, (_, i) => person((f) => {
      f.title = `Person ${i} Example, Technical Recruiter at Company ${i}`;
      f.payload.recruiter_name = `Person ${i} Example`; f.payload.company = `Company ${i}`;
      f.payload.profile_url = `https://careers.example.com/team/person-${i}`; delete f.payload.related_job;
    }));
    const r = validateAiResult(envelope(people));
    expect(r.errors).toEqual([]);
    expect(r.rejectedItemCount).toBe(0);
    expect(r.data!.findings).toHaveLength(10);
  });

  it('every documented enum value (parsed back out of the generated text) is accepted', () => {
    const documented = (key: string): string[] => {
      const m = new RegExp(`${key}(?: \\(an array of any of\\))?: ([a-z_ |]+?)[.(]`).exec(text);
      expect(m, `${key} must be documented`).not.toBeNull();
      return m![1]!.split('|').map((v) => v.trim()).filter(Boolean);
    };
    const rel = documented('relationship'), ver = documented('verification'), basis = documented('verification_basis'), mode = documented('discovery_mode'), unc = documented('uncertain_fields');
    expect(rel).toEqual([...RECRUITER_RELATIONSHIPS]);
    expect(ver).toEqual([...RECRUITER_VERIFICATIONS]);
    expect(basis).toEqual([...RECRUITER_VERIFICATION_BASES]);
    expect(mode).toEqual([...RECRUITER_DISCOVERY_MODES]);
    expect(unc).toEqual([...RECRUITER_UNCERTAIN_FIELDS]);
    for (const v of rel) expect(validateAiResult(envelope([person((f) => { f.payload.relationship = v; })])).errors, v).toEqual([]);
    for (const v of basis) expect(validateAiResult(envelope([person((f) => { f.payload.verification_basis = v; })])).errors, v).toEqual([]);
    for (const v of mode) expect(validateAiResult(envelope([person((f) => { f.payload.discovery_mode = v; })])).errors, v).toEqual([]);
    for (const v of ver) expect(validateAiResult(envelope([person((f) => { f.payload.verification = v; })])).errors, v).toEqual([]);
    for (const v of unc) {
      const r = validateAiResult(envelope([person((f) => { f.payload.uncertain_fields = [v]; })]));
      expect(r.errors, v).toEqual([]);
      expect(r.data!.findings[0]!.recruiter!.verification, `${v} makes the person uncertain`).toBe('uncertain');
    }
  });

  it('what the instructions forbid is really rejected (the documentation matches the validator)', () => {
    rejects(person((f) => { delete f.kind; }), 'required');
    rejects(person((f) => { f.kind = 'recruiter'; }), 'enum');
    rejects(person((f) => { delete f.title; }), 'required');
    rejects(person((f) => { delete f.dedupe; }), 'required');
    rejects(person((f) => { f.title = 'x'.repeat(AI_LIMITS.title + 1); }), 'too_long');
    rejects(person((f) => { f.payload.recruiter_name = 'x'.repeat(201); }), 'too_long');
    rejects(person((f) => { f.payload.company = 'x'.repeat(201); }), 'too_long');
    rejects(person((f) => { f.payload.source_name = 'x'.repeat(RECRUITER_SOURCE_NAME_MAX_CHARS + 1); }), 'too_long');
    rejects(person((f) => { f.payload.relationship = 'headhunter'; }), 'enum');
    rejects(person((f) => { f.payload.verification = 'confirmed'; }), 'enum');
    rejects(person((f) => { f.payload.verification_basis = 'linkedin'; }), 'enum');
    rejects(person((f) => { f.payload.discovery_mode = 'networking'; }), 'enum');
    rejects(person((f) => { f.payload.uncertain_fields = ['email']; }), 'enum');
    rejects(person((f) => { f.payload.version = '2.0'; }), 'version');
    rejects(person((f) => { delete f.payload.recruiter_name; }), 'required');
    rejects(person((f) => { delete f.payload.company; }), 'required');
    rejects(person((f) => { delete f.payload; }), 'required');
  });

  it('the public-evidence rule is real: no URL, a label alone, or a non-http(s) URL is rejected; profile_url or source.url alone is accepted', () => {
    rejects(person((f) => { delete f.payload.profile_url; }), 'recruiter_source_required');
    rejects(person((f) => { delete f.payload.profile_url; f.payload.source_name = 'LinkedIn profile of Jordan Example'; }), 'recruiter_source_required');
    rejects(person((f) => { f.payload.profile_url = 'ftp://example.com/jordan'; }), 'url_scheme');
    rejects(person((f) => { f.payload.profile_url = 'jordan example on linkedin'; }), 'url');
    accepts(person(() => undefined));
    accepts(person((f) => { delete f.payload.profile_url; f.source = { url: 'https://careers.example.com/jobs/12345' }; }));
  });

  it('dedupe may be an empty object but must exist; its free text never overrides the derived identity', () => {
    accepts(person((f) => { f.dedupe = {}; }));
    const r = accepts(person((f) => { f.dedupe = { name: 'Somebody Else', company: 'Other Corp' }; }));
    expect(r.data!.findings[0]!.payload).toMatchObject({ recruiter_name: 'Jordan Example', company: 'Example Corp' });
    rejects(person((f) => { f.dedupe = 'none'; }), 'required');
  });

  it('verified needs a basis AND a URL, otherwise the person is stored as uncertain with a warning (not rejected)', () => {
    const r = validateAiResult(envelope([person((f) => { delete f.payload.verification_basis; })]));
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toContain('verified_without_basis');
    expect(r.data!.findings[0]!.recruiter!.verification).toBe('uncertain');
  });

  it('the documented boundaries are accepted: title 300, name/company/role 200, source_name 100, why 300, note 300, subject 120, body 1200', () => {
    const r = validateAiResult(envelope([person((f) => {
      f.title = 'T'.repeat(AI_LIMITS.title);
      f.payload.recruiter_name = 'N'.repeat(200); f.payload.company = 'C'.repeat(200); f.payload.role_title = 'R'.repeat(200);
      f.payload.source_name = 'S'.repeat(RECRUITER_SOURCE_NAME_MAX_CHARS);
      f.payload.why = 'Named as the recruiting contact in the posting. '.repeat(10).slice(0, RECRUITER_LIMITS.whyChars).trim();
      f.payload.draft_note = 'Hello, I would like to connect about engineering roles. '.repeat(10).slice(0, RECRUITER_LIMITS.noteChars).trim();
      f.payload.draft_email = { subject: 'Interested in engineering roles '.repeat(10).slice(0, RECRUITER_LIMITS.emailSubjectChars).trim(), body: 'Hello. '.repeat(400).slice(0, RECRUITER_LIMITS.emailBodyChars).trim() };
    })]));
    expect(r.errors).toEqual([]);
    expect(r.rejectedItemCount).toBe(0);
    expect(r.warnings.map((w) => w.code)).not.toEqual(expect.arrayContaining(['truncated']));
    const p = r.data!.findings[0]!.payload as Record<string, any>;
    expect(p.draft_note).toBeTruthy(); expect(p.draft_email.subject).toBeTruthy(); expect(p.draft_email.body).toBeTruthy(); expect(p.why).toBeTruthy();
  });

  it('over-long drafts are DROPPED with a warning (never truncated, never rejected), exactly as the instructions say', () => {
    const r = validateAiResult(envelope([person((f) => {
      f.payload.draft_note = 'x'.repeat(RECRUITER_LIMITS.noteChars + 1);
      f.payload.draft_email = { subject: 'Hello', body: 'y'.repeat(RECRUITER_LIMITS.emailBodyChars + 1) };
    })]));
    expect(r.rejectedItemCount).toBe(0);
    expect(r.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['draft_too_long']));
    const p = r.data!.findings[0]!.payload as Record<string, unknown>;
    expect(p.draft_note).toBeUndefined(); expect(p.draft_email).toBeUndefined();
  });

  it('drafts with links, contact details or unsupported claims are dropped; speculative "why" text is dropped', () => {
    const r = validateAiResult(envelope([person((f) => {
      f.payload.draft_note = 'Hi, see https://example.com/me for my background.';
      f.payload.draft_email = { subject: 'Hello', body: 'Thanks for your reply. I applied last week; my number is 555-123-4567.' };
      f.payload.why = 'Probably hiring soon, a great company with exciting growth.';
    })]));
    expect(r.rejectedItemCount).toBe(0);
    const w = r.warnings.map((x) => x.code);
    expect(w).toEqual(expect.arrayContaining(['draft_contact_or_link', 'why_speculative_dropped']));
    const p = r.data!.findings[0]!.payload as Record<string, unknown>;
    expect(p.draft_note).toBeUndefined(); expect(p.draft_email).toBeUndefined(); expect(p.why).toBeUndefined();
  });

  it('contact safety is real: phone numbers are never stored; personal or uncited emails are dropped; a cited work email is kept', () => {
    const phone = validateAiResult(envelope([person((f) => { f.payload.contact_phone = '+1 312 555 0100'; })]));
    expect(phone.warnings.map((x) => x.code)).toContain('contact_phone_not_stored');
    expect(JSON.stringify(phone.data!.findings[0]!.payload)).not.toMatch(/555|contact_phone/);
    const personal = validateAiResult(envelope([person((f) => { f.payload.contact_email = 'jordan@gmail.com'; f.payload.contact_source_url = 'https://careers.example.com/team'; })]));
    expect(personal.warnings.map((x) => x.code)).toContain('contact_personal_email_dropped');
    expect((personal.data!.findings[0]!.payload as Record<string, unknown>).contact_email).toBeUndefined();
    const uncited = validateAiResult(envelope([person((f) => { f.payload.contact_email = 'jordan@example.com'; })]));
    expect(uncited.warnings.map((x) => x.code)).toContain('contact_uncited_dropped');
    expect((uncited.data!.findings[0]!.payload as Record<string, unknown>).contact_email).toBeUndefined();
    const cited = validateAiResult(envelope([person((f) => { f.payload.contact_email = 'jordan@example.com'; f.payload.contact_source_url = 'https://careers.example.com/team'; f.payload.contact_email_basis = 'published'; })]));
    expect(cited.errors).toEqual([]);
    expect((cited.data!.findings[0]!.payload as Record<string, unknown>).contact_email).toBe('jordan@example.com');
    // addresses and numbers pasted into identity text are removed, not stored
    const pasted = validateAiResult(envelope([person((f) => { f.payload.role_title = 'Technical Recruiter jordan@example.com'; })]));
    expect(JSON.stringify(pasted.data!.findings[0]!.payload)).not.toContain('jordan@example.com');
  });

  it('the incident shape (no title, no dedupe) is rejected for exactly the documented reasons — what the new text now prevents', () => {
    const incident = Array.from({ length: 10 }, () => person((f) => { delete f.title; delete f.dedupe; }));
    const r = validateAiResult(envelope(incident));
    expect(r.rejectedItemCount).toBe(10);
    expect(r.data!.findings).toHaveLength(0);
    expect(r.errors.map((e) => `${e.path}:${e.code}`)).toEqual(expect.arrayContaining(['findings[0].title:required', 'findings[0].dedupe:required', 'findings[9].title:required', 'findings[9].dedupe:required']));
  });

  it('the envelope rules are real: a wrong contract name or missing run id/generated_at fails the whole result', () => {
    expect(validateAiResult({ ...envelope([exampleFromInstructions()]), contract: 'jobquest.result' }).success).toBe(false);
    expect(validateAiResult({ ...envelope([exampleFromInstructions()]), run: { external_run_id: 'x' } }).success).toBe(false);
  });
});

describe('sources[].ref privacy: a source is a generic label; contact details are not retained', () => {
  const withSource = (s: Record<string, unknown>) => validateAiResult(envelope([exampleFromInstructions()], { sources: [s] }));

  it('a generic label is stored unchanged with no warning', () => {
    const r = withSource({ type: 'web', ref: 'company careers page', status: 'ok' });
    expect(r.warnings).toEqual([]);
    expect(r.data!.sources[0]).toMatchObject({ type: 'web', ref: 'company careers page' });
  });

  it('an email address or phone number in ref is removed with a warning; the run is not rejected', () => {
    const r = withSource({ type: 'web', ref: 'profile of Jordan Example (jordan@example.com, +1 312 555 0100)', status: 'ok' });
    expect(r.success).toBe(true);
    expect(r.warnings.map((w) => `${w.path}:${w.code}`)).toContain('sources[0].ref:source_contact_redacted');
    expect(r.data!.sources[0]!.ref).not.toMatch(/@|555/);
  });

  it('a ref that is only contact details falls back to the source type instead of failing the whole result', () => {
    const r = withSource({ type: 'web', ref: 'jordan@example.com', status: 'ok' });
    expect(r.success).toBe(true);
    expect(r.data!.sources[0]!.ref).toBe('web');
  });
});
