# Milestone 8 · Analytics & Reports

**Domain:** Analytics, Funnel Metrics, Stage Timing, Aging Reports & Search Goals  
**Approved Design:** Gate 02B `07-analytics.html` (Screens Y1, Y2, Y3, Y4, Y5, R3, E7–E9)  
**Target Schema:** Gate 03 Target Schema Table #20 (`goals`)  
**Git Branch:** `feature/m8-analytics-reports`  
**Base Commit:** `048a12f` (development HEAD containing M1B–M7)  

---

## 1. Objectives

1. **Historical Funnel Fidelity ("Ever Reached", ADR-018, CR-014):**
   - Correct legacy defect where applications reaching interviews and subsequently rejected disappeared from conversion rates.
   - Compute historical stage progression from immutable `application_events`.
   - Side-by-side presentation of **Current Pipeline** (open applications by current stage) and **Historical Funnel** (ever reached).
2. **Standard Ratio & Sample Size Floor (BL-004, BL-005):**
   - Explicit numerator and denominator format: `402 / 1,684 (23.9%)`.
   - Denominators < 5 display *"Insufficient data (<5)"* to prevent misleading 0% or 100% metrics.
3. **Stage Timing & Bottleneck Detection (Screen Y3):**
   - Compute median and range of days between pipeline milestones (`Applied → first response`, `Applied → Interview`, `Applied → Rejection`, `Full lifecycle`).
   - Identify stuck applications (open applications in same stage for 14+ days).
   - Measure follow-up correlation (response rate with vs without follow-ups).
4. **Aging Report & Quick Review (Screen Y4, CR-005):**
   - Categorize applications across 5 standard aging bands: New (≤3d), Waiting (≤7d), Follow-Up Recommended (≤14d), Stale (≤30d), Long Waiting (>30d).
   - Surface quick actions: `Keep Active`, `Mark Ghosted`, `Archive`.
5. **Activity Goals Pacing (Screen R3, Gate 03 Table #20 `goals`):**
   - Define weekly application and networking outreach targets.
   - Pacing chart comparing actual activity vs weekly target.
6. **Data Portability & Export (Screens E7–E9):**
   - Direct export of workspace application and analytics data in CSV and JSON formats with formula injection protection.
7. **Manager vs User Scoping:**
   - User views personal analytics.
   - Manager views workspace aggregate and can filter by specific workspace member.

---

## 2. Directory Structure

```
migration-upgrade/m8/
├── README.md
├── IMPLEMENTATION_PLAN.md
├── TEST_PLAN.md
├── ACCEPTANCE_CRITERIA.md
├── M8_IMPLEMENTATION_NOTES.md
├── M8_TEST_RESULTS.md          # Generated after test execution
├── M8_VISUAL_REGRESSION.md     # Generated after Playwright capture
├── M8_INFRASTRUCTURE.md        # Database and RLS audit
├── M8_COMPLETION_REPORT.md     # Generated at milestone closeout
├── NEXT_AGENT_HANDOFF.md       # Operational handoff for next milestone
├── screenshots/                # Visual verification screenshots
└── evidence/                   # Automated audit & test outputs
```
