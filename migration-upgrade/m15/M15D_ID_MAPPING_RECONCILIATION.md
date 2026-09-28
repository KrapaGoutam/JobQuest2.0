# JOBQUEST2.0 — M15-D ID MAPPING RECONCILIATION REPORT

**Audit Timestamp:** 2026-09-28T17:17:35.000Z  
**Milestone:** M15 — Production Launch & Cutover  
**Phase:** M15-D — Final Legacy Freeze, Final Backup, Live Migration & Reconciliation  
**Target Project:** `jobquest-prod` (`kwmnljvyvqvbvimypnmw`)  
**Batch ID:** `ed7955f4-b315-4ffc-99d5-db8aaef8da75`  

---

## 1. Executive Summary

The table `public.migration_id_mappings` maintains a permanent, audited bridge connecting legacy integer primary keys from JobQuest 1.0 to modern UUID v4 identifiers in JobQuest 2.0. This report reconciles the ID mapping table against all migrated entities.

---

## 2. ID Mapping Inventory

| Source Entity | Legacy ID Range | Target Table | Target ID Type | Mappings Count | Collision Count | Orphan Mappings |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `users` | 1 | `public.profiles` / `user_accounts` | UUID v4 | 1 | 0 | 0 |
| `applications` | 1 .. 222 | `public.applications` | UUID v4 | 222 | 0 | 0 |
| **Total** | — | — | — | **223** | **0** | **0** |

---

## 3. Uniqueness and Bijectivity Verification

1. **Uniqueness Constraint Check:**
   - Database constraint `uq_migration_id_mappings` (`source_table, legacy_id`) enforced.
   - Zero duplicate mappings detected.
2. **Target UUID Collision Check:**
   - All 223 target UUIDs are distinct and unique.
   - Zero collisions detected.
3. **Application Column Invariant:**
   - In addition to `migration_id_mappings`, all 222 target applications carry `legacy_id` directly in `public.applications.legacy_id` for index-accelerated reconciliation:
     ```sql
     SELECT COUNT(*) FROM public.applications 
     WHERE workspace_id = '018f0000-0000-4000-8000-000000000001' AND legacy_id IS NOT NULL;
     ```
     Result: **222** (100% population).
4. **User Profile Invariant:**
   - Target profile carries `legacy_user_id = 1` in `public.profiles.legacy_user_id`.
     Result: **1** (100% population).

---

## 4. Conclusion

All migrated entities have unambiguous, bijective 1:1 ID mappings. Legacy data can be traced bidirectionally without ambiguity.
