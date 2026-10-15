# AI-11D — Fresh Job Discovery: Report

**Status:** COMPLETE on `feature/ai11d-fresh-job-discovery` (from development `94e966b8730ef3d2c0828d5a55e93e7660053d2b`, verified unchanged by fetch before any edit). Branch CI, development merge SHA, development CI and the remote Dev migration are recorded in the completion report (chat checkpoint) because they are not knowable before the push. Main `455a0120860405462b73647eca6a65ecd7fad6a7` and Production are unchanged; development stays cumulative (one main promotion after all approved AI-11 sub-phases).

## 1. Reuse audit (what already existed)

| Concern | Existing (AI-6 / AI-8 / AI-11A–C) |
|---|---|
| Lead storage | `ai_job_leads`: 1:1 child of an `ai_findings` row (`kind = job_lead`), composite FK, RLS = parent, service-role-only projection RPCs. Columns: company, title, location, work arrangement, employment type, source name/URL, canonical URL, external job id, `posted_date` (date only), `discovered_at`, salary, experience level, `match_score`, description (30,000 chars), skills. |
| Contract | `jobquest.ai-result` 1.0 `job_lead` payload with allow-listed, bounded, normalized fields; unknown keys stripped; nothing invented. |
| Dedupe | Provider-independent: external id + source name, canonical URL, company + title + location + posted date, company + title + source. `rpc_ai_resolve_job_lead_key` reuses an existing lead's key across identity tiers. Dismissed/reviewed findings are never resurrected. |
| Reads | `listJobLeads` + MCP `jobquest_list_job_leads` (read-only, newest-discovered order); the browser reads under RLS (`api/aiSources.ts`). |
| Runs | `ai_runs` with `sources` jsonb (`{type, ref, observed_at}` only), `counts` jsonb (≤ 20 keys), derived status; `metadata` was validated but never stored. |
| Conversion | AI-8 human-approved `create_application` suggestion (Actions queue). A lead is never auto-converted. |
| Application matcher | AI-8 `evaluateApplicationMatch` (used by Actions) and the AI-11B email wrapper (MATCHED / POSSIBLE / UNMATCHED). Leads had **no** "already tracked" status. |
| Digest | AI-11C composes "Recent job leads" from stored leads; unavailable/zero/not_configured state from the latest `job_discovery` run. |
| Profile | **None.** No job-preference, target-role or search-profile model existed (`profiles` holds timezone/theme only; `ai_workflow_configs.settings` is per provider automation, not a user criteria store). |
| Templates | AI-6 Claude/Gemini/ChatGPT `JOB_DISCOVERY.md` with a hand-edited `SEARCH PROFILE` placeholder. |

Gaps: no discovery profile; no hour-level posted time (date only, so 12/24-hour freshness was unenforceable); no remote geography ("remote" ≠ Remote-US); no explicit experience range or fit/gap reasons; no per-source run status; no cross-source dedupe beyond identical identities; no "already tracked" lead status; no freshness-first sort.

## 2. Architecture decision

**EXTEND** the existing lead storage, contract, ingestion, read service, MCP list tool, Job Leads page and templates. **NEW** only the one thing that did not exist: a small, bounded, owner-scoped discovery profile. No new leads table, no new run/source-health table, no new scheduler, no new write tool.

Canonical flow (unchanged principle — JobQuest is the system of record, providers do the searching):

```
JobQuest Job Discovery profile (WHAT)  ->  provider reads it (jobquest_get_job_discovery_profile, read-only)
  -> provider searches with ITS OWN tools -> jobquest_submit_ai_result (job_lead findings + per-source status)
  -> JobQuest validates, applies the deterministic backstop, dedupes, stores ai_job_leads
  -> AI Hub Job Leads (freshest first) -> next Daily Digest -> a human decides about an Application
```

WHAT (profile) / WHO (Providers) / WHEN (Automations) stay three separate concepts and three separate settings sections. JobQuest never scrapes or browses: the API gained no HTTP client, no browser automation and no board-specific code (asserted by a unit test).

## 3. Discovery profile

`public.ai_job_discovery_profiles`: one row per (workspace, owner), no credentials, no provider ids, no query language. Fields: target titles (≤ 20 × 80), include restricted remote, cities (≤ 5), work arrangements (remote / hybrid / onsite), employment types, freshness window (**12 / 24 / 48 / 72 hours**), allow unknown posted date, preferred maximum experience + tolerance (0–5 years), excluded title words (≤ 20 × 40), exclude clearance/citizenship, require software-testing context, minimum match score (0–100), maximum results (1–25), core skills (≤ 20 × 60). Hybrid/onsite require at least one city. Defaults are generic (no title, no city, remote only, 24 h, common seniority words excluded) — **nothing is hard-coded to one person's search**; a "Load QA / testing starter" button is browser data that fills the form for the user to review and save.

Access: owner-only `SELECT` through RLS (`user_id = auth.uid()` and active member; not even a workspace manager reads a peer's profile); no client write grant; save/get are `service_role` RPCs the API calls with the verified session user, with DB CHECKs as defence in depth and an audit event carrying counts only (never titles or cities). Route `GET|POST /api/ai/job-discovery/profile` (session auth, CSRF on save, strict body, kill switch). Settings → AI & Automation → **Job Discovery** (between Providers and Automations).

## 4. Deterministic backstop at ingestion (`aiContract/discovery.ts`)

Applied only to `job_discovery` runs of an owner who has a saved profile (best effort: an unreadable profile never loses a run). Dropped leads are **counted, not stored, and never make a run PARTIAL** (`counts.filtered_items`, `filtered_stale`, `filtered_unknown_date`, `filtered_over_limit`).

* **Freshness:** exact `posted_at` against the window; a date-only posting is fresh while its UTC day overlaps the window; **unknown is dropped unless the profile explicitly allows it**, then kept with `posted_at = null` and shown as "Posted date unknown". Unusable or future values become *unknown with a warning* — never "today".
* **Remote geography:** provider `remote_scope` (`us` / `restricted` / `region`) wins; otherwise a conservative reading of the stated location/note; nothing stated stays *not stated* (never assumed to be the US). Restricted/regional remote is dropped unless the profile allows it. Hybrid/onsite must be in a profile city (unstated location is flagged, not assumed).
* **Arrangement / employment type** must be allowed; **excluded title words** (whole word, case-insensitive); **explicit** years above the limit + tolerance (a vague "experienced" is never converted to a number); **clearance / citizenship** restrictions; the **software-QA gate** (title says software/SDET/automation, or ≥ 2 distinct software-testing signals in skills/description; manufacturing/lab/food/regulatory quality roles are rejected; no evidence at all = kept and flagged); the provider **score floor** (only for a scored lead; score validated 0–100 and never recomputed).
* **Cap:** survivors capped at the profile maximum, best provider score first; a suggestion on a dropped lead is skipped, not failed.

## 5. Contract and storage (additive migration `20261102100000_ai_hub_fresh_job_discovery.sql`)

`ai_job_leads` gains `posted_at`, `remote_scope`, `remote_note`, `experience_min_years` / `experience_max_years`, bounded `fit_reasons` / `gap_reasons` (≤ 8 × 200), `logical_key`, `alt_urls` (≤ 4) and `freshness_at` (a **sort key only**: best known posting time, else first stored; never displayed as a posted time). Existing rows keep working (`freshness_at` backfilled). Salary is still only what is explicitly published; experience years only a stated number; the description is still analysed externally and stored bounded (30,000 chars, as before).

Match scoring: the provider's own 0–100 analysis, validated and displayed as "AI match … provider's estimate"; JobQuest never claims precision.

## 6. Dedupe and idempotency

Unchanged strongest-first identities, plus: a lead **keeps the URL it was first stored under** and records later URLs as bounded provenance (`alt_urls`) so every URL the posting was found under still resolves to the same lead (previously a later URL replaced the first, which could orphan it); a conservative **cross-source logical key** (company with legal suffix removed + title without bracketed notes / trailing "- Remote" + remote scope or normalized location/arrangement) folds the same role seen on two boards within 45 days, never across two different board ids of the same source and never on company + title alone; a second **metro** for the same requisition stays a separate lead (different place). Re-submitting the same posting updates/no-ops (one row); a dismissed lead stays dismissed; a later submission never erases a known posted time.

## 7. Source health

`run.sources[]` entries accept optional `status` (`ok` / `zero` / `blocked` / `unavailable` / `error` / `skipped`), `count`, `note`, stored in the existing `ai_runs.sources` (no new table). `discoverySearchOutcome`: **found / quiet / not_searched / unknown** — "connector unavailable" is never "0 jobs". The Job Leads page shows the last run ("could not search any source … not the same as no new jobs" vs "searched N sources and found nothing new"). The Daily Digest reads an empty `job_leads` section as **unavailable** when the latest run's every source was blocked/unavailable/error/skipped (AI-11C semantics otherwise unchanged; stored snapshots are never rewritten).

## 8. Application matching (read-only)

`aiLeadMatchService` reuses the AI-8 matcher: MATCHED (job id / URL / company + role with agreeing context) → "Already tracked" + open link; POSSIBLE → "Possibly tracked, not confirmed" (never authoritative); none → nothing. Derived at read time, owner + workspace scoped, **no write verb exists** (asserted by a unit test and an application-snapshot comparison in integration and e2e). No lead creates, changes or archives an Application; the existing human-approved Actions path is untouched. Route `GET /api/ai/job-discovery/matches`; the MCP lead list carries the same `applicationMatch`.

## 9. MCP

**SAFE READ EXTENSION: 11 → 12 tools** (still exactly one write, `jobquest_submit_ai_result`). Justification: a provider cannot run discovery without the owner's criteria and no existing read exposed them. `jobquest_get_job_discovery_profile`: `ai:read`, no arguments (workspace and owner come from the connection), read-only annotations, returns only the criteria (no identity, credentials, provider data or other profile fields), and a peer's token never sees the owner's profile. `jobquest_list_job_leads` gains `sort` (default freshness), `recentHours` (12/24/48/72), `remoteScope` and returns the new fields + application match. No external job-search tool, no create/update tool. All six count assertions were updated deliberately.

## 10. UI

* **Settings → AI & Automation → Job Discovery:** bounded form with inline field errors, no credentials; separate from Providers and Automations.
* **AI Hub → Job Leads:** freshest-first default; Sort by (freshest / best AI match / recently found), Newest within (12–72 h), Remote — US only, plus the existing filters; cards show posted age ("Posted 3h ago" / date / "Posted date unknown"), honest arrangement wording ("Remote — US" only when the geography is US-wide; "Remote — restricted locations", "specific region", "location scope not stated"), employment type, stated experience, published salary only if present, AI match, at most two fit reasons and two concerns (all in the details dialog), the direct posting link, the read-only "Already tracked" status and the last discovery run's source health. No apply / create / contact action was added.

## 11. Provider templates

`claude`, `gemini`, `chatgpt` `JOB_DISCOVERY.md` share one body: read the profile, avoid stored/tracked leads, tiered sources (employer/ATS → job alerts → search connectors → web fallback), verify postings, true posted times only, apply freshness / location / seniority / software-testing / clearance rules, report every source's status, one `jobquest_submit_ai_result`, never create Applications; job text is UNTRUSTED DATA. Identical RESULT SHAPE (provider-specific lines only differ), validated against the real validator by a test.

## 12. Validation (local)

* Typecheck (api / web / extension / tests), eslint, `pnpm build`, bundle + tracked-file secret scans: clean.
* Unit: 1049 / 1049 (60 files); 77 new in `ai-11d-discovery`, `ai-11d-ingestion`, `ai-11d-services`, `ai-11d-discovery-ui`.
* Integration (local Supabase, real RLS): all AI suites 179 / 179 including the new `ai-11d-discovery` (15 tests: profile RLS and DB bounds, API route, ingestion policy end to end, source status persisted, remote geography, cap, idempotency, cross-provider / cross-URL / logical-key dedupe, dismissed stays dismissed, application match + cross-workspace isolation, freshest-first reads, MCP, Daily Digest + immutable snapshot + unavailable source, hostile text inert).
* E2E `e2e/ai11d-discovery.spec.ts` (+ ai6, ai8, ai11a re-run): Settings section and Job Leads page at 1280 / 768 / 375 — no horizontal overflow, axe 0 critical/serious on every state. Added to the `ai-hub-e2e` CI job.
* Migration validated on the local stack (apply, and apply again after a local revert while iterating).

## 13. Existing tests changed (superseded semantics, not removed coverage)

Tool-count assertions 11 → 12 (unit and integration), the ChatGPT SKILL.md / operator guides, the migration-list assertion, the AI-7 CI spec list, the `ai-6-ingestion` call-order expectation (profile read), one fixture date that was later than its run's `generated_at` (now rejected as future), and the description-length cap check (the new/extended tool descriptions were shortened to fit).

## 14. Deferred (unchanged)

AI-11E recruiter intelligence; AI-11F schedule/cadence execution; AI-11G provider scheduler adapters; AI-11H weekly digest, automation health, analytics. No live provider/OAuth certification, no scheduler, no Gmail integration, no recruiter UI, no paid LLM API.

## 15. Limitations

Freshness is only as good as the posted time the provider reports; a date-only posting is judged by its UTC day. The text-based remote-geography reading is deliberately conservative and English-only. The software-testing gate is signal-based, not semantic. Provider search quality and source coverage vary by provider and are not certified here. Production needs migration `20261102100000` (and AI-11A's `20261101100000`) only at the single post-AI-11 main promotion.
