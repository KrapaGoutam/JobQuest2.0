# AI-11E — Recruiter Intelligence: Report

**Status:** COMPLETE on `feature/ai11e-recruiter-intelligence` (from development `1bbe58f6f7c9dd6ceabd3eb5c61bcd22262d2c1a`, verified unchanged by fetch before any edit). Branch CI, development merge SHA, development CI and the remote Dev migration are recorded in the completion report (chat checkpoint) because they are not knowable before the push. Main `455a0120860405462b73647eca6a65ecd7fad6a7` and Production are unchanged; development stays cumulative (one main promotion after all approved AI-11 sub-phases).

## 1. Reuse audit (what already existed)

| Concern | Existing (AI-6 / AI-11A–D) |
|---|---|
| Storage | `ai_findings` rows of kind `recruiter_intel` (payload jsonb). **No person/contact table exists and none was added.** |
| Contract | `jobquest.ai-result` 1.0 `recruiter_intel` payload: name, role_title, company, relationship (5 values), verification verified/uncertain (+ `uncertain_fields`), source_name, profile_url, channel, contact_email/phone **only with** `contact_source_url`, `related_job` (public identity, server-computed key). A cited public URL is mandatory. |
| Dedupe | profile URL, else name + company + **role** (a new title created a new person). Provider independent. |
| Reads | `listRecruiterIntel` + MCP `jobquest_list_recruiter_intel` (company/search/dates/provider/status), `attachRelatedLeads` (related lead resolved inside the caller's RLS scope), browser RLS reader (`fetchRecruiterPage`), AI Hub Recruiter Intel page, Daily Digest "Recruiters" section (AI-11C). |
| Runs / source health | `ai_runs.sources[].status` (AI-11D, generic) and `discoverySearchOutcome`; the digest already reads a run whose every source failed as `unavailable`. |
| Application relation | AI-8 matcher via `aiLeadMatchService` (read-time, read-only). |
| Preferences | **None.** No target-company list, role preference, per-run maximum or draft preference existed. The AI-11D Job Discovery profile answers a different question (WHAT jobs) and was deliberately **not** extended. |

Gaps: no preferences/target companies; verification needed no stated basis; the fallback key included the role title; no cross-tier identity (a person found by name first and by profile later became two rows); no work-email/phone policy beyond "cited"; phone numbers were stored; no "why", no drafts, no mode (job-linked vs standing), no one-person-per-company rule, no bounded new contacts, no suppression, no role relevance.

## 2. Architecture decision

**EXTEND** the existing `recruiter_intel` finding contract, ingestion, read service, MCP list tool, Recruiter Intel page, digest composer and the three provider templates. **NEW** only one small table: `ai_recruiter_discovery_preferences` (+ four service-role RPCs). No people table, no run/source-health table, no scheduler, no write tool.

```
JobQuest recruiter preferences + stored Job Leads + stored Recruiter Intel      (JobQuest = system of record)
  -> provider reads them (jobquest_get_recruiter_discovery_profile, jobquest_list_job_leads, jobquest_list_recruiter_intel; all read-only)
  -> provider researches with ITS OWN public-web / prospecting tools, verifies, picks ONE person per company
  -> jobquest_submit_ai_result (recruiter_intel findings + per-source status)
  -> JobQuest validates (privacy boundary, verification basis, drafts), resolves identity across tiers, applies the deterministic plan, merges, stores
  -> AI Hub Recruiter Intel -> next Daily Digest -> a human decides whether and how to reach out
```

Four separate concepts: **Job Discovery profile** = what jobs; **Recruiter preferences** = who is useful; **Automations** = when; **Providers** = which AI executes. JobQuest adds no HTTP client, no browser automation and no board/LinkedIn/people-search code (asserted by tests). Settings → AI & Automation → **Recruiter Intelligence** sits between Job Discovery and Automations.

## 3. Recruiter preferences

`public.ai_recruiter_discovery_preferences`: one row per (workspace, owner). Fields: job-linked research on/off, target-company networking on/off, **target companies** (≤ 25 × 120 chars; explicit, user maintained; folded by a legal-suffix-free key so "Acme", "ACME Inc." and "acme" are one company), preferred roles (technical recruiter, talent acquisition, QA/test manager, engineering manager, hiring manager, head of engineering), maximum new contacts per run (1–10, default 5), draft outreach on/off. Networking cannot be switched on without a company (API and DB CHECK). The duplicate-suppression window is a documented fixed 30 days, not a user setting. No credentials, provider id or scheduling.

Access: owner-only `SELECT` through RLS (not even a workspace manager reads a peer's row); no client write grant; save/get are `service_role` RPCs the API calls with the verified session user (membership re-checked in the function; keys and values re-validated; audit event with counts and flags only, never company names). Route `GET|POST /api/ai/recruiter-discovery/preferences` (session auth, CSRF on save, strict body, kill switch).

## 4. Canonical recruiter intelligence (payload additions; no migration needed for them)

`verification_basis` (company_page, professional_profile, job_posting, prospecting_source, other_public_source), `person_id` (identity only, scoped by source, never returned), `posting_contact`, `why` (≤ 300), `discovery_mode` (checked server-side), `contact_email_basis` (published | prospecting_source), `draft_note` (≤ 300), `draft_email {subject ≤ 120, body ≤ 1200}`, relationship values `technical_recruiter`, `qa_manager`, `engineering_manager`, `engineering_leader` (older spellings stay valid), plus server-derived `company_key`, `profile_key`, `person_key`, `identity_keys`. `related_job` is still a public job identity resolved inside the caller's workspace; a provider database id is never accepted.

### Verification

`verified` is stored only with a cited public URL **and** a named basis; otherwise the person is recorded as **uncertain**, visibly (warning `verified_without_basis`). `uncertain_fields` always force uncertain. A similar title is never verification. A re-submission never silently upgrades uncertainty: the merged person is verified only if the new submission brings its own evidence, or the stored person was verified and the new one raised no doubt.

### Privacy / contact boundary (tested end to end, including the stored rows)

* **No phone number is stored** (previously public phones with a source were). **No home address or personal data.**
* A work email is kept only with `contact_source_url`, and personal mailboxes (gmail, yahoo, outlook, icloud, proton, …) are dropped whatever the source says. Nothing is guessed or constructed from a naming pattern: an email without a cited source is dropped; the templates forbid pattern emails.
* Email addresses and phone numbers pasted into a name, title, summary, evidence or "why" are removed.
* "Why this person" must be evidence; enthusiasm or speculation about hiring ("great innovative company", "likely hiring soon", "perfect recruiter") is dropped with a warning.

## 5. Role relevance, ranking and the per-run plan (`aiContract/recruiter.ts`, pure)

* **Relevance:** sales/account, campus/university/early-careers/intern, former, payroll/benefits/marketing/finance/legal titles and an ordinary engineer with no hiring relationship are rejected (counted, not errors). A generic stated relationship is refined by the title (e.g. "Senior Technical Recruiter"); title alone never verifies.
* **Ranking (deterministic):** named in the posting → role responsibility (technical recruiter, talent acquisition, QA/test manager, engineering manager, hiring manager, head of engineering) → verified → evidence quality → earlier submission.
* **One person per company per run** (default, both modes). **Bounded new contacts:** target-company/unsolicited: the owner's maximum (default 5), verified target-company contacts take slots first; job-linked: a fixed cap of 10. People who already exist are updates and do not use the cap.
* **Mode is verified by the server:** `job_linked` needs a related job; `target_company` needs the company on the owner's list; a claim for a random company is stored without a mode. A switched-off mode is dropped (when preferences exist).
* **Suppression (target-company mode):** a contact surfaced inside the 30-day window is not touched again unless the submission genuinely adds to what is stored; a NEW target-company contact at a company that already has an active contact in the last 24 h is skipped. Dismissed stays dismissed (existing lifecycle).
* Dropped findings are **counted** (`filtered_irrelevant`, `filtered_recent`, `filtered_company_duplicate`, `filtered_over_limit`, `filtered_items`) and never fail or PARTIAL a run.

## 6. Dedupe and merge

Strongest first: canonical public profile URL → provider person id (scoped by `source_name`) → verified work email → normalized name + normalized company (legal suffix removed). The old name + company + **role** key is kept as a lookup-only candidate so earlier rows still match. `rpc_ai_resolve_recruiter_key` looks the candidates up among the owner's own findings (dedupe key or stored `identity_keys`); a weaker tier never merges two different strong identities (a different profile or person key is a different person). The same name at another company, or at the same company with a different profile, stays distinct; a first name alone is never an identity. A provider's free `dedupe` object can no longer rename or relocate a person. A re-submission is **merged** into the stored person (the new fields win, omitted fields are kept, identity keys unioned, the first-seen spelling stays) instead of replacing it; dismissed/closed findings are never resurrected.

## 7. Drafts (data for a human; never sent)

Optional, bounded and refused rather than edited when wrong: over 300 characters (note), 120/1,200 (email subject/body), any link, email address or phone number, a "Re:/Fwd:" subject (stripped: no thread exists), and any claim JobQuest cannot support — having applied, following up on an application or thread, an earlier conversation, a mutual connection. JobQuest has no send, no "contacted" state, no mailto and no LinkedIn call; the UI offers **Copy** and Dismiss only. If the owner switched drafts off, the ingestion backstop drops them. For target-company contacts the template tells the provider never to pretend a posting exists.

## 8. Source health

The existing `ai_runs.sources[].status` (ok / zero / blocked / unavailable / error / skipped) is used unchanged for the recruiter workflow: the Recruiter Intel page shows the last recruiter run in words ("could not search any source … not the same as no recruiter existing" vs "searched N sources and found no new contact"), and the Daily Digest reads a recruiter run whose every source failed as `unavailable` (AI-11C/D semantics, now covered by a recruiter test). No new source-health table.

## 9. Application and Job Lead integration

Read-only. A person researched for a stored lead shows "You already have an application for this job" / "Possibly tracked, not confirmed" (AI-8 matcher via the related lead only). No contact, task or Application is created or changed; the recruiter findings carry no `application_id`; core-table counts and the application row are compared before and after in integration and e2e. AI-11D leads are unchanged; the MCP recruiter list can be filtered by `relatedLeadId` (a lead the caller cannot read matches nothing — cross-workspace linkage is impossible). Not built (deferred, optional): a "recruiter intel exists" marker on Job Lead cards.

## 10. MCP

**SAFE READ EXTENSION: 12 → 13 tools** (still exactly one write, `jobquest_submit_ai_result`). Justification: a provider cannot run networking without the owner's target companies and role preferences, and no existing read exposed them. `jobquest_get_recruiter_discovery_profile`: `ai:read`, no arguments (workspace and owner come from the connection), read-only annotations, only the preference fields; a peer's token sees its own (unsaved) default. `jobquest_list_recruiter_intel` stays read-only; new filters `verification`, `relationship`, `mode`, `relatedLeadId`; output adds `why`, `verificationBasis`, `discoveryMode`, `postingContact`, drafts, `lastSeenAt`, `applicationMatch`; phone, identity keys and provider person ids never appear. No send/outreach/contact/application/task tool. All count assertions (unit and integration) were updated deliberately.

## 11. UI

* **Settings → AI & Automation → Recruiter Intelligence:** bounded form with inline errors, no credentials, no scheduling.
* **AI Hub → Recruiter Intel** ("Recruiters to connect with"): groups **Job-linked / Target companies / Other**; each card shows the person, public role and company, **Verified / Uncertain** (uncertain says what was not proven), "Named in the posting", the role being hired for, **Why this person**, source and profile links, a cited work email, first/last surfaced, provider, the read-only application relation and collapsible **drafts (not sent)** with Copy. Filters: Show (all / job-linked / target company), Verification, Company, Provider, Status (active/dismissed), dates, search. Last-run source health line. No tabs added.

## 12. Provider templates

`claude`, `gemini`, `chatgpt` `RECRUITER_INTEL.md` share one body: read the preferences, read leads and stored recruiters, job-linked and target-company modes, role preference order, rejection list, verification basis, privacy rules, one person per company, evidence-based why, optional drafts, source status, one `jobquest_submit_ai_result`, never contact anyone, never create or change an application. Page text and tool output are untrusted data. Identical RESULT SHAPE (provider-specific lines only differ), validated against the real validator by tests.

## 13. Validation (local)

* Typecheck (root, api, web) and eslint clean; `pnpm build` and bundle + tracked-file secret scans clean.
* Unit: 1,150 / 1,150 (64 files); new `ai-11e-recruiter` (pure rules + contract), `ai-11e-ingestion` (scripted RPC policy), `ai-11e-services` (service, MCP, static boundaries, SQL grants), `ai-11e-recruiter-ui`.
* Integration (local Supabase, real RLS): all AI suites pass including the new `ai-11e-recruiter` (17 tests: preferences RLS/bounds/audit/API, job-linked, cross-workspace, target-company, suppression, relevance, verification and privacy as stored, drafts, dedupe across providers and tiers, merge, source health + digest availability, next-digest + immutable snapshot, MCP read-only surface, hostile text, core data unchanged).
* E2E `e2e/ai11e-recruiters.spec.ts` (+ ai5, ai6, ai11a, ai11c, ai11d re-run): Settings and Recruiter Intel at 1280 / 768 / 375 — no horizontal overflow, axe 0 critical/serious (0 violations) on every state. Added to the `ai-hub-e2e` CI job.
* Migration `20261103100000_ai_hub_recruiter_intelligence.sql` applied to the local stack only.

## 14. Existing tests changed (superseded semantics, not removed coverage)

Tool-count assertions 12 → 13 (unit and integration), the ChatGPT SKILL.md / operator guides, the migration-list assertion, `RECRUITER_INTEL` fixture (`verification_basis`), the AI-6 contract tests (phone is not stored; the fallback key is name + company, no role), the AI-6 integration contact shape (no phone), the AI-6 recruiter page strings in unit and e2e (Verified/Uncertain wording, grouped page).

## 15. Deferred (unchanged)

AI-11F schedule/cadence execution; AI-11G provider scheduler adapters; AI-11H weekly digest, automation health, analytics. Not in this phase: any scheduler, live provider/OAuth certification, Gmail integration, LinkedIn/email sending, automatic contact/task/Application creation, a Job Lead card marker for existing recruiter intel.

## 16. Limitations

Role relevance is a conservative English keyword reading, not semantic. Draft-claim detection is pattern based; it refuses known false claims but cannot prove an arbitrary sentence true. Research quality and source coverage vary by provider and are not certified here. Production needs migration `20261103100000` (and `20261101100000`, `20261102100000`) only at the single post-AI-11 main promotion.
