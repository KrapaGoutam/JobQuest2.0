# M15-E Extension — Design Implementation Map

Source: Claude Design project `24b6a249-3de5-448f-a103-a63129dc926c` ("JobQuest Side
Panel Mockup"), read directly via the design-system MCP (`JobQuest Side Panel.dc.html`,
`Panel.dc.html`, `States.dc.html`, `support.js`). This map is the reference for all
subsequent implementation — subagents should read this file, not reload the design
project.

## Side Panel shell

- **Width:** default 430px, min 360px, max 480px. Full browser height. Single column
  at every width — no horizontal scroll; text wraps or truncates with ellipsis.
- **Layout:** header and tab bar fixed; content area scrolls; Capture's CTA footer is
  sticky at the bottom.
- **Padding:** 16px page padding (12px at 360px).
- **Header (fixed, 100% width):** JQ tile (28×28, accent bg, white "JQ", 6px radius) +
  wordmark "JobQuest" (15px/600) + workspace name with a small color dot (truncates
  with ellipsis) + connection pill (dot/glyph + label, pill-shaped, 26px tall) + gear
  icon button (36×36, opens Settings) + avatar circle (28×28, first-letter).
- **Tabs (below header, hidden on Settings/Setup):** Capture / Dashboard / Analytics.
  `role="tablist"` / `role="tab"` / `aria-selected`. Active = accent text (600 weight)
  + 2px accent bottom border. Inactive = muted text, `--sf2` on hover. Arrow keys move
  focus between tabs (roving tabindex).
- **Settings entry:** the header gear replaces the tab bar with a `← Settings` back
  header; Back returns to the tab that was active before Settings opened (not always
  Capture).
- **Default tab:** Capture, when a supported job page is detected — unless the
  "Open Capture tab when a job is detected" toggle is off.

## Navigation state machine

`screen` values: `detected | possible | saved | duplicate | partial | none | offline |
dash | analytics | empty | settings | setup`. Grouped: Capture = {detected, possible,
saved, duplicate, partial, none, offline}; Dashboard = {dash}; Analytics = {analytics,
empty}; plus {settings, setup} which hide the tab bar.

## Capture tab — states and content

- **JOB DETECTED** (`detected`/`possible`): eyebrow "● JOB DETECTED" + "Tracking this
  tab"; job card = 40×40 initials avatar, `<h1>` job title (18px/600), company (14px),
  wrap chips (location/type/arrangement — dashed border + warning color when missing
  in a partial extraction, solid + `--sf2` fill when present), a SOURCE row (site name
  + truncated URL). Below: "Captured data" card with a % progress bar
  (`role="progressbar"`) and a checklist of extracted fields; "Not found: …" line for
  missing optional fields.
- **PARTIAL EXTRACTION** (`partial`): same job card, warning-colored progress card
  ("Some information needs review", % + bar), then a 2-column grid where captured
  fields show a check + "Captured" and MISSING fields become live inline inputs
  (Location text input, Employment Type select) so the user can fill them in — inputs
  never pre-guess a value. Save stays enabled throughout.
- **DUPLICATE** (`duplicate`): warning/danger card by level — see "Duplicate levels"
  below — with icon, title, a level pill (STRONG/PROBABLE/SAVED), a "Why matched:"
  line, a mini existing-application summary card (title/company + Stage/Applied-date
  rows), and (for `saved` level only) a hint about using Move Stage in the web app
  instead. Primary CTA text varies by level.
- **POSSIBLE MATCH** (`possible`, info-only, does not block Save): compact info card
  above the normal detected-job content — "Why: N other roles at Company." + up to 2
  prior-role lines.
- **SAVED** (after a successful save): success card — check icon, "Saved to JobQuest",
  "Stage: {stage} · {timestamp}".
- **NO JOB** (`none`): centered empty state ("No job posting detected…", current page
  URL, "Try Again" button) + a "Paste job URL (optional)" input + Capture button as a
  manual fallback.
- **CONNECTION REQUIRED** (`offline`): centered error state, "JobQuest connection
  required", explanatory copy, "Open Settings" (primary) + "Retry" (secondary)
  buttons, and a note that captures aren't saved while disconnected.
- **Save-as + Stage** (shown whenever a job is detected/possible/partial): a 2-up
  "Save as" toggle — "Save for later" (→ Stage `Saved`) / "I applied" (→ Stage
  `Applied`, today) — each a full-width option card with a radio dot, above a Stage
  selector. The Stage control is a custom button (not a native `<select>`) opening a
  `role="listbox"` popup positioned above the footer; it lists the JobQuest workflow's
  own stage set; picking a value there clears the Save-as toggle's selected state. A
  row of 8 tick "pips" beside the stage name shows progress through the pipeline.
- **Footer (sticky):** "Save to JobQuest" (Capture states) → after save, "View
  Application" (Saved state) → for a blocking duplicate, "Save as New Application
  Anyway" (secondary/outlined, danger-tinted for the `strong` level).
- **Toast:** on save, a dark toast slides in above the footer — "✓ Saved to JobQuest"
  + "Undo" — auto-dismissing (design shows it static; add a real timeout, e.g. 5–6s,
  with the Undo action wired to real capture-deletion if/when that's supported, else
  omit Undo rather than fake it).

### Duplicate levels (exact design mapping)

| Level | Trigger (design copy) | Color | Primary CTA | Secondary |
|---|---|---|---|---|
| `strong` | same job URL and requisition ID | danger | View Existing Application | Save as New Application Anyway (danger-outlined) |
| `probable` | same company and role | warning | View Existing Application | Save as New Application Anyway |
| `saved` (already-saved) | same job URL, already in Saved stage | info | Open in JobQuest | *(none — no second save offered)* |
| `possible` (not a blocking level) | other roles at the same company | info, non-blocking | — (Save stays primary) | — |

**Real mapping required:** the current extension's duplicate response
(`match_type`: `EXACT_POSTING | SAME_ROLE | COMPANY_ONLY | NONE`, per
`EXTENSION_CONNECTION_AUDIT.md`/Phase A audit) must map onto these four design
levels. Proposed mapping (confirm against `apps/api/src/routes/extension.ts`'s exact
duplicate logic before implementing): `EXACT_POSTING` with the existing application in
a non-terminal stage → `strong`; `EXACT_POSTING` with the existing application already
in `SAVED` stage → `saved` (info, no second save primary path); `SAME_ROLE` → `probable`;
`COMPANY_ONLY` → `possible` (non-blocking); `NONE` → no duplicate UI. Do **not** invent
new duplicate categories — reuse the four that already exist server-side.

## Dashboard tab

- **TODAY row:** two stat cards side by side — "Applications" (today's count) and
  "Yesterday" (yesterday's count).
- **WEEKLY GOAL card:** eyebrow + percent, "{current} / {target} Applications" line,
  a progress bar, and a "{N} more to reach this week's goal" line.
- **PIPELINE card:** compact rows, one per stage shown (design shows 4: Applied,
  Assessment, Interview, Offer) — name, a mini bar, and a count.
- **UPCOMING card:** up to 3 rows (design shows Interviews count, Follow-ups count,
  a "Task overdue" count in a danger-tinted badge) as tappable rows with a chevron.
- **Footer:** "Open Full Dashboard ↗" — deep-links to the web app's `/dashboard`.

## Analytics tab

- **APPLICATION ACTIVITY card:** a 4-up stat grid — Today, Yesterday, This week, Last
  week.
- **WEEKLY GOAL card:** same shape as Dashboard's, compact.
- **LAST 7 DAYS card:** a 7-bar mini chart (`role="img"` with a full text alternative
  in `aria-label` — do not rely on a visual-only chart), one bar per day, today's bar
  highlighted in solid accent.
- **PIPELINE SNAPSHOT card:** all pipeline stages (design shows 6: Saved, Applied,
  Assessment, Interview, Final Interview, Offer) as compact bar rows.
- **EMPTY state** (`empty`, new account / zero applications): centered empty
  illustration (4 static bars), "No activity yet", explanatory copy, "Capture your
  first job" primary CTA (switches to the Capture tab).

## Settings

Opens from the header gear, replacing the tab bar with a back header. Sections, in
order:

1. **CONNECTION** — connected-dot + "Connected to JobQuest" / not-connected state,
   an "Environment" row (readonly, "Preview / Development" or "Production" — reused
   directly from Phase B, do not change how environment is determined), a Workspace
   `<select>`, a masked Token row (`••••••••••••••{last4}` + "Replace Token" button —
   this already matches the just-fixed Phase B masking behavior exactly), and a full
   "Test Connection" button.
2. **ACCOUNT** — "Signed in as @{username}" + "Open JobQuest ↗" button (deep link to
   web app root).
3. **CAPTURE PREFERENCES** — a "Default Stage" `<select>` (populated from the real
   workflow stage list, not the design's static 8), and 3 toggle rows: "Warn on
   duplicates", "Auto-detect job pages", "Open Capture tab when a job is detected".
4. **APPEARANCE** — a "Theme" `<select>` (System/Light/Dark) — reuses the existing
   `saveTheme()`/`applyTheme()` from `api/jobquest.js`, unchanged.
5. **ADVANCED / Diagnostics** — extension version, API status dot, "Run Diagnostics"
   button, and a destructive-styled "Disconnect" button (asks for confirmation; must
   actually clear stored settings via the existing `clearSettings()` export, not just
   visually reset).

**Setup / first-run** (`setup`, shown instead of the tab bar + Settings when nothing
is configured yet): JQ mark, "Connect JobQuest" heading, an Environment `<select>`
(Production / Preview-Development), a password-type Token input, an inline status
message keyed by state (`connecting` / `connected` / `invalid` — info/success/danger
colored banners with icon + text + hint, never color alone), and "Save Connection" /
"Test Connection" buttons with the exact same distinction Phase B already implements:
*"Save Connection stores the token on this browser. Test Connection checks it without
changing anything."* Save is disabled while idle/connecting.

## Theme — token mapping (design → current JobQuest `apps/web/src/styles/tokens.css`)

The design already reuses JobQuest's palette (light `--ac:#3157d5` matches the
web app's `--color-accent`; dark matches the web app's own dark-theme accent). Full
design token set (semantic names on the left, design's CSS var on the right):

| Design var | Light | Dark | Nearest JobQuest web token |
|---|---|---|---|
| `--bg` (canvas) | `#f6f7f9` | `#090d16` | new — extension canvas is slightly different from web's `--color-surface-2`; keep as an extension-scoped token, do not force-reuse the web value if it doesn't match |
| `--sf` (surface-1, cards/header) | `#ffffff` | `#121827` | matches `--color-surface-1` exactly |
| `--sf2` (surface-2, chips/hover) | `#f1f3f6` | `#171f30` | matches `--color-surface-2` exactly |
| `--sf3` (surface-3, empty pips/skeleton) | `#e8ebf0` | `#202a3d` | matches `--color-surface-3` exactly |
| `--bd` (border) | `#dfe3ea` | `#273247` | matches `--color-border` |
| `--bd2` (border-strong) | `#c7ced9` | `#35425a` | matches `--color-border-strong` |
| `--fld` (**new**, field border) | `#8b95a7` | `#6b7a94` | does not exist in web tokens yet — a higher-contrast (3:1) border specifically for inputs/selects/stage button/toggles. Add as a new extension-scoped token; do not reuse `--bd2` (1.6:1, per the design brief's own note) |
| `--tx` (text) | `#172033` | `#edf1f7` | matches `--color-text` |
| `--mu` (muted text) | `#5f6b7e` | `#b1bbca` | matches `--color-text-muted` |
| `--ac` / `--acH` (accent / hover) | `#3157d5` / `#2849b8` | `#8098ff` / `#9aacff` | matches `--color-accent` and its hover |
| `--acT` (on-accent text) | `#ffffff` | `#0b1030` | matches web's on-accent handling |
| `--acS` / `--acX` (accent soft bg / accent-on-soft text) | `#e9edff` / `#3157d5` | `#202b58` / `#9ab0ff` | matches `--color-accent-soft` |
| `--ok` / `--wn` / `--er` / `--in` (status) | `#147a55`/`#9a5b08`/`#ba3341`/`#246b9f` | `#54c89a`/`#edb457`/`#ff7f8c`/`#75b8e7` | matches success/warning/danger/info |
| `--{ok,wn,er,in}S` / `...B` (soft bg / soft border) | `color-mix(in oklch, var(--X) 9%, var(--sf))` / `...40%, var(--sf)` | same at 12% | matches the web app's own `color-mix` soft-fill pattern in `tokens.css` |
| `--ring` (focus) | `#5076f2` | `#9ab0ff` | matches `--color-focus`/accent-soft focus ring |
| `--sh` (shadow, dropdown/toast only) | `0 12px 32px rgba(23,32,51,.16)` | `0 16px 40px rgba(0,0,0,.5)` | extension-scoped, fine as-is |

**Dropdown/select fix — apply the lesson from the web app immediately, don't
reintroduce the defect:** the design's own `selBase` gives the closed `<select>`
explicit `background: var(--sf)` / `color: var(--tx)` / `border: 1px solid
var(--fld)`, and sets `colorScheme` on the root container — but, exactly like the web
app before its recent fix, the design's markup does **not** give `<option>` elements
their own explicit background/color. Per the design brief's own written rule
("Set color-scheme so native selects and scrollbars follow the theme; give options
explicit background and text"), the extension CSS must add the same centralized fix
already applied in `apps/web/src/styles/globals.css`:
```css
select { color-scheme: inherit; }
option, optgroup { background-color: var(--sf); color: var(--tx); }
```
(using the extension's own `--sf`/`--tx` token names, applied once in
`apps/extension/options.css` and in the new Side Panel's shared stylesheet — not
per-component).

## Responsive rules

- **360px:** job title wraps to 2 lines, the completeness/field grid drops to a
  single column, header workspace name truncates harder.
- **430px:** reference/default layout (all markup above assumes this).
- **480px:** same layout; only the chart bar widths and pipeline bar widths grow to
  use the extra space — never add columns.

## Accessibility rules (from the design brief, verified against current a11y test setup)

- Tabs: `role="tablist"`/`role="tab"`/`aria-selected`; arrow-key roving focus.
- Stage selector: `role="listbox"`/`role="option"` popup pattern; `Escape` closes it.
- Every interactive control gets a visible 2px focus ring in `--ring`, `2px` offset
  (outset for buttons, `-2px`/`-3px` inset for tab underline and options list per the
  design's own exact values).
- Status is always icon + text, never color alone (already the pattern for every
  status pill/toast in the design).
- Progress bars carry `role="progressbar"` with `aria-valuenow/min/max` and an
  `aria-label`.
- Text contrast 4.5:1, field borders 3:1 (hence the new `--fld` token), minimum text
  size 12px, touch targets 44px (header icons 36px is the one explicit exception).
- Scan/save results should be announced via `role="status"` (already used for toasts
  and the setup connection-status banner).
- The existing extension a11y test harness (`e2e/m11-extension.spec.ts`'s
  `audit()` helper, axe-core) must be extended to cover every new screen/theme
  combination the same way it already covers the popup states — this is how the
  dark-mode button-contrast regression from Phase B was actually caught; do not skip
  this step for the new screens.

## Interaction rules

- Tab switching preserves each tab's own scroll position; Capture always reflects the
  *currently active browser tab*, the other tabs do not re-fetch on tab-switch.
- Page change: keep showing the outgoing job's summary with a "◌ Scanning page…"
  skeleton row overlaid, then swap in the new job's summary once read — never a
  full-panel loader/blank state.
- Save: button → loading state ("Saving…", spinner) → Capture switches to Saved state
  → toast with Undo → footer becomes "View Application".
- Settings toggles apply immediately (no separate Save step for preferences).
  Disconnect requires a confirmation step.

## Component inventory → current/new code mapping

| Design component | Current extension code | Disposition |
|---|---|---|
| ExtensionHeader, TabNavigation | none (popup has no tabs) | **NEW** — Side Panel shell |
| ConnectionStatus pill | `popup.js`'s inline connection state logic | reuse the *logic* (states X1/X2/X3 etc. and `mapConnectionError`/`isConnectionError` from Phase B), rebuild the *markup* |
| JobSummaryCard, CaptureCompleteness, StageSelector, PrimaryCaptureButton, DuplicateWarningCard | `popup.html`/`popup.js`/`content.js` extraction + `getWorkflow`/`checkDuplicate`/`createCapture` from `api/jobquest.js` | reuse ALL business logic (extraction pipeline, workflow fetch, duplicate check, capture POST) unchanged; rebuild presentation only |
| MetricCard, GoalProgressCard, PipelineSummary, ActivityMiniChart | none | **NEW** — needs new read data, see "Data needed" below |
| SettingsSection, ToggleRow, SelectRow | `options.html`/`options.js`/`options.css` (Phase B) | **reuse the connection logic verbatim** (do not regress masking/whitespace/Save-Test distinction); rebuild layout to match the tabbed Settings design; toggles for capture preferences are new (need new `chrome.storage.local` keys) |
| EmptyState, ErrorState, LoadingState, Toast, Tooltip, StatusMessage | scattered inline in `popup.js`/`popup.css` | consolidate into shared, reusable presentation helpers in the new Side Panel code |

## Data needed for Dashboard/Analytics (real data — do not ship mocked numbers)

None of the current 5 `/ext/v1` endpoints (`me`, `workflow`, `documents`,
`duplicates/check`, `captures`) provide aggregate stats. Before writing any new
endpoint: **read how the web app's own Dashboard/Analytics compute "Today", "This
week", goal progress, and pipeline counts** (likely `apps/api/src/routes/dashboard.ts`
and/or `analytics.ts`, or RPCs like the ones M8/M9 introduced) and **reuse that exact
logic/semantics** — do not define new date-boundary or stage-grouping rules for the
extension. The metrics actually needed, minimally:
- Applications created today / yesterday (uses the profile's timezone semantics, per
  `apps/web/src/lib/time.ts` conventions already established for M5/M6/M9)
- This week's goal target + current progress (reuse the existing Goal model if one
  exists server-side; if the web app has no per-user configurable goal API the
  extension can safely reuse, **do not invent one** — instead adapt the card to
  whatever real goal data is actually available, or mark it unavailable/deferred and
  say so in the closeout report, per the task's explicit instruction not to fake
  unsupported metrics)
- Pipeline stage counts (open applications grouped by current stage — same semantics
  as the web Applications view's stage counts)
- Last 7 days daily application counts (for the Analytics bar chart)
- Upcoming: interview count, follow-up count, overdue-task count (reuse the same
  queries/semantics as the web Dashboard's "Today's queue"/"Upcoming interviews"
  widgets, per `apps/web/src/lib/queue.ts`)

If a single new endpoint can reasonably serve both Dashboard and Analytics (they
overlap heavily — Today/Yesterday, Weekly Goal, Pipeline all appear in both), prefer
ONE minimal new endpoint (e.g. `GET /ext/v1/stats`) over two, scoped read-only,
bearer-authenticated, workspace-scoped, rate-limited like the existing endpoints.

## Deferred (explicitly out of scope per the design brief itself)

Outcome shortcuts (Mark Ghosted/Withdrawn) inside the panel, a resume picker and
next-action date on Capture, company favicon display, and clickable pipeline/upcoming
rows deep-linking into specific web-app records. Do not implement these now.
