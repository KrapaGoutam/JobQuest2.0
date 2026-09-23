# Environment Variables

Names only — see `../ENVIRONMENT_MATRIX.md` for full purpose/usage detail. Never
populate this file with real values.

| Variable | Source |
|---|---|
| `HOST` | `.env.example` |
| `PORT` | `.env.example` |
| `DATABASE_URL` | `.env.example`, `render.yaml` (`sync: false`) |
| `DIRECT_URL` | `.env.example`, `render.yaml` (`sync: false`) |
| `TEST_DATABASE_URL` | `.env.example`, `.github/workflows/ci.yml` |
| `SQLITE_SOURCE_PATH` | `.env.example` (migration-only, historical) |
| `MANAGER_USERNAME` | `.env.example` (seed-only) |
| `MANAGER_PIN` | `.env.example` (seed-only) |
| `MANAGER_FULL_NAME` | `.env.example` (seed-only) |
| `NODE_ENV` | `render.yaml` (set to `production`) |
| `RENDER` | implicit, Render-provided |
| `CONFIRM_PRODUCTION_MIGRATION` | manual override only, not in `.env.example` |

Confirmed absent: no `import.meta.env`/`VITE_*` client-side variables anywhere
in `frontend/src/` — no client-side secret-exposure surface exists today.
