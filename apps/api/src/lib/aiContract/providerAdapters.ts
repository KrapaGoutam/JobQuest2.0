// AI-11G: provider scheduler adapters (pure; no I/O).
//
// JobQuest never calls a provider. The PROVIDER is the scheduled worker: its own scheduled task wakes up, calls the JobQuest
// MCP connector and CLAIMS one automation occurrence (jobquest_claim_ai_execution), does the work with its own tools, then
// submits ONE bounded `jobquest.ai-result` correlated with the claimed external_run_id (jobquest_submit_ai_result).
// This module holds the small, provider-neutral pieces that model that:
//   * the adapter manifest   - what each product can do, WITHOUT any account state (that is derived at runtime);
//   * scheduler readiness    - connected is not scheduled, and a scheduler existing is not "JobQuest reachable in a scheduled run";
//   * the canonical step guides - what a provider does for each step of the ordered plan (the claim carries them, so a
//     provider schedule needs no per-workflow prompt maintenance).
// No provider schedule is created by JobQuest and no private provider API is used: setup is a copyable instruction set.

import type { AutomationProvider, ExecutionStep } from './automation';

export const SCHEDULER_PROVIDERS = ['claude', 'chatgpt', 'gemini'] as const;
export type SchedulerProvider = (typeof SCHEDULER_PROVIDERS)[number];
export const isSchedulerProvider = (v: unknown): v is SchedulerProvider => typeof v === 'string' && (SCHEDULER_PROVIDERS as readonly string[]).includes(v);

/**
 * UNSUPPORTED     the automation has no provider ('manual')
 * NOT_CONNECTED   the provider has no usable JobQuest connection that may submit results (prerequisite missing)
 * SETUP_REQUIRED  connected, but no scheduled run has ever claimed an occurrence: the provider-side schedule is still to be created
 * UNVERIFIED      a scheduled run claimed an occurrence but no scheduled run has completed end to end (or the latest ended FAILED)
 * READY           the latest finished scheduled run (claimed through the pull executor) SUCCEEDED or was PARTIAL: proven by use
 * Derived from runtime evidence only; there is no flag anyone can set.
 */
export type SchedulerReadiness = 'UNSUPPORTED' | 'NOT_CONNECTED' | 'SETUP_REQUIRED' | 'UNVERIFIED' | 'READY';
export type ProviderConnectionState = 'connected' | 'not_connected';

export interface ProviderAdapterManifest {
  provider: SchedulerProvider;
  label: string;
  /** The product offers recurring/scheduled tasks to a consumer subscription. Never a statement about the user's plan. */
  scheduleAvailable: boolean;
  /**
   * Static baseline for "a scheduled run can use the JobQuest connector". UNVERIFIED for every provider: schedulers exist, but no
   * first-party evidence says a scheduled run can use a custom MCP connector. Runtime evidence (READY) is what upgrades it.
   */
  scheduledJobQuestAccess: 'UNVERIFIED';
  /** The product has a Gmail / web-search capability a user can connect or enable (availability depends on the account; JobQuest cannot see it). */
  gmailAvailable: boolean;
  webSearchAvailable: boolean;
  /** JobQuest accepts this provider's authenticated claim (always true for the three supported providers). */
  executionClaimSupported: boolean;
  /** Provider schedules are created by the user in the provider; JobQuest only generates the instructions. */
  setupMode: 'MANUAL';
  /** How this provider connects to JobQuest (informational). */
  connection: 'connector_token' | 'oauth';
  /** Evidence notes, dated. Product facts only; never user account state. */
  limitations: readonly string[];
  evidence: { checkedOn: string; basis: string };
}

const EVIDENCE_DATE = '2026-10-14';

export const PROVIDER_ADAPTERS: Readonly<Record<SchedulerProvider, ProviderAdapterManifest>> = {
  claude: {
    provider: 'claude', label: 'Claude', scheduleAvailable: true, scheduledJobQuestAccess: 'UNVERIFIED', gmailAvailable: true, webSearchAvailable: true,
    executionClaimSupported: true, setupMode: 'MANUAL', connection: 'connector_token',
    limitations: [
      'Claude offers scheduled tasks, but no first-party documentation confirms that a scheduled run can use a custom remote connector such as JobQuest.',
      'Public bug reports (April-June 2026) describe custom connectors not loading into scheduled or cloud runs until a person interacts; the current state is unverified.',
      'Create the JobQuest connector credential for Claude in Settings -> Providers (it must be bound to Claude and allow AI findings).',
    ],
    evidence: { checkedOn: EVIDENCE_DATE, basis: 'Existing operator evidence (AI-4 remote smoke; scheduled use never verified) and public issue reports; no first-party scheduled-connector documentation found.' },
  },
  chatgpt: {
    provider: 'chatgpt', label: 'ChatGPT', scheduleAvailable: true, scheduledJobQuestAccess: 'UNVERIFIED', gmailAvailable: true, webSearchAvailable: true,
    executionClaimSupported: true, setupMode: 'MANUAL', connection: 'oauth',
    limitations: [
      'ChatGPT Scheduled tasks exist, but whether a task can use a custom plugin/app (the JobQuest connection) depends on plan, plugin composition and task mode; it is not documented as supported.',
      'Write-capable custom MCP availability differs by plan; tasks may pause for approval before a write (do not defeat approval prompts).',
      'Reuse the existing JobQuest OAuth connection (Settings -> Providers -> ChatGPT); no OpenAI API key is involved.',
    ],
    evidence: { checkedOn: EVIDENCE_DATE, basis: 'OpenAI Help "Scheduled tasks in ChatGPT" (recorded 2026-10-12 in ai-hub/provider-workflows/CHATGPT_SCHEDULED_TASKS.md); no statement that plugins/custom MCP run inside tasks.' },
  },
  gemini: {
    provider: 'gemini', label: 'Gemini', scheduleAvailable: true, scheduledJobQuestAccess: 'UNVERIFIED', gmailAvailable: true, webSearchAvailable: true,
    executionClaimSupported: true, setupMode: 'MANUAL', connection: 'oauth',
    limitations: [
      'Gemini Scheduled Actions exist, but no documentation confirms that a scheduled action can call a custom app/MCP connector such as JobQuest.',
      'Gemini documents manual confirmation for custom-app write actions, so a scheduled save is expected to be approval-gated (a provider setting, not a JobQuest defect).',
      'Custom apps are available only to eligible personal accounts; reuse the existing JobQuest OAuth connection (Settings -> Providers -> Gemini); no Gemini API key is involved.',
    ],
    evidence: { checkedOn: EVIDENCE_DATE, basis: 'Gemini Apps Help "Connect & manage custom apps" and existing AI-9/AI-10 operator evidence (ai-hub/provider-workflows/GEMINI_SCHEDULED_ACTIONS.md); scheduled use never verified.' },
  },
};

/**
 * A claimed (RUNNING) occurrence whose provider never reported back is failed (TIMEOUT) by the NEXT claim that finds it older than
 * this; the retry contract (AI-11F: new linked run, at most 3) then applies. A bounded rule applied on a claim: there is no watchdog.
 * It must stay below the catch-up grace (3 h) so a recovered occurrence can still be retried inside its window.
 */
export const EXECUTION_STALE_AFTER_MS = 60 * 60 * 1000;

export const providerLabel = (p: AutomationProvider): string => (isSchedulerProvider(p) ? PROVIDER_ADAPTERS[p].label : 'Manual');

// ---- scheduler readiness (derived) -------------------------------------------------------------------------------------------

/** What the derivation needs from `ai_runs` (pull-executor runs of one provider: automation-linked, started by a claim, not Run Now). */
export interface SchedulerRunEvidence {
  /** Number of scheduled/retry runs of this provider that a claim started. */
  claimedRuns: number;
  /** Status of the most recent such run that has FINISHED (SUCCEEDED / PARTIAL / FAILED / CANCELLED), if any. */
  latestFinishedStatus: string | null;
  latestClaimAt: string | null;
  latestCompletedAt: string | null;
}

export interface ReadinessInput {
  provider: AutomationProvider;
  connection: ProviderConnectionState;
  /** The connection includes the AI-ingest scope (a claim without it could never submit a result). */
  canIngest: boolean;
  evidence: SchedulerRunEvidence;
}

export function deriveSchedulerReadiness(i: ReadinessInput): SchedulerReadiness {
  if (!isSchedulerProvider(i.provider)) return 'UNSUPPORTED';
  if (i.connection !== 'connected' || !i.canIngest) return 'NOT_CONNECTED';
  if (i.evidence.claimedRuns === 0) return 'SETUP_REQUIRED';
  return i.evidence.latestFinishedStatus === 'SUCCEEDED' || i.evidence.latestFinishedStatus === 'PARTIAL' ? 'READY' : 'UNVERIFIED';
}

export const EMPTY_EVIDENCE: SchedulerRunEvidence = { claimedRuns: 0, latestFinishedStatus: null, latestClaimAt: null, latestCompletedAt: null };

export interface ProviderSchedulerStatus {
  provider: SchedulerProvider;
  label: string;
  connection: ProviderConnectionState;
  canIngest: boolean;
  scheduler: SchedulerReadiness;
  /** Static capability baseline plus what the runs have shown. */
  scheduledJobQuestAccess: 'UNVERIFIED' | 'VERIFIED_BY_USE';
  scheduleAvailable: boolean;
  gmailAvailable: boolean;
  webSearchAvailable: boolean;
  executionClaimSupported: boolean;
  lastClaimAt: string | null;
  lastCompletedAt: string | null;
  limitations: readonly string[];
}

export function buildProviderStatus(provider: SchedulerProvider, connection: ProviderConnectionState, canIngest: boolean, evidence: SchedulerRunEvidence): ProviderSchedulerStatus {
  const m = PROVIDER_ADAPTERS[provider];
  const scheduler = deriveSchedulerReadiness({ provider, connection, canIngest, evidence });
  return {
    provider, label: m.label, connection, canIngest, scheduler,
    scheduledJobQuestAccess: scheduler === 'READY' ? 'VERIFIED_BY_USE' : 'UNVERIFIED',
    scheduleAvailable: m.scheduleAvailable, gmailAvailable: m.gmailAvailable, webSearchAvailable: m.webSearchAvailable, executionClaimSupported: m.executionClaimSupported,
    lastClaimAt: evidence.latestClaimAt, lastCompletedAt: evidence.latestCompletedAt, limitations: m.limitations,
  };
}

// ---- canonical step guides --------------------------------------------------------------------------------------------------

export interface StepGuide {
  step: ExecutionStep;
  title: string;
  /** Read-only JobQuest tools to call first (the profile / stored items are the source of truth, not the prompt). */
  readTools: readonly string[];
  /** The finding kind this step submits, or null when JobQuest produces the output itself. */
  findingKind: 'email_event' | 'job_lead' | 'recruiter_intel' | 'calendar_event' | null;
  /** Source types to report in `sources` with a status. */
  sourceTypes: readonly string[];
  rules: readonly string[];
}

const SOURCE_STATUS_RULE = 'Report every source you tried in `sources` with status ok | zero | blocked | unavailable | error | skipped. "unavailable" (tool missing or not connected) is NOT "zero": never report a source you could not read as having found nothing.';

export const STEP_GUIDES: Readonly<Record<ExecutionStep, StepGuide>> = {
  email_triage: {
    step: 'email_triage', title: 'Email triage', readTools: ['jobquest_list_email_intelligence', 'jobquest_list_applications'], findingKind: 'email_event', sourceTypes: ['gmail'],
    rules: [
      'Use only a mailbox connector you already have, READ-ONLY. Never send, reply, forward, archive, delete, label or mark mail, never open attachments, and never create or send a draft (you may only set draft_recommended).',
      'Split mail into job_related (recruiter_reply, application_confirmation, interview, interview_scheduling, assessment, follow_up, status_update, rejection, offer, other_job_search) and other (important_account, notification, newsletter, other). Skip marketing and bulk promotions.',
      'Give every item urgency HIGH (action needed today, deadline within ~24h, interview scheduling, direct recruiter question), MEDIUM (action soon) or LOW (FYI, confirmations, newsletters, rejections). Never invent a deadline.',
      'One finding per message id: dedupe {source_type:"gmail", source_id:<stable message id>}; occurred_at = when it was RECEIVED; evidence <= 500 chars; payload {version:"1.0", sender_name, sender_domain, subject (<=200), company, role_title, group, urgency, action_state, action_summary, deadline_at, draft_recommended, application_stage_hint}.',
      'Never submit bodies, HTML, attachments, full sender addresses, links, phone numbers, codes or account numbers.',
      'Call jobquest_list_email_intelligence first so you do not re-report stored messages.',
      SOURCE_STATUS_RULE,
    ],
  },
  job_discovery: {
    step: 'job_discovery', title: 'Fresh job discovery', readTools: ['jobquest_get_job_discovery_profile', 'jobquest_list_job_leads', 'jobquest_list_applications'], findingKind: 'job_lead', sourceTypes: ['job_site', 'web'],
    rules: [
      'Read jobquest_get_job_discovery_profile first: it is the only definition of what the owner wants. If configured is false, skip this step and record the source as skipped.',
      'Read stored leads and applications so you skip roles already stored or tracked. Search ONLY with tools you actually have (employer careers/ATS pages first, then job boards, then web search). JobQuest never searches or scrapes for you.',
      'Prefer recent postings: keep only postings whose real posted time is inside the profile freshness window; omit posted_at when it is not stated (never default it to now).',
      'Honor Remote-US semantics: remote_scope "us" only if the posting says the whole United States; "restricted"/"region" otherwise. Honor excluded title words, the experience limit and the software-QA gate (accept a "Quality Assurance" role only with software-testing evidence).',
      'Never apply, sign in, submit a form or message anyone. Never fabricate salary, posted time, company, title, years or skills; omit what the posting does not state. A job lead is never an application.',
      'Each lead: dedupe {job_url (canonical), external_job_id, source_name}; title, summary; payload {version:"1.0", company, role_title, location, work_arrangement, remote_scope, employment_type, source_name, job_url, posted_at, match_score (0-100), match_reasoning, fit_reasons, gap_reasons, description (plain text)}. At most the profile maximum, best matches first.',
      SOURCE_STATUS_RULE,
    ],
  },
  recruiter_intel: {
    step: 'recruiter_intel', title: 'Recruiter intelligence', readTools: ['jobquest_get_recruiter_discovery_profile', 'jobquest_list_recruiter_intel', 'jobquest_list_job_leads'], findingKind: 'recruiter_intel', sourceTypes: ['web'],
    rules: [
      'Read jobquest_get_recruiter_discovery_profile first (target companies, preferred roles, maximum new contacts, drafts on/off) and jobquest_list_recruiter_intel so you never research a stored person again. If configured is false, run job-linked mode only.',
      'Job-linked: for strong stored leads (jobquest_list_job_leads) find ONE useful person per company; a contact named in the posting wins. Target-company: only companies the owner listed, at most one new person per company, up to the maximum in total.',
      'Use PUBLIC sources only. Cite a public page for every person (source.url or payload.profile_url). verification "verified" requires a cited URL AND a verification_basis, otherwise "uncertain". Never infer that someone is a recruiter.',
      'Never guess a name, title, employer, email or profile URL. Never construct an email from a naming pattern; a work email only with contact_source_url. No phone numbers.',
      'Drafts (draft_note <= 300 chars, draft_email) only if the preferences ask for them: they are text for the owner to review and are NEVER sent. Never contact anyone.',
      'Each person: kind recruiter_intel; payload {version:"1.0", recruiter_name, role_title, company, relationship, verification, verification_basis, source_name, profile_url, posting_contact, discovery_mode, why (<=300 chars, evidence only), related_job {job_url}}.',
      SOURCE_STATUS_RULE,
    ],
  },
  calendar_review: {
    step: 'calendar_review', title: 'Calendar review', readTools: ['jobquest_list_calendar_intelligence', 'jobquest_list_applications'], findingKind: 'calendar_event', sourceTypes: ['calendar'],
    rules: [
      'Use only a calendar connector you already have, READ-ONLY. Never create, edit, move, accept, decline or delete an event. Never invent an event, time or time zone.',
      'Look at job-search events only (interviews, recruiter/hiring-manager calls, networking calls, assessment/application/take-home deadlines, follow-ups) from yesterday through the next 14 days, including cancelled ones. Skip everything personal.',
      'Report the CURRENT state of each kept event: category (interview, recruiter_call, hiring_manager_call, networking_call, assessment_deadline, application_deadline, take_home_deadline, follow_up, other) and status (scheduled, tentative, rescheduled, cancelled). A cancelled event is submitted with status "cancelled", never omitted.',
      'dedupe {source_type:"calendar", source_name, source_id:<stable event id>}; payload {version:"1.0", status, start_at (ISO-8601 with offset) or start_local + time_zone, end_at, time_zone, company, job_title, location, meeting_url}. Never copy descriptions, invite text or attendee lists.',
      SOURCE_STATUS_RULE,
    ],
  },
  followups: {
    step: 'followups', title: 'Follow-ups', readTools: [], findingKind: null, sourceTypes: [],
    rules: ['Nothing to collect: JobQuest derives follow-ups from its own stored records when it composes the digest. Do not invent follow-ups.'],
  },
  goal_summary: {
    step: 'goal_summary', title: 'Goal summary', readTools: [], findingKind: null, sourceTypes: [],
    rules: ['Nothing to collect: JobQuest derives the goal summary from its own stored records. Do not invent goals or progress.'],
  },
  daily_brief: {
    step: 'daily_brief', title: 'Daily Digest', readTools: [], findingKind: null, sourceTypes: [],
    rules: [
      'This step is LAST and is performed by JobQuest, not by you. After your result is stored, JobQuest composes the canonical Daily Digest from the intelligence stored by the earlier steps.',
      'Do NOT submit a daily_brief finding and do not write a digest of your own.',
    ],
  },
  other: {
    step: 'other', title: 'Custom review', readTools: [], findingKind: null, sourceTypes: [],
    rules: ['This automation defines no sections. There is no provider work to do: submit an empty result (no findings).'],
  },
  // Single-purpose workflows reuse the section guides above (every workflow name is also a step name).
};

export interface ClaimStep {
  order: number;
  step: ExecutionStep;
  title: string;
  readTools: readonly string[];
  findingKind: StepGuide['findingKind'];
  sourceTypes: readonly string[];
  rules: readonly string[];
}

/** The ordered plan with the canonical guide for each step (what the claim returns). Unknown steps degrade to a no-op guide. */
export function claimSteps(plan: readonly ExecutionStep[]): ClaimStep[] {
  return plan.map((step, i) => {
    const g = STEP_GUIDES[step] ?? STEP_GUIDES.other;
    return { order: i + 1, step, title: g.title, readTools: g.readTools, findingKind: g.findingKind, sourceTypes: g.sourceTypes, rules: g.rules };
  });
}

/** True when JobQuest (not the provider) must still compose the Daily Digest after the result is stored. */
export const planComposesDigest = (plan: readonly ExecutionStep[]): boolean => plan.includes('daily_brief');
