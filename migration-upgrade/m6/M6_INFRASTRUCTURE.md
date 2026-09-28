# M6: Infrastructure

## Environments (development only)

| Resource | Identity | M6 use |
|---|---|---|
| Local Supabase stack | CLI 2.117, ports 553xx. Restarted with `-x studio,imgproxy,vector,logflare,realtime,storage-api,edge-runtime,postgres-meta,supavisor` (the same exclusions as CI) after the edge-runtime health check failed locally | `supabase migration up --local`; integration, E2E and performance runs |
| Supabase `jobquest-dev` | ref `xpnkasclquplmrcmhsif` (checked before each remote command) | `20260926100000_m6_tasks_habits_queue` applied |
| Vercel `jobquest2` | team `one-piece-5779`, preview only | M6 preview |
| GitHub Actions `M1B CI` | `.github/workflows/m1b-ci.yml` | Step names list M6; artifact `m1b-m3-m4-m5-m6-evidence` (adds `m6/evidence`, `m6/screenshots`) |

Not done in M6: no production Supabase or Vercel, no cutover, no legacy data migration, no plan upgrade. `../JobQuest1.0/` was not touched.

## Hosted migration

1. Ref check: `SUPABASE_PROJECT_REF=xpnkasclquplmrcmhsif`.
2. Pre-checks: Postgres 17.6; `tasks` and `habits` absent; **5 contacts with a follow-up date** (the backfill would create 5 FOLLOW_UP tasks); 30 interviews.
3. `supabase db push --db-url … --dry-run` listed only `20260926100000_m6_tasks_habits_queue.sql`.
4. The push applied it.
5. Post-checks: 5 FOLLOW_UP tasks backfilled; 0 contacts whose date lacks a projecting task.
6. Integration on hosted:
   - The first run started 5 seconds after the push. 14 M1B tests failed with "Unhandled API error" and the other files were skipped; the output held no underlying error. The same transient failure followed the M5 push.
   - `rpc_register_account` was then shown to work when called directly.
   - The re-run passed **101/101**.
   - Most likely cause: a PostgREST schema-cache reload after the DDL. Not confirmed.

## Vercel preview

| Preview | Code | Notes |
|---|---|---|
| `jobquest2-har9s7xwi-one-piece-5779.vercel.app` | `e3e18d5` (`ef9bbff` changes only a spec) | Environment Preview, Ready. `/api/health` ok. Deployed-bundle scan with 3 real secret values: 0 findings |
| `jobquest2-jlksvlrqq-one-piece-5779.vercel.app` | `0a92387` | Ready, health ok, scan 0 findings (superseded) |
| **`jobquest2-8lhec046i-one-piece-5779.vercel.app`** | **`b1ad12f` (final code)** | Environment Preview, Ready, health ok, scan 0 findings |

A first `vercel deploy` call printed nothing and created no deployment (checked with `vercel ls`); it was repeated.

## Secrets

- Never staged: `.env*`, `supabase/signing_keys.json`, `.vercel/`, `test-results/`, `apps/web/dist/`.
- The M6 E2E reads the service key from the same git-ignored env file the servers use. It uses it for one fixture step only (backdating an application to test the Long Waiting review) and never writes it anywhere.
- `supabase start` printed its standard local demo keys (local stack only); they are not project secrets.
