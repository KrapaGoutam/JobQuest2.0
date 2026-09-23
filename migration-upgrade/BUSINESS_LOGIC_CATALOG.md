# Business Logic Catalog

CURRENT STATE. This document exists because narrative feature docs tend to lose the
exact rule when someone re-implements a feature from a description rather than the
code. Every rule below cites its source file(s) so a migration author can go verify
it directly rather than trust this summary alone.

---

## BL-001: Application stage transitions

**Trigger**: `PATCH /api/applications/:id/stage` (the rich variant,
`feature-upgrade.js:489` — see `API_INVENTORY.md` for the dead thin variant it
supersedes by dispatch order).
**Inputs**: `{stage, reason?, note?}`.
**Logic**: validates `stage` against the 13-value `STAGES` whitelist
(`service.js:3-17`); wraps the whole operation in a database transaction; if the new
stage is `Rejected`, auto-creates a `rejections` row (so a user never has to
separately remember to log a rejection when they change the stage); writes an
`activities` row, a `stage_history` row (closing out the previous row's `left_at`),
and a `timeline_events` row; writes an `audit_log` entry.
**Outputs**: `{id, previous_stage, stage}`.
**Database side effects**: `applications.stage`/`updated_at`, `activities`,
`stage_history`, `timeline_events`, possibly `rejections`, `audit_log`.
**API side effects**: none beyond the response.
**UI side effects**: stage badge updates; dashboard/analytics widgets reflect the
change on next fetch (no push/realtime mechanism exists — see `OPEN_QUESTIONS.md`).
**Failure conditions**: unknown stage value → HTTP 400 `Unsupported stage: <value>`
(this exact error string is what the browser extension's own stage-forgery
regression test asserts against — see FEATURE-EXT-004).
**Source files**: `backend/src/feature-upgrade.js:489`, `backend/src/service.js`
(`changeStage`, `STAGES`).
**Migration requirement**: reproduce the transaction, the auto-rejection-row
side-effect, and the audit-log write exactly — a naive "just UPDATE the stage
column" port silently drops all of this.

## BL-002: Duplicate detection — import pipeline

**Trigger**: `POST /api/import/preview`, `POST /api/import`.
**Inputs**: parsed row data (company, job_title, date_applied, job_url?).
**Logic**: identity = owner + normalized company + normalized title + date_applied;
if a `job_url` is present, also compares normalized URL. `duplicate()`
(`service.js:292`).
**Outputs**: per-row `{duplicate: bool, duplicate_id?}`.
**Database side effects**: none (read-only check); the actual action taken
(`skip`/`import_anyway`/`update_existing`) is a separate, explicit user choice.
**Failure conditions**: none — this is advisory, not a hard constraint.
**Source files**: `backend/src/service.js`.
**Migration requirement**: keep this algorithm distinct from BL-014 (extension
duplicate detection) — they serve different purposes and have different tolerance
for false positives/negatives.

## BL-003: Duplicate identity normalization — extension (company-first classification)

**Trigger**: `GET /api/extension/duplicate-check`.
**Inputs**: `job_url`, `company`, `job_title` (all from the just-extracted capture,
before save).
**Logic**: evaluated in strict priority order —
1. Exact normalized URL match against the user's own applications → `EXACT_POSTING`.
2. Else, does the user have any prior application at the normalized company? If no
   → `NONE`.
3. If yes, does the normalized title match exactly? → `SAME_ROLE`. If it differs →
   `COMPANY_ONLY`.

`normalizeJobUrl`: lowercase scheme/host/path, strip all `utm_*` params, sort
remaining params deterministically, strip trailing slash when no query string
remains.
`normalizeText`: trim, lowercase, collapse repeated whitespace, normalize unicode
hyphens (`‐`–`―` → ASCII `-`) and curly quotes (`‘’“”`
→ ASCII `'`/`"`), preserve `&`/`/`/`@` and all distinct words. **Conservative rule,
deliberately never violated**: never auto-collapses seniority ("QA Engineer" vs
"Senior QA Engineer" stay distinct) or role variants ("QA Analyst" vs "QA
Engineer" stay distinct) — false negatives (missed duplicate) are preferred over
false positives (blocking two genuinely different roles).
**Outputs**: `{match_type, has_duplicate, matches: [...]}` (bounded to the 3 most
recent matches, ordered `updated_at DESC, id DESC`).
**Database side effects**: none (read-only, scoped to the bearer token's `user_id`
— cross-user leakage is architecturally impossible, not just policy-prevented).
**Failure conditions**: any network/auth/server failure on the client side must
surface as `CHECK_ERROR`, never as a false "no duplicate" or false "duplicate
found" — this is a hard UX/correctness rule, tested explicitly (`extension/tests/
api.test.js`, `backend/e2e/extension.spec.js` scenario 6-7 in
`docs/EXTENSION_TEST_PLAN.md`).
**Source files**: `backend/src/extension.js`.
**Migration requirement**: reproduce the exact 4-state classification and the
conservative non-collapsing normalization rule verbatim — this was tuned against
real-world false-positive reports (see `brain/DECISIONS.md`
"2026-09-20 — Round 11: Company-First Duplicate Detection Hierarchy").

## BL-004: Dashboard rate formulas

**Trigger**: dashboard load, analytics load.
**Inputs**: date range (implicit "all time" for dashboard KPIs; explicit range for
Analytics).
**Logic**: every rate's denominator is **all tracked applications in scope**
(never filtered to only "completed" or "responded" applications first) —
- Response rate = count(`last_response_date IS NOT NULL`) / total
- Interview conversion = count(currently at Interview/Final Interview/Offer/
  Accepted) / total
- Rejection rate = count(currently Rejected) / total
- Offer rate = count(currently Offer/Accepted) / total
- Acceptance rate = count(currently Accepted) / total

For Analytics specifically (source/resume breakdowns), numerator and denominator
are **both scoped to the same `date_applied` range** — a response to an
application submitted outside the selected range is excluded from both sides, not
just the denominator.
**Outputs**: always rendered as `numerator/denominator (percentage%)`
(`rateLabel()`), never a bare percentage — a zero-denominator range shows "No
data", never `0%` or `NaN%`.
**Database side effects**: none (read-only aggregate).
**Failure conditions**: empty dataset → 0, not an error or `NaN`.
**Source files**: `backend/src/service.js` (`dashboard`), `backend/src/advanced.js`
(analytics `rates()`/`source`/`resume`), `frontend/src/features/analytics/
format.js` (`rateLabel`, `summarizeRates`).
**Migration requirement**: this is the single most important formula-fidelity rule
in the whole system — any rewrite that changes the denominator scope or drops the
"No data" zero-handling will silently produce misleading numbers that look
plausible. Write a parity test that seeds a fixed dataset and asserts exact rate
values pre- and post-migration.

## BL-005: Stage-duration / stage-transition analytics

**Trigger**: `GET /api/analytics/stage-duration`, `/stage-transitions`.
**Inputs**: date range, user scope.
**Logic**: uses `stage_history.entered_at`/`left_at` pairs to compute
average/median/min/max days per stage and per named transition (applied→first
response, applied→recruiter screen, applied→interview, interview→offer,
applied→rejection, full lifecycle). "Stalled" = 14+ days in the current stage with
no `left_at`. Below a minimum sample size, returns `insufficient_data: true`
per-metric rather than a misleadingly precise average from 1-2 data points.
**Source files**: `backend/src/advanced.js`.
**Migration requirement**: preserve the sample-size floor — this is a deliberate
"don't lie with small numbers" design choice, not an oversight.

## BL-006: Import field normalization and aliasing

**Trigger**: `POST /api/import/preview`, `POST /api/import`.
**Inputs**: raw JSON array or structured-text blob.
**Logic**: canonical field set: `company, job_title, job_url, location,
work_arrangement, employment_type, date_applied, source, stage, priority,
salary_min, salary_max, salary_currency, salary_range, resume_version,
cover_letter_version, recruiter_name, recruiter_email, recruiter_phone,
job_description, notes, next_action, next_action_date, last_response_date,
external_job_id, tags, pinned, important, favorite`. Aliases resolved before
validation: `company_name→company`, `title`/`role→job_title`,
`application_status`/`status`/`application_stage→stage`, `applied_date`/`date→
date_applied`, `url`/`job_link→job_url`, `work_type→work_arrangement`,
`resume→resume_version`, `cover_letter→cover_letter_version`. Structured text
format: `field: value` lines (split only at the *first* colon, so a value
containing a colon survives), blank lines ignored, `---` separates records.
**Failure conditions**: **any unknown field name, or any ownership/authorization
field (`user_id`, `owner_id`, etc.) present in a row, is a hard validation error —
nothing is ever silently discarded.**
**Source files**: `backend/src/service.js`.
**Migration requirement**: reproduce the full alias table exactly — a user's saved
import scripts/spreadsheets likely rely on these exact aliases.

## BL-007: CSV/XLSX formula-injection protection

**Trigger**: every CSV export (`/api/exports/:type`), the XLSX export
(`/api/exports/applications.xlsx`).
**Inputs**: any string cell value originating from user-entered text (company,
notes, recruiter name, etc.).
**Logic**: `safeCell()` (`feature-upgrade.js:358-361`) prefixes a leading `=`, `+`,
`-`, or `@` character with a leading apostrophe, so Excel/Sheets treats the value
as inert text rather than evaluating it as a formula. Re-exported/wrapped as
`csvEscape()` in `advanced.js:76-77` for every CSV path.
**Failure conditions**: none (this is a pure sanitization transform, always
applied, never conditional).
**Source files**: `backend/src/feature-upgrade.js`, `backend/src/advanced.js`.
**Migration requirement**: apply to **every** export path in the migrated system,
including any new export type added later — this was originally missing from CSV
exports (only XLSX had it) until Round 6 found and fixed the gap; don't
reintroduce that asymmetry.

## BL-008: URL protocol validation

**Trigger**: application create/update (manual, import, extension capture).
**Inputs**: `job_url`.
**Logic**: only `http:`/`https:` are accepted; `javascript:`, `data:`, `vbscript:`
and any other scheme are rejected with HTTP 400. Applies uniformly across manual
entry, import, and extension capture (a single shared `validateApplication()` path
— not three separate checks).
**Source files**: `backend/src/service.js` (`validateApplication`).
**Migration requirement**: this exact same check (and the extension's parallel
`buildSecureJobQuestUrl` origin-binding check, BL-015) are XSS/open-redirect
mitigations, not incidental validation — preserve both.

## BL-009: Resume relationship — `resume_id` vs. free-text `resume_version`

**Trigger**: application create/update (manual, extension).
**Inputs**: `resume_id` (integer FK, nullable), `resume_version` (free text, ≤100
chars, nullable).
**Logic**: an application may reference a formally registered resume
(`resume_id`, must belong to the same owner — cross-owner references are
rejected: `"Resume does not belong to the application owner"`), OR carry a
free-text tailored-version label with `resume_id: null`, OR neither. **A past
defect**: `validateApplication` originally tested `data.resume_id !== undefined &&
data.resume_id !== ""`, and `Number(null)` coerces to `0`, which failed the `<1`
positive-integer check — `resume_id: null` was incorrectly rejected. Fixed by
explicitly allowing `null` before any numeric coercion.
**Failure conditions**: non-null, non-positive-integer `resume_id` → HTTP 400.
**Source files**: `backend/src/service.js` (`validateApplication`).
**Migration requirement**: test `resume_id: null` explicitly in the migrated
validation layer — this exact defect class (a `null`-vs-`0` coercion bug) is easy
to reintroduce in a rewrite that "cleans up" the validation logic.

## BL-010: Checklist reorder — adjacent position swap

**Trigger**: `PATCH /api/applications/:id/checklist/:itemId/move`.
**Inputs**: `{direction: "up"|"down"}`.
**Logic**: swaps `position` with the immediately adjacent item server-side —
never accepts a client-computed target position. Chosen specifically because a
server-side adjacent swap can never produce a colliding/duplicate `position`
value, whereas a client-sent arbitrary position could.
**Source files**: `backend/src/advanced.js`.
**Migration requirement**: don't "upgrade" this to accept an arbitrary
client-supplied position without also re-adding the uniqueness protection this
design gets for free.

## BL-011: Task recurrence

**Trigger**: `PATCH /api/tasks/:id` marking a recurring task complete.
**Inputs**: `recurrence` (`daily|weekdays|weekly|monthly`).
**Logic**: completing a recurring task creates a **new row** for the next
occurrence (computed from the recurrence rule) — there is no per-row history
linking occurrences together, and no streak concept (contrast Habits, BL-012).
**Outputs**: response includes `created_next_task_id`.
**Source files**: `backend/src/tasks.js`.
**Migration requirement**: do not conflate this with Habits' streak model — they
are deliberately different (see `brain/DECISIONS.md` "Round 8" for the full
domain-boundary reasoning between Tasks/Habits/Reminders/Goals).

## BL-012: Habit streak calculation and idempotent progress logging

**Trigger**: `PUT /api/habits/:id/progress`, `GET /api/habits` (streak is
recomputed at read time, not stored).
**Inputs**: `{completion_date, value}`.
**Logic**: `habit_logs` stores **one row per (habit, calendar date) holding an
absolute value**, not one row per completion action. The unique constraint
(`habit_id, completion_date`) plus an `ON CONFLICT ... DO UPDATE` upsert makes
repeated calls for the same date idempotent under retry (a network retry can never
double-count). Streak is derived by walking backward from today/the most recent
period, bounded to a 365-day lookback (a documented, currently-irrelevant
trade-off). Weekly-frequency habits use `users.week_start` for period boundaries
(the *only* feature that actually honors this setting — see BL-013).
**Source files**: `backend/src/habits.js`.
**Migration requirement**: preserve the "absolute value per date, not append-only
log" model — it's what makes retries safe; an append-only "one row per check-in"
model would need its own idempotency key instead.

## BL-013: `users.week_start` inconsistent application

**Trigger**: any weekly-period calculation.
**Logic**: `users.week_start` (0-6, default 1/Monday) is stored on every user, but
**only Habits' weekly-frequency period boundaries actually read it**. The
calendar's week view hardcodes Monday-first
(`(current.getDay() + 6) % 7`); the goal-snapshot weekly period walker also
hardcodes Monday-first. This was evaluated for a fix during the final hardening
round and deliberately not changed (touches two other mature, independently-tested
features' date math late in a release cycle).
**Source files**: `frontend/src/app.js` (calendar week math), `backend/src/
advanced.js` (goal-snapshot weekly walker), `backend/src/habits.js` (the one
consumer that does it right).
**Migration requirement**: **make an explicit decision** in the new system —
either honor `week_start` everywhere, or remove the setting and hardcode
Monday-first everywhere with a documented rationale. Do not let 3 different
pieces of week-boundary logic silently disagree in the migrated system the way
they do today.

## BL-014: Extension multi-tier extraction source-quality hierarchy

**Trigger**: extension content-script run on any page.
**Logic**: see FEATURE-EXT-002 for the full 5-tier cascade. The key rule worth
isolating here: **`isGenericTitle(title, siteBrand, domain)` rejects marketing
slogans and generic portal words** ("Copilot", "AI Job Search", "Careers", "Open
Positions", "Home") so metadata never wins over a credible rendered DOM heading
just because it technically passed a naive `length >= 3` check. **Aggregator vs.
employer domain separation**: `AGGREGATOR_AND_BOARD_DOMAINS` (jobright.ai,
greenhouse.io, lever.co, indeed.com, linkedin.com, etc.) — on these domains,
platform branding is *never* assigned as `company`; on direct employer domains,
the clean domain name *may* be used as a `company` fallback when nothing more
specific exists. **Collision guard**: if the extracted title equals the extracted
company name, the title is discarded in favor of the dominant DOM heading.
**Source files**: `extension/extractors/generic.js`, `extension/content.js`
(mirrored implementations — kept in sync deliberately, see `brain/
AGENT_HANDOFF_LOG.md` "Generic Career Page Extraction Hardening").
**Migration requirement**: this logic was tuned against two specific real-world
failure classes (aggregator marketing-slogan capture, employer-portal
blank-company capture) — any rewrite should keep both fixture-based regression
tests (`extension/fixtures/tensor_career_job.html`,
`aggregator_jobright_job.html`) and add new fixtures rather than trust a
re-derived heuristic to reproduce the same behavior from a description alone.

## BL-015: Extension deep-link URL construction and origin binding

**Trigger**: "Open Existing" / "View Existing Application" click.
**Logic**: `buildSecureJobQuestUrl(instanceUrl, pathAndQuery)` validates
`instanceUrl` uses `http:`/`https:`, then binds strictly to `new
URL(instanceUrl).origin` — rejecting `javascript:`, `data:`, and `//evil.com`
open-redirect-style paths. Produces `${origin}/?application=${id}`.
**Failure conditions**: any non-http(s) scheme or cross-origin escape attempt is
rejected before `chrome.tabs.create()` is ever called.
**Source files**: `extension/api/jobquest.js`.
**Migration requirement**: this is a genuine security control (open-redirect
prevention) — test it explicitly with adversarial inputs in any migrated
extension, not just happy-path URLs.

## BL-016: Ownership / mass-assignment protection (cross-cutting)

**Trigger**: every create/update endpoint across every domain.
**Logic**: client-supplied `user_id`/`target_user_id`/`owner_id` fields are always
stripped/rejected server-side before validation runs, regardless of what the
request body contains. A `MANAGER` sets the effective owner only through an
explicit, separately-checked `target_user_id` parameter — never by simply
including `user_id` in the same payload as everything else. Related-record
ownership (a Task's `application_id`, a Note's `application_id`, a Follow-up's
`interview_id`/`networking_contact_id`) is **independently re-checked** against
the same acting user — never inferred as "safe because the parent record is
already scoped."
**Source files**: `backend/src/server.js` (`targetOwner`), every domain handler
module.
**Migration requirement**: this is the single most important authorization
invariant in the whole system. In Postgres/RLS terms: RLS on `user_id = auth.uid()`
handles the simple case, but the "independently re-check a related record's
owner" rule needs either a trigger, a check constraint referencing the parent's
owner, or an explicit application-layer check — RLS alone won't catch a
cross-owner link at INSERT time unless the policy itself joins to the parent
table.

## BL-017: 404-not-403 anti-enumeration convention

**Trigger**: any request for another user's record by ID.
**Logic**: returns HTTP 404 (as if the record doesn't exist), never 403 (which
would leak that the ID exists but belongs to someone else).
**Source files**: applied consistently across all `ownerId()`/`targetOwner()`
call sites.
**Migration requirement**: a naive RLS-only migration will make a cross-owner
`SELECT` return an *empty result set* (correct — RLS filters the row out
entirely, which is actually the same anti-enumeration property, just achieved
differently) — verify the *application layer* built on top of Supabase still
surfaces this as a 404-shaped response to the client rather than, e.g., a
different error for "empty result" vs. "truly missing ID" that a client could
use to distinguish the two cases some other way (e.g. timing, or a secondary
existence-implying error path).
