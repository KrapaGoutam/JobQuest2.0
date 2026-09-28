# Milestone 13 — Post-Launch Deferred Register

## 1. Overview & Policy

This register documents features, enhancements, and technical components that are **intentionally and authoritatively deferred beyond the initial JobQuest 2.0 release**.

Every deferred item listed below meets all three of the following criteria:
1. **Explicit Source Authority:** The deferral is explicitly documented and justified in `GATE_01_ARCHITECTURE_PROPOSAL.md`, `OPEN_QUESTIONS.md`, `DECISIONS.md`, or milestone completion reports.
2. **Non-Blocking for MVP Launch:** Omitting this capability does not prevent any user from completing their end-to-end job search workflow.
3. **Architectural Compatibility Preserved:** The current database schema, RLS policies, and API design actively preserve compatibility so that the deferred feature can be cleanly introduced post-launch without breaking changes.

---

## 2. Authorized Post-Launch Deferrals

### DEF-01: Realtime WebSockets Subscriptions
- **Description:** Live push updates for dashboard task counters, new stage events, and real-time team notifications via Supabase Realtime (`realtime.subscription`).
- **Authority / Reference:** `OPEN_QUESTIONS.md` (OQ-006: "Deferred for MVP; architecture preserves Realtime compatibility"), `GATE_01_ARCHITECTURE_PROPOSAL.md` §11.
- **Rationale:** Legacy JobQuest 1.0 was strictly fetch-on-navigate/fetch-on-action with zero real-time infrastructure. In JobQuest 2.0, standard React query invalidation on mutation fully satisfies all MVP requirements.
- **Architectural Readiness:** All tables have primary keys, replica identity defaults, and RLS policies ready for immediate Realtime publication enablement.

### DEF-02: Manager Read-Access Audit Logging
- **Description:** Logging every read operation (viewing an application detail, viewing a contact) performed by a manager on a member's records.
- **Authority / Reference:** `GATE_01_ARCHITECTURE_PROPOSAL.md` §12, `M12_COMPLETION_REPORT.md` §34, `DECISIONS.md` ADR-010.
- **Rationale:** Decided during Gate 01 architecture review. Cross-user mutations (editing an application, changing a member role, removing a member) are 100% audited in `audit_events`. Logging high-frequency read operations would cause severe database write amplification and storage bloat without meaningful governance benefit at launch.
- **Architectural Readiness:** PostgREST query logging or Supabase Logflare can be activated without schema modifications.

### DEF-03: Push / Email Notification Transport for Reminders
- **Description:** External email or browser Web Push notifications dispatched when a scheduled task or interview reminder is due.
- **Authority / Reference:** `GATE_01_ARCHITECTURE_PROPOSAL.md` §20, `M6_COMPLETION_REPORT.md` §34.
- **Rationale:** All reminders and follow-ups are fully realized as canonical items in the unified Action Queue (`tasks` table) and highlighted on the Actionable Dashboard. Off-platform dispatch requires external delivery services (e.g. Resend, Twilio, Web Push workers) which were explicitly scoped out of the initial self-sufficient deployment.
- **Architectural Readiness:** The `tasks` table stores normalized `due_date TIMESTAMPTZ` and `reminder_time TIMESTAMPTZ` fields, allowing a future background cron worker to poll and dispatch without schema changes.

### DEF-04: Full Interactive Calendar Month Grid
- **Description:** Interactive multi-month and day-view calendar grid with drag-to-reschedule capabilities.
- **Authority / Reference:** `GATE_01_ARCHITECTURE_PROPOSAL.md` §8.4, `M6_COMPLETION_REPORT.md` §34.
- **Rationale:** The primary interview scheduling and preparation workflow is completely served by `InterviewsView` (grouped into Upcoming, Completed, and This Week bands) and the Actionable Dashboard queue.
- **Architectural Readiness:** `interviews.scheduled_at` is normalized to UTC and indexed by workspace, ready for standard FullCalendar or custom grid integration.

### DEF-05: Third-Party Email / OAuth Integration for Recovery
- **Description:** Password reset via email magic link or social OAuth providers (Google, GitHub).
- **Authority / Reference:** `OPEN_QUESTIONS.md` (OQ-018: "10 single-use recovery codes provide 100% self-sufficient account recovery without requiring a third-party email provider at launch"), `gate-02b/GATE_02B_UI_SPEC.md` §3.1.
- **Rationale:** Option B architecture intentionally decoupled credentials from external infrastructure. The 10 single-use cryptographically generated recovery codes provide complete, reliable account recovery without operational external email dependencies.
- **Architectural Readiness:** `user_accounts` stores `email` and `phone` optionally, allowing SMTP / OAuth bindings to be added seamlessly.

### DEF-06: Mobile Touch Swipe Gestures on Kanban
- **Description:** Horizontal swipe gestures on mobile devices to move cards across Kanban columns.
- **Authority / Reference:** `M6_COMPLETION_REPORT.md` §34.
- **Rationale:** On mobile screens (390px), the Table view and detail modal provide full stage-modification capabilities, and Kanban cards feature an accessible keyboard/click "Move to stage..." menu. Gesture listeners introduce complex scroll-conflict risks on touchscreens.

### DEF-07: Advanced Gamification & Social Sharing
- **Description:** Visual badges, celebration confetti, and public link sharing of search milestones.
- **Authority / Reference:** `GATE_01_ARCHITECTURE_PROPOSAL.md` §20.
- **Rationale:** JobQuest 2.0 is designed as a focused, privacy-first career workbench. Gamification is secondary to clean, reliable data tracking and streak visualization.
