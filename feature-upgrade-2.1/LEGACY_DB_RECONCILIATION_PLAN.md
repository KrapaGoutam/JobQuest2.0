# Legacy Database Reconciliation Plan

## Objective
Provide a safe, read-only mechanism to verify data integrity between the legacy JobQuest system (Neon/Render) and the current JobQuest 2.0 system (Supabase) without modifying production data.

## Architecture
- **Tooling:** A standalone Node script executed locally.
- **Connections:** Requires direct read-only connection strings to both databases.
- **Safety:** Does not use `insert`, `update`, or `delete` statements.

## Comparison Logic

### Level 1: Exact ID Match
Match based on the `legacy_id` column present in the current `applications` table (added in M14).
```sql
-- Current DB lookup
SELECT id, legacy_id FROM public.applications WHERE legacy_id IS NOT NULL;
```

### Level 2: Fuzzy Metadata Match
For records lacking a `legacy_id` mapping, attempt composite matching.
**Composite Key:** `lowercase(company_name)` + `lowercase(role_title)` + `applied_at (truncated to day)`

### Level 3: URL Match
Match based on normalized `job_url` domains and paths.

## Output Report Structure
The script will output a summarized Markdown report.

```text
# Reconciliation Report

**Execution Date:** [Date]

## Summary
- Legacy Applications: 1,420
- Current Applications: 1,407

## Match Results
- **Exact matches (Level 1):** 1,380
- **Fuzzy matches (Level 2/3):** 15
- **Legacy-only (Missing in Current):** 25
- **Current-only (New since migration):** 12
- **Duplicates Detected:** 0

## Details: Legacy-Only (Needs Review)
| Legacy ID | Company | Role | Applied Date |
|-----------|---------|------|--------------|
| 5032      | Acme    | Eng  | 2026-09-01   |
```

## Risks & Mitigation
- **False Positives in Fuzzy Matching:** Mitigated by separating Level 1 (Deterministic) and Level 2 (Fuzzy) in the final report.
- **Connection Security:** Pass credentials via environment variables, never hardcoded.
