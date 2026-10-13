# AI-1D — AI Hub Shell / Navigation / Read-Only UI Foundation

Branch `feature/ai-1-foundation` (local, NOT pushed). Base AI-1C `2c1015e1`. DB changes: NONE. Provider integrations: NONE.

## Routes & navigation
- `/ai-hub` (Overview) and `/ai-hub/history` (History): added to the hand-rolled switch in `App.tsx` (deep-linkable; tab change navigates). Page title "AI Hub".
- Desktop: Sidebar "Insights" group, after Analytics, `Sparkles` icon (lucide, already a dependency). Active state also matches `/ai-hub/*`.
- Mobile: bottom dock is full (4 tabs + More), so AI Hub lives in the existing More drawer ("Track" list, after Analytics) — matches the UI plan.

## Shell
`views/AiHubView.tsx`: presentational `AiHubShell` (heading, subtitle, shared `Tabs` with Overview/History) + container `AiHubView` that fetches. Reuses Card, EmptyState, StatusBadge, Skeleton, Button.
- Active sections: Overview, History. Hidden/deferred: Daily Brief (merged into Overview), Suggestions (AI Inbox; only a pending count shown), Email Triage, Job Leads, Interviews & Events (later phases), Recruiter Intel (hidden until AI-9). No disabled/fake tabs.
- Overview: latest run, pending-suggestion count, recent findings (plain text). History: minimal recent-run list (10), no filters/pagination/detail.
- Empty: "AI Hub is ready — AI integrations have not been connected yet…". No fake providers/status badges.
- Loading: existing Skeleton, local to the panel. Error: localized `role="alert"` "AI Hub data could not be loaded. Your JobQuest applications and other features are unaffected." + Try again; opaque error (`AI_HUB_LOAD_FAILED`), rejection is caught in the view, so no app-wide crash and no global init dependency.
- Untrusted text: React-escaped plain text only; no `dangerouslySetInnerHTML`.

## Data & types
- `api/aiHub.ts`: three RLS-protected SELECTs (runs, findings, pending-suggestion head count) filtered by active workspace from `WorkspaceContext`/app state (never URL). No writes, RPCs, or service role; client injectable for tests.
- Types: option B — minimal browser-safe mirror in `lib/aiHub.ts` (no import of `apps/api`). `tests/unit/ai-hub-ui.test.ts` asserts status/priority lists equal the AI-1C constants.
- Run statuses use exact DB enum values internally; human labels only for display.

## Decisions
- Settings → AI & Automation: NOT implemented (AI-1F owns settings/flags; UI plan pairs it with config work).
- Feature flag: none; nav is unconditional for now (main/production frozen until M15-F). AI-1F adds flag gating — temporary assumption.
- Accessibility: shared Tabs (roles, arrow-key nav), h1 hierarchy, labelled tablist, `role=status`/`alert`, existing focus styles. Responsive: auto-fit grid, no fixed widths beyond max 1000px. Manual visual check at 3 breakpoints NOT performed (no browser run per scope) — operator UI gate.

## Tests
`tests/unit/ai-hub-ui.test.ts` (12 pass): type alignment, shell/empty/loading/error/History render (SSR), XSS escaping, no Accept/Ignore buttons, read layer SELECT-only + workspace scoping + opaque failure, no write APIs in source, nav wiring (sidebar, mobile drawer, route). Web typecheck clean; eslint clean on touched new files. Repo-style limitation: unit env is node, so hooks/click behavior (tab click, retry) is not exercised.

## Files
New: `apps/web/src/{lib/aiHub.ts, api/aiHub.ts, views/AiHubView.tsx}`, `tests/unit/ai-hub-ui.test.ts`. Modified: `App.tsx`, `components/shell/{Sidebar,MobileNav}.tsx`.

## Deferred to AI-1E
Richer Overview cards/metrics, History filters/pagination/run detail, finding detail, audit-view crowding (newest-50) fix (AI-1E or AI-2), closed-finding supersession (ingestion phase).
