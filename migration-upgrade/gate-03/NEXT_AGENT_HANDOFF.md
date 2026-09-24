# JOBQUEST2.0 — NEXT AGENT HANDOFF

## 1. Current Project Phase

* **Gate 01 (Architecture):** **APPROVED**
* **Gate 02A (Visual Direction D):** **APPROVED**
* **Direction D (Design Direction):** **APPROVED**
* **Gate 02B (UI/UX Specifications):** **APPROVED**
* **Gate 03 (Database + Auth + RLS Design):** **APPROVED**

**Next Phase:**  
**Milestone 1 (M1) — Foundation / Authentication Architecture Spike**

*Note:* Gate 03 is fully approved. M1 implementation is authorized to proceed once the required Git sequence and infrastructure setup below are completed by the next agent.

---

## 2. Current Git State

* **Current Branch:** `docs/gate-03-db-auth-rls`
* **Expected Parent / Integration Branch:** `development`
* **Parent Commit:** `11850e2` (`merge: approve Gate 02B UI and design baseline`)
* **Current Working Tree Status:** All Gate 03 architectural specifications, tracking documents, the canonical approval report, and this handoff document have been edited and are currently **uncommitted** on `docs/gate-03-db-auth-rls`.

> [!IMPORTANT]
> **CRITICAL REPOSITORY SAFETY RULES:**  
> * **DO NOT REBASE**  
> * **DO NOT FORCE PUSH**  
> * **DO NOT RESET**  
> * **DO NOT DELETE APPROVED HISTORY**

---

## 3. Required Git Sequence Before M1

Before starting any M1 coding or cloud configuration, execute the following sequence:

1. **Review Gate 03 Final Changes:** Run `git status` and `git diff --stat` to verify that all modifications match the approved Gate 03 report.
2. **Commit Gate 03:** Stage and commit all changes on `docs/gate-03-db-auth-rls`:
   ```bash
   git add migration-upgrade/
   git commit -m "docs(gate-03): approve database, auth, and RLS architecture with required review corrections"
   ```
3. **Push Gate 03 Branch:**
   ```bash
   git push -u origin docs/gate-03-db-auth-rls
   ```
4. **Merge into `development`:**
   ```bash
   git checkout development
   git pull origin development
   git merge docs/gate-03-db-auth-rls --no-ff -m "merge: approve Gate 03 database, auth, and RLS architecture"
   git push origin development
   ```
5. **Verify `development` Contains Gate 03 Approval.**
6. **Create a Fresh M1 Branch from `development`:**
   ```bash
   git checkout -b feature/m1-foundation-auth-spike
   ```

> [!CAUTION]
> * **Do NOT begin M1 implementation on `docs/gate-03-db-auth-rls`.**
> * **Do NOT merge directly to `main`.** `main` remains protected until later approved production cutover milestones.

---

## 4. Source of Truth Order

When making design, architectural, or implementation decisions, future agents must follow this strict priority order:

1. **Explicit current user instructions** (in the active session)
2. **Approved Gate 03 decisions** ([`GATE_03_DECISIONS.md`](GATE_03_DECISIONS.md))
3. **Master Gate 03 Approval Report** ([`GATE_03_FINAL_APPROVAL_REPORT.md`](GATE_03_FINAL_APPROVAL_REPORT.md))
4. **Gate 03 Specifications** ([`migration-upgrade/gate-03/*`](.))
5. **Decisions Register** ([`migration-upgrade/DECISIONS.md`](../DECISIONS.md))
6. **Change Requests Register** ([`migration-upgrade/CHANGE_REQUESTS.md`](../CHANGE_REQUESTS.md))
7. **Open Questions Register** ([`migration-upgrade/OPEN_QUESTIONS.md`](../OPEN_QUESTIONS.md))
8. **Approved Gate 02B Specifications** ([`migration-upgrade/ui-design/gate-02b/`](../ui-design/gate-02b/))
9. **Approved UI Baseline & Mockups** ([`migration-upgrade/ui-design/approved/`](../ui-design/approved/))
10. **Gate 01 Architecture** ([`migration-upgrade/GATE_01_ARCHITECTURE_PROPOSAL.md`](../GATE_01_ARCHITECTURE_PROPOSAL.md))
11. **Migration Package Documentation** ([`migration-upgrade/docs/*`](../docs/))
12. **Verified JobQuest 1.0 Legacy Source Code** (`../JobQuest1.0/`, strictly read-only)
13. **Assumptions only when unavoidable** (must be documented explicitly)

*Conflict Rule:* Later approved decisions supersede older proposals. Never silently rewrite historical context.

---

## 5. Critical Approved Architecture Decisions

### Authentication
* **Credentials:** Username REQUIRED, Password REQUIRED, Email OPTIONAL, Phone OPTIONAL.
* **Legacy PINs:** Numeric PINs are permanently retired. Legacy PIN hashes are strictly discarded and never reused as passwords.
* **Auth Option A (Provisional):** Node Auth Façade on Vercel maps public usernames to internal synthetic identities (`id_<uuid>@auth.jobquest.internal`) in Supabase GoTrue. It is provisionally approved subject to passing the M1 spike.
* **Zero Leakage Invariant:** The synthetic internal identity must have zero browser-visible leakage (in user objects, JWTs, API payloads, React state, browser storage, debug logs, or network responses). Any leak fails Option A.
* **Auth Option B Fallback:** Evaluated as an architectural fallback before product implementation continues (NOT an automatic runtime failover). Evaluates supported Supabase mechanisms (custom JWTs, imported keys, etc.).

### Primary Keys & Schema
* **Canonical PKs:** **UUIDv4 (`gen_random_uuid()`)** across all 25 permanent target tables. UUIDv7 proposal is superseded.
* **Legacy Traceability:** Legacy integer IDs are retained in nullable `legacy_id INTEGER` columns and the centralized `migration_id_mappings` table.

### Workspace & Data Isolation
* **Multi-Tenancy:** Users belong to multiple workspaces with independent `USER` or `MANAGER` roles.
* **Active Workspace:** Active workspace is a client-side UX filter, never an authorization authority. PostgreSQL RLS evaluates caller access on every query.
* **USER Role:** Permitted own records only inside shared workspaces. No peer-to-peer data visibility across applications, contacts, interactions, snapshots, tasks, habits, or journals.
* **MANAGER Role:** Workspace-wide oversight inside managed workspaces; zero cross-workspace privileges; sensitive actions and coaching journal reads emit `audit_events`.
* **Last Manager Protection:** Database trigger `trg_protect_last_manager` prohibits removing or demoting the final manager in any workspace.
* **Member Removal:** Deletes `workspace_members` record; historical records retain attribution with `ON DELETE RESTRICT`.

### Access Boundary
* **3-Tier Routing Contract:**
  1. *Direct Supabase PostgREST (`supabase-js`):* High-frequency single-table reads, filtering, pagination, and low-risk CRUD governed by RLS.
  2. *Database RPCs (`supabase.rpc`):* Multi-table atomic domain operations (stage moves, outcomes, Keep Active, interview completions).
  3. *Node.js Façade (`/api/*` on Vercel):* Privileged authentication, recovery, extension capture, CSV streaming, and service-role operations.

### Application Lifecycle & Analytics
* **Decoupled State Model:** 4 distinct dimensions: `stage` (8 canonical positions), `state` (`OPEN` vs. `CLOSED`), `outcome` (5 terminal results), `closure_reason` (structured sub-classification).
* **Offer Declined:** Recorded as `outcome = 'WITHDRAWN'` with structured `closure_reason = 'OFFER_DECLINED'`.
* **Position Closed:** Recorded as `outcome = 'POSITION_CLOSED'`, representing role closure by employer.
* **Event Sourcing:** `application_events` is append-only and immutable. Historical funnel analytics use "ever reached" event history; current pipeline uses the `applications.stage` column.
* **Aging Telemetry:** Persisted `last_activity_at TIMESTAMPTZ` updated atomically by domain events. 15–30 days surfaces stale indicator; 31+ days surfaces in Long Waiting queue. "Keep Active" action touches timestamp with zero automatic state mutations.

### Extension & Theme
* **Extension:** Dedicated API tokens (`jqe_live_...`) bound to `(user_id, workspace_id)` stored as SHA-256 hashes with user revocation in Settings. Normal password never exposed.
* **Theme:** System default, Light fallback, user choices = System / Light / Dark with persistent override.

---

## 6. Final Target Schema Summary

* **Permanent Target Tables:** Exactly **25 tables**.
* **Migration & Audit Tracking Tables:** Exactly **2 tables** (`migration_batches`, `migration_id_mappings`).
* **Total Database Tables:** **27 tables**.
* **M1 Foundational Baseline Tables:** Exactly **7 tables**:
  1. `public.user_accounts`
  2. `public.profiles`
  3. `public.auth_recovery_codes`
  4. `public.workspaces`
  5. `public.workspace_members`
  6. `public.applications`
  7. `public.workflow_definitions`

*Authoritative References:* [`TARGET_SCHEMA.md`](TARGET_SCHEMA.md) and [`GATE_03_FINAL_APPROVAL_REPORT.md`](GATE_03_FINAL_APPROVAL_REPORT.md).

---

## 7. Final RLS Rules

* **`SYSTEM / SECURITY` (Node Façade Only):** `user_accounts`, `auth_recovery_codes`, `legacy_claim_codes`, `audit_events`, `migration_batches`, `migration_id_mappings`.
* **`OWNER PRIVATE` (Owner Only):** `profiles` (self only via `auth.uid() = profile_id`).
* **`OWNER SCOPED / MANAGER OVERRIDE` (Peer-Isolated):** `applications`, `job_snapshots`, `interviews`, `contacts`, `contact_interactions`, `tasks`, `habits`, `habit_logs`, `goals`, `journal_entries`, `resumes`, `resume_versions`, `application_tags`, `saved_views`, `extension_tokens`.
  * *Standard USER:* Sees and mutates own records only (`user_id = auth.uid()`). Zero visibility into peers' records.
  * *MANAGER:* Sees records across all members in managed workspaces. Cross-user manager reads/writes to journal entries and applications emit audit records.
* **`WORKSPACE SHARED` (Collaborative Reference):** `workspaces`, `workspace_members`, `companies`, `tags`. Non-private reference data visible to all workspace members.
* **`DERIVED / READ ONLY`:** `workflow_definitions` (readable by all workspace members; updated via administrative operations only).

---

## 8. Verified Legacy Migration Facts

* **Legacy Database:** PostgreSQL on Neon (JobQuest 1.0).
* **Exact Legacy Table Count:** Exactly **33 tables** (from migrations `001_jobsearch.sql` through `013_extension_tokens.sql`).
* **Exact Verified 13 Legacy Stages:** `Saved`, `Preparing`, `Applied`, `Assessment`, `Recruiter Screen`, `Interview`, `Final Interview`, `Offer`, `Rejected`, `Withdrawn`, `Ghosted`, `Position Closed`, `Accepted`.
* **Target Migration Workspace:** Dedicated system team workspace: `"JobQuest (Migrated)"`.
* **User Attribution:** Legacy user IDs, relationships, interview notes, and activity histories are preserved.
* **Legacy Credentials:** Legacy PIN credentials and hashes are permanently discarded.
* **Migration Status:** **Zero data migration has occurred.** Actual migration will execute in Milestone 19.

*Authoritative References:* [`LEGACY_TABLE_MAPPING.md`](LEGACY_TABLE_MAPPING.md) and [`DATA_MIGRATION_DESIGN.md`](DATA_MIGRATION_DESIGN.md).

---

## 9. Milestone 1 (M1) Objective

The M1 Spike is an **architecture proof-of-concept**.

### It is NOT:
* A full application implementation
* A full 33-table schema deployment
* A data migration from Neon
* A browser extension rewrite
* A production deployment
* A full UI screen build

### It IS:
A targeted spike to prove core foundation plumbing: username/password auth via Option A, zero synthetic identity leakage, native `auth.uid()` RLS binding, personal workspace auto-creation, session lifecycle, canonical workflow retrieval from `workflow_definitions`, direct browser PostgREST under RLS, and Vercel preview deployment.

---

## 10. M1 Required Proofs (12 Mandatory Tests)

The next agent must implement and run the 12 automated verification tests defined in [`M1_SPIKE_PLAN.md`](M1_SPIKE_PLAN.md) §3:

1. **T01:** Username account registration (`/api/auth/register`) creating `user_accounts`, personal workspace, and 10 recovery codes (>=128-bit entropy).
2. **T02:** Username/password login (`/api/auth/login`) returning HttpOnly cookies.
3. **T03 (Hard Fail):** Zero identity leakage verification (inspect session user object, JWT, API, React state, storage, debug logs, network).
4. **T04 (Hard Fail):** Native `auth.uid()` resolution against Postgres RLS.
5. **T05:** RLS own-record isolation (User A cannot see User B's applications; Manager sees both).
6. **T06:** Canonical workflow retrieval from `workflow_definitions` via PostgREST and Node API.
7. **T07:** Silent session refresh and token rotation via HttpOnly cookies.
8. **T08:** Global logout and session revocation.
9. **T09:** Password change lifecycle.
10. **T10:** Sliding window rate limiting lockout on invalid attempts.
11. **T11:** Direct browser PostgREST CRUD under RLS.
12. **T12 (Hard Fail):** Outbound email zero-emission verification in Supabase project logs.

---

## 11. Auth Option A Hard Fail Conditions

If ANY of the following occur during M1:
* The internal string `@auth.jobquest.internal` appears anywhere browser-visible.
* Supabase GoTrue dispatches outbound confirmation or notification emails to synthetic addresses.
* Native `auth.uid()` fails to resolve under PostgreSQL RLS policies.
* Direct PostgREST queries fail to operate safely under RLS.

### Action on Hard Fail:
1. **STOP product implementation immediately.** Do not attempt cosmetic workarounds to mask the leak.
2. Formally change the project architectural decision from Option A to Option B.
3. Evaluate supported Supabase mechanisms (custom JWTs, imported keys, etc.) and select the safest supported pattern.

---

## 12. Infrastructure Account Change

The user plans to use **NEW** dedicated accounts for JobQuest 2.0:
* **NEW Supabase Account**
* **NEW Vercel Account**

No accounts have been logged in or linked yet.

### Post-Gate 03 Setup Sequence:
1. Create and switch to M1 branch: `feature/m1-foundation-auth-spike`.
2. Run `npx supabase login` with the user's NEW Supabase account.
3. Create a NEW Development Supabase Project (`jobquest-dev`).
4. Run `npx supabase init` and `npx supabase link --project-ref <dev_ref>`.
5. Run `npx vercel login` with the user's NEW Vercel account.
6. Link the local repository to a NEW Development Vercel project (`npx vercel link`).
7. Configure dev environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, server-side `SUPABASE_SERVICE_ROLE_KEY`).
8. Apply M1 baseline migrations (7 tables) and execute M1 tests.

> [!CAUTION]
> Do NOT create or link production projects during M1. Dev environment only.

---

## 13. Supabase CLI Safety Rules

* Always verify the active account and organization before running remote commands:
  ```bash
  npx supabase projects list
  ```
* Verify project reference matches the development project before linking.
* **Never link to the legacy JobQuest 1.0 Supabase project.**
* Review all migration SQL files before running `supabase db push`.

---

## 14. Vercel CLI Safety Rules

* Always verify the active Vercel user and team:
  ```bash
  npx vercel whoami
  ```
* Link only to the development project.
* **Never deploy to production (`--prod`) during M1.** Preview deployments only.

---

## 15. Legacy Repository Rule

* Path: `../JobQuest1.0/`
* **Status: STRICTLY READ-ONLY.**
* Permitted: Inspecting legacy schema, business logic, test fixtures, API shapes, and extension extractors.
* **Prohibited:** Modifying, reformatting, committing, or using `../JobQuest1.0/` as the implementation directory.

---

## 16. Browser Extension Rule

* The extension is **NOT** being rewritten from scratch.
* The proven Manifest V3 foundation, DOM extractors, and test fixtures from `../JobQuest1.0/extension/` are preserved.
* Later migration (Milestone 3) updates the API client, auth tokens, canonical workflow sync, and error handling.
* **Extension work is excluded from M1.**

---

## 17. Approved UI Rule

* All future UI screens must implement **Direction D · JobQuest Hybrid** as approved in Gate 02B:
  * Spec: [`migration-upgrade/ui-design/gate-02b/`](../ui-design/gate-02b/)
  * Approved mockups: [`migration-upgrade/ui-design/approved/`](../ui-design/approved/)
* M1 uses only minimal technical test harness UI (login form, minimal table). Do NOT confuse M1 test UI with final product UI.

---

## 18. Outstanding Questions

Only genuine, non-blocking items remain open:
* **OQ-011: Supabase Auth Option A vs. Option B:** Status: **PENDING M1 SPIKE**. Proven or pivoted by M1.
* **OQ-016: Production Plan Tiers:** Status: **PENDING PRE-PRODUCTION**. Evaluated before production launch.
* **OQ-021: Production Smoke Account:** Status: **PENDING PRE-PRODUCTION**. Provisioned during pre-production hardening.

All other open questions (OQ-001 through OQ-010, OQ-012 through OQ-015, OQ-017 through OQ-020, and OQ-022 through OQ-024) are **RESOLVED**.

---

## 19. Deferred Work Items

Work explicitly excluded from M1:
* Full 25-table schema DDL deployment (M1 deploys 7 tables only)
* Legacy Neon data migration (deferred to Milestone 19)
* Full Direction D UI component library
* Chrome extension update
* Realtime subscriptions
* Production deployment

---

## 20. Files the Next Agent Must Read First

1. **[`migration-upgrade/gate-03/NEXT_AGENT_HANDOFF.md`](NEXT_AGENT_HANDOFF.md)** (This document)
2. **[`migration-upgrade/gate-03/GATE_03_FINAL_APPROVAL_REPORT.md`](GATE_03_FINAL_APPROVAL_REPORT.md)** (Full approval report)
3. **[`migration-upgrade/gate-03/M1_SPIKE_PLAN.md`](M1_SPIKE_PLAN.md)** (Detailed M1 test protocol)
4. **[`migration-upgrade/gate-03/AUTHENTICATION_DESIGN.md`](AUTHENTICATION_DESIGN.md)** (Auth Option A & B architecture)
5. **[`migration-upgrade/gate-03/AUTHORIZATION_RLS_DESIGN.md`](AUTHORIZATION_RLS_DESIGN.md)** (RLS policies & security matrix)
6. **[`migration-upgrade/gate-03/TARGET_SCHEMA.md`](TARGET_SCHEMA.md)** (Database schema specification)
7. **[`migration-upgrade/gate-03/RPC_DOMAIN_OPERATIONS.md`](RPC_DOMAIN_OPERATIONS.md)** (Domain operations & boundaries)
8. **[`migration-upgrade/gate-03/TEST_MATRIX.md`](TEST_MATRIX.md)** (Testing suites & scenarios)
9. **[`migration-upgrade/DECISIONS.md`](../DECISIONS.md)** (Master ADR registry)
10. **[`migration-upgrade/OPEN_QUESTIONS.md`](../OPEN_QUESTIONS.md)** (Open questions status)

---

## 21. Recommended Next Prompt

Copy and paste this exact prompt to start the next agent session:

```text
Resume JobQuest 2.0 following the approved Gate 03 architecture.

First read:
1. migration-upgrade/gate-03/NEXT_AGENT_HANDOFF.md
2. migration-upgrade/gate-03/GATE_03_FINAL_APPROVAL_REPORT.md
3. migration-upgrade/gate-03/M1_SPIKE_PLAN.md

Verify Git branch and status. Do NOT restart Gates 01–03.
Execute the required Git sequence to commit Gate 03 changes, merge into development, and branch feature/m1-foundation-auth-spike.
Prepare the development infrastructure using the user's NEW Supabase and Vercel accounts as specified in the handoff.
Then execute exclusively the Milestone 1 (M1) foundation and authentication spike across the 7 baseline tables.
Enforce the Auth Option A zero identity leakage hard-fail criteria.
Do not begin full product or data migration.
```

---

## 22. Agent Independence Requirement

This handoff is completely self-contained. It is designed for seamless consumption by **Claude Code**, **Antigravity**, **Codex**, or any other senior coding agent without relying on conversation context, proprietary metadata, or agent memory. All facts, decisions, and constraints are preserved directly in repository files.

---

## 23. Handoff Quality Verification

* [x] Current branch (`docs/gate-03-db-auth-rls`) and next branch (`feature/m1-foundation-auth-spike`) verified.
* [x] Gate 01 through Gate 03 statuses recorded as APPROVED.
* [x] Final permanent table count (25) and migration table count (2) reconciled (27 total).
* [x] M1 foundational baseline table count (7) reconciled with `workflow_definitions`.
* [x] Canonical UUIDv4 standard (`gen_random_uuid()`) confirmed; UUIDv7 marked SUPERSEDED.
* [x] Verified 13 legacy stages from source code (`Saved` through `Accepted`) documented.
* [x] RLS peer isolation across all Tier-3 activity tables documented.
* [x] Option A zero identity leakage hard-fail conditions and Option B fallback documented.
* [x] Account switch sequence for NEW Supabase and Vercel accounts documented.
* [x] Zero external/temporary IDE URLs; clean relative repository paths throughout.
