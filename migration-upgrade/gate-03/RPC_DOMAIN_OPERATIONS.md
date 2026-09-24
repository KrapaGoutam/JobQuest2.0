# JOBQUEST 2.0 — RPC, DOMAIN OPERATIONS & API BOUNDARY SPECIFICATION
**Document ID:** `JQ2-GATE03-OPS-001`  
**Gate:** `Gate 03 — Database + Authentication + Authorization/RLS Design`  
**Status:** `PROPOSED`  
**Related Documents:** [TARGET_SCHEMA.md](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/gate-03/TARGET_SCHEMA.md), [AUTHORIZATION_RLS_DESIGN.md](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/gate-03/AUTHORIZATION_RLS_DESIGN.md), [GATE_03_ARCHITECTURE.md](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/gate-03/GATE_03_ARCHITECTURE.md)

---

## 1. Executive Architecture: Client Routing & Boundaries

JobQuest 2.0 employs a strict, disciplined three-tier access boundary to balance developer velocity, low database latency, and uncompromising security.

```
                      +---------------------------------------+
                      |   JOBQUEST 2.0 FRONTEND (React SPA)   |
                      +-------------------+-------------------+
                                          |
        +---------------------------------+---------------------------------+
        |                                 |                                 |
        v (1) Direct PostgREST            v (2) Database RPC                v (3) Node.js Façade
+-----------------------+      +-----------------------+      +-----------------------+
|  DIRECT SUPABASE SDK  |      |   POSTGRES RPCs       |      |   VERCEL SERVERLESS   |
| (supabase-js)         |      | (supabase.rpc(...))   |      | (/api/*)              |
+-----------+-----------+      +-----------+-----------+      +-----------+-----------+
            |                              |                              |
            | Low-latency queries          | Atomic domain mutations      | Privileged / External
            | Simple CRUD under RLS        | Multi-table invariants       | Auth / Tokens / Files
            v                              v                              v
+-------------------------------------------------------------------------------------+
|                              SUPABASE POSTGRESQL ENGINE                             |
+-------------------------------------------------------------------------------------+
```

### Access Tier Guidelines:
1. **Direct Supabase (`supabase-js`):**
   * **Permitted for:** High-frequency, single-table reads, filtering, pagination, and simple low-risk user updates (e.g., updating a note body, editing a contact name, checking off a checklist item).
   * **Enforcement:** Enforced 100% by PostgreSQL Row Level Security (RLS) via `auth.uid()`.
2. **Database RPC (`supabase.rpc(...)`):**
   * **Permitted for:** Multi-table atomic domain operations where invariants, state transitions, event appending, and audit logging must execute within a single ACID transaction.
   * **Enforcement:** RLS check inside `SECURITY DEFINER` function with explicit user membership validation.
3. **Node.js Façade (`/api/*` on Vercel):**
   * **Required for:** Privileged authentication (login, registration, recovery), external third-party API integration, document binary parsing/OCR, file uploads/storage orchestration, batch CSV migration runs, and extension token validation.
   * **Enforcement:** Explicit application-level auth, service-role credential encapsulation, rate limiting middleware.

---

## 2. Application State Model (Decoupled Stage, Outcome, Action)

Legacy JobQuest 1.0 merged pipeline stage, terminal status, and rejection reasons into a single overloaded 13-value `status` column. JobQuest 2.0 adopts a **fully decoupled 4-dimension state model**:

```
+-----------------------------------------------------------------------------------+
| APPLICATION STATE ARCHITECTURE                                                    |
+-----------------------------------------------------------------------------------+
| 1. STAGE (Pipeline Location)                                                      |
|    - BOOKMARK, APPLIED, SCREENING, INTERVIEWING, OFFER, ARCHIVED                  |
+-----------------------------------------------------------------------------------+
| 2. STATE (Lifecycle Horizon)                                                      |
|    - OPEN (Active in pipeline)                                                    |
|    - CLOSED (Concluded / Inactive)                                                |
+-----------------------------------------------------------------------------------+
| 3. OUTCOME (Terminal Result - NULL while OPEN)                                    |
|    - ACCEPTED, REJECTED, WITHDRAWN, GHOSTED, POSITION_CLOSED                      |
+-----------------------------------------------------------------------------------+
| 4. CLOSURE REASON (Structured Sub-Classification - NULL while OPEN)               |
|    - OFFER_DECLINED (Required when OUTCOME = 'WITHDRAWN' following an Offer)      |
|    - COMPENSATION_MISMATCH, LOCATION_MISMATCH, COMPANY_CULTURE, GHOSTED_POST_INT  |
+-----------------------------------------------------------------------------------+
```

---

## 3. Application Event Engine (Append-Only Event Sourcing)

Every mutation to an application appends an immutable event to `public.application_events`. This ensures full historical auditability, unlocks historical funnel analytics, and guarantees data integrity.

### Event Schema & Envelope:
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

### Supported Event Types:
* `CAPTURED`: Extension or web manual bookmark capture.
* `CREATED`: Application record initialized.
* `APPLIED`: Application submitted to employer.
* `STAGE_CHANGED`: Transition between pipeline stages.
* `OUTCOME_CHANGED`: Outcome declared (Offer Accepted, Rejected, Withdrawn).
* `NEXT_ACTION_CHANGED`: Next follow-up or task deadline set/modified.
* `KEEP_ACTIVE`: Explicit user reset of aging inactivity timer.
* `INTERVIEW_SCHEDULED`: New interview booked.
* `INTERVIEW_COMPLETED`: Interview conducted; feedback logged.
* `NOTE_ADDED`: Qualitative commentary attached.
* `ARCHIVED` / `RESTORED`: Soft-delete or restoration from archive.

---

## 4. Inactivity & Aging Telemetry (`last_activity_at`)

### Architectural Resolution: STORED Column Maintained Atomically
* **Decision:** `applications.last_activity_at` is a **persisted `TIMESTAMPTZ` column** on the `applications` table, backed by a compound index `CREATE INDEX idx_apps_aging ON applications(workspace_id, state, last_activity_at)`.
* **Rationale:** Deriving `MAX(created_at)` from `application_events` on every page load would cause unacceptable `O(N)` aggregate scan overhead across hundreds of applications.
* **Update Trigger Rules:** `last_activity_at` is updated automatically whenever:
  1. A stage or outcome changes.
  2. An interview or task is created or completed.
  3. A note or interaction is appended.
  4. The user clicks **"Keep Active"** in the Long Waiting review queue.

---

## 5. Atomic Domain Operations Catalog (RPC Stored Procedures)

The following stored procedures are executed inside explicit transactions (`BEGIN ... COMMIT`) to guarantee atomicity:

### 1. `rpc_move_application_stage`
* **Purpose:** Transitions an application to a new pipeline stage.
* **Input Parameters:** `(p_application_id UUID, p_to_stage VARCHAR, p_note TEXT DEFAULT NULL)`
* **Authorization:** Caller must own the application or hold `MANAGER` role in that workspace.
* **Tables Modified:** `applications` (`stage = p_to_stage`, `last_activity_at = NOW()`).
* **Events Emitted:** `STAGE_CHANGED`.
* **Audit Emitted:** If performed by a `MANAGER` on another member's record, writes `app.stage_moved` to `audit_events`.

### 2. `rpc_set_application_outcome`
* **Purpose:** Concludes an application with a terminal outcome and optional closure reason.
* **Input Parameters:** `(p_application_id UUID, p_outcome VARCHAR, p_closure_reason VARCHAR DEFAULT NULL, p_note TEXT DEFAULT NULL)`
* **Authorization:** Owner or Manager.
* **Validation:** 
  * If `p_outcome = 'WITHDRAWN'` and previous stage was `OFFER`, `p_closure_reason` MUST equal `'OFFER_DECLINED'`.
  * `state` automatically transitions to `'CLOSED'`.
* **Tables Modified:** `applications` (`state = 'CLOSED'`, `outcome = p_outcome`, `closure_reason = p_closure_reason`, `closed_at = NOW()`, `last_activity_at = NOW()`).
* **Events Emitted:** `OUTCOME_CHANGED`.

### 3. `rpc_keep_application_active`
* **Purpose:** Explicitly acknowledges an application in the 31+ day Long Waiting review queue without altering its stage.
* **Input Parameters:** `(p_application_id UUID)`
* **Authorization:** Owner or Manager.
* **Execution:**
  * Resets `applications.last_activity_at = NOW()`.
  * Emits event `KEEP_ACTIVE` with `{ "previous_last_activity": OLD.last_activity_at }`.
  * Immediately removes application from the 31+ day review queue.

### 4. `rpc_record_interview_outcome`
* **Purpose:** Records interview completion notes, rating, and optionally advances stage.
* **Input Parameters:** `(p_interview_id UUID, p_outcome VARCHAR, p_feedback TEXT, p_advance_stage_to VARCHAR DEFAULT NULL)`
* **Authorization:** Owner or Manager.
* **Execution (Single Transaction):**
  1. Updates `interviews` (`outcome = p_outcome`, `feedback_notes = p_feedback`, `completed_at = NOW()`).
  2. If `p_advance_stage_to` is provided, updates parent `applications.stage = p_advance_stage_to`.
  3. Appends `INTERVIEW_COMPLETED` event.
  4. Touches `applications.last_activity_at = NOW()`.

### 5. `rpc_archive_application` & `rpc_restore_application`
* **Purpose:** Archive-first soft deletion and restoration.
* **Input Parameters:** `(p_application_id UUID, p_reason VARCHAR DEFAULT NULL)`
* **Authorization:** Owner or Manager.
* **Execution:** Sets `applications.archived_at = NOW()` (or `NULL` on restore), updates `state`, and appends `ARCHIVED` or `RESTORED` event.

### 6. `rpc_remove_workspace_member`
* **Purpose:** Revokes member workspace access while preserving all historical records.
* **Input Parameters:** `(p_workspace_id UUID, p_target_user_id UUID)`
* **Authorization:** `MANAGER` in `p_workspace_id`.
* **Guards:** Verified by `check_last_manager_protection` trigger.
* **Execution:**
  1. Deletes record from `public.workspace_members`.
  2. Emits security audit record: `member.removed`.
  3. Does NOT delete or nullify any records in `applications`, `tasks`, or `events`.

---

## 6. Definitive Access Routing Contract

| Entity / Action | Direct Supabase | Database RPC | Node Façade | Technical Rationale |
| :--- | :---: | :---: | :---: | :--- |
| **User Login & Registration** | No | No | **YES** | Rate limiting, password hashing, synthetic email mapping |
| **Recovery Code Reset** | No | No | **YES** | Multi-step hash matching, session revocation, security audit |
| **Legacy Claim Code Redemption**| No | No | **YES** | PIN retirement, token hash match, user migration |
| **Extension Capture** | No | No | **YES** | Token verification, HTML parsing, company deduplication |
| **Applications List / Filter** | **YES** | No | No | Fast PostgREST queries, client-side pagination under RLS |
| **Application Detail View** | **YES** | No | No | Direct joined relations under RLS |
| **Move Stage / Set Outcome** | No | **YES** | No | Atomic multi-table updates + event log + aging reset |
| **Keep Active (Aging Reset)** | No | **YES** | No | Atomic timestamp touch + event log |
| **Interview Completion** | No | **YES** | No | Atomic interview record + optional stage advance |
| **Contacts & Interactions CRUD** | **YES** | No | No | Owner-scoped PostgREST CRUD under RLS (Manager override) |
| **Companies CRUD** | **YES** | No | No | Shared reference workspace table under RLS (non-private) |
| **Notes / Checklist Check** | **YES** | No | No | Low-risk atomic single-table writes under RLS |
| **Member Role Change / Removal**| No | **YES** | No | Last Manager protection + audit log entry |
| **Bulk CSV Import / Export** | No | No | **YES** | Stream parsing, memory buffering, manager-only gate |
| **Resume File Upload** | No | No | **YES** | Supabase Storage signed URL generation + text extraction |

---

## 7. Legacy 80+ API Classification & Replacement Strategy

All 80+ legacy endpoints from JobQuest 1.0 are categorized below into their modern target implementation tier:

| Legacy Endpoint Group | Count | Modern Target Classification | Target Replacement Mechanism |
| :--- | :---: | :--- | :--- |
| `/api/auth/*` (PIN login, session) | 6 | **NODE FAÇADE** | Modern username/password façade (`/api/auth/*`) |
| `/api/applications` (CRUD, list) | 12 | **DIRECT SUPABASE** | Native PostgREST queries with RLS filters |
| `/api/applications/:id/status` | 4 | **DATABASE RPC** | `rpc_move_application_stage`, `rpc_set_application_outcome` |
| `/api/interviews/*` | 8 | **DIRECT SUPABASE + RPC** | Read via PostgREST; complete via `rpc_record_interview_outcome` |
| `/api/contacts/*` & `/api/companies/*` | 14 | **DIRECT SUPABASE** | PostgREST CRUD on collaborative workspace tables |
| `/api/tasks/*` & `/api/follow-ups/*` | 10 | **DIRECT SUPABASE** | Consolidated `tasks` table via PostgREST |
| `/api/habits/*` & `/api/daily-goals/*` | 8 | **DIRECT SUPABASE** | Direct PostgREST on `habits`, `habit_logs`, `goals` |
| `/api/notes/*` | 6 | **DIRECT SUPABASE** | Direct PostgREST on `notes` / `journal_entries` |
| `/api/extension/*` | 5 | **NODE FAÇADE** | Revocable token authentication + job capture endpoint |
| `/api/import-export/*` | 7 | **NODE FAÇADE** | Streaming Node parser with workspace validation |
| Legacy PIN endpoints | 4 | **RETIRED** | Permanently eliminated (PIN is retired) |
