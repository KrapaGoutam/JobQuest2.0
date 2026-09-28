# JOBQUEST2.0 - CURRENT AGENT STATE

## Current Milestone
Milestone 15 — Production Launch & Cutover  
**Phase M15-B: Infrastructure Provisioning (100% COMPLETE & VERIFIED)**  
**Gate Status: Ready for Phase M15-C (Legacy Neon Backup & Read-Only Export)**

## Feature Freeze Notice
FEATURE FREEZE IS IN EFFECT. No ordinary new features are permitted. Allowed changes are strictly: launch blockers, security defects, migration defects, production configuration defects, critical P0/P1 regressions, critical accessibility defects, and critical performance defects materially threatening launch. All other items belong in POST_LAUNCH_DEFERRED.md.

## Current Branch
`feature/m15-production-launch-cutover`

## Base Development Commit (M14 Merge)
`5b67c4c630dbd94cbcca8d13058aaa59afa87fe8` (merge: approve M14 release candidate and migration rehearsal)

## Development CI Verification
- **Run ID**: `36432957662`
- **Trigger**: Merge commit `5b67c4c630dbd94cbcca8d13058aaa59afa87fe8` on `development`
- **Status**: SUCCESS (100% Green)

## User Authorizations Summary (Master Decision Gate)
- **M15-D01**: Supabase Plan → Free approved.
- **M15-D02**: Vercel Plan → Hobby approved.
- **M15-D03**: Dedicated Supabase Prod Project → Created `jobquest-prod` (`kwmnljvyvqvbvimypnmw`) under `OnePiece`.
- **M15-D04**: Existing Vercel Project → Target `jobquest2` approved.
- **M15-D05**: Production Origin → `https://jobquest2.vercel.app` approved.
- **M15-D06**: Key Custody → Vercel Sensitive Environment Variables approved & configured.
- **M15-D07**: Smoke Account → `smoke-tester` & workspace `00000000-0000-4000-8000-000000000001` provisioned & verified.
- **M15-D08 & D09**: Rate Limiting & Auth Cleanup → Application-layer + Supabase Auth rules configured.
- **M15-D10 & D11**: Legacy Neon Backup & Write Freeze → Approved; awaiting connection URI for execution.
- **M15-D12**: Live Migration → Approved pending backup verification and final Go/No-Go.
- **M15-D13 & D14**: Main Merge & Vercel --prod → Approved for final cutover gate.
- **M15-D15 & D16**: Extension Origin & Sideload ZIP → Packaged `apps/extension/dist/jobquest-capture-prod.zip`.
- **M15-D17 & D18**: Go/No-Go & Rollback Criteria → Formally established.
- **M15-D19**: Stabilization Period → 14-day standby approved.
- **M15-D20**: JobQuest 1.0 Retirement → Strictly NOT AUTHORIZED until post-stabilization separate approval.

## Provisioned Production Infrastructure (Phase M15-B Evidence)
- **Supabase Project**: `jobquest-prod` (Ref `kwmnljvyvqvbvimypnmw`, AWS `us-east-1`, Org `OnePiece` `bacmegsdpcxrnfdpglub`).
- **Database Migrations**: 18/18 migrations through `20261020100000_m14_legacy_migration_rehearsal.sql` applied cleanly and verified in `supabase_migrations.schema_migrations`.
- **Auth Signing Key (Option B)**:
  - Active key ID: `48e903e8-b681-4e81-9204-8747e2b893c4` (ES256, P-256).
  - Verified active in Supabase public JWKS (`https://kwmnljvyvqvbvimypnmw.supabase.co/auth/v1/.well-known/jwks.json`).
  - Private key vaulted securely in Vercel Sensitive Environment Variables.
- **Auth Settings**:
  - `site_url`: `https://jobquest2.vercel.app`
  - `uri_allow_list`: `https://jobquest2.vercel.app/**`
  - MFA TOTP enroll/verify enabled; OTP length = 8; max frequency = 60s.
- **Smoke Identity & Validation**:
  - User: `smoke-tester` (`b763f0f9-bee2-406c-805b-ecf06bf97cac`)
  - Workspace: `00000000-0000-4000-8000-000000000001` (`"Production Smoke Workspace"`)
  - PostgREST Verification: Option B JWT minted and validated with HTTP 200 OK.
- **Vercel Production Environment (`jobquest2`)**:
  - 10 production environment variables set (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `JQ_JWT_PRIVATE_JWK`, `JQ_JWT_ISSUER`, `APP_ORIGINS`, `EXTENSION_TOKEN_PEPPER`, `NODE_OPTIONS`).
- **Extension Sideload Package**:
  - `apps/extension/dist/jobquest-capture-prod.zip` built and verified (0 secret findings).

## Next Exact Step
Execute Phase M15-C (Legacy Neon Backup & Read-Only Export):
- Request operator to supply the legacy JobQuest 1.0 Neon PostgreSQL connection string (or place the verified logical backup export in `backups/` or `scratch/`).
- Execute verified read-only snapshot (`pg_dump`) and SHA-256 checksum.
- Extract legacy records in a read-only transaction.
- Proceed to Phase M15-D (Live Migration) upon backup verification.
