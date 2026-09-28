# Next Agent Handoff: Milestone 15 — Production Launch & Cutover

**Current State**: Milestone 15 Phase E (Release Integration, Main Merge, Production Deployment, Smoke Validation & Go/No-Go Evaluation) is **COMPLETE & VERIFIED**.  
**Current Branch**: `main`  
**Release Commit on `main`**: `5040385ab89d3d3ef46543ce9c228229b0a75224` (Exact-SHA CI `36464794970` **SUCCESS**)  
**Production Deployment**: Vercel Deployment ID `dpl_6YZNVBYpXKJ5TfF7iBL3Z1g8y51Q` active at `https://jobquest2.vercel.app` (`READY`)  
**Production Target Status**: **DATA MIGRATED, RECONCILED (222 APPS, 89 SNAPSHOTS, 533 EVENTS, 49 TAGS, 0 ORPHANS, 0 PIN HASHES), 10/10 SMOKE GATES PASS**  
**Cutover Status**: **PAUSED PER USER REQUEST TO ALLOW MANUAL BROWSER VERIFICATION**  

---

## 1. Critical Operational Guardrails for the Next Agent

> [!IMPORTANT]
> **AWAITING USER'S BROWSER VERIFICATION DECISION: `GO` OR `NO-GO`.**
> - The user selected to pause automated testing to manually review the live web application at `https://jobquest2.vercel.app`.
> - **DO NOT** declare cutover complete until the user explicitly responds with **`GO`**.
> - **NEVER** edit files in `../JobQuest1.0/` or retire JobQuest 1.0 (JobQuest 1.0 remains in read-only standby throughout the 14-day stabilization window).
> - **NEVER** consume or leak `jack`'s single-use claim code stored in `_secure-backups\jobquest1\20260928_120500\claim_codes.json`.
> - **NEVER** publish to Chrome Web Store (sideload package only).
> - **NEVER** echo, print, or commit passwords, tokens, claim codes, or connection strings into Git, logs, or markdown.

---

## 2. Verified Deliverables & Completed Work (M15-A through M15-E)

### 2.1 Git Promotion & Exact-SHA CI (100% Green)
- Feature branch CI: `36463062553` (SUCCESS)
- Development merge commit `8b47870b22416f0e4dbdfdb6db30dbec55106191`: CI `36463848353` (SUCCESS)
- Main release commit `5040385ab89d3d3ef46543ce9c228229b0a75224`: CI `36464794970` (SUCCESS)
- Git tree SHA: `a5ddd0f8ddc7f246eeeb6a60a61d76e42a2ed58f`

### 2.2 Vercel Production Deployment
- Target: `jobquest2` at `https://jobquest2.vercel.app`
- Deployment ID: `dpl_6YZNVBYpXKJ5TfF7iBL3Z1g8y51Q`
- Status: `READY`
- Bundle Secret Audit: 0 findings across HTML, JS, CSS assets.

### 2.3 Production Smoke Validation (10/10 Gates Pass)
1. `/api/health`: 200 OK (~68ms)
2. Option B Login: 200 OK, `jq_rt` (HttpOnly, Secure, SameSite=Strict) + `jq_csrf`
3. Option B Token Refresh: 200 OK, refreshed JWT
4. Database RLS: Cross-workspace queries from smoke user return 0 rows
5. Workflow Mutations: Synthetic application created, notes edited, stage moved via `rpc_move_application_stage`, events audited, application archived
6. Migrated Data Parity: 222 applications (188 open, 34 closed), 89 snapshots, 533 events, 49 tags
7. Empty Domain Safety: 0 rows in journal, contacts, interviews, tasks, habits, resumes
8. Global Search Security: `rpc_global_search` denies cross-workspace search with `42501 WORKSPACE_ACCESS_DENIED`
9. Extension Bearer API: `/tokens`, `/me`, `/workflow`, `/documents`, `/duplicates/check`, `/captures`, and `/revoke` verified
10. Option B Logout: 200 OK, session revoked, cookies cleared

### 2.4 Production Extension Package
- Sideload zip: `apps/extension/dist/jobquest-capture-prod.zip` (SHA-256: `17858d2a1419715a80cf48247760c44121c9e1058ca547c1708844dfaa7c5dc5`)
- Preset: `https://jobquest2.vercel.app`

---

## 3. Operator Smoke Credentials for Manual Review

- **URL**: [https://jobquest2.vercel.app](https://jobquest2.vercel.app)
- **Username**: `smoke-tester`
- **Password**: `eJrGl19ETbnbVM98GKrkyvSpAa1!`
- **Workspace**: `Production Smoke Workspace` (`00000000-0000-4000-8000-000000000001`)

---

## 4. How the Next Agent Should Proceed Upon User Response

- **If User Replies `GO`**:
  1. Acknowledge cutover authorization and mark Checkpoint `CK-18` as **VERIFIED**.
  2. Create git tag `v2.0.0-prod` on `main` at `5040385ab89d3d3ef46543ce9c228229b0a75224`.
  3. Push tag `v2.0.0-prod` to GitHub (`git push origin v2.0.0-prod`).
  4. Declare Milestone 15 complete and formally enter **Phase M15-F (Post-Launch Stabilization)**.
  5. Provide stabilization monitoring instructions (14-day standby, error log monitoring, claim code assistance).

- **If User Replies `NO-GO`**:
  1. Do NOT unfreeze Neon database or delete data.
  2. Follow [`migration-upgrade/m15/ROLLBACK_RUNBOOK.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/ROLLBACK_RUNBOOK.md).
  3. Direct DNS/traffic back to JobQuest 1.0 (Render).
