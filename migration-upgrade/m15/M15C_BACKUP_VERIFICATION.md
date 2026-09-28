# M15-C Legacy Neon Backup & Offline Restore Verification Report

**Milestone:** M15-C (Legacy Neon Backup, Read-Only Export, Real-Schema Reconciliation & Production Migration Pre-Flight)  
**Timestamp:** `2026-09-28T11:05:00-05:00`  
**Governance:** Feature Freeze Active — Strict Negative Constraints Enforced  
**Status:** **VERIFIED & PASSED**

---

## 1. Executive Summary

As part of Milestone 15 Phase C, logical backups of the live legacy Neon PostgreSQL database were captured using strictly read-only transaction parameters (`default_transaction_read_only=on`). All backup artifacts were directed to an isolated filesystem directory located strictly outside both the JobQuest 1.0 and JobQuest 2.0 repositories.

The full binary dump was restored into an isolated local PostgreSQL 18.6 Docker environment (`jobquest1_m15c_restore_20260928_110500`). The restore was verified with zero errors (exit code 0, 999ms duration), 34 of 34 tables restored, 62 of 62 foreign keys intact, and 100% row count reconciliation against live Neon.

---

## 2. Source Database Environment

| Attribute | Value | Verification Notes |
| :--- | :--- | :--- |
| **Provider** | Neon Serverless PostgreSQL | Live cloud database |
| **Database Engine** | PostgreSQL 18.6 (6569466) | Requires PG 18 client matching |
| **Connection Security** | SSL Required | Encrypted in-flight |
| **Transaction Safeguard** | `default_transaction_read_only=on` | Zero writes permitted during backup |
| **Schema Migration Head** | `013_extension_tokens.sql` | 13 schema migrations recorded |

---

## 3. Storage Location & Guardrail Adherence

- **Secure Backup Directory:** `C:\Users\krapa\Documents\Job Search\JobTrackerProjects\_secure-backups\jobquest1\20260928_110500\`
- **Isolation Check:**
  - Located outside `c:\Users\krapa\Documents\Job Search\JobTrackerProjects\JobQuest2.0` (Target Repo): **CONFIRMED**
  - Located outside `c:\Users\krapa\Documents\Job Search\JobTrackerProjects\JobQuest1` (Source Repo): **CONFIRMED**
  - Untracked by Git: **CONFIRMED**
  - Sensitive connection URLs / credentials logged: **ZERO (STRICT COMPLIANCE)**

---

## 4. Backup Artifacts & Integrity Hashes

### 4.1 Schema-Only Backup
- **Filename:** `legacy_neon_schema_20260928_110500.sql`
- **Format:** Plain SQL DDL
- **File Size:** `67,048` bytes
- **SHA-256 Checksum:** `e04dc17b194b16fbf2f137b55f5cbc7e8e5f81093dd9367906f5e155f8509268`
- **Contents:** 34 table definitions, 34 primary keys, 62 foreign keys, 16 unique constraints, 89 indexes, 13 migration tracking records.

### 4.2 Full Logical Database Dump
- **Filename:** `legacy_neon_data_20260928_110500.dump`
- **Format:** PostgreSQL Custom Archive (`-Fc`, compressed)
- **File Size:** `261,376` bytes
- **SHA-256 Checksum:** `4c3d0dc9b2d2def3337f8f9b7d751694f753fb6008894018c340fb22f62f5e52`
- **Archive Catalog (`pg_restore --list`):**
  - Total Archive Entries: `296`
  - `TABLE DATA` Entries: `34`
  - Constraints & Triggers: `173`

---

## 5. Offline Restore Validation

### 5.1 Isolated Container Setup
- **Container Name:** `jobquest1_m15c_restore_20260928_110500`
- **Docker Image:** `postgres:alpine` (PostgreSQL 18.6)
- **Target Database:** `jobquest1_offline`
- **Restore Command:** `pg_restore -U postgres -d jobquest1_offline -v legacy_neon_data_20260928_110500.dump`
- **Execution Duration:** `999 ms`
- **Exit Code:** `0` (Clean restoration, no warnings, no fatal errors)

### 5.2 Schema Constraint Parity
- **Primary Keys Restored:** `34 / 34`
- **Foreign Keys Restored:** `62 / 62`
- **Unique Constraints Restored:** `16 / 16`
- **Indexes Restored:** `89 / 89`

### 5.3 Referential Integrity Verification
Foreign key orphan integrity was validated across all relational tables in the restored container:

| Relation Checked | Source Table → Target Table | Orphan Count | Result |
| :--- | :--- | :--- | :--- |
| Applications to Users | `applications(user_id) → users(id)` | 0 | **CLEAN** |
| Checklist Items to Applications | `checklist_items(application_id) → applications(id)` | 0 | **CLEAN** |
| Application Tags to Applications | `application_tags(application_id) → applications(id)` | 0 | **CLEAN** |
| Application Tags to Tags | `application_tags(tag_id) → tags(id)` | 0 | **CLEAN** |
| Activities to Applications | `activities(application_id) → applications(id)` | 0 | **CLEAN** |
| Stage History to Applications | `stage_history(application_id) → applications(id)` | 0 | **CLEAN** |
| Timeline Events to Applications | `timeline_events(application_id) → applications(id)` | 0 | **CLEAN** |
| Import Rows to Import Batches | `import_rows(batch_id) → import_batches(id)` | 0 | **CLEAN** |

---

## 6. Table Row Count Reconciliation

| Table Name | Live Neon Rows | Restored Container Rows | Parity Status |
| :--- | :--- | :--- | :--- |
| `users` | 1 | 1 | **100% MATCH** |
| `applications` | 222 | 222 | **100% MATCH** |
| `checklist_items` | 2,442 | 2,442 | **100% MATCH** |
| `tags` | 49 | 49 | **100% MATCH** |
| `application_tags` | 158 | 158 | **100% MATCH** |
| `activities` | 226 | 226 | **100% MATCH** |
| `timeline_events` | 226 | 226 | **100% MATCH** |
| `stage_history` | 224 | 224 | **100% MATCH** |
| `dashboard_preferences` | 29 | 29 | **100% MATCH** |
| `application_view_preferences` | 1 | 1 | **100% MATCH** |
| `import_batches` | 21 | 21 | **100% MATCH** |
| `import_rows` | 218 | 218 | **100% MATCH** |
| `reminder_categories` | 11 | 11 | **100% MATCH** |
| `audit_log` | 2 | 2 | **100% MATCH** |
| `sessions` | 2 | 2 | **100% MATCH** |
| `extension_tokens` | 2 | 2 | **100% MATCH** |
| `schema_migrations` | 13 | 13 | **100% MATCH** |
| *17 Empty Tables* (`notes`, `tasks`, `habits`, `resumes`, `interviews`, `contacts`, etc.) | 0 | 0 | **100% MATCH** |

---

## 7. Security & Compliance Checklist

- [x] Read-only transaction enforcement active during backup creation (`default_transaction_read_only=on`).
- [x] Dump files stored strictly outside source and target Git trees.
- [x] Zero secrets, passwords, or connection strings written to Git, stdout, or documentation.
- [x] Checksum hashes calculated and verified.
- [x] Complete offline restoration verified in sandbox container.
- [x] Live Neon database untouched (zero writes, zero mutations).
