# M7: Acceptance Criteria — Documents & Resumes

All criteria must be satisfied with verifiable evidence before Milestone 7 is considered complete.

---

## Acceptance Criteria Matrix

| Criterion ID | Domain Area | Requirement Description | Verification Method |
|---|---|---|---|
| **AC-M7-01** | **Schema & Migrations** | `public.resumes` and `public.application_documents` tables exist with primary keys, composite tenant foreign keys, default flags, document types, and status fields. | Database catalog reflection & integration tests |
| **AC-M7-02** | **RLS Peer Isolation** | Standard members (`USER`) can read, create, update, and archive only their own resumes. Peers in the same workspace cannot view or mutate another member's resumes. | Integration test (M7-02, M7-03) |
| **AC-M7-03** | **Manager Oversight & Audit** | Workspace managers (`MANAGER`) can view member resumes in their workspace. Manager mutations on member assets are recorded in `public.audit_events`. Foreign managers receive 0 rows. | Integration test (M7-04) |
| **AC-M7-04** | **Cross-Workspace Integrity** | An application in Workspace A can never link to a resume or document in Workspace B. Cross-workspace foreign keys trigger SQL `23503`. | Integration test (M7-05) |
| **AC-M7-05** | **Guarded Deletion** | A resume version that is linked to one or more job applications cannot be deleted (`rpc_delete_resume` throws `CANNOT_DELETE_USED_RESUME`). Unused resumes can be deleted. Soft-archiving remains permitted. | Integration test (M7-06) |
| **AC-M7-06** | **Version Cloning & Defaulting** | Cloning a resume preserves base metadata, establishes revision hierarchy (`base_resume_id`), and increments version label. Setting a resume as default unsets default on other variants for that user/type in the workspace. | Integration test (M7-07) & UI E2E |
| **AC-M7-07** | **Resumes Table UI (R1)** | `/resumes` displays the Gate 02B table with version names, type badges, status pills (Default/Archived), application counts, response rates, interview reach percentages, updated dates, and actions. | Playwright E2E & visual capture |
| **AC-M7-08** | **Version Compare View (R2)** | `/resumes?compare=...` allows selecting two versions and rendering a side-by-side comparison matrix of roles, categories, change summaries, and conversion rates. | Playwright E2E & visual capture |
| **AC-M7-09** | **Application Workflow Integration** | Create/Edit Application modal allows selecting an active resume version. Application detail drawer displays attached documents and resume version. | Playwright E2E & component integration |
| **AC-M7-10** | **Accessibility (WCAG 2.2 AA)** | Resumes views, modals, comparison table, and drawer sections pass axe-core audits with 0 critical and 0 serious violations. | Automated axe-core audit |
