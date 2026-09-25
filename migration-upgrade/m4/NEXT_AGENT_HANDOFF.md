# M4 → Next Agent Handoff (final closeout)

This file is for any incoming coding agent or reviewer (Claude Code, Antigravity, Codex). You don't need any earlier chat context.

---

## 1. Current State

| Attribute | State |
|---|---|
| **Milestone** | M4 Contacts & Networking: **closed out and approved** for `development` (merge `--no-ff` "merge: approve M4 contacts and networking") |
| **Branch** | `feature/m4-contacts-networking`, based on `dc3d38a` |
| **Final code HEAD** | `1e2b42b`; the docs commit `docs: finalize M4 contacts and networking approval` follows it |
| **Roles** | Canonical **`USER` / `MANAGER`** (`chk_workspace_members_role`). MEMBER/OWNER don't exist. |
| **Auth** | Option B. ES256 access JWTs. **Argon2id** for passwords and recovery codes. Opaque `jqr_` refresh tokens with a **SHA-256 verifier**, carried in an HttpOnly **SameSite=Strict** `jq_rt` cookie. **Option A FAILED/SUPERSEDED**: `auth.users` holds zero JobQuest identities. |
| **Supabase** | `jobquest-dev` (`xpnkasclquplmrcmhsif`): `20260924400000_m4_contacts_networking` + `20260925100000_m4_closeout_integrity` applied |
| **Vercel** | `jobquest2` (team `one-piece-5779`), **preview only**. Final M4 preview: `jobquest2-ctu0qz2yx-one-piece-5779.vercel.app` (`1e2b42b`) |
| **CI** | `M1B CI`: **green** on final code `1e2b42b` (run `36102911035`) |
| **Production** | None anywhere. `../JobQuest1.0/` is READ ONLY. |

---

## 2. Rules established in M4 (do not regress)

1. **Archive-first.**
   - `authenticated` has no DELETE on `contacts` or `companies` and no TRUNCATE/REFERENCES/TRIGGER on any M4 table.
   - Contact `archived_at` changes only through `rpc_archive_contact` / `rpc_restore_contact`, enforced by the guard trigger `trg_contact_integrity`.
2. **Append-only interactions.**
   - `contact_interactions` is SELECT-only for clients and is written by `rpc_log_contact_interaction`.
   - Interaction visibility follows the parent contact.
3. **Composite tenant FKs** on every cross-table reference. This includes `(company_id, workspace_id) → companies(id, workspace_id) ON DELETE SET NULL (company_id)` on `applications` and `contacts`. Never relax them. New tables (M5 `interviews`) follow the same pattern.
4. **Ownership is immutable** for direct clients: contact `user_id` / `workspace_id` can't be changed.
5. **Peer isolation.**
   - A USER sees only their own records.
   - A MANAGER sees their whole workspace.
   - Unlinking requires access to the application.
6. **Manager audit.**
   - `audit_events` (SYSTEM/SECURITY, no client privileges, append-only for every role) is written by the trigger `app.audit_cross_user_mutation`, in the same transaction.
   - It fires whenever `auth.uid()` ≠ record owner.
   - To add a new owner-scoped table (such as `interviews`), attach the trigger: `after insert or update or delete … execute function app.audit_cross_user_mutation('INTERVIEW')`. Tables whose owner lives on a parent record need a branch in the function (see `job_snapshots`).
   - **Reads are not audited** (deferred).
7. **Hybrid boundary.** Simple field edits go through the Data API with **whitelisted** columns (`CONTACT_EDITABLE_FIELDS`). Anything touching lifecycle, events, links or audit goes through RPCs or triggers.
8. **Search.** Use `buildSearchFilter(raw, columns, tagColumn)` from `types/applications.ts`. Never interpolate user input into `.or()`.
9. **Design tokens.**
   - Approved values only: `m2-design-system.test.ts` guards them.
   - The M4 aliases (`--color-surface`, `--color-surface-muted`, `--color-text-secondary`, `--color-fg`) resolve to approved tokens.
   - Don't recalibrate colours to pass axe. Fix the component instead.
10. **List loading.** Debounce search, and apply only the latest response (`requestSeq` in `ContactsView`).

---

## 3. Deferred / open items

| Item | Why | Where |
|---|---|---|
| Networking progress checklist (`03-contacts.html`) | Legacy flags aren't in the approved schema, and the original UI faked progress | `M4_COMPLETION_REPORT.md` §13 |
| Manager **read** auditing | RLS SELECT can't write; needs a read-through RPC/API design | §19 |
| Manager audit viewer | Gate 03 RLS row 25 vs. the approval report (SYSTEM-only) | §19 |
| M4 modals: inline `z-index: 1000` | Outside the token scale | §22 |
| Shell top bar unstyled (`.hdr`, `.crumb`, `.bell`… have no CSS) | Pre-existing since M2; visible in approved screenshots | §35 |
| Bundle 684 kB (Vite warning) | Code-splitting | §35 |

---

## 4. Verification

```bash
pnpm lint && pnpm typecheck && pnpm test:unit && pnpm build && pnpm check:bundle && pnpm check:secrets
pnpm local:env && pnpm test:integration   # 74 tests: M1B 17, M3 38, M4 10, M4 closeout 9 (local stack)
pnpm test:e2e                              # 8 specs; afterwards: git restore migration-upgrade/m2/ migration-upgrade/m3/screenshots/
M1B_ENV_FILE=.env.local pnpm test:integration   # hosted jobquest-dev (verify ref xpnkasclquplmrcmhsif first)
```

Remote migrations: `supabase db push --db-url "$SUPABASE_DB_URL" --dry-run` first. The CLI's own login points at another account.

---

## 5. Artifacts

- Reports in `migration-upgrade/m4/`:
  - `M4_COMPLETION_REPORT.md` (§3 lists the corrections)
  - `M4_TEST_RESULTS.md`
  - `M4_VISUAL_REGRESSION.md`
  - `M4_INFRASTRUCTURE.md`
  - `ACCEPTANCE_CRITERIA.md`
  - `M4_IMPLEMENTATION_NOTES.md`
- Screenshots: `migration-upgrade/m4/screenshots/`, re-captured at closeout with the checklist removed and the approved tokens.
- Evidence: `migration-upgrade/m4/evidence/`, including `closeout-*` and `integration-hosted-dev-*`.

## 6. Next

M5 Interviews & Debriefs is on `feature/m5-interviews-debriefs`, created from `development` after the M4 merge. See `migration-upgrade/m5/`.
