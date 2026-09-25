# M8 Next Agent Handoff

## Closeout state

M8 Search Analytics, Reports & Search Goals has passed its merge gate. The approved executable is `7757b06e9b72f09309823240af8059b418598934` on `feature/m8-analytics-reports`.

- GitHub Actions: run `36180204706`, success.
- Supabase dev: `jobquest-dev` (`xpnkasclquplmrcmhsif`), migrations matched through `20260928110000`.
- Preview: `https://jobquest2-ke8qoar7s-one-piece-5779.vercel.app`, READY and verified.
- Local and hosted integration: 119/119 each.
- Preview M8 E2E, Option B browser regression, axe, health, exports, mobile, and deployed-bundle scan: PASS.
- Production and `main`: untouched.

Do not reopen the original M8 migration. Any future schema correction must be additive.

## Important final semantics

- Historical funnel uses exact immutable events, not inferred stage progression.
- Stage timing uses first qualifying events and tolerates duplicates/reopens without negative intervals.
- Current pipeline, aging, and stuck reports describe current state; range-scoped metrics use `applied_at`; pacing is a fixed 12-week event-time series.
- Goal history is effective-dated and not directly updateable/deletable. Weekly boundaries follow profile timezone and `week_start`.
- Manager member-goal changes use `rpc_upsert_goal_for_user` and are audited.
- `applications.source` is the source-of-truth for source analytics.

## Evidence

- `migration-upgrade/m8/evidence/integration-local-dc2379.json`
- `migration-upgrade/m8/evidence/integration-hosted-dev-343149.json`
- `migration-upgrade/m8/evidence/m8-e2e.json`
- `migration-upgrade/m8/evidence/option-b-preview-ke8qoar7s.json`
- `migration-upgrade/m8/evidence/preview-bundle-scan-ke8qoar7s.json`
- `migration-upgrade/m8/screenshots/`

## Next work

After the M8 merge and green `development` CI, determine M9 from the repository roadmap. Do not infer it from this handoff and do not start a production/cutover milestone without explicit approval.
