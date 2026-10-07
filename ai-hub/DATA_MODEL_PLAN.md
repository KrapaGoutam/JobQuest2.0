# AI Hub — Data Model Plan (conceptual; no DDL created in AI-0)

## 1. Option comparison

| Criterion | A. one `ai_findings` + JSON | B. many specialized tables | **C. generic parent + children only where needed** |
|---|---|---|---|
| RLS | one policy set | N policy sets | one set + few children |
| Queryability | poor on payload fields | best | promoted columns cover filters; children for rich queries |
| Schema evolution | easy | migration per change | payload versioned; children rare |
| Auditability / reporting | uniform | fragmented | uniform parent |
| Provider neutrality | good | good | good |
| Table count | 1 | ~8 | 4 at AI-1, +≤2 later |

**Recommendation: Option C.** Parent `ai_findings` holds every filter/sort field as a real column (kind, category, priority, status, confidence, application_id, due_at, dedupe_key); the rest lives in a versioned `payload jsonb`. Add a child table only when a feature needs unique constraints or joins the parent cannot give (candidate: `ai_job_leads` for canonical-URL uniqueness and ranking, decided in AI-8; calendar events likely stay findings).

## 2. Tables for AI-1 (4)

All: `id uuid pk`, `workspace_id` (FK workspaces, cascade), `user_id` (FK user_accounts, cascade), `created_at`, `updated_at` (`app.touch_updated_at`). Workspace-scoped like the rest of the schema.

**`ai_runs`** — layer A. `provider` (check: claude|gemini|chatgpt|manual|system), `workflow` (daily_brief|email_triage|job_discovery|recruiter_intel|calendar_review|other), `status` (QUEUED|RUNNING|SUCCEEDED|PARTIAL|FAILED|AWAITING_APPROVAL|CANCELLED), `trigger_type` (scheduled|manual|retry), `external_run_id`, `connection_id` (nullable until AI-3), `schema_version`, `sources jsonb` (type + reference ids only), `counts jsonb` (received/created/updated/duplicate/rejected), `error_category`, `error_detail` (truncated, no content), `retry_of_run_id`, `started_at`, `completed_at`. Unique `(workspace_id, provider, external_run_id)` where external_run_id not null.

**`ai_findings`** — layer B. `run_id` (FK, set null on run purge), `kind` (daily_brief|email_event|job_lead|recruiter_intel|calendar_event|note|…), `schema_version`, `provider`, `status` (NEW|REVIEWED|DISMISSED|ACCEPTED|SUPERSEDED|EXPIRED), `category` (email taxonomy), `priority` (CRITICAL|HIGH|NORMAL|LOW|INFO), `confidence numeric(4,3)`, `application_id` (FK applications, set null), `match_confidence`, `title`, `summary` (≤ ~1k chars), `occurred_at`, `due_at`, `source_ref jsonb` (`{type, provider_message_id, thread_id, url, canonical_url}`), `evidence` (short snippet ≤ ~500 chars, optional), `dedupe_key text`, `content_hash`, `payload jsonb`, `expires_at`. Unique `(workspace_id, user_id, kind, dedupe_key)`.

**`ai_suggestions`** — the proposal to change core data. `finding_id` (FK cascade), `action` (set_status|create_task|create_followup|link_contact|create_application…), `target_type`, `target_id` (nullable), `proposed jsonb`, `status` (PENDING|ACCEPTED|IGNORED|EXPIRED|SUPERSEDED), `decided_by`, `decided_at`, `applied_ref jsonb` (what core row resulted), `confidence`.

**`ai_workflow_configs`** — per (workspace, user, workflow): `enabled`, `primary_provider`, `fallback_provider`, `settings jsonb` (email rules etc.; validated by contract).

Deferred: `ai_provider_connections` / connector tokens (AI-3B; modeled on `extension_tokens`: prefix, HMAC hash, scopes, expiry, revoke, rotate); `ai_email_rules` (can live in `ai_workflow_configs.settings` until size demands); `ai_job_leads` (AI-8). Digests are `ai_findings(kind='daily_brief', dedupe_key='daily_brief:YYYY-MM-DD')` — no separate table.

## 3. Write path and RLS (see `SECURITY_AUTH.md`)

- Clients: `SELECT` via `can_access_owned_record(workspace_id, user_id)`; **no** client INSERT/UPDATE/DELETE grants on `ai_*` (pattern: M3 table-privilege migration).
- Writers: `rpc_ai_ingest_*` (service-role-only, called by MCP layer with the token's resolved user/workspace) and `rpc_ai_decide_suggestion` / `rpc_ai_dismiss_finding` / `rpc_ai_delete_*` (authenticated, owner-checked, audited).
- Cross-user isolation: ingest RPCs take user/workspace from the token, never from payload.

## 4. Canonical result contract `jobquest.ai-result` (v1.0)

```json
{
  "schema_version": "1.0",
  "provider": "claude",
  "workflow": "email_triage",
  "run": { "external_run_id": "…", "generated_at": "ISO-8601", "model_hint": "optional" },
  "sources": [{ "type": "gmail", "ref": "provider_message_id", "observed_at": "…" }],
  "findings": [{
    "kind": "email_event",
    "dedupe": { "source_type": "gmail", "source_id": "…", "event": "rejection" },
    "category": "REJECTION", "priority": "NORMAL", "confidence": 0.97,
    "title": "…", "summary": "…", "occurred_at": "…",
    "match": { "application_id": null, "hints": { "company": "…", "title": "…", "job_url": "…", "external_job_id": "…" } },
    "evidence": "short snippet", "payload": { }
  }],
  "suggestions": [{ "finding_index": 0, "action": "set_status", "target": { "application_id": null }, "proposed": { "status": "REJECTED" }, "confidence": 0.97 }],
  "metadata": { }
}
```

- **Versioning:** `MAJOR.MINOR`. Minor = additive optional fields; major = breaking. Server accepts current major and the previous major for ≥ one release (a per-version upgrader normalizes to current). `schema_version` stored on every run and finding.
- **Validation:** strict schema at the MCP boundary (reject wrong types, enums, oversize, bad URLs); per-item results so one bad finding yields PARTIAL not total failure.
- **Unknown fields:** top-level/finding-level unknown keys are **dropped and counted** in `run.counts.rejected_fields`; only `payload` and `metadata` may carry extras (size-capped, never rendered as HTML, never executed).
- **Normalization boundary:** provider adapters (if ever needed) live *before* the validator; the DB only ever sees canonical form. `provider` is a label, never a schema selector.
- **Matching:** the AI supplies `hints`; JobQuest performs the match server-side in deterministic order — external job ID → exact URL → company+title → company+title+date → company only. Only the first two may auto-set `application_id`; others set `match_confidence` and require review.

## 5. Idempotency & dedupe

Dedupe key is computed **by JobQuest** from deterministic fields, not AI judgment:
`sha256(source_type|source_id|event)` for email/calendar (provider message/event id); canonical URL (lowercase host, strip tracking params/fragment) for job leads; `daily_brief:<date>` for briefs; normalized `(name,company,channel)` for recruiter intel; `content_hash` for notes.

| Situation | Behavior |
|---|---|
| same dedupe_key, same content_hash | ignore (count duplicate), keep first |
| same key, different hash, finding still NEW | update in place, bump `updated_at`, keep id |
| same key, finding already ACCEPTED/DISMISSED | do not resurrect; if material change, create a linked finding (`supersedes`) |
| same event, different provider | same key → one finding; later provider recorded in `payload.seen_by` |
| rerun of same `(provider, external_run_id)` | return prior run result (idempotent) |
| related, different events (e.g. invite → reschedule) | distinct findings linked via `payload.related_keys` |

## 6. Run states

QUEUED, RUNNING, SUCCEEDED, PARTIAL, FAILED, AWAITING_APPROVAL, CANCELLED — sufficient. Add `REJECTED_INVALID` only if validation-fail volume needs separating from FAILED (record `error_category=SCHEMA_INVALID` instead). Because provider runs are pull-model, most runs are created RUNNING→terminal within one MCP session; QUEUED is for JobQuest-initiated/manual runs.

Error categories: `PROVIDER_UNAVAILABLE`, `CONNECTOR_AUTH_EXPIRED`, `SOURCE_UNAVAILABLE`, `PARTIAL_READ`, `SCHEMA_INVALID`, `TIMEOUT`, `RATE_LIMITED`, `INTERNAL`.

## 7. Retention / privacy

| Data | Default | User-deletable | On provider disconnect |
|---|---|---|---|
| ai_runs | 180 days, then purge (keep aggregate counts) | yes | keep |
| ai_findings (NEW/DISMISSED) | 90 days (`expires_at`) | yes | keep, mark source `disconnected` |
| ai_findings ACCEPTED | indefinite while linked to core record | yes (core record unaffected) | keep |
| evidence snippets | ≤500 chars; purged with finding | yes | **deleted** |
| raw provider responses / email bodies / web pages | **not stored** (v1) | n/a | n/a |
| failed runs | 30 days | yes | keep |
| connector tokens | hash only; expire ≤ 90 days | revoke | **revoked + deleted** |
| OAuth refresh tokens (if ever held) | encrypted, server only | revoke | deleted |

Purge is a scheduled job introduced in a later phase (AI-1 only defines `expires_at`).

## 8. Calendar storage recommendation

Option C (finding + suggestion) with an **external reference** (`source_ref.event_id`) — never copy descriptions/attendees. Accepting creates a JobQuest interview via existing `rpc_schedule_interview`. Copying external events (A) is rejected as privacy-heavy and sync-prone.
