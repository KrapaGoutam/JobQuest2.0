# JOBQUEST 2.0 — GATE 03 ARCHITECTURAL DECISION RECORDS (ADRs)
**Document ID:** `JQ2-GATE03-DEC-001`  
**Gate:** `Gate 03 — Database + Authentication + Authorization/RLS Design`  
**Status:** `APPROVED WITH REQUIRED CORRECTIONS (Final Gate 03 Review)`  
**Related Documents:** [GATE_03_ARCHITECTURE.md](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/gate-03/GATE_03_ARCHITECTURE.md), [TARGET_SCHEMA.md](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/gate-03/TARGET_SCHEMA.md), [AUTHENTICATION_DESIGN.md](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/gate-03/AUTHENTICATION_DESIGN.md), [AUTHORIZATION_RLS_DESIGN.md](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/gate-03/AUTHORIZATION_RLS_DESIGN.md)

---

## 1. Summary of Gate 03 Decisions

The following 13 Architectural Decision Records (ADR-030 through ADR-042) codify the technical architecture, security model, and data structures approved during Gate 03. All items have been updated to reflect the final user review decisions and corrections.

| ADR ID | Decision Title | Previous Status | Final Status | Primary Document Reference |
| :--- | :--- | :---: | :---: | :--- |
| **ADR-030** | Authentication Architecture: Option A Layered Supabase Auth | `PROPOSED` | **APPROVED WITH CONDITION** (Provisional subject to M1 Spike) | `AUTHENTICATION_DESIGN.md` §2–3 |
| **ADR-031** | Primary Key Strategy: UUIDv4 (`gen_random_uuid()`) | `PROPOSED` (UUIDv7) | **APPROVED (DECISION CHANGED)** (UUIDv7 marked SUPERSEDED) | `TARGET_SCHEMA.md` §2 |
| **ADR-032** | Cross-Workspace Integrity: Engine-Level Composite Foreign Keys | `PROPOSED` | **APPROVED** | `GATE_03_ARCHITECTURE.md` §4 |
| **ADR-033** | Decoupled Application State, Outcome & Closure Reason Architecture | `PROPOSED` | **APPROVED** (13 legacy stages verified) | `RPC_DOMAIN_OPERATIONS.md` §2 |
| **ADR-034** | Inactivity & Aging Telemetry: Stored Atomic `last_activity_at` | `PROPOSED` | **APPROVED** | `RPC_DOMAIN_OPERATIONS.md` §4 |
| **ADR-035** | Append-Only Application Event Sourcing Architecture | `PROPOSED` | **APPROVED** | `RPC_DOMAIN_OPERATIONS.md` §3 |
| **ADR-036** | Last Manager Protection Invariant via Database Trigger | `PROPOSED` | **APPROVED** | `AUTHORIZATION_RLS_DESIGN.md` §6 |
| **ADR-037** | Durable Member Removal & Historical Record Attribution | `PROPOSED` | **APPROVED** | `AUTHORIZATION_RLS_DESIGN.md` §5 |
| **ADR-038** | Emergency Recovery Architecture: 10 Single-Use Hashed Codes | `PROPOSED` | **APPROVED WITH CORRECTION** (>=128-bit CSPRNG entropy) | `AUTHENTICATION_DESIGN.md` §6 |
| **ADR-039** | Legacy Account Claim Architecture & Total PIN Retirement | `PROPOSED` | **APPROVED WITH CORRECTION** (30-day default expiry) | `AUTHENTICATION_DESIGN.md` §7 |
| **ADR-040** | Browser Extension Token Authentication & SHA-256 Storage | `PROPOSED` | **APPROVED** | `AUTHENTICATION_DESIGN.md` §8 |
| **ADR-041** | Legacy Data Workspace Assignment (Resolution of OQ-012) | `PROPOSED` | **APPROVED** (Dedicated "JobQuest (Migrated)") | `DATA_MIGRATION_DESIGN.md` §2 |
| **ADR-042** | Client-to-Database Access Boundary Contract (Direct vs RPC vs Node) | `PROPOSED` | **APPROVED** | `RPC_DOMAIN_OPERATIONS.md` §1, §6 |

---

## 2. Detailed Architectural Decision Records

### ADR-030: Authentication Architecture: Option A Layered Supabase Auth (Provisional)
* **Status:** `APPROVED WITH CONDITION (PROVISIONALLY APPROVED SUBJECT TO M1 SPIKE)`
* **Context:** JobQuest 2.0 requires pure username/password authentication (email optional, phone optional) while leveraging Supabase's native session infrastructure, token refreshing, and Postgres RLS `auth.uid()`.
* **Decision:** Provisionally adopt **Option A**: A Node.js Auth Façade on Vercel maps public usernames to internal synthetic identities (`id_<uuid>@auth.jobquest.internal`) in `auth.users`. Synthetic emails are strictly an internal implementation detail.
* **Hard-Fail Leakage Invariant:** If the internal/synthetic Supabase email or identity appears anywhere accessible to the browser or user (including Supabase session user object, JWT claims, API payload, React state, local/session storage, debug logs, or browser-visible network response), the "zero identity leakage" requirement **FAILS**. This immediately triggers rejection of Option A.
* **Option B Fallback Architecture:** Option B is an **architectural fallback** evaluated before product implementation continues (NOT an automatic runtime failover). At M1 fallback evaluation time, it evaluates currently supported Supabase mechanisms including externally minted JWTs, imported signing keys, third-party authentication integration, `supabase-js` `accessToken` injection, and native PostgREST/RLS compatibility to select the safest supported architecture.

### ADR-031: Primary Key Strategy: UUIDv4 (`gen_random_uuid()`)
* **Status:** `APPROVED (DECISION CHANGED — UUIDv7 proposal SUPERSEDED)`
* **Context:** Initial Gate 03 proposal suggested UUIDv7 for index ordering. Review established that standard UUIDv4 via PostgreSQL's native `gen_random_uuid()` offers mature support across PostgreSQL and Supabase, operational simplicity, maximum portability, and more than adequate performance for JobQuest scale without custom extension dependencies.
* **Decision:** Adopt **UUIDv4 (`gen_random_uuid()`)** as the canonical primary identifier standard across all 25 permanent target tables.
* **Historical Traceability:** The previous UUIDv7 proposal is marked **SUPERSEDED**. Legacy integer IDs are preserved separately in nullable `legacy_id INTEGER` columns and the centralized `migration_id_mappings` table for audit reconciliation.

### ADR-032: Cross-Workspace Integrity: Engine-Level Composite Foreign Keys
* **Status:** `APPROVED`
* **Context:** Multi-tenant applications require structural protection against cross-workspace reference leakage (e.g., Workspace A task referencing a Workspace B application).
* **Decision:** Keep composite tenant-integrity protection such as `(id, workspace_id)` compound keys and foreign keys where they materially prevent cross-workspace references. Do not add composite foreign keys mechanically where they provide no tenant-integrity benefit.

### ADR-033: Decoupled Application State, Outcome & Closure Reason Architecture
* **Status:** `APPROVED (13 Legacy Stages Verified from Source)`
* **Context:** Legacy JobQuest 1.0 overloaded 13 stages and outcomes into a single `status` column.
* **Decision:** Enforce a strict 4-dimension state model:
  1. `stage`: Pipeline location (`BOOKMARK`, `APPLIED`, `SCREENING`, `INTERVIEWING`, `OFFER`, `ARCHIVED`).
  2. `state`: Lifecycle status (`OPEN`, `CLOSED`).
  3. `outcome`: Terminal result (`ACCEPTED`, `REJECTED`, `WITHDRAWN`, `GHOSTED`, `POSITION_CLOSED`).
  4. `closure_reason`: Controlled nullable sub-classification.
* **Source-Verified Legacy Mapping:** Re-verified directly from JobQuest 1.0 source code (`001_jobsearch.sql` line 22, `ui-utils.js` line 1, `service.js` line 3). The exact 13 values are: `Saved`, `Preparing`, `Applied`, `Assessment`, `Recruiter Screen`, `Interview`, `Final Interview`, `Offer`, `Rejected`, `Withdrawn`, `Ghosted`, `Position Closed`, `Accepted`.
* **Offer Declined vs. Position Closed Distinction:**
  - `declined` was NOT an actual stage string in JobQuest 1.0. Modern candidate declined offer maps to `outcome = 'WITHDRAWN'` with structured `closure_reason = 'OFFER_DECLINED'`.
  - `Position Closed` WAS an actual legacy stage. It maps to `outcome = 'POSITION_CLOSED'`, representing role cancellation by employer.

### ADR-034: Inactivity & Aging Telemetry: Stored Atomic `last_activity_at`
* **Status:** `APPROVED`
* **Context:** Dashboard filtering requires fast grouping into aging bands (0–14 days Active, 15–30 days Stale, 31+ days Long Waiting review queue).
* **Decision:** Store `last_activity_at TIMESTAMPTZ NOT NULL` directly on `applications`, backed by index `idx_apps_aging (workspace_id, state, last_activity_at)`. Atomic RPCs update the timestamp on meaningful interactions, and `rpc_keep_application_active` atomically touches the timestamp and appends a `KEEP_ACTIVE` event without altering stage or outcome. Zero automatic state mutations.

### ADR-035: Append-Only Application Event Sourcing Architecture
* **Status:** `APPROVED`
* **Context:** Funnel analytics require historical "ever reached" reporting rather than point-in-time snapshots.
* **Decision:** Model `public.application_events` as an append-only, immutable event log. Event payloads are stored in versioned JSONB objects (`payload_version: 1`). Current pipeline state remains stored directly on `applications`. Trivial text edits do not generate event noise.

### ADR-036: Last Manager Protection Invariant via Database Trigger
* **Status:** `APPROVED`
* **Context:** A workspace must never be orphaned without an active administrator holding the `MANAGER` role.
* **Decision:** Enforce Last Manager Protection at the database engine level via a `BEFORE DELETE OR UPDATE` trigger on `public.workspace_members`. The trigger raises exception `CANNOT_REMOVE_OR_DEMOTE_LAST_MANAGER` if a mutation would reduce the active manager count in a workspace to zero. Application/UI checks supplement but never replace the database trigger.

### ADR-037: Durable Member Removal & Historical Record Attribution
* **Status:** `APPROVED`
* **Context:** Removing a workspace member must instantly revoke access while preserving team history, application attribution, and audit records.
* **Decision:** Removing a member deletes exclusively their record from `public.workspace_members`. Foreign keys on `applications`, `tasks`, and `events` use `ON DELETE RESTRICT`. Historical records retain the former member's `user_id`. Managers maintain oversight and reassignment capability.

### ADR-038: Emergency Recovery Architecture: 10 Single-Use Hashed Codes
* **Status:** `APPROVED WITH CORRECTION`
* **Context:** JobQuest 2.0 supports optional email, precluding reliance on email-based password reset links.
* **Decision:** Generate 10 single-use recovery codes upon account registration. Each code must have `>= 128 bits` of cryptographically secure random entropy (CSPRNG) prior to human-safe Crockford Base32 encoding (never truncate 32 random bytes to a short code).
* **Security Controls:** Raw codes shown only once; stored only as salted Argon2id hashes; strictly single-use; regeneration invalidates all prior unused codes; account lockout after 3 failed redemption attempts; session revocation on recovery.

### ADR-039: Legacy Account Claim Architecture & Total PIN Retirement
* **Status:** `APPROVED WITH CORRECTION`
* **Context:** Legacy JobQuest 1.0 accounts were protected by 4-digit PINs, representing a severe security liability.
* **Decision:** Legacy PIN values and hashes are permanently eliminated and never migrated. Migrated users are initialized in `STAGED` status. Operators issue secure claim tokens with **default expiration = 30 days** (changed from 90 days), with operator capability to reissue replacement codes upon expiration. Redeeming a claim link requires establishing a modern username and strong password.

### ADR-040: Browser Extension Token Authentication & SHA-256 Storage
* **Status:** `APPROVED`
* **Context:** The Chrome Extension must capture jobs without storing the user's master password or requiring fragile browser session cookie scraping.
* **Decision:** Provision dedicated API tokens (`jqe_live_<40 hex chars>`) bound strictly to `(user_id, workspace_id)` and scoped to job capture. The database stores only the deterministic SHA-256 hash. Users can review active devices and revoke tokens at any time in Web Settings.

### ADR-041: Legacy Data Workspace Assignment (Resolution of OQ-012)
* **Status:** `APPROVED`
* **Context:** Open Question OQ-012 required determining the tenant destination for migrated legacy data.
* **Decision:** Resolve OQ-012 by creating a dedicated system workspace: **`"JobQuest (Migrated)"`**. All legacy users receive `USER` memberships (with the primary legacy administrator granted `MANAGER`). Each user is also provisioned a fresh personal workspace for new, isolated job tracking. Legacy owner attribution, relationships, and history are fully preserved.

### ADR-042: Client-to-Database Access Boundary Contract (Direct vs. RPC vs. Node)
* **Status:** `APPROVED`
* **Context:** Clear architectural boundaries are necessary to prevent business logic fragmentation across client, database, and serverless tiers.
* **Decision:** Adopt a strict 3-tier boundary contract:
  1. **Direct PostgREST (`supabase-js`):** Single-table reads, filtering, pagination, and low-risk CRUD governed by RLS.
  2. **Database RPCs (`supabase.rpc`):** Multi-table atomic domain operations (stage moves, outcomes, Keep Active, interview completions).
  3. **Node.js Façade (`/api/*` on Vercel):** Authentication, token verification, file binary parsing, batch migrations, and service-role operations.
