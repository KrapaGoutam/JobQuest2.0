# Milestone 13 — Implementation Plan: Global Search, Hardening & Final Product Parity Sweep

## 1. Executive Summary & Goals

Milestone 13 is the **final feature-development milestone** of JobQuest 2.0 before entering Milestone 14 (Release Candidate & Migration Rehearsal). Its mission is to achieve 100% functional completeness, rock-solid security hardening, and exhaustive legacy parity across every domain.

### Primary Deliverables:
1. **Unified Global Command Palette / Search:**
   - Command-palette modal UI triggered via `Cmd+K` / `Ctrl+K`, topbar search trigger, and mobile search button.
   - High-performance Postgres RPC (`rpc_global_search`) executing across 5 core domains:
     1. **Applications:** Company, job title, description preview, notes.
     2. **Contacts:** Full name, company, title, email, notes.
     3. **Notes / Journal:** Title, content.
     4. **Interviews:** Company, job title, interview type, interviewer names, preparation notes, feedback notes.
     5. **Documents:** Title, label, file name, notes.
   - Strict workspace-scoping and domain authorization (USER sees only own records; MANAGER sees workspace records; zero peer-data or cross-workspace leakage).
   - ARIA-compliant combobox semantics, arrow-key navigation, Enter to open deep link, Escape to dismiss, focus restoration.
   - Recent search history persisted locally per user and per workspace.

2. **Explicit Resolution & Implementation of Journal / Notes (`FEATURE-NOTE-001`):**
   - Implement permanent Gate 03 Table 19 (`journal_entries`) matching `TARGET_SCHEMA.md` and legacy Table 32 (`notes`).
   - Additive database migration `20261015100000_m13_global_search_journal.sql`.
   - PostgREST CRUD and RLS (owner full access; manager workspace coaching access with mutation audit).
   - Rich, responsive web UI (`JournalView.tsx`) replacing `PlaceholderView` at route `/#/journal`.
   - 5 note types (`Reflection`, `Strategy`, `Interview prep`, `Note`, `Post-mortem`), optional application linking, and search filter.

3. **Security Hardening Sweep & Final RLS Matrix:**
   - Full regression across 10 security personas:
     1. Anonymous caller
     2. Authenticated USER accessing own records
     3. Authenticated USER attempting peer record access (DENY)
     4. MANAGER accessing same workspace records (ALLOW)
     5. MANAGER attempting cross-workspace access (DENY)
     6. Foreign USER from another workspace (DENY)
     7. Foreign MANAGER from another workspace (DENY)
     8. Removed member (DENY)
     9. Suspended member (DENY where applicable)
     10. Extension token with expired / revoked membership (DENY)
   - Re-verify Option B authentication, Argon2id credentials, ES256 JWT rotation, CSRF origin verification, rate limiting, and formula injection defenses.

4. **Definitive Parity Matrix & Inventories Reconciliation:**
   - Author `FINAL_PARITY_MATRIX.md` with zero unexplained blanks across all 30+ features and workflows.
   - Author `P0_P1_LAUNCH_CHECKLIST.md` verifying all launch-critical functionality.
   - Author `POST_LAUNCH_DEFERRED.md` documenting intentional post-launch deferrals with explicit justification.
   - Reconcile `API_INVENTORY.md`, `ROUTE_SCREEN_INVENTORY.md`, `OPEN_QUESTIONS.md`, and `CHANGE_REQUESTS.md`.

5. **Full Cross-Milestone Regression Sweep:**
   - M1B Option B Auth $\rightarrow$ M12 Workspace Management & Governance.

---

## 2. Technical Architecture & Strategy

### 2.1 Global Search Architecture (3-Tier Model)

```
[ Web Client / Command Palette (Cmd+K / Ctrl+K) ]
                     │
                     ▼
[ PostgREST Data API: rpc_global_search(p_query, p_workspace_id, p_limit) ]
                     │
                     ▼ (Postgres Engine Execution)
  1. Authorize: Check Caller Active Membership in p_workspace_id
  2. Determine Caller Role: 'USER' vs 'MANAGER'
  3. Query Domains (UNION ALL with workspace_id filter):
     - Applications (ilike / FTS on company, title, notes)
     - Contacts (ilike / FTS on name, company, email, notes)
     - Journal Entries (ilike / FTS on title, content)
     - Interviews (ilike / FTS on type, interviewers, notes)
     - Documents (ilike / FTS on title, label, file_name, notes)
  4. Apply Security Filter:
     - IF role = 'USER': WHERE user_id = auth.uid()
     - IF role = 'MANAGER': WHERE workspace_id = p_workspace_id
  5. Aggregate & Sort by relevance / recency
  6. Return typed json array:
     [{ id, domain, title, subtitle, badge, deep_link, created_at }]
```

### 2.2 Performance & Indexing Strategy

- **Applications:** Existing indexes on `(workspace_id, company_name)`, `(workspace_id, user_id)`. Add trigram/text search index if necessary.
- **Contacts:** Existing indexes on `(workspace_id, user_id)`.
- **Interviews:** Existing indexes on `(workspace_id, scheduled_at)`.
- **Documents:** Existing indexes on `(workspace_id, user_id)`.
- **Journal Entries:** Add `idx_journal_entries_ws_user` and `idx_journal_entries_ws_app`.
- **Query Execution:** Target latency `< 50ms` for 20 results in 10,000-record workspaces.

### 2.3 Journal / Notes Schema & RLS

```sql
CREATE TABLE public.journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.user_accounts(user_id) ON DELETE RESTRICT,
    application_id UUID NULL,
    entry_type VARCHAR(32) NOT NULL DEFAULT 'NOTE', -- REFLECTION | STRATEGY | INTERVIEW_PREP | NOTE | POST_MORTEM
    title VARCHAR(255) NULL,
    content TEXT NOT NULL,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    legacy_id INTEGER NULL,
    CONSTRAINT fk_journal_application FOREIGN KEY (application_id, workspace_id)
        REFERENCES public.applications(id, workspace_id) ON DELETE SET NULL,
    CONSTRAINT chk_journal_entry_type CHECK (entry_type IN (
        'REFLECTION', 'STRATEGY', 'INTERVIEW_PREP', 'NOTE', 'POST_MORTEM'
    )),
    CONSTRAINT chk_journal_content_length CHECK (char_length(content) <= 50000)
);
```

**RLS Policies:**
- **SELECT:**
  - Owner: `auth.uid() = user_id AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND status = 'ACTIVE')`
  - Manager: `app.current_user_role(workspace_id) = 'MANAGER'`
- **INSERT:**
  - `auth.uid() = user_id AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND status = 'ACTIVE')`
- **UPDATE:**
  - `auth.uid() = user_id AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND status = 'ACTIVE')`
- **DELETE:**
  - `auth.uid() = user_id AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND status = 'ACTIVE')`

---

## 3. Phased Implementation Plan

### Phase 1: Planning, Invariant Verification & Baselining
- Author M13 Planning Package (`README.md`, `IMPLEMENTATION_PLAN.md`, `TEST_PLAN.md`, `ACCEPTANCE_CRITERIA.md`, `FINAL_PARITY_MATRIX.md`, `P0_P1_LAUNCH_CHECKLIST.md`, `POST_LAUNCH_DEFERRED.md`).
- Audit legacy JobQuest 1.0 features vs JobQuest 2.0 implementations.
- Establish clean baseline passing all unit, integration, and extension tests.

### Phase 2: Database Schema & Migration (`20261015100000_m13_global_search_journal.sql`)
- Create `journal_entries` table, composite foreign key with applications, check constraints, indexes.
- Enable RLS and author owner/manager policies for `journal_entries`.
- Implement `rpc_global_search(p_query, p_workspace_id, p_limit)`:
  - Caller membership validation (active, non-suspended).
  - Multi-domain union with owner/manager role enforcement.
  - Performance optimization with index scans.
- Grant execute permissions on RPC to `authenticated` role.
- Apply migration locally and on `jobquest-dev`.

### Phase 3: Journal / Notes Feature Delivery
- Build `apps/web/src/views/JournalView.tsx`:
  - List entries with entry type badges, pinned indicator, created dates, application links.
  - Create/Edit entry modal with entry type selector, title input, plain-text/markdown textarea, application link combobox.
  - Safe rendering escaping XSS vectors while preserving line breaks.
  - Delete entry confirmation.
- Connect route `/#/journal` in `App.tsx` and sidebar navigation in `Sidebar.tsx`.

### Phase 4: Command Palette & Global Search UI
- Build `apps/web/src/components/search/GlobalSearchModal.tsx`:
  - Command palette modal dialog.
  - Search input with debounced execution (200ms).
  - Domain filters (`All`, `Applications`, `Contacts`, `Notes`, `Interviews`, `Documents`).
  - Result list grouped by domain with count badges and keyboard selection highlight.
  - ArrowUp / ArrowDown navigation, Enter to navigate, Escape to dismiss.
  - Recent searches display when query is empty.
  - Responsive mobile bottom-sheet or full-screen command palette.
- Integrate into `AppShell.tsx`:
  - Global `Cmd+K` / `Ctrl+K` shortcut listener.
  - Topbar trigger button with search icon and keyboard shortcut badge.
  - MobileNav search trigger.

### Phase 5: Security Hardening & Complete RLS Matrix
- Write comprehensive integration test suite `tests/integration/m13-global-search-parity.test.ts`:
  - Global search correctness, cross-domain results, ranking.
  - Search workspace isolation (foreign workspace DENY).
  - Search peer-isolation (USER peer records omitted; MANAGER permitted).
  - Search suspended/removed member access revocation.
  - Journal entries RLS and CRUD verification.
  - Option B authentication hardening (rotation, replay, CSRF, rate limit).

### Phase 6: Full Cross-Milestone Regression Sweep
- Regress M1B through M12.
- Verify zero regressions in unit tests (120+), extension tests (27+), and integration suites.
- Verify Playwright browser E2E and WCAG 2.2 AA accessibility audit (0 violations).

### Phase 7: Hosted Dev, Vercel Preview & CI Verification
- Push migration to `jobquest-dev` hosted Supabase.
- Run hosted integration tests.
- Deploy to Vercel Preview (never `--prod`).
- Verify `/api/health`, Option B privacy, and preview E2E.
- Confirm exact-SHA GitHub Actions CI is green.

### Phase 8: Final Documentation & Handoff
- Generate M13 completion documentation suite:
  - `M13_IMPLEMENTATION_NOTES.md`
  - `M13_TEST_RESULTS.md`
  - `M13_VISUAL_REGRESSION.md`
  - `M13_INFRASTRUCTURE.md`
  - `M13_COMPLETION_REPORT.md`
  - `NEXT_AGENT_HANDOFF.md` (detailing M14 Release Candidate scope)
  - `CURRENT_AGENT_STATE.md`
- **STOP WITH M13 UNMERGED ON `feature/m13-global-search-hardening-parity`.**
