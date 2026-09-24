# Gate 03 Amendment: Authentication Option B

**Document ID:** `JQ2-GATE03-AUTH-002`
**Amends:** `AUTHENTICATION_DESIGN.md` (authentication only; no other part of Gate 03 changes)
**Status:** `PROPOSED: SPIKE-VERIFIED ON A LOCAL SUPABASE STACK; HOSTED-DEV VERIFICATION PENDING (signing-key checkpoint)`
**Date:** 2026-09-24
**Evidence:** `../m1b/M1B_AUTH_OPTION_B_RESULT.md`, `../m1b/evidence/`

This amendment becomes binding only after the user reviews M1B and approves it. The Option A text in `AUTHENTICATION_DESIGN.md` is kept for history and marked **SUPERSEDED / FAILED IN M1**.

---

## 1. Reason for the amendment

Gate 03 approved Option A (username/password in front of Supabase Auth, using a synthetic internal email) **provisionally**. A hard-fail invariant applied: *the synthetic identity must never reach the browser.* On failure, the Gate 03 architectural fallback is Option B (`AUTHENTICATION_DESIGN.md` §3, `M1_SPIKE_PLAN.md` §4).

## 2. Option A failure evidence (M1)

- Direct browser Data API access (a Gate 03 requirement, ADR-042) means the browser must hold a Supabase Auth access token.
- Supabase Auth's public `GET /auth/v1/user` accepts that token and returns the user record, **including the synthetic email**.
- Integration evidence: `../m1/evidence/integration-191a31.json` (T03).
- Real Chromium evidence: `../m1/evidence/e2e-leak-local-7e830d.json` (`network_hits: ["response:/auth/v1/user"]`).
- No supported setting disables that endpoint. Hiding the email cosmetically, filtering responses, or patching `getUser()` are prohibited.
- ADR-030 is therefore **SUPERSEDED / FAILED IN M1**.

## 3. Option B architecture

```
Browser (SPA)
  │  POST /api/auth/login {username, password}   (same origin; CSRF defenses unchanged)
  ▼
Node API (Hono on Vercel Functions)
  ├─ verifies Argon2id credential        → public.user_credentials
  ├─ creates app-owned session            → public.auth_sessions
  ├─ issues rotating refresh token        → HttpOnly cookie jq_rt; SHA-256 in public.auth_refresh_tokens
  └─ mints ES256 access JWT (15 min)      → JSON body, held in browser memory only
  │
  ▼
Browser → Supabase Data API (PostgREST) directly
  supabase-js createClient(url, publishableKey, { accessToken: () => jwt })
  PostgREST verifies the JWT against the project's trusted signing key.
  role = authenticated; auth.uid() = sub; RLS enforces isolation.
```

- **There is no Supabase Auth (GoTrue) user for any JobQuest account.** `/auth/v1/user` has nothing to return (measured: 403 `user_not_found`).
- The hybrid access model of ADR-042 is unchanged: Data API for reads and CRUD, RPCs for domain operations, Node for auth and secrets.
- **The service role is never used for user CRUD.** It is used only for explicit privileged auth RPCs (register, session, rotation, password, recovery, rate limit). A static unit test enforces this.

## 4. Credential ownership and password hashing

- JobQuest owns the credential; Supabase Auth does not.
- Table `public.user_credentials` is separate from identity metadata (`user_accounts`). Its columns:
  - `user_id`
  - `password_hash` (PHC string)
  - `password_algorithm = 'argon2id'`
  - `password_version`
  - `password_changed_at`
  - `created_at`, `updated_at`
- **Argon2id** via `@node-rs/argon2`. Parameters are centrally configured in `apps/api/src/env.ts` (default m = 19456 KiB, t = 2, p = 1, the OWASP baseline), with floors enforced by the schema.
  - Each PHC string carries its own parameters.
  - `needsRehash()` upgrades verifiers transparently on the next successful login.
- Password policy is unchanged: at least 10 characters, at most 72 bytes, zxcvbn score ≥ 2, and the password may not contain the username.
- Unknown usernames still pay one Argon2 verification (`burnVerify`), and failures have a response-time floor, which defends against username enumeration.

## 5. Session model

- Table `public.auth_sessions` holds one row per signed-in device. Its columns:
  - `user_id`
  - `created_at`, `last_used_at`
  - `expires_at` (absolute, 30 days)
  - `revoked_at`, `revoked_reason`
  - `user_agent`
  - `ip_hash` (SHA-256 of the IP; the raw IP is never stored)
- `app.session_is_active()` now checks this table using the JWT `session_id` claim. Every RLS helper calls it, so a revoked session loses Data API access **immediately**, even though its stateless access JWT has not expired. A revoked token receives 200 `[]`, not 401.

## 6. Refresh-token model

| Property | Design |
|---|---|
| Format | `jqr_` + 256 random bits (base64url) |
| Transport | `jq_rt` cookie: HttpOnly, Secure, SameSite=Strict, Path=/api/auth |
| Storage | SHA-256 hex only (`auth_refresh_tokens.token_hash`). A fast hash is appropriate for a 256-bit random secret, and it permits indexed lookup |
| Rotation | Single use: `rpc_rotate_refresh_token` consumes the presented token (`used_at`) and issues a child (`parent_id`) in one transaction |
| Replay | Presenting an already-consumed token revokes the whole session (`REFRESH_REUSE`). Every token of that session dies with it |
| Grace window | **None.** Justification: any grace window lets a stolen token be replayed inside it. Benign races are prevented at the source: the SPA serializes refresh across tabs with the Web Locks API (`navigator.locks`, lock `jobquest-refresh`) |
| Concurrency | A conditional `UPDATE … WHERE used_at IS NULL` row lock gives exactly one winner (measured: 5 concurrent attempts → 1 success) |
| Revocation | Logout (local or global), password change (others), recovery (all), replay (that session) |

## 7. JWT signing (access tokens)

- **Algorithm: ES256** (ECDSA P-256).
  - The Supabase CLI recommends it (`supabase gen signing-key`: "ES256 (recommended)").
  - It is supported by the signing-keys system (RSA, EC and shared secret are listed).
  - Signatures are small. RS256 is also supported but has no advantage here.
- **Private key: server only.** It is held in env var `JQ_JWT_PRIVATE_JWK` (Vercel sensitive env, and a local gitignored file). It is never in the browser, the Vite bundle, the extension, Git, database rows or logs. The bundle scanner checks the known key component value.
- **Public key: trusted by Supabase.** The private key is imported into the project's JWT signing keys; Supabase keeps it non-extractable and publishes the public half at `/auth/v1/.well-known/jwks.json`.
- **Threat-model consequence:** anyone holding this key can mint any `role`, including `service_role`. It is therefore as sensitive as the secret API key.
  - The Node API only ever mints `role = authenticated`; a unit test asserts the claim contract.
  - A future hardening option is signing through a managed KMS so the key never exists in function memory. This is not evaluated in M1B.

### Supabase trust configuration (hosted), from the official docs

Per <https://supabase.com/docs/guides/auth/signing-keys>:

1. Generate the key: `supabase gen signing-key --algorithm ES256`.
2. Import it as a **new standby key** (dashboard → JWT signing keys).
3. **Rotate** to make it the current key.

The documented state table says a newly created or imported key is in standby, and the accepted signatures are then **"Current key only"**. **A standby key is not trusted.** Rotation is therefore required for the Data API to accept Node-minted tokens.

- Rotation keeps the previous key trusted ("Both keys in the rotation").
- Each state change is reversible except deletion, and is throttled for about 5 minutes.
- The docs then direct: set the `kid` header to the imported key's `kid`; claims `sub`, `role` and `exp`; send it as `Authorization: Bearer <JWT>` to the Data API, with a separate `apikey` header.

**Checkpoint (§30 of the M1B instructions):** rotating the signing key of `jobquest-dev` is a key-state transition. It requires the user's explicit approval **and** CLI or dashboard access by the JobQuest2.0 Supabase account; the currently authenticated account cannot see the project. See `../m1b/M1B_INFRASTRUCTURE.md` §3 for current state, planned action, effect and rollback.

### Local stack (proven)

`supabase/config.toml` sets `[auth] signing_keys_path = "./signing_keys.json"`. The file is generated per machine or CI run (`pnpm local:key`) and gitignored. The local Auth and Data API then trust that key, which is the same trust relationship the hosted rotation creates.

## 8. Required claims (access-token contract)

| Claim | Value | Why |
|---|---|---|
| header `alg` / `kid` / `typ` | `ES256` / imported key id / `JWT` | Key selection (`kid` must match the imported key) |
| `sub` | `user_accounts.user_id` (app-owned UUID) | `auth.uid()` |
| `role` | `authenticated` | PostgREST switches to this Postgres role; grants and RLS apply |
| `aud` | `authenticated` | Supabase convention |
| `iss` | `jobquest-api` (`JQ_JWT_ISSUER`) | Identifies the minting service; Node verifies it |
| `iat`, `exp` | 15 min lifetime (`ACCESS_TOKEN_TTL_SECONDS`) | Short-lived |
| `jti` | random UUID | Audit correlation |
| `session_id` | `auth_sessions.id` | Immediate revocation via `app.session_is_active()` |

Deliberately **absent**: username, email, phone, workspace ids and **workspace roles**. A role in a token could not be revoked before expiry, so MANAGER authority always comes from `workspace_members` at query time. The `authenticated` role only lets the caller into Postgres; by itself it grants no workspace authority.

## 9. RLS, `auth.uid()` and direct Data API compatibility

- `auth.uid()` reads the JWT `sub` claim. **No `auth.users` row is required.**
  - Proven by RLS: the own profile is visible and equals `sub`.
  - Proven by RPC: `rpc_create_workspace.created_by = sub`.
  - Proven by denial: a forged-owner insert returns 42501.
  - All of this while `auth.admin.getUserById(sub)` returns no user (B05).
- All M1 policies and helpers are reused unchanged, except `app.session_is_active()`.
- supabase-js `accessToken` option (installed `@supabase/supabase-js` 2.117.1; documented in its type definitions): "When set, the `auth` namespace of the Supabase client cannot be used." The browser client therefore cannot call Supabase Auth.

## 10. Recovery

Unchanged from ADR-038:
- 10 codes of 160 bits (140 secret bits after the 20-bit hint), shown once, Crockford Base32.
- Argon2id verifiers, single use, regeneration invalidates the old set.

Changes for Option B:
- `rpc_recover_account` atomically:
  - consumes the code
  - sets the new password verifier
  - **revokes every session**
  - clears lockouts
- The recovering client receives one fresh session.
- The new password is validated **before** a code is examined, so a weak password never burns a code.
- Recovery is locked after 3 failed attempts (60 minutes).

## 11. Password change policy

| Flow | Current session | Other sessions |
|---|---|---|
| Logged-in change (`POST /api/auth/password`, CSRF, current password, 3 per hour per user) | **Kept** (no forced re-login) | **Revoked** immediately |
| Recovery-code reset | n/a; a new session is issued | **All revoked** |

This replaces Option A's accidental behavior, where the admin password update logged out every session (M1 T09).

## 12. Rate limiting

| Control | Store | Status |
|---|---|---|
| Per-account login lockout (5 failures → 15 min) | `user_accounts` counters (Postgres) | Proven (B21) |
| Per-account recovery lockout (3 → 60 min) | `user_accounts` | Proven (B21) |
| Per-IP login (20/15 min), register (3/h), recovery (10/h), per-user password change (3/h) | `public.auth_rate_limits` via `rpc_rate_limit_hit`: an atomic fixed window, shared across instances; keys are SHA-256 | Proven distributed-correct (B22) |
| Edge/WAF burst protection | Vercel firewall | **Required before production**, not built |

Because logins no longer reach Supabase Auth, the M1 shared-IP throttling problem disappears. `sign_in_sign_ups` returns to its default.

The DB-backed limiter adds one database round trip per auth request. Its production capacity and cleanup of expired buckets are open items.

## 13. Threat-model changes

| Change | Assessment |
|---|---|
| Signing-key compromise lets an attacker mint any role | New root-equivalent secret. Isolation, no logging, bundle and tracked-file scans, rotation procedure. KMS signing is a future option |
| Password verifiers move from `auth.users` to `public.user_credentials` | Same class of asset. The table has RLS with no policies and no grants; Data API access returns 42501 (SEC) |
| Brute-force protection is fully in Node | No longer depends on GoTrue per-IP keying; limits are durable and shared |
| Stateless access JWT, up to 15 min + Data API skew leeway | Data API revocation is immediate through the RLS session check. **Future Storage/Realtime policies must also call `app.session_is_active()`** |
| Data API `exp` leeway | Measured: an expired token was still accepted 2.5 s after `exp` and rejected by 32.5 s (PGRST303). Node applies zero leeway |
| Refresh-token theft | HttpOnly + SameSite=Strict + CSRF; replay revokes the session |
| Supabase Auth surface | No JobQuest identities; public sign-up disabled; email provider disabled. `/auth/v1/user` → 403 `user_not_found` |

## 14. New, changed and removed database objects

Migration `supabase/migrations/20260924200000_m1b_option_b_auth.sql`:
- **New tables (4):** `user_credentials`, `auth_sessions`, `auth_refresh_tokens`, `auth_rate_limits`.
  - All have RLS enabled, no policies, and privileges revoked from `anon` and `authenticated`.
- **Changed:**
  - `user_accounts.user_id`: FK to `auth.users` dropped; now `default gen_random_uuid()`.
  - `app.session_is_active()` now reads `auth_sessions`.
- **New RPCs (service role only):**
  - `rpc_register_account`
  - `rpc_create_session`
  - `rpc_rotate_refresh_token`
  - `rpc_session_for_refresh`
  - `rpc_revoke_sessions`
  - `rpc_session_is_live`
  - `rpc_change_password`
  - `rpc_recover_account`
  - `rpc_record_auth_failure`
  - `rpc_clear_login_failures`
  - `rpc_rate_limit_hit`
- **Removed (Option A only):** `custom_access_token_hook`, `rpc_bootstrap_account`.
- The 7 M1 foundation tables are reused. The full 25-table schema is **not** implemented.

## 15. Deprecated Option A concepts

These are no longer part of the architecture:
- Synthetic alias identity `id_<uuid>@auth.jobquest.internal`
- Dependency on `auth.users` and `auth.sessions`
- GoTrue password grant and refresh
- The custom access token hook
- The alias-leak response guard
- The `sign_in_sign_ups = 1000` workaround
- Admin `updateUserById` password changes
- The Gate 03 cookie names `sb-access-token` / `sb-refresh-token`

Access tokens stay in memory, as in M1; only the refresh token is a cookie.

## 16. M1B pass/fail criteria

**PASS** requires every B01–B26 test to pass with evidence. See `../m1b/M1B_TEST_PLAN.md`.

**FAIL** if any of these occurs:
- the Data API cannot safely accept external JWTs
- `auth.uid()` does not resolve reliably
- RLS ownership cannot be enforced
- direct browser Data API access is incompatible
- the browser needs the private key
- a token exposes credential data
- the service role is needed for routine CRUD
- refresh replay cannot be controlled
- session revocation cannot be implemented
- the solution relies on unsupported or undocumented Supabase behavior

No partial success is declared.

## 17. Official sources checked (2026-09-24)

- Supabase: JWT Signing Keys, <https://supabase.com/docs/guides/auth/signing-keys>. Covers:
  - import of private keys as standby
  - the state table (standby = not accepted)
  - rotation keeping both keys trusted
  - revocation
  - the 5-minute throttle
  - the JWKS endpoint
  - `gen signing-key`
  - minting headers and claims (`kid`, `sub`, `role`, `exp`)
  - the `Authorization` + `apikey` headers
- Supabase: JWTs, <https://supabase.com/docs/guides/auth/jwts>: "Your Supabase project accepts a JWT in the `Authorization: Bearer <jwt>` header."
- Supabase: Third-party auth overview, <https://supabase.com/docs/guides/auth/third-party/overview>.
  - It lists Clerk, Firebase Auth, Auth0, AWS Cognito and WorkOS.
  - No generic custom-issuer or JWKS URL is documented for the hosted platform, so that path is **not used** (hard-fail rule: no undocumented behavior).
- `@supabase/supabase-js` 2.117.1, `accessToken` option (in the package's type definitions): an async callback supplying the token; the `auth` namespace is disabled.
- Supabase CLI 2.117.0: `supabase gen signing-key --help` (ES256 recommended, RS256) and `config.toml` `[auth] signing_keys_path`.
- Not independently documented and therefore **measured instead**:
  - that `auth.uid()` needs no `auth.users` row (B05)
  - the `/auth/v1/user` response for a token whose `sub` has no user (B25)
  - the Data API's `exp` leeway (B14)
