# M9 Infrastructure and Database Record

## Environment state

| Environment | State |
| --- | --- |
| Local Supabase | Migration `20260929100000` applied; database lint clean; 121/121 integration PASS |
| Supabase development | `jobquest-dev`, ref `xpnkasclquplmrcmhsif`; ledger synchronized through `20260929100000`; empty post-apply dry run; 121/121 hosted integration PASS |
| Vercel project link | Existing `jobquest2`, project `prj_0A32SVkbOH2fBI2XLFv7kSkv086d`, team `team_lsStfTKp3LGQEWGYRM0BJ4Pb` |
| Vercel Preview | BLOCKED — no M9 deployment created |
| Vercel Production | Untouched |
| Production Supabase | Untouched |

## Migration

`20260929100000_m9_dashboard_preferences.sql` is additive. It adds a non-null JSON object preference document to `profiles`, with `{}` as the default and an object-shape check constraint. No previously applied migration was edited.

Preflight proved that it was the only pending migration, with no seed or role changes. The apply exited successfully. Post-apply `migration list --linked` shows local/remote parity, and `db push --linked --dry-run` reports the database up to date.

## Authorization boundary

Presentation preferences remain private profile state. Existing profile RLS allows the signed-in owner and denies peers, managers reading another profile directly, foreign workspaces, and anonymous requests. M9 introduces no privileged Node endpoint or browser secret.

## Vercel blocker

The preview-only CLI command failed before upload with `Not authorized`. No `VERCEL_*` environment credential was present. The connected deploy capability was not used because it cannot express an explicit Preview target and was safety-rejected. A read-only deployment listing against the exact linked project/team returned 403: re-authentication is required for scope `one-piece-5779`.

No deployment ID or Preview URL is recorded because no M9 deployment was created. No Production flag, promotion, DNS action, project creation, or paid-resource change occurred.

## Recovery

After Vercel scope re-authentication:

1. Deploy with an explicitly preview-only path to the existing project.
2. Record deployment ID, URL, target, state, and SHA.
3. Verify `/api/health` HTTP 200.
4. Run M9 Playwright against the Preview and scan the deployed bundle.
5. Confirm final feature CI green before considering the conditional M9 merge.
