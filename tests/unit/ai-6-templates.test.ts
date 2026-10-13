import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EMAIL_CATEGORIES, JOB_DESCRIPTION_MAX_CHARS, JOB_EMPLOYMENT_TYPES, JOB_WORK_ARRANGEMENTS, STRONG_MATCH_THRESHOLD, validateAiResult } from '../../apps/api/src/lib/aiContract';

// The Claude workflow templates are the provider-facing half of the contract. Their example
// results must validate against the real validator (so the docs cannot drift from the code) and
// the safety language must be present.
const read = (name: string) => readFileSync(`ai-hub/provider-workflows/claude/${name}`, 'utf8').replace(/\r\n/g, '\n');

function exampleOf(doc: string): unknown {
  const block = /RESULT SHAPE\n([\s\S]*?)\n\nNOTES/.exec(doc)?.[1];
  if (!block) throw new Error('template has no RESULT SHAPE block');
  const filled = block.replace(/"([a-z_]+)":\s*"([^"]*)"/g, (_m, key: string, value: string) => {
    let v = value;
    if (value.includes('<')) {
      if (/(_at|observed_at|generated_at)$/.test(key)) v = '2026-10-01T12:00:00Z';
      else if (/url|ref$/.test(key) && key !== 'ref') v = 'https://example.com/page';
      else if (key === 'job_url' || key === 'contact_source_url' || key === 'profile_url') v = 'https://example.com/page';
      else v = 'Example';
    }
    if (value.includes('|')) v = value.split('|')[0]!;
    if (value === 'YYYY-MM-DD') v = '2026-09-28';
    if (key === 'sender_domain') v = 'example.com';
    if (key === 'contact_email') v = 'someone@example.com';
    if (key === 'source_id') v = 'msg-1';
    if (key === 'external_run_id') v = v.replace(/YYYY-MM-DDTHH|YYYY-MM-DD/, '2026-10-01');
    return `"${key}": "${v}"`;
  });
  return JSON.parse(filled);
}

describe('Claude workflow templates (AI-6)', () => {
  for (const [file, workflow, kind] of [['JOB_DISCOVERY.md', 'job_discovery', 'job_lead'], ['EMAIL_TRIAGE.md', 'email_triage', 'email_event'], ['RECRUITER_INTEL.md', 'recruiter_intel', 'recruiter_intel']] as const) {
    it(`${file}: the example result is a valid jobquest.ai-result 1.0 with no dropped fields`, () => {
      const r = validateAiResult(exampleOf(read(file)));
      expect(r.errors, JSON.stringify(r.errors)).toEqual([]);
      expect(r.unknownFieldCount, JSON.stringify(r.warnings)).toBe(0);
      expect(r.data!.workflow).toBe(workflow);
      expect(r.data!.findings[0]!.kind).toBe(kind);
      expect(r.data!.provider).toBe('claude');
      expect(r.data!.schema_version).toBe('1.0');
    });
  }

  it('Job Discovery documents the contract limits and the safety rules', () => {
    const t = read('JOB_DISCOVERY.md');
    for (const w of JOB_WORK_ARRANGEMENTS) expect(t).toContain(w);
    for (const e of JOB_EMPLOYMENT_TYPES) expect(t).toContain(e);
    expect(t).toContain(`${JOB_DESCRIPTION_MAX_CHARS.toLocaleString('en-US')} characters`);
    for (const phrase of ['never an application', 'NEVER submit a job form', 'NEVER claim a role is open without source evidence', 'NEVER fabricate salary', 'UNTRUSTED DATA', 'explicitly', 'canonical']) expect(t.toLowerCase()).toContain(phrase.toLowerCase());
    expect(t).toContain('jobquest_list_job_leads');
    expect(t).toContain('weekdays');
  });

  it('Email Triage lists exactly the approved categories and forbids bodies and mailbox changes', () => {
    const t = read('EMAIL_TRIAGE.md');
    for (const c of EMAIL_CATEGORIES) expect(t).toContain(`\`${c}\``);
    for (const phrase of ['Never submit a message body', 'job-search', 'UNTRUSTED DATA', 'Never send, reply', 'stable message id', 'full address is never kept']) expect(t).toContain(phrase);
    expect(t).toContain('jobquest_list_email_intelligence');
    expect(t).not.toMatch(/INTERVIEW_INVITE|ACKNOWLEDGEMENT|from_domain/); // retired AI-4 vocabulary
  });

  it('Recruiter Intel is public-source only, cites sources, forbids guessed contacts and bounds the research', () => {
    const t = read('RECRUITER_INTEL.md');
    for (const phrase of ['Never infer that someone is a recruiter', 'Never fabricate or guess', 'first.last@company.com', 'contact_source_url', 'cite a public source', 'uncertain', 'Do not send database ids', '<= 10 people']) expect(t).toContain(phrase);
    expect(t).toContain('jobquest_list_recruiter_intel');
    expect(t).not.toMatch(/"channel":/); // channel is no longer part of identity
  });

  it('the Daily Digest template reads stored sources and states the strong-match threshold', () => {
    const t = read('DAILY_DIGEST.md');
    expect(t).toContain('jobquest_list_job_leads');
    expect(t).toContain(`at least ${STRONG_MATCH_THRESHOLD}`);
    expect(t).toContain('daily_brief');
    expect(read('DAILY_DIGEST.md')).not.toContain('daily_digest"');
  });

  it('the operator guide covers the new sources, the ten-tool surface and the single write boundary', () => {
    const g = readFileSync('ai-hub/provider-workflows/CLAUDE_SCHEDULED_TASKS.md', 'utf8').replace(/\r\n/g, '\n');
    for (const phrase of ['eleven tools in total, one write', 'JobQuest stores no next-run time', 'A job lead is never an application', 'recruiter_source_required', 'contact_uncited_dropped']) expect(g).toContain(phrase);
  });
});
