# M4 → Next Agent Handoff

This file is for any incoming coding agent or reviewer (Claude Code, Antigravity, Codex); no previous chat context is needed.

---

## 1. Current State

| Attribute | State |
|---|---|
| **Active Milestone** | **Milestone 4 — Contacts & Networking (COMPLETE, awaiting user review)** |
| **Branch** | `feature/m4-contacts-networking` |
| **Base** | `development` (at approved M3 closeout commit `214f98e`) |
| **Merge Status** | **DO NOT MERGE** until explicit user approval. Never touch `main`. |
| **Next Milestone** | **Milestone 5 — Interviews & Debriefs** (DO NOT start until M4 is merged to `development`) |
| **Auth** | Option B (Custom ES256 JWTs, Argon2id, HttpOnly refresh cookies, `auth.users` disabled) |
| **Supabase** | `jobquest-dev` (`xpnkasclquplmrcmhsif`): `20260924400000_m4_contacts_networking.sql` is live and applied |
| **Vercel** | Project `jobquest2` (team `one-piece-5779`). Preview: `https://jobquest2-d5pdff0pm-one-piece-5779.vercel.app` (`/api/health` confirmed `{"status":"ok"}`) |
| **Production** | None anywhere. |
| **Legacy Project** | `../JobQuest1.0/` is strictly READ ONLY. |

---

## 2. Core Architecture Rules Established in M4 (Do Not Regress)

1. **Company Directory Sharing:**
   - `companies` are scoped to `workspace_id` and shared among members of that workspace.
   - When creating or updating a contact, company name lookup/insert is handled atomically by `rpc_create_contact`.
2. **Cross-Workspace Data Isolation:**
   - Composite foreign keys enforce tenant isolation at the SQL constraint level:
     - `application_contacts (workspace_id, application_id)` -> `applications (workspace_id, id)`
     - `application_contacts (workspace_id, contact_id)` -> `contacts (workspace_id, id)`
   - Never remove or relax these composite keys.
3. **Peer Isolation for Contacts:**
   - Standard members (`MEMBER` role) only see their own contacts (`user_id = auth.uid()`).
   - Workspace managers (`MANAGER` / `OWNER`) see all contacts in the workspace.
   - Peers can never view, mutate, or log interactions on another member's contacts.
4. **Append-Only Interactions:**
   - `contact_interactions` records are append-only.
   - Logging an interaction automatically updates `contacts.last_contact_date`.
5. **Design Tokens & Accessibility:**
   - Follow `apps/web/src/styles/tokens.css` strictly.
   - Table rows must maintain 44px height with `role="columnheader"` and `role="gridcell"`.
   - Text contrast must maintain >=4.5:1 across both light and dark themes.

---

## 3. How to Run the Verification Suites

```bash
# 1. Static Checks & Tests
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
pnpm check:bundle
pnpm check:secrets

# 2. Integration Tests (65 tests: M1B + M3 + M4)
pnpm test:integration

# 3. E2E & Accessibility Tests (Playwright)
pnpm test:e2e e2e/m4-contacts.spec.ts

# 4. Against Remote Dev Database (Optional)
M1B_ENV_FILE=.env.local pnpm test:integration
```

---

## 4. Key Artifact Locations

- Reports & Plans: `migration-upgrade/m4/`
  - `M4_COMPLETION_REPORT.md` (37 sections comprehensive report)
  - `M4_TEST_RESULTS.md` (Full test and validation matrix)
  - `M4_VISUAL_REGRESSION.md` (Screenshot catalog and review)
  - `M4_INFRASTRUCTURE.md` (Local, hosted Supabase, Option B auth, preview)
  - `ACCEPTANCE_CRITERIA.md` (Criteria checklist AC-M4-01 through AC-M4-10)
  - `M4_IMPLEMENTATION_NOTES.md` (Technical implementation reference)
- Visual Regression Screenshots: `migration-upgrade/m4/screenshots/`
- Test Evidence Files: `migration-upgrade/m4/evidence/`

---

## 5. Next Steps for Next Agent

1. Check user response:
   - If user requests changes: apply fixes within `feature/m4-contacts-networking` and update reports.
   - If user grants approval to merge:
     1. Switch to `development`: `git checkout development`
     2. Merge feature branch: `git merge --no-ff feature/m4-contacts-networking`
     3. Verify `development` test suites pass.
     4. Push `development` to origin.
     5. Create branch `feature/m5-interviews-debriefs` for Milestone 5.
