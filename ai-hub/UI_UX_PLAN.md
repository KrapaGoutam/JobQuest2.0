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

## AI-6 update: source pages (implemented)

- Navigation: Overview, Daily Digest, **Job Leads** (`/ai-hub/job-leads`), **Email** (`/ai-hub/email`), **Recruiter Intel** (`/ai-hub/recruiters`), History. Calendar stays hidden. The tab row scrolls inside itself on narrow screens.
- One interaction model for all three pages (`AiHubSourceParts.tsx`): draft filters + **Apply filters / Reset**, 20 per page with Previous/Next, an announced result summary, and identical loading / error / empty / **not configured** states ("not configured" only when the source's workflow has never run successfully and no filter is active).
- Job Leads: search, company, location, arrangement, employment type, minimum AI match, provider, status, discovered and posted date ranges. Card -> detail dialog with the plain-text description (keyboard-scrollable region, visible truncation notice), skills, source link and "Copy details as JSON". Actions: open source, inspect, dismiss (owner only, two-step). Never Apply / Create application / contact. "AI match" is labelled as the provider's estimate; "strong" means a stored score >= 80 and an unscored lead is never strong.
- Email: category, needs-attention, company, received dates, provider, status; shows classification, summary, sender name + domain, dates, hints, deadline and the evidence excerpt. Not a mail client (no reply/send/archive/delete).
- Recruiter Intel: search, company, provider, status, discovered dates; shows public source and profile links, verification ("Public source cited" / "Unverified"), uncertain fields, cited contact only, and the related job lead when it resolves in scope. No "contactable" state.
- Overview gains three small cards (new job leads, email needing attention, recruiter intel); a source-count failure does not break the rest of the Overview.
- Verified at 375 / 768 / 1280: no horizontal overflow and no clipped container; axe 0 serious/critical; keyboard operable. Fix found during verification: the six-tab row widened the page (content clipped inside `main`); the shell is now `width: 100%` and the tab row scrolls.

## AI-7 — Calendar page

Tabs: Overview, Daily Digest, Job Leads, Email, Recruiter Intel, **Calendar**, History (tab row scrolls inside itself; AI-6 clipping fix preserved and
regression-tested). `/ai-hub/calendar`: views Upcoming / Today / This week / Past / Date range, filters (category, event status, company, provider,
review status), day-grouped list, 20 per page, states loading/error/not configured/zero (per view)/populated. Scheduled events and deadlines are labelled
differently; rescheduled items show where they moved from; cancelled items are struck through with the original time kept. Times render in the owner's
profile zone (source zone noted when different); all-day items are dates. Read-only: only the shared owner-only Dismiss. Overview gains one Calendar card.

## AI-8 — Actions (human approval center)

- **Navigation:** eight tabs — Overview, Daily Digest, Job Leads, Email, Recruiter Intel, Calendar, **Actions**, History. The tab row scrolls inside itself; the dedicated e2e checks clipping/reachability of every tab (including Actions and History) at 375 / 768 / 1280.
- **/ai-hub/actions:** *Pending* (filters: action, source, provider, suggested date range; 10 per page) and *Completed and failed* (bounded history). A card shows the proposed action, source finding, provider, confidence, evidence, target/match state and a **Review** button only — never Execute/Accept, no checkboxes, no bulk controls.
- **Review dialog:** Action · Source · Match status · Current state / Proposed state · Warnings · choices. Action-specific Confirm labels ("Create application", "Create task", "Change status to Interview"). Ambiguity: nothing pre-selected, radio group of the server's candidates with an Open link each; a duplicate needs an explicit "create anyway" + checkbox; tasks have editable title / due date (with its source) / priority / notes and a "without an application" choice. Stale → "The underlying record changed. Review the updated action before confirming." and the review regenerates. Messages never contain raw database text.
- **Surfaces:** Overview "Pending actions" card; Daily Digest line ("N actions awaiting your review" + link; the digest never executes anything); Job Leads show "Application created" + Open application, or "Review application action" while one is pending.
- **Accessibility:** dialog focus trap and labelled title (existing Dialog), labelled regions for before/after state, `role="alert"` errors, `role="status"` results, radio/checkbox labels, 24 px+ targets, axe 0 serious/critical on the page, every dialog state and at 375/768/1280.
