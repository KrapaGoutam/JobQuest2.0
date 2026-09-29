# JOBQUEST2.0 - CURRENT AGENT STATE

## Current Milestone
Milestone 15 — Production Launch & Cutover
**Phase M15-E: TWO active fix branches — site remediation (manual Preview QA PASS, awaiting promotion authorization) and extension remediation (Phase A/B done, still blocked at Phase C on design-system authorization)**
**Gate Status: Site branch — local quality gate PASS, exact-head CI PASS, Preview deployed and automated-smoked, operator manual re-test PASS. Extension branch — Phase A/B local quality gate PASS, exact-head CI PASS, blocked before Phase C (see below — not resolved by a prior `/design-login` attempt). NOT merged. Production UNCHANGED.**

## Branch: fix/m15e-site-functional-remediation (site remediation)
- **Branch HEAD:** `0a534b45` (pushed; matches origin)
- **Exact-head CI:** PASS (both `static` and `database` jobs, triggered via `workflow_dispatch` since this repo's CI only auto-triggers on `feature/**`/`development`/`main`, not `fix/**`)
- **Vercel Preview (current):** `https://jobquest2-51ktgo1ku-one-piece-5779.vercel.app`, deployment `dpl_E7CvzzPZgYbEsTVBDZyK4ZHuRLuQ`, exact SHA `8b0376a6a0aeee9f9f75a983f463335927cc34b8` (parent of the docs-only `0a534b45` HEAD — the app code deployed and tested is unchanged by that docs commit), `target: null` (Preview, not production). Backend confirmed preview/development-scoped (env var names/targets only checked, no values read).
- **Site Manual Preview QA: PASS** — operator has explicitly confirmed the focused
  re-test (Calendar Future Feature page, dark/light dropdown, everything else
  already covered by the prior full round) passed on this exact-SHA Preview.
- **Cutover Status:** Site remediation manual QA complete. Still PAUSED before
  any merge/production action: jack's claim-code reissue, then
  `fix -> development -> main -> production` promotion gates all remain
  separately authorized steps, not yet executed. Extension remediation
  (separate branch, below) has not reached manual QA yet.

## Branch: fix/m15e-extension-connection-ui (extension remediation — NEW this session)
- **Base:** `fix/m15e-site-functional-remediation` @ `0a534b45` (confirmed via `git merge-base`)
- **Branch HEAD:** `d0e8c34a` (pushed; matches origin). Tested code SHA: `20943423`
  (CI ran against this; the `d0e8c34a` HEAD on top of it is docs-only).
- **Phase A (audit):** DONE, read-only.
- **Phase B (connection repair):** DONE. Fixed Save/Test message conflation, full
  raw token re-displayed on every Settings reopen, and inconsistent
  Save-vs-Test whitespace handling. Also fixed a real WCAG AA contrast failure
  in the dark-theme primary button, found by the same test's real axe-core scan.
  Full detail in `migration-upgrade/m15-extension/EXTENSION_CONNECTION_AUDIT.md`
  and `EXTENSION_CLOSEOUT_REPORT.md`.
- **Phase C (Claude Design import): STILL BLOCKED, confirmed on a second check.**
  No `claude_design` MCP tool exists in this session — checked exhaustively both
  times. On this second check, the closest available tool (`DesignSync`, which
  handles the user's own writable design-*system* projects, not arbitrary shared
  `claude.ai/design/p/...` URLs) returned an explicit error: **design-system
  authorization is missing, and `/design-login` cannot run in this
  non-interactive (headless/SDK) session** — it must be run from an
  **interactive** Claude Code session on this machine first; this session would
  then reuse that authorization on a later resume. A prior `/design-login`
  attempt (per the task that resumed this branch) did not resolve this.
  **Operator action: open an interactive Claude Code session on this machine
  and run `/design-login` there, then resume this task.** Everything downstream
  (Phase D Side Panel, E Dashboard/Analytics/Settings, their QA, and the final
  release review) remains blocked. Per explicit instruction, no design work was
  inferred or reconstructed from memory or the earlier textual description.
- **Local quality gate (Phase A/B scope):** lint PASS, typecheck PASS, unit
  163/163 PASS, integration 182/182 PASS (unaffected — no `apps/api/**` touched),
  extension unit 30/30 PASS, full E2E 20/20 PASS, build PASS, extension package
  built (`apps/extension/dist/jobquest-capture-dev/`), secret scans PASS
  (tracked 912/0, web bundle 3/0, extension bundle 40/0).
- **Exact-head CI:** PASS — run `36561875844`, SHA `20943423`, triggered via
  `workflow_dispatch`, both `static` and `database` jobs `completed/success`.
- **Release security review:** NOT invoked. Per instruction, invoked only after
  the full implementation (through Phase E) passes Preview/dev QA — blocked on
  Phase C, so implementation is not yet complete.
- Note: during this branch's full-E2E run, `e2e/m2-shell.spec.ts`'s theme-sync
  test failed reproducibly. Diagnosed (via `test-debugger`, independently
  confirmed with a direct read-only query) as the **local** `register-ip`
  rate-limit bucket having accumulated 21 hits against the 3/hour limit, from
  many hours of repeated manual E2E runs earlier today — not a code defect, not
  `apps/web`-related. Cleared by deleting that one bucket row in the local-only
  Supabase Docker Postgres (no Preview/production data involved). Confirmed
  passing afterward.

## Cross-cutting / unchanged by either branch
- **Main HEAD Commit:** Pending PR Merge
- **Vercel Production Deployment:** unchanged this session.
- **Production Supabase DB:** `jobquest-prod` (`kwmnljvyvqvbvimypnmw`, AWS `us-east-1`)
  - Target Migrations: 18/18 applied cleanly through M14. The site branch adds a
    19th (`20261021100000_m15_legacy_claim_rpc.sql`), NOT YET applied to production.
  - Data Parity: 222 apps, 89 snapshots, 533 events, 49 tags (0 deltas)
- **Legacy Source:** READ-ONLY STANDBY (Neon `SHOW transaction_read_only = on`)
- **JobQuest 1.0 Retirement:** STRICTLY NOT AUTHORIZED (Preserved for 14-day stabilization)
- **Claim Code (`jack`): STILL STALE — MUST BE REISSUED BEFORE CUTOVER.** Unchanged
  from the prior entry: the vaulted code was generated by the OLD `generateClaimCode()`
  format and cannot be verified by `/auth/claim` as it now exists. Reissuing it is a
  production write requiring explicit operator authorization; NOT performed this
  session. Do not attempt the claim with the currently-vaulted code.
- **Register rate limit on Preview/dev:** `REGISTER_IP_MAX_PER_HOUR` is configured
  for `production` scope only in Vercel; no `preview`/`development`-scoped value
  exists, so Preview currently uses the code default (3/hour). Not changed this
  session (requires separate authorization); worth raising before heavy manual QA
  that registers several accounts back-to-back. (Distinct from the local dev-only
  rate-limit bucket cleared above, which only affected this machine's local
  Supabase Docker instance.)

## Feature Freeze Notice
FEATURE FREEZE IS IN EFFECT. No ordinary new features are permitted. Allowed changes are strictly: launch blockers, security defects, migration defects, production configuration defects, critical P0/P1 regressions, critical accessibility defects, and critical performance defects materially threatening launch.

## Manual QA History
**Round 1 (prior Preview, SHA `d43dfceb`):** Sign In, Create Account, Forgot Password,
Claim UI, registration, recovery codes, Dashboard, Applications CRUD/stage/archive,
Search, Contacts, Interviews, Tasks, Habits, Resumes, Settings tabs, password change,
recovery-code regeneration, logout+refresh, mobile 390x844, `/workspace/workflow`
redirect, manager Workspace Settings, Members, invite, role changes, tenant isolation
— all PASS. Calendar Future Feature was reported visible/passing by the operator, but
the committed code at that SHA had no Calendar nav entry at all (`/calendar` silently
redirected to `/interviews`) — this mismatch was the trigger for this round's work.
Only defect found: dark-mode dropdown text/color not fully in sync with the theme.

**Round 2 (this session, SHA `8b0376a6`):** Implemented the Calendar Future Feature
placeholder (previously did not exist in code) and centralized the option/optgroup
theming fix for the dropdown defect. Full local gate + exact-head CI + a fresh
Preview + automated smoke all PASS (see below). Manual re-test now needed, but it
only needs to be a focused pass — see "Next Exact Step".

## This Session's Work (continuation)
Starting point: HEAD `d43dfceb`, clean, matching origin exactly (verified — no
uncommitted or unpushed Calendar work existed anywhere; the Calendar feature had
to be built from scratch, not recovered). Commits added, in order:
- `3e0780b6` feat(ui): restore Calendar as a visible Future Feature placeholder —
  nav entries in Sidebar + MobileNav, `/calendar` renders `PlaceholderView` instead
  of redirecting to `/interviews`. No calendar business logic, DB, or API added.
  `/workspace/workflow` -> `/workspace/settings` redirect and Workflow's absence
  from navigation are both unchanged.
- `2a4bb1bc` fix(theme): centralized `option`/`optgroup` theming in `globals.css`.
  Root cause: every raw `<select>` styled its own closed control with theme tokens,
  but no `<option>`/`<optgroup>` anywhere had explicit background/color, so the
  native popup fell back to generic browser dark/light rendering instead of the
  app's exact palette. One small rule fixes every select in the app.
- `8b0376a6` test(ui): added two new E2E cases to `m2-shell.spec.ts` — Calendar
  nav/routing (visible, opens Future Feature copy, never redirects; Workflow stays
  absent; workspace/workflow redirect unchanged) and select/option color parity
  across light -> dark -> light (proves the fix, not just that it builds).

Full local gate: lint PASS, typecheck PASS, unit 163/163 PASS, integration 182/182
PASS (claim suite unchanged at 13/13), full E2E 20/20 PASS (18 prior + 2 new),
build PASS, clean-tree gate PASS. Did not re-run the Opus release-security-reviewer
per explicit instruction, since no auth/security/migration/session/claim code
changed in this round.

Exact-head CI (SHA `8b0376a6`, run `36525184776`, triggered via `workflow_dispatch`):
both `static` and `database` jobs PASS.

New Preview deployed from that exact SHA and automated-smoked directly (Playwright,
real browser, synthetic account `m15e_final_qa_1` on the preview/dev backend, no
production data touched): Sign In default confirmed, Calendar visible in nav and
`/calendar` renders the Future Feature page without redirecting, `/workspace/workflow`
still redirects to `/workspace/settings`, dark-mode select/option colors now match
exactly (`rgb(18,24,39)`/`rgb(237,241,247)`), light-mode select/option colors match
exactly (`rgb(255,255,255)`/`rgb(23,32,51)`), logout returns to Sign In, and 390x844
has zero page-level horizontal overflow (`scrollWidth === 390`).

## Next Exact Step
**AWAITING OPERATOR MANUAL RE-TEST** of the Preview above. Since round 1 already
passed the full scenario list, this re-test can be a focused smoke:
1. Sign In / Dashboard / Applications / Settings load
2. Calendar appears in navigation and opens the Future Feature page (not a redirect)
3. `/workspace/workflow` still redirects to `/workspace/settings`
4. Dark-mode dropdown readability
5. Light-mode dropdown readability
6. Theme light -> dark -> light
7. Logout / login
8. Mobile 390x844

Only after the operator reports PASS does a separate, later prompt authorize:
`fix/m15e-site-functional-remediation -> development -> main -> production`
(including jack's claim-code reissue and the M15 migration), and separately
`fix/m15e-extension-connection`, then M15-F stabilization. None of that is
authorized yet.
