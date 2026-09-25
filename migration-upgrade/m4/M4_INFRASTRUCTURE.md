# M4 — Infrastructure & Environment Report

This document records the exact infrastructure state, database reconciliation, auth configuration, and cloud preview verification for **Milestone 4 — Contacts & Networking**.

---

## 1. Environment Architecture Overview

```
                                  +------------------------------------+
                                  |     Vercel Non-Production Preview  |
                                  | jobquest2-d5pdff0pm-one-piece-5779 |
                                  |       /api/health -> {"status":"ok"} |
                                  +-----------------+------------------+
                                                    |
                                                    v
+------------------------------------+    +------------------------------------+
|    Local Development Stack         |    |    Hosted Supabase Dev Project     |
|  - Postgres: 127.0.0.1:55322       |    |  - Project: jobquest-dev           |
|  - PostgREST: 127.0.0.1:55321      |    |  - Ref: xpnkasclquplmrcmhsif       |
|  - Option B Auth (ES256 / Argon2id)|    |  - Region: us-east-1               |
|  - Migration: 20260924400000_m4    |    |  - Migration: 20260924400000_m4    |
+------------------------------------+    +------------------------------------+
```

---

## 2. Local Supabase Environment

- **Status:** Healthy & Running
- **HTTP PostgREST Port:** `55321`
- **Postgres Database Port:** `55322`
- **Schema State:**
  - `20260924100000_m1_baseline.sql`
  - `20260924200000_m1b_auth_rls.sql`
  - `20260924300000_m3_applications.sql`
  - `20260924310000_m3_workflow_integrity.sql`
  - `20260924320000_m3_table_privileges.sql`
  - `20260924400000_m4_contacts_networking.sql` (100% applied)
- **Integration Test Target:** Evaluated directly via `pnpm test:integration` (65/65 passing).

---

## 3. Remote Hosted Supabase (`jobquest-dev`)

- **Project Name:** `jobquest-dev`
- **Project Ref:** `xpnkasclquplmrcmhsif`
- **Database Engine:** PostgreSQL 15.8 (Supabase Managed)
- **Migration Application:**
  - `20260924400000_m4_contacts_networking.sql` applied successfully via project-scoped migration runner.
  - Tables verified:
    - `public.companies`
    - `public.contacts`
    - `public.contact_interactions`
    - `public.application_contacts`
  - RPCs verified:
    - `rpc_create_contact`
    - `rpc_log_contact_interaction`
    - `rpc_link_application_contact`
    - `rpc_unlink_application_contact`
    - `rpc_archive_contact`
    - `rpc_restore_contact`
  - RLS Policies verified: 100% enabled and enforced for all member roles and peer isolation.

---

## 4. Option B Authentication Architecture

The Option B authentication model established in Milestone 1B remains strictly preserved:
1. **Asymmetric Key Pairs:** ES256 (ECDSA using the P-256 curve and SHA-256).
2. **Access Tokens:** Signed with custom private key; validated by PostgREST via JWT secret / public key. Short lifetime (15 minutes).
3. **Refresh Tokens:** High-entropy cryptographically random tokens stored in database verifiers with Argon2id hashing; exchanged via HttpOnly `SameSite=Lax` cookies.
4. **Tenant Isolation:** Tokens carry `user_id` and active `workspace_id`. All RLS policies query current workspace membership directly.
5. **Option A Inactivity:** Supabase native `auth.users` remains disabled and empty. Zero leakage between external auth providers and the application database.

---

## 5. Non-Production Vercel Preview

- **Project:** `jobquest2` (team: `one-piece-5779`)
- **Deployment URL:** `https://jobquest2-d5pdff0pm-one-piece-5779.vercel.app`
- **Health Endpoint:** `https://jobquest2-d5pdff0pm-one-piece-5779.vercel.app/api/health`
- **Health Response:** `{"status":"ok"}`
- **Security Scopes:**
  - Environment variables scoped exclusively to `Preview` and `Development`.
  - Production environments have NOT been created or modified.
  - Target branch remains `feature/m4-contacts-networking` without merging to `development` or `main`.
