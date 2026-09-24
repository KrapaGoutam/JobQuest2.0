# M1 — Auth Option A Result

## Decision

**OPTION A — FAIL**

Recommendation: **Stop Option A product implementation and evaluate Option B.** Option B is **not** implemented and must not be started without explicit user approval of the architecture pivot (Gate 03 / M1 rule).

## The failed invariant

Gate 03 hard-fail rule: *"If the synthetic identity reaches the browser: OPTION A FAILS."*

Option A gives every user a Supabase Auth identity whose email is a random internal alias (`id_<random uuid>@<internal alias domain>`), never derived from the user id, never returned by the Node façade. The browser receives a Supabase **access token** (in memory only) so that it can call PostgREST directly under RLS (Gate 03 requirement "Direct PostgREST access").

That same access token is accepted by Supabase Auth (GoTrue) at the public endpoint `GET <SUPABASE_URL>/auth/v1/user`, and GoTrue returns the full user record for it, **including the alias email**. The endpoint is reachable from the browser with only the publishable key, which is public by design. No project setting disables it, and the custom access token hook only controls JWT claims, not this endpoint's response.

So any user (or any script running in the page) can read their own synthetic identity. The invariant cannot be enforced while the browser holds a GoTrue-issued token.

## Evidence

| Surface | Result | Source |
|---|---|---|
| Node façade responses (103 responses across all integration tests: bodies, headers, Set-Cookie) | clean: 0 containing the alias; alias guard blocked 0 | `migration-upgrade/m1/evidence/integration-191a31.json` (T03) |
| Access token JWT claims (`email` blank, `user_metadata` empty, `app_metadata` = `{provider: jobquest}`) | clean | same (T03) |
| **GoTrue `GET /auth/v1/user` with the user's own access token** | **HTTP 200, body contains the alias: LEAK** | same (T03) |
| Real browser (Playwright, Chromium): localStorage, sessionStorage, `document.cookie`, all context cookies, React state, rendered HTML, console | clean | `migration-upgrade/m1/evidence/e2e-leak-local-7e830d.json` |
| **Real browser network: response of `/auth/v1/user`** | **contains the alias: LEAK** | same, `network_hits: ["response:/auth/v1/user"]`, `gotrueUserEndpointWithMyToken: true` |

Browser cookies set by the façade: `jq_rt` (HttpOnly, Secure, SameSite=Strict, Path `/api/auth`) and `jq_csrf`. Neither contains the alias.

Two earlier e2e runs (`e2e-leak-local-5beb0c.json`, `e2e-leak-local-995b06.json`) are **superseded**. They flagged `response:/src/App.tsx`, a false positive: the Vite dev server served the harness source file, which then contained the alias domain as a literal detection marker. In those runs the self-check had not run because of a harness crash. Both harness issues were fixed before the authoritative run `7e830d`.

## Why this is a hard fail rather than a bug to patch

Possible patches, all of which **violate** the M1 instruction "Do NOT hack around the failed invariant", or another Gate 03 requirement:

- Proxy all data access through Node so that the browser never holds a GoTrue token. This drops "Direct PostgREST access".
- Put a gateway or WAF rule in front of `/auth/v1/user`. The Supabase project URL is public, so the browser can call it directly and bypass the rule.
- Store a non-alias email in GoTrue. That brings back real-email identity, which Option A exists to avoid.

## Everything else Option A proved (still useful for Option B)

The 7-table schema, RLS with `auth.uid()`, workspace bootstrap, the last-manager trigger, recovery codes, canonical workflow, CSRF, and the per-account DB lockout all worked. Most of this does not depend on GoTrue as the identity provider. See `M1_TEST_RESULTS.md`.

## Option B evaluation path (not implemented)

The goal: the browser holds a token PostgREST accepts, and no GoTrue user record exists for it to fetch.

- **Node-minted JWTs.** Node verifies username and password itself (Argon2id in a new credential table, which needs a Gate 03 schema change). It signs short-lived JWTs with an asymmetric key imported into Supabase JWT signing keys, or through Supabase third-party auth. Claims: `sub = user_accounts.id`, `role = authenticated`.
- The browser uses supabase-js `accessToken` mode (already used in M1). `auth.uid()` and every RLS policy keep working unchanged.
- There is no GoTrue identity, so `/auth/v1/user` has nothing to return for the token.
- Items to evaluate: key rotation, session and refresh storage (a new table), revocation semantics (`app.session_is_active()` must move off `auth.sessions`), and rate limiting that now sits entirely in Node.

This is a proposal for review only. **Do not implement it without explicit user approval.**
