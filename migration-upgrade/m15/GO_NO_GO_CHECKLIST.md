# Milestone 15 — Production Go / No-Go Checklist & Criteria

**Status**: **PRE-FLIGHT AUDIT READY — NO ITEMS PRE-CHECKED WITHOUT EVIDENCE**  
**Milestone**: Milestone 15 — Production Launch & Cutover  
**Branch**: `feature/m15-production-launch-cutover`  
**Governing Standard**: Strict binary verification; any single `NO` aborts cutover

---

## 1. Production Migration & Cutover Binary Checklist

All 18 checkpoints must be verified with active telemetry and evidence prior to executing cutover:

| Checkpoint | Requirement | Verification Command / Evidence | Status | Verified By |
| --- | --- | --- | --- | --- |
| **CK-01** | User Production Authorization | Explicit approval of `M15-D01` through `M15-D18` in decision gate | `[ ] PENDING` | User |
| **CK-02** | Legacy Neon Backup Completed | Full `pg_dump` compressed archive created (`legacy_neon_data_*.dump`) | `[ ] PENDING` | Lead Engineer |
| **CK-03** | Legacy Neon Backup Verified | SHA-256 checksum calculated; test restore into isolated PostgreSQL succeeded | `[ ] PENDING` | Lead Engineer |
| **CK-04** | Source Migration Level Confirmed | Neon confirmed at migration version `013` with zero pending schema changes | `[ ] PENDING` | Lead Engineer |
| **CK-05** | Source Write Freeze Active | JobQuest 1.0 maintenance banner visible; write traffic halted | `[ ] PENDING` | Lead Engineer |
| **CK-06** | Target Project Initialized | Dedicated `jobquest-prod` Supabase project online in `aws-0-us-west-2` | `[ ] PENDING` | Lead Engineer |
| **CK-07** | Target PITR Enabled | Point-in-Time Recovery and daily snapshots confirmed active on Supabase Pro | `[ ] PENDING` | Lead Engineer |
| **CK-08** | Target Migrations Green | All 18 database migrations applied sequentially without warnings | `[ ] PENDING` | Lead Engineer |
| **CK-09** | Target RLS Policies Active | RLS enabled on all 18 tables; zero unprotected public endpoints | `[ ] PENDING` | Lead Engineer |
| **CK-10** | Target Auth Keys Configured | Production ES256 public key imported into Supabase; private key in Vercel | `[ ] PENDING` | Lead Engineer |
| **CK-11** | Migration Tool SHA Recorded | `scripts/migrate-legacy-data.mjs` matches verified commit `5b67c4c6` | `[ ] PENDING` | Lead Engineer |
| **CK-12** | Migration Dry Run Green | Dry run simulation against production target completed with 0 errors | `[ ] PENDING` | Lead Engineer |
| **CK-13** | Claim Code Handling Ready | Secure operator vault prepared for single-use plaintext claim codes | `[ ] PENDING` | Operator |
| **CK-14** | Reconciliation Queries Ready | Automated reconciliation scripts ([`PRODUCTION_RECONCILIATION_PLAN.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/PRODUCTION_RECONCILIATION_PLAN.md)) staged | `[ ] PENDING` | Lead Engineer |
| **CK-15** | Rollback Runbook Staged | Immediate rollback procedures ([`ROLLBACK_RUNBOOK.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/ROLLBACK_RUNBOOK.md)) verified and ready | `[ ] PENDING` | Lead Engineer |
| **CK-16** | Smoke Identity Pre-Provisioned | `smoke-tester` provisioned in workspace `00000000-0000-4000-8000-000000000001` | `[ ] PENDING` | Lead Engineer |
| **CK-17** | Vercel Production Build Ready | Production candidate built from `main`; zero secret findings across bundles | `[ ] PENDING` | Lead Engineer |
| **CK-18** | Go / No-Go Authority Present | User actively present in session to review reconciliation before cutover | `[ ] PENDING` | **USER** |

---

## 2. Definitive Cutover Go / No-Go Rules

### 2.1 Criteria for GO
A cutover **GO** decision is authorized if and only if:
1. All 18 checkpoints (`CK-01` through `CK-18`) are checked and verified.
2. Production data reconciliation achieves **100% row balance (0 delta)** across all domains.
3. Foreign key orphan queries return **0 orphans**.
4. Exactly **0 legacy PIN hashes** were migrated.
5. Automated production smoke test completes with **9/9 checkpoints passing**.
6. Edge health probe (`/api/health`) returns HTTP 200 within $< 150\text{ms}$.
7. User reviews the reconciliation and smoke reports and enters: **`GO`**.

### 2.2 Criteria for NO-GO
A cutover **NO-GO** decision is triggered immediately if:
- Any checkpoint from `CK-01` to `CK-18` cannot be verified.
- Any entity row count mismatch or foreign key orphan is detected.
- Any authentication failure or RLS policy failure occurs during smoke testing.
- The user does not provide explicit authorization.
- *Upon a NO-GO, the operator immediately executes the Rollback Runbook.*
