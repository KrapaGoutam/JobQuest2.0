# JOBQUEST 2.0 — TESTING MATRIX & VERIFICATION SPECIFICATION
**Document ID:** `JQ2-GATE03-TEST-001`  
**Gate:** `Gate 03 — Database + Authentication + Authorization/RLS Design`  
**Status:** `PROPOSED`  
**Related Documents:** [AUTHORIZATION_RLS_DESIGN.md](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/gate-03/AUTHORIZATION_RLS_DESIGN.md), [SECURITY_THREAT_MODEL.md](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/gate-03/SECURITY_THREAT_MODEL.md), [M1_SPIKE_PLAN.md](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/gate-03/M1_SPIKE_PLAN.md)

---

## 1. Testing Philosophy & Test Harness Architecture

JobQuest 2.0 employs a multi-layered verification strategy to guarantee data integrity, isolation, and security. Database tests execute against a real PostgreSQL/Supabase local instance using **pgTAP** (database-level unit testing) and **Vitest** (integration/API-level testing).

```
+-----------------------------------------------------------------------------------+
| LAYER 1: UNIT & SCHEMA INTEGRITY (pgTAP in PostgreSQL)                            |
| - Primary key UUIDv4 validity (gen_random_uuid())                                  |
| - Foreign key constraints, compound tenant keys, cascading rules                 |
| - Stored triggers (Last Manager protection, composite tenant checks)              |
+-----------------------------------------------------------------------------------+
| LAYER 2: ROW LEVEL SECURITY & AUTHORIZATION (Vitest + PostgREST Client)           |
| - Impersonated client queries as: Anon, Member (User), Manager, Ex-Member        |
| - Peer isolation for applications, contacts, interactions, snapshots, journals    |
| - Manager workspace-scoped oversight with audit logging for journal coaching      |
+-----------------------------------------------------------------------------------+
| LAYER 3: DOMAIN OPERATIONS & RPC ATOMICITY (Vitest Integration Suite)             |
| - Stage transitions, outcome setting, interview completions, Keep Active resets   |
| - Transaction rollback verification on partial failure                            |
| - Append-only application event sourcing consistency                              |
+-----------------------------------------------------------------------------------+
| LAYER 4: SECURITY & CREDENTIAL LIFECYCLE (Node Security Test Suite)               |
| - Password complexity, >=128-bit entropy recovery codes consumption & regen       |
| - Legacy claim code redemption (30-day default expiry) & PIN retirement           |
| - Extension token SHA-256 validation, workspace binding, and revocation           |
| - Auth Option A zero synthetic identity leakage verification (Hard-fail trigger)  |
+-----------------------------------------------------------------------------------+
| LAYER 5: MIGRATION RECONCILIATION & ANALYTICS PARITY                              |
| - 33-table source-to-target row count parity verification                         |
| - 13-stage legacy state decomposition validation (Saved to Accepted)             |
| - Current Pipeline vs Historical Funnel analytics consistency                     |
+-----------------------------------------------------------------------------------+
```

---

## 2. Core Test Suites & Detailed Test Scenarios

### Suite 1: Schema Constraints & Engine Integrity

| Test ID | Test Target | Action / Input | Expected Result | Tooling |
| :--- | :--- | :--- | :--- | :--- |
| **SCH-01** | Primary Keys | Insert records across all 25 permanent target tables | Verify primary key is valid UUIDv4 format (`gen_random_uuid()`) | pgTAP |
| **SCH-02** | Cross-Workspace Integrity | Insert task in Workspace A referencing application in Workspace B | **REJECTED**: Foreign key violation on `(id, workspace_id)` | pgTAP |
| **SCH-03** | Last Manager Protection | Attempt to delete or demote sole Manager in a workspace | **REJECTED**: Trigger `trg_protect_last_manager` raises exception | pgTAP |
| **SCH-04** | Unique Username | Register two users with clean usernames `john_doe` and `JOHN_DOE` | **REJECTED**: Unique constraint violation on `username_clean` | pgTAP |
| **SCH-05** | Immutable Audit Log | Attempt `UPDATE` or `DELETE` on `public.audit_events` | **REJECTED**: Permission denied by Postgres rule/trigger | pgTAP |

### Suite 2: Row Level Security (RLS) Matrix Verification

| Test ID | Impersonated Role | Target Query / Mutation | Expected Outcome | RLS Policy Under Test |
| :--- | :--- | :--- | :--- | :--- |
| **RLS-01** | Anonymous | `SELECT * FROM applications;` | **0 rows returned** | Anonymous deny-all policy |
| **RLS-02** | Member (User A) | `SELECT * FROM applications;` | Returns only records where `user_id = User_A` | `policy_applications_user_select` |
| **RLS-03** | Member (User A) | Query User B's application in same workspace | **0 rows returned** (Peer isolation) | `policy_applications_user_select` |
| **RLS-04** | Member (User A) | Query records in Workspace B (non-member) | **0 rows returned** (Workspace boundary) | `is_workspace_member()` = FALSE |
| **RLS-05** | Manager (User M) | Query User A's application in managed workspace | **Record returned** (Manager oversight) | `is_workspace_manager()` = TRUE |
| **RLS-06** | Manager (User M) | Query User A's journal entry in managed workspace | **Record returned** (Manager coaching access; audit event emitted) | `policy_journal_entries_manager_select` |
| **RLS-07** | Member (User A) | Query User B's contacts, contact interactions, or job snapshots | **0 rows returned** (Peer isolation across all Tier-3 tables) | `policy_contacts_user_select` |
| **RLS-08** | Ex-Member | Query applications after removal from workspace | **0 rows returned** (Immediate revocation) | `is_workspace_member()` = FALSE |
| **RLS-09** | Member (User A) | Attempt `INSERT` with `user_id = User_B` | **REJECTED**: RLS check violation | `user_id = auth.uid()` check |

### Suite 3: Domain RPCs & Event Sourcing Atomicity

| Test ID | Stored Procedure | Test Execution Scenario | Assertions |
| :--- | :--- | :--- | :--- |
| **RPC-01** | `rpc_move_application_stage` | Move application from `APPLIED` to `SCREENING` | 1. `applications.stage` updated.<br>2. `application_events` appends `STAGE_CHANGED`.<br>3. `applications.last_activity_at` touched.<br>4. Atomic commit. |
| **RPC-02** | `rpc_set_application_outcome` | Set outcome to `WITHDRAWN` following an offer | 1. If reason is missing, **FAIL validation**.<br>2. If reason is `OFFER_DECLINED`, **SUCCESS**.<br>3. `state` becomes `CLOSED`.<br>4. Appends `OUTCOME_CHANGED`. |
| **RPC-03** | `rpc_keep_application_active` | Invoke on application with 40-day inactivity | 1. `last_activity_at` resets to `NOW()`.<br>2. Appends `KEEP_ACTIVE` event.<br>3. Application removed from 31+ day Long Waiting review queue. |
| **RPC-04** | `rpc_record_interview_outcome` | Record interview feedback + stage advance to `OFFER` | 1. `interviews` updated.<br>2. `applications.stage` advanced to `OFFER`.<br>3. Appends `INTERVIEW_COMPLETED`.<br>4. Single ACID transaction. |
| **RPC-05** | `rpc_archive_application` | Soft-archive application | 1. `archived_at` set.<br>2. `state` set to `CLOSED`.<br>3. Appends `ARCHIVED` event.<br>4. Excluded from default active lists. |

### Suite 4: Security & Credentials Lifecycle

| Test ID | Feature | Execution Scenario | Pass Criteria |
| :--- | :--- | :--- | :--- |
| **SEC-01** | 10 Recovery Codes | Generate codes with >=128 bits entropy; redeem Code #3 | 1. Code #3 permits password reset.<br>2. Code #3 marked `is_used = TRUE`.<br>3. Re-submitting Code #3 fails.<br>4. Other 9 codes remain valid.<br>5. CSPRNG entropy >=128 bits verified. |
| **SEC-02** | Code Regeneration | User regenerates recovery codes from settings | 1. 10 new codes generated.<br>2. Previous 9 unused codes deleted/invalidated.<br>3. Security audit event logged. |
| **SEC-03** | Legacy Account Claim | Redeem 30-day default claim code with new password | 1. Legacy PIN is NOT accepted.<br>2. Modern credentials provisioned.<br>3. Claim code marked `claimed_at = NOW()`.<br>4. Operator can issue replacement code if expired. |
| **SEC-04** | Extension Auth | Call capture API with valid `jqe_live_...` token | 1. Token matched via SHA-256 hash.<br>2. Capture inserted into bound workspace.<br>3. `last_used_at` updated. |
| **SEC-05** | Extension Revocation | User revokes extension token in settings | 1. Token marked `revoked_at = NOW()`.<br>2. Next extension request returns 401 Unauthorized. |
| **SEC-06** | Rate Limiting Lockout | Send 6 rapid invalid password attempts | 1. 6th attempt returns 429 Too Many Requests.<br>2. Account locked for 15 minutes.<br>3. Security audit log entry created. |
| **SEC-07** | Zero Identity Leakage | Inspect session user object, JWT claims, network responses, React state, and browser storage | **0 instances of `@auth.jobquest.internal`**. If found, Option A **FAILS** and activates Option B fallback protocol. |

### Suite 5: Migration Reconciliation & Parity

| Test ID | Scope | Verification Execution | Success Threshold |
| :--- | :--- | :--- | :--- |
| **MIG-01** | Row Count Parity | Compare source Neon counts vs target Supabase | 100% exact match across all 33 legacy tables |
| **MIG-02** | Stage Decomposition | Verify all 13 verified legacy stages (`Saved` through `Accepted`) | 0 records with legacy status; 100% valid decoupled states. `Position Closed` maps to `POSITION_CLOSED`. |
| **MIG-03** | Declined Offer Parity | Verify legacy applications where candidate declined offer | 100% have `outcome = 'WITHDRAWN'` and `closure_reason = 'OFFER_DECLINED'` |
| **MIG-04** | PIN Elimination | Scan target database for legacy PIN values/hashes | **0 instances found** (Strict security invariant) |
| **MIG-05** | Tenant Isolation | Verify workspace assignment of migrated data | 100% of migrated records belong to `"JobQuest (Migrated)"` |
| **MIG-06** | Historical Funnel | Run funnel query on backfilled event sourcing | All reached stages accurately reflect historical lifecycle |

---

## 3. Test Automation & CI/CD Pipeline

* **Local Pre-Commit Hook:** Runs schema constraint validations and TypeScript types compilation.
* **Pull Request CI (GitHub Actions):**
  1. Spins up ephemeral Supabase local Postgres container (`supabase start`).
  2. Runs pgTAP test suite (`supabase test db`).
  3. Executes Vitest integration suite with full RLS matrix impersonation.
  4. Runs security linting (detecting service-role key leakage and raw SQL concatenation).
* **Pre-Migration Staging Run:**
  * Executes migration against sanitized legacy dataset and runs all Suite 5 verification queries before production execution.
