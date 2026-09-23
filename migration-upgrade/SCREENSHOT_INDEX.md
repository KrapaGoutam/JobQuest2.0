# Screenshot Index

No screenshots were captured during this documentation pass. This was a
read-only, source-code documentation task — no dev server was started, no
browser automation was run against a live instance, and no production data was
touched, per this task's own constraints ("do not modify application code",
"do not deploy anything", prefer read-only navigation, no requirement to produce
screenshots if it would involve any risk).

The repository does already contain committed Playwright visual-regression
baseline screenshots (`backend/e2e/*-snapshots/`), which are the authoritative,
already-reviewed visual reference for the current UI — those should be consulted
directly rather than re-captured here, since they are guaranteed to reflect
actual rendered output (a manually captured screenshot could drift from them).

## Screenshots that should be captured later, once a dev server can be safely run

For each, capture at the existing visual-QA breakpoints already established in
`DESIGN.md` §25 (1440, 1024, 768, 390, 360px) and in both light/dark themes where
the page has theme-sensitive content:

| Screen | Route/entry point | Viewport(s) | Notes |
|---|---|---|---|
| Dashboard (User) | default landing | all 5 | Capture with a non-trivial seeded dataset — an empty dashboard hides most widget states |
| Dashboard (Manager) | Manager nav | desktop, mobile | Include the user-scope selector in an active state |
| Applications — Table | `applications` | all 5 | Include at least one active column filter and the sort indicator |
| Applications — Kanban | `applications` (view toggle) | desktop, tablet, mobile | Capture with a collapsed column and a collapsed group to show both states |
| Application Detail | `detail:<id>` | desktop, mobile | Capture with checklist, timeline, and linked tasks/notes all populated |
| Application Preview drawer | (dialog overlay) | desktop, mobile | |
| Add/Edit Application form | `add` | desktop, mobile | Capture with a validation error state (`errorBox()`) visible |
| Bulk Import | `bulk` | desktop | Capture the preview-results table with a mix of valid/invalid/duplicate rows |
| Interviews/Rejections/Follow-ups/Networking | `interviews` etc. | desktop | One screenshot per tracker type is enough — they share the same rendering path |
| Resumes | `resumes` | desktop | Include the comparison view |
| Tasks | `tasks` | desktop, mobile | Capture each of the 4 view tabs |
| Habits | `habits` | desktop, mobile | Capture a boolean habit and a count habit side by side |
| Notes/Journal | `notes` | desktop, mobile | Capture both list and editor sub-views |
| Reminder Center | `reminders` | desktop | Include the category management sub-view |
| Calendar | `calendar` | desktop, mobile | Capture all 3 view modes (month/week/agenda) |
| Goal History | `goal-history` | desktop | |
| Aging Report | `aging` | desktop | |
| Stage Analytics | `stage-analytics` | desktop | |
| Analytics | `analytics` | desktop | Capture with a real, non-trivial seeded dataset so rates aren't all "No data" |
| Exports | `exports` | desktop | |
| Settings | `settings` | desktop, mobile | Capture the Extension Token section with a freshly generated token visible |
| Extension popup | (extension icon click) | n/a (extension chrome) | Capture: clean capture, `SAME_ROLE` duplicate warning, `COMPANY_ONLY` informational banner, resume mode selector in all 3 modes |
| Mobile navigation drawer | any page, mobile viewport | mobile, small-mobile | Capture open state with focus trap engaged |

**How to capture safely, when the time comes**: run against a local dev instance
seeded with synthetic/fixture data only (never a copy of real production/user
data), matching the existing project convention (test fixtures use
`_test`-suffixed databases and synthetic usernames — never real user records).
