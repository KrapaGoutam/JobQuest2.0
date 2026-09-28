# M7: Implementation Notes — Documents & Resumes

## 1. Database Schema (`supabase/migrations/20260927100000_m7_documents_resumes.sql`)

### 1.1 `public.resumes` (TARGET_SCHEMA #21)

**Columns:**
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `workspace_id` UUID NOT NULL REFERENCES `workspaces(id)` ON DELETE CASCADE
- `user_id` UUID NOT NULL REFERENCES `user_accounts(user_id)` ON DELETE RESTRICT
- `name` VARCHAR(128) NOT NULL (e.g. `Product v3`, `Cover letter · general`)
- `document_type` VARCHAR(32) NOT NULL DEFAULT `'RESUME'` (`RESUME` | `COVER_LETTER`)
- `version_label` VARCHAR(64) NOT NULL DEFAULT `'v1'`
- `base_resume_id` UUID NULL REFERENCES `resumes(id)` ON DELETE SET NULL
- `target_role` VARCHAR(128) NULL
- `category` VARCHAR(64) NULL
- `change_summary` TEXT NULL
- `file_storage_path` TEXT NULL
- `content_text` TEXT NULL
- `is_default` BOOLEAN NOT NULL DEFAULT FALSE
- `is_active` BOOLEAN NOT NULL DEFAULT TRUE
- `archived_at` TIMESTAMPTZ NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `legacy_id` INTEGER NULL

**Constraints & Indexes:**
- `uq_resumes_id_workspace UNIQUE (id, workspace_id)` (Engine-enforced composite tenancy)
- `chk_resumes_doc_type CHECK (document_type IN ('RESUME', 'COVER_LETTER'))`
- `idx_resumes_ws_user` on `(workspace_id, user_id)`
- `idx_resumes_base` on `(base_resume_id)`

---

### 1.2 `public.application_documents` (TARGET_SCHEMA #22)

**Columns:**
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `application_id` UUID NOT NULL
- `workspace_id` UUID NOT NULL
- `document_type` VARCHAR(32) NOT NULL DEFAULT `'RESUME'` (`RESUME` | `COVER_LETTER` | `TRANSCRIPT` | `PORTFOLIO` | `OTHER`)
- `resume_id` UUID NULL
- `file_storage_path` TEXT NULL
- `notes` TEXT NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()

**Constraints & Indexes:**
- `fk_app_docs_app FOREIGN KEY (application_id, workspace_id) REFERENCES applications(id, workspace_id) ON DELETE CASCADE`
- `fk_app_docs_resume FOREIGN KEY (resume_id, workspace_id) REFERENCES resumes(id, workspace_id) ON DELETE SET NULL`
- `idx_app_docs_app` on `(workspace_id, application_id)`
- `idx_app_docs_resume` on `(workspace_id, resume_id)`

---

## 2. Row Level Security (RLS) & Access Control

Tier 2: `OWNER SCOPED / MANAGER OVERRIDE`:
1. **User Ownership:**
   - Standard members (`USER` role) can read, insert, update, archive, and delete their own resumes (`can_access_owned_record(workspace_id, user_id)`).
   - Peer members receive empty result sets on SELECT and `42501` on mutation.
2. **Manager Oversight:**
   - Workspace managers (`MANAGER` role) can inspect and update member resumes in the same workspace (`is_workspace_manager(workspace_id)`).
   - Cross-user manager actions trigger `app.audit_cross_user_mutation`, creating immutable records in `public.audit_events`.
   - Foreign managers (from another workspace) receive 0 rows.
3. **Application Documents Attachment RLS:**
   - Follows the parent application's access rules. Only users who can access the application can read or attach documents to it.
4. **Anonymous Denial:**
   - Table permissions and RPC execute permissions are completely revoked from `anon` and `public`.

---

## 3. Domain RPCs

| RPC Signature | Behavior & Invariants |
|---|---|
| `rpc_create_resume(...)` | Validates name and document type. If `is_default` is true, clears default on other resumes of same type for that user in the workspace. |
| `rpc_clone_resume(...)` | Clones target resume metadata, sets `base_resume_id`, increments version label, sets `is_default = false`. |
| `rpc_set_default_resume(uuid)` | Sets target resume as default; atomically unsets `is_default` on all other variants of the same type for that user in the workspace. |
| `rpc_archive_resume(uuid)` / `rpc_restore_resume(uuid)` | Toggles `archived_at` timestamp and `is_active` flag. |
| `rpc_delete_resume(uuid)` | Enforces guarded deletion: checks `application_documents`. If resume is linked, raises `CANNOT_DELETE_USED_RESUME: Resume is linked to X applications. Archive it instead.` |
| `rpc_link_application_document(...)` | Validates workspace match between application and resume; inserts association. |
| `rpc_unlink_application_document(uuid)` | Removes document attachment link. |

---

## 4. UI Architecture & Gate 02B Fidelity

1. **Resumes Table View (R1):**
   - Header with count statistics: `X resumes · Y cover letters · Z archived`.
   - Action controls: `Compare` button, `New version` button.
   - Informational banner: "Versions are tracked as names, notes and formatted text. File upload slot is available."
   - Table columns: `Version`, `Type`, `Status`, `Used`, `Response rate`, `Reached interview`, `Updated`, `Actions`.
   - Version rows display revision hierarchy with `↳` indent.
   - Status badges: `Default` accent pill, `Archived` muted pill, or revision parent text.
   - Rate calculations: thresholds `d < 5` with `too few` annotation; otherwise formats as `N/D (X.X%)`.
2. **Side-by-Side Compare View (R2):**
   - Triggered via `Compare` action or `/resumes?compare=id1,id2`.
   - Renders side-by-side comparison matrix across:
     - Target role, Category, Creation date, Change summary, Applications used count, Response rate, Reached interview rate, Reached offer rate, Rejections count.
3. **Application Workflow Integration:**
   - Create Application & Edit Application modal includes Resume version dropdown.
   - Application Detail Drawer renders Documents card showing linked resume and attached files.
