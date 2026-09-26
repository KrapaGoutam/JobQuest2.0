# Milestone 10 — Import & Export

M10 delivers owner-scoped application import, durable import history, manager target selection, thirteen modular CSV exports, a styled applications workbook, and a full JSON archive. The implementation follows the approved Gate 01/Gate 02B behavior and reuses the existing Option B authentication, workspace membership, RLS, and application domain model.

Source uploads are parsed in the Node facade and are never persisted. The browser must preview and map fields before commit. The database RPC rechecks membership, target ownership, row structure, and duplicates, and owns all application/history writes in one transaction.

JSON export is an archive only. A JSON restore path is explicitly deferred by the approved scope.
