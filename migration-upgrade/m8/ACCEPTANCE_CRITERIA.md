# Milestone 8 · Acceptance Criteria — Analytics & Reports

| # | Category | Criterion | Verification Method |
| :--- | :--- | :--- | :--- |
| **AC-M8-01** | Database | Table `goals` created with strict constraints, FKs, and RLS enabled. | Migration & integration test M8-01 |
| **AC-M8-02** | Security | Peer users cannot read or mutate each other's goals. | Integration test M8-02 |
| **AC-M8-03** | Security | Managers can inspect workspace goals; cross-user mutations trigger audit log. | Integration test M8-03 |
| **AC-M8-04** | Analytics | Historical Funnel correctly reflects "ever reached" stages from `application_events`. | Integration test M8-04 |
| **AC-M8-05** | Analytics | Rate formatting displays explicit `N / D (X%)`; denominators < 5 display "Insufficient data". | Unit test & UI inspection |
| **AC-M8-06** | Analytics | Aging report correctly maps applications into 5 standard bands with triage actions. | Integration test M8-05 & UI inspection |
| **AC-M8-07** | Analytics | Manager aggregate analytics aggregates workspace data; individual member filter works. | Integration test M8-06 |
| **AC-M8-08** | UI | Gate 02B Y1–Y5, R3 designs implemented with Direction D styling. | Visual review & screenshots |
| **AC-M8-09** | UI | Date range filtering (`30d`, `90d`, `180d`, `1y`) updates all metrics dynamically. | Playwright E2E test |
| **AC-M8-10** | UI | Goals tab displays weekly pacing chart and supports editing weekly targets. | Playwright E2E test |
| **AC-M8-11** | Security | Data export (CSV/JSON) includes formula injection mitigation. | Unit test & manual check |
| **AC-M8-12** | Accessibility | 0 critical, 0 serious violations on all Analytics surfaces via axe-core. | Automated axe audit in E2E |
| **AC-M8-13** | Regression | Prior milestones (M1B, M3, M4, M5, M6, M7) pass with zero regressions. | `pnpm test:integration` & `pnpm test:unit` |
| **AC-M8-14** | Code Quality | `pnpm lint`, `pnpm typecheck`, `pnpm build`, `check:bundle`, `check:secrets` clean. | Local CLI checks |
