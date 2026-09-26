# M10 Visual Regression — Import & Export

Target: Vercel Preview (`https://jobquest2-coylvgrif-one-piece-5779.vercel.app`) against hosted development Supabase (`jobquest-dev` `xpnkasclquplmrcmhsif`).

Deployment: `dpl_BcDodgC5p7hzXT9qcyyhJtpwaTYa`
Branch: `feature/m10-import-export`

## Visual Captures

| File | Coverage |
| --- | --- |
| `m10-import-wizard-light.png` | Step 1 source selection (Structured text input mode) in light theme |
| `m10-import-mapping-dark.png` | Step 2 visual column mapping interface in dark theme |
| `m10-import-preview-light.png` | Step 3 row validation preview table with duplicate detection and action controls |
| `m10-import-summary-dark.png` | Step 4 atomic commit results summary card in dark theme |
| `m10-export-controls-light.png` | Export workspace data section displaying 13 CSV buttons, XLSX, and JSON archive |

## Visual Inspection Analysis

- **Wizard Steps Progression**: Four-step progress indicator renders cleanly across both themes with clear step numbers and active highlights.
- **Form Controls & Inputs**: Radio group format selectors, textarea inputs, and dropdowns maintain high contrast, clear focus rings, and proper spacing.
- **Table Accessibility & Spacing**:
  - Horizontal scroll container has `tabIndex={0}`, `role="region"`, and accessible labels for Safari/keyboard accessibility;
  - Status pills (`COMPLETED`, `DUPLICATE`, `VALID`, `INVALID`) have calibrated colors satisfying WCAG AA 4.5:1 minimum contrast ratio thresholds in both light (`#0b573a`) and dark (`#54c89a`) modes;
  - Sticky table headers maintain alignment over scrollable rows.
- **Responsive Stacking**:
  - Grid collapses predictably on mobile viewports (< 760px);
  - Zero horizontal overflow observed at 390x844 (`mobile_overflow_px: 0`).
- **Axe Audits**:
  - All 6 captured contexts audited with `@axe-core/playwright` (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`);
  - 0 critical violations, 0 serious violations, 0 blocking findings across all contexts.
