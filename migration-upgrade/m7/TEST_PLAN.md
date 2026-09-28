# M7: Test Plan — Documents & Resumes

## 1. Test Strategy Overview

The testing strategy spans static analysis, unit tests, integration tests against PostgreSQL, end-to-end browser automation with Playwright, and automated WCAG 2.2 AA accessibility audits.

---

## 2. Test Suites

### 2.1 Static & Build Checks
- `pnpm lint`: Clean ESLint output.
- `pnpm typecheck`: Clean TypeScript compilation (`tsc --noEmit`).
- `pnpm build`: Successful production client and API builds.
- `pnpm check:bundle` & `pnpm check:secrets`: Zero credential or secret exposure.

### 2.2 Unit Tests (`tests/unit/m7-documents.test.ts`)
- Resume rate formatting (`rate(n, d)`: handles `< 5` sample size thresholding with `too few` annotation).
- Version label incrementation and slug normalization.
- Document comparison difference calculator.
- Resume selector filtering (active vs archived).

### 2.3 Integration Tests (`tests/integration/m7-documents.test.ts`)
1. **M7-01 (Insert & Metadata):** Direct insert and `rpc_create_resume`. Verifies fields, version labels, defaults.
2. **M7-02 (Peer Read Isolation):** Alice creates resumes; Bob queries the table in the same workspace; Bob receives 0 rows.
3. **M7-03 (Peer Mutation Denied):** Bob attempts direct UPDATE or DELETE on Alice's resume; 0 rows modified or SQL `42501`.
4. **M7-04 (Manager Access & Audit):** Manager Dave reads Alice's resumes. Dave updates a member resume; action audited in `public.audit_events`. Foreign manager receives 0 rows.
5. **M7-05 (Cross-Workspace Linkage Rejected):** Attempting to link an application in Workspace A to a resume in Workspace B triggers composite foreign key violation `23503`.
6. **M7-06 (Guarded Deletion):** Linking a resume to an application blocks `rpc_delete_resume` with error `CANNOT_DELETE_USED_RESUME`. Soft-archive succeeds. Unlinking allows deletion.
7. **M7-07 (Clone & Defaulting):** `rpc_clone_resume` copies base metadata, links `base_resume_id`, increments version label. `rpc_set_default_resume` clears previous default.
8. **M7-08 (Application Document Attachments):** `rpc_link_application_document` links documents; `rpc_unlink_application_document` unlinks.
9. **M7-09 (Soft Archive & Restore):** `rpc_archive_resume` sets `archived_at`; `rpc_restore_resume` clears `archived_at`.
10. **M7-10 (Anonymous Denial):** Anonymous callers denied access to `resumes` and `application_documents` and cannot call RPCs.

### 2.4 End-to-End Tests (`e2e/m7-documents.spec.ts`)
- **E2E-01:** Navigate to `/resumes`, verify table layout (R1), header counts, information banner.
- **E2E-02:** Create a new resume version via modal dialog. Verify row appears with version pill.
- **E2E-03:** Clone a resume version into a tailored revision. Verify hierarchical prefix `↳` renders.
- **E2E-04:** Navigate to Compare view (R2) and verify side-by-side version comparison matrix.
- **E2E-05:** Application drawer integration: view linked resume version and attached documents.
- **E2E-06:** Mobile responsiveness at 375×812 viewport.

### 2.5 Accessibility Audits (axe-core WCAG 2.2 AA)
- Resumes list table
- Create / Clone modal
- Version compare view
- Mobile layout
