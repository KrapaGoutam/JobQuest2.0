# Milestone 2 — Implementation Notes

## 1. Overview
Milestone 2 establishes the production-grade Design System, responsive Application Shell, and initial Vercel Preview deployment for JobQuest 2.0 based on the approved Gate 02B Direction D (JobQuest Hybrid) specification and the approved M1/M1B Option B authentication foundation.

## 2. Frontend Structure
The frontend application is built in `apps/web` with Vite, React 19, and TypeScript, styled with Vanilla CSS tokens and scoped utility classes matching `jq.css`.

Directory structure:
```
apps/web/src/
├── components/
│   ├── shell/
│   │   ├── AppShell.tsx           # Coordinates Sidebar, Topbar, Canvas, MobileNav, Search, Quick Add
│   │   ├── MobileNav.tsx          # Mobile header + bottom 5-tab bar (>=44px touch targets)
│   │   ├── Sidebar.tsx            # Desktop sidebar (240px) / Tablet rail (64px) with grouped nav
│   │   ├── Topbar.tsx             # 52px header with breadcrumbs, role badge, search, user menu
│   │   └── WorkspaceSwitcher.tsx  # Workspace pill, dropdown switcher, create workspace modal
│   └── ui/
│       ├── Avatar.tsx             # Initials avatar with sizes sm/md/lg
│       ├── Button.tsx             # Primary, secondary, outline, ghost, danger variants
│       ├── Card.tsx               # Card, CardHeader, CardTitle, CardBody, CardBand
│       ├── Checkbox.tsx           # Accessible checkbox with indeterminate support
│       ├── Dialog.tsx             # Modal dialog with focus trap, Esc, focus return
│       ├── Drawer.tsx             # Slide-in drawer (desktop) / bottom sheet (mobile)
│       ├── Dropdown.tsx           # Accessible dropdown menu (role="menu")
│       ├── EmptyState.tsx         # Clean icon, title, description, and action slot
│       ├── FormField.tsx          # Unified form label, input, help text, error message
│       ├── IconButton.tsx         # 44x44 / 36x36 touch target button with aria-label
│       ├── InlineEdit.tsx         # Click/Enter to edit, Esc to cancel, tick to save
│       ├── Input.tsx              # Text, email, password inputs with icon slots
│       ├── PriorityBars.tsx       # 3-bar visual priority indicator (low, medium, high)
│       ├── Select.tsx             # Styled select with chevron icon
│       ├── Skeleton.tsx           # Shimmer loading primitive
│       ├── StagePips.tsx          # 5-step pip progress for job pipeline stages
│       ├── StatusBadge.tsx        # Stage badges (applied, interview, offer) & counters
│       ├── Switch.tsx             # Accessible toggle switch (role="switch")
│       ├── Table.tsx              # 44px rows, sort headers, skeleton, empty states
│       ├── Tabs.tsx               # ARIA tablist with keyboard arrow navigation
│       ├── Textarea.tsx           # Auto-resizing textarea primitive
│       ├── ThemeToggle.tsx        # Segmented radio group (System, Light, Dark)
│       └── Toast.tsx              # Animated auto-dismiss notification toast
├── context/
│   ├── ThemeContext.tsx           # Theme resolution, system listener, localStorage
│   ├── ToastContext.tsx           # Imperative toast trigger (success, info, warning, error)
│   └── WorkspaceContext.tsx       # Active workspace state, roles, RPC workspace creation
├── styles/
│   ├── globals.css                # CSS reset, accessibility focus rings, layout utilities
│   └── tokens.css                 # Semantic HSL/hex design tokens and dark mode overrides
├── views/
│   ├── ApplicationsView.tsx       # Full M1B applications domain CRUD & security check fixture
│   ├── AuthView.tsx               # Direction D Register, Sign In, and Recover forms
│   ├── DesignSystemShowcase.tsx   # Comprehensive visual & interactive component fixture
│   └── PlaceholderView.tsx        # Standard placeholder for future module routes
├── App.tsx                        # Root layout, routing, M1B state reflection, auth gate
├── main.tsx                       # React DOM entry point
├── supabase.ts                    # Direct PostgREST client for Data API
├── theme-init.ts                  # Anti-FOUC synchronous theme initializer
└── vite-env.d.ts                  # TypeScript definitions
```

## 3. Design Token Architecture (`tokens.css`)
Semantic tokens avoid hardcoded color values:
- **Canvas & Surfaces:** `--color-canvas`, `--color-sidebar`, `--color-surface-1`, `--color-surface-2`, `--color-surface-3`
- **Text & Hierarchy:** `--color-text` (#0f172a / #f8fafc), `--color-text-muted` (#5f6b7e / #94a3b8), `--color-border` (#e2e8f0 / #334155)
- **Brand Accent:** `--color-accent` (#3157d5 / #6366f1), `--color-accent-soft`, `--color-accent-hover`
- **Status Semantics:**
  - Success: `--color-success` (#10b981), `--color-success-soft`
  - Warning: `--color-warning` (#f59e0b), `--color-warning-soft`
  - Danger: `--color-danger` (#ef4444), `--color-danger-soft`
  - Info: `--color-info` (#0284c7), `--color-info-soft`
- **Typography:**
  - Font families: Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif
  - Monospace: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace
  - Scale: `--font-size-xs` (11px), `--font-size-sm` (12px), `--font-size-md` (14px), `--font-size-lg` (16px), `--font-size-xl` (18px), `--font-size-2xl` (22px), `--font-size-3xl` (28px)
- **Layout & Metrics:**
  - Header height: `--header-height: 52px`
  - Desktop sidebar: `--sidebar-width: 240px`
  - Tablet rail: `--sidebar-collapsed-width: 64px`
  - Mobile bottom navigation: `--bottom-nav-height: 78px`
  - Border radii: `--radius-sm` (4px), `--radius-md` (6px), `--radius-lg` (8px), `--radius-xl` (12px), `--radius-full` (9999px)

## 4. Theme System
- **Supported Modes:** System (default), Light (fallback), Dark.
- **Persistence:** LocalStorage key `'jobquest-theme'`.
- **System Synchronization:** `window.matchMedia('(prefers-color-scheme: dark)')` listener dynamically recalculates dark mode when system preferences change while set to `'system'`.
- **Anti-FOUC:** `src/theme-init.ts` executes synchronously before React mount to read the stored preference and set `data-theme="dark"` or `"light"` on the root document element.

## 5. Responsive Application Shell
Breakpoints adhere to Gate 02B:
- **Mobile (<768px):** Compact topbar with brand icon, hamburger menu, and 78px fixed bottom navigation bar (Today, Apps, Tasks, Contacts, More). All touch targets exceed 44x44px.
- **Tablet (768px – 1023px):** Auto-collapsing 64px icon rail. Navigation tooltips expand on hover.
- **Desktop (1024px – 1679px):** Persistent 240px grouped sidebar with primary links, utility links, user profile menu, and "+ New application" quick add action.
- **Wide Desktop (>=1680px):** Expanded main canvas with permanent preview rail accommodation (docked right inspector panel).

## 6. Routing & Navigation
- Hash-based navigation (`/#/applications`, `/#/dashboard`, `/#/tasks`, `/#/interviews`, `/#/contacts`, `/#/analytics`, `/#/habits`, `/#/resumes`, `/#/workspace`, `/#/settings`, `/#/design-system`).
- Unauthenticated visitors are automatically directed to `AuthView` (Sign In / Register / Recover).
- Developer showcase route `/#/design-system` is directly accessible for headless visual regression and accessibility auditing.
- 404 shell state handles unrecognized paths with clean fallback to applications.

## 7. Workspace Context
- Shell-level switcher maintains `activeWs` in UI context.
- Authorization remains strictly enforced by Supabase Row-Level Security (`workspace_members` and `applications` policies).
- Multi-workspace switching, workspace accent colors, and RPC workspace creation (`rpc_create_workspace`) are supported directly from the switcher dropdown.

## 8. Dependencies Introduced
- `lucide-react` (^1.48.0): Icon system approved in Gate 02B.
- `@axe-core/playwright` (^4.13.0): Automated accessibility auditing for E2E tests.

## 9. Vercel Configuration
- **Platform:** Vercel Serverless Functions + Static Hosting (`@jobquest/web`).
- **Framework:** Custom monorepo build using Vite and Hono serverless functions.
- **Security Headers (`vercel.json`):** Strict Content-Security-Policy with `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `connect-src 'self' https://*.supabase.co`, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`.
- **Ignore File (`.vercelignore`):** Explicitly ignores `.env*`, `supabase/`, `tests/`, `e2e/`, `migration-upgrade/`, `scripts/`, and key files from upload.
- **Environment Variables (NAMES ONLY):**
  - Config: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
  - Secrets: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `JQ_JWT_PRIVATE_JWK`, `JQ_JWT_ISSUER`, `APP_ORIGINS`, `NODE_OPTIONS`
- Zero secrets committed. Zero secrets exposed in browser bundle.
