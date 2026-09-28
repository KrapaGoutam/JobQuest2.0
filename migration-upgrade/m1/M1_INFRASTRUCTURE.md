# M1 — Infrastructure

Only **development** infrastructure was created. Nothing was created or configured for production. Nothing is linked to JobQuest1.0.

## Supabase

| Item | Value |
|---|---|
| Account switched to the new JobQuest2.0 account | YES |
| Organization | `fisaxwdkkdpbamvwkvnm` |
| Project | `jobquest-dev` (ref `xpnkasclquplmrcmhsif`), region us-west-2. **DEV only** |
| Linked from the repo | yes (`supabase link`; link state lives in the gitignored `supabase/.temp/`) |
| Migration applied | `supabase/migrations/20260924120000_m1_foundation.sql` |
| Auth config pushed | from `supabase/config.toml` (`supabase config push`) |
| Production project | **not created** |

**Observations:**

- An earlier listing on the account showed a project named `JobQuest2.0` (ref `tezddimqfpyljhsaucmx`). It was absent from a later listing. I did **not** delete it; the user should confirm what happened to it.
- Side effects of `supabase config push`: it applied 14 settings to `jobquest-dev` even though the confirmation prompt was answered "n". Beyond the intended auth settings, this set **TOTP MFA off**, **OTP length 8 → 6** and **storage analytics off**, because those are the values in the local `config.toml`. The project is dev-only and holds test data only. Review these before any future push.
- Hosted behaviour: `[auth.email] enable_signup = false` **disables the email provider entirely**, which breaks password sign-in with the alias email ("Email logins are disabled"). The committed config keeps the global `[auth] enable_signup = false` (public sign-up is blocked, as proven in T01) and `[auth.email] enable_signup = true`.
- `[auth.rate_limit] sign_in_sign_ups` was raised to 1000 per 5 min. GoTrue sees every login as coming from the façade's IP (it ignores X-Forwarded-For), so the default throttled valid users globally (T10). Per-IP and per-account limits are enforced in the façade.

## Vercel

| Item | Value |
|---|---|
| Account switched to the new account | YES |
| Team | `one-piece-5779` |
| Project created | **NO** |
| Preview deployed | **NO** |
| Production | **not configured** |

The project and preview were intentionally not created. The T03 hard fail requires stopping Option A product implementation, and deploying the Option A façade would extend it. `vercel.json` and `api/index.ts` are ready for a preview if one is approved later.

## GitHub

- Repo `KrapaGoutam/JobQuest2.0`. Branch `feature/m1-foundation-auth-spike`.
- The `M1 CI` workflow is at `.github/workflows/m1-ci.yml`. The integration job starts a **disposable local** Supabase stack on the runner and needs no repository secrets.

## Environment variables (names only)

Web (public): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`

Façade (server only): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `APP_ORIGINS`, optional rate-limit overrides (`LOGIN_*`, `REGISTER_*`, `RECOVERY_*`, `AUTH_FAILURE_FLOOR_MS`)

Tooling (local only): `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL`

Real values live only in the gitignored `.env.local`. `.env.example` lists the names. The secret key is never referenced by `apps/web`.
