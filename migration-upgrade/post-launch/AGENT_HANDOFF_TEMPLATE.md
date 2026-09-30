# Post-Launch Agent Handoff Template

Copy this template into the relevant phase report and `CURRENT_AGENT_STATE.md` at each coherent checkpoint.

```text
PROJECT: JobQuest 2.0
PHASE:
TASK ID:
STATUS:
WHERE / TOOL:
MODEL:
THINKING LEVEL:
SESSION TYPE:
SUBAGENTS USED:

CURRENT BRANCH:
BASE SHA:
CURRENT HEAD:
REMOTE HEAD:
LAST TESTED APPLICATION SHA:
FILES CHANGED:
MIGRATIONS:
DATABASE TARGET:

LOCAL TESTS:
CI RUN:
CI SHA:
CI RESULT:
PREVIEW URL:

PRODUCTION TOUCHED: YES/NO
DEVELOPMENT MERGED: YES/NO
MAIN MERGED: YES/NO

LAST COMPLETED ACTION:
NEXT EXACT ACTION:
BLOCKERS:
OPEN QUESTIONS:
DEFERRED ITEMS DISCOVERED:
OPERATOR APPROVAL STATUS:
SAFE TO RESUME: YES/NO
```

Do not place credentials, token values, private keys, or sensitive production data in a handoff. If exact-SHA certification is active, report temporary state in the agent response and persist it only after CI reaches a final result.
