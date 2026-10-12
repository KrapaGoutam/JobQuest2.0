# AI Hub — UI/UX Plan (no UI built in AI-0)

Grounded in `Sidebar.tsx` / `App.tsx` (hand-rolled path switch; groups: core, planning, analytics, workspace, settings).

## 1. Navigation

- Add **AI Hub** (`/ai-hub`) to the Sidebar, own group after Analytics. Feature-flag gated (`VITE_AI_HUB_ENABLED`, then per-workspace). Mobile: appears in the "More" surface of `MobileNav`; tabs become a horizontally scrollable segmented control; Suggestions shows a count badge.
- Add **Settings → AI & Automation** (`/settings/ai`) beside existing `/settings/extension`.
- Routing: add nested paths to the existing switch (`/ai-hub`, `/ai-hub/brief`, `/ai-hub/email`, `/ai-hub/leads`, `/ai-hub/recruiters`, `/ai-hub/events`, `/ai-hub/suggestions`, `/ai-hub/history`) — deep-linkable, no new router library.

## 2. Tab review (proposal vs. recommendation)

| Proposed tab | Recommendation |
|---|---|
| Overview | keep (today's brief card, pending suggestions count, last run per provider, health) |
| Daily Brief | **merge into Overview** at first; separate tab only when history of briefs is needed (lives in History) |
| Email Triage | keep (AI-7) |
| Job Leads | keep (AI-8) |
| Recruiter Intel | keep but **hidden until AI-9**; lightweight list |
| Interviews & Events | keep (AI-10); Accept pushes into existing Interviews/Calendar, so this stays thin |
| Suggestions | **make it the primary inbox** ("AI Inbox"): all pending suggestions across kinds with Accept/Ignore |
| History | keep (runs + dismissed/accepted findings, filters by provider/workflow/status) |

AI-1 ships only Overview + History (+ empty Suggestions shell). Tabs appear only when their workflow flag is on.

## 3. Settings → AI & Automation sections

Providers (status, last run, readiness note) · Connections (create/revoke connector tokens, AI-3) · Workflows (enable, primary/fallback provider) · Email Rules (AI-7) · Permissions (scopes, write-actions flag) · Data & Privacy (retention, delete AI data, disconnect + purge).

## 4. Contextual surfaces (links into AI Hub only; no duplicated experiences)

Dashboard: compact strip "AI Brief — 3 urgent • 7 new leads" · Applications row/detail: "Interview email detected" chip · Tasks: "AI suggested follow-up" · Contacts: "Recruiter information discovered". Each reads cached findings, is non-blocking, fails to nothing, and links to the relevant AI Hub tab/item. Built last per workflow (inside AI-7…AI-10), never in AI-1.

## 5. Review UX rules

Every finding card shows: what was detected, matched record + match confidence, suggested change (before→after), provenance ("Analyzed by Claude · Gmail · 2h ago"), Accept / Ignore / Open source. Low-confidence → "Review match" (pick application) before Accept. Undo: accepted status changes are reversible through the normal Applications UI (audit trail records the AI origin).

## 6. Design-system reuse

Use existing `components/ui` primitives, tokens in `styles/tokens.css`, toasts via `ToastContext`. Manual UI acceptance gate per UI phase (operator checks desktop + mobile).

## AI-5 update: Daily Digest tab (implemented)

- Navigation is now **Overview | Daily Digest | History** (`/ai-hub`, `/ai-hub/digest`, `/ai-hub/history`). This supersedes the earlier "merge Daily Brief into Overview" proposal because stored digests have their own date history. Job Leads, Recruiter Intel, Email and Calendar tabs stay hidden until their sources are operational (no empty fake pages).
- Daily Digest: Today / Yesterday / Last 7 days / Custom range (labelled date inputs, inline accessible validation), provider filter (All, Claude, ChatGPT, Gemini, JobQuest), per-digest header (date, provider, generated time in the profile zone, source-availability chips, summary metrics), sections in a fixed order (Top Priorities, Applications, Follow-ups, Job Leads, Email Activity, Recruiter Intelligence, Upcoming, AI Suggestions). Sections the digest does not report are omitted; `Not configured` and `None found` are different labels and never collapse. "All providers" shows a deterministic **Combined view** (max counts, deduplicated items with provenance) above the individual digests.
- Today without a stored digest: "No Daily Digest has been generated for today." plus separately labelled **live** metrics (not a stored digest) and an explicit "Save a JobQuest digest for today" action. Historical dates render the stored payload only.
- States: loading (status role), error (alert + retry, isolated), empty, unsupported payload. Layout verified at 375 / 768 / 1280 with no horizontal scroll and zero serious/critical axe findings (`e2e/ai5-digest.spec.ts`).
- Settings -> AI & Automation -> Workflows now lists the five workflow definitions with honest readiness and the note that JobQuest does not run schedules.
