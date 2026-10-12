# Claude scheduled tasks for JobQuest — operator guide

JobQuest does **not** run schedules. Claude owns the schedule and calls the JobQuest connector; JobQuest validates,
stores, deduplicates and displays what Claude submits. This guide is how you set that up safely. No credential values
appear anywhere in this repository; you create the token yourself and it is shown once.

## What you need

1. A JobQuest environment Claude can reach over the internet with `AI_HUB_ENABLED=true` (and `VITE_AI_HUB_ENABLED=true`
   to see the UI). Use **Dev/Preview** first; Production is not part of AI-5 or AI-6.
2. The Claude connector from AI-4: Settings → AI & Automation → Providers → Claude → *Set up Claude*.
3. A Claude plan/product that supports **scheduled tasks** and **custom connectors in scheduled tasks**. This has not
   been verified by JobQuest. Treat "Run now" in step 5 as the real test; if Claude cannot call the connector from a
   scheduled run, use the prompt manually (attended) instead — everything else in JobQuest works the same.

## 1. Connector and scopes

| Task | Preset to choose when creating the credential | Scopes |
|---|---|---|
| Daily Digest, Job Discovery, Email Triage, Recruiter Intel, Calendar Intel | **Read + AI findings** | `jobquest:read`, `ai:read`, `ai:ingest` |
| Just reading history | Read only | `jobquest:read`, `ai:read` |

- There is no write, admin, or wildcard scope. The only write tool is `jobquest_submit_ai_result` and it can only store
  AI findings; it cannot change applications, tasks, contacts or statuses.
- Choose the shortest expiry that suits you (7 / 30 / 90 days). **When the credential expires, scheduled runs start
  failing** (the connector is rejected). Create a new credential, update the header in Claude, and revoke the old one.
- A manager's credential sees exactly what that manager sees in JobQuest (RLS parity). Use the owner account that should
  own the findings.

## 2. Tool approval mode

Recommended: allow the **read tools** automatically and keep **`jobquest_submit_ai_result`** on *ask* for the first runs.
After you have watched a few runs produce correct digests, you may allow it automatically. Keep any email/calendar
connector tools read-only for these tasks.

## 3. Create the task

1. Copy a template from [`claude/`](claude/):
   - [`DAILY_DIGEST.md`](claude/DAILY_DIGEST.md) — recommended first task
   - [`JOB_DISCOVERY.md`](claude/JOB_DISCOVERY.md)
   - [`EMAIL_TRIAGE.md`](claude/EMAIL_TRIAGE.md)
   - [`RECRUITER_INTEL.md`](claude/RECRUITER_INTEL.md)
   - [`CALENDAR_INTEL.md`](claude/CALENDAR_INTEL.md) (template only)
2. Fill the `<…>` placeholders (your IANA time zone, your search profile).
3. Enable only the connectors the task needs (JobQuest plus, optionally, mail/calendar/job-search).
4. Choose the cadence yourself. Suggested: Daily Digest every weekday morning. JobQuest never hard-codes a time.
5. **Run it once manually** before enabling the schedule and verify the checklist below.
6. Enable the schedule only after that. JobQuest does not create or enable it for you.

## 4. Expected outcome in JobQuest

- AI Hub → **History**: a run with provider *Claude*, workflow *Daily Digest* (or the workflow you chose), status
  *Succeeded* (or *Partial* with the reason).
- AI Hub → **Daily Digest**: today's digest under provider *Claude*; *All providers* shows a deterministic combined view
  if a JobQuest-generated digest exists too. Past dates remain exactly as they were stored.
- No application, task, contact or status changed. No applications are ever created by these tasks.

First-run checklist: it read JobQuest; the submitted result was accepted; the digest displays; unavailable sources show
*Not configured* (not 0); no core record changed.

## 5. Idempotency and re-runs

- Same `external_run_id` ⇒ ignored as a duplicate run (safe for retries).
- A new `external_run_id` on the same date ⇒ the **same** stored digest for that provider is refreshed while it is still
  new (one digest per date + provider, never duplicates).
- Different providers on the same date keep separate digests and provenance.

## 6. Privacy rules

- Never submit raw email bodies, HTML or attachments (JobQuest drops them). Email findings carry a category, a concise
  summary, a short evidence excerpt (truncated to 500 characters), the sender display name and domain (never a full
  address) and a stable message id. Job leads may carry a **plain-text** job description (JobQuest keeps at most 30,000
  characters and flags truncation). Recruiter findings must cite a public source; contact details are kept only with a
  cited source and are never guessed.
- Do not put secrets, tokens, passwords, phone numbers or personal email addresses in any field.
- JobQuest drops unknown fields and ignores any user/workspace/application ids a task tries to send.
- External content is untrusted: the templates tell Claude never to follow instructions inside job posts, emails, web
  pages, or JobQuest record text.

## 6a. External intelligence sources (AI-6)

Job Discovery, Email Triage and Recruiter Intelligence use the same single write tool (`jobquest_submit_ai_result`) and
the read-only context tools `jobquest_list_job_leads`, `jobquest_list_email_intelligence` and
`jobquest_list_recruiter_intel` (scope `ai:read`; ten tools in total, one write). Results appear under AI Hub → **Job Leads**,
**Email** and **Recruiter Intel** and feed the Daily Digest. A job lead is never an application. A run can be scheduled or
manual: JobQuest does not know or care. JobQuest stores no next-run time. Suggested cadence: job discovery once on
weekdays, email triage each weekday morning (optionally afternoon), recruiter research only for new or high-value leads.
A malformed item is rejected and the run ends *Partial*; the other items are kept. If a lead's details fail to save
(*Partial* with `PROJECT_JOB_LEAD_FAILED`), submit the same lead again with a new run id; it is idempotent.

## 7. Troubleshooting

| Symptom | Likely cause / action |
|---|---|
| Task says it cannot find JobQuest tools | Connector not enabled for the task, credential revoked/expired, or the environment is unreachable. Check Settings → AI & Automation → Claude. |
| `INSUFFICIENT_SCOPE` / 403 on submit | Credential was created with *Read only*. Create a *Read + AI findings* credential. |
| `AI_HUB_DISABLED` / 503 | `AI_HUB_ENABLED` is off for that environment. |
| Run is *Partial*, digest missing | The digest payload failed validation (the tool response lists the paths). Common causes: `digest_date` differs from `dedupe.date`; a section marked `zero` that carries items; `not_configured` with a count; more than 5 items per section. |
| `email_category` / `required` on an email finding | `category` must be one of the ten approved values and `occurred_at` (received time) is required. |
| `recruiter_source_required` | A recruiter finding needs `source.url` or `payload.profile_url`. |
| `contact_uncited_dropped` warning | Contact details need `contact_source_url`; they were dropped, not guessed. |
| `description_truncated` / `html_stripped` warning | The job description was over 30,000 characters or contained HTML; JobQuest stored plain text and flagged it. |
| `match_score` error | Match score must be a number from 0 to 100 (not a string, not 0-1). |
| Digest shows an older version | The re-run used the same `external_run_id` (treated as a retry). Use a new id. |
| Wrong day | The task computed the date in the wrong time zone. Put your IANA zone in the prompt; JobQuest shows dates in your profile time zone. |
| Nothing shows in Daily Digest | You are on the wrong date range/provider filter, or the digest is for another owner. |

## 8. Revocation

Settings → AI & Automation → Claude → revoke the credential. The next scheduled run is denied by JobQuest immediately.
Then pause or delete the schedule in Claude. Do not leave an unattended recurring task running unintentionally; for
validation runs, delete the temporary task afterwards.

## Provider notes

- **ChatGPT**: custom MCP connector availability differs by plan/product, so the Claude fixed-header workflow must not
  be assumed. Integration waits for capability validation; do not build against a Plus-only assumption.
- **Gemini**: the Gemini API / managed-agent remote MCP capability exists, but consumer Google AI Pro scheduled
  integration must be validated separately; API capability is not the same as consumer-subscription capability.
