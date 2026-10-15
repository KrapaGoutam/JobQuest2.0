# AI-11G — Operator acceptance plan (provider scheduling)

**Status: NOT RUN. Requires explicit operator approval before any step.** AI-11G code complete does not mean a provider's scheduler has been certified. Nothing here is automatic; the agent creates no provider schedule and connects no account.

Scope: **Development/Preview only**, never Production. Providers are tested **one at a time**, in this order, and only if that provider's scheduled environment can actually reach the JobQuest connector: **1. Claude → 2. ChatGPT → 3. Gemini**. Stop a provider's run at the first FAIL; record the result as VERIFIED / APPROVAL-GATED / NOT SUPPORTED, never smooth it over.

## Preconditions (once)

1. Development merged, development CI green, **remote Dev migration `20261105100000` applied** (verify ref `xpnkasclquplmrcmhsif`, inspect ledger, dry-run, apply only that migration). Preview/Dev has `AI_HUB_ENABLED=true`, `VITE_AI_HUB_ENABLED=true`.
2. A Dev/Preview JobQuest environment the provider can reach (use the stable branch/Preview alias; if Vercel protection blocks the provider, record that, do not weaken protection).
3. Use **synthetic, non-destructive** content only: no real recruiter, no real mailbox content in notes, no Production data. A provider mailbox/calendar connector is optional; a one-section automation is enough.
4. Record only metadata (no tokens, no message bodies).

## Per-provider procedure (repeat for each provider)

For provider P ∈ {Claude, ChatGPT, Gemini}:

1. **Connection.** Settings → Providers → P: create the JobQuest credential (Claude: *Read + AI findings*; ChatGPT/Gemini: OAuth client with *Allow AI findings*). Expect *Providers → P → JobQuest connection: Connected* and *Scheduled execution: Needs setup*. (A connection must NOT show Ready.)
2. **One temporary automation.** Settings → Automations → New: name `ZZ AI-11G test (P)`, provider P, workflow *Job discovery* (or *Calendar review* if no search tool), cadence *Daily*, time = **the next free quarter-hour in your time zone**, enabled. Expect *Scheduled execution: Needs setup* on the card.
3. **Attended dry run (no schedule yet).** Automations → *Run in provider* → copy → paste into a normal P chat with the JobQuest connection enabled. Expect: tool call `jobquest_claim_ai_execution` returns `CLAIMED` (Manual run), the provider submits ONE synthetic result (an empty or one-lead result), JobQuest shows a **Manual** run *Succeeded/Partial* in *Recent runs*, no Application/task/contact changed. If the provider repeats the claim with the same `clientKey`, expect `ALREADY_CLAIMED`, never a second run.
4. **Create ONE provider-native schedule manually** using *Set up in P* → *Copy scheduled-task instructions*; schedule it at the due time or a few minutes **later**, never earlier.
5. **Early/no-op check.** Use the provider's test / run-now control if it has one *before* the due time: expect `NOT_DUE`, the task stops, **no run created** (Recent runs unchanged).
6. **Scheduled occurrence.** Let the schedule fire once. Record: (a) did it start unattended? (b) were JobQuest tools available inside the scheduled run? (c) did the claim return `CLAIMED`? (d) did the result save without an approval click (record `APPROVAL-GATED` honestly if the provider paused)? Expect a **Scheduled** run *Succeeded/Partial*; Providers → P → *Scheduled execution* becomes **Ready** only now; AI Hub History shows the run; findings are synthetic only.
7. **Idempotency.** If the provider offers a second manual trigger inside the same window: expect `ALREADY_COMPLETED`, still one Scheduled run for that occurrence.
8. **Failure path (optional, only if easy):** disable the JobQuest connector in the provider for one test and trigger the task; expect the provider to report a bounded failure (run *Failed*, category shown, no secret/URL/email in the message) or to stop with no JobQuest run; a claimed run must not stay *Running* beyond 60 minutes (the next claim fails it as Timeout and creates a linked retry).
9. **Verify no core mutation:** Applications, tasks and contacts counts unchanged; no email sent or draft created; no calendar event created.
10. **Clean up:** disable/delete the temporary provider schedule; delete the temporary automation in JobQuest (history is kept); dismiss the synthetic findings via the supported UI; revoke the temporary credential and confirm the next provider call is denied; confirm **no run is left Running/Queued**.

## Result record (per provider)

| Question | Record |
|---|---|
| Connection created / Providers shows Connected but NOT Ready | yes/no |
| Attended manual claim + submit | VERIFIED / FAIL |
| Early wake → NOT_DUE, nothing created | VERIFIED / FAIL / NOT TESTED |
| Scheduled run started unattended | yes/no |
| JobQuest tools available inside the scheduled run | yes/no |
| Claim CLAIMED, exact `externalRunId` used | yes/no |
| Result saved without an approval click | VERIFIED / APPROVAL-GATED / NOT SUPPORTED |
| Scheduled execution turned Ready only after the run | yes/no |
| No core mutation | yes/no |
| Cleanup (schedule, automation, findings, credential) | done/not done |
| Final capability | READY / MANUAL_SETUP / UNVERIFIED / UNSUPPORTED |

Interpretation: `Scheduled execution: Ready` in JobQuest means a scheduled, claim-started run finished end to end — it does not by itself prove the run was unattended, so step 6(a)/(d) must be recorded by the operator.

## Stop rules

- Do not approve provider prompts "to make it work" and then call the run unattended; record APPROVAL-GATED.
- If a provider cannot call JobQuest from a scheduled run, record `UNVERIFIED/UNSUPPORTED`, delete its schedule, and use the manual (Run in provider) instructions only. That does not block the architecture.
- No Production schedule, credential or data is part of this plan. Production certification of AI-11G is a separate, later gate.
