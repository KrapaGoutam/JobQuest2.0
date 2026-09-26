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

M8 is merged and development CI is green. M9 source is pushed through `3718f85`. The local M9 migration is applied and verified. Dashboard composition, the 30-widget tiered surface, accessible customization, preference isolation tests, and the Aging drill-through route are implemented. M9 unit 5/5, integration 2/2, web typecheck/lint/build, and focused Playwright 1/1 pass. Browser evidence records 0 axe blocking findings and 0px mobile overflow.

## Next action

Checkpoint and push the focused browser artifacts. Then update both this file and `CURRENT_AGENT_STATE.md` before the full local regression suite. The local Playwright command is `npx playwright test e2e/m9-dashboard.spec.ts` (no named project); run it outside the Windows sandbox if `uv_os_get_passwd` fails.

## Guardrails

- JobQuest1.0 is read-only.
- Never edit applied migrations.
- Do not touch main, Production, DNS, real legacy data, or cutover.
- Do not fold Journal, Calendar, Import/Export, or Extension work into M9.
