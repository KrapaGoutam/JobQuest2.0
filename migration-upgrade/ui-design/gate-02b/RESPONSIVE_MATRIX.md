# JobQuest 2.0 · Gate 02B Responsive Matrix

| | |
|---|---|
| **Status** | **PROPOSED** — Awaiting user review and approval |
| **Document Purpose** | Viewport-by-viewport layout transformation specifications, breakpoint rules, touch target requirements, and container adaptations |
| **Tested Viewports** | Mobile (390×844px), Tablet (1024×768px), Desktop (1440×960px), Wide Desktop (≥1680px) |

---

## 1. Breakpoint Definitions & Viewport Tiers

JobQuest 2.0 targets four distinct viewport tiers. It guarantees zero viewport-level horizontal overflow at all screen sizes:

```css
/* Mobile: Handheld phones */
@media (max-width: 767px) { ... }

/* Tablet: Portrait and landscape tablets, small laptops */
@media (min-width: 768px) and (max-width: 1023px) { ... }

/* Desktop: Standard desktop monitors, laptops */
@media (min-width: 1024px) and (max-width: 1679px) { ... }

/* Wide Desktop: Ultrawide and 4K displays */
@media (min-width: 1680px) { ... }
```

---

## 2. Component Transformation Matrix

| Component / Experience | Mobile (<768px) | Tablet (768px–1023px) | Desktop (1024px–1679px) | Wide Desktop (≥1680px) |
|---|---|---|---|---|
| **Global App Shell & Navigation** | **Bottom Tab Bar (5 items):** Dashboard, Applications, Tasks, Search, More. Top header has compact Workspace chip dropdown and avatar. | **64px Collapsible Icon Rail:** Icons only with tooltip flyouts on hover. Workspace chip compact at rail top. | **240px Persistent Sidebar:** Full grouped hierarchy (Primary, Track, Insights, Workspace, Settings). Expandable/collapsible. | **240px Persistent Sidebar:** Stays pinned at left; main content canvas expands to take full width. |
| **Header Bar & Breadcrumbs** | Hidden or truncated to current page title. Search trigger is an icon button leading to full-screen search view. | Compact header; breadcrumbs collapse to parent entity (e.g. `‹ Applications`). Global search input shrinks to 220px. | Full 52px top bar; complete hierarchical breadcrumbs; 320px search input with `/` and `⌘K` keyboard prompt. | Full top bar; complete breadcrumbs; expanded search bar (400px); quick action triggers. |
| **Applications: Primary View** | **Card List (1-col):** Company, role, stage pip, next action date, and aging badge. Swiping between cards or tapping opens full detail page. | **Condensed Table (5-col, TB1):** Company·Role, Stage, Aging, Priority, Next Action. Checkbox selection enabled. | **Dense Table (6+ col, D3):** Company·Role, Stage, Aging, Priority, Next Action, Source/Owner. Sticky header; virtualized scroll. | **Full Table (All columns):** Expands to show requisition ID, salary range, tags, and date applied without horizontal scroll. |
| **Applications: Preview Pane** | **Full Page Route:** Preview pane does not exist; tapping any item transitions to the `/applications/:id` full-screen route. | **Slide-Over Modal Drawer:** Clicking a row opens a 540px right drawer over the table with dark backdrop. Esc closes drawer. | **Slide-Over Modal Drawer:** Visible row preview button or `P` shortcut opens 480px right drawer over table. Esc or close (`×`) closes drawer. Quick actions available. | **Persistent 440px Split Rail (D4, ADR-029, OQ-024):** Defaults to **OPEN** at ≥1680px; table shrinks to 65% width. User can close (`×`), reopen, or toggle via toolbar button or `P` key. Preference is persisted. Not required. Spacebar toggle prohibited. |
| **Applications: Board (Kanban)** | **Single Stage Swipeable List (V3):** Shows one column at a time with horizontal swipe chips (`Applied 96`, `Screen 14`, etc.). | **Scrollable Horizontal Board:** 3 columns visible simultaneously; smooth horizontal scrolling container. | **Full 8-Column Board (V1):** All active columns visible side-by-side. 15 cards per column + "Show more". | **Full 8-Column Board:** Expanded card heights showing participant avatars and note excerpts. |
| **Applications: Filter Bar** | **Filter Bottom Sheet:** Tapping "Filter" opens a slide-up sheet with stage, status, and tag switches. | **Collapsible Filter Bar:** Active filter chips with dropdown menus; overflow chips collapsed into a "+N more" popover. | **Inline Filter Toolbar:** Saved view tabs, horizontal filter chips (`Outcome: Open`), search input, and result counter. | **Inline Filter Toolbar:** All filter chips visible with expanded quick-filter buttons. |
| **Application Detail Layout** | **Single Column with Segmented Control:** Segmented bar switches between `Timeline`, `Details`, and `People`. Bottom sticky bar for primary actions. | **Single Column with Accordions (TB2):** Timeline is the main canvas; right-rail sections become collapsible accordion cards below timeline. | **2-Column Master-Detail (D5):** Left 60% contains Timeline / Job Posting / Notes tabs; Right 40% contains structured entity cards. | **2-Column Master-Detail:** Left canvas expands; structured entity rail fixed at 440px with full metadata visibility. |
| **Timeline View** | Full-width single column. Events grouped by date; system events collapsed by default. | Full-width column inside application detail or cross-app view. Date gutters at left (60px). | Full-width with 90px date gutters; event filter chips; expandable rich note diffs. | Full-width with split view showing diffs side-by-side with original event text. |
| **Contacts & Networking** | **Single Column Avatar Cards (N6):** Compact rows with quick call/email icon buttons. Detail opens as full screen (N7). | **2-Column Grid:** Contact cards with company and linked application badges. Detail opens in 500px drawer. | **3-Column Grid / Table (N1):** Rich cards with interaction timeline, tags, and direct action menus. | **4-Column Grid:** Complete networking workbench with relationship strength gauges. |
| **Tasks & Follow-ups** | **Vertical Queue Cards (T5):** Today / Overdue cards with 44px tap targets for check-off. Floating Action Button (+) for new task. | **Single Column Split View:** Queue on left; tapping task slides out detail drawer from right. | **Split Pane (T2):** Left 60% contains unified task queue; Right 40% holds selected task detail panel and linked record preview. | **Split Pane:** Expanded queue with inline recurrence and due date pickers. |
| **Analytics & Reports** | **Stacked Metric Cards (Y5):** Single-column cards; bar charts render in vertical aspect ratio; tables render as lists. | **2-Column Card Grid:** Overview KPIs on top; Funnel chart and pipeline side-by-side. | **Dashboard Grid (Y1/Y2):** 6-card analytical layout. Side-by-side Historical Funnel and Current Pipeline. Interactive chart tooltips. | **Expanded Workbench:** Wide layout with side-by-side funnel and stage timing tables. |
| **Workspace Members** | **Member List Cards (W11):** Name, avatar, role pill. Tapping row opens action sheet with role assignment. | **Condensed Table:** Member, Role, Status, Applications, Actions. | **Full Table (W1):** Member, Email/Username, Role, Status, Total Apps, Last Active, Joined Date, Menu. | **Full Table:** Adds cross-member application activity graphs. |
| **Forms & Creation** | **Full-Screen Slide-Up Sheet (C12):** Minimal initial fields. "More details" reveals progressive sections. Sticky bottom Save bar. | **Centered Modal / Page (TB3):** Horizontal pill tabs replace sidebar section navigation. | **3-Column Form Page (C1):** Left section navigation (200px), Center form canvas (fluid), Right helper/snapshot rail (300px). | **3-Column Form Page:** Expanded center canvas; live duplicate preview side-by-side with inputs. |
| **Dialogs & Confirmations** | **Bottom Action Sheets:** Slide up from bottom with top grabber; full device width; cancel button at bottom. | **Centered Modals:** Max-width 540px; centered in viewport with dimmed backdrop scrim. | **Centered Modals (500–640px):** Explicit width, accessible headers, structured footers. Esc to close. | **Centered Modals:** Identical to desktop; never exceeds 640px to maintain comfortable reading measure. |
| **Extension Setup** | Responsive instructions page directing user to desktop browser. | Responsive setup guide with token generator. | **Standard Settings Sub-Page (S7):** Active tokens table, device metadata, one-time reveal modal (S9). | Standard Settings Sub-Page. |

---

## 3. Touch Targets & Ergonomic Standards

- **Mobile Minimum Touch Target:** All interactive controls, buttons, checkboxes, segmented items, and tab bar items on mobile have a minimum touch target size of **44×44 CSS pixels**, complying strictly with WCAG 2.2 Success Criterion 2.5.5 (Target Size - Enhanced).
- **Desktop Control Heights:** Desktop inputs, buttons, and table rows maintain a minimum height of **32px**, with clickable bounds exceeding the 24×24px requirement of WCAG 2.2 SC 2.5.8 (Target Size - Minimum).
- **Thumb Zone Optimization:** On mobile viewports, the primary creation action (Floating Action Button) and primary navigation tabs are positioned within the natural thumb sweep zone at the bottom of the display.
