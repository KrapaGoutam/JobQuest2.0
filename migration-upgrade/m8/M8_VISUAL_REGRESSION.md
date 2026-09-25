# Milestone 8 · Visual Regression & UI Verification

**Milestone:** M8 — Search Analytics, Reports & Goals  
**Target Designs:** Gate 02B Screen 07 (`Analytics & Reports`) and Gate 02B R3 (`Weekly Activity Targets`)  
**Design System:** Direction D (Tailored Dark/Light, Tokens, M2 Accessible Components)  
**Execution Date:** 2026-09-25  

---

## 1. Generated Visual Artifacts

The automated Playwright E2E suite (`e2e/m8-analytics.spec.ts`) captured 5 high-resolution visual evidence artifacts under `migration-upgrade/m8/screenshots/`:

| Screenshot | Description | Gate 02B Mapping |
| :--- | :--- | :--- |
| `Y1-analytics-light.png` | Analytics Overview in Light Mode: Search Summary KPIs, 12-week pacing SVG chart, Current pipeline vs Historical funnel, Sources, Resumes, and Outcomes breakdown. | Gate 02B Screen 07 (Overview) |
| `Y2-analytics-dark.png` | Analytics Overview in Dark Mode: Validates token consistency, contrast ratios, and dark theme gradients. | Gate 02B Screen 07 (Dark Theme) |
| `Y3-stage-timing-light.png` | Stage Timing tab in Light Mode: Step transition timing with median days and sample size indicator (<5), stuck applications (14+ days), and follow-up impact stats. | Gate 02B Screen 07 (Stage Timing) |
| `Y4-aging-report-dark.png` | Aging Report tab in Dark Mode: 5 aging band summary cards, quiet applications review banner, and aging application triage list. | Gate 02B Screen 07 (Aging Report) |
| `R3-goals-light.png` | Weekly Activity Targets & Goals tab in Light Mode: Active weekly target card, progress bar, 12-week pacing history table, and target edit controls. | Gate 02B Screen R3 (Goals) |

---

## 2. Gate 02B Specification Compliance

### A. Screen 07 — Analytics Overview
- **Header Controls:**
  - Date range segmented control: `30d`, `90d` (default), `180d`, `1y`.
  - Export actions: `Export CSV` (formula-injection protected) and `JSON` export.
  - Workspace member selector (for managers only) allowing toggle between aggregate workspace metrics and individual member drill-down.
- **Top Metric Cards:**
  - `Total Applications`
  - `Responses` (% response rate)
  - `Interviews Reached` (% interview rate)
  - `Offers Reached` (% offer rate)
  - `Offers Accepted`
  - `Median Response Time` (with sample count)
- **12-Week Pacing Chart:**
  - Pure SVG responsive chart showing weekly application volume against the active target goal line.
  - Hover tooltips detailing weekly applied, responses, and interviews.
- **Funnel & Breakdown Section:**
  - Current Pipeline vs Historical Funnel ("ever reached" semantics per Gate 02B).
  - Sources performance breakdown (applications, response rate, interview rate).
  - Resumes breakdown (performance by resume version).
  - Outcomes breakdown (rejection stages, offers declined, accepted).

### B. Stage Timing Tab
- **Transition Times Table:**
  - Average and median days between lifecycle stages (`Applied → First Response`, `Applied → Screen`, `Applied → Interview`, `Interview → Offer`, `Applied → Rejection`, `Full lifecycle`).
  - Sample size floor indicator: transitions with fewer than 5 data points clearly display low sample warnings.
- **Stuck Applications Table:**
  - Surfaces applications in active stages for 14+ days without stage advancement or status updates.
- **Follow-up Impact Comparison:**
  - Side-by-side response rates for applications with vs without follow-ups sent within 14 days, accompanied by correlation disclaimer text.

### C. Aging Report Tab
- **5 Aging Bands:**
  - `NEW` (0–3 days)
  - `WAITING` (4–7 days)
  - `FOLLOW_UP_RECOMMENDED` (8–14 days)
  - `STALE` (15–30 days)
  - `LONG_WAITING` (>30 days)
- **Quiet Review Banner:**
  - Prompts focused review for applications quiet for 14+ days with no pending tasks.
- **Triage Action Controls:**
  - Quick action buttons on each aging application: `Keep Active`, `Mark Ghosted`, `Archive`.

### D. Screen R3 — Weekly Activity Targets & Goals Tab
- **Weekly Target Summary Card:**
  - Displays weekly application target, outreach target, and pacing progress for the current week.
- **Edit Targets Dialog:**
  - Modal form to adjust weekly target applications and target outreach, updating active goals via `rpc_upsert_goal`.
- **12-Week Target History:**
  - Tabular historical record of weekly performance vs goal targets.

---

## 3. Accessibility & Contrast Verification

- All text meets WCAG 2.1 AA 4.5:1 contrast standards against both light (`--color-surface`, `--color-background`) and dark backgrounds.
- All tabs use standard W3C ARIA tab pattern (`role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, `aria-controls`, and `aria-labelledby`).
- Unselected tab panels maintain valid DOM IDs using `hidden={!isSelected}` to ensure accessibility tree compliance.
- Interactive controls and buttons have minimum touch target sizes (≥32px height, ≥44px width).
