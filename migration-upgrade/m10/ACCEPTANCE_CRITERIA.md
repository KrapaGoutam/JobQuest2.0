# M10 Acceptance Criteria

- CSV, XLSX, JSON, and structured-text application sources preview before commit.
- The four-step UI covers source, mapping, row review, and summary.
- Approved aliases auto-map; unknown and ownership/security fields are hard errors.
- Rows are classified valid, warning, invalid, or duplicate.
- Import modes are valid-rows-only and all-or-nothing.
- Duplicate actions are skip, update existing, and import as new, including per-row overrides.
- Import commits and durable batch/row outcomes are atomic.
- Regular users can target only themselves; managers can target workspace members.
- Import history retains outcomes but no uploaded file or raw row payload.
- Thirteen CSV datasets, Applications XLSX, and JSON archive download through authenticated routes.
- Managers can export an individual member or the entire workspace; users export only themselves.
- Every CSV/XLSX cell is protected against spreadsheet formula injection.
- RLS, anonymous denial, peer isolation, responsive layout, accessibility, and production-build gates pass.
- `main`, Production, and JobQuest1.0 remain untouched.
