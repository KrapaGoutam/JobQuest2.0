# Milestone 13 — Test Plan: Global Search, Hardening & Final Product Parity Sweep

## 1. Objectives & Scope

The Milestone 13 test plan validates:
1. **Global Search Engine & Command Palette:**
   - Multi-domain query execution (Applications, Contacts, Notes/Journal, Interviews, Documents).
   - Strict workspace-scoping and authorization isolation (USER sees only own records; MANAGER sees workspace records; peer records invisible to USERs).
   - Accurate ranking, match snippets, and valid deep links.
   - Command palette keyboard navigation (Up/Down, Enter, Esc), mobile UI, and accessibility.
2. **Journal / Notes Domain Parity:**
   - Full CRUD operations via PostgREST and RLS on `journal_entries`.
   - Entry type filtering (Reflection, Strategy, Interview Prep, Note, Post-mortem).
   - Application linking and cascading behavior (`ON DELETE SET NULL`).
   - XSS inertness (plain-text and safe-rendered text).
3. **Security & Authorization Hardening Matrix:**
   - Exhaustive evaluation across 10 security personas.
   - Option B authentication verification (Argon2id, ES256 JWT, refresh token rotation, replay revocation).
   - Rate limiting, CSRF origin verification, and injection defense.
4. **Full Cross-Milestone Regression Suite:**
   - Unit tests (120+ passing), Extension tests (27+ passing), Integration tests (144+ passing).
   - Visual regression and Playwright browser E2E.
   - 0 blocking WCAG 2.2 AA accessibility violations.

---

## 2. Test Suites & Environments

| Test Tier | Scope | Framework / Tool | Target Environment |
|---|---|---|---|
| **Unit Tests** | Search ranking, debouncing, note sanitization, date helpers | Vitest | Node.js (in-memory) |
| **Extension Tests** | Manifest V3, capture facade, token headers, error handling | Vitest | Node.js (in-memory) |
| **Local Integration Tests** | Database migrations, RPC execution, RLS matrix, API routes | Vitest (`--project integration`) | Local Docker Supabase |
| **Hosted Integration Tests** | Hosted database verification, RPC parity | Vitest | Hosted Supabase `jobquest-dev` |
| **Browser E2E & A11y** | Command palette, Journal UI, keyboard flow, axe-core audit | Playwright + Axe-core | Local dev server / Vercel Preview |
| **Security & Secret Scans** | Tracked repo scan, web bundle scan, extension scan | Custom Node / Vitest | Built bundles & Git tree |

---

## 3. Detailed Test Cases

### 3.1 Global Search (`rpc_global_search`) Test Suite

- **TC-SEARCH-01: Multi-Domain Search Coverage:**
  - Seed workspace with 2 applications, 2 contacts, 2 journal notes, 2 interviews, 2 documents.
  - Search keyword matching application company: returns application with type badge `Application` and deep link `/#/applications`.
  - Search keyword matching contact name: returns contact with type badge `Contact` and deep link `/#/contacts`.
  - Search keyword matching journal content: returns note with type badge `Note` and deep link `/#/journal`.
  - Search keyword matching interviewer name: returns interview with type badge `Interview` and deep link `/#/interviews`.
  - Search keyword matching document label: returns document with type badge `Document` and deep link `/#/resumes`.

- **TC-SEARCH-02: Strict Workspace Isolation:**
  - Create Workspace A and Workspace B.
  - Seed unique keyword `"XenonAlpha"` into Workspace B.
  - User in Workspace A queries `"XenonAlpha"` in Workspace A: returns 0 results.
  - User in Workspace A queries with `p_workspace_id = Workspace B`: receives error / 0 results due to membership check.

- **TC-SEARCH-03: User vs Manager Peer Privacy:**
  - In Shared Workspace S, User 1 creates application `"SecretProject"` and journal note `"PrivateThoughts"`.
  - User 2 (role `USER`) in Workspace S searches `"SecretProject"`: returns 0 results (peer isolation enforced).
  - User 2 searches `"PrivateThoughts"`: returns 0 results.
  - Manager M (role `MANAGER`) in Workspace S searches `"SecretProject"`: returns application with member attribution.

- **TC-SEARCH-04: Suspended & Removed Member Denial:**
  - User 1 is suspended in Workspace S: search queries in Workspace S are rejected.
  - User 1 is removed from Workspace S: search queries in Workspace S are rejected.

- **TC-SEARCH-05: Empty & Partial Queries:**
  - Query with empty string `""` or whitespace: returns empty list gracefully.
  - Query with 1 character: returns prefix / trigram matches or empty if minimum length enforced.
  - Query with SQL wildcards (`%`, `_`, `*`, `'`): handled safely without syntax error or wildcard injection.

- **TC-SEARCH-06: Performance Latency:**
  - Query execution time on populated workspace stays under 50ms.

---

### 3.2 Journal / Notes (`journal_entries`) Test Suite

- **TC-JOURNAL-01: CRUD Lifecycle:**
  - User creates journal entry with title, content, entry_type `REFLECTION`, and linked application.
  - User reads entry: all fields match.
  - User updates title and content: `updated_at` refreshed.
  - User pins entry (`is_pinned = true`): entry persists pinned state.
  - User deletes entry: entry removed.

- **TC-JOURNAL-02: RLS Isolation:**
  - User 1 cannot read, update, or delete User 2's journal entries in the same workspace.
  - Manager can view User 1's journal entries in the workspace.
  - Foreign user cannot view or mutate journal entries.

- **TC-JOURNAL-03: Application Link Cascading:**
  - When linked application is deleted or archived, `journal_entries.application_id` is set to `NULL` (`ON DELETE SET NULL`); journal entry is NOT destroyed.

- **TC-JOURNAL-04: XSS Safety:**
  - Insert malicious payload: `<script>alert('xss')</script><img src=x onerror=alert(1)>`.
  - Verify stored byte-identical without execution, and rendered inert in UI.

---

### 3.3 Security & RLS Matrix Test Suite

- **TC-SEC-01: 10-Persona RLS Verification:**
  - Anonymous caller: 401 Unauthorized across all protected tables and RPCs.
  - USER own: 200 OK for reading and mutating own records.
  - USER peer: 0 rows returned / 403 Forbidden for mutating peer rows.
  - MANAGER same workspace: 200 OK for reading workspace rows; mutations audited in `audit_events`.
  - MANAGER cross-workspace: 0 rows returned / 403 Forbidden.
  - Foreign USER: 0 rows returned / 403 Forbidden.
  - Foreign MANAGER: 0 rows returned / 403 Forbidden.
  - Removed member: 403 Forbidden / 0 rows.
  - Suspended member: 403 Forbidden / 0 rows.
  - Expired / revoked extension token: 401 / 403 Forbidden.

- **TC-SEC-02: Option B Token Security:**
  - Expired access JWT rejected.
  - Single-use refresh token rotated; replay of spent refresh token triggers immediate session revocation.
  - CSRF Origin check rejects foreign origin on state-changing API endpoints.
  - Account lockout triggers after 5 failed attempts.

---

### 3.4 Command Palette UI & Accessibility Test Suite

- **TC-UI-01: Keyboard Shortcuts:**
  - Press `Cmd+K` / `Ctrl+K`: Global Search modal opens; input receives focus.
  - Press `Esc`: modal closes; focus returns to previous element.
  - Up / Down arrow keys navigate result list; Enter navigates to item.

- **TC-UI-02: Topbar & Mobile Triggers:**
  - Click topbar search bar: modal opens.
  - Tap mobile search icon in mobile header: modal opens in mobile viewport.

- **TC-UI-03: Accessibility (WCAG 2.2 AA):**
  - Axe-core scan on open search dialog: 0 critical, 0 serious violations.
  - ARIA attributes present (`role="combobox"`, `aria-expanded="true"`, `aria-haspopup="listbox"`, `aria-activedescendant`).
