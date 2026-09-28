# JOBQUEST2.0 - CURRENT AGENT STATE

## Current Milestone
Milestone 15 — Production Launch & Cutover  
**Phase M15-C: Legacy Neon Backup, Read-Only Export, Real-Schema Reconciliation & Production Migration Pre-Flight (100% COMPLETE & VERIFIED)**  
**Gate Status: Ready for Phase M15-D (Live Production Data Migration & Verification) — PENDING EXPLICIT USER APPROVAL**

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
- **M15-D10 & D11**: Legacy Neon Backup & Write Freeze → Approved, captured, and verified offline in container.
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

## Phase M15-C Verification & Deliverables (100% Complete)
- **External Backup Storage:** `C:\Users\krapa\Documents\Job Search\JobTrackerProjects\_secure-backups\jobquest1\20260928_110500\`
- **Logical Schema Dump:** `legacy_neon_schema_20260928_110500.sql` (67,048 bytes, SHA256: `e04dc17b194b16fbf2f137b55f5cbc7e8e5f81093dd9367906f5e155f8509268`).
- **Full Logical Dump:** `legacy_neon_data_20260928_110500.dump` (261,376 bytes, SHA256: `4c3d0dc9b2d2def3337f8f9b7d751694f753fb6008894018c340fb22f62f5e52`).
- **Offline Docker Restore:** Container `jobquest1_m15c_restore_20260928_110500` (PG 18.6, 999ms, 0 errors, 34 tables, 62 FKs, 0 orphans).
- **Export Artifact:** `legacy_neon_export_20260928_110500.json` (1,819,301 bytes, SHA256: `4fa64c13413d2175b74a74461c3ac4418dbdc2a790c9763599bcbd074f1c9afc`).
- **Schema Reconciliation:**
  - Handled user `jack` (email `NULL`, role `'MANAGER'`, theme `'dark'`, week start `1`).
  - Handled applications progression in `stage` column (`Applied`, `Saved`, `Withdrawn`, `Rejected`).
  - Preserved 36 `'Internship'` applications via native tags without violating target DB check constraint `chk_app_employment_type`.
  - Preserved `salary_range` strings into notes.
  - Classified 2,442 uncompleted boilerplate checklists as `SUPERSEDED_BY_JQ2`.
- **Tooling Enhancements:** Pure transformation layer added to `scripts/migrate-legacy-data.mjs` with `--preflight` CLI support.
- **Local Rehearsal:** Dry-run, live migration (222 apps, 89 snapshots, 533 events, 0 PIN hashes), and rollback verified cleanly.
- **Strictly Read-Only Production Preflight:** Executed against `jobquest-prod` (`kwmnljvyvqvbvimypnmw`) — all 6 checks PASS.
- **Quality Gates:** 358/358 automated tests passing, 0 TypeScript errors, 0 secret findings.

## Next Exact Step: Phase M15-D (Live Production Migration)
**STOP GATE ENFORCED:** Live production migration requires explicit user authorization before execution.
Once authorized:
1. Run live migration tool:
   ```bash
   node scripts/migrate-legacy-data.mjs \
     --source "C:/Users/krapa/Documents/Job Search/JobTrackerProjects/_secure-backups/jobquest1/20260928_110500/legacy_neon_export_20260928_110500.json" \
     --target "$PROD_DATABASE_URL" \
     --workspace "018f0000-0000-4000-8000-000000000001" \
     --report "migration-upgrade/m15/M15D_MIGRATION_REPORT.json"
   ```
2. Reconcile production row counts and foreign keys.
3. Securely output claim codes outside Git.
