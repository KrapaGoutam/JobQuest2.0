# AI Hub — Current Agent State

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
