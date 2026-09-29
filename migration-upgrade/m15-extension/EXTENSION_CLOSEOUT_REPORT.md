# M15-E Extension — Closeout Report (Phase A/B only; blocked at Phase C)

**Branch:** `fix/m15e-extension-connection-ui`
**Base:** `fix/m15e-site-functional-remediation` @ `0a534b45` (site remediation, already
passed operator manual Preview QA)
**HEAD:** `20943423` (pushed; matches origin)

## What this branch does

Phases A and B only. Phase C (Claude Design import) is blocked — see below — so
Phases D through J (persistent Side Panel, Dashboard, Analytics, Settings redesign,
packaging for the new UI, Preview/dev QA of the new UI, and the final Opus release
review) have not started.

### Phase A — Extension architecture audit (read-only)

Confirmed via `repo-auditor`, then independently verified directly against source:
- Current UI model is popup-based (`action` + `default_popup`), no `side_panel`
  manifest config or `chrome.sidePanel` usage anywhere.
- Zero hardcoded workflow stages anywhere in `apps/extension/**` — stages are
  always loaded live from `GET /ext/v1/workflow`. No "Bookmarked" or other
  unsupported stage exists.
- Extension bearer-token auth (`jqx_dev_`/`jqx_live_`, HMAC-SHA256 hashed at rest)
  is fully independent of the web session's refresh cookie.
- Existing API surface: `GET /me`, `GET /workflow`, `GET /documents?kind=resume`,
  `POST /duplicates/check`, `POST /captures` — all bearer-authenticated, scoped,
  per-token rate-limited.
- Existing test coverage: `apps/extension/tests/{manifest,api,extractor}.test.js`,
  `tests/unit/m11-extension.test.ts`, `tests/integration/m11-extension.test.ts`
  (token isolation, identity/workflow/resumes, duplicate classification, atomic
  capture, ownership/scope/expiry/revocation, rate limiting), and the real-browser
  `e2e/m11-extension.spec.ts` (setup, extraction, capture, duplicate, rotation,
  revocation, theme, a11y, timing).

### Phase B — Connection flow repair

Three confirmed, fixed defects (detail in `EXTENSION_CONNECTION_AUDIT.md`):
1. Save and Test were conflated — a successful save followed by a failed live
   test looked identical to a failed save.
2. The full raw stored token was written back into the visible options-page
   input field on every load, regardless of `type="password"` visually masking
   keystrokes.
3. The standalone Test Connection button read the token untrimmed while Save
   already trimmed it, so identical pasted input could pass one path and fail
   the other.

Also fixed, found during the connection functional gate's real E2E/a11y run
(not assumed): the dark-theme primary button (`#4d72f5` background, white text)
failed WCAG AA contrast at 4.16:1 (needs 4.5:1). Reused the theme's own existing
hover shade as the new primary (~5.3:1, verified via a real re-scan), and the
light theme's existing hover as the new dark-mode hover.

Environment-mismatch detection ("where detectable") was deliberately **not**
implemented: production Vercel doesn't set `EXTENSION_TOKEN_ENV`, so production
tokens carry the `jqx_dev_` prefix — a client-side prefix heuristic would
actively mislead operators there. Documented in `EXTENSION_CONNECTION_AUDIT.md`
rather than fabricated.

## Phase C — BLOCKED

No `claude_design` MCP server or equivalent tool is connected in this session.
Exhaustively searched; nothing can read
`https://claude.ai/design/p/24b6a249-3de5-448f-a103-a63129dc926c?file=JobQuest+Side+Panel.dc.html`
or its `support.js` dependency. Per explicit instruction, this task does not
proceed with an inferred or reconstructed design, and does not substitute the
earlier textual UI description for the actual approved mockup.

**Operator action required:** run `/design-login` to reconnect the `claude_design`
MCP, then resume this branch from Phase C (design import → implementation map →
Side Panel → Capture tab → Dashboard → Analytics → Settings/theme).

## Test results

- Extension unit: 30/30 PASS (`pnpm --filter @jobquest/extension test`)
- Extension typecheck: PASS
- Full web/API unit: 163/163 PASS
- Full integration: 182/182 PASS (unaffected — no `apps/api/**` code touched this phase)
- Full E2E: 20/20 PASS, including the real browser-extension test
  (`e2e/m11-extension.spec.ts`) and two new assertions proving, in a real
  browser, that the token is never re-displayed and that the connection state
  genuinely persists across a page close/reopen (`chrome.storage.local`, not
  in-memory)
- Build: PASS
- Extension package: `apps/extension/dist/jobquest-capture-dev/` (+ `.zip`), built via
  `pnpm --filter @jobquest/extension package:dev`
- Secret scans: tracked repo 912 files/0 findings, web bundle 3 files/0 findings,
  **extension bundle 40 files/0 findings** (scanned the actual built artifacts,
  not just source)
- Artifact hygiene: PASS (clean tree after every run; `dist/` is gitignored)

One real, non-code E2E failure was investigated and resolved during this phase:
`e2e/m2-shell.spec.ts`'s theme-sync test failed reproducibly, traced (via
`test-debugger`, then independently confirmed by a direct read-only Postgres
query) to the **local** `register-ip` rate-limit bucket for this dev machine
having accumulated 21 hits against a 3/hour limit, from many hours of repeated
manual full-suite E2E runs earlier today — not a code regression, and not
`apps/web`-related (untouched on this branch). Cleared by deleting that single
exhausted bucket row in the local-only Supabase Docker Postgres instance (no
production or Preview data involved); confirmed the test passes cleanly
afterward and is not a code defect.

## CI

Run `36561875844`, exact SHA `20943423`, pushed via `git push` and triggered via
`workflow_dispatch` (this repo's CI only auto-triggers on `feature/**`,
`development`, `main` — not `fix/**`, as established in the prior site-remediation
round). Result: **PASS** — both `static` and `database` jobs `completed/success`,
independently confirmed against the exact pushed SHA.

## Release security review

Not invoked. Per instruction, `release-security-reviewer` runs once, only after
implementation is complete AND Preview/dev automated extension QA is green.
Implementation is not complete (Phases D/E blocked on Phase C), so this gate is
correctly still pending.

## Not yet done

- Claude Design import, implementation map, Side Panel, Capture tab redesign,
  Mini Dashboard, compact Analytics, Settings/theme redesign, extension
  Dashboard/Analytics API endpoints (if needed), Preview/dev extension QA of the
  new UI, and the final Opus `release-security-reviewer` pass — all blocked on
  Phase C.

## Unchanged

Development: UNCHANGED. Main: UNCHANGED. Production: UNCHANGED. No production
claim-code reissue. No production extension token configuration. No merges
performed or attempted.
