// AI-11 hotfix: provider-facing documentation of the EXISTING `jobquest.ai-result` contract (pure; no I/O).
//
// This is documentation, not a second contract: every enum, limit and name below is read from the same constants the canonical
// validator (validate.ts) uses, and tests/unit/ai-11-job-discovery-instructions.test.ts feeds a finding built from this text
// through the real validator. It is provider-neutral: Claude, ChatGPT and Gemini get identical wording (apart from the provider
// name they are told to submit as, which comes from the claim).

import {
  AI_CONTRACT_NAME, AI_CONTRACT_VERSION, AI_LIMITS, AI_SOURCE_STATUSES, DISCOVERY_LIMITS, JOB_DESCRIPTION_MAX_CHARS, JOB_EMPLOYMENT_TYPES,
  JOB_REMOTE_SCOPES, JOB_WORK_ARRANGEMENTS, SOURCE_PAYLOAD_VERSION,
} from './constants';
import { SOURCE_KEY_LIMITS } from './validate';

/** Longest `source_name` the validator accepts (payload and dedupe). */
export const JOB_SOURCE_NAME_MAX_CHARS = 64;

const bar = (values: readonly string[]): string => values.join(' | ');

/** Marks the single rule that carries the machine-readable example so tests (and humans) can find it. */
export const JOB_LEAD_EXAMPLE_PREFIX = 'Example job_lead finding (copy the SHAPE, never the values): ';

/** One illustrative, schema-valid job_lead finding. Values are placeholders; they are never data. */
export const JOB_LEAD_EXAMPLE = {
  kind: 'job_lead',
  title: 'Senior QA Engineer at Example Corp',
  summary: 'Remote (US) full-time senior QA engineering role focused on test automation.',
  dedupe: { job_url: 'https://careers.example.com/jobs/12345', external_job_id: '12345', source_name: 'example careers' },
  payload: {
    version: SOURCE_PAYLOAD_VERSION,
    company: 'Example Corp',
    role_title: 'Senior QA Engineer',
    location: 'Remote - United States',
    work_arrangement: 'remote',
    employment_type: 'full_time',
    remote_scope: 'us',
    source_name: 'example careers',
    job_url: 'https://careers.example.com/jobs/12345',
    posted_at: '2026-10-14T09:00:00-05:00',
    match_score: 85,
    match_reasoning: 'Matches the target title and the test-automation focus.',
    fit_reasons: ['Test automation focus', 'Remote within the United States'],
    gap_reasons: ['Posting asks for 7+ years'],
    description: 'Plain-text description of the posting.',
  },
} as const;

/**
 * Job Discovery: how to express each discovered job so the canonical validator accepts it. Appended to the job_discovery step guide
 * (the claim carries it), so it is the single source for every provider.
 */
export function jobLeadContractRules(): string[] {
  const L = AI_LIMITS;
  return [
    'RESULT SHAPE: every discovered job is ONE object inside the top-level `findings` array of your result (never a bare array, never a nested "jobs"/"leads" key). Required on every lead: `kind` (exactly "job_lead"), `title`, a `dedupe` object, and a `payload` object whose `company` and `role_title` are set. Everything else is optional: omit what the posting does not state.',
    `${JOB_LEAD_EXAMPLE_PREFIX}${JSON.stringify(JOB_LEAD_EXAMPLE)}`,
    `ENUMS (use ONLY these exact lowercase values; normalize what you observe into them; if a value cannot be determined safely, OMIT that optional field rather than inventing a new string — an unknown value rejects the whole lead): work_arrangement: ${bar(JOB_WORK_ARRANGEMENTS)}. employment_type: ${bar(JOB_EMPLOYMENT_TYPES)}. remote_scope: ${bar(JOB_REMOTE_SCOPES)} (only meaningful when work_arrangement is "remote"; omit it otherwise).`,
    `LIMITS (a value over its limit REJECTS that whole lead; it is not shortened for you): title <= ${L.title} characters; summary <= ${L.summary} characters; payload.company <= ${SOURCE_KEY_LIMITS.short}; payload.role_title <= ${SOURCE_KEY_LIMITS.medium}; payload.location <= ${SOURCE_KEY_LIMITS.short}; source_name <= ${JOB_SOURCE_NAME_MAX_CHARS}; external_job_id <= ${L.id}; job_url <= ${L.url}. payload.version must be "${SOURCE_PAYLOAD_VERSION}". match_reasoning (<= ${SOURCE_KEY_LIMITS.long}), fit_reasons / gap_reasons (at most ${DISCOVERY_LIMITS.reasons} entries of <= ${DISCOVERY_LIMITS.reasonChars} characters) and description (PLAIN TEXT, no HTML, <= ${JOB_DESCRIPTION_MAX_CHARS}) are cut if too long, so keep them short.`,
    'match_score: a JSON NUMBER from 0 through 100 (for example 85). Not a string, not "85%", no percent sign, not a 0-1 fraction (0.85 would be stored as 1). Omit it if you cannot score the role.',
    'job_url (payload.job_url and dedupe.job_url): the plain absolute http:// or https:// URL of the posting page itself, with no login details embedded in it. Not a search-results page, not a search-engine redirect or tracking link; if you only have such a link, omit job_url. posted_at: ISO-8601 with an explicit offset (for example 2026-10-14T09:00:00-05:00), or omit it.',
    'dedupe (REQUIRED object) gives the lead a stable identity: set job_url (the canonical posting URL), and external_job_id together with source_name when the board shows an id. company + role_title + source_name in the payload are only a weak fallback. Without a usable identity the lead is rejected. dedupe.source_name is lowercased and must be a short name (the board or employer site), not a sentence.',
    `Submit at most the profile maximum, best matches first. A rejected lead is dropped and the whole run ends PARTIAL, so check every lead against the shape, enums and limits above BEFORE you submit.`,
  ];
}

const ENVELOPE_EXAMPLE = {
  contract: AI_CONTRACT_NAME,
  schema_version: AI_CONTRACT_VERSION,
  provider: '<submit.provider>',
  workflow: '<submit.workflow>',
  run: { external_run_id: '<claim externalRunId, copied EXACTLY>', generated_at: '<now, ISO-8601 with offset>' },
  sources: [{ type: 'job_site', ref: '<site or search name>', status: 'ok', count: 3, note: '<short note>' }],
  findings: ['<canonical finding objects>'],
};

/** The canonical result envelope, as the provider must build it (the first argument to jobquest_submit_ai_result is `result`). */
export function resultEnvelopeRules(): string[] {
  return [
    `RESULT ENVELOPE (the \`result\` argument of jobquest_submit_ai_result): ${JSON.stringify(ENVELOPE_EXAMPLE)}`,
    `contract is exactly "${AI_CONTRACT_NAME}" and schema_version is exactly "${AI_CONTRACT_VERSION}". provider is the claim's \`submit.provider\` (the product you are running as) and workflow is the claim's \`submit.workflow\`, both copied exactly. run.external_run_id is the claim's \`externalRunId\` (also \`submit.externalRunId\`) copied EXACTLY, character for character. run.generated_at is the current time as ISO-8601 with an explicit offset or Z.`,
    `sources: at most ${AI_LIMITS.sourcesPerRun} entries, one per source you tried, each with type (job_site | web | gmail | calendar ...), ref (a short name), status (${bar(AI_SOURCE_STATUSES)}), optional count (whole number) and a short note. findings: at most ${AI_LIMITS.findingsPerRun} canonical finding objects (see the step rules). Unknown extra fields are dropped; never put credentials or raw content in them.`,
  ];
}

/** The submit-once rule: a finished run is final. Shared by the pasted instructions and the claim guidance. */
export const SUBMIT_ONCE_RULE =
  'SUBMIT EXACTLY ONCE: build the COMPLETE result first (every step, every finding, every source), check it against the shapes above, then call jobquest_submit_ai_result exactly ONCE. Read the returned result (status, counts, validationErrors). A finished run (SUCCEEDED, PARTIAL or FAILED) is FINAL: submitting again for the same run does NOT repair it, so never resubmit a corrected result for a rejected or PARTIAL run. Tell the owner which items were rejected and stop; a corrected retry needs a NEW manual run (fresh instructions with a new key) started by the owner in JobQuest.';

/** Claim guidance for a CLAIMED occurrence (what `guidance` says). */
export const CLAIMED_GUIDANCE =
  `Run the steps in order with your own tools. Build ONE \`${AI_CONTRACT_NAME}\` ${AI_CONTRACT_VERSION} result: provider = submit.provider, workflow = submit.workflow, run.external_run_id = submit.externalRunId copied EXACTLY, run.generated_at = now (ISO-8601 with offset), sources, and findings (each finding needs its \`kind\`; follow the step rules). ${resultEnvelopeRules().join(' ')} ${SUBMIT_ONCE_RULE} If you cannot finish, call jobquest_report_ai_execution_failure instead.`;
