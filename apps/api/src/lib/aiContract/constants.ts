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

// ---- External intelligence sources (AI-6) -----------------------------------
// Job leads, email events and recruiter intel stay `ai_findings` (the system-of-record
// parent). Only job leads get a child table (`ai_job_leads`, migration 20261027100000)
// because they need real filtering/uniqueness. Payload shapes are versioned here and
// stay inside jobquest.ai-result 1.0 (additive); mirrored by apps/web/src/lib/aiSources.ts
// (tests/unit/ai-6-sources-ui.test.ts fails on drift).
export const SOURCE_PAYLOAD_VERSION = '1.0' as const;

/** Email classification. A closed set: free-form categories are rejected for email_event. */
export const EMAIL_CATEGORIES = [
  'recruiter_reply', 'interview_invitation', 'assessment', 'rejection', 'application_confirmation',
  'follow_up', 'scheduling', 'reschedule', 'deadline', 'other_job_search',
] as const;
/** Categories that normally need the user to act (used with priority HIGH/CRITICAL and the provider hint). */
export const EMAIL_ATTENTION_CATEGORIES = [
  'recruiter_reply', 'interview_invitation', 'assessment', 'scheduling', 'reschedule', 'deadline', 'follow_up',
] as const;

export const JOB_WORK_ARRANGEMENTS = ['remote', 'hybrid', 'onsite'] as const;
export const JOB_EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'temporary', 'internship', 'freelance', 'other'] as const;
export const JOB_SALARY_PERIODS = ['year', 'month', 'week', 'day', 'hour'] as const;
/** Stored job description cap (characters of normalized plain text). Longer text is truncated and flagged. */
export const JOB_DESCRIPTION_MAX_CHARS = 30000;
/** A "strong match" is a provider match score of at least this value (0..100). No score => never strong. */
export const STRONG_MATCH_THRESHOLD = 80;

export const RECRUITER_RELATIONSHIPS = ['recruiter', 'talent_acquisition', 'hiring_manager', 'sourcer', 'other'] as const;
export const RECRUITER_VERIFICATIONS = ['verified', 'uncertain'] as const;
export const RECRUITER_UNCERTAIN_FIELDS = ['name', 'role', 'company', 'relationship', 'contact'] as const;

export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];
export type JobWorkArrangement = (typeof JOB_WORK_ARRANGEMENTS)[number];
export type JobEmploymentType = (typeof JOB_EMPLOYMENT_TYPES)[number];

// ---- Daily Digest (AI-5) ----------------------------------------------------
// A digest is an `ai_findings` row (kind/workflow `daily_brief`, AI-0 decision; the
// product name is "Daily Digest"). One row per owner + digest_date + provider. The
// payload below is versioned independently of the jobquest.ai-result envelope.
export const DIGEST_PAYLOAD_VERSION = '1.0' as const;
export const DIGEST_SECTION_KEYS = ['applications', 'job_leads', 'email_activity', 'recruiter_intel', 'calendar', 'upcoming', 'follow_ups', 'ai_suggestions'] as const;
/** available = the source reported data; zero = source operational, nothing found; not_configured = no source yet. */
export const DIGEST_SECTION_STATUSES = ['available', 'zero', 'not_configured'] as const;
export const DIGEST_SUMMARY_KEYS = [
  'applications_added', 'active_applications', 'new_job_leads', 'strong_matches', 'recruiter_replies',
  'interviews', 'assessments', 'follow_ups', 'pending_suggestions', 'new_findings', 'calendar_today', 'calendar_deadlines',
] as const;
export const DIGEST_LIMITS = { priorities: 8, itemsPerSection: 5, itemTitle: 160, itemDetail: 240, count: 100000 } as const;

export type DigestSectionKey = (typeof DIGEST_SECTION_KEYS)[number];
export type DigestSectionStatus = (typeof DIGEST_SECTION_STATUSES)[number];
export type DigestSummaryKey = (typeof DIGEST_SUMMARY_KEYS)[number];

export type AiProvider =(typeof AI_PROVIDERS)[number];
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

// ---- Calendar intelligence (AI-7) -------------------------------------------------
// Canonical workflow `calendar_review` (AI-1A CHECK; do NOT add a second `calendar_intel` id) and
// finding kind `calendar_event`. Calendar events are `ai_findings` (parent, audited once) with a 1:1
// child `ai_calendar_events` (migration 20261028100000) for chronological/range queries. The payload
// shape is versioned here and stays inside jobquest.ai-result 1.0 (additive); mirrored by
// apps/web/src/lib/aiCalendar.ts (tests/unit/ai-7-calendar-ui.test.ts fails on drift).

/** Closed set of job-search calendar event categories. Free-form categories are rejected. */
export const CALENDAR_CATEGORIES = [
  'interview', 'recruiter_call', 'hiring_manager_call', 'networking_call',
  'assessment_deadline', 'application_deadline', 'take_home_deadline', 'follow_up', 'other',
] as const;
/** Categories that describe a DUE time rather than a scheduled meeting. */
export const CALENDAR_DEADLINE_CATEGORIES = ['assessment_deadline', 'application_deadline', 'take_home_deadline', 'follow_up'] as const;
/** Lifecycle of the calendar item. reschedule / cancellation are states of an event, not separate events. */
export const CALENDAR_STATUSES = ['scheduled', 'tentative', 'rescheduled', 'cancelled'] as const;
/** A provider may name a lifecycle change as the category; it is normalised to category `other` + this status. */
export const CALENDAR_CATEGORY_ALIASES: Record<string, (typeof CALENDAR_STATUSES)[number]> = {
  reschedule: 'rescheduled', rescheduled: 'rescheduled', cancellation: 'cancelled', cancelled: 'cancelled', canceled: 'cancelled',
};
/** Attendee lists, invite bodies and raw provider events are never stored. */
export const CALENDAR_RAW_KEYS = [
  'attendees', 'attendee_list', 'guests', 'description', 'body', 'invite_html', 'html', 'raw', 'raw_event', 'raw_payload', 'ics', 'conference_data',
] as const;
export const CALENDAR_LIMITS = { sourceName: 64, location: 300, organizerName: 200, attendeeCount: 1000 } as const;
export const CALENDAR_PAYLOAD_VERSION = '1.0' as const;

export type CalendarCategory = (typeof CALENDAR_CATEGORIES)[number];
export type CalendarStatus = (typeof CALENDAR_STATUSES)[number];
