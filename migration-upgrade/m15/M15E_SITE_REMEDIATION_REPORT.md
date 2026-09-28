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
- Added `color-scheme: light dark;` to `tokens.css` inside the `[data-theme="dark"]` rules block to ensure native browser UI components (such as form selects) inherit proper contrast properties.

### 5. Automated Tests Remediation
- **E2E Playwright Adjustments:** Migrated all `e2e/*.spec.ts` files to explicitly navigate and target correct state elements prior to input interactions since `AuthView` no longer renders `<Register>` side-by-side with `<Signin>`.
- **Leak Tests Adjusted:** Corrected `leak.spec.ts` to navigate through `/settings` tabs (Account & Security / Diagnostics) to successfully evaluate UI assertions on relocated security tools.

## Results & Signoff
- E2E and Unit testing executed and successfully verified locally.
- Awaiting final preview release CI/CD verification and signoff.
