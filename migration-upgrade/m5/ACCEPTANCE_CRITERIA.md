# M5: Acceptance Criteria

Each criterion is PASS only with the evidence listed. Results are in `M5_TEST_RESULTS.md`.

| ID | Criterion | Evidence | Status |
|---|---|---|---|
| AC-M5-01 | `interviews` follows TARGET_SCHEMA #12. `preparation_notes` and `questions_expected` are kept, and there is no checklist. | Migration `20260925200000`; M5-01; E2E prep/questions | PASS |
| AC-M5-02 | Every interview belongs to an application in the same workspace (composite FK). | M5-06 (`23503` as service role) | PASS |
| AC-M5-03 | Scheduling never changes the stage. An optional stage move is explicit and uses `rpc_move_application_stage`. | M5-01, M5-09; E2E steps 4 and 9 | PASS |
| AC-M5-04 | The debrief is atomic, and saving it never moves the stage. | M5-08, M5-10; E2E step 10 | PASS |
| AC-M5-05 | `INTERVIEW_SCHEDULED` / `INTERVIEW_COMPLETED` are written only for meaningful changes. Text edits, re-saves and cancellation write none. | M5-02, M5-08, M5-10 | PASS |
| AC-M5-06 | RLS:<br>• USER own record: allowed<br>• peer, foreign workspace, removed member, `anon`: denied<br>• MANAGER same workspace: allowed<br>• MANAGER foreign workspace: denied | M5-02..M5-07, M5-14 | PASS |
| AC-M5-07 | Invariants aren't client-writable: ownership, tenancy, application link, outcome, `completed_at`; no client insert or delete. | M5-02 | PASS |
| AC-M5-08 | Participants may be the owner's M4 contacts or free text. Cross-user and cross-workspace links are denied at the database. | M5-06; E2E participant | PASS |
| AC-M5-09 | Manager cross-user mutations are audited; owner actions are not. | M5-04, M5-13 | PASS (reads not audited; deferred as in M4) |
| AC-M5-10 | Times are stored in UTC and shown in the profile IANA zone. DST-safe: the gap is rejected and an overlap maps to its first occurrence. The browser zone is ignored. | Unit m5-time (15); M5-12; E2E steps 4, 5 and 7 | PASS |
| AC-M5-11 | Approved surfaces I1–I5 and the application drawer card exist, with loading, empty and error states. | E2E; screenshots | PASS |
| AC-M5-12 | Accessibility: 0 critical and 0 serious on the list (light and dark), schedule, detail, debrief, drawer and mobile. Focus and labels are checked. | E2E axe (asserted); keyboard steps | PASS |
| AC-M5-13 | Queries are bounded and use indexes. | `evidence/perf-explain-local.txt` | PASS |
| AC-M5-14 | No regression in M1B, M3, M4 or the M4 closeout. | Integration 88/88 local and hosted; E2E 9/9 | PASS |
| AC-M5-15 | The migration is applied to `jobquest-dev` only after review (dry run and ref check). | `M5_INFRASTRUCTURE.md` | PASS |
| AC-M5-16 | The preview is deployed and validated; there is no production deployment. | `M5_TEST_RESULTS.md` §Preview | see results |
| AC-M5-17 | CI is green with the M5 suites and evidence upload. | `M5_TEST_RESULTS.md` §CI | see results |
