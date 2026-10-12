# AI Hub — Current Agent State

```
CURRENT PHASE:
AI-7 (Calendar Intelligence + dedicated AI-Hub browser CI; one cumulative branch)

CURRENT SUB-PHASE:
AI-7 IN PROGRESS (implementation)

STATUS:
AI-7 IN PROGRESS. Not complete until branch CI (incl. the dedicated AI-Hub e2e job), development merge and development CI pass; results go in the chat checkpoint.

BASE BRANCH:
development (f0a0ec898088c33c918601c51025f913f6ed586b)

WORKING BRANCH:
feature/ai-7-calendar-intelligence

NEXT EXACT STEP:
Calendar contract/validator -> migration 20261028100000 (ai_calendar_events) -> ingestion projection -> read service + MCP tool -> UI -> digest -> dedicated CI job -> local validation -> push once.
```

## AI-6 FINAL FACTS (persisted at AI-7 start)

- AI-6 COMPLETE — integrated to development. Development SHA `f0a0ec898088c33c918601c51025f913f6ed586b` (merge of `feature/ai-6-external-intelligence`); development CI `38212006797` PASS; AI-6 executable feature SHA `a507bf3fd9f92852839b2d303dfc03992086b3e9`, branch CI `38211220785` PASS; main `26e517ea…` and Production unchanged; Dev head `20261027100000`, Prod `20261022100000`. Operational sources: Daily Digest (`daily_brief`), Job Leads, Email Intelligence, Recruiter Intelligence. No internal scheduler (provider-owned scheduling is intentional).

(Previous state, AI-6 pre-CI, kept for history:)

```
CURRENT PHASE:
AI-6 (External Intelligence Sources: Email Intelligence + Job Discovery + Recruiter Intelligence; one cumulative branch)

CURRENT SUB-PHASE:
AI-6 LOCAL VALIDATION COMPLETE - READY FOR BRANCH CI

STATUS:
AI-6 READY FOR BRANCH CI (not complete until branch CI, development merge and development CI pass; results go in the chat checkpoint and the closure docs carried by the next phase)

BASE BRANCH:
development (ce3c16a6e4a96e8ccfe2bc13752df1998822a218)

WORKING BRANCH:
feature/ai-6-external-intelligence

NEXT EXACT STEP:
Push the branch once, observe the one branch CI run by exact run ID, apply migration 20261027100000 to Dev only, pre-merge fetch, --no-ff merge to development, one development CI. Then STOP; the next phase needs operator approval. Do not push docs-only commits while an exact application SHA is certifying.
```

## AI-6 facts (this branch)

- Email + job discovery + recruiter intel through the single `jobquest.ai-result` 1.0 path (no enum change, no new write tool, no scheduler, no scraper). Migration `20261027100000_ai_hub_external_intelligence.sql` (`ai_job_leads` child of `ai_findings`, composite FK, RLS = parent, projection + key-resolve RPCs, service_role only): applied to the LOCAL stack; Dev only after branch CI; Production head stays `20261022100000`.
- New code: `aiContract` payload validators/dedupe, `aiExternalIntelligenceService` + `aiReadSupport`, ingestion projection, 3 read-only MCP tools (10 tools, 1 write), Daily Digest source integration, web pages `/ai-hub/job-leads|email|recruiters`, Claude templates. Report: `reports/AI-6_EXTERNAL_INTELLIGENCE_REPORT.md`.
- Local validation: unit 600/600 (40 files), integration AI suites 88/88, focused e2e PASS (375/768/1280, axe 0 serious/critical), typecheck, eslint, build, bundle, secret scan clean.

## AI-5 FINAL FACTS (persisted at AI-6 start)

- AI-5 COMPLETE — integrated to development. Development SHA `ce3c16a6e4a96e8ccfe2bc13752df1998822a218` (merge of `feature/ai-5-scheduled-digest`); development CI `38205932872` PASS; AI-5 executable feature SHA `6c8196f75a284725e0c1ef1bd7c0d48ffbe778ea`, branch CI `38205261995` PASS; main `26e517ea…` and Production unchanged; Dev head `20261026100000`, Prod `20261022100000`. `daily_brief` = canonical workflow identifier for the Daily Digest product feature (do NOT add a `daily_digest` enum). The focused AI-5 e2e stays local (AI Hub flags are OFF in CI by design).

(Previous state, AI-5 pre-CI, kept for history:)

```
CURRENT PHASE:
AI-5 (Scheduled Intelligence + Daily Digest Foundation; re-sequenced from "Gemini")

CURRENT SUB-PHASE:
AI-5 READY FOR BRANCH CI

STATUS:
AI-5 LOCAL VALIDATION COMPLETE - READY FOR BRANCH CI (not complete until branch CI, development merge and development CI pass; those results are recorded in the chat checkpoint and the closure docs carried by the next phase)

BASE BRANCH:
development (498d3342765deb252cceefb287940d3d83382814)

WORKING BRANCH:
feature/ai-5-scheduled-digest (AI-4 closure docs cherry-picked as 76322f69 from d3f90f3b)

NEXT SUB-PHASE:
Push branch once, observe the one branch CI run by exact run ID, pre-merge fetch, --no-ff merge to development, one development CI. Then STOP; AI-6 External Intelligence Sources needs operator approval.

DO NOT REPEAT:
AI-1..AI-4 work, the Claude connector smoke, connector token creation, the digest design/validation below.

NEXT EXACT STEP:
git push -u origin feature/ai-5-scheduled-digest (once). Do not push docs-only commits while an exact application SHA is certifying.
```

## AI-5 facts (this branch)

- Roadmap re-sequenced (operator): AI-5 = Scheduled Intelligence + Daily Digest; AI-6 = External Intelligence Sources (email + job discovery + recruiter; calendar may be separate); Gemini/ChatGPT provider phases move after AI-6 (historical labels kept in ROADMAP/PHASE_REGISTRY).
- Daily Digest = `ai_findings` kind/workflow `daily_brief` (existing canonical value; product name "Daily Digest"); dedupe key `daily_brief:<date>:<provider>`; payload 1.0; **no digest table, no migration** (Dev head `20261026100000`, Prod `20261022100000`, Prod untouched). Digest date = owner profile time zone (UTC when unset).
- New code: `apps/api/src/lib/aiContract` (digest payload validator + per-provider dedupe), `apps/api/src/lib/calendarDate.ts`, `aiReadService.listAiDigests/getAiDigest`, `apps/api/src/services/aiDigestService.ts` (deterministic aggregation + system digest through `ingestAiResult`), `routes/aiDigest.ts` (`POST /api/ai/digest/generate`, owner+CSRF, today only), MCP tool `jobquest_list_daily_digests` (7 tools total), web `lib/aiDigest.ts`, `lib/aiWorkflowDefinitions.ts`, `api/aiDigest.ts`, `views/AiHubDigest.tsx`, tab `/ai-hub/digest`.
- Provider-owned scheduling only: no cron/background loop; templates in `ai-hub/provider-workflows/` (Claude). Workflow-config mutation deliberately NOT added.
- Local validation: unit 496/496 (35 files); integration AI suites (1B, 2A, 2B, 3, 4, 5) 67/67 on local Supabase; e2e `e2e/ai5-digest.spec.ts` PASS (375/768/1280, 0 horizontal overflow, 0 serious/critical axe); root typecheck, eslint, build, check:bundle clean. See `reports/AI-5_SCHEDULED_DIGEST_REPORT.md`.

(Previous state, AI-4, kept for history:)

```
CURRENT PHASE:
AI-4

CURRENT SUB-PHASE:
AI-4 COMPLETE

STATUS:
AI-4 COMPLETE — CLAUDE REMOTE CONNECTOR INTEGRATED TO DEVELOPMENT — AWAITING OPERATOR APPROVAL FOR NEXT PROVIDER PHASE

BASE BRANCH:
development (498d3342765deb252cceefb287940d3d83382814)

WORKING BRANCH:
none (feature/ai-4-claude-integration and fix/calendar-today-contrast merged)

CI:
Development CI 38201400116 PASS @498d3342. See facts below.

NEXT SUB-PHASE:
Await operator decision on the next provider phase (do not assume Gemini/ChatGPT match Claude).

DO NOT REPEAT:
AI-1..AI-4 work, the Claude remote smoke, connector token creation, the calendar contrast fix.

NEXT EXACT STEP:
Operator review. This closure doc is carried by the next phase branch (it was not pushed, to avoid a CI cycle on the certified development SHA).
```

## AI-4 closure facts (persisted; docs-only, unpushed at closure)

AI-4 COMPLETE — CLAUDE REMOTE CONNECTOR INTEGRATED TO DEVELOPMENT. Executable SHA `4c3a5778` (branch CI `37947672506` PASS); first development merge `ddec2093` CI `38149316322` FAILED on an unrelated pre-existing calendar today-badge contrast defect (white on #8098ff, 2.67:1; `e2e/pl4b-planning.spec.ts:70`; failed-job rerun failed the same way); narrow fix branch `fix/calendar-today-contrast` (`019cbaba`, `.calendar-today` now uses existing `--color-on-accent`), branch CI `38200664445` PASS; merged to development `498d3342765deb252cceefb287940d3d83382814`; final development CI `38201400116` PASS. AI-4 provider functionality needed no further change; Claude smoke NOT repeated. Main `26e517ea` and Production unchanged; Dev migration head `20261026100000`, Prod `20261022100000`.


## AI-3 final facts (persisted at AI-4 start)

- AI-3 COMPLETE — integrated to development. Final development SHA: `ed517594d58dedf26b6144d61b2e9ac2f8e60a58` (merge of `feature/ai-3-mcp-auth`).
- AI-3 development CI: run `37820583043` — PASS. AI-3 executable feature SHA `d8657e54` (implementation `bac31196`); branch CI `37819293115` — PASS.
- main unchanged `26e517ea7cd8e6be421ad2c2188d8ceee4bfb224`; Production unchanged. Dev head `20261026100000`; Prod head `20261022100000`.

## AI-4 facts (this branch)

- Integration = Claude custom remote MCP connector -> `/api/mcp`, fixed `Authorization: Bearer <connector token>` header, AI-3 connector tokens reused (no new table/migration, no OAuth, no Anthropic API/SDK/key, no Claude credentials stored).
- Manager token policy (operator decision): same RLS visibility as the manager's UI; `SECURITY_AUTH.md` §5 updated; regression `tests/integration/ai-4-claude.test.ts` AI4-04.
- UI: `apps/web/src/components/ai/ClaudeConnectorPanel.tsx` (+ `lib/claudeConnector.ts`, `api/aiConnectors.ts`) inside Settings -> AI & Automation -> Providers. States: Not configured / Connector ready / Last used / Expired / Revoked. Presets Read only (default) and Read + AI findings; expiry 7/30/90 (default 30); raw token shown once, ephemeral state only.
- MCP tool descriptions reworded for Claude tool selection (same six tools; no new tools).
- Local validation before push: see `reports/AI-4_CLAUDE_INTEGRATION_REPORT.md`.
- REMOTE CLAUDE SMOKE = PASS (2026-10-11, operator-performed, real Claude custom connector against the stable branch alias): 6 tools discovered (5 read-only, 1 submit), application list/detail and AI reads OK, core-write attempt impossible (no tool), synthetic `claude` ai-result created one finding with no core mutation, prompt-injection text stayed data, temporary credential REVOKED and the next Claude call DENIED. Live read-only-ingest denial not repeated (automated scope tests cover it). Contract observations: missing `generated_at` rejected; missing finding `dedupe` gave a PARTIAL run; finalized duplicate external_run_id stayed idempotent; corrected new run succeeded; one synthetic PARTIAL run remains in Dev (accepted residue). No contract semantics changed. Details in `reports/AI-4_CLAUDE_INTEGRATION_REPORT.md`.
- (earlier gate note) Smoke gate (2026-10-11): `AI_HUB_ENABLED=true` now live on Preview. Tested deployment `jobquest2-d4ys3g5jy-one-piece-5779.vercel.app` (dpl_D8T8JoSQ3zGpwAJv6cR4RU4JfH3B, commit `4c3a5778`); `/api/mcp` unauthenticated -> 401 (no longer AI_HUB_DISABLED). Stable branch alias `jobquest2-git-feature-ai-4-claude-integration-one-piece-5779.vercel.app` also 401. Deployment `jobquest2-3fivtzeoc` is a Preview of MAIN `26e517ea` (not this branch) - ignore. Waiting for the operator to create the temporary connector credential in the Preview UI and add the Claude connector; the agent never sees the raw token.
- Preview finding (fixed): the extensionless lazy `import('../mcp/server')` was not resolvable in the compiled Vercel function (ERR_MODULE_NOT_FOUND, Preview 503 `MCP_UNAVAILABLE`); AI-3's local tests could not see this. Fixed with `import('../mcp/server.js')` (+ server-side load-failure logging). Verified on Preview `jobquest2-qu6p8vi9w-one-piece-5779.vercel.app`: `/api/mcp` now answers `AI_HUB_DISABLED` (flag off), `/api/health` 200. Vercel Deployment Protection did NOT block the endpoint.
- Preview remote smoke needs operator: Preview `AI_HUB_ENABLED=true` (not changed by the agent), Preview protection decision, and adding the Claude custom connector.

---

# Previous state (AI-3, kept for history)

```
CURRENT PHASE:
AI-3

CURRENT SUB-PHASE:
AI-3 branch CI PASS (run 37819293115 @d8657e54; executable bac31196); merged to development, development CI in progress

STATUS:
BRANCH CI PASSED - INTEGRATING TO DEVELOPMENT (not complete until development CI passes)

BASE BRANCH:
development (222d7e40f112cb3a56c6adf30e574cfd6177a731)

WORKING BRANCH:
feature/ai-3-mcp-auth

BRANCH PUSHED:
YES

CI:
Branch CI 37819293115 PASS @d8657e54 (code bac31196); development CI pending

NEXT SUB-PHASE:
Push branch, branch CI, pre-merge fetch, --no-ff merge to development, development CI. Then STOP; AI-4 (Claude Integration) needs operator approval.

DO NOT REPEAT:
AI-1/AI-2 work; MCP SDK selection; auth decision (connector tokens; OAuth deferred); migration 20261026100000 (already applied to Dev and local; do not re-run db push).

NEXT EXACT STEP:
git push -u origin feature/ai-3-mcp-auth; observe the one branch CI run by exact run ID (>=60s polling); record run ID + tested SHA here and in reports/AI-3_FINAL_REPORT.md (docs-only commit, no second CI cycle); fetch development; merge --no-ff; push development once; observe development CI; persist its SHA/run ID at the start of AI-4.
```

AI-2A commit: `eadef2760a3511c3c2171bd07b01eb453deac578`. AI-2B commit: `feat(ai-hub): add AI read service and operational queries` (SHA in chat checkpoint/final report). DB: Dev head `20261025100000` (audit scope filter, applied to jobquest-dev only), Prod head `20261022100000` untouched. Final report: `reports/AI-2_FINAL_REPORT.md`.
Tests run (local, before push): full unit suite 383/383; ai-contract 55/55; integration ai-2a 11, ai-2b 7, ai-1b 15, m12 pass; root typecheck, eslint, build, check:bundle clean.
Needs product decision: SUGGESTION CROSS-RUN RE-PROPOSAL POLICY (see final report). Older stash from fix/2.1-f-master-job-capture must stay untouched.

## AI-2 final facts (persisted at AI-3 start)

- AI-2 COMPLETE — integrated to development. Final development SHA: `222d7e40f112cb3a56c6adf30e574cfd6177a731` (merge of `feature/ai-2-integration-service`).
- AI-2 development CI: run `37813657961` — PASS. AI-2 executable feature SHA `79e44c17ba1ffcf364df5aa0eb287d9649c336ed`; branch CI `37812197575` — PASS.
- main unchanged `26e517ea7cd8e6be421ad2c2188d8ceee4bfb224`; Production unchanged. Next phase = AI-3 (this branch).

## AI-3 facts (this branch)

- MCP SDK `@modelcontextprotocol/sdk` 1.32.1; `/api/mcp` Streamable HTTP, stateless, tools-only, POST-only; 6 static tools; connector tokens `ai_connector_tokens` (migration `20261026100000_ai_hub_mcp_auth.sql`, applied to Dev `xpnkasclquplmrcmhsif` and local; Dev head `20261026100000`; Prod head `20261022100000` untouched). OAuth deferred. See `reports/AI-3_FINAL_REPORT.md` and `reports/AI-3_AUTH_DECISION.md`.
- Local validation (pre-push): unit 399/399, integration AI-3 19/19 + AI-2/AI-1B/M11/M12 regression pass, typecheck/eslint/build/bundle/secret scan clean, real-HTTP SDK smoke pass. Remote Preview MCP smoke not run (needs `AI_HUB_ENABLED=true` on Preview; not changed).

## AI-1 final facts (persisted at AI-2 start)

- AI-1 final development SHA: `0847447474e9cfd6c53bcab43c4457fbd48ff9c5` (merge of `feature/ai-1-foundation`).
- AI-1 development CI: run `37801299047` — PASS.
- AI-1 branch implementation SHA `4a478265ce52de17b4c32290ed751f6cf21c99b3`; branch CI `37799394061` — PASS.
- main unchanged: `26e517ea7cd8e6be421ad2c2188d8ceee4bfb224`. Production unchanged.
- Dev Supabase `jobquest-dev / xpnkasclquplmrcmhsif` head `20261024100000` at AI-2 start (now `20261025100000`); Prod `jobquest-prod / kqsxdothjxtcktyirpux` head `20261022100000` (no AI-1 migrations).
- Next phase = AI-2 (started from development `08474474…`).

Notes: Untracked .artifacts/ is pre-existing; never stage it. Local stack (if needed): `npx supabase start -x edge-runtime,imgproxy,studio,vector,logflare,mailpit`, then `node scripts/m1b-local-env.mjs`.
