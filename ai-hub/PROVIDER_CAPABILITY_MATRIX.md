# AI Hub — Provider Capability Matrix

**Update this file when provider behavior changes; do not change architecture docs for it.**

Statuses (never collapsed into “Supported”): `VERIFIED` (observed in a real test in the operator’s account) · `DOCUMENTED` (official documentation says so; not tested here) · `APPROVAL-GATED` (works only with a human approval click) · `PLAN-GATED` (the operator’s plan does not offer it) · `BLOCKED` (the provider requires a capability JobQuest deliberately does not implement in this phase) · `NOT SUPPORTED` · `NOT TESTED`.

## AI-9 capability matrix (current)

**Verification date: 2026-10-12.** Method: current official documentation read by the agent (Google Gemini Apps Help; OpenAI Help and OpenAI developer docs), plus operator-reported live provider gates. Anything not marked `VERIFIED` or `BLOCKED` was **not** exercised against the operator’s accounts. Operator provider-gate results are recorded in the “AI-9 provider gate results” section below.

| Dimension | Claude (Pro/Max) | Gemini (personal Google AI plan) | ChatGPT Plus |
|---|---|---|---|
| Custom MCP / plugin configuration UI | **VERIFIED** (AI-4): custom connector | **VERIFIED AVAILABLE** (operator gate): custom-app UI accepted the JobQuest MCP URL and reached the endpoint | **VERIFIED AVAILABLE** (operator gate): Plus account exposed Add custom MCP server, Create as a plugin and advanced OAuth configuration |
| Authenticated JobQuest connection | **VERIFIED** (AI-4): fixed `Authorization: Bearer` header | **BLOCKED — STANDARD OAUTH REQUIRED**; current scoped bearer auth rejected | **BLOCKED — OAUTH 2.1 REQUIRED**; no bearer/API-key field was offered in the observed custom-MCP flow |
| OAuth discovery / registration | Not required for verified Claude path | JobQuest publishes no OAuth/DCR metadata; OAuth not implemented | Discovery **FAILED**; DCR unavailable; CIMD unavailable; user-defined OAuth client not configured because JobQuest has no authorization server |
| Read tools | **VERIFIED** (AI-4) | NOT TESTED — AUTH BLOCKED | NOT TESTED — AUTH BLOCKED |
| AI-ingest write (`jobquest_submit_ai_result`) | **VERIFIED** (AI-4) | NOT TESTED — AUTH BLOCKED | NOT TESTED — AUTH BLOCKED |
| Core writes exposed to the provider | **NONE** (11 tools, 1 AI-Hub-only write) | **NONE** (same surface) | **NONE** (same surface; AI-8 execution endpoints are not provider tools) |
| Scheduled tasks exist | Claude scheduled tasks: operator-owned, optional live test not performed (AI-5) | **DOCUMENTED**: Scheduled Actions (Google AI Pro/Ultra or eligible Workspace; Keep Activity on; limited number of active actions) | **DOCUMENTED**: scheduled tasks (Plus: 5 active) and event-triggered Work tasks (Gmail / Slack / GitHub) |
| Scheduled use of the JobQuest connector / plugin | NOT TESTED | **NOT TESTED — AUTH BLOCKED** | **NOT TESTED — AUTH BLOCKED** |
| Unattended read | NOT TESTED | NOT TESTED — AUTH BLOCKED | NOT TESTED — AUTH BLOCKED |
| Unattended AI-ingest write | NOT TESTED | NOT TESTED — AUTH BLOCKED | NOT TESTED — AUTH BLOCKED |
| Email access | connector-dependent (Gmail connector observed in the operator’s Claude) | DOCUMENTED (Gmail via Connected Apps) | DOCUMENTED (Gmail connected app; also a Work event trigger) |
| Calendar access | connector-dependent | DOCUMENTED (Google Calendar via Connected Apps) | NOT TESTED |
| Job web research | provider-dependent | provider-dependent | provider-dependent |
| Manual approval behavior | per-tool Allow / Ask | “requires manual confirmation for any write actions” (**documented**) | pauses for approval on writes (documented for connected apps) |
| Plan requirement | Pro/Max for the operator | eligible personal Google account; UI verified in operator account | Plus operator account exposed custom-MCP/plugin creation UI; authenticated use still requires OAuth |
| Verified date | 2026-10-11 (AI-4) | 2026-10-12 operator gate (UI/auth only) | 2026-10-12 operator gate (UI/auth only) |

### Sources (read 2026-10-12)

- Gemini: <https://support.google.com/gemini/answer/17209137> (“Connect & manage custom apps for Gemini Apps”: eligibility, steps, DCR/advanced credentials, “Gemini requires manual confirmation for any write actions”). Scheduled Actions: Google’s launch post <https://blog.google/products/gemini/scheduled-actions-gemini-app/> (no custom-app statement found).
- OpenAI Help: <https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt> (full MCP incl. write: Business / Enterprise / Edu), <https://help.openai.com/en/articles/20001256-plugins-in-chatgpt>, <https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt>. These help pages returned HTTP 403 to the agent’s fetch tool; their content was taken from search excerpts and **must be re-confirmed in the operator’s account**.
- OpenAI developers: <https://developers.openai.com/plugins/quickstart>, <https://developers.openai.com/plugins/build/plugins> (package format, `api_key`/`bearer` auth declaration), <https://developers.openai.com/plugins/build/auth> (OAuth 2.1 preferred; “does not support … custom API keys”), <https://developers.openai.com/plugins/build/mcp-events>.

### What changed since the AI-0 assumptions

1. Gemini: a Google primary source now exists (the AI-0 note said none). Custom apps are documented for personal accounts — not Ultra-only.
2. ChatGPT: “developer mode” full MCP is documented for workspace plans (Business / Enterprise / Edu). Plus has plugins and scheduled/event tasks but no documented direct MCP connector. A plugin package format and auth declarations are now documented.
3. Neither provider’s scheduled mode is documented to call a custom MCP app/plugin or to bypass write approvals.

### AI-9 provider gate results (operator-reported; no token values, no private content)

| Item | Result |
|---|---|
| GEMINI custom-app UI | **VERIFIED AVAILABLE** |
| GEMINI MCP endpoint | **REACHABLE** |
| GEMINI authenticated JobQuest connection | **BLOCKED — STANDARD OAUTH REQUIRED** |
| GEMINI current bearer auth | **NOT SUPPORTED BY GEMINI** |
| GEMINI tool discovery / read / AI ingest | NOT TESTED — AUTH BLOCKED |
| GEMINI scheduled read / scheduled JobQuest push | NOT TESTED — AUTH BLOCKED |
| GEMINI temporary credential | **REVOKED — operator confirmed**; post-revocation test not required because Gemini never accepted it |
| CHATGPT PLUS custom-MCP / plugin UI | **VERIFIED AVAILABLE** |
| CHATGPT create-as-plugin flow | **VERIFIED AVAILABLE** |
| CHATGPT authentication | **OAUTH 2.1 REQUIRED**; no bearer/API-key field offered |
| CHATGPT current JobQuest bearer auth | **NOT COMPATIBLE** with the observed custom-MCP flow |
| CHATGPT temporary connector token | **NONE CREATED** |
| CHATGPT OAuth discovery | **FAILED** — JobQuest publishes no OAuth metadata |
| CHATGPT DCR / CIMD | **UNAVAILABLE** with current JobQuest server |
| CHATGPT user-defined OAuth client | NOT CONFIGURED — JobQuest has no OAuth authorization server |
| CHATGPT JobQuest read / AI ingest | NOT TESTED — AUTH BLOCKED |
| CHATGPT scheduled read / scheduled AI ingest / Gmail event trigger | NOT TESTED — AUTH BLOCKED |
| CORE WRITE BYPASS (any provider) | NONE |

### Shared AI-9 authentication finding

Both Gemini and ChatGPT expose provider-side custom MCP integration paths, but neither can authenticate to JobQuest's current scoped bearer-token MCP server. Both require a standards-based OAuth authorization layer. The future architecture is **one provider-neutral, standards-compliant JobQuest OAuth layer** for Gemini, ChatGPT and future OAuth-capable providers — not separate provider auth implementations, no-auth mode or bearer workarounds. OAuth was not implemented in AI-9.

---

# Historical detail (AI-0 / AI-4) — kept for reference; the AI-9 matrix above supersedes it where they differ

Verification dates are `2026-10-07`. Method: one standard web search per provider during AI-0 (search-engine summaries of vendor and third-party pages — **not** hands-on tests in the operator's accounts). Nothing here has been verified against the operator's actual plans. Anything marked NEEDS RECHECK must be confirmed in the operator's account (or official docs) before an implementation phase relies on it.

Readiness: `VERIFIED / READY NOW` · `LIMITED` · `NEEDS RECHECK` · `FUTURE` · `UNSUPPORTED`. "Observed" = seen directly in this Claude Code session's connected tools.

## Sources

- [C1] Claude Help Center — "Getting started with custom connectors using remote MCP" (support.claude.com/en/articles/11175166)
- [O1] OpenAI — "ChatGPT Developer mode" (developers.openai.com/api/docs/guides/developer-mode)
- [G1] Gemini custom app/MCP: third-party pages only (harvv.com/install/gemini, skillsplayground.com/integrations/gemini); **no Google primary source found** — conflicting.

## Matrix

| Capability | Claude Pro / Cowork | Google AI Pro / Gemini | ChatGPT Plus |
|---|---|---|---|
| Subscription-native reasoning (no separate API billing) | NEEDS RECHECK — chat/Cowork use subscription quota by design; unattended-run quota behavior unverified | NEEDS RECHECK | NEEDS RECHECK |
| Remote MCP / custom connector | **VERIFIED (AI-4, 2026-10-11) end to end.** Earlier doc finding: custom remote MCP connectors available on Free/Pro/Max/Team/Ent, in beta; connects from Anthropic cloud, so server must be publicly reachable [C1] | **NEEDS RECHECK / conflicting**: one source says custom apps need Google AI Ultra; another says any remote MCP URL via Settings → Connected apps since June 2026 [G1] | **LIMITED**: Developer mode (beta) available to Plus/Pro/Business/Ent/Edu on web; HTTPS public URL; SSE + streamable HTTP; optional OAuth [O1] |
| MCP read tools | READY (same as above) | NEEDS RECHECK | LIMITED (developer mode) |
| MCP write tools | READY; per-tool Allow/Ask/Blocked [C1] | NEEDS RECHECK | LIMITED: write = any tool without `readOnlyHint`; **confirmation required by default** [O1] |
| Unattended write | NEEDS RECHECK — an "Ask" tool may stall scheduled tasks (inference) | NEEDS RECHECK | LIMITED/likely UNSUPPORTED — per-call confirmation; "remember" only within one conversation [O1] |
| Manual approval requirement | Configurable per tool (Allow avoids prompt) | unknown | Default on for writes |
| Auth to custom MCP | **VERIFIED (AI-4)**: fixed `Authorization: Bearer` request header works; OAuth not required | NEEDS RECHECK | OAuth optional; no-auth allowed per [O1] summary — headers support NEEDS RECHECK |
| Scheduled / recurring workflows | NEEDS RECHECK — Cowork reportedly has scheduled tasks (third-party only); whether they can call remote connectors on Pro unverified | NEEDS RECHECK (Gemini scheduled actions exist in consumer app per general knowledge; custom-connector use unverified) | NEEDS RECHECK — ChatGPT Tasks exist; connector use in tasks unverified |
| Event triggers | FUTURE | FUTURE | FUTURE |
| Background execution (device closed) | NEEDS RECHECK — Cowork runs on user's computer | NEEDS RECHECK | NEEDS RECHECK |
| Gmail read | Observed: Gmail connector available in this session's Claude account (read/label/draft/send tools) — plan-specific availability NEEDS RECHECK | NEEDS RECHECK (native Workspace integration expected) | NEEDS RECHECK |
| Calendar read | Observed: Google Calendar connector in this account | NEEDS RECHECK (native expected) | NEEDS RECHECK |
| Drive | Observed: Google Drive connector in this account | NEEDS RECHECK (native expected) | NEEDS RECHECK |
| Web search | Observed (WebSearch tool in Claude Code; claude.ai availability NEEDS RECHECK) | NEEDS RECHECK | NEEDS RECHECK |
| Custom app/plugin path | Custom connector (Settings → Connectors) | Connected apps → custom app (web, English only per [G1]) | Settings → Apps → Advanced → Developer mode |
| Usage limits | Plan-based rolling limits; scheduled work counts — NEEDS RECHECK | NEEDS RECHECK | NEEDS RECHECK |
| Account/plan restriction | Free: 1 custom connector; Pro: none stated [C1] | Possibly Ultra-only (disputed) | Developer mode: web only, not mobile |
| Local stdio MCP | UNSUPPORTED for connectors-in-cloud (local servers separate; not in Cowork/claude.ai) | UNSUPPORTED (remote only) | UNSUPPORTED (public HTTPS only) |
| Overall readiness for JobQuest Daily Brief (read + save findings) | **LIMITED → best first target** | NEEDS RECHECK (may be blocked by plan) | LIMITED (confirmation friction) |

## Claude custom connector — VERIFIED by AI-4 (2026-10-11)
Source: real Claude custom connector against the JobQuest Dev Preview MCP endpoint (operator-performed smoke; see `reports/AI-4_CLAUDE_INTEGRATION_REPORT.md`). Applies to the operator's Claude plan/account only; Gemini and ChatGPT are NOT extrapolated from this.

**VERIFIED**
- A custom remote MCP connector can be added to Claude and reaches JobQuest's public HTTPS `/api/mcp` from Anthropic's cloud (Vercel Preview deployment protection did not block it).
- Auth: a fixed request header `Authorization: Bearer <JobQuest connector token>` is accepted; no OAuth was needed.
- Claude discovers tools via Streamable HTTP and classifies them from MCP annotations (`readOnlyHint`): five reads read-only, the submit tool the single non-read-only tool.
- Read tools (applications, application detail, AI findings/runs) work; the write-capable tool works with an `ai:ingest` credential; a missing write tool is reported as unavailable (no core mutation possible).
- Revoking the connector credential in JobQuest denies the next Claude call before any data is returned.
- Claude can author a valid `jobquest.ai-result 1.0` after correction; first attempts omitted `generated_at` and per-finding `dedupe`.

**ASSUMED / NOT TESTED**
- Live ingest denial for a read-only credential in Claude (covered by automated server tests only).
- Scheduled / unattended Claude use of the connector, per-tool Allow/Ask/Blocked behaviour for the write tool, Cowork, mobile, Claude Code surface, usage limits, plan variations, and OAuth for Claude.
- Gmail/Calendar/Drive workflows through JobQuest data.

## Implications for roadmap

1. Build provider-neutral MCP once; **AI-4 (Claude) first** because remote connectors on Pro are the best-documented path.
2. Gemini plan eligibility must be settled by the operator **before** AI-5 is scheduled; if Pro cannot add custom apps, AI-5 → FUTURE/SHELVED.
3. ChatGPT unattended writes are probably blocked by confirmation gates; AI-6 may be "manual, operator-attended" mode only.
4. Do not promise scheduled/unattended behavior for any provider until a throwaway-connector spike confirms it (AI-3 operator gate "provider spike").
5. Auth mechanism (static token vs OAuth) per provider is the biggest unknown: `SECURITY_AUTH.md` §3.

## Change log
- 2026-10-07 — initial population (AI-0G).
- 2026-10-11 — AI-4: Claude custom connector VERIFIED (discovery, annotations, reads, ingest, fixed-header auth, revocation). Gemini/ChatGPT unchanged.
