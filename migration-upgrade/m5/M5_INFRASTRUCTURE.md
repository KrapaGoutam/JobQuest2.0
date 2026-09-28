# M5: Infrastructure

## Environments used (development only)

| Resource | Identity | M5 use |
|---|---|---|
| Local Supabase stack | CLI 2.117; ports 553xx; local ES256 key trusted (kid `12fc9b25`) | All migrations applied with `supabase migration up --local`. Integration, E2E and performance runs |
| Supabase `jobquest-dev` | ref `xpnkasclquplmrcmhsif` (verified from `SUPABASE_PROJECT_REF` before each remote command) | `20260925200000_m5_interviews_debriefs` applied (see below) |
| Vercel `jobquest2` | team `one-piece-5779`; env vars scoped to Preview and Development only | **Preview** deployments only |
| GitHub Actions `M1B CI` | `.github/workflows/m1b-ci.yml` | Static job, plus a database/browser job on a disposable Supabase stack |

No production Supabase project and no production Vercel deployment were created. Nothing was cut over, no legacy data was migrated, and no plan was upgraded. `../JobQuest1.0/` was only read (`grep` of the legacy interview-type options).

## Hosted migration (`jobquest-dev`)

1. Ref check: `SUPABASE_PROJECT_REF=xpnkasclquplmrcmhsif`. The DB URL's pooler user was verified to target the same ref.
2. Pre-checks:
   - `public.interviews` did not exist
   - 69 profiles, **0** with a time zone missing from `pg_timezone_names`, so the new validation trigger can't strand existing rows
3. `supabase db push --db-url … --dry-run` listed only `20260925200000_m5_interviews_debriefs.sql`.
4. The push applied it.
5. Verification:
   - M5 suite on hosted: 14/14. The first attempt failed during setup, before any test ran. It ran immediately after the DDL, and its output wasn't captured, so the most likely cause (a PostgREST schema-cache reload) is unconfirmed. The immediate re-run passed.
   - Full integration suite on hosted: **88/88**.

The M4 closeout migration `20260925100000` was applied earlier, during the M4 closeout.

## Vercel previews (target: preview)

| Preview | Code | Notes |
|---|---|---|
| `jobquest2-k1eph4v90-one-piece-5779.vercel.app` | `d129933` | First M5 preview. Health ok. Deployed-bundle scan 0 findings (`evidence/preview-bundle-scan-k1eph4v90.json`). Superseded by the next row |
| `jobquest2-eq3zy6rxb-one-piece-5779.vercel.app` | `6a469ed` | Current M5 preview; validation in `M5_TEST_RESULTS.md` §7 |

`.vercelignore` keeps env files, keys, `supabase/`, tests and `migration-upgrade/` out of uploads. Deployment protection is off for previews (health returns 200 without a bypass). The deployed register limit (3/hour/IP) applies to preview test runs.

## CI changes in M5

- Step names now list the M5 suites.
- The evidence artifact became `m1b-m3-m4-m5-evidence` and includes `migration-upgrade/m5/evidence/` and `migration-upgrade/m5/screenshots/`.
- On failure, a `playwright-failure-context` artifact uploads the `error-context.md` ARIA snapshots. These hold no credentials: the page never holds a refresh token, and access tokens live only in memory. This is how the CI-only dialog-reset bug was diagnosed.

## Secrets hygiene

- Never staged or committed: `.env*`, `supabase/signing_keys.json`, the private JWK, DB passwords, `VERCEL_OIDC_TOKEN`, Playwright `test-results/`.
- `check:bundle` and `check:secrets` run on every CI build.
- The deployed bundles were scanned with the real secret key, DB password and signing-key private component as known values: **0 findings**.
