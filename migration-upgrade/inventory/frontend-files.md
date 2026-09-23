# Frontend Files

All paths relative to `frontend/`. Full behavioral detail in
`../ROUTE_SCREEN_INVENTORY.md`; this is a structural index only.

| File | Lines (approx) | Purpose |
|---|---|---|
| `src/app.js` | 3,671 | Entire app shell, in-memory routing (`go()`, `resolveInitialRoute()`), every screen's render function, dashboard widget assembly, all form handling |
| `src/application-table.js` | ~215 | Applications table renderer (14 columns, sort/filter headers, row selection) |
| `src/application-preview.js` | ~75 | Quick-preview drawer |
| `src/dashboard-config.js` | 39 | 30-widget registry (`DASHBOARD_WIDGETS`, `widgetDefinition`, `WIDGET_NAMES`) |
| `src/ui-utils.js` | — | Shared utilities: Kanban grouping, calendar month-cell math, aging-band logic, dependency-free SVG chart primitives (`hBar`, `vBars`, `areaLineChart`, `radialProgress`) |
| `src/icons.js` | — | Inline Lucide icon set (self-hosted, no external font/icon dependency) |
| `src/features/analytics/format.js` | — | `rateLabel()`, `summarizeRates()` — pure, unit-tested |
| `src/features/applications/quick-filters.js` | — | Quick-filter → query-param mapping |
| `src/features/checklist/groups.js` | — | Read-time lifecycle-phase grouping (5 buckets) |
| `src/features/contacts/format.js` | — | Contact formatting helpers |
| `src/features/dashboard/tiers.js` | — | 3-tier widget grouping (actions/pipeline/context) |
| `src/features/habits/format.js` | — | Habit label/streak formatting |
| `src/features/import-export/format.js` | — | Import preview/summary formatting |
| `src/features/notes/format.js` | — | Note type list, `displayTitle()` fallback logic |
| `src/features/tasks/format.js` | — | `TASK_VIEWS`, overdue/recurrence formatting |
| `vite.config.js` | — | Vite build configuration |
| `index.html` | — | SPA entry point |
| `public/` | — | Static assets |
| `dist/` | — | Build output (generated, not source — served by the backend) |
| `package.json` | — | Single devDependency: `vite` |

**Migration note**: every file under `src/features/*/format.js` is pure,
framework-agnostic logic with no DOM dependency — these are the lowest-risk,
highest-reuse files for the React port (see `../docs/ARCHITECTURE.md`'s own
"natural starting seam" observation, echoed in `../MIGRATION_MAPPING.md`).
