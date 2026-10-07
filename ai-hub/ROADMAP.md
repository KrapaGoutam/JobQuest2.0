# AI Hub — Roadmap (progress view)

Statuses: NOT STARTED · IN PROGRESS · BLOCKED · READY FOR REVIEW · COMPLETE · SHELVED · INTERRUPTED. Attributes: `PHASE_REGISTRY.md`. Gates: `IMPLEMENTATION_PHASES.md`.
Update this file in the same commit as the phase it reflects.

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

AI-1 Foundation                                         IN PROGRESS (feature/ai-1-foundation)
[x] AI-1P Env isolation verification (prerequisite) — COMPLETE, GO FOR AI-1A (do not push branch until Preview mapping confirmed)
[x] AI-1A Database — COMPLETE on jobquest-dev (migration 20261023100000); local commit, not pushed
[ ] AI-1B RLS / ownership / audit
[ ] AI-1C Run + finding model + contract
[ ] AI-1D Shell / navigation
[ ] AI-1E Overview / History
[ ] AI-1F Feature flags / release controls

AI-2 Internal integration service                       NOT STARTED
[ ] AI-2A Read service  [ ] AI-2B Ingestion  [ ] AI-2C Validation/versioning
[ ] AI-2D Idempotency/dedupe  [ ] AI-2E Audit/provenance

AI-3 Remote MCP + auth                                  NOT STARTED
[ ] AI-3A Foundation  [ ] AI-3B Auth (decision gate)  [ ] AI-3C Read tools
[ ] AI-3D Safe write tools  [ ] AI-3E Limits/scopes  [ ] AI-3F Security validation

AI-4 Claude / Cowork                                    NOT STARTED   (first provider)
[ ] 4A Connector  [ ] 4B Read workflow  [ ] 4C Scheduled Morning Brief  [ ] 4D Structured return  [ ] 4E Failure/approval

AI-5 Gemini                                             NOT STARTED   (conditional: plan eligibility)
[ ] 5A  [ ] 5B  [ ] 5C  [ ] 5D  [ ] 5E

AI-6 ChatGPT                                            NOT STARTED   (expect attended-only)
[ ] 6A  [ ] 6B  [ ] 6C  [ ] 6D  [ ] 6E

AI-7 Email triage                                       NOT STARTED
[ ] 7A Rules  [ ] 7B Classification  [ ] 7C Priority  [ ] 7D Matching  [ ] 7E Review UX  [ ] 7F Dedupe

AI-8 Job discovery                                      NOT STARTED
[ ] 8A Profile  [ ] 8B Discovery  [ ] 8C Dedup  [ ] 8D Ranking  [ ] 8E Leads UX

AI-9 Recruiter intelligence                             NOT STARTED
[ ] 9A Ingestion  [ ] 9B Matching  [ ] 9C Contact suggestions  [ ] 9D UX

AI-10 Calendar / interview intelligence                 NOT STARTED
[ ] 10A Ingestion  [ ] 10B Detection  [ ] 10C Reschedule/cancel  [ ] 10D Events UX

AI-11 Controlled actions (only after read/suggestion layers are stable)   NOT STARTED
[ ] 11A Create task  [ ] 11B Snooze/dismiss  [ ] 11C Status update  [ ] 11D App from lead  [ ] 11E Approval/audit

FINAL RELEASE (operator-approved)                       NOT STARTED
[ ] final development validation → development→main → main CI → prod migrations → deploy → manual acceptance
    report: ai-hub/AI_HUB_FINAL_RELEASE_REPORT.md (template only; not created)
```

Recommended order after AI-1: 2 → 3 → 4 (Claude) → 7/8 using the proven provider; 5 and 6 as eligibility allows; 9/10 after 7; 11 last.
