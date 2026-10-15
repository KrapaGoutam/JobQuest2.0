# AI-10 — OAuth 2.1 Provider Auth + Release Hardening

Status: **COMPLETE pending development integration.** Branch `feature/ai-10-oauth-release-hardening`, executable SHA `26988669877bf2f595fe923df587d71485a79b14`, branch CI `38311573190` PASS. Live Claude / Gemini / ChatGPT gates recorded below; final security review PASS (no release blockers); migration reconciliation and Production runbook written (not executed). Main `26e517ea…`, Production and Production DB are **unchanged** (Production DB head `20261022100000`; Dev head `20261030100000`). The docs-only commits that follow the executable SHA do not change certified application code.

## 1. Architecture (as built)

- OAuth is **additive**. The existing scoped Claude connector bearer token is tried first and is unchanged. OAuth does not replace JobQuest login/sessions and creates no second identity system.
- **Client registration:** user-defined, pre-registered **confidential** clients, created in Settings → AI & Automation → Providers (Gemini / ChatGPT). Secret shown once, stored only as an HMAC, revocable (revocation also revokes every grant and session). DCR and CIMD are intentionally **not** implemented (no `registration_endpoint`; `client_id_metadata_document_supported=false`). OIDC is not implemented and not required. Reason: ChatGPT exposes "User-Defined OAuth Client" with DCR/CIMD unavailable and Gemini accepts a client id/secret.
- **Flow:** Authorization Code + **PKCE S256 only** (`plain` rejected). Authorize validates client, issuer, exact HTTPS redirect URI, scope ⊆ registered scopes, resource, state (8–512 chars). Consent requires an authenticated session, the client owner, and an ACTIVE membership; the decision is CSRF-protected and single-use. Code TTL 120 s, single use, bound to client, redirect URI, resource and challenge; a wrong verifier/client/secret/redirect does not burn the code.
- **Tokens:** ES256 `at+jwt` access tokens (TTL 900 s) with distinct `iss`=origin / `aud`=`<origin>/api/mcp`, `typ=at+jwt`, tied to an `auth_sessions` row and an `oauth_grants` row; verified per request against grant, session, client, membership and account status (fail closed). Browser access tokens cannot be used as OAuth tokens and vice-versa. Refresh tokens are rotating and single-use; **reuse revokes the grant and its session**.
- **Resource binding:** tokens are bound to `<origin>/api/mcp`. `resource` is optional on the wire (defaults to the single resource, interop for clients that omit RFC 8707); an explicit wrong value is rejected.
- **Discovery:** `/.well-known/oauth-protected-resource/api/mcp`, `/.well-known/oauth-authorization-server`, `/api/oauth/jwks`; the 401 challenge carries `resource_metadata`. A Vercel rewrite plus a path map in `apps/api/src/vercel.ts` serve `/.well-known` from the origin root.
- **Scopes:** `jobquest:read`, `ai:read`, `ai:ingest` only (CHECK-constrained). No scope exists for application/task creation, status changes or AI-8 execution; the MCP surface is unchanged (10 reads + 1 AI-ingest write). AI-8 remains the only core-mutation path.
- **Invalidation:** explicit grant/client revocation, RFC 7009 revocation, logout-all, password change, session revocation, suspension and membership removal all deny the next request (integration-tested).
- **DB:** five server-only tables (RLS on, no policies, all privileges revoked from `public/anon/authenticated`), 13 `SECURITY DEFINER` RPCs with fixed `search_path=''` and `EXECUTE` granted to `service_role` only; trusted identity is derived server-side.

## 2. Verification of the executable SHA

- Unit 799/799; full integration 31 files / 327 tests; AI-10 integration 6 tests; typecheck, lint, build, bundle and secret scans clean; focused AI-Hub e2e `ai10-provider-auth` (375/768/1280, axe 0 serious/critical) green, repeated 5/5.
- Branch CI `38311573190` PASS (all four jobs). An earlier run `38311305670` @`8c3aa3b7` failed on a CI-contract unit test (stale spec name; guard regex matched "oauth" in the spec filename) — fixed by renaming the spec, guard unchanged.
- Preview `jobquest2-jsrabd335` (stable alias `jobquest2-git-feature-ai-10-oauth-release-751bd4-one-piece-5779.vercel.app`) READY at the tested SHA; discovery, JWKS and the 401 challenge verified remotely.
- Local-only known issue (not caused by AI-10): `ai5-digest` and `ai7-calendar` e2e fail a colour-contrast audit on this Windows machine; both pass in CI.

## 3. Live provider results (operator, Preview alias, Dev database, 2026-10-12/13)

Server-side facts below were read **read-only from the Dev database** (`jobquest-dev`), not taken from the transcript alone.

### 3.1 Gemini

| Item | Result |
|---|---|
| Custom MCP / JobQuest OAuth / authenticated connection | **VERIFIED** (pre-registered confidential client, S256; DCR and CIMD not used) |
| Application read / AI-Hub reads (job leads, email, recruiter, calendar, Daily Digest) | **VERIFIED** (zero stored records for the intelligence sources is a valid successful read) |
| AI ingest (`jobquest_submit_ai_result`, `daily_brief`) | **VERIFIED — APPROVAL-GATED**. Run `0a518f42-7a36-4671-9758-bbf5935a9a30` SUCCEEDED, 1 finding created |
| Malformed contract rejection | **PASS**. Gemini produced 4 `SCHEMA_INVALID` runs (PARTIAL, 0 findings persisted) before valid payloads: `1119dca0`, `2033cdb1`, `b0bf6549`, `5c769330` |
| Core writes (create application / task / set status) | UNAVAILABLE BY DESIGN — VERIFIED |
| Revocation | **VERIFIED**. Server: client `USER_REVOKED`, grant `CLIENT_REVOKED`, 0 live sessions, audit `OAUTH_CLIENT_REVOKED`. Provider: post-revocation "list five recent applications" → auth failure / read denied |
| Hostile content ingest | **PASS (operator transcript)**; see 3.3 |
| Fresh-chat stored-content injection | **NOT FULLY VERIFIED**; see 3.3 |
| Live refresh | **VERIFIED server-side**; see 3.4 |
| Scheduled read / scheduled ingest | **NOT TESTED — SHELVED** |

### 3.2 ChatGPT

| Item | Result |
|---|---|
| OAuth discovery / custom MCP plugin creation / JobQuest OAuth / authenticated connection | **VERIFIED** (User-Defined OAuth Client; DCR and CIMD unavailable by design; OIDC not implemented / not required) |
| Reads: applications, job leads, email, recruiter, calendar, latest Daily Digest | **VERIFIED** (zero-result reads are successes; the digest returned was the Gemini-created "Prompt Injection Security Test" digest) |
| AI ingest | **VERIFIED**. Run `2561cfbc-aec3-4274-822c-dfb2cd0ec6a8` SUCCEEDED, 1 finding, 0 suggestions, 0 core mutations. Four earlier ChatGPT payloads were `SCHEMA_INVALID` with 0 findings persisted (`ed9b1c2d`, `52065ca1`, `1829ab94`, `c74275e5`) |
| Ingest approval behaviour | **NOT RECORDED / NOT VERIFIED** (not inferred either way) |
| Benign re-ingest / dedupe | Run `dfa13e6a-75d8-4448-b8f1-84b67284fd87` updated the existing finding (dedupe WORKED). It used benign text and is **not** an injection test |
| Core writes (create application / task / set status) | **UNAVAILABLE — PASS**: ChatGPT reported the operations are not exposed. Provider core-write boundary VERIFIED |
| Revocation | **VERIFIED**: next read returned "Reconnect JobQuest2Dev" / connection expired. Post-revocation read DENIED |
| Stored-content (hostile) injection | **NOT TESTED LIVE**; classified POST-RELEASE in §4 |
| Live refresh | **VERIFIED server-side**; see 3.4 |
| Scheduled read / scheduled ingest / Gmail event trigger | **NOT TESTED — SHELVED** |

### 3.3 Dev evidence for hostile content and escalation (read-only)

- Every AI run and finding in the Dev database belongs to a single workspace; 0 `ai_suggestions`, 0 `ai_action_executions`.
- Findings created in the test window: exactly 2 (Gemini `173d2741…`, ChatGPT `9c237b4b…`); no run created more than 1 finding, so the injected "submit 5 more findings" instruction produced **no additional findings or runs** beyond the legitimate retries listed above.
- No audit events other than `AI_*` / `OAUTH_*` occurred between 2026-10-12 21:50 and 2026-10-13 04:30 UTC, i.e. **no core application/task/status mutation** was audited.
- The hostile string is **not present in any stored row now**: the Gemini finding was updated at 22:48:52 UTC by run `777f3337…` (dedupe update), which most likely replaced the original content; the current payload is an empty digest. Therefore the database **cannot independently confirm** that hostile content was stored, nor that it was later re-read in a fresh chat.
- Conclusion (conservative): `GEMINI HOSTILE CONTENT INGEST` = PASS on operator-transcript evidence; `GEMINI CORE-WRITE ESCALATION` = NONE; `GEMINI CROSS-WORKSPACE EXPOSURE` = NONE OBSERVED; `GEMINI FRESH-CHAT STORED-CONTENT INJECTION` = **NOT FULLY VERIFIED**. No PASS is claimed.

### 3.4 Live refresh-token rotation (correction to the earlier "not exercised" note)

An earlier version of this report said no refresh token had ever been rotated. The Dev database now shows otherwise (secrets/hashes not read):

- Gemini grant: refresh chain of 3 tokens (parent → child), 2 consumed, rotated 10 min 23 s and 4 h 55 m after issue (the second rotation was after the 15-minute access token had long expired).
- ChatGPT grant: chain of 3 tokens, 2 consumed (7 min and 5 min 54 s after issue); successful AI ingests followed the rotation within seconds.
- Each token was used exactly once and each rotation issued a child; rotation requires the client secret, which only the provider holds.

Classification: **REFRESH ROTATION: VERIFIED LIVE (server-side evidence, both providers).** Still **not** live-verified: refresh-token reuse detection, 30-day refresh expiry, and any *scheduled/unattended* use (shelved). Those remain integration-test coverage only.

### 3.5 Transient second-client error — TRANSIENT / NOT REPRODUCIBLE

Gemini initially returned `{"error":"invalid_request","error_description":"Unknown client, redirect URI, resource or scope."}` for newly created clients. Dev data: Gemini clients #2, #3 and #4 each have **0** authorization requests (the authorize RPC returned no row, which creates none); #4 was registered with only `jobquest:read ai:read` while every client that connected requested all three scopes; #5 (same redirect URI as #3/#4, all three scopes) was then approved and works. The failed predicate cannot be proven because failed authorizations leave no server-side reason (see POST-RELEASE item P1). No validation, SQL or redirect/resource/scope semantics were changed.

### 3.6 Open Dev cleanup

At the time of writing, one Gemini client and one ChatGPT client still have live grants in Dev (`oauth_clients.revoked_at IS NULL`). They are Dev-only test credentials; revoke them from Settings → AI & Automation → Providers when testing is finished.

## 4. Final security review (read-only, Opus, single pass @ `26988669`)

**RELEASE BLOCKERS: NONE.** Evidence is from code (file:line in the reviewer output), not docs.

| Area | Class |
|---|---|
| Authorization-code flow, PKCE S256, single use, binding (client/secret/redirect/resource/challenge) | ALREADY MITIGATED |
| Client-secret storage (peppered domain-separated HMAC), exact HTTPS redirect match, no open redirect | ALREADY MITIGATED |
| Omitted `resource` defaults to the single resource; explicit wrong value rejected; `aud` always bound | ACCEPTED |
| Access-token verification (ES256 pinned, iss/aud/typ/exp, per-request grant+session+client+membership+status, fail closed) | ALREADY MITIGATED |
| Token-type separation (OAuth ↔ browser ↔ connector) | ALREADY MITIGATED |
| Refresh rotation, reuse revokes grant+session, concurrent-refresh race (row lock; loser treated as reuse, no double issue) | ALREADY MITIGATED |
| Revocation (client / grant / RFC 7009) and session integration (logout-all, password change, suspension, removal) | ALREADY MITIGATED |
| Workspace/user binding derived server-side; MCP per-tool scope allow-list; **no core-write tool or scope** | ALREADY MITIGATED |
| AI-ingest schema validation / malformed-contract handling; prompt-injection boundary (stored text returned as JSON data with untrusted-content notice); AI-8 needs browser session + CSRF + fingerprint | ALREADY MITIGATED |
| RLS on, no grants, 13 RPCs `search_path=''`, EXECUTE service_role only; consent clickjacking/CSRF | ALREADY MITIGATED |
| Secrets/artifacts/Git hygiene; scope of diff (26 files, all AI-10/CI-contract) | ALREADY MITIGATED |
| pgcrypto `extensions.digest` dependency | ACCEPTED (verified present in `extensions` on Production) |
| **P1** No server-side reason for failed `/authorize` (generic error) | POST-RELEASE |
| **P2** `/api/oauth/*` is not behind `AI_HUB_ENABLED` (MCP still 503s before auth, so no data reachable) | POST-RELEASE |
| **P3** Code replay does not revoke tokens already issued from that code (OAuth 2.1 SHOULD) | POST-RELEASE |
| **P4** No automated test for concurrent refresh or code-replay revocation | POST-RELEASE |
| **P5** `/revoke` has no rate limit; reuse and client-driven revokes write no audit row | POST-RELEASE |
| **P6** Ingested `provider` label is not bound to the OAuth client's provider (pre-existing for connector tokens) | POST-RELEASE |
| **P7** Expired requests/codes/refresh tokens are never purged (table growth only) | POST-RELEASE |
| **P8** Live validation of refresh-reuse detection and scheduled/unattended provider use | POST-RELEASE |

### Policy decisions

- **Scheduled provider execution / live refresh in scheduled mode:** the product does **not** claim scheduled provider automation as verified or production-ready. Docs/UI were grepped; `PROVIDER_CAPABILITY_MATRIX.md`, `PROVIDER_INTEGRATION_PLAN.md` and `apps/web/src/lib/aiWorkflowDefinitions.ts` already state provider-owned scheduling as not verified. Classification: `SCHEDULED PROVIDER EXECUTION: NOT VERIFIED / NOT ENABLED AS A RELEASE CLAIM`; `LIVE REFRESH IN SCHEDULED/UNATTENDED USE: POST-RELEASE`. Interactive OAuth is **not** blocked by this.
- **ChatGPT live hostile-content test:** **POST-RELEASE / NON-BLOCKING MANUAL COVERAGE GAP.** The test would characterise model behaviour, not a control. The controls are server-side: no provider tool or scope can change core data, AI-8 actions require a human browser session + CSRF + state fingerprint, ingest is schema-constrained, stored text is returned as data with a notice, RLS isolates workspaces, and the Gemini hostile ingest produced no escalation. No ChatGPT reconnection is required.

## 5. Migration reconciliation

- Production (`kqsxdothjxtcktyirpux`) head: `20261022100000` (20 migrations). Verified read-only: no `ai_*` / `oauth_*` tables; `can_access_owned_record`, `rpc_list_workspace_audit_events(uuid, integer)`, `auth_sessions`, `user_accounts`, `workspaces`, `audit_events`, `extension_tokens` exist; `pgcrypto` is installed in schema `extensions`.
- Dev (`xpnkasclquplmrcmhsif`) head: `20261030100000` (28 migrations); the repo has the same 28.
- **Exact ordered Production sequence (8 migrations, forward-only):**
  1. `20261023100000_ai_hub_database_foundation.sql`
  2. `20261024100000_ai_hub_rls_ownership_audit.sql`
  3. `20261025100000_ai_hub_audit_scope_filter.sql` (drops and recreates `rpc_list_workspace_audit_events`; the new signature adds defaulted `p_scope`, so existing two-argument callers keep working — safe to apply before deploying new code)
  4. `20261026100000_ai_hub_mcp_auth.sql`
  5. `20261027100000_ai_hub_external_intelligence.sql`
  6. `20261028100000_ai_hub_calendar_intelligence.sql`
  7. `20261029100000_ai_hub_controlled_actions.sql`
  8. `20261030100000_ai_hub_oauth_21.sql`
- Verified: no top-level DML, no seed data, no enum changes, no Dev-data assumption; the only DROP is the `drop function if exists` above. OAuth migration depends on core tables plus `auth_sessions` revoke reasons from m1b; no DDL dependency on migrations 1–7 but the MCP tools need them at runtime, so apply in order.
- **Rollback / disable strategy:** migrations are additive (new tables/functions); do not roll back the schema. To disable at runtime without a DB rollback set `AI_HUB_ENABLED=false` (MCP returns 503 before auth and ingest is blocked, making every OAuth/connector token useless) and revoke clients individually via Settings. `/api/oauth/*` has no separate flag (P2); a hard stop would need a code change and redeploy. Bulk revoke would be an authorised service-role write and needs separate approval.
- Production migrations are **not applied** and must not be applied by this phase.

## 6. Production release runbook (do not execute without explicit operator approval)

1. **Final development SHA:** after this phase merges, record the development SHA and confirm it contains the AI-10 merge.
2. **Final development CI:** exact run ID PASS on that SHA.
3. **development → main:** `--no-ff`, only after step 2 and explicit approval (M15-F gate). Fetch and verify `origin/main` is still `26e517ea…` first.
4. **Main CI:** exact run ID PASS on the main SHA.
5. **Ordered Production migrations:** the 8 above, one at a time, to project `kqsxdothjxtcktyirpux` only (manual ref check — `assert-migration-target` guard is not built). Before applying: confirm pgcrypto is in `extensions`; after each: confirm the migration ledger. No data writes.
6. **Vercel Production configuration:** `EXTENSION_TOKEN_ENV=live` (client ids become `jq_oauth_live_…`), a Production-only `EXTENSION_TOKEN_PEPPER` (≥32 chars, never reused from Dev), `JQ_JWT_PRIVATE_JWK` (existing), `SUPABASE_*` pointing to Production, `APP_ORIGINS` containing the **stable** Production origin, `AI_HUB_ENABLED=true` and `VITE_AI_HUB_ENABLED=true` (build-time) only when enabling the feature; leave `OAUTH_*` TTL/rate-limit variables at defaults. Confirm Preview and Production env→Supabase mapping did not cross.
7. **Issuer/base URL:** the issuer is the request origin and must be in `APP_ORIGINS`; use the stable Production domain, never a per-deployment URL. The MCP resource is `<origin>/api/mcp`.
8. **Production callbacks / clients:** create fresh Production clients (no Dev client or secret is reused). Gemini: copy Gemini's own redirect URI for the Production MCP URL. ChatGPT: `https://chatgpt.com/connector_platform_oauth_redirect`. Scopes only `jobquest:read ai:read ai:ingest`; revoke the temporary clients afterwards.
9. **Deployment:** deploy the exact main SHA to Production; record the deployment ID.
10. **Feature flags:** enable AI Hub flags last, after the smoke checks that need them.
11. **MCP discovery smoke:** `/.well-known/oauth-protected-resource/api/mcp`, `/.well-known/oauth-authorization-server`, `/api/oauth/jwks`, unauthenticated `/api/mcp` → 401 with `resource_metadata`.
12. **Claude smoke:** existing connector-token path unchanged (read + ingest, revoke → denied).
13. **Gemini OAuth smoke:** connect, one read, one ingest, revoke → denied.
14. **ChatGPT OAuth smoke:** connect, one read, one ingest, revoke → denied.
15. **AI Hub UI smoke:** Overview, History, Digest, Job Leads, Email, Recruiters, Calendar, Actions; 375/768/1280.
16. **Controlled-action smoke:** one preview → confirm → execute as the human; stale-state rejection.
17. **RLS/security smoke:** another user/workspace cannot read the AI rows or OAuth tables; anon/authenticated cannot call the OAuth RPCs.
18. **Rollback / disable plan:** `AI_HUB_ENABLED=false` + redeploy env; revoke clients; schema stays (additive); redeploy previous Production deployment if needed.
19. **Temporary client revocation:** revoke every smoke-test client and confirm 0 live grants/sessions.

## 7. Limitations and caveats

- Scheduled/unattended provider use (read, ingest, Gmail trigger) and refresh-reuse detection were **not** live-tested; the operator shelved them.
- Gemini stored-content fresh-chat injection is NOT FULLY VERIFIED; ChatGPT stored-content injection is NOT TESTED LIVE (POST-RELEASE, non-blocking).
- ChatGPT ingest approval behaviour was not recorded.
- Failed `/authorize` attempts are undiagnosable server-side (P1).

## 8. Next

Development integration (`--no-ff`, one push, one development CI). Then STOP: main and Production remain frozen until the separately authorised release.

## 9. Production closure addendum (2026-10-13)

**AI-10 STATUS: PRODUCTION CERTIFIED / COMPLETE.** This supersedes the "pending development integration" status at the top of this report (kept as written history).

### 9.1 Final release facts

- Production main: `455a0120860405462b73647eca6a65ecd7fad6a7` (main CI `38426359777` success). Development: `5fc2bc4ceb5516b3b6ac69139a6769421e758f64`.
- Production DB migration head: `20261031100000_ai_hub_oauth_state_length` (29 migrations). `oauth_authorization_requests.state` is `varchar(2048)`.
- Production ordering followed DB-first: the ordered Production migrations (section 5) were applied before the application deployment; the state-length migration was applied to Production before the hotfix code reached Production.
- `EXTENSION_TOKEN_ENV=live` proven from Production-issued `jq_oauth_live_` client ids. Unchanged.
- Production runtime: GET / 200, GET /api/health 200, OAuth authorization-server metadata 200, MCP protected-resource metadata 200, unauthenticated POST /api/mcp 401. AI Hub flags active.

### 9.2 Provider matrix (Production)

| Provider | Result | Validated |
|---|---|---|
| Claude | PASS | bearer MCP auth; 11 tools (10 read + 1 ingest); no provider-facing core mutation tool; representative reads; harmless AI Hub ingest; no application/task/status mutation; credential revocation; post-revocation denial |
| Gemini | PASS | OAuth Authorization Code + PKCE S256; Production `jq_oauth_live_` client; consent + token exchange; MCP initialize; 11 tools; reads; harmless ingest; no core mutation; refresh-token rotation; client/grant/session revocation; post-revocation MCP denial |
| ChatGPT | PASS | User-Defined OAuth client (`jq_oauth_live_`); consent; MCP initialize; tools/list 11 tools; fresh application read; harmless ingest; no core mutation; refresh rotated naturally in-session; client/grant/session revocation; post-revocation `auth_invalid`. Run `79583298-4e96-45e5-82eb-5796ff566054` |

Smoke-test isolation: no application, task or status was mutated by any provider test; the only writes were harmless AI Hub ingests.

### 9.3 Gemini OAuth state hotfix

Original AI-10 assumed OAuth `state` <= 512 chars. Real Gemini on Production sent opaque state ~1200 chars and exposed the defect. Fix: route maximum 512 -> 2048 and DB `varchar(512)` -> `varchar(2048)` (finite bound retained); PKCE, state requirement, exact redirect matching, resource binding and scopes unchanged. Branch `fix/ai10-gemini-oauth-state-length`, commit `3288138e9e8a4807b19e6991161f00fb775aff06`, development merge `5fc2bc4c`, main merge `455a0120`, migration `20261031100000_ai_hub_oauth_state_length.sql`. A real ~1200-char-state Production authorization then succeeded. Note: the "state (8-512 chars)" wording in section 1 predates this hotfix; the current bound is 8..2048.

### 9.4 Read-only closure check (this session, no writes, no credentials, no provider tests)

| Item | Result |
|---|---|
| Production main SHA | `455a0120860405462b73647eca6a65ecd7fad6a7` (origin/main; main CI success) |
| Production DB head | `20261031100000` (read-only migration ledger listing) |
| Production health / discovery / MCP | GET / 200, /api/health 200, AS metadata 200, PRM 200, unauthenticated POST /api/mcp 401 |
| Live OAuth clients (not revoked) | 0 |
| Live grants (not revoked) | 0 |
| Live OAuth sessions (not revoked) | 0 |
| Live connector tokens (not revoked) | 0 |
| Smoke findings | 3 remain (not dismissed; synthetic provider smoke). Dismiss via supported AI Hub UI only; no manual DELETE. Does not block closure |
| Deployed-SHA check on Vercel | not rechecked in closure (health only) |

### 9.5 Post-release backlog (P1-P9; numbering preserved)

P1-P8 are unchanged from section 4 (P1 failed `/authorize` has no server-side reason; P2 `/api/oauth/*` not behind `AI_HUB_ENABLED`; P3 code replay does not revoke tokens already issued; P4 no automated concurrent-refresh / replay-revocation test; P5 `/revoke` no rate limit and no audit row; P6 ingested `provider` label not bound to the OAuth client; P7 expired OAuth rows never purged; P8 live validation of refresh-reuse detection and scheduled/unattended provider use). Production observation reinforces P1: first-stage rejected `/authorize` requests (as hit by the Gemini state defect) log too little structured reason information.

- **P9 (new)** Vercel builds emit non-fatal TypeScript diagnostics because `@vercel/node` injects `strict:false` under its current tsconfig handling, which disagrees with the repository (strict CI passes). Audited runtime risk: LOW. Not hotfixed in AI-10 closure.

Other tracked items (not P-numbered):

- Improved rejected-`/authorize` reason logging = P1 (observability work).
- Scheduled workflows, Gmail/email triage, job discovery and recruiter intelligence move to **AI-11** (JobQuest 2.2). They were intentionally not required to certify OAuth/MCP connectivity and are the primary objective of the next feature release; they are NOT abandoned or out of scope.
- Provider scheduling adapters (Claude, then ChatGPT, then Gemini) = AI-11G.
- Refresh-reuse / advanced OAuth abuse testing = P8 (and P3/P4).
- **Production DB password rotation: SHELVED by operator choice; PENDING security maintenance.** Not rotated in this closure; no credentials requested or created.
- Three synthetic smoke findings remain in Production; operator may dismiss via the AI Hub UI.

### 9.6 Scope statement

AI-10 delivers provider connectivity and security (OAuth 2.1, MCP, revocation). It does not mean AI automation is finished. Next: JobQuest 2.2 / AI-11 Scheduled Intelligence & Digest Automation (see `ROADMAP.md`), starting with AI-11A Automation Foundation (determine reuse of `ai_workflow_configs`, `ai_runs`, `ai_findings` and AI Hub settings/UI first). No AI-11 implementation, migration or schema change has been made.
