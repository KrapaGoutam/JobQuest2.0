# JOBQUEST 2.0 — AUTHORIZATION & ROW LEVEL SECURITY (RLS) DESIGN
**Document ID:** `JQ2-GATE03-AUTHZ-001`  
**Gate:** `Gate 03 — Database + Authentication + Authorization/RLS Design`  
**Status:** `APPROVED (Post-Review Corrections Applied)`  
**Related Documents:** [GATE_03_ARCHITECTURE.md](GATE_03_ARCHITECTURE.md), [TARGET_SCHEMA.md](TARGET_SCHEMA.md), [AUTHENTICATION_DESIGN.md](AUTHENTICATION_DESIGN.md)

---

## 1. Executive Summary & Authorization Philosophy

JobQuest 2.0 enforces a multi-workspace, multi-tenant security architecture directly within the PostgreSQL database using **Row Level Security (RLS)**.

### Core Authorization Principles:
1. **Active Workspace is UX Context, NOT Authority:** The UI displays an "active workspace" selector to filter views. However, the database engine **never** trusts client assertions of workspace identity. Every query and mutation validates genuine, active membership in `workspace_members`.
2. **Strict Dual-Role Model:**
   * **`USER`:** Allowed access to permitted **own** records within the active workspace. Cannot read other members' private applications, contacts, interactions, job snapshots, or journal entries.
   * **`MANAGER`:** Possesses workspace-wide governance: can view team members' applications, contacts, and journal entries, edit or archive records on behalf of members, manage workspace settings, view team analytics, and manage member roles.
   * **Scope Boundary:** A user's `MANAGER` role is strictly confined to the specific workspace where granted. Cross-workspace manager leakage is architecturally impossible.
3. **Auditability of Cross-User Mutations:** Whenever a `MANAGER` views, modifies, archives, or reassigns another user's record, a permanent record is created in `public.audit_events`.
4. **Ownership Decoupled from Current Membership:** Removing a user from a workspace revokes their access immediately, but their historical records, attribution, and event history remain intact.

---

## 2. Table RLS Classification Taxonomy

Every table in the target schema belongs to one of six security tiers:

| Security Tier | Definition | Example Tables |
| :--- | :--- | :--- |
| **Tier 1: OWNER PRIVATE** | Accessible strictly by the record owner. Even a Manager cannot manage these private security assets. | `extension_tokens`, `auth_recovery_codes` |
| **Tier 2: OWNER SCOPED / MANAGER OVERRIDE** | Owned by a specific user. Owner has full CRUD. `MANAGER` in the same workspace has read/write oversight (audited). | `applications`, `job_snapshots`, `contacts`, `contact_interactions`, `interviews`, `tasks`, `habits`, `journal_entries`, `goals`, `resumes` |
| **Tier 3: WORKSPACE SHARED** | Shared collaboratively across the workspace. Strictly restricted to non-private reference registries. | `companies`, `workflow_definitions` (read) |
| **Tier 4: MANAGER ONLY** | Accessible exclusively to users holding `MANAGER` role in that workspace. Standard `USER` members cannot view or edit. | `workspace_members` (write/invite), `workflow_definitions` (edit) |
| **Tier 5: SYSTEM / SECURITY** | Never accessible directly by browser PostgREST. Read/write strictly through trusted Node backend or migration scripts. | `user_accounts`, `legacy_claim_codes`, `migration_batches`, `migration_id_mappings` |
| **Tier 6: DERIVED / READ ONLY** | System default workflow presets or static system configurations. | `workflow_definitions` (where `is_default = TRUE`) |

---

## 3. Database Security Helper Functions

To maintain high performance and prevent recursive RLS queries, authorization logic is encapsulated in small, highly optimized `SECURITY DEFINER` functions in PostgreSQL:

```sql
-- 1. Verify authenticated user is an active member of the target workspace
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.workspace_members
    WHERE workspace_id = ws_id 
      AND user_id = auth.uid()
  );
$$;

-- 2. Verify authenticated user holds MANAGER role in the target workspace
CREATE OR REPLACE FUNCTION public.is_workspace_manager(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.workspace_members
    WHERE workspace_id = ws_id 
      AND user_id = auth.uid() 
      AND role = 'MANAGER'
  );
$$;

-- 3. Verify user is either owner OR manager in the workspace
CREATE OR REPLACE FUNCTION public.can_access_owned_record(ws_id UUID, record_owner_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    -- User owns the record and belongs to the workspace
    (record_owner_id = auth.uid() AND public.is_workspace_member(ws_id))
    OR
    -- User is a manager in that workspace
    public.is_workspace_manager(ws_id)
  );
$$;
```

---

## 4. Complete RLS Policy Matrix (25 Production + 2 Migration Tables)

The following matrix specifies the exact policy rules across all target tables:

| # | Table Name | Classification | Anon | USER Policy | MANAGER Policy | Trusted Node / Service Role |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `user_accounts` | SYSTEM / SECURITY | DENY | DENY direct PostgREST (Managed via Auth API) | DENY | ALL (Internal Node Façade only) |
| 2 | `profiles` | OWNER SCOPED / CO-MEMBER | DENY | SELECT: Own or co-members; UPDATE: Own (`id = auth.uid()`) | Same as USER | ALL |
| 3 | `auth_recovery_codes` | OWNER PRIVATE / SEC | DENY | DENY direct PostgREST; RPC verification only | DENY | ALL |
| 4 | `legacy_claim_codes` | SYSTEM / SECURITY | DENY | DENY direct PostgREST; RPC verification only | DENY | ALL |
| 5 | `workspaces` | WORKSPACE SHARED | DENY | SELECT: If member; UPDATE/DELETE: DENY | SELECT: If member; UPDATE: If manager | ALL |
| 6 | `workspace_members` | MANAGER ONLY (Write) | DENY | SELECT: If member in workspace; INSERT/UPDATE/DELETE: DENY | SELECT: If member; INSERT/UPDATE/DELETE: If manager | ALL |
| 7 | `workspace_invitations`| MANAGER ONLY | DENY | DENY direct SELECT; Token lookup via RPC | SELECT/INSERT/DELETE: If manager in workspace | ALL |
| 8 | `companies` | WORKSPACE SHARED | DENY | SELECT: Workspace members; INSERT/UPDATE: Workspace members | SELECT/INSERT/UPDATE/ARCHIVE: Workspace members | ALL |
| 9 | `applications` | OWNER / MGR OVERRIDE | DENY | SELECT/UPDATE: Own records; INSERT: Own (`user_id = auth.uid()`) | SELECT/UPDATE: Any member in workspace; INSERT: Any member | ALL |
| 10 | `job_snapshots` | OWNER / MGR OVERRIDE | DENY | SELECT: Own app snapshot; INSERT: Own app snapshot | SELECT/INSERT/UPDATE: Any app snapshot in workspace | ALL |
| 11 | `application_events` | OWNER / MGR OVERRIDE | DENY | SELECT: Own app events; INSERT: Own app events (append-only) | SELECT: Any app in workspace; INSERT: Any app (append-only) | ALL |
| 12 | `interviews` | OWNER / MGR OVERRIDE | DENY | SELECT/UPDATE: Own app interviews; INSERT: Own interviews | SELECT/UPDATE: Any interview in workspace | ALL |
| 13 | `contacts` | OWNER / MGR OVERRIDE | DENY | SELECT/UPDATE: Own contacts; INSERT: Own contacts | SELECT/UPDATE: Any contact in workspace | ALL |
| 14 | `contact_interactions` | OWNER / MGR OVERRIDE | DENY | SELECT/UPDATE: Own interactions; INSERT: Own interactions | SELECT/UPDATE: Any interaction in workspace | ALL |
| 15 | `application_contacts` | OWNER / MGR OVERRIDE | DENY | SELECT/UPDATE: Own application links; INSERT: Own links | SELECT/UPDATE: Any application link in workspace | ALL |
| 16 | `tasks` | OWNER / MGR OVERRIDE | DENY | SELECT/UPDATE: Own tasks; INSERT: Own tasks | SELECT/UPDATE: Any task in workspace; INSERT: Any task | ALL |
| 17 | `habits` | OWNER / MGR OVERRIDE | DENY | SELECT/INSERT/UPDATE: Own habits (`user_id = auth.uid()`) | SELECT: Workspace members (coaching); UPDATE: Own only | ALL |
| 18 | `habit_logs` | OWNER / MGR OVERRIDE | DENY | SELECT/INSERT/UPDATE: Own habit logs | SELECT: Workspace members (coaching); UPDATE: Own only | ALL |
| 19 | `journal_entries` | OWNER / MGR OVERRIDE | DENY | SELECT/INSERT/UPDATE/DELETE: Own entries (`user_id = auth.uid()`) | SELECT/UPDATE: Any entry in managed workspace (Audited) | ALL |
| 20 | `goals` | OWNER / MGR OVERRIDE | DENY | SELECT/INSERT/UPDATE: Own goals | SELECT: Workspace members; UPDATE: Own only | ALL |
| 21 | `resumes` | OWNER / MGR OVERRIDE | DENY | SELECT/INSERT/UPDATE: Own resumes | SELECT/UPDATE: Any resume in workspace | ALL |
| 22 | `application_documents`| OWNER / MGR OVERRIDE | DENY | SELECT/INSERT/UPDATE: Own app docs | SELECT/INSERT/UPDATE: Any app in workspace | ALL |
| 23 | `workflow_definitions` | WORKSPACE SHARED | DENY | SELECT: Workspace members | SELECT: Workspace members; UPDATE: If manager | ALL |
| 24 | `extension_tokens` | OWNER PRIVATE | DENY | SELECT: Own tokens; UPDATE (Revoke): Own tokens | **DENY** (Managers cannot manage other members' tokens) | ALL |
| 25 | `audit_events` | SYSTEM / MGR READ | DENY | SELECT: Own events only (`actor_id = auth.uid()`) | SELECT: All workspace audit events; INSERT: DENY (append via RPC/Node) | ALL |
| 26 | `migration_batches` | SYSTEM / SECURITY | DENY | DENY direct PostgREST | DENY direct PostgREST (Node Migration runner only) | ALL |
| 27 | `migration_id_mappings`| SYSTEM / SECURITY | DENY | DENY direct PostgREST | DENY direct PostgREST (Node Migration runner only) | ALL |

---

## 5. Member Removal & Durable Ownership Lifecycle

A fundamental flaw of basic tenancy designs is cascading deletions or nullifying foreign keys when a team member departs. JobQuest 2.0 implements **Durable Historical Attribution**:

```
+-----------------------------------------------------------------------------------+
| 1. MEMBER REMOVAL EVENT                                                           |
| Manager calls RPC: remove_workspace_member(target_user_id, workspace_id)          |
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 2. IMMEDIATE ACCESS REVOCATION                                                    |
| DELETE FROM public.workspace_members                                              |
| WHERE workspace_id = $ws_id AND user_id = $target_user_id                         |
| -> auth.uid() no longer satisfies is_workspace_member(ws_id)                     |
| -> All subsequent queries by target_user_id to this workspace return EMPTY / 403  |
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 3. DURABLE RECORD PRESERVATION                                                    |
| - Foreign keys on applications, tasks, interviews: ON DELETE RESTRICT             |
| - applications.user_id REMAINS pointing to target_user_id                         |
| - Historical events and notes retain target_user_id attribution                   |
| - Workspace MANAGER retains oversight and can reassign records if necessary       |
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 4. SECURITY AUDIT GENERATION                                                      |
| INSERT INTO public.audit_events (                                                 |
|   workspace_id, actor_id, event_type: 'member.removed',                           |
|   target_id: target_user_id, details: { role: 'USER', removed_by: manager_id }    |
| )                                                                                 |
+-----------------------------------------------------------------------------------+
```

---

## 6. Last Manager Protection Invariant (ADR-036)

A workspace must never be orphaned without at least one active user holding the `MANAGER` role.

### Enforcement Strategy:
1. **Database Constraint / Trigger:** A `BEFORE DELETE OR UPDATE` trigger on `public.workspace_members`:
   ```sql
   CREATE OR REPLACE FUNCTION public.check_last_manager_protection()
   RETURNS TRIGGER
   LANGUAGE plpgsql
   AS $$
   DECLARE
     manager_count INTEGER;
   BEGIN
     -- Check only if a MANAGER is being removed or demoted
     IF (OLD.role = 'MANAGER' AND (TG_OP = 'DELETE' OR NEW.role <> 'MANAGER')) THEN
       SELECT COUNT(*) INTO manager_count
       FROM public.workspace_members
       WHERE workspace_id = OLD.workspace_id 
         AND role = 'MANAGER' 
         AND user_id <> OLD.user_id;

       IF manager_count = 0 THEN
         RAISE EXCEPTION 'CANNOT_REMOVE_OR_DEMOTE_LAST_MANAGER: Workspace % must have at least one active Manager.', OLD.workspace_id
           USING ERRCODE = 'P0001';
       END IF;
     END IF;
     RETURN COALESCE(NEW, OLD);
   END;
   $$;

   CREATE TRIGGER trg_protect_last_manager
   BEFORE DELETE OR UPDATE ON public.workspace_members
   FOR EACH ROW
   EXECUTE FUNCTION public.check_last_manager_protection();
   ```
2. **Node Façade Validation:** The API layer inspects active manager counts before initiating UI demotion/removal flows and provides clear, actionable error feedback.

---

## 7. Concrete Authorization Scenarios & Test Contracts

The following scenarios serve as the acceptance criteria for all Gate 03 authorization testing:

| Scenario ID | Actor | Target Record / Action | Result | Enforcement Mechanism |
| :--- | :--- | :--- | :--- | :--- |
| **AUTHZ-01** | `USER` | Read own application in Workspace A | **ALLOW** | RLS: `user_id = auth.uid()` AND `is_workspace_member(ws_a)` |
| **AUTHZ-02** | `USER` | Read co-member's application in Workspace A | **DENY** | RLS: Returns empty result set (not owner, not manager) |
| **AUTHZ-03** | `USER` | Read any application in Workspace B (non-member) | **DENY** | RLS: `is_workspace_member(ws_b)` returns FALSE |
| **AUTHZ-04** | `MANAGER` | Read member's application in Workspace A | **ALLOW** | RLS: `is_workspace_manager(ws_a)` returns TRUE |
| **AUTHZ-05** | `MANAGER` | Modify member's application in Workspace A | **ALLOW + AUDIT** | RLS permits; RPC logs cross-user mutation in `audit_events` |
| **AUTHZ-06** | `MANAGER` | Access application in Workspace B (non-member) | **DENY** | RLS: Manager status does not cross workspace boundaries |
| **AUTHZ-07** | `MANAGER` | Attempt to demote/remove self when sole Manager | **DENY** | DB Trigger `trg_protect_last_manager` raises exception |
| **AUTHZ-08** | Ex-Member | Attempt to read records in previously joined workspace | **DENY** | RLS: `is_workspace_member` immediately returns FALSE |
| **AUTHZ-09** | Extension | Insert job capture with valid token in bound Workspace A | **ALLOW** | Node Auth Façade validates token scope & workspace binding |
| **AUTHZ-10** | Extension | Attempt capture into Workspace B (different from token) | **DENY** | 403 Forbidden: Token bound strictly to Workspace A |
| **AUTHZ-11** | Extension | Attempt capture with revoked extension token | **DENY** | 401 Unauthorized: `revoked_at IS NOT NULL` |
| **AUTHZ-12** | `MANAGER` | Read member's journal entry in managed workspace | **ALLOW + AUDIT** | RLS: `journal_entries` allows Manager; access logged |
| **AUTHZ-13** | `USER` | Attempt to read co-member's networking contacts | **DENY** | RLS: `contacts` is Owner Scoped / Manager Override |
