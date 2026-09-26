# QUICK RECOVERY — MILESTONE 11

## Active Milestone
**Milestone 11 — Browser Extension Migration**

## Active Branch
`feature/m11-browser-extension`

## Head SHA
`6df9b734` (pushed to `origin/feature/m11-browser-extension`)

## Development Base
`60ec9dff` (contains merged M10, development CI green)

## State
- M10 is 100% complete and merged to `development`.
- Development CI run `36252789930` is **SUCCESS**.
- M11 branch `feature/m11-browser-extension` created and pushed.
- Planning artifacts authored:
  - `migration-upgrade/m11/README.md`
  - `migration-upgrade/m11/IMPLEMENTATION_PLAN.md`
  - `migration-upgrade/m11/TEST_PLAN.md`
  - `migration-upgrade/m11/ACCEPTANCE_CRITERIA.md`

## Next Exact Action
1. Author `supabase/migrations/20261005100000_m11_extension_tokens.sql` for `extension_tokens` table, RLS, and RPC helpers.
2. Verify local migration reset: `pnpm exec supabase db reset --local --no-seed`.
3. Implement `/api/ext/v1` routes and extension token management services in `apps/api`.
4. Implement web token management UI in `apps/web`.
5. Migrate extension client in `extension/` and verify 16 extraction fixtures.

## Guardrails
- **DO NOT MERGE M11 TO DEVELOPMENT.** M11 must stay on its feature branch for user review.
- Never touch `main`, Production Supabase, or `JobQuest1.0`.
