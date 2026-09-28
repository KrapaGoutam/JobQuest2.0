# Milestone 11 — Browser Extension Migration

## Status

PLANNED & IN INITIALIZATION — feature branch `feature/m11-browser-extension` created and pushed from green `development` (commit `60ec9dff`).

## Milestone Objective

Deliver complete browser extension support for JobQuest 2.0:
1. Web application extension token management (`/account/extension` or settings tab) to generate, list, rotate, and revoke scoped, workspace-bound API tokens.
2. Extension API v1 (`/api/ext/v1`) in Node facade providing `/me`, `/workflow`, `/documents?kind=resume`, `/duplicates/check`, and `/captures` endpoints.
3. Durable database storage for `extension_tokens` with HMAC-SHA256 / SHA-256 hashed secrets, scoped permissions (`workflow:read`, `documents:read`, `applications:duplicate_check`, `applications:create`, `profile:read`), 90-day expiry, and automatic revocation when membership ends.
4. Browser extension migration (`extension/` package) compatible with Manifest V3, updated to use `/api/ext/v1`, with token auth in options, multi-tier job extraction (JSON-LD, ATS adapters, DOM headings, meta tags, generic fallbacks), 4-state duplicate detection (`EXACT_POSTING`, `SAME_ROLE`, `COMPANY_ONLY`, `NONE` + `CHECK_ERROR`), canonical stage synchronization, and secure deep-linking (`${origin}/w/${workspaceId}/applications/${id}`).
5. Automated unit, integration, and E2E verification preserving all legacy extraction fixtures and security invariants.

## Safety Classification

**NORMAL DEVELOPMENT**.
- Operates strictly on `feature/m11-browser-extension` using local Supabase, `jobquest-dev` hosted development, and Vercel Previews.
- Zero production infrastructure, zero cutover, zero DNS modifications, zero changes to `JobQuest1.0`.
- Per Section 45 instructions: **DO NOT MERGE M11 TO DEVELOPMENT**. M11 remains on its feature branch for user review upon completion.

## Source Authority

- `GATE_01_ARCHITECTURE_PROPOSAL.md` §12, §23 M11
- `FEATURE_CATALOG.md` FEATURE-EXT-001 through FEATURE-EXT-005
- `BUSINESS_LOGIC_CATALOG.md` BL-003, BL-014, BL-015
- `CHANGE_REQUESTS.md` CR-011 (immutable posting snapshots), CR-012 (scoped tokens)
- `ui-design/gate-02b/mockups/10-extension.html` and `SCREEN_INVENTORY.md`
- Legacy read-only reference: `JobQuest1.0/extension/`
