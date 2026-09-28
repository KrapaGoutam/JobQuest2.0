# Milestone 13 — Infrastructure & Hosted Environments: Global Search & Parity

## 1. Scope & Execution Principles

Milestone 13 introduces database and backend services necessary for global workspace search and career journal parity, verified against both local development environments and hosted development infrastructure.

Per strict project governance:
- **Production Supabase project is untouched**: No production databases exist or were contacted.
- **Production Vercel deployment is untouched**: Only preview deployments were created; `vercel deploy --prod` was NEVER invoked.
- **Hosted Development Project**:
  - Name: `jobquest-dev`
  - Reference: `xpnkasclquplmrcmhsif`
  - Region: `aws-0-us-west-2`
  - Pooler URL: `aws-0-us-west-2.pooler.supabase.com:5432`

---

## 2. Database Migrations Applied

### 2.1 Applied Migration
- **File**: `supabase/migrations/20261015100000_m13_global_search_journal.sql`
- **Objects Created**:
  1. Table `public.journal_entries` (composite checks, application FK `on delete set null`, workspace FK `on delete cascade`).
  2. RLS policies on `public.journal_entries`: `p_journal_entries_read`, `p_journal_entries_insert`, `p_journal_entries_update`, `p_journal_entries_delete`.
  3. Audit trigger `trg_audit_journal_entries` auditing cross-user updates and deletions by workspace managers into `public.audit_events`.
  4. Stored procedures:
     - `rpc_create_journal_entry`
     - `rpc_update_journal_entry`
     - `rpc_delete_journal_entry`
     - `rpc_global_search` (multi-domain search across applications, job snapshots, contacts, notes/journal, interviews, and documents).
- **Execution**:
  - Local: Applied and verified via `supabase db reset`.
  - Hosted Dev (`jobquest-dev`): Applied additively and verified via direct PostgreSQL connection.
  - Zero destructive changes; full backward compatibility preserved.

---

## 3. Vercel Preview Deployments

| Deployment ID | URL | Target | Ready State | Commit / Notes |
| --- | --- | --- | --- | --- |
| `dpl_74Zppt2tnY1kKwVWtx5C3hExEZFb` | `https://jobquest2-qyo2zi4nx-one-piece-5779.vercel.app` | Preview | `READY` | Milestone 13 verified build; zero secret findings; passed E2E and visual regression |

### Preview Verification:
- Liveness Probe (`/api/health`): Returns `{ "status": "ok" }`.
- Bundle Secret Scan: 4 assets inspected; 0 secrets or sensitive keys leaked (recorded in `migration-upgrade/m13/evidence/preview-bundle-scan-qyo2zi4nx.json`).
- Playwright E2E: Executed against `https://jobquest2-qyo2zi4nx-one-piece-5779.vercel.app` with zero blocking accessibility violations.
