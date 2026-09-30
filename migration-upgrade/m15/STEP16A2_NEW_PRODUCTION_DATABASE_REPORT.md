# M15-E · Step 16A-2 — New Production Database & Application-Domain Import

**Status:** Step 16A-2 **COMPLETE** (§9). ES256 Classification: **READY_NEW_KEY** (§10). Step 16A-3 (Vercel cutover): **READY, NOT started** — requires fresh explicit authorization.
**Date:** 2026-09-29/30 · **Branch:** `fix/m15e-extension-connection-ui` (docs/tooling only) · **main SHA:** `bfa82eb557c5e748ba5d7c91fe122fb8294d2313` (unchanged)
**Vercel Production variables:** NOT CHANGED · **Production redeploy:** NOT PERFORMED · **Production extension:** NOT ACTIVATED

Tooling added (one-time, outside lint/CI scope): `migration-upgrade/m15/step16a2/import-legacy-applications.mjs`,
`migration-upgrade/m15/step16a2/bootstrap-prod-owner.ts`. Per-row artefacts live in gitignored `test-results/step16a2/`.

---

## 1. Target identity (proven before any write)

| Item | Value |
| :--- | :--- |
| Project | `jobquest-prod` |
| Ref | `kqsxdothjxtcktyirpux` |
| Region / Org | `us-east-1` / OnePiece2.0 (`fisaxwdkkdpbamvwkvnm`) |
| Health / PG | ACTIVE_HEALTHY / 17.6.1.171 |
| Baseline | 0 migrations, 0 public tables, no application data |
| NOT the target | `jobquest-dev` `xpnkasclquplmrcmhsif` (us-west-2) — read-only catalog comparison only; `kwmnljvyvqvbvimypnmw` — not visible to the connector, never touched |

Writes were issued only with `project_id = kqsxdothjxtcktyirpux`.

## 2. Migration chain (repository is authoritative: 19 files)

| # | Version | Name | Purpose | Depends on |
| :-: | :--- | :--- | :--- | :--- |
| 1 | 20260924120000 | m1_foundation | 7 core tables, RLS helpers (`is_workspace_member/manager`, `can_access_owned_record`), last-manager trigger, canonical workflow seed | — |
| 2 | 20260924200000 | m1b_option_b_auth | App-owned auth: credentials, sessions, refresh tokens, rate limits; service-role auth RPCs; `rpc_register_account` | 1 |
| 3 | 20260924300000 | m3_applications | Application columns, `job_snapshots`, `application_events`, lifecycle RPCs, duplicate-tier RPC | 1 |
| 4 | 20260924310000 | m3_workflow_integrity | Lifecycle guard trigger, append-only events, CREATED/CAPTURED triggers | 3 |
| 5 | 20260924320000 | m3_table_privileges | Least-privilege grants | 3 |
| 6 | 20260924400000 | m4_contacts_networking | companies, contacts, interactions, app-contact links | 3 |
| 7 | 20260925100000 | m4_closeout_integrity | Grants, composite tenant FKs, guards, `audit_events` + cross-user audit trigger | 6 |
| 8 | 20260925200000 | m5_interviews_debriefs | interviews, participants, schedule/outcome RPCs | 6,7 |
| 9 | 20260926100000 | m6_tasks_habits_queue | tasks, habits, recurrence engine, follow-up projection | 8 |
| 10 | 20260927100000 | m7_documents_resumes | resumes, application_documents, RPCs | 3,7 |
| 11 | 20260928100000 | m8_analytics_goals | goals, analytics RPCs | 3,9,10 |
| 12 | 20260928110000 | m8_analytics_integrity | `applications.source`, milestones function, goal history | 11 |
| 13 | 20260929100000 | m9_dashboard_preferences | `profiles.ui_preferences` | 1 |
| 14 | 20260930100000 | m10_import_export | import batches/rows, `rpc_commit_import`, widened `employment_type` | 3,10 |
| 15 | 20261005100000 | m11_extension_tokens | extension tokens, `rpc_extension_capture` | 3,7 |
| 16 | 20261010100000 | m12_workspace_management | member status, invitations, workspace RPCs | 1,7 |
| 17 | 20261015100000 | m13_global_search_journal | journal, `rpc_global_search` | 3,8,10 |
| 18 | 20261020100000 | m14_legacy_migration_rehearsal | `legacy_claim_codes`, `migration_batches`, `migration_id_mappings`, `legacy_id` columns | 1,3 |
| 19 | 20261021100000 | m15_legacy_claim_rpc | `rpc_claim_legacy_account` (schema parity only; flow out of scope) | 2,18 |

**Result: 19/19 applied to `kqsxdothjxtcktyirpux`.** The MCP stamps its own timestamps; `supabase_migrations.schema_migrations`
was then normalised to the repo filename versions so a future `supabase db push` sees the chain as applied. (One transient
version collision from two parallel calls rolled back cleanly — migration 19 was re-applied alone.)

## 3. Schema and security verification (vs. jobquest-dev built from the same repo)

| Catalog | prod = dev |
| :--- | :--- |
| columns 387 · constraints 213 · indexes 127 · policies 58 · RLS flags 34 · triggers 40 | identical hash |
| table grants 325 · column grants 788 · function grants 98 | identical hash |
| functions | 98 identical after CR-normalisation (24 dev functions carry CRLF from a Windows checkout; prod is LF). Prod has +1: `rpc_claim_legacy_account` |
| workflow seed row | identical |

Security: anon has 0 table privileges; no system table (`user_accounts`, `user_credentials`, `auth_*`, `audit_events`) is reachable by
`anon`/`authenticated`; every public table has RLS; all 17 service-role-only RPCs (auth, recovery, claim, extension token/capture)
are unexecutable by `anon`/`authenticated`; `rpc_claim_legacy_account` = `{postgres, service_role}` only, SECURITY DEFINER.

Advisor notes (identical on dev; by design, not redesigned): 8 system tables RLS-on/no-policy (INFO); 8 `app.*` trigger functions
without pinned `search_path` (WARN); helper functions callable by anon/authenticated (return false / RLS-gated).
**Repo finding (pre-existing, not changed here to avoid prod/dev drift):** M14 left default `authenticated` privileges
(incl. TRUNCATE) on `legacy_claim_codes`, `migration_batches`, `migration_id_mappings`; RLS has no permissive read path and the Data API
does not expose TRUNCATE. Recommended follow-up hardening migration on both projects (post-launch).

## 4. Fresh owner / workspace (RESOLVED — created by the operator with option A′)

Required minimum to own imported applications: `user_accounts` → `user_credentials` → `profiles` → PERSONAL `workspaces` →
`workspace_members(MANAGER)`, plus 10 recovery-code verifiers — created atomically by `rpc_register_account`.
That RPC needs a genuine Argon2id password hash and recovery-code hashes; nothing may be fabricated, and the legacy user (`jack`),
his claim hash/code, PIN and password state are explicitly not migrated.

Options evaluated against the real implementation:

* **A′ (built, recommended):** `bootstrap-prod-owner.ts` — reuses the app's own `normalizeUsername`, `checkPassword`, `generateCodeSet`,
  Argon2id parameters and `rpc_register_account`. Hard-locked to `kqsxdothjxtcktyirpux` (dev and old-prod hosts abort — tested), reads the
  password from a hidden TTY prompt only, needs the new project's secret key only in the operator's own terminal env, refuses to run if any
  user already exists, starts no session, writes no files, prints recovery codes once to the terminal. **Operator must run it themselves.**
* **C:** register in the production UI after cutover, then import. Explicitly allowed by the brief, but leaves the import after cutover.
* **B (existing bootstrap script):** none exists for a fresh user (the M14/M15 tool only creates a STAGED legacy user — excluded).

**Outcome:** the operator ran A′; owner `Conan` / workspace created and verified (§9). Options C and B were not needed.

## 5. Legacy source and scope

* Source: locked JobQuest1 export `legacy_neon_export_20260928_120500.json`, SHA-256 `f7eff960…422e` — equals the M15-D lock. Legacy Neon not touched; jobquest-dev and old Supabase not used as sources.
* Export content: 1 user (NOT migrated), **222 applications**, 49 tags / 158 tag links, 226 activities, 226 timeline events, 224 stage-history rows. Interviews, contacts, tasks, habits, notes, resumes, goals: all empty.
* Imported (application domain only): `applications`, `job_snapshots`, `application_events`, `application_documents` (resume-version *label* rows, no resume records), `migration_batches` + `migration_id_mappings` (audit).
* Never migrated: users, passwords, PIN hashes, recovery/claim codes, sessions, refresh tokens, extension tokens, rate limits, contacts, interviews, tasks, habits, journal, goals, resumes, preferences.
* `companies` is not populated by the application for applications (no code path sets `company_id`); the import matches: **0 company rows** (189 distinct company names in source).

## 6. Formal field mapping (legacy → JQ2)

| Legacy | JQ2 | Transformation / default | Validation |
| :--- | :--- | :--- | :--- |
| id | applications.legacy_id + migration_id_mappings | provenance | unique per workspace |
| company | company_name | trim | non-empty, ≤128 |
| job_title | role_title | trim | non-empty, ≤128 |
| stage | stage / status / outcome / closure_reason | canonical table below | unknown → **quarantine** (old tool defaulted to Saved — not used) |
| job_url | job_url | trim, blank→NULL | http(s) warning only |
| external_job_id | external_job_id | trim, blank→NULL | ≤128 |
| location | location | trim, blank→NULL | ≤128 |
| work_arrangement | work_arrangement | exact Remote/Hybrid/Onsite else NULL | CHECK |
| employment_type | employment_type | exact Full-time/Contract/Part-time/**Internship**/Temporary/Other | CHECK (M10 widened; old Internship→tag workaround obsolete) |
| salary_min / salary_max | salary_min / salary_max | numeric(12,2) | ≥0, max ≥ min |
| salary_currency | salary_currency | 3-letter upper, else schema default USD | — |
| salary_range | appended to notes as `[Salary Range: …]` | verbatim (carries unit e.g. "per hour", which the numerics cannot) | deviation from old tool (which dropped it when min/max existed) |
| source | source | trim verbatim (no merging of "Jobright"/"jobright.ai") | ≤128 |
| priority | priority | upper; unknown→MEDIUM | CHECK |
| notes | notes | trim | — |
| next_action / next_action_date | next_action / next_action_date | trim / date | ≤255 / valid date (old tool dropped both: 98 rows) |
| date_applied | applied_at | `YYYY-MM-DD` at 00:00:00Z (matches M10 import; export/import use `applied_at.slice(0,10)`) | valid date |
| created_at / updated_at | created_at / updated_at + last_activity_at | microsecond precision preserved | UTC only |
| tags / application_tags | tags[] | per-app, case-insensitive dedupe | — |
| resume_version | application_documents(RESUME).label | ≤100 | 122 rows |
| job_description | job_snapshots.job_description | trim; `raw_payload` = provenance + source_url; captured_at = created_at | 89 rows |
| stage_history / activities | application_events | 2 real STAGE_CHANGED (app 100); closed apps get OUTCOME_CHANGED at the stage_history entry time | 2 `application_updated` + 1 `resume_changed` not importable (no JQ2 event type / out of scope) |
| user_id, created_by, updated_by | owner = fresh user | reassigned | — |
| recruiter_*, cover_letter_version, resume_id, board_order, date_found, next_action_completed_at, pinned/important/favorite/archived_at | (pinned/important/favorite/archived mapped; rest) | all empty in source | — |

**Stage sanitization** (canonical Saved…Accepted only; no Bookmarked/extension stages):
Saved→SAVED/OPEN (37) · Applied→APPLIED/OPEN (151) · Withdrawn→APPLIED/CLOSED/WITHDRAWN+GENERAL_WITHDRAWAL (27) · Rejected→APPLIED/CLOSED/REJECTED (7).
Closed rows use stage `APPLIED` because legacy stores no "stage before closing" and withdrawn/rejected implies applied (same decision as the locked M15-C tool) — recorded as EXPECTED_TRANSFORMATION.
`closed_at` = the `stage_history` entry time for the closed stage (evidenced, not invented).

**Sanitization:** trim outer whitespace, blank→NULL, enum exactness, UTC timestamp parsing, Unicode preserved untouched, description kept as inert text (never markup).

## 7. Dry-run result (no database access)

Source 222 · **accepted 222** · **quarantined 0** · warnings 0 · errors 0 · unmapped-with-data: only `user_id`/`created_by`/`updated_by` (owner reassigned).
Expected rows: 222 applications · 89 snapshots · 122 label documents · events 347 = CREATED 222 + CAPTURED 89 + STAGE_CHANGED 2 + OUTCOME_CHANGED 34.
(The old tool's 533 events double-counted a synthetic lifecycle event per application; not repeated.)

**Duplicate analysis** (current JQ2 tier semantics, `rpc_check_application_duplicate`): exact = **0**; same job URL = 0; same external id = 1 group;
probable (company+role) = **4 groups / 8 applications** — legacy ids **[19,78] [31,80] [118,210] [212,213]**. Groups 1–3 were applied months apart; [212,213] same day with different URLs;
[19,78] additionally share external id 22277. Policy: **all imported, none dropped**, flagged as exceptions for owner review (the removed "Save as New Application Anyway" logic is not used; `duplicate_override_flag` stays false).

## 8. Import design (idempotent, atomic, resumable)

`--emit-sql` writes `batch_01…12.sql` (20 apps each) + `finalize.sql` + `verify.sql`. Each batch is one `DO` block (single transaction): owner must be an
ACTIVE MANAGER of the workspace; skips legacy_ids already present (re-run safe); inserts applications → snapshots → restores trigger-written CREATED/CAPTURED
timestamps → legacy events → label documents → id mappings. A failed batch leaves no partial graph. `verify.sql` returns one PASS/FAIL table (counts, three
fingerprints, stage distribution, ownership, orphans, unvalidated constraints, timestamps, URLs, tags, batch/mappings, and **zero** legacy users/credentials/claims/sessions/tokens/
rate-limits/out-of-scope rows).

**Rehearsal on the real prod schema (twice, forced rollback, synthetic owner):** 5 representative applications (snapshot, tags, salary, withdrawn, rejected, Internship,
stage-change app) → counts as expected, all CREATED timestamps restored, closed rows carry `closed_at`, and the applications/snapshots/documents fingerprints computed in SQL
**equal** those precomputed from the export. Afterwards every prod table was re-read: 0 rows (nothing persisted).

## 9. Post-import verification and data-quality report (EXECUTED 2026-09-30)

**Owner (operator-created with `bootstrap-prod-owner.ts`; password and recovery codes never seen by the agent):** username `Conan`, user_id `e5df8d69-9a8a-4fe1-a81d-af996c67bac6`,
workspace `fbd661ef-36ef-4c19-aae1-e4a477ac79a5` (PERSONAL; Conan = ACTIVE MANAGER). Verified read-only before any write: 1 ACTIVE user, 1 credential row, 10 unused recovery codes, 1 workspace, 1 membership.

**Execution:** 28 atomic idempotent `DO` blocks run one per call against `kqsxdothjxtcktyirpux` only (batches 1–6 of 20 applications = legacy ids 1–120, then 8-application batches 16–28 = ids 121–222; every block returned success, none failed, none re-run).
Then `finalize.sql` (migration_batches `7d3c1e52-4b8a-4f6e-9a21-16a2c0de0001` → COMPLETED) and `verify.sql`.

| Measure | Result |
|---|---|
| SOURCE / IMPORTED / SKIPPED / QUARANTINED | 222 / 222 / 0 / 0 |
| Snapshots / label documents / id mappings / companies | 89 / 122 / 222 / 0 |
| Events | **347** = CREATED 222 + CAPTURED 89 + STAGE_CHANGED 2 + OUTCOME_CHANGED 34 (CREATED/CAPTURED timestamps restored to legacy values: 222/222 and 89/89) |
| Stage distribution | SAVED/OPEN 37 · APPLIED/OPEN 151 · APPLIED/CLOSED/WITHDRAWN 27 · APPLIED/CLOSED/REJECTED 7 (34 closed, all with `closed_at`) |
| Exact / probable duplicates | 0 / 8 rows in 4 groups — retained, none dropped: legacy ids **[19,78] [31,80] [118,210] [212,213]** (only 19/78 also share an external id) |
| Fingerprints (SQL on prod = JS from the locked export) | applications `451ed7f53a242bed1bbc0817afe62f51` ✔ · snapshots `527ce31d916b2e1fe9e823d2df71f464` ✔ (after repair, below) · documents `6f2b0c900ab61cd14885b54d6dd9d8dd` ✔ |
| Ownership | 222/222 `user_id` = Conan, 222/222 in the one workspace; 0 rows elsewhere |
| FK integrity | 0 orphan snapshots/events/documents; 0 unvalidated constraints in `public` |
| Legacy auth data migrated | 0 users (only Conan), 0 legacy_user_id, 0 claim codes, 0 extension tokens, 0 sessions/refresh tokens, 0 rate limits, 1 credential row (Conan's) |
| Out-of-scope domains | contacts / interviews / tasks / habits / journal / goals / resumes / companies = 0 |
| RLS probe (rolled back, nothing persisted) | stranger token: 0 rows; anon: `42501` denied; Conan with an active session: 222 / 89 / 347 / 122 rows; Conan denied `user_credentials` and `auth_recovery_codes` |

**Classified findings (the first `verify.sql` run had 2 FAIL rows; neither is a data-integrity defect in the source):**

1. `snapshots_fingerprint` mismatch → **IMPORT_ERROR (agent transcription), repaired.** Two job descriptions were mis-transcribed when the batch payload was copied into the MCP call (legacy 165: one paragraph truncated; legacy 183: one paragraph differed).
   Located by per-line hash comparison against the locked export, then fixed with one guarded `UPDATE` whose transaction aborts unless the rebuilt text hashes to the export's own md5 (both guards passed). Re-run: fingerprint now matches; events still 347.
   No other field of any application was affected (applications and documents fingerprints matched on the first run). Lesson: large payloads must be fingerprint-verified after import, which is exactly what `verify.sql` did.
2. `unvalidated_constraints` = 1 → **verify.sql scope defect, not a JobQuest constraint.** The row is Supabase-owned `realtime.messages.messages_payload_exclusive` (NOT VALID by platform design). `verify.sql` now restricts the check to schema `public` (0 rows).

**EXPECTED_TRANSFORMATION records:** closed apps use stage `APPLIED` (legacy stores no pre-close stage); 347 events instead of the old tool's 533 (that tool added one synthetic event per application); `source`/`next_action`/`resume_version` are now mapped (the old tool dropped them); salary text kept in notes as `[Salary Range: …]`.

**Advisors (security):** identical class of findings as `jobquest-dev` (RLS-enabled-no-policy INFO on service-only tables; search_path WARN on 8 trigger functions; SECURITY DEFINER RPC EXECUTE WARNs). The M14 authenticated-privilege observation remains a post-launch hardening candidate, not a cutover blocker. No production-only permission change was made.

## 10. Step 16A-3 preparation (NOT executed)

**Exactly five Production-scope Vercel variables must move to the new project** (names only; values never displayed or stored in docs):
`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
Preview/Development stay on `jobquest-dev`. Never point Production at dev or Preview at prod. `VITE_*` values are baked at build time → a redeploy is mandatory.

**UPDATE 2026-09-30 — ES256 VERIFIED: READY_NEW_KEY.** Public JWKS now lists kid `6434f760-580a-4945-aaa5-c161f568120a` (EC / P-256 / ES256 / sig, no private member) next to the default `bcdd6db8-…` (not revoked). It is a NEW key, not the historical `48e903e8-…`. **JQ_JWT_PRIVATE_JWK Vercel Change Required: YES** — Step 16A-3 must set Production `JQ_JWT_PRIVATE_JWK` to the exact matching private JWK (operator-held; never shared with the agent) together with the five Supabase variables, and rollback must restore the old value too. The historical prerequisite text below is kept for record.

**Prerequisite for cutover — ES256 signing key (status: OPERATOR ACTION REQUIRED; Step 16A-3 BLOCKED until done).**

*What the code needs (from `apps/api/src/lib/tokens.ts`, `env.ts`):* the Node API signs access tokens with `JQ_JWT_PRIVATE_JWK` (EC P-256 private JWK with `kid`), header `alg=ES256, typ=JWT, kid=<key id>`; claims `sub`, `role=authenticated`, `aud=authenticated`, `iss=JQ_JWT_ISSUER` (default `jobquest-api`), `iat`, `exp` (+900 s), `jti`, `session_id`.
The Supabase Data API verifies the signature against the project's JWT signing keys (JWKS), matched by `kid`; it does not require configuring the issuer/audience. RLS then uses `auth.uid()` and `app.session_is_active()`.

*Current state of the new project (live public endpoint, read-only):* `https://kqsxdothjxtcktyirpux.supabase.co/auth/v1/.well-known/jwks.json` lists exactly one key — Supabase's default ES256 key (`kid bcdd6db8-bf79-49a8-81f0-737639bad273`). The JobQuest key is **not** registered, so every app-minted token would be rejected (PGRST301) after cutover.

*Correction to earlier docs:* M15A §10 / IMPLEMENTATION_PLAN say "import the public key". Hosted Supabase's "import an existing key" takes the **private** JWK (it stores it as a standby signing key and advertises only the public half). This is how `jobquest-dev` was done (M1B: imported as `standby`, rotated to `in_use`, previous key kept as `previously_used`, not revoked).

*Operator procedure (Dashboard, project `jobquest-prod` = `kqsxdothjxtcktyirpux`; never paste key material into chat, tickets or git):*
1. **Choose the key.** Option A (recommended — rollback stays a five-variable revert): reuse the Production key already in Vercel (`JQ_JWT_PRIVATE_JWK`, `kid` `48e903e8-…` per the M15 records) from your vault copy — Vercel Sensitive values cannot be read back. Option B (if no vault copy exists): generate a new pair on your machine with `npx supabase gen signing-key --algorithm ES256` (prints an EC P-256 private JWK once; save it to your vault immediately) and later also replace `JQ_JWT_PRIVATE_JWK` in Vercel **Production only** with the same JWK.
2. Dashboard → **Project Settings → JWT Keys → JWT Signing Keys → Create a new key → import an existing private key**, algorithm **ES256 (ECC P-256)**; paste the private JWK; keep it **Standby**. Confirm the listed key ID equals the JWK's `kid`.
3. Same page → **Rotate keys** so the imported key becomes **Current/in use**; leave the Supabase default key as **Previously used** — do **not** revoke it (matches the dev procedure).
4. Wait ≥ 20 minutes (Supabase's documented JWKS cache window), then tell the agent "ES256 registered".
5. Agent check (public, no secret): the JWKS above must list the JobQuest `kid` with `kty EC`, `crv P-256`, `alg ES256`, and **no** `d` member. Only then may Step 16A-3 be authorized. Safe-to-share values: `kid`, `alg`, `crv`, the public `x`/`y`. Never share: `d`, the whole private JWK, `SUPABASE_SECRET_KEY`, the password or recovery codes.

*Post-cutover proof:* login as `Conan` on Production; the imported applications load (a token signed by a non-registered key returns 401, as proven on dev in B04).

Snapshot state for rollback: production deployment `dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK`, app SHA `bfa82eb557c5e748ba5d7c91fe122fb8294d2313`, old ref `kwmnljvyvqvbvimypnmw`, new ref `kqsxdothjxtcktyirpux`.

**Cutover sequence:** 1 confirm new-DB integrity (`verify.sql` all pass) → 2 securely snapshot the current five Production values (operator vault) → 3 import the public signing key into the new project → 4 replace the five Production-only variables →
5 leave Preview/Development untouched → 6 redeploy EXACT current main SHA → 7 verify prod bundle embeds `kqsxdothjxtcktyirpux` (`scripts/check-deployed-bundle.mjs`) → 8 verify API targets `kqsx…` → 9 GET `/` and `/health` → 10 login as the fresh owner →
11 imported applications visible → 12 search/filter/open → 13 duplicate behaviour → 14 logout/login → 15 confirm no dev data visible → 16 production extension (later, separate).

**Rollback (documented, not executed):** restore the five old Production variables from the vault → redeploy the prior compatible deployment/SHA (or promote `dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK`). Old Supabase project stays untouched;
the new database is **never deleted** during rollback. Old project and JobQuest1 remain rollback evidence until stabilisation ends.

## 11. Observations for the release record

* Handoff/report statements that `workspace_members` has no status column are stale (M12 added it).
* The Step 16A-1/15.5 claim-code reissue plan is superseded by the operator decision (no legacy user/claim flow); the Claim UI/route remains in code but has nothing to claim on the new database.
* jobquest-dev function bodies differ from the repo only by CRLF (24 functions) — cosmetic.
