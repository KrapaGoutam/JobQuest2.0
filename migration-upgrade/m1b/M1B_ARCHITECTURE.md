# M1B Architecture: Auth Option B (as implemented)

The normative design is `../gate-03/GATE_03_AUTH_OPTION_B_AMENDMENT.md`. This file maps it to the code.

## Request flows

| Flow | Path | Privilege |
|---|---|---|
| Register | `POST /api/auth/register` → `rpc_register_account` (account, credential, profile, PERSONAL workspace + MANAGER, 10 code verifiers) → `rpc_create_session` → mint | Service role (auth RPC) |
| Login | `POST /api/auth/login` → IP limit (DB) → lockout check → Argon2id verify → `rpc_clear_login_failures` / `rpc_record_auth_failure` → session → mint | Service role (auth RPC) |
| Refresh | `POST /api/auth/refresh` (CSRF) → `rpc_rotate_refresh_token` (`ok` / `reused` / `invalid`) → mint | Service role |
| Logout | `POST /api/auth/logout {scope}` (CSRF) → `rpc_revoke_sessions` | Service role |
| Me | `GET /api/auth/me` → verify JWT (`jose`) + `rpc_session_is_live` | Service role (read) |
| Password | `POST /api/auth/password` (CSRF, bearer, 3/h) → verify current → `rpc_change_password` (keep current, revoke others) | Service role |
| Recover | `POST /api/auth/recover` → IP limit → recovery lock → code match (hint + Argon2id) → `rpc_recover_account` (consume code, new verifier, revoke all) → new session | Service role |
| Regenerate codes | `POST /api/auth/recovery-codes` (CSRF, bearer, password) → `rpc_replace_recovery_codes` | Service role |
| **All user data** | Browser → `https://<ref>.supabase.co/rest/v1/*` with `apikey: <publishable>` and `Authorization: Bearer <JobQuest JWT>` | **authenticated + RLS** |
| Workflow for non-browser clients | `GET /api/workflow` → Data API **as the caller** (`userClient(token)`) | authenticated + RLS |

## Code map

| File | Role |
|---|---|
| `apps/api/src/env.ts` | Server config: signing key, TTLs, Argon2 parameters, limits (names only in errors) |
| `apps/api/src/lib/tokens.ts` | ES256 minting and verification (`jose`), claim contract, refresh-token generation, SHA-256 |
| `apps/api/src/lib/passwords.ts` | Argon2id hash, verify, rehash policy, timing equalizer |
| `apps/api/src/lib/db.ts` | `admin()` (service role, auth RPCs only) and `userClient()` (caller's token) |
| `apps/api/src/lib/rateLimit.ts` | `DbRateLimiter` (shared Postgres window) and in-memory limiter (tests / fallback) |
| `apps/api/src/lib/security.ts` | Origin/JSON enforcement, double-submit CSRF, cookies, headers (Option A alias guard removed) |
| `apps/api/src/routes/auth.ts` | Option B auth routes (new; the Option A façade was not carried forward) |
| `apps/api/src/lib/credentials.ts`, `recovery.ts` | Reused from M1 unchanged |
| `apps/web/src/App.tsx` | Harness; Web Locks-serialized refresh; B03 exposure self-check |
| `apps/web/src/supabase.ts` | `createClient(url, publishable, { accessToken })` (reused) |
| `supabase/migrations/20260924120000_m1_foundation.sql` | M1 foundation (applied history) |
| `supabase/migrations/20260924200000_m1b_option_b_auth.sql` | Option B amendment |
| `scripts/lib/secret-scan.mjs`, `scripts/check-bundle.mjs` | Structure-aware scanner (bundle / tracked) |
| `scripts/gen-local-signing-key.mjs`, `scripts/m1b-local-env.mjs` | Local-stack key and env (gitignored outputs) |
| `tests/integration/m1b.test.ts`, `e2e/leak.spec.ts`, `tests/unit/*` | Evidence-producing tests |

## Local development

```sh
pnpm local:key                     # supabase/signing_keys.json (gitignored)
npx supabase start -x studio,imgproxy,vector,logflare,realtime,storage-api,edge-runtime,postgres-meta,supavisor
pnpm local:env                     # .env.m1b-local (gitignored); prints names only
pnpm test:integration              # M1B_ENV_FILE defaults to .env.m1b-local
pnpm test:e2e
```

## Carried over from M1 vs not

- **Reused:** the 7-table schema and RLS policies, workspace RPC, last-manager and tenant triggers, recovery-code library, credential policy, CSRF and security middleware, harness scaffold, CI shape.
- **Not carried:**
  - Option A façade (`routes/auth.ts` from M1)
  - GoTrue client helpers (`lib/supabase.ts`)
  - Option A test suite (`m1.test.ts`)
  - alias guard
  - access token hook
  - `rpc_bootstrap_account`

These remain on `feature/m1-foundation-auth-spike` as history.
