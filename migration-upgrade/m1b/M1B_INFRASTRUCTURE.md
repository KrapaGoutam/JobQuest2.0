# M1B Infrastructure

Only DEV resources exist. **No production project exists anywhere. No Vercel project was created.** Nothing is linked to JobQuest1.0.

## 1. Verified state (2026-09-24, hosted validation completed)

| Item | State | How verified |
|---|---|---|
| Supabase `jobquest-dev` (ref `xpnkasclquplmrcmhsif`, org `fisaxwdkkdpbamvwkvnm`, us-west-2) | Active: Auth health 200, Option B schema applied, active signing key `a73390b9-56bf-4d1a-a642-efd4479ca0b3` | Supabase Management API, JWKS endpoint, and integration test suite |
| `jobquest-dev` schema | **M1 + M1B migrations applied.** `20260924200000_m1b_option_b_auth.sql` pushed | `npx supabase db push` (clean exit, all Option B tables, types, RPCs, and RLS policies created) |
| Supabase CLI & Account | Authenticated as `goutam.krapa11@gmail.com` (org `fisaxwdkkdpbamvwkvnm` "OnePiece2.0", user id `059ca115-edbc-4269-894b-77cf4531b18b`). Linked to `jobquest-dev` (`xpnkasclquplmrcmhsif`) | `npx supabase orgs list`, `npx supabase projects list`, linked ref check |
| Other Supabase projects | `the-lineup` belongs to another account (`krapagoutam@gmail.com`). **Not touched.** The previously seen `JobQuest2.0` (`tezddimqfpyljhsaucmx`) is not visible (cause unknown; see `../m1/M1_CLOSEOUT_INVESTIGATIONS.md` §2) | Read-only listing |
| Vercel | CLI account `goutamkrapa11-8565`, team `one-piece-5779`, **0 projects**. No Vercel project created | `vercel whoami`, `vercel project ls` |
| Production | none | Verified |
| Local Supabase stack (M1B proof) | Docker; project_id `JobQuest2.0`; ports **553xx**; trusts generated ES256 key (`supabase/signing_keys.json`) | `pnpm test:integration` (local, 17/17 PASS), `pnpm test:e2e` (local, PASS) |
| CI | `M1B CI` workflow (`.github/workflows/m1b-ci.yml`). Disposable local stack plus ephemeral key per run; no repository secrets | Run `36053855534` (PASS) |
| Hosted validation (`jobquest-dev`) | Full B01–B26 test matrix and browser leak test | `tests/integration/m1b.test.ts` (17/17 PASS), `e2e/leak.spec.ts` (PASS) |

## 2. Supabase dev configuration changes & restoration

During M1, an unintended broad configuration push changed several development settings. M1B restored the verified pre-M1 settings using targeted Management API calls (`PATCH /v1/projects/{ref}/config/auth`), avoiding broad configuration pushes.

### Verified pre-M1 configuration restoration

| Setting | Before M1 (verified) | Drifted on hosted (per M1 push) | Restored value | Restoration method & verified status |
|---|---|---|---|---|
| `auth.mfa.totp.enroll_enabled` | true | false | **true** | Restored via `PATCH /v1/projects/{ref}/config/auth` (`mfa.totp.enroll_enabled: true`); verified via API |
| `auth.mfa.totp.verify_enabled` | true | false | **true** | Restored via `PATCH /v1/projects/{ref}/config/auth` (`mfa.totp.verify_enabled: true`); verified via API |
| `auth.email.otp_length` | 8 | 6 | **8** | Restored via `PATCH /v1/projects/{ref}/config/auth` (`email.otp_length: 8`); verified via API |
| `auth.email.max_frequency` | `1m0s` | `1s` | **1m0s** (`smtp_max_frequency: 60`) | Restored via `PATCH /v1/projects/{ref}/config/auth` (`email.max_frequency: 60`); verified via API |
| `storage.analytics.enabled` | true | false | Blocked by platform tier | Attempted via `PATCH /v1/projects/{ref}/config/storage` with `{"analytics":{"enabled":true}}`. Remote API returned `{"message":"Please upgrade the project to a paid tier to enable iceberg catalog"}`. Verified why it drifted: Iceberg catalog/analytics is restricted to paid tiers on Supabase. |

## 3. Signing-key lifecycle & rotation (COMPLETED)

M1B Option B requires Supabase's Data API (PostgREST) to validate Node-minted JWTs. An ES256 key pair was created and activated following Supabase's documented signing-key lifecycle.

### Key state before change
- `eb8f7afa-46e9-4d1d-a3db-06738ab101e0` (HS256): `previously_used`
- `e520372b-f578-4d04-bee6-46cbf5a52ae8` (ES256): `in_use`

### Key creation & import
1. Generated an ES256 key pair using the P-256 curve and SHA-256. Key ID (`kid`): `a73390b9-56bf-4d1a-a642-efd4479ca0b3`.
2. Stored the private JWK strictly on the server in `.env.local` as `JQ_JWT_PRIVATE_JWK`. **The private key was never committed, logged, or exposed.**
3. Imported the key into `jobquest-dev` via `POST /v1/projects/xpnkasclquplmrcmhsif/config/auth/signing-keys` with status `standby`.

### Key rotation
1. Activated the imported key via `PATCH /v1/projects/xpnkasclquplmrcmhsif/config/auth/signing-keys/a73390b9-56bf-4d1a-a642-efd4479ca0b3` with `{"status":"in_use"}`.
2. The prior key (`e520372b-f578-4d04-bee6-46cbf5a52ae8`) automatically transitioned to `previously_used` and **remains trusted**. It was **not revoked**.
3. Legacy symmetric secret and keys were **not touched**.

### Key state after rotation (verified)
- `a73390b9-56bf-4d1a-a642-efd4479ca0b3` (ES256): **`in_use`** (active Option B signing key)
- `e520372b-f578-4d04-bee6-46cbf5a52ae8` (ES256): **`previously_used`** (preserved as trusted, NOT revoked)
- `eb8f7afa-46e9-4d1d-a3db-06738ab101e0` (HS256): **`previously_used`** (preserved as trusted, NOT revoked)
- Public JWKS confirmed at `https://xpnkasclquplmrcmhsif.supabase.co/auth/v1/.well-known/jwks.json`.

## 4. Option A test identity cleanup (COMPLETED)

Leftover synthetic identities created during M1 Option A test runs were inventoried and cleaned up from `jobquest-dev`.

### Inventory summary
- **Total candidate users:** 20
- **Pattern:** All accounts matched `id_<uuid>@auth.jobquest.internal` with metadata `synthetic_test_user: true`.
- **Created at:** 2026-09-24 between 13:51:30 and 14:14:48 UTC (M1 test run window).
- **Inventory artifact:** Preserved in `migration-upgrade/m1b/evidence/option-a-users-inventory.json`.

### Cleanup actions
1. Removed corresponding rows in public tables (`applications`, `workspace_members`, `workspaces`, `profiles`, `user_accounts`).
2. Deleted all 20 synthetic accounts from `auth.users` via GoTrue admin delete API.
3. Verified zero remaining test accounts in `auth.users`. Option B test accounts do NOT create `auth.users` rows.

## 5. Environment variables (names only)

- Web: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- API (server only):
  - `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, **`JQ_JWT_PRIVATE_JWK`**, `JQ_JWT_ISSUER`, `APP_ORIGINS`
  - Session and hashing: `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS`, `SESSION_MAX_SECONDS`, `PASSWORD_ARGON2_*`
  - Rate limits: `RATE_LIMIT_STORE`, `LOGIN_*`, `REGISTER_*`, `RECOVERY_*`, `PASSWORD_CHANGE_MAX_PER_HOUR`, `AUTH_FAILURE_FLOOR_MS`
- Tooling: `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL`
- Test harness: `M1B_ENV_FILE`, `M1B_TARGET`, `M1_BASE_URL`, `M1_BYPASS`

Local files (gitignored):
- `.env.local`: hosted dev configuration with `JQ_JWT_PRIVATE_JWK`.
- `.env.m1b-local`: local Docker stack configuration.
- `supabase/signing_keys.json`: local Docker stack signing key.

