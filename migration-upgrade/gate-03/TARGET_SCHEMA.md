# JobQuest 2.0 · Gate 03: Target Database Schema Specification
**Document ID:** `JQ2-GATE03-SCHEMA-001`  
**Gate:** `Gate 03 — Database + Authentication + Authorization/RLS Design`  
**Status:** `APPROVED (Post-Review Corrections Applied)`  
**Related Documents:** [GATE_03_ARCHITECTURE.md](GATE_03_ARCHITECTURE.md), [AUTHENTICATION_DESIGN.md](AUTHENTICATION_DESIGN.md), [AUTHORIZATION_RLS_DESIGN.md](AUTHORIZATION_RLS_DESIGN.md), [LEGACY_TABLE_MAPPING.md](LEGACY_TABLE_MAPPING.md)

---

## 1. Metadata & Architectural Standards

| Dimension | Specification | Notes |
|---|---|---|
| **Database Engine** | PostgreSQL 16+ on Supabase | Native PostgREST + GoTrue Auth integration |
| **Primary Key Standard** | **UUIDv4** (`DEFAULT gen_random_uuid()`) | **ADR-031 Approved**. Native, portable, mature. UUIDv7 proposal superseded. |
| **Tenancy Boundary** | `workspace_id UUID NOT NULL REFERENCES workspaces(id)` | Engine-enforced multi-tenancy |
| **Cross-Tenant Integrity** | Composite FK `(parent_id, workspace_id) REFERENCES ...` | Structural cross-workspace reference prevention (ADR-032) |
| **Traceability Columns** | `legacy_id INTEGER NULL` on all migrated tables | Preserves 100% deterministic audit and rollback tracing |
| **Permanent Production Tables** | **25 Tables** | Clean normalization of 33 legacy tables |
| **Migration-Tracking Tables** | **2 Tables** (`migration_batches`, `migration_id_mappings`) | Persistent for migration, reconciliation, and audit window |
| **Total Schema Tables** | **27 Tables** | 25 Production + 2 Migration/Audit Tracking |
| **M1 Foundational Tables** | **7 Tables** | Baseline schema required for M1 Architecture Spike |

---

## 2. Schema Domain Overview

```
Core Identity & Authentication (4 Tables)
├── user_accounts (auth bridge, username lookup, account status — no password hashes)
├── profiles (display name, email/phone optional, theme, timezone, preferences)
├── auth_recovery_codes (10 single-use >=128-bit entropy recovery code hashes)
└── legacy_claim_codes (30-day default expiry one-time migration claim tokens)

Workspace Tenancy & Governance (3 Tables)
├── workspaces (tenants: personal & shared)
├── workspace_members (memberships & roles: USER | MANAGER with last-manager trigger)
└── workspace_invitations (multi-use join invitation tokens)

Application & Job Domain (5 Tables)
├── companies (workspace-shared company reference registry)
├── applications (pipeline state, outcome, next action, stored last_activity_at aging)
├── job_snapshots (immutable job posting snapshots — inherits application ownership)
├── application_events (append-only lifecycle event sourcing for historical funnel)
└── interviews (interview rounds, preparation_notes, questions_expected)

Networking & Contacts (3 Tables)
├── contacts (recruiter and networking contacts — owner scoped / manager override)
├── contact_interactions (outreach timeline log — owner scoped / manager override)
└── application_contacts (many-to-many application-to-contact association)

Tasks, Habits & Journaling (5 Tables)
├── tasks (unified queue, reminders, follow-ups, recurrence engine)
├── habits (daily/weekly habit definitions with streaks)
├── habit_logs (daily habit check-in entries)
├── journal_entries (personal reflections & coaching notes — owner scoped / manager override)
└── goals (job search metric targets: weekly/monthly applications and outreach)

Documents, Workflow & Integration (5 Tables)
├── resumes (resume assets, versions, and tailored revisions)
├── application_documents (document attachments linked to applications)
├── workflow_definitions (canonical workflow stages, outcomes, and transitions)
├── extension_tokens (scoped, expiring, SHA-256 hashed browser extension tokens)
└── audit_events (immutable security & manager audit log)

Migration Tracking (2 Tables — Staging & Audit Registry)
├── migration_batches (batch execution metadata and checkpointing)
└── migration_id_mappings (legacy integer ID to target UUID mapping registry)
```

---

## 3. Table DDL Specifications

### 3.1 Identity & Authentication Domain

#### 1. `user_accounts`
Anchor record bridging Supabase Auth (`auth.users`) to the application schema.
*Note: Under Auth Option A, passwords are owned exclusively by Supabase Auth GoTrue. `user_accounts` stores account-mapping and status metadata, and **MUST NOT** store duplicate password hashes.*
```sql
CREATE TABLE user_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE, -- References auth.users(id) ON DELETE CASCADE
    username VARCHAR(32) NOT NULL,
    username_clean VARCHAR(32) NOT NULL UNIQUE, -- Lowercase normalized lookup key
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | STAGED | SUSPENDED
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_username_format CHECK (username ~* '^[a-zA-Z0-9_.-]{3,32}$'),
    CONSTRAINT chk_account_status CHECK (status IN ('ACTIVE', 'STAGED', 'SUSPENDED'))
);
CREATE INDEX idx_user_accounts_username_clean ON user_accounts(username_clean);
```

#### 2. `profiles`
User-level presentation attributes, localization preferences, and UI states.
```sql
CREATE TABLE profiles (
    user_id UUID PRIMARY KEY REFERENCES user_accounts(user_id) ON DELETE CASCADE,
    display_name VARCHAR(128) NULL,
    email VARCHAR(255) NULL, -- Optional notification email (FR-014)
    phone VARCHAR(32) NULL, -- Optional notification phone (FR-014)
    timezone VARCHAR(64) NOT NULL DEFAULT 'UTC', -- IANA Timezone (CR-015, OQ-017)
    week_start SMALLINT NOT NULL DEFAULT 1, -- 1 = Monday, 0 = Sunday (CR-015, OQ-005)
    theme_preference VARCHAR(16) NOT NULL DEFAULT 'system', -- system | light | dark (ADR-014, OQ-015)
    preview_pane_open BOOLEAN NOT NULL DEFAULT TRUE, -- Persisted wide-desktop state (ADR-029, OQ-024)
    last_active_workspace_id UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_profiles_theme CHECK (theme_preference IN ('system', 'light', 'dark')),
    CONSTRAINT chk_profiles_week_start CHECK (week_start IN (0, 1))
);
```

#### 3. `auth_recovery_codes`
High-entropy, single-use account recovery verifiers (ADR-038).
*Requirement: Each code is generated with >= 128 bits of cryptographically secure random entropy before encoding. The database stores strictly the Argon2id salted hash.*
```sql
CREATE TABLE auth_recovery_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_accounts(user_id) ON DELETE CASCADE,
    code_hash VARCHAR(128) NOT NULL, -- Argon2id salted hash
    code_hint VARCHAR(6) NOT NULL, -- Human-safe hint prefix for UI identification
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMPTZ NULL,
    used_ip INET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_recovery_codes_user_hint UNIQUE (user_id, code_hint)
);
CREATE INDEX idx_recovery_codes_user ON auth_recovery_codes(user_id) WHERE is_used = FALSE;
```

#### 4. `legacy_claim_codes`
Operator-issued one-time migration claim tokens for legacy JobQuest 1.0 accounts (ADR-039).
*Default expiration is set to 30 days (updated from 90 days), with operator reissue capability.*
```sql
CREATE TABLE legacy_claim_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_user_id INTEGER NOT NULL UNIQUE,
    code_hash VARCHAR(128) NOT NULL, -- SHA-256 hash of high-entropy claim token
    claimed_by_user_id UUID NULL REFERENCES user_accounts(user_id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    claimed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_legacy_claim_lookup ON legacy_claim_codes(code_hash) WHERE claimed_at IS NULL;
```

---

### 3.2 Workspace Tenancy & Governance Domain

#### 5. `workspaces`
Top-level multi-tenant boundary (ADR-010, CR-008).
```sql
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    slug VARCHAR(64) NOT NULL UNIQUE,
    workspace_type VARCHAR(16) NOT NULL DEFAULT 'PERSONAL', -- PERSONAL | SHARED
    created_by UUID NOT NULL REFERENCES user_accounts(user_id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_workspaces_type CHECK (workspace_type IN ('PERSONAL', 'SHARED'))
);
```

#### 6. `workspace_members`
Association linking users to workspaces with role-based access control.
*Protected by database trigger `trg_protect_last_manager` preventing removal or demotion of a workspace's final manager (ADR-036).*
```sql
CREATE TABLE workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_accounts(user_id) ON DELETE RESTRICT,
    role VARCHAR(16) NOT NULL DEFAULT 'USER', -- USER | MANAGER
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_workspace_members_user UNIQUE (workspace_id, user_id),
    CONSTRAINT chk_workspace_members_role CHECK (role IN ('USER', 'MANAGER'))
);
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
```

#### 7. `workspace_invitations`
Cryptographically secure join tokens for shared workspace onboarding.
```sql
CREATE TABLE workspace_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    invite_code_hash VARCHAR(128) NOT NULL UNIQUE,
    role VARCHAR(16) NOT NULL DEFAULT 'USER',
    created_by UUID NOT NULL REFERENCES user_accounts(user_id) ON DELETE RESTRICT,
    max_uses INTEGER NOT NULL DEFAULT 1,
    uses_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_workspace_invites_role CHECK (role IN ('USER', 'MANAGER')),
    CONSTRAINT chk_workspace_invites_uses CHECK (uses_count <= max_uses)
);
```

---

### 3.3 Application & Job Domain

#### 8. `companies`
Workspace-scoped organization registry (shared non-private company reference data; exposes no user applications or notes).
```sql
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    website VARCHAR(255) NULL,
    domain VARCHAR(128) NULL,
    logo_url TEXT NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    legacy_id INTEGER NULL,
    CONSTRAINT uq_companies_workspace_name UNIQUE (workspace_id, LOWER(name)),
    CONSTRAINT uq_companies_id_workspace UNIQUE (id, workspace_id)
);
```

#### 9. `applications`
Primary application entity enforcing decoupled Stage, Outcome, Next Action, and stored Aging telemetry.
```sql
CREATE TABLE applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_accounts(user_id) ON DELETE RESTRICT, -- Record owner
    company_id UUID NULL REFERENCES companies(id) ON DELETE SET NULL,
    company_name VARCHAR(128) NOT NULL, -- Denormalized for rapid rendering
    role_title VARCHAR(128) NOT NULL,
    
    -- Decoupled State Engine (ADR-011, ADR-033)
    stage VARCHAR(32) NOT NULL DEFAULT 'APPLIED',
    status VARCHAR(16) NOT NULL DEFAULT 'OPEN', -- OPEN | CLOSED
    outcome VARCHAR(32) NULL, -- ACCEPTED | REJECTED | WITHDRAWN | GHOSTED | POSITION_CLOSED
    closure_reason VARCHAR(64) NULL, -- Structured reason (e.g. OFFER_DECLINED, ADR-028)
    closure_notes TEXT NULL,
    closed_at TIMESTAMPTZ NULL,
    
    -- Action & Pacing
    priority VARCHAR(16) NOT NULL DEFAULT 'MEDIUM', -- LOW | MEDIUM | HIGH
    next_action VARCHAR(255) NULL,
    next_action_date DATE NULL,
    next_action_completed_at TIMESTAMPTZ NULL,
    
    -- Job Metadata
    job_url TEXT NULL,
    external_job_id VARCHAR(128) NULL,
    location VARCHAR(128) NULL,
    work_arrangement VARCHAR(32) NULL, -- Remote | Hybrid | Onsite
    employment_type VARCHAR(32) NULL, -- Full-time | Contract | Part-time
    salary_min NUMERIC(12, 2) NULL,
    salary_max NUMERIC(12, 2) NULL,
    salary_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    tags TEXT[] NOT NULL DEFAULT '{}',
    
    -- Stored Aging Telemetry (ADR-027, ADR-034, OQ-022)
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    legacy_id INTEGER NULL,
    
    CONSTRAINT uq_applications_id_workspace UNIQUE (id, workspace_id),
    CONSTRAINT chk_app_stage CHECK (stage IN (
        'SAVED', 'PREPARING', 'APPLIED', 'ASSESSMENT',
        'RECRUITER_SCREEN', 'INTERVIEW', 'FINAL_INTERVIEW', 'OFFER'
    )),
    CONSTRAINT chk_app_status CHECK (status IN ('OPEN', 'CLOSED')),
    CONSTRAINT chk_app_outcome CHECK (
        (status = 'OPEN' AND outcome IS NULL) OR
        (status = 'CLOSED' AND outcome IN (
            'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'GHOSTED', 'POSITION_CLOSED'
        ))
    ),
    CONSTRAINT chk_app_closure_reason CHECK (
        outcome != 'WITHDRAWN' OR closure_reason IN (
            'OFFER_DECLINED', 'GENERAL_WITHDRAWAL', 'COMPENSATION_MISMATCH',
            'LOCATION_UNSUITABLE', 'OTHER'
        )
    ),
    CONSTRAINT chk_app_priority CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH'))
);

CREATE INDEX idx_applications_ws_owner ON applications(workspace_id, user_id);
CREATE INDEX idx_applications_ws_status_stage ON applications(workspace_id, status, stage);
CREATE INDEX idx_applications_aging ON applications(workspace_id, last_activity_at) WHERE archived_at IS NULL AND status = 'OPEN';
CREATE INDEX idx_applications_next_action ON applications(workspace_id, next_action_date) WHERE next_action_date IS NOT NULL AND status = 'OPEN';
```

#### 10. `job_snapshots`
Immutable historical snapshot of job posting text captured at creation (CR-011).
*RLS Classification: OWNER SCOPED / MANAGER OVERRIDE (Inherits owning application authorization).*
```sql
CREATE TABLE job_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    job_description TEXT NULL,
    requirements TEXT NULL,
    skills TEXT NULL,
    raw_payload JSONB NULL,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    legacy_id INTEGER NULL,
    CONSTRAINT fk_snapshots_application FOREIGN KEY (application_id, workspace_id)
        REFERENCES applications(id, workspace_id) ON DELETE CASCADE,
    CONSTRAINT uq_job_snapshots_app UNIQUE (application_id)
);
```

#### 11. `application_events`
Unified, append-only timeline event store powering historical funnel analytics ("ever reached", ADR-011, ADR-035).
```sql
CREATE TABLE application_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    actor_id UUID NOT NULL REFERENCES user_accounts(user_id) ON DELETE RESTRICT,
    event_type VARCHAR(32) NOT NULL,
    payload_version INTEGER NOT NULL DEFAULT 1,
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    legacy_id INTEGER NULL,
    CONSTRAINT fk_events_application FOREIGN KEY (application_id, workspace_id)
        REFERENCES applications(id, workspace_id) ON DELETE CASCADE,
    CONSTRAINT chk_event_type CHECK (event_type IN (
        'CREATED', 'CAPTURED', 'APPLIED', 'STAGE_CHANGED', 'OUTCOME_CHANGED',
        'NEXT_ACTION_CHANGED', 'FOLLOW_UP', 'CONTACT_EVENT', 'INTERVIEW_SCHEDULED',
        'INTERVIEW_COMPLETED', 'NOTE', 'ARCHIVED', 'RESTORED', 'KEEP_ACTIVE'
    ))
);
CREATE INDEX idx_app_events_app_time ON application_events(application_id, created_at ASC);
CREATE INDEX idx_app_events_analytics ON application_events(workspace_id, event_type, created_at);
```

#### 12. `interviews`
Scheduled interview rounds preserving verified legacy concepts (`preparation_notes`, `questions_expected`, ADR-022).
```sql
CREATE TABLE interviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES user_accounts(user_id) ON DELETE RESTRICT,
    round_number INTEGER NOT NULL DEFAULT 1,
    interview_type VARCHAR(32) NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 45,
    format VARCHAR(16) NOT NULL DEFAULT 'VIDEO', -- VIDEO | PHONE | ONSITE
    location_or_link TEXT NULL,
    interviewer_names TEXT NULL,
    preparation_notes TEXT NULL,
    questions_expected TEXT NULL,
    completed_at TIMESTAMPTZ NULL,
    outcome VARCHAR(16) NULL, -- PASSED | FAILED | PENDING
    feedback_notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    legacy_id INTEGER NULL,
    CONSTRAINT fk_interviews_application FOREIGN KEY (application_id, workspace_id)
        REFERENCES applications(id, workspace_id) ON DELETE CASCADE,
    CONSTRAINT chk_interviews_format CHECK (format IN ('VIDEO', 'PHONE', 'ONSITE')),
    CONSTRAINT chk_interviews_outcome CHECK (outcome IS NULL OR outcome IN ('PASSED', 'FAILED', 'PENDING'))
);
CREATE INDEX idx_interviews_workspace_schedule ON interviews(workspace_id, scheduled_at);
```

---

### 3.4 Networking & Contacts Domain

#### 13. `contacts`
Professional contacts, recruiters, referrers, and hiring managers.
*RLS Classification: OWNER SCOPED / MANAGER OVERRIDE.*
```sql
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_accounts(user_id) ON DELETE RESTRICT,
    company_id UUID NULL REFERENCES companies(id) ON DELETE SET NULL,
    company_name VARCHAR(128) NULL,
    full_name VARCHAR(128) NOT NULL,
    job_title VARCHAR(128) NULL,
    relationship_type VARCHAR(32) NOT NULL DEFAULT 'RECRUITER',
    email VARCHAR(255) NULL,
    phone VARCHAR(32) NULL,
    linkedin_url TEXT NULL,
    next_follow_up_date DATE NULL,
    notes TEXT NULL,
    tags TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    legacy_id INTEGER NULL,
    CONSTRAINT uq_contacts_id_workspace UNIQUE (id, workspace_id),
    CONSTRAINT chk_relationship_type CHECK (relationship_type IN (
        'RECRUITER', 'HIRING_MANAGER', 'REFERRAL', 'INTERVIEWER', 'PEER', 'CONTACT'
    ))
);
CREATE INDEX idx_contacts_ws_followup ON contacts(workspace_id, next_follow_up_date);
CREATE INDEX idx_contacts_ws_owner ON contacts(workspace_id, user_id);
```

#### 14. `contact_interactions`
Chronological interaction history with networking contacts.
*RLS Classification: OWNER SCOPED / MANAGER OVERRIDE.*
```sql
CREATE TABLE contact_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES user_accounts(user_id) ON DELETE RESTRICT,
    interaction_type VARCHAR(32) NOT NULL, -- EMAIL | CALL | LINKEDIN | MEETING | COFFEE
    interaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    legacy_id INTEGER NULL,
    CONSTRAINT fk_interactions_contact FOREIGN KEY (contact_id, workspace_id)
        REFERENCES contacts(id, workspace_id) ON DELETE CASCADE
);
CREATE INDEX idx_contact_interactions_ws_user ON contact_interactions(workspace_id, user_id);
```

#### 15. `application_contacts`
Many-to-many relationship linking contacts to specific applications.
```sql
CREATE TABLE application_contacts (
    application_id UUID NOT NULL,
    contact_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    role_in_process VARCHAR(32) NULL, -- Interviewer, Referrer, Recruiter
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (application_id, contact_id),
    CONSTRAINT fk_app_contacts_app FOREIGN KEY (application_id, workspace_id)
        REFERENCES applications(id, workspace_id) ON DELETE CASCADE,
    CONSTRAINT fk_app_contacts_contact FOREIGN KEY (contact_id, workspace_id)
        REFERENCES contacts(id, workspace_id) ON DELETE CASCADE
);
```

---

### 3.5 Tasks, Habits & Journaling Domain

#### 16. `tasks`
Unified task management consolidating next actions, reminders, and follow-ups.
```sql
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_accounts(user_id) ON DELETE RESTRICT,
    application_id UUID NULL,
    contact_id UUID NULL,
    task_type VARCHAR(16) NOT NULL DEFAULT 'TASK', -- TASK | FOLLOW_UP | REMINDER
    title VARCHAR(255) NOT NULL,
    details TEXT NULL,
    due_date TIMESTAMPTZ NULL,
    priority VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING', -- PENDING | COMPLETED | CANCELLED
    completed_at TIMESTAMPTZ NULL,
    
    -- Recurrence Engine (ADR-023)
    recurrence_rule VARCHAR(32) NULL, -- DAILY | WEEKDAYS | WEEKLY | BIWEEKLY | MONTHLY
    parent_task_id UUID NULL REFERENCES tasks(id) ON DELETE SET NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    legacy_id INTEGER NULL,
    CONSTRAINT fk_tasks_app FOREIGN KEY (application_id, workspace_id)
        REFERENCES applications(id, workspace_id) ON DELETE CASCADE,
    CONSTRAINT fk_tasks_contact FOREIGN KEY (contact_id, workspace_id)
        REFERENCES contacts(id, workspace_id) ON DELETE CASCADE,
    CONSTRAINT chk_task_status CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT chk_task_priority CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH'))
);
CREATE INDEX idx_tasks_ws_due ON tasks(workspace_id, due_date) WHERE status = 'PENDING';
CREATE INDEX idx_tasks_user_queue ON tasks(workspace_id, user_id, status);
```

#### 17. `habits`
Cadence-driven habit tracking with streak counters.
```sql
CREATE TABLE habits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_accounts(user_id) ON DELETE RESTRICT,
    title VARCHAR(128) NOT NULL,
    frequency VARCHAR(16) NOT NULL DEFAULT 'DAILY', -- DAILY | WEEKLY
    target_count INTEGER NOT NULL DEFAULT 1,
    current_streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    legacy_id INTEGER NULL,
    CONSTRAINT uq_habits_id_workspace UNIQUE (id, workspace_id),
    CONSTRAINT chk_habits_frequency CHECK (frequency IN ('DAILY', 'WEEKLY'))
);
```

#### 18. `habit_logs`
Daily check-in logs for habits.
```sql
CREATE TABLE habit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    habit_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES user_accounts(user_id) ON DELETE RESTRICT,
    log_date DATE NOT NULL,
    completed_count INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    legacy_id INTEGER NULL,
    CONSTRAINT fk_habit_logs_habit FOREIGN KEY (habit_id, workspace_id)
        REFERENCES habits(id, workspace_id) ON DELETE CASCADE,
    CONSTRAINT uq_habit_logs_date UNIQUE (habit_id, log_date)
);
```

#### 19. `journal_entries`
Rich-text reflections and notes.
*RLS Classification: OWNER SCOPED / MANAGER OVERRIDE (USER sees own; MANAGER sees workspace entries; cross-user manager access audited).*
```sql
CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_accounts(user_id) ON DELETE RESTRICT,
    application_id UUID NULL,
    title VARCHAR(255) NULL,
    content TEXT NOT NULL,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    legacy_id INTEGER NULL,
    CONSTRAINT fk_journal_application FOREIGN KEY (application_id, workspace_id)
        REFERENCES applications(id, workspace_id) ON DELETE SET NULL
);
CREATE INDEX idx_journal_entries_ws_user ON journal_entries(workspace_id, user_id);
```

#### 20. `goals`
Application and networking activity pacing targets.
```sql
CREATE TABLE goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_accounts(user_id) ON DELETE RESTRICT,
    period_type VARCHAR(16) NOT NULL DEFAULT 'WEEKLY', -- DAILY | WEEKLY | MONTHLY
    target_applications INTEGER NOT NULL DEFAULT 15,
    target_outreach INTEGER NOT NULL DEFAULT 5,
    effective_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    legacy_id INTEGER NULL,
    CONSTRAINT chk_goals_period CHECK (period_type IN ('DAILY', 'WEEKLY', 'MONTHLY'))
);
```

---

### 3.6 Documents, Workflow & Integration Domain

#### 21. `resumes`
Catalog of candidate resume entities and tailored revisions.
```sql
CREATE TABLE resumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_accounts(user_id) ON DELETE RESTRICT,
    name VARCHAR(128) NOT NULL,
    version_label VARCHAR(64) NOT NULL DEFAULT 'v1',
    file_storage_path TEXT NULL, -- Pointer to Supabase Storage
    content_text TEXT NULL, -- Extracted text for search & diffing
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    legacy_id INTEGER NULL,
    CONSTRAINT uq_resumes_id_workspace UNIQUE (id, workspace_id)
);
```

#### 22. `application_documents`
Document attachments linked to specific job applications.
```sql
CREATE TABLE application_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    document_type VARCHAR(32) NOT NULL DEFAULT 'RESUME', -- RESUME | COVER_LETTER | TRANSCRIPT | PORTFOLIO
    resume_id UUID NULL REFERENCES resumes(id) ON DELETE SET NULL,
    file_storage_path TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_app_docs_app FOREIGN KEY (application_id, workspace_id)
        REFERENCES applications(id, workspace_id) ON DELETE CASCADE
);
```

#### 23. `workflow_definitions`
Canonical workflow stages, outcomes, and transitions per workspace (or system default).
*Replaces phantom `workflow_stages` and `workflow_outcomes` tables with one unified, structured configuration.*
```sql
CREATE TABLE workflow_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NULL REFERENCES workspaces(id) ON DELETE CASCADE, -- NULL = System default preset
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    stages JSONB NOT NULL, -- Array of ordered stage objects [{ id, label, category }]
    outcomes JSONB NOT NULL, -- Array of outcome objects [{ id, label, terminal_state }]
    closure_reasons JSONB NOT NULL, -- Array of closure reason objects [{ id, label, for_outcome }]
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_workflow_workspace UNIQUE (workspace_id)
);
```

#### 24. `extension_tokens`
Scoped, expiring, hashed personal access tokens for the browser extension (ADR-040).
```sql
CREATE TABLE extension_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_accounts(user_id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL UNIQUE, -- SHA-256 hash of high-entropy token
    token_hint VARCHAR(8) NOT NULL, -- Last 4-8 chars for user identification
    name VARCHAR(64) NOT NULL DEFAULT 'Chrome Extension',
    scopes JSONB NOT NULL DEFAULT '["capture", "read_workflow"]',
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ NULL,
    revoked_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    legacy_id INTEGER NULL
);
CREATE INDEX idx_ext_tokens_hash ON extension_tokens(token_hash) WHERE revoked_at IS NULL;
```

#### 25. `audit_events`
Immutable security and manager audit trail tracking privileged operations (ADR-010, CR-008).
```sql
CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES user_accounts(user_id) ON DELETE RESTRICT,
    target_user_id UUID NULL REFERENCES user_accounts(user_id) ON DELETE SET NULL,
    target_entity_type VARCHAR(32) NOT NULL, -- APPLICATION | MEMBER | ROLE | EXPORT | TOKEN | JOURNAL
    target_entity_id UUID NULL,
    action VARCHAR(64) NOT NULL, -- MEMBER_REMOVED | ROLE_CHANGED | HARD_DELETE | DATA_EXPORT | JOURNAL_ACCESSED
    metadata JSONB NOT NULL DEFAULT '{}',
    ip_address INET NULL,
    user_agent TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    legacy_id INTEGER NULL
);
CREATE INDEX idx_audit_events_ws_time ON audit_events(workspace_id, created_at DESC);
```

---

### 3.7 Migration Tracking Domain (2 Persistent Tables)

#### 26. `migration_batches`
Batch execution registry and checkpointing for Neon-to-Supabase migration runs.
```sql
CREATE TABLE migration_batches (
    batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_label VARCHAR(64) NOT NULL,
    source_database VARCHAR(64) NOT NULL DEFAULT 'Neon/Postgres',
    target_workspace_id UUID NOT NULL REFERENCES workspaces(id),
    status VARCHAR(16) NOT NULL DEFAULT 'RUNNING', -- RUNNING | COMPLETED | FAILED
    total_records_migrated INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ NULL,
    log_messages JSONB NOT NULL DEFAULT '[]'
);
```

#### 27. `migration_id_mappings`
Centralized cross-reference registry mapping legacy integer IDs to modern target UUIDs.
```sql
CREATE TABLE migration_id_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    migration_run_id UUID NOT NULL REFERENCES migration_batches(batch_id) ON DELETE CASCADE,
    source_table VARCHAR(64) NOT NULL,
    legacy_id INTEGER NOT NULL,
    target_table VARCHAR(64) NOT NULL,
    target_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_migration_source UNIQUE (source_table, legacy_id)
);
CREATE INDEX idx_migration_lookup ON migration_id_mappings(target_table, target_id);
```
