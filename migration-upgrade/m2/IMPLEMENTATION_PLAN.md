# Milestone 2 (M2): Implementation Plan
## Design System, Themed Base Components & Responsive App Shell

**Document ID:** `JQ2-M2-PLAN-001`  
**Milestone:** `M2`  
**Status:** `PLANNED`  
**Base:** `development` (commit `b3295a3`)  
**Branch:** `feature/m2-design-system`  

---

## 1. Objectives & Scope Boundaries

### Primary Objectives:
1. **Design Tokens & Theme Engine:** Implement the Gate 02B Direction D design tokens (colors, typography, spacing, radius, elevations) supporting `system`, `light`, and `dark` themes with persistent user preferences and zero theme-switch flash.
2. **Base Component Library:** Author high-quality, accessible, keyboard-operable themed primitive components (Button, Input, Select, StatusBadge, DataTable shell, Dialog, Drawer, Toast, Tabs per CR-003, InlineEdit per CR-002, EmptyState, ErrorState).
3. **Responsive Application Shell:** Build the master desktop Sidebar, Topbar with user profile chip and Workspace Switcher, and Mobile Drawer with 4-viewport responsiveness (Mobile <768px, Tablet 768–1024px, Desktop 1024–1680px, Wide Desktop ≥1680px).
4. **Keyboard & Accessibility Infrastructure:** Wire global keyboard shortcuts (`/` search, `q` quick add, `g d` dashboard, `g a` applications, `Escape` close/dismiss) with zero horizontal overflow and 100% WCAG 2.2 AA compliance.
5. **Component Showcase & Visual Baseline:** Create an internal component showcase/kitchen-sink route (`/design-system` or similar harness) for automated Axe a11y scans and Playwright visual snapshot baselines.
6. **Vercel Development Preview:** Initialize the Vercel project on team `one-piece-5779` for `JobQuest2.0` development/preview deployments.

### Strict Non-Goals (Exclusions from M2):
- **No Data-Bound Business Pages:** No live application CRUD, Kanban boards, interviews, contacts, tasks, or resume uploaders. (Reserved for M4–M9).
- **No Database Schema Migrations:** Database remains strictly at the 11 foundational tables proven in M1/M1B. Full schema authoring is scheduled for M3.
- **No Backend Endpoint or RPC Changes:** Existing `/api/auth/*` and `/api/workflow` endpoints remain untouched.
- **No Browser Extension Functional Code:** Extension popup may consume shared CSS token variables for styling consistency, but functional extension porting is deferred to M11.
- **No Legacy Data Migration:** Legacy database copy/rehearsal is deferred to M14 / M19.
- **No Production Deployments:** Zero production infrastructure or production domain bindings.

---

## 2. Dependencies & Prerequisites

- **Predecessor Milestones:** M0 (Documentation baseline), M1/M1B (Backend architecture, Option B auth foundation, direct PostgREST RLS).
- **Gate Sign-off:** Gate 02B (UI/UX Direction D approval), Gate 03 (Database/RLS approval with Option B amendment).
- **Tooling:** React 19 / Vite 6 SPA, TypeScript 5.8, Tailwind CSS v4 / Vanilla CSS tokens, Lucide React icons, Radix UI / headless primitives, Vitest, Playwright, `@axe-core/playwright`.

---

## 3. Architecture & Technical Design

### 3.1 Design Tokens (`apps/web/src/styles/tokens.css`)
- **Color Palette (Direction D):**
  - Primary Brand: Modern deep indigo / slate blue (`--color-brand-50` through `--color-brand-900`)
  - Neutrals: Crisp slate / zinc neutrals calibrated for high contrast
  - Semantic Status:
    - Applied / Active: Blue
    - Screening / Interview: Amber / Purple
    - Offer / Accepted: Emerald / Green
    - Rejected: Slate / Neutral
    - Ghosted / Stale: Orange / Muted Zinc
    - Withdrawn: Neutral Gray
- **Typography:** Inter (body text), Plus Jakarta Sans (headings, numerical badges).
- **Spacing & Elevation:** 4px grid system, calibrated elevation shadows for popovers, drawers, and modal surfaces.

### 3.2 Theme Management (`apps/web/src/context/ThemeContext.tsx`)
- Supports `'system' | 'light' | 'dark'`.
- Persists to `localStorage` and optionally syncs with `profiles.theme_preference`.
- Inline head script in `index.html` prevents Flash of Unstyled Content (FOUC).

### 3.3 Base Component Specifications
1. **Button:** Primary, secondary, outline, ghost, destructive, link variants; loading and disabled states; explicit tap target (min 44×44px on mobile).
2. **Input & Select:** Label, hint text, error message, leading/trailing icon slots, accessible `aria-invalid` and `aria-describedby` wiring.
3. **StatusBadge:** Renders pipeline stages and outcomes with calibrated contrast colors.
4. **Tabs (CR-003):** True ARIA `role="tablist"`, `role="tab"`, `role="tabpanel"` switching with keyboard arrow navigation.
5. **InlineEdit (CR-002):** Reusable click-to-edit component with Save/Cancel controls, replacing legacy `window.prompt()`.
6. **Dialog & Drawer:** Focus trapping, `aria-modal="true"`, background scroll lock, Escape key dismissal.
7. **Toast:** Non-blocking status messages (`role="status"`), strict Content Security Policy compliance (no runtime dynamic `<style>` injection).
8. **DataTable Shell:** Column headers with sort indicators, row selection, pagination controls, skeleton loading states.
9. **EmptyState & ErrorState:** Reusable zero-data and API failure presentation cards with actionable primary buttons.

### 3.4 Application Shell Structure (`apps/web/src/components/shell/`)
- **Desktop Sidebar:** Collapsible, grouped navigation items (fixing CR-004 orphaned items), active item highlight, keyboard shortcut hints.
- **Topbar:** Breadcrumb trail, global search trigger (`/`), Quick-add trigger (`q`), Theme toggle, Workspace Switcher, User profile menu.
- **Workspace Switcher:** Displays active personal or team workspace context with badge; accessible dropdown selector.
- **Mobile Drawer:** Slide-in navigation drawer for viewports <768px with full touch and keyboard accessibility.

---

## 4. Phase-by-Phase Execution Plan

### Phase 1: Token Engine & Typography
- Configure CSS variables and semantic tokens in `apps/web/src/styles/tokens.css`.
- Integrate Google Fonts (Inter + Plus Jakarta Sans).
- Implement `ThemeProvider` and theme switcher component.
- Verify color contrast ratios in both light and dark modes against WCAG 2.2 AA.

### Phase 2: Primitive Form & UI Components
- Build `Button`, `Input`, `Select`, `StatusBadge`, `Card`.
- Build `Tabs` (resolving CR-003 with proper ARIA attributes).
- Build `InlineEdit` (resolving CR-002).
- Unit and component tests for all primitives using Vitest + React Testing Library.

### Phase 3: Overlay & Feedback Components
- Build `Dialog`, `Drawer`, `Toast`, `EmptyState`, `ErrorState`.
- Verify CSP compliance for toasts (ensure no inline style violations).
- Test focus trapping and Escape key management.

### Phase 4: Application Shell & Navigation
- Build `Sidebar`, `Topbar`, `MobileNav`, `WorkspaceSwitcher`.
- Implement global keyboard shortcuts listener (`/`, `q`, `g d`, `g a`, `Escape`).
- Ensure layout adapts smoothly across the 4 standard viewports (Mobile, Tablet, Desktop, Wide).

### Phase 5: Component Showcase Route & A11y Audit
- Stand up `/design-system` route displaying all components in all states.
- Run `@axe-core/playwright` across the showcase in both light and dark themes.
- Generate baseline Playwright visual snapshot artifacts.

### Phase 6: Vercel Preview Deployment
- Run `npx vercel link` to create `jobquest2` preview project under team `one-piece-5779`.
- Configure Development and Preview environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- Deploy a non-production Preview deployment.
- Verify browser rendering, theme switching, and network traffic against the Preview URL.

---

## 5. Security & CSP Requirements

- **No Secret Leakage:** Vercel environment variables for the frontend must NEVER include `SUPABASE_SERVICE_ROLE_KEY` or `JQ_JWT_PRIVATE_JWK`.
- **Strict Content Security Policy:**
  ```
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'none'; form-action 'self'
  ```
- **Automated Scanning:** Every commit must pass `pnpm check:bundle` and `pnpm check:secrets`.

---

## 6. Definition of Done (DoD)

Milestone 2 is considered complete only when:
1. All Gate 02B Direction D tokens are implemented and documented.
2. All 11 base components are implemented with 100% TypeScript type safety.
3. The responsive App Shell renders correctly across Mobile, Tablet, Desktop, and Wide viewports with zero horizontal scrollbars.
4. Axe accessibility audit passes with **0 violations** across all components in both light and dark themes.
5. Keyboard navigation functions smoothly per specifications.
6. Local test suite passes: lint, typecheck, component tests, build, bundle scan, secret scan.
7. Vercel Preview is deployed and validated in real browsers.
8. M2 Completion Report (`migration-upgrade/m2/M2_COMPLETION_REPORT.md`) and Next Agent Handoff (`migration-upgrade/m2/NEXT_AGENT_HANDOFF.md`) are published.
