# Milestone 4 — Contacts & Networking

**Status:** Implementation & Verification Complete
**Branch:** `feature/m4-contacts-networking`
**Target Environment:** Local Stack & Supabase `jobquest-dev` (`xpnkasclquplmrcmhsif`)

---

## 1. Overview

Milestone 4 introduces the comprehensive **Contacts & Networking** domain for JobQuest 2.0. Building upon the approved M1/M1B Option B authentication foundation, the M2 design system, and the M3 applications workflow, Milestone 4 enables job seekers and team members to manage recruiters, hiring managers, referrals, interviewers, and networking contacts with workspace isolation, follow-up scheduling, and application linkage.

---

## 2. Key Architecture & Deliverables

1. **Database Schema (`20260924400000_m4_contacts_networking.sql`)**:
   - `companies`: Workspace-scoped organization directory with uniqueness on `(workspace_id, name)` and foreign key reference on `applications.company_id`.
   - `contacts`: Owner-scoped contacts table with role constraints (`RECRUITER`, `HIRING_MANAGER`, `REFERRAL`, `INTERVIEWER`, `PEER`, `CONTACT`), email, phone, LinkedIn, follow-up date, and soft-archive support.
   - `contact_interactions`: Interaction logs (`EMAIL`, `CALL`, `LINKEDIN`, `MEETING`, `COFFEE`, `NOTE`) linked to contacts with author traceability.
   - `application_contacts`: Many-to-many relationship linking `applications` and `contacts` with composite `(id, workspace_id)` foreign keys enforcing database-level cross-workspace integrity.
   - Atomic domain RPCs: `rpc_create_contact`, `rpc_log_contact_interaction`, `rpc_link_application_contact`, `rpc_unlink_application_contact`, `rpc_archive_contact`, `rpc_restore_contact`.
   - RLS Policies: USER own-record isolation, MANAGER workspace oversight, anon denied across all tables and RPCs.

2. **Frontend UI Components (`apps/web/src/components/contacts/`)**:
   - `ContactsToolbar`: Search input, filter tabs (All, Follow-up due, Recruiters, Hiring managers, Referrals, Interviewers, Networking), company filter, manager owner filter, sort selector, CSV export.
   - `ContactsTable`: Dense 44px rows matching Gate 02B `03-contacts.html` (N1/N2), avatar with initials, company tile, status pills, follow-up badges (overdue alert, today warning, upcoming), keyboard navigation (↑/↓ move, Enter open, N new contact).
   - `ContactDetailDrawer`: 740px slide-out drawer (N3/N4) with contact identity, overdue follow-up banner with quick "Done" and "Snooze" actions, 2-column layout with quick interaction logger, activity timeline, contact info, linked applications list, and 6-stage networking progress checklist.
   - `CreateContactModal`: New/edit contact dialog (N5) with company typeahead, job title, email/LinkedIn validation, optional application linking with role selection, and next follow-up date.
   - `LogInteractionModal`: Full modal for logging interactions with interaction type, date, notes, and next follow-up scheduling.
   - `LinkApplicationModal`: Modal to associate active applications with contacts and define hiring team roles.

3. **Verification & Testing**:
   - 10 integration tests in `tests/integration/m4-contacts.test.ts`.
   - 7 unit tests in `tests/unit/m4-contacts.test.ts`.
   - E2E Playwright test suite in `e2e/m4-contacts.spec.ts` capturing visual regression baselines and running WCAG 2.1 AA accessibility audits via axe-core.

---

## 3. Directory Structure

- `IMPLEMENTATION_PLAN.md` — Detailed step-by-step implementation plan.
- `TEST_PLAN.md` — Test matrix, scenarios, and verification boundaries.
- `ACCEPTANCE_CRITERIA.md` — Full acceptance criteria verification checklist.
- `M4_IMPLEMENTATION_NOTES.md` — Technical notes, architectural decisions, and schema design.
- `M4_TEST_RESULTS.md` — Summary of unit, integration, and E2E test results.
- `M4_VISUAL_REGRESSION.md` — Visual regression verification across 7 approved states.
- `M4_INFRASTRUCTURE.md` — Database migration status and environment configurations.
- `M4_COMPLETION_REPORT.md` — Comprehensive 37-section milestone completion report.
- `NEXT_AGENT_HANDOFF.md` — Handoff instructions for the next agent / milestone.
