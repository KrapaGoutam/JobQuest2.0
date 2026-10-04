# PL-1A Credential Hygiene Report

PHASE: `PL-1A`

STATUS: `CLOSED — DEVELOPMENT INTEGRATION CI PASS`

HISTORICAL CREDENTIAL CLASSIFICATION: `UNKNOWN`

BASE DEVELOPMENT SHA: `0994812e144a2a3d20298573506c141f45dab3bd`

MAIN SHA: `bfa82eb557c5e748ba5d7c91fe122fb8294d2313`

BRANCH: `fix/pl1-credential-hygiene`

PREVIOUS CERTIFIED BRANCH SHA: `df99f794c1fe8e18fe63e3d4d3bce11f69b99dd4`

PREVIOUS EXACT-SHA CI: run `36882374030`, `PASS`

REMEDIATION SHA: `22dfebe590d1a7693a4fc4475bb952d6ac6ae5b9`

EXACT-SHA CI: run `36887158468`, attempt 2, `PASS`

FINAL FEATURE BRANCH SHA: `44a824228a5d96412fc8851a228551b2ad0143b7`

FINAL FEATURE BRANCH CI: run `36891683169`, `PASS`

DEVELOPMENT MERGE SHA: `2246c07466cec830717d198671f536d44dfed0b3`

DEVELOPMENT CI: run `36892040319`, `PASS`

LAST TESTED APPLICATION SHA: `0994812e144a2a3d20298573506c141f45dab3bd` (no application code changed in PL-1A)

## Environment and account boundary

- Historical Supabase project `kwmnljvyvqvbvimypnmw`: inaccessible to the current authenticated account.
- Historical smoke-test account: existence and status remain `UNKNOWN` in that project.
- Historical credential: not tested, reused, recreated, printed, transformed, or used for authentication.
- Current Production: `jobquest-prod` (`kqsxdothjxtcktyirpux`), a separate environment.
- Current Production user: `Conan`.
- Historical smoke-test account in current Production: absent and must not be recreated.
- Auth system, database, environment configuration, Vercel deployment, development, main, and Production: unchanged.

Redacting the current repository copy does not invalidate the historical credential and does not change its classification. The classification remains exactly `UNKNOWN` because the historical environment cannot be inspected.

## Current exposure remediation

CURRENT TRACKED PLAINTEXT EXPOSURE: `REMOVED / REDACTED`

- Remediated path: `migration-upgrade/m15/PRODUCTION_SMOKE_PLAN.md`
- Replacement: an explicit redaction marker and non-secret historical handling guidance.
- Equivalent current tracked occurrences of the known value before redaction: `1`, at the remediated path only. This comparison emitted path/count metadata only.
- The obsolete plan now states that the historical credential must not be tested or reused and that a future M15-F smoke identity, if separately authorized, must be new, temporary, minimally privileged, and provisioned through a non-repository secret channel.

GIT HISTORY: `UNCHANGED`

- Earliest known historical commit: `6067066bbae5c68e212956a6c8579d44ff26fb1a`
- Historical path metadata is retained without reproducing the credential.
- No history rewrite is authorized or performed.

## Scanner root cause and hardening

SCANNER GAP ROOT CAUSE: `RULE/PATTERN GAP`

The canonical `--tracked` scanner already enumerated all Git-tracked text files, including Markdown. It was not limited to staged files and did not exclude `migration-upgrade/`. Its rules recognized structured platform/API tokens, privileged JWTs, private keys, database URLs containing passwords, and exact environment-provided secrets, but had no rule for a plaintext password value documented in a Markdown credential table.

SCANNER HARDENED: `YES`

- Added generic detection for concrete password/passphrase values in three-column Markdown credential-definition tables.
- Added detection for explicit uppercase `PASSWORD=` documentation assignments.
- Explicit redaction/placeholders remain allowed.
- Descriptive password-policy tables, form specifications, and API architecture rows are not treated as credentials.
- Findings continue to emit rule, path, and offset only; matched values are never printed.
- No historical value, fragment, derivative, account-specific rule, path allowlist, or denylist was added.

## Synthetic regression validation

SYNTHETIC TESTS: `PASS`

- Dangerous runtime-generated plaintext value in a synthetic Markdown credential table: detected.
- Safe `PASSWORD=[REDACTED]` placeholder: passed.
- Safe Markdown redaction marker: passed.
- Explanatory security documentation without an assigned value: passed.
- Repository after redaction: passed.

VALIDATION:

- `npx.cmd vitest run --project unit tests/unit/secretScan.test.ts`: `PASS` — 19 tests.
- Pre-redaction discrimination run: `PASS` — exactly one metadata-only finding at the known path.
- `npm.cmd run check:secrets`: `PASS` — 937 tracked files, 0 findings after redaction.
- Focused ESLint on scanner implementation/wrapper/test: `PASS`.
- `npx.cmd vitest run --project integration tests/integration/m1b.test.ts`: `PASS` — 17 tests.
- `git diff --check`: `PASS`.
- GitHub Actions M1B CI run `36887158468`, exact SHA `22dfebe590d1a7693a4fc4475bb952d6ac6ae5b9`: `PASS` on rerun attempt 2. Attempt 1's only failure was an unchanged M3 integration assertion comparing runner and database-container timestamps; the scanner/static job passed in attempt 1, the M3 test/RPC files had zero remediation delta, and rerunning failed jobs on the same SHA passed.

APPLICATION CODE CHANGED: `NO`

Changes are limited to the scanner/tooling test, the sanitized historical smoke-plan document, and PL-1A state/report/checklist documentation.

## Safety and handoff

PRODUCTION CHANGED: `NO`

AUTH MUTATION: `NO`

HISTORICAL CREDENTIAL TESTED: `NO`

HISTORICAL CREDENTIAL REUSED: `NO`

HISTORICAL SMOKE-TEST ACCOUNT RECREATED: `NO`

DEVELOPMENT CHANGED: `YES — PL-1A integrated by no-ff merge at 2246c07466cec830717d198671f536d44dfed0b3; exact CI PASS`

MAIN CHANGED: `NO`

PRE-EXISTING `.gitignore` CHANGE: `PRESERVED UNSTAGED AND UNMODIFIED`

POST-DEVELOPMENT-CI WORKING TREE: the final development CI updates to this report, `migration-upgrade/CURRENT_AGENT_STATE.md`, and `migration-upgrade/post-launch/POST_LAUNCH_EXECUTION_CHECKLIST.md` are intentionally unstaged so no new untested development commit is created; the pre-existing `.gitignore` change also remains unstaged and untouched.

## PL-1 closeout relationship

PL-1A remains `CLOSED`. PL-1B was `NOT EXECUTED / CONDITIONAL`, because the historical environment remains inaccessible; it was not a failed invalidation attempt. The historical credential classification remains `UNKNOWN`, and no current Production smoke-tester was created.

PL-1C subsequently closed with a documented live-evidence limitation, and PL-1D was assessed and remains `DEFERRED / TBD`. The consolidated disposition and evidence are recorded in `migration-upgrade/post-launch/PL1_CLOSEOUT_REPORT.md`.

PL-1 CLOSEOUT INTEGRATION: closeout feature SHA `bc515986f8aad691298d7661912fa178f84c8cee` passed CI `36898779897`; development merge SHA `1086bcb41d1b0ab25959d182ec388a0f6da53042` passed CI `36903888076`.

NEXT EXACT ACTION: PL-2 — Application Productivity, in a separate controlled task. Main and Production remain frozen; PL-2 is next but not started.
