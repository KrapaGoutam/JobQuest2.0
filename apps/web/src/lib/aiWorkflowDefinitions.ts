// Durable JobQuest workflow definitions (AI-5). These are DESCRIPTIONS of intelligence
// workflows, not schedulers: JobQuest does not run any of them. Scheduling is owned by the
// external provider (e.g. a Claude scheduled task) which submits results through the one
// provider-neutral path, jobquest_submit_ai_result. A status of "Running" therefore never
// exists here; it would require a JobQuest-owned scheduler, which does not exist.
//
// Browser-safe; tests/unit/ai-5-digest-ui.test.ts keeps ids, scopes and template paths honest.

export type AiWorkflowAvailability = 'AVAILABLE' | 'PROVIDER_SETUP_REQUIRED' | 'SOURCE_NOT_IMPLEMENTED' | 'DISABLED';
/** `template_unverified`: a copyable prompt template exists, but nobody has proven this provider can run it (AI-9). It is never execution availability. */
export type ProviderCompatibility = 'template_ready' | 'template_unverified' | 'pending_validation' | 'not_planned';

export interface AiWorkflowDefinition {
  /** Canonical workflow id (the `workflow` value of a jobquest.ai-result). */
  id: 'daily_brief' | 'job_discovery' | 'email_triage' | 'recruiter_intel' | 'calendar_review';
  name: string;
  purpose: string;
  /** Where the information comes from. */
  expectedSource: string;
  /** What a conforming jobquest.ai-result must contain. */
  output: string;
  /** Recommendation only; the operator chooses the real schedule in the provider. */
  recommendedCadence: string;
  requiredScopes: readonly string[];
  /** true when JobQuest itself has operational data/UI for this workflow today. */
  sourceOperational: boolean;
  status: AiWorkflowAvailability;
  providers: { claude: ProviderCompatibility; chatgpt: ProviderCompatibility; gemini: ProviderCompatibility };
  /** Repository path of the copyable provider task template. */
  claudeTemplate: string;
  /** AI-9: the same schema for the other providers; the schema never forks by provider. */
  geminiTemplate: string;
  chatgptTemplate: string;
}

// AI-9: Gemini and ChatGPT have prompt templates (same schema) but neither is proven to run them: scheduled research on
// Gemini and the whole ChatGPT plugin path are decided by operator provider gates and recorded in PROVIDER_CAPABILITY_MATRIX.md.
const UNVERIFIED = { chatgpt: 'template_unverified', gemini: 'template_unverified' } as const;
const templatesOf = (file: string) => ({
  claudeTemplate: `ai-hub/provider-workflows/claude/${file}`,
  geminiTemplate: `ai-hub/provider-workflows/gemini/${file}`,
  chatgptTemplate: `ai-hub/provider-workflows/chatgpt/${file}`,
});

export const AI_WORKFLOW_DEFINITIONS: readonly AiWorkflowDefinition[] = [
  {
    id: 'daily_brief',
    name: 'Daily Digest',
    purpose: 'A concise, prioritized snapshot of the day: applications, follow-ups, and anything the provider can add.',
    expectedSource: 'JobQuest applications, AI findings and suggestions, plus connectors the provider already has.',
    output: 'One finding of kind "daily_brief" with the versioned digest payload (1.0) per date and provider.',
    recommendedCadence: 'Every weekday morning (you choose the time in the provider)',
    requiredScopes: ['jobquest:read', 'ai:read', 'ai:ingest'],
    sourceOperational: true,
    status: 'AVAILABLE',
    providers: { claude: 'template_ready', ...UNVERIFIED },
    ...templatesOf('DAILY_DIGEST.md'),
  },
  {
    id: 'job_discovery',
    name: 'Job Discovery',
    purpose: 'Find roles matching a search profile and record them as job-lead findings (never as applications).',
    expectedSource: 'Public job sites and job-search connectors available to the provider.',
    output: 'Findings of kind "job_lead" with URL, company, title, location and match reasoning.',
    recommendedCadence: 'Daily',
    requiredScopes: ['jobquest:read', 'ai:read', 'ai:ingest'],
    sourceOperational: true,
    status: 'AVAILABLE',
    providers: { claude: 'template_ready', ...UNVERIFIED },
    ...templatesOf('JOB_DISCOVERY.md'),
  },
  {
    id: 'email_triage',
    name: 'Email Triage',
    purpose: 'Classify job-search email (replies, interviews, assessments, rejections) without storing message bodies.',
    expectedSource: 'A mailbox connector the provider already has (JobQuest never reads your mailbox).',
    output: 'Findings of kind "email_event" with source message id, category, short evidence and confidence.',
    recommendedCadence: 'Every few hours on weekdays',
    requiredScopes: ['jobquest:read', 'ai:read', 'ai:ingest'],
    sourceOperational: true,
    status: 'AVAILABLE',
    providers: { claude: 'template_ready', ...UNVERIFIED },
    ...templatesOf('EMAIL_TRIAGE.md'),
  },
  {
    id: 'recruiter_intel',
    name: 'Recruiter Intelligence',
    purpose: 'Record publicly available hiring-team and recruiter context for roles you are pursuing.',
    expectedSource: 'Public web sources and company pages.',
    output: 'Findings of kind "recruiter_intel" with source URL and confidence; uncertain facts marked uncertain.',
    recommendedCadence: 'On demand or weekly',
    requiredScopes: ['jobquest:read', 'ai:read', 'ai:ingest'],
    sourceOperational: true,
    status: 'AVAILABLE',
    providers: { claude: 'template_ready', ...UNVERIFIED },
    ...templatesOf('RECRUITER_INTEL.md'),
  },
  {
    id: 'calendar_review',
    name: 'Calendar Intelligence',
    purpose: 'Record job-search interviews, recruiter calls, assessment and application deadlines, follow-ups, reschedules and cancellations found on your calendar. JobQuest stores intelligence only and never changes the calendar.',
    expectedSource: 'A calendar connector the provider already has (JobQuest never connects to your calendar).',
    output: 'Findings of kind "calendar_event" with category, status, normalized times and time zone, and the calendar event id (no descriptions, invite text or attendee lists).',
    recommendedCadence: 'Every weekday morning, optionally again in the afternoon (you choose the times in the provider)',
    requiredScopes: ['jobquest:read', 'ai:read', 'ai:ingest'],
    sourceOperational: true,
    status: 'AVAILABLE',
    providers: { claude: 'template_ready', ...UNVERIFIED },
    ...templatesOf('CALENDAR_INTEL.md'),
  },
];

export const AI_WORKFLOW_STATUS_LABELS: Record<AiWorkflowAvailability, string> = {
  AVAILABLE: 'Available',
  PROVIDER_SETUP_REQUIRED: 'Provider setup required',
  SOURCE_NOT_IMPLEMENTED: 'Source integration not implemented',
  DISABLED: 'Disabled',
};

export const PROVIDER_COMPATIBILITY_LABELS: Record<ProviderCompatibility, string> = {
  template_ready: 'Template ready', template_unverified: 'Template ready, provider unverified', pending_validation: 'Pending validation', not_planned: 'Not planned',
};

/** Disabled wins; otherwise a workflow that needs a provider connector says so until one exists. */
export function workflowAvailability(def: AiWorkflowDefinition, ctx: { disabled?: boolean; claudeConnected?: boolean } = {}): AiWorkflowAvailability {
  if (ctx.disabled) return 'DISABLED';
  if (!def.sourceOperational) return 'SOURCE_NOT_IMPLEMENTED';
  return ctx.claudeConnected === false ? 'PROVIDER_SETUP_REQUIRED' : def.status;
}
