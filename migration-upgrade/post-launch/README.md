# JobQuest 2.0 Post-Launch Program

This directory is the canonical source of truth for active post-launch planning and governance. Historical milestone records under `migration-upgrade/m1` through `migration-upgrade/m15` remain evidence; they are not competing execution authority.

## Current position

- M15-E is formally closed. Production remains on the M15-E release.
- Current implementation work must use `feature/*` or `fix/*` branches and integrate through `development`.
- `main`, Production, Production data, and legacy-infrastructure retirement remain frozen until separately authorized gates. M15-F is the final release/stabilization phase before separately authorized retirement.

## Canonical records

- [Roadmap](POST_LAUNCH_ROADMAP.md) — ordered phases, priorities, execution profiles, and branch/CI policy.
- [Execution checklist](POST_LAUNCH_EXECUTION_CHECKLIST.md) — exact resume fields for every phase/task.
- [Deferred backlog](DEFERRED_BACKLOG.md) — permanent register of selected, deferred, verification, and reserved work.
- [Agent handoff template](AGENT_HANDOFF_TEMPLATE.md) — required abrupt-stop and end-of-prompt handoff format.
- [PL-0B-2 implementation report](PL0B2_GOVERNANCE_IMPLEMENTATION_REPORT.md) — evidence for this governance setup.

## Resuming work

1. Read `migration-upgrade/CURRENT_AGENT_STATE.md`, this README, the roadmap, and the one relevant historical source.
2. Verify Git/CI reality before trusting an historical status.
3. Choose the next approved task from the execution checklist; preserve all backlog items until explicitly completed or superseded.
4. End every execution prompt with required report/handoff updates. Do not push documentation to an integration branch while its exact application SHA is being certified.

## Status meanings

`SELECTED` is approved roadmap work; `IN PROGRESS` is active work on a named branch; `VERIFY IMPLEMENTATION` requires current-code/test evidence; `DEFERRED` remains legitimate but unscheduled; `BLOCKED` needs an external decision or prerequisite; `COMPLETED` requires evidence; `SUPERSEDED` records its successor; `RESERVED` is intentionally held for a future authorized gate.
