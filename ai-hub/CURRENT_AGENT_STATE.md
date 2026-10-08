# AI Hub — Current Agent State

```
CURRENT PHASE:
AI-1

CURRENT SUB-PHASE:
AI-1B COMPLETE

STATUS:
READY FOR OPERATOR REVIEW

WORKING BRANCH:
feature/ai-1-foundation

BRANCH PUSHED:
NO

NEXT SUB-PHASE:
AI-1C — Canonical Contract Types / Validation / Dedupe Utilities

DO NOT REPEAT:
AI-1A migration 20261023100000 and AI-1B migration 20261024100000_ai_hub_rls_ownership_audit.sql (both applied to jobquest-dev; Dev head now 20261024100000); hosted read-only verification + security advisor; local behavioural suite tests/integration/ai-1b-rls-audit.test.ts (15/15 on local stack). Do not re-run db push.

NEXT EXACT STEP:
On operator approval for AI-1C: read reports/AI-1B_RLS_OWNERSHIP_AUDIT_REPORT.md (RPC signatures + outcomes), then add TS contract types/validator for jobquest.ai-result 1.0, the dedupe-key util (DATA_MODEL_PLAN §5) and golden fixtures; the service layer calls rpc_ai_ingest_run / rpc_ai_ingest_finding / rpc_ai_create_suggestion / rpc_ai_finalize_run with the service key. No new migration expected.
```

Notes: Prod untouched (head 20261022100000). Do not push the branch until Vercel Preview → jobquest-dev mapping is confirmed. Local stack: `npx supabase start -x edge-runtime,imgproxy,studio,vector,logflare,mailpit` (edge-runtime fails on the dotted project id), then `node scripts/m1b-local-env.mjs`. Untracked .artifacts/ is pre-existing; never stage it.
