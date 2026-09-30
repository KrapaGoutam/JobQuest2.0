> **ANNOTATION 2026-09-30 (Step 16A-2):** The production database target is now the NEW `jobquest-prod` project `kqsxdothjxtcktyirpux` (us-east-1, OnePiece2.0). Every earlier reference below to `kwmnljvyvqvbvimypnmw` is historical (legacy/old, read-only rollback reference). Only application-domain data is imported into a fresh owner/workspace; no legacy users, credentials or claim codes migrate. See `STEP16A2_NEW_PRODUCTION_DATABASE_REPORT.md` §10 for the Step 16A-3 cutover sequence, the signing-key prerequisite and rollback.
>
> **STATUS 2026-09-30:** Step 16A-2 is COMPLETE — the new database holds 222 applications / 89 snapshots / 347 events / 122 label documents for owner `Conan` (workspace `fbd661ef-36ef-4c19-aae1-e4a477ac79a5`), fingerprints reconciled, zero legacy auth data. Step 16A-3 (Vercel Production cutover) is **NOT started and BLOCKED** until the operator registers the app ES256 signing key in `kqsxdothjxtcktyirpux` (JWT Signing Keys; hosted Supabase imports the **private** JWK as a standby key — the earlier "public key imported" wording is inaccurate; procedure in report §10). Cutover order remains: ES256 registered + JWKS verified -> vault snapshot of the five old Production values -> replace the five Production-only variables -> redeploy exact main SHA -> smoke as Conan. Rollback keeps the new database and restores the five old variables.


# Milestone 15 — Production Cutover Runbook: Traffic Switch

**Status**: **PROPOSED — PRE-FLIGHT VERIFIED**  
**Milestone**: Milestone 15 — Production Launch & Cutover  
**Branch**: `feature/m15-production-launch-cutover`  
**Execution Target**: Phase M15-E (Production Deployment & Cutover)

---

## 1. Cutover Schedule & Timeline (T-Minus Schedule)

| Timeline | Phase | Primary Action | Responsible |
| --- | --- | --- | --- |
| **T - 60 min** | Pre-Cutover | Verify Phase M15-D reconciliation report is 100% clean; zero delta; zero orphans | Lead Engineer |
| **T - 30 min** | Maintenance | Display maintenance notice on legacy JobQuest 1.0; initiate write freeze (`M15-D11`) | Lead Engineer |
| **T - 20 min** | Release Gate | Merge `development` into `main` (`M15-D13`); wait for CI on `main` to pass | Lead Engineer |
| **T - 10 min** | Deployment | Execute `vercel deploy --prod` from verified `main` SHA (`M15-D14`) | Lead Engineer |
| **T - 05 min** | Smoke Test | Run production smoke suite against production domain ([`PRODUCTION_SMOKE_PLAN.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/PRODUCTION_SMOKE_PLAN.md)) | QA / Engineer |
| **T - 00 min** | Go / No-Go | User issues formal Go / No-Go authorization (`M15-D17`) | **USER ONLY** |
| **T + 05 min** | Switch Traffic | Bind production domain in Vercel; update JobQuest 1.0 with redirection banner | Lead Engineer |
| **T + 15 min** | Onboarding | Deliver single-use claim codes to users out-of-band | Operator |
| **T + 60 min** | Stabilization | Monitor error logs, edge traffic, and Supabase pooler latency | Lead Engineer |

---

## 2. Step-by-Step Operator Commands

### Step 1: Merge `development` into `main`
```bash
git checkout main
git pull origin main
git merge --no-ff development -m "release: v2.0.0 production cutover"
git push origin main
```
*Wait for GitHub Actions CI on `main` to pass with green checkmarks.*

### Step 2: Deploy Production Release Candidate to Vercel
```bash
vercel deploy --prod
```
*Record deployment ID (e.g. `dpl_prod_...`). Verify Vercel output indicates `READY`.*

### Step 3: Run Production Health Probe
```bash
curl -f https://<PRODUCTION_DOMAIN>/api/health
```
*Confirm response: `{"status":"ok"}` with HTTP 200 within 150ms.*

### Step 4: Run Production Smoke Test
Execute the automated smoke verification script against the dedicated smoke account:
```bash
pnpm test:smoke:prod
```
*Confirm 100% of smoke checks pass.*

### Step 5: Final User Go / No-Go Checkpoint
Present the smoke report and reconciliation summary to the user. Do **not** proceed to traffic redirection until the user enters: `GO`.
