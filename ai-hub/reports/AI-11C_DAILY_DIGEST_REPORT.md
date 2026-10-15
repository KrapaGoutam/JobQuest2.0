# AI-11C — Daily Digest: Report

**Status:** IN PROGRESS on `feature/ai11c-daily-digest` (from development `e0ae3a2363208939d001132fe3f999ccfb560553`, verified unchanged by fetch). Branch CI, development merge SHA, development CI and Dev-migration status are recorded in the chat completion checkpoint (no docs push while an exact application SHA is certifying).

## 1. Reuse audit (what already exists)

| Concern | Existing implementation (AI-5, extended by AI-6/7/11B) |
|---|---|
| Digest persistence | An `ai_findings` row, `kind = workflow = 'daily_brief'`. No digest table (asserted by an integration test). |
| Identity / idempotency | `dedupe_key = daily_brief:<YYYY-MM-DD>:<provider>`, unique `(workspace, owner, kind, dedupe_key)`. Same `external_run_id` retry = no-op; later run, same date, still NEW = same row refreshed; closed digests never reopen. |
| Providers | `claude`, `chatgpt`, `gemini`, `manual` submit through `jobquest_submit_ai_result`; `system` = JobQuest's own deterministic digest. |
| Generation | `generateSystemDigest` → `buildDeterministicDigest` (pure aggregation over owner-scoped RLS reads) → `toSystemDigestWire` → `ingestAiResult` (the only write path). Route `POST /api/ai/digest/generate` (session + CSRF + kill switch); only TODAY can be generated. |
| Date semantics | Calendar date in the owner's profile time zone (`profiles.timezone`, UTC when unset), DST-safe local-day windows (`localDayWindow`). |
| Run linkage | Ingest creates the `ai_runs` row (workflow `daily_brief`, provider `system`, external id `system-digest:<date>`). AI-11A derives automation last-run/success/error from `ai_runs`, so a digest run is already visible to automations. |
| Source health | `ran(workflow)` over `ai_runs` (SUCCEEDED/PARTIAL ever) → section `available` / `zero` ("source ran, found nothing") / `not_configured` ("source has never run"). |
| Read | `aiReadService.listAiDigests/getAiDigest` return the stored payload as saved; MCP `jobquest_list_daily_digests` (read-only) passes it through; browser reads under RLS (`api/aiDigest.ts`). |
| UI | AI Hub → Daily Digest (`AiHubDigest.tsx`, `lib/aiDigest.ts`): presets Today/Yesterday/Last 7/Custom, provider filter, history, combined (All providers) view, live-metrics fallback. |
| Source DTO mappers | `toEmailEvent` (AI-11B taxonomy, group/urgency/action/deadline), `attachEmailApplicationMatches` (MATCHED/POSSIBLE/UNMATCHED), `toJobLead`, `toRecruiterIntel`, `toCalendarEvent`. |

Gaps relative to the AI-11C product goal: the AI-5 digest is a *count-of-today* digest (email/lead/recruiter windows are "created today"; no urgency ordering; no Needs-Attention section; no job-vs-other email split; no per-item company/deadline/action/application link; calendar and interviews are separate sections; tasks are not read).

## 2. Architecture decision

**B — EXTEND the existing Daily Digest.** Not A (the AI-5 payload cannot express a prioritized attention snapshot). Not C (the `daily_brief` finding, dedupe identity, snapshot semantics, ingestion boundary, read services, MCP tool and UI all fit; a second digest concept would duplicate storage and fork the UI).

- **Storage:** unchanged. Payload version `1.0` → `1.1` (additive, same major). The validator accepts both; stored 1.0 digests (including provider narratives) keep rendering.
- **Database:** UNCHANGED. The payload stays under the existing 16 KiB cap enforced by `rpc_ai_ingest_finding`; the composer enforces a deterministic byte budget instead of raising the cap (which would need a migration).
- **Composition** lives in one pure module (`aiContract/digestComposer.ts`); the service only reads and calls it. Provider-specific code never composes.
- **Canonical sections (display order):** `needs_attention`, `job_email`, `other_email`, `upcoming` (calendar + JobQuest interviews, cancelled excluded), `job_leads` (recent), `recruiter_intel`, `follow_ups`. Legacy section keys (`applications`, `email_activity`, `calendar`, `ai_suggestions`) remain valid for provider-submitted digests and render after the canonical sections only when present.
- **No MCP change:** the tool returns the stored payload as saved; 11 tools, still read-only.
- **No new generation trigger:** the existing user-initiated route stays the only JobQuest generator; scheduled execution stays AI-11F/G.

## 3. Digest source model (existing records only)

| Section | Source (all existing, owner + workspace scoped, RLS as the user) | Window | Bound |
|---|---|---|---|
| Needs attention | HIGH/open email (the shared `emailNeedsAttention` definition), JobQuest interviews today, calendar meetings today / deadlines within 48h / rescheduled soon, overdue or due-today application follow-ups and pending tasks | attention lookback 7 local days; rest by local day | 6 items, count exact |
| Job-related email / Other important email | AI-11B `email_event` findings (group, urgency, action, deadline, derived application match) | 3 local days | 8 / 4 items; LOW capped at 2; other-mail LOW collapsed in the UI |
| Upcoming | AI-7 calendar intelligence (scheduled/tentative/rescheduled; **cancelled excluded**) + JobQuest interviews, deduplicated by company + start (the interview wins) | today + 7 local days | 6 items |
| Recent job leads | `ai_job_leads` (active findings only; best match, then newest; never an application) | 7 local days | 6 items |
| Recruiters | `recruiter_intel` findings; related-lead first, then tracked companies, then verified; no contact data | 14 local days | 4 items |
| Follow-ups | applications `next_action_date <= today` (OPEN) + PENDING tasks due or overdue; read-only | all overdue/due | 5 items |

Counts always come from exact head queries; item lists are the deterministic top-N. Ordering is fully deterministic (tier, time, recency, id; the composer is order-independent and does not mutate its input). A recruiter reply, interview or assessment needing action lands in Needs attention; job leads can never enter it, however many exist. An item shown in Needs attention is flagged (`attention: true`) in its source section and rendered there as a one-line reference ("Also listed under Needs attention"), not as a second record.

## 4. Payload 1.1 (additive over 1.0)

- Version: validator accepts `1.0` (stored as 1.0) and `1.1`; a newer minor is stored as 1.1 with a warning.
- New sections: `needs_attention`, `job_email`, `other_email`. New status: `unavailable` (no items, no count). Legacy sections (`applications`, `email_activity`, `calendar`, `ai_suggestions`) stay valid for provider digests; the JobQuest digest no longer emits them.
- New optional item fields (bounded plain data): `kind`, `company`, `urgency`, `deadline_at`, `action`, `score`, `tags` (≤3), `ref {type,id}`, `application {id,label}`, `attention`, `verification`. Malformed values are rejected (not silently kept).
- New summary keys: `needs_attention`, `job_emails`, `other_emails`, `upcoming`, `recent_jobs`, `recruiters` (headline counts; `follow_ups` reused).
- Per-section item caps (`DIGEST_SECTION_ITEM_LIMITS`) and a deterministic byte budget (`DIGEST_BYTE_BUDGET` 15,000 < the 16,384 RPC cap): if a worst-case digest would exceed it, the least important items are dropped first and `count` is kept ("Showing x of N"). The cap itself is unchanged, so no migration.
- Mirrored in `apps/web/src/lib/aiDigest.ts`; drift tests in `ai-5-digest-ui.test.ts`.

## 5. Date / timezone / snapshot semantics

- Unchanged authority: `profiles.timezone` (UTC when unset; nothing user-specific is hardcoded). All windows are local-day windows from `localDayWindow` (DST-safe: 23h/25h days tested; the fall-back lookback start and spring-forward end use the real offsets).
- Only TODAY can be generated (date derived from the owner zone, never accepted). Identity stays `daily_brief:<date>:<provider>`; the run id `system-digest:<date>` is stable, so regenerating the same day is a no-op duplicate run (existing semantics preserved: the morning snapshot is not silently refreshed by a later click). A new day is a new snapshot; earlier snapshots are never recomputed (integration test AI11C-02 adds a HIGH email and an application afterwards and the stored payload is byte-identical).
- Source state: `unavailable` = the latest SUCCEEDED/PARTIAL/FAILED `ai_runs` row of the source workflow is FAILED and nothing is stored; `not_configured` = no such run ever; `zero` = latest run succeeded and nothing in the window; stored data always wins (`available`).

## 6. Provider flow, automation and MCP

- Providers still submit `jobquest.ai-result` (daily_brief) through `jobquest_submit_ai_result`; the validator accepts the same 1.1 shape from claude/chatgpt/gemini/manual; provider templates carry a short 1.1 note. JobQuest's own digest (`system`) is the canonical composition. An application link is only honoured in the UI for `system` digests (a provider-forged link is dropped).
- AI-11A: automations derive last run from `ai_runs` by (workflow, provider); a Claude 1.1 digest drives a `daily_brief`/`claude` automation's state (integration test AI11C-06). `system` is not a selectable automation provider (no scheduler exists); JobQuest's digest runs are recorded as `manual`. No scheduling, no Run Now executor (AI-11F/G).
- MCP: UNCHANGED. `jobquest_list_daily_digests` returns the stored payload as saved, so 1.1 is visible without a code change; still read-only; still 11 tools; no new tool, scope or mutation.

## 7. UI

AI Hub → Daily Digest: owner-zone date header, headline counts (Need attention, Job emails, Upcoming, Recent jobs, Recruiters, Follow-ups), source-availability chips (None found / Not configured / Unavailable), the seven sections in order, job/other email grouped HIGH/MEDIUM/LOW under real headings, per-item kind, company, summary, **Due** (owner zone), **Next** action, match score, verification, "View all" links to the source tab and an application link button (navigation only). Presets/history/provider filter/combined view reused. Stored 1.0 digests render in their original layout. Everything is rendered as escaped React text.

## 8. Database / migration

**UNCHANGED. No migration.** (The digest stays an `ai_findings` row; the ingest RPC payload cap is respected by the composer.) Remote Dev migration: NOT REQUIRED.

## 9. Validation (local)

| Check | Result |
|---|---|
| New unit `ai-11c-digest.test.ts` (composer, ranking, bounds/worst-case size vs cap, determinism, source states, privacy, prompt-injection inertness, windows/DST/boundaries, owner-scoped reads, no writes, validator 1.0/1.1, ingestion boundary, idempotent identity) | 39/39 |
| New unit `ai-11c-digest-ui.test.ts` (order, grouping, escaping, link trust, honest states, legacy layout, combined view) | 16/16 |
| Updated `ai-5-digest`, `ai-5-digest-ui`, `ai-6-digest` unit tests | pass |
| Full unit suite (once) | 56 files, 972/972 |
| New integration `ai-11c-digest.test.ts` (real local DB: compose from records, snapshot immutability, idempotency, peer/cross-workspace isolation, no core mutation, hostile text inert, empty/unavailable states, AI-11A automation, no client writes) | 7/7 |
| Regression integration `ai-1b`..`ai-11b` + updated `ai-5`, `ai-6`, `ai-7` digest tests | all pass |
| Focused e2e `ai11c-digest.spec.ts` (real generation through the UI, snapshot, application link navigation, every section, 375/768/1280 no horizontal overflow, axe wcag2a/2aa/21/22aa, keyboard) | PASS: overflow 0 at all 6 checks, axe 0 critical/serious |
| e2e `ai5-digest`, `ai6-sources`, `ai7-calendar`, `ai8-actions`, `ai11a-automations`, `ai11b-email` | pass (AI-5/6/7 expectations updated to the canonical section names) |
| `pnpm typecheck` / `eslint .` | PASS / PASS |

Note: the AI Hub e2e specs are local-only (flags are OFF in CI by design). The new spec waits two animation frames after a viewport resize before measuring: measuring immediately raced the AI Hub tab strip (intermittent, also visible in the unchanged AI-11B spec).

## 10. Existing tests changed (superseded semantics, not removed coverage)

The AI-5/6/7 digest tests asserted the old "counts of today" digest (applications section, email_activity, calendar surfaced cancellations, strong-match counts). Those facts are replaced by the AI-11C rules (cancelled excluded, canonical sections, honest `score` only when stored). Equivalent invariants (source independence, unsafe URL suppression, owner scoping, snapshot stability, kill switch, fail-closed reads) were ported, not dropped.

## 11. Deferred (unchanged)

AI-11D fresh job discovery; AI-11E recruiter discovery; AI-11F cadence execution; AI-11G provider scheduler adapters (Run Now executor); AI-11H weekly digest + automation-health UI; digest email delivery (provider-side only); JobQuest-side narrative prose (none needed; no paid LLM call).

## 12. Limitations

- A morning snapshot is not refreshed by a later same-day click (existing idempotency; a deliberate AI-5 decision). A "refresh today" feature would need a product decision on snapshot semantics.
- Needs-attention lookback (7 days) and email lookback (3 days) are fixed constants (`DIGEST_LOOKBACK_DAYS`), not user settings.
- `unavailable` reflects only the latest ai_runs row of the source workflow (any provider).
