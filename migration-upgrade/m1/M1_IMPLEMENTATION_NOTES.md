# M1 — Implementation Notes

## Layout

| Path | Purpose |
|---|---|
| `apps/api/` (`@jobquest/api`) | Hono façade. `src/app.ts` (routes, middleware), `src/routes/auth.ts`, `src/routes/workflow.ts`, `src/lib/*` (credentials, recovery, rateLimit, security, supabase), `src/env.ts`, `src/server.ts` (local :8787), `src/vercel.ts` |
| `api/index.ts` | Vercel Function entry; delegates to `apps/api/src/vercel.ts` (same-origin `/api`) |
| `apps/web/` (`@jobquest/web`) | Vite 8 + React 19 **test harness** (not product UI) |
| `supabase/migrations/20260924120000_m1_foundation.sql` | 7 tables, RLS, helpers, triggers, RPCs, access token hook, workflow seed |
| `supabase/config.toml` | Auth config (signups off, hook, jwt expiry 3600 s, refresh reuse 10 s) |
| `tests/unit/` | 15 unit tests (credentials, recovery codes, security helpers) |
| `tests/integration/` | T01–T12 plus SEC-01/02 against a real Supabase project; sanitized evidence writer |
| `e2e/leak.spec.ts` | Playwright browser leak test (T03) |
| `scripts/check-bundle.mjs` | Scans the built web bundle for secrets and the alias |
| `.github/workflows/m1-ci.yml` | CI: static job plus local-Supabase integration job |

Tooling: pnpm 10.18 through corepack; TypeScript ~5.9.3 (typescript-eslint does not support TS 7); Vitest projects `unit` and `integration`.

## Auth Option A (as implemented)

- **Register:** validate the username (`^[a-zA-Z0-9_.-]{3,32}$`) and the password (at least 10 chars, at most 72 bytes, zxcvbn ≥ 2, must not contain the username). Create the GoTrue user through the admin API with a random alias `id_<randomUUID>@<alias domain>` (not derived from the user id). Then call `rpc_bootstrap_account` (service role), which creates `user_accounts`, `profiles`, the PERSONAL workspace plus MANAGER membership and 10 recovery-code hashes atomically. On failure, the GoTrue user is deleted.
- **Login:** look up the alias by username through the service role and `admin.getUserById`, then do the GoTrue password grant. Errors are a generic 401. There is a per-IP limit, a per-account DB lockout (5 failures → 15 min; the 6th attempt gets 429) and a response-time floor.
- **Session:** the access token is returned in the JSON body and kept **in memory** by the web app (supabase-js `accessToken` mode, for direct PostgREST). The refresh token goes in the HttpOnly cookie `jq_rt` (Path `/api/auth`, SameSite=Strict, Secure).
- **CSRF:** a double-submit `jq_csrf` cookie plus the `x-jq-csrf` header on refresh, logout, password and recovery-codes. An Origin/Referer allow-list. JSON content-type is required. No CORS headers are sent.
- **Revocation:** `app.session_is_active()` checks the JWT `session_id` against `auth.sessions`, so a logged-out token reads nothing through RLS.
- **Access token hook:** blanks `email` and `phone`, empties `user_metadata`, and sets `app_metadata = {provider: 'jobquest'}`.
- **Alias guard middleware:** every façade response is scanned, and any that contains the alias domain is replaced with a 500 (the counter stayed at 0 in all runs).
- **Recovery codes:** 10 codes per set; each is 32 Crockford Base32 characters (a 4-char lookup hint plus 140 secret bits), displayed as 8 groups of 4. They are hashed with Argon2id (m=19456, t=2, p=1). Codes are consumed atomically and are single use. Regeneration replaces the whole set. There is a per-account lock after 3 failures (60 min).

## Database notes

- All IDs use `gen_random_uuid()`.
- System tables (`user_accounts`, `auth_recovery_codes`) have no anon/authenticated grants.
- `profiles` is owner-only.
- `applications`: select, insert and update (no delete). A tenant-guard trigger prevents moving rows between workspaces.
- `workspace_members`: manager-managed. `trg_protect_last_manager` blocks removing or demoting the last MANAGER, unless the whole workspace is being deleted.
- The seeded default workflow has 8 stages (SAVED…OFFER) and 5 outcomes with legacy labels, plus 5 WITHDRAWN closure reasons.

## Known harness and façade defects (left unfixed: stop rule)

- `POST /api/auth/password` uses `admin.updateUserById`, which revokes **all** sessions, including the caller's (T09). The fix would be to sign in again after the update and return a new session.
- The harness memberships list renders empty. Cosmetic only.
