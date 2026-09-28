# Milestone 15 — Production Reconciliation Plan: Zero-Delta Audit

**Status**: **PROPOSED — PRE-FLIGHT VERIFIED**  
**Milestone**: Milestone 15 — Production Launch & Cutover  
**Branch**: `feature/m15-production-launch-cutover`  
**Standard**: 100% row balance, 0 foreign key orphans, exact timestamp parity

---

## 1. Multi-Tier Reconciliation Architecture

To guarantee complete fidelity between JobQuest 1.0 Neon and JobQuest 2.0, the production reconciliation procedure executes audits across eight independent validation dimensions:

```
[1. Row Count Balance] ────► [2. Foreign Key Integrity] ────► [3. ID Mapping Parity]
         │                              │                               │
         ▼                              ▼                               ▼
[4. Timestamp Parity]  ────► [5. Content Sampling]     ────► [6. Workflow State]
         │                              │
         ▼                              ▼
[7. Analytics Formula] ────► [8. Search Indexability]
```

---

## 2. Reconciliation Dimension Specifications

### 2.1 Dimension 1: Domain Row Count Balance
Every migrated domain must achieve a net delta of exactly zero:

| Domain Table | Legacy Source Table | Source Count ($S$) | Target Count ($T$) | Delta ($S - T$) | Allowed Variance |
| --- | --- | --- | --- | --- | --- |
| `public.profiles` | `users` | $S_{usr}$ | $T_{usr}$ | 0 | **0% (Zero)** |
| `public.resumes` | `resumes` | $S_{res}$ | $T_{res}$ | 0 | **0% (Zero)** |
| `public.tags` | `tags` | $S_{tag}$ | $T_{tag}$ | 0 | **0% (Zero)** |
| `public.applications` | `applications` | $S_{app}$ | $T_{app}$ | 0 | **0% (Zero)** |
| `public.job_snapshots` | `job_snapshots` | $S_{snp}$ | $T_{snp}$ | 0 | **0% (Zero)** |
| `public.contacts` | `contacts` | $S_{cnt}$ | $T_{cnt}$ | 0 | **0% (Zero)** |
| `public.interviews` | `interviews` | $S_{int}$ | $T_{int}$ | 0 | **0% (Zero)** |
| `public.tasks` | `tasks` | $S_{tsk}$ | $T_{tsk}$ | 0 | **0% (Zero)** |
| `public.habits` | `habits` | $S_{hbt}$ | $T_{hbt}$ | 0 | **0% (Zero)** |
| `public.habit_logs` | `habit_logs` | $S_{hbl}$ | $T_{hbl}$ | 0 | **0% (Zero)** |
| `public.journal_entries` | `notes` | $S_{not}$ | $T_{not}$ | 0 | **0% (Zero)** |
| `public.goals` | `goals` | $S_{gol}$ | $T_{gol}$ | 0 | **0% (Zero)** |

---

### 2.2 Dimension 2: Foreign Key Integrity & Orphan Audit
Audit queries execute against the production Supabase database to confirm referential integrity:

```sql
-- 1. Check for application snapshots with missing applications
SELECT count(*) AS orphan_snapshots
FROM public.job_snapshots s
LEFT JOIN public.applications a ON s.application_id = a.id
WHERE a.id IS NULL AND s.workspace_id = :target_workspace_id;

-- 2. Check for interviews with missing applications
SELECT count(*) AS orphan_interviews
FROM public.interviews i
LEFT JOIN public.applications a ON i.application_id = a.id
WHERE a.id IS NULL AND i.workspace_id = :target_workspace_id;

-- 3. Check for tasks with missing linked applications (when set)
SELECT count(*) AS orphan_tasks
FROM public.tasks t
LEFT JOIN public.applications a ON t.application_id = a.id
WHERE t.application_id IS NOT NULL AND a.id IS NULL AND t.workspace_id = :target_workspace_id;

-- 4. Check for habit logs with missing habit definitions
SELECT count(*) AS orphan_habit_logs
FROM public.habit_logs l
LEFT JOIN public.habits h ON l.habit_id = h.id
WHERE h.id IS NULL AND l.workspace_id = :target_workspace_id;
```
**Acceptance Threshold**: All counts must return **0**. Any count > 0 aborts cutover.

---

### 2.3 Dimension 3: ID Mapping Verification
Verify that `public.migration_id_mappings` contains an exact 1:1 translation for every legacy entity:
```sql
SELECT entity_type, count(*) 
FROM public.migration_id_mappings 
WHERE target_workspace_id = :target_workspace_id 
GROUP BY entity_type;
```

---

### 2.4 Dimension 4: Timestamp Parity Audit
Randomly select 10 applications and 10 notes; verify `created_at` in JobQuest 2.0 matches `created_at` in Neon within 1 millisecond.

---

### 2.5 Dimension 5: Global Search Indexability
Execute `rpc_global_search` across migrated records to verify GIN trigram and full-text indexes are active and queryable immediately following migration:
```sql
SELECT * FROM rpc_global_search('Senior', :target_workspace_id);
```
Confirm search results return migrated applications and journal entries.
