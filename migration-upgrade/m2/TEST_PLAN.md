# Milestone 2 (M2): Test Plan
## Design System & App Shell Quality & Verification Matrix

**Document ID:** `JQ2-M2-TEST-001`  
**Milestone:** `M2`  
**Status:** `PLANNED`  

---

## 1. Test Strategy Overview

Milestone 2 tests verify the visual, structural, accessible, and behavioral correctness of the Direction D design system and the application shell without requiring backend data mutations.

### Testing Layers:
1. **Static Analysis:** ESLint, TypeScript compiler (`tsc --noEmit`), Prettier/formatting.
2. **Component Unit & Interaction Tests:** Vitest + React Testing Library (render tests, state management, keyboard events, ARIA attributes).
3. **Automated Accessibility Testing:** `@axe-core/playwright` scanning all components and shell layouts in both Light and Dark themes (zero violations allowed).
4. **Visual Regression & Layout:** Playwright snapshot comparison across 4 viewports (375px, 768px, 1280px, 1920px).
5. **Security & Bundle Scans:** `pnpm check:bundle` (for secrets or unapproved external dependencies) and `pnpm check:secrets`.
6. **Vercel Preview Validation:** Live browser smoke check against the Vercel Preview URL.

---

## 2. Test Matrix

| ID | Test Category | Specific Assertion | Expected Result | Pass Criteria |
|---|---|---|---|---|
| **M2-T01** | **Token Contrast (Light)** | Measure color contrast of all text/badge tokens on light backgrounds | Contrast ratio ≥ 4.5:1 (normal text) and ≥ 3.0:1 (large text/badges) | WCAG 2.2 AA pass |
| **M2-T02** | **Token Contrast (Dark)** | Measure color contrast of all text/badge tokens on dark backgrounds | Contrast ratio ≥ 4.5:1 (normal text) and ≥ 3.0:1 (large text/badges) | WCAG 2.2 AA pass |
| **M2-T03** | **Theme Toggle & Persistence** | Toggle between light, dark, and system modes; reload page | HTML root receives correct `dark` class; choice persists in `localStorage`; zero flash | Instant mode change, persistent state |
| **M2-T04** | **Button Component** | Test variants (primary, secondary, outline, ghost, destructive), sizes, and loading state | Correct class composition; spinner renders when loading; button disabled | All variants pass interaction tests |
| **M2-T05** | **Input & Select Components** | Render inputs with labels, errors, and hints; trigger input change | Proper `aria-invalid`, `aria-describedby` association; errors visible | Accessible form controls |
| **M2-T06** | **Tabs Component (CR-003)** | Navigate tabs via keyboard Arrow Left/Right; click tab | Active tab changes; `aria-selected` updates; corresponding `tabpanel` displays | Real ARIA tabs, zero orphan tabs |
| **M2-T07** | **InlineEdit Component (CR-002)** | Click text to activate edit mode; type value; press Enter or Save; press Escape or Cancel | Value updates on save; reverts on cancel; accessible input focus | Replaces `window.prompt()` cleanly |
| **M2-T08** | **Dialog & Modal Focus Trapping** | Open dialog; tab through interactive elements; press Escape | Focus stays trapped inside dialog; Escape closes dialog; focus restores to trigger | Focus trap and restore verified |
| **M2-T09** | **Drawer Navigation** | Open drawer; verify slide-in animation; check outside click | Drawer opens smoothly; background overlay locks scroll; outside click dismisses | Smooth dismissible drawer |
| **M2-T10** | **Toast Notifications** | Trigger success and error toasts; inspect DOM for CSP compliance | Toast renders with `role="status"`; dismissible; zero dynamic `<style>` tag injection | CSP-compliant notifications |
| **M2-T11** | **App Shell Navigation (Desktop)** | View at 1280px viewport; navigate sidebar links; check workspace badge | Sidebar visible; active route highlighted; workspace selector accessible | Clean desktop desktop layout |
| **M2-T12** | **App Shell Navigation (Mobile)** | View at 375px viewport; open hamburger menu; navigate link | Topbar visible with hamburger; drawer slides in; zero horizontal overflow | Zero horizontal scrollbar on mobile |
| **M2-T13** | **Global Keyboard Shortcuts** | Press `/`, `q`, `g d`, `g a`, `Escape` across various routes | Focus moves to search input; quick-add opens; navigation routes trigger | Reliable keyboard navigation |
| **M2-T14** | **Axe Accessibility Audit (All)** | Run `@axe-core/playwright` across the component showcase in both themes | 0 critical, 0 serious, 0 moderate violations | Clean accessibility score |
| **M2-T15** | **Bundle & Secret Hygiene** | Execute `pnpm check:bundle` and `pnpm check:secrets` | 0 secrets or sensitive tokens in built assets; bundle within budget (<250kB initial JS) | Clean security scan |
| **M2-T16** | **Vercel Preview Smoke Check** | Load Vercel Preview URL; verify theme toggle, responsive layout, and headers | Page loads with HTTP 200; CSP headers present; zero console errors | Preview deployed & verified |

---

## 3. Tooling & Test Execution Commands

```powershell
# 1. Static code analysis
pnpm lint
pnpm typecheck

# 2. Unit and component tests
pnpm test:unit

# 3. Accessibility & visual tests
pnpm test:e2e:a11y

# 4. Production build & security scans
pnpm build
pnpm check:bundle
pnpm check:secrets
```
