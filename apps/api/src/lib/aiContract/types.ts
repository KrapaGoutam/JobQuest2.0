// Provider-neutral normalized types for jobquest.ai-result. Type-only (no runtime
// imports beyond constants), so it is safe to share with other packages.
import type {
  AiFindingKind, AiPriority, AiProvider, AiSourceStatus, AiSourceType, AiSuggestionAction,
  AiSuggestionTargetType, AiTriggerType, AiWorkflow, AI_CONTRACT_NAME,
} from './constants';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [k: string]: JsonValue };
export type JsonRecord = { [k: string]: JsonValue };

/** status/count/note are AI-11D discovery source health; absent on legacy refs. */
export interface AiSourceRef { type: AiSourceType; ref: string; observed_at: string | null; status?: AiSourceStatus; count?: number; note?: string }

/** Untrusted hints for server-side application matching (DATA_MODEL_PLAN §4). */
export interface AiMatchHints {
  company: string | null;
  title: string | null;
  job_url: string | null;
  external_job_id: string | null;
}

/**
 * Normalized job-lead child row (ai_job_leads) derived from a job_lead finding. The
 * plain-text description is kept OUT of finding.payload (16 KiB cap) and is written by
 * rpc_ai_upsert_job_lead after the parent finding is ingested.
 */
export interface AiJobLeadProjection {
  company: string;
  title: string;
  location: string | null;
  work_arrangement: string | null;
  employment_type: string | null;
  source_name: string | null;
  source_url: string | null;
  canonical_url: string | null;
  external_job_id: string | null;
  /** YYYY-MM-DD, only when the source states it. */
  posted_date: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  experience_level: string | null;
  /** Provider analysis, integer 0..100. */
  match_score: number | null;
  description: string | null;
  description_truncated: boolean;
  /** Characters of normalized text before truncation. */
  description_length: number | null;
  required_skills: string[];
  preferred_skills: string[];
  payload_version: string;
  // ---- AI-11D (all optional facts; absent = not stated, never guessed) ----
  /** Exact posting instant (UTC ISO) when the source states one. Null = unknown; never "now". */
  posted_at: string | null;
  /** Geography a remote role admits; null = not stated. */
  remote_scope: string | null;
  remote_note: string | null;
  experience_min_years: number | null;
  experience_max_years: number | null;
  fit_reasons: string[];
  gap_reasons: string[];
  /** Conservative cross-source identity (company + normalized title + location/arrangement), or null. */
  logical_key: string | null;
}

/**
 * Normalized calendar child row (ai_calendar_events) derived from a calendar_event finding. All instants are
 * UTC ISO strings; `time_zone` is the SOURCE zone (kept so the item can be explained in its own zone).
 * All-day items carry dates (`start_date`/`end_date`, inclusive) instead of instants.
 */
export interface AiCalendarProjection {
  category: string;
  /** Derived from the category (never provider-supplied): the item is a due time, not a meeting. */
  is_deadline: boolean;
  status: string;
  all_day: boolean;
  start_at: string | null;
  end_at: string | null;
  start_date: string | null;
  end_date: string | null;
  deadline_at: string | null;
  /** Chronological anchor: deadline, else start, else local midnight of start_date. */
  sort_at: string;
  time_zone: string | null;
  calendar_source: string | null;
  source_event_id: string | null;
  previous_source_event_id: string | null;
  source_event_url: string | null;
  company: string | null;
  job_title: string | null;
  location: string | null;
  meeting_url: string | null;
  organizer_name: string | null;
  organizer_domain: string | null;
  /** Provider-stated previous start (reschedule/cancellation); the server also derives it when a stored time moves. */
  original_start_at: string | null;
  cancelled_at: string | null;
  /** company + category + title + start minute; cross-provider convergence key (null when not computable). */
  logical_key: string | null;
  /** Logical key of the PREVIOUS start, so a reschedule without an event id still resolves to the same finding. */
  previous_logical_key: string | null;
  payload_version: string;
}

/**
 * AI-11E: server-derived facts about a recruiter_intel finding that the ingestion policy needs but that are not provider
 * input and are not all persisted. Nothing here carries a provider-supplied database id.
 */
export interface AiRecruiterProjection {
  /** Candidate dedupe keys, strongest first (keys[0] is also the finding's dedupe_key). */
  candidate_keys: string[];
  profile_key: string | null;
  person_key: string | null;
  /** Normalized company (legal suffixes removed): the unit for "one person per company". */
  company_key: string;
  /** The provider's claim; only honoured when the company is on the owner's target list. */
  mode_hint: 'job_linked' | 'target_company' | null;
  has_related_job: boolean;
  /** The posting itself names this person. */
  posting_contact: boolean;
  relationship: string | null;
  role_title: string | null;
  verification: 'verified' | 'uncertain';
  verification_basis: string | null;
}

export interface AiFinding {
  kind: AiFindingKind;
  /** Computed by JobQuest from deterministic fields; never taken from the provider. */
  dedupe_key: string;
  category: string | null;
  priority: AiPriority;
  confidence: number | null; // 0..1, 3 decimals
  title: string;
  summary: string | null;
  occurred_at: string | null;
  due_at: string | null;
  source_ref: JsonRecord;
  match_hints: AiMatchHints;
  evidence: string | null; // <= 500 chars
  payload: JsonRecord;
  /** Present only for kind job_lead. */
  job_lead?: AiJobLeadProjection;
  /** Present only for kind calendar_event. */
  calendar?: AiCalendarProjection;
  /** Present only for kind recruiter_intel (AI-11E). */
  recruiter?: AiRecruiterProjection;
}

/** A PROPOSAL only. No status: nothing here is executable (AI-11). */
export interface AiSuggestion {
  finding_index: number;
  action: AiSuggestionAction;
  /** Untrusted reference; rpc_ai_create_suggestion verifies ownership. */
  target: { type: AiSuggestionTargetType; id: string } | null;
  proposed: JsonRecord;
  confidence: number | null;
}

export interface AiResult {
  contract: typeof AI_CONTRACT_NAME;
  schema_version: string;
  provider: AiProvider;
  workflow: AiWorkflow;
  run: { external_run_id: string | null; generated_at: string; model_hint: string | null };
  sources: AiSourceRef[];
  findings: AiFinding[];
  suggestions: AiSuggestion[];
  metadata: JsonRecord;
}

export interface AiIssue { path: string; code: string; message: string }

export interface AiValidationResult {
  /** false only for envelope-level failures; bad items are dropped and listed in errors. */
  success: boolean;
  data: AiResult | null;
  errors: AiIssue[];
  warnings: AiIssue[];
  unknownFieldCount: number;
  /** Count of findings/suggestions dropped (service should finalize the run PARTIAL). */
  rejectedItemCount: number;
}

/** Params for rpc_ai_ingest_run. User/workspace come from authenticated server context, not the provider. */
export interface AiIngestRunInput {
  provider: AiProvider;
  workflow: AiWorkflow;
  triggerType: AiTriggerType;
  externalRunId: string | null;
  schemaVersion: string;
  sources: AiSourceRef[];
}
