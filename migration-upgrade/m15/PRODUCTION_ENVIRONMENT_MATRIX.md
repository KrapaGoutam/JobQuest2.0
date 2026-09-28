# Milestone 15 — Production Environment Matrix

**Status**: **PROPOSED — PRE-FLIGHT VERIFIED**  
**Milestone**: Milestone 15 — Production Launch & Cutover  
**Branch**: `feature/m15-production-launch-cutover`

---

## 1. Multi-Tier Environment Comparison Matrix

| Dimension | Local Development | Hosted Development (`jobquest-dev`) | Vercel Preview RC (`v2.0.0-rc.1`) | Production Target (`jobquest-prod`) |
| --- | --- | --- | --- | --- |
| **Purpose** | Local development & unit/integration tests | Cloud integration & multi-user staging | Release Candidate verification & E2E audit | Public production service |
| **Hosting Platform** | Local Docker Desktop | Supabase Cloud (Free Tier) | Vercel Edge (Preview deployment) | Supabase Pro + Vercel Production |
| **Cloud Region** | `localhost` / `127.0.0.1` | AWS US West (`us-west-2`) | Vercel Global Edge CDN | AWS US West (`us-west-2`) |
| **Database Host / Project Ref** | `127.0.0.1:55322` | `xpnkasclquplmrcmhsif` | Connected to `jobquest-dev` for API | Dedicated `jobquest-prod` project |
| **Database Pooler** | Direct PostgreSQL (55322) | Supavisor (Port 5432, `aws-0-us-west-2`) | PostgREST via API | Supavisor (Port 5432, `aws-0-us-west-2`) |
| **Active Migrations** | 18 migrations applied | 18 migrations applied | Supported by 18 migrations | 18 migrations to apply sequentially |
| **Auth Architecture** | Option B (Local ES256 key pair) | Option B (Imported key `a73390b9-...`) | Option B (Minted via serverless API) | Option B (Fresh production ES256 key pair) |
| **Synthetic Identities** | 0 in `auth.users` | 0 in `auth.users` (purged in M1B) | 0 in `auth.users` | 0 in `auth.users` (strict invariant) |
| **Primary Domain / URL** | `http://localhost:5173` | PostgREST / Dashboard | `https://jobquest2-33y9un1oa-one-piece-5779.vercel.app` | Custom domain (or `jobquest2.vercel.app`) |
| **Health Endpoint** | `http://localhost:3000/api/health` | Via API | `https://.../api/health` (98ms) | Production `/api/health` |
| **Backup Cadence** | N/A (Disposable stack) | None (Free tier) | N/A (Stateless frontend) | Daily automated snapshots + continuous PITR |
| **Auto-Pause Policy** | N/A | Pauses after 7 days of inactivity | N/A | **NO AUTO-PAUSE** (guaranteed by Pro tier) |
| **Git Source Branch** | Any local branch | Synchronized via `development` | Built from `feature/m14-...` | Built exclusively from `main` |

---

## 2. Environment Isolation Verification

1. **Safety Locks Active**:
   - `scripts/migrate-legacy-data.mjs` enforces `assertSafeTarget()`, preventing local or development scripts from pointing to production hosts unless `CONFIRM_PRODUCTION_MIGRATION=true` is explicitly provided.
2. **Strict Credential Separation**:
   - No production service-role keys or database passwords exist in local environment files (`.env`, `.env.local`).
   - Production secrets exist exclusively in Vercel Sensitive Environment Variables.
3. **Zero Contamination**:
   - Rehearsal data and test records created in Milestone 14 remain strictly inside `jobquest-dev` and local Docker stacks. Production begins with a completely clean database.
