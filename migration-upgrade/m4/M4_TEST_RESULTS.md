# M4 — Test Results (final closeout)

A result counts as PASS only when the test ran to completion and wrote its evidence. Evidence files are in `migration-upgrade/m4/evidence/`. They are sanitized: the recorder refuses JWTs, refresh tokens, secret keys, private JWK material, Argon2 verifiers and test passwords.

This file replaces the version in `123a5f7`, which is kept in git history. Its historical rows are preserved in §9 and corrected where they were wrong.

## 1. Summary

| Category | Suite | Result | Evidence |
|---|---|---|---|
| Static | `pnpm lint`, `pnpm typecheck` | PASS | exit 0 |
| Unit | `pnpm test:unit` | **64/64** (9 files) | Vitest output |
| Build | `pnpm build` | PASS (684 kB JS, Vite size warning) | |
| Secrets | `check:bundle` (3 files), `check:secrets` (tracked files) | 0 findings | |
| Integration, local | M1B 17 · M3 38 · M4 10 · **M4 closeout 9** | **74/74** | `integration-local-94504c.json`, `closeout-local-963fdf.json` |
| Integration, hosted `jobquest-dev` | same | **74/74** | `integration-hosted-dev-3de2e5.json`, `closeout-hosted-dev-ef3252.json` |
| E2E, local | leak, M2 capture, M2 shell ×3, M3, M4 | **8/8** | `e2e-contacts-77044e.json` (M4) |
| a11y (M4) | axe WCAG 2.0/2.1/2.2 A+AA, colour contrast on | **0 violations** in 4 contexts | `e2e-contacts-77044e.json` |
| CI | GitHub Actions `M1B CI` | **PASS** (`36102911035`, `1e2b42b`) | run artifacts `m1b-m3-m4-evidence` |
| Preview | Vercel `jobquest2` (preview) | health ok; deployed-bundle scan 0 findings; leak + M2 shell 5/5 | §8 |

## 2. Static checks

| Check | Result |
|---|---|
| lint | PASS, 0 problems |
| typecheck | PASS (root + `apps/api` + `apps/web`) |
| unit | 64/64. `m2-design-system.test.ts` passes again because the approved tokens were restored. |
| build | PASS |
| `check:bundle` / `check:secrets` | 0 findings |

## 3. Integration: M4 suite (`tests/integration/m4-contacts.test.ts`, 10)

Actors:
- `alice`, `bob`: USER in the shared workspace
- `managerCharlie`: MANAGER of the shared workspace
- `foreignDave`: MANAGER of a foreign workspace

| ID | What it proves | Verdict |
|---|---|---|
| M4-01 | Create a contact directly (Data API) and via `rpc_create_contact` (company upsert + application link). The RPC default relationship is `RECRUITER`. | PASS |
| M4-02 | Peer read isolation. Each USER sees only their own contacts; a direct probe of a peer's contact returns 0 rows. | PASS |
| M4-03 | Peer UPDATE affects 0 rows. **DELETE → `42501`** because hard delete is no longer granted (updated at closeout; originally it expected "0 rows"). | PASS |
| M4-04 | The MANAGER (Charlie) sees and edits all contacts in the shared workspace and 0 in the foreign one. The edit is audited (see M4C-08). | PASS |
| M4-05 | Interaction via RPC. The peer sees 0 rows; the manager sees 1. | PASS |
| M4-06 | Link and unlink an application contact via the RPCs. | PASS |
| M4-07 | Cross-workspace link rejected: RPC `CROSS_WORKSPACE_LINK_FORBIDDEN`, and the composite FK rejects it even for the service role. | PASS |
| M4-08 | Companies are shared within a workspace and invisible to a foreign workspace. | PASS |
| M4-09 | Archive and restore via the RPCs. | PASS |
| M4-10 | `anon` is denied on all 4 tables and on the RPCs. | PASS |

## 4. Integration: M4 closeout suite (`tests/integration/m4-closeout.test.ts`, 9, new)

| ID | What it proves | Verdict |
|---|---|---|
| M4C-01 | Direct hard DELETE of the USER's **own** contact → `42501`. The MANAGER's DELETE → `42501`. The row survives. | PASS |
| M4C-02 | A direct `archived_at` update → `42501 ARCHIVE_REQUIRES_RPC`. Inserting an already-archived contact → `42501`. The archive/restore RPCs work. A plain field edit still works directly. | PASS |
| M4C-03 | Interactions are append-only: direct INSERT, UPDATE and DELETE → `42501`. A peer's `rpc_log_contact_interaction` on another member's contact → `42501`. The row is unchanged. | PASS |
| M4C-04 | Company DELETE by USER or MANAGER → `42501`. Moving a company to another workspace → `42501`. | PASS |
| M4C-05 | A cross-workspace company reference → `23503` (service-role insert, application update, contact update). `ON DELETE SET NULL (company_id)` keeps `workspace_id`. | PASS |
| M4C-06 | Peer unlink → `42501`, and the link survives. Foreign-workspace unlink → `42501`. Manager unlink succeeds and writes a `LINK_REMOVED` audit row. | PASS |
| M4C-07 | Owner reassignment by the owner → `42501`; by the manager → `42501 CONTACT_OWNERSHIP_IMMUTABLE`. A workspace move → `42501`. | PASS |
| M4C-08 | Owner self-edits and the owner's own stage move write **no** audit row. The manager's edit, archive and restore write `RECORD_UPDATED` (`changed_columns: ["notes"]`, no values), `RECORD_ARCHIVED` and `RECORD_RESTORED`. The manager's stage move (`rpc_move_application_stage`) is audited with `from_stage`/`to_stage`. A manager-logged interaction is audited **and visible to the owner**, but not to a peer. | PASS |
| M4C-09 | `audit_events`: client SELECT/INSERT → `42501` for USER and MANAGER. `anon` is denied. Even `service_role` UPDATE/DELETE is refused (append-only trigger). | PASS |

## 5. Regression suites

M1B 17/17 and M3 38/38, locally and on hosted `jobquest-dev`, **after** the closeout migration. The audit triggers on `applications` and `job_snapshots` did not change any M3 behaviour.

## 6. E2E and accessibility

Local run of `e2e/m4-contacts.spec.ts` (`e2e-contacts-77044e.json`):

- E2E-01 create
- E2E-02 filter tabs
- E2E-03 search (type, no match, clear)
- E2E-04 log interaction and timeline
- E2E-05 mobile

All PASS.

| a11y context | Total | Critical | Serious |
|---|---|---|---|
| contacts-list-initial | 0 | 0 | 0 |
| contact-create-modal | 0 | 0 | 0 |
| contact-detail-drawer | 0 | 0 | 0 |
| contacts-mobile-layout | 0 | 0 | 0 |

The M4 audit passes with the **approved** tokens. The original M4 changed `--color-text-muted`, `--color-text-subtle` and `--color-accent` to reach this; that change is reverted, and no contrast failure came back.

## 7. CI (GitHub Actions `M1B CI`)

| Run | Commit | Result |
|---|---|---|
| `36097121723` | `123a5f7` | **FAILED**: unit 60/61 (`m2-design-system` token test); build and secret-scan steps skipped |
| `36102493313` | `1ae40c4` | cancelled (superseded by a newer push; concurrency group) |
| `36102694354` | `0048d29` | cancelled (superseded) |
| **`36102911035`** | **`1e2b42b`** (final code) | **PASS**: both jobs (static 40 s; database + integration 74 + E2E 8 + evidence upload 3 m 22 s) |

## 8. Vercel preview (target: preview)

| Preview | Code | Checks |
|---|---|---|
| `jobquest2-3jpdu6ov9-one-piece-5779.vercel.app` | `1ae40c4` | health ok. Leak PASS. **M4 E2E FAILED** at E2E-03: clearing the search left "No contacts found" because an earlier response arrived last. That is a real bug, fixed in `0048d29` (stale-response guard) and `1e2b42b` (250 ms debounce). |
| `jobquest2-7uf8033fp-one-piece-5779.vercel.app` | `0048d29` | health ok. Leak + M2 shell **5/5 PASS**. The M4 spec could not register ("Too many attempts"): the real per-IP register limit (3/hour) is enforced on previews by design. |
| `jobquest2-ctu0qz2yx-one-piece-5779.vercel.app` (final) | `1e2b42b` | health ok. Deployed-bundle scan with 3 real secret values as known values: 0 findings. The M4 E2E re-run happens after the register window resets; the result is in the M5 report §4. |

## 9. Historical record (original `123a5f7` report, corrected)

- Integration 65/65 (M1B 17, M3 38, M4 10), local only: `integration-local-3863d0.json`. **True.**
- E2E 5/5 with a11y 0 violations: `e2e-contacts-67f76b.json`. **True**, but achieved with modified design tokens.
- "Unit 61/61": **false**. CI measured 60/61.
- "Default relationship `PROFESSIONAL`": **false**. The default is `RECRUITER`, and `PROFESSIONAL` is not an allowed value.
- "Manager Dave": **false**. The shared-workspace manager is Charlie; Dave manages the foreign workspace.
- "Filter tabs … Peer, Other": **false**. The tabs are All, Follow-up due, Recruiters, Hiring managers, Referrals, Interviewers, Networking.
- "Search & debounce": there was **no debounce** at the time.
- "M1B … Argon2id passwords, member role transitions": M1B covers Option B auth. Argon2id is for passwords and recovery codes; refresh tokens use SHA-256 verifiers.
- "Preview `jobquest2-d5pdff0pm` healthy": that is the **M3** preview. M4 had not been deployed.
