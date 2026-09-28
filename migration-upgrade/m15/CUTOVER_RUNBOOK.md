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
