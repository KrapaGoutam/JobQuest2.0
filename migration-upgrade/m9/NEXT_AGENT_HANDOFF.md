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

M8 is merged and development CI is green. M9 planning and preference foundation are pushed. The local M9 migration is applied and verified. Dashboard composition, the 30-widget tiered surface, accessible customization, preference isolation tests, and the Aging drill-through route are implemented. M9 unit 5/5, integration 2/2, web typecheck/lint/build pass.

## Next action

Confirm the dashboard UI checkpoint is pushed, then start the local web/API stack and run focused M9 browser verification. Update both this file and `CURRENT_AGENT_STATE.md` before the process start and before any full suite, hosted migration, deployment, CI wait, or branch merge.

## Guardrails

- JobQuest1.0 is read-only.
- Never edit applied migrations.
- Do not touch main, Production, DNS, real legacy data, or cutover.
- Do not fold Journal, Calendar, Import/Export, or Extension work into M9.
