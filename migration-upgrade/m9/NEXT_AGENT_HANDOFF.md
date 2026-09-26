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

M8 is merged and development CI is green. M9 is pushed through hosted checkpoint `0bff1e4`. The M9 migration is applied locally and on `jobquest-dev`; hosted integration is 121/121. Full local gates and focused Playwright pass.

## Next action

Preview is externally blocked: CLI returned `Not authorized`; the connected deploy action cannot constrain Preview and was safety-rejected; read-only connector access returned 403 requiring re-authentication to scope `one-piece-5779`. No deployment was created. Finish the independent local performance-evidence run, reports, and checkpoint, but do not merge M9 or start M10 until Vercel access is restored and Preview/CI gates are green.

## Guardrails

- JobQuest1.0 is read-only.
- Never edit applied migrations.
- Do not touch main, Production, DNS, real legacy data, or cutover.
- Do not fold Journal, Calendar, Import/Export, or Extension work into M9.
