# Milestone 13 — Implementation Notes: Global Search, Hardening & Final Product Parity Sweep

## 1. Architectural Overview & Context

Milestone 13 represents the final functional milestone of the JobQuest 2.0 migration before the Release Candidate phase (Milestone 14).
Its dual focus is:
1. **Global Search (`CR-017`)**: Unified, workspace-isolated, cross-domain search (`Cmd+K`/`Ctrl+K`, accessible command palette, arrow-key navigation, domain filtering across Applications, Contacts, Notes/Journal, Interviews, and Documents).
2. **Career Journal Launch Parity (`FEATURE-NOTE-001`)**: Resolution of the Career Journal / Notes parity gap through the dedicated `journal_entries` table, RLS policies, manager audit triggers, typed PostgREST client, and full-featured UI workbench (`JournalView.tsx`) with 5 entry types, pin/unpin toggles, title/content search, and optional application linking.

All additions strictly preserve JobQuest 2.0 core architectural invariants:
- **Option B Authentication Unchanged**: Zero synthetic users in `auth.users`; sessions are Node-managed ES256 JWTs with HttpOnly refresh cookies; PostgREST and RPCs authenticate via `auth.uid()`.
- **Strict Workspace Isolation**: All queries enforce `workspace_id = auth.uid()`-derived membership filters. Users cannot read or search cross-workspace data.
- **Defense in Depth**: Database operations are implemented via PostgreSQL `SECURITY DEFINER` stored procedures with `SET search_path = ''`.

---

## 2. Database Schema & Migration (`20261015100000_m13_global_search_journal.sql`)

### 2.1 Table `public.journal_entries`
- `id uuid primary key default gen_random_uuid()`
- `workspace_id uuid not null references public.workspaces(id) on delete cascade`
- `user_id uuid not null references public.user_accounts(user_id) on delete cascade`
- `application_id uuid references public.applications(id) on delete set null`
- `title text not null check (char_length(trim(title)) between 1 and 200)`
- `content text not null`
- `entry_type text not null check (entry_type in ('GENERAL', 'REFLECTION', 'DECISION', 'MEETING', 'STRATEGY')) default 'GENERAL'`
- `tags text[] not null default '{}'`
- `is_pinned boolean not null default false`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### 2.2 RLS Policies
- `p_journal_entries_read`: Active workspace members can read entries. Regular `USER`s read own entries; `MANAGER`s read all entries within the workspace.
- `p_journal_entries_insert`: Authenticated users can insert entries for themselves within active workspaces where they hold membership.
- `p_journal_entries_update`: Owners can update their own entries; Managers can update entries in workspaces they manage.
- `p_journal_entries_delete`: Owners can delete their own entries; Managers can delete entries in workspaces they manage.

### 2.3 Stored Procedures & Triggers
- `rpc_create_journal_entry(p_workspace_id, p_title, p_content, p_entry_type, p_application_id, p_tags, p_is_pinned)`:
  Validates membership, inserts entry, logs manager audit event if actor is a manager acting on behalf of another user.
- `rpc_update_journal_entry(p_entry_id, ...)`:
  Validates owner or manager status, updates entry fields atomically, records audit event.
- `rpc_delete_journal_entry(p_entry_id)`:
  Validates owner or manager status, deletes row, records audit event.
- `trg_audit_journal_entries`:
  Trigger on `journal_entries` auditing cross-user mutations by workspace managers into `public.audit_events`.
- `rpc_global_search(p_query, p_workspace_id, p_domain, p_limit)`:
  Multi-domain search querying:
  - **Applications**: Company name, role title, notes, and joined job description from `public.job_snapshots`.
  - **Contacts**: Full name, company, email, role, and notes.
  - **Notes / Journal**: Journal entry title, content, tags, and entry type.
  - **Interviews**: Role title, round name, format, interviewer names, and notes.
  - **Documents**: File name, category, and notes.

---

## 3. Frontend Architecture

### 3.1 Global Search Modal (`apps/web/src/components/search/GlobalSearchModal.tsx`)
- Command palette pattern activated globally via `Cmd+K` (macOS) or `Ctrl+K` (Windows/Linux) or Topbar trigger.
- Full WCAG 2.2 AA keyboard accessibility:
  - Accessible dialog (`role="dialog"`, `aria-label="Global Search Command Palette"`);
  - Combobox input (`role="combobox"`, `aria-autocomplete="list"`, `aria-controls="global-search-results-list"`);
  - Result listbox (`role="listbox"`, `aria-label="Search results"`, `aria-activedescendant`);
  - Keyboard navigation: Arrow Down, Arrow Up, Enter to select, Escape to close;
  - Domain filtering pills: All, Applications, Contacts, Notes, Interviews, Documents;
  - LocalStorage-backed recent search history (max 6 items per workspace);
  - 250ms debounced search dispatch.

### 3.2 Career Journal Workbench (`apps/web/src/views/JournalView.tsx`)
- Route: `/#/journal`.
- Features:
  - J1 Reader: Responsive card grid showing entry type pill, pinned indicator, linked application badge, relative timestamp, title, and formatted snippet.
  - J2 Editor Modal: Modal dialog with title, entry type selector, application linking dropdown, content textarea, tag input, and pin toggle.
  - J3 Mobile View: Optimized mobile layout (viewport 390px) with single-column flow and touch targets ≥ 44px.
  - Interactive Pin/Unpin: Immediate optimistic toggle with PostgREST/RPC persistence.
  - Filter Bar: Real-time search filter by title/content, dropdown filter by entry type, and pinned-only toggle button.

---

## 4. Launch Parity & Hardening Sweep

With M13 complete, all 41 product capabilities in `FINAL_PARITY_MATRIX.md` are accounted for:
- 34 features classified as **PARITY MET** or **SUPERSEDED** (enhanced beyond legacy).
- 7 non-essential/redundant features explicitly classified as **DEFERRED** (documented in `POST_LAUNCH_DEFERRED.md`).
- Zero unclassified or ambiguous features remain.
