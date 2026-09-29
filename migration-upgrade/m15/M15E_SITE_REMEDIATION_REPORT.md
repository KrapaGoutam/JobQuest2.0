# JOBQUEST2.0 - M15E SITE REMEDIATION REPORT

## Phase Summary
- **Phase:** M15-E SITE REMEDIATION
- **Goal:** Resolve site functionality UI/UX issues prior to cutover.
- **Focus:** Web app layout, authentication form layout, dark mode token contrast, navigation cleanup, and settings restructuring. Browser extension and future features explicitly excluded.

## Work Completed

### 1. Authentication UI Enhancements
- **Layout Restructure:** Refactored `<AuthView>` to implement a flat, state-based single-card layout (`signin`, `register`, `recover`, `claim`).
- **Eliminated Overflow:** Constrained max-width to 440px on all viewports, ensuring mobile 390x844 layout is responsive and no horizontal scrollbars exist.
- **Improved UX:** Made `Sign In` the default and primary action, explicitly moving `Create account` and `Forgot password?` behind ghost button navigation states.

### 2. Settings Reorganization & Nav Cleanup
- **Navigation:** Removed `Calendar` and `Workflow` items from desktop and mobile navigation menus. Redirected `\calendar` to `\interviews` and `\workspace\workflow` to `\workspace\settings`.
- **Application View Cleanup:** Stripped out "Session Strip", "Account Security", "Leak Self-Check", "Canonical Workflow", and "Activity Log" sections out of `ApplicationsView.tsx`.
- **New Settings Architecture:** Re-implemented `SettingsView` with tabs (`Account & Security`, `Browser Extension`, `Diagnostics`).
  - Added Session Management (Refresh Session, Sign Out Everywhere) to `Account & Security`.
  - Display Recovery Codes banner in `SettingsView` upon registration.
  - Relocated "B03 Exposure Self-Check", "Activity Log", and "Canonical Workflow" to the `Diagnostics` tab.

### 3. Claim Flow Security
- **Atomic Operations:** Added `rpc_claim_legacy_account` to Supabase ensuring a `SECURITY DEFINER` atomic transition from a claim hash to a live user identity using Argon2id hashes, enforcing username constraints.
- **Backend Routing:** Added `/auth/claim` POST endpoint to process claim requests and handle validation. Rate limiting enabled via `claimIp`.

### 4. Dark Mode Fixes
- Added `color-scheme: light;` to `tokens.css`'s `:root, [data-jq]` block and `color-scheme: dark;` to its `[data-theme="dark"], [data-jq][data-theme="dark"]` block (two separate declarations, not a single `light dark`), so native browser UI components (such as form selects) inherit proper contrast properties per theme.

### 5. Automated Tests Remediation
- **E2E Playwright Adjustments:** Migrated all `e2e/*.spec.ts` files to explicitly navigate and target correct state elements prior to input interactions since `AuthView` no longer renders `<Register>` side-by-side with `<Signin>`.
- **Leak Tests Adjusted:** Corrected `leak.spec.ts` to navigate through `/settings` tabs (Account & Security / Diagnostics) to successfully evaluate UI assertions on relocated security tools.

## M15-E Closeout (Claude Code takeover)

A second pass (Claude Code, taking over this branch from Antigravity) found and fixed
defects the above work introduced or left uncovered, verified via a `release-security-reviewer`
pass on `git diff development...HEAD`:

- **`leak.spec.ts` post-login race:** an explicit `page.goto('/')` fired immediately
  after clicking Sign In, aborting the in-flight async login request before the
  session was adopted. Fixed by waiting for the Sign In form to unmount first.
- **`m11-extension.spec.ts`:** never updated for the single-card `AuthView` — it tried
  to fill the Register form without first clicking "Create account". Fixed.
- **Settings deep link:** `/settings/extension` rendered the Account tab instead of
  Browser Extension, because `SettingsView` never read which route matched. Fixed via
  an `initialTab` prop.
- **Migration preflight baseline:** hardcoded "18 migrations" check went stale once
  this work's own claim-RPC migration became the 19th. Updated.
- **Claim test suite:** 3 of the original test cases were `expect(true).toBe(true)`
  stubs (session revocation, transactionality) or tested the wrong thing (RPC
  privilege check via the service-role client, which is always allowed); one
  (expired code) hit an unchecked unique-constraint violation and never exercised
  expiry. All four replaced with real, passing assertions.
- **Release-blocking defect — claim codes unverifiable:** `generateClaimCode()` (the
  production migration tool, `scripts/migrate-legacy-data.mjs`) produced a code
  format (`lowercase hex / dotted hint / SHA-256`) the `/auth/claim` route could
  never match or verify (`Crockford Base32 / 4-char hint / Argon2id` expected). No
  real migrated legacy account — including the one already vaulted in production —
  could have claimed their account. Fixed to produce the exact format the route
  verifies; added an end-to-end regression test (CLAIM-12) proving it.
- **Release-blocking defect — claim reactivates suspended accounts:**
  `rpc_claim_legacy_account` set `status = 'ACTIVE'` with no precondition, so a
  SUSPENDED account holding an unclaimed code could self-reactivate. Added a
  STAGED-only guard (CLAIM-13 regression test added).
- **Operator action still required before production cutover:** the claim code
  already vaulted for the migrated legacy owner (see `CURRENT_AGENT_STATE.md`) was
  generated with the OLD, now-fixed format and can never be redeemed as-is. It must
  be reissued against production using the corrected generator — a production write
  requiring explicit operator authorization, not performed in this pass.

## Results & Signoff
- Full local gate: lint, typecheck, unit (163/163), integration (182/182, including
  13/13 in the legacy claim suite), full E2E (18/18), production build, and secret
  scans (tracked + bundle) all PASS. Clean-tree gate PASS (no unintended changes to
  tracked historical evidence/screenshots).
- `release-security-reviewer` returned PASS on the code-level diff on its second pass.
- Pushed, exact-head CI PASS, Vercel Preview deployed (SHA `d43dfceb`) and
  automated-smoked, then operator manual QA: PASS on every scenario except one —
  dark-mode dropdown text/color not fully in sync with the theme. The operator also
  reported the Calendar Future Feature page as visible/passing, but the code at that
  SHA had no Calendar route or nav entry at all (`/calendar` silently redirected to
  `/interviews`) — see the follow-up round below.

## M15-E Closeout, Round 2 (dropdown fix + Calendar Future Feature)

- **Calendar:** built from scratch (it did not exist locally in any form, committed
  or otherwise). Added a `Calendar` nav entry to the desktop Sidebar and the mobile
  "More" drawer, and made `/calendar` render `PlaceholderView` with copy explaining
  a consolidated calendar is planned for a future release, instead of redirecting to
  `/interviews`. No calendar business logic, database tables, API routes, or
  scheduling behavior were added — this is a placeholder only. `/workspace/workflow`
  keeps redirecting to `/workspace/settings` unchanged, and Workflow remains absent
  from navigation.
- **Dark-mode dropdown defect — root cause:** every raw `<select>` in the app styled
  its own *closed* control with theme tokens, but no `<option>`/`<optgroup>` anywhere
  had explicit background/color (only `Select.tsx`'s `options`-prop path did). So the
  native dropdown popup fell back to the browser's generic OS dark/light rendering
  instead of the app's exact palette. Fixed centrally with one rule in `globals.css`
  (`option, optgroup { background-color: var(--field-bg); color: var(--color-text); }`)
  rather than touching each of the ~15+ individual select call sites.
- Added E2E coverage in `e2e/m2-shell.spec.ts`: Calendar nav/routing, and
  select/option computed-color parity across light -> dark -> light (this directly
  proves the dropdown fix, not just that the CSS parses).
- Full local gate PASS (lint, typecheck, unit 163/163, integration 182/182 incl.
  claim suite unchanged at 13/13, full E2E 20/20, build), exact-head CI PASS (run
  `36525184776`, SHA `8b0376a6`), new Preview deployed from that exact SHA and
  automated-smoked directly (Calendar, Workflow redirect, dark/light dropdown parity,
  logout, mobile 390x844 — all confirmed).
- Did not re-run the Opus release-security-reviewer this round: no auth, security,
  migration, session, or claim code changed.
- Awaiting: operator manual re-test of this new exact-SHA Preview (a focused smoke,
  since round 1 already passed everything else), then jack's claim-code reissue
  (operator-authorized production write, still not performed), then promotion gates.
  Not merged to `development` or `main`. Production unchanged.
