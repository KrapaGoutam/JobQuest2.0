# M10 Infrastructure and Database Record

## Environment State

| Environment | State |
| --- | --- |
| Local Supabase | Migration `20260930100000_m10_import_export.sql` applied; 127/127 integration tests PASS |
| Hosted Supabase (Dev) | `jobquest-dev`, ref `xpnkasclquplmrcmhsif`; synchronized through `20260930100000`; 6/6 hosted M10 integration tests PASS |
| Vercel Project Link | Existing `jobquest2`, project `prj_0A32SVkbOH2fBI2XLFv7kSkv086d`, team `team_lsStfTKp3LGQEWGYRM0BJ4Pb` (`one-piece-5779`) |
| Vercel Preview | PASS — `dpl_BcDodgC5p7hzXT9qcyyhJtpwaTYa`, target Preview, READY, health/E2E/privacy/bundle green |
| Vercel Production | Untouched |
| Production Supabase | Untouched |
| Legacy JobQuest1.0 | Untouched (strictly read-only) |

## Database Migration & Schema Record

- **Migration**: `supabase/migrations/20260930100000_m10_import_export.sql`.
- **Ordering**: Positioned chronologically after M9 (`20260929100000_m9_dashboard_preferences.sql`).
- **Added Tables**:
  - `import_batches`: Durable metadata tracking workspace, target owner, format, total rows, outcomes (created, updated, skipped, rejected), and execution timestamp.
  - `import_rows`: Per-row audit records with status (`VALID`, `WARNING`, `INVALID`, `DUPLICATE`), outcome (`CREATED`, `UPDATED`, `SKIPPED`, `REJECTED`), error messages, and summary snapshot.
- **Added Column Fields**:
  - `applications.last_response_date`, `pinned`, `important`, `favorite`.
  - `application_documents.label` for imported resume/cover letter version tags.
- **RPC Domain Operation**:
  - `rpc_commit_import`: Executes the atomic import transaction. Rechecks caller workspace membership, validates target owner authorization, validates rows against schema constraints, executes duplicate handling rules (`SKIP`, `UPDATE_EXISTING`, `IMPORT_ANYWAY`), and writes history rows atomically. Unexpected database failures roll back the entire batch.

## Authorization & RLS Boundary

- `import_batches` and `import_rows` have strict Row Level Security:
  - Select is permitted for the record owner, or a workspace manager targeting authorized workspace members;
  - Peer reads are denied;
  - Cross-workspace reads are denied;
  - Anonymous requests are denied;
  - Direct client insert/update/delete is revoked; writes are strictly mediated through `rpc_commit_import`.

## Vercel Preview Verification

- Deployment ID: `dpl_BcDodgC5p7hzXT9qcyyhJtpwaTYa`
- Preview URL: `https://jobquest2-coylvgrif-one-piece-5779.vercel.app`
- State: `READY` (build time: 33s)
- `/api/health`: HTTP 200 `{"status":"ok"}`
- Live E2E: Full 4-step wizard test, duplicate detection, atomic commit, and export downloads verified on the preview URL.
- Option B Privacy: Verified via `e2e/leak.spec.ts` against the live preview URL (0 credentials or tokens in browser storage/DOM).
- Secret Scan: Deployed assets scanned against known secrets; 0 findings.
