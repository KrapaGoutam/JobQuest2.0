# Post-Launch Roadmap

## Program sequence

`M15-E CLOSED` → `PL-0 BASELINE + GOVERNANCE` → `PL-1 CRITICAL SECURITY + EXTENSION RELIABILITY` → `PL-2 CORE APPLICATION PRODUCTIVITY` → `PL-3 DASHBOARD + ANALYTICS UX` → `PL-4A DUPLICATE UX + BULK OPERATIONS + RECRUITER TRACKING` → `PL-4B CALENDAR + TIMELINE/GANTT + ARCHIVE` → `PL-4C GOALS + TASK TEMPLATES + RECURRENCE ENHANCEMENTS` → `PL-5 PORTFOLIO / DEVELOPER DOCUMENTATION` → `M15-F FINAL PRODUCTION RELEASE + STABILIZATION` → `LEGACY RETIREMENT (separately authorized)`.

M15-F is reserved and last. It cannot begin until PL-1 through PL-5 are completed, explicitly deferred, or otherwise decided by the operator. Legacy retirement never follows automatically.

## PL-0 — baseline and governance

| Work | Status | Evidence |
| --- | --- | --- |
| PL-0A | COMPLETE | development baseline synchronized |
| PL-0B-1 | COMPLETE | M15-E closeout integrated |
| PL-0B-R1 | COMPLETE | CI/E2E remediation |
| PL-0B-R2 | COMPLETE | development merge `fcadb2ff77f0850450242a1caf9c2143a08ceef4`, CI `36768885326` PASS |
| PL-0B-2 | COMPLETE | governance branch integrated |
| PL-0B-3 | COMPLETE | formal closeout integration `24c0b40d2c8fe4e5f452ccdf8c9fd903a7dae2c0`, CI `36783308738` PASS |
| PL-0 | CLOSED | governance and closeout certified |

Known outcome: concurrency is hardened; `fix/**` CI and docs-only classification are active; exact-SHA, single-observer, and GitHub backoff policies are documented; the browser security E2E synchronization repair preserves B03/B11/B12 assertions.

## Current phase status

| Phase | Status |
| --- | --- |
| PL-0 | `CLOSED` |
| PL-1 | `CLOSED` — closeout feature CI `36898779897` and development integration CI `36903888076` PASS |
| PL-2 | `CLOSED` — feature CI `36918359854` and development integration CI `36960378949` PASS |
| PL-3 | `CLOSED` — feature certification, matching Preview, and development integration CI `37012301480` PASS |
| PL-4A | `FEATURE CERTIFIED / OPERATOR APPROVAL REQUIRED` — exact feature CI `37033042789` and matching jobquest-dev Preview passed; development merge is not authorized |
| PL-4B | `PENDING` |
| PL-4C | `PENDING` |
| PL-5 | `PENDING` |
| M15-F | `RESERVED — FINAL PRODUCTION RELEASE + STABILIZATION — LAST` |

## Phase intent

### PL-1 — Critical security + extension reliability (P1)

Validate and remediate the historical plaintext smoke-tester credential without recording its value, avoiding history rewrite by default. Reproduce the reported extension Test Connection issue before changing code, covering options/setup/settings, persisted masked token, whitespace, invalid/revoked tokens, unavailable server, and error classification. Evaluate server-side capture duplicate enforcement and URL normalization hardening for promotion.

### PL-2 — Core application productivity (P2)

Add only verified gaps: date filtering/sorting/month grouping while preserving current filters, pagination, ownership, archive state, selection, and accessibility; identify the actual crowded suggestion surface before compacting it; and provide application-to-contact create/link UX through existing contacts, companies, `application_contacts`, and RPC architecture.

### PL-3 — Dashboard + analytics UX (P2)

Improve hierarchy, density, visualization, responsiveness, empty states, consistency, and accessibility using the existing dashboard/analytics architecture. Audit existing tokens/components before taking visual inspiration from Watermelon or React Bits; do not install either library by default or create a second analytics backend.

### PL-4A — Duplicate UX, bulk operations, recruiter tracking (P2)

Start by verifying direct duplicate navigation across filters, pagination, archived records, and manager views; verify existing bulk move/ghost/archive/restore operations; and define any recruiter relationship gap around existing contact types, roles, follow-ups, interactions, filtering, and application links.

### PL-4B — Calendar, timeline/Gantt, archive (P2/P3)

Build only the verified missing calendar aggregation of interviews, tasks, follow-ups, and next actions with timezone-aware dates. Scope cross-application Timeline/Gantt separately from existing per-application/contact timelines. Decide whether archive work is a consolidated center or targeted UX improvements.

### PL-4C — Goals, task templates, recurrence (P2)

Verify goals first; extend semantics/analytics only where needed. Global templates are definitions: applying one creates independent task/checklist state per application through canonical tasks. Do not rebuild the existing recurrence engine; extend configurability around it.

### PL-5 — Portfolio and developer documentation (P3)

Create the migration case study, architecture/security/CI documentation, setup/deployment/disaster-recovery guides, testing and migration statistics, and portfolio story. Production screenshots and final metrics may wait for M15-F.

### M15-F — final production release + stabilization (RESERVED)

Requires a fresh explicit authorization. It includes feature freeze, full regression/security/migration review, backup and restore rehearsal, exact development/main CI, controlled development→main promotion, production deployment/smoke, reconciliation, auth/RLS/extension checks, performance/observability/accessibility review, an observation period, and final PASS/FAIL. Production and main remain frozen until then.

## Default execution profiles

| Area | Default profile |
| --- | --- |
| PL-0 governance/docs | Codex / Terra / Medium / new session per major checkpoint |
| PL-1 security/extension | Codex / Sol / High |
| PL-2 productivity | Codex / Sol / Medium; High for schema/architecture |
| PL-3 UX | Codex / Sol / Medium; optional Claude Sonnet / Medium review-only |
| PL-4A | Codex / Sol / Medium |
| PL-4B | Codex / Sol / High |
| PL-4C | Codex / Sol / High |
| PL-5 docs | Codex / Terra / Medium |
| M15-F | Codex / Sol / High / fresh session; Claude Sonnet / High independent final review |

Use Opus/High only when a material auth, JWT, RLS, key, or security architecture change justifies independent review. Routine Git, status, and documentation work should use economical profiles.

## Agent and subagent policy

Default to zero subagents. Use at most two independent, read-only subagents only when they reduce total context: a large audit, accessibility/security review, nontrivial CI debugging, or independent UI review. Never let parallel agents edit the same source, migration, schema, or workflow.

## Branch, CI/CD, and reporting policy

Work flows: updated `development` → `feature/<descriptive-name>` or `fix/<descriptive-name>` → implementation → local tests and secret scan → exact branch push/CI → Preview and E2E/a11y when applicable → operator review → `--no-ff` merge to development → exact development CI → stop.

Until M15-F: no direct work on `main`, no development→main merge, no Production deployment/database mutation, and no legacy retirement. Use exact-path staging; never use reset/clean, shared-branch rebase, force push, bulk add, or `commit -a`.

See [CI/CD policy](../CI_CD_DEPLOYMENT.md): feature/fix CI, docs-only behavior, development/main queue behavior, exact-SHA certification, a single observer, >=60-second watching, 403/429 backoff, Preview on jobquest-dev, and no docs push during active development certification.

Every implementation/remediation prompt must end by updating `CURRENT_AGENT_STATE.md`, this program's execution checklist, a phase/task report, and the backlog when its state changes. The report must state changes/non-changes, branch/SHA, tests/CI, Preview, database target, Production state, last/next action, and operator approval. If a docs commit would interfere with active exact-SHA certification, use the agent response temporarily and persist after CI is final.
