# JobQuest 2.0 — Milestone 2 Next Agent Handoff

## 1. Current Phase & Milestone Result
- **Completed Milestone:** Milestone 2 (Design System & Application Shell)
- **Status:** **COMPLETE & FULLY VERIFIED**
- **Next Approved Milestone:** **MILESTONE 3 — APPLICATIONS WORKFLOW & DATA GRID**

---

## 2. Git & Repository Baseline
- **Current Branch:** `feature/m2-design-system`
- **Base Commit in `development`:** `b3295a3` (`merge: approve M1B Option B authentication foundation`)
- **Main Branch State:** `main` is protected and UNTOUCHED. Do not merge to main.
- **Legacy JobQuest 1.0:** Directory `../JobQuest1.0/` remains strictly READ ONLY. Never modify it.

---

## 3. Architecture & Infrastructure State
- **Authentication Architecture:** **OPTION B** (App-owned authentication, custom ES256 JWTs signed with `JQ_JWT_PRIVATE_JWK`, Argon2id password hashing, single-use recovery codes, HttpOnly session refresh cookies). Supabase Auth (GoTrue) is permanently superseded and NOT in use.
- **Hosted Supabase Project:**
  - Project Reference: `xpnkasclquplmrcmhsif` (`jobquest-dev` in `us-east-1`).
  - Schema: 11 foundation tables (`auth_identities`, `auth_sessions`, `auth_recovery_codes`, `auth_rate_limits`, `workspaces`, `workspace_members`, `workflow_definitions`, `applications`, `contacts`, `interviews`, `tasks`).
  - Signing Keys: Public ES256 key registered in Supabase dashboard. Do not rotate or modify without authorization.
- **Vercel Project & Deployment:**
  - Account: `goutamkrapa11-8565`
  - Team: `one-piece-5779` (OnePiece)
  - Project Name: `jobquest2` (linked)
  - Active Preview URL: `https://jobquest2-ltdqwm6m5-one-piece-5779.vercel.app`
  - Target: Preview only (no production releases).
  - Serverless API: Hono Node runtime deployed to `/api/*` on Vercel Functions.

---

## 4. Frontend & Component Architecture
- **Location:** `apps/web/src/`
- **Tokens:** `styles/tokens.css` (semantic variables for canvas, surfaces, text, border, accent, statuses).
- **Themes:** `ThemeContext.tsx` supports `system` (default), `light`, and `dark`. Anti-FOUC is handled via `src/theme-init.ts`.
- **Reusable Primitives (`components/ui/`):** Button, IconButton, Input, Textarea, Select, Checkbox, Switch, StatusBadge, Card, Table, Dialog (focus trap/Esc/return), Drawer, Toast, Tabs, Dropdown, Avatar, Skeleton, EmptyState, InlineEdit, FormField, StagePips, PriorityBars, ThemeToggle.
- **Application Shell (`components/shell/`):**
  - Mobile (<768px): Header + 78px bottom navigation bar with 5 touch tabs (>=44x44px).
  - Tablet (768–1023px): 64px auto-collapsing icon rail.
  - Desktop (1024–1679px): 240px persistent grouped sidebar.
  - Wide Desktop (>=1680px): Canvas accommodating right persistent preview rail.
  - Quick Shortcuts: `/` opens Search Command Palette, `q` opens Quick Add Application.
- **Component Showcase Route:** `/#/design-system` allows visual inspection and headless test verification.

---

## 5. Verification & Test Summary
All quality gates are passing:
- `pnpm lint`: PASS (0 warnings, 0 errors)
- `pnpm typecheck`: PASS (0 errors across monorepo)
- `pnpm test:unit`: PASS (7 files, 41 tests passing in 0.95s)
- `pnpm build`: PASS (Vite production bundle generated cleanly)
- `pnpm check:bundle`: PASS (0 secrets in browser bundle)
- `pnpm check:secrets`: PASS (0 secrets in tracked repository files)
- `playwright test`: PASS (6/6 tests passing against live Vercel Preview):
  - `e2e/capture-m2-screenshots.spec.ts`: PASS (10 baseline PNGs in `migration-upgrade/m2/screenshots/`)
  - `e2e/leak.spec.ts`: PASS (Option B auth, direct PostgREST, RLS own-row/peer-row, no leaks)
  - `e2e/m2-shell.spec.ts`: PASS (Direction D cards, responsive transformations, dialogs, drawers, tabs, toasts, and axe-core accessibility audit with 0 critical/serious violations)

---

## 6. Files Next Agent Must Read First
Before beginning work on Milestone 3:
1. `migration-upgrade/m2/M2_COMPLETION_REPORT.md` (Formal Milestone 2 report)
2. `migration-upgrade/m2/M2_VISUAL_REGRESSION.md` (Visual baseline and viewport matrix)
3. `migration-upgrade/m2/M2_INFRASTRUCTURE.md` (Vercel and Supabase infrastructure state)
4. `migration-upgrade/docs/IMPLEMENTATION_PLAN.md` (Milestone 3 scope and deliverables)
5. `migration-upgrade/ui-design/specs/GATE_02B_DESIGN_BACKLOG.md` (Applications table and preview rail specs)

---

## 7. Branch & Merge Instructions
- When user formally approves M2:
  1. Merge `feature/m2-design-system` into `development` using `--no-ff`.
  2. Push updated `development` to `origin`.
  3. Branch `feature/m3-applications` from updated `development`.
- Never work directly on `development`.
- Never merge to `main`.

---

## 8. Safety Boundaries & Prohibitions
- **DO NOT** restart architecture discovery or reopen Option A vs Option B.
- **DO NOT** modify or commit signing keys (`signing_keys.json`, `*.jwk`, `*.key`, `*.pem`).
- **DO NOT** commit `.env` or `.env.local` files.
- **DO NOT** expose server secrets (`JQ_JWT_PRIVATE_JWK`, `SUPABASE_SECRET_KEY`) with `VITE_` prefix.
- **DO NOT** create a Vercel production release.
- **DO NOT** create a production Supabase project.
- **DO NOT** touch `../JobQuest1.0/`.

---

## 9. Ready-to-Copy Next-Agent Prompt

```markdown
Resume JobQuest 2.0 development following the approved Milestone 2 completion.

Milestone 2 (Design System, App Shell, and Vercel Preview) is COMPLETE.
Selected Auth Architecture: OPTION B (App-owned auth, custom JWT, hosted Supabase jobquest-dev).
Current Branch: feature/m2-design-system (or newly branched feature/m3-applications from development upon user approval).

Before starting, read:
1. migration-upgrade/m2/NEXT_AGENT_HANDOFF.md
2. migration-upgrade/m2/M2_COMPLETION_REPORT.md
3. migration-upgrade/m2/M2_INFRASTRUCTURE.md
4. migration-upgrade/docs/IMPLEMENTATION_PLAN.md

The next approved milestone is:
MILESTONE 3 — APPLICATIONS WORKFLOW & DATA GRID

Safety rules:
- NEVER touch ../JobQuest1.0/
- NEVER merge to main
- NEVER expose JQ_JWT_PRIVATE_JWK or SUPABASE_SECRET_KEY to the browser
- Always verify all tests (lint, typecheck, unit, e2e, secret scan) pass before declaring completion.
```
