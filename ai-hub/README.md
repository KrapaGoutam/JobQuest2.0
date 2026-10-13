# JobQuest AI Hub — Planning & Handoff Foundation

JobQuest stays the system of record; Claude / Gemini / ChatGPT act as subscription-powered workers that read context and write **findings** back through a shared remote MCP layer. Findings become core data only after operator **Accept**. Status: AI-0 (planning) complete; AI-1 awaits operator approval. Nothing here is implemented.

## Start here (any new agent or session)

1. `CURRENT_AGENT_STATE.md` — short, operational
2. `HANDOFF.md` — durable transfer doc, includes the **interruption** and **agent-switch** protocols
3. the current phase report in `reports/`
4. only the relevant doc below. Do not redo the audit or rerun green tests/CI.

## Map

| Doc | Purpose |
|---|---|
| `ROADMAP.md` | progress checklist |
| `PHASE_REGISTRY.md` | every phase's attributes |
| `IMPLEMENTATION_PHASES.md` | dependency graph, gate matrix, AI-1 scope |
| `ARCHITECTURE.md` | principles, layers, read/write layer, flags, decisions D-1…D-8 |
| `DATA_MODEL_PLAN.md` | tables, canonical contract, dedupe, retention |
| `SECURITY_AUTH.md` | trust model, injection, auth options, RLS |
| `ENVIRONMENT_STRATEGY.md` | Dev/Prod, isolation risks, env vars |
| `PROVIDER_CAPABILITY_MATRIX.md` | provider facts (update freely) |
| `PROVIDER_INTEGRATION_PLAN.md` | MCP, workflows, failures, who-does-what |
| `UI_UX_PLAN.md` | navigation and screens |
| `TESTING_CI_RELEASE_STRATEGY.md` | CI facts, test layers, release |
| `CURRENT_STATE_AUDIT.md` | frozen baseline (do not edit; addenda only) |
| `OPEN_QUESTIONS.md` | classified questions |
| `reports/` | one report per phase; never rewrite old ones |

Reserved (not created): `AI_HUB_FINAL_RELEASE_REPORT.md` — template sections: included/shelved phases, migrations, providers, security architecture, CI, final development & main SHAs, deployment, manual acceptance, known limitations, rollback.

## Standing rules

Follow repo `CLAUDE.md` and `.agents/AGENTS.md` (Git safety, exact-path staging, main/production frozen). AI migrations: dev project only. Agents never create secrets or claim provider setup. Phases stop at every gate in `IMPLEMENTATION_PHASES.md` §3.
