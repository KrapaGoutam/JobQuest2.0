# UI/UX Design Brief

## CURRENT STATE — Existing UI Audit

The authoritative source for JobQuest 1.0's design contract is the repository's
own `DESIGN.md`, which this brief treats as ground truth rather than
re-deriving. Summary of what exists today (full detail: read `DESIGN.md`
directly, and `ROUTE_SCREEN_INVENTORY.md` for behavior per screen):

- **Page structure**: persistent sidebar (252px expanded / 68px collapsed) + 56px
  top bar + fluid main canvas on desktop; a modal drawer with backdrop + focus
  trap below 768px.
- **Navigation**: grouped, collapsible sections (Primary, Activity, Career
  Assets, Insights, Settings, Manager) — see `ROUTE_SCREEN_INVENTORY.md` for the
  exact item list and the one confirmed grouping bug (orphaned "Import History").
- **Dashboard**: tiered widget grid (actions/pipeline/context tiers, 30 widgets),
  customizable layout (drag + keyboard + explicit move buttons), date-range
  selector.
- **Forms**: logical fieldset sections, persistent labels (no placeholder-as-label
  anti-pattern), inline errors via `aria-describedby`, values preserved on
  validation failure.
- **Cards/metrics**: surface-1 background, hairline border, 8px radius, tabular
  numerals for metrics.
- **Tables**: sticky headers where useful, real sort buttons with `aria-sort`,
  safe DOM text rendering (`textContent`, never `innerHTML` interpolation of
  user data), Quick Preview without nested-control trigger conflicts.
- **Kanban**: sticky stage headers, collapsible columns/groups, bounded initial
  render (15 cards/group + "Show more"), drag+keyboard+mobile-menu stage
  movement, confirmation for consequential transitions.
- **Dialogs/drawers**: labelled headings, close buttons, focus traps, Escape
  handling, focus restoration on close.
- **Empty/loading/error states**: skeletons only when layout is known;
  `aria-live` status text otherwise; empty states distinguish "no data" from "no
  filter matches"; errors state what failed with Retry when safe.
- **Accessibility**: WCAG 2.2 AA target, already achieving a confirmed
  zero-violation bar across every audited page as of the last hardening round —
  this is a genuinely strong starting point, not a gap to close.
- **Motion**: 120-180ms ease-out/ease-in, `prefers-reduced-motion` respected, no
  essential information ever conveyed by animation alone.
- **Known gaps** (see `ROUTE_SCREEN_INVENTORY.md` and `CHANGE_REQUESTS.md`):
  non-functional Application Detail tabs, `prompt()`-based quick edits in 11
  places, no real PIN-change form, orphaned nav item, no dashboard drill-through
  from the Aging widget.

## TARGET MIGRATION STATE — Design Direction

The new React UI should feel modern, professional, clean, fast, data-focused,
job-search oriented, responsive, accessible, and not visually cluttered — a
continuation of `DESIGN.md`'s existing personality ("focused, dependable,
precise, encouraging... a professional workbench"), not a departure from it.
Avoid generic AI-dashboard styling; avoid decorative gradients, glass effects,
oversized marketing typography, and color as the only status signal — all
already-stated `DESIGN.md` rejections, still correct for the target.

## Color System (carried forward from `DESIGN.md`, re-expressed as target tokens)

```css
:root {
  --color-canvas: #f6f7f9;
  --color-sidebar: #ffffff;
  --color-surface-1: #ffffff;
  --color-surface-2: #f1f3f6;
  --color-surface-3: #e8ebf0;
  --color-text: #172033;
  --color-text-muted: #667085;
  --color-text-subtle: #7d8799;
  --color-border: #dfe3ea;
  --color-border-strong: #c7ced9;
  --color-accent: #3157d5;
  --color-accent-hover: #2849b8;
  --color-accent-soft: #e9edff;
  --color-focus: #5076f2;
  --color-success: #147a55;
  --color-warning: #9a5b08;
  --color-danger: #ba3341;
  --color-info: #246b9f;
}
[data-theme="dark"] {
  --color-canvas: #090d16;
  --color-sidebar: #0d1220;
  --color-surface-1: #121827;
  --color-surface-2: #171f30;
  --color-surface-3: #202a3d;
  --color-text: #edf1f7;
  --color-text-muted: #b1bbca;
  --color-text-subtle: #929eb0;
  --color-border: #273247;
  --color-border-strong: #35425a;
  --color-accent: #8098ff;
  --color-accent-hover: #9aacff;
  --color-accent-soft: #202b58;
  --color-focus: #9ab0ff;
  --color-success: #54c89a;
  --color-warning: #edb457;
  --color-danger: #ff7f8c;
  --color-info: #75b8e7;
}
```

Note: the live app's actual `styles.css` is dark-themed *by default* (`:root` is
dark, `:root[data-theme="light"]` is the override) — the reverse of the
convention shown in `DESIGN.md`'s own snippet above (which documents light-first
token values). Confirm which is the intended default with the project owner
before implementation; do not assume `DESIGN.md`'s literal ordering overrides the
shipped app's actual behavior (see `docs/FEATURE_UPGRADE_10_FINAL.md`'s UI/UX
Audit section, which explicitly notes this).

Stage/priority colors must always pair with text, never rely on hue alone (a
carried-forward, non-negotiable rule — status meaning must survive
grayscale/colorblind viewing).

## Typography

`Inter`, `ui-sans-serif`, `system-ui`, `-apple-system`, `Segoe UI`, sans-serif —
no network font dependency. Base 14px/1.45. Page titles 24-28px/1.2, section
titles 16-18px/1.3, labels 12-13px/1.3, dense table content 13px/1.35. 600 weight
for hierarchy, 700 sparingly. Tabular numerals for all metrics/dates/counts.

## Spacing, Radius, Shadow, Motion

4px base scale (4/8/12/16/20/24/32/40). Desktop gutters 24px, tablet 20px,
mobile 16px. Controls 32px compact / 36px standard / 44px minimum on touch.
Content max-width 1600px. Radius: 6px controls, 8px cards, 10px dialogs/drawers,
full radius for status chips/circular icon buttons only. Borders: 1px semantic
hairlines. Shadows reserved for floating menus/dialogs/drawers/sticky overlap
only — no gradients anywhere. Motion: 120-180ms ease-out (entry) / ease-in
(exit), `prefers-reduced-motion` respected, never animate essential information.

## Components (target behavior — same contract as `DESIGN.md`, restated for the new component library)

Buttons, Inputs, Textareas, Selects, Comboboxes, Search, Filters, Cards, Tables,
Data grids, Status badges, Stage indicators, Dialogs, Drawers, Dropdowns, Tabs
(**must actually function as tabs** — see CR-003, do not reproduce the current
non-functional tablist), Pagination, Tooltips, Toasts, Alerts, Navigation,
Sidebar, Header, Mobile navigation, Date pickers, Charts, Skeletons, Empty
states, Error states. A command palette was not present in JobQuest 1.0 and is
not required for parity — evaluate only if it provides clear value, not as a
default addition.

## Status Design

Every status (application stage, task/priority level, import row outcome,
duplicate-match severity) must be labeled with text, not conveyed by color
alone — matching the existing app's convention (e.g. the extension's duplicate
banners are always both colored *and* explicitly labeled "Danger"/"Warning"/
"Informational" in content, not just border color).

## Responsive Breakpoints

Behavioral, not just device-width: compact desktop at 1024px, tablet at 768px,
mobile below 600px — matching the existing Playwright viewport matrix (desktop,
compact-desktop, tablet, mobile, small-mobile) exactly, so the same 5-viewport
visual-regression suite can be reused without redefining breakpoints.

## Accessibility

WCAG 2.2 AA minimum, matching the already-achieved zero-violation bar. Keyboard
navigation, visible focus (`:focus-visible`), 4.5:1 normal text / 3:1 large
text/UI contrast, labelled controls, live feedback (`aria-live`), full keyboard
operation, drag/drop always paired with a non-pointer alternative (as Kanban and
Dashboard-layout editing already do today — preserve this pattern, don't drop it
for a DnD-only library default), semantic headings, accessible dialogs/tables,
minimum 44px touch targets, `prefers-reduced-motion` support.

## Design System Architecture (target)

React + TypeScript + Tailwind CSS + a headless/accessible component
primitive layer (e.g. Radix UI or shadcn/ui, per the original migration brief's
stated target stack) + a consistent icon set (the current app self-hosts inline
Lucide icons — carrying Lucide forward, via a proper package rather than
hand-inlined SVGs, is a reasonable default). Only adopt libraries that
demonstrably improve maintainability over the current dependency-free approach —
the current app's zero-dependency SVG chart primitives (`hBar`/`vBars`/
`areaLineChart`/`radialProgress`) and CSP-driven "no inline styles" discipline
are worth deliberately preserving in spirit (a charting library is fine, but
don't let it reintroduce excessive dependency weight or require relaxing the CSP
for `style-src` without a conscious decision).

## Migration action

| Area | Current | Target | Migration Action |
|---|---|---|---|
| Component library | None (hand-written DOM) | React component library | Build components once per `ROUTE_SCREEN_INVENTORY.md` entry, reusing pure `features/*/format.js` logic |
| Tabs | Non-functional tablist on Application Detail | Real tab-panel switching | CR-003 |
| Quick edits | 11× `window.prompt()` | Shared inline-edit component | CR-002 |
| Navigation | In-memory `go()`, 3 deep-link exceptions | Real router (React Router/Next.js) | ADR-003 |
| Charts | Dependency-free inline SVG | Evaluate a lightweight charting library vs. keeping the SVG primitives | Decide during Milestone 2 (Design System) |
| Theme default | Dark-first in shipped CSS, light-first in `DESIGN.md`'s own snippet | Resolve the discrepancy explicitly | Confirm with project owner before Milestone 2 |
