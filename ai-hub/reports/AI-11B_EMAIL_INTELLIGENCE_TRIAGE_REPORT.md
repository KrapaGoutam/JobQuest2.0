# AI-11B — Email Intelligence & Triage (JobQuest 2.2 / Scheduled Intelligence & Digest Automation)

Status: complete on `feature/ai11b-email-intelligence-triage` (from development `d6fe0cd55380538cfe069c3caf04ca3f2a50d102`).
Branch CI, the development merge SHA and development CI are recorded in the completion report (chat checkpoint): they are not knowable before the push.
Main (`455a0120…`) and Production are unchanged. **No database migration.**

## 1. Reuse audit (what already existed)

| Need | Already in the repository | Decision |
|---|---|---|
| Email finding | `ai_findings` kind `email_event` (AI-1A/AI-6), validated by `validate.ts` `emailPayload`, read by `aiExternalIntelligenceService.listEmailIntelligence`, MCP `jobquest_list_email_intelligence`, web reader `api/aiSources.ts`, page `views/AiHubEmail.tsx` | **EXTEND** |
| Provider, run, status, priority, received time, deadline, summary, evidence, source ref | columns `provider`, `run_id`, `status`, `priority`, `occurred_at`, `due_at`, `summary`, `evidence`, `source_ref` | reuse |
| Sender name/domain, subject, company, role, next step, needs_attention | `payload` (allow-listed keys) | reuse; new keys added |
| Dedupe | `buildDedupeKey('email_event')`: `ev:` + sha256(source_type, message id, event); fallback source + received + sender + subject | reuse unchanged |
| Application matching | `aiApplicationMatchService` (AI-8: EXACT/STRONG/AMBIGUOUS/NONE, company alone never enough) | reuse unchanged; thin email wrapper |
| Closed-set category | `EMAIL_CATEGORIES` (10 values) | extended (superset) |
| Automation `email_triage` | AI-11A: workflow id and automation section already exist | reuse unchanged |
| RLS / ownership | AI-1B policies; reads run as the caller | reuse |

Nothing was duplicated: no new table, kind, workflow, contract version or Gmail backend.

## 2. Architecture decision — **EXTEND**

The canonical email record is still one `ai_findings` row (`kind = email_event`), validated by the same `jobquest.ai-result` 1.0 validator (additive, backward compatible; no `email_event_v2`). JobQuest never reads a mailbox: the provider's own connector reads Gmail, analyses it and submits structured intelligence through `jobquest_submit_ai_result`.

## 3. Canonical email model

```
group      job_related | other                       (DERIVED from category; a supplied group must agree, else rejected)
category   job_related: recruiter_reply, application_confirmation, interview, interview_scheduling, assessment,
                        follow_up, status_update, rejection, offer, other_job_search
           other:       important_account, notification, newsletter, other
           AI-6 spellings stay valid, stored as sent, read as the canonical value:
             interview_invitation -> interview, scheduling/reschedule -> interview_scheduling, deadline -> other_job_search
urgency    HIGH | MEDIUM | LOW   == the existing `priority` column through a fixed mapping
             HIGH <- HIGH,CRITICAL   MEDIUM <- NORMAL   LOW <- LOW,INFO        (no numeric score, no second stored urgency)
action     action_state needs_action | no_action | absent (absent = unknown; never guessed)
           action_summary  (input name)  ==  stored `next_step`  (ONE field)
           deadline_at     (input name)  ==  stored `deadline` + `due_at` (ONE instant, UTC); absent stays null
           needs_attention follows an explicit action_state
           draft_recommended (flag only; JobQuest never drafts or sends)
hint       application_stage_hint  APPLIED | ASSESSMENT | RECRUITER_SCREEN | INTERVIEW | FINAL_INTERVIEW | OFFER | REJECTED
           (job-related only; display-only; never applied)
existing   provider, source ref/dedupe key, received_at (occurred_at), sender_name, sender_domain, subject, summary, company,
           role_title, status, run id (run_id)
derived    applicationMatch  MATCHED | POSSIBLE | UNMATCHED | NOT_APPLICABLE   (server-derived at read time; section 5)
```

### Deterministic urgency rules (`emailTriage.ts`, pure, no clock)

The provider classifies; JobQuest validates and keeps labels coherent. The reference time is the run's `generated_at`, so the same submission always validates identically.

- base = provider `urgency`, else the urgency of the provider `priority`, else MEDIUM (the existing NORMAL default). `urgency` wins over a conflicting `priority` (warning).
- floor: action needed and a deadline within 24 hours (or already past) -> HIGH; action-needed interview / scheduling / assessment / offer -> at least MEDIUM. A deadline alone (no action) never promotes.
- ceiling: newsletter, notification, application confirmation, rejection -> LOW.
- Invalid values (`URGENT`, `NORMAL`, numbers, …), an unknown category, an unknown stage hint or a mismatching group are rejected item-by-item.

### "Needs attention"

One definition (server `emailNeedsAttention`, web mirror, SQL `EMAIL_ATTENTION_OR`, digest): an open (NEW) email that is HIGH/CRITICAL, provider-flagged, or — only when the provider gave **no** explicit `action_state` — in an actionable category or dated. An explicit `no_action` is authoritative over category and deadline (not over HIGH). The Email page headline is the count of open HIGH-urgency emails.

## 4. Privacy

Stored: sender display name, sender domain, bounded subject (200), summary (1000), evidence excerpt (500), action text (300), classification, deadline, company/role, message id (dedupe).
Never stored: bodies, HTML, attachments, MIME, full addresses, quoted history, signatures, provider payload dumps. AI-11B additionally removes **links, email addresses and phone numbers** from every email-derived free-text field (title, summary, evidence, subject, action) and warns (`email_text_redacted`). Nothing broader than before is stored.

Email text is data, never instructions: it is stored/shown as plain escaped text; it cannot select a tool, change a stage/status or create a task or suggestion (tests below). Provider templates (Claude, ChatGPT, Gemini) were updated: new taxonomy, urgency rules, "other mail" scope (important/notification/newsletter only; skip bulk promotions), no codes/links/account numbers, **never create or send a draft**.

## 5. Application matching (server-owned, derived, no migration)

`aiEmailMatchService` reuses the AI-8 matcher unchanged and maps it to bounded states:

| State | Meaning |
|---|---|
| MATCHED | company + role agree with exactly ONE of the owner's live applications and context does not conflict (EXACT/STRONG). Carries a minimal application summary (id, company, title, stage, status, outcome — no URL/timestamps). |
| POSSIBLE | several fit; only weak/context-conflicting ones fit; or the email names a company but **no role**. **Never authoritative**: it lists up to 3 candidates and selects none. |
| UNMATCHED | nothing fits (including a different role at the same company), or too little to compare. Company alone is never a MATCH. |
| NOT_APPLICABLE | non-job mail. |

- Hints are untrusted text; a provider `application_id` is stripped (`untrusted_scope_field`). One bounded read per distinct owner (≤1000 live applications), through the caller's client under RLS with explicit workspace + owner filters: a peer's or another workspace's application can never be a candidate.
- Derived at **read** time (no stale link, nothing persisted, no write to any core record). If the application is deleted the email simply stops matching. `ai_findings.application_id` is untouched, so AI-8's trusted-link semantics are unchanged.
- Conservative by design: AI-8's context rule means an application with no activity/creation within 60 days of the email reads as POSSIBLE, not MATCHED.
- Surfaces: MCP/service `applicationMatch` per item and a bounded `applicationMatch` filter (newest 200); web asks `GET /api/ai/email/matches?workspace_id=&ids=` (≤50 ids, read-only, session-authenticated, runs as the caller).

## 6. Deduplication

Unchanged key (`ev:` + message id; fallback source+received+sender+subject; subject alone never identifies). New fields are not part of the key. Tests prove: the same message ingested repeatedly (also by another provider) is one row, `findingsDuplicate` each time; re-classification of the same message updates that one row in place; a dismissed row is left alone (`unchanged_closed`).

## 7. API / MCP

- MCP `jobquest_list_email_intelligence` stays read-only (annotations unchanged, still 11 tools, `jobquest_submit_ai_result` is the only write tool). Input gains `group`, `urgency`, `actionState`, `applicationMatch`; output gains `group`, `urgency`, `actionState`, `draftRecommended`, `stageHint`, `runId`, `applicationMatch`. Unknown/mutating arguments are refused. No Gmail read/send, application, task or email mutation tool exists.
- New web route `GET /api/ai/email/matches` (read-only; 503 when the AI Hub kill switch is off).
- Pagination stays bounded (page size ≤ 50, page index ≤ 500).

## 8. UI (existing Email page upgraded, no new page)

Headline "N high-urgency emails need attention" (open HIGH, workspace-wide; "unavailable" on failure, never 0) → quick filters (All / Job related / Other mail; Any / High / Medium / Low) → the existing filter form (canonical category grouped by Job related/Other mail, company, provider, status, received dates, needs-attention) → **Job related** and **Other mail** sections, each with **High / Medium / Low urgency** sub-sections (empty ones dropped). A card shows sender/company, subject, summary, "2h ago" + absolute time, category, urgency, action (or "No action needed"), deadline, the matched application as a link ("QA Engineer — Interview") or "Possible match, not confirmed" / "No matching application", the hint-only stage suggestion and the draft recommendation (no send control). No nested tabs. Loading/error/empty/not-configured states unchanged; matching failure degrades to a notice.

## 9. Database

**UNCHANGED. No migration.** Everything fits existing columns (`category`, `priority`, `due_at`, `payload` jsonb). Remote Dev: nothing to apply for AI-11B. (AI-11A's pending migration `20261101100000` is a separate item recorded in its own report.)

## 10. Draft-only boundary (for AI-11C+ and provider scheduling)

`draft_recommended` + `action_summary` are the data model for "urgent mail should get a reply draft". Creating a Gmail draft belongs to the **provider connector / scheduler** (the AI product that already has the user's mailbox connector), not to the JobQuest backend. JobQuest holds no mailbox credential, exposes no draft/send tool and must not gain one in this phase. Nothing is sent to a third party, automatically or otherwise. Any future draft creation needs its own approved phase, explicit per-draft human approval in the provider, and no JobQuest-side mailbox access.

## 11. Validation

Local: typecheck PASS, eslint . clean, unit 925/925 (54 files; 63 new tests in 3 new suites), AI integration 157/157 (14 files, incl. 12 new), focused e2e PASS (ai11b-email, ai6-sources, ai8-actions, ai10-provider-auth, ai11a-automations; axe 0 critical/serious). New suites: `ai-11b-email-triage` (taxonomy, urgency, deadlines, hints, privacy, inert text, AI-6 compatibility), `ai-11b-email-match` (match states, ownership, batching), `ai-11b-email-ui` (client/server drift guard, grouping, rendering, escaping). Integration `ai-11b-email` (real DB/RLS: storage, privacy at rest, rejection, idempotency, filters incl. SQL-vs-memory attention parity, matching incl. cross-owner and cross-workspace, hint/injection changes nothing, RLS, route, MCP read-only surface, automation `email_triage`). E2E `ai11b-email.spec.ts` (grouping, filters, application link, no mail actions, axe 0 critical/serious at 375/768/1280). Existing AI-6 tests were updated only where they encoded the old closed set of 10 categories or the old attention formula. No live provider/OAuth certification was run (not in scope).

## 12. Deferred

AI-11C Daily Digest composition (the structured fields above are what it needs: group, urgency, action, deadline, application), AI-11D job discovery, AI-11E recruiter discovery, provider scheduling/Run Now, any draft creation, email summary delivery. Not built here.

## 13. Limitations

- Application matching is conservative and derived per read; a very old application reads as POSSIBLE.
- The match filter looks at the newest 200 items; the UI does not expose it (the headline and quick filters are SQL-backed).
- AI-6 spellings are stored as sent (they read as canonical but are not rewritten).
- "Other mail" is intentionally coarse; providers are instructed to keep it generic and skip bulk promotions.
