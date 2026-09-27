# QUICK RECOVERY - MILESTONE 11

## Active Milestone

Milestone 11 - Browser Extension Migration

## Active Branch / HEAD

`feature/m11-browser-extension` at pushed web/extension checkpoint `6784fc59bde7cc77fb74a917b1c75d8e301e0b0e`. First API/security checkpoint: `717e33dcae9aa57ef26a40e7d7382761d8b66108`.

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

The local database reset, targeted M11 integration (7/7), and full integration regression (134/134) passed after the final safe-column grant hardening. Authenticated direct verifier-column SELECT is denied. Token display prefixes are 12 characters with four non-secret random discriminator characters.

API PID `2596` on 8787 and web PID `52920` on 5173 are healthy and were reused. Local Supabase is running on 55321 after a clean reset through M11. The browser test deletes its temporary persistent profile after every run.

## Next Exact Action

1. Review, commit, and push the coherent browser verification checkpoint; the exact-current Chromium spec and all local gate items are green (lint, typecheck, unit 116/116, integration 134/134, extension 27/27, build/package, DB lint, and 0-finding scans).
2. Continue with hosted-dev/Preview verification only after the checkpoint is pushed.
3. Continue with hosted-dev/Preview verification only after local is green; do not merge M11.

## Hard Guardrails

- JobQuest1.0 is read-only.
- Supabase later: `jobquest-dev` / `xpnkasclquplmrcmhsif` only.
- Vercel later: `jobquest2` Preview under `one-piece-5779` only.
- Never merge M11, touch `main`/Production, start M12, reset, rebase, or force-push.
