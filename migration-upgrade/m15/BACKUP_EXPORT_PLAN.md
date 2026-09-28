# Milestone 15 — Legacy Neon Backup & Read-Only Export Plan

**Status**: **PROPOSED — PRE-FLIGHT VERIFIED (ZERO LIVE READS OR WRITES EXECUTED)**  
**Milestone**: Milestone 15 — Production Launch & Cutover  
**Branch**: `feature/m15-production-launch-cutover`  
**Legacy Target**: JobQuest 1.0 Neon PostgreSQL Database (`migrations 001–013`)

---

## 1. Principles of Legacy Source Integrity

JobQuest 1.0 production data is an irreplaceable historical asset. The following principles govern all legacy interactions during Milestone 15:
1. **STRICT READ-ONLY ACCESS**: All database connections to Neon must be initiated with `SET TRANSACTION READ ONLY`. Under no circumstances will write, alter, or drop queries be executed against Neon.
2. **BACKUP BEFORE TOUCH**: No data extraction or migration script will run until a full, verified logical backup of Neon is secured and validated offline.
3. **ZERO REPOSITORY MODIFICATION**: No files in `../JobQuest1.0/` will be edited, moved, or deleted.

---

## 2. Pre-Migration Neon Backup Execution Runbook

### 2.1 Backup Commands
Operators with verified read access will execute `pg_dump` targeting the legacy Neon production instance:

```bash
# 1. Capture full schema definition
pg_dump -h <NEON_HOST> -U <NEON_USER> -d <NEON_DB> \
  --schema-only \
  --no-owner --no-privileges \
  -f "backups/legacy_neon_schema_$(date +%Y%m%d_%H%M%S).sql"

# 2. Capture full logical data backup in compressed custom format
pg_dump -h <NEON_HOST> -U <NEON_USER> -d <NEON_DB> \
  -F c -b -v \
  -f "backups/legacy_neon_data_$(date +%Y%m%d_%H%M%S).dump"
```

### 2.2 Backup Verification & Checksum
Immediately following `pg_dump`:
1. **Compute SHA-256 Checksum**:
   ```bash
   sha256sum backups/legacy_neon_data_*.dump > backups/legacy_neon_data.sha256
   ```
2. **Audit Source Migration Version**:
   Verify Neon is at expected migration version 013:
   ```sql
   SELECT id, name, applied_at FROM _migrations ORDER BY id DESC LIMIT 5;
   ```
3. **Offline Restore Validation**:
   Restore the dump into a temporary, isolated local Docker PostgreSQL instance:
   ```bash
   pg_restore -h 127.0.0.1 -p 55322 -U postgres -d postgres_restore_test --clean backups/legacy_neon_data_*.dump
   ```
   Confirm row counts match source Neon tables exactly.

---

## 3. Read-Only Data Extraction Plan

### 3.1 Extraction Script Execution
Data will be extracted using a specialized, read-only extraction script or direct JSON serialization:
- **Transaction Mode**: `BEGIN TRANSACTION READ ONLY;`
- **Output Artifact**: Stored in a secure, uncommitted local JSON file (e.g. `scratch/legacy-production-export.json`).
- **Secret Scanning Pre-Condition**: The extracted JSON must reside exclusively within the ignored `scratch/` directory or local staging area to ensure it is never committed to Git.

### 3.2 33-Table Inventory Verification
The export will audit and extract all 33 tables documented in [`MIGRATION_SOURCE_AUDIT.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m14/MIGRATION_SOURCE_AUDIT.md):
- Active Entity Domains: `users`, `resumes`, `tags`, `applications`, `job_snapshots`, `contacts`, `interviews`, `tasks`, `habits`, `habit_logs`, `notes` (Career Journal), `goals`.
- Legacy Support Tables: Checked for referenced assets or legacy metadata.
- Excluded Invariant: Legacy PIN hashes in `users.pin_hash` are discarded at the projection query layer and never exported.
