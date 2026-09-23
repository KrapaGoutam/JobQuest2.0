# System Architecture Diagrams

Full narrative in `../docs/TRD.md` §2-3. This file collects the diagrams for quick
reference.

## Current State

```mermaid
flowchart TD
    Browser["Browser\n(vanilla JS SPA, no framework)"] -->|"fetch, cookie + CSRF header"| Server["Node.js 24 HTTP service\nbackend/src/server.js\n(no framework)"]
    Server --> Logic["service.js / advanced.js /\nfeature-upgrade.js / tasks.js /\nhabits.js / notes.js / extension.js"]
    Logic --> Security["security.js\nscrypt PIN hashing, session hashing"]
    Logic --> Worker["postgres-worker.js\nSharedArrayBuffer + Atomics.wait RPC\n(known correctness gap, see risks)"]
    Worker --> PG[("PostgreSQL\nNeon in production,\nlocal Postgres in dev")]
    Server -->|serves static files| Dist["frontend/dist\n(Vite build output)"]
    Extension["Browser Extension\nManifest V3, vanilla JS"] -->|"Authorization: Bearer token"| Server
    SQLite[("SQLite\nmigration/backup tooling only,\nnever a runtime path")] -.->|"one-time transfer, historical"| PG
```

One deployable unit (Render `render.yaml`): the Node service serves both the API
and the static frontend files.

## Target State

```mermaid
flowchart TD
    Browser["Browser\nReact + TypeScript SPA"] -->|HTTPS| Vercel["Vercel\n(frontend hosting + edge)"]
    Vercel -->|Auth| SupaAuth["Supabase Auth"]
    Vercel -->|"RLS-scoped CRUD"| SupaClient["Supabase client\n(direct DB access for simple CRUD)"]
    Vercel -->|"business logic"| APILayer{"Node/TypeScript API\nor Supabase Edge Functions\n(OQ-007 — undecided)"}
    SupaClient --> SupaDB[("Supabase PostgreSQL")]
    APILayer --> SupaDB
    APILayer --> SupaAuth
    Extension["Browser Extension\n(repointed or rebuilt — OQ-008)"] -->|"Bearer token\n(mechanism per OQ-002)"| APILayer
    SupaDB --> RLS["RLS policies +\nSECURITY DEFINER RPC functions\n(for manager cross-user access, OQ-003)"]
```

## Key architectural differences to design deliberately, not accidentally

| Aspect | Current | Target | Decision needed |
|---|---|---|---|
| Deployable units | 1 (Render) | 2+ (Vercel + Supabase) | none — given by the target stack |
| Data access | Raw `pg` via worker-thread RPC | Supabase client + RLS, or typed query layer | OQ-007 |
| Auth | Custom PIN+session | Supabase Auth (+ custom PIN layer?) | OQ-001 |
| Manager cross-user | App-layer explicit-param check | RLS can't express this alone | OQ-003 |
| Extension auth | Custom bearer tokens | Port pattern, or native Supabase equivalent | OQ-002 |
| CSRF | Session-bound token | Likely unnecessary under Bearer-JWT — re-evaluate | part of OQ-001 |
