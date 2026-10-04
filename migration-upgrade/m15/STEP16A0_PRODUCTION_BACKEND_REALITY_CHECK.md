# JobQuest2.0 M15-E — Step 16A-0: Production Backend Reality Check

Date: 2026-09-29 (session date). Read-only. **PRODUCTION WRITES PERFORMED: NONE.**
No Supabase project created, no migration, no Vercel env change, no redeploy, no claim-code reissue, no token created.

## 1. Headline

The operator states `jobquest-prod` was never created. The evidence does **not** support "production is on jobquest-dev":

- The live production frontend bundle embeds `https://kwmnljvyvqvbvimypnmw.supabase.co` (NOT `xpnkasclquplmrcmhsif`).
- `jobquest-dev` contains **none** of the migrated JobQuest data (no migrated workspace, no `jack`, no claim codes, no migration batches).
- Whether project `kwmnljvyvqvbvimypnmw` actually exists could NOT be established: the Supabase connector's account sees only `jobquest-dev`, and per instruction the ref was not contacted (only a DNS lookup, which is inconclusive — Supabase hostnames resolve for any ref).

Classification: **CASE D (backend not fully identified), leaning CASE B** (an existing project not visible to this connector). Case A (prod on jobquest-dev) is **refuted for the frontend** and **unproven for the server**.

## 2. Evidence table

| Check | Result | Source |
|---|---|---|
| origin/main | `bfa82eb557c5e748ba5d7c91fe122fb8294d2313` (unchanged); origin/development `1ed8fdd1` | git fetch |
| Prod deployment | `dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK`, target production, READY, source git, commit main `bfa82eb5`, aliases incl. jobquest2.vercel.app; GET / = 200 | Vercel MCP get_deployment |
| Frontend Supabase URL | `https://kwmnljvyvqvbvimypnmw.supabase.co` | live bundle `assets/index-CGS7DZPG.js` (1 occurrence); also `VITE_SUPABASE_URL` in the operator's 2026-09-28 `vercel env pull` snapshot |
| Frontend matches jobquest-dev | **NO** | above |
| Server `SUPABASE_URL` | **UNKNOWN** — Vercel stores it as Sensitive (`[SENSITIVE]` in the pulled snapshot; Vercel MCP project/env endpoints returned 404 this session). Not decrypted. | — |
| Frontend/server match | **UNKNOWN** | — |
| Preview frontend/server | jobquest-dev (`xpnkasclquplmrcmhsif`) per Phase 11 record (`PREVIEW_BACKEND_IS_PRODUCTION=false`); **not re-verified** this session (Preview deployment fetch denied by connector) | handoff |
| Supabase connector visibility | only `jobquest-dev` (us-west-2, ACTIVE_HEALTHY, PG 17.6, created 2026-09-24) | Supabase MCP list_projects |
| Local post-migration dump | exists, 869,912 bytes, SHA-256 `75aa9002…2551` matches the M15D rollback report; contains `supabase_migrations.schema_migrations`, `legacy_claim_codes`, `migration_batches`, `rpc_record_auth_failure`; contains **no** `rpc_claim_legacy_account` | local file inspection (grep only, nothing restored) |

Unreconciled contradiction (must be resolved by the operator, not by an agent): M15C/M15D docs describe a preflight, a live migration (222/89/533/49) and a `pg_dump` of a Supabase database at `db.kwmnljvyvqvbvimypnmw.supabase.co`, the dump artifact is real and matches its recorded checksum, and the production frontend points at that ref — yet the operator says no such project exists. Possible explanations: the project exists under a different Supabase login/org than the one this connector is authorized for; or the ref is stale/wrong and the earlier records are wrong. This session cannot tell which.

## 3. jobquest-dev (read-only inspection, `xpnkasclquplmrcmhsif`)

- Migrations applied: 18 (`20260924120000` … `20261020100000`, through M14). **`20261021100000_m15_legacy_claim_rpc`: NOT APPLIED.**
- `rpc_claim_legacy_account`: **MISSING** (0 rows in pg_proc).
- Counts: workspaces 393, users 292, applications 319, job_snapshots 54, application_events 644. This is dev/E2E/QA test data.
- Migrated JobQuest data: workspace `018f0000-0000-4000-8000-000000000001` = 0; applications/snapshots/events in it = 0; `migration_batches` = 0; `migration_id_mappings` = 0; `legacy_claim_codes` = 0; user `jack` = 0.
- Note: the schema has no `tags` table; the "49 tags" figure cannot be counted as a table row here.
- Therefore jobquest-dev is **not** the live data location and must NOT be treated as a source of production data. Nothing was written.

## 4. Live target `kwmnljvyvqvbvimypnmw` — status

| Item | Status |
|---|---|
| Exists | UNKNOWN (operator: no; frontend/docs/dump: yes) |
| Migration state | UNKNOWN directly. Inferred from the 2026-09-28 dump: schema migrated, claim RPC absent |
| Claim migration 20261021100000 | **UNKNOWN** (inferred NOT APPLIED as of 2026-09-28) |
| Claim RPC | **UNKNOWN** (inferred MISSING); on the only reachable DB (dev) it is MISSING |
| Live data (222/89/533/49, jack, workspace `018f0000-…0001`) | UNKNOWN; last known good = local dump + locked JobQuest1 export |

## 5. Risk

Environment separation: **MEDIUM** while unresolved (frontend is separated from dev; server ref unverified; one project ref may be unreachable). Escalates to **HIGH / prod outage** if `kwmnljvyvqvbvimypnmw` does not exist (production app would have no working backend; the claim path is already non-functional). If server `SUPABASE_URL` turns out to be `xpnkasc…` (frontend/server mismatch — CASE C), then production writes would land in the dev DB with test data, rate-limit rows and E2E accounts shared with Preview: **HIGH**.

## 6. Decision branches (operator answer needed first)

Operator action to resolve (read-only, no agent access needed): sign in to every Supabase login/org you use and check whether `https://supabase.com/dashboard/project/kwmnljvyvqvbvimypnmw` opens; and check the host inside vaulted `SUPABASE_PROD_DB_URL`. Also confirm what Vercel shows for `SUPABASE_URL` in Production (Settings → Environment Variables; the Sensitive value can be compared, not read, e.g. by re-entering; or via `vercel env pull` value inspected locally by the operator).

- **Branch X — project exists (other account):** no new project. Give this connector access (or run `STEP16A1_READONLY_PROD_QUERIES.sql` Q1–Q8 and paste output), then execute the previously prepared 16A-2 (apply migration 19 only, reissue claim code, smoke). Prior "jobquest-prod" docs become valid again.
- **Branch Y — project does not exist:** dedicated production project is REQUIRED. Frontend + (likely) server env point at a dead ref. Source of truth for data is NOT jobquest-dev.

## 7. Target architecture (per approved docs, PRODUCTION_ENVIRONMENT_MATRIX / PRODUCTION_ARCHITECTURE)

```
Vercel Production  -> dedicated Supabase production project (new real ref)
Vercel Preview/Dev -> jobquest-dev (xpnkasclquplmrcmhsif)
```
Production Vercel variables to change at cutover (Production scope ONLY; do not touch Preview/Development):
`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. `VITE_*` are build-time, so a production redeploy is mandatory. Unchanged: `JQ_JWT_*`, `EXTENSION_TOKEN_PEPPER`, `APP_ORIGINS`, `REGISTER_IP_MAX_PER_HOUR` (Production-only secret, not shared with Preview per Step 15.5 record). Scope sharing of the Supabase variables: Step 15.5 lists them as present in Production; per-scope values could not be re-read this session (Vercel env endpoint 404, SUPABASE_URL Sensitive). Frontend evidence shows Production ≠ Preview for `VITE_SUPABASE_URL`.

## 8. Plan — dedicated production project (Branch Y; NOT EXECUTED)

Spec: name `jobquest-prod`; region: prior docs record `us-east-1` and Vercel functions run in `iad1` (US East) → choose **us-east-1** for latency to `iad1` unless the operator decides otherwise; plan: free/lowest tier unless PITR/backups are required (decide explicitly — note free tier has no PITR; take manual dumps). A new project gets a NEW ref; the old ref is never reused.

Order:
1. Operator creates the project (or authorizes agent to) → capture real ref/URL/keys into the vault only.
2. Apply the full verified chain: 18 migrations (through M14) + `20261021100000_m15_legacy_claim_rpc` = 19, in order, to the clean project; verify schema, RLS on all public tables, function grants (`rpc_claim_legacy_account` service_role only), advisors.
3. Load production data (see §9).
4. Reconcile row counts 222/89/533/49-equivalent, FK integrity, id mappings, checksums.
5. Set Production-scope Vercel variables (§7). Snapshot the old values first.
6. Controlled production redeploy of the same SHA; verify `/health`, login page, no console errors; frontend bundle must embed the new ref.
7. Read-only smoke, then claim-code issuance for the migrated user in the NEW DB, then authorized claim smoke.
8. Production extension activation (later, 16B). 9. Stabilization (14 days; JobQuest1 remains standby).

## 9. Data-copy strategy

Do NOT clone jobquest-dev (393 workspaces / 292 users of test data, no migrated data). Schema comes from migrations only. Data source, in preference order:
1. **Re-run `scripts/migrate-legacy-data.mjs` (verified engine) against the clean project** using the locked export `_secure-backups/jobquest1/20260928_120500/legacy_neon_export_20260928_120500.json` (or the still read-only Neon standby). Deterministic, no smoke/test rows. It creates: migration batch + id mappings, the migrated workspace `018f0000-0000-4000-8000-000000000001`, the staged user profile (jack, STAGED), workspace membership (MANAGER), applications, job snapshots, application events, tags, and a legacy claim code row. Tables involved in dependency order: `user_accounts` → `profiles` → `workspaces` → `workspace_members` → `migration_batches` → `companies` → `applications` → `job_snapshots` → `application_events` → `migration_id_mappings` → `legacy_claim_codes`. (Contacts/interviews/tasks/habits/resumes/goals/journal are not part of the legacy import; verify against the engine before assuming.)
2. Fallback: `pg_restore` of the checksummed post-migration dump (869,912 B). It also contains the Personal (`b3796127-…`) and Smoke (`00000000-…`) workspaces and a stale claim code; would need selective restore and cleanup.
Not a source: jobquest-dev.

Credentials: password/PIN hashes → not migrated (zero PIN hashes by design); recovery-code hashes → regenerated per user; claim-code hash → **regenerate** in the final DB (old vaulted code is stale-format); `auth_sessions` / `auth_refresh_tokens` → not migrated, all invalidated; `extension_tokens` → not migrated (none in prod; users mint in-app); `auth_rate_limits`, `audit_events` → not migrated (audit of the old system stays with the old DB / backup). No hashes or secrets were read this session.

## 10. Ordering and timing

- **Claim-code reissue: AFTER the final DB is confirmed** (after cutover verification), never before, so no code is generated in a DB about to be replaced. If Branch X, after migration 19 is applied.
- **Production extension: only after** DB cutover, core app smoke, and claim-flow confirmation (16B). Prod `EXTENSION_TOKEN_ENV` is unset (tokens `jqx_dev_`); making them live is a separate Vercel env change.
- **Write freeze:** production is not open to real users (jack is STAGED, claim non-functional; JobQuest1 remains the live system and its data source is read-only). A long freeze is not needed. Minimal-safe: (a) keep JobQuest1 read-only; (b) do not issue claim code or mint tokens until after verification; (c) public `/auth/register` is the only writer — accept a short window or keep the strict per-IP limit; (d) if the operator wants zero writes, temporarily set Production `REGISTER_IP_MAX_PER_HOUR=0` (a write op requiring approval). Not activated.

## 11. Rollback design (not executed)

Keep the old Production Vercel env values (snapshot before change) and the previously deployed Vercel deployment `dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK`; leave any old project intact/untouched (no deletion or pause). Roll back = restore the five variables to the snapshot + redeploy (because of `VITE_*`) or Vercel instant rollback if the old deployment's env is compatible. Data written in the new DB during the window is not carried back; with production closed to real users, the loss window is empty. Keep the pre-cutover dump and JobQuest1 export until stabilization ends.

## 12. Future writes requiring operator approval (all NOT performed)

1. Create a dedicated Supabase production project (Branch Y).
2. Apply 19 migrations to it (or migration 19 only to the existing project, Branch X).
3. Load/migrate production data (migration engine or pg_restore).
4. Update Production-scope Vercel variables (five Supabase vars).
5. Redeploy production.
6. Issue/reissue the claim code and perform the claim smoke.
7. (Later) production extension token/activation/packaging decision; optionally set `REGISTER_IP_MAX_PER_HOUR`.

## 13. Superseded / disputed statements

The following documents state `jobquest-prod` / `kwmnljvyvqvbvimypnmw` as a verified real production resource and remain as **historical record**: M15A/M15C/M15D reports, `PRODUCTION_ENVIRONMENT_MATRIX.md`, `M15D_*`, `M15E_*` reports, `IMPLEMENTATION_PLAN.md`, `GO_NO_GO_CHECKLIST.md`, `M15_USER_DECISION_GATE.md`, `M15E_EXTENSION_EXECUTION_CHECKLIST.md`, `CURRENT_AGENT_STATE.md`. Status per operator, 2026-09-29: **DISPUTED — operator states this Supabase production project was never created.** This session found contradicting evidence (§2), so it is recorded as **UNRECONCILED**, not as settled either way. Active handoff files carry an annotation; history is not deleted.
