# Milestone 2 (M2): Acceptance Criteria

**Document ID:** `JQ2-M2-AC-001`  
**Milestone:** `M2 — Design System & App Shell`  
**Status:** `PLANNED`  

---

## 1. Acceptance Criteria Checklist

To achieve formal approval and merge into `development`, Milestone 2 must satisfy all 10 criteria below:

### AC-01: Direction D Design Tokens Implemented
- [ ] Semantic tokens defined in CSS for colors, typography, spacing, radius, and shadows.
- [ ] Font pairing (Inter for UI body, Plus Jakarta Sans for headings and numerical badges) loaded and configured cleanly.
- [ ] Dark mode palette calibrated to avoid pure pitch black (`#000000`), using subtle elevated slate/zinc surfaces.
- [ ] Zero un-tokenized raw color literals in application CSS.

### AC-02: Theme Switcher & Persistence
- [ ] Supports `'system'`, `'light'`, and `'dark'`.
- [ ] User choice is persisted in `localStorage`.
- [ ] Inline script prevents Flash of Unstyled Content (FOUC) on hard refresh.

### AC-03: Base Component Library
- [ ] `Button` supports primary, secondary, outline, ghost, destructive, link variants, and loading spinner state.
- [ ] `Input` and `Select` provide accessible label, hint, error, and icon slots.
- [ ] `StatusBadge` correctly renders all pipeline stages and terminal outcomes with semantic colors.
- [ ] `Tabs` implements genuine ARIA tablist/tab/tabpanel markup with keyboard arrow switching (resolving CR-003).
- [ ] `InlineEdit` provides an accessible, keyboard-operable click-to-edit form (resolving CR-002, eliminating `window.prompt()`).
- [ ] `Dialog` and `Drawer` provide reliable focus trapping, `aria-modal="true"`, background scroll lock, and Escape key dismissal.
- [ ] `Toast` notifications trigger cleanly with `role="status"` under strict CSP.
- [ ] `DataTable` shell provides sort indicators, selection state, and pagination markup.
- [ ] `EmptyState` and `ErrorState` components are available for reuse across future data pages.

### AC-04: Responsive Navigation Shell
- [ ] Desktop (≥1024px): Persistent Sidebar with grouped navigation (fixing CR-004 orphaned items).
- [ ] Mobile (<768px): Topbar with hamburger trigger opening slide-in Mobile Drawer.
- [ ] Wide Desktop (≥1680px): Layout scales cleanly without awkward content stretching.
- [ ] Zero horizontal overflow (`overflow-x: hidden` / no horizontal scrollbars) on any viewport down to 320px width.

### AC-05: Workspace Switcher UI
- [ ] Topbar displays active workspace indicator with clear distinction between Personal and Team workspaces.
- [ ] Dropdown menu allows accessible keyboard navigation between available workspaces.

### AC-06: Global Keyboard Navigation
- [ ] `/`: Focuses search input.
- [ ] `q`: Opens quick-add action modal.
- [ ] `g d`: Navigates to Dashboard.
- [ ] `g a`: Navigates to Applications.
- [ ] `Escape`: Dismisses open modals, drawers, and menus.

### AC-07: Accessibility (WCAG 2.2 AA)
- [ ] Automated scan with `@axe-core/playwright` yields **0 violations** across all components in both Light and Dark themes.
- [ ] Color contrast ratio meets or exceeds 4.5:1 for normal text and 3.0:1 for large text/badges.
- [ ] All interactive elements provide visible, high-contrast focus rings (`:focus-visible`).
- [ ] Minimum tap target size of 44×44px maintained for mobile touch controls.

### AC-08: Code Quality & Test Coverage
- [ ] `pnpm lint`: 0 errors, 0 warnings.
- [ ] `pnpm typecheck`: 0 errors across all monorepo packages.
- [ ] `pnpm test:unit`: Component unit and interaction tests all pass.
- [ ] `pnpm build`: Production build generates cleanly without bundle size warnings.

### AC-09: Secret & Bundle Hygiene
- [ ] `pnpm check:bundle`: 0 secrets, 0 private keys, 0 service-role strings in client assets.
- [ ] `pnpm check:secrets`: 0 tracked secrets detected across the codebase.

### AC-10: Vercel Development Preview
- [ ] Project initialized on Vercel team `one-piece-5779` for JobQuest 2.0.
- [ ] Development/Preview environment variables configured with publishable keys only.
- [ ] Non-production Preview deployment successfully deployed and verified.
- [ ] Zero production deployments created.
