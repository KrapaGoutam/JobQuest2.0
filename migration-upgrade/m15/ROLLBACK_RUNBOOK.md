# Milestone 15 — Production Rollback Runbook: Disaster Recovery

**Status**: **PROPOSED — PRE-FLIGHT VERIFIED**  
**Milestone**: Milestone 15 — Production Launch & Cutover  
**Branch**: `feature/m15-production-launch-cutover`  
**Execution Authority**: Immediate execution authorized upon any objective trigger breach

---

## 1. Objective Rollback Triggers

Rollback is not subjective. An immediate rollback must be initiated if any of the following objective thresholds are breached during cutover or the initial 24 hours of operation:

| Category | Objective Rollback Condition | Trigger Threshold |
| --- | --- | --- |
| **Data Integrity** | Reconciliation count mismatch between source Neon and target | $> 0$ entity discrepancy |
| **Referential Integrity**| Foreign key orphans detected in audit queries | $> 0$ orphaned records |
| **Authentication Outage**| Option B token minting or verification fails | $> 2\%$ 401/403 error rate on authenticated routes |
| **Tenant Isolation Leak**| Any cross-workspace record visibility | **ANY** instance of data leak (Zero tolerance) |
| **Health Probe Failure** | `/api/health` probe returns 5xx or times out | $> 3$ consecutive failed probes |
| **Core Workflow Failure**| Application creation, stage transition, or note saving fails | Critical path broken for any user |
| **Browser Extension** | Extension token generation or capture facade fails | $> 5\%$ failure rate on `/api/ext/v1/*` |
| **HTTP 5xx Error Rate** | Serverless API unhandled exceptions | $> 1\%$ of total production requests |

---

## 2. Step-by-Step Rollback Execution Procedure

```
[1. Abort Cutover / Rollback Traffic] ────► [2. Unfreeze JobQuest 1.0]
                   │
                   ▼
[3. Purge Migrated Target Data]       ────► [4. Notify Users & Post-Mortem]
```

### Step 1: Revert Traffic at Edge (Vercel Instant Rollback)
If production traffic was already redirected to JobQuest 2.0:
```bash
# Instantly roll back to previous deployment alias
vercel rollback
```
Or immediately re-point DNS / domain records back to legacy JobQuest 1.0 on Render.

### Step 2: Unfreeze Legacy JobQuest 1.0
1. Remove the maintenance notice banner on JobQuest 1.0.
2. Re-enable write traffic on Render web service.
3. Users immediately resume normal operation on JobQuest 1.0 with zero data loss.

### Step 3: Purge Migrated Target Database (Clean Cascade Rollback)
Execute the verified rollback routine against the production target:
```bash
CONFIRM_PRODUCTION_MIGRATION=true \
ALLOW_NON_REHEARSAL_WORKSPACE=true \
node scripts/migrate-legacy-data.mjs \
  --rollback \
  --target "$SUPABASE_PROD_DB_URL" \
  --workspace-id "$PROD_WORKSPACE_ID"
```
*The rollback routine deletes the target workspace, triggering PostgreSQL `ON DELETE CASCADE` across all child applications, contacts, notes, and tasks, leaving the production database clean.*

---

## 3. Post-Rollback Incident Protocol

1. Preserve all logs, error stack traces, and the failed reconciliation output.
2. Conduct a Root Cause Analysis (RCA) document within 24 hours.
3. Fix identified defects on `feature/m15-production-launch-cutover`.
4. Re-rehearse migration in isolated development before scheduling a second cutover window.
