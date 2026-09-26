# M10 Test Plan

## Static and unit

- TypeScript, ESLint, production build, bundle scan, tracked-secret scan, and high/critical dependency audit.
- CSV quoting/newlines, JSON, structured text, and XLSX parsing.
- Every approved alias, unknown-field rejection, forbidden ownership/security fields, canonical validation, and duplicate identity.
- Formula-injection payloads across all thirteen CSV types and XLSX inspection.

## Database and integration

- Clean local migration rebuild and database lint.
- User self-import, manager member-import, regular peer denial, anonymous denial.
- Owner/manager history visibility and peer isolation.
- Valid-rows-only results, all-or-nothing rejection, per-duplicate actions, and unexpected-failure transaction rollback.
- CSV/XLSX/JSON response authorization and content types.
- Repeat the full integration suite against hosted development before Preview.

## Browser and Preview

- Four wizard steps, alias mapping, validation counts, duplicate actions, commit summary, and error CSV.
- History expansion, all download formats, and inline Applications export dialog.
- User/manager scope, reload persistence, loading/error/retry states.
- Desktop/mobile overflow, keyboard behavior, axe audits, visual inspection, first-ready performance, Option B privacy, and deployed-bundle secret scan.
