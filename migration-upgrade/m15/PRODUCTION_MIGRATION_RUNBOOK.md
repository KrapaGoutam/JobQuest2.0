# Milestone 15 — Production Migration Runbook: Live Data Transfer

**Status**: **PROPOSED — PRE-FLIGHT VERIFIED (ZERO LIVE RUNS EXECUTED)**  
**Milestone**: Milestone 15 — Production Launch & Cutover  
**Branch**: `feature/m15-production-launch-cutover`  
**Target Script**: [`scripts/migrate-legacy-data.mjs`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/scripts/migrate-legacy-data.mjs)  
**Safety Status**: Dual safety interlocks active; requires explicit operator environment flags

---

## 1. Migration Engine Production Readiness Audit

The migration engine [`scripts/migrate-legacy-data.mjs`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/scripts/migrate-legacy-data.mjs) was developed in Milestone 14 and verified during live rehearsal. Its production readiness was audited during Phase M15-A:

| Capability / Guard | Rehearsal Behavior | Production Readiness Verification | Status |
| --- | --- | --- | --- |
| **Safety Interlock** | Blocks non-rehearsal UUIDs | Requires `ALLOW_NON_REHEARSAL_WORKSPACE=true` and `CONFIRM_PRODUCTION_MIGRATION=true` to target production | **VERIFIED** |
| **Zero PIN Migration** | Discards legacy PIN hashes | Invariant guaranteed in Stage 1 projection; `pin_hashes_migrated: 0` | **VERIFIED** |
| **Transaction Semantics** | Per-stage transactional inserts | Wraps inserts with atomic commit; logs to `public.migration_batches` | **VERIFIED** |
| **Claim Code Security** | Generates 256-bit CSPRNG tokens | Hashed with SHA-256 before insertion into `public.legacy_claim_codes` | **VERIFIED** |
| **Rollback Capability** | Cascades workspace purge | Directly deletes target workspace triggering full referential cleanup | **VERIFIED** |
| **Exit Codes** | Non-zero on error | Fails fast with exit code 1 if any stage encounters unhandled error | **VERIFIED** |

---

## 2. Step-by-Step Production Migration Execution

### Step 1: Pre-Execution Checklist Verification
Before running the migration command, verify:
1. `M15-D10` (Neon backup completed and checksum verified).
2. `M15-D11` (Legacy write freeze active).
3. Production Supabase database initialized with 18 migrations applied.
4. Target workspace UUID provisioned (e.g. `"JobQuest (Migrated)"`).

### Step 2: Dry-Run Simulation Against Production Target
Execute a non-mutating dry run to validate network latency, schema compatibility, and foreign key references:

```bash
CONFIRM_PRODUCTION_MIGRATION=true \
ALLOW_NON_REHEARSAL_WORKSPACE=true \
node scripts/migrate-legacy-data.mjs \
  --source "scratch/legacy-production-export.json" \
  --target "$SUPABASE_PROD_DB_URL" \
  --workspace-id "$PROD_WORKSPACE_ID" \
  --dry-run
```

Verify the output report indicates:
- `dry_run: true`
- `status: "COMPLETED"`
- `errors: 0`
- `fk_integrity`: 0 orphans

### Step 3: Live Production Data Execution
Execute the live, mutating migration:

```bash
CONFIRM_PRODUCTION_MIGRATION=true \
ALLOW_NON_REHEARSAL_WORKSPACE=true \
node scripts/migrate-legacy-data.mjs \
  --source "scratch/legacy-production-export.json" \
  --target "$SUPABASE_PROD_DB_URL" \
  --workspace-id "$PROD_WORKSPACE_ID" \
  --report "scratch/production-migration-live-report.json"
```

---

## 3. Post-Migration Verification & Claim Code Vaulting

1. **Inspect Live Report**:
   ```bash
   node -e "
   const r = JSON.parse(fs.readFileSync('scratch/production-migration-live-report.json'));
   console.log('Status:', r.status);
   console.log('Migrated entities:', Object.fromEntries(Object.entries(r.counts).map(([k, v]) => [k, v.migrated])));
   console.log('PINs migrated:', r.pin_hashes_migrated);
   "
   ```
2. **Claim Code Security Protocol**:
   - The migration output generates plaintext claim codes for each migrated user.
   - The operator must copy these codes into the designated password manager or secure vault (e.g. 1Password / Bitwarden).
   - The local file `scratch/production-migration-live-report.json` must be securely wiped immediately after reconciliation:
     ```bash
     rm scratch/production-migration-live-report.json
     ```
   - Plaintext claim codes must **never** be committed to version control, pasted into chat, or saved in public CI logs.
