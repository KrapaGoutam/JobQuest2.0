# JOBQUEST 2.0 — SECURITY THREAT MODEL & RISK ANALYSIS
**Document ID:** `JQ2-GATE03-SEC-001`  
**Gate:** `Gate 03 — Database + Authentication + Authorization/RLS Design`  
**Status:** `PROPOSED`  
**Related Documents:** [AUTHENTICATION_DESIGN.md](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/gate-03/AUTHENTICATION_DESIGN.md), [AUTHORIZATION_RLS_DESIGN.md](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/gate-03/AUTHORIZATION_RLS_DESIGN.md), [RPC_DOMAIN_OPERATIONS.md](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/gate-03/RPC_DOMAIN_OPERATIONS.md)

---

## 1. Threat Modeling Methodology & Scope

JobQuest 2.0 handles sensitive personal career history, financial compensation expectations, interview feedback, and corporate contact records. This threat model systematically evaluates 18 primary attack vectors across the application lifecycle using the **STRIDE** methodology (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege).

---

## 2. Comprehensive 18-Vector Threat Analysis Matrix

| # | Threat Vector | STRIDE Category | Risk Level | Mitigation & Technical Controls | Residual Risk & Operational Defense | Verification Test |
| :-: | :--- | :--- | :-: | :--- | :--- | :--- |
| **1** | **Username Enumeration** | Information Disclosure | Low | Uniform timing responses on auth endpoints; generic errors ("Invalid credentials"); rate limit registration and login. | Timing attacks via high-precision network measurement. Residual is minimal and acceptable. | Send valid vs invalid usernames; assert identical error status, payload structure, and response times within 50ms variance. |
| **2** | **Password Attacks (Stuffing, Brute Force)** | Spoofing / DoS | High | Minimum 10 chars, zxcvbn complexity score >= 2; Argon2id / bcrypt hashing; sliding window rate limit (5 attempts / 15 min per IP + username). | Distributed botnets rotating residential IPs. Defense: Cloudflare / Vercel Edge WAF challenges. | Script 10 rapid failed login attempts; verify 429 response on 6th attempt and audit log entry. |
| **3** | **Recovery Code Brute Force** | Spoofing / Elevation | Critical | Each code generated with >=128 bits of cryptographically secure random entropy before Crockford Base32 encoding; Argon2id verifier stored; strictly single-use; regeneration invalidates all previous unused codes; 3 failed attempts triggers 1-hour account lockout. | Offline cracking if database is dumped. Defense: >=128-bit individual code entropy, per-code salting, Argon2id memory cost. | Verify code generator generates >=16 CSPRNG bytes per code; attempt brute force on `/api/auth/recover`; verify 3-attempt lockout and immediate code invalidation upon use. |
| **4** | **Claim Code Theft & Replay** | Spoofing | Critical | Codes are 48-char random tokens (`jqc_live_...`) with >160 bits entropy; stored as SHA-256 hashes; 30-day default expiry (with operator reissue capability); single-use flag; rate-limited. | Man-in-the-middle during link transmission. Defense: Secure delivery channels, HTTPS-only, 30-day expiry. | Attempt redeeming same claim token twice; verify second attempt returns 409/400 and does not reassign account. |
| **5** | **Session Hijacking / Theft** | Spoofing | High | HttpOnly, Secure, SameSite=Lax/Strict cookies; short-lived access tokens (1 hr); rotating refresh tokens with replay detection. | Malware on client device extracting browser cookies. Defense: Device posture, fast revocation API. | Inspect browser cookies via document.cookie; verify HttpOnly prevents JavaScript access; verify token refresh rotates token. |
| **6** | **Cross-Site Request Forgery (CSRF)** | Tampering | Medium | 4-tier Defense-in-Depth model: (1) Secure HttpOnly cookies with SameSite=Lax/Strict; (2) Strict Origin / Referer header validation in Node middleware; (3) Anti-CSRF token verification on state-changing API endpoints; (4) Strict CORS origin lockdown and `application/json` Content-Type enforcement. Never relies on `X-Requested-With` alone. | Subdomain takeover or edge browser quirks. Defense: Combined SameSite + Origin validation + Anti-CSRF token check. | Send forged POST request from third-party origin without valid Origin/CSRF token; verify request is blocked with 403 Forbidden. |
| **7** | **Cross-Site Scripting (XSS)** | Tampering / Disclosure | High | React automated DOM escaping; strict Content Security Policy (CSP); markdown sanitized via DOMPurify; no `dangerouslySetInnerHTML`. | Zero-day vulnerability in rendering libraries. Defense: Strict CSP disallowing `unsafe-inline` scripts. | Inject `<script>alert(1)</script>` into notes, job descriptions, and URLs; verify clean escaping in DOM. |
| **8** | **Extension Token Theft / Tampering** | Spoofing / Tampering | High | Dedicated token prefix `jqe_live_...`; SHA-256 hash stored in DB; strictly scoped to job capture; revocable at any time. | Compromised local machine with access to Chrome extension storage. Defense: User can revoke token in Web UI. | Attempt using extension token to access user management or journal endpoints; verify 403 Forbidden. |
| **9** | **Workspace Tampering (Context Switching)** | Elevation of Privilege | Critical | Active workspace is treated as UX state, never authorization authority; DB RLS validates `is_workspace_member()` on every query. | Malicious client tampering with HTTP headers or query params. Defense: Postgres RLS enforcement. | Authenticated User A sends query with `workspace_id = Workspace_B`; verify Postgres returns 0 rows. |
| **10**| **Horizontal Privilege Escalation (Co-Members)** | Information Disclosure | High | Applications, contacts, contact_interactions, job_snapshots, tasks, habits, and journals enforce `OWNER SCOPED / MANAGER OVERRIDE`: standard USERs cannot inspect peers' job search activity or contacts. | Misconfigured RLS policy omitting owner check. Defense: Automated test suite asserting peer isolation across all tier-3 tables. | Member A queries Member B's applications or contacts in shared Workspace; verify empty result set returned. |
| **11**| **Manager Privilege Escalation & Audit** | Elevation of Privilege | High | Managers have workspace-scoped oversight across applications, contacts, and journal entries for coaching; manager access to another user's records is strictly audited in `audit_events`. Managers cannot access records in other workspaces. | Manager attempts cross-workspace access or unmonitored surveillance. Defense: `is_workspace_manager()` checks workspace ID explicitly; audit trigger logs cross-user access. | Manager in Workspace A queries Workspace B; verify 0 rows. Manager accesses Member's journal; verify audit event `journal.manager_read` emitted. |
| **12**| **Cross-Workspace Data Leakage** | Information Disclosure | Critical | Compound foreign keys `(id, workspace_id)` across parent and child tables prevent linking entities across workspaces. | Data pipeline bug. Defense: Engine-level composite foreign key constraints. | Attempt inserting task in Workspace A referencing application in Workspace B; verify DB foreign key violation. |
| **13**| **Service Role Credential Misuse** | Elevation of Privilege | Critical | `SUPABASE_SERVICE_ROLE_KEY` is strictly confined to server-side Node runtime; never included in client bundle or extension. | Developer error exposing key in client env vars. Defense: Build-time linting and automated secret scanning. | Scan client production bundle with `grep` for service-role key pattern; assert 0 occurrences. |
| **14**| **SQL & RPC Injection** | Tampering / Disclosure | Critical | 100% parameterized queries via PostgREST and pg typed clients; stored procedures use typed arguments, no dynamic SQL. | String concatenation in ad-hoc queries. Defense: Strict lint rules forbidding `exec()` / dynamic SQL in migrations. | Pass SQL injection payloads (`' OR 1=1 --`) to search and RPC endpoints; verify treated as literal strings. |
| **15**| **Mass Assignment & Attribute Tampering** | Tampering | Medium | Strict TypeScript Zod validation schemas for all API payloads; PostgREST columns restricted via schema definitions. | Unchecked payload spreading (`{ ...req.body }`). Defense: Explicit field-by-field assignment. | Submit payload containing `{ is_admin: true, user_id: 'other' }`; verify extra fields stripped or rejected. |
| **16**| **Import Abuse & Malicious Payloads** | Tampering / DoS | Medium | Strict CSV file size caps (5 MB); CSV streaming parser; sanitize all cell values against formula injection (`=`, `@`, `+`, `-`). | Extremely large ZIP/CSV files causing memory exhaustion. Defense: Streaming parsing with row limits (max 5,000). | Upload CSV containing Excel formula `=cmd|' /C calc'!A0`; verify formula prefix escaped safely. |
| **17**| **Export Data Exfiltration** | Information Disclosure | Medium | Exports restricted to authenticated workspace members; full workspace export restricted to Managers; audit logged. | Disgruntled manager exporting data before departing. Defense: Comprehensive immutable audit trail. | Execute full workspace export; verify audit log registers `workspace.exported` with user ID, IP, and record count. |
| **18**| **Audit Log Tampering / Repudiation** | Repudiation | Critical | `public.audit_events` is strictly append-only; RLS forbids `UPDATE` and `DELETE` for all roles (including Managers). | Malicious actor attempting to erase tracks after breach. Defense: Write-only DB permissions; log shipping. | Attempt executing `DELETE FROM public.audit_events` via authenticated client; verify Postgres permission denied. |

---

## 3. High-Risk Security Boundary Enforcements

### 1. The Service Role Boundary
```
[ BROWSER / CLIENT ]          [ CHROME EXTENSION ]
        |                              |
        v                              v
 (anon key + JWT)             (jqe_live_... token)
        |                              |
        +---------------+--------------+
                        |
                        v
         [ VERCEL NODE.JS BACKEND ]
                        |
                        | (process.env.SUPABASE_SERVICE_ROLE_KEY)
                        v
          [ SUPABASE POSTGRES ENGINE ]
```
* Under no circumstances is the `SUPABASE_SERVICE_ROLE_KEY` delivered to web browsers or Chrome extensions.
* Any serverless function using the service role must independently authenticate the caller's session and verify permissions before executing database mutations.

### 2. The Internal Synthetic Identity Boundary & Zero-Leakage Hard-Fail
* When using Auth Option A, the synthetic internal identity (`id_<uuid>@auth.jobquest.internal`) is strictly an implementation detail between the Node Façade and Supabase GoTrue.
* Outgoing email triggers in Supabase GoTrue are disabled.
* The frontend user profile API exposes only the real `username` and optional user-provided notification email.
* **HARD-FAIL LEAKAGE INVARIANT:** If the synthetic internal email or identity appears anywhere accessible to the browser or user (including Supabase session user object, JWT claims, API payload, React state, local/session storage, debug logs, or browser-visible network response), the "zero identity leakage" requirement **FAILS**.
* Such leakage triggers immediate rejection of Option A and activates the Option B architectural fallback protocol before product implementation proceeds.
* **Option B Fallback Architecture:** Option B is an architectural fallback evaluated before continued implementation (not an automatic runtime failover). It evaluates currently supported Supabase mechanisms (externally minted JWTs, imported signing keys, third-party authentication integration, `supabase-js` `accessToken` injection, and native PostgREST/RLS compatibility) to select the safest supported architecture.
