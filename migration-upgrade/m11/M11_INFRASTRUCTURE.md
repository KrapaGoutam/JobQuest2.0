# M11 Infrastructure and Database Record

## Environment state

| Environment | Final state |
| --- | --- |
| Local Supabase | Clean reset through all 15 migrations; M11 integration 7/7; full integration 134/134 |
| Supabase development | `jobquest-dev`, ref `xpnkasclquplmrcmhsif`; M11 migration applied; hosted M11 integration 7/7 |
| Vercel Preview | `jobquest2-4s4ifimlx-one-piece-5779.vercel.app`; deployment `dpl_Bynq1FZg7G2kD5vR9M1S6KTDPMx8`; READY; target Preview; health 200 |
| Vercel Production | Untouched |
| Production Supabase | Untouched |

## Migration

`20261005100000_m11_extension_tokens.sql` creates the token metadata/verifier boundary, lifecycle RPCs, RLS/grants, and atomic extension capture operation. Local and hosted-development migration ledgers match through M11.

Authenticated users receive only safe metadata columns; direct verifier selection is denied. Anonymous, peer, foreign-workspace, revoked, expired, rotated-old, and removed-member paths are denied by the combined API/database boundary.

## Preview configuration

- Existing team/project only: `one-piece-5779/jobquest2`.
- `EXTENSION_TOKEN_PEPPER` is configured as a cryptographically random Preview-only secret.
- No Production environment value was added or changed.
- Final deployment became READY in 35.896 seconds and `/api/health` returned `{"status":"ok"}`.
- Final unpacked-extension lifecycle and accessibility suite passed against the Preview.
- No `--prod`, promotion, DNS, new project, or paid-resource action was used.

## CI

Exact executable SHA run: `36370670193`.

- Static/build/security job `108766160772`: PASS.
- Database/integration/browser job `108766160686`: PASS.
- The database job now contains an explicit extension unit, typecheck, package, and bundle-scan step before browser E2E.
- Overall run conclusion: PASS on exact executable SHA `a49399ea59dd055c4af1887c857342913d166a07`.
