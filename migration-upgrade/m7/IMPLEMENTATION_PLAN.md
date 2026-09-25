# M7: Implementation Plan — Documents & Resumes

## 1. Domain Objective

Milestone 7 implements candidate career assets: versioned resumes, cover letters, application document linkages, performance conversion metrics, and version comparison.

---

## 2. Architectural Boundary & Tenancy

1. **Option B Auth Preservation:**
   - Identity anchored by `user_accounts.user_id = auth.uid()`.
   - All RLS policies query workspace membership via `public.is_workspace_member` and `public.can_access_owned_record`.
2. **Multi-Tenancy & Integrity:**
   - `resumes` and `application_documents` require `workspace_id`.
   - Composite foreign keys guarantee that an application in Workspace A can never attach a resume from Workspace B (`uq_resumes_id_workspace` + `fk_app_docs_resume`).
3. **Auditability:**
   - Triggers on `resumes` and `application_documents` invoke `app.audit_cross_user_mutation`, capturing actor ID, target user ID, workspace ID, table, and operation whenever a `MANAGER` alters a member's career assets.

---

## 3. Database Schema Deliverables

Applied in additive migration `supabase/migrations/20260927100000_m7_documents_resumes.sql`:

1. **`public.resumes` Table:**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`
   - `user_id UUID NOT NULL REFERENCES user_accounts(user_id) ON DELETE RESTRICT`
   - `name VARCHAR(128) NOT NULL` (e.g. `Product v3`, `Cover letter · general`)
   - `document_type VARCHAR(32) NOT NULL DEFAULT 'RESUME'` (`RESUME` | `COVER_LETTER`)
   - `version_label VARCHAR(64) NOT NULL DEFAULT 'v1'`
   - `base_resume_id UUID NULL REFERENCES resumes(id) ON DELETE SET NULL`
   - `target_role VARCHAR(128) NULL`
   - `category VARCHAR(64) NULL`
   - `change_summary TEXT NULL`
   - `file_storage_path TEXT NULL`
   - `content_text TEXT NULL`
   - `is_default BOOLEAN NOT NULL DEFAULT FALSE`
   - `is_active BOOLEAN NOT NULL DEFAULT TRUE`
   - `archived_at TIMESTAMPTZ NULL`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `legacy_id INTEGER NULL`
   - Constraint `uq_resumes_id_workspace UNIQUE (id, workspace_id)`

2. **`public.application_documents` Table:**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `application_id UUID NOT NULL`
   - `workspace_id UUID NOT NULL`
   - `document_type VARCHAR(32) NOT NULL DEFAULT 'RESUME'` (`RESUME` | `COVER_LETTER` | `TRANSCRIPT` | `PORTFOLIO` | `OTHER`)
   - `resume_id UUID NULL`
   - `file_storage_path TEXT NULL`
   - `notes TEXT NULL`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - Composite FKs:
     - `FOREIGN KEY (application_id, workspace_id) REFERENCES applications(id, workspace_id) ON DELETE CASCADE`
     - `FOREIGN KEY (resume_id, workspace_id) REFERENCES resumes(id, workspace_id) ON DELETE SET NULL`

3. **Domain RPCs:**
   - `rpc_create_resume(p_workspace_id, p_name, p_document_type, p_version_label, p_target_role, p_category, p_change_summary, p_content_text, p_file_storage_path, p_is_default, p_base_resume_id)`
   - `rpc_clone_resume(p_resume_id, p_new_name, p_new_version_label, p_change_summary)`
   - `rpc_set_default_resume(p_resume_id)`
   - `rpc_archive_resume(p_resume_id)` / `rpc_restore_resume(p_resume_id)`
   - `rpc_delete_resume(p_resume_id)` (Enforces `CANNOT_DELETE_USED_RESUME` check)
   - `rpc_link_application_document(p_application_id, p_resume_id, p_document_type, p_notes, p_file_storage_path)`
   - `rpc_unlink_application_document(p_document_id)`

---

## 4. Frontend & User Interface Deliverables

1. **Types & API Layer:**
   - `apps/web/src/types/documents.ts`: Type definitions for `ResumeRecord`, `ApplicationDocumentRecord`, `ResumePerformanceStats`, and comparison payloads.
   - `apps/web/src/api/documents.ts`: PostgREST data fetching, RPC invocations, and performance rate calculations.
2. **Resumes View (`apps/web/src/views/ResumesView.tsx`):**
   - Header with count statistics: `X resumes · Y cover letters · Z archived`.
   - Actions: `Compare` button, `New version` button.
   - Gate 02B information banner: "Versions are tracked as names, notes and formatted text. File upload slot is available."
   - Filter tabs: `All` | `Resumes` | `Cover letters` | `Archived`.
   - Table rows matching Gate 02B R1:
     - Version title with hierarchical indent for revisions (`↳ Product v3 · health focus`).
     - Type badge (`Resume` / `Cover letter`).
     - Status badge (`Default` accent pill, `Archived` muted pill, or revision note).
     - Applications Used count.
     - Response rate percentage (`>= 5` sample thresholding).
     - Interview reached percentage.
     - Updated date.
     - Row actions: `Clone`, `Compare`, `Set Default`, `Archive/Restore`, `Delete`.
3. **Resume Version Comparison View (R2):**
   - Side-by-side comparison table matching Gate 02B `14-resumes-goals-tablet.html` R2.
   - Compares: Target role, Category, Created date, Change summary, Applications used, Response rate, Reached interview rate, Reached offer rate, Rejections.
4. **Modals & Dialogs:**
   - `CreateResumeModal.tsx`: Creation of new versions and cover letters.
   - `CloneResumeModal.tsx`: Tailoring revisions from existing versions.
5. **Application Workflow Integration:**
   - Create/Edit Application modal: Resume version selector dropdown.
   - Application Detail Drawer: Linked documents section showing attached resume version and documents.
