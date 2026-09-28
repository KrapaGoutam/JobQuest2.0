# JOBQUEST2.0 — M15-D PRODUCTION MIGRATION LOCK

**Lock ID:** `M15D_PRODUCTION_MIGRATION_LOCK`  
**Lock Timestamp:** 2026-09-28T17:12:56.110Z  
**Milestone:** M15 — Production Launch & Cutover  
**Phase:** M15-D — Final Legacy Freeze, Final Backup, Live Migration & Reconciliation  

---

## 1. Lock Invariant

The M15-D Production Migration Lock binds the exact Git commit, migration engine, input export, database backups, and target infrastructure. Any modification to migration code, target schema, or source input invalidates this lock and mandates re-running preflight and dry-run validations.

---

## 2. Cryptographic Fingerprints

| Component | Identifier / Path | SHA-256 Checksum / Rev |
| :--- | :--- | :--- |
| **Git Branch** | `feature/m15-production-launch-cutover` | Clean, synchronized with origin |
| **Git Commit HEAD** | `30676334331d60a9019819bff9ffb42c0183a1b7` | Commit HEAD prior to lock |
| **Migration Tool** | `scripts/migrate-legacy-data.mjs` | `514a22f23bd538f150505515db881fa66e6717fa3799dffb9482960bd9160c6a` |
| **Source Schema Dump** | `legacy_neon_schema_20260928_120500.sql` | `2dba0a45e1d30f7edbdd3db1070f511657f3660262b09c17fc05a32fa7b02638` |
| **Source Full Dump** | `legacy_neon_data_20260928_120500.dump` | `0703950fab48886043001f3257274649d47d1ba92ef497dabca39b0832580810` |
| **Source Final Export** | `legacy_neon_export_20260928_120500.json` | `f7eff96083bc2d825631de91d0f8301d51da716f31fd39dbcdc2e1a547e6422e` |

---

## 3. Production Target Specifications

- **Supabase Project Name:** `jobquest-prod`
- **Supabase Project Ref:** `kwmnljvyvqvbvimypnmw`
- **Region:** `us-east-1`
- **Database Host:** `db.kwmnljvyvqvbvimypnmw.supabase.co`
- **Target Workspace ID:** `018f0000-0000-4000-8000-000000000001`
- **Target Workspace Name:** `JobQuest (Migrated)`
- **Smoke Workspace (Isolated):** `00000000-0000-4000-8000-000000000001`

---

## 4. Verification Checkpoints

1. **Preflight Rerun:** 6/6 checks PASS (Connection, 18/18 migrations, legacy columns, audit tables, 15/15 domain tables, RLS active).
2. **Clean Target Verification:** Workspace `018f0000-0000-4000-8000-000000000001` confirmed non-existent prior to execution; 0 prior records; 0 prior batches.
3. **Dry-Run Rehearsal:** Executed against `jobquest-prod` with `--dry-run` flag: `DRY_RUN_SUCCESS`, 0 errors, 0 mutations, transaction successfully rolled back.
4. **Tool Authorization:** Production confirmation guard unlocked via `--confirm-production`.
