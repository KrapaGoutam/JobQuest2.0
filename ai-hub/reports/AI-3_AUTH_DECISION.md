# AI-3 — MCP Authentication Decision

**Decision: B — secure scoped connector-token authentication, behind an OAuth-ready principal boundary.**
`FULL OAUTH PROVIDER — DEFERRED UNTIL A STANDARDS-COMPLIANT AUTHORIZATION PROVIDER IS SELECTED/AVAILABLE` (does not block AI-3).

## Inspected (current JobQuest auth)
- Sessions are custom ES256 JWTs minted by the Node API (`lib/tokens.ts`), verified by the Supabase Data API; refresh tokens are rotating single-use rows. RLS requires a **live `auth_sessions` row** (`app.session_is_active()`), so any user-scoped read must carry a JWT whose `session_id` is live.
- Extension tokens (`extension_tokens`, `lib/extensionTokens.ts`): opaque `jqx_*`, HMAC-SHA256 hash only, prefix, scopes, ≤365-day expiry, revocation, `last_used_at`, service-role-only create/revoke/rotate RPCs, audit rows.
- There is **no OAuth 2.1 / OIDC authorization server** in the repository (no authorize/token endpoints, no DCR/CIMD, no consent, no PKCE issuance, no JWKS/issuer for third parties). The session JWT issuer is internal (`aud=authenticated`) and is not an MCP-grade authorization server.

## Options
| | Verdict |
|---|---|
| **A. Existing standards-compliant OAuth/OIDC server** | Not available. Building one (authorization-code + PKCE, DCR/CIMD, consent, refresh, protected-resource metadata) is a separate identity-security system; explicitly out of AI-3 scope. |
| **B. Scoped connector tokens** | **Chosen.** Reuses the proven extension-token pattern; individually revocable, expiring, scoped, user+workspace-bound, testable today with Claude Code, MCP Inspector and the official SDK client. |
| **C. Both** | Not now. The boundary is built so a bearer verifier for OAuth can be added later without touching tools. |

## What was built
- Table `ai_connector_tokens` (migration `20261026100000_ai_hub_mcp_auth.sql`): hash only (`jq_mcp_<dev|live>_` + 43 base62 chars ≈ 256 bits from `randomBytes` with rejection sampling), 15-char display prefix, `scopes ⊆ {jobquest:read, ai:read, ai:ingest}`, expiry ≤ 90 days (default 30; UI/API choices 7/30/90), `last_used_at`, `revoked_*`.
- Hash: `HMAC-SHA256(key = HMAC(pepper, "jq-ai-connector-token-v1"), token)`. The existing `EXTENSION_TOKEN_PEPPER` is reused with **domain separation** (a new env secret would have required an operator change in Vercel; the derived key means an extension-token digest can never validate here). Lookup is an indexed equality on the digest (the standard HMAC-then-index pattern; no plaintext in SQL, no comparison of secrets in application code that could short-circuit).
- Each token owns a dedicated **`auth_sessions` row** (`user_agent='mcp-connector'`, expiry = token expiry, no refresh token). Reads then run **as the user under RLS** with a 120-second user JWT minted per request (never returned to the client). Consequences (all intended, all tested): revoking the token revokes the session in the same transaction; logout-all / password change / recovery that revoke sessions also kill connectors; RLS and the token can never disagree.
- Resolution RPC `rpc_ai_resolve_connector_token(hash)` is the **only** service-role authentication lookup: unrevoked + unexpired + session live + user ACTIVE + membership ACTIVE, else zero rows (all failure modes indistinguishable). Create/revoke/touch are service-role-only SECURITY DEFINER RPCs; authenticated users can `SELECT` only their own metadata columns (never `token_hash`/`session_id`); managers cannot see or revoke another member's connector.
- Owner-only management routes `GET/POST /api/ai/connector-tokens`, `POST …/:id/revoke` (web session + CSRF; raw token only in the create response; no update; max 10 active per user+workspace; creation blocked while the AI Hub kill switch is off, revocation never blocked). Audit: `AI_CONNECTOR_TOKEN_CREATED/REVOKED` (appear in the existing AI audit scope). No UI built.
- `McpPrincipal { userId, workspaceId, scopes, credentialType, credentialId, credentialPrefix, sessionId }` is the only identity tools receive. A future OAuth verifier returns the same shape with `credentialType: 'oauth'`.

## Expiration decision
Supported (reuse of the extension pattern), bounded to 90 days, no refresh system; rotation = create a new token and revoke the old one.

## Not advertised
No `/.well-known/oauth-*` documents, no `resource_metadata`, no authorization-server fields. Unauthenticated requests get a plain `WWW-Authenticate: Bearer realm="jobquest-mcp"` (a unit test asserts no OAuth metadata strings exist in the MCP code).

## Future OAuth requirements (documentation only)
When a compliant authorization provider is chosen: OAuth 2.1 authorization-code + PKCE; protected-resource metadata (RFC 9728) at `/.well-known/oauth-protected-resource` naming the issuer; resource/audience binding to the `/api/mcp` URL; access-token verification (signature, `iss`, `aud`/resource, `exp`, scopes) mapping into `McpPrincipal`; client registration policy (pre-registered vs DCR/CIMD) per provider; user binding to a JobQuest user + workspace selection at consent. Connector tokens remain as the dev/Claude-Code path.

## Who can test it today
Claude Code (`claude mcp add --transport http jobquest <url> --header "Authorization: Bearer …"`), MCP Inspector, and any client using the official SDK with a custom header. ChatGPT/Gemini/Claude custom-connector UIs that require OAuth cannot use it until the deferred OAuth phase (provider phases AI-4+ decide).
