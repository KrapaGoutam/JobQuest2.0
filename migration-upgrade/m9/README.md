# Milestone 9 — Dashboard Parity

## Status

IMPLEMENTED AND VERIFIED LOCALLY/HOSTED — closeout is blocked only on Vercel team re-authentication, Preview validation, and final CI confirmation. M9 is not eligible to merge until those gates pass.

## Repository-derived scope

Gate 01 defines M9 as **Goals, Analytics & Dashboard**. M8 already shipped the Goals and Analytics portions, and M6 shipped the Direction D action-first dashboard queue. M9 is therefore the remaining dashboard slice:

- preserve the legacy registry's 30 widget IDs and names verbatim;
- integrate the already-approved M6 queue and M8 analytics/goals data into one Direction D dashboard;
- implement the three-tier information hierarchy (Needs your attention, Current pipeline, Trends & context);
- implement per-user widget visibility/order/size preferences with an accessible layout editor;
- implement the documented drill-throughs, including CR-005 Aging Applications;
- support user and manager owner scopes without client-side authorization assumptions;
- retain responsive, theme, accessibility, performance, and regression guarantees.

## Explicit exclusions

- New analytics formulas or changes to M8 semantics.
- Journal, Calendar, reminder-category, Settings, workspace-management, import/export, or extension implementation.
- Production infrastructure, legacy data migration, cutover, or retirement.
- A revived `dashboard_preferences` table; Gate 03 retired it into `profiles.ui_preferences`.

## Safety classification

NORMAL DEVELOPMENT. Development Supabase and Vercel Preview only.

## Source authority

- `GATE_01_ARCHITECTURE_PROPOSAL.md` §24 M9
- `ROUTE_SCREEN_INVENTORY.md` dashboard registry and drill-through map
- `FEATURE_CATALOG.md` FEATURE-DASH-001
- Gate 02B Direction D dashboard specification and approved screenshots
- Gate 03 target schema and legacy table mapping
- M6 and M8 completion artifacts
