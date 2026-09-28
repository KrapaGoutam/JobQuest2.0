# Next Agent Handoff: Milestone 14 — Release Candidate & Migration Rehearsal

**Current State**: Milestone 13 is **100% COMPLETE & VERIFIED** on branch `feature/m13-global-search-hardening-parity`.  
**Current HEAD**: Local commit on `feature/m13-global-search-hardening-parity`.  
**Do NOT begin Milestone 14 until**:
1. The user reviews and manually merges `feature/m13-global-search-hardening-parity` into `development`.
2. The GitHub Actions CI run on `development` is confirmed **SUCCESS**.

---

## 1. Milestone 14 Proposed Scope

Milestone 14 is the **Release Candidate & Production Migration Rehearsal** milestone. Its primary objectives are:

1. **Full Dry-Run Migration Execution**:
   - Rehearse the legacy data migration (`scripts/migrate-legacy-data.mjs`) from JobQuest 1.0 SQLite data into an isolated rehearsal database / test workspace `"JobQuest (Migrated)"`.
   - Verify data integrity: row counts, foreign key integrity, user attribution, and preserved timestamps across all tables.
2. **Release Candidate Packaging & Versioning**:
   - Tag Release Candidate `v2.0.0-rc.1`.
   - Finalize production deployment checklists, smoke test scripts, and operational runbooks.
3. **Pre-Production Infrastructure Validation**:
   - Resolve pre-production open questions:
     - `OQ-016`: Confirm Supabase and Vercel production tier requirements.
     - `OQ-021`: Provision dedicated production smoke test account in an isolated workspace.
     - `OQ-029`: Finalize production signing-key custody (Vercel sensitive env vs AWS KMS).
     - `OQ-030`: Configure edge rate limits and automated `auth_rate_limits` cleanup job.
4. **End-to-End Release Validation**:
   - Run complete regression suite across all 14 integration test files and browser E2E workflows.

---

## 2. Key Files & Artifacts for M14

- `migration-upgrade/m13/FINAL_PARITY_MATRIX.md`: The baseline matrix confirming all 41 product capabilities.
- `migration-upgrade/m13/P0_P1_LAUNCH_CHECKLIST.md`: The launch checklist verifying all P0 and P1 capabilities.
- `migration-upgrade/m13/POST_LAUNCH_DEFERRED.md`: The deferred features register (DEF-01 through DEF-07).
- `scripts/migrate-legacy-data.mjs`: Legacy migration execution script.
- `tests/integration/`: All 13 existing integration test suites.

---

## 3. Strict Rules & Constraints for the Next Agent

- **DO NOT create the M14 branch** until M13 is merged into `development` and CI passes.
- **DO NOT touch `main`** or production databases.
- **NEVER use `git add .`** — stage modified files explicitly by relative path.
- **Always verify CI before branching**.
