# M9 Test Results — Dashboard Parity

Date: 2026-09-26  
Final pushed executable/test SHA: `de220e8c7fa6934b4bf905915d2f47ebcf065248`

## Verification matrix

| Gate | Result | Evidence |
| --- | --- | --- |
| Lint | PASS | Full repository and focused M9 ESLint |
| Root typecheck | PASS | Root, API, and web TypeScript projects |
| Unit | PASS — 14 files, 108/108 | M9 registry/preferences 5/5 |
| Local integration | PASS — 9 files, 121/121 | `evidence/integration-local-503e24.json` for M9 2/2 |
| Hosted integration | PASS — 9 files, 121/121 | `evidence/integration-hosted-dev-c4f327.json` for M9 2/2 |
| Production build | PASS | 901.41 kB JS / 231.92 kB gzip advisory recorded |
| Local database lint | PASS | No schema errors |
| Browser E2E | PASS — 1/1 | `evidence/m9-e2e.json` |
| Accessibility | PASS | 4 audits, 0 critical/serious/blocking |
| Responsive | PASS | 390x844, 0px horizontal overflow |
| Performance | PASS | Dashboard first-ready 262 ms / 10,000 ms budget |
| Browser bundle scan | PASS | 3 built files, 0 findings |
| Tracked-file secret scan | PASS | 0 findings |
| Feature CI | PENDING FINAL CONFIRMATION | GitHub anonymous API polling rate-limited |
| Vercel Preview | BLOCKED | Team scope requires re-authentication; no M9 deployment created |

## Unit coverage

- exact unique 30-widget contract;
- approved user/manager defaults and sizes;
- malformed/unknown/duplicate preference normalization;
- per-workspace round trip without overwriting unrelated preferences;
- stable three-tier ordering.

## Integration and authorization coverage

- owner preference object round trip;
- non-object JSON rejected by constraint `23514`;
- peer and manager direct profile reads return no row;
- anonymous access denied;
- all prior M1B/M3/M4/M5/M6/M7/M8 integration cases remain green.

## Browser coverage

- Option B registration and application fixtures;
- manager-default dashboard and exact registry count;
- keyboard visibility/reorder, width selection, save, reload persistence, and reset;
- Aging drill-through to the selected Analytics tab;
- light/dark desktop and 390px mobile rendering;
- no `NaN` or `undefined`, no horizontal overflow;
- four axe WCAG audits with zero blocking findings;
- explicit first-ready performance budget.

## Non-product failures encountered

- The repository has no named Playwright project; the invalid `--project=chromium` attempt exited before startup.
- Windows sandbox identity caused `uv_os_get_passwd` ENOMEM and Supabase telemetry write denial; both commands passed outside the sandbox.
- Root typecheck caught strict test-only tuple/index typings; fixed with no runtime change.
- GitHub polling reached an anonymous API rate limit after current CI static and integration steps were observed green.
- Vercel CLI and connector lack authorization for team scope `one-piece-5779`; Preview remains unverified.
