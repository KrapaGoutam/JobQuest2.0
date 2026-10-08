# AI Hub — Current Agent State

```
CURRENT PHASE:
AI-2

CURRENT SUB-PHASE:
AI-2B implemented locally — AI-2 READY FOR BRANCH CI (not COMPLETE)

STATUS:
READY FOR BRANCH CI

BASE BRANCH:
development

WORKING BRANCH:
feature/ai-2-integration-service

BRANCH PUSHED:
NO (push is the next step)

CI:
NOT RUN

NEXT SUB-PHASE:
AI-2 closure (push, branch CI, development merge, development CI) then AI-3 (combined AI-3A + AI-3B, needs operator approval)

DO NOT REPEAT:
AI-1 work; AI-2A ingestion service; AI-2B read service, audit scope migration (applied to Dev and local), CRLF fix. Do not re-run db push.

NEXT EXACT STEP:
Commit AI-2B, push feature/ai-2-integration-service once, watch the push-triggered branch CI (no manual dispatch), record run ID + SHA in reports/AI-2_FINAL_REPORT.md, refresh origin/development, merge --no-ff once, push development, watch development CI, then set AI-2 COMPLETE. Do not start AI-3.
```

AI-2A commit: `eadef2760a3511c3c2171bd07b01eb453deac578`. AI-2B commit: `feat(ai-hub): add AI read service and operational queries` (SHA in chat checkpoint/final report). DB: Dev head `20261025100000` (audit scope filter, applied to jobquest-dev only), Prod head `20261022100000` untouched. Final report: `reports/AI-2_FINAL_REPORT.md`.
Tests run (local, before push): full unit suite 383/383; ai-contract 55/55; integration ai-2a 11, ai-2b 7, ai-1b 15, m12 pass; root typecheck, eslint, build, check:bundle clean.
Needs product decision: SUGGESTION CROSS-RUN RE-PROPOSAL POLICY (see final report). Older stash from fix/2.1-f-master-job-capture must stay untouched.

## AI-1 final facts (persisted at AI-2 start)

- AI-1 final development SHA: `0847447474e9cfd6c53bcab43c4457fbd48ff9c5` (merge of `feature/ai-1-foundation`).
- AI-1 development CI: run `37801299047` — PASS.
- AI-1 branch implementation SHA `4a478265ce52de17b4c32290ed751f6cf21c99b3`; branch CI `37799394061` — PASS.
- main unchanged: `26e517ea7cd8e6be421ad2c2188d8ceee4bfb224`. Production unchanged.
- Dev Supabase `jobquest-dev / xpnkasclquplmrcmhsif` head `20261024100000` at AI-2 start (now `20261025100000`); Prod `jobquest-prod / kqsxdothjxtcktyirpux` head `20261022100000` (no AI-1 migrations).
- Next phase = AI-2 (started from development `08474474…`).

Notes: Untracked .artifacts/ is pre-existing; never stage it. Local stack (if needed): `npx supabase start -x edge-runtime,imgproxy,studio,vector,logflare,mailpit`, then `node scripts/m1b-local-env.mjs`.
