# M9 Test Plan

## Unit and component

- Registry contains exactly the 30 approved IDs, names, and kinds.
- Every registry ID maps to exactly one tier and one default layout entry.
- Preference normalization rejects unknown IDs, duplicates, invalid sizes, and malformed JSON while restoring missing defaults.
- Derived widget values return zero/No data rather than `NaN` or undefined.
- Keyboard reorder and visibility state are deterministic.

## Database and authorization

- `profiles.ui_preferences` accepts JSON objects and rejects non-object JSON.
- USER can read/update only their profile preferences.
- USER peer, cross-workspace assumptions, anonymous access, and removed-member access remain denied by the existing profile policy model.
- MANAGER does not gain the ability to edit another member's UI preferences.
- Migration applies cleanly from the current development baseline.

## Integration

- Existing integration suite remains green locally and on `jobquest-dev`.
- M8 analytics RPC exact-value tests remain green.
- Preference round-trip persists the selected workspace layout.

## Browser E2E

- User dashboard renders the action-first queue and all enabled default widgets.
- Manager owner selector scopes the complete dashboard consistently.
- Customize opens, toggles widgets, reorders by keyboard, changes supported sizes, saves, reloads, and resets.
- All approved drill-throughs navigate correctly, including Aging Applications.
- Loading, empty, retry, and malformed-preference fallback states are honest.
- Light/dark and desktop/mobile captures have no horizontal overflow.
- Axe: zero critical/serious violations.

## Quality gates

- Format/lint/typecheck/unit/build.
- M1B auth, M3 applications, M6 dashboard/tasks, M7 documents, and M8 analytics targeted regressions.
- Query/performance evidence for dashboard fan-out.
- Repository and deployed-bundle secret scans.
- Preview health and full browser flow.
