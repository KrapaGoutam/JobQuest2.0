# M3 — Visual Regression

**Capture tool:** `e2e/m3-applications.spec.ts` (Playwright, Chromium).
**Final capture source:** the live Vercel preview, run ``ed8b33` (preview `jobquest2-d5pdff0pm`, code = `e8fedb2`)` (see `M3_TEST_RESULTS.md` §6). Earlier local and hosted captures were superseded by this set.
**Location:** `migration-upgrade/m3/screenshots/`

## 1. Screenshot inventory and review

| File | Viewport | What it shows | Review against Direction D / Gate 02B |
|---|---|---|---|
| `applications-table-light.png` | 1440×900 | Grid with stage pills + counts, aging/priority/outcome/owner filters, dense 44 px rows, pagination footer | PASS: 8-pip stage bar with canonical labels; Open vs outcome pill (Stage ≠ State); all columns and actions visible |
| `applications-table-dark.png` | 1440×900 | Same grid, dark theme | PASS: tokens applied; axe contrast 0 serious after transitions settle |
| `applications-create-modal.png` | 1440×900 | New Job Application form with the snapshot section expanded | PASS: labelled fields, snapshot capture |
| `applications-duplicate-strong.png` | 1440×900 | Strong-duplicate card (URL match) with View existing / Save anyway | PASS: Gate 02B §4.4 danger tier, non-blocking override |
| `applications-bulk-selection.png` | 1440×900 | 2 rows selected; floating bulk bar ("2 applications selected") | PASS |
| `applications-detail-drawer.png` | 1440×900 | Detail drawer: header, location, 8-pip bar, priority, aging, actions, next action card, tabs, timeline with actors | PASS: Gate 02B §4.3 header strip, Next Action card, Timeline tab |
| `applications-stage-modal.png` | 1440×900 | Move Stage dialog **stacked above the drawer**, "(current)" marker, notes | PASS: this capture shows the overlay-stacking fix (before it, this dialog was unclickable) |
| `applications-outcome-modal.png` | 1440×900 | Outcome dialog with WITHDRAWN + "Offer declined" closure reason | PASS: ADR-028 structured closure reason |
| `applications-archived-view.png` | 1440×900 | Archive view with "Archived" pill and Restore action | PASS: soft archive, ADR-026 |
| `applications-wide-preview.png` | 1720×1000 | Persistent 440 px preview rail with recent activity; toolbar "Preview" toggle | PASS: D4 / ADR-029 (defaults open ≥1680, explicit toggle, closable) |
| `applications-desktop-1024.png` | 1024×768 | Desktop boundary; no rail; horizontal scroll inside the grid only | PASS |
| `applications-tablet-768.png` | 768×1024 | Tablet icon rail + grid | PASS |
| `applications-mobile.png` | 375×812 | Mobile card list, bottom navigation | PASS: no page-level horizontal overflow (measured 0 px) |
| `applications-mobile-detail.png` | 375×812 | Mobile full-screen detail sheet with timeline | PASS: Gate 02B mobile sheet |
| `m2-table-foundation-after-m3-8pips.png` | M2 showcase | M2 "Table Primitives" tab after M3 | Intended drift, see §2 |

## 2. Intended change to an M2 baseline

- `StagePips` now renders **8 pips** for the 8 canonical stages (Gate 02B ADR-020, "8-pip stage progress bar"). The previous M2 5-pip rendering predated the canonical workflow.
- This changes how the M2 showcase's "Table Primitives" tab renders.
- The **approved M2 baseline files are left untouched** in `migration-upgrade/m2/screenshots/`. The M2 capture spec regenerates them on every E2E run, and those regenerated copies were restored to the approved versions before each commit.
- The post-M3 rendering is recorded here as `m2-table-foundation-after-m3-8pips.png` for review.

## 3. Pre-existing M2 shell observations (not changed; M3 preserves the approved shell)

These are visible in the approved M2 baseline `m2/screenshots/desktop-light.png` and are unchanged by M3. They're recorded for a later shell pass:

1. The topbar content (breadcrumb, search trigger, bell, avatar) renders stacked at the top-left without a header bar.
2. The sidebar group labels ("Track", "Insights") sit flush against the left edge.
3. The workspace switcher shows "MEMBER" for a personal workspace where the user is MANAGER. The M3 grid correctly treats that user as a manager (owner column and filter).
4. On `/`, which renders Applications, the sidebar highlights "Dashboard".
5. The global search palette (`/`) still shows M2 placeholder content. Global search is CR-017, a later milestone.

## 4. Accessibility snapshot (axe-core, WCAG 2.2 AA tags, colour-contrast included)

Contexts audited per run:
- create dialog
- detail drawer
- grid light
- grid dark
- wide preview
- mobile cards

Final results: **0 critical, 0 serious** in every context, locally, in CI and on the Vercel preview. Two issues were found and fixed during M3 verification:
- a serious `aria-prohibited-attr` violation on the table's loading skeleton, caught only on the preview because of network latency
- a mid-transition dark-theme contrast reading (the audit now waits for theme transitions to settle)
