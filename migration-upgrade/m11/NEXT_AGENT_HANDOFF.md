# QUICK RECOVERY - MILESTONE 11

## Active Milestone

Milestone 11 - Browser Extension Migration

## Active Branch / HEAD

`feature/m11-browser-extension` at pushed browser verification checkpoint `3b9b3970fa579269852ab42b561a04b26d46b4fd`. First API/security checkpoint: `717e33dcae9aa57ef26a40e7d7382761d8b66108`; web/extension checkpoint: `6784fc59bde7cc77fb74a917b1c75d8e301e0b0e`.

## Completed Locally

- Extension token schema/RLS/lifecycle RPCs and atomic capture RPC.
- Dedicated HMAC bearer auth and `/api/ext/v1` me/workflow/documents/duplicates/captures facade.
- Settings token-management UI with one-time secret reveal.
- MV3 extension source, strict CSP, local credential storage, six legacy fixtures, 11 named extractor cases, popup state matrix, dynamic workflow, duplicate UX, capture, and safe deep links.
- Web application deep-link routing and drawer recovery.
- Dev/prod packages and verified legacy icons.
- Focused API/web typecheck, changed-file lint, token/security tests (29/29), and post-reset M11 integration (7/7) passed.
- Extension tests (27/27), typecheck, both packages, and bundle secret scan (40 files, 0 findings) passed.
- Web/extension checkpoint adds persisted System/Light/Dark themes, approved X1-X14 state mapping, deep-link routing, and manifest/CSP/content-script integrity coverage.
- Unpacked persistent Chromium verification passes the real Settings token flow, options storage, live content-script extraction, workflow, atomic capture, deep link, exact duplicate, dark theme, and revoked-token state. Six axe contexts have 0 critical/serious findings. Exact-current evidence: `browser-local-0df44867.json` plus six screenshots.
- Browser verification found and fixed comma-separated salary parsing and dark primary-button contrast; the salary regression raises the current extension total to 27/27.

## Current Caveat

The local database reset, targeted M11 integration (7/7), and full integration regression (134/134) passed after the final safe-column grant hardening. Hosted `jobquest-dev` now has the M11 migration and hosted focused integration passes 7/7 (`integration-hosted-dev-9ba597.json`). Authenticated direct verifier-column SELECT is denied. Token display prefixes are 12 characters with four non-secret random discriminator characters.

API PID `2596` on 8787 and web PID `52920` on 5173 are healthy and were reused. Local Supabase is running on 55321 after a clean reset through M11. The browser test deletes its temporary persistent profile after every run.

## Next Exact Action

1. Rerun the expanded target-aware M11 browser spec locally using `M11_REUSE_RUN=0df44867`; Preview rotation/revocation is already green.
2. Run final static/security checks, commit/push the executable checkpoint, and verify CI.
3. Finalize M11 reports and recovery docs; do not merge M11.

## Hard Guardrails

- JobQuest1.0 is read-only.
- Supabase later: `jobquest-dev` / `xpnkasclquplmrcmhsif` only.
- Vercel later: `jobquest2` Preview under `one-piece-5779` only.
- Never merge M11, touch `main`/Production, start M12, reset, rebase, or force-push.
