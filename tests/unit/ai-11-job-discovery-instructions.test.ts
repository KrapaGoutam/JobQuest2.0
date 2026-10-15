import { describe, expect, it } from 'vitest';
import {
  AI_LIMITS, CLAIMED_GUIDANCE, JOB_EMPLOYMENT_TYPES, JOB_LEAD_EXAMPLE_PREFIX, JOB_REMOTE_SCOPES, JOB_SOURCE_NAME_MAX_CHARS, JOB_WORK_ARRANGEMENTS,
  SCHEDULER_PROVIDERS, SUBMIT_ONCE_RULE, STEP_GUIDES, buildSchedulerSetup, claimSteps, resultEnvelopeRules, validateAiResult, type SetupAutomation,
} from '../../apps/api/src/lib/aiContract';

// AI-11 production hotfix: the generated Job Discovery instructions must carry enough of the EXISTING canonical contract for a provider
// to build a result the validator accepts. The decisive tests build the result FROM THE GENERATED TEXT and run it through the real
// validator; the string assertions only pin the wording the incident showed was missing.
const ID = '123e4567-e89b-42d3-a456-426614174000';
const auto = (over: Partial<SetupAutomation> = {}): SetupAutomation => ({
  id: ID, name: 'QA Fresh Job Discovery', workflow: 'job_discovery', provider: 'gemini', enabled: true, cadence: 'manual_only', localTime: null, timezone: null,
  weekdays: [], sections: [], ...over,
});

const claimRules = claimSteps(['job_discovery'])[0]!.rules;
const text = claimRules.join('\n');

/** The finding a provider would copy from the generated instructions. */
function exampleFromInstructions(): Record<string, unknown> {
  const rule = claimRules.find((r) => r.startsWith(JOB_LEAD_EXAMPLE_PREFIX));
  expect(rule, 'the generated rules must carry an example job_lead finding').toBeDefined();
  return JSON.parse(rule!.slice(JOB_LEAD_EXAMPLE_PREFIX.length)) as Record<string, unknown>;
}

const envelope = (findings: unknown[], over: Record<string, unknown> = {}) => ({
  contract: 'jobquest.ai-result', schema_version: '1.0', provider: 'gemini', workflow: 'job_discovery',
  run: { external_run_id: 'manual:ae2ae94f:m0123456789abcdef012', generated_at: '2026-10-15T12:00:00-05:00' },
  sources: [{ type: 'job_site', ref: 'example careers', status: 'ok', count: findings.length }],
  findings, ...over,
});
const finding = (patch: (f: Record<string, any>) => void): Record<string, unknown> => {
  const f = structuredClone(exampleFromInstructions()) as Record<string, any>;
  patch(f);
  return f;
};
const rejects = (f: Record<string, unknown>, code?: string) => {
  const r = validateAiResult(envelope([f]));
  expect(r.rejectedItemCount).toBe(1);
  expect(r.data?.findings ?? []).toHaveLength(0);
  if (code) expect(r.errors.map((e) => e.code)).toContain(code);
};

describe('the generated Job Discovery instructions document the findings[] contract (incident: GENERATED_INSTRUCTIONS_GAP)', () => {
  it('states the findings[] wrapper, kind "job_lead", the dedupe object and the payload version', () => {
    expect(text).toMatch(/ONE object inside the top-level `findings` array/);
    expect(text).toMatch(/`kind` \(exactly "job_lead"\)/);
    expect(text).toMatch(/a `dedupe` object/);
    expect(text).toMatch(/payload\.version must be "1\.0"/);
    expect(text).toMatch(/dedupe \(REQUIRED object\)/);
    const ex = exampleFromInstructions();
    expect(ex.kind).toBe('job_lead');
    expect(ex.dedupe).toEqual(expect.objectContaining({ job_url: expect.any(String), external_job_id: expect.any(String), source_name: expect.any(String) }));
    expect((ex.payload as Record<string, unknown>).version).toBe('1.0');
  });

  it('lists the exact canonical enum values and says to use only them', () => {
    expect(text).toContain('work_arrangement: remote | hybrid | onsite');
    expect(text).toContain('employment_type: full_time | part_time | contract | temporary | internship | freelance | other');
    expect(text).toContain('remote_scope: us | restricted | region');
    expect(text).toMatch(/ONLY these exact lowercase values/);
    expect(text).toMatch(/OMIT that optional field rather than inventing a new string/);
  });

  it('documents the validator-backed limits and the numeric match_score / http(s) job_url rules', () => {
    expect(text).toContain(`summary <= ${AI_LIMITS.summary} characters`);
    expect(text).toContain('summary <= 1000 characters');
    expect(text).toMatch(/title <= 300/);
    expect(text).toMatch(/match_score: a JSON NUMBER from 0 through 100/);
    expect(text).toMatch(/not "85%", no percent sign/);
    expect(text).toMatch(/plain absolute http:\/\/ or https:\/\/ URL/);
    expect(text).toMatch(/Not a search-results page, not a search-engine redirect or tracking link/);
    expect(text).toMatch(/REJECTS that whole lead/);
    expect(text).toMatch(/usable identity|stable identity/);
  });

  it('keeps every earlier AI-11D rule (profile first, freshness, Remote-US, QA gate, never apply, source health)', () => {
    expect(text).toMatch(/profile first/i); expect(text).toMatch(/freshness window/); expect(text).toMatch(/Remote-US/);
    expect(text).toMatch(/software-testing evidence/); expect(text).toMatch(/Never apply/); expect(text).toMatch(/"unavailable" .* is NOT "zero"/);
  });

  it('documents the result envelope: contract, schema_version, provider, workflow, externalRunId, generated_at, sources, findings', () => {
    const env = resultEnvelopeRules().join('\n');
    expect(env).toContain('"contract":"jobquest.ai-result"');
    expect(env).toContain('"schema_version":"1.0"');
    expect(env).toMatch(/provider is the claim's `submit\.provider`/);
    expect(env).toMatch(/workflow is the claim's `submit\.workflow`/);
    expect(env).toMatch(/claim's `externalRunId` \(also `submit\.externalRunId`\) copied EXACTLY/);
    expect(env).toMatch(/run\.generated_at is the current time as ISO-8601 with an explicit offset/);
    expect(env).toMatch(/sources: at most 50 entries/);
    expect(env).toMatch(/findings: at most 200/);
  });

  it('every provider setup carries the envelope facts and the submit-once rule (and no longer says a second submit is safe)', () => {
    for (const p of SCHEDULER_PROVIDERS) {
      const s = buildSchedulerSetup(auto({ provider: p }))!;
      for (const t of [s.scheduledInstructions, s.manualRunInstructions]) {
        expect(t).toContain('contract "jobquest.ai-result"');
        expect(t).toContain('schema_version "1.0"');
        expect(t).toContain(`provider "${p}"`);
        expect(t).toMatch(/`externalRunId` copied EXACTLY/);
        expect(t).toMatch(/every finding needs its `kind`/);
        expect(t).toContain(SUBMIT_ONCE_RULE);
        expect(t).toMatch(/exactly ONE result with jobquest_submit_ai_result/i);
        expect(t).not.toMatch(/same result twice is safe/i);
      }
    }
    expect(SUBMIT_ONCE_RULE).toMatch(/build the COMPLETE result first/);
    expect(SUBMIT_ONCE_RULE).toMatch(/exactly ONCE/);
    expect(SUBMIT_ONCE_RULE).toMatch(/Read the returned result/);
    expect(SUBMIT_ONCE_RULE).toMatch(/FINAL/);
    expect(SUBMIT_ONCE_RULE).toMatch(/never resubmit a corrected result for a rejected or PARTIAL run/);
    expect(SUBMIT_ONCE_RULE).toMatch(/NEW manual run \(fresh instructions with a new key\)/);
    expect(SUBMIT_ONCE_RULE).not.toMatch(/clientKey/); // scheduled instructions never mention a client key
    expect(CLAIMED_GUIDANCE).toContain(SUBMIT_ONCE_RULE);
    expect(CLAIMED_GUIDANCE).toMatch(/submit\.externalRunId copied EXACTLY/);
  });

  it('is provider-neutral: one shared source, identical step rules and identical setup text apart from the provider name', () => {
    expect(STEP_GUIDES.job_discovery.rules).toBe(claimSteps(['job_discovery'])[0]!.rules);
    const norm = (p: (typeof SCHEDULER_PROVIDERS)[number]) => buildSchedulerSetup(auto({ provider: p }), 'm0123456789abcdef012')!.scheduledInstructions.replace(/Claude|ChatGPT|Gemini|"(claude|chatgpt|gemini)"/g, 'P');
    expect(norm('claude')).toBe(norm('chatgpt'));
    expect(norm('chatgpt')).toBe(norm('gemini'));
    expect(text).not.toMatch(/gemini|chatgpt|claude/i);
  });
});

describe('validator round-trip: a result built ONLY from the generated instructions passes the real Job Discovery validator', () => {
  for (const provider of SCHEDULER_PROVIDERS) {
    it(`${provider}: the example finding in a canonical envelope has 0 errors, 0 rejected items and 0 warnings`, () => {
      const r = validateAiResult(envelope([exampleFromInstructions()], { provider }));
      expect(r.errors).toEqual([]);
      expect(r.warnings).toEqual([]);
      expect(r.rejectedItemCount).toBe(0);
      expect(r.success).toBe(true);
      const f = r.data!.findings[0]!;
      expect(f.kind).toBe('job_lead');
      expect(f.job_lead).toMatchObject({ company: 'Example Corp', work_arrangement: 'remote', employment_type: 'full_time', remote_scope: 'us', match_score: 85, payload_version: '1.0' });
      expect(r.data!.sources[0]).toMatchObject({ type: 'job_site', status: 'ok' });
    });
  }

  it('every documented enum value (parsed back out of the generated text) is accepted', () => {
    const documented = (key: string): string[] => {
      const m = new RegExp(`${key}: ([a-z_ |]+?)[.(]`).exec(text);
      expect(m, `${key} must be documented`).not.toBeNull();
      return m![1]!.split('|').map((v) => v.trim()).filter(Boolean);
    };
    const arr = documented('work_arrangement'), emp = documented('employment_type'), scope = documented('remote_scope');
    expect(arr).toEqual([...JOB_WORK_ARRANGEMENTS]);
    expect(emp).toEqual([...JOB_EMPLOYMENT_TYPES]);
    expect(scope).toEqual([...JOB_REMOTE_SCOPES]);
    for (const w of arr) for (const e of emp) {
      const r = validateAiResult(envelope([finding((f) => { f.payload.work_arrangement = w; f.payload.employment_type = e; if (w !== 'remote') delete f.payload.remote_scope; })]));
      expect(r.errors, `${w}/${e}`).toEqual([]);
    }
    for (const s of scope) expect(validateAiResult(envelope([finding((f) => { f.payload.remote_scope = s; })])).errors, s).toEqual([]);
  });

  it('what the instructions forbid is really rejected (the documentation matches the validator)', () => {
    rejects(finding((f) => { delete f.kind; }), 'required');
    rejects(finding((f) => { f.kind = 'lead'; }), 'enum');
    rejects(finding((f) => { delete f.dedupe; }), 'required');
    rejects(finding((f) => { f.summary = 'x'.repeat(AI_LIMITS.summary + 1); }), 'too_long');
    rejects(finding((f) => { f.title = 'x'.repeat(AI_LIMITS.title + 1); }), 'too_long');
    rejects(finding((f) => { f.payload.source_name = 'x'.repeat(JOB_SOURCE_NAME_MAX_CHARS + 1); }), 'too_long');
    rejects(finding((f) => { f.payload.work_arrangement = 'telework'; }), 'enum');
    rejects(finding((f) => { f.payload.employment_type = 'permanent'; }), 'enum');
    rejects(finding((f) => { f.payload.remote_scope = 'worldwide'; }), 'enum');
    rejects(finding((f) => { f.payload.match_score = '85%'; }), 'match_score');
    rejects(finding((f) => { f.payload.match_score = 101; }), 'match_score');
    rejects(finding((f) => { f.payload.match_score = -1; }), 'match_score');
    rejects(finding((f) => { f.payload.job_url = 'ftp://example.com/job'; }), 'url_scheme');
    rejects(finding((f) => { f.payload.job_url = 'not a url'; }), 'url');
    rejects(finding((f) => { f.payload.version = '2.0'; }), 'version');
    rejects(finding((f) => { delete f.payload.company; }), 'job_lead_identity');
  });

  it('the documented boundaries are accepted: summary of exactly 1000 characters, match_score 0 and 100', () => {
    expect(validateAiResult(envelope([finding((f) => { f.summary = 'x'.repeat(AI_LIMITS.summary); })])).errors).toEqual([]);
    for (const score of [0, 100]) expect(validateAiResult(envelope([finding((f) => { f.payload.match_score = score; })])).errors).toEqual([]);
  });

  it('a lead with no usable identity is rejected, one identified by job_url alone or by id + source is accepted', () => {
    // company + role_title + location + posted date is itself a (weak) fallback identity, so all of those tiers must be absent
    const noIdentity = finding((f) => { f.dedupe = {}; for (const k of ['job_url', 'source_name', 'external_job_id', 'location', 'posted_at']) delete f.payload[k]; });
    rejects(noIdentity, 'dedupe');
    expect(validateAiResult(envelope([finding((f) => { f.dedupe = { job_url: 'https://careers.example.com/jobs/99' }; })])).errors).toEqual([]);
    expect(validateAiResult(envelope([finding((f) => { f.dedupe = { external_job_id: '99', source_name: 'example careers' }; })])).errors).toEqual([]);
  });

  it('the envelope rules are real: a wrong contract name, schema_version or missing run id/generated_at fails the whole result', () => {
    expect(validateAiResult({ ...envelope([exampleFromInstructions()]), contract: 'jobquest.result' }).success).toBe(false);
    expect(validateAiResult({ ...envelope([exampleFromInstructions()]), schema_version: 'one' }).success).toBe(false);
    expect(validateAiResult({ ...envelope([exampleFromInstructions()]), run: { external_run_id: 'x' } }).success).toBe(false);
    expect(validateAiResult({ ...envelope([exampleFromInstructions()]), run: { external_run_id: 'x', generated_at: '2026-10-15 12:00' } }).success).toBe(false);
  });

  it('the incident shape (no kind) would have been rejected, which is exactly what the new text now prevents', () => {
    const incident = finding((f) => { delete f.kind; });
    const r = validateAiResult(envelope([incident, incident]));
    expect(r.rejectedItemCount).toBe(2);
    expect(r.errors.map((e) => `${e.path}:${e.code}`)).toEqual(expect.arrayContaining(['findings[0].kind:required', 'findings[1].kind:required']));
  });
});
