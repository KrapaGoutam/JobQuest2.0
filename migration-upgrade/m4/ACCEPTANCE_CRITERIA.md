# Milestone 4 — Acceptance Criteria: Contacts & Networking

**Milestone:** M4 — Contacts & Networking  
**Status:** Validated & Met

---

## 1. Schema & Data Model Criteria

- [x] **AC-DB-01 (Companies Table):** Workspace-scoped `companies` table created with unique constraint on `(workspace_id, name)` and composite unique key on `(id, workspace_id)`.
- [x] **AC-DB-02 (Application Foreign Key):** `applications.company_id` foreign key column added, referencing `companies(id, workspace_id)`.
- [x] **AC-DB-03 (Contacts Table):** Workspace-scoped and owner-isolated `contacts` table created with relationship types (`RECRUITER`, `HIRING_MANAGER`, `REFERRAL`, `INTERVIEWER`, `PEER`, `CONTACT`), email, phone, LinkedIn, follow-up dates, and soft-archive support.
- [x] **AC-DB-04 (Interactions Table):** `contact_interactions` table created with interaction types (`EMAIL`, `CALL`, `LINKEDIN`, `MEETING`, `COFFEE`, `NOTE`), interaction date, notes, and follow-up scheduling.
- [x] **AC-DB-05 (Application Contacts Many-to-Many):** `application_contacts` join table created with composite foreign keys `(application_id, workspace_id)` and `(contact_id, workspace_id)` guaranteeing cross-workspace isolation at the Postgres engine level.
- [x] **AC-DB-06 (RLS Enforcement):** USER roles can only read and mutate their own contacts; PEER roles cannot see or modify other users' contacts; MANAGER roles have workspace oversight; `anon` is blocked unconditionally across all tables.
- [x] **AC-DB-07 (Domain RPCs):**
  - `rpc_create_contact`: Atomically upserts company, inserts contact, and optionally links application.
  - `rpc_log_contact_interaction`: Appends interaction and updates `last_contact_date` and `next_follow_up_date`.
  - `rpc_link_application_contact`: Links application with specified role in process.
  - `rpc_unlink_application_contact`: Unlinks application cleanly.
  - `rpc_archive_contact`: Sets `archived_at` timestamp.
  - `rpc_restore_contact`: Clears `archived_at` timestamp.

---

## 2. User Experience & Design System Criteria

- [x] **AC-UI-01 (Dense Table):** Contacts table renders 44px rows with checkbox selection, avatar with 2-letter initials, name, job title, relationship pill, company tile, linked applications label, last contact date, follow-up badge, and status.
- [x] **AC-UI-02 (Keyboard Navigation):** Arrow keys (↑/↓) move active focus row; `Enter` opens the contact detail drawer; `N` opens the new contact dialog.
- [x] **AC-UI-03 (Filter Tabs):** Seven filter tabs: `All`, `Follow-up due`, `Recruiters`, `Hiring managers`, `Referrals`, `Interviewers`, `Networking` with real-time count badges.
- [x] **AC-UI-04 (Search & Filters):** Real-time text search across full name, company, email, and job title; company dropdown filter; manager owner dropdown filter; archive toggle.
- [x] **AC-UI-05 (Detail Drawer):** 740px slide-out drawer conforming to Gate 02B `03-contacts.html` with overdue alert banner ("Follow-up due today" / "Xd overdue"), quick "Done" and "Snooze" buttons, two-column layout with quick interaction logger, activity timeline, contact info (mailto, tel, profile link), linked applications, and networking progress checklist.
- [x] **AC-UI-06 (Create/Edit Modal):** Accessible modal with required name validation, relationship type selector, company typeahead, email format check, LinkedIn URL check, optional application link, and next follow-up date picker.
- [x] **AC-UI-07 (CSV Export):** One-click export generates formatted CSV of filtered contacts.
- [x] **AC-UI-08 (Mobile Responsiveness):** Responsive design adapting cleanly to 390x844 mobile viewport with touch targets meeting 44x44px requirements.
- [x] **AC-UI-09 (Accessibility):** Zero critical or serious accessibility violations via axe-core WCAG 2.1 AA audit.
