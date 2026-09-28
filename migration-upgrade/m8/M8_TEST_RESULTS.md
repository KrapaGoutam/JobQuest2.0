# M8 Test Results - Analytics, Reports & Search Goals

Date: 2026-09-25
Executable SHA: `7757b06e9b72f09309823240af8059b418598934`

## Final matrix

| Gate | Local | Hosted `jobquest-dev` | CI / Preview |
| --- | --- | --- | --- |
| Lint | PASS | n/a | PASS |
| Typecheck | PASS | n/a | PASS |
| Unit | 13 files, 103/103 | n/a | 103/103 |
| Integration regression | 8 files, 119/119 | 8 files, 119/119 | 119/119 |
| M8 integration | 8/8 | 8/8 | PASS in full suite |
| Build | PASS | n/a | PASS |
| Database lint | no schema errors | migration ledger matched | migrations applied in CI |
| M8 Playwright | 1/1 | n/a | Preview 1/1 |
| Option B browser | covered in CI | n/a | Preview 1/1 |
| Accessibility | 5 audits, 0 blocking | n/a | Preview 5 audits, 0 blocking |
| Bundle scan | 3 built files, 0 | n/a | 4 deployed files, 0 |
| Tracked-file secret scan | 554 files, 0 | n/a | 554 files, 0 |

GitHub Actions run `36180204706` completed successfully for the executable SHA. Its two jobs were:

1. `Lint / typecheck / unit / build / secret scans` - PASS.
2. `Migrations / Option B auth / RLS / browser (local Supabase)` - PASS, including 119 integration and 12 browser tests.

## M8 integration coverage

1. Goal upsert/defaults/uniqueness and direct-delete denial.
2. Same-workspace peer read and mutation isolation.
3. Manager member-goal mutation through the audited RPC.
4. Exact historical funnel milestones from `application_events`.
5. Current open pipeline separated from historical closed outcomes.
6. First-event stage timing with duplicate and reopened event fixtures, exact averages/medians/ranges, and current-stage age.
7. Manager aggregate versus member-filtered analytics.
8. Anonymous and cross-workspace denial.

Evidence:

- `evidence/integration-local-dc2379.json`
- `evidence/integration-hosted-dev-343149.json`

## M8 Preview browser coverage

Preview: `https://jobquest2-ke8qoar7s-one-piece-5779.vercel.app`

- registered a new Option B account and completed recovery-code onboarding;
- created two applications with first-class source values;
- asserted exact application totals and source breakdown values;
- changed the range preset to 30d and verified reload behavior;
- downloaded and parsed CSV and JSON exports;
- verified a formula-leading source is neutralized in CSV;
- exercised Overview, Stage Timing, Aging, and Goals;
- selected a workspace member before manager goal mutation;
- verified light, dark, desktop, and 390x844 mobile rendering;
- ran axe on Overview, Stage Timing, Aging, Goals, and mobile Goals with 0 critical/serious violations.

The separate Option B Preview test scanned 125 requests and 38 non-code responses, found no forbidden identity/credential material, verified the refresh token remained HttpOnly/Secure/SameSite=Strict, and proved direct PostgREST read/write still works.

Evidence:

- `evidence/m8-e2e.json`
- `evidence/option-b-preview-ke8qoar7s.json`
- `evidence/preview-bundle-scan-ke8qoar7s.json`

## CSV formula-injection cases

Unit and Preview E2E cover values beginning with `=`, `+`, `-`, `@`, tab, and carriage return. Dangerous leading characters receive a single-quote prefix; commas, quotes, LF, and CR trigger correct CSV quoting.

## Notes

The production build passes. Vite emits a non-blocking large-chunk advisory for the approximately 883 kB minified application bundle; secret and bundle policy checks are green.
