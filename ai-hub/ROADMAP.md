# AI Hub — Roadmap (progress view)

Statuses: NOT STARTED · IN PROGRESS · BLOCKED · READY FOR REVIEW · COMPLETE · SHELVED · INTERRUPTED. Attributes: `PHASE_REGISTRY.md`. Gates: `IMPLEMENTATION_PHASES.md`.
Update this file in the same commit as the phase it reflects.

> **Approved re-sequencing (operator, AI-5).** The original order below (AI-5 Gemini, AI-6 ChatGPT, AI-7 Email, AI-8 Job discovery, AI-9 Recruiter, AI-10 Calendar) is preserved as history. Because Claude is integrated and verified, **AI-5 is now "Scheduled Intelligence + Daily Digest Foundation"** (provider-neutral scheduled-result/digest model), **AI-6 is "External Intelligence Sources"** (email + job discovery + recruiter, one common AI-result path; calendar may stay separate), and the Gemini / ChatGPT provider phases move **after** AI-6 with numbers assigned when approved. Reason: a provider-neutral digest/scheduled-result storage model must exist before more providers are added, so provider capabilities do not dictate JobQuest's storage. ChatGPT custom MCP availability differs by plan/product and Gemini API remote MCP does not imply consumer Google AI Pro scheduled integration; both need capability validation first.

```
AI-0 Architecture                                       READY FOR REVIEW (integrated to development; awaiting operator approval for AI-1)
[x] AI-0A Repository audit
[x] AI-0B Environment audit
[x] AI-0C Data model
[x] AI-0D MCP/Auth
[x] AI-0E UX
[x] AI-0F Security
[x] AI-0G Provider registry
[x] AI-0H Idempotency/observability/failure
[x] AI-0I Final roadmap

AI-1 Foundation                                         AI-1 READY FOR BRANCH CI (feature/ai-1-foundation)
[x] AI-1P Env isolation verification (prerequisite) — COMPLETE, GO FOR AI-1A (do not push branch until Preview mapping confirmed)
[x] AI-1A Database — COMPLETE on jobquest-dev (migration 20261023100000); local commit, not pushed
[x] AI-1B RLS / ownership / audit — COMPLETE on jobquest-dev (migration 20261024100000); local commit, not pushed
[x] AI-1C Canonical contract / validator / dedupe utils (TS) — COMPLETE; local commit, not pushed; no DB change
[x] AI-1D Shell / navigation / read-only UI — COMPLETE; local commit, not pushed; no DB change
[x] AI-1E Overview / History / read-only operational views — COMPLETE; local commit, not pushed; no DB change
[x] AI-1F1 Feature flags / AI & Automation settings — COMPLETE; local commit, not pushed; no DB change
[ ] AI-1F2 AI-1 final validation / branch CI / development integration — AI-1 READY FOR BRANCH CI (validation done; CI/merge pending)

AI-2 Internal integration service                       BRANCH CI PASS (37812197575); integrated to development
[x] AI-2A Service core + validation + ingestion (absorbs former 2B ingestion, 2C validation reuse, 2D idempotency, 2E provenance/audit) — COMPLETE; local commit, not pushed; no DB change
[x] AI-2B Read service (internal service API, no routes) + server-side audit scope filter (migration 20261025100000, Dev) + CRLF test fix — branch CI 37812197575 PASS @79e44c17; merged to development

AI-3 Remote MCP + auth                                  COMPLETE (branch CI 37819293115; development CI 37820583043; development ed517594)
[x] AI-3A Foundation (/api/mcp, Streamable HTTP, stateless)  [x] AI-3B Auth (connector tokens; OAuth DEFERRED)  [x] AI-3C Read tools
[x] AI-3D Safe write tool (jobquest_submit_ai_result only)  [x] AI-3E Limits/scopes  [x] AI-3F Security validation (tests; release-security-reviewer pass still due before final release)

AI-4 Claude Integration (combined)                  COMPLETE (branch CI 37947672506; development CI 38201400116; development 498d3342) (feature/ai-4-claude-integration)
[x] Claude custom remote MCP connector setup UX (fixed Bearer header, AI-3 tokens)  [x] manager-token RLS-parity decision + test  [x] tool descriptions + eval fixtures
[x] branch CI  [x] remote Claude connector smoke (PASS, token revoked)  [x] development integration + CI
(Deferred, not started: scheduled Morning Brief, workflow-config mutation, OAuth)

AI-5 Scheduled Intelligence + Daily Digest (combined; re-sequenced)   COMPLETE (branch CI 38205261995 @6c8196f7; development CI 38205932872; development ce3c16a6) (feature/ai-5-scheduled-digest). `daily_brief` = canonical workflow id for the Daily Digest feature.
[x] Daily Digest = ai_finding (kind/workflow daily_brief; versioned payload 1.0; one digest per owner+date+provider; NO digest table, NO migration)
[x] aiReadService digest reads + jobquest_list_daily_digests (read-only) + deterministic aggregation service + user-initiated "save JobQuest digest for today" (provider system)
[x] AI Hub -> Daily Digest tab (/ai-hub/digest): Today/Yesterday/Last 7/custom, provider filter, combined view, source availability states
[x] workflow definitions (5) + Claude scheduled-task templates (ai-hub/provider-workflows/) ; no JobQuest scheduler (provider-owned scheduling)
(Deferred: ai_workflow_configs mutation, cross-run suggestion policy, closed-finding supersession, application matching, any external source integration)

[historical label] Former AI-5 Gemini                  RE-SEQUENCED (after AI-6; conditional on plan eligibility; consumer scheduled capability unvalidated)
[ ] 5A  [ ] 5B  [ ] 5C  [ ] 5D  [ ] 5E

[historical label] Former AI-6 ChatGPT                 RE-SEQUENCED (after AI-6; expect attended-only; custom MCP availability differs by plan/product)
[ ] 6A  [ ] 6B  [ ] 6C  [ ] 6D  [ ] 6E

AI-6 (new) External Intelligence Sources              COMPLETE (branch CI 38211220785 @a507bf3f; development CI 38212006797; development f0a0ec89) (feature/ai-6-external-intelligence; see reports/AI-6_EXTERNAL_INTELLIGENCE_REPORT.md)
AI-7 (new) Calendar Intelligence + dedicated AI-Hub e2e CI  COMPLETE (branch CI 38252291451 @01dc9a18; development CI 38253737675; development 4eac989c) (feature/ai-7-calendar-intelligence; see reports/AI-7_CALENDAR_INTELLIGENCE_REPORT.md)
AI-8 (new) Human-approved controlled actions + Application matching  COMPLETE (branch CI 38263782230 @fe3b4df0; development CI 38264986612; development 5656bd46) (feature/ai-8-controlled-actions; see reports/AI-8_CONTROLLED_ACTIONS_REPORT.md)
[x] actions: create_application (job lead) / create_task / set_status (existing stage or REJECTED)  [x] preview -> human confirm -> revalidate -> execute as the caller  [x] state fingerprint (ACTION_STALE)  [x] idempotent (DB unique live indexes)
[x] application matching (EXACT / STRONG / AMBIGUOUS / NONE; ambiguity never auto-selected)  [x] ai_action_executions provenance  [x] /ai-hub/actions + Overview/Digest/Job Leads integration  [x] dedicated AI-Hub e2e extended  [x] still NO core-write MCP tool
(Deferred: email send/reply, calendar mutation / RSVP, recruiter outreach, bulk or autonomous actions, universal undo, other status outcomes, ChatGPT/Gemini, Production rollout)
[x] job_lead child table ai_job_leads (migration 20261027100000)  [x] email_event + recruiter_intel as findings  [x] one ingestion path, 3 read-only MCP tools
[x] Job Leads / Email / Recruiter Intel pages + Overview cards  [x] Daily Digest integration (available/zero/not_configured preserved)  [x] Claude templates
(Deferred: calendar, application matching/conversion, email send/reply, recruiter outreach, ChatGPT/Gemini, controlled AI actions, Production rollout)

AI-9 (new) Subscription provider expansion (Gemini + ChatGPT Plus) + scheduled-automation validation  READY FOR DEVELOPMENT INTEGRATION (branch CI 38279984981 PASS @519ab2e3; provider UIs verified; both authenticated connections BLOCKED on standard OAuth; no OAuth built in AI-9, delivered by AI-10; see reports/AI-9_PROVIDER_EXPANSION_REPORT.md)

AI-10 (new) OAuth 2.1 Provider Auth + Final Security / Release Hardening  PRODUCTION CERTIFIED / COMPLETE (main 455a0120; development 5fc2bc4c; Prod DB head 20261031100000; Claude PASS, Gemini PASS, ChatGPT PASS; see reports/AI-10_OAUTH_RELEASE_HARDENING_REPORT.md section 9)
[x] AI-10A OAuth 2.1 layer (user-defined confidential clients, code+PKCE S256, rotating refresh; migration 20261030100000)  [x] AI-10B Gemini + ChatGPT OAuth live revalidation  [x] AI-10C Final security review (no release blockers)
[x] AI-10D Migration reconciliation  [x] AI-10E Release matrix + runbook  [x] AI-10F Production release + provider validation (Claude, Gemini, ChatGPT)  [x] AI-10G Gemini OAuth state hotfix (bound 8..2048; migration 20261031100000)
(AI-10 is the connectivity/security foundation. It does NOT mean AI automation is finished: scheduled workflows, Gmail/email intelligence, job discovery and recruiter intelligence continue in AI-11. Post-release items P1-P9 and pending security maintenance: report section 9.)

JOBQUEST 2.2 / AI-11 - SCHEDULED INTELLIGENCE & DIGEST AUTOMATION   IN PROGRESS - AI-11A, AI-11B, AI-11C, AI-11D, AI-11E, AI-11F COMPLETE (feature branches; development integration recorded in the completion reports) - NEXT IMPLEMENTATION PHASE: AI-11G PROVIDER SCHEDULER ADAPTERS (needs separate approval)
Primary objective of the next feature release. Provider is configuration, not architecture: all providers use the same JobQuest MCP + AI Hub data model. Job leads stay AI/job-lead records and never auto-create Applications. Nothing is ever auto-sent to recruiters or third parties. JobQuest stores structured intelligence, not raw Gmail bodies.
[x] AI-11A Automation foundation (DONE: extends ai_workflow_configs; derived run state; computed next run; Run Now deferred with contract; reports/AI-11A_AUTOMATION_FOUNDATION_REPORT.md) - provider-neutral workflow config + run state (enabled, provider, cadence, timezone, sections, delivery prefs, last run/success, next expected run, failure state, Run Now). FIRST determine reuse of ai_workflow_configs / ai_runs / ai_findings and existing AI Hub settings/UI.
[x] AI-11B Email intelligence & triage (DONE: extends the email_event finding, no migration; canonical group/category/urgency/action/deadline/stage hint; read-time application match; privacy stripping; read-only MCP filters; Email page upgrade; reports/AI-11B_EMAIL_INTELLIGENCE_TRIAGE_REPORT.md) - Gmail source (provider-side); JOB RELATED (recruiter outreach/replies, application confirmation, interview/scheduling, assessment, follow-up, status update, rejection, offer) vs OTHER MAIL (important personal/account, notifications, newsletters, other); urgency HIGH/MEDIUM/LOW on every email; structured fields (company, matched application, stage, sender name/domain, subject, received time, summary, deadline, recommended action, needs_attention); application matching, duplicate prevention, privacy limits, optional draft-only workflow.
[x] AI-11C Daily digest (DONE: EXTENDS the existing daily_brief digest, payload 1.0 -> 1.1, NO migration, no MCP change; canonical sections Needs attention, Job-related email, Other important email, Upcoming, Recent job leads, Recruiters, Follow-ups composed by one pure deterministic composer from existing structured records only; owner-timezone date, immutable snapshot, `unavailable` source state; reports/AI-11C_DAILY_DIGEST_REPORT.md)
[x] AI-11D Fresh job discovery (DONE: EXTENDS the existing lead storage (no new leads/run tables); NEW only a bounded owner-scoped discovery profile (`ai_job_discovery_profiles`, owner-only RLS, service-role save) ; one additive migration `20261102100000`; provider-neutral deterministic backstop at ingestion (freshness 12/24/48/72 h with unknown dates dropped unless explicitly allowed and never shown as today, Remote-US vs restricted/regional remote, excluded titles, explicit experience limit, clearance, software-QA gate, score floor, per-run cap; dropped leads are counted and never fail a run); per-source run status (ok/zero/blocked/unavailable/error/skipped) in existing `ai_runs.sources`; cross-source dedupe (first URL kept + bounded `alt_urls`, conservative logical key); read-time "Already tracked" via the AI-8 matcher (read-only, no Application is ever created or changed); MCP 11 -> 12 (one read-only `jobquest_get_job_discovery_profile`); Job Leads page freshest-first; Settings -> Job Discovery; Claude/ChatGPT/Gemini templates on one profile + contract; reports/AI-11D_FRESH_JOB_DISCOVERY_REPORT.md) - original goal: Remote US / Houston (optionally strong-fit hybrid/onsite), QA/SDET/testing/automation; configurable freshness 12h/24h/48h/72h; newest first; dedupe; no padding; scoring; source health; stored as Job Leads.
[x] AI-11E Recruiter intelligence (DONE: EXTENDS the `recruiter_intel` finding; NEW only bounded owner-scoped recruiter preferences (`ai_recruiter_discovery_preferences`, owner-only RLS, service-role save) and four service-role RPCs; one additive migration `20261103100000`; job-linked mode (one person per company for a stored lead) + target-company networking (only companies the owner listed); verified only with a cited public URL AND a basis, otherwise visibly uncertain; no phone stored, work email only with a cited source and never a personal/guessed address; role relevance, deterministic ranking, one person per company per run, bounded new contacts, 30-day suppression; dedupe profile URL > person id > work email > name+company with merge-not-replace; evidence-based why; bounded outreach DRAFTS that are never sent (no outreach tool); per-source status reused from `ai_runs.sources`; read-only application relation; MCP 12 -> 13 tools (one read-only profile tool, still one write); Settings -> Recruiter Intelligence and a grouped Recruiter Intel page; reports/AI-11E_RECRUITER_INTELLIGENCE_REPORT.md)
[x] AI-11F Schedule & cadence execution (DONE: EXTENDS ai_runs (automation_id + scheduled_for), one additive migration `20261104100000`; database-enforced occurrence identity + concurrency-safe request/claim RPCs; one shared occurrence calculator for next-run and due evaluation; 3 h catch-up, DST once; retry = new run; sanitized failures; digest-last composite order; provider-neutral executor contract; Run Now backend real but executor-gated; no MCP change; reports/AI-11F_SCHEDULE_EXECUTION_REPORT.md) - weekdays/daily/selected days/weekly, timezone, run history, failure reporting, retries/idempotency. Examples: Weekday Morning Digest (Mon-Fri 8:00 AM America/Chicago), Weekend Job Scan, Weekly Job Search Review, Weekly Inbox Review.
[ ] AI-11G Provider scheduler adapters - subscription-native schedulers without paid LLM API tokens where supported. Order: 1 Claude, 2 ChatGPT (when scheduling is available/suitable), 3 Gemini (same). Adapter over the canonical JobQuest workflow.
[ ] AI-11H Weekly digest + UI/analytics polish - weekly digest (applications moved, upcoming interviews/assessments, unresolved important emails, strong unreviewed leads, recruiters worth contacting, overdue follow-ups, activity/goal summary), automation health, run history, failure state, source coverage, digest analytics, provider status.
(AI-11A, AI-11B, AI-11C, AI-11D, AI-11E and AI-11F are implemented; AI-11G-H remain planning only. Development stays cumulative; main promotion happens once, after all approved AI-11 subphases.)

AI-7 Email triage                                       NOT STARTED
[ ] 7A Rules  [ ] 7B Classification  [ ] 7C Priority  [ ] 7D Matching  [ ] 7E Review UX  [ ] 7F Dedupe

AI-8 Job discovery                                      NOT STARTED
[ ] 8A Profile  [ ] 8B Discovery  [ ] 8C Dedup  [ ] 8D Ranking  [ ] 8E Leads UX

AI-9 Recruiter intelligence                             NOT STARTED
[ ] 9A Ingestion  [ ] 9B Matching  [ ] 9C Contact suggestions  [ ] 9D UX

AI-10 Calendar / interview intelligence [historical label]  SUPERSEDED BY AI-7
[ ] 10A Ingestion  [ ] 10B Detection  [ ] 10C Reschedule/cancel  [ ] 10D Events UX

AI-11 [historical label - controlled actions; the AI-11 number now means Scheduled Intelligence, see above] Controlled actions (only after read/suggestion layers are stable)   PARTLY DELIVERED EARLY by AI-8 (create task / status update / application from lead, human-approved); 11B snooze/dismiss and 11E approval-audit hardening remain
[ ] 11A Create task  [ ] 11B Snooze/dismiss  [ ] 11C Status update  [ ] 11D App from lead  [ ] 11E Approval/audit

FINAL RELEASE (operator-approved)                       NOT STARTED
[ ] final development validation → development→main → main CI → prod migrations → deploy → manual acceptance
    report: ai-hub/AI_HUB_FINAL_RELEASE_REPORT.md (template only; not created)
```

Current recommendation after AI-10 closure: the next implementation phase is AI-11A (Automation Foundation), once separately approved. Development is integration only until the next release gate.

Historical (pre-closure) AI-10 note: integrate to development, then STOP. Main and Production remain frozen until the separately authorised single development -> main -> Production release (runbook: reports/AI-10_OAUTH_RELEASE_HARDENING_REPORT.md section 6).
