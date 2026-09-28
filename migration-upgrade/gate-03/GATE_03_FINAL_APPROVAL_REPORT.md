# JOBQUEST2.0 — GATE 03 FINAL APPROVAL REPORT

## 1. Gate Status

**GATE 03 — APPROVED**

Gate 03 (Database + Authentication + Authorization/RLS Design) is formally approved with all required review corrections verified and integrated. All blocking items, including legacy stage verification, credential schema clarification, recovery entropy, claim code validity, RLS data isolation, and foundational table reconciliation, have been resolved.

---

## 2. Executive Summary

Gate 03 establishes the complete data, authentication, authorization, and migration architecture for JobQuest 2.0, converting the approved visual design system (Direction D · JobQuest Hybrid) and Gate 02B UI/UX specifications into a robust, secure, and production-ready technical architecture.

### What Gate 03 Designed:
* **Target PostgreSQL Schema:** A normalized, workspace-scoped relational schema comprising **25 permanent target tables** and **2 dedicated migration tracking tables** (27 total), utilizing canonical **UUIDv4 (`gen_random_uuid()`)** primary keys.
* **Authentication Architecture:** A username/password primary authentication model (email optional, phone optional, numeric PIN retired) built around **Auth Option A** (layered Supabase Auth with hidden internal identities), subject to an explicit proof in the Milestone 1 (M1) architecture spike with **Option B** as a pre-evaluated architectural fallback.
* **Multi-Tenant Row Level Security (RLS):** Strict schema-level workspace isolation. Standard members (`USER`) can view, mutate, and export only permitted **own** records across applications, contacts, interactions, job snapshots, tasks, habits, and journals. Administrators (`MANAGER`) have workspace-wide oversight with immutable audit logging for sensitive cross-user and coaching actions.
* **Decoupled Pipeline Architecture:** Complete decomposition of the legacy 13-stage monolith into 4 orthogonal dimensions: **Stage** (8 canonical pipeline positions), **State** (`OPEN` vs. `CLOSED`), **Outcome** (5 terminal results), and **Closure Reason** (structured sub-classification).
* **Append-Only Event Sourcing:** Immutable `application_events` powering historical funnel analytics ("ever reached") independently of current pipeline positions.
* **Inactivity & Aging Telemetry:** Persisted `last_activity_at` indexed timestamp driving the 15–30 day Stale indicator and 31+ day Long Waiting review queue with **zero automatic state mutations**.
* **100% Legacy Data Parity:** Comprehensive mapping of all 33 legacy Neon/Postgres tables into target tables, preserving legacy attribution, history, and relationships inside a dedicated `"JobQuest (Migrated)"` system workspace.

### What Was Corrected During Final Review:
* Converted canonical PK standard from proposed UUIDv7 to mature, native **UUIDv4 (`gen_random_uuid()`)**; marked UUIDv7 superseded.
* Re-verified legacy source code to establish the exact 13 legacy stage strings (`Saved` through `Accepted`), confirming that `declined` was never a legacy database stage and that `Position Closed` maps to `POSITION_CLOSED`.
* Corrected RLS data isolation for contacts, interactions, and job snapshots from workspace-shared to **OWNER SCOPED / MANAGER OVERRIDE**, eliminating peer visibility leakage.
* Reconciled journal authorization so managers retain coaching oversight within managed workspaces, backed by audit logging.
* Renamed `user_credentials` to `user_accounts` to clarify that Supabase Auth owns password credentials and no redundant hashes are stored.
* Upgraded recovery code generation to `>= 128 bits` of CSPRNG entropy per code before Crockford Base32 encoding.
* Reduced legacy claim token default validity from 90 days to **30 days** with operator reissue capability.
* Hardened CSRF defenses into a 4-tier defense-in-depth model (SameSite cookies, Origin/Referer validation, Anti-CSRF tokens, and CORS/Content-Type enforcement), eliminating reliance on `X-Requested-With` alone.
* Added zero-leakage hard-fail criteria for Option A and clarified Option B as an architectural fallback rather than runtime failover.
* Reconciled table counts: 25 permanent tables + 2 migration tables (27 total), with M1 foundation expanding to **7 tables** to prove database-backed canonical workflow retrieval.

### What Remains Intentionally Deferred:
* **Milestone 1 (M1) Spike Implementation:** Execution of the M1 architecture spike is scheduled as the immediate next phase.
* **Open Question OQ-011:** Final confirmation of Option A vs. Option B remains pending M1 spike results.
* **Pre-Production Infrastructure:** Production plan tier upgrades (OQ-016) and production smoke-test account provisioning (OQ-021) are deferred to pre-production.
* **Non-M1 Features:** Chrome extension migration, real-time subscriptions, full 33-table migration execution, and full UI implementation remain deferred to their respective milestones.

### Non-Execution Confirmation:
* **No code implementation has begun.**
* **No Supabase CLI login or project initialization has occurred.**
* **No Vercel CLI login or linking has occurred.**
* **No migrations or database tables have been created.**
* **The legacy `../JobQuest1.0/` repository remains strictly untouched and read-only.**

---

## 3. Corrections Made During Final Review

| # | Topic | Previous Proposal | Final Decision | Rationale | Affected Documents |
| :-: | :--- | :--- | :--- | :--- | :--- |
| **1** | **Primary Key Standard (ADR-031)** | UUIDv7 time-ordered keys across all tables | **UUIDv4 (`gen_random_uuid()`)** across all 25 permanent tables. UUIDv7 proposal marked **SUPERSEDED**. | Mature PostgreSQL/Supabase native support, operational simplicity, zero external dependencies, adequate performance for JobQuest scale. Legacy integer IDs retained separately for audit. | `TARGET_SCHEMA.md`<br>`GATE_03_ARCHITECTURE.md`<br>`TEST_MATRIX.md`<br>`DECISIONS.md` |
| **2** | **13-Stage Legacy Mapping (ADR-033)** | Draft list included `declined` and omitted `position_closed` | **Verified canonical 13 stages from source code**: `Saved`, `Preparing`, `Applied`, `Assessment`, `Recruiter Screen`, `Interview`, `Final Interview`, `Offer`, `Rejected`, `Withdrawn`, `Ghosted`, `Position Closed`, `Accepted`. | Source inspection of `001_jobsearch.sql`, `ui-utils.js`, and `service.js` confirmed exact legacy strings. `declined` was a product concept (maps to `WITHDRAWN` + `OFFER_DECLINED`), while `Position Closed` was an actual stage (maps to `POSITION_CLOSED`). | `DATA_MIGRATION_DESIGN.md`<br>`TARGET_SCHEMA.md`<br>`RPC_DOMAIN_OPERATIONS.md`<br>`TEST_MATRIX.md` |
| **3** | **Peer Data Isolation (RLS)** | `contacts`, `contact_interactions`, `job_snapshots` classified as WORKSPACE SHARED | Classified as **OWNER SCOPED / MANAGER OVERRIDE**. Standard members see only own records. | Enforces strict privacy invariant: ordinary members cannot inspect peer job-search activity or contacts in shared workspaces. `companies` remains shared reference data. | `AUTHORIZATION_RLS_DESIGN.md`<br>`TARGET_SCHEMA.md`<br>`RPC_DOMAIN_OPERATIONS.md`<br>`TEST_MATRIX.md` |
| **4** | **Journal Authorization (RLS)** | `journal_entries` classified as strictly OWNER PRIVATE (invisible to managers) | Classified as **OWNER SCOPED / MANAGER OVERRIDE**. Managers have coaching access; access is audited. | Aligns with approved manager oversight model. Normal members see own journals; managers see journals in managed workspaces for coaching; cross-user manager access emits `audit_events`. | `AUTHORIZATION_RLS_DESIGN.md`<br>`TARGET_SCHEMA.md`<br>`SECURITY_THREAT_MODEL.md` |
| **5** | **Account Table Naming & Role** | `user_credentials` table (implied password hash storage) | Renamed to **`user_accounts`**. Contains metadata only (no password hashes). | Supabase Auth owns password credentials under Option A. `user_accounts` stores only username lookup, account status, and lockout metadata. | `TARGET_SCHEMA.md`<br>`AUTHENTICATION_DESIGN.md`<br>`M1_SPIKE_PLAN.md`<br>`LEGACY_TABLE_MAPPING.md` |
| **6** | **Recovery Code Entropy (ADR-038)** | Generic 32-byte string truncated to 10 characters | **>= 128 bits of CSPRNG entropy per code** before human-safe Crockford Base32 encoding. | Prevents entropy loss from naive truncation. Ensures each single-use code resists offline brute-force cracking if database is dumped. | `AUTHENTICATION_DESIGN.md`<br>`SECURITY_THREAT_MODEL.md`<br>`TEST_MATRIX.md`<br>`M1_SPIKE_PLAN.md` |
| **7** | **Legacy Claim Validity (ADR-039)** | 90-day hardcoded claim code validity | **30-day default validity** with operator reissue capability. | Limits operational window of unredeemed claim tokens while providing operators tooling to reissue expired tokens on demand. | `AUTHENTICATION_DESIGN.md`<br>`DATA_MIGRATION_DESIGN.md`<br>`TEST_MATRIX.md` |
| **8** | **Option A Zero-Leakage Invariant** | General guideline to avoid exposing synthetic email | **Strict Hard-Fail Invariant**: If synthetic email appears in browser session, JWT, API, React state, storage, or network, Option A fails. | Eliminates cosmetic workarounds. Enforces that synthetic identity is strictly an internal engine bridge. | `AUTHENTICATION_DESIGN.md`<br>`SECURITY_THREAT_MODEL.md`<br>`M1_SPIKE_PLAN.md` |
| **9** | **Option B Fallback Definition** | Described as automatic runtime failover | **Architectural fallback evaluated before product implementation continues**. | Option B is an architectural pivot evaluated at M1 spike time against supported Supabase mechanisms (custom JWTs, signing keys, etc.), not a live production failover. | `AUTHENTICATION_DESIGN.md`<br>`M1_SPIKE_PLAN.md`<br>`DECISIONS.md` |
| **10**| **CSRF Defense-in-Depth** | Relied primarily on `X-Requested-With` header | **4-Tier Defense-in-Depth**: SameSite cookies, Origin/Referer validation, anti-CSRF tokens, CORS & Content-Type enforcement. | Eliminates single-point-of-failure vulnerabilities in browser header handling. | `AUTHENTICATION_DESIGN.md`<br>`SECURITY_THREAT_MODEL.md` |
| **11**| **Table Catalog Consistency** | Approximate count of 26 tables; phantom workflow tables | **Exactly 25 permanent target tables + 2 migration tracking tables (27 total)**; unified `workflow_definitions`. | Reconciled `migration_id_mappings` into explicit tracking tables; replaced phantom `workflow_stages` and `workflow_outcomes` with single structured table. | `TARGET_SCHEMA.md`<br>`GATE_03_ARCHITECTURE.md`<br>`LEGACY_TABLE_MAPPING.md` |
| **12**| **M1 Foundation Scope** | 6 baseline tables without workflow proof | **7 foundational baseline tables** (adding `workflow_definitions`). | Proves database-backed canonical workflow retrieval during M1 foundation spike without adding domain tables. | `M1_SPIKE_PLAN.md`<br>`README.md`<br>`IMPLEMENTATION_PLAN.md` |

---

## 4. Final Authentication Architecture

### Credential Model
* **Username:** Required, canonicalized (lowercase, trimmed, alphanumeric + underscores, 3–30 characters).
* **Password:** Required, minimum 10 characters, zxcvbn score >= 2.
* **Email:** Completely optional. Used purely for optional user notifications if provided; never required for authentication.
* **Phone:** Completely optional.
* **Legacy Numeric PINs:** Permanently retired. No PIN values or PIN hashes are migrated or accepted as passwords.

### Auth Option A Architecture (Provisional Subject to M1 Spike)
JobQuest 2.0 adopts **Option A** on a provisional basis, subject to verification in the M1 Spike:
1. **Node Auth Façade on Vercel (`/api/auth/*`):** Receives username + password. Looks up `user_accounts` by normalized username.
2. **Synthetic Identity Bridge:** Maps public username to an internal deterministic or random UUID alias: `id_<uuid>@auth.jobquest.internal`.
3. **Supabase GoTrue Integration:** The Façade interfaces with Supabase Auth admin APIs using `SUPABASE_SERVICE_ROLE_KEY` to authenticate the user and obtain native session credentials.
4. **Session Transport:** Returned session tokens are set in `Secure`, `HttpOnly`, `SameSite=Lax` cookies. The browser never receives raw service-role keys or synthetic email strings.
5. **Native RLS Resolution:** Browser requests to Supabase PostgREST include the access token, resolving `auth.uid()` natively in PostgreSQL RLS policies.

### Zero Identity Leakage Requirement (Hard-Fail Invariant)
The internal synthetic identity is strictly an internal implementation bridge. If `@auth.jobquest.internal` appears anywhere accessible to the browser or user, including:
* Supabase session user object (`supabase.auth.getUser()`)
* Decoded JWT claims (`sub`, `email`, user metadata)
* Node API JSON payloads
* React component state or context
* Browser `localStorage`, `sessionStorage`, or cookies
* Client-side console or debug logs
* Browser-visible network request/response headers or bodies

**The "zero identity leakage" requirement FAILS immediately.** This failure triggers immediate termination of Option A and activation of Option B.

### Option B Architectural Fallback
If Option A fails the M1 acceptance spike:
* Product development stops immediately.
* Architecture pivots to **Option B** before product implementation proceeds.
* At evaluation time, the team evaluates currently supported Supabase mechanisms:
  * Externally minted RS256/EdDSA JWTs signed by the Node backend.
  * Imported asymmetric signing keys in Supabase project settings.
  * Native PostgREST/RLS compatibility using custom access token injection via `supabase-js`.
* Option B is an **architectural fallback**, not an automatic production runtime failover.

---

## 5. Final Target Database Architecture

### Entity Count Summary
* **Permanent Target Tables:** Exactly **25 tables**.
* **Migration & Audit Tracking Tables:** Exactly **2 tables** (`migration_batches`, `migration_id_mappings`).
* **Total Database Tables:** **27 tables**.
* **M1 Foundational Baseline Tables:** Exactly **7 tables**.

### Primary Key & Identifier Strategy (ADR-031 Approved)
* **Canonical Primary Keys:** All permanent target tables use **UUIDv4 (`gen_random_uuid()`)** primary keys.
* **Supabase / PostgreSQL Support:** Leverages PostgreSQL's native `gen_random_uuid()` without requiring external extensions.
* **Legacy Traceability:** Tables absorbing legacy records retain a nullable `legacy_id INTEGER` column alongside the dedicated `migration_id_mappings` table for audit reconciliation.

### Workspace & Multi-Tenancy Strategy
* **Schema-Level Partitioning:** Every domain table is partitioned by `workspace_id UUID NOT NULL REFERENCES public.workspaces(workspace_id)`.
* **Roles:** Workspace access is governed by `public.workspace_members` with roles `USER` (standard member) and `MANAGER` (administrator).
* **Composite Tenant Integrity (ADR-032):** Parent tables enforce compound unique keys `(id, workspace_id)`, and child tables enforce composite foreign keys `FOREIGN KEY (parent_id, workspace_id) REFERENCES parent_table(id, workspace_id) ON DELETE CASCADE/RESTRICT` where they materially prevent cross-workspace references.

---

## 6. Complete Target Table Catalog

| # | Table Name | Purpose | PK | Workspace Scope | Owner Scope | RLS Classification | Write Path | Legacy Source | Retention / Archive Behavior |
| :-: | :--- | :--- | :---: | :---: | :---: | :--- | :--- | :--- | :--- |
| **1** | `user_accounts` | Username mapping & security metadata | `user_id` (UUIDv4) | Global | Self (`auth.uid()`) | `SYSTEM / SECURITY` | Node Façade | `users` (split) | Permanent; soft-lock on security lockout |
| **2** | `profiles` | User preferences, theme, timezone | `profile_id` (UUIDv4) | Global | Self (`auth.uid()`) | `OWNER PRIVATE` | Direct Supabase | `users`, UI prefs | Permanent; soft-archive on account delete |
| **3** | `auth_recovery_codes`| 10 single-use recovery code verifiers | `code_id` (UUIDv4) | Global | Self (`auth.uid()`) | `SYSTEM / SECURITY` | Node Façade | New (CR-007) | Deleted/invalidated on bulk regeneration |
| **4** | `legacy_claim_codes` | 30-day tokens for legacy account claim | `claim_id` (UUIDv4) | Global | Unauthenticated / Operator | `SYSTEM / SECURITY` | Node Façade | New (CR-007) | Expired after 30 days; retained for audit |
| **5** | `workspaces` | Multi-tenant workspace entities | `workspace_id` (UUIDv4) | Self | Member / Manager | `WORKSPACE SHARED` | Database RPC | New (CR-008) | Permanent; soft-archive flag |
| **6** | `workspace_members` | Tenant membership & role bindings | `membership_id` (UUIDv4)| Compound | Member / Manager | `WORKSPACE SHARED` | Database RPC | New (CR-008) | Deleted on member removal (access revoked) |
| **7** | `workflow_definitions`| Canonical stages, outcomes, transitions | `workflow_id` (UUIDv4)| System / Workspace| Read: Member; Write: Manager | `DERIVED / READ ONLY`| Database RPC | New (CR-009) | Seeded defaults; immutable active versions |
| **8** | `companies` | Deduplicated company reference data | `company_id` (UUIDv4) | Workspace | Workspace Shared | `WORKSPACE SHARED` | Direct Supabase | `applications` (split)| Retained while referenced by applications |
| **9** | `job_snapshots` | Immutable job posting captures | `snapshot_id` (UUIDv4)| Workspace | Inherited Application Owner | `OWNER SCOPED / MGR OVERRIDE`| Direct / Node | `applications` (split)| Immutable; retained with application |
| **10**| `applications` | Core application tracking entities | `application_id` (UUIDv4)| Workspace | Owner Scoped (`user_id`) | `OWNER SCOPED / MGR OVERRIDE`| Direct Supabase / RPC| `applications` | Soft-archived; hard delete requires "DELETE" |
| **11**| `application_events` | Append-only lifecycle event log | `event_id` (UUIDv4) | Workspace | Owner Scoped (`actor_id`)| `OWNER SCOPED / MGR OVERRIDE`| Database RPC | `activities`, `stage_history`| Strictly immutable; never deleted |
| **12**| `interviews` | Interview rounds & feedback notes | `interview_id` (UUIDv4)| Workspace | Owner Scoped (App Owner) | `OWNER SCOPED / MGR OVERRIDE`| Direct Supabase / RPC| `interviews` | Retained with parent application |
| **13**| `contacts` | Networking contacts & recruiters | `contact_id` (UUIDv4) | Workspace | Owner Scoped (`user_id`) | `OWNER SCOPED / MGR OVERRIDE`| Direct Supabase | `networking_contacts` | Soft-delete flag; retained for history |
| **14**| `contact_interactions`| Interaction history with contacts | `interaction_id` (UUIDv4)| Workspace| Owner Scoped (`user_id`) | `OWNER SCOPED / MGR OVERRIDE`| Direct Supabase | `follow_ups` (notes) | Retained with parent contact |
| **15**| `tasks` | Unified tasks, reminders, follow-ups | `task_id` (UUIDv4) | Workspace | Owner Scoped (`user_id`) | `OWNER SCOPED / MGR OVERRIDE`| Direct Supabase | `tasks`, `reminders` | Completed tasks archived per user setting |
| **16**| `habits` | Habit definitions & streak tracking | `habit_id` (UUIDv4) | Workspace | Owner Scoped (`user_id`) | `OWNER SCOPED / MGR OVERRIDE`| Direct Supabase | `habits` | Active / inactive soft toggle |
| **17**| `habit_logs` | Daily habit completion records | `log_id` (UUIDv4) | Workspace | Owner Scoped (`user_id`) | `OWNER SCOPED / MGR OVERRIDE`| Direct Supabase | `habit_logs` | Append-only historical log |
| **18**| `goals` | Daily/weekly targets & calculations | `goal_id` (UUIDv4) | Workspace | Owner Scoped (`user_id`) | `OWNER SCOPED / MGR OVERRIDE`| Direct Supabase | `daily_goals`, `weekly_goals`| Historical periods retained for analytics |
| **19**| `journal_entries` | Coaching notes & career reflections | `journal_id` (UUIDv4) | Workspace | Owner Scoped (`user_id`) | `OWNER SCOPED / MGR OVERRIDE`| Direct Supabase | `notes` | Soft-delete; manager access audited |
| **20**| `resumes` | Master resumes & career profiles | `resume_id` (UUIDv4) | Workspace | Owner Scoped (`user_id`) | `OWNER SCOPED / MGR OVERRIDE`| Direct / Node | `resumes` | Retained; storage blobs soft-deleted |
| **21**| `resume_versions` | Job-tailored resume variations | `version_id` (UUIDv4) | Workspace | Owner Scoped (`user_id`) | `OWNER SCOPED / MGR OVERRIDE`| Direct / Node | `resume_history` | Retained linked to application/resume |
| **22**| `tags` | Workspace categorization labels | `tag_id` (UUIDv4) | Workspace | Workspace Shared | `WORKSPACE SHARED` | Direct Supabase | `tags`, `reminder_categories`| Soft-delete; cascade unlinks associations |
| **23**| `application_tags` | Many-to-many application tag links | Composite `(app_id, tag_id)`| Workspace | Inherited Application Owner | `OWNER SCOPED / MGR OVERRIDE`| Direct Supabase | `application_tags` | Deleted on tag disassociation |
| **24**| `saved_views` | Custom table & board view filters | `view_id` (UUIDv4) | Workspace | Owner Scoped (`user_id`) | `OWNER SCOPED / MGR OVERRIDE`| Direct Supabase | `saved_views` | Personal views retained per user |
| **25**| `extension_tokens` | Browser extension scoped API tokens | `token_id` (UUIDv4) | Workspace | Owner Scoped (`user_id`) | `OWNER SCOPED / MGR OVERRIDE`| Node Façade | `extension_tokens` | Revoked on user action; retained for audit |
| **26**| `migration_batches` | Staging batch run metadata | `batch_id` (UUIDv4) | System | System Administrator | `SYSTEM / SECURITY` | Node Façade | Migration Tooling | Audit record of migration execution |
| **27**| `migration_id_mappings`| Legacy-to-target ID cross-walk | `mapping_id` (UUIDv4)| System | System Administrator | `SYSTEM / SECURITY` | Node Façade | Migration Tooling | Permanent reconciliation cross-walk |

---

## 7. Verified Legacy 33-Table Mapping

All 33 tables from JobQuest 1.0 (verified from migrations `001_jobsearch.sql` through `013_extension_tokens.sql`) are accounted for with zero data loss:

* **16 Kept & Modified:** `applications`, `interviews`, `networking_contacts` (as `contacts`), `import_batches`, `import_rows`, `audit_log` (as `audit_events`), `resumes`, `tags`, `application_tags`, `tasks`, `habits`, `habit_logs`, `notes` (as `journal_entries`), `extension_tokens`, `companies`, `job_snapshots`. Upgraded to UUIDv4 and workspace tenancy.
* **2 Split:**
  * `users` $\rightarrow$ split into `user_accounts` + `profiles` + `workspaces` + `workspace_members`. PIN hashes strictly discarded.
  * `applications` $\rightarrow$ split into `applications` (dynamic pipeline state) + `job_snapshots` (immutable job descriptions).
* **11 Merged:**
  * `activities`, `timeline_events`, `stage_history` $\rightarrow$ merged into `application_events`.
  * `follow_ups`, `reminders`, `checklist_items` $\rightarrow$ merged into `tasks`.
  * `daily_goals`, `weekly_goals`, `goal_settings`, `goal_snapshots` $\rightarrow$ merged into `goals`.
  * `resume_history` $\rightarrow$ merged into `resume_versions`.
* **4 Replaced & Retired:**
  * `sessions` $\rightarrow$ replaced by Supabase Auth session engine.
  * `rejections` $\rightarrow$ retired in favor of decoupled `outcome = 'REJECTED'`.
  * `reminder_categories` $\rightarrow$ merged into `tags`.
  * `dashboard_preferences`, `application_view_preferences`, `export_preferences` $\rightarrow$ serialized into `profiles.ui_preferences`.

The authoritative, detailed transformation specification is maintained in [`migration-upgrade/gate-03/LEGACY_TABLE_MAPPING.md`](LEGACY_TABLE_MAPPING.md).

---

## 8. Verified Legacy 13-Stage Mapping

Source code inspection of JobQuest 1.0 (`001_jobsearch.sql` line 22, `frontend/src/ui-utils.js` line 1, and `backend/src/service.js` line 3) established the exact 13 legacy stage strings. All 13 map deterministically into modern decoupled dimensions:

| # | Verified Legacy Value | Target Stage | Target State | Target Outcome | Closure Reason | Migration Event | Special Business Rule & Distinction |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `Saved` | `BOOKMARK` | `OPEN` | `NULL` | `NULL` | `CAPTURED` | Initial saved opportunity / bookmark. |
| **2** | `Preparing` | `BOOKMARK` | `OPEN` | `NULL` | `NULL` | `CREATED` | Application materials in preparation / draft. |
| **3** | `Applied` | `APPLIED` | `OPEN` | `NULL` | `NULL` | `APPLIED` | Application submitted; sets `applied_at` timestamp. |
| **4** | `Assessment` | `SCREENING` | `OPEN` | `NULL` | `NULL` | `STAGE_CHANGED` | Assessment sub-stage preserved in event payload. |
| **5** | `Recruiter Screen`| `SCREENING` | `OPEN` | `NULL` | `NULL` | `STAGE_CHANGED` | Initial screening call. |
| **6** | `Interview` | `INTERVIEWING` | `OPEN` | `NULL` | `NULL` | `STAGE_CHANGED` | Standard interview rounds. |
| **7** | `Final Interview` | `INTERVIEWING` | `OPEN` | `NULL` | `NULL` | `STAGE_CHANGED` | Final round / onsite interview. Sub-stage in event payload. |
| **8** | `Offer` | `OFFER` | `OPEN` | `NULL` | `NULL` | `STAGE_CHANGED` | Formal offer extended and under consideration. |
| **9** | `Accepted` | `OFFER` | `CLOSED` | `ACCEPTED` | `NULL` | `OUTCOME_CHANGED` | Terminal success state. |
| **10**| `Rejected` | Last Stage* | `CLOSED` | `REJECTED` | `NULL` | `OUTCOME_CHANGED` | Employer rejected candidate. *Stage preserved from stage history (default `APPLIED`). |
| **11**| `Withdrawn` | Last Stage* | `CLOSED` | `WITHDRAWN` | `CANDIDATE_WITHDREW`| `OUTCOME_CHANGED` | Candidate withdrew before offer. |
| **12**| `Ghosted` | Last Stage* | `CLOSED` | `GHOSTED` | `NULL` | `OUTCOME_CHANGED` | Employer ceased contact without formal rejection. |
| **13**| `Position Closed` | Last Stage* | `CLOSED` | `POSITION_CLOSED` | `NULL` | `OUTCOME_CHANGED` | Role cancelled or closed by employer. Distinct business event from candidate rejection. |

### Critical Distinction: Offer Declined vs. Position Closed
* `declined` was **NOT** an actual database stage in JobQuest 1.0 (it was a UX concept). In JobQuest 2.0, when a candidate declines an offer, it is recorded as **`outcome = 'WITHDRAWN'`** with structured **`closure_reason = 'OFFER_DECLINED'`** (displayed in UI as *"Offer declined"*).
* `Position Closed` **WAS** an actual legacy database stage. In JobQuest 2.0, it is recorded as **`outcome = 'POSITION_CLOSED'`**, representing role closure by the employer.

---

## 9. Final Stage / State / Outcome / Closure Model

JobQuest 2.0 completely replaces the overloaded legacy `status` column with a normalized 4-dimension state model:

1. **`stage` (Pipeline Position):**
   * Values: `BOOKMARK`, `APPLIED`, `SCREENING`, `INTERVIEWING`, `OFFER`, `ARCHIVED`.
   * Represents the active position of the opportunity in the candidate's hiring pipeline.
2. **`state` (Lifecycle Status):**
   * Values: `OPEN`, `CLOSED`.
   * Enforces pipeline boundary. An application is active in the funnel while `OPEN`, and concluded when `CLOSED`.
3. **`outcome` (Terminal Resolution):**
   * Values: `NULL` (while `state = 'OPEN'`), `ACCEPTED`, `REJECTED`, `WITHDRAWN`, `GHOSTED`, `POSITION_CLOSED`.
   * Represents why and how an application concluded.
4. **`closure_reason` (Structured Sub-Classification):**
   * Values: `NULL` (while `state = 'OPEN'`), `OFFER_DECLINED`, `COMPENSATION_MISMATCH`, `LOCATION_MISMATCH`, `COMPANY_CULTURE`, `ROLE_MISALIGNMENT`, `CANDIDATE_WITHDREW`, `OTHER`.
   * Enforces specific analytical categorizations (e.g., declining an offer requires `outcome = 'WITHDRAWN'` and `closure_reason = 'OFFER_DECLINED'`).

---

## 10. Application Event Architecture

All application lifecycle changes append an immutable record to `public.application_events`:
* **Append-Only Immutability:** Events are never updated or deleted. Database rules forbid `UPDATE` and `DELETE`.
* **Standard Envelope:**
  ```json
  {
    "event_id": "c7a82e9d-3e51-4fa3-b6d4-8d4a96fb5c21",
    "workspace_id": "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
    "application_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "actor_id": "e2d3c4b5-a6f7-4819-b0c1-d2e3f4a5b6c7",
    "event_type": "STAGE_CHANGED",
    "payload_version": 1,
    "payload": {
      "from_stage": "SCREENING",
      "to_stage": "INTERVIEWING",
      "transition_trigger": "INTERVIEW_SCHEDULED",
      "interview_id": "b8c9d0e1-f2a3-4b4c-9d5e-6f7a8b9c0d1e"
    },
    "created_at": "2026-09-24T12:00:00Z"
  }
  ```
* **Event Types:** `CAPTURED`, `CREATED`, `APPLIED`, `STAGE_CHANGED`, `OUTCOME_CHANGED`, `NEXT_ACTION_CHANGED`, `KEEP_ACTIVE`, `INTERVIEW_SCHEDULED`, `INTERVIEW_COMPLETED`, `NOTE_ADDED`, `ARCHIVED`, `RESTORED`.
* **Funnel Analytics Independence:** Historical funnel calculations use event sourcing ("ever reached" a stage) from `application_events`. Current pipeline counts use the indexed `stage` column on `applications`.
* **Telemetry Projection (`last_activity_at`):** Transactional RPC operations atomically update `applications.last_activity_at = NOW()` whenever lifecycle events occur. Trivial text edits do not generate event noise.

---

## 11. Aging & Inactivity Architecture

* **15–30 Days (Stale Band):** Visual aging indicator appears on application table rows and Kanban cards. Non-blocking; purely informational.
* **31+ Days (Long Waiting Review Queue):** Application surfaces in the actionable "Review quiet applications" dashboard queue.
* **Actionable Review Choices:**
  1. `Keep Active`: Executes `rpc_keep_application_active`. Atomically updates `last_activity_at = NOW()` and appends a `KEEP_ACTIVE` event. Removes application from review queue immediately. Does NOT alter stage or outcome.
  2. `Mark Ghosted`: Executes `rpc_set_application_outcome` with `outcome = 'GHOSTED'`. Closes application (`state = 'CLOSED'`).
  3. `Archive`: Executes `rpc_archive_application`. Soft-archives record.
* **Zero Automatic State Mutations:** Applications are **never** automatically ghosted, archived, or closed by background timers. All state changes require explicit user action.

---

## 12. Workspace & Membership Architecture

* **Multi-Workspace Tenancy:** Users belong to multiple workspaces with independent roles (`USER` vs. `MANAGER`).
* **Active Workspace Context:** The active workspace is purely a client-side UX state / filter, never an authorization source. PostgreSQL RLS policies independently evaluate caller membership via `is_workspace_member(workspace_id)` on every query.
* **USER Role Scope:** Standard members have access to permitted **own** records only within shared workspaces.
* **MANAGER Role Scope:** Managers possess workspace-wide oversight across applications, tasks, and coaching journals inside managed workspaces. Managers have zero cross-workspace privileges.
* **Last Manager Protection (ADR-036):** Database trigger `trg_protect_last_manager` prohibits removing or demoting the final manager in any workspace.
* **Durable Member Removal (ADR-037):** Removing a member deletes only their `workspace_members` record. Historical records retain the member's `user_id` attribution with `ON DELETE RESTRICT` constraints.

---

## 13. Final RLS Classification

| Classification Tier | Behavioral Invariant | Target Tables |
| :--- | :--- | :--- |
| **SYSTEM / SECURITY** | Inaccessible to standard PostgREST; Node Façade with service role only. | `user_accounts`, `auth_recovery_codes`, `legacy_claim_codes`, `audit_events`, `migration_batches`, `migration_id_mappings` |
| **OWNER PRIVATE** | Strictly accessible only to record owner (`user_id = auth.uid()`). Inaccessible to peers and managers. | `profiles` |
| **OWNER SCOPED / MGR OVERRIDE** | Member sees permitted own records; Manager sees all records in managed workspace; cross-user manager access audited. No peer-to-peer visibility. | `applications`, `job_snapshots`, `interviews`, `contacts`, `contact_interactions`, `tasks`, `habits`, `habit_logs`, `goals`, `journal_entries`, `resumes`, `resume_versions`, `application_tags`, `saved_views`, `extension_tokens` |
| **WORKSPACE SHARED** | Visible to all verified workspace members. Write permissions governed by role. Non-private reference data. | `workspaces`, `workspace_members`, `companies`, `tags` |
| **DERIVED / READ ONLY** | Read-only to workspace members; mutated only via administrative RPCs. | `workflow_definitions` |

---

## 14. Access Boundary Contract (Direct Supabase / RPC / Node Façade)

JobQuest 2.0 enforces a strict three-tier client-to-database access boundary:

```
[ FRONTEND CLIENT ]
         |
         +---> (1) Direct Supabase PostgREST ---> High-frequency reads, simple CRUD under RLS
         |
         +---> (2) Database RPCs -------------> Multi-table atomic domain operations & state changes
         |
         +---> (3) Node.js Façade (/api/*) -----> Privileged auth, recovery, extension, CSV batching
```

* **Direct Supabase (`supabase-js`):** Permitted for high-frequency reads, filtering, pagination, and low-risk CRUD operations (updating note content, editing contact names, completing tasks) where RLS provides complete security.
* **Database RPCs (`supabase.rpc`):** Required for multi-table atomic domain mutations where state transitions, event log appending, telemetry updating, and audit emission must execute inside a single ACID transaction.
* **Node.js Façade (`/api/*` on Vercel):** Required for privileged operations involving service-role credentials, rate limiting, external network requests, document binary parsing, extension token validation, and batch migration runs.

---

## 15. RPC / Atomic Domain Operations Catalog

| Stored Procedure | Purpose | Authorization | Tables Modified | Events / Audits Emitted | Transaction Scope |
| :--- | :--- | :--- | :--- | :--- | :---: |
| `rpc_move_application_stage` | Advance or adjust application stage | Owner or Workspace Manager | `applications` (`stage`, `last_activity_at`) | `STAGE_CHANGED`; manager audit if cross-user | Single ACID transaction |
| `rpc_set_application_outcome`| Conclude application with outcome | Owner or Workspace Manager | `applications` (`state = 'CLOSED'`, `outcome`, `closure_reason`, `closed_at`, `last_activity_at`) | `OUTCOME_CHANGED` | Single ACID transaction |
| `rpc_keep_application_active`| Reset aging timer in Long Waiting queue | Owner or Workspace Manager | `applications` (`last_activity_at = NOW()`) | `KEEP_ACTIVE` | Single ACID transaction |
| `rpc_record_interview_outcome`| Record interview notes & optional stage advance | Owner or Workspace Manager | `interviews`, `applications` | `INTERVIEW_COMPLETED`, optional `STAGE_CHANGED` | Single ACID transaction |
| `rpc_archive_application` | Soft-archive application | Owner or Workspace Manager | `applications` (`archived_at = NOW()`, `state = 'CLOSED'`) | `ARCHIVED` | Single ACID transaction |
| `rpc_restore_application` | Restore soft-archived application | Owner or Workspace Manager | `applications` (`archived_at = NULL`, `state = 'OPEN'`) | `RESTORED` | Single ACID transaction |
| `rpc_remove_workspace_member` | Revoke member access while retaining history | Workspace Manager | `workspace_members` (Deleted) | `member.removed` audit event; Last Manager trigger validated | Single ACID transaction |
| `rpc_change_member_role` | Promote/demote member (`USER` $\leftrightarrow$ `MANAGER`) | Workspace Manager | `workspace_members` (`role`) | `member.role_changed` audit; Last Manager trigger validated | Single ACID transaction |

---

## 16. Recovery Architecture (ADR-038 Approved)

* **10 Single-Use Codes:** Generated upon account registration.
* **Entropy Specification:** Each code is generated with **>= 128 bits of cryptographically secure random entropy** (CSPRNG) prior to human-safe Crockford Base32 encoding (`xxxx-xxxx-xxxx-xxxx`).
* **Storage Security:** Raw codes are displayed to the user exactly once. The database stores only salted **Argon2id** hashes in `public.auth_recovery_codes`.
* **Redemption Lifecycle:** Entering a valid recovery code permits immediate password reset. The used code is marked `is_used = TRUE` and cannot be redeemed again.
* **Bulk Invalidation:** Generating a new set of recovery codes immediately deletes/invalidates all prior unused codes.
* **Brute-Force Lockout:** 3 consecutive failed recovery attempts trigger a 1-hour account lockout. Session revocation is enforced upon recovery.

---

## 17. Legacy Account Claim Architecture (ADR-039 Approved)

* **Zero PIN Reuse:** Legacy numeric PINs and PIN hashes are permanently discarded.
* **Staged Identity:** Migrated legacy accounts are initialized in `user_accounts` with `status = 'STAGED'`.
* **Claim Token Specification:** Operators issue high-entropy 48-character tokens (`jqc_live_...`) with **default validity = 30 days**. Operators have tooling to reissue replacement tokens if expired.
* **Token Storage:** Stored as deterministic SHA-256 hashes in `public.legacy_claim_codes`.
* **Redemption Flow:** Legacy user opens claim link, validates token, and establishes a modern username and strong password. Upon redemption, the claim token is marked `claimed_at = NOW()`, and account status transitions to `ACTIVE`.

---

## 18. Browser Extension Authentication (ADR-040 Approved)

* **Dedicated API Tokens:** Extension captures authenticate via high-entropy tokens (`jqe_live_<40 hex chars>`). Normal passwords and session cookies are never exposed to the extension.
* **Storage & Scope:** Stored as SHA-256 hashes in `public.extension_tokens`. Strictly scoped to job bookmarking and capture endpoints (`/api/ext/v1/*`).
* **Binding & Expiration:** Bound to a specific `(user_id, workspace_id)` pair. Supports configurable expiration (default 180 days).
* **Revocation Controls:** Users can inspect active extension pairings and revoke tokens on demand in Settings.

---

## 19. Audit Architecture

* **Append-Only Audit Log:** Stored in `public.audit_events`. RLS strictly forbids `UPDATE` and `DELETE` for all roles including managers.
* **Audited Operations:**
  * Manager cross-user reads or updates to applications, contacts, or journal entries.
  * Workspace member role changes and member removals.
  * Permanent hard deletion of archived applications.
  * Full workspace CSV/JSON data exports.
  * Extension token creation and revocation.
  * Account recovery executions and legacy account claims.
* **Zero Secret Leakage:** Audit payloads (`JSONB`) are strictly sanitized to ensure password hashes, recovery codes, claim tokens, and encryption keys never enter the audit log.

---

## 20. Migration Architecture (OQ-012 Resolution)

* **Engine Transition:** Neon PostgreSQL (JobQuest 1.0) $\rightarrow$ Supabase PostgreSQL (JobQuest 2.0).
* **Tenant Isolation (`"JobQuest (Migrated)"`):** All 33 legacy tables are extracted and loaded into a dedicated system team workspace named `"JobQuest (Migrated)"`.
* **Attribution & Relationship Integrity:** Original legacy user IDs, creation timestamps, interview notes, and activity histories are preserved. Migrated users receive `USER` roles in `"JobQuest (Migrated)"` and the primary legacy administrator receives `MANAGER`. Each user also receives an independent personal workspace for new work.
* **10-Phase Idempotent Runner:** Migration executes in 10 transactional batches tracked in `migration_batches` and `migration_id_mappings`. Rerunning a failed batch safely skips existing records without corrupting foreign keys.
* **Reconciliation Gates:** Migration runner executes automated parity checks requiring 100% row count match, 0 orphaned foreign keys, 0 unmapped stages, and 0 legacy PIN values before cutover sign-off.
* **Non-Execution Status:** **Zero data migration has occurred during Gate 03.**

---

## 21. Security Architecture & Threat Model

The comprehensive threat model (`SECURITY_THREAT_MODEL.md`) analyzes 18 attack vectors under the STRIDE methodology:
* **Authentication Defense:** Uniform timing responses to prevent username enumeration; sliding window rate limiting (5 attempts / 15 min); Argon2id hashing; >=128-bit entropy recovery codes.
* **Session & Cookie Hardening:** 4-tier CSRF defense-in-depth model: (1) `Secure`, `HttpOnly`, `SameSite=Lax/Strict` session cookies; (2) Strict `Origin` and `Referer` header validation in Node middleware; (3) Anti-CSRF token verification on state-changing API endpoints; (4) Strict CORS allowlist and `application/json` Content-Type enforcement.
* **Authorization & RLS Integrity:** Engine-enforced composite foreign keys `(id, workspace_id)` prevent cross-workspace tampering; helper functions `is_workspace_member()` and `is_workspace_manager()` enforce tenant boundaries on every query; strict peer isolation across all Tier-3 activity tables.
* **Credential Isolation:** `SUPABASE_SERVICE_ROLE_KEY` is confined strictly to server-side Node runtimes and never bundled into client or extension distributions.

---

## 22. Milestone 1 (M1) Foundation Scope

The M1 Spike is a targeted architectural proof-of-concept. It does NOT implement product features, full UI, or data migration.

### Exact Foundational Baseline Schema (7 Tables):
1. `public.user_accounts` (Username mapping, lockout metadata; no password hashes)
2. `public.profiles` (User preferences, theme, timezone)
3. `public.auth_recovery_codes` (10 single-use recovery code hashes, >=128 bits entropy each)
4. `public.workspaces` (Personal and team workspace entities)
5. `public.workspace_members` (Tenant membership and `USER` / `MANAGER` roles)
6. `public.applications` (Minimal core table for RLS CRUD and peer isolation proof)
7. `public.workflow_definitions` (Canonical pipeline stages, outcomes, and transitions)

### M1 Proof Objectives:
1. Prove Auth Option A username/password login layered over Supabase Auth.
2. Verify zero synthetic email leakage across all browser contexts.
3. Validate native `auth.uid()` binding under Postgres RLS.
4. Validate personal workspace auto-provisioning and `USER` / `MANAGER` role enforcement.
5. Validate session cookie lifecycle, silent token rotation, and global logout.
6. Validate canonical workflow retrieval from `workflow_definitions`.
7. Validate direct browser PostgREST CRUD under RLS.
8. Deploy minimal test harness to a Vercel preview connected to a dedicated dev Supabase project.

---

## 23. M1 Pass / Fail Criteria

### Mandatory Pass Conditions:
* All 12 test conditions in [`M1_SPIKE_PLAN.md`](M1_SPIKE_PLAN.md) §3 yield explicit **PASS** status.
* `@auth.jobquest.internal` is completely absent from browser inspection.
* Native `auth.uid()` correctly filters applications under RLS.
* Canonical workflow definition is successfully retrieved by client.

### Hard-Fail Termination Conditions for Option A:
If any of the following occur during M1:
1. Synthetic identity leaks to browser session user object, JWT, API, React state, storage, or network.
2. Supabase GoTrue dispatches outbound emails to synthetic addresses.
3. Native `auth.uid()` fails to authenticate under PostgreSQL RLS.
4. Direct RLS-protected PostgREST cannot operate safely.

### Option B Activation Protocol:
* Stop product implementation immediately.
* Pivot architectural decision to Option B before continuing.
* Evaluate currently supported Supabase mechanisms (custom JWTs, imported keys, etc.) and select the safest supported pattern.

---

## 24. Final ADR Status Registry

| ADR | Topic | Previous Status | Final Status | Approved Architectural Notes |
| :--- | :--- | :---: | :---: | :--- |
| **ADR-030** | Auth Option A Layered Supabase Auth | `PROPOSED` | **APPROVED WITH CONDITION** | Provisionally approved subject to M1 spike. Hard-fail on synthetic identity leak triggers Option B architectural fallback. |
| **ADR-031** | Primary Key Strategy | `PROPOSED` (UUIDv7) | **APPROVED (DECISION CHANGED)** | **UUIDv4 (`gen_random_uuid()`)** approved across all 25 permanent tables. Previous UUIDv7 proposal marked **SUPERSEDED**. |
| **ADR-032** | Cross-Workspace Integrity | `PROPOSED` | **APPROVED** | Composite foreign keys `(id, workspace_id)` enforced where they materially prevent tenant leakage. |
| **ADR-033** | Decoupled Application State | `PROPOSED` | **APPROVED** | 4-dimension state model (`stage`, `state`, `outcome`, `closure_reason`). Verified 13 legacy stages from source code. |
| **ADR-034** | Inactivity & Aging Telemetry | `PROPOSED` | **APPROVED** | Persisted `last_activity_at` column updated atomically via events; `rpc_keep_application_active` reset; zero auto mutations. |
| **ADR-035** | Append-Only Application Events | `PROPOSED` | **APPROVED** | Immutable event sourcing powering historical funnel analytics independently of current pipeline state. |
| **ADR-036** | Last Manager Protection | `PROPOSED` | **APPROVED** | Database trigger `trg_protect_last_manager` prevents removing or demoting final workspace manager. |
| **ADR-037** | Durable Member Removal | `PROPOSED` | **APPROVED** | Removing member revokes access via `workspace_members` delete; historical records retain attribution (`ON DELETE RESTRICT`). |
| **ADR-038** | Emergency Recovery Codes | `PROPOSED` | **APPROVED WITH CORRECTION** | 10 single-use codes with **>= 128 bits CSPRNG entropy** per code before Crockford Base32 encoding; Argon2id hashes. |
| **ADR-039** | Legacy Account Claim Architecture| `PROPOSED` | **APPROVED WITH CORRECTION** | **30-day default validity** (reduced from 90d) with operator reissue capability; total PIN retirement. |
| **ADR-040** | Extension API Tokens | `PROPOSED` | **APPROVED** | Scoped, workspace-bound API tokens stored as SHA-256 hashes; user revocation in Settings. |
| **ADR-041** | Legacy Data Workspace (OQ-012) | `PROPOSED` | **APPROVED** | Dedicated `"JobQuest (Migrated)"` system workspace preserves legacy links, attribution, and multi-user history. |
| **ADR-042** | Client-to-Database Boundary | `PROPOSED` | **APPROVED** | 3-tier boundary: Direct PostgREST (reads/CRUD), Database RPCs (domain operations), Node Façade (auth/secrets). |

---

## 25. Open Questions Status

Only genuine, non-blocking questions remain open:
* **OQ-011: Supabase Auth Option A vs. Option B:** Status is **PENDING M1 SPIKE**. Purpose of M1 is explicitly to prove Option A or activate Option B fallback.
* **OQ-016: Production Supabase / Vercel Plan Tiers:** Status is **PENDING PRE-PRODUCTION**. Free/dev tiers sufficient for development; Pro tier requirements evaluated prior to production launch.
* **OQ-021: Production Smoke-Test Account Provisioning:** Status is **PENDING PRE-PRODUCTION**. Dedicated smoke test user in isolated test workspace created during pre-production hardening.

All other open questions (OQ-001 through OQ-010, OQ-012 through OQ-015, OQ-017 through OQ-020, and OQ-022 through OQ-024) are fully **RESOLVED**.

---

## 26. Deferred Work Items

The following work items are intentionally excluded from Gate 03 and M1:
* **Full 33-Table Schema Implementation:** Deferred to milestone development.
* **Production Data Migration:** Deferred to Milestone 19.
* **Chrome Extension Rewrite:** Deferred to Milestone 3.
* **Full UI Component Implementation:** Direction D screens deferred to milestone development.
* **Realtime Subscriptions:** Deferred post-MVP.

---

## 27. Supabase / Vercel Next-Step Boundary

### Non-Execution Confirmation:
* No Supabase login occurred.
* No Supabase project was created.
* No `supabase init` occurred.
* No `supabase link` occurred.
* No Vercel login occurred.
* No Vercel project was linked.
* No production or development cloud infrastructure was provisioned.

### Approved Next-Phase Sequence:
1. Formally record Gate 03 approval.
2. Commit Gate 03 documentation on `docs/gate-03-db-auth-rls`.
3. Merge `docs/gate-03-db-auth-rls` into `development`.
4. Create fresh feature branch from `development`: `feature/m1-foundation-auth-spike`.
5. User logs into dedicated **NEW** Supabase account (`npx supabase login`).
6. Create **NEW** Development Supabase project (`jobquest-dev`).
7. Run local CLI initialization and link to development project (`npx supabase init`, `npx supabase link`).
8. User logs into dedicated **NEW** Vercel account (`npx vercel login`).
9. Link local directory to **NEW** Development Vercel project (`npx vercel link`).
10. Execute the M1 architecture spike in accordance with [`migration-upgrade/gate-03/M1_SPIKE_PLAN.md`](M1_SPIKE_PLAN.md).

---

## 28. Files Created / Modified During Gate 03 Finalization

### Gate 03 Architectural Specifications (Modified / Synchronized):
* `migration-upgrade/gate-03/GATE_03_ARCHITECTURE.md`
* `migration-upgrade/gate-03/TARGET_SCHEMA.md`
* `migration-upgrade/gate-03/AUTHENTICATION_DESIGN.md`
* `migration-upgrade/gate-03/AUTHORIZATION_RLS_DESIGN.md`
* `migration-upgrade/gate-03/RPC_DOMAIN_OPERATIONS.md`
* `migration-upgrade/gate-03/DATA_MIGRATION_DESIGN.md`
* `migration-upgrade/gate-03/LEGACY_TABLE_MAPPING.md`
* `migration-upgrade/gate-03/SECURITY_THREAT_MODEL.md`
* `migration-upgrade/gate-03/TEST_MATRIX.md`
* `migration-upgrade/gate-03/M1_SPIKE_PLAN.md`
* `migration-upgrade/gate-03/GATE_03_DECISIONS.md`
* `migration-upgrade/gate-03/README.md`

### Master Project Tracking Documents (Synchronized):
* `migration-upgrade/DECISIONS.md`
* `migration-upgrade/CHANGE_REQUESTS.md`
* `migration-upgrade/OPEN_QUESTIONS.md`
* `migration-upgrade/MIGRATION_MAPPING.md`
* `migration-upgrade/docs/PRD.md`
* `migration-upgrade/docs/TRD.md`
* `migration-upgrade/docs/BACKEND_SCHEMA.md`
* `migration-upgrade/docs/IMPLEMENTATION_PLAN.md`
* `migration-upgrade/docs/APP_FLOW.md`

### Deliverable Reports (Created):
* `migration-upgrade/gate-03/GATE_03_FINAL_APPROVAL_REPORT.md` (This document)
* `migration-upgrade/gate-03/NEXT_AGENT_HANDOFF.md` (Standalone resumption guide)

---

## 29. Git Status Summary

* **Branch:** `docs/gate-03-db-auth-rls`
* **Parent Branch:** `development` (contains commit `11850e2` Gate 02B approval)
* **Status:** Changes prepared for review and commit. No rebase, reset, or force push performed.

---

## 30. Final Gate Result

**GATE 03 — APPROVED**

All required corrections have been executed, verified, and reconciled across all repository documents.

**NEXT PHASE:**  
**M1 Foundation / Authentication Architecture Spike**  
*(Execution will begin only on a new feature branch following user instructions).*

---

## Next Agent Handoff

A standalone continuation guide has been created at:  
**[`migration-upgrade/gate-03/NEXT_AGENT_HANDOFF.md`](NEXT_AGENT_HANDOFF.md)**

This file serves as the definitive starting point for the next Claude Code, Antigravity, Codex, or equivalent coding-agent session, enabling seamless continuation without relying on agent chat history.
