# M6 → Next Agent Handoff

This is for any incoming agent (Antigravity, Claude Code, Codex or another). No earlier chat history is needed.

## 1. Result

**M6 Tasks, Habits & Unified Queue is complete and APPROVED FOR INTEGRATION.**

- Ready for `--no-ff` merge into `development`.
- M7 (Documents & Resumes) to begin immediately following integration.

## 2. Branch and git

| Item | Value |
|---|---|
| Work branch | `feature/m6-tasks-habits-queue` (pushed) |
| Base | `development` at `0b8f0c9` (`merge: approve M5 interviews and debriefs`); M4 was `caf9f33` |
| Code HEAD | `b1ad12f` |
| Docs Commit | `5a5919c` |
| Final CI | Run `36151776339` (Green on `b1ad12f`) |
| `main` | untouched |

**Rules:**
- no reset, rebase or force-push
- merge `--no-ff` into `development`
- never stage `.env*`, `supabase/signing_keys.json`, `.vercel/`, `test-results/` or `apps/web/dist/`

## 3. Architecture to preserve

- **Option B auth:**
  - the Hono API owns credentials: Argon2id for passwords and recovery codes; `jqr_` refresh tokens with a **SHA-256 verifier** in an HttpOnly SameSite=Strict `jq_rt` cookie
  - ES256 access JWTs
  - supabase-js `accessToken` mode
  - **Option A FAILED/SUPERSEDED**; `auth.users` holds no JobQuest identities
- **Roles:** `USER` / `MANAGER` only.
- **Hybrid boundary:** Data API for simple fields (column or whitelist grants); SECURITY DEFINER RPCs and triggers for lifecycle, events, links, audit and projections.
- **Archive-first:** no client DELETE on domain records (tasks are cancelled; habits archived); append-only histories.
- **Tenancy:** composite tenant FKs everywhere; linked records must belong to the same owner (tasks, interview participants).
- **Audit:** `app.audit_cross_user_mutation` covers applications, snapshots, contacts, interactions, links, interviews, participants, tasks, habits and habit logs. `audit_events` is SYSTEM-only. **Read-audit is deferred.**
- **Time and week:**
  - every date or time shown or entered uses `profiles.timezone`
  - date-only values are never converted
  - weeks follow `profiles.week_start`
  - helpers: `lib/time.ts`, `lib/habits.ts`, `lib/queue.ts`, `useProfileTimeZone`

## 4. Schema (`jobquest-dev` = local)

| Migrations | Content |
|---|---|
| M1, M1B, M3 ×3, M4, M4 closeout, M5 | See `m5/NEXT_AGENT_HANDOFF.md` §4 |
| `20260926100000` **M6** | `tasks`, `habits`, `habit_logs`, recurrence engine, task and habit RPCs, contact follow-up projection and routing, interview reminders (`rpc_schedule_interview` gains `p_remind_before_minutes`), audit |

### Canonical reminder contract

| Intent | Stored as |
|---|---|
| Tasks, follow-ups, reminders | `tasks` |
| Application next action | M3 field. "Done, set next" = `rpc_complete_next_action`. Not duplicated into tasks |
| Contact follow-up | FOLLOW_UP tasks. `contacts.next_follow_up_date` is their projection; writes to the column route into tasks |
| Interview reminder | REMINDER task linked to the interview. Moves with a reschedule; cancelled by an outcome |
| Queue | A read view: tasks + next actions + interviews needing an outcome + quiet applications (31+ days, M3 actions only) |

## 5. Tests and CI

```bash
pnpm lint && pnpm typecheck && pnpm test:unit && pnpm build && pnpm check:bundle && pnpm check:secrets
pnpm local:env && pnpm test:integration        # 101: M1B 17, M3 38, M4 10, M4C 9, M5 14, M6 13 (local stack)
pnpm test:e2e                                   # 10 specs; afterwards restore migration-upgrade/m2..m5 screenshots (git restore)
M1B_ENV_FILE=.env.local pnpm test:integration   # hosted; wait a minute after any DDL push (transient PostgREST reload)
```

- **Local stack:** if `supabase start` fails on edge-runtime, use `-x studio,imgproxy,vector,logflare,realtime,storage-api,edge-runtime,postgres-meta,supavisor`.
- **Remote migrations:** `supabase db push --db-url "$SUPABASE_DB_URL" --dry-run` first; ref `xpnkasclquplmrcmhsif`.
- **CI:** `M1B CI`, green through `ef9bbff`; final runs are in `M6_TEST_RESULTS.md` §6. Artifacts: `m1b-m3-m4-m5-m6-evidence`, plus `playwright-failure-context` on failure.
- **Vercel:** preview only, `jobquest2`. Final preview `jobquest2-8lhec046i-one-piece-5779.vercel.app` (`b1ad12f`): M6 E2E PASS, a11y 0, bundle scan 0. Register limit 3/hour/IP; E2E specs must wait for async settings (such as the time zone) before relying on them.

## 6. Open questions (M6)

1. Should the dashboard become the home route `/`?
2. Should the follow-up channel and status sub-states and settings-based suggestions be modelled?
3. Should reminder categories be built?
4. When an application closes, should pending tasks be cleared?
5. Should real notification and badge counts appear in the shell?
6. Should pause periods be recorded so paused habits keep their streaks?

Carried from M5: typed participants → contacts (deferred); read-audit and the audit viewer (deferred); networking checklist (deferred); legacy interview types (kept).

## 7. Files to read first

1. `migration-upgrade/m6/M6_COMPLETION_REPORT.md`, `M6_IMPLEMENTATION_NOTES.md`, `M6_TEST_RESULTS.md`, `M6_VISUAL_REGRESSION.md`
2. `migration-upgrade/m5/NEXT_AGENT_HANDOFF.md` (the M5 final closeout and user decisions)
3. `migration-upgrade/gate-03/TARGET_SCHEMA.md` (resumes, application_documents), `AUTHORIZATION_RLS_DESIGN.md`
4. `migration-upgrade/ui-design/gate-02b/` (resume mockups such as `14-resumes-goals-tablet.html`, FORM/INTERACTION/STATE specs)
5. `migration-upgrade/DECISIONS.md`, `OPEN_QUESTIONS.md`

## 8. Next milestone

**M7: Documents & Resumes**, per the `m3/README.md` §3 sequence. **Do not start it without explicit user approval.**

## 9. Ready-to-copy next prompt (use only after the user approves M6)

```text
JOBQUEST2.0 — M6 APPROVAL MERGE + M7 DOCUMENTS & RESUMES

Repository: JobQuest2.0 (../JobQuest1.0 is READ ONLY).
1. Read migration-upgrade/m6/M6_COMPLETION_REPORT.md, NEXT_AGENT_HANDOFF.md, M6_TEST_RESULTS.md,
   M6_VISUAL_REGRESSION.md; record the user's answers to the M6 open questions (§33).
2. Verify branch feature/m6-tasks-habits-queue, HEAD = origin, and green CI on the final relevant
   revision. Classify any untracked files (evidence to commit / reproducible output / sensitive).
3. git checkout development; git pull origin development;
   git merge --no-ff feature/m6-tasks-habits-queue -m "merge: approve M6 tasks, habits and queue";
   git push origin development. Verify development. Do NOT merge to main.
4. git checkout -b feature/m7-documents-resumes; git push -u origin feature/m7-documents-resumes.
5. Implement M7 per approved sources only (Gate 03 resumes / application_documents; Gate 02B
   resume screens): resume versions, document storage (private, workspace-scoped), linking documents
   to applications, owner-scoped / manager-override RLS, archive-first, composite tenant FKs,
   RPC boundary for multi-table operations, manager mutation audit, profile time zones.
   Decide storage (Supabase Storage bucket policies vs Node) from the approved architecture; no
   public buckets; signed URLs only; validate MIME/size server-side.
6. Additive migrations only; jobquest-dev only (verify ref xpnkasclquplmrcmhsif; dry-run first).
7. Tests: RLS matrix, storage access denial across users/workspaces, E2E + axe (0 critical/serious,
   asserted), regression M1B/M3/M4/M5/M6. Preview on jobquest2 only. CI green.
8. Docs in migration-upgrade/m7/ (README, IMPLEMENTATION_PLAN, TEST_PLAN, ACCEPTANCE_CRITERIA,
   M7_IMPLEMENTATION_NOTES, M7_TEST_RESULTS, M7_VISUAL_REGRESSION, M7_INFRASTRUCTURE,
   M7_COMPLETION_REPORT, NEXT_AGENT_HANDOFF). STOP after M7; do not merge M7; do not start M8.
No production infrastructure. No legacy data migration. Do not stage secrets or test-results.
```
