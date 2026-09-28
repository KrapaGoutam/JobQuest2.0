# M11 Test Results - Browser Extension Migration

Date: 2026-09-27
Executable SHA: `a49399ea59dd055c4af1887c857342913d166a07`

## Final matrix

| Gate | Result |
| --- | --- |
| Repository lint | PASS |
| Root/workspace typecheck | PASS |
| Root unit suite | PASS, 116/116 |
| Full integration regression | PASS, 134/134 across 11 files |
| Focused M11 integration | PASS, 7/7 local and 7/7 hosted dev |
| Extension suite | PASS, 27/27 across 3 files |
| Legacy extraction parity | PASS, 6 fixture files / 11 named cases |
| Web production build | PASS; existing non-blocking chunk advisory only |
| Extension dev/prod packages | PASS |
| Database lint | PASS; one pre-existing M10 volatility warning |
| Browser bundle scan | PASS, 3 files / 0 findings |
| Extension bundle scan | PASS, 40 files / 0 findings |
| Tracked-file scan | PASS, 658 files / 0 findings |
| Focused post-CI-fix Playwright | PASS, M10 + M11 2/2 |
| Final Preview M11 lifecycle | PASS, 1/1 |
| Final exact-SHA CI | PASS, run `36370670193` |

## Integration coverage

The local and hosted 7-test suites prove HMAC-only storage, single raw reveal, safe metadata access, verifier-column denial, peer isolation, `/me`, workflow, owner resumes, all duplicate classifications, bounded match data, atomic capture/snapshot/event/resume linking, rollback, scope denial, expiry, revocation, rotation, member removal, and per-token rate limiting.

Evidence:

- `evidence/integration-local-b1708c.json`
- `evidence/integration-hosted-dev-9ba597.json`

## Real extension browser coverage

Playwright launches a persistent headless Chromium context with the unpacked MV3 development package. It verifies fresh setup, keyboard focus, real Settings token creation and one-time reveal, options storage, connection validation, live content-script injection, extraction, canonical workflow, duplicate checks, atomic capture, authenticated deep link, exact duplicate handling, rotation invalidation, reconnect, revocation, popup reopen behavior, and dark theme.

Final Preview evidence: `evidence/browser-vercel-preview-73808ee5.json`.

- Extension loaded: yes; manifest version 3.
- Extraction: 45 ms.
- Popup ready: 1,506 ms.
- Duplicate API: 1,290 ms.
- Capture API: 877 ms.
- Exact duplicate popup: 2,977 ms.
- Accessibility: 6 contexts, 0 critical, 0 serious, 0 blocking.

The first two final-Preview attempts supplied old evidence IDs as account IDs and correctly failed authentication. A fresh uniquely named disposable account then passed the complete flow; those credential-selection failures were not product failures.

## Exact-SHA CI

GitHub Actions run `36370670193` completed successfully on the executable SHA.

- Static/build/security job `108766160772`: PASS.
- Migrations/integration/extension/browser job `108766160686`: PASS.
- The second job passed all migrations, 134 integration tests, the explicit 27-test extension gate, extension typecheck/package/bundle scan, and the full Playwright regression suite.
