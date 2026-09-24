# Gate 02B — screens and states still needing detailed design

This is a planning list only; Gate 02B has not started. It was checked against `migration-upgrade/ROUTE_SCREEN_INVENTORY.md` (current routes) and the approved IA.

## Covered by the approved baseline
Dashboard (user), Applications (Table), Applications preview, Application Detail, Workspace switcher, Manager owner-filter context, Mobile Dashboard, Mobile Applications and Mobile Application Detail.

## Still needed
| Area | Screens / states | Source (legacy route or requirement) |
|---|---|---|
| Auth | Login (PIN-primary vs Supabase — OQ-001), Registration, PIN transition, Recovery codes, Account recovery | `authView()` |
| Applications | Create application (full form), Edit application, Quick Add, Board view, Calendar view, Timeline (Gantt) view, advanced-filter dialog, export dialog (CSV/XLSX/JSON), stage-move and outcome confirmation dialogs, archive/restore, hard-delete confirmation | `add`, `quick-add`, `applications` (Kanban) |
| Duplicate detection | Import duplicates, extension duplicate states (exact posting / same company-role / different role) | BL-002, BL-003 |
| Contacts / Networking | Contacts list, Contact detail | `networking_contacts` |
| Trackers | Interviews, Rejections, Follow-Ups (with suggestion), Reminders + Categories | `renderTracker`, `reminders` |
| Tasks & Follow-ups | Today / Upcoming / Backlog / Completed views | `tasks` |
| Habits | Today / All / History, real edit form (CR-002) | `habits` |
| Journal & Notes | List, editor, search | `notes` |
| Calendar | Month / Week / Agenda | `calendar` |
| Resumes | List, revision history, compare, analytics | `resumes` |
| Goals | Goal settings, Goal history | `goals`, `goal-history` |
| Analytics | Analytics (funnel, source, resume), Aging report (CR-005 drill-through), Stage analytics, Exports | `analytics`, `aging`, `stage-analytics`, `exports` |
| Dashboard | Customize dashboard (widget reorder, keyboard alternative), manager dashboard (user scope) — the approved dashboard replaces the 30-widget grid as the default, so decide which widgets stay available | `dashboard`, `manager` |
| Workspace | Workspace settings, Member management (roles; last-manager safeguard), Invite member, Create workspace, Audit history, Workflow configuration | `users`, `audit`, new |
| Import / Export | Bulk import (preview → import), Import history (CR-004 placement), Export | `bulk`, `imports`, `exports` |
| Settings | Profile, Account settings, change PIN/credential (CR-001), Theme settings, Tags, Extension token management | `settings`, `profile` |
| Browser extension | Popup: connect, capture form, duplicate warning, success, error | `extension/popup.html` |
| Cross-cutting states | Empty, loading (skeleton for virtualized table), error (page and inline), permission denied / role-gated, offline, archive/restore, undo toasts, 404 (detail redirect behaviour) | Cross-cutting patterns |

## Functionality to verify is not lost
These legacy features aren't visible in the approved frames and must be carried into 02B, not dropped:
- **Applications:** pinned applications, tags, checklist, and the 14-column table's full column set (under column settings).
- **Dashboard:** the date-range selector, and goal progress (not shown on the approved dashboard; decide its placement).
- **Legacy keyboard shortcuts:** `g d`, `g a`, `g c`, `q`.
- **CSP posture:** legacy had no inline styles. The mockups use inline styles, but that is not a product decision; the React implementation decides.
