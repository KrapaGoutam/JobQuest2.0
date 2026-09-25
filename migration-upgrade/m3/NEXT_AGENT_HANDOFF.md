# M3 → Next Agent Handoff

This file is for any coding agent (Claude Code, Antigravity, Codex, …); no chat history is needed.

## 1. Current state

| Item | State |
|---|---|
| Milestone | **M3 (Applications Workflow & Data Grid): COMPLETE, awaiting user review** |
| Branch | `feature/m3-applications-workflow` (pushed). **Not merged** into `development` or `main`. No PR. |
| Base | `development` @ `9bfac15` (M2 approved) |
| M3 commits | `98958b4` (Antigravity checkpoint), `79c1825`, `58155be`, `e8fedb2`, then the final docs commit |
| Auth | Option B (Node-minted ES256 JWTs, Argon2id, app-owned sessions), unchanged |
| Supabase | `jobquest-dev` (`xpnkasclquplmrcmhsif`, DEV): migrations `120000`, `200000`, `300000`, `310000`, `320000` all applied **and recorded** |
| Vercel | Project `jobquest2`, team `one-piece-5779`. **Preview only**; env vars scoped to Preview and Development; no production |
| Production | None anywhere |
| Legacy | `../JobQuest1.0/` is READ ONLY |

## 2. Architecture rules M3 now enforces (do not regress)

- **Lifecycle changes go through the RPCs only.** `stage`, `status`, `outcome`, `closure_reason`, `closure_notes`, `closed_at` and `archived_at` cannot be written directly by `anon`/`authenticated` (trigger `trg_application_lifecycle` → `42501 LIFECYCLE_CHANGE_REQUIRES_RPC`). Use:
  - `rpc_move_application_stage`
  - `rpc_set_application_outcome`
  - `rpc_keep_application_active`
  - `rpc_archive_application` / `rpc_restore_application`
- **`application_events` is append-only and database-written** (RPCs + CREATED/CAPTURED triggers). Clients may only SELECT.
- **`job_snapshots` is immutable**: SELECT/INSERT only, one per application.
- **Stage ≠ State ≠ Outcome ≠ Closure reason.** Closure reason is required for WITHDRAWN and rejected otherwise. Archive is independent of state. **No automatic mutation.**
- **Usernames for members** come only from `rpc_list_workspace_members` (`user_accounts` stays unreachable).
- **Search** must use `buildSearchFilter` (in `apps/web/src/types/applications.ts`); never interpolate user input into PostgREST filters.
- **Overlays** use `components/ui/useOverlay.ts` (topmost handles Esc/Tab; dialogs above drawers).

## 3. How to verify

```sh
# local stack (Docker; this repo uses ports 553xx)
pnpm local:key          # only if supabase/signing_keys.json is missing
npx supabase start -x studio,imgproxy,vector,logflare,realtime,storage-api,edge-runtime,postgres-meta,supavisor
pnpm local:env          # writes .env.m1b-local (gitignored)
pnpm lint && pnpm typecheck && pnpm test:unit && pnpm build && pnpm check:bundle && pnpm check:secrets
pnpm test:integration                                  # 55 tests (M3 38 + M1B 17), local
M1B_ENV_FILE=.env.local pnpm test:integration          # same suite against hosted jobquest-dev
pnpm test:e2e                                          # 7 specs, local servers
M1_BASE_URL=<preview-url> npx playwright test e2e/leak.spec.ts e2e/m2-shell.spec.ts e2e/m3-applications.spec.ts
```

Notes:
- If every Option B token fails with `PGRST301`, the running local stack trusts a different key than `supabase/signing_keys.json`. Restart only the JobQuest stack (`npx supabase stop && npx supabase start …`).
- Preview E2E registers real users. The deployed per-IP register limit is 3/hour, so run each spec once per hour per IP.
- `e2e/capture-m2-screenshots.spec.ts` rewrites the approved M2 baselines. Restore them afterwards (`git restore migration-upgrade/m2/`).
- On Windows, `pnpm` must be on PATH for nested package scripts.

## 4. Known limitations and open questions

- Bulk actions call one RPC per record, sequentially.
- `applied_at` defaults to creation time (from `300000`).
- No reopen flow (Gate 02B defines none).
- M2 shell observations (topbar layout, sidebar labels, role label, Dashboard highlight on `/`, placeholder search palette) are unchanged; see `M3_VISUAL_REGRESSION.md` §3.
- **User decisions pending:** merge M3; schedule shell polish; reopen flow.

## 5. Source-of-truth documents

1. `migration-upgrade/m3/M3_COMPLETION_REPORT.md`
2. `migration-upgrade/m3/M3_TEST_RESULTS.md`
3. `migration-upgrade/m3/M3_IMPLEMENTATION_NOTES.md`
4. `migration-upgrade/m3/M3_VISUAL_REGRESSION.md`
5. `migration-upgrade/m3/ACCEPTANCE_CRITERIA.md`
6. `migration-upgrade/gate-03/GATE_03_AUTH_OPTION_B_AMENDMENT.md`, `migration-upgrade/gate-03/RPC_DOMAIN_OPERATIONS.md`
7. `migration-upgrade/m2/M2_COMPLETION_REPORT.md`, `migration-upgrade/ui-design/gate-02b/GATE_02B_UI_SPEC.md`

## 6. Next phase (only after explicit user approval)

1. The user reviews `M3_COMPLETION_REPORT.md`.
2. If approved: merge `feature/m3-applications-workflow` into `development` with `--no-ff`, and push. Never touch `main`.
3. Plan **M4: Contacts & Networking** on a new branch from the updated `development`.

## 7. Ready-to-copy next-agent prompt

```
Resume JobQuest 2.0 (repo KrapaGoutam/JobQuest2.0). M3 (Applications Workflow & Data Grid)
is COMPLETE on branch feature/m3-applications-workflow and awaiting user review.

Read first: migration-upgrade/m3/NEXT_AGENT_HANDOFF.md, M3_COMPLETION_REPORT.md,
M3_TEST_RESULTS.md, M3_IMPLEMENTATION_NOTES.md.

Rules:
- Do NOT merge anything unless the user explicitly approves it in this session; never touch main.
- Do NOT start M4 until the user approves M3 and asks for M4.
- ../JobQuest1.0/ is READ ONLY. No production Supabase or Vercel deployments.
- Preserve Option B auth, direct Data API + RLS, the RPC-only lifecycle boundary,
  append-only application_events, immutable job_snapshots, Stage != State != Outcome != Closure
  reason, no automatic mutation, Direction D and the M2 shell.
- Never print or commit secrets (.env.local, .env.m1b-local, supabase/signing_keys.json).
- Before any remote DB command, verify the branch, project ref xpnkasclquplmrcmhsif (DEV) and
  a dry run.
First task: ask the user whether M3 is approved for merge and what comes next.
```
