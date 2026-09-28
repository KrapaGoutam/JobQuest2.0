# Milestone 8 · Implementation Notes — Analytics & Reports

**Architectural Standards:**
- Gate 03 Target Schema Table #20 (`goals`).
- Gate 02B UI Design `07-analytics.html` (Screens Y1–Y5, R3, E7–E9).
- Multi-tenancy via `workspace_id`.
- Option B Auth strictly preserved (no Supabase Auth users, ES256 JWTs, custom credentials).

---

## 1. Historical Funnel Math ("Ever Reached")
- In JobQuest 1.0, funnel charts only looked at `current_stage`. When an application reached `Interview` and later transitioned to `Outcome: Rejected`, it was excluded from the interview count.
- In JobQuest 2.0 (ADR-018, CR-014), the historical funnel counts any application that **ever reached** a stage according to `application_events`.
- For example, if an application was created in `APPLIED`, moved to `RECRUITER_SCREEN`, then moved to `INTERVIEW`, and then marked `REJECTED`, it counts in:
  - `APPLIED`: yes
  - `RECRUITER_SCREEN`: yes
  - `INTERVIEW`: yes
  - `OFFER`: no
  - `ACCEPTED`: no

## 2. Sample Size Floors (BL-004, BL-005)
- Standard ratio display: `N / D (X.X%)`.
- When $D = 0$: `"No data"`.
- When $D < 5$ and small format requested: `"Insufficient data (<5)"` or `${N}/${D} · too few`.
- Prevents 1 application out of 1 resulting in an arbitrary 100% success rate display.

## 3. Aging Report Categorization
- Based on `applications.last_activity_at`:
  - `New`: ≤ 3 calendar days since last activity.
  - `Waiting`: 4–7 days.
  - `Follow-Up Recommended`: 8–14 days.
  - `Stale`: 15–30 days.
  - `Long Waiting`: 31+ days.
- In `Aging` tab, applications in `Long Waiting` surface quick triage actions:
  - `Keep Active`: touch `last_activity_at = now()` and optionally set next action.
  - `Mark Ghosted`: atomic transition to outcome `GHOSTED`.
  - `Archive`: soft archive `archived_at = now()`.

## 4. Goals & Weekly Targets
- Users set weekly application target (default: 15) and outreach target (default: 5).
- Table `goals` stores targets with `period_type = 'WEEKLY'` and `effective_date`.
- Pacing compares applications created in the week against target.
