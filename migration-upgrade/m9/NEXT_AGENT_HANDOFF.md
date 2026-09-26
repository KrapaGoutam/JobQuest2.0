# QUICK RECOVERY

Repository:
`feature/m9-dashboard-parity`
`de220e8c7fa6934b4bf905915d2f47ebcf065248` (final executable/test SHA; run git commands below for the later closeout/recovery docs HEAD)

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

M8 is merged and development CI is green. M9 executable/test work is pushed through `de220e8c7fa6934b4bf905915d2f47ebcf065248`; blocked closeout reports are pushed at `2a94e6f`. The migration is applied locally and on `jobquest-dev`; hosted integration is 121/121. Full local gates, Playwright, axe, responsive, and performance checks pass.

## Next action

Stop and obtain Vercel re-authentication for team scope `one-piece-5779`. Preview is externally blocked: CLI returned `Not authorized`; connected deploy cannot constrain Preview and was safety-rejected; read-only access returned 403. No deployment was created. After re-authentication, deploy Preview-only, verify health/E2E/bundle, confirm final executable CI, update reports, then and only then conditionally merge M9 and begin M10.

## Guardrails

- JobQuest1.0 is read-only.
- Never edit applied migrations.
- Do not touch main, Production, DNS, real legacy data, or cutover.
- Do not fold Journal, Calendar, Import/Export, or Extension work into M9.
