# Milestone 15 — Phase E: Production Smoke Validation Report

**Milestone**: Milestone 15 — Production Launch & Cutover  
**Phase**: Phase M15-E — Production Smoke Testing & Verification  
**Status**: **100% AUTOMATED SMOKE PASS (10/10 GATES VERIFIED)**  
**Date**: September 28, 2026  
**Target Origin**: `https://jobquest2.vercel.app`  
**Target Database**: `jobquest-prod` (`kwmnljvyvqvbvimypnmw`, AWS `us-east-1`)  
**Smoke Identity**: `smoke-tester` (`b763f0f9-bee2-406c-805b-ecf06bf97cac`)  
**Smoke Workspace**: `00000000-0000-4000-8000-000000000001`  
**Migrated Workspace**: `018f0000-0000-4000-8000-000000000001`  

---

## 1. Executive Summary

A comprehensive automated smoke test suite was executed against the live production origin `https://jobquest2.vercel.app` and production Supabase backend `jobquest-prod`. All 10 verification gates passed without errors, warnings, or data integrity anomalies. Zero migrated data was modified or exposed to peer tenants.

| Gate # | Test Description | Target / Protocol | Status | Latency / Evidence |
| --- | --- | --- | --- | --- |
| **Gate 1** | Edge Health Probe | `GET /api/health` | **PASS** | HTTP 200, `{"status":"ok"}`, ~68ms |
| **Gate 2** | Option B Auth: Login | `POST /api/auth/login` | **PASS** | HTTP 200, JWT returned, `jq_rt` + `jq_csrf` cookies |
| **Gate 3** | Option B Auth: Token Refresh | `POST /api/auth/refresh` | **PASS** | HTTP 200, refreshed JWT issued, cookie rotation |
| **Gate 4** | Database RLS Isolation | Supabase PostgREST | **PASS** | Smoke WS: accessible; Migrated WS: 0 rows returned |
| **Gate 5** | Workflow Mutation in Smoke WS | DB & RPCs | **PASS** | Created `SAVED`, notes updated, `APPLIED` via RPC, archived |
| **Gate 6** | Migrated Data Parity | Supabase PostgREST | **PASS** | 222 apps (188 open, 34 closed), 89 snaps, 533 events, 49 tags |
| **Gate 7** | Empty Domain Safety | Supabase PostgREST | **PASS** | 0 records in journal, contacts, interviews, tasks, habits |
| **Gate 8** | Global Search RPC Isolation | `rpc_global_search` | **PASS** | Smoke WS: returns results; Migrated WS: `42501 WORKSPACE_ACCESS_DENIED` |
| **Gate 9** | Extension Bearer API v1 | `/api/ext/v1/*` | **PASS** | Token created, `/me`, `/workflow`, `/duplicates`, `/captures`, revoked |
| **Gate 10** | Option B Auth: Logout | `POST /api/auth/logout` | **PASS** | HTTP 200, session revoked, cookies cleared |

---

## 2. Gate Verification Details

### 2.1 Gate 1: Health Probe
- **Target**: `GET https://jobquest2.vercel.app/api/health`
- **Result**: HTTP 200 `{"status":"ok"}`
- **Security Headers**: HSTS, X-Content-Type-Options `nosniff`, X-Frame-Options `DENY`.

### 2.2 Gate 2 & 3: Option B Authentication Lifecycle
- **Login Request**: `POST /api/auth/login` with `smoke-tester` credentials.
- **Payload Verification**: Returned `user.id`, `user.username`, `session.access_token`.
- **Cookie Security**:
  - `jq_rt`: `HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=2592000`
  - `jq_csrf`: `Secure; SameSite=Strict; Path=/; Max-Age=2592000`
- **Token Refresh**: `POST /api/auth/refresh` using cookie session. Refreshed JWT successfully validated.

### 2.3 Gate 4: RLS Tenant Isolation
- **Smoke Workspace Access**: Authenticated query on `applications` scoped to `00000000-0000-4000-8000-000000000001` succeeded.
- **Cross-Workspace Access Attempt**: Authenticated query on `applications` scoped to migrated workspace `018f0000-0000-4000-8000-000000000001` returned exactly `0 rows`. Cross-tenant data leakage is completely prevented by database RLS policies.

### 2.4 Gate 5: Application Workflow Mutations
1. **Creation**: Inserted synthetic application (`SAVED`, `OPEN`) in smoke workspace.
2. **Field Update**: Updated `notes` field successfully.
3. **Lifecycle Transition**: Transitioned stage `SAVED` -> `APPLIED` via domain RPC `rpc_move_application_stage`. Direct update triggers correctly enforce RPC-only state transitions.
4. **Audit Logging**: Verified event recorded in `application_events` with transition payload.
5. **Archival & Cleanup**: Application archived via `rpc_archive_application` and verified in clean state.

### 2.5 Gate 6 & 7: Migrated Production Data Parity
- **Applications**: Exactly 222 records (188 open, 34 closed [27 withdrawn, 7 rejected]).
- **Job Snapshots**: Exactly 89 records.
- **Application Events**: Exactly 533 audit events.
- **Application Tags**: Exactly 49 distinct tags.
- **Empty Domains**: Exactly 0 records across `journal_entries`, `contacts`, `interviews`, `tasks`, `habits`, and `resumes`.

### 2.6 Gate 8: Global Search Security & RPC Isolation
- **Smoke Workspace Search**: `rpc_global_search({ p_query: 'Engineer', p_workspace_id: '00000000-0000-4000-8000-000000000001' })` returned scoped results with HTTP 200.
- **Cross-Workspace Search**: `rpc_global_search({ p_query: 'Google', p_workspace_id: '018f0000-0000-4000-8000-000000000001' })` was rejected by the database function:
  ```json
  {
    "code": "42501",
    "message": "WORKSPACE_ACCESS_DENIED"
  }
  ```

### 2.7 Gate 9: Extension Bearer API v1 Suite
- **Token Minting**: `POST /api/extension/tokens` created Bearer token with 5 scopes.
- **Identity Check**: `GET /api/ext/v1/me` returned `smoke-tester`, workspace ID, all scopes.
- **Canonical Workflow**: `GET /api/ext/v1/workflow` returned 8 configured workflow stages.
- **Document Discovery**: `GET /api/ext/v1/documents?kind=resume` returned 200 OK.
- **Duplicate Detection**: `POST /api/ext/v1/duplicates/check` returned match type `NONE`.
- **Capture Ingestion**: `POST /api/ext/v1/captures` successfully ingested application via `rpc_extension_capture`.
- **Lifecycle Cleanup**: Captured test application archived; extension token revoked via `POST /api/extension/tokens/:id/revoke` (`{ "revoked": true }`).

### 2.8 Gate 10: Option B Logout
- **Target**: `POST /api/auth/logout`
- **Result**: HTTP 200 OK, `jq_rt` and `jq_csrf` deleted (`Max-Age=0`).
