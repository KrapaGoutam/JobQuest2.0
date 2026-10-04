# PL-1 Formal Closeout Report

## Purpose and scope

PL-1 — Critical Security + Extension Reliability — is closed through the approved dispositions below. This closeout records the completed credential-hygiene remediation, the Extension Test Connection investigation, and the deferred duplicate/URL-normalization risk assessment. It does not implement PL-1D, start PL-2, change `main`, or authorize any Production action.

## Final status

PL-1: `CLOSED`

The formal disposition and repository integration are complete. Closeout feature SHA `bc515986f8aad691298d7661912fa178f84c8cee` passed CI run `36898779897`; following explicit operator approval, it was merged no-ff into `development` at `1086bcb41d1b0ab25959d182ec388a0f6da53042`, and exact development CI run `36903888076` passed. No merge to `main` or Production action occurred.

| Workstream | Final disposition |
| --- | --- |
| PL-1A — Credential hygiene | `CLOSED` |
| PL-1B — Historical invalidation | `NOT EXECUTED / CONDITIONAL` |
| PL-1C — Extension Test Connection | `CLOSED WITH LIVE-EVIDENCE LIMITATION` |
| PL-1D — Duplicate and URL-normalization assessment | `ASSESSED / DEFERRED / TBD` |

## PL-1A — credential hygiene

- Historical Supabase project: `kwmnljvyvqvbvimypnmw`; inaccessible from the available account/context.
- Historical smoke-tester and credential validity classification: `UNKNOWN`. The credential was not tested, reused, recreated, or used for authentication. Redaction is not invalidation.
- Current plaintext exposure: `REDACTED`. The historical credential is not reproduced in this report.
- Scanner root cause: Markdown was already scanned, but the scanner lacked a generic rule for plaintext password values in credential-definition tables.
- Scanner remediation: generic Markdown credential-table and uppercase-assignment detection added.
- Synthetic scanner tests: `19/19 PASS`.
- Canonical scan: `PASS`, 937 tracked files.
- Remediation SHA and CI: `22dfebe590d1a7693a4fc4475bb952d6ac6ae5b9`; run `36887158468`, attempt 2, `PASS`.
- Final feature SHA and CI: `44a824228a5d96412fc8851a228551b2ad0143b7`; run `36891683169`, `PASS`.
- Development merge SHA and CI: `2246c07466cec830717d198671f536d44dfed0b3`; run `36892040319`, `PASS`.
- Application code, Production, and auth mutation: `NONE`.

PL-1B was not executed and did not fail. It remains conditional only if the historical environment becomes accessible and the operator separately authorizes an invalidation action. The historical classification must remain `UNKNOWN` unless new authorized evidence establishes otherwise.

Current Production is separate: Supabase project `jobquest-prod` (`kqsxdothjxtcktyirpux`) with current user Conan. The historical smoke-tester is absent and must not be recreated. Any future M15-F smoke identity requires a new temporary minimally privileged account, a completely new operator-approved credential, and no credential storage in Git, documentation, or prompts.

## PL-1C — Extension Test Connection

PL-1C closed based on current implementation review, automated coverage, and read-only Preview verification. Successful live stored-token authentication was not independently exercised because no authorized Preview extension token was available; no credential or account was created solely for verification.

| Evidence | Result |
| --- | --- |
| Preview | `https://jobquest2-d0vixbma7-one-piece-5779.vercel.app` |
| Deployment | `dpl_7d64jmpkzzEchdPkNJPBT6ktpSek` — `READY / preview` |
| Backend target | `jobquest-dev`; Production project ref absent from the Preview backend bundle |
| `GET /api/health` | HTTP `200` |
| `GET /api/ext/v1/me`, synthetic invalid token | HTTP `401`, `EXTENSION_TOKEN_INVALID` |
| Extension tests | `97/97 PASS` |
| Successful live stored-token path | `NOT independently exercised` — no authorized Preview token |
| Credential/account created for verification | `NO` |

Code review established stored-token fallback, whitespace trimming, masked-token persistence, and distinct connection-error handling in `apps/extension/options.js`, `apps/extension/sidepanel.js`, and `apps/extension/api/jobquest.js`. Existing browser coverage verifies token save, masked reopen, persisted-token Test Connection, rotation, and revocation.

The following are accepted, non-blocking test-coverage follow-ups rather than confirmed functional defects:

- direct Side Panel Test-button browser coverage;
- leading/trailing whitespace UI coverage;
- HTTP 403 UI handling;
- HTTP 503 UI handling;
- generic connection-error UI handling.

These follow-ups remain represented by `EXT-01` in the permanent backlog.

## PL-1D — deferred risk register

| Risk | Assessment | Disposition |
| --- | --- | --- |
| Server-side duplicate enforcement | `POST /captures` and its RPC can insert without independently enforcing duplicate policy; a direct API caller can bypass the client gate. | `CONFIRMED / DEFERRED` |
| Deprecated `duplicate_override` | The server still accepts and stores the field; the current extension sends `false`. | `CONFIRMED CONTRACT RESIDUE / DEFERRED` |
| URL normalization mismatch | Client normalization lowercases the complete URL; backend normalization preserves query case and fragments and has a trailing-slash-with-query edge case. | `CONFIRMED / DEFERRED` |
| Stale/out-of-order verdicts | Context/check sequencing, identity validation, and an unconditional save-time recheck are present. | `MITIGATED` |

Focused evidence: `63/63` side-panel tests and `3/3` normalization tests passed. No server duplicate enforcement, `duplicate_override` removal, or normalization redesign occurred. `EXT-02` and `EXT-03` remain `DEFERRED / TBD` pending separate promotion and explicit authorization.

## Production freeze and next phase

- Production changed: `NO`.
- Main changed: `NO`; it remains `bfa82eb557c5e748ba5d7c91fe122fb8294d2313`.
- Production remains frozen until M15-F.
- M15-F remains the last roadmap phase and requires separate explicit authorization.
- Next phase: PL-2 — Application Productivity.
- PL-2 started: `NO`.

PL-2 may begin only in a separate controlled task. This closeout does not start or authorize PL-2 implementation.

## Evidence limitations and open conditions

- Historical credential validity: `UNKNOWN`; it was not tested or reused.
- PL-1B: conditional only on restored historical-environment access plus separate operator authorization.
- PL-1C: not described as fully live verified; successful live stored-token authentication was not independently exercised.
- PL-1D: assessed only; remediation remains deferred.
