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

M8 is merged and development CI is green. M9 planning is pushed. The preference foundation is implemented: additive profile JSON preferences, exact registry/default layouts, normalization/persistence helpers, and focused tests. Focused tests and web typecheck pass.

## Next action

Confirm the preference-foundation commit is pushed, then refactor `DashboardView.tsx` to compose existing M6/M8 data and render/customize the tiered widget layout. Update both this file and `CURRENT_AGENT_STATE.md` before any long test, hosted migration, deployment, CI wait, or branch merge.

## Guardrails

- JobQuest1.0 is read-only.
- Never edit applied migrations.
- Do not touch main, Production, DNS, real legacy data, or cutover.
- Do not fold Journal, Calendar, Import/Export, or Extension work into M9.
