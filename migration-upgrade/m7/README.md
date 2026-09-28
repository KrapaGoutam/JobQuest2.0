# Milestone 7: Documents & Resumes

Branch: `feature/m7-documents-resumes`, created from `development` at `0730fe8` (`merge: approve M6 tasks habits and unified queue`).  
Status: **In progress**.

---

## 1. What M7 Delivers

Milestone 7 delivers the complete **Documents & Resumes** domain for JobQuest 2.0, providing professional asset management, resume versioning, revision history, side-by-side version comparison, application document attachments, and performance analytics.

1. **Resume & Cover Letter Versioning:**
   - `public.resumes` stores candidate resume variants, tailored revisions, and cover letters.
   - Preserves version naming, target role, category, change summary, notes/content text, default status, active/archived state, and legacy traceability.
   - Version cloning (`rpc_clone_resume`): derive a tailored revision from an existing base version (e.g. `Product v3` → `↳ Product v3 · health focus`).
   - Default resume designation (`rpc_set_default_resume`): exactly one default resume per user per workspace.
   - Guarded deletion (`rpc_delete_resume`): prevent deletion of resume versions currently linked to active job applications; soft-archive is provided instead.
2. **Application Document Associations:**
   - `public.application_documents` links job applications to relevant career documents (`RESUME`, `COVER_LETTER`, `TRANSCRIPT`, `PORTFOLIO`).
   - Composite foreign keys enforce workspace tenancy: `(application_id, workspace_id)` and `(resume_id, workspace_id)`. Cross-workspace linking is structurally rejected (`23503`).
   - Application integration:
     - Resume version selector in Create/Edit Application modal.
     - Document attachments list in Application Detail Drawer.
3. **Resume Performance & Analytics:**
   - Computes application usage counts, response rates (`>= 5` sample thresholding), and interview reach percentages.
4. **Side-by-Side Version Comparison (R2):**
   - Side-by-side comparison table matching Gate 02B `14-resumes-goals-tablet.html` R2.
   - Compares target role, category, creation date, change summary, application count, response rate, interview reach, offer reach, and rejections.
5. **Authorization & Security (Option B):**
   - RLS Tier 2: `OWNER SCOPED / MANAGER OVERRIDE`.
   - Standard members (`USER`) see only their own resumes and documents.
   - Workspace managers (`MANAGER`) have read/write oversight across member assets.
   - Peer members receive empty result sets / permission denial (`42501`).
   - Manager mutations of member assets are audited via `app.audit_cross_user_mutation`.
   - Anonymous access is completely revoked.

---

## 2. Milestone Documentation

| File | Purpose |
|---|---|
| `IMPLEMENTATION_PLAN.md` | Detailed architectural tasks, schema, and API specifications |
| `TEST_PLAN.md` | Verification matrix covering unit, integration, E2E, and a11y tests |
| `ACCEPTANCE_CRITERIA.md` | Authoritative criteria checklist (AC-M7-01 through AC-M7-10) |
| `M7_IMPLEMENTATION_NOTES.md` | Database schemas, RPC signatures, and technical contracts |
| `M7_TEST_RESULTS.md` | Test evidence and execution reports |
| `M7_VISUAL_REGRESSION.md` | UI screenshot reviews against Gate 02B mockups |
| `M7_INFRASTRUCTURE.md` | Environment configuration (local, hosted Supabase, preview) |
| `M7_COMPLETION_REPORT.md` | 34-section milestone completion report |
| `NEXT_AGENT_HANDOFF.md` | Operational handoff for next agent / Milestone 8 |
