# Milestone 14 — Acceptance Criteria & Release Gate

**Document ID:** `JQ2-M14-AC-001`  
**Milestone:** M14 — Release Candidate & Migration Rehearsal  
**Status:** ACTIVE SPECIFICATION  
**Date:** 2026-09-28  

---

## 1. M14 Gate Verification Checklist

To achieve Milestone 14 sign-off, every criterion in this matrix must be fulfilled and accompanied by auditable evidence.

| Gate Category | Ref ID | Acceptance Criterion | Verification Method | Status |
|---|---|---|---|---|
| **Pre-Flight** | **AC-01** | M13 branch merged into `development` via `--no-ff` with green CI. | Git commit log and GitHub Actions Run `36421640993`. | **PASSED** |
| **Governance** | **AC-02** | FEATURE FREEZE established; zero ordinary new features added during M14. | Repository git log & diff inspection. | **ACTIVE** |
| **Audit** | **AC-03** | Legacy JobQuest 1.0 production source verified as PostgreSQL on Neon (migrations 001–013; 33 tables). | `MIGRATION_SOURCE_AUDIT.md` and legacy source inspection. | **PASSED** |
| **Tooling** | **AC-04** | Migration script `scripts/migrate-legacy-data.mjs` implemented, audited, with `--dry-run` and production safety lock. | Code review and unit test `m14-migration-logic.test.ts`. | **PENDING** |
| **Rehearsal** | **AC-05** | Migration rehearsal executed successfully against isolated non-production target. | Execution logs in `migration-upgrade/m14/evidence/`. | **PENDING** |
| **Reconciliation**| **AC-06** | 100% row count reconciliation across all migrated domains (Source = Target + Skipped). | SQL balance verification queries in `M14_RECONCILIATION_REPORT.md`. | **PENDING** |
| **Integrity** | **AC-07** | Foreign key reconciliation: exactly 0 orphan entities across applications, contacts, interviews, notes, tasks, events. | Deterministic orphan query sweep. | **PENDING** |
| **Identity** | **AC-08** | Legacy users mapped to `user_accounts` and `profiles` with claim codes. Legacy PINs permanently retired (NEVER migrated as passwords). | Target database query verifying `pin_hash` absence. | **PENDING** |
| **Workflows** | **AC-09** | 13-stage legacy workflow decomposed into `(stage, state, outcome, closure_reason)` with backfilled events. | Data inspection across all migrated application rows. | **PENDING** |
| **Journal** | **AC-10** | Legacy notes migrated into `journal_entries` preserving type, title, markdown body, and application link. | Parity query comparing legacy notes to `journal_entries`. | **PENDING** |
| **Tasks/Habits**| **AC-11** | Legacy tasks, reminders, follow-ups consolidated into `tasks`; habits and logs migrated with intact streaks. | Row count balance and date validation. | **PENDING** |
| **Search** | **AC-12** | Global Search (`rpc_global_search`) successfully indexes and retrieves migrated records without cross-tenant leak. | Integration test `m14-migrated-data-parity.test.ts`. | **PENDING** |
| **Analytics** | **AC-13** | Funnel, pipeline, and stage-duration analytics recompute accurately over backfilled historical events. | Analytics query execution against migrated dataset. | **PENDING** |
| **Rollback** | **AC-14** | Rollback rehearsal executes cleanly, removing migrated rehearsal data without harming existing test records. | Rollback execution log and post-cleanup DB check. | **PENDING** |
| **Regression** | **AC-15** | All existing M1–M13 regression test suites pass with 100% success rate (Unit, Extension, Integration). | `pnpm test:unit`, `pnpm test:extension`, `pnpm test:integration`. | **PENDING** |
| **Accessibility**| **AC-16** | Release Candidate accessibility audit reveals 0 critical and 0 serious Axe-core violations. | Playwright Axe audit report in `m14/evidence/`. | **PENDING** |
| **Performance** | **AC-17** | Dashboard, applications, search, and analytics queries perform within specified latency thresholds. | Benchmark report `M14_PERFORMANCE_REPORT.md`. | **PENDING** |
| **Security** | **AC-18** | Security review passes (RLS isolation, Option B auth, CSRF/XSS, manager boundaries, safe service role handling). | `M14_SECURITY_REVIEW.md`. | **PENDING** |
| **Secrets** | **AC-19** | Automated secret scan across all tracked files, web bundle, extension bundle, and migration evidence finds 0 secrets. | `pnpm check:secrets` and bundle scans. | **PENDING** |
| **Preview** | **AC-20** | Non-production Release Candidate deployed to Vercel preview (`one-piece-5779` / `jobquest2`); health check returns 200. | Vercel deployment URL & preview smoke test. | **PENDING** |
| **Runbooks** | **AC-21** | Production Cutover Runbook, Rollback Runbook, and Smoke Test Plan complete and ready for Milestone 15. | Approved runbook artifacts in `m14/`. | **PENDING** |
| **Boundaries** | **AC-22** | Production database untouched; main branch untouched; JobQuest 1.0 untouched; M14 stopped UNMERGED. | Verification of origin remote state. | **PENDING** |

---

## 2. Hard Release Blocker Definitions

Any occurrence of the following will immediately halt M14 and require remediation:
1. **Unexplained Row Count Discrepancy:** Any mismatch between source eligible count and target migrated count not documented as a deliberate architectural filter.
2. **Orphan Records:** Any migrated application, note, interview, contact, task, or habit log lacking a valid foreign key anchor.
3. **Password / PIN Compromise:** Any attempt to store or migrate legacy PIN hashes into modern authentication passwords.
4. **Cross-Tenant Data Exposure:** Any failure of RLS or Global Search that exposes migrated data to unauthorized users or across workspaces.
5. **Committed Secret / Key:** Any private key, live database URL, service role key, or credential committed to git.
6. **Production Contamination:** Any connection, write, or mutation against the live Neon production database or production Supabase environment.
