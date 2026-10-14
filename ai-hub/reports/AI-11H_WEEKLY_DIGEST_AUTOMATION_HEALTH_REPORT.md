# AI-11H — Weekly Digest + Automation Health / UI / Analytics Polish

Branch `feature/ai11h-weekly-digest-automation-health` (from development `4c1a0e44005256a1fbd83c806b959820cf003b8a`).
**Migration: NONE** (Dev DB head stays `20261105100000`). **MCP: unchanged, 15 tools** (12 read-only + submit + claim + failure). Main and Production unchanged.
Branch CI, development merge SHA and development CI are recorded in the chat completion report (they are not knowable before the push).

## 1. What AI-11H closes

AI-11H is the last AI-11 product layer: a Weekly Digest, derived automation health and run analytics, clearer scheduling/readiness UX, a stable manual run key, and a place to see and revoke connector credentials the provider cards do not show. The architecture stays provider-neutral: JobQuest is the system of record, providers are workers, no provider API key, no server-hosted LLM, no provider-to-core mutation, human approval before any core change.

## 2. AI-11G provider acceptance record (carried into the release documentation)

Server evidence proves **provider-bound scheduled execution** (the claim is authenticated as the provider, the occurrence is database-enforced, the run is finalized by the existing submit). The server **cannot independently prove that the provider ran unattended**: it sees an authenticated claim at the due time, not whether a person was present. Readiness therefore stays "proven by use", never "proven unattended".

| Provider | Interactive | Scheduled | Acceptance | Observations |
|---|---|---|---|---|
| Claude | READY | READY | CLOSED PASS | Duplicate provider invocation was absorbed by occurrence idempotency (one run). One attended paste produced **two manual runs** because two different time-derived client keys were built (a provider-side key problem, not an engine defect) -> fixed by Part E below. |
| ChatGPT | READY | READY | CLOSED PASS | Clean acceptance. |
| Gemini | READY | READY | CLOSED PASS | Built its manual key from **US Central local time** instead of UTC (same root cause as Claude) -> Part E. Approval behaviour was **not recorded**. |
| AI-11G overall | | | **COMPLETE PASS** | Dev clean-state baseline afterwards: 0 automations, 0 live OAuth clients/grants/connector tokens, 21 AI runs (0 QUEUED/RUNNING), 348 applications, 141 tasks, 693 application events, 78 contacts, 3 AI findings, 0 suggestions, 0 action executions. |

The AI-11G capability matrix labels remain evidence-derived. Nothing in the UI hard-codes a provider as Ready (a unit test fails if it does).

## 3. Weekly Digest (Part A) — decisions

**Reuse audit.** `ai_findings.kind` and `ai_runs.workflow` are database CHECK enums (`daily_brief`, ... ). A persisted `weekly_brief` kind would need a migration; the Daily Digest dedupe key is `daily_brief:<date>:<provider>`, so a week keyed on its first date would collide with that day's Daily Digest. Everything a weekly report needs already exists as timestamped records, so **no new table, kind or workflow** was introduced.

**Decision: a computed, deterministic, read-only report** — `GET /api/ai/digest/weekly?workspace_id=&week_start=` — built by `aiWeeklyDigestService` (reads) + `aiContract/weekly.ts` (pure composition). The Daily Digest stays the immutable per-day snapshot (see Part H).

| Question | Answer |
|---|---|
| Owner timezone | The owner's **profile time zone** (`profiles.timezone`; UTC when unset/invalid). Never the server's UTC week. |
| Week boundary | The owner's **profile week-start setting** (`profiles.week_start`: Monday by default, or Sunday) — the same setting Analytics and Goals use. Window = local midnight of the first day to local midnight of the next first day, as UTC instants, so DST weeks are 167/169 hours. |
| Lookback | One week per request, **0 to 26 weeks back**; future weeks and non-week-start dates are refused (422). The current week is `inProgress` and reported to date (`throughAt`). |
| Immutable history | **Not stored.** There is no stored weekly artifact, so there is nothing to mutate. A completed week is re-derived from timestamped records and is stable unless those records are later edited/deleted (and findings dismissed later stop counting); this is stated in the report's notes. The Daily Digest's snapshot immutability is unchanged. |
| Regeneration | Reloading **is** regeneration: idempotent, deterministic for the same records, side-effect free (an integration test snapshots core + AI tables before/after). |
| Zero vs unavailable | Same rule as the Daily Digest (`sourceHealthOfRun`, now shared): AI source whose latest run FAILED (or searched nothing) → `unavailable` (counts shown as `unavailable`/unknown, never 0); never ran → `not_configured`; ran and found nothing → `zero`. Goals engine unreadable → `unavailable`. |
| Source health | Per-section `status`: `available`, `zero`, `not_configured`, `unavailable`. |

**Sections (order fixed):** Week at a glance · Applications · Interviews and stage movement · Job-related email · Fresh job leads · Recruiter intelligence · Tasks and follow-ups · Goal progress · Automation health · Needs attention next (current and most recent completed week only; it is a "next 7 days" view from now, because a past week's "what was due next" cannot be reconstructed).

**Data sources (all read as the caller under RLS, scoped to the owner's own rows):** `applications.applied_at`, `application_events` (STAGE_CHANGED / OUTCOME_CHANGED; ownership resolved through the owner's applications so a manager never sees a peer's movement), `interviews`, `tasks`, **`rpc_get_goal_progress`** (the Goals engine itself, so weekly goal numbers equal Analytics), `ai_findings`/`ai_job_leads` (email, leads, recruiters; reuse of the hub mappers), `ai_runs` + automations. No raw email bodies, calendar payloads or secrets are read; nothing is searched, called or mutated.

Known, documented difference: "Applications submitted" counts the application's **applied date**; the Goals engine counts APPLIED **events**. They agree for normal use and can differ when an applied date is backdated. Each section says which number it is.

Web: new tab **AI Hub → Weekly Digest** (`/ai-hub/weekly`): previous/next/this-week navigation bounded by the server's `oldestWeekStart`/`currentWeekStart`, status badge per section, headline + metrics + bounded items, accessible loading/error states, escaped untrusted text.

## 4. Automation health (Part B) and analytics (Part C)

One new read endpoint, `GET /api/ai/automations/insights?workspace_id=&days=7|30|90` (owner session only), returns **derived** health per automation plus run analytics. Nothing is stored; no monitoring job; no aggregate table. Runs are attributed to an automation exactly like the card and its history (claim-linked `automation_id`, or a provider-submitted run of the same workflow + provider).

**Health states** reuse the domain's words — `healthy`, `running`, `needs_setup`, `needs_attention`, `never_run`, `disabled` — with plain reasons (each reason is also what to do), `interventionRequired`, retry state (`attempt of 3`, in flight, exhausted), last run / last success / last failure, trigger, next expected run. Rules: disabled is never intervention; an in-flight claim over 60 min old is attention, not "running"; an expired/revoked credential is attention even after a past success (the next run would fail); a connected provider with no scheduled claim yet needs setup; a provider with no credential record but a past success is not blamed twice.

**Analytics** (window 7/30/90 days): runs, finished, in progress, succeeded / partial / failed, success rate (**succeeded ÷ finished; partial counted separately, never as success**), scheduled vs manual vs retry, retry attempts and recoveries, by provider, by workflow, average completion (includes provider time; shown as such), source problems (unavailable/blocked/error counted by source type — "zero"/"skipped" are not problems), recent failures (category only, never `error_detail`). Bounded to 500 rows (`truncated` flagged).

UI: Automations card shows the derived badge + reasons + retry line; an **Automation activity** panel (period selector, empty/loading/error states). If insights cannot load, the cards fall back to the AI-11A state badge and nothing else changes.

## 5. Scheduling UX (Part D) and readiness (Part G)

The setup dialog now states, from the stored automation: the zone the schedule is in (the automation's, not the browser's), the next expected occurrence in that zone, the 3-hour catch-up rule (only the latest eligible occurrence; edits never replay older ones), what **Disabled** does (claims answered DISABLED, nothing created), and that **Run in provider** is an attended Manual run that never replaces or moves the next scheduled occurrence. The catch-up hours are mirrored and drift-tested against the server grace. No execution semantics changed.

Readiness: `ProviderSchedulerStatus` gains an additive `credential` (`none | active | expired | revoked`) derived from token metadata and the OAuth client list (a client that was used and now has no active grant reads as expired; a never-used registration is not a lapse). `schedulerView()` distinguishes **not connected / credential expired / credential revoked / cannot save results (read-only) / needs setup / needs validation / ready**, and says "an automation uses X, so its provider runs will be refused" when an automation depends on a provider that cannot serve it. READY still comes only from run evidence.

## 6. Stable manual client key (Part E)

Audit: the claim already requires a client key matching `^[A-Za-z0-9_-]{8,64}$`, unique per automation (`manual:<automation>:<key>`), idempotent, and binding is provider-from-credential. The defect was asking the **provider** to construct `manual-<current UTC time>`. Now JobQuest generates the key (`m` + 20 hex of a CSPRNG UUID) per setup request, embeds it verbatim in the run-once text ("copy this clientKey EXACTLY; never build or regenerate it from a clock"), and shows it with an explanation. **Re-pasting the same text, even in a new chat, is the same run.** "New run (new key)" fetches fresh instructions. It is an idempotency key, not a secret (it only means something inside one automation and the claim still needs the provider-bound credential). Scheduled occurrence keys (`auto:<id>:<UTC stamp>`) and the retry keys are untouched; the existing 8-concurrent-claims and idempotent-retry integration tests still pass.

## 7. Other connector credentials (Part F)

Providers → **Other connector credentials**: shown only when such credentials exist (so the OAuth-first cards stay uncluttered). It lists tokens the provider cards cannot show — `provider = null`, and tokens for providers whose card does not list tokens (Gemini/ChatGPT use OAuth) — with name, safe prefix, scopes, created, expiry, last used, provider (or "Not bound to a provider (cannot claim automation runs)"), state, and **Revoke** (confirm dialog) through the existing `POST /api/ai/connector-tokens/:id/revoke`. Expired/revoked history sits in a collapsed list. The list API returns metadata only (no token, hash or session id) and nothing was added to it; no new revoke mechanism exists. An e2e test revokes a seeded credential and asserts `revoked_at` in the database.

## 8. Same-day Daily Digest refresh (Part H) — decision: KEEP

Options: A keep the immutable same-day snapshot; B explicit refresh creating a replacement/version; C refresh-in-place. **Decision A.** The digest is composed at the end of the claimed run, after the provider's findings are stored, so the scheduled path already produces a digest that reflects that run. A second same-day digest would need either a version column (migration) or an overwrite that breaks auditability ("what did I see this morning?"), for a benefit the Weekly Digest and the live Overview already cover (the Overview shows current state; the Daily Digest page already labels a missing today-digest and offers Generate). No compelling user value for the cost; behaviour unchanged and still tested (AI11C).

## 9. Digest lookbacks (Part I) — decision: KEEP FIXED

attention 7 d · email 3 d · jobs 7 d · recruiters 14 d · upcoming 7 d (`DIGEST_LOOKBACK_DAYS`). Making them configurable would need per-owner settings storage (the workflow-config row is per automation/provider, the digest is provider-neutral), validation, UI, and would make two owners' digests incomparable, with no evidence that the defaults hurt. The Weekly Digest is the "longer view". Defaults are documented here and in the Daily Digest copy; revisit only on concrete user feedback.

## 10. Security / privacy

No migration, no RPC, no new table, no MCP tool, no new write path. All new reads are GET, owner-session, RLS-scoped as the caller, owner-filtered; workspace membership is checked explicitly for the weekly report (non-member → 403, not an empty "quiet week"). Responses carry no raw email, calendar payload, token, hash or secret; failures expose the normalized category only. The run key is not a secret. Untrusted record text is rendered as escaped React text. No CSRF surface was added (GET only); the revoke route keeps its CSRF protection.

## 11. Verification (local)

Typecheck (root + 3 workspaces), eslint, build, bundle secret scan, unit (incl. 29 new core + 21 new UI), real-DB integration (AI-11A/C/F/G regression + 6 new AI-11H tests, all green), e2e `ai11h-weekly` at 375/768/1280 with axe 0 critical/serious, `ai11a` + `ai7` + `ai11c` regression. Known intermittent flakes (m3-applications RPC-06, ai11b-email 375px) were not touched.

## 12. Files

API: `lib/aiContract/{weekly,automationHealth,schedulerSetup,providerAdapters}.ts`, `services/{aiWeeklyDigestService,aiAutomationInsightsService,aiSchedulerStatusService,aiDigestService}.ts`, `routes/{aiDigest,aiAutomations}.ts`.
Web: `views/AiHubWeekly.tsx`, `lib/aiWeekly.ts`, `components/ai/{AutomationActivity,LegacyCredentialsPanel,AutomationSetupDialog,AutomationsPanel,ProviderSchedulerSummary}.tsx`, `lib/{aiScheduler,aiAutomation,providerConnectors,aiHub}.ts`, `api/{aiDigest,aiAutomations}.ts`.
Tests: `tests/unit/ai-11h-{core,ui}.test.ts`, `tests/integration/ai-11h-weekly.test.ts`, `e2e/ai11h-weekly.spec.ts` (+ updated tab-list assertions in ai-6/ai-7/ai-8 unit tests and `ai11a` e2e labels).
