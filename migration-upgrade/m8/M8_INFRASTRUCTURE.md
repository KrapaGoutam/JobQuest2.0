# M8 Infrastructure and Database Record

## Environment state

| Environment | Final state |
| --- | --- |
| Local Supabase | Original M8 plus `20260928110000_m8_analytics_integrity.sql` applied; database lint clean; 119/119 integration PASS |
| Supabase development | `jobquest-dev`, ref `xpnkasclquplmrcmhsif`; migration ledger matches local through `20260928110000`; 119/119 hosted integration PASS |
| Vercel Preview | `jobquest2-ke8qoar7s-one-piece-5779.vercel.app`; deployment `dpl_56ZnCFUwHXsJnZ1rY5Wir2rRDFTc`; READY; target Preview; SHA `7757b06e9b72f09309823240af8059b418598934` |
| Vercel Production | untouched |
| Production Supabase | untouched |

## Migrations

1. `20260928100000_m8_analytics_goals.sql` - original M8 goals table and analytics RPC delivery.
2. `20260928110000_m8_analytics_integrity.sql` - additive closeout correction; the applied original migration was not edited.

The correction makes effective-dated goal history immutable to direct clients, adds audited manager goal mutation, normalizes periods by profile timezone/week start, adds application source, and replaces the analytics RPC implementations with exact event-backed calculations.

## Access boundary

- Browser: custom Option B access JWT held in memory and sent directly to PostgREST/RPC.
- Node API: registration, login, refresh rotation, logout, CSRF, and HttpOnly refresh-cookie handling.
- Database: RLS is authoritative. Analytics functions validate membership and manager access before filtering every query to the requested workspace/owner.
- Goal writes: `rpc_upsert_goal` for self and `rpc_upsert_goal_for_user` for an allowed member; direct insert/update/delete privileges are revoked.
- Manager cross-user mutations continue to write `MANAGER_GOAL_MUTATION` audit records.

## Preview validation

- `/api/health`: HTTP 200, no-store, `{"status":"ok"}`.
- M8 browser suite: PASS.
- Option B registration/login/direct Data API/leak suite: PASS.
- Deployed HTML/JS/CSS scan: 4 files, 3 real known secret values, 0 findings.
- No Preview promotion or Production command was used.

## Cloud changes

Only the existing development resources were changed:

- one additive migration on `jobquest-dev`;
- one Preview deployment in the existing `jobquest2` Vercel project;
- commits on the M8 feature branch and, after approval, `development`.

No new project, paid resource, production deployment, DNS change, legacy cutover, or `main` merge occurred.
