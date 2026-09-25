# M9 Acceptance Criteria

- [ ] Exactly 30 approved widget IDs/names/kinds are present verbatim.
- [ ] Direction D action-first queue remains the primary dashboard surface.
- [ ] Widgets are grouped into Needs your attention, Current pipeline, and Trends & context.
- [ ] All enabled widgets render useful content or an honest per-widget empty/error state.
- [ ] User and manager owner scopes are consistent across queue, analytics, goals, documents, and application widgets.
- [ ] Preferences persist per signed-in user and workspace in `profiles.ui_preferences`.
- [ ] Layout customization supports visibility, order, supported size, reset, and keyboard operation.
- [ ] Existing legacy drill-throughs work and Aging Applications links to the aging report.
- [ ] Unknown/malformed persisted preference data cannot hide or break the dashboard.
- [ ] No client-side filter is treated as authorization.
- [ ] Additive migration, RLS/grant verification, and local/hosted integration pass.
- [ ] Unit, typecheck, lint, build, E2E, targeted regressions, axe, performance, and secret scans pass.
- [ ] Vercel Preview is READY and its UI/API/data flow is verified.
- [ ] Final executable SHA, CI, Supabase state, preview URL/deployment, and evidence are recorded.
- [ ] Completion report, handoff, and CURRENT_AGENT_STATE are current.
