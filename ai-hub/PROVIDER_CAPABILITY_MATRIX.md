# AI Hub — Provider Capability Matrix

**Update this file when provider behavior changes; do not change architecture docs for it.**

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
| Remote MCP / custom connector | **LIMITED→READY**: custom remote MCP connectors available on Free/Pro/Max/Team/Ent, in beta; connects from Anthropic cloud, so server must be publicly reachable [C1] | **NEEDS RECHECK / conflicting**: one source says custom apps need Google AI Ultra; another says any remote MCP URL via Settings → Connected apps since June 2026 [G1] | **LIMITED**: Developer mode (beta) available to Plus/Pro/Business/Ent/Edu on web; HTTPS public URL; SSE + streamable HTTP; optional OAuth [O1] |
| MCP read tools | READY (same as above) | NEEDS RECHECK | LIMITED (developer mode) |
| MCP write tools | READY; per-tool Allow/Ask/Blocked [C1] | NEEDS RECHECK | LIMITED: write = any tool without `readOnlyHint`; **confirmation required by default** [O1] |
| Unattended write | NEEDS RECHECK — an "Ask" tool may stall scheduled tasks (inference) | NEEDS RECHECK | LIMITED/likely UNSUPPORTED — per-call confirmation; "remember" only within one conversation [O1] |
| Manual approval requirement | Configurable per tool (Allow avoids prompt) | unknown | Default on for writes |
| Auth to custom MCP | OAuth supported; static-token/authless support **NEEDS EXTERNAL VERIFICATION** | NEEDS RECHECK | OAuth optional; no-auth allowed per [O1] summary — headers support NEEDS RECHECK |
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

## Implications for roadmap

1. Build provider-neutral MCP once; **AI-4 (Claude) first** because remote connectors on Pro are the best-documented path.
2. Gemini plan eligibility must be settled by the operator **before** AI-5 is scheduled; if Pro cannot add custom apps, AI-5 → FUTURE/SHELVED.
3. ChatGPT unattended writes are probably blocked by confirmation gates; AI-6 may be "manual, operator-attended" mode only.
4. Do not promise scheduled/unattended behavior for any provider until a throwaway-connector spike confirms it (AI-3 operator gate "provider spike").
5. Auth mechanism (static token vs OAuth) per provider is the biggest unknown: `SECURITY_AUTH.md` §3.

## Change log
- 2026-10-07 — initial population (AI-0G).
