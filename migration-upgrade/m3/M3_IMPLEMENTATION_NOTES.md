# M3 — Implementation Notes

**Milestone:** M3: Applications Workflow & Data Grid
**Branch:** `feature/m3-applications-workflow` (from `development` @ `9bfac15`)
**Architecture preserved:**
- Auth Option B
- Direct Supabase Data API + RLS
- RPCs for atomic workflow changes
- USER own-record isolation, MANAGER workspace access, no cross-workspace access
- Stage ≠ State ≠ Outcome ≠ Closure Reason
- `application_events` history
- No automatic mutation
- Direction D and the M2 design system/shell

---

## 1. How the work was split

| Phase | Who | Commit |
|---|---|---|
| Planning package, migration `20260924300000`, data layer, types, 11 applications components, view wiring, first integration and E2E specs | Antigravity (session ended at its usage quota; work left uncommitted) | preserved as-is in `98958b4` (checkpoint) |
| Resume: state assessment, hosted-schema reconciliation, workflow-integrity boundary, grid/drawer/rail/keyboard/a11y fixes, M2 overlay fixes, full test suites, hosted + preview verification, reports | Claude Code | `79c1825`, `58155be`, `e8fedb2`, plus the documentation commit |

Nothing Antigravity wrote was discarded. Every change is a follow-up commit on top of the checkpoint.

## 2. Database (4 migrations; all additive)

| Migration | Purpose |
|---|---|
| `20260924120000_m1_foundation.sql` | M1 (unchanged) |
| `20260924200000_m1b_option_b_auth.sql` | M1B (unchanged) |
| `20260924300000_m3_applications.sql` | Antigravity: `applications` expansion (URL, requisition ID, location, arrangement, employment type, salary, tags, notes, closure notes, applied_at, next_action_completed_at, duplicate_override_flag); `job_snapshots`; `application_events`; the 6 RPCs; indexes. **Not modified** (it was already applied to local and hosted dev). |
| `20260924310000_m3_workflow_integrity.sql` | Enforces the Gate 03 RPC boundary inside the database (see §3). Tightens the RPCs. Adds `rpc_list_workspace_members`. |
| `20260924320000_m3_table_privileges.sql` | Revokes Supabase default privileges on the two new tables. `anon`: none. `authenticated`: `job_snapshots` SELECT/INSERT, `application_events` SELECT. |

**Hosted reconciliation.**
- The `20260924300000` SQL had been applied to local and hosted `jobquest-dev` by hand, without a migration-history record.
- I reset the local stack to the migration files and compared catalog fingerprints with hosted: functions, policies, constraints, columns, grants, indexes and triggers.
  - **All M3 objects were identical to the file.**
  - The only differences were whitespace-only trailing characters in M1B function bodies (no logic difference).
- `supabase migration repair --status applied 20260924300000 --db-url <jobquest-dev>` then recorded the existing state; no DDL ran.
- `310000` and `320000` were applied with `supabase db push --db-url`, each after a dry run showed exactly one pending migration.

## 3. Workflow integrity boundary (why `310000` exists)

Gate 03 (`gate-03/RPC_DOMAIN_OPERATIONS.md` §1) puts state transitions, event appending and audit logging in RPCs, and allows direct Data API writes only for simple low-risk updates. As first delivered, the database did not enforce this:

- Clients could `UPDATE applications SET stage/status/outcome/archived_at` directly, with no event. The M1B harness in `App.tsx` did exactly that.
- Clients could `INSERT` arbitrary rows into `application_events`, forging history.
- `job_snapshots` allowed UPDATE/DELETE, contradicting ADR-013 ("immutable").

Changes in `310000`:

- **`trg_application_lifecycle`** (BEFORE INSERT/UPDATE): when `current_user` is `anon` or `authenticated` (a direct Data API call), it rejects any change to stage, status, outcome, closure_reason, closure_notes, closed_at or archived_at. It also requires new rows to start OPEN and unarchived. The error is `42501 LIFECYCLE_CHANGE_REQUIRES_RPC`. Inside the `SECURITY DEFINER` RPCs `current_user` is the owner, and privileged server code runs as `service_role`, so both are unaffected.
- **`application_events`**: append-only history, written only by database code. The client INSERT policy is dropped; INSERT/UPDATE/DELETE are revoked.
- **Trigger-written history**: `CREATED` on every insert, with the actor being whoever created it (a manager creating for a member is recorded as the manager). `CAPTURED` on every snapshot insert. The client no longer writes events.
- **`job_snapshots`**: UPDATE and DELETE policies and privileges removed. One snapshot per application (existing unique constraint).
- **RPC tightening**:
  - `rpc_set_application_outcome` requires a closure reason for WITHDRAWN and rejects one for other outcomes, with explicit error codes. Its event payload records the previous status/outcome and the stage at close.
  - `rpc_move_application_stage` rejects a no-op move (`STAGE_UNCHANGED`).
  - Archive and restore reject no-ops (`ALREADY_ARCHIVED` / `NOT_ARCHIVED`).
  - `rpc_keep_application_active` records the Gate 02B "Reviewed application" note.
- **`rpc_list_workspace_members(workspace)`**: returns user_id, role, username and display_name to members only. It's needed for the manager owner filter and the timeline actor names. The previous client code embedded `user_accounts`, which has no grants, so it silently returned nothing.

**Stage ≠ State** is preserved:
- Moving the stage never opens or closes a record, including a correction on a CLOSED record.
- An outcome closes the record and keeps its stage.
- Archive is independent of state.

## 4. Frontend

| Area | Implementation |
|---|---|
| Data layer (`apps/web/src/api/applications.ts`) | Direct Data API reads and simple-field edits; lifecycle via the RPCs. The `EditableApplicationFields` type excludes lifecycle fields. Metadata edits do **not** reset `last_activity_at` (aging = time since the last timeline activity, Gate 02B §4.5). |
| Search (`types/applications.ts` `buildSearchFilter`) | Values are quoted and escaped for PostgREST, and LIKE wildcards escaped, so commas, parentheses, quotes, `%` and `_` cannot change the filter. Exact tag match for safe single tokens. Input capped at 100 characters. |
| Filters and counts | Stage, outcome/status, priority, aging band (server-side date ranges matching the client band math), archive state, owner (managers). Stage pill counts and aging-banner counts are workspace-wide `count=exact` queries, not counts of the loaded page. |
| Pagination | 50 per page, exact count, stable order (`<field>, id`), "Showing x–y of N" with previous/next. Filter or sort changes return to page 1 and clear the selection. |
| Table | Dense 44 px rows; sort headers are buttons with `aria-sort`; canonical stage and outcome labels. Row actions: Move, Outcome, Keep (when stale), Archive/Restore, each with an accessible name. Mobile (<768 px) switches to a card list. |
| Drawer | Tracks the application by ID and shows the **live** record (never a stale copy). History refetches after every mutation. Shows actors ("by You" / member name). The loading state is distinct from the empty state. |
| Preview rail (≥1680 px) | Defaults open. The close button **and** `P` persist the preference. A visible "Preview" toolbar toggle is added (Gate 02B §4.2). A row click previews in place. |
| Keyboard | One context-safe handler: `j`/`k`/arrows, `Enter`, `M`, `X`, `P`, `Q`. It is inert while any dialog/drawer is open and while typing, and `Enter`/`M`/`X` never hijack a focused button. No Space shortcut. |
| Create / Edit | Unsaved-changes guard on Esc, backdrop, × and Cancel. Validation: required fields, http(s) URL, salary range, 3-letter currency. 3-tier duplicate cards with "Save anyway" for STRONG and an honest warning when the check fails. |
| Archive | 10-second **Undo** toast (Gate 02B / ADR-026), via an additive `action` option on the M2 Toast. |
| Bulk | Sequential atomic RPCs. Partial failures are counted and reported. "Mark Ghosted" skips records already closed. |
| Shell Quick Add (`q` / sidebar) | The M2 placeholder modal showed "Application Created" **without saving anything**. It now routes to the real create form through `lib/newApplicationIntent.ts`. The shell ignores keys a page has already handled. |

## 5. M2 primitive fixes (additive, needed by M3)

M3 is the first screen that stacks overlays: a Move Stage, Outcome or Edit dialog opened from the detail drawer. That exposed defects in the M2 `Dialog` and `Drawer`:

1. The dialog rendered **under** the drawer (both at `z-index: 60`), so dialogs opened from the drawer could not be clicked.
2. Both listened on `window`, so one Escape closed every open overlay and their focus traps competed.
3. `Drawer` re-ran its effect whenever the parent passed a new `onClose`, re-focusing itself and stealing focus from a dialog on top.

The fix is `components/ui/useOverlay.ts`:
- a module-level overlay stack (only the topmost overlay handles Escape/Tab)
- `onClose` held in a ref
- counted scroll lock
- focus restoration
- `useId`-unique title IDs
- dialogs layered above drawers (`.dialog` z 70, `.scrim-dialog` z 65)

Also: `PriorityBars` gains `role="img"`, because `aria-label` on a role-less div is a serious axe violation.

## 6. Test-only knobs (documented, never deployed)

- The integration harness and the **local** Playwright servers raise `REGISTER_IP_MAX_PER_HOUR` to 500. Every test registers users from one machine, and the per-IP bucket is durable in Postgres.
- Runs against a deployed preview (`M1_BASE_URL`) keep the real 3/hour limit. That is why the preview E2E runs register only one user per spec.

## 7. Local environment note

The local Supabase stack had been started earlier with a different `signing_keys.json` than the current file (trusted kid ≠ file kid), so every Option B token was rejected with `PGRST301`. I restarted the JobQuest local stack (`supabase stop` / `start`) so it trusts the current key. The other local Supabase project on this machine was left untouched. This is environment-only; no code change was involved.
