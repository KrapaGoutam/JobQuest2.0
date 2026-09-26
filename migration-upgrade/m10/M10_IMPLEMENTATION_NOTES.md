# M10 Implementation Notes

## Authority reconciliation

Gate 03's legacy mapping explicitly retains `import_batches` and `import_rows`, although its illustrative target-schema DDL omitted their definitions. M10 resolves that omission with forward-only tables using the already approved workspace/owner model, explicit grants, RLS, manager override, composite tenant foreign keys, and audit-safe metadata. This is a reconciliation of approved requirements, not a claim that Gate 03 contained exact DDL.

## Import boundary

The Node service owns format parsing, alias mapping, validation, preview classification, and XLSX decoding. Both preview and commit receive the original source; commit reparses it and does not trust browser-returned validation data. Requests are capped at 5 MB and 1,000 rows.

`rpc_commit_import` is the only import write boundary. It rechecks active session, membership, manager targeting, input enums, canonical row structure, dates, and duplicate identity. All application, contact, snapshot, document-label, batch, and row writes share one transaction. All-or-nothing validation rejection retains batch/row outcomes without application writes; unexpected database failures roll back the entire batch, including audit rows.

No raw upload or full source row is stored. `import_rows.row_summary` retains only canonical company, job title, and applied date for usable history.

## Export boundary

Authenticated Node routes query as the caller through the Data API and RLS. Thirteen CSV exports preserve the legacy report families while mapping them to current tables. Applications XLSX uses frozen headers, filtering, widths, and formula-safe text. JSON contains an explicit `restore_supported: false` marker because restore is deferred.

`safeCell` is applied to every CSV and XLSX cell. JSON values remain semantically exact because JSON is not spreadsheet-executed and is an archive format.

## Dependency security

ExcelJS is pinned to 4.4.0. The audit exposed pre-existing Vercel CLI transitive high/critical findings; workspace overrides pin their patched releases. The high/critical audit gate is now clean, and Vercel CLI 60.0.0 still starts successfully.

## Schema additions

- `applications.last_response_date`, `pinned`, `important`, and `favorite`.
- Extended approved employment-type compatibility.
- `application_documents.label` for imported legacy version labels.
- Owner-scoped `import_batches` and `import_rows` with explicit select-only client grants.
- `rpc_commit_import` with authenticated execute only.
