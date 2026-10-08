# AI Hub — Current Agent State

```
CURRENT PHASE:
AI-1

CURRENT SUB-PHASE:
AI-1 INTEGRATED TO DEVELOPMENT (branch CI 37799394061 PASS @4a478265); AI-2 NOT STARTED

STATUS:
AWAITING OPERATOR APPROVAL FOR AI-2

WORKING BRANCH:
feature/ai-1-foundation

BRANCH PUSHED:
NO

NEXT SUB-PHASE:
AI-1F2 — AI-1 final validation / branch CI / development integration

DO NOT REPEAT:
AI-1A/1B migrations (applied to jobquest-dev, head 20261024100000); AI-1C contract layer; AI-1D shell; AI-1E operational views (no DB change, no hosted writes). Do not re-run db push.

NEXT EXACT STEP:
On operator approval and confirmed Preview mapping: AI-1F2 final targeted validation (incl. live visual smoke with VITE_AI_HUB_ENABLED on/off), push once, branch CI, merge development, development CI, STOP. AI-1F1 added gating + read-only Settings; workflow-config mutation deliberately deferred (see reports/AI-1F1_SETTINGS_FLAGS_REPORT.md).
```

Notes: Prod untouched (head 20261022100000). Do not push until Preview mapping confirmed. Untracked .artifacts/ is pre-existing (holds AI-1E screenshots); never stage it. Local stack (if needed): `npx supabase start -x edge-runtime,imgproxy,studio,vector,logflare,mailpit`, then `node scripts/m1b-local-env.mjs`.
