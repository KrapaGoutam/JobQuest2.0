# JOBQUEST2.0 - CURRENT AGENT STATE

## Current milestone

M11 - Browser Extension Migration: complete and unmerged for user review.

## Branch and revisions

- Branch: `feature/m11-browser-extension`
- Current executable HEAD: `a49399ea59dd055c4af1887c857342913d166a07`
- Last pushed executable commit: same SHA (`fix(m11): harden extension browser ci`)
- API/security checkpoint: `717e33dcae9aa57ef26a40e7d7382761d8b66108`
- Web/extension checkpoint: `6784fc59bde7cc77fb74a917b1c75d8e301e0b0e`
- Docs-only closeout content commit: `870cb4f1434397b70ca6ef21aa695b61e8309e8e`
- Final recovery-state tail: this file is included in the final branch HEAD; use `git rev-parse HEAD` after checkout rather than embedding a self-referential SHA here.
- Development base remains `60ec9dff05588243ae95fb643b31a81fb295e1fb`; M11 is not merged.

## Completed state

- Secure HMAC extension-token schema, RLS/grants, lifecycle, scopes, membership checks, rate limit, and atomic capture are complete.
- Settings token management and Manifest V3 extension are complete.
- Six legacy HTML fixtures and 11 named extractor cases pass; extension suite is 27/27.
- Full local gate: lint/typecheck/build/package PASS; unit 116/116; integration 134/134; M11 7/7; all secret scans zero findings.
- Real unpacked Chromium M11 lifecycle passes locally and on final Vercel Preview with six axe contexts and 0 critical/serious/blocking findings.
- Hosted-development M11 integration passes 7/7.
- Exact executable SHA CI run `36370670193` is green: static job `108766160772`, database/integration/extension/browser job `108766160686`.

## Infrastructure

- Hosted database: `jobquest-dev`, ref `xpnkasclquplmrcmhsif`.
- Applied migration: `20261005100000_m11_extension_tokens.sql`.
- Final Preview: `https://jobquest2-4s4ifimlx-one-piece-5779.vercel.app`.
- Deployment: `dpl_Bynq1FZg7G2kD5vR9M1S6KTDPMx8`, READY, target Preview, health 200.
- Preview-only `EXTENSION_TOKEN_PEPPER` is configured. Production was not changed.
- Local disposable Supabase was clean-reset through all 15 migrations and stopped after validation. The task-owned API/web listeners on 8787/5173 were also stopped.

## Final evidence

- Hosted integration: `migration-upgrade/m11/evidence/integration-hosted-dev-9ba597.json`
- Local browser: `migration-upgrade/m11/evidence/browser-local-f719491e.json`
- Final Preview browser: `migration-upgrade/m11/evidence/browser-vercel-preview-73808ee5.json`
- M11 reports: `migration-upgrade/m11/M11_*`

## Current/next exact step

No implementation or closeout work remains. Keep the feature branch unmerged and stop. Any merge requires a separate explicit user authorization.

## Safety and authority

- Do not merge M11, touch `main` or `development`, deploy Production, mutate production Supabase, or start M12.
- JobQuest1.0 remains read-only.
- The Gate 01 authority names M12 **Workspace Management & Manager Functions**. An older implementation plan says Journal / Notes; the Gate 01 milestone train is authoritative here.
