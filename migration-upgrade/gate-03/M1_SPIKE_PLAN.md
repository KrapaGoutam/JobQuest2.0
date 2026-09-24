# JOBQUEST 2.0 — MILESTONE 1 (M1) SPIKE SPECIFICATION
**Document ID:** `JQ2-GATE03-M1-001`  
**Gate:** `Gate 03 — Database + Authentication + Authorization/RLS Design`  
**Status:** `PROPOSED (Plan Only — Not Implemented in Gate 03)`  
**Related Documents:** [AUTHENTICATION_DESIGN.md](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/gate-03/AUTHENTICATION_DESIGN.md), [AUTHORIZATION_RLS_DESIGN.md](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/gate-03/AUTHORIZATION_RLS_DESIGN.md), [TEST_MATRIX.md](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/gate-03/TEST_MATRIX.md)

---

## 1. M1 Spike Objectives & Strict Scope Boundaries

The **Milestone 1 (M1) Spike** is a targeted architectural proof-of-concept designed to validate core system plumbing before full-scale application development.

### Primary Objectives:
1. Prove **Authentication Option A**: Validate that Node-controlled username/password login layered over Supabase Auth works seamlessly with zero leaks of the synthetic internal email.
2. Validate native **`auth.uid()`** binding to Postgres Row Level Security (RLS) policies.
3. Validate automated **Personal Workspace** provisioning and foundational `USER` / `MANAGER` role enforcement.
4. Validate secure **session lifecycle** (HttpOnly cookies, silent token rotation, multi-tab sync, global logout).
5. Prove **Canonical Workflow Retrieval**: Validate database-backed retrieval of canonical stage/state/outcome configurations from `workflow_definitions`.
6. Deploy a minimal, working **Vercel Preview** connected to a dedicated **Development Supabase Project**.

### Non-Goals (Strictly Excluded from M1):
* **No full 33-table migration:** M1 deploys only the 7 foundational baseline tables.
* **No production data migration:** Legacy Neon data remains untouched.
* **No comprehensive UI redesign:** M1 implements only minimal test harness screens (Login, Register, Workspace Switcher, Minimal App Table, Workflow Verification).
* **No Chrome extension migration:** Extension updates are deferred to Milestone 3.

---

## 2. Minimal Baseline Schema for M1 (7 Foundational Tables)

M1 provisions exclusively the 7 foundational tables required to test auth, multi-tenancy, canonical workflow, and data isolation:

1. `public.user_accounts` (Username mapping, rate-limiting lockout metadata; stores NO password hashes under Option A)
2. `public.profiles` (Display name, optional notification email, theme preferences)
3. `public.auth_recovery_codes` (10 single-use recovery code hashes, each with >=128 bits CSPRNG entropy)
4. `public.workspaces` (Personal and Team workspace entities)
5. `public.workspace_members` (Tenant membership and `USER` / `MANAGER` roles)
6. `public.applications` (Minimal core table for RLS CRUD and peer-isolation proof)
7. `public.workflow_definitions` (Canonical pipeline stages, terminal outcomes, and transition rules)

---

## 3. The 12 Mandatory M1 Auth & Architecture Test Conditions

The M1 Spike is governed by **12 rigorous test conditions**. All 12 tests must yield an explicit **PASS** for Option A to achieve final architectural approval.

| # | Test Condition | Specific Test Execution | Strict Pass Criteria | Action on Failure |
| :-: | :--- | :--- | :--- | :--- |
| **T01** | **Username Account Provisioning** | Call `/api/auth/register` with `{ username, password }`. | Account created in `auth.users` + `user_accounts`; personal workspace created; caller assigned `MANAGER`; returns 10 recovery codes with >=128-bit entropy each. | Fail M1; log cause. |
| **T02** | **Username / Password Login** | Call `/api/auth/login` with registered username + password. | Successful authentication; returns HTTP 200 with HttpOnly session cookies; no synthetic email in response. | Fail M1; log cause. |
| **T03** | **Zero Identity Leakage (Hard-Fail Invariant)** | Inspect Supabase session user object, JWT claims, API payloads, React state, local/session storage, debug output, and network responses. | The internal synthetic string `@auth.jobquest.internal` **NEVER** appears in any browser-accessible location. | **ABORT OPTION A; TRIGGER OPTION B FALLBACK.** |
| **T04** | **`auth.uid()` Native Resolution** | Query PostgREST endpoint using session access token. | Postgres function `auth.uid()` returns exact user UUID matching `public.user_accounts.user_id`. | **ABORT OPTION A; TRIGGER OPTION B FALLBACK.** |
| **T05** | **RLS Own-Record vs. Peer Isolation** | User A queries `applications`; User B queries `applications` in shared workspace. | User A sees only own applications; User B sees only own applications; Manager sees both. | Fail M1; refine policy. |
| **T06** | **Canonical Workflow Retrieval** | Fetch active workflow definition from `workflow_definitions` via PostgREST and Node API. | Returns canonical stages (Saved through Accepted), allowed outcomes, and closure reasons. Verified identical to approved workflow spec. | Fail M1; refine schema/seed. |
| **T07** | **Session Refresh & Token Rotation** | Wait for access token expiry (or force refresh via `/api/auth/refresh`). | Refresh token rotates; new access token issued silently without user disruption; old refresh token invalidated. | Fail M1; refine cookie config. |
| **T08** | **Global Logout & Revocation** | Call `/api/auth/logout`. Attempt immediate query with previous token. | Cookies cleared; session invalidated in GoTrue; subsequent PostgREST queries return HTTP 401. | Fail M1; fix revocation. |
| **T09** | **Password Change Lifecycle** | Authenticated user changes password via settings. | Password updated in GoTrue; old password rejected; active sessions revoked or maintained per policy. | Fail M1; fix password flow. |
| **T10** | **Rate Limiting Enforcement** | Send 6 rapid invalid login requests within 60 seconds. | 6th request returns HTTP 429 Too Many Requests; lockout counter incremented; security audit logged. | Fail M1; adjust limiter. |
| **T11** | **Direct Browser PostgREST CRUD** | Execute `supabase.from('applications').insert(...)` directly from browser React client. | Insert succeeds under active RLS policy; row immediately visible to owner; foreign key constraints validated. | Fail M1; verify PostgREST RLS. |
| **T12** | **Outbound Email Zero-Emission** | Monitor Supabase project outbound email logs during registration, login, and password reset. | **Zero emails dispatched** by Supabase GoTrue for synthetic internal addresses. | **ABORT OPTION A; TRIGGER OPTION B FALLBACK.** |

---

## 4. Architectural Fallback Protocol to Option B

Option B is an **architectural fallback decision** (evaluated before product implementation continues), NOT an automatic production runtime failover.

### Hard-Fail Termination Criteria for Option A:
If any of the following mandatory conditions fail during the M1 Spike:
1. **Synthetic Identity Leakage (T03 Fails):** The `@auth.jobquest.internal` email appears anywhere browser-visible (session user, JWT, API payload, React state, storage, debug logs, or network response).
2. **GoTrue Outbound Email Leakage (T12 Fails):** GoTrue attempts to dispatch emails to the synthetic internal domain.
3. **`auth.uid()` Resolution Failure (T04 Fails):** GoTrue sessions fail to bind cleanly to Postgres `auth.uid()` under RLS.
4. **Direct RLS-Protected PostgREST Failure (T11 Fails):** Browser cannot safely perform direct CRUD operations under RLS.

### Fallback Procedure:
1. **Stop product implementation immediately.** Do not attempt cosmetic workarounds to disguise leaks.
2. Formally change the project architectural decision from Option A to Option B.
3. Evaluate currently supported Supabase mechanisms for Option B, including:
   - Externally minted JWTs
   - Imported signing keys
   - Third-party/custom authentication integration
   - `supabase-js` `accessToken` injection
   - Native PostgREST/RLS compatibility
4. Select the safest, most robust currently supported Supabase auth integration pattern.
5. Update architectural documentation before continuing development.

---

## 5. Post-Approval Account Switching Checklist (M1 Execution)

*Note: Per Gate 03 constraints, NO accounts are initialized or linked during Gate 03. This checklist is executed only AFTER explicit user approval of Gate 03.*

1. [ ] **New Supabase Account:** User logs into dedicated new Supabase account.
2. [ ] **New Dev Project:** Create new project: `jobquest-dev` (Region: US East or user preferred).
3. [ ] **Supabase CLI Setup:** Run `supabase login`, `supabase init`, and `supabase link --project-ref <dev_ref>`.
4. [ ] **New Vercel Account:** User logs into dedicated new Vercel account.
5. [ ] **Link Vercel Dev Project:** Run `vercel link` and configure environment variables:
   * `SUPABASE_URL`
   * `SUPABASE_ANON_KEY`
   * `SUPABASE_SERVICE_ROLE_KEY` (Server-side only)
6. [ ] **Execute M1 Baseline Migrations:** Apply the 7 foundational baseline tables via `supabase db push`.
7. [ ] **Run 12 M1 Spike Verification Tests:** Execute automated Vitest test suite against dev deployment.
8. [ ] **Submit M1 Spike Results Report:** Present test logs to user for final auth architecture confirmation.
