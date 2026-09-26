# Milestone 11 — Browser Extension Migration Test Plan

## 1. Static Analysis & Unit Tests

- **TypeScript & Lint:**
  - Strict type checking for new extension contracts, token services, and `/api/ext/v1` routes.
  - Zero ESLint warnings across backend, web, and extension code.
- **Token Cryptography & Hashing:**
  - Token generator produces `jqx_<env>_<random>` format with sufficient CSPRNG entropy.
  - Constant-time hash verification; pepper rotation invalidation tests.
- **Duplicate Logic Unit Tests (BL-003):**
  - Company-first classification: `EXACT_POSTING`, `SAME_ROLE`, `COMPANY_ONLY`, `NONE`.
  - URL normalization (stripping UTM params, sorting query parameters, lowercase protocol/host, trailing slash stripping).
  - Text normalization (whitespace collapse, unicode hyphen/quote normalization, case insensitivity, retaining seniority variants like "Senior" vs "Junior").
- **Extraction Engine Unit Tests:**
  - 16/16 legacy HTML fixtures pass unchanged in linkedom / DOM testing.
  - JSON-LD parsing, ATS adapters (Greenhouse, Lever, Indeed), DOM heading extraction, meta tag fallback, and brand-name collision guard.
- **Deep-Link Security Unit Tests (BL-015):**
  - Strict origin validation in `buildSecureJobQuestUrl`.
  - Neutralization of `javascript:`, `data:`, `//host`, and non-matching origins.

---

## 2. Integration & Database Tests

- **Token Lifecycle:**
  - Token creation, listing, rotation, and revocation.
  - Raw token returned only once upon creation.
  - Scoped permissions enforcement: token without `applications:create` is rejected on `/captures`.
  - Expiry enforcement: expired token returns 401 Unauthorized.
  - Revoked token returns 401 Unauthorized immediately.
  - Member removal cascade: token automatically rejected if member leaves workspace.
- **Extension API v1 Endpoints:**
  - `GET /api/ext/v1/me`: Returns user info, workspace, scopes, expiration.
  - `GET /api/ext/v1/workflow`: Returns active canonical stages and default capture action.
  - `GET /api/ext/v1/documents?kind=resume`: Returns user's active resumes.
  - `POST /api/ext/v1/duplicates/check`: Returns proper classification and matched application summaries (bounded to 3).
  - `POST /api/ext/v1/captures`: Atomically creates application, immutable snapshot, and `captured` timeline event. Cross-workspace injection blocked.
- **Rate Limiting:**
  - 120 req/min per token limit returns 429 Too Many Requests when exceeded.
- **RLS & Multi-Tenant Isolation:**
  - Token belonging to User A in Workspace 1 cannot view or create applications in Workspace 2.

---

## 3. Browser E2E & Accessibility Tests

- **Web Token Management:**
  - Generate token modal flow, copy-to-clipboard button, active token table.
  - Revoke token dialog and instantaneous status update.
  - axe audit on Token Management view: 0 critical, 0 serious violations.
  - Responsive layouts: 375px mobile, tablet, desktop.
- **Extension UI & Options:**
  - Options page saves instance URL and token in `chrome.storage.local`.
  - Connection test validates configuration.
  - Popup renders 14-state matrix (unconfigured, loading, ready, duplicate warning, duplicate info, saving, success, error, etc.).
- **Vercel Preview Validation:**
  - Real browser extension or simulated Playwright fixture executing full capture flow against live Vercel Preview.
  - Privacy audit (`e2e/leak.spec.ts`) verifying no tokens leaked in DOM or logs.
