# Milestone 2 (M2) → Next Agent Handoff

This document equips the next agent (Claude Code, Antigravity, Codex, etc.) to execute Milestone 2 (Design System & App Shell) without requiring prior conversational context.

---

## 1. Current State & Transition Context

| Dimension | Current State | Notes |
|---|---|---|
| **Repository** | `KrapaGoutam/JobQuest2.0` | Active Git repository |
| **Legacy Codebase** | `../JobQuest1.0/` | **STRICTLY READ ONLY**. Never modify or link directly |
| **Preceding Milestones** | M0, M1, M1B | **100% COMPLETE & APPROVED** |
| **Auth Architecture** | Option B Approved | Node-owned auth + Argon2id + 15m ES256 JWTs + Direct Data API |
| **Database State** | 11 Baseline Tables | Migrated on `jobquest-dev` (`xpnkasclquplmrcmhsif`); 0 auth users |
| **Integration Branch** | `development` | Updated with merge commit `b3295a3` |
| **Active Feature Branch** | `feature/m2-design-system` | Dedicated branch for Milestone 2 execution |
| **Protected Branch** | `main` | **STRICTLY PROTECTED**. Never merge to `main` |

---

## 2. Milestone 2 Mission

Implement the Gate 02B-approved **Direction D · JobQuest Hybrid** design system across reusable React components, establish strict WCAG 2.2 AA accessibility in light and dark modes, build the responsive application shell with persistent navigation, and initialize the Vercel development preview environment.

**Do NOT implement live data-bound pages** (Applications, Interviews, Contacts, Tasks). Those depend on M2's components and are delivered in M4–M9.

---

## 3. Documents to Read (In Order)

1. [`migration-upgrade/m2/README.md`](README.md) — Overview and scope
2. [`migration-upgrade/m2/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) — Phase-by-phase implementation plan
3. [`migration-upgrade/m2/TEST_PLAN.md`](TEST_PLAN.md) — Test matrix and verification commands
4. [`migration-upgrade/m2/ACCEPTANCE_CRITERIA.md`](ACCEPTANCE_CRITERIA.md) — Definition of Done
5. [`migration-upgrade/ui-design/gate-02b/GATE_02B_UI_SPEC.md`](../ui-design/gate-02b/GATE_02B_UI_SPEC.md) — Direction D design specifications
6. [`migration-upgrade/ui-design/gate-02b/mockups/`](../ui-design/gate-02b/mockups/) — Interactive HTML mockups for visual reference

---

## 4. Implementation Steps for Next Agent

### Step 1: Design Tokens & Typography
- Configure `apps/web/src/styles/tokens.css` with Gate 02B Direction D CSS variables.
- Configure Inter and Plus Jakarta Sans fonts in `apps/web/index.html` and Tailwind/CSS.
- Build `apps/web/src/context/ThemeContext.tsx` (`system`, `light`, `dark` with `localStorage` persistence).
- Add anti-FOUC inline script in `apps/web/index.html`.

### Step 2: Base Primitive Components (`apps/web/src/components/ui/`)
- `Button.tsx`: Variants, sizes, loading state with spinner.
- `Input.tsx` and `Select.tsx`: Accessible labels, hints, error messages, icon slots.
- `StatusBadge.tsx`: Stage and outcome pills with calibrated semantic colors.
- `Tabs.tsx`: Genuine ARIA tablist/tab/tabpanel with arrow key switching (CR-003).
- `InlineEdit.tsx`: Click-to-edit inline component replacing `window.prompt()` (CR-002).
- `Dialog.tsx` and `Drawer.tsx`: Accessible modal dialogs with focus trapping and Escape handling.
- `Toast.tsx`: CSP-compliant notifications with `role="status"`.
- `DataTable.tsx`: Shell with column headers, sort indicators, and skeleton loaders.
- `EmptyState.tsx` and `ErrorState.tsx`: Reusable fallback cards.

### Step 3: Application Shell (`apps/web/src/components/shell/`)
- `Sidebar.tsx`: Desktop navigation with active highlights and grouped links (fixing CR-004).
- `Topbar.tsx`: Header with search trigger (`/`), quick-add trigger (`q`), theme toggle, and workspace selector.
- `WorkspaceSwitcher.tsx`: Personal vs Team workspace badge and accessible selector.
- `MobileNav.tsx`: Hamburger trigger and slide-in drawer for viewports <768px.
- `AppShell.tsx`: Master responsive wrapper binding the shell together.

### Step 4: Component Showcase & Testing
- Create `/design-system` showcase route displaying all components and states.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`.
- Run Axe accessibility test suite (asserting 0 violations).

### Step 5: Vercel Preview Deployment
- Authenticate Vercel CLI: `npx vercel whoami` (team `one-piece-5779`).
- Run `npx vercel link` to link `jobquest2` preview project.
- Set Preview environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Never expose private keys.
- Deploy preview with `npx vercel`.
- Smoke test preview URL in Chromium.

### Step 6: Closeout & Reports
- Author `migration-upgrade/m2/M2_COMPLETION_REPORT.md`.
- Update `migration-upgrade/m2/NEXT_AGENT_HANDOFF.md` for Milestone 3 (Full Schema Migration).

---

## 5. Ready-to-Copy Next-Agent Prompt

```markdown
You are continuing JobQuest 2.0 (repo KrapaGoutam/JobQuest2.0) on branch feature/m2-design-system.
../JobQuest1.0/ is STRICTLY READ ONLY. Never modify or link directly to it.

Read, in order:
1. migration-upgrade/m2/README.md
2. migration-upgrade/m2/IMPLEMENTATION_PLAN.md
3. migration-upgrade/m2/TEST_PLAN.md
4. migration-upgrade/m2/ACCEPTANCE_CRITERIA.md
5. migration-upgrade/ui-design/gate-02b/GATE_02B_UI_SPEC.md

Current State:
- M1/M1B: COMPLETE & APPROVED. Merged to development.
- Branch: feature/m2-design-system (branched from updated development).
- Backend: Supabase dev project jobquest-dev (xpnkasclquplmrcmhsif) active with 11 foundational tables.
- Frontend: React + Vite SPA in apps/web.

Task:
Implement Milestone 2 (Design System & App Shell) per migration-upgrade/m2/IMPLEMENTATION_PLAN.md:
1. Configure Direction D design tokens, fonts, and theme engine.
2. Build base components (Button, Input, Select, StatusBadge, Tabs [CR-003], InlineEdit [CR-002], Dialog, Drawer, Toast, DataTable, EmptyState).
3. Build responsive App Shell (Sidebar, Topbar, WorkspaceSwitcher, MobileNav).
4. Run static, unit, and Axe accessibility audits (0 violations).
5. Initialize Vercel Preview project on team one-piece-5779 and deploy preview.
6. Publish M2 completion report and handoff.

Do NOT implement data-bound business pages.
Do NOT modify database schema.
Do NOT merge to main.
```
