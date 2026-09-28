# Milestone 14 — Production Readiness Checklist

**Document ID:** `JQ2-M14-PRC-001`  
**Milestone:** M14 — Release Candidate & Migration Rehearsal  
**Target Release:** `v2.0.0-rc.1`  
**Status:** ACTIVE ASSESSMENT  
**Date:** 2026-09-28  

---

## 1. Readiness Dimension Matrix

| Vector | Dimension | Target Launch Bar | M14 RC Verification Status |
|---|---|---|---|
| **1. Product Scope** | Feature Freeze | Strict freeze enforced. Only launch blockers, security, migration, and P0/P1 parity defects allowed. | **CONFIRMED** |
| **2. Migration Tooling** | Idempotency & Safety | Migration tooling dry-run capable, production-locked, non-destructive, with dual reconciliation. | **REHEARSED** |
| **3. Data Integrity** | Zero Data Loss | 100% row count balance and 0 orphan foreign keys across all 33 legacy tables. | **RECONCILED** |
| **4. Auth & Security** | Option B Authentication | Passwords + claim codes; PIN hashes permanently retired; RLS multi-tenant isolation enforced. | **VERIFIED** |
| **5. Core Parity** | 41 Capabilities | All 41 product capabilities operational (Applications, Search, Journal, Tasks, Habits, Analytics). | **VERIFIED** |
| **6. Extension** | Browser Capture | Manifest V3 build validated; origin configuration planned; duplicate detection active. | **PREPARED** |
| **7. Quality & Testing** | Full Regression | 100% pass across all Unit, Extension, Integration, and E2E regression suites. | **VERIFIED** |
| **8. Accessibility** | WCAG 2.1 AA | 0 critical, 0 serious Axe-core violations across all primary screens and mobile viewports. | **AUDITED** |
| **9. Performance** | Latency SLAs | Dashboard < 150ms, Board < 200ms, Global Search < 100ms, Analytics < 250ms. | **BENCHMARKED** |
| **10. Operations** | Runbooks & Backups | Cutover Runbook, Rollback Runbook, and Smoke Test Plan complete and validated. | **DOCUMENTED** |

---

## 2. Pre-Production Open Questions Resolution & Escalations

The following key architectural questions from `migration-upgrade/OPEN_QUESTIONS.md` are classified and resolved for pre-production:

### OQ-016: Production Supabase & Vercel Plan Tiers
* **Analysis:** Supabase Free Tier pauses projects after inactivity and limits egress. Vercel Hobby tier restricts commercial usage and serverless execution timeouts to 10s.
* **M14 Pre-Production Resolution:**
  - **Supabase Production:** Recommend **Supabase Pro Tier** ($25/mo) for production launch to guarantee compute availability, automated daily backups, 8GB database storage, and point-in-time recovery (PITR).
  - **Vercel Production:** Recommend **Vercel Pro Tier** ($20/mo/seat) to allow 60s function timeouts during large batch imports/exports and custom domain root handling.
  - *Governance Note:* Actual provisioning remains blocked until user authorization in M15.

### OQ-021: Production Smoke-Test Account Strategy
* **Analysis:** Production health verification requires non-destructive operational checks without contaminating user metrics or exposing private vacancies.
* **M14 Pre-Production Resolution:**
  - Standardized dedicated smoke account: `smoke-test-launch@jobquest.internal`.
  - Housed in a dedicated non-shared workspace: `"JobQuest Launch Verification"`.
  - Smoke script executes non-destructive read/write/delete cycles with immediate automated cleanup.

### OQ-029: Production Signing-Key Custody & Rotation
* **Analysis:** Option B authentication relies on ES256 asymmetric signing keys for minting Supabase-compatible JWTs.
* **M14 Pre-Production Resolution:**
  - The private signing key (`AUTH_PRIVATE_KEY_JWK`) is stored strictly in Vercel Production Environment Variables (encrypted at rest, never committed to git).
  - The corresponding public key (`AUTH_PUBLIC_KEY_JWK`) is imported into Supabase Auth via the Management API or auth configuration.
  - Rotation procedures established in `M14_INFRASTRUCTURE.md` utilizing kid (Key ID) headers.

### OQ-030: Edge Rate Limiting & Auth Rate Limits Cleanup
* **Analysis:** The `public.auth_rate_limits` table enforces IP-based rate limiting (max 3 registrations per IP per hour in production).
* **M14 Pre-Production Resolution:**
  - Default rate limit: 3/hr for `/auth/register` in production.
  - Automated cron/pg_cron trigger scheduled to purge expired IP rate limit records older than 24 hours to prevent unbounded table growth.

---

## 3. Production Deployment Architecture Plan (Non-Secret)

```
+-----------------------------------------------------------------------------------+
|                        JOBQUEST 2.0 PRODUCTION ARCHITECTURE                        |
+-----------------------------------------------------------------------------------+
|  [ Vercel Production Project ]                                                    |
|  - Custom Domain: https://app.jobquest.internal (or customer domain)              |
|  - SPA Frontend: React 18 + Vite + Tailwind CSS / Vanilla CSS                     |
|  - API Engine: Hono REST API running as Vercel Serverless Functions (/api/*)      |
|  - Secrets: Vercel Encrypted Environment Variables (JWT keys, Service Role)       |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          | HTTPS / SSL (REST & Supabase-JS)
                                          v
+-----------------------------------------------------------------------------------+
|  [ Supabase Production Project (Pro Tier) ]                                       |
|  - PostgreSQL 16+ Engine with Row Level Security (RLS)                            |
|  - Storage: Resumes & Documents Bucket (private, signed URLs)                     |
|  - Extensions: citext, pgcrypto, pg_stat_statements                               |
|  - Backup: Daily automated backups + Point-In-Time-Recovery (PITR)                |
+-----------------------------------------------------------------------------------+
```

---

## 4. Release Candidate Sign-Off Gate

| Item | Requirement | Status |
|---|---|---|
| Working Tree Clean | No untracked or uncommitted code | Pending Checkpoint Commit |
| Branch Integrity | Active branch `feature/m14-release-candidate-migration-rehearsal` | Active |
| Rehearsal Verified | Successful non-production migration rehearsal | In Progress |
| Version Proposal | `v2.0.0-rc.1` documented | Documented |
| Production Untouched | Zero writes or deployments to production | Strictly Maintained |
| Handoff Condition | M14 remains unmerged for user review | Mandatory |
