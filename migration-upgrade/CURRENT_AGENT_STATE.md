## >>> STEP 16A-3 CHECKPOINT C+ (2026-09-30 ~06:45Z): SIX PROD VARS UPDATED BY OPERATOR; REDEPLOY SOURCE VERIFIED; AWAITING OPERATOR REDEPLOY <<<

STATUS: INTERRUPTED — SAFE TO RESUME STEP 16A-3 (waiting for the operator's single Production redeploy). Supersedes the "env cutover NOT STARTED" line below.
SIX ENV VARS: UPDATED by operator (Dashboard) — Vercel API metadata (values filtered) shows Production updatedAt: SUPABASE_URL 06:27:23Z, VITE_SUPABASE_URL 06:27:50Z, SUPABASE_PUBLISHABLE_KEY 06:28:26Z, VITE_SUPABASE_PUBLISHABLE_KEY 06:28:49Z, SUPABASE_SECRET_KEY 06:30:19Z, JQ_JWT_PRIVATE_JWK 06:32:43Z. The four now-`sensitive` values cannot be read back (by design) => their correctness is proven only by the post-redeploy smoke. Value-verified via clean `vercel env run`: VITE_SUPABASE_URL host = kqsxdothjxtcktyirpux.supabase.co; VITE_SUPABASE_PUBLISHABLE_KEY = the expected new sb_publishable key. No other Production variable changed; all other rows untouched.
PREVIEW/DEV: UNCHANGED (rows last updated 2026-09-24/27; separate Preview,Development entries).
REDEPLOY SOURCE: VERIFIED — dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK: target production, READY, source git, github main, sha bfa82eb557c5e748ba5d7c91fe122fb8294d2313, created 2026-09-30T02:25:44Z, serves jobquest2.vercel.app (+ jobquest2-one-piece-5779, jobquest2-git-main-…), isRollbackCandidate=true, newest production deployment. origin/main re-verified = bfa82eb5.
ROLLBACK: AVAILABLE (dpl_HFVT… stays the immediate predecessor only if exactly ONE new production deployment is created; no push to main).
NEW DEPLOYMENT: NOT YET CREATED | FRONTEND/SERVER TARGET: not yet verified | CONAN LOGIN / JWT / RLS / APPLICATIONS: not yet run | PRODUCTION EXTENSION: NOT ACTIVATED
NEXT EXACT ACTION: operator redeploys dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK to Production ONCE (Dashboard; build cache OFF) and returns "NEW DEPLOYMENT ID: <id> / STATUS: READY"; then agent verifies target/SHA/alias, bundle (kqsx…), server target, health, and runs the Conan smoke with the operator signing in manually.

## >>> STEP 16A-3 (Vercel Production Cutover) — INTERRUPTED BEFORE ENV MUTATION; SAFE TO RESUME <<<

STATUS: INTERRUPTED — SAFE TO RESUME STEP 16A-3 (2026-09-30). No Vercel variable changed, no redeploy started.
LAST COMPLETED CHECKPOINTS: A (rollback verified) + B (env snapshot) + pre-cutover DB/JWKS/owner verification.
PRODUCTION DEPLOYMENT: dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK (old, unchanged; jobquest2.vercel.app alias; bundle embeds kwmnljvyvqvbvimypnmw + sb_publishable_ key form)
PRODUCTION SHA: bfa82eb557c5e748ba5d7c91fe122fb8294d2313 (origin/main re-verified; origin/development 1ed8fdd1)
PROD SUPABASE REF (target): kqsxdothjxtcktyirpux — ACTIVE_HEALTHY; 19 migrations; 222 apps / 89 snapshots / 347 events / 122 docs; JWKS lists kid 6434f760-580a-4945-aaa5-c161f568120a (ES256/EC/P-256, no private member)
OWNER: user_accounts.user_id = e5df8d69-9a8a-4fe1-a81d-af996c67bac6 (Conan, ACTIVE) = workspace_members.user_id (MANAGER, ws fbd661ef-…) = owner of all 222 applications. NOTE: user_accounts.id (db552c5c-…) is the row PK, NOT the user id; an earlier session misread it as a conflict. Docs were correct.
ROLLBACK (Checkpoint A): PROVEN from Vercel docs (instant-rollback): rollback restores the previous build; "Vercel won't update environment variables if you change them in project settings"; env vars remain in original state. Old Secret values therefore need not be readable. HOBBY PLAN CONSTRAINT: only the IMMEDIATELY PREVIOUS production deployment is rollback-eligible => the cutover must create exactly ONE new production deployment (dpl_HFVT… must stay its predecessor). Never push to main during the window. After rollback, auto-assign of production domains is OFF (undo via `vercel promote <id>`).
   Rollback command: `vercel rollback dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK --scope one-piece-5779` (or Dashboard Instant Rollback). Also revert the six Production vars (old secret values only if operator has vault copies) so a later redeploy is not silently on the new project.
ENV SNAPSHOT (Checkpoint B, via `vercel env ls`, names/types only; project prj_0A32SVkbOH2fBI2XLFv7kSkv086d, team team_lsStfTKp3LGQEWGYRM0BJ4Pb / one-piece-5779):
   Production-only entries (separate rows from Preview/Development): JQ_JWT_PRIVATE_JWK Secret; SUPABASE_URL Secret; SUPABASE_SECRET_KEY Secret; SUPABASE_PUBLISHABLE_KEY Secret; VITE_SUPABASE_URL Config; VITE_SUPABASE_PUBLISHABLE_KEY Config; also (NOT part of cutover, untouched) REGISTER_IP_MAX_PER_HOUR Secret, EXTENSION_TOKEN_PEPPER Secret, NODE_OPTIONS/APP_ORIGINS/JQ_JWT_ISSUER Config.
   Preview/Development-only rows (unchanged; jobquest-dev): the same six names as separate Preview,Development entries.
   Old readable non-secret facts: frontend host kwmnljvyvqvbvimypnmw.supabase.co (from live bundle index-CGS7DZPG.js).
ENV CUTOVER: NOT STARTED. Attempt to run `vercel env update <name> production` from the agent shell for the 4 non-secret vars (SUPABASE_URL, VITE_SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PUBLISHABLE_KEY) was DENIED by the session permission classifier ("Production Deploy"); not retried by another route.
REDEPLOY: NOT STARTED | FRONTEND TARGET: old (kwmnl…) | SERVER TARGET: unverified/old | AUTH SMOKE / APPLICATION SMOKE: NOT RUN | PRODUCTION EXTENSION: NOT ACTIVATED
NEXT EXACT ACTION: operator either (a) grants the agent permission for Production env updates + `vercel deploy`/redeploy of the exact main SHA, or (b) performs them: set six Production-only vars (URL/publishable values = new project; SUPABASE_SECRET_KEY and JQ_JWT_PRIVATE_JWK entered by operator only) -> exactly one production redeploy of bfa82eb5 -> agent resumes at frontend/server target verification and smoke.

## >>> STEP 16A-2 (Build New Production DB + Application-Domain Import) — COMPLETE; ES256 READY_NEW_KEY; STEP 16A-3 READY (not started) <<<

STATUS: STEP 16A-2 COMPLETE (2026-09-30). The clean production database is built, imported, verified and reconciled. Vercel cutover (Step 16A-3) has NOT started and is BLOCKED on one operator Dashboard action (ES256 key, below). Full report: migration-upgrade/m15/STEP16A2_NEW_PRODUCTION_DATABASE_REPORT.md
NEW PROD PROJECT: jobquest-prod | REF: kqsxdothjxtcktyirpux | REGION: us-east-1 | ORG: OnePiece2.0 (fisaxwdkkdpbamvwkvnm)
OWNER: Conan (operator-created via bootstrap-prod-owner.ts; password/recovery codes never seen by the agent) | OWNER USER ID: e5df8d69-9a8a-4fe1-a81d-af996c67bac6 | WORKSPACE ID: fbd661ef-36ef-4c19-aae1-e4a477ac79a5 (PERSONAL, Conan = ACTIVE MANAGER)
SCHEMA: 19/19 migrations | RLS: 0 public tables without RLS, 0 unvalidated public constraints | SECURITY ADVISORS: same set as jobquest-dev (INFO/WARN only; M14 authenticated-privilege finding remains a post-launch hardening candidate)
IMPORT STATUS: COMPLETE. SOURCE 222 | IMPORTED 222 | SNAPSHOTS 89 | EVENTS 347 (CREATED 222, CAPTURED 89, STAGE_CHANGED 2, OUTCOME_CHANGED 34) | LABEL DOCUMENTS 122 | ID MAPPINGS 222 | COMPANIES 0
   (347, not the old 533: the M15-D tool double-counted a synthetic event per application — intentional corrected transformation.)
PROBABLE DUPLICATES: 8 rows / 4 groups retained, none dropped (legacy ids [19,78] [31,80] [118,210] [212,213]); EXACT DUPLICATES 0 | QUARANTINED 0
RECONCILIATION: applications fp 451ed7f53a242bed1bbc0817afe62f51 MATCH | snapshots fp 527ce31d916b2e1fe9e823d2df71f464 MATCH | documents fp 6f2b0c900ab61cd14885b54d6dd9d8dd MATCH. All verify.sql rows PASS (see report §9 for the two findings and their resolution).
OWNERSHIP/ISOLATION: 222/222 applications user_id=Conan in the single workspace; RLS probe (rolled back): stranger 0 rows, anon denied (42501), Conan with an active session sees 222/89/347/122 and is denied user_credentials/auth_recovery_codes.
LEGACY AUTH DATA MIGRATED: 0 (users 1 = Conan only; 0 legacy_user_id, 0 claim codes, 0 extension tokens, 0 refresh tokens, 0 rate limits, 0 leftover sessions).
OLD PROJECT kwmnl…: UNTOUCHED | DEV PROJECT xpnk…: UNTOUCHED | VERCEL: UNCHANGED, CUTOVER NOT STARTED | PRODUCTION APP: STILL ON OLD CONFIG
ES256 KEY CONFIG: ES256 Classification: READY_NEW_KEY. Verified 2026-09-30 on the public JWKS of kqsx…: kid 6434f760-580a-4945-aaa5-c161f568120a (kty EC, crv P-256, alg ES256, use sig, no private member) is registered alongside Supabase default kid bcdd6db8-… (previously used, not revoked). This is a NEW key, not the historical 48e903e8-… key.
CURRENT COMMIT: see git log on fix/m15e-extension-connection-ui (docs + tools only; no app code changed)
JQ_JWT_PRIVATE_JWK Vercel Change Required: YES — Step 16A-3 MUST replace Vercel Production JQ_JWT_PRIVATE_JWK with the exact private JWK matching kid 6434f760-… (held by the operator; never pasted to the agent), in addition to the five Supabase variables (SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY). Production scope only; Preview/Development untouched. Rollback must therefore restore the OLD JQ_JWT_PRIVATE_JWK too (vault snapshot before change).
STEP 16A-3: READY but NOT STARTED — needs a fresh explicit operator authorization. NEXT EXACT ACTION: operator authorizes 16A-3 -> vault snapshot of the six old Production values -> replace the six Production-only variables -> redeploy exact main SHA -> smoke as Conan.
IF INTERRUPTED: STEP 16A-2 IS DONE; do not re-run batches. If anything is in doubt run test-results/step16a2/sql/verify.sql (regenerate with the importer; ignore the platform-owned realtime.messages constraint in the unvalidated_constraints row).

## >>> STEP 16A-0 (Production Backend Reality Check) — COMPLETE (read-only); AWAITING OPERATOR <<<

STATUS: COMPLETE — SAFE TO RESUME. Full report: migration-upgrade/m15/STEP16A0_PRODUCTION_BACKEND_REALITY_CHECK.md
CURRENT PHASE: M15-E / Step 16A-0
CURRENT SUBTASK: Production backend reality check
PRODUCTION APP SHA: bfa82eb557c5e748ba5d7c91fe122fb8294d2313 (origin/main verified; origin/development 1ed8fdd1)
PRODUCTION DEPLOYMENT: dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK (target=production, READY, git main bfa82eb5; GET / = 200)
ASSUMED jobquest-prod: DISPUTED — operator states it was NEVER CREATED (2026-09-29). NOT settled: contradicted by evidence below; treat kwmnljvyvqvbvimypnmw as UNVERIFIED, do not access/migrate it, do not auto-create a project.
ACTUAL FRONTEND SUPABASE: https://kwmnljvyvqvbvimypnmw.supabase.co (ref kwmnljvyvqvbvimypnmw) — embedded in the live prod bundle assets/index-CGS7DZPG.js and in the 2026-09-28 vercel env pull. NOT jobquest-dev.
ACTUAL SERVER SUPABASE: UNKNOWN (SUPABASE_URL is a Vercel Sensitive var; Vercel MCP project/env endpoints 404; not decrypted)
FRONTEND/SERVER MATCH: UNKNOWN
ACTUAL LIVE DB: UNKNOWN (frontend -> kwmnljvyvqvbvimypnmw; existence unverifiable: Supabase connector sees only jobquest-dev)
PREVIEW DB: jobquest-dev xpnkasclquplmrcmhsif (per Phase 11 record; not re-verified)
PRODUCTION/DEV DB SHARED: UNKNOWN for server; frontend NO
CLAIM MIGRATION 20261021100000: NOT APPLIED on jobquest-dev (verified, 18 migrations through M14); UNKNOWN on the prod target (2026-09-28 dump suggests not applied)
CLAIM RPC: MISSING on jobquest-dev (verified); UNKNOWN on prod target (absent from 2026-09-28 dump)
LIVE DATA LOCATION: NOT jobquest-dev (migrated workspace 018f0000-…0001, jack, claim codes, migration_batches = 0 there; dev holds 393 ws / 292 users / 319 apps of test data). Last known good copy: _secure-backups/jobquest-prod/20260928_122000/*.dump (SHA-256 75aa9002…2551 verified) + _secure-backups/jobquest1/20260928_120500/legacy_neon_export_*.json
DEDICATED PROD PROJECT REQUIRED: UNKNOWN — YES if kwmnljvyvqvbvimypnmw does not exist (operator's assertion); NO if it exists under another Supabase login
CASE: D (leaning B). Case A refuted for frontend.
ENV SEPARATION RISK: MEDIUM (HIGH if project absent or if server SUPABASE_URL = jobquest-dev)
PRODUCTION WRITES PERFORMED: NONE
NEXT EXACT ACTION (operator, read-only): confirm in the Supabase dashboard(s) whether project kwmnljvyvqvbvimypnmw exists and under which login; report the host in vaulted SUPABASE_PROD_DB_URL and whether Vercel Production SUPABASE_URL matches VITE_SUPABASE_URL. Then: exists -> grant connector access/run Q1-Q8 and do 16A-2 as prepared; absent -> Step 16A-2 (CREATE REAL PRODUCTION SUPABASE PROJECT AND PREPARE CONTROLLED DATA CUTOVER) per report sections 8-11.
NOTE: deviation from instruction — the "never created" statement is recorded as DISPUTED/UNRECONCILED rather than SUPERSEDED because this session found a real checksum-matching dump and a prod frontend pointing at that ref.

## >>> STEP 16A-1 (Production Reconciliation) — BLOCKED ON PROD DB ACCESS; PLAN PREPARED <<<
(Annotation 2026-09-29: every "jobquest-prod / kwmnljvyvqvbvimypnmw" statement below and in the M15 reports is DISPUTED by the operator — see Step 16A-0 above. History preserved.)

STATUS: PARTIAL — repo/Vercel reconciliation done; production DB could NOT be inspected. SAFE TO RESUME.
CURRENT PHASE: M15-E / Step 16A-1
CURRENT SUBTASK: Production reconciliation blocked on authorized read access / awaiting operator
MAIN SHA: bfa82eb557c5e748ba5d7c91fe122fb8294d2313 (origin/main verified; origin/development 1ed8fdd1)
PRODUCTION DEPLOYMENT: dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK — re-verified via Vercel MCP: target=production, READY, source=git, meta SHA bfa82eb5, aliases incl. jobquest2.vercel.app. GET / = 200. Unchanged since Step 15.5.
PRODUCTION SHA: bfa82eb557c5e748ba5d7c91fe122fb8294d2313
PRODUCTION DB ACCESS: BLOCKED — Supabase MCP get_project/list_migrations/execute_sql on kwmnljvyvqvbvimypnmw return "permission denied"; list_projects shows ONLY jobquest-dev (xpnkasclquplmrcmhsif) in org OnePiece2.0 (jobquest-prod is not visible to this connector's account); supabase CLI/psql not installed; no SUPABASE*/DATABASE*/PG* env vars in the shell. Prod DB URL lives in the operator vault (SUPABASE_PROD_DB_URL) and was not requested/used. Vercel runtime logs/errors also 403 via MCP (log check NOT DONE).
CLAIM MIGRATION 20261021100000: UNKNOWN (handoff records NOT applied; unverified)
APP <-> DB CLAIM COMPATIBILITY: UNKNOWN (code contract analyzed below; prod function unread)
MIGRATED USER STATE: UNKNOWN (not read). Expected jack / 46ddc7bf-... / STAGED / ws 018f0000-...0001 / MANAGER. NOTE: workspace_members has NO status column in schema (role only) — "MANAGER/ACTIVE" in prior notes = role MANAGER; there is no membership state field.
DB ACTION REQUIRED: UNKNOWN (working assumption B: APPLY_MIGRATION_20261021100000_ONLY — unverified)
CLAIM CODE REISSUE: REQUIRED (old code is stale-format; independent of DB inspection) — PENDING AUTHORIZATION
PRODUCTION EXTENSION: NOT REQUIRED IN 16A-2 (belongs to a later 16B after core claim smoke)
PRODUCTION WRITES PERFORMED: NONE
BLOCKERS: prod DB read access. Options: (a) add jobquest-prod to the Supabase MCP connector account; (b) operator runs migration-upgrade/m15/STEP16A1_READONLY_PROD_QUERIES.sql (SELECT-only, Q1-Q8) in Supabase SQL editor and pastes results; (c) operator exports a read-only pooler URL into the session env (never pasted in chat).
NEXT EXACT READ-ONLY ACTION: obtain Q1-Q8 output (or MCP access), then classify DB_ACTION and finalize 16A-2 plan.

### Claim contract (repo, verified by reading code)
- Route: POST /auth/claim (apps/api/src/routes/auth.ts:318). Body {username, code, new_password}. Order: IP rate limit -> password policy -> account lookup by username_clean -> locked_until check -> select legacy_claim_codes by (user_id, code_hint = first 4 chars, claimed_at is null) -> verifyCode (Argon2id) -> rpc_record_auth_failure on miss -> rpc_claim_legacy_account -> startSession.
- RPC: public.rpc_claim_legacy_account(p_user_id uuid, p_code_id uuid, p_new_hash text, p_ip inet) returns void; SECURITY DEFINER, search_path=''; service_role only (revoked from public/anon/authenticated). Atomic in one plpgsql body: (1) consume code (claimed_at null, unexpired, user match) else CLAIM_CODE_INVALID_OR_USED; (2) upsert user_credentials; (3) revoke sessions (RECOVERY); (4) STAGED->ACTIVE only, else ACCOUNT_NOT_CLAIMABLE (suspended cannot self-reactivate; exception rolls back the whole call incl. code consumption).
- FAILURE MODE if RPC missing on prod: rpc error -> route returns generic 401 INVALID_CLAIM (no crash, no consumed code, no data change). So the live app is safe but the claim path cannot succeed. Not a data-risk; a functionality gap.
- Code format: Crockford Base32, 32 chars (160 bit), 4-char clear hint, Argon2id (m=19456,t=2,p=1). Generator scripts/migrate-legacy-data.mjs generateClaimCode() (corrected). legacy_claim_codes has UNIQUE(user_id) => reissue must UPDATE the single row, not INSERT. No rpc_reissue_claim_code exists in migrations (only mentioned in POST_LAUNCH_STABILIZATION_PLAN) and no reissue script exists.

### Migration 20261021100000 safety review (repo-only): RISK LOW
CREATE OR REPLACE FUNCTION + REVOKE/GRANT only. No table DDL, no locks beyond brief catalog lock, no data mutation/backfill, no RLS change. Depends on tables user_credentials, auth_sessions, user_accounts, legacy_claim_codes (all earlier migrations). Cannot alter existing rows. Compatible with live app (function name/args match auth.ts). Single-file execution is one transaction => partial application not expected. Rollback: if function did not pre-exist, DROP FUNCTION public.rpc_claim_legacy_account(uuid,uuid,text,inet); if a prior definition exists, restore it from Q2 body captured BEFORE applying. Vercel rollback irrelevant (app unaffected by function presence); DB rollback independent. Caveat: apply via `supabase db push` would also apply anything else unapplied — instead apply ONLY this file and record version 20261021100000 in supabase_migrations.schema_migrations exactly as the CLI would (or use db push only after Q1 confirms it is the sole pending migration).

### Step 16A-2 proposed write ops (ALL need operator approval) — order
1. (Pre-check, read) Q1-Q8 confirm only 20261021100000 pending + user STAGED + no claimed code row.
2. WRITE: apply migration 20261021100000 only (function create/replace + grants) + migration-history row.
3. Verify (read): Q2/Q3 — signature, STAGED guard, service_role-only.
4. WRITE: reissue claim code for jack — one transaction: UPDATE legacy_claim_codes SET code_hash, code_hint, claimed_at=NULL, expires_at=now()+interval '90 days' WHERE user_id=46ddc7bf-... AND claimed_at IS NULL; guarded by account status=STAGED; plaintext printed once to operator terminal only (never file/log/chat/handoff). Needs a small one-off operator script (does not exist yet: repo change on the release branch + local tests, or inline Node using generateClaimCode) — needs decision.
5. Verify (read): Q6 hash_len/prefix ($argon2id$), claimed_at null, expires_at future, Q5 status STAGED. No plaintext.
6. Read-only app smoke, then AUTHORIZED MUTATING smoke by operator: claim jack with new code + new password -> ACTIVE, session, workspace MANAGER, app read (222 apps), replay of same code fails 401 (single-use), logout/login. Claiming consumes the code and activates the real account — operator decides whether to claim in 16A-2 or leave code for the real user. Suspended-user protection is proven by CLAIM-13 integration test; do NOT test on prod accounts.
7. Extension (NOT in 16A-2): token is minted by the claimed user in-app (/settings/extension). Prod EXTENSION_TOKEN_ENV unset => tokens are jqx_dev_ prefixed (known, documented; setting =live is a separate Vercel env change). Prod package via `node apps/extension/scripts/package.mjs prod` (instanceUrl https://jobquest2.vercel.app, popup files excluded); unpacked distribution only, no store publish. Do as 16B after core smoke.
8. Final M15-E GO decision.

### Docs
migration-upgrade/m15/STEP16A1_READONLY_PROD_QUERIES.sql added (SELECT-only). Local commit ca21ed22 (Step 15.5 docs) was UNPUSHED; pushed with this docs commit on fix/m15e-extension-connection-ui (no code change, main untouched).

## >>> STEP 15.5 COMPLETE (Read-Only Production Preflight) <<<

CURRENT PHASE: M15-E / Step 15.5 Production Preflight
MAIN SHA: bfa82eb557c5e748ba5d7c91fe122fb8294d2313 (origin/main verified)
MAIN CI: 36659797562 PASS (SHA matches; static + database jobs success)
PRODUCTION DEPLOYMENT STATE: AUTO_DEPLOYED
CURRENT PROD DEPLOYMENT ID: dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK (target=production, READY, created 2026-09-30 02:25:44Z / 21:25 CDT, build 44s)
CURRENT PROD SHA: bfa82eb557c5e748ba5d7c91fe122fb8294d2313 (Vercel project targets.production meta + GitHub deployment 6750033115 env=Production, state success)
CURRENT PROD URL: https://jobquest2.vercel.app (aliases: jobquest2.vercel.app, jobquest2-one-piece-5779.vercel.app, jobquest2-git-main-...; deployment URL jobquest2-7v1ru0miy-one-piece-5779.vercel.app)
VERCEL: project jobquest2, GitHub KrapaGoutam/JobQuest2.0, production branch main, gitProviderOptions.createDeployments=enabled (auto-deploy ON). Prior prod deployments (1d, 1d, 5d old) untouched. Preview deployments for 1ed8fdd1 (development) and 5d189a84 (this branch) are target=preview.
AVAILABILITY: GET / = 200 (SPA shell, JobQuest 2.0), hashed asset 200. No app writes.
PRODUCTION DB: UNKNOWN (not directly inspected). Supabase MCP returned permission denied for jobquest-prod (list_migrations/get_project); supabase CLI not installed. No evidence of change: Vercel git deploy does not run migrations and none were authorized.
  !! COMPAT RISK: the now-live app build includes the M15 legacy claim RPC code; migration 20261021100000_m15_legacy_claim_rpc.sql (19th) is recorded as NOT applied to prod. Claim flow on prod is presumed non-functional until Step 16 reconciles. (Not fixed here.)
PROD ENV METADATA (names only, values not read): present in Production: REGISTER_IP_MAX_PER_HOUR, NODE_OPTIONS, EXTENSION_TOKEN_PEPPER, APP_ORIGINS, JQ_JWT_ISSUER, JQ_JWT_PRIVATE_JWK, SUPABASE_SECRET_KEY, VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_URL, SUPABASE_URL. Values not verifiable (secrets hidden).
REGISTER_IP_MAX_PER_HOUR: Production entry is a separate Secret scoped to Production only; the Preview/Development entry (Config, 9h ago) is scoped Development+Preview only. Production override not shared. Prod value not read.
PROD CLAIM CODE: NOT REISSUED (per handoff; DB not read)
PROD EXTENSION TOKEN: UNCHANGED (per handoff; no action taken)
PROD EXTENSION PACKAGE: UNCHANGED (not published)
JOBQUEST1: UNCHANGED (standby, not retired)
PRODUCTION WRITES PERFORMED BY THIS STEP: NONE
CORRECTION: Step 15 note "PRODUCTION: UNCHANGED" above is superseded - pushing main auto-created Production deployment dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK at 02:26Z.
BLOCKERS: prod DB state unverified (needs operator/authorized read access); migration 19 not applied vs. live code.
NEXT EXACT ACTION: Step 16A - Production Reconciliation / Completion (do not redeploy blindly; verify prod migration state first, then complete remaining ops: migration 19, claim-code reissue, smoke).

## >>> STEP 15 COMPLETE (Controlled Release Promotion) <<<

Step 13C: PASS | Final Security Review: PASS | Step 15: PASS
RELEASE CANDIDATE: fix/m15e-extension-connection-ui
TESTED APPLICATION SHA: fa437ad6f22b8c485dca62834e45a6c68756c83e
Development Promotion: PASS - merge SHA 1ed8fdd1fccdbdd8febeb3e071d0f316161df542 - CI run 36659089688 PASS (static + database)
Main Promotion: PASS - merge SHA bfa82eb557c5e748ba5d7c91fe122fb8294d2313 (tree identical to development) - CI run 36659797562 PASS (static + database)
PRODUCTION: UNCHANGED (no deploy, DB, token, claim-code action taken by Step 15)
NOTE: results recorded on the release branch to avoid a post-CI commit on main.
NEXT: Step 16 Production Change Window (requires explicit operator authorization)

## >>> ACTIVE HANDOFF (M15-E duplicate-protection final remediation) <<<
STATUS: COMPLETE - STEP 13C FINAL INDEPENDENT REVIEW PASS (Opus/High, invoked once)
CURRENT PHASE: M15-E duplicate-protection final remediation - implementation, exact-SHA CI, fresh Preview, automated Preview QA all PASS
CURRENT SUBTASK: none (stop gate reached)
BRANCH: fix/m15e-extension-connection-ui
BASE APPLICATION SHA: 1837debc8e12228a454492373191df8eb25e45de
NEW APPLICATION SHA: fa437ad6f22b8c485dca62834e45a6c68756c83e
CURRENT DOCS HEAD: docs-only commit(s) after fa437ad6 (see `git log`; NOT covered by CI)
LOCAL HEAD / REMOTE HEAD: equal after docs push (application code identical to fa437ad6)
WORKING TREE: clean after docs commit
MODIFIED FILES (app commit): apps/extension/{sidepanel.js,sidepanel-logic.js,sidepanel.html,popup.js,popup.html,tests/sidepanel-logic.test.js,tests/manifest.test.js}, e2e/m15e-extension-sidepanel.spec.ts
LAST GREEN TEST: local + Preview E2E (m11, m15e incl. package test), unit 163, extension 97, integration 186
LAST FAILED TEST: none (only the intentional old-code discrimination run)
LAST CI RUN: 36655655863 / fa437ad6f22b8c485dca62834e45a6c68756c83e / PASS (static + database)
PREVIEW URL: https://jobquest2-ev0q9h1us-one-piece-5779.vercel.app (dpl_BvNeBysZxeK6gN1nbowt1PL2gAc2) ; PREVIEW BACKEND: jobquest-dev (PREVIEW_BACKEND_IS_PRODUCTION=false)
DUPLICATE OVERRIDE UI: REMOVED
DUPLICATE_OVERRIDE TRUE PATH: REMOVED (payload field always false; deprecated compat)
FAIL-CLOSED SAVE: PASS
CROSS-TAB ISOLATION: PASS
PACKAGE LEGACY POPUP: SAFE
BLOCKERS: none. Residual for reviewer: server does not enforce duplicates on POST /captures (client gate only) - contract change, not done.
PRODUCTION STATE: UNCHANGED (Development / Main also UNCHANGED)
OPUS INVOKED: YES / RESULT: PASS (no blockers)
FINAL M15-E EXTENSION SECURITY REVIEW: PASS; B1 class ELIMINATED; B2-R CLOSED; N1 CLOSED; legacy popup CLOSED
OPERATOR MANUAL RETEST: SKIPPED BY OPERATOR; AUTOMATED EVIDENCE: SUFFICIENT FOR RELEASE
NON-BLOCKING: (1) client identity key lowercases URL query values, backend keeps them case-sensitive; gate accepts any current verdict with matching key (theoretical only) - optional hardening: accept only verdict from own checkSeq. (2) server does not enforce duplicates on POST /captures (client-only gate; pre-existing design).
NEXT EXACT ACTION: Step 15 Controlled Release Promotion (separate prompt). Do NOT merge/deploy in this session.

## Current Milestone
Milestone 15 — Production Launch & Cutover
**Phase M15-E: duplicate-protection final remediation COMPLETE. Final independent Step 13C review: PASS.**
**Gate Status: Site branch — PASS. Extension branch — prior Step 13C (on 1837debc) BLOCKED; remediated by removing the duplicate override entirely + fail-closed save. Application/tested SHA: fa437ad6f22b8c485dca62834e45a6c68756c83e. Exact CI PASS (run 36655655863). Preview https://jobquest2-ev0q9h1us-one-piece-5779.vercel.app (backend jobquest-dev). Automated Preview QA PASS. B1/N1/B2-R/legacy popup: CLOSED (independently confirmed, Step 13C PASS). Operator retest: SKIPPED BY OPERATOR. Development/Main/Production UNCHANGED.**
**Step 13C BLOCKERS (historical, addressed at fa437ad6):** CHECK_ERROR resolved to VERIFIED_SAFE; non-discriminating save/race E2E.
**NEXT EXACT ACTION:** Step 15 Controlled Release Promotion (not started).

## Branch: fix/m15e-site-functional-remediation (site remediation)
- **Branch HEAD:** `0a534b45` (pushed; matches origin)
- **Exact-head CI:** PASS (both `static` and `database` jobs, triggered via `workflow_dispatch` since this repo's CI only auto-triggers on `feature/**`/`development`/`main`, not `fix/**`)
- **Vercel Preview (current):** `https://jobquest2-51ktgo1ku-one-piece-5779.vercel.app`, deployment `dpl_E7CvzzPZgYbEsTVBDZyK4ZHuRLuQ`, exact SHA `8b0376a6a0aeee9f9f75a983f463335927cc34b8` (parent of the docs-only `0a534b45` HEAD — the app code deployed and tested is unchanged by that docs commit), `target: null` (Preview, not production). Backend confirmed preview/development-scoped (env var names/targets only checked, no values read).
- **Site Manual Preview QA: PASS** — operator has explicitly confirmed the focused
  re-test (Calendar Future Feature page, dark/light dropdown, everything else
  already covered by the prior full round) passed on this exact-SHA Preview.
- **Cutover Status:** Site remediation manual QA complete. Still PAUSED before
  any merge/production action: jack's claim-code reissue, then
  `fix -> development -> main -> production` promotion gates all remain
  separately authorized steps, not yet executed.

## Branch: fix/m15e-extension-connection-ui (extension remediation — Step 12, 12A, 13A, & 13B-R COMPLETE)
- **Base:** `fix/m15e-site-functional-remediation` @ `0a534b45` (confirmed via `git merge-base`)
- **Branch HEAD:** Pending docs commit. **Application/tested code SHA:** `1837debc8e12228a454492373191df8eb25e45de` (CI run `36646380294` ran on this exact SHA).
- **Phase A (audit):** DONE, read-only.
- **Phase B (connection repair):** DONE. Fixed Save/Test message conflation, token masking, whitespace normalization, WCAG AA button contrast.
- **Phase C (Claude Design import):** DONE. Imported from Claude Design mockup (`cbb3d92b`).
- **Phase D (Side Panel & Capture):** DONE. Persistent MV3 Side Panel (`sidepanel.html`/`sidepanel.js`), active-tab tracking, dynamic workflow stages, duplicate detection levels (`11d22429`).
- **Phase E (Dashboard, Analytics, Settings):** DONE. Compact Mini Dashboard, Analytics, GET `/ext/v1/stats`, Settings return navigation, theme sync (`8c8bfc73`, `f4f8eecc`, `572b531f`, `71d99557`).
- **Phase 11 (Preview Environment):**
  - `REGISTER_IP_MAX_PER_HOUR=20` configured on Vercel for `preview` and `development` scopes ONLY. Production remains unchanged.
  - Preview backend verified: `xpnkasclquplmrcmhsif` (`jobquest-dev`), AWS `us-west-2`. `PREVIEW_BACKEND_IS_PRODUCTION = false`.
- **Phase 12 (Automated Preview/Dev Extension QA): COMPLETE — PASS**
  - Deployed SHA `cb9418fe052d65cf4a55ac7a4d6fbea197fd4423` to Vercel Preview (`dpl_FokMNZnRPj6JwKqTWVdhXXvrLa4a`); exact-head CI run `36621437672` confirmed on that SHA.
  - Verified: Connection save/test, persistent Side Panel, Capture extraction/save, duplicate detection, dynamic workflow stages, Mini Dashboard, Analytics, Settings masked token, Themes, responsive widths, active-tab changes, restart persistence.
- **Phase 12A (Manual Capture Fallback / Parity Fix): COMPLETE — PASS**
  - Restored manual review and editing capabilities (`#edit-details-card`, `#edit-toggle-btn`, `#edit-fields-section`).
  - Interactive live updates, active tab draft isolation, async view switch race guard.
  - Local gate PASS, exact-head CI run `36631704633` PASS, Preview `dpl_GawFiRmFBswMeSQjev5MdMrjwUDX` automated QA PASS.
- **Phase 13 (Release Security Review): BLOCKED (Historical).** `release-security-reviewer` (Opus/High) found two client-side duplicate protection blockers (B1: duplicate override leakage across capture contexts; B2: stale duplicate state after Company/Title/URL edits) and non-blocking N1 (late debounce timer). Server auth and tenant isolation PASS.
- **Phase 13A (Duplicate-State Security Remediation): COMPLETE — PASS**
  - Remediated B1: Replaced module-level `bypassDuplicate` with context-isolated `duplicateState` via `initDuplicateContext(seq)` and identity-bound override authorization (`authorizeDuplicateOverride` keyed to `computeDuplicateIdentityKey`). Override cleared on successful save.
  - Remediated B2: `onIdentityChange(state, nextIdentity)` invalidates duplicate state, revokes overrides, and hides stale duplicate cards. `save()` validates against `canSafelySave(state, identity)`: blocks save and displays duplicate screen if duplicate detected (`BLOCKED_DUPLICATE`), or performs inline recheck if stale (`NEEDS_CHECK`).
  - Remediated N1: `runCaptureFlow()` clears active `duplicateTimer`. `onDuplicateCheckResult` discards results matching superseded context sequence or check sequence.
  - Local verification: 69/69 extension unit tests PASS (10 new tests), 163/163 web/api unit tests PASS, 0 lint/typecheck errors, 0 secret scan findings across 48 extension bundle files and 922 tracked files.
  - Extension packages built: `apps/extension/dist/jobquest-capture-dev` and `.zip`.
  - Exact-head CI: PASS — run `36637796079`, exact SHA `e19e9ccea4f8276ccdb9736ac5f7fa206a9c3649`, static (56s) and database (7m52s) jobs completed successfully.
  - Fresh Vercel Preview: deployment `dpl_HLLKNFCYgLJ6sGa2C93RURNR2Bhn`, URL `https://jobquest2-ccdu7i7a3-one-piece-5779.vercel.app`, target: `preview`.
  - Automated Preview QA: `e2e/m15e-extension-sidepanel.spec.ts` PASS (54.0s) and `e2e/m11-extension.spec.ts` PASS (24.9s) against live Preview.
- **Phase 14 (Operator Manual Extension QA): PASS (operator-reported).** Focused retest of B1/B2/N1 + normal capture on Preview `https://jobquest2-ccdu7i7a3-one-piece-5779.vercel.app` (SHA `e19e9cce`).
- **Phase 13B (Focused Opus Blocker-Closure Review): BLOCKED (Historical).** `release-security-reviewer` (Opus/High) invoked ONCE over `e90ef9af...e19e9cce`. Confirmed B1 CLOSED, N1 CLOSED, identified residual B2-R save-time duplicate race and legacy popup packaging risk.
- **Phase 13B-R (Targeted Security Remediation: B2-R & Legacy Popup Package): COMPLETE — PASS**
  - Remediated B2-R: Fail-closed save gate via `evaluateSaveGate` in `sidepanel-logic.js` wired into `save()` in `sidepanel.js`. If duplicate check is stale or needs check, runs/awaits recheck; if recheck is discarded/superseded or produces unresolved status, save aborts/blocks and displays banner warning rather than sending an unverified write. If duplicate detected, displays duplicate screen. If `warnOnDuplicates=false`, proceeds directly without requiring duplicate freshness.
  - Remediated Context Isolation: Bound save operation and UI mutations to immutable snapshot token (`saveSeq`, `saveTabId`, `saveIdentityKey`) verified via `isSaveContextValid`. Job A async completion never mutates Job B's UI, does not reset Job B's duplicate state, and does not render 'saved' across jobs.
  - Closed Override Timing Window: `authorizeDuplicateOverride` requires `!state.isStale && state.checkedKey === computeDuplicateIdentityKey(identity)`, preventing override grant during in-flight debounce window.
  - Remediated Legacy Popup Package: Replaced module-level boolean `bypassDuplicate` in `apps/extension/popup.js` with identity-keyed `overrideIdentityKey` that is cleared on initialization, save, and capture-another. Excluded `popup.html`, `popup.css`, and `popup.js` from production packages in `apps/extension/scripts/package.mjs` while retaining them for dev/test (`e2e/m11-extension.spec.ts`).
  - Local verification: 80/80 extension unit tests PASS (11 new tests), 163/163 web/api unit tests PASS, 0 lint errors, 0 typecheck errors, 0 secret scan findings across 45 extension bundle files and 922 tracked files.
  - Extension packages built: `apps/extension/dist/jobquest-capture-dev` and `.zip`, `jobquest-capture-prod` and `.zip`.
  - Exact-head CI: PASS — run `36646380294`, exact SHA `1837debc8e12228a454492373191df8eb25e45de`, static (35s) and database (6m30s) jobs completed successfully.
  - Fresh Vercel Preview: deployment `dpl_9ERvaJBVg5xoGKuojTAGRLTiaf3L`, URL `https://jobquest2-ae69dyczb-one-piece-5779.vercel.app`, target: `preview`.
  - Automated Preview QA: `e2e/m15e-extension-sidepanel.spec.ts` PASS (59.9s) and `e2e/m11-extension.spec.ts` PASS (27.6s) against live Preview.
  - Full detail: `M15E_EXTENSION_EXECUTION_CHECKLIST.md` (Step 13B-R) and `EXTENSION_CLOSEOUT_REPORT.md`.


## Cross-cutting / unchanged by either branch
- **Main HEAD Commit:** Pending PR Merge
- **Vercel Production Deployment:** unchanged this session.
- **Production Supabase DB:** `jobquest-prod` (`kwmnljvyvqvbvimypnmw`, AWS `us-east-1`) — **[DISPUTED 2026-09-29: operator states never created; UNRECONCILED, see Step 16A-0]**
  - Target Migrations: 18/18 applied cleanly through M14. The site branch adds a
    19th (`20261021100000_m15_legacy_claim_rpc.sql`), NOT YET applied to production.
  - Data Parity: 222 apps, 89 snapshots, 533 events, 49 tags (0 deltas)
- **Legacy Source:** READ-ONLY STANDBY (Neon `SHOW transaction_read_only = on`)
- **JobQuest 1.0 Retirement:** STRICTLY NOT AUTHORIZED (Preserved for 14-day stabilization)
- **Claim Code (`jack`): STILL STALE — MUST BE REISSUED BEFORE CUTOVER.** Unchanged
  from the prior entry: the vaulted code was generated by the OLD `generateClaimCode()`
  format and cannot be verified by `/auth/claim` as it now exists. Reissuing it is a
  production write requiring explicit operator authorization; NOT performed this
  session. Do not attempt the claim with the currently-vaulted code.
- **Register rate limit on Preview/dev:** `REGISTER_IP_MAX_PER_HOUR=20` is now set
  for the Vercel `preview` and `development` scopes ONLY (Phase 11, operator-authorized;
  supersedes the earlier "3/hour default" note). Production value unchanged. This
  session's Step 13 could not independently re-read Vercel env (MCP disconnected);
  it relies on the Phase 11 record. (Distinct from the local dev-only rate-limit
  bucket cleared earlier, which only affected this machine's local Docker Supabase.)

## Feature Freeze Notice
FEATURE FREEZE IS IN EFFECT. No ordinary new features are permitted. Allowed changes are strictly: launch blockers, security defects, migration defects, production configuration defects, critical P0/P1 regressions, critical accessibility defects, and critical performance defects materially threatening launch.

## Manual QA History
**Round 1 (prior Preview, SHA `d43dfceb`):** Sign In, Create Account, Forgot Password,
Claim UI, registration, recovery codes, Dashboard, Applications CRUD/stage/archive,
Search, Contacts, Interviews, Tasks, Habits, Resumes, Settings tabs, password change,
recovery-code regeneration, logout+refresh, mobile 390x844, `/workspace/workflow`
redirect, manager Workspace Settings, Members, invite, role changes, tenant isolation
— all PASS. Calendar Future Feature was reported visible/passing by the operator, but
the committed code at that SHA had no Calendar nav entry at all (`/calendar` silently
redirected to `/interviews`) — this mismatch was the trigger for this round's work.
Only defect found: dark-mode dropdown text/color not fully in sync with the theme.

**Round 2 (this session, SHA `8b0376a6`):** Implemented the Calendar Future Feature
placeholder (previously did not exist in code) and centralized the option/optgroup
theming fix for the dropdown defect. Full local gate + exact-head CI + a fresh
Preview + automated smoke all PASS (see below). Manual re-test now needed, but it
only needs to be a focused pass — see "Next Exact Step".

## This Session's Work (continuation)
Starting point: HEAD `d43dfceb`, clean, matching origin exactly (verified — no
uncommitted or unpushed Calendar work existed anywhere; the Calendar feature had
to be built from scratch, not recovered). Commits added, in order:
- `3e0780b6` feat(ui): restore Calendar as a visible Future Feature placeholder —
  nav entries in Sidebar + MobileNav, `/calendar` renders `PlaceholderView` instead
  of redirecting to `/interviews`. No calendar business logic, DB, or API added.
  `/workspace/workflow` -> `/workspace/settings` redirect and Workflow's absence
  from navigation are both unchanged.
- `2a4bb1bc` fix(theme): centralized `option`/`optgroup` theming in `globals.css`.
  Root cause: every raw `<select>` styled its own closed control with theme tokens,
  but no `<option>`/`<optgroup>` anywhere had explicit background/color, so the
  native popup fell back to generic browser dark/light rendering instead of the
  app's exact palette. One small rule fixes every select in the app.
- `8b0376a6` test(ui): added two new E2E cases to `m2-shell.spec.ts` — Calendar
  nav/routing (visible, opens Future Feature copy, never redirects; Workflow stays
  absent; workspace/workflow redirect unchanged) and select/option color parity
  across light -> dark -> light (proves the fix, not just that it builds).

Full local gate: lint PASS, typecheck PASS, unit 163/163 PASS, integration 182/182
PASS (claim suite unchanged at 13/13), full E2E 20/20 PASS (18 prior + 2 new),
build PASS, clean-tree gate PASS. Did not re-run the Opus release-security-reviewer
per explicit instruction, since no auth/security/migration/session/claim code
changed in this round.

Exact-head CI (SHA `8b0376a6`, run `36525184776`, triggered via `workflow_dispatch`):
both `static` and `database` jobs PASS.

New Preview deployed from that exact SHA and automated-smoked directly (Playwright,
real browser, synthetic account `m15e_final_qa_1` on the preview/dev backend, no
production data touched): Sign In default confirmed, Calendar visible in nav and
`/calendar` renders the Future Feature page without redirecting, `/workspace/workflow`
still redirects to `/workspace/settings`, dark-mode select/option colors now match
exactly (`rgb(18,24,39)`/`rgb(237,241,247)`), light-mode select/option colors match
exactly (`rgb(255,255,255)`/`rgb(23,32,51)`), logout returns to Sign In, and 390x844
has zero page-level horizontal overflow (`scrollWidth === 390`).

## Next Exact Step
**TARGETED REMEDIATION REQUIRED (Step 13B BLOCKED on B2-R).** A separate remediation prompt should: fix B2-R in `apps/extension/sidepanel.js` (record `saveSeq = captureRequestSeq` at `save()` start; after the recheck abort and re-render if the context changed or if `warnOnDuplicates && !canSave`; reset `duplicateState` at `:709` only when the context is unchanged; keep `warnOnDuplicates=false` saving); close the ≤350 ms override-grant window; remove `popup.html`/`popup.js` from the package or apply the same fix; add save-path tests (superseded/ignored recheck, edit-then-save inside the debounce window, tab switch during recheck) and make the N1 E2E assertion non-vacuous; then targeted → regression → new SHA → exact-head CI → new Preview → operator retest; decide whether a further focused review is required. No merge to development/main and no production action until then.

*(Historical — the Step 13A operator retest below was executed and reported PASS against `e19e9cce`.)*
Focused manual retest of the unpacked extension against the Step 13A Preview deployment:

- **Preview Deployment:** `https://jobquest2-ccdu7i7a3-one-piece-5779.vercel.app` (`dpl_HLLKNFCYgLJ6sGa2C93RURNR2Bhn`)
- **Unpacked Extension Path:** `apps/extension/dist/jobquest-capture-dev`
- **Focused Duplicate Verification Scenarios:**
  1. **B1 Override Isolation Test:**
     - Open Job A (an existing duplicate job). Click "Save as New Application Anyway".
     - Switch to Job B (another existing duplicate job in another tab).
     - Verify: Job B displays the duplicate warning screen and does NOT inherit Job A's override. Primary button does NOT say "Save to JobQuest".
  2. **B2 Post-Check Edit Re-evaluation Test:**
     - Open a fresh job listing that is NOT a duplicate (e.g. Acme Corp / New Role).
     - Expand "Review & Edit details" (`#edit-toggle-btn`).
     - Edit Company and Title to match an already-saved application in your workspace.
     - Verify: The duplicate warning screen is immediately triggered and duplicate status card appears. The primary button is blocked from saving as normal.
     - Attempting to save without explicit override is blocked.
  3. **N1 Tab Switch Race Test:**
     - In Job A, type in the Company field and immediately switch to Job B tab before the 350 ms debounce fires.
     - Verify: Job A's late duplicate result does not overwrite Job B's capture state.

After operator confirms PASS on this focused duplicate retest:
- **Step 13B:** Focused Claude Opus / High independent security review on the exact remediation delta to confirm closure of B1 and B2.
- **Promotion & Cutover:** Merges to `development` and `main`, production deployment, and production verification remain strictly paused until separately authorized.
