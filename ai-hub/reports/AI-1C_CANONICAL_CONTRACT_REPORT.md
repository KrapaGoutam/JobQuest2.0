# AI-1C — Canonical Contract / Validation / Dedupe Report

Branch `feature/ai-1-foundation` (cumulative; local commit, not pushed, no CI). **DB changes: NONE.** No hosted access.

## Location & files
`apps/api/src/lib/aiContract/` — `constants.ts` (name/version/enums/limits), `types.ts` (type-only, browser-safe), `validate.ts`, `dedupe.ts`, `canonical.ts`, `index.ts`.
Tests: `tests/unit/ai-contract.test.ts`; fixtures: `tests/unit/fixtures/ai-contract/fixtures.ts`.
Validation, hashing and dedupe are server-side (`apps/api`); only `types.ts` is suitable for sharing.

## Contract & version policy
`jobquest.ai-result` `1.0` (DATA_MODEL_PLAN §4 shape; optional `contract` field must equal the name if present). Constants centralized (`AI_CONTRACT_*`). Accepts major 1; a newer minor is accepted additively (unknown fields dropped), warns `version_minor_ahead`, and `schema_version` is normalized to `1.0`. Other majors / malformed versions rejected. Adding a previous major later = extend `AI_SUPPORTED_MAJORS` + an upgrader.

## Validation approach / dependency
Hand-written validator, **no new dependency**. zod 4 exists in `apps/api`, but its strip mode cannot count unknown fields, which the contract requires. Returns `{success, data, errors, warnings, unknownFieldCount, rejectedItemCount}`; never throws. Envelope errors → `success:false`; bad findings/suggestions are dropped individually (the service should finalize the run PARTIAL when `rejectedItemCount>0`).

## Enum sync
Constants mirror the AI-1A CHECK constraints; a unit test parses the migration SQL and fails on drift (provider, workflow, status, trigger, error category, kind, finding status, priority, suggestion action/status). Source types (`jobquest, gmail, calendar, web, job_site, recruiter_message, drive, provider, other`) have no DB constraint (stored in jsonb).

## Behavior
- **Unknown fields:** dropped and counted at every level (top, run, source, finding, dedupe, match, hints, suggestion, target, typed payload). Typed payloads (daily_brief, email_event, job_lead, recruiter_intel, calendar_event) are field-allowlisted; `note`/`other` and `metadata` are bounded free-form records (depth 4, strings ≤1000, size caps 16/4 KiB; `seen_by` reserved).
- **Evidence:** NFC, control chars stripped, trimmed, **truncated** to 500 code points with a `truncated` warning. No raw body fields are retained.
- **URLs:** http(s) only, no credentials, ≤2048; javascript/data/file/chrome/extension rejected. No reusable repo URL-safety helper existed (only ad hoc checks).
- **Timestamps:** ISO-8601 with explicit offset required; normalized to UTC `toISOString`; years 2000–2100.
- **Confidence:** 0..1 only, rounded to 3 decimals (matches numeric(4,3)); 0–100 rejected.
- **Scope:** `user_id/workspace_id/actor_id/application_id/...` anywhere are dropped, counted and warned (`untrusted_scope_field`). `match.application_id` is never trusted; only `match.hints`. Suggestion `target.id` is passed on as an untrusted reference (`rpc_ai_create_suggestion` verifies ownership). Suggestions have no status; `ACCEPTED` cannot be expressed.
- **Priority:** value checked only (default NORMAL); no inference.

## Dedupe (DATA_MODEL_PLAN §5; provider is never an input)
- email/calendar: `ev:` + sha256(`source_type|source_id|event`) (type/event lowercased, id trimmed, case kept).
- job_lead: `url:`+canonical URL (lowercase scheme/host; no fragment/credentials/tracking params `utm_*, gclid, fbclid, msclkid, mc_*, _hs*, igshid, trk, trackingId`; sorted query; trailing slash trimmed; path case preserved; `urlsha:` fallback if >255), else `job:`+sha256(source_type|external_job_id), else `jobct:`+sha256(company|title) normalized.
- daily_brief: `daily_brief:YYYY-MM-DD`. recruiter_intel: `recruiter:`+sha256(name|company|channel) normalized. note/other: `<kind>:`+sha256(title|summary).
- All match `[[:graph:]]{1,255}`. Same-run duplicate identity keeps the first. Cross-provider (Claude vs Gemini, different wording/confidence) → identical key (tested).
- Adapter note: Gmail `source_id` must be the stable Gmail API message id for cross-provider convergence.

## Content-hash boundary
SQL (`rpc_ai_ingest_finding`) owns the authoritative `content_hash`; callers cannot supply it. TS exposes only `contentFingerprint` (sha256 of `canonicalJson`) as a diagnostic that differs from the SQL hash by design; never compare or store it. Meaningful change → same key, different fingerprint (tested).

## Tests
`npx vitest run --project unit tests/unit/ai-contract.test.ts`: **54/54 pass**. `tsc --noEmit -p tsconfig.json` clean; eslint clean on new files.
Golden fixtures: valid ×8 (daily brief, rejection, interview, assessment, job lead, recruiter, calendar, suggestion), cross-provider pair, meaningful-change pair, unknown fields, invalid ×6 (major, malformed version, oversized evidence, unsafe URL, bad timestamp, bad confidence), untrusted scope.

## Deferred
- Closed-finding supersession — DEFERRED, ingestion/service phase.
- Audit-view entity filter — AI-1E or AI-2.
- Workflow config mutation — AI-1F.
- Service layer / routes calling the RPCs — AI-2/AI-3.
- Previous-major upgrader — when a 2.x exists.

## Next
AI-1D — AI Hub shell / navigation / read-only UI.
