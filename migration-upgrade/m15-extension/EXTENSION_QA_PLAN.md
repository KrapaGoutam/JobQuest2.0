# M15-E Extension — QA Plan

## Test layers, in order (targeted first, broad last)

1. **Connection unit tests** (`apps/extension/tests/api.test.js`) — token
   normalization, masking, error-state mapping. Fast, no browser needed.
2. **Extension unit/manifest/extractor tests** (existing: `manifest.test.js`,
   `extractor.test.js`) — rerun unchanged to confirm no regression.
3. **Web+API unit/integration** — rerun the full existing suite once any shared
   backend code changes (Dashboard/Analytics endpoints, if added in Phase E),
   since extension API routes live in `apps/api/**`.
4. **Extension E2E** (`e2e/m11-extension.spec.ts`, real unpacked MV3 extension,
   real Chromium) — the only layer that can honestly prove:
   - the stored token is never re-displayed after Settings reopens
   - Save and Test report distinct, correct outcomes
   - a persistent Side Panel actually stays open across page/tab focus changes
     (once Phase D lands) — this cannot be proven by a DOM-only test; it requires
     `chrome.sidePanel` behavior in a real browser
   - active-tab changes correctly refresh or clear capture context
5. **Full JobQuest regression** (lint, typecheck, unit, integration, full web
   E2E, extension E2E, build) before pushing the final SHA.

## No-fake-QA rules for this task

- Side Panel persistence claims require actually exercising
  `chrome.sidePanel` in a real browser session, not just asserting on rendered
  DOM.
- Connection PASS claims require a real HTTP round trip against a
  preview/development backend (or a realistic mocked `fetch` for the pure unit
  layer only) — never a claim of "PASS" derived solely from a mocked fetch for
  the properties that matter (token masking, persistence across reload, real
  401/403/503 handling).
- Workspace isolation claims for any new Dashboard/Analytics extension endpoint
  require a real cross-workspace integration test, not a unit test with a
  stubbed authorization check.

## Preview/development backend verification

Before any authenticated extension QA, confirm by Vercel environment variable
NAME and SCOPE only (never printing values) that the target backend is
preview/development, not production — following the same method already used
for the site Preview: `SUPABASE_URL`/`SUPABASE_SECRET_KEY`/`VITE_SUPABASE_URL`/
`VITE_SUPABASE_PUBLISHABLE_KEY` must resolve through their `preview`/`development`
-scoped entries, not the `production`-scoped ones.

## Bundle secret scan

After packaging, run the existing `pnpm check:extension` script (wraps
`scripts/check-bundle.mjs --extension`) against the actual built
`apps/extension/dist/jobquest-capture-<mode>/` output — scanning built artifacts,
not just source — to confirm zero `SUPABASE_SECRET_KEY`, service-role
credentials, private JWKs, database passwords, or other secrets are bundled.
