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

M8 is merged and development CI is green. The M9 branch has been created and pushed. The repository-derived scope is Dashboard Parity: finish the dashboard portion of formal M9 without reopening the Goals/Analytics work delivered by M8.

## Next action

Finish and commit the planning package, then implement the additive profile preference foundation described in `IMPLEMENTATION_PLAN.md`. Update both this file and `CURRENT_AGENT_STATE.md` before any long test, hosted migration, deployment, CI wait, or branch merge.

## Guardrails

- JobQuest1.0 is read-only.
- Never edit applied migrations.
- Do not touch main, Production, DNS, real legacy data, or cutover.
- Do not fold Journal, Calendar, Import/Export, or Extension work into M9.
