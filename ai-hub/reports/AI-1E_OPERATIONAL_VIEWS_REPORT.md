# AI-1E — Overview / History / Read-Only Operational Views

Branch `feature/ai-1-foundation` (local, NOT pushed, no CI). Base AI-1D `d5bc9df3`. DB changes: NONE. Hosted writes: NONE. Providers/MCP: NONE.

## Overview cards
Latest run (status, workflow · provider, start–end, "View details"); Recent activity (runs in last 7 days); Needs attention (FAILED/PARTIAL in 7 days, text-explained); Pending suggestions (count + up to 3 read-only rows: action, target, time; no buttons); Recent findings (5, kind/priority/confidence/provider/status/time, click opens detail). Zero records -> existing "AI Hub is ready" empty state; no fake data, no Daily Brief card.

## History
Run-centric list (stacked rows, wraps on mobile): status badge, workflow, provider, start time, duration, result count (counts.findings/results/items), normalized error category. Filters (labelled selects): status, provider, workflow, values from browser-safe constants (drift-tested against AI-1C). Changing a filter resets to page 1. Newest first (`created_at desc, id desc`), 20/page, fetches 21 rows to derive "has next" (no count query, RLS-scoped). History owns its own load/error state.

## Detail
Run dialog: status, workflow, provider, trigger, schema version, start/end/duration, counts (numeric only), sources (strings only), error category label, linked findings (<=50, one query) which open finding detail. `error_detail` is never selected. Finding dialog: kind, status, priority, confidence (stored 0..1 shown as %, hidden when null), provider, times, "linked to an application", source link, summary, evidence, and payload fields from a per-kind allowlist mirroring AI-1C schemas. Unknown/note/other kinds show no payload; no JSON dump anywhere.

## Safety
React-escaped text only. Links only via `safeHttpUrl` (http/https, no credentials, <=2048) with `target=_blank rel="noopener noreferrer"`; `javascript:`/`data:` never rendered as anchors. No insert/update/delete/upsert/rpc, no service role (source-scan test).

## Query architecture
`api/aiHub.ts`: snapshot (6 small parallel SELECTs/head-counts over the same 3 tables), `fetchAiRunsPage`, `fetchAiRunDetail` (2 queries), `fetchAiFindingDetail` (1). All `.eq('workspace_id', activeWorkspace)`; no N+1; opaque `AI_HUB_LOAD_FAILED`.

## Failure isolation
Overview, History and each detail dialog have separate loading/error states with Try again; none throws to the app.

## Audit-view crowding
Partially resolved narrowly: AuditHistoryView gains a client-side "Scope" filter (All / AI Hub events `AI_*` / Membership & security). Backend unchanged (RPC still returns newest N, UI requests 100), so a very AI-heavy window can still push older membership events out of the fetched set. Fix needs an RPC filter/param -> DEFERRED to AI-2.

## Accessibility / responsive
Labelled filters inside a role=group, status as text badges, nav landmark for pagination, aria-labelled row buttons, shared Dialog (role=dialog, focus moved in), role=status/alert states. Fixture browser check (mocked data, temp page deleted, no hosted data): 375/768/1280 - no horizontal overflow on Overview, History (filter FAILED -> 2 rows, Next page click), run dialog, finding dialog (links rel=noopener noreferrer, non-allowlisted payload key not shown); screenshots in untracked `.artifacts/ai1e-*.png`. Not exercised: real mobile-nav click path (AI-1D wiring unchanged), Escape-to-close (shared Dialog behaviour).

## Tests / checks
`tests/unit/ai-hub-ui.test.ts` (12) + `tests/unit/ai-hub-operational.test.ts` (17) = 29 pass. Web tsc clean; eslint clean on changed files. Click/hook behaviour is not unit-tested (node env); covered by fixture browser check.

## Files
New: `views/AiHubDetails.tsx`, `views/AiHubHistory.tsx`, `tests/unit/ai-hub-operational.test.ts`. Modified: `api/aiHub.ts`, `lib/aiHub.ts`, `views/AiHubView.tsx`, `views/AuditHistoryView.tsx`, `tests/unit/ai-hub-ui.test.ts`, ai-hub docs.

## Deferred
Audit-window crowding (AI-2), closed-finding supersession (ingestion), feature flags/Settings (AI-1F), date-range filter, suggestion actions.

Next: AI-1F.
