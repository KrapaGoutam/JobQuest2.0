# M15-E Extension Remediation

Branch: `fix/m15e-extension-connection-ui`
Base: `fix/m15e-site-functional-remediation` @ `0a534b45` (site remediation, already
passed operator manual Preview QA)

## Status

| Phase | Description | Status |
|---|---|---|
| A | Current extension architecture audit | DONE — see repo-auditor findings folded into `EXTENSION_CONNECTION_AUDIT.md` |
| B | Connection flow repair (Save/Test conflation, token exposure, whitespace) | DONE — see `EXTENSION_CONNECTION_AUDIT.md` |
| C | Import approved Claude Design project | **BLOCKED — no `claude_design` MCP connected in this session. Operator must run `/design-login` and reconnect it.** |
| D | Persistent Side Panel UI | Blocked on C |
| E | Dashboard + Analytics integration | Blocked on C/D |
| F | Extension automated QA | Partial (connection-flow tests only so far) |
| G | Build/package extension | Not yet run this phase |
| H | Preview/development backend QA | Not yet run |
| I | Release security review (Opus, once) | Not yet run |
| J | Operator manual extension QA | Not started |

## Why Phase B ran before Phase C

The task's own phase ordering lists Phase B (connection repair) before Phase C
(design import), and separately states: "Before implementing the redesign, make
the extension CONNECTION FLOW correct and testable. Do not visually redesign
broken functionality." Phase B has no dependency on the visual design, so it
proceeded while Phase C remains blocked on `/design-login`.

## Claude Design import — blocked

No MCP server or tool in this session can read
`https://claude.ai/design/p/24b6a249-3de5-448f-a103-a63129dc926c?file=JobQuest+Side+Panel.dc.html`
or its `support.js` dependency. Per the task's explicit instruction, this session
does not proceed with an inferred or reconstructed design, and does not treat the
earlier textual UI description from this conversation as a substitute for the
actual approved mockup.

**Operator action required:** run `/design-login` to reconnect the `claude_design`
MCP, then resume this task from Phase C.

## Documents in this folder

- `README.md` — this file
- `EXTENSION_CONNECTION_AUDIT.md` — Phase A/B findings and fixes
- `EXTENSION_DESIGN_IMPLEMENTATION_MAP.md` — not yet created; blocked on Phase C
- `EXTENSION_QA_PLAN.md` — test strategy for all phases
- `EXTENSION_CLOSEOUT_REPORT.md` — not yet created; written at the end of this task
