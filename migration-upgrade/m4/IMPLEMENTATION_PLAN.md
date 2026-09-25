# Milestone 4 — Implementation Plan: Contacts & Networking

> **M4 closeout (2026-09-25):** corrected during the final consistency audit. Canonical roles are `USER` / `MANAGER`; refresh tokens use a SHA-256 verifier (Argon2id is for passwords and recovery codes); contacts are archive-first (no hard delete); interactions are append-only; manager cross-user mutations are audited in `audit_events`. See `M4_COMPLETION_REPORT.md` §3 for the full list of corrections.

**Milestone:** M4 — Contacts & Networking  
**Branch:** `feature/m4-contacts-networking`  
**Base Commit:** `dc3d38a` (approved M3 merge on `development`)  
**Target:** Local Supabase stack & hosted Supabase dev (`jobquest-dev` `xpnkasclquplmrcmhsif`)

---

## 1. Objectives

1. Implement the workspace-scoped and owner-isolated **Contacts & Networking** domain.
2. Provide a centralized **Companies** registry linked to both applications and contacts.
3. Establish atomic domain RPC operations to ensure data integrity and authorization boundaries. (Audit logging was added at closeout: `audit_events` + trigger, migration `20260925100000`.)
4. Deliver desktop and mobile UI experiences conforming to Gate 02B mockups (`03-contacts.html`).
5. Ensure 100% test coverage across Unit, Integration, and E2E suites with zero regressions on M1B and M3.

---

## 2. Work Breakdown Structure

### Phase 1: Database Schema & Authorization (`20260924400000_m4_contacts_networking.sql`)
- [x] Create `companies` table with `(workspace_id, name)` unique constraint and `(id, workspace_id)` composite unique key.
- [x] Alter `applications` to add `company_id` foreign key referencing `companies(id, workspace_id)`.
- [x] Create `contacts` table with relationship types (`RECRUITER`, `HIRING_MANAGER`, `REFERRAL`, `INTERVIEWER`, `PEER`, `CONTACT`), email, phone, LinkedIn, follow-up dates, and soft-archive timestamps.
- [x] Create `contact_interactions` table (`EMAIL`, `CALL`, `LINKEDIN`, `MEETING`, `COFFEE`, `NOTE`) linked to contacts.
- [x] Create `application_contacts` many-to-many junction table with composite workspace foreign keys to guarantee cross-workspace link prevention.
- [x] Implement RLS policies: USER own-record CRUD, MANAGER workspace oversight, anon denied.
- [x] Implement domain RPCs:
  - `rpc_create_contact`
  - `rpc_log_contact_interaction`
  - `rpc_link_application_contact`
  - `rpc_unlink_application_contact`
  - `rpc_archive_contact`
  - `rpc_restore_contact`
- [x] Apply migration locally and push to hosted Supabase dev (`jobquest-dev`).

### Phase 2: Integration Testing (`tests/integration/m4-contacts.test.ts`)
- [x] Test M4-01: USER creates a contact via direct PostgREST and via `rpc_create_contact`.
- [x] Test M4-02: RLS: USER can read own contacts, PEER cannot read other member contacts.
- [x] Test M4-03: RLS: PEER cannot update or delete other member contact.
- [x] Test M4-04: RLS: MANAGER can read and manage all contacts in workspace, but DENIED in foreign workspace.
- [x] Test M4-05: Contact interactions: create, retrieve, peer isolation, and manager oversight.
- [x] Test M4-06: Application ↔ Contact relationships: linking, querying, and unlinking.
- [x] Test M4-07: Database-level cross-workspace integrity: prevents cross-workspace links.
- [x] Test M4-08: Companies registry: workspace-shared reference data.
- [x] Test M4-09: Contact soft archive and restore.
- [x] Test M4-10: Anon client denial across all contacts tables and RPCs.

### Phase 3: Frontend Data Layer & Types
- [x] `apps/web/src/types/contacts.ts`: Define `Contact`, `Company`, `ContactInteraction`, `ApplicationContactJoin`, follow-up status calculation, and formatting helpers.
- [x] `apps/web/src/api/contacts.ts`: Implement `fetchContacts`, `fetchContactDetail`, `createContact`, `updateContact`, `archiveContact`, `restoreContact`, `logContactInteraction`, `linkApplicationContact`, `unlinkApplicationContact`, and `fetchCompanies`.

### Phase 4: UI Components (`apps/web/src/components/contacts/`)
- [x] `ContactsToolbar.tsx`: Search input, filter tabs (All, Follow-up due, Recruiters, Hiring managers, Referrals, Interviewers, Networking), company filter, manager owner filter, sort selector, CSV export.
- [x] `ContactsTable.tsx`: 44px dense rows matching Gate 02B `03-contacts.html`, avatar with initials, company tile, status pills, follow-up badges (overdue alert, today warning, upcoming), keyboard navigation (↑/↓ move, Enter open, N new contact).
- [x] `ContactDetailDrawer.tsx`: 740px slide-out drawer (N3/N4) with contact identity, overdue follow-up banner with quick "Done" and "Snooze" actions, 2-column layout with quick interaction logger, activity timeline, contact info, and linked applications list. (Networking progress checklist deferred at closeout: not in the approved schema.)
- [x] `CreateContactModal.tsx`: New/edit contact dialog (N5) with company typeahead, job title, email/LinkedIn validation, optional application linking with role selection, and next follow-up date.
- [x] `LogInteractionModal.tsx`: Full modal for logging interactions with interaction type, date, notes, and next follow-up scheduling.
- [x] `LinkApplicationModal.tsx`: Modal to associate active applications with contacts and define hiring team roles.

### Phase 5: View Wiring & App Integration
- [x] `apps/web/src/views/ContactsView.tsx`: Integrate toolbar, table, drawer, modals, and CSV export.
- [x] `apps/web/src/App.tsx`: Route `/contacts` to `ContactsView`.

### Phase 6: Quality, E2E & Accessibility Audits
- [x] Unit test suite (`tests/unit/m4-contacts.test.ts`): 7 unit tests covering follow-up logic, type formatting, and initials generation.
- [x] Run `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build`, `pnpm check:bundle`, `pnpm check:secrets`.
- [x] E2E Playwright test suite (`e2e/m4-contacts.spec.ts`): End-to-end browser workflows, interaction logging, responsive verification, and axe-core accessibility audits.
- [x] Capture visual regression baselines in `migration-upgrade/m4/screenshots/`.
