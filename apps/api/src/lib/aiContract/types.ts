// Provider-neutral normalized types for jobquest.ai-result. Type-only (no runtime
// imports beyond constants), so it is safe to share with other packages.
import type {
  AiFindingKind, AiPriority, AiProvider, AiSourceType, AiSuggestionAction,
  AiSuggestionTargetType, AiTriggerType, AiWorkflow, AI_CONTRACT_NAME,
} from './constants';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [k: string]: JsonValue };
export type JsonRecord = { [k: string]: JsonValue };

export interface AiSourceRef { type: AiSourceType; ref: string; observed_at: string | null }

/** Untrusted hints for server-side application matching (DATA_MODEL_PLAN §4). */
export interface AiMatchHints {
  company: string | null;
  title: string | null;
  job_url: string | null;
  external_job_id: string | null;
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
