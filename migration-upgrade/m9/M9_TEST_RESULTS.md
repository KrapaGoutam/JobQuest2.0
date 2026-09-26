# M9 Test Results — Dashboard Parity

Date: 2026-09-26

Final product SHA: `17be90a25239aa6491f1f35c6a8e5813f8854a7e`

Final Preview evidence/test SHA: `49960c3918f2703d9ce6f1ea6b857afd21deea2c`

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
| Performance | PASS | Preview dashboard first-ready 1,694 ms / 10,000 ms budget |
| Browser bundle scan | PASS | Preview: 3 deployed files, 3 known secrets checked, 0 findings |
| Tracked-file secret scan | PASS | 0 findings |
| Option B Preview privacy | PASS — 1/1 | `evidence/option-b-preview-ojurhvmq4.json` |
| Feature CI | PASS | Run `36246617220` at exact SHA `49960c3`; both jobs green |
| Vercel Preview | PASS | `dpl_7NfhxLDPHxb1Y1VsWETq16jjjPhh`, READY, health HTTP 200 |

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
- manager owner-selection scope and scoped goal rendering;
- keyboard visibility/reorder, width selection, save, reload persistence, and reset;
- Aging drill-through to the selected Analytics tab;
- light/dark desktop and 390px mobile rendering;
- no `NaN` or `undefined`, no horizontal overflow;
- four axe WCAG audits with zero blocking findings;
- explicit first-ready performance budget.
- deterministic loading, error, retry, and recovery behavior.

## Non-product failures encountered

- The repository has no named Playwright project; the invalid `--project=chromium` attempt exited before startup.
- Windows sandbox identity caused `uv_os_get_passwd` ENOMEM and Supabase telemetry write denial; both commands passed outside the sandbox.
- Root typecheck caught strict test-only tuple/index typings; fixed with no runtime change.
- Vercel access was initially unavailable, then restored without changing project scope; no Production action occurred.
- The strengthened Preview run exposed an invalid ARIA label on the scoped goal progress indicator. It was corrected with `role="progressbar"` and value semantics at `17be90a`, then reverified with zero axe findings.
- GitHub annotations about Node 20 action deprecation and the future Ubuntu runner migration are informational; all jobs passed.
