# Milestone 11 — Browser Extension Migration Acceptance Criteria

- [ ] `extension_tokens` table created with hashed token storage, prefix, expiration, and scopes.
- [ ] Users can generate scoped, expiring extension tokens in the web application UI (`/account/extension` or Settings).
- [ ] The raw token value is displayed exactly once upon generation with clear copy UX.
- [ ] Token listing displays name, prefix, status, expiration, and last used timestamp.
- [ ] Tokens can be revoked or rotated immediately; revoked tokens fail authentication instantaneously.
- [ ] Removing or suspending a member from a workspace immediately invalidates all their extension tokens for that workspace.
- [ ] Extension API v1 endpoints (`/me`, `/workflow`, `/documents`, `/duplicates/check`, `/captures`) are fully functional and enforce token scopes.
- [ ] Duplicate detection implements the 4-tier company-first classification (`EXACT_POSTING`, `SAME_ROLE`, `COMPANY_ONLY`, `NONE`) and returns `CHECK_ERROR` on failure without misrepresenting it as clean.
- [ ] Captures atomically create the application, immutable job posting snapshot (CR-011), and timeline event in a single transaction.
- [ ] Multi-tier job extraction engine passes all 16 legacy HTML fixture tests unchanged.
- [ ] Browser extension popup adapts to light/dark themes and implements the complete popup state matrix.
- [ ] Extension stores credentials strictly in `chrome.storage.local` (never `sync`).
- [ ] Secure deep-linking binds strictly to validated origin (`${origin}/w/${workspaceId}/applications/${id}`).
- [ ] Axe accessibility audit passes with 0 critical and 0 serious violations.
- [ ] Local tests, hosted integration tests against `jobquest-dev`, and Vercel Preview verification all pass.
- [ ] Main branch, Production Supabase, and JobQuest1.0 remain strictly untouched.
- [ ] Feature branch `feature/m11-browser-extension` is kept unmerged for user review.
