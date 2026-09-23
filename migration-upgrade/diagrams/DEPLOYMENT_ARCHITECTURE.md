# Deployment Architecture

Full narrative: `../CI_CD_DEPLOYMENT.md`.

## Current (Render)

```mermaid
flowchart TD
    Dev[Developer] -->|push| Feature[feature/round-slug branch]
    Feature -->|PR| GHA[GitHub Actions: 5 jobs]
    GHA -->|green, approved| Development[development branch]
    Development -->|explicit approval| Main[main branch]
    Main -->|auto-deploy| Render["Render web service\nbuildCommand: npm ci && build:frontend\npreDeployCommand: migrate:postgres\nstartCommand: npm start"]
    Render --> Neon[(Neon PostgreSQL)]
    Render -->|healthCheckPath| Health["/api/health\nfast, DB-independent"]
```

Single service, single environment (no preview/staging tier exists today — see
`../ENVIRONMENT_MATRIX.md`).

## Target (Vercel + Supabase)

```mermaid
flowchart TD
    Dev[Developer] -->|push| Feature[feature branch]
    Feature -->|PR| GHA["GitHub Actions:\nlint, typecheck, unit/integration tests,\nfrontend+backend build,\nSupabase migration validation,\nPlaywright smoke"]
    GHA -->|green| Preview["Vercel Preview Deployment\n(per-PR — new capability)"]
    GHA -->|green, approved| Dev2[development/integration branch]
    Dev2 -->|explicit approval, Gate 5| Main[main branch]
    Main -->|deploy| VercelProd["Vercel Production"]
    Main -->|migration apply, gated| SupaProd["Supabase Production\n(schema via versioned migrations)"]
    VercelProd --> SupaProd
```

Supabase schema changes must use migrations — never a manual dashboard edit in
any environment past local dev, carrying forward the existing project's
migration-discipline policy verbatim (see `../docs/BACKEND_SCHEMA.md` §Migration
history).
