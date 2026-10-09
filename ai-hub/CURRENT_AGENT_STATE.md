# AI Hub — Current Agent State

```
CURRENT PHASE:
AI-4

CURRENT SUB-PHASE:
AI-4 Claude Integration — READY FOR BRANCH CI (implementation + local validation complete; not yet pushed)

STATUS:
AI-4 = READY FOR BRANCH CI

BASE BRANCH:
development (ed517594d58dedf26b6144d61b2e9ac2f8e60a58)

WORKING BRANCH:
feature/ai-4-claude-integration

BRANCH PUSHED:
NO

CI:
Branch CI pending

NEXT SUB-PHASE:
Push branch once; branch CI; then Preview + remote Claude connector smoke (operator gate: Preview `AI_HUB_ENABLED`, Preview protection, adding the Claude custom connector); revoke temporary token; merge --no-ff to development; development CI; STOP.

DO NOT REPEAT:
AI-1..AI-3 work; MCP architecture/auth research; migrations (AI-4 has none; Dev head stays 20261026100000, Prod 20261022100000).

NEXT EXACT STEP:
git push -u origin feature/ai-4-claude-integration; observe the one branch CI run by exact run ID (>=60s polling).
```

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
