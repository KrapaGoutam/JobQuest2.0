# PL-1A Credential Hygiene Report

PHASE: `PL-1A`

STATUS: `BLOCKED — OPERATOR SECURITY AUTHORIZATION REQUIRED`

BASE SHA: `0994812e144a2a3d20298573506c141f45dab3bd`

BRANCH: `fix/pl1-credential-hygiene`

ACCOUNT IDENTIFIER: username `smoke-tester`; optional documented email `smoke-tester@jobquest.internal`; historical user ID `b763f0f9-bee2-406c-805b-ecf06bf97cac`

RELEVANT ENVIRONMENTS:

- Superseded old Supabase project `kwmnljvyvqvbvimypnmw`, where repository evidence associates the account and credential. Current authorized read access is unavailable.
- `jobquest-prod` (`kqsxdothjxtcktyirpux`), checked read-only on 2026-09-30.
- `jobquest-dev` (`xpnkasclquplmrcmhsif`), checked read-only on 2026-09-30.
- Repository evidence does not associate this credential with the legacy JobQuest1 account store or local-only testing.

CURRENT PLAINTEXT COPIES: `1`

- `migration-upgrade/m15/PRODUCTION_SMOKE_PLAN.md:18`

The value is intentionally not reproduced. The current copy remains in place while invalidation is uncoordinated so the primary actionable evidence is not destroyed.

HISTORICAL COPIES: `YES`

- Earliest known relevant commit: `6067066bbae5c68e212956a6c8579d44ff26fb1a`
- Historical path: `migration-upgrade/m15/PRODUCTION_SMOKE_PLAN.md`
- The credential is present in 89 reachable commits. Shared history was not rewritten.

ACCOUNT EXISTENCE:

- `jobquest-prod`: `NO`. A read-only aggregate query found no matching application account, credential record, or active session.
- `jobquest-dev`: `NO`. A read-only aggregate query found no matching application account, credential record, or active session.
- Old Supabase project `kwmnljvyvqvbvimypnmw`: `UNKNOWN`. The authorized Supabase connector denied project access, so absence cannot be inferred.

ACCOUNT ENABLED:

- `jobquest-prod`: `NO` (account absent).
- `jobquest-dev`: `NO` (account absent).
- Old Supabase project `kwmnljvyvqvbvimypnmw`: `UNKNOWN`.

CREDENTIAL CLASSIFICATION: `UNKNOWN`

The credential is not usable against either current JobQuest 2.0 environment because the associated account is absent there. It cannot be classified as non-live everywhere relevant because the superseded environment where it was used cannot be enumerated safely with the current authorization.

PRODUCTION MUTATED: `NO`

AUTH SYSTEM MUTATED: `NO`

HISTORY REWRITTEN: `NO`

CURRENT DOCS REDACTED: `BLOCKED`

SCANNER GAP: The canonical tracked-file scanner covers structured platform/API credentials, privileged JWTs, private keys, credential-bearing database URLs, and exact secrets supplied through the environment. It scans Markdown, but it has no generic rule for a plaintext password assignment in documentation. The canonical scan therefore reported 936 files and 0 findings while the known copy remained present.

SCANNER HARDENED: `NO — deferred at the UNKNOWN stop gate`

TESTS:

- `npm.cmd run check:secrets` — `PASS` after staging the report (937 tracked files, 0 findings), confirming the documented scanner gap.
- Scanner regression tests — `NOT RUN`; scanner behavior was not changed.
- Application lint, typecheck, unit, and build — `NOT REQUIRED`; no executable application or scanner code changed.

PREVIEW: `NOT REQUIRED`

DATABASE TARGET: `READ-ONLY verification only`

MIGRATIONS: `NONE`

DEVELOPMENT MERGED: `NO`

MAIN MERGED: `NO`

NEXT SECURITY ACTION: Obtain explicit operator authorization and authorized read access to the superseded `kwmnljvyvqvbvimypnmw` environment. If the account exists, suspend/disable it, revoke any active sessions, and rotate or reset the exposed credential using the separately authorized procedure. Then verify invalidation read-only, redact the current documentation copy, add generic synthetic scanner regression coverage, and rerun the canonical scan.

OPERATOR AUTHORIZATION REQUIRED: `YES`
