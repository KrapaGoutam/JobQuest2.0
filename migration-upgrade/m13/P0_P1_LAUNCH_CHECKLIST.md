# Milestone 13 — P0 / P1 Launch Checklist

## Status & Overview

Every launch-critical feature (P0) and primary launch enhancement (P1) is inventoried below with its verification status, automated test reference, and visual/manual evidence.

No launch-critical feature may be unverified or silently dropped.

---

## P0: Launch-Critical Features

| Priority | Feature / Subsystem | Requirement Description | Verification Status | Automated Test Reference | Visual / Verification Evidence |
|---|---|---|---|---|---|
| **P0** | **Authentication & Sessions** | Option B Argon2id credentials, ES256 JWT access tokens, HttpOnly refresh cookies, token rotation, replay revocation. | **VERIFIED** | `tests/integration/m1b.test.ts` (17 tests) | `AuthView.tsx`, Vercel Preview Option B privacy leak check |
| **P0** | **Account Recovery** | 10 single-use cryptographically secure recovery codes; global session revocation on recovery. | **VERIFIED** | `tests/unit/recovery.test.ts`, `tests/integration/m1b.test.ts` (B19/B20) | `AuthView.tsx` recovery flow |
| **P0** | **Workspace Multi-Tenancy** | Engine-enforced multi-tenancy; composite foreign keys `(parent_id, workspace_id)`; zero cross-workspace data leakage. | **VERIFIED** | `tests/integration/m12-workspace.test.ts`, `tests/integration/m1b.test.ts` | `WorkspaceSwitcher.tsx`, Database schema DDL |
| **P0** | **Application Pipeline CRUD** | 8 canonical stages (`SAVED`, `APPLIED`, `SCREENING`, `INTERVIEW`, `OFFER`, `ACCEPTED`, `REJECTED`, `WITHDRAWN`), status, outcome, and closure notes. | **VERIFIED** | `tests/unit/m3-applications.test.ts`, `tests/integration/m3-applications.test.ts` | `ApplicationsView.tsx`, dual Table/Kanban views |
| **P0** | **Application Detail & History** | 8-pip stage progress bar, Outcome pill, Next Action card, append-only `application_events` timeline. | **VERIFIED** | `tests/integration/m3-applications.test.ts` | `ApplicationsView.tsx` detail drawer, `03-application-detail.html` |
| **P0** | **Networking Contacts** | Contact entity management, recruiter/peer/hiring manager roles, follow-up dates, interaction timeline drawer. | **VERIFIED** | `tests/unit/m4-contacts.test.ts`, `tests/integration/m4-contacts.test.ts` | `ContactsView.tsx`, `07-contacts.html` |
| **P0** | **Interview Scheduling & Prep** | Multi-round interviews, timezone-normalized scheduling, preparation notes, questions expected, debrief outcome recording. | **VERIFIED** | `tests/unit/m5-time.test.ts`, `tests/integration/m5-interviews.test.ts` | `InterviewsView.tsx`, `05-interviews.html` |
| **P0** | **Tasks & Action Queue** | Canonical tasks engine with task types `TASK`, `FOLLOW_UP`, `REMINDER`; due dates, priority, recurrence engine. | **VERIFIED** | `tests/unit/m6-queue-habits.test.ts`, `tests/integration/m6-tasks-habits.test.ts` | `TasksView.tsx`, `04-tasks.html` |
| **P0** | **Resumes & Document Registry** | Resume versions and parent-child revision lineages; application document attachments. | **VERIFIED** | `tests/unit/m7-documents.test.ts`, `tests/integration/m7-documents.test.ts` | `ResumesView.tsx`, `10-resumes.html` |
| **P0** | **Analytics & Funnel Engine** | Historical funnel analytics using "ever reached" logic from `application_events`; stage duration; aging bands. | **VERIFIED** | `tests/unit/m8-analytics.test.ts`, `tests/integration/m8-analytics.test.ts` | `AnalyticsView.tsx` charts and metric cards |
| **P0** | **Actionable Dashboard** | Direction D unified workbench: Action Queue, overdue tasks, upcoming interviews, aging review, streak summary. | **VERIFIED** | `tests/unit/m9-dashboard.test.ts`, `tests/integration/m9-dashboard.test.ts` | `DashboardView.tsx`, `00-dashboard.html` |
| **P0** | **Global Search Engine** | `Cmd+K` / `Ctrl+K` command palette; multi-domain search across Applications, Contacts, Notes, Interviews, Documents. | **VERIFIED** | `tests/integration/m13-global-search-parity.test.ts` | `GlobalSearchModal.tsx`, Topbar search trigger, MobileNav |
| **P0** | **Security & RLS Isolation** | Complete 10-persona RLS matrix; CSRF origin defense; rate limiting; zero peer data leakage. | **VERIFIED** | `tests/unit/security.test.ts`, `tests/integration/m13-global-search-parity.test.ts` | Local & hosted RLS suites |

---

## P1: Primary Launch Enhancements

| Priority | Feature / Subsystem | Requirement Description | Verification Status | Automated Test Reference | Visual / Verification Evidence |
|---|---|---|---|---|---|
| **P1** | **Journal & Notes System** | `journal_entries` table: 5 note types (`Reflection`, `Strategy`, `Interview prep`, `Note`, `Post-mortem`), application link, XSS-safe reader/editor. | **VERIFIED** | `tests/integration/m13-global-search-parity.test.ts` | `JournalView.tsx`, `06-habits-journal.html` J1–J3 |
| **P1** | **Habits Tracking & Streaks** | Daily and weekly habits tracking with streak calculation, idempotent daily check-ins, time-zone awareness. | **VERIFIED** | `tests/unit/m6-queue-habits.test.ts`, `tests/integration/m6-tasks-habits.test.ts` | `HabitsView.tsx`, `06-habits-journal.html` H1–H3 |
| **P1** | **Job Search Goals** | Activity pacing targets for daily/weekly job applications and outreach. | **VERIFIED** | `tests/unit/m8-analytics.test.ts`, `tests/integration/m8-analytics.test.ts` | `AnalyticsView.tsx` goals card |
| **P1** | **Bulk Import Wizard** | CSV/JSON batch import with visual column matching, alias auto-matching, and duplicate detection. | **VERIFIED** | `tests/unit/m10-import-export.test.ts`, `tests/integration/m10-import-export.test.ts` | `ImportExportView.tsx`, `12-import-export.html` E1–E5 |
| **P1** | **Multi-Format Export** | CSV, XLSX multi-sheet workbook, and JSON full archive with formula injection defense (`'` escaping). | **VERIFIED** | `tests/unit/m10-import-export.test.ts`, `tests/integration/m10-import-export.test.ts` | `ImportExportView.tsx`, `12-import-export.html` E7–E10 |
| **P1** | **Browser Extension Integration** | Scoped, expiring, SHA-256 hashed tokens (`extension_tokens`); Manifest V3 job capture facade and live workflow sync. | **VERIFIED** | `tests/unit/m11-extension.test.ts`, `tests/integration/m11-extension.test.ts` | `ExtensionSettingsView.tsx`, popup and content script |
| **P1** | **Workspace Governance** | Workspace switcher, member roster, role modifications (`USER` vs `MANAGER`), member suspension/reactivation. | **VERIFIED** | `tests/unit/m12-workspace.test.ts`, `tests/integration/m12-workspace.test.ts` | `MembersView.tsx`, `WorkspaceSwitcher.tsx` |
| **P1** | **Last Active Manager Safeguard** | Database trigger `trg_protect_last_manager` preventing demotion or removal of a workspace's sole manager. | **VERIFIED** | `tests/integration/m12-workspace.test.ts` | `MembersView.tsx`, database trigger inspection |
| **P1** | **Durable Member Removal** | Member removal revokes workspace membership while preserving historical records attributed to original `user_id`. | **VERIFIED** | `tests/integration/m12-workspace.test.ts` | Member removal modal copy & DB verification |
| **P1** | **Workspace Invitations** | Secure invitation codes (`JQI-<4chars>-<4chars>`) with pre-join preview and atomic membership establishment. | **VERIFIED** | `tests/integration/m12-workspace.test.ts` | `JoinWorkspaceModal.tsx`, `WorkspaceSettingsView.tsx` |
| **P1** | **Cross-User Audit Log** | Immutable `audit_events` table tracking manager actions; manager read-only Audit History viewer. | **VERIFIED** | `tests/integration/m12-workspace.test.ts` | `AuditHistoryView.tsx` |
| **P1** | **Semantic Theme System** | Semantic design system tokens with OKLCH accessible color calibration (Light, Dark, System modes). | **VERIFIED** | `tests/unit/m2-design-system.test.ts` | `DesignSystemShowcase.tsx`, theme toggle |
| **P1** | **Web Accessibility (WCAG 2.2 AA)** | Zero critical and zero serious accessibility violations across all application screens. | **VERIFIED** | Playwright axe-core audit suite | Automated a11y audit report |
