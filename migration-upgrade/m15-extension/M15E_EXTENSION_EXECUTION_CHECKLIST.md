# M15-E Extension Execution Checklist

## Phase 1 — Site prerequisite
[x] Site remediation complete
[x] Site manual Preview QA PASS

## Phase 2 — Extension branch
[x] Branch created
[x] Correct base verified

## Phase 3 — Extension audit
[x] Existing extension audited

## Phase 4 — Connection remediation
[x] Save/Test separation
[x] token masking
[x] whitespace normalization
[x] connection regression tests

## Phase 5 — Claude Design
[x] Design imported
[x] implementation map created

## Phase 6 — Side Panel shell
[x] MV3 Side Panel
[x] navigation
[x] persistent behavior

## Phase 7 — Capture
[x] extraction
[x] duplicate detection
[x] dynamic workflow
[x] capture success/error states

## Phase 8 — Dashboard / Analytics / Settings
[x] Dashboard
[x] Analytics
[x] Settings
[x] Theme

## Phase 9 — Local validation
[x] lint
[x] typecheck
[x] unit
[x] integration
[x] E2E
[x] build
[x] package
[x] bundle secret scan

## Phase 10 — Branch CI
[x] exact SHA pushed
[x] exact SHA CI PASS

CI:
36621437672 (previous: 36604010935)

SHA:
cb9418fe72df9fe59c1b7e64117869aa64b857703

## Phase 11 — Preview environment
[x] Preview/development backend
[x] REGISTER_IP_MAX_PER_HOUR=20 Preview/Development only
[x] Production unchanged
[x] fresh deployment with new env configuration

## Phase 12 — Automated Preview/dev Extension QA
[x] redeploy exact SHA
[x] verify Preview backend
[x] m11-extension E2E
[x] m15e-extension-sidepanel E2E
[x] Connection QA
[x] persistent Side Panel
[x] Capture
[x] duplicate detection
[x] workflow stages
[x] Dashboard
[x] Analytics
[x] Settings
[x] Light/Dark/System
[x] responsive 360/430/480
[x] active-tab changes
[x] restart persistence
[x] artifact hygiene

## Step 12A — Manual Capture Fallback / Parity Fix

Status:
IN PROGRESS

Reason:
Operator manual Preview QA found a parity regression:
auto-extraction has no adequate manual edit/fill fallback for fields
that were editable in the previous extension.

Checklist:

[ ] audit previous editable capture fields
[ ] map fields to current capture API
[ ] design minimal Side Panel edit/fill interaction
[ ] preserve automatic extraction
[ ] missing fields manually fillable
[ ] detected values manually correctable
[ ] manual values use existing capture payload
[ ] duplicate detection respects edited values
[ ] workflow stages remain canonical/dynamic
[ ] active-tab changes cannot leak manual Job A values into Job B
[ ] accessibility
[ ] targeted unit tests
[ ] targeted E2E
[ ] full required regression
[ ] package
[ ] secret scan
[ ] exact-head CI
[ ] fresh Preview/dev deployment/package
[ ] automated Preview QA
[ ] operator manual retest pending

## Phase 13 — Final Security Review
[ ] Claude Opus review

OWNER:
Claude Code / Opus

DO NOT COMPLETE IN THIS SESSION.

## Phase 14 — Operator Manual Extension QA
[ ] operator install
[ ] persistent Side Panel
[ ] real job capture
[ ] duplicate capture
[ ] Dashboard
[ ] Analytics
[ ] Settings
[ ] themes
[ ] active-job switch
[ ] browser restart

## Phase 15 — Release Promotion
[ ] extension branch → development
[ ] site branch included
[ ] development CI
[ ] development → main
[ ] main CI

## Phase 16 — Production Change Window
[ ] production DB migration(s)
[ ] legacy claim-code reissue
[ ] production extension configuration
[ ] production site deployment
[ ] production extension package

## Phase 17 — Production Smoke
[ ] site
[ ] extension
[ ] tenant isolation
[ ] auth
[ ] capture

## Phase 18 — M15-E GO
[ ] GO approved

## Phase 19 — M15-F Stabilization
[ ] 14-day stabilization begins

---

CURRENT PHASE: M15-E Step 12A — Manual Capture Fallback / Parity Fix
CURRENT SUBTASK: Audit previous editable capture fields vs API contract
BRANCH: fix/m15e-extension-connection-ui
LOCAL HEAD: 7d0d20cd2268e0760b5b140b0c3308fc827a817d
REMOTE HEAD: 7d0d20cd2268e0760b5b140b0c3308fc827a817d
WORKING TREE: M15E_EXTENSION_EXECUTION_CHECKLIST.md modified
LAST COMPLETED ACTION: Step 12 automated preview QA passed & checklist initialized
LAST GREEN TEST: unit 163/163, integration 186/186, extension 58/58, m11-extension E2E PASS (51.9s), m15e-extension-sidepanel E2E PASS (27.1s)
LAST CI: 36621437672 (PASS, exact SHA cb9418fe)
PREVIEW: https://jobquest2-jtp7jvwkl-one-piece-5779.vercel.app (deployment dpl_FokMNZnRPj6JwKqTWVdhXXvrLa4a, target: preview, exact SHA cb9418fe)
BACKEND: jobquest-dev (ref: xpnkasclquplmrcmhsif, PREVIEW_BACKEND_IS_PRODUCTION = false)
BLOCKERS: None
PRODUCTION: UNCHANGED (jobquest-prod, kwmnljvyvqvbvimypnmw, AWS us-east-1)
NEXT EXACT ACTION: Audit previous editable fields in popup.html/js and map to Side Panel capture flow
