# Migration Checklist

Cross-cutting checklist, organized by area. This is the operational companion to
`docs/IMPLEMENTATION_PLAN.md`'s milestones and `TESTING_STRATEGY.md`'s parity
checklist — use all three together, not in isolation.

## Documentation

- [x] `CURRENT_STATE_AUDIT.md` complete
- [x] `FEATURE_CATALOG.md` covers every feature in `docs/PRD.md`
- [x] `BUSINESS_LOGIC_CATALOG.md` covers every rule flagged in feature docs
- [x] `API_INVENTORY.md` covers every endpoint
- [x] `ROUTE_SCREEN_INVENTORY.md` covers every screen
- [x] `docs/BACKEND_SCHEMA.md` covers every table
- [ ] `OPEN_QUESTIONS.md` items resolved (tracked per-item, not a single checkbox — see that file)
- [ ] `git log ui-upgrade --not main` checked (OQ-009)

## Frontend

- [ ] Design system tokens ported (`docs/UI_UX_DESIGN_BRIEF.md`)
- [ ] Every screen in `ROUTE_SCREEN_INVENTORY.md` has a corresponding React route/component
- [ ] Every `features/*/format.js` pure module ported/typed
- [ ] Router introduced (ADR-003) with a route for every current `go()` page id
- [ ] Kanban drag-and-drop + keyboard alternative reimplemented
- [ ] Dashboard layout editor (drag + keyboard `Alt+Arrow` + explicit buttons) reimplemented
- [ ] Accessibility patterns preserved (aria-pressed/expanded/sort/checked-mixed, live regions)
- [ ] CR-002 (inline-edit components replacing `prompt()`) resolved one way or another
- [ ] CR-003 (Application Detail tabs) resolved one way or another
- [ ] CR-004 (nav grouping fix) resolved one way or another

## Backend

- [ ] Every endpoint in `API_INVENTORY.md` has a migrated equivalent (or a
      documented, approved reason it doesn't)
- [ ] `STAGES` canonical enum preserved exactly, single source of truth
- [ ] Ownership resolution consolidated (no `targetOwner`/`ownerId` duplication)
- [ ] Generic-tracker schema-introspection replaced with explicit typed handlers
- [ ] Postgres worker RPC bridge NOT ported (ADR-006)
- [ ] `safeCell()`/CSV-injection protection ported to every export path
- [ ] URL protocol validation (`http:`/`https:` only) ported
- [ ] Analytics rate formulas ported with parity tests against a fixed dataset

## Database

- [ ] All 23 tables re-created with every CHECK constraint/index/FK from `docs/BACKEND_SCHEMA.md`
- [ ] 11 builtin `reminder_categories` seed rows re-created
- [ ] Migration policy (additive-only, versioned, CI-validated) carried forward

## Authentication

- [ ] OQ-001 (PIN vs. Supabase Auth) resolved and implemented
- [ ] Legacy-password-to-PIN transition path decision made (may be moot if OQ-001 changes the model entirely)
- [ ] Session/CSRF vs. Bearer-JWT model decided (SECURITY_AUTHORIZATION.md)

## Authorization

- [ ] RLS policies implemented per `docs/BACKEND_SCHEMA.md` §Supabase RLS
- [ ] Manager cross-user RPC function(s) implemented and tested (OQ-003)
- [ ] Mass-assignment protection (BL-016) re-verified at the new API/RLS boundary
- [ ] 404-not-403 anti-enumeration behavior re-verified (BL-017)

## Browser extension

- [ ] OQ-008 (repoint vs. rebuild) decided
- [ ] OQ-002 (extension auth mechanism) decided and implemented
- [ ] Every extractor fixture test re-passes unchanged
- [ ] Duplicate-detection 4-state classification re-passes unchanged (BL-003)
- [ ] Canonical stage sync re-passes unchanged (FEATURE-EXT-004)
- [ ] Deep-linking + open-redirect protection re-passes unchanged (BL-015)

## Imports / Exports

- [ ] Import alias table (BL-006) ported exactly
- [ ] All 3 duplicate actions (skip/import_anyway/update_existing) ported
- [ ] All 13 CSV export types + XLSX + full JSON export ported
- [ ] CSV formula-injection protection verified on every export path

## Testing

- [ ] Every item in `TESTING_STRATEGY.md`'s parity checklist passes against the migrated system
- [ ] RLS positive/negative tests added for every table (new requirement, didn't exist pre-migration)
- [ ] Playwright suite retargeted, zero new accessibility violations
- [ ] Visual-regression baselines reset and human-reviewed (expected, not a defect)

## Accessibility

- [ ] Zero axe violations across every migrated screen (matching the pre-migration bar)
- [ ] Every current `aria-*` pattern preserved or improved, never silently dropped

## Security

- [ ] `SECURITY_AUTHORIZATION.md`'s full current-state list re-verified against the new system
- [ ] Dependency audit (`npm audit` or TypeScript-stack equivalent) clean at HIGH severity
- [ ] Secret-scanning CI gate carried forward

## CI/CD

- [ ] GitHub Actions pipeline extended per `CI_CD_DEPLOYMENT.md` target section
- [ ] Supabase migration validation job added
- [ ] Vercel preview deployments wired to PRs

## Vercel

- [ ] Frontend deploys successfully from a preview branch
- [ ] Production deploy gated behind Gate 7 (`APPROVAL_GATES.md`)

## Supabase

- [ ] Project created (staging first, then production — never developed directly against production)
- [ ] Auth configured per the OQ-001 decision
- [ ] RLS enabled and tested on every table before any real data is imported

## Data migration

- [ ] Gate 6 approval obtained before touching any real production data
- [ ] Every step in `docs/BACKEND_SCHEMA.md` §Data migration executed in order, against staging first
- [ ] Row counts validated per table
- [ ] Every foreign key validated (no orphans)
- [ ] Analytics formulas re-validated against migrated data (exact match to pre-migration values for a fixed range)

## Production cutover

- [ ] Gate 7 approval obtained
- [ ] Full parity test suite green against the migrated system with migrated data
- [ ] Rollback plan reviewed and understood by the project owner
- [ ] Old system kept intact (not decommissioned) through an agreed retention window

## Rollback

- [ ] Neon database retained, untouched, for the full retention window
- [ ] Render service retained (even if idle) until Gate 8
- [ ] A documented, tested procedure exists for reverting DNS/traffic to the old system if needed

## Legacy shutdown

- [ ] Gate 8 approval obtained
- [ ] Neon/Render decommissioned only after explicit sign-off
