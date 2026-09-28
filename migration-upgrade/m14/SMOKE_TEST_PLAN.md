# Milestone 14 — Smoke Test Plan: Rehearsal & Production Readiness

**Document ID:** `JQ2-M14-SMOKE-001`  
**Milestone:** M14 — Release Candidate & Migration Rehearsal  
**Scope:** Non-Destructive Smoke Validation for Rehearsal & Future Production Launch  
**Date:** 2026-09-28  

---

## 1. Smoke Testing Philosophy & Rules

1. **Non-Destructive Execution:** All tests in this suite read existing records or create isolated, tagged test items that are immediately and cleanly removed.
2. **Deterministic Sequence:** Follows the canonical user journey from authentication through day-to-day workflow tracking and analytics review.
3. **Execution Environments:**
   - **Rehearsal:** Run against local Supabase stack or isolated hosted development workspace.
   - **Preview RC:** Run against Vercel Preview deployment (`one-piece-5779` / `jobquest2`).
   - **Future Production (M15):** Run against production target using dedicated smoke account `smoke-test-launch@jobquest.internal`.

---

## 2. Canonical 15-Point Smoke Test Suite

| Test ID | Domain | Operation / Action | Expected Result | Pass / Fail Threshold |
|:---:|---|---|---|---|
| **SMK-01** | **Health API** | `GET /api/health` | Returns HTTP `200 OK` with JSON `{"status":"ok","timestamp":"..."}`. | Latency < 100ms. Status strictly `"ok"`. |
| **SMK-02** | **Auth & Claim** | Submit claim code or login with credentials via `/auth/login` | Receives JWT bearer token, active session cookie, and user profile data. | HTTP 200, valid JWT, no 500 error. |
| **SMK-03** | **Workspace Switch** | Switch between `"JobQuest (Migrated)"` and Personal Workspace | Workspace context updates; applications query re-filters by active `workspace_id`. | Instant context switch, zero cross-tenant leak. |
| **SMK-04** | **Applications Board** | Load Applications Kanban Board (`/#/applications`) | Board renders cards partitioned across 8 stages; column drag-and-drop handles render. | Render < 300ms, all cards visible. |
| **SMK-05** | **Applications List** | Load Applications Table View (`/#/applications?view=table`) | Table renders columns, sorting controls, status badges, and quick-filter pills. | Render < 250ms, pagination functional. |
| **SMK-06** | **Workflow Transition**| Move an application from `APPLIED` to `SCREENING` | Mutation succeeds; `application_events` logs `STAGE_CHANGED`; timeline updates. | HTTP 200, audit event recorded. |
| **SMK-07** | **Global Search** | Trigger `Cmd+K` / `Ctrl+K`, search for `"Google"` or `"Senior"` | Modal renders matching applications, contacts, and journal entries instantly. | Response < 100ms, multi-domain pills work. |
| **SMK-08** | **Career Journal** | Navigate to `/#/journal`, create and pin a journal entry | Entry saved in `journal_entries`; pin indicator toggles; markdown renders properly. | HTTP 201, preview renders markdown formatting. |
| **SMK-09** | **Task Queue** | View `/#/tasks`, toggle a task to completed | Task state toggles between `OPEN` and `COMPLETED`; completed timestamp updates. | Optimistic UI update, database persisted. |
| **SMK-10** | **Habit Tracker** | View `/#/habits`, increment daily habit count | Count increments; progress bar updates toward daily target; streak preserved. | Idempotent PUT progress update. |
| **SMK-11** | **Contacts Network**| View `/#/contacts`, inspect contact detail | Contact profile displays company, relationship type, email, and linked applications. | Render < 200ms, links functional. |
| **SMK-12** | **Interviews** | View `/#/interviews`, view scheduled interview round | Round details, format, meeting link, and preparation notes display cleanly. | Accurate timezone display without date shift. |
| **SMK-13** | **Analytics Reports**| View `/#/analytics`, verify funnel and conversion rates | Funnel chart renders stages from bookmark to offer; stage-timing metric displays. | Plausible values, zero NaN or infinite rates. |
| **SMK-14** | **Document Metadata**| View `/#/documents`, view resume versions | Version names, upload dates, and active flags display without raw file leakage. | Metadata renders cleanly. |
| **SMK-15** | **Session Termination**| Click User Avatar -> `Logout` | Auth tokens purged, session revoked in database, redirected to login screen. | Clean redirect to `/#/login`. |

---

## 3. Automated Smoke Test Runner

The smoke suite is implemented as a fast-running integration test:
```bash
# Execute local / hosted dev smoke test
pnpm vitest run tests/integration/m14-smoke-suite.test.ts
```

For browser UI smoke verification:
```bash
pnpm exec playwright test e2e/m14-rc-smoke.spec.ts --project=chromium
```
