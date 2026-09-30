# M15-E Extension — Connection Flow Audit (Phase B)

Branch: `fix/m15e-extension-connection-ui`, based on `fix/m15e-site-functional-remediation` @ `0a534b45`.

## Scope

Read-only audit of `apps/extension/options.js`, `apps/extension/api/jobquest.js`,
`apps/extension/popup.js`, and the extension-token API (`apps/api/src/routes/extension.ts`,
`apps/api/src/lib/extensionTokens.ts`), verified directly against current code — not
assumed from prior reports.

## Confirmed defects (all fixed on this branch)

1. **Full raw token displayed on every Settings reopen.**
   `options.js` `load()` set `tokenInput.value = settings.apiToken` unconditionally —
   the actual stored secret was written into the visible (though `type="password"`)
   input field every time the options page opened. `type="password"` only masks
   keystrokes visually; the raw value remained fully readable via `.value` (dev
   tools, "show password", or any trusted-context script). This directly violated
   "a stored token must never be displayed again after issuance."
   **Fix:** the field is now always left blank on load; a masked placeholder
   (`jqx_live_••••1234`) derived from the stored token is shown instead, via the
   new `maskToken()` export. The full secret is never re-rendered anywhere.

2. **Save/Test message conflation.** The submit handler called `saveSettings()`
   (which persists to `chrome.storage.local`) and then immediately called
   `testConnection()`, surfacing only the test's outcome. A successful save
   followed by a failed live test (revoked token, transient network issue) showed
   only an error, so the operator reasonably concluded nothing had been saved —
   even though it had. This is the exact defect identified in the original M15-E
   site audit and confirmed still present in this codebase.
   **Fix:** the handler now reports "Saved." immediately after a successful save,
   then separately reports the test outcome ("Saved. Connected…" or "Saved, but
   the connection test failed: …"). The distinction is structurally guaranteed:
   `saveSettings()`'s own validation error (`INVALID_INPUT`) is the only error
   that can occur before any persistence happens; every other error can only
   occur after `saveSettings()` already resolved.

3. **Inconsistent whitespace handling.** `saveSettings()` trims a pasted token
   before validating/storing it, but the standalone "Test Connection" button read
   the raw, untrimmed input value — the same pasted token (with incidental
   leading/trailing whitespace, e.g. from a copy-paste) could pass Save but fail
   the standalone Test, or vice versa.
   **Fix:** both paths now go through the same `effectiveToken()` helper, which
   trims via the new `normalizeToken()` export.

## Error-state mapping added

A new `mapConnectionError()` export in `api/jobquest.js` classifies every failure
into one of: `INVALID_INPUT`, `EXPIRED_OR_REVOKED` (401), `PERMISSION_ERROR` (403),
`SERVER_UNAVAILABLE` (503, or a raw network `TypeError`), or a generic `ERROR`
fallback. This directly serves the required connection states in the redesigned
UI (Phase D): NOT CONFIGURED, SAVED/UNVERIFIED, TESTING, CONNECTED, INVALID TOKEN,
EXPIRED/REVOKED TOKEN, SERVER UNAVAILABLE, PERMISSION/WORKSPACE ERROR.

## ENVIRONMENT MISMATCH — not implemented, and why

The task asks for an "environment mismatch" state "where detectable." It is **not
reliably detectable** with the current backend configuration: production Vercel
does not set `EXTENSION_TOKEN_ENV`, so `EXTENSION_TOKEN_ENV` defaults to `dev`
everywhere, and **production tokens are minted with the `jqx_dev_` prefix** (see
`apps/api/src/env.ts` and the earlier M15-E audit). A client-side heuristic based
on the token's `dev`/`live` prefix would therefore be wrong for production tokens
and would actively mislead operators. No such heuristic was added. If
`EXTENSION_TOKEN_ENV=live` is set for production in a future, separately
authorized change, a real prefix-mismatch check becomes meaningful and should be
added then — not fabricated now against unreliable signal.

## Confirmed NOT broken (verified directly, not assumed)

- **Workflow stage source:** zero hardcoded stage values anywhere in
  `apps/extension/**`. Stages are always loaded live from `GET /ext/v1/workflow`.
  No "Bookmarked" or other unsupported stage exists in the extension.
- **Token normalization on Save:** `saveSettings()` already trimmed the token
  before validating/storing it (only the standalone Test button's separate path
  was inconsistent — see defect 3 above).
- **Auth separation:** the extension bearer token (`jqx_dev_`/`jqx_live_`,
  HMAC-SHA256 hashed at rest) is entirely independent of the web session's
  refresh cookie; nothing in `apps/extension/**` reads or stores web-session
  credentials.
- **Duplicate detection, capture, and API endpoint contracts:** unchanged by
  this phase; audited but not modified (see `EXTENSION_DESIGN_IMPLEMENTATION_MAP.md`
  and Phase A findings for detail).

## Files changed this phase

- `apps/extension/api/jobquest.js` — added `normalizeToken`, `maskToken`,
  `mapConnectionError` (pure functions, no new dependencies).
- `apps/extension/options.js` — rewritten `load()`/submit/test handlers per the
  three fixes above.
- `apps/extension/tests/api.test.js` — unit coverage for the three new exports.
