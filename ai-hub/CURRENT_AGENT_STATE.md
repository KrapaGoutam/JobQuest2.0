# AI Hub — Current Agent State

```
CURRENT PHASE:
AI-1

CURRENT SUB-PHASE:
AI-1E COMPLETE

STATUS:
READY FOR OPERATOR REVIEW

WORKING BRANCH:
feature/ai-1-foundation

BRANCH PUSHED:
NO

NEXT SUB-PHASE:
AI-1F — Feature Flags / AI & Automation Settings / AI-1 Finalization

DO NOT REPEAT:
AI-1A/1B migrations (applied to jobquest-dev, head 20261024100000); AI-1C contract layer; AI-1D shell; AI-1E operational views (no DB change, no hosted writes). Do not re-run db push.

NEXT EXACT STEP:
On operator approval for AI-1F: add feature-flag gating + Settings -> AI & Automation (workflow config mutation). After AI-1F: final targeted AI-1 validation, resolve Vercel Preview -> Supabase mapping, push once, branch CI, merge development, development CI, STOP.
```

Notes: Prod untouched (head 20261022100000). Do not push until Preview mapping confirmed. Untracked .artifacts/ is pre-existing (holds AI-1E screenshots); never stage it. Local stack (if needed): `npx supabase start -x edge-runtime,imgproxy,studio,vector,logflare,mailpit`, then `node scripts/m1b-local-env.mjs`.
