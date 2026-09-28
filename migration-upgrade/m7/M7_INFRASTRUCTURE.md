# Milestone 7 · Infrastructure & Database State

**Milestone:** M7 — Documents & Resumes  
**Target Environments:**
- Local Supabase (PostgreSQL 15, PostgREST 12)
- Hosted Remote Development Supabase (`jobquest-dev`, project ref: `xpnkasclquplmrcmhsif`)
- Vercel Preview (`jobquest2`)

---

## 1. Database Schema Changes

Migration file: `supabase/migrations/20260927100000_m7_documents_resumes.sql`  
Applied locally: `2026-09-25` (via `supabase db push --local`)  
Applied to remote `jobquest-dev`: `2026-09-25` (via `scratch/push-m7-migration.mjs --apply`)

### Tables Implemented
1. **`public.resumes`** (Gate 03 Target Schema #21)
   - Columns: `id` (uuid, PK), `workspace_id` (uuid, FK), `user_id` (uuid, FK), `base_resume_id` (uuid, self-FK), `name` (text), `document_type` (text: 'RESUME'|'COVER_LETTER'|'PORTFOLIO'|'OTHER'), `version_label` (text), `target_role` (text), `category` (text), `change_summary` (text), `content_text` (text), `file_storage_path` (text), `is_default` (boolean), `archived_at` (timestamptz), `created_at` (timestamptz), `updated_at` (timestamptz).
   - Constraints:
     - `chk_resumes_doc_type`: `document_type in ('RESUME', 'COVER_LETTER', 'PORTFOLIO', 'OTHER')`
     - Partial Unique Index `idx_resumes_default`: Only one default document per `(workspace_id, user_id, document_type)` where `is_default = true and archived_at is null`.
     - Foreign Key: `workspace_id` → `workspaces(id)` ON DELETE CASCADE.
     - Foreign Key: `user_id` → `users(id)` ON DELETE CASCADE.
     - Foreign Key: `base_resume_id` → `resumes(id)` ON DELETE SET NULL.

2. **`public.application_documents`** (Gate 03 Target Schema #22)
   - Columns: `id` (uuid, PK), `application_id` (uuid, FK), `workspace_id` (uuid, FK), `document_type` (text), `resume_id` (uuid, FK), `file_storage_path` (text), `notes` (text), `created_at` (timestamptz).
   - Constraints:
     - Foreign Key: `application_id` → `applications(id)` ON DELETE CASCADE.
     - Foreign Key: `workspace_id` → `workspaces(id)` ON DELETE CASCADE.
     - Foreign Key: `resume_id` → `resumes(id)` ON DELETE RESTRICT (guarded delete).
     - Composite Foreign Key `fk_app_docs_app_ws`: `(application_id, workspace_id)` → `applications(id, workspace_id)`.
     - Cross-workspace validation trigger: `trg_check_app_doc_cross_ws` ensures `resume_id.workspace_id == application_id.workspace_id`.

### RPC Functions Implemented
1. `rpc_create_resume`: Atomic resume creation enforcing default uniqueness and workspace ownership.
2. `rpc_clone_resume`: Clones an existing resume record into a new version while tracking `base_resume_id` and change log.
3. `rpc_link_application_document`: Secure atomic link between application and resume/cover letter with cross-workspace validation.
4. `rpc_unlink_application_document`: Removes an application document link.
5. `rpc_archive_resume`: Sets `archived_at = now()`, unsetting `is_default` if archived.
6. `rpc_restore_resume`: Restores an archived document.
7. `rpc_delete_resume`: Guarded deletion; raises `DOCUMENT_IN_USE` if any `application_documents` reference the resume.

---

## 2. Row-Level Security (RLS) Policies

All tables have RLS strictly enabled:
- **`resumes`**:
  - `resumes_select`: `can_access_owned_record(workspace_id, user_id)` (USER owns row, or MANAGER in same workspace).
  - `resumes_insert`: `can_access_owned_record(workspace_id, user_id)` and `user_id = auth_uid()`.
  - `resumes_update`: `can_access_owned_record(workspace_id, user_id)` (Manager updates log audit events).
  - `resumes_delete`: `can_access_owned_record(workspace_id, user_id)`.
- **`application_documents`**:
  - `app_docs_select`: Can access if user can access the parent application.
  - `app_docs_insert`: Can access if user can access the parent application and owns the resume.
  - `app_docs_delete`: Can access if user can access the parent application.

---

## 3. Storage Integration Disposition

Per Gate 03 and M7 specification:
- Storage is **deferred** in favour of structured text/metadata storage and optional cloud path references (`file_storage_path`).
- No public buckets or unprotected file URLs were introduced.
- Binary uploads can cleanly connect to `file_storage_path` in future milestones without schema modifications.

---

## 4. Secret & Token Hygiene
- Custom Option B auth tokens strictly utilized.
- No Supabase service role keys committed or exposed to the client.
- Tracked file secret audit: 0 findings across 501 repository files.
