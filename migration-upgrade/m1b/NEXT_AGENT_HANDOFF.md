# M1B → Next Agent Handoff

This file is written for any coding agent (Claude Code, Antigravity, Codex, etc.) and operates without requiring prior chat history.

---

## 1. Current State & Milestone Closure

| Dimension | Approved Status | Notes |
|---|---|---|
| **Repository** | `KrapaGoutam/JobQuest2.0` | Active Git repository |
| **Legacy Codebase** | `../JobQuest1.0/` | **STRICTLY READ ONLY**. Never modify, delete, or link directly |
| **M1 Foundation** | **COMPLETE** | Architectural plumbing validated end-to-end |
| **Auth Option A** | **FAILED / SUPERSEDED** | Permanent failure due to T03 identity leak via `/auth/v1/user` |
| **M1B Option B** | **PASS / APPROVED** | Formally adopted as JobQuest 2.0 authentication architecture |
| **Integration Branch** | `development` | M1B approved and merged into `development` |
| **Protected Branch** | `main` | **STRICTLY PROTECTED**. Never merge to `main` until final production cutover |
| **Active Next Branch** | `feature/m2-design-system` | Dedicated feature branch for Milestone 2 (Design System) |

---

## 2. Proven Architecture (Option B)

- **Authentication Model:** Node-owned credentials (`public.user_credentials`) and sessions (`public.auth_sessions`).
- **Password Engine:** Argon2id PHC string verifier (contains memory, iterations, parallelism parameters, and salt).
- **Session Tokens:** 15-minute ES256 access JWTs minted by the Node API using a server-only private JWK (`JQ_JWT_PRIVATE_JWK`).
- **Refresh Tokens:** Single-use rotating opaque 256-bit CSPRNG tokens transported in HttpOnly, Secure, SameSite=Strict cookie `jq_rt` (path `/api/auth`). Stored as SHA-256 hash in `public.auth_refresh_tokens`.
- **Replay Protection:** Reusing a consumed refresh token immediately terminates the session (`REFRESH_REUSED`).
- **Data Access:** Browser calls Supabase Data API (PostgREST) directly using `supabase-js` custom `accessToken` injection.
- **RLS & Identity:** Postgres `auth.uid()` evaluates to `request.jwt.claims.sub` (`user_accounts.user_id`).
- **Supabase Auth Decoupling:** Zero `auth.users` identities; zero synthetic emails; no PINs.
- **Service Role Restriction:** The service role key is strictly server-only and used solely for auth RPCs.

---

## 3. Reconciled Schema State

- **Target Database Catalog:** **29 Permanent Production Tables + 2 Migration Tracking Tables = 31 Total Target Tables**.
- **Implemented Baseline (11 Tables):**
  1. `public.user_accounts` (System account anchor, application-owned UUIDv4 `user_id`)
  2. `public.profiles` (User settings, theme, timezone, week_start, optional notification email/phone)
  3. `public.auth_recovery_codes` (10 single-use >=128-bit CSPRNG recovery codes)
  4. `public.workspaces` (Personal and team workspaces)
  5. `public.workspace_members` (Tenant memberships with USER and MANAGER roles)
  6. `public.applications` (Core job application entity under RLS)
  7. `public.workflow_definitions` (Canonical pipeline stages, outcomes, closure reasons)
  8. `public.user_credentials` (Argon2id password hashes, salt, parameters, version)
  9. `public.auth_sessions` (Application-owned active/revoked sessions)
  10. `public.auth_refresh_tokens` (SHA-256 hashed single-use rotating refresh tokens)
  11. `public.auth_rate_limits` (Fixed-window rate limit counters for IP and account throttling)
- **Functions, Triggers & RPCs:**
  - 0 Views
  - 5 internal `app` schema helpers (`touch_updated_at`, `current_user_id`, `user_is_member_of`, `user_has_role_in`, `session_is_active`)
  - 6 Triggers (`trg_protect_last_manager`, touch triggers)
  - 1 Domain RPC (`rpc_create_workspace`)
  - 11 Service-Role Auth RPCs (`rpc_register_account`, `rpc_create_session`, `rpc_rotate_refresh_token`, `rpc_session_for_refresh`, `rpc_revoke_sessions`, `rpc_session_is_live`, `rpc_change_password`, `rpc_recover_account`, `rpc_record_auth_failure`, `rpc_clear_login_failures`, `rpc_rate_limit_hit`)
- **Remaining Tables (20 Tables):** Reserved for subsequent milestones (M3+).

---

## 4. Infrastructure & Environment State

- **Hosted Supabase Dev Project:**
  - Name: `jobquest-dev`
  - Reference: `xpnkasclquplmrcmhsif`
  - Region: `us-west-2`
  - Active Signing Key: `kid: a73390b9-56bf-4d1a-a642-efd4479ca0b3` (ES256, `in_use`)
  - Standby Signing Key: `kid: 551fc599-e6da-49e0-8fb8-886ec177b90f` (ES256, `previously_used`, trusted)
  - Settings: 4 restored (TOTP enroll/verify, OTP length 8, email interval 60s), 1 constrained by free tier (storage analytics)
  - Users: 0 synthetic Option A accounts in `auth.users`
- **Vercel State:**
  - Account: `goutamkrapa11-8565`
  - Team: `one-piece-5779`
  - Current Projects: 0
  - Status: **Explicitly deferred to Milestone 2 (Design System & App Shell)**
- **CI / Testing State:**
  - Workflow: `.github/workflows/m1-ci.yml`
  - Status: 100% green on latest HEAD commit (`5b9bced`, run `36060373279`)

---

## 5. Open Questions Summary

- **OQ-011 (Auth Option A vs B):** RESOLVED. Option A FAILED; Option B APPROVED.
- **OQ-025 (Signing Key Import/Rotation):** RESOLVED. Active on `jobquest-dev`.
- **OQ-026 (CLI Authentication):** RESOLVED. Authenticated to `goutam.krapa11@gmail.com`.
- **OQ-027 (Dev Settings Restoration):** RESOLVED. Restored on `jobquest-dev`.
- **OQ-028 (Option A Account Purge):** RESOLVED. 20 accounts purged; 0 remain.
- **OQ-029 (Production Key Custody):** DEFERRED to pre-production hardening.
- **OQ-030 (Production Rate Limiting & Cleanup):** DEFERRED to pre-production scaling.
- **OQ-031 (Vanished Project):** CAUSE UNKNOWN. Non-blocking.

---

## 6. Authoritative Files to Read (In Order)

1. `migration-upgrade/m1b/M1B_FINAL_APPROVAL_REPORT.md` (integration & approval record)
2. `migration-upgrade/gate-03/GATE_03_AUTH_OPTION_B_AMENDMENT.md` (normative auth spec)
3. `migration-upgrade/gate-03/TARGET_SCHEMA.md` (reconciled schema catalog)
4. `migration-upgrade/docs/IMPLEMENTATION_PLAN.md` (master roadmap)
5. `migration-upgrade/ui-design/gate-02b/GATE_02B_UI_SPEC.md` (Direction D design specification)
6. `migration-upgrade/m2/README.md` (Milestone 2 planning package)

---

## 7. Exact Next Milestone: Milestone 2 (Design System & App Shell)

- **Milestone Name:** **Milestone 2 — Design System & App Shell**
- **Objective:** Implement Gate 02B-approved Direction D (JobQuest Hybrid) tokens, base themed components (Button, Input, Table, Dialog, Drawer, Toast, Tabs, InlineEdit), responsive navigation shell with workspace switcher, visual regression baseline, and Vercel development preview project initialization.
- **Target Branch:** `feature/m2-design-system` (branched from updated `development`).
- **Implementation Status:** Planning package established in `migration-upgrade/m2/`. **STOP before unapproved implementation.**

---

## 8. Ready-to-Copy Next-Agent Prompt

```markdown
You are continuing JobQuest 2.0 (repo KrapaGoutam/JobQuest2.0) on branch feature/m2-design-system.
../JobQuest1.0/ is STRICTLY READ ONLY. Never link to or modify it.

Read, in order:
1. migration-upgrade/m1b/M1B_FINAL_APPROVAL_REPORT.md
2. migration-upgrade/m1b/NEXT_AGENT_HANDOFF.md
3. migration-upgrade/m2/README.md
4. migration-upgrade/m2/IMPLEMENTATION_PLAN.md
5. migration-upgrade/ui-design/gate-02b/GATE_02B_UI_SPEC.md

Current State:
- M1/M1B: COMPLETE & APPROVED. Option B merged into development.
- Target schema: 29 permanent + 2 migration = 31 total target tables (11 implemented in M1/M1B).
- Supabase dev: jobquest-dev (xpnkasclquplmrcmhsif), ES256 key active, 11 baseline tables migrated.
- Vercel: Account goutamkrapa11-8565 / team one-piece-5779; project creation deferred to M2 preview.

Task:
Proceed with Milestone 2 (Design System & App Shell) planning review and execution strictly per migration-upgrade/m2/ plan.
Do NOT merge anything to main.
```
