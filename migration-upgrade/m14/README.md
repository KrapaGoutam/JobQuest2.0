# Milestone 14 — Release Candidate & Migration Rehearsal

**Milestone:** M14  
**Feature Branch:** `feature/m14-release-candidate-migration-rehearsal`  
**Status:** IN PROGRESS (FEATURE FREEZE IN EFFECT)  
**Parent Merge Commit (development):** `93ba287fbbe3b70e94930ea8b2bf065b145768d8`  
**Parent CI Status:** Run `36421640993` (SUCCESS)  
**Proposed RC Version:** `v2.0.0-rc.1` (Untagged until final approval)  

---

## 1. Executive Summary & Objectives

Milestone 14 is the pivotal hardening and rehearsal gateway between feature development and production launch. With the completion and formal merge of Milestone 13, JobQuest 2.0 enters **FEATURE FREEZE**.

The core objectives of Milestone 14 are:
1. **Feature Freeze Enforcement:** Zero ordinary new features. Strictly blockers, security defects, migration defects, P0/P1 parity defects, a11y launch blockers, and severe performance defects.
2. **Authoritative Legacy Source Audit:** Ground all migration planning on the verified legacy JobQuest 1.0 PostgreSQL database (hosted on Neon, migrations 001–013), dispelling stale SQLite-as-production assumptions.
3. **Idempotent & Safe Migration Tooling:** Implement `scripts/migrate-legacy-data.mjs` with full dry-run, validation mode, safe workspace routing, batching, and environment protections that prevent targeting production.
4. **End-to-End Migration Rehearsal:** Execute a full migration rehearsal against a non-production isolated target using representative legacy data without touching live production.
5. **Rigorous Dual Reconciliation:** Reconcile row counts (100% account of source, eligible, migrated, skipped, target) and foreign key integrity (zero orphan entities across applications, contacts, interviews, notes, tasks, habits, and documents).
6. **Application Parity & Search Indexing on Migrated Data:** Validate that migrated records populate dashboard KPIs, applications board/list, Global Search (`rpc_global_search`), career journal, contacts, and analytics smoothly without cross-tenant leakage.
7. **Rollback Rehearsal:** Prove that migrated tenant data can be cleanly removed/isolated without affecting existing development data.
8. **Release Candidate (RC) Packaging & Preview Deployment:** Cut `v2.0.0-rc.1`, execute full regression suites, security sweeps, a11y audits, and deploy non-production preview to Vercel (`one-piece-5779` / `jobquest2`).
9. **Production & Cutover Runbooks:** Author comprehensive, non-secret runbooks for cutover, backup, rollback, and smoke verification in preparation for Milestone 15.
10. **Final Handoff with M14 Unmerged:** Leave `feature/m14-release-candidate-migration-rehearsal` clean and pushed for user review; do NOT deploy production, do NOT touch main, and do NOT retire JobQuest 1.0.

---

## 2. Directory Structure & Documentation Artifacts

This directory contains the complete source of truth for M14:

| File | Purpose |
|---|---|
| [`README.md`](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m14/README.md) | Executive overview, milestone lifecycle, and navigation index. |
| [`IMPLEMENTATION_PLAN.md`](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m14/IMPLEMENTATION_PLAN.md) | Detailed step-by-step technical execution plan across 8 phases. |
| [`TEST_PLAN.md`](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m14/TEST_PLAN.md) | Unit, integration, E2E, a11y, performance, and reconciliation test plan. |
| [`ACCEPTANCE_CRITERIA.md`](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m14/ACCEPTANCE_CRITERIA.md) | Formal pass/fail criteria for RC readiness and rehearsal completion. |
| [`MIGRATION_SOURCE_AUDIT.md`](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m14/MIGRATION_SOURCE_AUDIT.md) | Exhaustive audit of JobQuest 1.0 schema (all 33 tables, Neon vs SQLite). |
| [`MIGRATION_MAPPING_FINAL.md`](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m14/MIGRATION_MAPPING_FINAL.md) | Definitive field-level mapping, stage decomposition, and ID mapping. |
| [`REHEARSAL_RUNBOOK.md`](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m14/REHEARSAL_RUNBOOK.md) | Step-by-step instructions for running the migration rehearsal. |
| [`ROLLBACK_RUNBOOK.md`](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m14/ROLLBACK_RUNBOOK.md) | Rollback triggers, containment steps, and cleanup verification. |
| [`PRODUCTION_READINESS_CHECKLIST.md`](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m14/PRODUCTION_READINESS_CHECKLIST.md) | Launch readiness assessment across infra, security, perf, and ops. |
| [`RECONCILIATION_SPEC.md`](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m14/RECONCILIATION_SPEC.md) | Formulaic validation rules, count balances, and FK queries. |
| [`SMOKE_TEST_PLAN.md`](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m14/SMOKE_TEST_PLAN.md) | Non-destructive production & rehearsal smoke test suite. |

---

## 3. Strict Boundary Rules

1. **NO Production Deployment:** Do not trigger Vercel `--prod`, alter DNS, or touch production records.
2. **NO Production Database Provisioning:** Do not create or configure a paid Supabase production project during M14 without explicit instruction.
3. **NO Production Data Export:** Do not connect to or export live Neon production DB without explicit authorization.
4. **NO Main Branch Modification:** Do not merge to `development` or `main`.
5. **NO JobQuest 1.0 Retirement:** Legacy system remains active, authoritative, and completely unmodified (READ ONLY).
6. **NO Git Tag Creation:** Prepare `v2.0.0-rc.1` in documentation and configuration; do not push git tags unless explicitly requested.
