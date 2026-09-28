# Milestone 14 — Implementation Plan: Release Candidate & Migration Rehearsal

**Document ID:** `JQ2-M14-PLAN-001`  
**Milestone:** M14  
**Feature Branch:** `feature/m14-release-candidate-migration-rehearsal`  
**Proposed Version:** `v2.0.0-rc.1`  
**Status:** APPROVED FOR EXECUTION  
**Date:** 2026-09-28  

---

## 1. Milestone Goals & Strict Guardrails

### 1.1 Core Goals
1. Enforce **FEATURE FREEZE** across the codebase.
2. Build, test, and audit safe, idempotent legacy migration tooling (`scripts/migrate-legacy-data.mjs`).
3. Execute a complete migration rehearsal against an isolated, non-production target using representative legacy data.
4. Execute dual reconciliation: exact row count balance and zero-orphan foreign key verification.
5. Verify application parity, Global Search indexing (`rpc_global_search`), and analytics fidelity on migrated data.
6. Rehearse and verify safe rollback and tenant cleanup.
7. Package Release Candidate (`v2.0.0-rc.1`), execute full regression sweeps (unit, integration, extension, a11y, performance, security, secret scans), and deploy Vercel Preview RC.
8. Stop with M14 clean, verified, and unmerged for final stakeholder review.

### 1.2 Strict Guardrails
* **NO PRODUCTION TARGETING:** Never connect to or export live Neon production DB without explicit user authorization. Never deploy to production Supabase or run Vercel `--prod`.
* **LEGACY REPOSITORY READ ONLY:** `../JobQuest1.0/` remains completely untouched.
* **NO UNCONTROLLED FEATURES:** Zero optional enhancements during M14.
* **DO NOT MERGE MAIN / DEVELOPMENT:** Stop with M14 unmerged.

---

## 2. Phased Technical Execution

### Phase 1: Planning, Freeze & Source Audit (Complete)
- [x] Verify M13 merge into `development` and green CI (Run `36421640993`).
- [x] Cut `feature/m14-release-candidate-migration-rehearsal` and push to origin.
- [x] Establish feature freeze.
- [x] Audit legacy repository (migrations 001–013; confirm 33 tables; confirm Neon PostgreSQL runtime).
- [x] Author comprehensive M14 planning package in `migration-upgrade/m14/`.

### Phase 2: Design & Implement Migration Tooling (`scripts/migrate-legacy-data.mjs`)
- [ ] Create `scripts/migrate-legacy-data.mjs` with modular architecture:
  - Command-line flags: `--source`, `--target`, `--workspace`, `--dry-run`, `--validate-only`, `--batch-size`, `--confirm-non-production`.
  - Production guard: Refuse execution if target connection string contains production keywords or lacks safety flags.
  - Multi-source support: Support reading from PostgreSQL connection or JSON/fixture dump.
  - Domain transformers: Implement deterministic transformation functions for all domains (Users, Workspaces, Applications, Snapshots, Events, Contacts, Interviews, Tasks, Habits, Journal, Documents, Goals, Tags, Preferences).
  - Progress logging & error reporting: Structured JSON reconciliation output written to `migration-upgrade/m14/evidence/`.

### Phase 3: Representative Non-Production Legacy Dataset
- [ ] Construct an authoritative representative legacy dataset based on the audited schema:
  - Multi-user scenarios: 1 standard user, 1 manager user.
  - Complete 13-stage coverage across 25+ diverse applications.
  - Complete entity links: activities, interviews, rejections, contacts, follow-ups, goals, tasks, habits, habit logs, notes, resumes.
  - Boundary cases: UTF-8 characters, multi-line notes, timestamps in varied formats, null optional fields.

### Phase 4: Migration Rehearsal Execution
- [ ] Run dry-run validation (`--dry-run --validate-only`).
- [ ] Run live rehearsal against isolated local Supabase stack or isolated test workspace (`018f0000-0000-4000-8000-000000000001`).
- [ ] Measure migration execution time, throughput, and error count.

### Phase 5: Dual Reconciliation & Integrity Verification
- [ ] Row count balance:
  $$\text{Target Count} = \text{Source Eligible} - \text{Skipped} - \text{Errors} + \text{Pre-existing}$$
- [ ] Foreign key query sweep:
  - 0 orphan applications, 0 orphan contacts, 0 orphan interviews, 0 orphan events.
  - 0 invalid workspace references.
  - 0 orphan tasks or habit logs.
  - 0 invalid journal entries.
- [ ] Timestamp fidelity: Verify created_at and event dates are faithfully preserved without timezone shifting.
- [ ] Option B claim verification: Confirm legacy users have generated claim codes; confirm legacy PIN hashes were NOT migrated.

### Phase 6: Application Parity, Global Search & Analytics on Migrated Data
- [ ] Global Search test: Execute `rpc_global_search` across migrated applications, contacts, journal entries, and interviews.
- [ ] Analytics test: Verify funnel and stage-duration queries run smoothly against backfilled `application_events`.
- [ ] Multi-tenant isolation: Verify manager vs. user visibility within `"JobQuest (Migrated)"` and personal workspaces.

### Phase 7: Rollback / Cleanup Rehearsal
- [ ] Execute tenant cleanup / rollback procedure for rehearsal workspace.
- [ ] Confirm pre-existing test data in the database remains completely unharmed.
- [ ] Re-run rehearsal to confirm 100% idempotency.

### Phase 8: Release Candidate Packaging & Quality Gate Sweep
- [ ] Version declaration: Update docs to `v2.0.0-rc.1`.
- [ ] Run full test suites:
  - Unit tests (`pnpm test:unit`)
  - Extension tests (`pnpm test:extension`)
  - Integration tests (`pnpm test:integration`)
  - Lint & typecheck (`pnpm lint`, `pnpm typecheck`)
  - Bundle & extension scans (`pnpm check:bundle`, `pnpm check:extension`)
  - Secret scan (`pnpm check:secrets`)
- [ ] Deploy Release Candidate Preview to Vercel (`one-piece-5779` / `jobquest2` preview only; no `--prod`).
- [ ] Run Playwright E2E and visual/a11y regression against the deployed preview.
- [ ] Author all M14 closeout reports and handoff.
- [ ] Push to `origin feature/m14-release-candidate-migration-rehearsal`.
- [ ] Stop with M14 unmerged.
