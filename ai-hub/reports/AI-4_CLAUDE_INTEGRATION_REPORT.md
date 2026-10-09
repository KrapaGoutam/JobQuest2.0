# AI-4 — Claude Integration: Report

**Status:** READY FOR BRANCH CI (local validation complete; remote Claude smoke, development integration and development CI pending — updated below as they complete).
Branch `feature/ai-4-claude-integration`, base development `ed517594d58dedf26b6144d61b2e9ac2f8e60a58` (unchanged by fetch).

## AI-3 final facts (persisted at AI-4 start)
AI-3 COMPLETE. Development SHA `ed517594d58dedf26b6144d61b2e9ac2f8e60a58`; development CI `37820583043` PASS; executable feature SHA `d8657e54` (implementation `bac31196`), branch CI `37819293115` PASS. main `26e517ea7cd8e6be421ad2c2188d8ceee4bfb224` and Production unchanged.

## Integration mechanism
Claude custom **remote MCP connector** -> JobQuest `/api/mcp` (AI-3, Streamable HTTP, stateless). Claude reaches JobQuest from Anthropic's cloud, so the endpoint must be internet reachable. There is **no Claude backend adapter**, no Anthropic Messages API, no `@anthropic-ai/sdk`, no `ANTHROPIC_API_KEY` (asserted by a unit test over manifests and shipped files). JobQuest stores no Claude password/cookie/OAuth token/API key; Claude stores the JobQuest connector credential on its side and JobQuest stores only the hash of its own token.

## Authentication
Fixed request header `Authorization: Bearer <JobQuest connector token>` using the existing AI-3 token system (`ai_connector_tokens`; no second token table, no provider secrets). OAuth is not added and no OAuth metadata is advertised.

## Provider setup UX (Settings -> AI & Automation -> Providers -> Claude)
`ClaudeConnectorPanel` (+ `lib/claudeConnector.ts`, `api/aiConnectors.ts`); the Gemini/ChatGPT rows are unchanged ("Not configured").
- States: **Not configured** (button *Set up Claude*), **Connector ready** (active credential: name, prefix, scopes, created, expiry, *Last used* / *Not used yet*), *Previous credentials* (expired / revoked, never presented as active, no token hash shown). It never says "Connected"; there is no heartbeat, polling or provider session.
- Presets: **Read only** (`jobquest:read`, `ai:read`; recommended default) and **Read + AI findings** (adds `ai:ingest`). No write/admin/wildcard scope exists.
- Expiry 7 / 30 (default) / 90 days; no permanent token.
- Credential name is the fixed convention `Claude connector` (metadata only; security does not depend on it).
- Show-once reveal: copy token, copy MCP URL (`<current origin>/api/mcp`, never a hard-coded host), copy header value (`Bearer <token>`), six-step Claude instructions (Customize -> Connectors -> Add custom connector -> URL -> fixed request header -> enable for the conversation), concise security notice. No "show again": a lost token is revoked and replaced.
- Revocation: confirmation dialog, uses the existing `/api/ai/connector-tokens/:id/revoke`; the credential fails on the next MCP request.
- The raw token lives only in the `revealed` React state (cleared on close/unmount); source-level tests assert no localStorage/sessionStorage/IndexedDB/cookie/history/URL/query-cache/analytics/console use in the Claude files.
- No `ai_workflow_configs` mutation; Claude is **attended (user-initiated)**, not autonomous.

## Manager-token policy (operator decision)
Kept **RLS parity**: `connector principal = signed-in JobQuest principal`. A manager token sees exactly what the manager sees in the UI; MCP neither narrows nor broadens that. `SECURITY_AUTH.md` §5 rewritten accordingly (it previously suggested user-only filtering). Regression `AI4-04` asserts the manager MCP application and AI-run id sets are **equal** to the manager's own RLS client result sets, and that a peer sees only own rows, cross-workspace sees nothing and a suspended member / suspended manager is rejected (401) on the next call.

## MCP endpoint and tools
`/api/mcp`. Tools unchanged (six; no tool added): `jobquest_list_applications`, `jobquest_get_application`, `jobquest_list_ai_runs`, `jobquest_list_ai_findings`, `jobquest_list_ai_suggestions` (read) and `jobquest_submit_ai_result` (the only write; AI Hub only). **Description changes** (text only, `apps/api/src/mcp/tools.ts`): each read tool now states what it is for, that it is read-only and what it is not (not job discovery / web search / Claude conversation history / application creation); `get_application` states private notes, salary and contacts are never included; `submit` is prefixed `WRITE (AI Hub only)`, names `jobquest.ai-result` + provider `claude`, says to call it only when the user asks to record an analysis and that it does NOT change application status, create applications, edit contacts or complete tasks. Descriptions stay static, concise (< 720 chars) and non-coercive (asserted). No schema or output change, so application privacy is unchanged.

## Provider identity
Canonical provider `claude` (existing vocabulary); `claude-pro`, `claude-code`, `anthropic-cloud` remain invalid (tested). Client surface (Claude web vs Claude Code) is not recorded: the schema has no approved storage for it and none was added.

## Evaluation scenarios
Deterministic fixtures in `tests/unit/fixtures/claude-eval/scenarios.ts` (E1 pipeline read, E2 application detail, E3 AI history, E4 finding submission, E5 unsupported write, E6 prompt injection, E7 scope, E8 revocation) assert tool availability per scope; the server-side behaviour is proven in `tests/integration/ai-4-claude.test.ts`. Probabilistic Claude tool choice is exercised in the live smoke only.

## Local test results (before push)
| Check | Result |
|---|---|
| New unit `ai-4-claude.test.ts` (helpers, UI states, token hygiene, descriptions, eval fixtures, no Anthropic API) | 30/30 |
| New integration `ai-4-claude.test.ts` (real local DB: presets/expiry, scope enforcement, provider `claude`, no core write tool, manager RLS parity, injection, revocation) | 6/6 |
| AI-3 regression (unit + integration `ai-3-mcp`), AI-2 (`ai-2a`, `ai-2b`), AI-1B, M11 extension, M12 | all pass (integration run: 7 files / 75 tests) |
| Full unit suite (once) | 33 files, **429/429** |
| Root `pnpm typecheck` | PASS (`tests/unit/ai-4-claude.test.ts` added to the root tsconfig excludes next to the other React-rendering tests, which web/vitest cover) |
| `eslint .` | PASS |
| `pnpm build`, `check:bundle` | PASS (bundle: 3 files, 0 findings); local build only, no Production call |
| `check:secrets` (tracked files) | 0 findings (1069 files; run before staging, repeated on staged diff by manual inspection) |

## Migration / database
**None.** Dev head `20261026100000`; Prod head `20261022100000`; Production database not touched.

## Remote Claude smoke, CI, development integration
_Pending — filled in as each gate completes._

## Deferred
Scheduled Claude workflow / Morning Brief and workflow-config mutation; OAuth; Claude Skill (not created; live evaluation decides); suggestion cross-run re-proposal policy; application matching; core AI writes (AI-11); Gemini and ChatGPT provider phases (separate architectures, not extrapolated from Claude); Production rollout.
