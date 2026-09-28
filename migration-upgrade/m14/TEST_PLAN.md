# Milestone 14 — Comprehensive Test Plan

**Document ID:** `JQ2-M14-TEST-001`  
**Milestone:** M14 — Release Candidate & Migration Rehearsal  
**Status:** APPROVED  
**Date:** 2026-09-28  

---

## 1. Scope & Test Levels

Milestone 14 validates two distinct vectors:
1. **Migration Tooling & Data Reconciliation:** Accuracy, safety, and idempotency of the legacy data migration tool.
2. **Release Candidate (RC) System Integrity:** Full regression, security, performance, accessibility, and E2E validation of the complete JobQuest 2.0 system.

```
+-----------------------------------------------------------------------------------+
|                            M14 TEST ARCHITECTURE                                  |
+-----------------------------------------------------------------------------------+
|  1. Migration Unit Tests         | Pure mapping functions, stage decomposition    |
|  2. Migration Rehearsal Test     | Live DB rehearsal, row & FK reconciliation     |
|  3. Migrated Data Parity Tests   | Search, Journal, Analytics, Multi-tenant RLS   |
|  4. Rollback Verification Test   | Workspace isolation & non-destructive cleanup  |
|  5. Full Regression Suites       | Unit (123+), Extension (27+), Integration (150+)|
|  6. Release Candidate E2E & A11y | Playwright cross-browser, Axe-core audit       |
|  7. Performance Benchmark        | Query latency, page loads, migration throughput|
|  8. Security & Secret Audits     | Option B RLS, token scopes, zero secrets scan   |
+-----------------------------------------------------------------------------------+
```

---

## 2. Test Suites Detailed Specifications

### 2.1 Suite 1: Migration Logic Unit Tests (`tests/unit/m14-migration-logic.test.ts`)
* **Test Case M14-U01:** Deterministic 13-stage legacy mapping decomposition (all 13 values mapped to correct stage, state, outcome, closure reason).
* **Test Case M14-U02:** Option B claim code generator (entropy check, SHA-256 hashing, expiration window).
* **Test Case M14-U03:** Timestamp parsing & UTC normalization (ISO strings, SQLite text dates, timezone preservation).
* **Test Case M14-U04:** Legacy notes to journal entry transformation (type mapping, title defaulting, markdown body preservation).
* **Test Case M14-U05:** Task & reminder consolidation (task types, status mapping, recurrence rules).
* **Test Case M14-U06:** Habit log consolidation and idempotent key generation.
* **Test Case M14-U07:** Safety guard test (refuse execution if target URL contains production keywords or lacks explicit confirmation).

### 2.2 Suite 2: Migration Rehearsal & Reconciliation Integration Test (`tests/integration/m14-migration-rehearsal.test.ts`)
* **Test Case M14-I01:** Dry-run execution produces structured validation report without database mutations.
* **Test Case M14-I02:** Live rehearsal against isolated rehearsal workspace (`018f0000-0000-4000-8000-000000000001`).
* **Test Case M14-I03:** Row count balance verification across all migrated domains (Source = Target + Skipped).
* **Test Case M14-I04:** Foreign key relationship verification (0 orphan entities across applications, contacts, interviews, notes, tasks).
* **Test Case M14-I05:** Idempotency test (re-running migration causes zero duplicates and zero constraint errors).
* **Test Case M14-I06:** Option B user verification (legacy user created in profiles; claim code recorded; NO pin_hash in target).

### 2.3 Suite 3: Migrated Data Parity & Global Search Test (`tests/integration/m14-migrated-data-parity.test.ts`)
* **Test Case M14-I07:** Global Search (`rpc_global_search`) locates migrated applications, contacts, notes, and interviews.
* **Test Case M14-I08:** Analytics queries (funnel, pipeline, time-in-stage) execute cleanly over backfilled `application_events`.
* **Test Case M14-I09:** Career Journal workbench displays migrated notes with correct filters and pinned status.
* **Test Case M14-I10:** Workspace isolation (migrated user cannot view other tenant workspaces; manager can review team applications).

### 2.4 Suite 4: Rehearsal Rollback Test
* **Test Case M14-I11:** Workspace cleanup script removes `"JobQuest (Migrated)"` and all associated records.
* **Test Case M14-I12:** Non-migrated existing test data in development database is verified completely intact.

### 2.5 Suite 5: Full Existing Regression Sweep
* All 123+ unit tests in `tests/unit/`.
* All 27+ extension tests in `extension/tests/`.
* All 150+ integration tests across M1B, M3, M4, M5, M6, M7, M8, M9, M10, M11, M12, M13.
* Extension package and bundle scan.
* Code formatting and static type checking (`pnpm lint`, `pnpm typecheck`).

### 2.6 Suite 6: E2E Browser & Accessibility Audit
* Playwright E2E test verifying:
  - Login / account claim flow
  - Applications board and list
  - Global Search modal (`Cmd+K`)
  - Career Journal workbench
  - Analytics reports
  - Dark mode and responsive mobile viewports
* Automated accessibility audit with `@axe-core/playwright`:
  - **Threshold:** 0 critical, 0 serious accessibility violations.

### 2.7 Suite 7: Performance Benchmarking
* Database query execution times for:
  - Dashboard load (`< 150ms`)
  - Applications board with 50+ cards (`< 200ms`)
  - Global Search multi-domain query (`< 100ms`)
  - Analytics funnel calculation (`< 250ms`)
* Migration tool throughput:
  - Target throughput: `> 25 records/sec` during rehearsal.

### 2.8 Suite 8: Security & Secret Scan
* Strict zero-secret policy across:
  - All tracked files in repository
  - Web client bundle (`apps/web/dist`)
  - Extension build bundle (`extension/dist`)
  - Migration scripts and evidence files
  - Deployed Vercel preview bundle
