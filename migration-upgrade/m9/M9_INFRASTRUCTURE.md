# M9 Infrastructure and Database Record

## Environment state

| Environment | State |
| --- | --- |
| Local Supabase | Migration `20260929100000` applied; database lint clean; 121/121 integration PASS |
| Supabase development | `jobquest-dev`, ref `xpnkasclquplmrcmhsif`; ledger synchronized through `20260929100000`; empty post-apply dry run; 121/121 hosted integration PASS |
| Vercel project link | Existing `jobquest2`, project `prj_0A32SVkbOH2fBI2XLFv7kSkv086d`, team `team_lsStfTKp3LGQEWGYRM0BJ4Pb` |
| Vercel Preview | PASS — `dpl_7NfhxLDPHxb1Y1VsWETq16jjjPhh`, target Preview, READY, health/E2E/privacy/bundle green |
| Vercel Production | Untouched |
| Production Supabase | Untouched |

## Migration

`20260929100000_m9_dashboard_preferences.sql` is additive. It adds a non-null JSON object preference document to `profiles`, with `{}` as the default and an object-shape check constraint. No previously applied migration was edited.

Preflight proved that it was the only pending migration, with no seed or role changes. The apply exited successfully. Post-apply `migration list --linked` shows local/remote parity, and `db push --linked --dry-run` reports the database up to date.

## Authorization boundary

Presentation preferences remain private profile state. Existing profile RLS allows the signed-in owner and denies peers, managers reading another profile directly, foreign workspaces, and anonymous requests. M9 introduces no privileged Node endpoint or browser secret.

## Vercel Preview verification

Team access was restored for the existing linked project without creating or relinking resources. The final product checkpoint was deployed with an explicit Preview target:

- deployment: `dpl_7NfhxLDPHxb1Y1VsWETq16jjjPhh`;
- URL: `https://jobquest2-ojurhvmq4-one-piece-5779.vercel.app`;
- product SHA: `17be90a25239aa6491f1f35c6a8e5813f8854a7e`;
- target/state: Preview / READY; build 48s;
- `/api/health`: HTTP 200 `{"status":"ok"}`;
- M9 E2E/a11y and Option B privacy: PASS;
- deployed-bundle scan: 0 findings.

## Safety

No Production flag, promotion, DNS action, project creation, paid-resource change, or production Supabase action occurred. The initial failed authorization attempt created no deployment.
