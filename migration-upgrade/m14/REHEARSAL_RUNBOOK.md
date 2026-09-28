# Milestone 14 — Migration Rehearsal Runbook

**Document ID:** `JQ2-M14-RUNBOOK-001`  
**Milestone:** M14 — Release Candidate & Migration Rehearsal  
**Scope:** Rehearsal-Only Execution against Isolated Non-Production Target  
**Date:** 2026-09-28  

---

## 1. Safety Directives & Environmental Pre-requisites

> [!CAUTION]
> **STRICT REHEARSAL GUARD:** Under no circumstances may this runbook be executed against a live production database or production Supabase project. Rehearsal must target either:
> 1. Local Supabase stack (`http://127.0.0.1:54321`)
> 2. Dedicated isolated test workspace on hosted development (`jobquest-dev`)
> 
> The migration script `scripts/migrate-legacy-data.mjs` contains hard locks that reject connection strings matching production identifiers or lacking the `--confirm-non-production` flag.

### 1.1 Pre-Flight Environment Checks
Before running the migration rehearsal, execute the following pre-flight verification:

```bash
# 1. Verify feature branch and clean working tree
git branch --show-current
# Expected: feature/m14-release-candidate-migration-rehearsal

git status --short
# Expected: clean or only expected m14 working artifacts

# 2. Verify target database connection and non-production status
node -e '
  const url = process.env.REHEARSAL_TARGET_DB_URL || process.env.SUPABASE_DB_URL;
  if (!url) { console.error("Error: Target DB URL not set"); process.exit(1); }
  if (/prod|production|live|neon/i.test(url) && !url.includes("test")) {
    console.error("FATAL: Target URL looks like production!"); process.exit(1);
  }
  console.log("Preflight Target DB check passed: Safe non-production target.");
'
```

---

## 2. Step-by-Step Rehearsal Procedure

### Step 2.1: Pre-Migration Snapshot & Benchmark
Capture baseline counts in target database:
```bash
node scripts/migrate-legacy-data.mjs --target "$TARGET_URL" --baseline-only
```

### Step 2.2: Dry-Run Validation Mode
Run migration script in dry-run mode to validate source data, relationships, and transformation rules without mutating the database:
```bash
node scripts/migrate-legacy-data.mjs \
  --source "tests/fixtures/legacy-representative-export.json" \
  --target "$TARGET_URL" \
  --workspace "018f0000-0000-4000-8000-000000000001" \
  --workspace-name "JobQuest (Migrated)" \
  --dry-run \
  --confirm-non-production \
  --report "migration-upgrade/m14/evidence/rehearsal-dryrun-report.json"
```
**Verification:**
* Exit code must be `0`.
* Report must indicate `0 validation errors`.
* Discrepancies between source records and eligible records must be zero.

### Step 2.3: Live Rehearsal Execution
Execute the migration into the isolated `"JobQuest (Migrated)"` workspace:
```bash
node scripts/migrate-legacy-data.mjs \
  --source "tests/fixtures/legacy-representative-export.json" \
  --target "$TARGET_URL" \
  --workspace "018f0000-0000-4000-8000-000000000001" \
  --workspace-name "JobQuest (Migrated)" \
  --batch-size 50 \
  --confirm-non-production \
  --report "migration-upgrade/m14/evidence/rehearsal-live-report.json"
```
**Execution Sequence Executed by Script:**
1. **Tenant Provisioning:** Ensure workspace `"JobQuest (Migrated)"` exists with ID `018f0000-0000-4000-8000-000000000001`.
2. **Users & Identities:** Provision `user_accounts`, `profiles`, and workspace memberships. Generate `legacy_claim_codes`. Confirm zero PIN hashes migrated.
3. **Applications & Snapshots:** Migrate applications with 13-stage decomposition; insert immutable `job_snapshots`.
4. **Historical Event Backfill:** Consolidate `activities`, `timeline_events`, and `stage_history` into `application_events`.
5. **Networking & Contacts:** Migrate contacts and recruiter links.
6. **Interviews:** Migrate interview rounds, questions, and performance notes.
7. **Tasks, Reminders & Follow-ups:** Unify into `tasks` queue.
8. **Habits & Habit Logs:** Migrate habit configurations and daily completion logs.
9. **Notes & Career Journal:** Migrate notes into `journal_entries` with markdown body, application links, and pin flags.
10. **Resumes & Document Metadata:** Migrate resume records and revision lineages.
11. **Goals & Pacing:** Migrate daily/weekly goal targets and snapshots into `goals`.
12. **Tags & Labels:** Map legacy tags and application-tag joins.

### Step 2.4: Dual Reconciliation Execution
Run the automated reconciliation validator:
```bash
pnpm vitest run tests/integration/m14-migration-rehearsal.test.ts
```
**Checks Performed:**
* Exact row count balance: $\text{Source Eligible} = \text{Target Migrated} + \text{Skipped}$.
* Foreign key query sweep: Confirm zero orphan entities.
* Timestamp fidelity: Confirm UTC timestamps match source dates without daylight/timezone distortion.
* Option B claim integrity: Confirm claim codes generated and PIN hashes absent.

### Step 2.5: Application Parity & Search Indexing Sweep
Verify core JobQuest 2.0 user flows against the migrated data:
```bash
pnpm vitest run tests/integration/m14-migrated-data-parity.test.ts
```
**Checks Performed:**
* Global Search (`rpc_global_search`) locates migrated applications, notes, contacts, and interviews.
* Career Journal displays migrated entries with proper formatting and application links.
* Analytics reports calculate plausible funnels and stage durations.
* Multi-tenant RLS properly isolates migrated records.

### Step 2.6: Idempotency Verification
Re-run the exact migration command from Step 2.3:
```bash
node scripts/migrate-legacy-data.mjs \
  --source "tests/fixtures/legacy-representative-export.json" \
  --target "$TARGET_URL" \
  --workspace "018f0000-0000-4000-8000-000000000001" \
  --confirm-non-production \
  --report "migration-upgrade/m14/evidence/rehearsal-idempotency-report.json"
```
**Expected Outcome:**
* `created_count: 0`, `updated_count: 0`, `duplicate_skipped: <total>`.
* Row counts in database remain identical to Step 2.3. Zero duplicates created.

---

## 3. Rollback Rehearsal Execution
Execute the safe rollback runbook procedure (see [`ROLLBACK_RUNBOOK.md`](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m14/ROLLBACK_RUNBOOK.md)) to prove that all migrated rehearsal data can be purged cleanly without leaving orphan artifacts or affecting existing test data.
