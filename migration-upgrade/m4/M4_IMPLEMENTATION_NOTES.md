# Milestone 4 — Implementation Notes: Contacts & Networking

> **M4 closeout (2026-09-25):** corrected during the final consistency audit. Canonical roles are `USER` / `MANAGER`; refresh tokens use a SHA-256 verifier (Argon2id is for passwords and recovery codes); contacts are archive-first (no hard delete); interactions are append-only; manager cross-user mutations are audited in `audit_events`. See `M4_COMPLETION_REPORT.md` §3 for the full list of corrections.

**Milestone:** M4: Contacts & Networking  
**Branch:** `feature/m4-contacts-networking`  
**Base:** `development` @ `dc3d38a` (approved M3 applications workflow)  
**Architecture Preserved:**
- Auth Option B (ES256 access JWTs; Argon2id for passwords and recovery codes; opaque `jqr_` refresh tokens with a SHA-256 verifier in an HttpOnly SameSite=Strict cookie)
- Direct Supabase Data API reads and simple updates under RLS
- Atomic RPC domain operations for state changes, linkages, and activity logging
- USER own-record isolation, MANAGER workspace oversight, zero cross-workspace data leakage
- Direction D design system tokens and AppShell layout

---

## 1. Schema & Relational Integrity

### Database Migration: `supabase/migrations/20260924400000_m4_contacts_networking.sql`
- **`companies` Table:**
  - Workspace-scoped registry of target employers and staffing agencies.
  - Unique constraint `uq_companies_workspace_name UNIQUE (workspace_id, name)`.
  - Composite unique key `uq_companies_id_workspace UNIQUE (id, workspace_id)` allowing other tables to create composite foreign keys that bind the workspace context.
- **`applications.company_id` Column:**
  - Additive column referencing `companies(id, workspace_id)`.
  - Backfilled existing `applications` from `company_name` via an idempotent workspace-level upsert.
- **`contacts` Table:**
  - `workspace_id` UUID NOT NULL REFERENCES `workspaces(id)`
  - `user_id` UUID NOT NULL REFERENCES `user_accounts(user_id)` ON DELETE RESTRICT (owner)
  - `relationship_type` TEXT CHECK (`'RECRUITER'`, `'HIRING_MANAGER'`, `'REFERRAL'`, `'INTERVIEWER'`, `'PEER'`, `'CONTACT'`)
  - `company_id` UUID REFERENCES `companies(id, workspace_id)`
  - `email`, `phone`, `linkedin_url`, `location`, `relationship_notes`
  - `next_follow_up_date` DATE (there is no `last_contact_date` column; last contact is derived from the newest interaction)
  - `archived_at` TIMESTAMPTZ NULL
  - Unique key on `(id, workspace_id)` for relational binding.
- **`contact_interactions` Table:**
  - Author and timestamp traceability for every interaction touchpoint.
  - `interaction_type` TEXT CHECK (`'EMAIL'`, `'CALL'`, `'LINKEDIN'`, `'MEETING'`, `'COFFEE'`, `'NOTE'`)
  - Composite foreign key to `contacts(id, workspace_id)` ON DELETE CASCADE.
- **`application_contacts` Junction Table:**
  - Many-to-many relationship linking `applications` and `contacts`.
  - Primary key `(application_id, contact_id)`.
  - Composite FK: `FOREIGN KEY (application_id, workspace_id) REFERENCES applications(id, workspace_id)`
  - Composite FK: `FOREIGN KEY (contact_id, workspace_id) REFERENCES contacts(id, workspace_id)`
  - **Relational Integrity Guarantee:** Prevents cross-workspace linking at the Postgres storage engine level regardless of client logic.

---

## 2. Row Level Security & Access Control

1. **`companies`**:
   - `SELECT`: Any member of the workspace can read companies.
   - `INSERT`/`UPDATE`: Any authenticated member of the workspace can create or update companies.
2. **`contacts`**:
   - `SELECT`: Contact owner (`auth_uid() = user_id`) OR workspace manager (`role = 'MANAGER'`).
   - `INSERT`: Contact owner (`auth_uid() = user_id`).
   - `UPDATE`: Contact owner OR workspace manager (owner/workspace immutable; archive via RPC only; manager edits audited).
   - `DELETE`: NOT granted since closeout migration `20260925100000` (archive-first).
3. **`contact_interactions`**:
   - Inherits contact ownership constraints via join to `contacts` or direct `user_id` ownership.
4. **`application_contacts`**:
   - Members can query and link within their workspace for applications and contacts they own (or manage).
5. **Anonymous Access:**
   - Unconditionally denied across all tables and RPCs (`REVOKE ALL ON ... FROM anon`).

---

## 3. Atomic Domain RPCs

- **`rpc_create_contact`**:
  - Atomically looks up or inserts the company in the workspace.
  - Inserts the contact row for the authenticated user.
  - If `p_application_id` is specified, links the application to the contact in `application_contacts`.
- **`rpc_log_contact_interaction`**:
  - Inserts an interaction row.
  - Touches the parent contact's `updated_at` and optional `next_follow_up_date`.
  - Optionally updates the parent contact's `next_follow_up_date`.
- **`rpc_link_application_contact` / `rpc_unlink_application_contact`**:
  - Manages the many-to-many relationship with role assignment (`RECRUITER`, `HIRING_MANAGER`, etc.).
- **`rpc_archive_contact` / `rpc_restore_contact`**:
  - Soft-archive functionality ensuring contacts can be hidden from active lists without data loss.

---

## 4. Frontend Design System Alignment

- Conforms strictly to Gate 02B approved mockups (`migration-upgrade/ui-design/gate-02b/mockups/03-contacts.html`).
- **Dense 44px Table:**
  - Two-letter initials avatar.
  - Color-coded relationship pills (`info` for recruiters, `accent` for hiring managers, `success` for referrals, `muted` for others).
  - Status badges for follow-up dates (red triangle alert for overdue, amber clock for today, muted calendar for future).
  - Full keyboard accessibility (↑/↓ arrow navigation, Enter to open drawer, N to create new contact).
- **Slide-out Detail Drawer (740px):**
  - Follow-up banner with quick completion ("Done") and snooze ("Snooze 3d") controls.
  - Two-column layout: left column houses quick interaction logger and activity timeline; right column houses contact info (one-tap mailto/tel/LinkedIn), and linked applications (networking progress checklist deferred at closeout).
- **CSV Data Export:**
  - Client-side CSV generation allowing users to download their contacts directory.
