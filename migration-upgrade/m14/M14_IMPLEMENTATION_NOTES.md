# Milestone 14 — Implementation Notes: Release Candidate & Migration Rehearsal

**Document ID:** `JQ2-M14-NOTES-001`  
**Milestone:** `M14 — Release Candidate & Migration Rehearsal`  
**Branch:** `feature/m14-release-candidate-migration-rehearsal`  
**Date:** 2026-09-28  
**Status:** COMPLETE (Ready for RC Audit)  

---

## 1. Scope & Architectural Context

Milestone 14 establishes the **Feature Freeze** for JobQuest 2.0 and executes the first full-scale, safe rehearsal of legacy data migration from JobQuest 1.0. All normal feature development is frozen; only release blockers, security defects, migration defects, or production-readiness issues may modify executable code.

### Critical Architecture Corrections Upheld
1. **Legacy Production Database Confirmation:** Verified and confirmed that JobQuest 1.0 production runs on **PostgreSQL hosted on Neon** (using Node.js with `pg` raw parameterized SQL across migrations 001 through 013). SQLite exists solely as a backup and local test fixture format.
2. **Rehearsal Tooling Genesis:** The previously assumed `scripts/migrate-legacy-data.mjs` was absent at the M13 HEAD. M14 designed, implemented, and verified this migration engine from scratch with robust safety locks, deterministic 13-stage workflow decomposition, idempotent existence checks, and clean rollback mechanics.
3. **Strict Non-Production Target Guarantee:** All migration rehearsals executed exclusively against isolated non-production workspaces (`018f0000-0000-4000-8000-000000000001` and `018f0000-0000-4000-8000-000000000002`). Production infrastructure was never contacted.
4. **Option B Security Model Invariant:** Legacy PIN hashes are permanently retired. Zero PIN hashes or plaintext PINs were migrated. User accounts were staged, profiles linked with `legacy_user_id`, and single-use claim codes generated with SHA-256 hashes and 90-day expiration.

---

## 2. Implemented Components & Tooling

### 2.1 Database Migrations (`20261020100000_m14_legacy_migration_rehearsal.sql`)
- `profiles.legacy_user_id`: Integer column with unique constraint and partial index (`WHERE legacy_user_id IS NOT NULL`) for deterministic legacy user mapping.
- `applications.legacy_id`: Integer column and partial index (`WHERE legacy_id IS NOT NULL`) for deterministic application matching alongside M4, M5, M6, M7, M8, M11, M13 domain tables.
- `public.legacy_claim_codes`: Dedicated table storing single-use claim tokens for legacy user onboarding (columns: `id`, `user_id`, `code_hash`, `code_hint`, `expires_at`, `claimed_at`, `created_at`). RLS enabled with authenticated privileges.
- `public.migration_batches`: Auditable record of migration execution runs (source system, target workspace ID, status, started/completed timestamps).
- `public.migration_id_mappings`: Dual-storage registry mapping `(source_table, legacy_id)` to `(target_table, target_id)` with unique index `uq_migration_source_table_id`.
- Applied locally via `supabase migration up` and to hosted dev (`jobquest-dev` `xpnkasclquplmrcmhsif`) via `supabase db push`.

### 2.2 Migration Engine (`scripts/migrate-legacy-data.mjs`)
- **Safety Locks (`assertSafeTarget`)**:
  - Rejects connection strings matching production domains (e.g. `supabase.co` without dev indicator, `neon.tech`, or missing `--confirm-non-production`).
  - Requires explicit confirmation flag.
- **Workflow Decomposition (`mapLegacyStage`)**:
  - Decomposes legacy single-string stages into orthogonal `(stage, status, outcome, closure_reason, eventType)`.
  - Maps `Saved`/`Preparing` $\rightarrow$ `BOOKMARK`/`OPEN`.
  - Maps `Applied` $\rightarrow$ `APPLIED`/`OPEN`.
  - Maps `Assessment`/`Recruiter Screen` $\rightarrow$ `ASSESSMENT`/`RECRUITER_SCREEN`/`OPEN`.
  - Maps `Interview`/`Final Interview` $\rightarrow$ `INTERVIEW`/`FINAL_INTERVIEW`/`OPEN`.
  - Maps `Offer` $\rightarrow$ `OFFER`/`OPEN`.
  - Maps `Accepted` $\rightarrow$ `OFFER`/`CLOSED`/`ACCEPTED`.
  - Maps `Rejected` $\rightarrow$ `APPLIED`/`CLOSED`/`REJECTED`.
  - Maps `Withdrawn` $\rightarrow$ `APPLIED`/`CLOSED`/`WITHDRAWN`/`GENERAL_WITHDRAWAL`.
  - Maps `Ghosted` $\rightarrow$ `APPLIED`/`CLOSED`/`GHOSTED`.
  - Maps `Position Closed` $\rightarrow$ `APPLIED`/`CLOSED`/`POSITION_CLOSED`.
- **Note / Journal Mapping (`mapLegacyNoteType`)**:
  - Maps `reflection` $\rightarrow$ `POST_MORTEM`.
  - Maps `interview` $\rightarrow$ `INTERVIEW_PREP`.
  - Maps `company_research` $\rightarrow$ `STRATEGY`.
  - Maps `daily_journal` $\rightarrow$ `REFLECTION`.
  - Maps `general` / default $\rightarrow$ `NOTE`.
- **Contact Normalization**: Maps relationship types to valid database check constraint values (`'RECRUITER'`, `'HIRING_MANAGER'`, `'REFERRAL'`, `'INTERVIEWER'`, `'PEER'`, `'CONTACT'`).
- **Task Recurrence Normalization (`mapLegacyRecurrence`)**: Normalizes case-insensitive recurrence strings to `'DAILY'`, `'WEEKDAYS'`, `'WEEKLY'`, `'BIWEEKLY'`, `'MONTHLY'`.
- **Idempotency**: Every entity checks `public.migration_id_mappings` and workspace unique constraints prior to insertion.
- **Rollback Tooling (`rollbackMigration`)**: Safely purges child records, cascades workspace deletion, cleans up claim codes, and removes staged legacy accounts without affecting regular users or workspaces.

### 2.3 Comprehensive Test Fixture (`tests/fixtures/legacy-representative-export.json`)
- Authored exhaustive 1,000+ line JSON fixture representing a complete legacy JobQuest 1.0 PostgreSQL export.
- Covers all 33 legacy tables: users, applications (all 13 stages), job snapshots, notes (all 4 note types), contacts, interviews, tasks, follow-ups, habits, habit logs, daily goals, resumes, and extension tokens.

### 2.4 TypeScript Ambient Declarations & Typing
- Authored `tests/ambient.d.ts` and `scripts/migrate-legacy-data.d.ts` providing full type definitions for `runMigration`, `rollbackMigration`, `MigrationReport`, and mapping functions.

---

## 3. Quality Gate Execution Summary

| Gate | Command | Result | Metrics |
|---|---|:---:|---|
| **Lint** | `pnpm lint` | **PASS** | 0 errors, 0 warnings across all files |
| **Typecheck** | `pnpm typecheck` | **PASS** | 0 errors across `api`, `web`, `extension`, `tests` |
| **Unit Tests** | `pnpm test:unit` | **PASS** | 19 suites, 149/149 tests passed (100%) |
| **Extension Tests** | `pnpm test:extension` | **PASS** | 3 suites, 27/27 tests passed (100%) |
| **Integration Tests** | `pnpm test:integration` | **PASS** | 15 suites, 165/165 tests passed (100%) |
| **Rehearsal Suite** | `tests/integration/m14-migration-rehearsal.test.ts` | **PASS** | 5/5 tests (Dry-run, Live, FKs, Idempotency, Rollback) |
| **Parity Suite** | `tests/integration/m14-migrated-data-parity.test.ts` | **PASS** | 10/10 tests (Global search, Journal, Funnel, Isolation) |
| **Bundle Scan (Local)** | `pnpm check:bundle` | **PASS** | 3 files, 0 secret findings |
| **Bundle Scan (Ext)** | `pnpm check:extension` | **PASS** | 40 files, 0 secret findings |
| **Bundle Scan (Tracked)**| `pnpm check:secrets` | **PASS** | 825 files, 0 secret findings |
| **Monorepo Build** | `pnpm build` | **PASS** | Vite production bundle built in 333ms |
| **Vercel Preview RC** | `vercel deploy --yes` | **PASS** | Deployed `dpl_Bt72bHx6a13C1dtxmUCkWin9qshT` (READY) |
| **Preview Secret Scan** | `node scratch/scan-m14-preview-bundle.mjs`| **PASS** | 4 files, 0 secret findings |
| **Playwright E2E RC** | `e2e/m14-release-candidate.spec.ts` | **PASS** | 1/1 passed, 5 visual evidence screenshots captured |
| **Axe Accessibility** | `@axe-core/playwright` on Preview | **PASS** | 0 critical, 0 serious, 0 blocking violations |

---

## 4. Branch State & Merge Prohibition

- **Branch:** `feature/m14-release-candidate-migration-rehearsal`
- **Main Branch:** Untouched.
- **Development Branch:** Untouched after M13 merge verification.
- **Production Infrastructure:** Untouched.
- **JobQuest 1.0 Repository:** Untouched (READ-ONLY).
- **Milestone 15:** NOT started.
