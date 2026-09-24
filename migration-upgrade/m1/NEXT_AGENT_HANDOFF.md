# M1 → Next Agent Handoff

## State at handoff

- **Repo:** `KrapaGoutam/JobQuest2.0`, branch `feature/m1-foundation-auth-spike` (pushed; **not merged**, no PR).
- **Legacy:** `../JobQuest1.0/` is READ ONLY and must never be linked.
- **M1 result:** **OPTION A — FAIL.** Supabase Auth's public `GET /auth/v1/user` returns the synthetic alias email to the browser-held access token. Direct PostgREST (a Gate 03 requirement) forces the browser to hold that token. See `migration-upgrade/m1/M1_AUTH_OPTION_A_RESULT.md`.
- **Worked and is reusable:**
  - 7-table schema and RLS (`supabase/migrations/20260924120000_m1_foundation.sql`)
  - workspace bootstrap
  - last-manager trigger
  - recovery-code library
  - CSRF and security middleware
  - integration and e2e leak harnesses
- **Infra:**
  - Supabase dev project `jobquest-dev` (ref `xpnkasclquplmrcmhsif`, org `fisaxwdkkdpbamvwkvnm`), linked.
  - Vercel team `one-piece-5779` with **no project**.
  - No production anywhere.
- **Secrets:** only in the gitignored `.env.local` (names in `.env.example`). Never print or commit them.

## Open decisions (user must answer before work continues)

1. Approve an Option B spike (Node-minted JWTs, no GoTrue identity)? Or change Gate 03 to drop direct PostgREST?
2. `check:bundle` fails on the supabase-js `sb_secret_` literal and the harness alias marker; no real keys are present. Should the scanner be narrowed? It was not changed without approval.
3. Restore dev auth settings altered by `supabase config push` (MFA TOTP, OTP length, storage analytics)?
4. What happened to the vanished `JobQuest2.0` Supabase project (`tezddimqfpyljhsaucmx`)?

## Known defects (unfixed because of the stop rule)

- T09: password change revokes the current session (`apps/api/src/routes/auth.ts`, `POST /password`).
- T07: the parent refresh token was accepted after the reuse interval; no family revocation.
- CI run `36042112818` failed (stale config at `c5d8dc6`, plus `check:bundle`).

## Ready-to-copy next-agent prompt

```
You are continuing JobQuest 2.0 in the repo KrapaGoutam/JobQuest2.0 (local folder JobQuest2.0).
../JobQuest1.0/ is READ ONLY; never link to it.

Read first, in order:
  migration-upgrade/m1/README.md
  migration-upgrade/m1/M1_AUTH_OPTION_A_RESULT.md
  migration-upgrade/m1/M1_COMPLETION_REPORT.md
  migration-upgrade/gate-03/ (approved architecture)

Facts:
- M1 concluded OPTION A — FAIL. Supabase Auth's /auth/v1/user returns the synthetic alias
  email to the browser-held access token required for direct PostgREST.
- Work lives on branch feature/m1-foundation-auth-spike (unmerged).
- Dev Supabase project: jobquest-dev (ref xpnkasclquplmrcmhsif). No Vercel project exists.
  No production resources may be created.

Do NOT:
- implement Option B, start M2, merge any branch, open a PR, deploy to Vercel, or create
  production resources, unless the user has explicitly approved that specific step in this
  session;
- print or commit secrets (.env.local holds them);
- relax security checks (e.g. scripts/check-bundle.mjs) without explicit user approval.

First task: ask the user which open decision in migration-upgrade/m1/NEXT_AGENT_HANDOFF.md
they have made. If they approve an Option B spike, first write a short design (JWT signing via
imported key / Supabase third-party auth, credential and session tables as a Gate 03
amendment, revocation replacing app.session_is_active(), rate limiting). Get it approved,
then reuse the M1 harness so T01–T12 are re-run, with T03 including the /auth/v1/user probe.
Before any remote DB command, verify the branch, project ref, that the target is DEV, and that
it is not JobQuest1.0.
```
