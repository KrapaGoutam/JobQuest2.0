# AI-6 — External Intelligence Sources (Email + Job Discovery + Recruiter Intelligence)

Branch `feature/ai-6-external-intelligence` (one cumulative branch) from development `ce3c16a6e4a96e8ccfe2bc13752df1998822a218`.
Final branch CI / merge / development CI results are recorded in the operator checkpoint and in the closure docs carried by the next phase.

## 1. Source architecture

```
Claude scheduled task | manual run | (future ChatGPT / Gemini)     -> the provider does all discovery/research
        |  job search, email triage, recruiter research
        v
jobquest.ai-result 1.0 -> /api/mcp jobquest_submit_ai_result -> ingestAiResult -> ai_findings (parent, audited once)
                                                                        \-> job_lead only: ai_job_leads (child projection, no audit)
        v
Job Leads / Email / Recruiter Intel pages  +  Daily Digest (`daily_brief`, canonical)  +  AI Hub Overview
```

JobQuest remains the system of record. No scraper, scheduler, provider credential, auto-apply, outreach, email action, application or contact mutation was added. `daily_brief` stays the canonical Daily Digest workflow (no `daily_digest`). The workflows `job_discovery`, `email_triage`, `recruiter_intel` and the kinds `job_lead`, `email_event`, `recruiter_intel` already existed in the AI-1A CHECKs and the TypeScript constants: **no enum change**. The contract stays `jobquest.ai-result` **1.0** (additive validators; no v2).

## 2. Job-lead model and child table

`ai_findings` stays the parent. **`ai_job_leads`** is a 1:1 child (migration `20261027100000_ai_hub_external_intelligence.sql`): normalized columns for filtering (company, title, location, work arrangement, employment type, source name/URL, canonical URL, external id, `posted_date`, `discovered_at`, salary min/max/currency/period, experience level, `match_score` 0..100, skills) plus the bounded plain-text description. A composite FK `(finding_id, workspace_id, user_id)` pins the child's owner to the parent's; deleting/dismissing keeps using the AI-1B finding RPCs and the child cascades. Rationale for a child table (vs. JSON): real filters (company/title/location/score/date), identity lookups for cross-provider dedupe, a bounded description outside the 16 KiB finding payload, and a future explicit "Job Lead -> Application" step. Email events and recruiter intel did **not** get tables (`ai_email_events`, `ai_recruiters` not created): their filters are real finding columns plus `payload->>…`.

`discovered_at` (JobQuest first stored it) is separate from `posted_date` (as stated by the source; never inferred). A job lead is never an application: no application is created and no stage/status changes (asserted in integration and e2e tests).

## 3. Job description limits

Plain text only. The validator strips HTML (script/style removed, block tags to line breaks, entities decoded once, residual tags removed), drops control characters, tidies whitespace, and caps at **30,000 characters** (DB CHECK as defence in depth). Truncation sets `description_truncated` and `description_length` (original length) in both payload and child, emits warning `description_truncated`, and the UI shows a visible "shortened" notice. Descriptions are not returned by list reads (MCP or UI list); the UI fetches one lead's text at a time.

## 4. Job dedupe

Provider is never an input. Strongest first: external job id **with** source name (`job:`), canonical URL (`url:`; tracking params/fragments/host case normalized), company + title + location + posted date (`jobclp:`), company + title + source name (`jobcts:`). Company + title alone is refused. Because providers may see different identities, `rpc_ai_resolve_job_lead_key` lets the service reuse the key of an existing lead (same owner + workspace) with the same canonical URL or (source, id) before ingesting, so Claude (URL) + Gemini (board id only) converge on one lead (integration-tested). Dismissed leads are never resurrected or rewritten. Identity fields only accumulate on update (`coalesce`).

## 5. Email privacy model, categories, dedupe

Intelligence, not a mailbox: category (closed set of 10), concise summary, bounded evidence (<= 500), sender display name + **domain** only (an address is stripped), bounded subject (<= 200), received time (**required**), company/role/next-step hints, deadline (copied to `due_at`), `needs_attention` hint. Message bodies, HTML, attachments are dropped with warning `raw_body_rejected` and never stored (tested, including the DB row). Categories: recruiter_reply, interview_invitation, assessment, rejection, application_confirmation, follow_up, scheduling, reschedule, deadline, other_job_search. Dedupe: one finding per provider message id across providers/wording (`ev:`; `event` defaults to `message`); fallback `emfb:` (source + received time + sender + subject) only when no id exists; identical subjects on different messages never merge. "Needs attention" is one definition on server, web and the SQL-side filter (NEW and HIGH/CRITICAL, action category, dated, or provider-flagged).

## 6. Recruiter verification and dedupe

A public source citation is mandatory (`source.url` or `payload.profile_url`; otherwise the finding is rejected). Contact email/phone are kept only with a `contact_source_url`, else dropped with `contact_uncited_dropped` (nothing is guessed; the template forbids email-pattern inference). `verification` is verified/uncertain with `uncertain_fields`; "verified" is downgraded when anything is flagged uncertain. `related_job` is a contract-local public job identity; the server computes `related_job_key` and the link is resolved at read time **inside the caller's RLS scope** (a provider-supplied database id is never accepted; cross-workspace lookups resolve to nothing; tested). Dedupe: canonical profile URL (`recruiter:url:`) else name + company + role (`recruiter:`); channel/provider are not identity.

## 7. Daily Digest integration

`buildDeterministicDigest` now aggregates stored data for the digest day in the owner's time zone: New Job Leads (+ top items, **Strong Matches = stored score >= 80**, never for unscored leads), Email Activity (counts, recruiter replies, assessments, needs-attention in Top Priorities), Recruiter Intelligence, and email **deadlines** merged into Upcoming. AI-5 availability is preserved exactly: `available` (items for the day), `zero` (the source's workflow has a SUCCEEDED/PARTIAL run for this owner and found nothing), `not_configured` (never ran). Summary keys appear only when their source is configured. Reads fail closed. A stored digest is an immutable snapshot (tested: new data later does not change it; regeneration is a duplicate run). No digest payload version/schema change.

## 8. MCP changes

Three read-only `ai:read` tools (no new scope): `jobquest_list_job_leads`, `jobquest_list_email_intelligence`, `jobquest_list_recruiter_intel` (bounded pages <= 50, strict input schemas, workspace-scoped under RLS, sanitized, provenance preserved, untrusted notice, no descriptions/bodies/provider ids). The only write tool is still `jobquest_submit_ai_result` (ten tools: nine reads, one write); no `create_job_lead` / `create_email_event` / `create_recruiter` tools. Descriptions stay static and non-coercive. Scope filtering verified (ingest-only token sees only the submit tool; read tokens cannot submit).

## 9. UI

Tabs: Overview, Daily Digest, **Job Leads** `/ai-hub/job-leads`, **Email** `/ai-hub/email`, **Recruiter Intel** `/ai-hub/recruiters`, History (Calendar stays hidden). Shared interaction model (`AiHubSourceParts.tsx`): draft filters + Apply/Reset, 20 per page, same loading/error/empty/not-configured states, announced result summary. Job lead detail shows the description with a truncation notice; "Copy details as JSON"; the only write is the existing owner-only `rpc_ai_dismiss_finding` (two-step). No Apply/Create application/contact actions. Overview adds three small source cards. Verified at 375/768/1280 with the focused e2e: 0 px horizontal overflow, no clipped container, axe 0 serious/critical on all pages and both dialogs. **Defect found and fixed during verification:** the six-tab row made the AI Hub shell wider than the viewport, so `main` silently clipped content while the document reported 0 overflow; the shell is now `width:100%` and the tab row scrolls inside itself; the e2e now also asserts `main.page` is not clipped. A 24px target-size violation on stacked external links was fixed.

## 10. Workflow templates

`provider-workflows/claude/JOB_DISCOVERY.md`, `EMAIL_TRIAGE.md`, `RECRUITER_INTEL.md` rewritten to the exact AI-6 schema with safety rules (never apply, never claim an unseen role is open, never fabricate, canonical URLs, untrusted pages, dedupe before submit; job-search mail only, no bodies; public sources, cited contacts, no guessing, bounded research aimed at new/high-value leads). `DAILY_DIGEST.md` reads stored sources and states the strong-match threshold. `CLAUDE_SCHEDULED_TASKS.md` gained the AI-6 section/troubleshooting. A unit test validates each template's example against the real validator. Cadence guidance is advisory; JobQuest stores no next-run time.

## 11. Migration

`supabase/migrations/20261027100000_ai_hub_external_intelligence.sql`: `uq_ai_findings_id_owner`, `ai_job_leads` (+ CHECKs, 3 query-driven indexes, `updated_at` trigger, RLS select policy, grants), `rpc_ai_resolve_job_lead_key`, `rpc_ai_upsert_job_lead` (both `security definer`, `search_path = ''`, `service_role` only). Applied to the **local** stack and, after branch CI, to **Dev only** (`jobquest-dev / xpnkasclquplmrcmhsif`); Production migration head unchanged `20261022100000`. Dev result is recorded in the checkpoint.

## 12. Tests (local, before push)

| Check | Result |
|---|---|
| Unit suite (once, full) | 40 files, 600/600 |
| New unit: contract/golden fixtures (`ai-6-sources-contract`), digest (`ai-6-digest`), ingestion orchestration (`ai-6-ingestion`), UI + client/server sync (`ai-6-sources-ui`), templates (`ai-6-templates`) | pass |
| Integration (real local DB), AI suites 1B/2A/2B/3/4/5 + new `ai-6-sources` (15) + `ai-6-mcp` (6) | 88/88 |
| Focused e2e `e2e/ai6-sources.spec.ts` (flags local to this spec) | PASS (375/768/1280, 0 overflow, 0 clipped, axe 0 serious/critical, keyboard, dismiss, digest) |
| Root `pnpm typecheck` / `eslint .` | PASS / PASS |
| `pnpm build`, `check:bundle`, `check:secrets` | PASS; 0 findings |

Existing tests were updated only where the contract tightened intentionally: closed email categories + required received time (fixtures), ten MCP tools, AI Hub tab set/route check, source count queries.

## 13. Provider smoke

Not performed in this report (no live Claude run; branch completion does not depend on it). Optional after Preview: one manual Claude Job Discovery with a temporary credential, 3-5 leads, then revoke; email/recruiter live tests skipped to avoid private data. Any live result is reported as counts only.

## 14. Deferred

Calendar intelligence; application matching where ambiguous (no `application_id` is persisted by AI-6); Job Lead -> Application (explicit user acceptance); email reply/send; recruiter outreach; suggestion cross-run re-proposal policy; OAuth; ChatGPT/Gemini providers; controlled AI actions; a dedicated AI-Hub e2e CI job (hardening); Production rollout.
