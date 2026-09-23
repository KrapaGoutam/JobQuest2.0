# Components

JobQuest 1.0 has no component framework, so there are no discrete "component
files" in the React sense — every screen is a render function inside
`frontend/src/app.js` (or the 2 dedicated files below) that builds DOM nodes
directly. This inventory lists the reusable UI *patterns* that a component-based
rebuild should extract as real components, each with its current implementation
location.

| Proposed component | Current implementation | Used by |
|---|---|---|
| `Button` (primary/secondary/ghost/danger/icon-only) | Inline HTML + shared CSS classes (`styles.css`) | Every screen |
| `Table` (sortable, filterable headers, `aria-sort`) | `createApplicationTable()` in `application-table.js`; a generic `table()` helper in `app.js` (~line 210) used by every tracker/list screen | Applications, every generic tracker screen |
| `Dialog` / `Drawer` | Native `<dialog>` elements, hand-wired focus trap/Escape handling in `app.js` | Filter dialogs, Move-to-stage dialog, Application Preview drawer |
| `Toast` | `toast()` helper in `app.js`, `role="status" aria-live="polite"` | Every mutating action's success/failure feedback |
| `Tabs` | `detailTabs()` in `app.js` — **visually a tablist, only 1 of 8 tabs actually panel-switches (CR-003)** | Application Detail |
| `Kanban Board` | Custom grouping/rendering logic in `renderApplications()` + `ui-utils.js` grouping helpers | Applications (Kanban view) |
| `Dashboard Widget` shell | `widgetContent()` in `app.js`, driven by `dashboard-config.js`'s registry | Dashboard (30 widget instances) |
| `Generic Tracker Form/List` | `renderTracker()` + `trackerMeta` in `app.js` | Interviews, Rejections, Follow-Ups, Networking, Daily/Weekly Goals |
| `Inline Edit` (form-based, replacing `prompt()`) | **Does not exist today** — 11 call sites use native `window.prompt()` chains (CR-002) | Habits, saved-view naming, checklist item edit, resume rename, category/tag rename, next-action note |
| `Chart primitives` (bar/line/radial) | Dependency-free inline SVG helpers in `ui-utils.js` (`hBar`, `vBars`, `areaLineChart`, `radialProgress`) — CSP forbids inline `style=`, so these are pure SVG geometry attributes | Dashboard, Analytics, Stage Analytics |
| `Empty State` | Ad hoc per-screen `empty("...")` calls | Every list/table screen |
| `Error Box` | `errorBox()` helper | Every form |
| `Sidebar Navigation` | `shell()` + grouped `<details>` sections in `app.js` | Global |
| `Mobile Drawer` | CSS transform-based slide-out, `nav-open` body class | Global (mobile) |
| `Segmented Control` (view toggles, quick filters) | `aria-pressed` button groups | Applications (Table/Kanban), Tasks/Habits view tabs |
| `Badge` (nav count badges, status badges) | Inline HTML + CSS | Global nav, application stage/priority indicators |

These 15 patterns cover essentially every distinct interactive UI element in the
current app — a React component library built around them, combined with the
existing `features/*/format.js` pure logic, should be sufficient to reconstruct
every screen in `../ROUTE_SCREEN_INVENTORY.md` without inventing new patterns.
