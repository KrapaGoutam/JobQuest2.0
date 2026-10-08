import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as C from '../../apps/api/src/lib/aiContract';
import { validateAiResult, buildDedupeKey, canonicalizeUrl, canonicalJson, contentFingerprint, toIngestRunInput } from '../../apps/api/src/lib/aiContract';
import { valid, crossProvider, meaningfulChange, unknownFields, invalid, untrustedScope } from './fixtures/ai-contract/fixtures';

const ok = (x: unknown) => {
  const r = validateAiResult(x);
  expect(r.errors, JSON.stringify(r.errors)).toEqual([]);
  expect(r.success).toBe(true);
  return r;
};
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const codes = (r: ReturnType<typeof validateAiResult>) => r.errors.map((e) => e.code);
// Loosely-typed handle for mutating fixture copies.
type Loose = { findings: Array<Record<string, any>>; suggestions: Array<Record<string, any>>; [k: string]: any };
const loose = (x: unknown): Loose => clone(x) as Loose;

describe('enum synchronization with AI-1A CHECK constraints', () => {
  // Normalize line endings: Windows checkouts (core.autocrlf=true) materialize migrations as CRLF.
  const sql = readFileSync('supabase/migrations/20261023100000_ai_hub_database_foundation.sql', 'utf8').replace(/\r\n/g, '\n');
  const listFor = (constraint: string, source = sql) => {
    const m = new RegExp(`${constraint} check \\(([\\s\\S]*?)\\),?\\n`).exec(source);
    expect(m, constraint).not.toBeNull();
    return [...m![1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!);
  };
  it.each([
    ['chk_ai_runs_provider', C.AI_PROVIDERS], ['chk_ai_runs_workflow', C.AI_WORKFLOWS],
    ['chk_ai_runs_status', C.AI_RUN_STATUSES], ['chk_ai_runs_trigger', C.AI_TRIGGER_TYPES],
    ['chk_ai_runs_error_category', C.AI_ERROR_CATEGORIES], ['chk_ai_findings_kind', C.AI_FINDING_KINDS],
    ['chk_ai_findings_status', C.AI_FINDING_STATUSES], ['chk_ai_findings_priority', C.AI_PRIORITIES],
    ['chk_ai_suggestions_action', C.AI_SUGGESTION_ACTIONS], ['chk_ai_suggestions_status', C.AI_SUGGESTION_STATUSES],
  ] as const)('%s', (name, values) => expect(listFor(name)).toEqual([...values]));
  it('still detects drift between the SQL CHECK list and the TypeScript enum', () => {
    const mutated = sql.replace("'claude', 'gemini'", "'claude', 'gemini-x'");
    expect(mutated).not.toBe(sql);
    expect(listFor('chk_ai_runs_provider', mutated)).not.toEqual([...C.AI_PROVIDERS]);
  });
});

describe('version', () => {
  it('accepts 1.0', () => expect(ok(valid.rejection).data!.schema_version).toBe(C.AI_CONTRACT_VERSION));
  it('rejects malformed version', () => expect(codes(validateAiResult(invalid.malformedVersion))).toContain('version_malformed'));
  it('rejects unsupported major', () => expect(codes(validateAiResult(invalid.incompatibleMajor))).toContain('version_unsupported'));
  it('accepts a newer minor additively, normalizes to 1.0 and warns', () => {
    const r = ok({ ...clone(valid.rejection), schema_version: '1.7' });
    expect(r.data!.schema_version).toBe('1.0');
    expect(r.warnings.map((w) => w.code)).toContain('version_minor_ahead');
  });
  it('rejects a wrong contract name', () => expect(codes(validateAiResult({ ...clone(valid.rejection), contract: 'other' }))).toContain('contract_name'));
});

describe('unknown fields and privacy', () => {
  it('drops and counts unknown fields without retaining them', () => {
    const r = ok(unknownFields);
    expect(r.unknownFieldCount).toBe(4); // surprise, extra_a, extra_b, dedupe.junk
    const out = JSON.stringify(r.data);
    expect(out).not.toContain('surprise');
    expect(out).not.toContain('extra_a');
    expect(out).not.toContain('junk');
  });
  it('truncates oversized evidence to 500 chars deterministically with a warning', () => {
    const r = ok(invalid.oversizedEvidence);
    expect([...r.data!.findings[0]!.evidence!].length).toBe(500);
    expect(r.warnings.map((w) => w.code)).toContain('truncated');
  });
  it('drops unknown payload keys on typed kinds (no raw dump)', () => {
    const f = loose(valid.rejection);
    f.findings[0]!.payload.raw_email_body = 'full body text';
    const r = ok(f);
    expect(r.data!.findings[0]!.payload).not.toHaveProperty('raw_email_body');
    expect(r.unknownFieldCount).toBe(1);
  });
  it('strips server-owned seen_by from free-form payloads', () => {
    const f = loose(valid.rejection);
    f.findings = [{ kind: 'note', dedupe: {}, title: 'Note', payload: { seen_by: ['x'], k: 1 } }];
    const r = ok(f);
    expect(r.data!.findings[0]!.payload).toEqual({ k: 1 });
  });
});

describe('urls', () => {
  it('accepts a valid URL', () => { ok(valid.jobLead); });
  it('rejects unsafe schemes', () => {
    const r = validateAiResult(invalid.unsafeUrl);
    expect(r.rejectedItemCount).toBe(1);
    expect(codes(r)).toContain('url_scheme');
  });
  it.each(['data:text/html,x', 'file:///etc/passwd', 'chrome://settings', 'chrome-extension://abc/x', 'https://u:p@example.com/'])('rejects %s', (u) => {
    const f = loose(valid.jobLead);
    f.findings[0]!.source = { url: u };
    expect(validateAiResult(f).rejectedItemCount).toBe(1);
  });
});

describe('timestamps and confidence', () => {
  it('normalizes offsets to UTC ISO', () => expect(ok(valid.rejection).data!.findings[0]!.occurred_at).toBe('2026-10-01T14:00:00.000Z'));
  it('rejects ambiguous/invalid timestamps', () => {
    const r = validateAiResult(invalid.invalidTimestamp);
    expect(codes(r)).toContain('timestamp');
    expect(r.rejectedItemCount).toBe(1);
  });
  it('rejects a timestamp without a timezone', () => {
    const f = loose(valid.rejection);
    f.run.generated_at = '2026-10-01T12:00:00';
    expect(validateAiResult(f).success).toBe(false);
  });
  it('accepts boundary confidences 0 and 1 and rounds to 3 decimals', () => {
    for (const [v, exp] of [[0, 0], [1, 1], [0.12345, 0.123]] as const) {
      const f = loose(valid.rejection);
      f.findings[0]!.confidence = v;
      expect(ok(f).data!.findings[0]!.confidence).toBe(exp);
    }
  });
  it('rejects out-of-range confidence (0..100 form is not accepted)', () => {
    expect(codes(validateAiResult(invalid.badConfidence))).toContain('confidence');
    for (const v of [-0.1, 1.01, '0.5']) {
      const f = loose(valid.rejection);
      f.findings[0]!.confidence = v;
      expect(validateAiResult(f).rejectedItemCount).toBe(1);
    }
  });
});

describe('scope safety', () => {
  it('ignores provider-supplied user/workspace/application ids', () => {
    const r = ok(untrustedScope);
    const out = JSON.stringify(r.data);
    for (const id of ['22222222-', '33333333-', '44444444-']) expect(out).not.toContain(id);
    expect(r.data!.findings[0]!.match_hints.company).toBe('Example Corp');
    expect(r.warnings.filter((w) => w.code === 'untrusted_scope_field').length).toBe(4);
    expect(r.unknownFieldCount).toBe(4);
    expect(toIngestRunInput(r.data!)).not.toHaveProperty('workspaceId');
    expect(toIngestRunInput(r.data!)).not.toHaveProperty('userId');
  });
  it('suggestions cannot arrive pre-decided; status is dropped', () => {
    const f = loose(valid.suggestion);
    f.suggestions[0]!.status = 'ACCEPTED';
    const r = ok(f);
    expect(r.data!.suggestions[0]!).not.toHaveProperty('status');
    expect(r.unknownFieldCount).toBe(1);
  });
  it('a suggestion pointing at a rejected finding is rejected', () => {
    const f = loose(valid.suggestion);
    f.findings[0]!.confidence = 5;
    const r = validateAiResult(f);
    expect(r.rejectedItemCount).toBe(2);
    expect(r.data!.suggestions).toEqual([]);
  });
});

describe('dedupe', () => {
  const key = (x: unknown) => ok(x).data!.findings[0]!.dedupe_key;
  it('same event gives the same key', () => expect(key(valid.rejection)).toBe(key(clone(valid.rejection))));
  it('cross-provider: Claude and Gemini converge on one key', () => {
    expect(key(crossProvider.claude)).toBe(key(crossProvider.gemini));
  });
  it('different source event gives a different key', () => {
    expect(key(valid.rejection)).not.toBe(key(valid.interview)); // same message, different event
    const f = loose(valid.rejection);
    f.findings[0]!.dedupe.source_id = 'gmail-msg-002';
    expect(key(f)).not.toBe(key(valid.rejection));
  });
  it('canonicalizes URLs (host case, tracking, fragment, query order)', () => {
    expect(canonicalizeUrl('https://Jobs.Example.com/posting/42/?utm_source=x&b=2&a=1#apply')).toBe('https://jobs.example.com/posting/42?a=1&b=2');
    expect(key(valid.jobLead)).toBe('url:https://jobs.example.com/posting/42?a=1&b=2');
    expect(canonicalizeUrl('javascript:alert(1)')).toBeNull();
  });
  it('does not over-merge: different path/query-value stay distinct', () => {
    expect(canonicalizeUrl('https://x.com/a?id=1')).not.toBe(canonicalizeUrl('https://x.com/a?id=2'));
    expect(canonicalizeUrl('https://x.com/Job')).not.toBe(canonicalizeUrl('https://x.com/job'));
  });
  it('equivalent normalized inputs yield the same key', () => {
    const a = buildDedupeKey('recruiter_intel', { name: '  Pat   Recruiter ', company: 'EXAMPLE corp', channel: 'Email' });
    const b = buildDedupeKey('recruiter_intel', { name: 'pat recruiter', company: 'Example Corp', channel: 'email' });
    expect(a).toEqual(b);
    expect(buildDedupeKey('email_event', { source_type: 'GMAIL', source_id: ' m1 ', event: 'Rejection' })).toEqual(buildDedupeKey('email_event', { source_type: 'gmail', source_id: 'm1', event: 'rejection' }));
  });
  it('daily brief, job fallbacks and keys fit DB shape', () => {
    expect(ok(valid.dailyBrief).data!.findings[0]!.dedupe_key).toBe('daily_brief:2026-10-01');
    expect(buildDedupeKey('daily_brief', { date: '2026-02-30' }).ok).toBe(false);
    expect(buildDedupeKey('job_lead', { company: 'A', title: 'B' }).ok).toBe(true);
    expect(buildDedupeKey('job_lead', {}).ok).toBe(false);
    const long = buildDedupeKey('job_lead', { job_url: `https://x.com/${'a'.repeat(400)}` });
    expect(long.ok && /^[\x21-\x7e]{1,255}$/.test(long.key)).toBe(true);
    for (const f of [valid.interview, valid.calendar, valid.recruiter, valid.jobLead]) expect(key(f)).toMatch(/^[\x21-\x7e]{1,255}$/);
  });
});

describe('content fingerprint (TS diagnostic; NOT the SQL content_hash)', () => {
  const body = (x: unknown) => {
    const rest: Record<string, unknown> = { ...ok(x).data!.findings[0]! }; delete rest.dedupe_key;
    return rest;
  };
  it('is deterministic and key-order independent', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [1, { z: 1, y: 2 }] } })).toBe('{"a":{"c":[1,{"y":2,"z":1}],"d":2},"b":1}');
    expect(contentFingerprint({ a: 1, b: 2 })).toBe(contentFingerprint({ b: 2, a: 1 }));
    expect(contentFingerprint(body(meaningfulChange.before))).toBe(contentFingerprint(body(clone(meaningfulChange.before))));
  });
  it('meaningful change keeps the key and changes the fingerprint', () => {
    expect(ok(meaningfulChange.before).data!.findings[0]!.dedupe_key).toBe(ok(meaningfulChange.after).data!.findings[0]!.dedupe_key);
    expect(contentFingerprint(body(meaningfulChange.before))).not.toBe(contentFingerprint(body(meaningfulChange.after)));
  });
});

describe('golden fixtures', () => {
  it.each(Object.entries(valid))('valid: %s', (_n, f) => {
    const r = ok(f);
    expect(r.rejectedItemCount).toBe(0);
    expect(r.data!.findings.length).toBeGreaterThan(0);
  });
  it('toIngestRunInput maps the run envelope', () => {
    expect(toIngestRunInput(ok(valid.rejection).data!, 'scheduled')).toMatchObject({ provider: 'claude', workflow: 'email_triage', triggerType: 'scheduled', externalRunId: 'run-fixture-1', schemaVersion: '1.0' });
  });
  it('envelope failures are not partial successes and never throw on garbage', () => {
    for (const g of [null, 'x', 5, [], {}]) expect(validateAiResult(g).success).toBe(false);
  });
  it('duplicate identity inside one run is dropped with a warning', () => {
    const f = loose(valid.rejection);
    f.findings.push(clone(f.findings[0]!));
    const r = ok(f);
    expect(r.data!.findings).toHaveLength(1);
    expect(r.warnings.map((w) => w.code)).toContain('duplicate_in_run');
  });
});
