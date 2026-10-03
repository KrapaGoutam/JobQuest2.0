# PL-4A — Duplicate UX, Bulk Application Operations, and Recruiter Tracking

Date: 2026-10-02

Branch: `feature/pl4a-duplicate-bulk-recruiter`

Development baseline: `11116ca2a577c70e18b4bcfac796dfa6260bda15`

Main baseline: `bfa82eb557c5e748ba5d7c91fe122fb8294d2313`

## Status

PL-4A is formally closed. Implementation, exact feature certification, matching jobquest-dev Preview verification, operator-approved development integration, and exact development CI all passed. Main and Production remain unchanged.

## Discovery matrix

| Area | Baseline finding | Result |
| --- | --- | --- |
| Duplicate UX | PARTIAL | Existing STRONG/PROBABLE/POSSIBLE RPC tiers are preserved. Create now prevents stale verdict races, blocks submit while checking, resets overrides when identity changes, shows every match with useful metadata, and provides direct navigation. |
| Bulk selection | PARTIAL | Selection now works on desktop and mobile, is page-scoped, and clears on page changes. |
| Bulk actions | PARTIAL | Existing per-record RPCs are retained. Available actions reflect active/archived/open selection state, destructive actions require confirmation, pending actions lock controls, and partial failures remain selected for retry. |
| Recruiter tracking | PARTIAL | Existing contact types, roles, follow-ups, activities, and application links are retained. Contact facets are exact, the list is paginated, app-to-contact navigation is canonical, and the link-existing picker is searchable. |
| Application-contact association | EXISTING | Existing tables and RPCs remain canonical; no second relationship model was created. |
| Recruiter search/filter/detail | PARTIAL | Search/filter/detail existed; pagination, exact counts, keyboard semantics, overlay behavior, and canonical deep links were completed. |

## Implementation

- Added race-safe duplicate checking and submit gating to the application-create flow.
- Expanded duplicate results from a single row to an accessible list with tier reason, status, outcome, stage, applied date, and a direct “View existing” action.
- Added mobile application selection and page-scoped selection behavior.
- Made bulk controls selection-aware across active, archived, and open applications; added confirmation for archive and Ghosted transitions; preserved failed/ineligible IDs after partial execution.
- Added a small sequential bulk runner with explicit success/failure accounting. Operations remain intentionally non-atomic because the canonical backend contract is per record.
- Added canonical contact routes (`/w/:workspace/contacts/:contact`) and application-to-contact deep links.
- Added exact server-side contact facet counts, 50-row pagination, searchable application-link selection, keyboard-operable rows, and shared accessible overlay behavior.

## Database, API, and security impact

No migration, schema, RLS, authentication, external API contract, environment variable, dependency, or workflow change was required. The only new helper is client-side. Existing workspace/user authorization and canonical RPC boundaries are unchanged.

PL-1D was not implemented. Server-side capture duplicate enforcement, stored `duplicate_override` residue, and URL-normalization alignment remain deferred. Manual entry, import, and extension capture intentionally keep their existing distinct duplicate semantics.

## Verification

Local certification on the feature branch:

- lint: PASS
- TypeScript: PASS
- unit: `174/174` PASS across 21 files
- integration: `187/187` PASS across 18 files
- production build: PASS (existing chunk-size advisory only)
- full browser E2E and axe: `22/22` PASS
- PL-4A focused browser evidence: PASS; seven axe contexts with zero violations; mobile horizontal overflow `0`
- contact focused browser evidence: PASS; four axe contexts with zero violations
- extension: `97/97` PASS; typecheck/package PASS
- tracked source secret scan: 944 files, zero findings
- browser bundle secret scan: three files, zero findings
- extension package secret scan: 45 files, zero findings

Exact feature CI run `37033042789` passed for application/evidence SHA `cc240dc4948ac9e34a61ccc516686cf2c5e830f1`. It passed classification, lint, typecheck, `174/174` unit tests, build, tracked/browser secret scans, migrations, `187/187` integration tests, extension validation, `22/22` browser E2E plus axe, sanitized evidence upload, and disposable-stack cleanup.

## Preview evidence

- URL: `https://jobquest2-dx21j0l5o-one-piece-5779.vercel.app`
- Deployment: `dpl_H6nWmXctR1oGB7mXpEah4jYK9nRt`
- Target/status/SHA: `preview` / `READY` / `cc240dc4948ac9e34a61ccc516686cf2c5e830f1`
- `/api/health`: HTTP 200 with `{"status":"ok"}`
- Backend binding: compiled browser asset contains only jobquest-dev (`xpnkasclquplmrcmhsif`); the Production project ref is absent.
- Focused authenticated Preview suites: Applications and Contacts `2/2 PASS` in 1.1 minutes.
- Preview accessibility/responsive evidence: eleven axe contexts, zero blocking violations, and zero mobile horizontal overflow.

The disposable local Supabase environment was stopped without a backup after successful testing.

## Limits and deferred follow-ups

- Editing an existing application does not perform duplicate checking because the current RPC has no exclude-current-application argument. Adding that behavior requires an API-contract decision.
- The canonical duplicate RPC excludes archived applications; changing that policy is deferred.
- The existing-contact picker remains bounded to 200 candidates. A server-search contract should precede removing that bound.
- Contact entity deduplication remains a product-policy follow-up; PL-4A does not merge contacts automatically.
- Bulk actions use sequential canonical per-record RPC calls. They report partial failure honestly but are not atomic.

## Promotion state

Application/evidence SHA CI: `37033042789` PASS at `cc240dc4948ac9e34a61ccc516686cf2c5e830f1`

Preview: `dpl_H6nWmXctR1oGB7mXpEah4jYK9nRt` READY at the same SHA

Development merge: `80076446a120388fe2b05f7d36ccc131bb72d538` — COMPLETE

Main: UNCHANGED

Production/jobquest-prod: UNCHANGED

PL-1D: UNCHANGED / DEFERRED

Development CI: `37050583184` — PASS

The no-ff development merge has parents `11116ca2a577c70e18b4bcfac796dfa6260bda15` and `89d6764015e96bc4639158fe74a0f5a89e25a032`. Exact development CI passed classification, static checks, secret scans, migrations, `174/174` unit tests, `187/187` integration tests, extension validation, and `22/22` browser E2E plus axe.

PL-4A is CLOSED. PL-4B is NEXT / NOT STARTED. No main or Production action is authorized.
