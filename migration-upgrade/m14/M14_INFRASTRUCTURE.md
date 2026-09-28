# Milestone 14 — Infrastructure & Hosted Environments: Release Candidate & Rehearsal

**Status**: **100% OPERATIONAL & VERIFIED**  
**Milestone**: Milestone 14 — Release Candidate & Migration Rehearsal  
**Branch**: `feature/m14-release-candidate-migration-rehearsal`  
**Hosted Dev Supabase Project**: `jobquest-dev` (`xpnkasclquplmrcmhsif`)  
**Vercel Preview Deployment**: `https://jobquest2-33y9un1oa-one-piece-5779.vercel.app` (`dpl_Bt72bHx6a13C1dtxmUCkWin9qshT`)

---

## 1. Scope & Strict Governance Principles

Milestone 14 verified the complete Release Candidate (`v2.0.0-rc.1`) infrastructure and executed the legacy data migration rehearsal.

Per strict project governance:
- **Production Supabase project is UNTOUCHED**: No production database was provisioned or accessed.
- **Production Vercel deployment is UNTOUCHED**: Only preview deployments were created; `vercel deploy --prod` was NEVER invoked.
- **JobQuest 1.0 Repository & Neon Database are STRICTLY READ-ONLY**: No schema modifications, write operations, or changes occurred in `../JobQuest1.0/` or its production Neon PostgreSQL instance.
- **Hosted Development Project**:
  - Name: `jobquest-dev`
  - Reference: `xpnkasclquplmrcmhsif`
  - Region: `aws-0-us-west-2`
  - Pooler URL: `aws-0-us-west-2.pooler.supabase.com:5432`
- **Rehearsal Target Workspaces**:
  - Primary Rehearsal Workspace: `018f0000-0000-4000-8000-000000000001` (`"JobQuest (Migrated)"`)
  - Secondary Rehearsal Workspace: `018f0000-0000-4000-8000-000000000002` (`"JobQuest (Rehearsal 2)"`)

---

## 2. Database Migrations Applied

### 2.1 Applied Migration
- **File**: `supabase/migrations/20261020100000_m14_legacy_migration_rehearsal.sql`
- **Objects Created & Modified**:
  1. `profiles.legacy_user_id`: Added column (`bigint nullable unique`) with index `idx_profiles_legacy_user_id`.
  2. `applications.legacy_id`: Added column (`bigint nullable`) with index `idx_applications_legacy_id`.
  3. `public.legacy_claim_codes`: Rehearsal and cutover claim code tracking table (`id`, `target_workspace_id`, `legacy_user_id`, `code_hash`, `code_hint varchar(16)`, `expires_at`, `is_claimed`, `claimed_at`, `claimed_by_user_id`, `created_at`).
  4. `public.migration_batches`: Audit and batch execution ledger (`id`, `batch_name`, `target_workspace_id`, `source_type`, `record_counts jsonb`, `started_at`, `completed_at`, `status`).
  5. `public.migration_id_mappings`: Persistent cross-entity ID translation index (`id`, `batch_id`, `entity_type`, `legacy_id`, `target_uuid`, `target_workspace_id`, `created_at`).
  6. RLS policies on new migration tables: `p_legacy_claim_codes_read`, `p_migration_batches_manager`, `p_migration_id_mappings_manager`.
- **Execution**:
  - Local: Applied and verified via `supabase migration up`.
  - Hosted Dev (`jobquest-dev`): Applied additively and verified via direct PostgreSQL connection pooler.
  - Backward compatibility: 100% preserved. Zero destructive changes.

---

## 3. Vercel Preview Release Candidate Deployment

| Attribute | Details |
| --- | --- |
| **Deployment ID** | `dpl_Bt72bHx6a13C1dtxmUCkWin9qshT` |
| **Preview URL** | `https://jobquest2-33y9un1oa-one-piece-5779.vercel.app` |
| **Project / Team** | `jobquest2` / `one-piece-5779` |
| **State** | `READY` |
| **Build Target** | Release Candidate `v2.0.0-rc.1` |
| **Bundle Assets** | 1 HTML document + 3 JS/CSS chunks |
| **Health Endpoint** | `/api/health` returns `{"status":"ok"}` (98ms) |
| **Secret Findings** | **0 secrets, 0 leaked tokens** |
| **E2E Status** | **1/1 Passed** (`e2e/m14-release-candidate.spec.ts`, 15.5s) |

---

## 4. Environment Variables & Security Profiles

### 4.1 Client-Side Environment (Vite Web & Preview)
- `VITE_SUPABASE_URL`: Standard Supabase endpoint (`https://xpnkasclquplmrcmhsif.supabase.co`).
- `VITE_SUPABASE_ANON_KEY`: Public anonymous API key (JWT verifying anonymous access).
- `VITE_APP_ENV`: `preview` / `release-candidate`.

### 4.2 Server-Side Environment (Hosted API & Tooling)
- `SUPABASE_SERVICE_ROLE_KEY`: Guarded in Vercel sensitive environment variables; strictly excluded from browser builds.
- `SUPABASE_JWT_PRIVATE_KEY`: Asymmetric ES256 ECDSA private signing key (governed under Option B).
- `SUPABASE_JWT_PUBLIC_KEY`: Asymmetric ES256 ECDSA public key for signature verification.
- `ALLOW_NON_REHEARSAL_WORKSPACE`: Set to `false` in all scripts and non-production environments to enforce safety lock.

---

## 5. Infrastructure Readiness for Milestone 15 (Production)

| Component | Dev / RC State | Production Readiness Assessment |
| --- | --- | --- |
| **Supabase** | `jobquest-dev` (Free tier, AWS us-west-2) | Ready. Production will provision a dedicated Pro tier instance to avoid pause-on-inactivity and enable daily point-in-time recovery. |
| **Vercel** | Team `one-piece-5779` | Ready. Production custom domain will be bound to main branch during M15 cutover. |
| **Signing Key** | ES256 key pair in use | Ready. A fresh production-only key pair will be generated and imported during M15 setup. |
| **Database Pooler** | Supavisor active on 5432 | Ready. Handles high concurrency without connection exhaustion. |
| **Migration Tooling** | `scripts/migrate-legacy-data.mjs` | Ready. Production execution requires setting `CONFIRM_PRODUCTION_MIGRATION=true` to release safety interlock. |

---

## 6. Conclusion

All local, hosted development, and Vercel preview environments are healthy, securely configured, and synchronized with 18 applied database migrations.
