# Milestone 3 (M3): Test Plan
## Applications Workflow & Data Grid Verification Matrix

**Document ID:** `JQ2-M3-TEST-001`  
**Milestone:** `M3`  
**Status:** `ACTIVE`  

---

## 1. Test Strategy Overview
Testing for Milestone 3 covers 6 critical layers:
1. **Schema & Migration Integrity:** Ensuring additive migrations execute cleanly, constraints prevent invalid domain states, and indexes support high throughput.
2. **Row-Level Security (RLS) Isolation Matrix:** Proving USER owns own applications only, MANAGER has workspace-wide access, peer users cannot read/write each other's applications, and cross-workspace access is rejected at database level.
3. **Domain RPC Transactionality:** Testing stage transitions, outcome closures, Keep Active, archiving, and restore operations for atomic event creation and rollback on error.
4. **Duplicate Detection Engine:** Testing exact matching (URL/ReqID), probable matching (Company + Role), possible matching (Company only), non-duplicates, and fallback error handling.
5. **UI & Data Grid Interactions:** Testing table rendering, search debouncing, column sorting, stage filtering, bulk selection, modal forms, drawer/rail expansion, and keyboard shortcuts.
6. **Accessibility & Security Regression:** WCAG 2.2 AA audit with axe-core, browser bundle secret scan, and live Vercel Preview verification.

---

## 2. Test Suites & Verification Matrix

### 2.1 RLS Isolation Matrix (`tests/integration/m3-applications-rls.test.ts`)
| Test ID | Scenario | Caller | Target Row | Expected Result |
|---|---|---|---|---|
| RLS-01 | Select own applications | USER (Alice) | Alice's apps in WS1 | Allowed (returns Alice's rows) |
| RLS-02 | Select peer applications | USER (Alice) | Bob's apps in WS1 | Denied (returns 0 rows / filtered) |
| RLS-03 | Insert application as owner | USER (Alice) | Own app in WS1 | Allowed |
| RLS-04 | Insert application for peer | USER (Alice) | Set `user_id = Bob` in WS1 | Denied (RLS with check violation) |
| RLS-05 | Update own application | USER (Alice) | Alice's app in WS1 | Allowed |
| RLS-06 | Update peer application | USER (Alice) | Bob's app in WS1 | Denied (0 rows affected / error) |
| RLS-07 | Manager select all applications | MANAGER (Charlie) | All apps in WS1 | Allowed (sees Alice + Bob + own) |
| RLS-08 | Manager update member application | MANAGER (Charlie) | Alice's app in WS1 | Allowed |
| RLS-09 | Cross-workspace select | USER (Alice) | Apps in WS2 | Denied (returns 0 rows) |
| RLS-10 | Cross-workspace update | USER (Alice) | Apps in WS2 | Denied |
| RLS-11 | Removed member access | Former member | Apps in WS1 | Denied (0 rows) |

### 2.2 Domain RPC Test Matrix (`tests/integration/m3-applications-rpc.test.ts`)
| Test ID | RPC Function | Conditions | Expected Outcome | Event Generated |
|---|---|---|---|---|
| RPC-01 | `rpc_move_application_stage` | Valid transition (APPLIED → INTERVIEW) | Success; `stage` updated, `last_activity_at` refreshed | `STAGE_CHANGED` |
| RPC-02 | `rpc_move_application_stage` | Invalid stage string | Fails with constraint error | None (rolled back) |
| RPC-03 | `rpc_move_application_stage` | Unauthorized user (peer) | Fails with 42501 (NOT_AUTHORIZED) | None |
| RPC-04 | `rpc_set_application_outcome` | Set outcome = ACCEPTED | Success; `status = CLOSED`, `outcome = ACCEPTED`, `closed_at` set | `OUTCOME_CHANGED` |
| RPC-05 | `rpc_set_application_outcome` | Set outcome = WITHDRAWN + OFFER_DECLINED | Success; `closure_reason` recorded | `OUTCOME_CHANGED` |
| RPC-06 | `rpc_set_application_outcome` | Set outcome = WITHDRAWN + invalid reason | Fails with CHECK constraint violation | None |
| RPC-07 | `rpc_keep_application_active` | Call on stale application | Success; `last_activity_at = NOW()` | `KEEP_ACTIVE` |
| RPC-08 | `rpc_archive_application` | Soft-archive application | Success; `archived_at` set | `ARCHIVED` |
| RPC-09 | `rpc_restore_application` | Restore archived application | Success; `archived_at = NULL`, `last_activity_at` refreshed | `RESTORED` |

### 2.3 Duplicate Detection Test Matrix (`tests/unit/m3-duplicate-detection.test.ts`)
| Test ID | Input | Existing Data | Expected Tier | Action Displayed |
|---|---|---|---|---|
| DUP-01 | Exact Job URL match | Same URL in workspace | `STRONG` | Danger banner; "View existing", "Save anyway" |
| DUP-02 | Exact Requisition ID match | Same external_job_id in workspace | `STRONG` | Danger banner; "View existing", "Save anyway" |
| DUP-03 | Company + Role match | Same Company & Role (case-insensitive) | `PROBABLE` | Amber warning; displays existing stage |
| DUP-04 | Same Company, Different Role | Same Company, new Role | `POSSIBLE` | Blue informational alert |
| DUP-05 | Different Company & Role | No match | `NONE` | Clean form (no alerts) |
| DUP-06 | API check throws error | Network or DB failure | `ERROR` | Honest warning: "Couldn't check for duplicates" |

### 2.4 End-to-End Playwright Matrix (`e2e/m3-applications.spec.ts`)
| Test ID | Test Name | Focus Areas |
|---|---|---|
| E2E-01 | Applications table data grid | Renders dense rows, stage badges, aging indicators, priority bars |
| E2E-02 | Search, Filter & Sort | Search input debounce, stage filtering chips, column sorting |
| E2E-03 | Bulk Selection & Actions | Multi-row selection checkbox, bulk action bar, batch stage update |
| E2E-04 | Create Application with Duplicates | Form inputs, live duplicate alert, snapshot capture, submission |
| E2E-05 | Detail Drawer & Event Timeline | Row click opens drawer, stage tracker pips, timeline history rendering |
| E2E-06 | Wide-Desktop Preview Rail | >=1680px defaults open, toggling with `P` key, preference persistence |
| E2E-07 | Accessibility & Responsiveness | axe-core WCAG 2.2 AA audit on applications grid and modals; mobile cards |
