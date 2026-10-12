# AI-8 — Human-approved controlled actions + Application matching

Branch `feature/ai-8-controlled-actions` (one cumulative branch) from development `4eac989c364a59982bd49c6ea81b13ffd6bff4a7`.
Final branch CI / merge / development CI results are recorded in the operator checkpoint.

AI-7 closure facts were persisted first (CURRENT_AGENT_STATE, HANDOFF, ROADMAP, PHASE_REGISTRY): development `4eac989c…`, development CI `38253737675` PASS,
branch CI `38252291451` PASS, AI-7 executable SHA `01dc9a18…`. The stale AI-6 workflow definitions (job discovery, email triage, recruiter intelligence said
"source integration not implemented") were corrected: all five workflows are `AVAILABLE`; scheduling stays provider-owned (JobQuest has no scheduler).

## 1. Human approval architecture

```
ai_suggestions (inert, strict payload)
  -> Preview (read-only)        GET  /api/ai/actions/preview   target resolved server-side, current vs proposed state, warnings, fingerprint
  -> human reviews + chooses, clicks the action-specific Confirm
  -> Confirm                    POST /api/ai/actions/execute   CSRF + strict body: suggestion id, fingerprint, the human's choices
  -> server rebuilds the plan from fresh reads (the browser's preview is never trusted), compares the fingerprint (ACTION_STALE)
  -> rpc_ai_action_claim        idempotency gate (service_role; row lock; unique live indexes)
  -> ONE core mutation AS THE CALLER (RLS inserts / existing stage + outcome RPCs)
  -> rpc_ai_action_complete     provenance row, suggestion ACCEPTED, lead link, audit event
```

There is no unattended path. A created suggestion, provider confidence, high priority, a strong match, a manager role or a scheduled workflow never
authorizes execution; each core mutation needs its own explicit confirmation, one at a time. Services: `aiActionService.ts` (no provider logic),
`aiApplicationMatchService.ts`, route `aiActions.ts`.

## 2. Allowed action types / 3. Prohibited actions

| Action | Payload (`proposed`, strict) | Core path used |
|---|---|---|
| `create_application` (job lead only) | `priority`, `reason` | RLS insert into `applications` (+ `job_snapshots`) as the caller; the existing `CREATED` / `CAPTURED` triggers |
| `create_task` | `title` (required), `details`, `due_date`, `priority`, `task_type`, `reason` | RLS insert into `tasks` as the caller |
| `set_status` | exactly one of `stage` (an existing workflow stage) or `outcome` (`REJECTED` only), `reason` | `rpc_ai_apply_status_change` (invoker) -> existing `rpc_move_application_stage` / `rpc_set_application_outcome` |

Prohibited and not implemented: application deletion, bulk changes, contact edits, email send/reply/mailbox change, calendar create/edit/delete/RSVP, recruiter
outreach, automatic lead conversion, automated status changes, auto-complete tasks, arbitrary SQL or "update any field", chained or multi-record unattended actions,
approve-all. A provider can still *propose* any `AI_SUGGESTION_ACTIONS` value (`create_followup`, `link_contact`, `schedule_interview`, `other`) - those stay inert
(`ACTION_NOT_SUPPORTED`). Unknown actions (`execute_sql`, `update_anything`) and unknown/hidden fields are rejected by the validator.

## 4. Preview -> confirm

Preview returns: action type, human summary, source finding, current state, proposed state, warnings, match result and candidates, what the human still must
decide, the allowed choices, safe editable defaults (tasks), and the fingerprint. It performs no write (proved: no application/task/execution row changes). Confirm
reloads the suggestion, finding, job lead and candidates, re-checks ownership/membership (RLS), recomputes the fingerprint, validates the human's choices against the
server's own candidates, claims the idempotency identity, mutates once, records the result. Cancelling a dialog records nothing.

## 5. Stale / conflict handling

The fingerprint is sha256 of the suggestion, finding, lead and target-application versions plus the match candidates (id, `updated_at`, stage, status). A mismatch is
`ACTION_STALE` ("The underlying record changed. Review the updated action before confirming."); the UI regenerates the preview and nothing is overwritten. For status
changes the guard is also atomic in the database: `rpc_ai_apply_status_change` locks the application, compares `updated_at`, rejects archived/closed records, then calls
the existing RPC in the same transaction. Already-at-target and closed applications are `ACTION_CONFLICT`. Dismissed/superseded/expired findings block their suggestions.

## 6. Idempotency

`ai_action_executions` carries unique partial indexes over live (PENDING|SUCCEEDED) rows: per `suggestion_id`, per `(workspace_id, idempotency_key)` (server-owned sha256 of
workspace + suggestion + action + logical target) and per `finding_id` for `create_application`. Proven: a double click, three concurrent confirms, an HTTP retry, a second
suggestion for the same lead (it becomes `SUPERSEDED`) and a browser double-click all yield exactly one application/task/stage change; replays answer
`ACTION_ALREADY_EXECUTED` with the existing target. A FAILED/CONFLICT row never blocks a deliberate retry; failed mutations are not retried automatically. A crash between
"mutate" and "record" leaves a PENDING row that the next attempt reconciles (applications by their server pre-generated id; tasks - whose `id` is not client-writable - by an
`AI Hub action ref:` line in the task notes), after a 2-minute grace so a live request is never double-run.

## 7. Application matching

Server-owned, provider text is only a hint, candidates come only from the caller's own non-archived applications read under RLS (peers/other workspaces can never appear).
Outcomes: **EXACT** (a JobQuest-written lead link; the same external job id with compatible sources; the same canonical URL), **STRONG** (same normalized company + title with
agreeing context - location, arrangement, URL host - or a nearby date, and no conflicting context), **AMBIGUOUS** (several candidates in the winning tier, or company+title with
conflicting/no context), **NONE**. Company alone is never enough. No hidden numeric score; ordering is tier, most recent activity, id (deterministic). AMBIGUOUS never auto-selects:
the human picks among the server's candidates (an id outside them is `ACTION_VALIDATION_FAILED`) or explicitly creates new / chooses "no application". Legal suffixes and punctuation
do not split a company (`Acme, Inc.` = `ACME`). The AI-6 cross-provider note was reviewed: the lead child table only ever accumulates identity and conversion is keyed by the
finding, so no schema change was needed.

## 8. Job lead -> Application

Review shows company, title, location, arrangement, employment type, source URL, published (annual) salary, description availability, discovered date and possible existing
matches. EXACT: another Application is not offered (open it, or link the lead to it). STRONG/AMBIGUOUS: link to an existing one, or create another only after an explicit
checkbox (`duplicate_override_flag` is then set, an existing field). Field mapping uses only validated lead fields (arrangement/employment mapped to the existing values; salary only
when annual; long external ids/locations bounded with a warning; over-long company/title blocks conversion); nothing is invented. **Initial stage is `SAVED`** (an existing stage meaning
"not applied yet") so no applied claim is made; no AI-specific stage exists. After success the lead is kept as history, `ai_findings.application_id` is written by JobQuest (never the
provider), the finding becomes `ACCEPTED`, and the lead shows "Application created". A repeat shows "Already converted" and opens the Application.

## 9. Task creation / 10. Status updates

Tasks come from email/calendar/lead/recruiter findings. The due date is the suggestion's `due_date`, else the finding deadline converted in the owner's profile zone, shown with its
source and editable. Title, details, due date and priority are the only editable fields; the task is linked to the single matching application (or none/the human's choice) and its notes
carry a provenance line. Status changes show Current -> Proposed with bounded evidence; only an existing stage or REJECTED is possible; vague inference is not enough - an explicit
suggestion, a supporting finding and a human confirmation are all required.

## 11. Audit / provenance

Core audit stays authoritative for the record (`application_events`, the task row). `ai_action_executions` (+ `audit_events` `AI_ACTION_EXECUTED|FAILED|CONFLICT`, scope `AI_*`) records
who approved which suggestion, what it targeted, when and the outcome, with bounded safe snapshots - the two are deliberately not duplicated. No secrets or provider payloads are stored.

## 12. Authorization / RLS

No AI superuser: all reads and the core mutation use the user's own token. Execution is owner-only (a manager can read a member's AI rows but cannot preview, confirm or ignore them);
peer / other workspace / forged workspace / suspended all get "not found". `ai_action_executions` is SELECT-only for clients under `can_access_owned_record` (owner and active manager read; peer,
other workspace, suspended do not); `rpc_ai_action_claim/complete` are service_role only; `rpc_ai_apply_status_change` is SECURITY INVOKER and refuses another user's application. All
tested against the real local database (`tests/integration/ai-8-actions.test.ts`).

## 13. MCP non-write decision

MCP still has 11 tools (10 reads, 1 AI-Hub-only write, `jobquest_submit_ai_result`). There is no `create_application` / `update_application` / `create_task` tool and no scope for one. Keeping
execution out of MCP means a scheduled provider can only propose; a person approves in the browser. `tests/unit/ai-8-actions.test.ts` asserts the registry, scopes and that the MCP/ingestion code never
references the action service or its RPCs.

## 14. UI

`/ai-hub/actions` (tab **Actions**, 8th-tab shell kept usable): Pending (filters: action, source, provider, date range) and Completed/failed history; cards offer only **Review**; the review dialog shows Action,
Source, Match status, Current/Proposed state, Warnings and choices with action-specific confirm labels. Overview "Pending actions" card, Daily Digest line (link only), Job Leads "Application created" /
"Review application action". Friendly messages for stale, ambiguous, already converted and permission errors; never raw database text. No bulk approval anywhere.

## 15. E2E

`e2e/ai8-actions.spec.ts` joins the isolated `ai-hub-e2e` job (synthetic data, flags only in that job): empty state, filters, Job Lead preview, cancel (nothing created), confirm + double click (one application),
repeat/twin blocked, task preview + edit + confirm, status preview + confirm, ambiguous match (nothing pre-selected, duplicate needs a checkbox, link instead of create), ambiguous task, stale-state conflict then
regenerated confirm, history, Pending-actions metric (Overview + Digest), Job Leads badge, 8-tab clipping/reachability and no-overflow at 375/768/1280 including the dialog, axe (0 serious/critical) on the page and every dialog state.

## 16. Migration

`20261029100000_ai_hub_controlled_actions.sql`: `ai_action_executions` (+ RLS select), `rpc_ai_action_claim`, `rpc_ai_action_complete`, `rpc_ai_apply_status_change`. No core table change, no vocabulary change
(`create_application`, `create_task`, `set_status` already existed in the AI-1A CHECK). Applied to the LOCAL stack; Dev (`jobquest-dev / xpnkasclquplmrcmhsif`) only after branch CI. Production head stays `20261022100000`.

## 17. Local validation (before push)

| Check | Result |
|---|---|
| Unit suite (full) | 46 files, 743/743 (new: `ai-8-actions` 26, `ai-8-actions-ui` 24; updated: ai-5/6/7 UI, ai-7-ci, integration-service fixtures) |
| Integration AI suites 1B/2A/2B/3/4/5/6/7 + AI-8 + m3/m6 core (real local DB) | 13 files, 180/180; `ai-8-actions` 21/21 (authz x6 actors, RLS, claim/complete misuse, idempotency incl. concurrency, stale, crash recovery for tasks and lead conversion, HTTP CSRF/strict body) |
| Focused e2e `ai8-actions` (flags ON locally) | PASS x4; axe 0 serious/critical; 375/768/1280 |
| Root typecheck / eslint / build / bundle scan / tracked-file secret scan | PASS / PASS / PASS / 0 findings / 0 findings |

Known local-only note: `ai5-digest` and `ai7-calendar` fail a colour-contrast audit on this Windows machine **on `development` as well** (pre-existing hover/transition timing on `primary` buttons; they pass in CI). AI-8's own
spec parks the pointer and lets transitions settle before measuring.

## 17b. Independent security review (read-only, once)

Verdict PASS, no blocking issue (owner-only enforcement, server-side target resolution, no filter injection, grants, idempotency, no leaks, no out-of-scope action path). Four reliability findings were fixed: (1) a stale PENDING lead conversion could stay "in progress" forever - the claim now reconciles it after the 2-minute grace; (2) claim/complete now lock finding-then-suggestion in the same order (no deadlock); (3) an ambiguous mutation failure first checks whether the record landed before recording FAILED; (4) an Ignore that races a successful mutation no longer leaves the suggestion IGNORED. Regression tests: AI8-17b, AI8-17c.

## 18. Edge notes

- A pre-AI-8 suggestion whose `proposed` does not match the strict schema is not actionable: hidden from the queue and `BLOCKED` if opened. The Overview count (a database count over supported actions) can include such a legacy row; the queue total on a single page is exact.
- No undo is promised. Application creation has no deletion-based undo; a later manual stage change is possible but is not labelled undo; the execution history keeps the previous state for audit.
- Other terminal outcomes (ACCEPTED, WITHDRAWN, GHOSTED, POSITION_CLOSED) are deliberately not proposable yet.

## 19. Deferred

Email send/reply, calendar mutation / RSVP, recruiter outreach, bulk AI actions, autonomous core writes, ChatGPT and Gemini providers, OAuth, universal undo, other status outcomes, Production rollout.
