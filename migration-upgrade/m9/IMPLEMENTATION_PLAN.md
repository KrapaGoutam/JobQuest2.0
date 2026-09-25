# M9 Implementation Plan

## Objective

Complete dashboard parity on top of the already-delivered action queue and analytics domains while preserving the approved Direction D UX and all 30 stable widget IDs.

## Phases

| Phase | Work | Exit condition |
|---|---|---|
| 0 | Planning, recovery ledger, branch checkpoint | Planning package committed and pushed |
| 1 | Preference foundation | Additive `profiles.ui_preferences` migration, least-privilege grants/RLS verification, typed registry/default layout, unit coverage |
| 2 | Dashboard data composition | Parallel fetch model reusing M6/M8 APIs; user/manager scopes; deterministic loading/error/empty states |
| 3 | Widget presentation | 30 IDs render under three tiers; action-first queue remains primary; responsive/theme/a11y behavior |
| 4 | Customize dashboard | Visibility, order, supported sizes, reset; keyboard controls and persisted per-user/per-workspace preferences |
| 5 | Drill-throughs and regression | Existing 11 destinations plus Aging Report; no authorization in React filters |
| 6 | Verification | Unit, integration/RLS, build, prior regressions, M9 E2E/axe, performance evidence, secret scans |
| 7 | Hosted dev and preview | Apply reviewed additive migration to `jobquest-dev`, hosted integration, preview deploy and full-story verification |
| 8 | Closeout | Evidence, reports, final executable/docs commits, CI green, CURRENT_AGENT_STATE current |

## Architecture

- Direct PostgREST reads/RPC calls continue to rely on RLS.
- Existing M8 RPCs are the source of analytics and goal truth.
- Dashboard preferences are presentation-only JSON under the signed-in user's `profiles.ui_preferences`; workspace IDs partition saved layouts inside the JSON document.
- No service-role credential is exposed to the browser.
- Independent data fetches start together and settle without serial waterfalls.

## Database delta

One forward-only migration adds `profiles.ui_preferences jsonb NOT NULL DEFAULT '{}'::jsonb` with an object-shape constraint. Existing owner-private profile RLS remains authoritative. No prior migration is edited.

## Checkpoint strategy

Commit and push after the preference foundation, primary dashboard, customization/tests, preview corrections, and final documentation.
