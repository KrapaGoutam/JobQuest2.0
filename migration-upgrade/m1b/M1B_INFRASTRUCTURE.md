# M1B Infrastructure

Only DEV resources exist. **No production project exists anywhere. No Vercel project was created.** Nothing is linked to JobQuest1.0.

## 1. Verified state (2026-09-24, read-only checks)

| Item | State | How verified |
|---|---|---|
| Supabase `jobquest-dev` (ref `xpnkasclquplmrcmhsif`, org `fisaxwdkkdpbamvwkvnm`, us-west-2) | Alive: Auth health 200, `disable_signup: true` | Public Auth endpoints with the publishable key |
| `jobquest-dev` schema | **M1 migration only.** The M1B migration was **not** pushed (hosted work is held at the checkpoint below) | Migration history in the repo; no push performed |
| Supabase CLI and claude.ai Supabase connector | Authenticated as a **different Supabase account** (org `bacmegsdpcxrnfdpglub` "OnePiece" plus a Vercel-integration org; only project `the-lineup`). No access to `jobquest-dev`: `supabase config diff` → "Access denied" | `supabase orgs list`, `projects list`, connector `list_organizations` / `list_projects` |
| Other Supabase projects | `the-lineup` belongs to the other account. **Not touched.** The previously seen `JobQuest2.0` (`tezddimqfpyljhsaucmx`) is not visible (cause unknown; see `../m1/M1_CLOSEOUT_INVESTIGATIONS.md` §2) | same |
| Vercel | CLI account `goutamkrapa11-8565`, team `one-piece-5779`, **0 projects** | `vercel whoami`, `vercel project ls` |
| Production | none | same |
| Local Supabase stack (M1B proof) | Docker; project_id `JobQuest2.0`; ports **553xx** (another local project, `restaurant-roster`, occupies 543xx and was left running untouched); trusts a generated ES256 key (`supabase/signing_keys.json`, gitignored) | `supabase start`, `pnpm local:env` |
| CI | `M1B CI` workflow (`.github/workflows/m1b-ci.yml`). Disposable local stack plus an ephemeral key per run; no repository secrets | Run `36053855534` |

## 2. Supabase dev configuration changes

- **M1B made no hosted configuration changes.** No `config push` was run.
- `supabase/config.toml` changed in the repo only:
  - The local signing key path.
  - The Option A hook disabled.
  - The email provider off.
  - `sign_in_sign_ups` back to 30.
  - Ports moved to 553xx.
  - The five values below set to the verified pre-M1 hosted values, so a future push cannot silently change them again.

### Unintended M1 config-push changes: restoration status

Prior values come from the M1 transcript's captured diff (`../m1/M1_CLOSEOUT_INVESTIGATIONS.md` §1).

| Setting | Before M1 (verified) | Now on hosted (per M1 push) | Restored? |
|---|---|---|---|
| `auth.mfa.totp.enroll_enabled` | true | false | **No, blocked:** no access with the current CLI account |
| `auth.mfa.totp.verify_enabled` | true | false | No, blocked |
| `auth.email.otp_length` | 8 | 6 | No, blocked |
| `auth.email.max_frequency` | `1m0s` | `1s` | No, blocked (also unintended; found in the diff) |
| `storage.analytics.enabled` | true | false | No, blocked |

Settings the M1 diff output did not capture (it was truncated by `tail -60`) remain **unknown** and were not guessed.

## 3. Signing-key checkpoint (§30), awaiting user decision

| | |
|---|---|
| **Current state** | **Unverified.** The JWT signing-key state of `jobquest-dev` cannot be read with the currently authenticated account. It will be recorded before any change. |
| **Planned action** | 1. `pnpm local:key`-equivalent: generate an ES256 private JWK **outside the repo**. Store it only in the gitignored `.env.local` as `JQ_JWT_PRIVATE_JWK` (later a Vercel sensitive env var). 2. Dashboard → Project Settings → JWT Keys → **create a standby key by importing that private key** (kid preserved). 3. Wait for the ~5-minute state-change throttle. 4. **Rotate keys**: the imported key becomes *current*; the existing current key becomes *previously used* and **stays trusted**. 5. **Do not revoke** any existing key and **do not touch** the legacy JWT secret or the `anon`/`service_role` legacy keys. |
| **Effect** | The Data API accepts JobQuest-minted access tokens. Supabase Auth (GoTrue) signs any *new* GoTrue-issued JWTs with the imported key. JobQuest does not use GoTrue, and GoTrue tokens carry `auth.sessions` session ids that `app.session_is_active()` rejects, so they get no JobQuest data. Publishable and secret API keys are unaffected (they are not JWTs). Existing previously-issued tokens stay valid until expiry. |
| **Rollback** | Per the documented key lifecycle: move the previous key from *previously used* to *standby*, then **Rotate** back (every action except deletion is reversible; ~5-minute throttle each). The imported key can then be revoked. Nothing is deleted in the forward plan. |
| **Other auth behavior affected?** | Only Supabase Auth's own token signing, which JobQuest no longer uses. Remaining Option A test identities in `auth.users` (OQ-028) could still obtain GoTrue tokens only if the email provider were re-enabled; it will be disabled in the same session. |
| **Also required** | Re-authenticate the Supabase CLI to the JobQuest2.0 account (OQ-026). Push migration `20260924200000_m1b_option_b_auth.sql` to `jobquest-dev` (`supabase db push`, after verifying branch, ref and DEV). Then run `M1B_ENV_FILE=.env.local pnpm test:integration` and the e2e spec. |

**Nothing in this table has been executed.**

## 4. Environment variables (names only)

- Web: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- API (server only):
  - `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, **`JQ_JWT_PRIVATE_JWK`**, `JQ_JWT_ISSUER`, `APP_ORIGINS`
  - Session and hashing: `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS`, `SESSION_MAX_SECONDS`, `PASSWORD_ARGON2_*`
  - Rate limits: `RATE_LIMIT_STORE`, `LOGIN_*`, `REGISTER_*`, `RECOVERY_*`, `PASSWORD_CHANGE_MAX_PER_HOUR`, `AUTH_FAILURE_FLOOR_MS`
- Tooling: `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL`
- Test harness: `M1B_ENV_FILE`, `M1B_TARGET`, `M1_BASE_URL`, `M1_BYPASS`

Local files (gitignored):
- `.env.local`: hosted dev; does not yet contain `JQ_JWT_PRIVATE_JWK`.
- `.env.m1b-local`: local stack.
- `supabase/signing_keys.json`: local key.
