# Component inventory (approved baseline)

These are the components the approved screens use. The names are proposals; the visuals are fixed by `approved/`.

| Component | Used in | Variants / states | Notes |
|---|---|---|---|
| AppShell | All desktop | sidebar 240, collapsed 64; workspace colour edge | Header 52px |
| WorkspaceSwitcher | Sidebar, mobile header chip | closed, open (menu), searching | menuitemradio; shows role; create / settings items |
| SidebarNav / NavItem | Shell | default, current, with count badge, danger badge; group heading | Manager-only "Workspace" group |
| GlobalSearch | Header, mobile icon | idle, focused, results grouped by entity type | `/` shortcut; ⌘K hint reserved (P2) |
| NotificationBell | Header | count badge | |
| ThemeControl | User row, Settings | System / Light / Dark | Default System |
| PageHeader | All | title + count line + actions | |
| SavedViewTabs | Applications | selected, counts, danger count, "Save view" | ARIA tabs |
| FilterChip | Applications | active (removable), add (dashed), more | Mobile: bottom sheet |
| OwnerFilter | Applications (manager) | closed, open listbox, search | Includes audit notice |
| ViewSwitcher | Applications | Table / Board / Calendar / Timeline | radiogroup |
| AdvisoryBanner | Applications | stale review; dismissible | Polite status |
| DataTable (virtualized) | Applications | row: default, hover, selected, focused, preview-active; sticky header; sortable | 44px rows; aria-rowcount |
| BulkActionBar | Applications | n selected, actions, select all, clear | toolbar |
| StagePips | Table, cards | 5 segments; closed = muted | Always with a label |
| StageProgress | Detail | 8 steps; current, done, skipped | "Move stage" menu |
| AgingIndicator | Table, preview, detail, mobile | New, Waiting, Follow-Up Recommended, Stale, Long Waiting | Icon + label + days |
| PriorityBars | Table, detail, mobile | High, Medium, Low | Bars + label (or aria-label) |
| NextActionCell | Table, mobile card | set, not set, today, overdue, future | Icon + date text |
| NextActionPanel | Dashboard queue, preview, detail, mobile | due today, overdue; Done-set-next, Reschedule, Snooze | Core concept |
| QueueList | Dashboard, mobile | Overdue section, Due today section; complete checkbox | |
| InterviewList | Dashboard, detail rail | date tile, time, mode | |
| QuietReviewList | Dashboard | Keep / Mark Ghosted / Archive | Undo toast |
| PipelineBars / FunnelBars | Dashboard | current-state vs ever-reached | Rates shown as n and % |
| ActivityFeed | Dashboard | icon + text + date | |
| PreviewPane / PreviewDrawer | Applications | inline ≥1680, drawer below, route on mobile | prev/next, close |
| DetailTabs | Detail | Timeline, Job posting, Notes | Real ARIA tabs (CR-003) |
| Timeline | Detail, preview, mobile | date groups; event types: captured, applied, stage, outcome, contact, interview scheduled/completed, follow-up, task, note, next action, archived, system; filter chips; "show earlier"; hide system | |
| TimelineComposer | Detail | note / email / call / interview | |
| RelatedPanel | Detail rail | Tasks, Interviews, Contacts, Documents, Details | Accordions on tablet |
| ContactChip | Preview, detail | initials, role type | |
| MobileTabBar | Mobile | 5 items, badge | |
| MobileCard (application) | Mobile | company, role, stage, next action, aging, priority | |
| SegmentedControl | Mobile detail | 3 segments | |
| StickyActionBar | Mobile detail | Log activity, Move stage, More | |
| FAB | Mobile applications | New application | |
| Menu / Popover | Workspace, owner, stage | focus trap, Esc | |

Not in the baseline yet (Gate 02B): form fields and the application form, dialogs, confirm dialogs, toasts, empty, loading and error states, board card, calendar grid, Gantt row, charts beyond simple bars.
