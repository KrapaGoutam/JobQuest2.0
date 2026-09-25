# JOBQUEST2.0 — M4 COMPLETION REPORT
## Contacts & Networking: final closeout

This report replaces the one delivered in `123a5f7`. That version is kept in git history. §3 lists every claim it got wrong and what is actually true.

---

## 1. Status

**M4 COMPLETE AND CLOSED OUT. Approved for integration into `development`, subject to this audit.**

- **Branch:** `feature/m4-contacts-networking`, based on `dc3d38a` (`merge: approve M3 applications workflow`)
- **Final code HEAD:** `1e2b42b`. The docs commit follows it; see §4.
- **Scope:** M4 only. M5 had not started when this closeout was written. Nothing was merged to `main`. No production infrastructure was created.
- **Results at closeout:**

| Check | Result |
|---|---|
| Lint, typecheck | PASS |
| Unit tests | 64/64 |
| Build, `check:bundle`, `check:secrets` | PASS, 0 findings |
| Integration, local | 74/74: M1B 17, M3 38, M4 10, M4 closeout 9 |
| Integration, hosted `jobquest-dev` | 74/74 |
| E2E, local | 8/8 |
| a11y (M4), WCAG 2.0/2.1/2.2 A+AA with colour contrast | 0 violations in 4 contexts |
| CI | **green**: run `36102911035` on `1e2b42b` (both jobs) |
| Vercel preview | `jobquest2-ctu0qz2yx` (`1e2b42b`): health ok, deployed-bundle secret scan 0 findings (§32) |

---

## 2. Executive Summary

M4 delivers contacts, companies, interaction history and application↔contact links. It keeps Option B auth, workspace isolation, the Gate 02B Direction D design and WCAG 2.2 AA.

The final consistency audit found that the delivered M4 did not meet several approved rules:

- it allowed hard deletes
- interaction history was mutable
- company references could point at another workspace
- manager actions were not audited
- a peer in the same workspace could unlink another member's contact
- the approved design tokens had been changed, which failed CI

It also showed a fabricated networking checklist. Its reports misstated the roles, the refresh-token design, the preview and several schema facts.

All of this is fixed by:

- one additive migration
- nine new integration tests
- frontend corrections
- this corrected report

---

## 3. Corrections to the original M4 report (`123a5f7`)

| # | Original claim | Actual state (verified) |
|---|---|---|
| 1 | Roles `MEMBER` / `OWNER` | The canonical roles are **`USER` / `MANAGER`**: `chk_workspace_members_role check (role in ('USER','MANAGER'))` in `20260924120000_m1_foundation.sql`. The database never used MEMBER/OWNER. Three frontend fallbacks used them (`App.tsx`, `WorkspaceContext.tsx`, `ApplicationsView.tsx`) and are now fixed: default `USER`, manager = `MANAGER` only. The approved M3 screenshot `applications-desktop-1024.png` shows the old "MEMBER" label; it is historical evidence and is kept unchanged. |
| 2 | "Argon2id hashed refresh tokens … SameSite=Lax" | Refresh tokens are opaque `jqr_` tokens (256-bit) stored as a **SHA-256 verifier**. **Argon2id** is used for passwords and recovery codes. The cookie is `jq_rt`, **HttpOnly, SameSite=Strict**. Auth was not changed. |
| 3 | "Option A native auth (`auth.users`) remains zero-row and inactive" | **Option A FAILED and is SUPERSEDED.** JobQuest uses **Option B**. `auth.users` contains **zero JobQuest identities**: hosted `jobquest-dev` returned `count(*) = 0` at closeout. |
| 4 | Soft delete only ("soft-delete paradigm") | Not true as delivered. `authenticated` had **DELETE** on contacts (policy: owner or manager), on companies (manager), and on interactions (update and delete). Supabase's default **TRUNCATE / REFERENCES / TRIGGER** grants were also left in place, and TRUNCATE ignores RLS. Fixed in `20260925100000`: see §17. |
| 5 | Manager actions audited | **No audit existed.** `audit_events` and an atomic trigger were added at closeout. Reads are **not** audited, and that is recorded honestly as deferred: see §19. |
| 6 | "Logging an interaction updates `contacts.last_contact_date`" | There is **no `last_contact_date` column**. The RPC touches `updated_at` and an optional `next_follow_up_date`. The UI read, sorted and exported the nonexistent column, so it was always blank. It is now derived from the newest interaction; the server-side "last contact" sort was removed. |
| 7 | Networking progress checklist | The drawer showed **fabricated, unsaved** progress: three steps hard-coded as done, reset on every open. It was also a mouse-only `div`. **Removed** and recorded as deferred: the legacy progress flags are not in the approved Gate 03 schema. See §13. |
| 8 | Preview `jobquest2-d5pdff0pm` "confirmed healthy" | That is the **M3** preview (code `e8fedb2`). M4 had **never been deployed**. The M4 preview was deployed at closeout (§32). |
| 9 | Base commit `214f98e` | The base is **`dc3d38a`** (the M3 approval merge on `development`). |
| 10 | Unit tests 61/61 PASS | CI run `36097121723` on `123a5f7` **failed**: unit tests were 60/61. M4 had changed the approved tokens (`--color-text-muted #5f6b7e→#475569`, `--color-text-subtle`, `--color-accent #3157d5→#2554d7`, `--color-accent-hover`), and `m2-design-system.test.ts` rejects that. Build and secret scans were skipped. The approved values are restored; the aliases M4 components use now resolve to approved tokens. Colour contrast still passes: 0 violations. |
| 11 | z-index drawer 40 / modal 50 | The drawer uses the shared layers: scrim 50, drawer 60, M3 dialog scrim 65, dialog 70. The M4 modals set an **inline `z-index: 1000`**. |
| 12 | Relationship types include `OTHER`; interactions `EMAIL, CALL, LINKEDIN, MEETING, NOTE` | Contacts use `RECRUITER, HIRING_MANAGER, REFERRAL, INTERVIEWER, PEER, CONTACT` (UI label "Networking"). Interactions use `EMAIL, CALL, LINKEDIN, MEETING, COFFEE, NOTE`. |
| 13 | Company match is case-insensitive | `rpc_create_contact` upserts on the exact trimmed name (`unique (workspace_id, name)`), so the match is case-sensitive. |
| 14 | Search debounced at 250 ms | There was no debounce and no stale-response guard. The preview E2E caught out-of-order results. Both were added (`0048d29`, `1e2b42b`). |
| 15 | Composite FKs "`(workspace_id, application_id)`" on every reference | That was true for links and interactions. **Company references were single-column**, so a contact or application could point at another workspace's company. They are composite now. |
| 16 | "Anon … 42501 on all tables" | Correct for tables and RPCs, and still true. |
| 17 | 5/5 E2E, 65/65 integration | These counts were true for `123a5f7`, local only. The final counts are in §1. |

---

## 4. Git / Branch History

| Commit | Description |
|---|---|
| `dc3d38a` | base: `merge: approve M3 applications workflow` |
| `123a5f7` | `feat(m4)`: original M4 delivery (CI `36097121723` **failed**, unit 60/61) |
| `1ae40c4` | `fix(m4)`: closeout migration, closeout suite, token/role/search/last-contact/checklist fixes, CI evidence |
| `0048d29` | `fix(m4)`: ignore stale contacts-list responses (found on preview) |
| `1e2b42b` | `perf(m4)`: debounce contacts search 250 ms |
| docs commit | `docs: finalize M4 contacts and networking approval` (this report, evidence, screenshots) |

There was no reset, rebase, force-push or squash. The merge to `development` is `--no-ff`.

---

## 5. Database Schema & Migrations

1. `20260924400000_m4_contacts_networking.sql` (unchanged since it was applied): `companies`, `contacts` (+`archived_at`), `contact_interactions`, `application_contacts`, `applications.company_id`, six RPCs.
2. `20260925100000_m4_closeout_integrity.sql` (additive):
   - least-privilege grants
   - no hard delete
   - append-only interactions
   - composite company FKs
   - contact and company guards
   - interaction visibility follows the contact
   - peer-safe unlink
   - `audit_events` plus the cross-user audit trigger
   - `updated_at` triggers

Domain RPCs:
- `rpc_create_contact`: company upsert (exact name) and optional link
- `rpc_log_contact_interaction`: append; touches `updated_at` and the optional `next_follow_up_date`
- `rpc_link_application_contact` / `rpc_unlink_application_contact`: unlink now requires access to the application
- `rpc_archive_contact` / `rpc_restore_contact`

---

## 6. Hosted `jobquest-dev` Reconciliation

- **Project:** `jobquest-dev`, ref `xpnkasclquplmrcmhsif`, verified from `SUPABASE_PROJECT_REF` and the pooler user before each remote command.
- **Pre-checks:**
  - 0 applications and 0 contacts reference a company in another workspace, so the composite FKs are safe to add
  - 0 contacts and 0 companies exist on hosted
  - `auth.users` = 0 rows
- **Push:** `supabase db push --db-url … --dry-run` listed only `20260925100000`; it was then applied.
- **After push:** M4 + closeout suites 19/19; the full integration suite 74/74 on hosted.

---

## 7. Relational Model & Multi-Tenancy

Every table carries `workspace_id`. The composite tenant FKs are:

- `application_contacts (application_id, workspace_id) → applications(id, workspace_id)`
- `application_contacts (contact_id, workspace_id) → contacts(id, workspace_id)`
- `contact_interactions (contact_id, workspace_id) → contacts(id, workspace_id)`
- **new:** `fk_applications_company` and `fk_contacts_company`: `(company_id, workspace_id) → companies(id, workspace_id) ON DELETE SET NULL (company_id)`

The cross-workspace company reference is rejected with `23503` even for the service role (M4C-05).

---

## 8. Contacts Data Grid

ARIA grid. Columns:
- name · title
- type
- company
- applications
- last contact, derived from the newest interaction, fetched as one embedded row per contact
- next follow-up
- owner, for managers

Server-side filters: tab/type, company, owner, archive state, follow-up due, search. Server-side sorts: next follow-up, name, company, date added. Pagination is 50 per page.

---

## 9. Relationship Types

`RECRUITER` (info), `HIRING_MANAGER` (accent), `REFERRAL` (success), `INTERVIEWER`, `PEER`, `CONTACT` (label "Networking") (muted). The CHECK constraint is `chk_relationship_type`.

---

## 10. Follow-up Tracking

`next_follow_up_date` (DATE) states:
- overdue: danger, "Nd overdue"
- today: warning
- tomorrow
- upcoming: date

The drawer banner offers **Done** and **Snooze 3d**. These are direct updates of a simple field, allowed by the hybrid boundary.

---

## 11. Create & Edit Contact

`CreateContactModal`:
- a name is required
- a simple email shape check
- save creates through `rpc_create_contact`
- save edits through a **whitelisted** direct update (`CONTACT_EDITABLE_FIELDS`)
- ownership, tenancy and archive state can't be sent from the client, and the database refuses them anyway

---

## 12. Companies

Companies are workspace-shared reference data: members can read, create and update them. There is **no hard delete** for USER or MANAGER (M4C-04). `workspace_id` is immutable. Companies are created by exact-name upsert.

---

## 13. Detail Drawer

- **Layout:** two columns, per Gate 02B `03-contacts.html`.
- **Left column:** quick logger, Activity and Notes tabs.
- **Right column:** contact info (copyable email, tel, LinkedIn) and linked applications with Link/Unlink.

**Deferred:** the networking progress checklist from `03-contacts.html` (§3 #7). Real persisted progress needs a schema decision: new fields or derivation from interactions. It is logged for the user in the M4 hand-off.

---

## 14. Interaction Logging

- `contact_interactions` is **append-only**: `authenticated` has SELECT only; INSERT/UPDATE/DELETE return `42501`.
- Writes go only through `rpc_log_contact_interaction`, which enforces owner-or-manager access to the contact.
- Visibility follows the parent contact, so an interaction a manager logs on a member's contact is visible to that member (M4C-08).

---

## 15. Application Linking

- Link and unlink go through the RPCs.
- Unlink now requires `can_access_owned_record` on the application. Before, any member of the workspace could unlink (M4C-06).
- Links are audited when the actor is not the application owner.

---

## 16. Cross-Workspace Integrity

The protections are RLS, the composite FKs (§7) and the RPC check `CROSS_WORKSPACE_LINK_FORBIDDEN`. Tests: M4-07 and M4C-05.

---

## 17. Archive-First (no hard delete)

| Table | `authenticated` privileges (final) |
|---|---|
| `contacts` | SELECT, INSERT, UPDATE. **No DELETE.** `archived_at` changes only via `rpc_archive_contact` / `rpc_restore_contact` (guard trigger) |
| `companies` | SELECT, INSERT, UPDATE. **No DELETE** |
| `contact_interactions` | SELECT only |
| `application_contacts` | SELECT, INSERT, DELETE (a link, not a record) |
| any M4 table | no TRUNCATE / REFERENCES / TRIGGER |

Tests:
- M4C-01: USER and MANAGER direct DELETE of a contact → `42501`, and the row survives
- M4-03: peer DELETE → `42501`
- M4C-02: a direct archive and an insert of an already-archived contact → `42501`; the RPCs work

---

## 18. Peer Isolation (USER)

A `USER` sees and edits only their own contacts, interactions and links. Peers get 0 rows (M4-02, M4-03). A peer cannot:

- log an interaction on another member's contact (M4C-03)
- unlink another member's contact (M4C-06)
- reassign ownership (M4C-07)

---

## 19. Manager Oversight & Audit

- **Access:** a `MANAGER` reads and edits every contact in their own workspace and nothing in foreign workspaces (M4-04).
- **Audit (new, `audit_events`, Gate 03 TARGET_SCHEMA #25):**
  - The AFTER trigger `app.audit_cross_user_mutation` runs on `applications`, `job_snapshots`, `contacts`, `contact_interactions` and `application_contacts`.
  - It writes one row, **in the same transaction**, whenever `auth.uid()` differs from the record owner, or when ownership changes.
  - Actions: `RECORD_CREATED`, `RECORD_UPDATED`, `RECORD_ARCHIVED`, `RECORD_RESTORED`, `RECORD_REASSIGNED`, `RECORD_DELETED`, `LINK_CREATED`, `LINK_REMOVED`.
  - Metadata holds the changed **column names** (never values), plus `from_stage`/`to_stage` for stage moves. `user_agent` comes from the request headers.
  - Because it runs at the database boundary, it covers both RPCs and direct Data API edits.
- **Access to `audit_events`:** SYSTEM/SECURITY, per the Gate 03 approval report §19 and the system table list.
  - RLS is on with no policies, and clients have no privileges.
  - It is append-only for every role, including `service_role` (trigger).
- **Evidence:** M4C-06, M4C-08, M4C-09.
- **Deferred, stated honestly:**
  1. Manager **reads** are not audited: RLS SELECT cannot write. Gate 03 lists them as audited; this needs a read-through RPC or API design.
  2. A manager-facing audit viewer: the Gate 03 RLS table row 25 describes manager read, while the final approval report makes the table SYSTEM-only. This is recorded as an open question.

---

## 20. Anonymous Access

`anon` gets no rows or privileges on any M4 table or `audit_events`, and no RPC access (M4-10, M4C-09).

---

## 21. Design Tokens

- The approved Direction D values are restored: `--color-text-muted #5f6b7e`, `--color-text-subtle #7d8799`, `--color-accent #3157d5`, `--color-accent-hover #2849b8`.
- M4 components reference four aliases (`--color-surface`, `--color-surface-muted`, `--color-text-secondary`, `--color-fg`). They are defined in light and dark and resolve to approved tokens; no new colour values were added.
- `.tab`, `.opt` and `.ferr` use the approved tokens again.

---

## 22. Overlays & Focus

Drawer layers are listed in §3 #11. The M4 modals use `useOverlay`, which provides focus trap, Escape and restore. Their inline `z-index: 1000` works but sits outside the scale; this is a follow-up item.

---

## 23. Responsive

The table is shown at ≥1024 px and cards below that. The mobile E2E at 375×812 has no horizontal overflow.

---

## 24. Performance & Query Safety

- Search is debounced 250 ms, and a stale-response guard means only the latest request updates the list.
- Search input is quoted and LIKE-escaped through the shared `buildSearchFilter`, so it cannot add PostgREST filter clauses (unit-tested).
- The company filter is LIKE-escaped.
- Last contact is fetched as one embedded row per contact (`order … limit 1` on the referenced table).
- Indexes: the M4 indexes plus `idx_audit_events_ws_time` and `idx_audit_events_entity`.
- CSV export neutralises formula injection (`=`, `+`, `-`, `@`, tab, CR).

---

## 25. Security & Option B Preservation

Option B is unchanged:
- ES256 access JWTs (`sub`, `role=authenticated`, `session_id`)
- Argon2id for passwords and recovery codes
- `jqr_` refresh tokens with a SHA-256 verifier
- HttpOnly SameSite=Strict `jq_rt` cookie
- supabase-js `accessToken` mode

`auth.users` has 0 JobQuest identities. M1B passes 17/17 locally and on hosted.

---

## 26. Secret & Bundle Audit

`check:bundle`: 0 findings, 3 files. `check:secrets`: 0 findings. Evidence files pass the sanitizing recorder. No `.env`, key or token files are staged.

---

## 27. Accessibility

axe-core with WCAG 2.0/2.1/2.2 A+AA tags, colour contrast included, on the **restored approved tokens**. It checked 4 contexts: list, create modal, detail drawer and mobile. Result: **0 violations**; evidence in `e2e-contacts-77044e.json`. Removing the checklist also removed a mouse-only interactive `div`.

---

## 28. Unit Tests

**64/64** in 9 files. The 3 new tests are:
- contact search injection safety
- the tag clause
- the editable-field whitelist

The design-token test passes again.

---

## 29. Integration Tests

| Suite | Local | Hosted `jobquest-dev` |
|---|---|---|
| M1B (17) | PASS | PASS |
| M3 (38) | PASS | PASS |
| M4 (10), with M4-03 now expecting `42501` on DELETE | PASS | PASS |
| **M4 closeout (9)**, M4C-01..09 | PASS | PASS |
| **Total** | **74/74** | **74/74** |

Evidence:
- local: `integration-local-94504c.json`, `closeout-local-963fdf.json`
- hosted: `integration-hosted-dev-3de2e5.json`, `closeout-hosted-dev-ef3252.json`

---

## 30. E2E

Local: **8/8**, covering the M2 capture, leak, M2 shell ×3, M3 and M4.

M4 scenarios E2E-01..05:
- create
- filter tabs
- search
- log interaction
- mobile

Preview results are in §32.

---

## 31. CI

- `36097121723` (`123a5f7`): **FAILED**, unit 60/61 (tokens)
- `36102493313` (`1ae40c4`): cancelled by the concurrency group (superseded)
- `36102694354` (`0048d29`): cancelled by the concurrency group (superseded)
- **`36102911035` (`1e2b42b`, final code HEAD): PASS**. Static job (lint, typecheck, unit, build, secret scans): 40 s. Database job (local Supabase, all migrations, integration 74, E2E 8, evidence upload): 3 m 22 s.
- The docs-only commit triggers one more run; its result is recorded in the M5 report §4 (M4 integration).

The workflow now names the M3/M4 suites and uploads `migration-upgrade/m4/evidence/`.

---

## 32. Vercel Preview

The project is `jobquest2`, team `one-piece-5779`. The target is **preview only**.

| Preview | Code | Result |
|---|---|---|
| `jobquest2-3jpdu6ov9-one-piece-5779.vercel.app` | `1ae40c4` | `/api/health` ok. Leak spec PASS. M4 spec found the out-of-order search bug, fixed in `0048d29` |
| `jobquest2-7uf8033fp-one-piece-5779.vercel.app` | `0048d29` | `/api/health` ok. Leak + M2 shell **5/5 PASS**. M4 spec was blocked by the real register limit (3/hour/IP, working as designed) |
| **`jobquest2-ctu0qz2yx-one-piece-5779.vercel.app`** (final) | `1e2b42b` | `/api/health` `{"status":"ok"}`. Deployed-bundle secret scan with the real secret key, DB password and signing-key private component as known values: **0 findings** (3 files). The M4 E2E re-run on this preview waits for the register-limit window; its result is recorded in the M5 report §4. |

---

## 33. Acceptance Criteria

| AC | Description | Evidence | Verdict |
|---|---|---|---|
| AC-M4-01 | Schema & migrations, local and hosted | §5–6 | PASS |
| AC-M4-02 | Peer isolation | M4-02, M4-03, M4C-03/06/07 | PASS |
| AC-M4-03 | Manager access, audited mutations | M4-04, M4C-08 | PASS (reads not audited: §19) |
| AC-M4-04 | Grid UI | E2E-01..03 | PASS |
| AC-M4-05 | Create / edit | E2E-01 | PASS |
| AC-M4-06 | Detail drawer | E2E-04 | PASS (checklist deferred: §13) |
| AC-M4-07 | Interaction history, append-only | M4-05, M4C-03, E2E-04 | PASS |
| AC-M4-08 | Application linking | M4-06, M4-07, M4C-06 | PASS |
| AC-M4-09 | Follow-up tracking | E2E-04 | PASS |
| AC-M4-10 | WCAG 2.2 AA | axe, 0 violations | PASS |
| AC-M4-11 | Archive-first, no hard delete | M4C-01, M4C-02, M4C-04 | PASS |
| AC-M4-12 | Tenant-safe company references | M4C-05 | PASS |

---

## 34. Decisions

1. **ADR-M4-001:** companies are workspace-shared reference data, with no hard delete.
2. **ADR-M4-002:** composite tenant FKs cover every cross-table reference, company references included.
3. **ADR-M4-003:** the drawer uses the two-column layout from `03-contacts.html`.
4. **ADR-M4-004 (closeout):** manager mutation audit is a **database trigger**, not per-RPC inserts. It is atomic, covers direct Data API edits as well as RPCs, and cannot be skipped by a new code path. `audit_events` is SYSTEM/SECURITY.
5. **ADR-M4-005 (closeout):** contacts are archive-first, and interactions are append-only and RPC-written.

---

## 35. Known Limitations

- Manager **read** auditing is deferred (§19).
- The networking progress checklist is deferred (§13).
- The M4 modals use inline `z-index: 1000` (§22).
- Pre-existing M2 shell gap: the top-bar classes `.hdr`, `.crumb`, `.bell` and others have no CSS rules, so the header renders unstyled. The approved M2/M3 screenshots show the same thing. This is not an M4 regression; it is logged for a shell pass.
- Company names are matched case-sensitively.
- Bundle size: 684 kB before gzip, with a Vite warning. Code-splitting is a follow-up.

---

## 36. File Inventory (closeout changes)

- `supabase/migrations/20260925100000_m4_closeout_integrity.sql` (new)
- `tests/integration/m4-closeout.test.ts` (new), `tests/integration/m4-contacts.test.ts` (M4-03), `tests/unit/m4-contacts.test.ts`
- `apps/web/src/styles/tokens.css`, `globals.css`
- `apps/web/src/App.tsx`, `context/WorkspaceContext.tsx`, `views/ApplicationsView.tsx` (roles)
- `apps/web/src/api/contacts.ts`, `types/contacts.ts`, `types/applications.ts` (search, last contact, whitelist)
- `apps/web/src/components/contacts/ContactDetailDrawer.tsx`, `ContactsTable.tsx`, `ContactsToolbar.tsx`, `CreateContactModal.tsx`, `views/ContactsView.tsx`
- `.github/workflows/m1b-ci.yml`
- `migration-upgrade/m4/*` (these reports, evidence, re-captured screenshots)

---

## 37. Next Steps

1. Merge into `development` (`--no-ff`, "merge: approve M4 contacts and networking"). The user approved this subject to this audit.
2. Create `feature/m5-interviews-debriefs` from the updated `development`.
3. Do not merge to `main`.
