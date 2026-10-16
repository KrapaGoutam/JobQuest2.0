import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AI_LIMITS, CLAIMED_GUIDANCE, EMAIL_ACTION_STATES, EMAIL_CATEGORIES, EMAIL_EXAMPLE_PREFIX, EMAIL_GROUPS, EMAIL_JOB_CATEGORIES, EMAIL_OTHER_CATEGORIES,
  EMAIL_STAGE_HINTS, EMAIL_TRIAGE_CASES, EMAIL_URGENCIES, SCHEDULER_PROVIDERS, SUBMIT_ONCE_RULE, STEP_GUIDES, buildSchedulerSetup, claimSteps,
  resultEnvelopeRules, validateAiResult, type SetupAutomation,
} from '../../apps/api/src/lib/aiContract';

// AI-11 production hotfix: a REAL Claude Email Triage run ended PARTIAL / SCHEMA_INVALID (8 rejected, 0 stored) because the generated
// instructions never showed the finding shape: `category` was nested in `payload`, and a rejection used stage hint CLOSED instead of
// REJECTED. These tests build results FROM THE GENERATED TEXT and run them through the real validator; the string assertions only pin
// the wording the incident showed was missing. The validator is NOT loosened by this hotfix.
const ID = '123e4567-e89b-42d3-a456-426614174000';
const auto = (over: Partial<SetupAutomation> = {}): SetupAutomation => ({
  id: ID, name: 'Job Email Intelligence', workflow: 'email_triage', provider: 'claude', enabled: true, cadence: 'manual_only', localTime: null, timezone: null,
  weekdays: [], sections: [], ...over,
});

const claimRules = claimSteps(['email_triage'])[0]!.rules;
const text = claimRules.join('\n');

/** The finding a provider would copy from the generated instructions. */
function exampleFromInstructions(): Record<string, any> {
  const rule = claimRules.find((r) => r.startsWith(EMAIL_EXAMPLE_PREFIX));
  expect(rule, 'the generated rules must carry an example email_event finding').toBeDefined();
  return JSON.parse(rule!.slice(EMAIL_EXAMPLE_PREFIX.length)) as Record<string, any>;
}

const envelope = (findings: unknown[], over: Record<string, unknown> = {}) => ({
  contract: 'jobquest.ai-result', schema_version: '1.0', provider: 'claude', workflow: 'email_triage',
  run: { external_run_id: 'manual:e4f4d0df:m0123456789abcdef012', generated_at: '2026-10-15T12:00:00-05:00' },
  sources: [{ type: 'gmail', ref: 'unread inbox', status: 'ok', count: findings.length }],
  findings, ...over,
});
const finding = (patch: (f: Record<string, any>) => void): Record<string, unknown> => {
  const f = structuredClone(exampleFromInstructions());
  patch(f);
  return f;
};
const rejects = (f: Record<string, unknown>, code?: string) => {
  const r = validateAiResult(envelope([f]));
  expect(r.rejectedItemCount).toBe(1);
  expect(r.data?.findings ?? []).toHaveLength(0);
  if (code) expect(r.errors.map((e) => e.code)).toContain(code);
  return r;
};

const JOB = EMAIL_JOB_CATEGORIES as readonly string[];
const LOW_CEILING = ['newsletter', 'notification', 'application_confirmation', 'rejection'];

/** The example reshaped for one documented case, exactly the way the generated text tells a provider to express it. */
function forCase(c: (typeof EMAIL_TRIAGE_CASES)[number]): Record<string, unknown> {
  return finding((f) => {
    const job = JOB.includes(c.category);
    f.category = c.category;
    f.title = `Example Corp: ${c.category}`;
    f.payload.group = job ? 'job_related' : 'other';
    if (c.stageHint) f.payload.application_stage_hint = c.stageHint; else delete f.payload.application_stage_hint;
    const informational = LOW_CEILING.includes(c.category) || c.category === 'other_job_search';
    if (informational) {
      f.payload.urgency = 'LOW'; f.payload.action_state = 'no_action';
      for (const k of ['deadline_at', 'action_summary', 'draft_recommended']) delete f.payload[k];
    }
  });
}

describe('the generated Email Triage instructions document the findings[] contract (incident: GENERATED_INSTRUCTIONS_GAP)', () => {
  it('states the findings[] wrapper, kind "email_event", the required finding-level fields, dedupe and payload version', () => {
    expect(text).toMatch(/ONE object inside the top-level `findings` array/);
    expect(text).toMatch(/`kind` \(exactly "email_event"\)/);
    expect(text).toMatch(/`category` \(see below\)/);
    expect(text).toMatch(/`occurred_at` \(when the message was RECEIVED, ISO-8601 with an explicit offset\)/);
    expect(text).toMatch(/dedupe \(REQUIRED object\)/);
    expect(text).toMatch(/payload\.version must be "1\.0"/);
    const ex = exampleFromInstructions();
    expect(ex.kind).toBe('email_event');
    expect(ex.dedupe).toEqual({ source_type: 'gmail', source_id: expect.any(String) });
    expect(ex.payload.version).toBe('1.0');
    expect(typeof ex.occurred_at).toBe('string');
  });

  it('puts `category` at the FINDING level in the example and says it must never be nested in payload', () => {
    const ex = exampleFromInstructions();
    expect(EMAIL_CATEGORIES as readonly string[]).toContain(ex.category);
    expect(ex.payload).not.toHaveProperty('category');
    expect(ex).not.toHaveProperty('priority'); // urgency lives in the payload, not a finding-level priority
    expect(text).toMatch(/`category` goes at the FINDING level, as a sibling of `kind` and `title`, NEVER inside `payload`/);
    expect(text).toMatch(/Urgency is NOT a finding-level `priority`: send it as payload\.urgency/);
  });

  it('lists every canonical enum exactly as the constants define it (parsed back out of the generated text)', () => {
    const documented = (label: string): string[] => {
      const m = new RegExp(`${label}: ([A-Za-z_ |]+?)[.(]`).exec(text);
      expect(m, `${label} must be documented`).not.toBeNull();
      return m![1]!.split('|').map((v) => v.trim()).filter(Boolean);
    };
    expect(documented('category, job-related group')).toEqual([...EMAIL_JOB_CATEGORIES]);
    expect(documented('category, other group')).toEqual([...EMAIL_OTHER_CATEGORIES]);
    expect(documented('\\. group')).toEqual([...EMAIL_GROUPS]);
    expect(documented('urgency')).toEqual([...EMAIL_URGENCIES]);
    expect(documented('action_state')).toEqual([...EMAIL_ACTION_STATES]);
    expect(documented('application_stage_hint')).toEqual([...EMAIL_STAGE_HINTS]);
    expect(text).toMatch(/ONLY these exact values and casing/);
    expect(text).toMatch(/OMIT an optional field you cannot classify/);
  });

  it('tells the provider a rejection uses the canonical stage REJECTED, not CLOSED', () => {
    expect(EMAIL_STAGE_HINTS).toContain('REJECTED');
    expect(EMAIL_STAGE_HINTS as readonly string[]).not.toContain('CLOSED');
    expect(text).toMatch(/A rejection or "not selected" message uses exactly REJECTED, NOT CLOSED/);
    expect(text).toContain('rejection / not selected -> category rejection, application_stage_hint REJECTED');
    expect(text).toMatch(/job_related mail only/);
  });

  it('documents the validator-backed limits and the privacy model', () => {
    expect(text).toContain(`title <= ${AI_LIMITS.title} characters`);
    expect(text).toContain(`summary <= ${AI_LIMITS.summary} characters`);
    expect(text).toMatch(/payload\.sender_domain is ONLY the bare domain/);
    expect(text).toMatch(/confidence is a number from 0 through 1/);
    expect(text).toMatch(/REJECTS that whole message/);
    expect(text).toMatch(/Never submit a message body, quoted thread, HTML, attachment, full sender address, link, phone number, verification code/);
    expect(text).toMatch(/never mark a message read/);
    expect(text).toMatch(/Never send, reply, forward, archive, delete, label or mark mail/);
    expect(text).toMatch(/never create or send a draft/);
  });

  it('documents the result envelope and the submit-once rule for every provider (and never says a second submit is safe)', () => {
    const env = resultEnvelopeRules().join('\n');
    expect(env).toContain('"contract":"jobquest.ai-result"');
    expect(env).toContain('"schema_version":"1.0"');
    expect(env).toMatch(/claim's `externalRunId` \(also `submit\.externalRunId`\) copied EXACTLY/);
    expect(env).toMatch(/run\.generated_at is the current time as ISO-8601 with an explicit offset/);
    for (const p of SCHEDULER_PROVIDERS) {
      const s = buildSchedulerSetup(auto({ provider: p }))!;
      for (const t of [s.scheduledInstructions, s.manualRunInstructions]) {
        expect(t).toContain('contract "jobquest.ai-result"');
        expect(t).toContain('schema_version "1.0"');
        expect(t).toContain(`provider "${p}"`);
        expect(t).toMatch(/workflow = the claim's `submit\.workflow`/);
        expect(t).toMatch(/`externalRunId` copied EXACTLY/);
        expect(t).toMatch(/run\.generated_at = now \(ISO-8601 with offset\)/);
        expect(t).toMatch(/`sources`, and `findings`/);
        expect(t).toContain(SUBMIT_ONCE_RULE);
        expect(t).toMatch(/Email triage/);
        expect(t).not.toMatch(/(same|identical) result twice is safe/i);
        expect(t).not.toMatch(/submit(ting)? (it|the same result) (again|twice)/i);
      }
    }
    expect(SUBMIT_ONCE_RULE).toMatch(/never resubmit a corrected result for a rejected or PARTIAL run/);
    expect(SUBMIT_ONCE_RULE).toMatch(/NEW manual run \(fresh instructions with a new key\)/);
    expect(CLAIMED_GUIDANCE).toContain(SUBMIT_ONCE_RULE);
    expect(text).not.toMatch(/twice is safe|submit(ting)? again/i);
  });

  it('the claim text stays credential-free', () => {
    const all = JSON.stringify({ rules: claimRules, guidance: CLAIMED_GUIDANCE });
    expect(all).not.toMatch(/jq_mcp_|Bearer|secret|password|service_role|client_secret|access_token/i);
  });

  it('is provider-neutral: one shared source, identical step rules and identical setup text apart from the provider name', () => {
    expect(STEP_GUIDES.email_triage.rules).toBe(claimSteps(['email_triage'])[0]!.rules);
    const norm = (p: (typeof SCHEDULER_PROVIDERS)[number]) => buildSchedulerSetup(auto({ provider: p }), 'm0123456789abcdef012')!.scheduledInstructions.replace(/Claude|ChatGPT|Gemini|"(claude|chatgpt|gemini)"/g, 'P');
    expect(norm('claude')).toBe(norm('chatgpt'));
    expect(norm('chatgpt')).toBe(norm('gemini'));
    expect(text).not.toMatch(/gemini|chatgpt|claude/i);
  });
});

describe('broad scope: every eligible unread, untriaged message is triaged, job-related or not', () => {
  it('instructs the provider to process ALL unread/unopened + untriaged mail, not only job-search mail', () => {
    expect(text).toMatch(/triage EVERY eligible message/);
    expect(text).toMatch(/UNREAD \/ unopened AND not yet triaged/);
    expect(text).toMatch(/not in jobquest_list_email_intelligence/);
    expect(text).toMatch(/Do NOT restrict the search to job-search mail, recruiters, particular roles or keywords/);
  });

  it('classifies every message as job_related or other first, and does not drop non-job mail', () => {
    expect(text).toMatch(/do not silently drop a message because it is not job-related/);
    expect(text).toContain(`classify each one first as group ${EMAIL_GROUPS.join(' | ')}`);
    expect(text).not.toMatch(/Skip marketing and bulk promotions/i);
    expect(text).not.toMatch(/only when (it is )?important/i);
    expect(text).toMatch(/newsletter \/ marketing \/ promotion -> category newsletter/);
    expect(text).toMatch(/anything else that is not job-related -> category other/);
    expect(text).toMatch(/Skip only drafts, sent mail, spam and trash/);
  });

  it('handles an oversize mailbox deterministically: newest first, job_related and HIGH before the rest, remainder stays untriaged', () => {
    expect(text).toContain(`at most ${AI_LIMITS.findingsPerRun} findings`);
    expect(text).toMatch(/newest first but submit the job_related and HIGH-urgency ones before the rest/);
    expect(text).toMatch(/stay unread and untriaged, so the next run picks them up/);
  });

  it('every documented case maps to a real category, and the job-related / other split is the canonical group', () => {
    expect(EMAIL_TRIAGE_CASES.length).toBeGreaterThanOrEqual(12);
    for (const c of EMAIL_TRIAGE_CASES) {
      expect(EMAIL_CATEGORIES as readonly string[], c.label).toContain(c.category);
      expect(text, c.label).toContain(`${c.label} -> category ${c.category}${c.stageHint ? `, application_stage_hint ${c.stageHint}` : ''}`);
      if (c.stageHint) expect(JOB, `${c.category} carries a stage hint, so it must be job-related`).toContain(c.category);
    }
    expect(new Set(EMAIL_TRIAGE_CASES.map((c) => c.category))).toEqual(new Set([...EMAIL_JOB_CATEGORIES, ...EMAIL_OTHER_CATEGORIES]));
  });

  it('the repo prompt templates for all three providers state the same broad scope (no job-search-only filter)', () => {
    for (const p of ['claude', 'chatgpt', 'gemini']) {
      const t = readFileSync(`ai-hub/provider-workflows/${p}/EMAIL_TRIAGE.md`, 'utf8').replace(/\r\n/g, '\n');
      expect(t, p).toMatch(/every unread, untriaged message/i);
      expect(t, p).not.toMatch(/Skip marketing and bulk promotions/i);
      expect(t, p).not.toMatch(/Record job-search mail, plus other mail only when/);
    }
  });
});

describe('validator round-trip: a result built ONLY from the generated instructions passes the real Email Triage validator', () => {
  for (const provider of SCHEDULER_PROVIDERS) {
    it(`${provider}: the example finding in a canonical envelope has 0 errors, 0 rejected items and 0 warnings`, () => {
      const r = validateAiResult(envelope([exampleFromInstructions()], { provider }));
      expect(r.errors).toEqual([]);
      expect(r.warnings).toEqual([]);
      expect(r.rejectedItemCount).toBe(0);
      expect(r.success).toBe(true);
      const f = r.data!.findings[0]!;
      expect(f.kind).toBe('email_event');
      expect(f.category).toBe('interview_scheduling');
      expect(f.priority).toBe('HIGH');
      expect(f.payload).toMatchObject({ group: 'job_related', action_state: 'needs_action', application_stage_hint: 'INTERVIEW', sender_domain: 'examplecorp.com' });
      expect(f.payload).not.toHaveProperty('urgency'); // stored as the finding priority
      expect(r.data!.provider).toBe(provider);
      expect(r.data!.sources[0]).toMatchObject({ type: 'gmail', status: 'ok' });
    });

    it(`${provider}: a full mixed batch (interview request, rejection, job alert, newsletter, non-job notice) is accepted with 0 errors`, () => {
      const pick = (cat: string) => forCase(EMAIL_TRIAGE_CASES.find((c) => c.category === cat)!);
      const batch = ['interview', 'rejection', 'other_job_search', 'newsletter', 'important_account', 'other'].map((cat, i) =>
        ({ ...pick(cat), dedupe: { source_type: 'gmail', source_id: `msg-${i}` } }));
      const r = validateAiResult(envelope(batch, { provider }));
      expect(r.errors).toEqual([]);
      expect(r.warnings).toEqual([]);
      expect(r.rejectedItemCount).toBe(0);
      expect(r.data!.findings.map((f) => f.category)).toEqual(['interview', 'rejection', 'other_job_search', 'newsletter', 'important_account', 'other']);
    });
  }

  it('every documented case (job-related and other) is accepted with its documented category, group and stage hint, and 0 warnings', () => {
    for (const c of EMAIL_TRIAGE_CASES) {
      const r = validateAiResult(envelope([forCase(c)]));
      expect(r.errors, c.label).toEqual([]);
      expect(r.warnings, c.label).toEqual([]);
      const f = r.data!.findings[0]!;
      expect(f.category, c.label).toBe(c.category);
      expect(f.payload.group, c.label).toBe(JOB.includes(c.category) ? 'job_related' : 'other');
      expect(f.payload.application_stage_hint ?? null, c.label).toBe(c.stageHint);
    }
  });

  it('a rejection with the documented stage REJECTED is stored LOW with the REJECTED hint; the incident value CLOSED is rejected', () => {
    const rej = forCase(EMAIL_TRIAGE_CASES.find((c) => c.category === 'rejection')!);
    const ok = validateAiResult(envelope([rej]));
    expect(ok.errors).toEqual([]);
    expect(ok.data!.findings[0]).toMatchObject({ category: 'rejection', priority: 'LOW' });
    expect(ok.data!.findings[0]!.payload.application_stage_hint).toBe('REJECTED');
    const closed = rejects({ ...rej, payload: { ...(rej.payload as object), application_stage_hint: 'CLOSED' } }, 'enum');
    expect(closed.errors.map((e) => e.path)).toContain('findings[0].payload.application_stage_hint');
  });

  it('every documented stage hint, urgency, action_state and group value (parsed from the enum constants the text lists) is accepted', () => {
    for (const h of EMAIL_STAGE_HINTS) expect(validateAiResult(envelope([finding((f) => { f.payload.application_stage_hint = h; })])).errors, h).toEqual([]);
    for (const u of EMAIL_URGENCIES) expect(validateAiResult(envelope([finding((f) => { f.payload.urgency = u; })])).errors, u).toEqual([]);
    for (const a of EMAIL_ACTION_STATES) expect(validateAiResult(envelope([finding((f) => { f.payload.action_state = a; delete f.payload.draft_recommended; })])).errors, a).toEqual([]);
    const other = EMAIL_OTHER_CATEGORIES as readonly string[];
    for (const cat of EMAIL_CATEGORIES) {
      const job = !other.includes(cat); // legacy AI-6 spellings are job-related too
      const r = validateAiResult(envelope([finding((f) => { f.category = cat; f.payload.group = job ? 'job_related' : 'other'; if (!job) delete f.payload.application_stage_hint; })]));
      expect(r.errors, cat).toEqual([]);
    }
  });

  it('the incident shapes are really rejected, which is exactly what the new text now prevents', () => {
    // 1. category nested in payload instead of the finding level
    const nested = finding((f) => { f.payload.category = f.category; delete f.category; });
    const r = rejects(nested, 'email_category');
    expect(r.errors.map((e) => e.path)).toContain('findings[0].category');
    // 2. non-canonical stage hint synonyms
    for (const bad of ['CLOSED', 'DECLINED', 'NOT_SELECTED', 'REJECTION', 'SCREENING']) rejects(finding((f) => { f.payload.application_stage_hint = bad; }), 'enum');
    // other documented requirements
    rejects(finding((f) => { delete f.kind; }), 'required');
    rejects(finding((f) => { delete f.dedupe; }), 'required');
    rejects(finding((f) => { delete f.occurred_at; }), 'required');
    rejects(finding((f) => { delete f.category; }), 'email_category');
    rejects(finding((f) => { f.category = 'job_alert'; }), 'email_category');
    rejects(finding((f) => { f.title = 'x'.repeat(AI_LIMITS.title + 1); }), 'too_long');
    rejects(finding((f) => { f.summary = 'x'.repeat(AI_LIMITS.summary + 1); }), 'too_long');
    rejects(finding((f) => { f.payload.urgency = 'URGENT'; }), 'enum');
    rejects(finding((f) => { f.payload.action_state = 'maybe'; }), 'enum');
    rejects(finding((f) => { f.payload.sender_domain = 'https://examplecorp.com/inbox'; }), 'domain');
    rejects(finding((f) => { f.payload.version = '2.0'; }), 'version');
    rejects(finding((f) => { f.confidence = 90; }), 'confidence');
    rejects(finding((f) => { f.occurred_at = '2026-10-15 08:30'; }), 'timestamp');
    rejects(finding((f) => { f.payload.group = 'other'; }), 'email_group'); // group must agree with the category
  });

  it('a stage hint on non-job mail is dropped with a warning (documented as job_related only), not stored', () => {
    const r = validateAiResult(envelope([finding((f) => { f.category = 'newsletter'; f.payload.group = 'other'; f.payload.urgency = 'LOW'; f.payload.action_state = 'no_action'; delete f.payload.draft_recommended; })]));
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toContain('stage_hint_not_job_related');
    expect(r.data!.findings[0]!.payload).not.toHaveProperty('application_stage_hint');
  });
});

describe('privacy: the contract stores bounded intelligence, never mail', () => {
  it('the example itself carries no body, HTML, attachment, address, link or phone number', () => {
    const ex = JSON.stringify(exampleFromInstructions());
    expect(ex).not.toMatch(/https?:\/\/|www\.|<\/?[a-z]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}|\d{3}[\s.-]\d{3}[\s.-]\d{4}/i);
    const payload = exampleFromInstructions().payload as Record<string, unknown>;
    for (const k of ['body', 'raw_body', 'body_text', 'body_html', 'html', 'full_text', 'content', 'text', 'attachments']) expect(payload).not.toHaveProperty(k);
  });

  it('a provider that sends a body anyway has it dropped (with a warning) and never stored', () => {
    const r = validateAiResult(envelope([finding((f) => { f.payload.body = 'full message body'; f.payload.html = '<p>hi</p>'; f.body = 'top-level body'; f.attachments = ['a.pdf']; })]));
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toContain('raw_body_rejected');
    const stored = JSON.stringify(r.data!.findings[0]);
    expect(stored).not.toContain('full message body');
    expect(stored).not.toContain('top-level body');
    expect(stored).not.toContain('<p>');
    expect(stored).not.toContain('a.pdf');
  });

  it('links, addresses and phone numbers in email-derived text are removed before storage', () => {
    const r = validateAiResult(envelope([finding((f) => {
      f.summary = 'Reply to jordan@examplecorp.com or call 555-123-4567, details at https://tracking.example.com/x?id=1.';
      f.payload.sender_name = 'Jordan Example <jordan@examplecorp.com>';
    })]));
    expect(r.errors).toEqual([]);
    const f = r.data!.findings[0]!;
    expect(f.summary).not.toMatch(/@|555|https?:/);
    expect(f.payload.sender_name).toBe('Jordan Example');
    expect(JSON.stringify(f)).not.toMatch(/jordan@examplecorp\.com|tracking\.example\.com/);
  });

  it('JobQuest still derives priority from urgency (one stored urgency) and never trusts a provider application_id', () => {
    const r = validateAiResult(envelope([finding((f) => { f.match = { application_id: '123e4567-e89b-42d3-a456-426614174000', hints: { company: 'Example Corp' } }; })]));
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toContain('untrusted_scope_field');
    expect(r.data!.findings[0]!.match_hints.company).toBe('Example Corp');
    expect(JSON.stringify(r.data!.findings[0])).not.toContain('123e4567');
  });
});
