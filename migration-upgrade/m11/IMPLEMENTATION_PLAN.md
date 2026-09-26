# Milestone 11 — Browser Extension Migration Implementation Plan

## 1. Database Architecture & Schema Migration

### Table: `public.extension_tokens`
- Columns:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE`
  - `user_id UUID NOT NULL REFERENCES public.user_accounts(user_id) ON DELETE CASCADE`
  - `name TEXT NOT NULL`
  - `token_prefix TEXT NOT NULL` (e.g. `jqx_dev_...` first 8-12 characters for identifiable display and secret scanner detection)
  - `token_hash TEXT NOT NULL` (HMAC-SHA256 with `EXTENSION_TOKEN_PEPPER` or SHA-256 hash)
  - `scopes TEXT[] NOT NULL DEFAULT ARRAY['workflow:read','documents:read','applications:duplicate_check','applications:create','profile:read']`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days')`
  - `last_used_at TIMESTAMPTZ`
  - `revoked_at TIMESTAMPTZ`
  - `revoked_by UUID REFERENCES public.user_accounts(user_id) ON DELETE SET NULL`
  - `revoked_reason TEXT`
  - `replaced_by_token_id UUID REFERENCES public.extension_tokens(id) ON DELETE SET NULL`
- Constraints:
  - Valid scopes CHECK constraint
  - Expiration bounds CHECK constraint (`expires_at <= created_at + interval '365 days'`)
  - Unique token hash constraint
- Indexes:
  - `(user_id, workspace_id)`
  - `(token_hash)` WHERE `revoked_at IS NULL`
- RLS Policies:
  - SELECT: User can view only own tokens within active workspace membership.
  - INSERT/UPDATE/DELETE: Restricted to service-role RPCs or Node facade with strict ownership checks.
- Safeguards:
  - Automatic invalidation if member is removed from workspace (`app.is_member(workspace_id)` checked dynamically on every API invocation).

---

## 2. API Facade & Extension Routes (`apps/api`)

### Web Management Endpoints
- `GET /api/extension/tokens`: List active tokens for caller's current workspace.
- `POST /api/extension/tokens`: Mint new token (`name`, `workspace_id`, `expires_in_days`). Returns raw token once (`jqx_...`).
- `POST /api/extension/tokens/:id/revoke`: Revoke token immediately with audit trail.
- `POST /api/extension/tokens/:id/rotate`: Atomically mint replacement and revoke previous token.

### Extension v1 Endpoints (`/api/ext/v1`)
- Token Authentication Middleware:
  - Parses `Authorization: Bearer jqx_...`.
  - Computes hash, verifies token exists, is unexpired, unrevoked, and user is active member of workspace.
  - Rate limits to 120 req/min per token.
- `GET /api/ext/v1/me`:
  - Required scope: `profile:read`.
  - Returns user display name, active workspace ID & name, token scopes, and expiration timestamp.
- `GET /api/ext/v1/workflow`:
  - Required scope: `workflow:read`.
  - Returns canonical stages, statuses, default capture action, and `workflow_version`.
- `GET /api/ext/v1/documents?kind=resume`:
  - Required scope: `documents:read`.
  - Returns active user resumes available for application attachment.
- `POST /api/ext/v1/duplicates/check`:
  - Required scope: `applications:duplicate_check`.
  - Body: `job_url`, `external_job_id`, `company`, `job_title`, `location`.
  - Executes BL-003 company-first classification: `EXACT_POSTING`, `SAME_ROLE`, `COMPANY_ONLY`, `NONE`.
  - Returns matched application summary (up to 3 recent items) and secure deep link URLs.
- `POST /api/ext/v1/captures`:
  - Required scope: `applications:create`.
  - Atomic transaction: creates application, immutable job posting snapshot (CR-011), initial `captured` event, and associates resume/tags if provided.
  - Returns created application ID and deep link path.

---

## 3. Web UI: Extension Token Management (`apps/web`)

- Integration into Settings / Account (`/account/extension` or Settings › Extension tab).
- Token Creation Modal:
  - Form: Token Name / Label, Expiry (30, 60, 90, 180, 365 days).
  - Single-use display banner: Raw token formatted with copy button, clear warning that token cannot be retrieved again.
- Token List:
  - Displays Name, Prefix (`jqx_...`), Created date, Expiration date, Status (Active, Expired, Revoked), Last used time.
  - Actions: Revoke, Rotate/Regenerate.
- Responsive design & accessibility: full keyboard navigation, WCAG AA contrast, screen reader labels.

---

## 4. Browser Extension Migration (`extension/`)

- Manifest V3:
  - Strict host permissions (`<all_urls>` for job posting extraction).
  - Unused permissions removed (e.g. verify `tabs` requirement).
  - Background service worker lifecycle.
- Options UI:
  - Inputs for JobQuest instance URL and Bearer token.
  - Stored strictly in `chrome.storage.local` (never `sync`).
  - Connection test against `GET /api/ext/v1/me`.
- Popup UI:
  - 14-state popup matrix implementation.
  - Shared design tokens (dark/light mode adaptation via `prefers-color-scheme`).
  - Pre-filled editable job form.
  - Live stage synchronization (`Applied`, `Saved`, etc.).
  - Duplicate detection banner with `[Open Existing]`, `[Save Anyway]`, `[Cancel]`.
  - Resume attachment picker.
- Extraction Engine:
  - 5-tier source-quality cascade: (1) JSON-LD `JobPosting`, (2) ATS adapters (Greenhouse, Lever, Indeed), (3) Semantic DOM headings, (4) Meta tags with generic title filter, (5) Generic fallbacks.
  - Full compatibility with existing 16 HTML fixture tests.
- Secure Deep-Linking:
  - `buildSecureJobQuestUrl` ensuring strict origin binding (`${origin}/w/${workspaceId}/applications/${id}`).

---

## 5. Execution Steps

1. **Step 1:** Create migration for `extension_tokens` table, RLS, and RPC helpers.
2. **Step 2:** Implement Node backend extension token service, middleware, and `/api/ext/v1/*` routes.
3. **Step 3:** Implement Web UI for token management in Settings.
4. **Step 4:** Migrate extension client codebase, adapt to `/api/ext/v1`, verify extraction engine against test fixtures.
5. **Step 5:** Write comprehensive unit and integration tests (token auth, RLS, duplicate check, capture RPC, deep-linking).
6. **Step 6:** Run local test suite, apply migration on `jobquest-dev`, deploy Vercel Preview, and verify E2E extension flow with Playwright.
7. **Step 7:** Document all verification evidence in `migration-upgrade/m11/`.
