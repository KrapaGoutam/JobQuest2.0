# Milestone 15 — Production Domain & Origin Decision: Architecture & Analysis

**Status**: **PROPOSED — USER INPUT REQUIRED**  
**Milestone**: Milestone 15 — Production Launch & Cutover (Phase M15-A)  
**Branch**: `feature/m15-production-launch-cutover`  
**Decision Ref**: `M15-D05` / `OQ-016` / `ADR-013` / `CR-012`

---

## 1. Overview & Architectural Importance

Establishing a permanent production origin before public launch is critical. The production origin determines:
1. **Browser Extension Client (`apps/extension/`)**: The extension manifest (`manifest.json`) requires explicit `host_permissions` matching the production API origin. If the domain changes post-release, users must grant additional browser permissions, breaking seamless updates.
2. **CORS Headers (`Access-Control-Allow-Origin`)**: The Node API (`apps/api/`) enforces strict CORS origin checks for extension and client requests.
3. **CSRF Protection (`Origin` & `Referer` validation)**: State-changing requests (`POST`, `PUT`, `DELETE`, `PATCH`) must originate from trusted production origins.
4. **Auth Callbacks & Session Cookies**: Supabase Auth and Option B token refresh endpoints require authorized redirect and cookie domains.

---

## 2. Origin Matrix & Options Analysis

| Configuration Dimension | Option A: Custom Domain (Recommended) | Option B: Default Vercel Domain | Status / Impact |
| --- | --- | --- | --- |
| **Primary Web Origin** | `https://jobquest.app` (or user designated) | `https://jobquest2.vercel.app` | **UNRESOLVED — USER SPECIFICATION REQUIRED** |
| **API Endpoint Origin** | `https://jobquest.app/api` (or `https://api.jobquest.app`) | `https://jobquest2.vercel.app/api` | Unified under single origin or dedicated subdomain |
| **Extension `host_permissions`** | `["https://jobquest.app/*"]` | `["https://jobquest2.vercel.app/*"]` | Must match primary web origin |
| **CORS Allowed Origins** | `["https://jobquest.app", "chrome-extension://*"]` | `["https://jobquest2.vercel.app", "chrome-extension://*"]` | Hardened against cross-origin attacks |
| **CSRF Trusted Origins** | `["https://jobquest.app"]` | `["https://jobquest2.vercel.app"]` | Validates `req.headers.origin` strictly |
| **DNS Management** | User manages DNS (A / CNAME records pointed to Vercel) | Managed automatically by Vercel | Vercel provides automatic SSL cert via Let's Encrypt |
| **Cost** | ~$12/yr if new domain; $0 if already owned | $0 / Free | Included in any Vercel plan |

---

## 3. Evaluation of Current Workspace & Deployment State

1. **Existing Vercel Preview Deployment**:
   - Current Preview RC: `https://jobquest2-33y9un1oa-one-piece-5779.vercel.app`
   - Vercel Team: `one-piece-5779`
   - Vercel Project: `jobquest2`
   - Vercel Default Production Alias: `https://jobquest2.vercel.app` (reserved by Vercel for the `main` branch).
2. **Custom Domain Status**:
   - No custom domain is currently bound to the `jobquest2` project.
   - The user has not yet specified a custom domain (e.g. `jobquest.app` or similar brand domain).
3. **Browser Extension Impact**:
   - In `apps/extension/src/config.ts`, the default API base URL is currently configured for local development (`http://localhost:3000/api`) or preview.
   - For production, updating this to the permanent production origin is required prior to packaging the release bundle.

---

## 4. User Specification Required

To finalize this decision (Decision `M15-D05`), please specify:
1. Do you have a custom domain to bind to JobQuest 2.0 (e.g. `https://jobquest.example.com` or `https://jobquest.app`)?
2. If no custom domain is immediately available, do you authorize launching initially on the Vercel default domain: `https://jobquest2.vercel.app`?

> [!IMPORTANT]
> No domain will be purchased, registered, or bound to DNS without explicit user instructions.
