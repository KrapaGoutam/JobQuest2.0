# Milestone 15 — Production Architecture Specification

**Status**: **PROPOSED ARCHITECTURE — PRE-FLIGHT VERIFIED**  
**Milestone**: Milestone 15 — Production Launch & Cutover  
**Branch**: `feature/m15-production-launch-cutover`  
**System Target**: Production (`jobquest-prod` / Vercel Production)

---

## 1. System Topology & Service Boundaries

JobQuest 2.0 adopts a modern, hybrid serverless and database-first architecture deployed across Vercel Edge infrastructure and Supabase Cloud:

```
                                  ┌───────────────────────────┐
                                  │   End User Web Browser    │
                                  │  (React 19 SPA / PWA)     │
                                  └─────────────┬─────────────┘
                                                │ HTTPS
                                                ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Vercel Edge Network / CDN (Global Anycast)                                                │
│                                                                                           │
│  - Edge WAF & Firewall (Rate limiting: 10 req/min on /api/v1/auth/*)                      │
│  - Static Asset Hosting (Single Page Application, Cache-Control, Brotli/Gzip)             │
│  - Serverless Node API (/api/v1/*, Express/Node.js runtime on AWS Lambda)                 │
│     * Option B Token Minting (ES256 ECDSA Private Key)                                    │
│     * CSRF / Origin Validation & CORS Governance                                          │
│     * Audited Manager RPCs & Multi-Entity Transactions                                    │
│     * Chrome Extension Capture Facade (/api/ext/v1/*)                                     │
└───────────────────────────────────────┬───────────────────────────────────────────────────┘
                                        │ PostgREST / PostgreSQL (TLS 1.3)
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Supabase Production Stack (AWS us-west-2, Pro Tier)                                       │
│                                                                                           │
│  - Supavisor Connection Pooler (Port 5432 / 6543, Transaction & Session mode)             │
│  - PostgREST API Engine (Auto-generated REST API governed by RLS)                         │
│  - Supabase Auth Service (Validates ES256 JWTs using imported public key)                 │
│  - PostgreSQL 16 Relational Engine:                                                       │
│     * 18 Applied Migrations (Profiles, Workspaces, Applications, Contacts, Journal, etc.) │
│     * Declarative Row-Level Security (Strict tenant & workspace isolation)               │
│     * Database Triggers (Audit logging, timestamp preservation)                           │
│     * Specialized Indexes (GIN Trigram on Job Description, Contacts, Journal)            │
│     * pg_cron Scheduled Engine (Hourly rate-limit cleanup)                                │
│  - Supabase Storage (S3-compatible document & resume vaults with RLS)                     │
└───────────────────────────────────────────────────────────────────────────────────────────┘
                                        ▲
                                        │ Manifest V3 Background Service Worker
                                  ┌─────┴─────────────────────┐
                                  │ Chrome Browser Extension  │
                                  │  (Job Board Extractor)    │
                                  └───────────────────────────┘
```

---

## 2. Option B Authentication in Production

### 2.1 Asymmetric Token Architecture
- **Algorithm**: `ES256` (ECDSA using NIST P-256 curve and SHA-256).
- **Private Key Custody**: Held exclusively by the Vercel Serverless Node API environment via sensitive environment variable (`SUPABASE_JWT_PRIVATE_KEY`). Private key material never reaches browser clients or Supabase.
- **Public Key Custody**: Imported directly into the Supabase production project's JWT verification settings (`Previously Used` rotation history maintained).
- **Token Verification**: Supabase PostgREST validates incoming bearer tokens natively against the public key without making round-trip network calls to the auth service.
- **Tenant & Role Claims**:
  - `sub`: User UUID.
  - `iss`: `jobquest-auth-v2`.
  - `aud`: `authenticated`.
  - `app_metadata.workspace_id`: Active workspace UUID.
  - `app_metadata.role`: Member role (`USER` or `MANAGER`).

### 2.2 Zero Synthetic Identity Invariant
- Production `auth.users` contains zero synthetic email addresses (`id_<uuid>@auth.jobquest.internal`).
- Option B operates cleanly without contaminating the Supabase Auth internal user ledger.

---

## 3. Database & Storage Architecture

### 3.1 Connection Management & Pooler
- **Engine**: Supavisor pooler enabled on port `5432` (transaction pooler) and port `6543` (session pooler).
- **Max Client Connections**: Configured for up to 200 concurrent pooler clients on Supabase Pro, preventing serverless connection starvation during traffic spikes.

### 3.2 Row-Level Security (RLS) Enforcement
- Every public table enforces RLS.
- Database queries executed by client applications automatically evaluate:
  ```sql
  WHERE workspace_id = (current_setting('request.jwt.claim.app_metadata', true)::jsonb->>'workspace_id')::uuid
  ```
- Cross-workspace data leakage is physically blocked at the database engine layer.

---

## 4. Security & Network Boundaries

| Layer | Security Mechanism | Enforced Behavior |
| --- | --- | --- |
| **Edge / DNS** | Cloudflare / Vercel Edge TLS | Strict HTTPS (TLS 1.3 enforced, HSTS header `max-age=31536000`) |
| **WAF** | Vercel Edge Firewall | Rate limit: 10 requests / minute / IP on `/api/v1/auth/*` |
| **Transport** | CORS & CSRF Checks | `Access-Control-Allow-Origin` restricted to production domain + Chrome extension ID |
| **Data in Transit** | Encrypted TLS Connections | PostgreSQL pooler enforces `sslmode=require` |
| **Data at Rest** | AES-256 Block Encryption | AWS EBS volume encryption active on Supabase instance |
| **Backups** | Point-in-Time Recovery (PITR) | Continuous WAL archiving + daily logical snapshots on Supabase Pro |
