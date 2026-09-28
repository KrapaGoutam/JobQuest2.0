# M15-C Migration Tool Compatibility & Adaptation Report

**Milestone:** M15-C (Legacy Neon Backup, Read-Only Export, Real-Schema Reconciliation & Production Migration Pre-Flight)  
**Component:** `scripts/migrate-legacy-data.mjs` & `scripts/migrate-legacy-data.d.ts`  
**Status:** **ENHANCED, BACKWARD COMPATIBLE & FULLY VALIDATED**

---

## 1. Executive Summary

During Milestone 15 Phase C, the authoritative migration tool (`scripts/migrate-legacy-data.mjs`) was enhanced to support the full reality of the production legacy Neon database while maintaining 100% backward compatibility with previous test suites and fixtures.

A modular transformation layer was introduced to handle differences in user record schemas (null emails, uppercase roles), application progression columns (`stage` vs `status`), legacy constraint adaptations (e.g. `'Internship'` tags vs `chk_app_employment_type`), and rich snapshot extraction. Additionally, a dedicated read-only target preflight mode (`--preflight` / `runProductionPreflight`) was introduced to safely validate production database readiness without initiating write transactions.

---

## 2. Architecture of the Transformation Layer

The migration tool decouples extraction from persistence by routing raw source entities through pure transformation functions before database insertion:

```
[Raw Legacy Source Entity]
          │
          ▼
┌──────────────────────────────────────────────┐
│       M15-C Pure Transformation Layer        │
├──────────────────────────────────────────────┤
│ • mapLegacyUser(u)                           │
│ • mapLegacyApplication(a, tags)              │
│ • mapLegacyStatus(rawStatus)                 │
│ • normalizeLegacyTimestamp(ts)               │
│ • mapLegacyTask(t)                           │
│ • mapLegacyReminder(r)                       │
│ • mapLegacyNote(n)                           │
│ • mapLegacyResume(res)                       │
└──────────────────────────────────────────────┘
          │
          ▼
[JobQuest 2.0 Target Entity Payload]
```

### 2.1 Function: `mapLegacyUser(u)`
- **Purpose:** Bridges legacy user authentication records to JobQuest 2.0 `user_accounts` and `profiles`.
- **Logic:**
  - Extracts and normalizes username: `cleanUsername = (u.username || 'legacy-user').toLowerCase().replace(/[^a-z0-9_-]/g, '')`.
  - Fallback email generation: If `u.email` is null, constructs `${cleanUsername}@legacy.jobquest.local`.
  - Role normalization: Translates uppercase `'MANAGER'` or generic `'user'` to standard `'admin'` or `'member'`.
  - Preferences extraction: Preserves `theme_preference` (e.g. `'dark'`) and `week_start` into `ui_preferences` JSONB.
  - Generates claim code tracking metadata while strictly excluding password and PIN hashes.

### 2.2 Function: `mapLegacyApplication(a, existingTags)`
- **Purpose:** Normalizes application records, handles stage vs status mapping, and resolves constraint edge cases.
- **Logic:**
  - Resolves company and role titles with fallback defaults.
  - Resolves stage via `mapLegacyStage(a.stage || a.status || 'Applied')`.
  - Analyzes `employment_type`: If `'Internship'`, ensures `'Internship'` is appended to `tags` array and sets `employment_type = null` so the target DB constraint `chk_app_employment_type` is satisfied.
  - Preserves `work_arrangement`: Normalizes `'Remote'`, `'Hybrid'`, or `null`.
  - Handles `salary_range`: If min/max are null but `salary_range` text exists, appends `[Salary Info: ${a.salary_range}]` to `notes`.
  - Detects `job_description`: If present (length > 0), flags `hasSnapshot: true` for downstream snapshot generation.

### 2.3 Function: `runProductionPreflight({ targetUrl })`
- **Purpose:** Executes a strictly read-only audit of the target database to guarantee production migration readiness.
- **Negative Constraints:**
  - Never issues `BEGIN`, `INSERT`, `UPDATE`, `DELETE`, `ALTER`, or `DROP`.
  - Never modifies connection transaction parameters.
- **Verifications:**
  1. Connection handshake & SSL negotiation.
  2. Applied migrations count in `supabase_migrations.schema_migrations` (confirms M14 migration `20261020100000` applied).
  3. Legacy column presence (`profiles.legacy_user_id`, `applications.legacy_id`, `profiles.ui_preferences`).
  4. Migration audit table existence (`migration_batches`, `migration_id_mappings`, `legacy_claim_codes`).
  5. Application domain table existence (15 core tables).
  6. Row-level security (RLS) enforcement verification on migration tables.

---

## 3. Dual-Format Compatibility Matrix

The enhanced tool seamlessly supports both data formats:

| Capability | M14 Representative Fixture | Real Neon Export (1.8MB) |
| :--- | :--- | :--- |
| **Input Format** | JSON file (`legacy-representative-export.json`) | JSON file (`legacy_neon_export_20260928_110500.json`) or Live DB |
| **User Identity** | `email: "user@example.com"`, `role: "user"` | `email: null`, `username: "jack"`, `role: "MANAGER"` |
| **Stage Column** | Provided as `status` | Provided as `stage` |
| **Tags Structure** | Simple tag array | Relational `tags` (49) + `application_tags` (158) |
| **Employment Types** | `'Full-time'`, `'Contract'` | Includes 36 `'Internship'` records |
| **Job Descriptions** | 3 descriptions | 89 rich descriptions |
| **Lifecycle Events** | Minimal | 533 events (triggers + backfills) |
| **Empty Tables** | Populated synthetic rows | 0 rows in 17 tables (gracefully skipped) |

---

## 4. CLI Interface Reference

```bash
# Strictly read-only target preflight check (zero writes)
node scripts/migrate-legacy-data.mjs --preflight --target "$DATABASE_URL"

# Dry run migration against target database
node scripts/migrate-legacy-data.mjs \
  --source "path/to/export.json" \
  --target "$DATABASE_URL" \
  --workspace "018f0000-0000-4000-8000-000000000001" \
  --dry-run \
  --confirm-non-production

# Execute live migration (M15-D only — requires explicit user approval)
node scripts/migrate-legacy-data.mjs \
  --source "path/to/export.json" \
  --target "$DATABASE_URL" \
  --workspace "018f0000-0000-4000-8000-000000000001" \
  --report "migration-upgrade/m15/M15D_MIGRATION_REPORT.json"

# Rollback migration for a given workspace
node scripts/migrate-legacy-data.mjs \
  --rollback \
  --target "$DATABASE_URL" \
  --workspace "018f0000-0000-4000-8000-000000000001" \
  --confirm-non-production
```

---

## 5. Test Suite Verification

- **Unit Tests:** `tests/unit/m15c-real-schema-transforms.test.ts` (13 tests passing).
- **M14 Logic Tests:** `tests/unit/m14-migration-logic.test.ts` (14 tests passing).
- **M14 Integration Tests:** `tests/integration/m14-migration-rehearsal.test.ts` (5 tests passing).
- **M15-C Real Rehearsal Tests:** `tests/integration/m15c-real-data-rehearsal.test.ts` (4 tests passing).
- **Type Verification:** `npx tsc --noEmit` exits 0 (clean).
