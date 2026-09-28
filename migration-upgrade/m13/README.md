# Milestone 13 — Global Search, Hardening & Final Product Parity Sweep

## Status

**PLANNED & INITIALIZED** — feature branch `feature/m13-global-search-hardening-parity` created from synchronized `development` (commit `4dc15e87`).

---

## Milestone Authority & Precedence Reconciliation

- **Authoritative Milestone:** **Milestone 13 — Global Search, Hardening & Final Product Parity Sweep**.
- **Role in Sequence:** This is the **final ordinary feature-development milestone** of JobQuest 2.0 prior to Milestone 14 (Release Candidate & Migration Rehearsal).
- **Key Source Documents:**
  - `migration-upgrade/GATE_01_ARCHITECTURE_PROPOSAL.md` §23 M13 (Global Search across all domains, security hardening, final parity sweep)
  - `migration-upgrade/FEATURE_CATALOG.md` (all 30+ legacy and upgraded features)
  - `migration-upgrade/BUSINESS_LOGIC_CATALOG.md` (BL-001 through BL-017)
  - `migration-upgrade/gate-03/TARGET_SCHEMA.md` (29 permanent target tables, including Table 19 `journal_entries`)
  - `migration-upgrade/gate-03/LEGACY_TABLE_MAPPING.md` (33-table legacy database mapping)
  - `migration-upgrade/gate-03/AUTHORIZATION_RLS_DESIGN.md` (complete RLS matrix and security model)
  - `migration-upgrade/DECISIONS.md` (ADR-001 through ADR-047)
  - `migration-upgrade/CHANGE_REQUESTS.md` (CR-001 through CR-032)
  - `migration-upgrade/OPEN_QUESTIONS.md` (OQ-001 through OQ-031)
  - `migration-upgrade/ui-design/gate-02b/` (Gate 02B mockups, J1–J3 Journal specs, Command Palette specs)

---

## Core Objectives

1. **Approved Global Search Engine & Command Palette:**
   - Unify quick search across all active workspace domains:
     - **Applications** (`company_name`, `role_title`, `job_description`, `notes`)
     - **Contacts** (`full_name`, `company_name`, `job_title`, `email`, `notes`)
     - **Notes / Journal** (`title`, `content`)
     - **Interviews** (`company_name`, `role_title`, `interview_type`, `interviewer_names`, `preparation_notes`, `feedback_notes`)
     - **Documents** (`title`, `label`, `file_name`, `notes`)
   - High-performance Postgres search RPC (`rpc_global_search`) with index optimization (trigram / tsvector / btree).
   - Command palette UX triggered via `Cmd+K` / `Ctrl+K`, topbar search trigger, and mobile search button.
   - Arrow-key navigation, Enter to open result, Escape to close, focus restoration, accessible ARIA combobox semantics.
   - Strict workspace-scoping and domain authorization (USER sees only own records; MANAGER sees workspace scope; zero cross-workspace or cross-peer leakage).

2. **Explicit Resolution of Journal / Notes (`FEATURE-NOTE-001`):**
   - Address legacy Table 32 (`notes`) and Gate 03 Table 19 (`journal_entries`).
   - Implement `journal_entries` table with UUIDv4 PK, workspace scoping, owner attribution, optional application link, timestamps, and RLS.
   - Build complete web UI (`JournalView.tsx` replacing `PlaceholderView`) supporting list view, entry reader (J1), editor (J2), and mobile view (J3) with 5 note types and plain-text/safe-markdown editing.
   - Verify zero XSS vulnerability and full test coverage.

3. **Final Security & Authorization Hardening:**
   - Complete verification of Option B authentication (Argon2id hashing, ES256 JWTs, refresh token rotation, session revocation).
   - Replay protection, rate limiting, and CSRF origin validation verification.
   - Comprehensive RLS authorization matrix across 10 security personas (anonymous, user own, user peer, manager same workspace, manager cross-user, foreign user, foreign manager, removed member, suspended member).

4. **Exhaustive Parity Audit & Final Parity Matrix:**
   - Authoritative audit of all features from `FEATURE_CATALOG.md`, `BUSINESS_LOGIC_CATALOG.md`, `ROUTE_SCREEN_INVENTORY.md`, `API_INVENTORY.md`, and Gate 02B screens.
   - Generate `FINAL_PARITY_MATRIX.md` with 10 mandatory columns and strictly allowed dispositions (zero blanks).
   - Generate `P0_P1_LAUNCH_CHECKLIST.md` confirming every launch-critical requirement is verified.
   - Generate `POST_LAUNCH_DEFERRED.md` documenting intentional post-launch deferrals with explicit rationale.

5. **Full Cross-Milestone Regression Sweep:**
   - Regress M1B through M12 end-to-end (Auth, Shell, Applications, Contacts, Interviews, Tasks/Habits/Queue, Documents/Resumes, Analytics/Goals, Dashboard, Import/Export, Extension, Workspace Management).

6. **Local Quality Gate & Hosted Dev / Preview Validation:**
   - Lint PASS, typecheck PASS, unit tests PASS, extension tests PASS, integration tests PASS, local Supabase PASS, hosted dev (`jobquest-dev`) PASS.
   - Vercel Preview deployment verified with health 200, E2E lifecycle, zero identity leakage, zero high/critical a11y violations.
   - Tracked secrets, web bundle, and extension bundle secret scans 100% clean.

---

## Execution Boundary Rules

- **DO NOT MERGE M13:** M13 must remain on branch `feature/m13-global-search-hardening-parity` for user review.
- **DO NOT TOUCH MAIN OR PRODUCTION:** Production Supabase, Vercel `--prod`, production DNS, and `JobQuest1.0/` are strictly untouched.
- **DO NOT START M14:** M14 (Release Candidate & Migration Rehearsal) scope will be documented in `NEXT_AGENT_HANDOFF.md` only; its branch will not be created.
