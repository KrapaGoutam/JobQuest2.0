// Single source of truth for the jobquest.ai-result contract constants.
// Enum values mirror the CHECK constraints in
// supabase/migrations/20261023100000_ai_hub_database_foundation.sql (AI-1A).
// The synchronisation test (tests/unit/ai-contract.test.ts) fails if they drift.

export const AI_CONTRACT_NAME = 'jobquest.ai-result' as const;

export const AI_CONTRACT_MAJOR = 1;
export const AI_CONTRACT_MINOR = 0;
export const AI_CONTRACT_VERSION = `${AI_CONTRACT_MAJOR}.${AI_CONTRACT_MINOR}` as const;
/** Majors the server accepts (current only; a previous major is added with its upgrader). */
export const AI_SUPPORTED_MAJORS: readonly number[] = [AI_CONTRACT_MAJOR];
/** Highest minor of the current major this build understands (minors are additive). */
export const AI_MAX_SUPPORTED_MINOR = AI_CONTRACT_MINOR;

export const AI_PROVIDERS = ['claude', 'gemini', 'chatgpt', 'manual', 'system'] as const;
export const AI_WORKFLOWS = ['daily_brief', 'email_triage', 'job_discovery', 'recruiter_intel', 'calendar_review', 'other'] as const;
export const AI_RUN_STATUSES = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'AWAITING_APPROVAL', 'CANCELLED'] as const;
export const AI_TRIGGER_TYPES = ['scheduled', 'manual', 'retry'] as const;
export const AI_ERROR_CATEGORIES = [
  'PROVIDER_UNAVAILABLE', 'CONNECTOR_AUTH_EXPIRED', 'SOURCE_UNAVAILABLE', 'PARTIAL_READ',
  'SCHEMA_INVALID', 'TIMEOUT', 'RATE_LIMITED', 'INTERNAL',
] as const;
export const AI_FINDING_KINDS = ['daily_brief', 'email_event', 'job_lead', 'recruiter_intel', 'calendar_event', 'note', 'other'] as const;
export const AI_FINDING_STATUSES = ['NEW', 'REVIEWED', 'DISMISSED', 'ACCEPTED', 'SUPERSEDED', 'EXPIRED'] as const;
export const AI_PRIORITIES = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW', 'INFO'] as const;
export const AI_SUGGESTION_ACTIONS = ['set_status', 'create_task', 'create_followup', 'link_contact', 'create_application', 'schedule_interview', 'other'] as const;
export const AI_SUGGESTION_STATUSES = ['PENDING', 'ACCEPTED', 'IGNORED', 'EXPIRED', 'SUPERSEDED'] as const;
/** Suggestion targets the AI-1B RPC can validate. */
export const AI_SUGGESTION_TARGET_TYPES = ['application', 'task', 'contact'] as const;
/** Provider-neutral source classes (run.sources[].type). Stored as references only. */
export const AI_SOURCE_TYPES = ['jobquest', 'gmail', 'calendar', 'web', 'job_site', 'recruiter_message', 'drive', 'provider', 'other'] as const;

/** Events used in the email/calendar dedupe tuple. Free-form AI text is never an identity. */
export const AI_EVENT_PATTERN = /^[a-z][a-z0-9_]{0,47}$/;

export const AI_LIMITS = {
  title: 300,
  summary: 1000,
  evidence: 500, // DATA_MODEL_PLAN §7
  category: 48,
  externalRunId: 255,
  id: 255,
  modelHint: 64,
  url: 2048,
  sourcesPerRun: 50,
  findingsPerRun: 200,
  suggestionsPerRun: 200,
  payloadBytes: 16384, // matches rpc_ai_ingest_finding
  sourceRefBytes: 2048,
  proposedBytes: 4096,
  metadataBytes: 4096,
  dedupeKey: 255,
} as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];
export type AiWorkflow = (typeof AI_WORKFLOWS)[number];
export type AiRunStatus = (typeof AI_RUN_STATUSES)[number];
export type AiTriggerType = (typeof AI_TRIGGER_TYPES)[number];
export type AiErrorCategory = (typeof AI_ERROR_CATEGORIES)[number];
export type AiFindingKind = (typeof AI_FINDING_KINDS)[number];
export type AiFindingStatus = (typeof AI_FINDING_STATUSES)[number];
export type AiPriority = (typeof AI_PRIORITIES)[number];
export type AiSuggestionAction = (typeof AI_SUGGESTION_ACTIONS)[number];
export type AiSuggestionStatus = (typeof AI_SUGGESTION_STATUSES)[number];
export type AiSuggestionTargetType = (typeof AI_SUGGESTION_TARGET_TYPES)[number];
export type AiSourceType = (typeof AI_SOURCE_TYPES)[number];
