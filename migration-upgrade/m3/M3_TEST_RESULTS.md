# M3 — Test Results

A result counts as PASS only when the test ran to completion and wrote its evidence. Evidence files are in `migration-upgrade/m3/evidence/` (sanitized: the recorder refuses JWTs, refresh tokens, secret keys, private JWK material, Argon2 verifiers and test passwords).

## 1. State found at resume (Antigravity's runs, from artifacts)

| Command | Antigravity outcome | Evidence | Verdict |
|---|---|---|---|
| `pnpm test:integration` | M1B suite PASS in 3 runs (18:08, 18:14, 18:31 local) | `m1b/evidence/integration-local-{96ade4,b4d9da,c8366a}.json` | M1B: PASS. **M3: UNPROVEN** (the M3 suite wrote no evidence) → re-run |
| `pnpm test:e2e` | **FAIL** at 18:35 | `test-results/.last-run.json` (`status: failed`) | The M3 spec stopped at registration: "Too many attempts" (the DB-backed per-IP register limit, 3/hour, hit by repeated local runs). Its selectors did not match the UI either (field IDs, option values, dialog titles, button labels), so it could not have passed as written → rewritten |
| M1B leak browser test | PASS | `m1b/evidence/e2e-browser-local-{916b7b,1d9960}.json` | PASS |

## 2. Static checks

| Check | Result |
|---|---|
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test:unit` | PASS: 8 files, **54 tests** (41 existing + 13 new M3: aging bands and boundaries, search escaping, validation, timeline text) |
| `pnpm build` | PASS |
| `pnpm check:bundle` (local build) | PASS: 0 findings |
| `pnpm check:secrets` (tracked files) | PASS: 0 findings (305 files at `e8fedb2`) |
| Deployed preview bundle scan (3 real secret values as known secrets) | PASS: 0 findings (`preview-bundle-scan-mug9ocpn.json`) |

## 3. Integration: M3 suite (`tests/integration/m3-applications.test.ts`, 38 tests)

Environments:
- **Local stack**: `integration-local-5db40f.json`
- **CI**: run `36081767609` (`ci-36081767609/integration-local-75e1df.json`)
- **Hosted `jobquest-dev`**: `integration-hosted-dev-bb6248.json`

All three environments: **38/38 PASS** (earlier 37-test runs: `integration-local-61940b`, `integration-hosted-dev-7aa597`, CI `ci-36080940595/integration-local-4ebaaf`).

| ID | Objective | Result |
|---|---|---|
| RLS-01 | USER reads own application | PASS |
| RLS-02 | USER cannot read peer application (shared workspace) | PASS: 0 rows |
| RLS-03 | USER inserts own application | PASS |
| RLS-04 | USER cannot insert for a peer | PASS: 42501 |
| RLS-05 | USER edits simple fields; the edit does not reset aging | PASS |
| RLS-06 | USER cannot update a peer application | PASS: 0 rows, untouched |
| RLS-07 | MANAGER reads all workspace applications | PASS |
| RLS-08 | MANAGER updates a member application | PASS |
| RLS-09 | USER cannot read a foreign workspace | PASS: 0 rows |
| RLS-10 | USER/MANAGER cannot update/insert/read a foreign workspace | PASS |
| RLS-11 | Removed member loses rows, events and RPC access; record retained and attributed | PASS |
| RLS-12 | Event history follows record visibility (peer 0, manager >0) | PASS |
| RLS-13 | Anonymous: no rows, no RPC | PASS |
| INT-01 | Direct lifecycle writes rejected (stage, status/outcome, archive, closed/archived inserts, manager) | PASS: 42501 `LIFECYCLE_CHANGE_REQUIRES_RPC` ×6 |
| INT-02 | Events append-only (client insert/update/delete denied) | PASS: 42501 ×3 |
| INT-03 | CREATED written by the database; actor = creator (manager-for-member → manager) | PASS |
| INT-04 | Member roster RPC: members only, no credential fields | PASS |
| INT-05 | Least-privilege grants (anon none; authenticated SELECT,INSERT / SELECT) | PASS |
| RPC-01 | Stage move: stage + activity updated, STAGE_CHANGED with notes, state stays OPEN | PASS |
| RPC-02 | Invalid stage / no-op move rejected; no event written | PASS |
| RPC-03 | Peer caller rejected | PASS: NOT_AUTHORIZED |
| RPC-04 | Closure rules (reason required/invalid/only-for-WITHDRAWN; invalid outcome); nothing changed | PASS |
| RPC-05 | WITHDRAWN + OFFER_DECLINED closes, keeps stage; stage correction on CLOSED keeps state | PASS |
| RPC-06 | Keep Active resets aging only; "Reviewed application" note | PASS |
| RPC-07 | Archive/restore logged; double archive/restore rejected; archive keeps state | PASS |
| RPC-08 | MANAGER moves a member record; actor = manager | PASS |
| DUP-01 | Strong: job URL (case/whitespace-insensitive) | PASS |
| DUP-02 | Strong: requisition ID | PASS |
| DUP-03 | Probable: company + role (case-insensitive) | PASS |
| DUP-04 | Possible: same company, different role | PASS |
| DUP-05 | None | PASS |
| DUP-06 | Never reveals peer records or foreign workspaces | PASS |
| JOB-01 | Snapshot captured (CAPTURED event); immutable; one per application | PASS |
| JOB-02 | Peer cannot read a snapshot | PASS |
| QRY-01 | Search injection-safe (commas, parentheses, quotes, % and _ literal, filter-injection string → 0 rows) + tag search | PASS |
| QRY-02 | Aging filters: Stale 15–30 d, Long Waiting 31+ d, Quiet | PASS |
| QRY-03 | No automatic mutation: a 45-day-inactive record stays OPEN, un-ghosted, unarchived; only CREATED | PASS |
| QRY-04 | Exact count + disjoint pagination | PASS |

## 4. Integration: M1B regression (`tests/integration/m1b.test.ts`, 17 tests)

**17/17 PASS** locally, in CI and on hosted `jobquest-dev`.

B06 and B12 were adapted to the M3 boundary. Their own-row direct writes now update simple fields, stage changes go through `rpc_move_application_stage`, and each test also asserts that a direct stage write is refused with 42501. Their intent (the RLS own-write proof) is unchanged.

## 5. Unit (`tests/unit/m3-applications.test.ts`, 13 tests)

- Aging band mapping, and server range vs client band agreement at every day boundary 0–60.
- No negative day counts under clock skew.
- The search filter never produces extra clauses; wildcards and quotes are escaped; the tag clause is added only for safe tokens; length is bounded.
- Create/edit validation: required fields, http(s) URL, salary range, currency.
- Timeline text uses canonical labels.

**13/13 PASS.**

## 6. E2E (`e2e/m3-applications.spec.ts`) plus regression specs

| Scenario (TEST_PLAN) | Local | CI | Local servers → hosted dev | **Vercel preview** |
|---|---|---|---|---|
| E2E-01 dense 44 px rows (measured) | PASS | PASS | PASS | PASS |
| E2E-02 search (incl. punctuation), stage filter, sort (`aria-sort`), aging filter present | PASS | PASS | PASS | PASS |
| E2E-03 row / select-all selection, bulk bar | PASS | PASS | PASS | PASS |
| E2E-04 create (+ snapshot), probable → strong duplicate + Save anyway, honest check-failure warning, unsaved-changes guard (Cancel and Esc) | PASS | PASS | PASS | PASS |
| E2E-05 drawer: live refresh after Move Stage / Keep Active / Outcome; timeline CREATED → CAPTURED → STAGE_CHANGED → KEEP_ACTIVE → OUTCOME_CHANGED with actors; stage kept on close | PASS | PASS | PASS | PASS |
| Keyboard: j/k, Enter, Esc, M; inert while a dialog is open | PASS | PASS | PASS | PASS |
| Archive → Undo toast → re-archive → archived view → restore | PASS | PASS | PASS | PASS |
| E2E-06 rail: default open ≥1680; row previews in place; recent activity shown; P toggles; persisted across reload; close button persists; toolbar Preview reopens | PASS | PASS | PASS | PASS |
| E2E-07 1024 / 768 / 375; mobile cards + detail sheet with timeline; 0 px page overflow | PASS | PASS | PASS | PASS |
| E2E-07 axe (WCAG 2.2 AA tags, colour-contrast on) in 6 contexts | 0 critical / 0 serious | 0 / 0 | 0 / 0 | 0 / 0 |
| `e2e/leak.spec.ts` (M1B B03/B11/B12 browser) | PASS | PASS | n/a | PASS |
| `e2e/m2-shell.spec.ts` | PASS | PASS | n/a | PASS |
| `e2e/capture-m2-screenshots.spec.ts` | PASS | PASS | n/a | not run on the preview (it overwrites the approved M2 baselines) |

Evidence:

| Run | Files |
|---|---|
| Local | `e2e-local-{9f3bb9,0e0e2e,2aabc8,2208af,88ff4b}.json` |
| CI | `ci-36080940595/e2e-local-e6fcba.json`, `ci-36081767609/e2e-local-a7f888.json` |
| Local servers → hosted | `e2e-local-1aabc1.json` (target label corrected afterwards to `local-servers-hosted-dev` in the spec) |
| Preview | `e2e-vercel-preview-a4d369.json` (commit `58155be`) and the final `e2e-vercel-preview-ed8b33.json` (preview `jobquest2-d5pdff0pm`, code `e8fedb2`); M1B leak on the final preview: `m1b/evidence/e2e-browser-preview-hosted-dev-b0c465.json` |

## 7. Failures found during verification (all fixed; none remain)

| # | Where found | Problem | Fix |
|---|---|---|---|
| 1 | Artifacts | E2E blocked by the register rate limit on repeated local runs | Test-only knob for the local Playwright servers (same as the integration harness); previews keep real limits |
| 2 | Spec review | E2E selectors did not match the UI | Spec rewritten against the real UI |
| 3 | Code review | Lifecycle state, events and snapshots writable directly (bypassing the RPC boundary) | Migration `310000` + INT-01..03, JOB-01 |
| 4 | Code review | Search filter injectable; no tag search | `buildSearchFilter` + QRY-01 + unit tests |
| 5 | Code review | Owner filter / actor names silently empty (no grant on `user_accounts`) | `rpc_list_workspace_members` + INT-04 |
| 6 | Code review | Drawer stale after actions; `P` double-toggled; `Enter` hijacked on buttons; rail close not persisted; aging filter no-op; no pagination; misleading "Reopen"; no unsaved-changes guard | Fixed in view/components; covered by E2E |
| 7 | Code review | M2 Quick Add showed "Application Created" without saving | Routed to the real create form |
| 8 | E2E (local) | Dialogs opened from the drawer rendered **under** it (unclickable); Esc closed all overlays; drawer stole focus | `useOverlay` stack + layering |
| 9 | E2E (local) | Integration suite `PGRST301`: the local stack trusted an old signing key | Restarted the local stack (environment only) |
| 10 | E2E (local) | Dark-theme contrast measured mid-transition | Audit waits for theme transitions to settle |
| 11 | E2E (preview) | Serious `aria-prohibited-attr` on the loading skeleton (visible only with network latency) | `role="status"` (`58155be`) |
| 12 | Preview screenshots | Drawer/rail briefly showed "no events" while history was still loading | Loading state tracked per record (`e8fedb2`) + E2E asserts history content |
| 13 | Diagnosis of #12 | `anon` kept default table privileges on `job_snapshots` / `application_events` | Migration `320000` + INT-05 |

## 8. CI

| Run | Commit | Static | Database (migrations, M1B + M3 integration, E2E ×7) |
|---|---|---|---|
| `36080495563` | `79c1825` | PASS | PASS |
| `36080940595` | `58155be` | PASS | PASS (M3 integration 37/37, E2E 7/7) |
| `36081767609` | `e8fedb2` | PASS | PASS (M3 integration **38/38**, E2E 7/7, a11y 0/0): evidence `ci-36081767609/` |
| (docs commit) | final documentation/evidence commit | reported in the M3 hand-off message | reported in the M3 hand-off message |

## 9. Final preview run note (environment incident, not a product failure)

The scheduled final preview run (02:12 UTC, leak + M2 shell + M3) was hit by this machine losing connectivity. The browser reported `net::ERR_NETWORK_CHANGED`, and a ~30 s run took 1.5 h.

- **M3 spec: PASS** (`e2e-vercel-preview-ed8b33.json`: all scenarios, a11y 0/0, 8/8 history reads authenticated).
- `m2-shell` failed with `ERR_NETWORK_CHANGED`, and `leak.spec` timed out waiting for registration during the outage. No rate-limit or app error appeared on the page.
- Re-run immediately afterwards on the same preview: **leak + M2 shell 5/5 PASS** (`m1b/evidence/e2e-browser-preview-hosted-dev-b0c465.json`).
