# M1 Closeout Investigations (performed at the start of M1B, 2026-09-24)

These investigations were read-only. Sources:
- the prior agent session's recorded tool output (the tool transcript of the M1 session)
- live read-only CLI and API calls

No secrets are reproduced here.

## 1. Unintended `supabase config push` changes on `jobquest-dev`

### Evidence of the pre-push state

The M1 command was `echo n | npx supabase config push --project-ref xpnkasclquplmrcmhsif … | tail -60`. It printed a per-field `local` / `remote` diff, and then applied the changes despite the `n`. Because output was piped through `tail -60`, **only the last 60 lines of the diff were captured**. Fields printed before those lines are unknown.

Captured fields whose **remote (pre-push) value is therefore verified**:

| Field | Pre-push (remote) | Pushed (local) | Intended? |
|---|---|---|---|
| `auth.email.enable_confirmations` | true | false | intended (M1 design) |
| `auth.email.enable_signup` | true | false (later corrected to true) | intended; later fixed |
| `auth.email.max_frequency` | `1m0s` | `1s` | **not intended** (a local CLI default) |
| `auth.email.otp_length` | 8 | 6 | **not intended** |
| `auth.enable_signup` | true | false | intended |
| `auth.hook.custom_access_token.enabled` | false | true | intended (Option A; to be disabled for Option B) |
| `auth.mfa.totp.enroll_enabled` | true | false | **not intended** |
| `auth.mfa.totp.verify_enabled` | true | false | **not intended** |
| `auth.minimum_password_length` | 6 | 10 | intended |
| `auth.site_url` | `http://localhost:3000` | `http://localhost:5173` | intended |
| `storage.analytics.enabled` | true | false | **not intended** |

A second, deliberate push later changed `auth.email.enable_signup` (false → true) and `auth.rate_limit.sign_in_sign_ups` (30 → 1000).

### Values that can be restored with verified prior state

- `auth.mfa.totp.enroll_enabled` = true
- `auth.mfa.totp.verify_enabled` = true
- `auth.email.otp_length` = 8
- `auth.email.max_frequency` = `1m0s`
- `storage.analytics.enabled` = true

### Restoration status: NOT PERFORMED

The Supabase CLI and the claude.ai Supabase connector are now authenticated as a **different Supabase account**:
- orgs `bacmegsdpcxrnfdpglub` "OnePiece" and a Vercel-integration org
- project `the-lineup`

That account cannot read `jobquest-dev`'s configuration: `supabase config diff` returns `Access denied for project xpnkasclquplmrcmhsif`. The current remote values therefore cannot be compared, and nothing was changed. **Unresolved:** the user must re-authenticate the CLI to the JobQuest2.0 Supabase account. After that, restore the five values above with a narrow, reviewable change: the dashboard, or a Management API PATCH of only these fields, not a broad `config push`.

## 2. The vanished `JobQuest2.0` Supabase project

### Facts established

| Time (local session clock, UTC) | Observation |
|---|---|
| 18:52:29 | `supabase orgs list`: three orgs, all named "OnePiece" (`chgypjaigvrmynnvdmhl`, `suxekeljrvzouihbjhup`, `fisaxwdkkdpbamvwkvnm`). `supabase projects list`: exactly one project, **`JobQuest2.0`** (ref `tezddimqfpyljhsaucmx`, org `fisaxwdkkdpbamvwkvnm`, us-west-2, ACTIVE_HEALTHY, `created_at` 16:39:12Z). |
| 18:52:40–18:54:04 | The agent asked whether to reuse it; the user rejected the question and repeated the instruction to create the dev project. |
| 18:55:00–18:55:15 | The agent ran `supabase projects create jobquest-dev --org-id fisaxwdkkdpbamvwkvnm`, which created ref `xpnkasclquplmrcmhsif` (API `created_at` 16:45:31Z). |
| 18:55:37 | `supabase projects list`: exactly one project, `jobquest-dev`. **`JobQuest2.0` is absent.** |
| M1B, now | The CLI and connector are logged in to a different account; neither the `fisaxwdkkdpbamvwkvnm` org nor either JobQuest project is visible. `jobquest-dev`'s public Auth health endpoint returns 200 (the project is alive). |

Observations:
- No command in the agent transcript deleted, paused or transferred any project.
- The API `created_at` values and the local session clock differ by about 2h10m (`jobquest-dev` was created at 18:55 local but reports 16:45Z). By API time, `JobQuest2.0` was created about 6 minutes before `jobquest-dev`, in the same org.
- The project disappeared within about 3 minutes, during which the user was interacting with the session.

### Conclusion

**CAUSE UNKNOWN.** The evidence rules out deletion by the agent's commands and a different org, since both listings were for org `fisaxwdkkdpbamvwkvnm`. It cannot distinguish a user or dashboard deletion, a transfer, or a listing issue. The account-level audit log of the owning account would settle it, but it is not accessible from the currently authenticated account.

## 3. Current infrastructure state (verified read-only)

| Item | State |
|---|---|
| Supabase `jobquest-dev` (`xpnkasclquplmrcmhsif`) | alive (Auth health 200; `disable_signup: true`) |
| Supabase CLI and connector account | **different account** (`the-lineup`); not the JobQuest2.0 account |
| Vercel CLI | `goutamkrapa11-8565`, team `one-piece-5779`, **no projects** |
| Production (Supabase or Vercel) | none |
