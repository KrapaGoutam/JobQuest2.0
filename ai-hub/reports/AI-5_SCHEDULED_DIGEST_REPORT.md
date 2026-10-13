# AI-5 — Scheduled Intelligence + Daily Digest Foundation: Report

**Status:** AI-5 READY FOR BRANCH CI (local validation complete). Branch `feature/ai-5-scheduled-digest`, base development `498d3342765deb252cceefb287940d3d83382814` (unchanged by fetch). AI-4 closure docs carried by cherry-pick of `d3f90f3b` (docs-only: AI-4 report/state, handoff, roadmap, registry) as `76322f69`; `docs/ai-4-closure` was not pushed. Branch CI, development merge and development CI results are recorded in the chat checkpoint (no docs push while an exact application SHA is certifying) and in the closure docs carried by the next phase.

## 1. Roadmap re-sequencing (operator-approved)
AI-5 was "Gemini". It is now **Scheduled Intelligence + Daily Digest Foundation**; **AI-6** becomes **External Intelligence Sources** (email + job discovery + recruiter intelligence over one AI-result path; calendar may be separate); the Gemini and ChatGPT provider phases move after AI-6. Reason: Claude is verified and can run scheduled tasks, and a provider-neutral digest/scheduled-result model must exist so provider capabilities do not dictate storage. The original order is preserved in `ROADMAP.md` / `PHASE_REGISTRY.md` as historical labels. ChatGPT custom MCP availability differs by plan/product; Gemini API remote MCP does not imply consumer Google AI Pro scheduled integration - both need separate capability validation (documented in `PROVIDER_INTEGRATION_PLAN.md` and the operator guide).

## 2. Digest model
- **A digest is an `ai_findings` row. No `ai_daily_digests` table** (AI-0 decision kept; asserted by an integration test).
- **Workflow/kind: the existing canonical `daily_brief`** (product name "Daily Digest"). The prompt preferred `daily_digest` "if compatible with existing enums/contracts". The existing `daily_brief` value already was the AI-0-designated digest identity (`DATA_MODEL_PLAN` section 5, workflow flags, labels), so adding `daily_digest` would create two overlapping values and require a CHECK-constraint migration on three tables for no capability gain. Reversal path if the operator prefers the literal name: one migration + enum/test update. **This is the one deliberate deviation from the prompt's wording; no other behaviour depends on it.**
- **Identity / idempotency:** `dedupe_key = daily_brief:<digest_date>:<provider>` (provider is part of a digest's identity; the only exception to "provider is not a dedupe input"); DB unique `(workspace_id, user_id, kind, dedupe_key)`. One digest per owner + date + provider. Same `external_run_id` retry = idempotent run (no change); later run, same date = same row refreshed while still NEW (never duplicates); closed digests are never reopened (existing `unchanged_closed`); different providers keep separate rows and provenance.
- **Providers:** `system` (existing enum value, no change) is JobQuest's own deterministic digest. JobQuest content is never attributed to `claude`.

## 3. Payload 1.0
`version`, `digest_date`, `time_zone?`, `generated_at?`, `summary` (optional integer counts: applications_added, active_applications, new_job_leads, strong_matches, recruiter_replies, interviews, assessments, follow_ups, pending_suggestions, new_findings; absent = not reported), `priorities[]` (<= 8), `sections` (applications, job_leads, email_activity, recruiter_intel, upcoming, follow_ups, ai_suggestions) each `{status: available|zero|not_configured, count?, items[] <= 5}`; items `{title, detail?, priority?, source?, url?, occurred_at?}`. Validator rules reject inconsistent sections (`zero` with items, `not_configured` with a count, `available` with nothing), unsupported major version, `digest_date != dedupe.date`, bad IANA zone, non-http(s) URLs, > 16 KiB; unknown keys dropped and counted; scope ids stripped. The conceptual `sources` map from the prompt is covered by per-section `status` plus the run's own `sources` (no duplicate field). Job leads stay generic `job_lead` finding payloads (no `ai_job_leads` table; AI-8 decision).

## 4. Date / time-zone semantics
`digest_date` is the calendar date in the **owner's profile time zone** (`profiles.timezone`, the same authority the rest of JobQuest uses for dates; UTC when unset), never the server UTC date. Local-day windows are computed with `Intl` including DST (23 h / 25 h days tested). The web UI derives Today/Yesterday/Last 7 days from the same zone. `POST /api/ai/digest/generate` can only create **today's** digest (no date parameter; past snapshots cannot be reconstructed).

## 5. Snapshot semantics
Stored payloads are returned exactly as saved. Nothing recomputes a historical digest from current state (integration test AI5-05 adds applications and re-reads the old digest unchanged; e2e re-checks). "Today without a digest" shows "No Daily Digest has been generated for today." plus separately labelled **live** metrics ("not a stored digest") fetched under RLS.

## 6. Aggregation service (Layer A) and source availability
`apps/api/src/services/aiDigestService.ts`: owner-scoped, RLS-as-user queries for applications added in the local day, active applications, follow-up candidates (existing `next_action_date <= digest date`, OPEN, non-archived), interviews (today / next 7 days), pending AI suggestions, new AI findings. Email, job leads and recruiter intel are reported `not_configured` (no source exists), never zero; `zero` is used only for sources JobQuest owns and found empty. Persistence goes through `ingestAiResult` only (provider `system`, run id `system-digest:<date>`): no direct `ai_*` writes. The generate route is owner session + CSRF + `AI_HUB_ENABLED`, membership enforced by `rpc_ai_ingest_run`.
Layer B (external narrative) is any provider submitting through the existing `jobquest_submit_ai_result`; no provider-specific route and no Anthropic API.

## 7. Reads, UI and combined view
`aiReadService.listAiDigests/getAiDigest` (RLS as caller; date-range prefix on the dedupe key, order `dedupe_key desc, id desc`, page size 7 default / 14 max, size+1 lookahead, range <= 366 days; dedupe key never exposed). UI `AI Hub -> Daily Digest` (`/ai-hub/digest`, behind the existing AI Hub exposure flag): Today / Yesterday / Last 7 days / Custom range, provider filter, header (date, provider, generated time in profile zone, source-availability chips, summary metrics), fixed section order, loading/error/empty/unsupported states. "All providers" shows a deterministic **Combined view** (max counts, case-insensitive exact-title dedupe with provider provenance, status precedence available > none found > not configured); no model is involved. Job Leads / Recruiter / Email / Calendar tabs stay hidden.

## 8. Workflow definitions and Claude scheduling model
`apps/web/src/lib/aiWorkflowDefinitions.ts`: Daily Digest, Job Discovery, Email Triage, Recruiter Intelligence, Calendar Intelligence with purpose, source, output, cadence recommendation, scopes, source readiness, provider compatibility and statuses (Available / Provider setup required / Source integration not implemented / Disabled). Settings -> AI & Automation -> Workflows renders them with the note that JobQuest does not run schedules. **No scheduler** (no cron library/background loop/Vercel cron; asserted by test); no screen can say "Running". Templates: `ai-hub/provider-workflows/claude/{DAILY_DIGEST,JOB_DISCOVERY,EMAIL_TRIAGE,RECRUITER_INTEL,CALENDAR_INTEL}.md`; operator guide `ai-hub/provider-workflows/CLAUDE_SCHEDULED_TASKS.md` (connector, scopes, approval mode, cadence, outputs, troubleshooting, revocation, privacy). Templates carry the safety rules (untrusted content, no core mutation, no fabrication, no raw email bodies, 500-char evidence), contain no credentials and are never activated by code. Whether a given Claude plan lets scheduled tasks use a custom connector is **not verified**; the operator's first manual run validates it.

## 9. MCP changes
One read-only tool added: `jobquest_list_daily_digests` (scope `ai:read`; `dateFrom/dateTo/provider/page/pageSize`); total 7 tools. No "generate digest" tool, no core write tool, no new scope. The submit tool description now mentions the digest. Registry/scope/description tests updated (`ai-3-mcp`, `ai-4-claude`, integration `ai-3-mcp`/`ai-4-claude`). No live Claude re-smoke (automated registry tests only, as scoped).

## 10. Workflow-config decision
`ai_workflow_configs` mutation was assessed and **not added**: nothing reads those preferences (no JobQuest scheduler; ingest does not consult them), JobQuest cannot observe a provider's real schedule or next run, and storing "enabled/cadence" would imply control that does not exist. Requirements if revisited are recorded in `SECURITY_AUTH.md` (owner-only, audited, bounded workflow ids, no credentials, no claim of controlling the provider). Suggestion cross-run policy and closed-finding supersession remain deferred; digests never reopen closed findings; no application matching was built.

## 11. Migration / database
**None.** Dev head `20261026100000`; Prod head `20261022100000`; Production DB untouched; no Dev migration applied in AI-5.

## 12. Tests (local, before push)
| Check | Result |
|---|---|
| New unit `ai-5-digest.test.ts` (payload contract, dedupe identity, reads query shape, time zone/DST, deterministic aggregation, system digest through ingestion boundary) | 35/35 |
| New unit `ai-5-digest-ui.test.ts` (client/server sync, parser, combined view, ranges, all panel states, navigation, workflow definitions, no scheduler) | 32/32 |
| New integration `ai-5-digest.test.ts` (real local DB: model, retry idempotency, providers, date/provider filters, snapshot stability, owner/manager/peer/cross-workspace RLS, no client writes, system digest + owner time zone, kill switch) | 9/9 |
| Regression integration `ai-1b`, `ai-2a`, `ai-2b`, `ai-3-mcp`, `ai-4-claude` (+ AI-5) | 67/67 |
| Full unit suite (once) | 35 files, 496/496 |
| E2E `e2e/ai5-digest.spec.ts` (real API+web, today empty -> save JobQuest digest -> second provider -> combined; Today/Yesterday/custom/provider filter; keyboard; snapshot) | PASS |
| Responsive digest check 375 / 768 / 1280 | 0 px horizontal overflow at all three; screenshots in `test-results/screenshots/ai5-digest-*` |
| Accessibility (axe wcag2a/2aa/21/22aa, six page states) | 0 serious/critical; headings h2/h3/h4, labelled filter and date controls, `aria-pressed` presets, alert/status roles, no color-only state (text labels) and existing design tokens only (no new date indicator) |
| Root `pnpm typecheck` | PASS (`ai-5-digest-ui.test.ts` excluded from the root tsconfig like the other React-rendering tests; web/vitest cover it) |
| `eslint .` | PASS |
| `pnpm build`, `check:bundle` | PASS (3 files, 0 findings) |

## 13. Deferred / remaining
External source integrations (email, job discovery, recruiter, calendar) = AI-6+; ChatGPT and Gemini providers; `ai_workflow_configs` mutation; suggestion cross-run policy; closed-finding supersession; application matching; JobQuest-native scheduling (only if ever required); OAuth; retention purge job; main/Production release (frozen until the separately authorized gate).

## 14. Notes for the operator
- The legacy digest payload shape (`date/highlights/total_items`) never shipped operationally; the validator now requires payload 1.0 and the UI shows any other stored payload as "format cannot be displayed".
- The operator-visible Daily Digest page requires `VITE_AI_HUB_ENABLED=true`; the generate route and MCP reads require `AI_HUB_ENABLED=true`.
