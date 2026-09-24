# M1B → Next Agent Handoff

This file is written for any coding agent (Claude Code, Antigravity, Codex, …) and needs no chat history.

## Current state

| Item | State |
|---|---|
| Repo | `KrapaGoutam/JobQuest2.0` |
| Branches | `feature/m1b-option-b-auth-spike` (active, pushed); `feature/m1-foundation-auth-spike` (Option A history, pushed, keep intact). **Nothing merged to `development` or `main`. No PR.** |
| Legacy | `../JobQuest1.0/` is READ ONLY; never link to it |
| M1 (Option A) | **FAILED, final.** Supabase Auth `/auth/v1/user` leaked the synthetic email (`migration-upgrade/m1/M1_AUTH_OPTION_A_RESULT.md`) |
| M1B (Option B) | **COMPLETED — OPTION B PASS.** 26/26 B-tests + SEC PASS across Local Supabase stack, GitHub Actions CI (Run `36053855534`), and hosted `jobquest-dev` (`integration-hosted-dev-56ede5.json`, `e2e-browser-hosted-dev-593c4b.json`). Zero hard-fail conditions |
| Supabase dev | `jobquest-dev` (ref `xpnkasclquplmrcmhsif`, org `fisaxwdkkdpbamvwkvnm`, us-west-2), active. Schema = M1 + M1B (`20260924200000_m1b_option_b_auth.sql` applied). Active signing key `a73390b9-56bf-4d1a-a642-efd4479ca0b3` (`in_use`), prior keys preserved and trusted. 4 dev settings restored; 5th (storage analytics) explained (requires paid tier for Iceberg catalog). 20 synthetic Option A test accounts purged |
| Supabase CLI | Authenticated as `goutam.krapa11@gmail.com` (`059ca115-edbc-4269-894b-77cf4531b18b`). Linked to `jobquest-dev` (`xpnkasclquplmrcmhsif`) |
| Vercel | CLI account `goutamkrapa11-8565`, team `one-piece-5779`, **0 projects**. No Vercel project created. No production anywhere |
| Local | Docker Supabase stack for this repo on ports 553xx (another project, `restaurant-roster`, uses 543xx: leave it alone) |

## Architecture (Option B, VERIFIED & APPROVED)

- The Node API owns credentials (Argon2id in `user_credentials`) and sessions (`auth_sessions`, plus single-use rotating refresh tokens in `auth_refresh_tokens` / HttpOnly `jq_rt`).
- It mints 15-minute ES256 JWTs (`sub`, `role=authenticated`, `aud`, `iss`, `iat`, `exp`, `jti`, `session_id`) with the server-only `JQ_JWT_PRIVATE_JWK`.
- The browser calls the Supabase Data API directly: supabase-js `accessToken` option, RLS, `auth.uid()` = `sub`.
- There are no Supabase Auth identities.
- The service role is used only for auth RPCs.
- Normative spec: `migration-upgrade/gate-03/GATE_03_AUTH_OPTION_B_AMENDMENT.md`.

## Schema state

- M1 foundation (7 tables) plus migration `20260924200000_m1b_option_b_auth.sql` applied to local, CI, and hosted `jobquest-dev`:
  - 4 auth tables (`user_credentials`, `auth_sessions`, `auth_refresh_tokens`, `auth_rate_limits`)
  - the `auth.users` FK dropped (`user_accounts.user_id default gen_random_uuid()`)
  - session liveness via `auth_sessions`
  - 11 service-role RPCs
  - Option A hook and bootstrap RPC removed
- The full 25-table schema is **not** implemented (reserved for M2).

## Tests and CI

- **Local stack:** `pnpm local:key`, `npx supabase start -x studio,imgproxy,vector,logflare,realtime,storage-api,edge-runtime,postgres-meta,supavisor`, `pnpm local:env`, `pnpm test:integration`, `pnpm test:e2e`.
- **Static:** `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` (37), `pnpm build`, `pnpm check:bundle`, `pnpm check:secrets`.
- **Hosted dev:** `$env:M1B_ENV_FILE=".env.local"; pnpm test:integration` (17/17 PASS), `$env:M1B_ENV_FILE=".env.local"; pnpm test:e2e` (PASS).
- **CI:** `.github/workflows/m1b-ci.yml`; run `36053855534` on commit `6e17efc` fully green.
- Windows note: package scripts call `pnpm`, which must be on PATH; `corepack pnpm` alone is not enough for nested calls.

## Known deviations

See `migration-upgrade/m1b/M1B_COMPLETION_REPORT.md` §24:
- 4 new auth tables
- Postgres rate limiter instead of Upstash
- `jq_rt` cookie name
- access token held in memory
- M1 deviations carried over

## Open questions status

- OQ-011: RESOLVED PASS (Option B replaces Option A)
- OQ-025: RESOLVED (Signing key imported and rotated to `in_use`)
- OQ-026: RESOLVED (CLI authenticated to `goutam.krapa11@gmail.com`)
- OQ-027: RESOLVED (4 dev settings restored; 5th explained)
- OQ-028: RESOLVED (20 synthetic Option A test accounts purged)
- OQ-029: OPEN (Production key custody: env vs KMS)
- OQ-030: OPEN (Edge/WAF limits before production)
- OQ-031: RESOLVED (Vanished project: CAUSE UNKNOWN)
- Approval of amendment ADR-043 to ADR-047: APPROVED BASED ON M1B PROOF

## Source-of-truth documents (read in order)

1. `migration-upgrade/m1b/M1B_COMPLETION_REPORT.md`
2. `migration-upgrade/m1b/M1B_AUTH_OPTION_B_RESULT.md`
3. `migration-upgrade/gate-03/GATE_03_AUTH_OPTION_B_AMENDMENT.md`
4. `migration-upgrade/m1b/M1B_INFRASTRUCTURE.md`
5. `migration-upgrade/m1b/M1B_TEST_PLAN.md`, `M1B_TEST_RESULTS.md`
6. `migration-upgrade/m1/M1_AUTH_OPTION_A_RESULT.md`, `migration-upgrade/m1/M1_CLOSEOUT_INVESTIGATIONS.md`
7. `migration-upgrade/DECISIONS.md`, `OPEN_QUESTIONS.md`, `CHANGE_REQUESTS.md`

## Exact next phase

**Awaiting user review and approval.**
The M1B Option B authentication spike is complete. Do NOT start M2. Do NOT merge to development or main.

## Ready-to-copy next-agent prompt

```
You are continuing JobQuest 2.0 (repo KrapaGoutam/JobQuest2.0), branch feature/m1b-option-b-auth-spike.
../JobQuest1.0/ is READ ONLY. Never link to it.

Read, in order:
1. migration-upgrade/m1b/M1B_COMPLETION_REPORT.md
2. migration-upgrade/m1b/M1B_AUTH_OPTION_B_RESULT.md
3. migration-upgrade/gate-03/GATE_03_AUTH_OPTION_B_AMENDMENT.md
4. migration-upgrade/m1b/M1B_INFRASTRUCTURE.md
5. migration-upgrade/m1b/NEXT_AGENT_HANDOFF.md

Status:
- M1 Option A: FAILED (final)
- M1B Option B: OPTION B — PASS across Local Supabase stack, GitHub Actions CI, and hosted Supabase jobquest-dev (ref xpnkasclquplmrcmhsif).
- Signing key: a73390b9-56bf-4d1a-a642-efd4479ca0b3 (in_use); prior keys preserved in previously_used.
- Migration 20260924200000 applied to jobquest-dev.
- Dev settings restored; Option A test identities purged.
- Working branch: feature/m1b-option-b-auth-spike. Nothing merged to development or main.

Task: Await user instructions following their review of M1B completion.
Do NOT start M2 without explicit user authorization.
Do NOT merge to development or main without explicit user authorization.
```

