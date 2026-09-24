# Open Questions

Uncertainty that cannot be resolved from the repository alone. Each entry follows:
Question → Why it matters → Evidence inspected → Recommended verification →
Migration impact.

---

## OQ-001: How does PIN-based authentication map onto Supabase Auth?

**Why it matters**: the entire current login UX is a 4-digit numeric PIN, not an
email/password or OAuth flow. Supabase Auth's built-in flows (email/password,
magic link, OAuth, phone OTP) have no native "short numeric PIN as the primary
credential" mode.
**Evidence inspected**: `backend/src/security.js`, `docs/SECURITY.md`, migration
`005_four_digit_pin.sql`. Confirmed PIN is genuinely primary (not a second
factor) — legacy password accounts must migrate to PIN via a one-time
`transition-pin` flow, not the other way around.
**Recommended verification**: ask the product owner directly — is PIN-as-primary
a deliberate product decision to keep (e.g. because the user base is small/
trusted, or PIN is genuinely faster to type on mobile), or would Supabase's
native email/password + optional PIN-as-second-factor be an acceptable, even
preferred, change?
**Migration impact**: High. If PIN-as-primary is kept, it must be built as a
custom flow on top of Supabase (a `profiles` table with a PIN hash + custom
verification RPC, session issued via Supabase's admin API or a custom JWT), not
out of the box. This is real design work, not configuration.

## OQ-002: What replaces the browser extension's bearer-token auth under Supabase?

**Why it matters**: extension auth today is a bespoke, revocable, hash-only-stored
bearer token — deliberately not session-cookie reuse. Supabase doesn't ship a
first-class "long-lived scoped personal access token for an external client"
primitive comparable to, say, a GitHub PAT.
**Evidence inspected**: `docs/EXTENSION_ARCHITECTURE.md`, `docs/
EXTENSION_SECURITY.md`, `backend/src/extension.js`, migration `013_extension_tokens.sql`.
**Recommended verification**: research current Supabase offerings at
implementation time (this changes over time) — e.g. whether a long-lived Supabase
Auth session/refresh-token pattern, or a custom `extension_tokens`-equivalent
table + RLS (the most direct port), is the better fit.
**Migration impact**: Medium. The most direct port (keep a custom
`extension_tokens` table, RLS-scoped, SHA-256-hashed, alongside Supabase Auth for
the web app) is low-risk and well-understood; a "native" Supabase approach would
need real evaluation before being trusted with production auth.

## OQ-003: Does Supabase RLS need help expressing "manager acts on an explicit target user"?

**Why it matters**: today, a manager's cross-user access is always gated by an
explicit `user_id`/`target_user_id` parameter, checked in application code — never
a blanket "managers see everything" query. Plain RLS policies are predicate-based
per row and don't naturally express "this caller may act as a *chosen* other
user, but only when they explicitly say so."
**Evidence inspected**: `docs/FEATURE_UPGRADE_10_FINAL.md`'s authorization matrix,
`backend/src/server.js` (`targetOwner`), `docs/BACKEND_SCHEMA.md` §Supabase RLS.
**Recommended verification**: prototype a `SECURITY DEFINER` RPC function
approach against a throwaway Supabase project before committing to it in
`docs/IMPLEMENTATION_PLAN.md`'s Supabase-foundation milestone.
**Migration impact**: High if unresolved before the manager-features milestone —
risks either breaking manager functionality or accidentally over-granting access.

## OQ-004: Is the Postgres worker-thread RPC bug relevant to the migration at all, or moot?

**Why it matters**: `postgres-db.js`/`postgres-worker.js`'s `SharedArrayBuffer`/
`Atomics.wait` RPC bridge has a known, recurring correctness gap (no
request-correlation ID — see `CURRENT_STATE_AUDIT.md` §9). If the migrated
backend uses a normal async Postgres client (which almost any Node/TypeScript
framework would), this problem disappears by construction and needs no fix —
but it's worth explicitly confirming this file isn't ported "as-is for
familiarity" into the new backend.
**Evidence inspected**: `docs/FEATURE_UPGRADE_10_FINAL.md` Known Deferred Debt,
two independent CI occurrences documented there.
**Recommended verification**: none needed beyond a code-review checkpoint during
the backend-porting milestone confirming this file is *not* copied forward.
**Migration impact**: Low, provided it's genuinely not ported (this should be a
one-line decision, not a debate).

## OQ-005: Should `users.week_start` be honored everywhere, or removed?

**Why it matters**: currently inconsistent — only Habits reads it; the calendar
week view and goal-snapshot weekly walker hardcode Monday-first. See BL-013.
**Evidence inspected**: `frontend/src/app.js` (calendar), `backend/src/
advanced.js` (goal snapshots), `backend/src/habits.js` (the one correct consumer).
**Recommended verification**: ask the product owner whether non-Monday week
starts are an actual, used feature (i.e. does any real user have it set to
something other than 1/Monday?) — if not, the simplest fix is removing the
setting entirely rather than fixing 2 more call sites for an unused preference.
**Migration impact**: Low effort either way, but must be a *decision*, not an
accidental continuation of the inconsistency.

## OQ-006: Real-time / live-update expectations for the migrated UI?

**Why it matters**: the current app has zero real-time/push mechanism — every
screen is fetch-on-navigate/fetch-on-action. A React + Supabase stack makes
Supabase Realtime subscriptions cheap to add (e.g. live dashboard updates, live
nav badge counts). Whether this is in scope changes the target architecture and
UI design meaningfully.
**Evidence inspected**: no WebSocket/SSE/polling code found anywhere in
`backend/src/*.js` or `frontend/src/app.js`.
**Recommended verification**: ask the product owner — is "the dashboard/nav
badges update live without a manual refresh" a desired improvement for this
migration, or explicitly out of scope (per `docs/PRD.md` §Out of Scope's general
"no product redesign unrelated to migration" principle)?
**Migration impact**: Medium — affects `docs/TRD.md`'s architecture section and
`docs/UI_UX_DESIGN_BRIEF.md`'s component behavior notes if in scope.

## OQ-007: Is a single Node/TypeScript API layer needed, or does the frontend talk to Supabase directly for most CRUD?

**Why it matters**: a large fraction of today's backend logic is straightforward
owner-scoped CRUD that Supabase's client + RLS can serve directly from the
frontend with no intermediate API layer at all — but several features
(analytics rate formulas, import/export, manager RPCs, extension endpoints) have
real server-side logic that needs *somewhere* to live.
**Evidence inspected**: `API_INVENTORY.md` (80+ endpoints, of which a majority
are simple CRUD and a minority carry real business logic).
**Recommended verification**: this is the single biggest architecture decision
in `docs/TRD.md` — direct-Supabase-client for simple CRUD + Supabase Edge
Functions or a thin Vercel API layer for the logic-bearing endpoints, vs. one
uniform Node/TypeScript API layer in front of everything (simpler mental model,
more infrastructure). Needs an explicit decision before `docs/
IMPLEMENTATION_PLAN.md`'s milestones can be sequenced meaningfully.
**Migration impact**: High — this decision shapes nearly every later milestone.

## OQ-008: Does the browser extension get rebuilt, or just repointed?

**Why it matters**: the extension's extraction logic (`extractors/*.js`) has no
dependency on the backend's implementation language/platform at all — only on
the API *shape* it calls. It could be left entirely as-is (vanilla JS, Manifest
V3) and just repointed at new endpoint URLs/response shapes, with zero UI/UX
change.
**Evidence inspected**: `extension/api/jobquest.js` (the only file that would
need updates for a repointed-not-rebuilt extension).
**Recommended verification**: confirm with the product owner whether the
extension is in scope for a rewrite (e.g. TypeScript, a build step) or is
explicitly "leave working code alone, just repoint the API client."
**Migration impact**: Low if repointed-only (small, well-scoped change); Medium
if rebuilt (new toolchain, re-derive every extractor fixture test).

## OQ-009: Does the `ui-upgrade` branch contain anything not already superseded?

**Why it matters**: `brain/PROJECT_STATE.md` flags this branch's merge status as
"unconfirmed, low priority, carried over unresolved across rounds" — it predates
several later rounds and may be entirely superseded, but this was never
confirmed.
**Evidence inspected**: not inspected in this documentation pass (out of scope
for a read-only audit of `main`).
**Recommended verification**: `git log ui-upgrade --not main` before treating
`main` as the complete feature set relative to every historical branch.
**Migration impact**: Low unless it turns out to contain unmerged work — worth a
5-minute check before declaring `FEATURE_CATALOG.md` complete.

## OQ-010: Rate limiting — needed in the target system?

**Why it matters**: the current app has no general-purpose API rate limiter
(only account-specific login lockout). See `SECURITY_AUTHORIZATION.md` §Rate
limiting.
**Evidence inspected**: no rate-limiting library in either `package.json`.
**Recommended verification**: evaluate Supabase's platform-level auth rate
limits and whether a Vercel Edge Middleware rate limiter is warranted for the
public-facing API surface once the app moves to a platform with a different
traffic/abuse profile than a single Render service behind no CDN.
**Migration impact**: Low-to-Medium — a reasonable `docs/IMPLEMENTATION_PLAN.md`
non-functional hardening item, not a blocker.

---

# Gate 01 Review (added 2026-09-23)

Classification per [`GATE_01_ARCHITECTURE_PROPOSAL.md`](GATE_01_ARCHITECTURE_PROPOSAL.md) §21.
The original entries above are kept unchanged as the historical record.

| ID | Classification | Resolution / recommendation (PROPOSED) |
|---|---|---|
| OQ-001 | RESOLVED BY USER REQUIREMENT | Username + password; PIN retired |
| OQ-002 | RESOLVED BY USER REQUIREMENT | Scoped, expiring, hashed, workspace-bound extension tokens |
| OQ-003 | RESOLVED BY USER REQUIREMENT | Workspace-scoped managers → expressible in RLS |
| OQ-004 | RESOLVED | Worker-thread RPC not ported |
| OQ-005 | CAN RESOLVE DURING MILESTONE | Recommend honouring `week_start` everywhere (D-16) |
| OQ-006 | CAN SAFELY DEFER | Architecture keeps Realtime possible |
| OQ-007 | RESOLVED BY USER REQUIREMENT (hybrid) | Boundary proposed in §4. Approval needed before M1. |
| OQ-008 | MUST RESOLVE BEFORE IMPLEMENTATION (extension milestone) | Recommend incremental migration |
| OQ-009 | **RESOLVED (verified)** | `ui-upgrade` has 1 commit not in `main` (`29624a6`): agent tooling only, no product code |
| OQ-010 | RESOLVED BY USER REQUIREMENT | Per-IP + per-account limits, Vercel WAF |

## New questions raised by Gate 01

| ID | Question | Classification | Recommendation |
|---|---|---|---|
| OQ-011 | Does Auth Option A hold up: alias identity accepted, server-proxied sign-in not collectively IP-throttled, `supabase-js` `accessToken` mode works with RLS? | MUST RESOLVE BEFORE IMPLEMENTATION (M1 spike) | Spike in M1; fall back to Option B |
| OQ-012 | Which workspace(s) receive legacy data? | MUST RESOLVE BEFORE DATABASE WORK | One "JobQuest (migrated)" workspace |
| OQ-013 | What can a USER see inside a shared workspace? | MUST RESOLVE BEFORE IMPLEMENTATION | Own records only |
| OQ-014 | Analytics: "ever reached" vs legacy current-stage counting (finding F-2) | MUST RESOLVE BEFORE DATABASE WORK | Ever reached |
| OQ-015 | Theme default | RESOLVED BY USER REQUIREMENT | System + manual + persisted |
| OQ-016 | Supabase/Vercel plan tiers (Branching, PITR, leaked-password protection) | CAN RESOLVE DURING MILESTONE (before production) | Free/dev first; confirm before production |
| OQ-017 | Per-user timezone for "today" calculations | MUST RESOLVE BEFORE DATABASE WORK | Add `profiles.timezone` |
| OQ-018 | Email provider for verification/recovery | CAN SAFELY DEFER | Recovery codes cover the MVP |
| OQ-019 | How do legacy users reclaim accounts without PIN migration? | MUST RESOLVE BEFORE DATABASE WORK | Operator-issued claim codes |
| OQ-020 | Record ownership when a member leaves a shared workspace | CAN RESOLVE DURING MILESTONE | Records stay; export first; transfer later |
| OQ-021 | Production smoke-test account | CAN RESOLVE DURING MILESTONE | Dedicated smoke user in an isolated workspace |

---

# Gate 02B UI/UX Design Resolutions (added 2026-09-24)

Classification of UI/UX related questions based on the completed Gate 02B specifications and mockups:

| ID | Status | Resolution in Gate 02B Design | Reference |
|---|---|---|---|
| OQ-013 | **RESOLVED BY DESIGN** | A USER in a shared workspace can view, edit, and export only their **own** records. They cannot see other members' applications or data. Managers see all member records with member attribution. | `gate-02b/GATE_02B_UI_SPEC.md` §10.1, `08-workspace.html` W1, `12-import-export.html` E9 |
| OQ-015 | **RESOLVED BY DESIGN** | Default theme = SYSTEM, fallback = LIGHT, user choices = SYSTEM / LIGHT / DARK with persistent manual override in Settings and quick toggle. | `gate-02b/GATE_02B_UI_SPEC.md` §11.1, `09-settings.html` S5 |
| OQ-017 | **RESOLVED BY DESIGN** | User profile includes an explicit `timezone` preference, localized across date pickers, reminders, and "today" calculations. | `gate-02b/GATE_02B_UI_SPEC.md` §11.1, `09-settings.html` S1, `05-interviews.html` I3 |
| OQ-018 | **RESOLVED FOR MVP** | 10 single-use recovery codes provide 100% self-sufficient account recovery without requiring a third-party email provider at launch. | `gate-02b/GATE_02B_UI_SPEC.md` §3.1, `01-auth.html` A5–A7 |
| OQ-019 | **RESOLVED BY DESIGN** | Legacy account claim flow is designed and verified with operator-issued claim code entry, new username, and new password establishment. | `gate-02b/GATE_02B_UI_SPEC.md` §3.1, `01-auth.html` A10 |
| OQ-020 | **RESOLVED BY DESIGN** | Member removal dialog clearly discloses that existing records remain in the workspace attributed to the member; access is revoked. Export can be run prior to departure. | `gate-02b/GATE_02B_UI_SPEC.md` §10.2, `08-workspace.html` W3 |

## Gate 02B Final User Decisions & Approvals (resolved 2026-09-24)

### OQ-022: Inactivity Review Interval vs. Aging Band
- **Original Question:** Should the advisory review trigger at 28 days (falls inside the 15–30d Stale band) or at 31 days (matches the Long Waiting band)?
- **Status:** **RESOLVED BY USER DECISION**
- **Decision:** Use **31+ DAYS** as the inactivity-review trigger.
- **Rationale & Specification:**
  - This aligns the actionable review directly with the existing **Long Waiting** aging band (31+ days) instead of triggering inside the 15–30 day Stale band.
  - The design distinguishes:
    - **15–30 days:** Aging/Stale indicator on application rows/cards.
    - **31+ days:** Long Waiting band; application surfaces in the actionable "Review quiet applications" dashboard queue.
  - Actionable review options: `Keep Active` (logs a review note, resets inactivity timer), `Mark Ghosted` (closes with outcome Ghosted), `Archive` (soft-archives application).
  - **Zero Automatic Mutation:** Nothing is automatically ghosted, archived, closed, or changed. All state mutations require explicit user action.

### OQ-023: Offer Declined Status Classification
- **Original Question:** Is declining an offer classified under outcome `Withdrawn` (legacy convention) or should a distinct `Offer Declined` outcome status be introduced?
- **Status:** **RESOLVED BY USER DECISION**
- **Decision:** Do **NOT** introduce a new top-level outcome/status called `Offer Declined`. Use Outcome: **`WITHDRAWN`** with a structured closure reason: **`OFFER_DECLINED`**.
- **Rationale & Specification:**
  - The UI displays the human-readable text: `"Offer declined"`.
  - The closure reason is structured (not solely an unstructured free-text note) so that JobQuest analytics can distinguish and report on general withdrawal, offer declined, and other withdrawal reasons without proliferating top-level pipeline outcomes.
  - Designed as an input for Gate 03 to determine the appropriate database/enum/relational representation.

### OQ-024: Wide Desktop Preview Pane Default
- **Original Question:** Should the 440px preview pane be default-on at viewports ≥1680px, or toggle-only?
- **Status:** **RESOLVED BY USER DECISION**
- **Decision:** At viewport widths **≥ 1680px**, the Applications preview pane defaults to **OPEN**.
- **Rationale & Specification:**
  - Users may close it (`×` button), reopen it, or toggle it via an explicit visible toolbar control.
  - The user's explicit open/closed preference is persisted.
  - The preview pane is **not required** (closing it allows the table to expand to 100% width).
  - **Keyboard & A11y Safety:** Do **NOT** use a global `Space` shortcut for preview toggling, as `Space` directly conflicts with vertical scrolling, table row/checkbox selection, screen-reader interaction, and native browser behavior.
  - An explicit visible toggle/close control is provided. Any keyboard shortcut must be context-safe, documented, accessible, and non-conflicting (e.g. `P` when a table row has grid focus).

---

## Master Open Questions Status Registry (Post-Gate 02B Approval)

| ID | Topic | Lifecycle Phase | Status | Authoritative Resolution |
|---|---|---|---|---|
| **OQ-001** | PIN vs Password Auth | Gate 01 / Pre-M1 | **RESOLVED** | Username + password required; email/phone optional; PIN retired (ADR-008, CR-007). |
| **OQ-002** | Extension Auth Under Supabase | Gate 01 / Pre-M1 | **RESOLVED** | Scoped, expiring, hashed, workspace-bound tokens stored in `extension_tokens` (ADR-013, CR-012). |
| **OQ-003** | Manager Multi-User Authorization | Gate 01 / Pre-M1 | **RESOLVED** | Workspace-scoped roles (`USER` / `MANAGER`); RLS + RPC with explicit target auditing (ADR-010, CR-008). |
| **OQ-004** | Postgres Worker RPC Bridge | Gate 01 / Pre-M1 | **RESOLVED** | Worker-thread RPC retired; standard async client in new backend. |
| **OQ-005** | `week_start` Preference Consistency | Gate 01 / Pre-M1 | **RESOLVED** | Honor `week_start` consistently across Calendar, Goals, and Habits (CR-015). |
| **OQ-006** | Real-time / Live Updates | Gate 01 / Pre-M1 | **RESOLVED** | Deferred for MVP; architecture preserves Realtime compatibility. |
| **OQ-007** | Hybrid Backend Architecture | Gate 01 / Pre-M1 | **RESOLVED** | Hybrid architecture approved: direct Supabase client for simple CRUD + Node/TypeScript API for business logic, extension, import/export, and manager RPCs (ADR-009). |
| **OQ-008** | Browser Extension Scope | Gate 01 / Pre-M1 | **RESOLVED** | Extension updated to Manifest V3 `/api/ext/v1` client with live workflow sync (CR-012, ADR-024). |
| **OQ-009** | `ui-upgrade` Branch Status | Gate 01 / Pre-M1 | **RESOLVED** | Verified: contains 1 agent-tooling commit only; product-irrelevant. |
| **OQ-010** | API Rate Limiting | Gate 01 / Pre-M1 | **RESOLVED** | Rate limiting required: per-IP + per-account limits, Vercel WAF / middleware. |
| **OQ-011** | Supabase Auth Option A vs B | Gate 03 / M1 Spike | **PENDING SPIKE** | Test Option A (username alias via dummy email / metadata); fall back to Option B (Node auth façade issuing custom JWTs). |
| **OQ-012** | Legacy Data Target Workspace | Gate 03 / Database | **PENDING GATE 03** | Recommend default "JobQuest (Migrated)" workspace for all legacy imports. |
| **OQ-013** | USER Visibility in Shared Workspace | Gate 02B / Design | **RESOLVED** | `USER` sees and exports permitted **own** records only; `MANAGER` sees all records with member attribution (ADR-010). |
| **OQ-014** | Analytics: Ever-Reached vs Current Stage | Gate 02B / Design | **RESOLVED** | Historical analytics uses ever-reached / event history; current pipeline uses current stage (ADR-011, CR-014). |
| **OQ-015** | Theme Default & Hierarchy | Gate 02B / Design | **RESOLVED** | Default = SYSTEM, fallback = LIGHT; choices = SYSTEM / LIGHT / DARK; persistent manual override (ADR-014, CR-013). |
| **OQ-016** | Supabase/Vercel Plan Tiers | Gate 03 / Pre-Prod | **PENDING PROD** | Free/dev tier for development; confirm Pro tier requirements before production. |
| **OQ-017** | Per-User Timezone | Gate 02B / Design | **RESOLVED** | Add `profiles.timezone` column; used across date pickers, reminders, and "today" calculations (CR-015). |
| **OQ-018** | Email Provider for MVP Recovery | Gate 02B / Design | **RESOLVED** | 10 single-use recovery codes cover 100% of self-sufficient MVP recovery; third-party email deferred (ADR-008). |
| **OQ-019** | Legacy Account Reclamation | Gate 02B / Design | **RESOLVED** | Operator-issued claim codes verified in design (A10); user establishes new username/password (ADR-017). |
| **OQ-020** | Member Removal Record Ownership | Gate 02B / Design | **RESOLVED** | Records remain in workspace attributed to member; access revoked; export recommended prior to removal (ADR-010). |
| **OQ-021** | Production Smoke Account | Post-M1 / Testing | **PENDING PROD** | Dedicated smoke test user in an isolated test workspace. |
| **OQ-022** | Inactivity Review Interval | Gate 02B / Final | **RESOLVED** | 31+ days triggers review (aligned with Long Waiting band); explicit Keep/Ghosted/Archive; zero automatic changes (ADR-027). |
| **OQ-023** | Declined Offer Classification | Gate 02B / Final | **RESOLVED** | Outcome = `WITHDRAWN`, structured closure reason = `OFFER_DECLINED`; human-readable "Offer declined" (ADR-028). |
| **OQ-024** | Wide Desktop Preview Pane Default | Gate 02B / Final | **RESOLVED** | Viewports ≥ 1680px default to OPEN; user preference persisted; no global Space shortcut conflict (ADR-029). |


