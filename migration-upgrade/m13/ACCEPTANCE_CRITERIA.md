# Milestone 13 — Acceptance Criteria: Global Search, Hardening & Final Product Parity Sweep

## 1. Global Search & Command Palette

- [ ] **AC-01 (Trigger & UX):**
  - Pressing `Cmd+K` (macOS) or `Ctrl+K` (Windows/Linux) anywhere in the application opens the Global Search command palette.
  - Clicking the search input in the desktop Topbar opens the command palette.
  - Tapping the search icon in the mobile navigation bar opens the command palette.
  - Opening the palette focuses the search input automatically.
  - Pressing `Escape` or clicking outside dismisses the palette and restores keyboard focus to the triggering element.

- [ ] **AC-02 (Multi-Domain Coverage):**
  - Searches simultaneously across 5 domains in the active workspace:
    1. **Applications:** Matches `company_name`, `role_title`, `job_description`, and `notes`.
    2. **Contacts:** Matches `full_name`, `company_name`, `job_title`, `email`, and `notes`.
    3. **Notes / Journal:** Matches `title` and `content`.
    4. **Interviews:** Matches `company_name`, `role_title`, `interview_type`, `interviewer_names`, and notes.
    5. **Documents:** Matches `title`, `label`, `file_name`, and `notes`.
  - Results display domain badges (`Application`, `Contact`, `Note`, `Interview`, `Document`) and match context.

- [ ] **AC-03 (Navigation & Deep Links):**
  - Up / Down arrow keys navigate through the list of results with visible focus styling.
  - Pressing `Enter` or clicking a result navigates immediately to the corresponding view:
    - Application $\rightarrow$ `/#/applications` (or application deep link `/#/w/:ws/applications/:id`)
    - Contact $\rightarrow$ `/#/contacts`
    - Journal Note $\rightarrow$ `/#/journal`
    - Interview $\rightarrow$ `/#/interviews`
    - Document $\rightarrow$ `/#/resumes`
  - Command palette closes upon navigation.

- [ ] **AC-04 (Security & Privacy Invariants):**
  - All search operations are strictly constrained to the caller's active `workspace_id`.
  - In a shared workspace:
    - Callers with role `USER` retrieve only their own records (`user_id = auth.uid()`).
    - Callers with role `MANAGER` retrieve records belonging to members within the workspace, with owner attribution.
  - Callers who are suspended, removed, or non-members receive 0 results / denial.
  - Zero peer data leakage in counts, snippets, or suggestions.

- [ ] **AC-05 (Performance & Recent Searches):**
  - Search queries execute via optimized Postgres RPC (`rpc_global_search`) with sub-50ms execution on standard workloads.
  - Recent searches are stored in browser localStorage (scoped to active user and workspace) and displayed when the query is empty.

---

## 2. Journal / Notes Resolution (`FEATURE-NOTE-001`)

- [ ] **AC-06 (Database Model & RLS):**
  - Table `public.journal_entries` created via additive migration `20261015100000_m13_global_search_journal.sql`.
  - Composite foreign key to `applications(id, workspace_id)` with `ON DELETE SET NULL`.
  - RLS enabled: owner has full CRUD on own entries; manager has read access to workspace entries; foreign users denied.

- [ ] **AC-07 (User Interface & Editing):**
  - Route `/#/journal` renders full `JournalView.tsx` (replacing `PlaceholderView`).
  - Supports 5 canonical entry types: `Reflection`, `Strategy`, `Interview prep`, `Note`, `Post-mortem`.
  - Allows linking an entry to any existing application in the active workspace.
  - Plain-text / markdown rendering is completely escaped against XSS attacks.
  - Pinned notes appear at the top of the list.

---

## 3. Security Hardening & Complete RLS Matrix

- [ ] **AC-08 (10-Persona RLS Verification):**
  - Automated integration test verifies RLS boundaries across all 10 security personas:
    1. Anonymous caller
    2. USER own records
    3. USER peer records (denied)
    4. MANAGER same workspace (allowed)
    5. MANAGER cross-workspace (denied)
    6. Foreign USER (denied)
    7. Foreign MANAGER (denied)
    8. Removed member (denied)
    9. Suspended member (denied)
    10. Invalidated extension token (denied)

- [ ] **AC-09 (Option B Auth & Platform Security):**
  - ES256 JWT validation, refresh token rotation, and replay revocation verified.
  - Account lockout triggers after 5 failed attempts.
  - CSRF origin verification blocks state-changing requests from foreign origins.
  - Zero sensitive database columns leaked in client payloads.

---

## 4. Parity, Documentation & Quality Gates

- [ ] **AC-10 (Definitive Parity Matrix):**
  - `FINAL_PARITY_MATRIX.md` completed with 10 mandatory columns and strictly allowed dispositions (zero blanks).
  - Every P0/P1 feature from legacy JobQuest 1.0 verified in JobQuest 2.0.
  - `P0_P1_LAUNCH_CHECKLIST.md` 100% verified.
  - `POST_LAUNCH_DEFERRED.md` documents only approved intentional post-launch deferrals.

- [ ] **AC-11 (Inventories Reconciliation):**
  - `API_INVENTORY.md` updated with `rpc_global_search` and all active endpoints.
  - `ROUTE_SCREEN_INVENTORY.md` updated with `/#/journal` and Global Search command palette.
  - `OPEN_QUESTIONS.md` and `CHANGE_REQUESTS.md` fully classified.

- [ ] **AC-12 (Local & Hosted Quality Gates):**
  - `pnpm lint`: PASS (0 errors).
  - `pnpm typecheck`: PASS (0 errors across all workspace projects).
  - `pnpm test:unit`: PASS (120+ tests).
  - `pnpm test:extension`: PASS (27+ tests).
  - `pnpm test:integration`: PASS (all local integration tests).
  - Hosted dev (`jobquest-dev`): All migrations applied, hosted integration tests PASS.
  - Vercel Preview: Deployment READY, `/api/health` HTTP 200, E2E lifecycle PASS, 0 blocking WCAG 2.2 AA violations.
  - Secret scans: 0 findings across repo, web bundle, and extension bundle.
  - Exact-SHA GitHub Actions CI: GREEN.

- [ ] **AC-13 (Milestone Boundary Rule):**
  - STOP WITH M13 UNMERGED on branch `feature/m13-global-search-hardening-parity`.
  - Do NOT merge to development.
  - Do NOT merge to main.
  - Do NOT start M14.
