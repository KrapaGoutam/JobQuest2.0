# Security & Authorization

CURRENT STATE, consolidated from `docs/SECURITY.md`, `docs/EXTENSION_SECURITY.md`,
`docs/FEATURE_UPGRADE_10_FINAL.md`'s formal security audit, and direct source
inspection during this documentation pass. STATUS: CONFIRMED unless noted.

## Authentication

- Two independent auth mechanisms coexist by design:
  1. **Web session auth**: opaque random session token, stored server-side only as
     a SHA-256 hash (`sessions.token_hash`); 12-hour expiry; cookie
     (`jobquest_session`) is `HttpOnly`/`SameSite=Strict`, `Secure` added when
     `NODE_ENV=production`. Login is username + 4-digit numeric PIN (kept as a
     string so leading zeros survive), hashed with salted **scrypt**. 5 failed
     attempts → 5-minute lockout, generic error message (no user-enumeration
     signal). A legacy password-hash auth method still exists for accounts that
     haven't yet run the one-time `transition-pin` flow.
  2. **Extension bearer-token auth**: a completely separate mechanism (see
     `SECURITY_AUTHORIZATION.md` §Extension below) — deliberately not session-cookie
     reuse, since cross-origin extension contexts can't safely access `HttpOnly`
     cookies without requesting broad `cookies` permission.

## Session / token handling

- CSRF: a token bound to the session row (`sessions.csrf_token`), required via the
  `x-csrf-token` header on every mutating session-authenticated request
  (`requireAuth(context, {csrf: true})`). GET requests never require it.
- Extension bearer tokens: 32-byte cryptographically random, 64 hex characters,
  stored only as a SHA-256 hash (`extension_tokens.token_hash`), shown to the user
  exactly once at generation, revocable instantly (`revoked_at` checked on every
  request), `last_used_at` updated on success for auditability. Never stored in
  `chrome.storage.sync` (would leak across a user's synced devices) — always
  `chrome.storage.local`.

## Authorization

- Row-level ownership enforced at the query layer: every list/get/create/update/
  delete across every domain table filters by `user_id` (or resolves via a parent
  record's `user_id`). Cross-user access returns **404, never 403** (anti-
  enumeration — see BUSINESS_LOGIC_CATALOG.md BL-017).
- Mass-assignment protection: client-supplied `user_id`/`target_user_id`/
  `owner_id` fields are rejected/stripped server-side on every write, regardless
  of request body content (BL-016).
- Manager cross-user access is always **explicit** (`user_id`/`target_user_id`
  query/body parameter), never implicit/blanket. The last active `MANAGER` cannot
  be deactivated or demoted (hard server-side check, not just a UI affordance).
- Related-record ownership is independently re-checked, not inferred from a
  parent record's ownership alone (e.g. a Task's `application_id`, a Follow-up's
  `interview_id`/`networking_contact_id`).
- Extension endpoints: every duplicate-check and application-create call is
  scoped to `user_id` derived from the bearer token — IDOR is architecturally
  impossible (the token *is* the only source of the acting user's identity for
  that request), not just policy-prevented.

## Row-Level Security (target — Supabase)

No RLS exists today because the current database access layer *is* the
authorization layer (hand-written `WHERE user_id = ?` on every query, via raw
`pg`). See `docs/BACKEND_SCHEMA.md` §Supabase RLS for the full proposed policy set
per table. Key migration risk: **RLS alone cannot express "manager acts on an
explicitly-chosen other user's data"** — this needs a `SECURITY DEFINER` RPC
function or an equivalent server-side check layered on top of RLS, not RLS by
itself. Do not ship RLS-only authorization for manager features without this.

## Server-side validation

- Every application field has DB-level CHECK constraints (stage, priority, work
  arrangement, employment type) *and* application-layer re-validation
  (`validateApplication()`), so a direct-to-database write and an API write are
  equally constrained.
- `job_url` accepts only `http:`/`https:` (rejects `javascript:`/`data:`/
  `vbscript:`) — applies uniformly to manual entry, import, and extension capture
  (BL-008).
- CSV formula-injection: every export cell passes through `safeCell()`/
  `csvEscape()` (BL-007).
- Manual tailored-resume text: max 100 chars, character-set restricted
  (`/^[\p{L}\p{N} ._()\-]+$/u`), validated on both client and server.

## CORS

Not applicable in the traditional sense — the backend serves the frontend's static
files from the same origin (`frontend/dist`), so there is no cross-origin browser
API surface for the web app itself. The extension is the one legitimate
cross-origin client, and it authenticates via bearer token (not cookies), so no
CORS-cookie-credential configuration exists or is needed. STATUS: Needs
verification whether any `Access-Control-Allow-Origin` header is set at all for
the extension's API calls (a bearer-token API typically still needs a permissive
CORS response for the extension's background/popup context to read the response)
— confirm in `backend/src/server.js`'s response-header logic before assuming this
carries over unchanged to a split frontend/backend deployment (Vercel + a separate
API host, rather than today's single Render service, changes this materially).

## CSRF

Session-authenticated mutations require `x-csrf-token`; bearer-token
(extension) requests never use CSRF (a bearer token in an `Authorization` header
is not automatically sent by the browser the way a cookie is, so it isn't
CSRF-exploitable the same way).

## XSS prevention

Every user-text field renders through a shared escaping helper before insertion
into the DOM (confirmed for Notes with explicit `<script>`/`<img onerror>`-shaped
test content at both the API and E2E layers). CSP is set server-side:
`default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:;
connect-src 'self'; frame-ancestors 'none'` — no `unsafe-inline`, no external
hosts, unchanged since the very first round.

## SQL injection protections

100% parameterized queries (`pg`'s `$1`/`?`-style placeholders) — no string
interpolation of user-controlled values into SQL anywhere in `backend/src/*.js`
(directly audited, per-`${...}`-fragment, in the Round 10 formal security audit).
The only string-interpolated SQL fragments are column/table/sort-direction names
drawn from hardcoded, regex-anchored whitelists — never raw user input.

## Input validation

Field-level validation happens in `validateApplication()` and the equivalent
per-domain validators (`tasks.js`, `habits.js`, `notes.js`). Import validation is
strict-allowlist (unknown fields are hard errors, not silently dropped — BL-006).

## CSV injection protection

See BL-007 — `safeCell()`/`csvEscape()`, applied to every export path including
every tracker type added across all 10 product rounds.

## Secret handling

- No secret values are ever committed — enforced by a CI gate
  (`.github/workflows/ci.yml` `security` job) that rejects committed
  `.sqlite`/`.sqlite3`/`.env`/`.env.*` files (except `.env.example`) and greps for
  raw `MANAGER_PASSWORD=`/`SESSION_SECRET=`-style assignments.
- `docs/NEON_MIGRATION.md` explicitly documents: connection URLs belong only in
  Render secret environment variables or a secure local shell; commands sanitize
  URL-shaped text in error output; never paste URLs into issues, logs, reports,
  fixtures, `.env.example`, or Git.

## Logging

500-level errors log the server-side error object only (never sent to the
client — the client always receives a generic message); no request body,
password, or PIN is ever logged, confirmed by direct audit of every `console.*`
call site in `backend/src/*.js` during the Round 10 security pass.

## Rate limiting

STATUS: Needs verification. No dedicated rate-limiting middleware/library was
found in `backend/package.json` dependencies or `backend/src/*.js` beyond the
5-attempt login lockout (which is account-specific, not IP-based or general
request-rate limiting). A migration to a platform like Vercel/Supabase should
evaluate whether platform-level rate limiting (e.g. Supabase's own auth rate
limits, a Vercel Edge Middleware rate limiter) is needed to replace/supplement
this, since the current app has no general-purpose API rate limiter at all.

## Security headers

CSP (above) plus `X-Content-Type-Options: nosniff` on static file responses
(confirmed in `server.js`'s static-file-serving logic). STATUS: Needs
verification whether `X-Frame-Options`/`Strict-Transport-Security`/
`Referrer-Policy` are set anywhere — not confirmed present during this pass;
`frame-ancestors 'none'` in the CSP already prevents framing, but the other
headers were not directly located in the source read for this document.

## Dependency security

`npm audit --audit-level=high` runs in CI for both `backend` and `frontend`,
clean as of the last confirmed run. One tracked, accepted MODERATE advisory
(`uuid`, transitive via `exceljs`) — below the HIGH gate, not release-blocking,
documented rather than silently ignored.

## Extension-specific security (from `docs/EXTENSION_SECURITY.md`)

- Manifest V3 permissions are minimal: `activeTab`, `scripting`, `storage` (plus
  `tabs`, confirmed in the actual `manifest.json` read during this audit — one
  permission beyond what `docs/EXTENSION_SECURITY.md`'s narrative lists; STATUS:
  worth reconciling that doc against the actual manifest during the next
  extension-touching round). `host_permissions: ["<all_urls>"]` is required for
  the content script to extract from any job board, but the content script only
  *reads* page content — never modifies, injects, or executes anything on the
  page.
- No broad background network listeners, `webRequest` interceptors, or
  persistent host permissions beyond what content extraction needs.
- Captured page content is treated as untrusted input throughout — extracted via
  `textContent`/`innerText`, never raw HTML, never executed.

## Target migration — Authentication/Authorization/RLS/Server-side split

| Concern | Current | Target |
|---|---|---|
| Authentication | Custom session (PIN+scrypt) + custom bearer tokens | Supabase Auth (email/OAuth/magic-link primary) — **PIN-as-primary-credential has no native Supabase equivalent; requires an explicit product decision, see `OPEN_QUESTIONS.md`** |
| Authorization | Hand-written `WHERE user_id=?` at the query layer | Supabase RLS policies (`docs/BACKEND_SCHEMA.md`), keeping the same owner/actor split |
| Manager cross-user access | Explicit `user_id`/`target_user_id` param, checked in application code | `SECURITY DEFINER` RPC function(s), since RLS alone can't express this cleanly |
| Extension auth | Custom bearer tokens (SHA-256 hashed) | No first-class Supabase equivalent — needs a genuine design decision (custom table + RLS, same as today, is the most direct port; a Supabase-native alternative would need research) |
| CSRF | Session-bound token, header-checked | Likely unnecessary under a pure Bearer-JWT (Supabase Auth) model for the web app too — re-evaluate rather than blindly port |
| Server-side validation | Hand-written per-domain validators | Re-implement equivalently (RLS is not a substitute for input validation) — either app-layer (Node/TypeScript API) or Postgres CHECK constraints + triggers for the parts that are pure data-shape rules |
