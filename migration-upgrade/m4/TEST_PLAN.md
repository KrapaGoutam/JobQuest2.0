# Milestone 4 — Test Plan: Contacts & Networking

**Milestone:** M4 — Contacts & Networking  
**Test Coverage:** Unit, Integration, E2E, Security, Accessibility, Visual Regression  
**Status:** Verification Active

---

## 1. Test Strategy & Quality Gates

| Gate | Tool / Runner | Command | Target Criteria |
|---|---|---|---|
| **TypeScript Typecheck** | `tsc --noEmit` | `pnpm typecheck` | 0 errors across root, `apps/api`, `apps/web` |
| **ESLint Quality** | ESLint | `pnpm lint` | 0 errors, 0 warnings across whole monorepo |
| **Unit Testing** | Vitest | `pnpm test:unit` | All tests pass, including follow-up status & formatting |
| **Integration Testing** | Vitest (PostgreSQL / Option B) | `pnpm test:integration` | All 65 tests pass (M1B: 17, M3: 38, M4: 10) |
| **Production Build** | Vite + Rollup | `pnpm build` | Bundle builds cleanly into `apps/web/dist` |
| **Bundle & Secrets** | Custom scanner | `pnpm check:secrets` | 0 secret / credential findings in tracked files |
| **E2E Browser Workflows** | Playwright | `pnpm test:e2e e2e/m4-contacts.spec.ts` | 100% passing browser lifecycle workflows |
| **Accessibility (WCAG)** | axe-core | Integrated in E2E | 0 critical or serious violations on contacts views |
| **Visual Regression** | Playwright screenshots | Automated capture | 7 baseline screenshots in `migration-upgrade/m4/screenshots/` |

---

## 2. Integration Test Matrix (`tests/integration/m4-contacts.test.ts`)

| ID | Test Scenario | Expected Outcome | Result |
|---|---|---|---|
| **M4-01** | Contact creation via direct PostgREST & atomic `rpc_create_contact` | Contact row inserted; company auto-upserted; application link created | PASS |
| **M4-02** | RLS: USER can read own contacts, PEER cannot read other member contacts | User sees own contacts; peer contacts hidden (`PGRST116` / 0 rows) | PASS |
| **M4-03** | RLS: PEER cannot update or delete other member contact | Peer UPDATE and DELETE rejected (0 rows affected) | PASS |
| **M4-04** | RLS: MANAGER can read/manage all contacts in workspace, but DENIED in foreign WS | Manager sees all workspace contacts; foreign workspace returns 0 rows | PASS |
| **M4-05** | Contact interactions: create, retrieve, peer isolation, and manager oversight | Interaction logged; peer denied; manager has visibility | PASS |
| **M4-06** | Application ↔ Contact relationships: linking, querying, and unlinking | Link created; unlinking removes relation without deleting contact | PASS |
| **M4-07** | Database-level cross-workspace integrity | Foreign application or contact cannot be cross-linked (FK violation) | PASS |
| **M4-08** | Companies registry: workspace-shared reference data | Shared directory across workspace members | PASS |
| **M4-09** | Contact soft archive and restore | `rpc_archive_contact` sets `archived_at`; `rpc_restore_contact` clears it | PASS |
| **M4-10** | Anon client denial across all contacts tables and RPCs | Anonymous client blocked from all SELECT, INSERT, UPDATE, RPC calls | PASS |

---

## 3. Unit Test Matrix (`tests/unit/m4-contacts.test.ts`)

| ID | Function | Test Cases | Result |
|---|---|---|---|
| **U-01** | `computeFollowUpStatus` | Null/empty returns `none` status | PASS |
| **U-02** | `computeFollowUpStatus` | Today's date returns `warning` and `'Today'` label | PASS |
| **U-03** | `computeFollowUpStatus` | Past date returns `danger` and `'Xd overdue'` label | PASS |
| **U-04** | `computeFollowUpStatus` | Future date returns `upcoming` and formatted date / `'Tomorrow'` | PASS |
| **U-05** | `formatRelationshipType` | Formats all 6 enum values into human-readable titles | PASS |
| **U-06** | `getRelationshipPillVariant` | Maps types to color variants (`info`, `accent`, `success`, `muted`) | PASS |
| **U-07** | `getInitials` | Extracts initials for single, double, multi-word names | PASS |

---

## 4. Visual Regression Baselines (`migration-upgrade/m4/screenshots/`)

1. `contacts-list-light.png` — Contacts list (Desktop Light 1440x900).
2. `contacts-list-dark.png` — Contacts list (Desktop Dark 1440x900).
3. `contact-detail.png` — Contact detail drawer with contact info, stats, and linked apps.
4. `contact-create.png` — New contact modal with validation errors.
5. `contact-interaction-history.png` — Activity timeline showing logged emails/calls.
6. `contacts-manager-view.png` — Contacts view for workspace managers with owner column.
7. `contacts-mobile.png` — Mobile viewport (390x844) responsive cards layout.
