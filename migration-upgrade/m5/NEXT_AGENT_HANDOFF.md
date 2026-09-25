# M5 → Next Agent Handoff

This is for any incoming agent (Antigravity, Claude Code, Codex or another). No earlier chat history is needed.

## 1. Result

**M5 Interviews & Debriefs is complete and awaiting user review.**

- **Not merged.** M6 has not started.
- **Recommendation:** the user reviews `M5_COMPLETION_REPORT.md` and decides on the merge.

## 2. Branch and git

| Item | Value |
|---|---|
| Work branch | `feature/m5-interviews-debriefs` (pushed) |
| Base | `development` at `caf9f33` (`merge: approve M4 contacts and networking`) |
| Code HEAD | `6a469ed`; the docs commit follows it |
| `main` | untouched |

**Rules:**
- no reset, rebase or force-push
- merge `--no-ff` only after explicit approval
- never commit `.env*`, keys or `test-results/`

## 3. Architecture you must preserve

- **Option B auth:**
  - the Node (Hono) API owns credentials (Argon2id for passwords and recovery codes)
  - ES256 access JWTs (`sub`, `role=authenticated`, `session_id`)
  - opaque `jqr_` refresh tokens with a **SHA-256 verifier** in an HttpOnly SameSite=Strict `jq_rt` cookie
  - supabase-js `accessToken` mode
  - **Option A FAILED/SUPERSEDED**: `auth.users` has zero JobQuest identities
- **Roles:** `USER` / `MANAGER` only.
- **Hybrid boundary:**
  - simple edits go through the Data API (whitelisted / column-granted)
  - lifecycle, events, links and audit go through SECURITY DEFINER RPCs or triggers
- **Archive-first.** No hard delete of contacts, companies or interviews. Interactions and `application_events` are append-only.
- **Tenancy.** Composite tenant FKs on every cross-table reference.
- **Manager audit.** `app.audit_cross_user_mutation` writes `audit_events`, which is SYSTEM-only. Read-audit is deferred.

## 4. Schema state (`jobquest-dev` = local)

| Migration | Content |
|---|---|
| `20260924120000` M1 foundation | profiles (IANA `timezone`), workspaces, members (USER/MANAGER), applications, RLS helpers |
| `20260924200000` M1B | Option B auth tables and `session_is_active` |
| `20260924300000` / `310000` / `320000` M3 | applications workflow, `job_snapshots`, `application_events`, lifecycle guard, RPCs, grants |
| `20260924400000` M4 | companies, contacts, interactions, application_contacts, RPCs |
| `20260925100000` M4 closeout | least privilege, no hard delete, append-only interactions, composite company FKs, contact guard, peer-safe unlink, `audit_events` + trigger |
| `20260925200000` **M5** | `interviews`, `interview_contacts`, RLS, column grants, `rpc_schedule_interview`, `rpc_record_interview_outcome`, audit extension, profile time-zone validation |

## 5. Interviews: what exists

- **Scheduling:**
  - never changes the stage
  - an optional explicit `p_move_to_stage` calls `rpc_move_application_stage` in the same transaction
- **Debrief:**
  - result `PENDING` / `PASSED` / `FAILED` / `CANCELLED`
  - `INTERVIEW_COMPLETED` only when the result changes
  - optional next-action replacement
  - never an automatic stage change
- **`preparation_notes` / `questions_expected`:** kept as multiline text; there must be **no checklist**.
- **Time zones:** stored in UTC, shown and entered in `profiles.timezone` via `apps/web/src/lib/time.ts` (DST gap rejected, overlap maps to the first occurrence).
- **UI:**
  - `/interviews`: I1 list, I2 panel, I5 sheet
  - I3 schedule/edit and I4 debrief dialogs
  - the Interviews card in the application drawer

## 6. Supabase and Vercel

- **Supabase:**
  - use only `jobquest-dev`, ref `xpnkasclquplmrcmhsif`
  - remote commands: `supabase db push --db-url "$SUPABASE_DB_URL" --dry-run` first, because the CLI login is a different account
  - check the ref before every push
- **Vercel:**
  - project `jobquest2` (team `one-piece-5779`), **preview only**
  - current preview: `jobquest2-eq3zy6rxb-one-piece-5779.vercel.app`
  - the register limit is 3/hour/IP; plan preview E2E runs around it

## 7. Tests

```bash
pnpm lint && pnpm typecheck && pnpm test:unit && pnpm build && pnpm check:bundle && pnpm check:secrets
pnpm local:env && pnpm test:integration          # 88: M1B 17, M3 38, M4 10, M4C 9, M5 14 (local stack running)
pnpm test:e2e                                     # 9 specs; afterwards: git restore migration-upgrade/m2/ migration-upgrade/m3/screenshots/ migration-upgrade/m4/screenshots/
M1B_ENV_FILE=.env.local pnpm test:integration     # hosted jobquest-dev
M1_BASE_URL=https://<preview> M1B_ENV_FILE=.env.local M1B_TARGET=vercel-preview pnpm exec playwright test e2e/m5-interviews.spec.ts
```

- **CI:** GitHub Actions `M1B CI`, green on `6a469ed` (run `36106977932`). Evidence artifact `m1b-m3-m4-m5-evidence`; `playwright-failure-context` is uploaded on failure.
- **Lessons:**
  - Dialogs must reset on ids, not on object props.
  - supabase-js retries failed GETs, so allow time in error-state tests.
  - Chromium lists legacy ICU zone names.
  - E2E runs rewrite the approved M2/M3/M4 screenshots; restore them.

## 8. Open questions

1. Reminders (I3 "Remind me 1 hour before"): with the tasks milestone?
2. Typed participant names → draft contacts?
3. Manager audit viewer and read-audit.
4. M4 networking progress checklist design.
5. Shell top-bar and sidebar label CSS (pre-existing).
6. Legacy interview-type mapping during data migration.

## 9. Files to read first

1. `migration-upgrade/m5/M5_COMPLETION_REPORT.md`
2. `migration-upgrade/m5/M5_IMPLEMENTATION_NOTES.md`
3. `migration-upgrade/m5/M5_TEST_RESULTS.md`
4. `migration-upgrade/m4/M4_COMPLETION_REPORT.md` §3 (corrections) and `NEXT_AGENT_HANDOFF.md`
5. `migration-upgrade/gate-03/TARGET_SCHEMA.md`, `AUTHORIZATION_RLS_DESIGN.md`
6. `migration-upgrade/ui-design/gate-02b/` (specs and mockups)
7. `migration-upgrade/DECISIONS.md` (ADR-020, ADR-022), `OPEN_QUESTIONS.md`

## 10. Next milestone

**M6: Tasks, Habits & Unified Queue**, following the `m3/README.md` §3 sequence. **Do not start it without explicit user approval.**

## 11. Ready-to-copy next prompt (use only after the user approves M5)

```text
JOBQUEST2.0 — M5 APPROVAL MERGE + M6 TASKS, HABITS & UNIFIED QUEUE

Repository: JobQuest2.0 (../JobQuest1.0 is READ ONLY).
1. Read migration-upgrade/m5/M5_COMPLETION_REPORT.md, NEXT_AGENT_HANDOFF.md, M5_TEST_RESULTS.md,
   and the Gate 02B specs for tasks/habits (04-tasks.html, 06-habits-journal.html), Gate 03 TARGET_SCHEMA
   (tasks, habits, habit_logs, journal_entries, goals), DECISIONS.md, OPEN_QUESTIONS.md.
2. Verify branch feature/m5-interviews-debriefs, HEAD, and green CI. Apply any requested M5 fixes first.
3. git checkout development; git pull origin development;
   git merge --no-ff feature/m5-interviews-debriefs -m "merge: approve M5 interviews and debriefs";
   git push origin development. Verify development. Do NOT merge to main.
4. git checkout -b feature/m6-tasks-habits-queue; git push -u origin feature/m6-tasks-habits-queue.
5. Implement M6 per approved sources only (tasks with recurrence, follow-up reminders incl. the deferred
   interview reminder, habits/logs, unified queue), preserving Option B, USER/MANAGER, archive-first,
   composite tenant FKs, RPC/trigger boundary for events and audit, profile time zones (lib/time.ts).
6. Additive migrations only; jobquest-dev only (verify ref xpnkasclquplmrcmhsif; dry-run first).
7. Tests: RLS allow/deny matrix, RPC atomicity, time-zone/DST for due dates, E2E + axe (0 critical/serious,
   asserted), regression M1B/M3/M4/M5. Preview on jobquest2 only. CI green.
8. Docs in migration-upgrade/m6/ (README, IMPLEMENTATION_PLAN, TEST_PLAN, ACCEPTANCE_CRITERIA,
   M6_IMPLEMENTATION_NOTES, M6_TEST_RESULTS, M6_VISUAL_REGRESSION, M6_INFRASTRUCTURE,
   M6_COMPLETION_REPORT, NEXT_AGENT_HANDOFF). STOP after M6; do not merge M6; do not start M7.
No production infrastructure. No legacy data migration. Do not stage secrets or test-results.
```

---

## Final closeout (M5 approved for integration, 2026-09-25)

**Status: APPROVED FOR INTEGRATION** into `development` after the final verification below.

| Item | Value |
|---|---|
| Final HEAD (= origin) | `2e4e641` (docs). Last executable commit: `6a469ed` |
| Final CI | `36108058074` on `2e4e641`: **success**. Both jobs, including integration 88 and E2E 9, re-ran on the docs commit. `36106977932` on `6a469ed`: success |
| Changes after `6a469ed` | Only `migration-upgrade/**` (reports, evidence, screenshots); no executable, migration, test, CI or security file |
| Working tree | Clean. **0 untracked files** |

**Disposition of local-run evidence and other local files:**

| Class | Files | Disposition |
|---|---|---|
| A. Required milestone evidence | the local, hosted and preview evidence JSON, the EXPLAIN output, the bundle scans, the screenshots | All committed in `2e4e641`; nothing outstanding |
| B. Reproducible temporary output | `apps/web/dist/`, `test-results/`, `.playwright-mcp/`, `supabase/.temp/`, `supabase/.branches/` | Git-ignored; not committed |
| C. Sensitive / local-only | `.env.local`, `.env.m1b-local`, `supabase/signing_keys.json`, `.vercel/` | Git-ignored; never staged |

**User decisions from the M5 review:**

1. **Interview reminders: APPROVED TO MOVE INTO M6.** They are implemented through the canonical Tasks architecture. There is no separate interview-only reminder system.
2. **Typed participant names → Contacts: DEFERRED.** Free-text names remain valid, and no draft contacts are created automatically. Any future conversion is an explicit user action.
3. **Manager audit viewer / read-audit: DEFERRED.** Mutation auditing stays as it is.
4. **Networking progress checklist: DEFERRED.** The fake checklist is not restored; it needs a persisted model and approved UX first.
5. **M2 shell styling: NON-BLOCKING.** It may be fixed in M6 only if the change is small, cosmetic, Direction-D-faithful and regression-covered.
6. **Legacy interview types: KEEP** Behavioral, Coding and Final. Any normalization happens explicitly during legacy-data migration.
