# JobQuest 2.0 · Gate 02B Accessibility Matrix

| | |
|---|---|
| **Status** | **PROPOSED** — Awaiting user review and approval |
| **Standard Target** | WCAG 2.2 Level AA (Zero automated or manual violations across Light and Dark themes) |
| **Audit Verification** | Based on verified Playwright + axe-core baselines and Gate 02B Master State Sheets (`Q4`, `Q5`) |

---

## 1. Executive Accessibility Commitment

JobQuest 2.0 treats accessibility as an architectural foundation, not an afterthought. Every screen, interactive control, data table, dialog, and visualization is designed to ensure full parity between pointer, keyboard, and screen-reader interactions in both Light and Dark themes.

---

## 2. WCAG 2.2 AA Compliance Audit Matrix

| Accessibility Area | WCAG 2.2 Criteria | Implementation Pattern in Gate 02B | Verification Reference |
|---|---|---|---|
| **Color Contrast (Text)** | SC 1.4.3 Contrast (Minimum) (AA) | Body text (`--fg` on `--surface`) achieves **12.5:1** in Light theme and **14.2:1** in Dark theme. Secondary/muted text (`--muted`) achieves **4.8:1** (Light `#475569`, Dark `#94a3b8`), exceeding the 4.5:1 requirement. | `Q4-states-sheet-light`, `Q5-states-sheet-dark` |
| **Color Contrast (Non-Text)** | SC 1.4.11 Non-text Contrast (AA) | UI boundaries, active borders, checkbox checks, radio dots, and status icons achieve ≥**3.1:1** against adjacent backgrounds in both themes. | `13-search-states.html` Q4/Q5 |
| **Never Color Alone** | SC 1.4.1 Use of Color (A) | Status is never conveyed by color alone: Stage uses numerical pips + text label; Aging uses clock icon + text; Priority uses vertical bars + text; Overdue uses warning icon + text; Outcomes use text pills. | `02-application-create-edit.html` C8/C9 |
| **Keyboard Operability** | SC 2.1.1 Keyboard (A) | Every actionable element is reachable and operable via keyboard. Global shortcuts: `/` focuses search; `Q` opens Quick Add; `M` opens stage mover; `Esc` closes modals/drawers; `Space` toggles preview. | `02-application-create-edit.html` C3, `13-search-states.html` G1 |
| **No Keyboard Trap** | SC 2.1.2 No Keyboard Trap (A) | Modals and drawers cycle focus internally while open, but `Esc` or the close button immediately dismisses the layer and restores focus to the trigger element without trapping the user. | All modals (`02` C9/C11, `08` W2/W3) |
| **Focus Order** | SC 2.4.3 Focus Order (A) | DOM sequence strictly follows visual reading order (top-to-bottom, left-to-right). Hidden elements (collapsed drawer, closed modal) are removed from the accessibility tree (`display: none` or `inert`). | `01-auth.html`, `02-application-create-edit.html` |
| **Focus Visible & Appearance** | SC 2.4.7 Focus Visible (A)<br>SC 2.4.13 Focus Appearance (AAA/2.2 AA) | High-contrast 2px solid `--focus` ring with a 2px offset. In Light theme, `#3b82f6` on light background; in Dark theme, `#60a5fa` on dark surface. Focus rings are never hidden on keyboard navigation. | `assets/jq.css` (`:focus-visible`) |
| **Dialog Focus Trapping** | SC 2.4.3 Focus Order (A)<br>SC 4.1.2 Name, Role, Value (A) | Dialogs use `role="dialog"` or `role="alertdialog"` with `aria-modal="true"` and `aria-labelledby`. Upon opening, focus moves to the first focusable element (or title if destructive). Tab cycles within dialog. | `02-application-create-edit.html` C11 |
| **Labels & Instructions** | SC 3.3.2 Labels or Instructions (A) | Every input has a persistent visual `<label>`. Asterisks are flagged with `aria-hidden="true"` and supplemented by `aria-required="true"`. Optional fields explicitly marked `<span class="opt">optional</span>`. | `FORM_SPEC.md` §1.1 |
| **Error Identification** | SC 3.3.1 Error Identification (A)<br>SC 3.3.3 Error Suggestion (AA) | Failed inputs receive `aria-invalid="true"` and `aria-describedby` linking to an inline error container (`role="alert"`). Error text describes the exact issue and remediation (e.g. *"Password must be at least 12 characters"*). | `FORM_SPEC.md` §1.2 |
| **Live Announcements** | SC 4.1.3 Status Messages (AA) | Dynamic UI updates (toast notifications, background save completion, bulk selection counts, search result counts) are routed through dedicated `aria-live="polite"` regions. | `13-search-states.html` G1, `assets/jq.js` |
| **Target Size (Minimum)** | SC 2.5.8 Target Size (Minimum) (AA)<br>SC 2.5.5 Target Size (Enhanced) (AAA) | Mobile interactive controls are minimum **44×44px**. Desktop buttons and table controls maintain minimum **32px** height with 24px minimum interactive boundaries. | `RESPONSIVE_MATRIX.md` §3 |
| **Semantic Headings & Landmarks**| SC 1.3.1 Info and Relationships (A) | Strict heading hierarchy (`h1` per page, followed by `h2` and `h3` without skipped levels). Landmarks: `<header>`, `<nav aria-label="...">`, `<main>`, `<aside aria-label="...">`, `<footer>`. | All mockup pages (`01` through `14`) |
| **Reduced Motion** | SC 2.3.3 Animation from Interactions (AAA/AA) | CSS media query `@media (prefers-reduced-motion: reduce)` disables all non-essential transitions, animations, and skeleton shimmer sweeps. | `assets/jq.css` |
| **Data Tables & Virtualization** | SC 1.3.1 Info and Relationships (A)<br>SC 4.1.2 Name, Role, Value (A) | Applications table implements ARIA Grid pattern (`role="grid"`). Sorted columns use `aria-sort="ascending|descending"`. Virtualized rows declare total set size via `aria-rowcount` and index via `aria-rowindex`. | `11-application-views.html`, `Direction D` |
| **Bulk Selection** | SC 4.1.2 Name, Role, Value (A) | Row checkboxes support Space to toggle, Shift+Click or Shift+X for range selection. Bulk action bar uses `role="toolbar"`. Total selected count announced via live region. | `Direction D`, `INTERACTION_SPEC.md` §2.9 |
| **Drag & Drop Alternatives** | SC 2.5.7 Dragging Movements (AA) | Kanban board (V1) supports pointer drag-and-drop, but provides a 100% keyboard alternative: selecting a card and pressing `M` opens a "Move to stage..." menu. | `11-application-views.html` V1 |
| **Accessible Charts & Graphs** | SC 1.1.1 Non-text Content (A) | Analytics charts (funnel, pacing, stage duration) include accessible tabular alternatives (`role="table"` view switch) so blind and screen-reader users have full data parity. | `07-analytics.html` Y1, Y2 |

---

## 3. Keyboard Navigation Specification

### 3.1 Global Navigation Shortcuts
- `/` : Jumps focus directly to Global Search input.
- `⌘K` or `Ctrl+K` : Opens Global Search popover (forward-compatible command palette location).
- `Q` : Opens Quick Add Application modal from anywhere in the app.
- `G` followed by `D` : Navigates to Dashboard.
- `G` followed by `A` : Navigates to Applications.
- `G` followed by `T` : Navigates to Tasks & Follow-ups.
- `G` followed by `C` : Navigates to Contacts.
- `Esc` : Closes active modal, drawer, popover, or dropdown menu; returns focus to triggering element.

### 3.2 Applications Table Roving Tabindex & Grid Navigation
The virtualized Applications table implements the **ARIA Grid Roving Tabindex** pattern:
- `Tab` / `Shift+Tab` : Moves focus into and out of the table grid container.
- `↓` / `↑` : Moves active row focus to next/previous application row.
- `→` / `←` : Moves focus horizontally across interactive cells in the focused row (checkbox, company link, stage dropdown, next action, menu).
- `X` or `Space` (when on checkbox) : Toggles selection checkbox for the active row.
- `Shift + X` : Range-selects all rows between last selected row and active row.
- `P` : Context-safe shortcut to toggle the Quick Preview pane/drawer for the active row (ADR-029, OQ-024).
- `Enter` : Opens full Application Detail page (`/applications/:id`).
- `M` : Opens the "Move stage" menu for the active application row.
- *A11y Invariant:* Global `Space` is strictly prohibited for preview toggling to preserve native vertical scrolling, screen-reader text navigation, and standard ARIA checkbox toggling.


---

## 4. Screen-Reader Semantic Tree & ARIA Architecture

### 4.1 Stage Progress Bar (Application Detail, D5)
```html
<nav aria-label="Application pipeline progress">
  <ol class="stage-pips" role="list">
    <li class="pip completed" aria-current="false">
      <span class="sr-only">Step 1: Saved (Completed)</span>
    </li>
    <li class="pip completed" aria-current="false">
      <span class="sr-only">Step 2: Preparing (Completed)</span>
    </li>
    <li class="pip completed" aria-current="false">
      <span class="sr-only">Step 3: Applied (Completed)</span>
    </li>
    <li class="pip active" aria-current="step">
      <span class="sr-only">Step 4: Recruiter Screen (Current Stage)</span>
    </li>
    <li class="pip future" aria-current="false">
      <span class="sr-only">Step 5: Interview</span>
    </li>
  </ol>
</nav>
```

### 4.2 Application Outcome Modal (C9)
```html
<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="outcome-title" aria-describedby="outcome-desc">
  <div class="dlg-h">
    <h2 id="outcome-title">Close application with outcome</h2>
  </div>
  <div class="dlg-b">
    <p id="outcome-desc" class="muted">Closing an application removes it from your active pipeline while preserving all history.</p>
    <!-- Outcome form controls -->
  </div>
</div>
```

### 4.3 Virtualized Table Row Semantics (D3, Q1)
```html
<div role="grid" aria-label="Applications" aria-rowcount="457" aria-colcount="6">
  <div role="row" aria-rowindex="1" class="tr th">
    <span role="columnheader" aria-sort="none">Select</span>
    <span role="columnheader" aria-sort="ascending">Company &amp; Role</span>
    <span role="columnheader" aria-sort="none">Stage</span>
    <span role="columnheader" aria-sort="none">Aging</span>
    <span role="columnheader" aria-sort="none">Priority</span>
    <span role="columnheader" aria-sort="none">Next Action</span>
  </div>
  <div role="row" aria-rowindex="2" class="tr" aria-selected="false" tabindex="0">
    <span role="gridcell"><input type="checkbox" aria-label="Select Corvid Labs Staff Product Designer"></span>
    <span role="gridcell"><a href="/applications/123">Corvid Labs · Staff Product Designer</a></span>
    <span role="gridcell"><span class="pill">Final Interview</span></span>
    <span role="gridcell"><span>1d ago</span></span>
    <span role="gridcell"><span>High</span></span>
    <span role="gridcell"><span>Send thank-you note (Due Today)</span></span>
  </div>
</div>
```
