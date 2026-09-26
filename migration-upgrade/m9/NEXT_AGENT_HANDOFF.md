# QUICK RECOVERY

Repository:
`feature/m9-dashboard-parity`
`e79d9b57c118480b705521a6608d80d64afba971` (branch creation point; run git commands below for the current HEAD)

Run first:

```powershell
git branch --show-current
git status --short
git log --oneline --decorate -15
```

Then read:

`migration-upgrade/CURRENT_AGENT_STATE.md`

Then read this handoff.

DO NOT RESTART THE MILESTONE.

CONTINUE FROM THE LAST COMPLETED CHECKPOINT.

## Current checkpoint

M8 is merged and development CI is green. M9 is pushed through full-regression checkpoint `afadc0a85dea5e2fe08c5430a3a1de22d6445f59`. The local M9 migration is applied and verified. Dashboard composition, the 30-widget tiered surface, accessible customization, preference isolation tests, and the Aging drill-through route are implemented. Full local gates and focused Playwright pass.

## Next action

Hosted-dev apply passed for exactly `20260929100000_m9_dashboard_preferences.sql`; linked history is synchronized and the follow-up dry run is empty. Hosted integration is green at 121/121 total and M9 2/2; sanitized evidence is `migration-upgrade/m9/evidence/integration-hosted-dev-c4f327.json`. Commit/push this checkpoint, then update recovery state before deploying the M9 preview. CI `36230624958` had green static/migrations/integrations before GitHub polling rate-limited.

## Guardrails

- JobQuest1.0 is read-only.
- Never edit applied migrations.
- Do not touch main, Production, DNS, real legacy data, or cutover.
- Do not fold Journal, Calendar, Import/Export, or Extension work into M9.
