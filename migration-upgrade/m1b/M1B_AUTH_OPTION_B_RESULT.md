# AUTH OPTION B RESULT

Status:

**NOT YET DECIDED: PASS on the local Supabase stack (developer machine + CI); hosted `jobquest-dev` verification PENDING the signing-key checkpoint.**

A final **PASS** or **FAIL** is withheld on purpose.

- Every B01–B26 criterion and the SEC boundary passed with evidence on a real Supabase stack (same CLI release; GoTrue, PostgREST and Postgres 17 containers). No hard-fail condition was observed.
- The hosted project has not been exercised. Trusting Node-minted tokens there requires importing a signing key and **rotating** to it. The official docs state a standby key is not accepted, so rotation is required. Rotation is a key-state transition that the M1B instructions (§30) reserve for explicit user approval. The currently authenticated Supabase account also cannot access `jobquest-dev`.
- Declaring PASS without the hosted run would claim more than the evidence shows.

## Architecture tested

Node-controlled username/password with app-owned sessions, plus externally minted short-lived JWTs, plus the Supabase Data API with native RLS. No Supabase Auth identities; no synthetic email.

See `../gate-03/GATE_03_AUTH_OPTION_B_AMENDMENT.md`.

## JWT signing mechanism

- ES256 JWTs minted by the Node API with `jose`.
- Header `kid` = the imported key id.
- Claims: `sub`, `role=authenticated`, `aud=authenticated`, `iss=jobquest-api`, `iat`, `exp` (+900 s), `jti`, `session_id`.
- The private key is server only (`JQ_JWT_PRIVATE_JWK`).
- Supabase trusts the public half:
  - **Local:** `[auth] signing_keys_path` (proven).
  - **Hosted:** documented import plus rotate (pending).

## Credential model

- `public.user_credentials` holds Argon2id PHC verifiers (m=19456, t=2, p=1; centrally configured; rehash on login).
- It is separate from `user_accounts`.
- Unknown usernames pay the same Argon2 cost.

## Session model

- `public.auth_sessions`: 30-day absolute lifetime, revocable, SHA-256 IP only.
- `public.auth_refresh_tokens`: 256-bit opaque token in an HttpOnly cookie, SHA-256 verifier, single-use rotation, parent links.
- `app.session_is_active()` gates every RLS helper, so revocation is immediate for the Data API.

## Custom token evidence

B04:
- The valid token returns 200 with rows.
- A token signed with another key, a tampered `sub`, and `alg:none` all return 401 (PGRST301).
- Local probe: the Node-minted token was accepted; a forged-key token got 401 "No suitable key was found to decode the JWT".

## `/auth/v1/user` evidence

B25:
- **403 `{"code","error_code":"user_not_found","msg"}`**, with no email or username.
- 0 `auth.users` rows for the test accounts.
- GoTrue signup 422 and password grant 422.
- The Chromium probe also returned 403.

This is structural: no Supabase Auth identity exists to reveal, so the result does not depend on hiding anything.

## `auth.uid()` evidence

B05:
- `auth.uid()` = JWT `sub` = `user_accounts.user_id`, shown through the own-profile RLS row and `rpc_create_workspace.created_by`.
- A forged-owner insert returned 42501.
- `auth.admin.getUserById(sub)` returns no user.

## RLS evidence

B06–B10:
- USER sees own rows.
- A peer is denied (0 rows / 0 rows / 42501 / 42501).
- A cross-workspace outsider is denied.
- MANAGER sees and edits the whole workspace.
- MANAGER is denied in foreign workspaces.
- The last-manager trigger holds.

SEC: all 6 auth system tables and 4 privileged RPCs return 42501 to user tokens.

## Direct Data API evidence

- B11/B12: supabase-js `accessToken` client.
- Chromium: `GET /rest/v1/applications|workspace_members|workflow_definitions`, `POST` + `PATCH /rest/v1/applications`, with no Node proxy.
- The service role is used only by the auth routes and the rate limiter; a static test enforces this.

## Refresh / replay evidence

- B15: rotation; the old verifier is consumed; the child links to its parent; CSRF and origin checks are enforced.
- B16: immediate replay → 401 `REFRESH_REUSED`; the session is revoked; the legitimate holder is also logged out (as designed); 5 concurrent refreshes produced exactly 1 winner. **No grace window**; the SPA serializes refresh with Web Locks.

## Password-change evidence

B18: the current session is kept (rows + refresh 200); 3 other sessions were revoked; old password 401, new password 200. The M1 T09 defect is not inherited.

## Recovery evidence

- B19: a weak new password is rejected before any code is consumed; the code is single use; 9 codes remain; regeneration invalidates the old set.
- B20: all 3 prior sessions were revoked; the recovering client got a fresh session.

## Rate-limit evidence

- B21: `[401×5, 429]`; locked even with the correct password; recovery `[401×3, 429]`. Stored durably in Postgres.
- B22: the 21st request from one IP gets 429; another IP is unaffected; the counter is shared across independent clients (`auth_rate_limits`, SHA-256 keys).
- Proven now: the distributed-correct DB limiter.
- Still required before production: edge/WAF limits, bucket cleanup, and a capacity test.

## Secret-scan evidence

- B23: the built bundle was scanned with 4 real secret values as known secrets (local secret key, local signing-key `d`, hosted-dev secret key, hosted-dev DB password): 0 findings.
- B24: `check:bundle` and `check:secrets` (all tracked files) report 0 findings. The scanner tests prove true fixtures (secret key, service_role JWT, PEM, private JWK, DB URL with password, PAT, GitHub, refresh and extension tokens, known values) FAIL and known harmless literals PASS. CI runs both scans.

## Known limitations

1. **Hosted verification not done.** The checkpoint needs approval plus CLI re-authentication to the JobQuest account.
2. The Data API accepted an expired token for a short leeway (between 2.5 s and 32.5 s after `exp`). Node uses zero leeway.
3. A revoked session's unexpired JWT still verifies. Isolation relies on RLS calling `app.session_is_active()`, which future Storage and Realtime policies must also do.
4. The signing key can mint any role and is root-equivalent. Production custody is open (OQ-029).
5. No grace window: a client that bypasses the Web Lock and races two refreshes is logged out (secure by design).
6. Test-only knobs: `REGISTER_IP_MAX_PER_HOUR=500` and `AUTH_FAILURE_FLOOR_MS=0` in the integration harness.

## Final recommendation

Option B is **architecturally proven on Supabase's own stack** and no hard-fail condition appeared.

**Recommend approving the `jobquest-dev` signing-key checkpoint** (`M1B_INFRASTRUCTURE.md` §3), then re-running the unchanged suite against the hosted project to convert this result to a final PASS or FAIL. Do not start M2 before that.
