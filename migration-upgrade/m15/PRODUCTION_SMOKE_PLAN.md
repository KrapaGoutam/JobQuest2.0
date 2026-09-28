# Milestone 15 — Production Smoke Plan: Synthetic Verification

**Status**: **PROPOSED — PRE-FLIGHT VERIFIED**  
**Milestone**: Milestone 15 — Production Launch & Cutover  
**Branch**: `feature/m15-production-launch-cutover`  
**Identity Specification**: `smoke-tester` (Standard username/password model, optional email)  
**Target Workspace**: `00000000-0000-4000-8000-000000000001` (`"Production Smoke Workspace"`)

---

## 1. Production Smoke Identity Model

To validate live production without modifying real migrated user records or generating misleading analytics, a dedicated smoke account is pre-provisioned:

| Attribute | Specification | Rationale |
| --- | --- | --- |
| **Username** | `smoke-tester` | Follows standard JobQuest 2.0 username authentication model (ADR-008) |
| **Password** | Strong CSPRNG password (stored in Vercel Sensitive Env) | Secure; never committed to Git |
| **Email** | *Optional / Unset* (or `smoke-tester@jobquest.internal`) | Current auth architecture does not require email |
| **Workspace ID** | `00000000-0000-4000-8000-000000000001` | Dedicated synthetic test workspace isolated by RLS |
| **Workspace Name** | `"Production Smoke Workspace"` | Clearly demarcated in database audits |
| **Role** | `USER` | Operates under standard user privileges (no elevated admin rights) |
| **Lifecycle** | **Retained Post-Launch** | Used for automated daily synthetic uptime and health checks |

---

## 2. Automated Smoke Test Flow (9 Critical Checkpoints)

The automated production smoke runner executes nine verification checkpoints against the live production origin:

```
[1. Health Probe] ──► [2. User Login] ──► [3. Workspace Claim]
        │                     │                   │
        ▼                     ▼                   ▼
[4. App Creation] ──► [5. Stage Transition] ──► [6. Journal Entry]
        │                     │                   │
        ▼                     ▼                   ▼
[7. Global Search] ──► [8. Ext Token Mint] ──► [9. Test Data Cleanup]
```

### 2.1 Smoke Checkpoint Definitions

1. **Health Check (`CP-01`)**:
   - `GET /api/health` returns HTTP 200 with `{ "status": "ok" }` in $< 150\text{ms}$.
2. **Authentication Check (`CP-02`)**:
   - `POST /api/v1/auth/login` with `smoke-tester` credentials returns valid signed ES256 JWT and refresh token.
3. **Workspace Isolation Check (`CP-03`)**:
   - Verify JWT claims contain `workspace_id = '00000000-0000-4000-8000-000000000001'`.
   - Verify query to `public.applications` returns 0 records from `"JobQuest (Migrated)"`.
4. **Application Creation Check (`CP-04`)**:
   - `POST /api/v1/applications` creates a new test application: `"Synthetic Health Engineer at Cloud Test Corp"`.
5. **Stage Transition Check (`CP-05`)**:
   - `PATCH /api/v1/applications/:id` transitions status from `APPLIED` to `SCREENING`. Event logged in `application_events`.
6. **Career Journal Check (`CP-06`)**:
   - `POST /api/v1/journal` creates a `STRATEGY` note linked to the test application.
7. **Global Search Check (`CP-07`)**:
   - `POST /api/v1/rpc/rpc_global_search` queries `"Synthetic Health"` and verifies matching application returned in $< 25\text{ms}$.
8. **Extension Facade Check (`CP-08`)**:
   - `POST /api/v1/ext/tokens` mints a short-lived extension capture token (`jqx_live_...`). Token verified and revoked.
9. **Synthetic Cleanup Check (`CP-09`)**:
   - Test application and journal entry are marked deleted or purged within the smoke workspace.

---

## 3. Exit Criteria
- **100% of Checkpoints (`CP-01` through `CP-09`) must PASS**.
- Zero exceptions, zero 5xx responses, zero secret leakages in responses.
- Total smoke suite duration $< 8\text{ seconds}$.
