# M1B → Next Agent Handoff

This file is written for any coding agent (Claude Code, Antigravity, Codex, …) and needs no chat history.

## Current state

| Item | State |
|---|---|
| Repo | `KrapaGoutam/JobQuest2.0` |
| Branches | `feature/m1b-option-b-auth-spike` (active, pushed); `feature/m1-foundation-auth-spike` (Option A history, pushed, keep intact). **Nothing merged to `development` or `main`. No PR.** |
| Legacy | `../JobQuest1.0/` is READ ONLY; never link to it |
| M1 (Option A) | **FAILED, final.** Supabase Auth `/auth/v1/user` leaked the synthetic email (`migration-upgrade/m1/M1_AUTH_OPTION_A_RESULT.md`) |
| M1B (Option B) | **NOT COMPLETE.** 26/26 B-tests + SEC PASS on a local Supabase stack (machine + CI run `36053855534`). Hosted `jobquest-dev` **not yet run**, held at the signing-key checkpoint |
| Supabase dev | `jobquest-dev` (ref `xpnkasclquplmrcmhsif`, org `fisaxwdkkdpbamvwkvnm`, us-west-2), alive. Schema = **M1 migration only**; the M1B migration is NOT pushed. Five dev settings still drifted from M1 |
| Supabase CLI / connector | Logged in to a **different account** (`the-lineup`, org `bacmegsdpcxrnfdpglub`). Cannot see `jobquest-dev`. **Do not touch `the-lineup`** |
| Vercel | Team `one-piece-5779`, **no project**. No production anywhere |
| Local | Docker Supabase stack for this repo on ports 553xx (another project, `restaurant-roster`, uses 543xx: leave it alone) |

## Architecture (Option B, PROPOSED)

- The Node API owns credentials (Argon2id in `user_credentials`) and sessions (`auth_sessions`, plus single-use rotating refresh tokens in `auth_refresh_tokens` / HttpOnly `jq_rt`).
- It mints 15-minute ES256 JWTs (`sub`, `role=authenticated`, `aud`, `iss`, `iat`, `exp`, `jti`, `session_id`) with the server-only `JQ_JWT_PRIVATE_JWK`.
- The browser calls the Supabase Data API directly: supabase-js `accessToken` option, RLS, `auth.uid()` = `sub`.
- There are no Supabase Auth identities.
- The service role is used only for auth RPCs.
- Normative spec: `migration-upgrade/gate-03/GATE_03_AUTH_OPTION_B_AMENDMENT.md`.

## Schema state

- M1 foundation (7 tables) plus migration `20260924200000_m1b_option_b_auth.sql`:
  - 4 auth tables
  - the `auth.users` FK dropped
  - session liveness via `auth_sessions`
  - 11 service-role RPCs
  - Option A hook and bootstrap RPC removed
- The full 25-table schema is **not** implemented.

## Tests and CI

- **Local stack:** `pnpm local:key`, `npx supabase start -x studio,imgproxy,vector,logflare,realtime,storage-api,edge-runtime,postgres-meta,supavisor`, `pnpm local:env`, `pnpm test:integration`, `pnpm test:e2e`.
- **Static:** `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` (37), `pnpm build`, `pnpm check:bundle`, `pnpm check:secrets`.
- **Hosted dev (after the checkpoint):** `M1B_ENV_FILE=.env.local` for both the integration and e2e runs.
- **CI:** `.github/workflows/m1b-ci.yml`; last run `36053855534` on `6e17efc` was fully green.
- Windows note: package scripts call `pnpm`, which must be on PATH; `corepack pnpm` alone is not enough for nested calls.

## Known deviations

See `migration-upgrade/m1b/M1B_COMPLETION_REPORT.md` §24:
- 4 new auth tables
- Postgres rate limiter instead of Upstash
- `jq_rt` cookie name
- access token held in memory
- M1 deviations carried over

## Open questions (user decisions)

- OQ-025: signing-key checkpoint approval
- OQ-026: CLI re-login to the JobQuest2.0 account
- OQ-027: restore the 5 drifted settings
- OQ-028: delete Option A test identities
- OQ-029: production key custody
- OQ-030: edge/WAF limits
- OQ-031: vanished project (cause unknown)
- Approval of amendment ADR-043 to ADR-047

## Source-of-truth documents (read in order)

1. `migration-upgrade/m1b/M1B_COMPLETION_REPORT.md`
2. `migration-upgrade/m1b/M1B_AUTH_OPTION_B_RESULT.md`
3. `migration-upgrade/gate-03/GATE_03_AUTH_OPTION_B_AMENDMENT.md`
4. `migration-upgrade/m1b/M1B_INFRASTRUCTURE.md` (§3 checkpoint)
5. `migration-upgrade/m1b/M1B_TEST_PLAN.md`, `M1B_TEST_RESULTS.md`
6. `migration-upgrade/m1/M1_AUTH_OPTION_A_RESULT.md`, `migration-upgrade/m1/M1_CLOSEOUT_INVESTIGATIONS.md`
7. `migration-upgrade/DECISIONS.md`, `OPEN_QUESTIONS.md`, `CHANGE_REQUESTS.md`

## Exact next phase

**M1B hosted verification.** It starts only after the user explicitly approves OQ-025 and has re-logged the CLI (OQ-026).

## Ready-to-copy next-agent prompt

```
You are continuing JobQuest 2.0 (repo KrapaGoutam/JobQuest2.0), branch feature/m1b-option-b-auth-spike.
../JobQuest1.0/ is READ ONLY. Never link to it.

Read, in order: migration-upgrade/m1b/M1B_COMPLETION_REPORT.md,
migration-upgrade/m1b/M1B_AUTH_OPTION_B_RESULT.md,
migration-upgrade/gate-03/GATE_03_AUTH_OPTION_B_AMENDMENT.md,
migration-upgrade/m1b/M1B_INFRASTRUCTURE.md (section 3), migration-upgrade/m1b/NEXT_AGENT_HANDOFF.md.

Facts: Auth Option A FAILED (final). Option B passed B01-B26 + SEC on a local Supabase stack and
in CI, but has NOT been run against hosted jobquest-dev (ref xpnkasclquplmrcmhsif). The M1B
migration is not yet pushed there. The Supabase CLI may be logged in to a different account.

Task: M1B hosted verification. Do each step only if the user has explicitly approved it in THIS
session:
 1. Confirm the Supabase CLI account can see org fisaxwdkkdpbamvwkvnm / project
    xpnkasclquplmrcmhsif. If not, stop and ask the user to log in. Never touch other projects.
 2. Read and record the current JWT signing-key state (read-only). Then report current state,
    planned action, effect and rollback, and get approval.
 3. Generate an ES256 key outside the repo; put it ONLY in .env.local as JQ_JWT_PRIVATE_JWK
    (never print it). User imports it as a STANDBY key in the dashboard, then ROTATES.
    Never revoke keys. Never touch the legacy JWT secret.
 4. Verify branch, ref and DEV, then push migration 20260924200000 with supabase db push.
 5. Restore only the 5 verified settings (TOTP enroll/verify true, OTP length 8,
    email max_frequency 1m0s, storage analytics true) with a narrow change, not a broad
    config push. Record before and after.
 6. Run M1B_ENV_FILE=.env.local pnpm test:integration and pnpm test:e2e. Record evidence.
 7. Update the m1b reports with a final OPTION B - PASS or FAIL.
Do NOT: start M2, merge, open PRs, create production resources, create a Vercel project
before Option B passes on hosted dev, print or commit secrets, or weaken security checks.
Stop for user review afterwards.
```
