# JobQuest Claude Entry Point

Read first:

1. .agents/AGENTS.md
2. migration-upgrade/CURRENT_AGENT_STATE.md
3. only the current milestone report/handoff when needed

Do not duplicate JobQuest history here.

Claude is normally used as:

- independent read-only reviewer
- second-opinion debugger
- security/release auditor

unless the user explicitly assigns Claude implementation ownership.

Never have Claude and Antigravity concurrently edit the same branch.

## Model Routing

Main session:
- Orchestrate with Sonnet.
- Do not load large logs/files into main context unnecessarily.

Delegate:
- repository discovery / large grep / artifact classification → Haiku
- long test logs / failure classification → Haiku
- implementation/debugging requiring edits → Sonnet
- final security/release review → Opus, once

Use subagents only when they isolate substantial context or specialized
work.

Do NOT delegate:
- one-line reads
- simple git status/diff
- trivial commands
- operations where maintaining sequential context is more efficient

Subagents count against usage limits too, so avoid unnecessary spawning.

## Git Safety

Never:

git add .
git add -A
git add --all
git commit -a
git push --force
git reset --hard
git clean -fd
git clean -fdx
rebase shared branches

Before every commit:

git status --short
git diff --cached --name-status

Stage exact intended paths only.

No implementation directly on development or main.

Promotion:

fix/*
→ local tests
→ branch push
→ exact-head CI
→ Preview/manual QA
→ development --no-ff
→ exact development CI
→ main --no-ff
→ exact main CI
→ production deployment
→ production smoke

Never skip a gate.

## Production

Production is READ ONLY unless the current user prompt explicitly
authorizes writes or deployment.

JobQuest1 remains read-only standby.

Do not expose secrets.

## Context Economy

Prefer:

targeted grep
targeted line reads
subagents for verbose exploration
test-results/ for generated artifacts

Avoid:

huge file dumps
repeated reads
long narration
historical evidence regeneration
