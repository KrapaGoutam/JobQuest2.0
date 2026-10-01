# PL-1A Credential Hygiene Report

PHASE: `PL-1A`

STATUS: `BLOCKED — HISTORICAL CREDENTIAL VALIDITY STILL UNKNOWN`

CLASSIFICATION: `UNKNOWN`

BASE SHA: `0994812e144a2a3d20298573506c141f45dab3bd`

BRANCH: `fix/pl1-credential-hygiene`

VERIFIED STARTING HEAD: `f0774eb90fb446f550ab736545a0430805195857`

REMOTE BRANCH HEAD AT RECHECK: `f0774eb90fb446f550ab736545a0430805195857`; the new local docs-only checkpoint commit is recorded by the final handoff/branch tip because a commit cannot record its own SHA.

LAST TESTED APPLICATION SHA: `0994812e144a2a3d20298573506c141f45dab3bd` (PL-1A changes are documentation-only)

EXISTING BRANCH CI: run `36789160703`, exact SHA `f0774eb90fb446f550ab736545a0430805195857`, `PASS`

ACCOUNT IDENTIFIER: username `smoke-tester`; optional documented email `smoke-tester@jobquest.internal`; historical user ID `b763f0f9-bee2-406c-805b-ecf06bf97cac`

## 2026-10-01 CLI re-verification

- Supabase CLI `2.117.0`: authenticated successfully using the operator's reset browser-authenticated session.
- DEV `jobquest-dev` (`xpnkasclquplmrcmhsif`): visible and healthy.
- PROD `jobquest-prod` (`kqsxdothjxtcktyirpux`): visible and healthy.
- Historical project `kwmnljvyvqvbvimypnmw`: not visible to the authenticated account.
- Repository linked target: DEV `xpnkasclquplmrcmhsif`; no relink was performed.
- `npx supabase migration list --linked`: succeeded read-only against DEV. No migration was applied; no database push was performed.
- Vercel CLI `61.0.0`: authenticated identity verified.
- Vercel scope/team `one-piece-5779`: accessible.
- Vercel project `one-piece-5779/jobquest2`: accessible by read-only project inspection.
- No deployment, environment-variable change, project configuration change, or auth mutation occurred.

## Relevant environments

- Superseded old Supabase project `kwmnljvyvqvbvimypnmw`, where repository evidence associates the account and credential. It remains unavailable to the operator's current authenticated Supabase account.
- `jobquest-prod` (`kqsxdothjxtcktyirpux`), checked read-only on 2026-09-30 and confirmed visible by CLI on 2026-10-01.
- `jobquest-dev` (`xpnkasclquplmrcmhsif`), checked read-only on 2026-09-30 and confirmed visible by CLI on 2026-10-01.
- Repository evidence does not associate this credential with the legacy JobQuest1 account store or local-only testing.

## Exposure record

CURRENT PLAINTEXT COPIES: `1`

- `migration-upgrade/m15/PRODUCTION_SMOKE_PLAN.md:18`

The value is intentionally not reproduced. The current copy remains in place because the `UNKNOWN` decision gate prohibits redaction before historical validity can be established.

HISTORICAL COPIES: `YES`

- Earliest known relevant commit: `6067066bbae5c68e212956a6c8579d44ff26fb1a`
- Historical path: `migration-upgrade/m15/PRODUCTION_SMOKE_PLAN.md`
- The prior investigation found the credential in 89 reachable commits. Shared history was not rewritten.

## Account evidence and classification

- `jobquest-prod`: account absent. A prior read-only aggregate query found no matching application account, credential record, or active session.
- Operator clarification: the current Production user is `Conan`; the historical `smoke-tester` must not be created or recreated in current Production.
- `jobquest-dev`: account absent. A prior read-only aggregate query found no matching application account, credential record, or active session.
- Historical project `kwmnljvyvqvbvimypnmw`: account existence and status remain `UNKNOWN`. The operator confirms that the project belongs to an inaccessible or incorrect historical account, and it is not visible to the current authenticated CLI account.
- The historical plaintext password was not tested by login.
- The historical credential must not be tested, reused, recreated, or printed.
- No account, password, session, recovery, or auth state was changed.

The credential cannot be classified as non-live everywhere relevant because the historical environment where it was used still cannot be enumerated safely. Under the PL-1A classification rules, the result remains exactly `UNKNOWN`.

## Cleanup and scanner state

CURRENT DOCS REDACTED: `BLOCKED`

SCANNER GAP IDENTIFIED: `YES` (from the prior investigation)

The canonical tracked-file scanner scans Markdown but has no generic rule for a plaintext password assignment in documentation. It therefore did not detect the known current copy. No real credential may be used as a fixture.

SCANNER HARDENED: `NO — prohibited by the UNKNOWN stop gate`

SECRET SCAN THIS SESSION: `PASS — 937 tracked files, 0 findings` (run only as the mandatory pre-commit safety check; this does not resolve the known generic scanner gap)

PRIOR VALIDATION: `npm.cmd run check:secrets` passed at the existing PL-1A checkpoint (937 tracked files, 0 findings), confirming the documented scanner gap. Scanner regression tests were not run because scanner behavior was not changed. Application lint, typecheck, unit tests, and build were not required because no executable application or scanner code changed.

## Safety and handoff

PRODUCTION MUTATED: `NO`

AUTH SYSTEM MUTATED: `NO`

HISTORY REWRITTEN: `NO`

DEVELOPMENT MERGED: `NO`

MAIN MERGED: `NO`

WORKING TREE: pre-existing unstaged `.gitignore` change adds only two local CLI-helper ignore entries; preserved and excluded from PL-1A staging.

OPERATOR APPROVAL REQUIRED: `NOT REQUIRED for the next read-only inspection; separately required if a later PL-1B invalidation is necessary`

FUTURE M15-F SMOKE IDENTITY: If M15-F later requires a smoke account, it must be a newly created, operator-approved, temporary, minimally privileged account with a new credential that is never stored in the repository. This is future M15-F scope only; no account creation is authorized or needed in PL-1A.

NEXT EXACT ACTION: Have an authorized operator provide read-only visibility to historical project `kwmnljvyvqvbvimypnmw` under the correct Supabase account or organization, then inspect only whether `smoke-tester` exists and its safe enabled/disabled status without testing the credential or mutating auth.
