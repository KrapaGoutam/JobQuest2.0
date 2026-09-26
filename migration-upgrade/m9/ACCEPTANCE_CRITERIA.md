# M9 Acceptance Criteria

- [x] Exactly 30 approved widget IDs/names/kinds are present verbatim.
- [x] Direction D action-first queue remains the primary dashboard surface.
- [x] Widgets are grouped into Needs your attention, Current pipeline, and Trends & context.
- [x] All enabled widgets render useful content or an honest per-widget empty/error state.
- [x] User and manager owner scopes are consistent across queue, analytics, goals, documents, and application widgets.
- [x] Preferences persist per signed-in user and workspace in `profiles.ui_preferences`.
- [x] Layout customization supports visibility, order, supported size, reset, and keyboard operation.
- [x] Existing legacy drill-throughs work and Aging Applications links to the aging report.
- [x] Unknown/malformed persisted preference data cannot hide or break the dashboard.
- [x] No client-side filter is treated as authorization.
- [x] Additive migration, RLS/grant verification, and local/hosted integration pass.
- [x] Unit, typecheck, lint, build, E2E, targeted regressions, axe, performance, and secret scans pass.
- [x] Vercel Preview is READY and its UI/API/data flow is verified.
- [x] Final executable SHA, CI, Supabase state, preview URL/deployment, and evidence are recorded.
- [x] Completion report, handoff, and CURRENT_AGENT_STATE are current.
