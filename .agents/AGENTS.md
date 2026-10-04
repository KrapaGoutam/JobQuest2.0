# JobQuest Agent Instructions

## Start Here

At the start of every task:

1. Read migration-upgrade/CURRENT_AGENT_STATE.md.
2. Read only the handoff/report relevant to the current milestone.
3. Inspect Git reality before assuming branch/SHA/CI state.
4. Do not reread the entire migration-upgrade tree unless required.

## Source Authority

Current verified code/database reality outranks stale documentation.

Order:

1. explicit current user instruction
2. current approved ADR/change request
3. current repository/database behavior
4. CURRENT_AGENT_STATE.md
5. current milestone handoff
6. historical milestone reports

Preserve old reports as history rather than rewriting them.

## Git

Never implement normal work directly on development or main.

Use:

fix/<name>
feature/<name>
chore/<name>

depending on task.

Never:

git reset --hard
git rebase shared branches
git push --force
git add .
git add -A
git add --all
git commit -a

Stage files explicitly.

Before EVERY commit:

1. git status --short
2. git diff --cached --name-status
3. inspect every staged path
4. confirm every staged file is intentional
5. stage only exact paths

If an unexpected generated file is present:
do not stage it.

Promotion:

fix/feature branch
→ local verification
→ push
→ exact-head CI
→ Preview/manual QA when UI-facing
→ merge --no-ff to development
→ exact development CI
→ merge --no-ff development to main
→ exact main CI
→ production deployment
→ production smoke

Do not skip a gate.

Development is the integration branch. Main and Production remain frozen until
the separately authorized M15-F gate; never merge development to main before it.

While an exact development application SHA is still being certified, do not push
a docs/checkpoint-only commit to development. Report temporary handoff state in
the agent response, and record application/CI-tested SHA separately from any
later docs HEAD.

Use one GitHub Actions observer per phase (the primary agent). Once known, query
the exact run ID; active watching must use an interval of at least 60 seconds. On
HTTP 403/429, stop polling, check local primary quota once, honor Retry-After or
reset, and back off 1/2/5/10 minutes. Do not evade limits with other credentials.

## Production

JobQuest1 is read-only standby until separate retirement approval.

Never destroy:

legacy Neon
legacy Render
migration backups
claim-code vault
production recovery backups

Never expose secrets in:

Git
docs
logs
screenshots
agent output

## Release Freeze

During M15 only allow:

release blockers
bugs
security issues
data-integrity fixes
critical accessibility fixes
required launch polish

Do not add unrelated product features.

## Context Economy

Do not paste entire files into conversation when grep/find/range reads are enough.

Do not repeatedly reread files already understood unless they changed.

Do not produce long progress narration.

Write durable state to CURRENT_AGENT_STATE.md at coherent checkpoints.

Use subagents only for isolated research/review.

Use shell/background tasks for builds/tests.

Main implementation agent owns edits.

Maximum 2 subagents concurrently unless explicitly justified.

## Testing

Run narrow tests first.

Then required broader suite.

Do not rerun a full expensive suite after every tiny edit.

Typical order:

targeted unit/component
→ targeted integration
→ lint/typecheck
→ affected E2E
→ full required CI once branch is coherent

## Subagents

Research subagents:
read-only.

Test-auditor:
read/test only.

Release-reviewer:
read-only independent review.

Do not delegate implementation of sequential tightly-coupled files to
parallel agents.

## Reporting

Keep routine status concise.

At completion report:

branch
SHA
tests
CI
Preview
manual QA
remaining blockers
next exact action

Always include whether development, main, Production, and the production data
services were changed.
