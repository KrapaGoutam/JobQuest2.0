# JobQuest 2.0 · Gate 02B Form Specification

| | |
|---|---|
| **Status** | **PROPOSED** — Awaiting user review and approval |
| **Document Purpose** | Comprehensive specification of form components, validation rules, field metadata, error states, and dirty-tracking standards |
| **Accessibility Compliance** | WCAG 2.2 AA (SC 1.3.1 Info and Relationships, SC 3.3.1 Error Identification, SC 3.3.2 Labels or Instructions, SC 3.3.3 Error Suggestion, SC 4.1.2 Name, Role, Value) |

---

## 1. Global Form Standards & Patterns

### 1.1 Labeling & Instructions
- **Persistent Visible Labels:** Never use placeholder text as a replacement for visible labels. Every form control must have a permanent `<label>` associated via `for`/`id` attributes.
- **Required Fields:**
  - Marked with a visual asterisk: `<span class="req" aria-hidden="true">*</span>`.
  - Announced to assistive technology via `aria-required="true"` on the input element.
  - Section headers summarize required fields (e.g. *"Job: 2 required"*).
- **Optional Fields:**
  - Explicitly marked with subtle text: `<span class="opt">optional</span>` to eliminate ambiguity for users with cognitive or anxiety-related challenges.
- **Help Text:**
  - Contextual help text appears directly below the input field in 12px muted text.
  - Linked to the input via `aria-describedby="[input-id]-help"`.

### 1.2 Validation, Error Handling & Dirty State
- **Inline Validation:** Triggered `onBlur` for visited fields and immediately `onSubmit`. If an input fails validation:
  - Input border changes to `--danger` (Red).
  - An inline error container appears immediately below the input: `<div class="ferr" id="[input-id]-error" role="alert"><i class="icon-circle-alert"></i>[Error Message]</div>`.
  - The input receives `aria-invalid="true"` and `aria-describedby` points to both the help text and error container IDs.
- **Server Errors:**
  - Displayed in an alert banner at the top of the form or modal: `<div class="banner danger" role="alert"><i class="icon-circle-alert danger-t"></i><span>[Error Message]</span></div>`.
  - Focus is automatically programmatically shifted to the server error banner upon receipt.
- **Dirty State & Unsaved Changes:**
  - Forms track initial values. When a field value diverges from initial state, a bottom or footer indicator displays: *"Draft saved locally"* or *"Unsaved changes"*.
  - Navigating away from a dirty form triggers an accessible modal confirmation: *"Discard unsaved changes? You have unsaved changes in this form that will be lost."* with `Keep editing` (default focus) and `Discard` buttons.

---

## 2. Authentication & Account Recovery Forms

### 2.1 Sign In Form (`01-auth.html` A1–A3, A11)

| Field Label | Input Type | Required? | Validation Rules | Error Messages | Help Text |
|---|---|---|---|---|---|
| **Username** | Text (`input`) | Yes | 3–32 chars; letters, numbers, dot, dash, underscore | *"Username is required"* | *"Your unique JobQuest username"* |
| **Password** | Password (`input`) | Yes | Minimum 1 character entered | *"Password is required"* | Includes toggle button for Show/Hide password |
| **Keep me signed in** | Checkbox | No | Boolean | — | Extends session token refresh lifetime on this device |

- **Server-Side Errors (A2, A3):**
  - Invalid credentials: *"Username or password is incorrect."* (Prevents user enumeration).
  - Rate limiting / Lockout: *"Too many attempts. Try again in 5 minutes, or use a recovery code."*

### 2.2 Registration Form (`01-auth.html` A4, A12)

| Field Label | Input Type | Required? | Validation Rules | Error Messages | Help Text |
|---|---|---|---|---|---|
| **Username** | Text | Yes | 3–32 chars; regex `^[a-zA-Z0-9._-]+$`; unique check | *"3–32 characters: letters, numbers, dot, dash, underscore"* / *"Username is already taken"* | *"This is how you sign in to JobQuest."* Surfaces real-time "Available" checkmark |
| **Password** | Password | Yes | Minimum 12 chars; not in top 10k common passwords | *"Password must be at least 12 characters"* / *"Please choose a less common password"* | Checklist: *"At least 12 characters"*, *"Not a common password"*, *"Passwords match"* |
| **Confirm password** | Password | Yes | Must match Password exactly | *"Passwords do not match"* | Re-enter password for verification |
| **Display name** | Text | No | Max 64 chars | — | *"What people call you in shared workspaces"* |
| **Email** | Email | No | Valid email format if provided | *"Please enter a valid email address"* | *"Optional. Used only for account recovery. Nothing is shared."* |
| **Phone** | Tel | No | E.164 phone format if provided | *"Please enter a valid phone number"* | *"Optional. We verify phone before using it for recovery."* |

### 2.3 Account Recovery Form (`01-auth.html` A8–A9)

| Field Label | Input Type | Required? | Validation Rules | Error Messages | Help Text |
|---|---|---|---|---|---|
| **Username** | Text | Yes | Non-empty string | *"Username is required"* | *"Enter your account username"* |
| **Recovery code** | Text (mono) | Yes | Formatted `XXXX-XXXX-XXXX` (12 alphanumeric) | *"Invalid or already used recovery code"* | *"Enter one of your 10 single-use recovery codes"* |
| **New password** | Password | Yes | Minimum 12 characters; secure | *"Password must be at least 12 characters"* | *"Establish your new account password"* |
| **Confirm new password**| Password | Yes | Must match New Password | *"Passwords do not match"* | Confirm new password |

### 2.4 Legacy Account Claim Form (`01-auth.html` A10)

| Field Label | Input Type | Required? | Validation Rules | Error Messages | Help Text |
|---|---|---|---|---|---|
| **Claim code** | Text (mono) | Yes | Valid 16-character operator code | *"Invalid or expired claim code"* | *"Enter the claim code provided by your administrator"* |
| **New username** | Text | Yes | 3–32 characters; unique | *"Username is already taken"* | *"Choose your permanent JobQuest 2.0 username"* |
| **New password** | Password | Yes | Minimum 12 characters | *"Password must be at least 12 characters"* | Set account password |

---

## 3. Application Domain Forms

### 3.1 New Application Form (`02-application-create-edit.html` C1, C2, TB3)

#### Section 1: Job Posting Details
| Field Label | Input Type | Required? | Validation Rules | Help Text / Behavior |
|---|---|---|---|---|
| **Company** | Text / Combobox | **Yes** | 1–128 characters | Prompts existing workspace companies with badge *"Existing company"*. Triggers duplicate check. |
| **Role** | Text | **Yes** | 1–128 characters | Job title. Triggers duplicate check. |
| **Job URL** | URL | No | Must be valid `http://` or `https://` protocol | Rejects `javascript:`, `file:`, or malformed URLs (FR-013). Triggers strong duplicate check. |
| **Job / Requisition ID** | Text | No | Max 64 characters | Unique employer job code. Triggers strong duplicate check. |
| **Location** | Text | No | Max 128 characters | City, State, or Country. |
| **Work arrangement** | Segmented Control | No | One of: `Remote`, `Hybrid`, `Onsite` | Defaults to unselected. |
| **Source** | Select Dropdown | No | `LinkedIn`, `Company site`, `Referral`, `Indeed`, `Recruiter`, `Other` | Channel where application was discovered. |
| **Employment type** | Select Dropdown | No | `Full-time`, `Contract`, `Part-time`, `Internship` | Defaults to `Full-time`. |
| **Salary min / max** | Number + Currency | No | Positive numbers; Min ≤ Max | Min, Max, Currency (`USD`, `EUR`, `GBP`, `CAD`), Period (`yr`, `hr`). |
| **Job description** | Textarea / Drawer | No | Text / Markdown (max 30,000 chars) | Preserved in immutable `job_posting_snapshots`. |

#### Section 2: Application State
| Field Label | Input Type | Required? | Validation Rules | Help Text / Behavior |
|---|---|---|---|---|
| **Stage** | Select Dropdown | **Yes** | One of the 8 canonical stages | Defaults to `Applied` (or `Saved` if capturing bookmark). |
| **Date applied** | Date Picker | Required if stage ≥ `Applied` | Valid ISO date; not in future | Defaults to Today. Required once submitted. |
| **Resume version** | Select Dropdown | No | Must link to active Resume | Links specific tailored resume version for analytics. |
| **Cover letter** | Select Dropdown | No | Document entity link | Links cover letter file or text. |

#### Section 3: Tracking & Follow-up
| Field Label | Input Type | Required? | Validation Rules | Help Text / Behavior |
|---|---|---|---|---|
| **Priority** | Segmented Control | No | `Low`, `Medium`, `High` | Visualized with priority bars. Defaults to `Medium`. |
| **Next action** | Text | No | Max 255 characters | Immediate next action required. |
| **Next action date** | Date Picker | No | Valid date | Quick chips: `Tomorrow`, `In 1 week`, `In 2 weeks`. |
| **Follow-up reminder** | Toggle + Date | No | Valid date | Default suggested date based on user settings (e.g. +5 business days). |

#### Section 4: Manager Context (Manager Workspace Only, C2)
| Field Label | Input Type | Required? | Validation Rules | Help Text / Behavior |
|---|---|---|---|---|
| **Owner** | Combobox | **Yes** | Valid active workspace member | Selects which member owns the application. Logged in audit history. |

### 3.2 Quick Add Application Form (`02-application-create-edit.html` C3)

| Field Label | Input Type | Required? | Validation Rules | Help Text / Behavior |
|---|---|---|---|---|
| **Company** | Text | **Yes** | 1–128 characters | Triggers instant duplicate detection. |
| **Role** | Text | **Yes** | 1–128 characters | Job title. |
| **Stage** | Select Dropdown | **Yes** | Canonical stage | Defaults to `Applied`. |
| **Job URL** | URL | No | HTTP/HTTPS | Captures posting URL. |

### 3.3 Close Application Form (`02-application-create-edit.html` C9, ADR-028, OQ-023)

| Field Label | Input Type | Required? | Validation Rules | Help Text / Behavior |
|---|---|---|---|---|
| **Terminal outcome** | Select / Radio Pills | **Yes** | `Accepted`, `Rejected`, `Withdrawn`, `Ghosted`, `Position Closed` | Sets the application's terminal outcome status. Current pipeline stage remains frozen at its last reached stage. |
| **Closure reason** | Select Dropdown | Conditional (**Yes** when outcome is `Withdrawn`) | `OFFER_DECLINED`, `GENERAL_WITHDRAWAL`, `COMPENSATION_MISMATCH`, `LOCATION_UNSUITABLE`, `OTHER` | Structured closure category. When `OFFER_DECLINED` is selected, UI displays `"Offer declined"`. Enables analytics differentiation without proliferating top-level statuses. |
| **Closure date** | Date Picker | **Yes** | Valid date; not in future | Defaults to Today. Marks the date consideration officially ended. |
| **Closure notes / reason** | Textarea | No | Max 2,000 characters | Optional context, feedback from employer, or negotiation details. |
| **Next actions & reminders** | Radio Group | **Yes** | `Clear all pending next actions` (default) or `Keep existing tasks & reminders` | Safeguard ensuring stale tasks do not clutter dashboard queues after closing. |

---


## 4. Contacts & Networking Forms

### 4.1 Contact Form (`03-contacts.html` N5)

| Field Label | Input Type | Required? | Validation Rules | Help Text / Behavior |
|---|---|---|---|---|
| **Full name** | Text | **Yes** | 1–128 characters | Contact's complete name. |
| **Company** | Text / Combobox | No | Max 128 characters | Links to company entity. |
| **Job title** | Text | No | Max 128 characters | Contact's professional role. |
| **Relationship type** | Select Dropdown | **Yes** | `Recruiter`, `Hiring manager`, `Referral`, `Interviewer`, `Contact` | Classifies networking purpose. |
| **Email** | Email | No | Valid email format | Primary outreach email address. |
| **Phone** | Tel | No | Valid phone string | Direct phone number. |
| **LinkedIn URL** | URL | No | HTTP/HTTPS; `linkedin.com/in/...` | Profile link for one-tap opening. |
| **Linked application** | Combobox | No | Active workspace application | Associating links communication timeline. |
| **Follow-up date** | Date Picker | No | Valid date | Sets next outreach reminder. |
| **Notes** | Textarea | No | Max 5,000 characters | Relationship context, referral notes. |

---

## 5. Tasks, Follow-ups & Reminders Forms

### 5.1 New Task Form (`04-tasks.html` T3, T4, T6)

| Field Label | Input Type | Required? | Validation Rules | Help Text / Behavior |
|---|---|---|---|---|
| **Task type** | Segmented Control | **Yes** | `Task`, `Follow-up`, `Reminder` | Determines entity taxonomy and icon. |
| **Title** | Text | **Yes** | 1–255 characters | Task description or follow-up note. |
| **Due date** | Date Picker | No (Yes for Reminders) | Valid date | Quick chips: `Today`, `Tomorrow`, `Next week`, `No date`. |
| **Linked entity** | Combobox | No | Application or Contact | Connects task to relevant entity timeline. |
| **Recurrence** | Select Dropdown | No | `Does not repeat`, `Daily`, `Weekdays`, `Weekly`, `Monthly` | If selected, opens recurrence interval options (T3). |
| **Category** | Select Dropdown | No | User-configured reminder tags | Groups tasks in filters. |

---

## 6. Interviews Forms

### 6.1 Schedule Interview Form (`05-interviews.html` I3)

| Field Label | Input Type | Required? | Validation Rules | Help Text / Behavior |
|---|---|---|---|---|
| **Application** | Combobox | **Yes** | Valid active application | Displays company, role, and current stage. |
| **Interview type** | Select Dropdown | **Yes** | `Recruiter screen`, `Technical`, `Hiring manager`, `Panel`, `Offer call`, `Other` | Classifies interview milestone. |
| **Round** | Number | No | Positive integer | Round sequence (e.g. `1`, `2`, `3`). |
| **Date & Time** | Date + Time Picker | **Yes** | Valid datetime | Localized to user's profile timezone. |
| **Duration** | Select Dropdown | **Yes** | `15 min`, `30 min`, `45 min`, `60 min`, `90 min`, `Custom` | Meeting length. |
| **Format** | Segmented Control | **Yes** | `Video`, `Phone`, `On-site` | Communication medium. |
| **Meeting link / Location**| Text / URL | No | Max 255 chars / URL | Video link (Zoom, Meet) or physical address. |
| **Participants** | Multi-Combobox | No | Contact names or free text | Auto-suggests linked contacts or creates draft contacts. |
| **Preparation notes** | Textarea | No | Max 5,000 characters | Salary goals, questions to ask, strategic focus. |
| **Questions expected** | Textarea | No | Max 5,000 characters | Anticipated technical/behavioral challenges. |
| **Application stage** | Segmented Control | **Yes** | Options: `Keep at [Current Stage]` or `Move to [Interview Stage]` | **Does not mutate stage automatically.** User explicitly chooses. |
| **Remind me** | Checkbox | No | Boolean | Alerts 1 hour before scheduled time. |

### 6.2 Record Interview Outcome Form (`05-interviews.html` I4)

| Field Label | Input Type | Required? | Validation Rules | Help Text / Behavior |
|---|---|---|---|---|
| **Result** | Segmented Control | **Yes** | `Completed · waiting`, `Advanced`, `Rejected`, `Cancelled / moved` | Outcome milestone. |
| **Participants** | Tag List | No | Contact links | Confirm interviewers present. |
| **Next step mentioned**| Text | No | Max 255 characters | E.g. *"Decision by Friday"* or *"Take-home next week"*. |
| **Questions asked** | Textarea | No | Max 5,000 characters | Real questions asked by employer for future review. |
| **Notes / Impressions** | Textarea | No | Max 5,000 characters | Self-critique, red flags, compensation updates. |
| **Thank-you note** | Segmented Control | **Yes** | `Not needed`, `To send`, `Sent` | Outreach tracking. |
| **Next action** | Text + Date | No | Max 255 chars + date | Replaces application next action (e.g. *"Send thank-you"*). |

---

## 7. Habits & Journal Forms

### 7.1 Habit Create / Edit Form (`06-habits-journal.html` H2)

| Field Label | Input Type | Required? | Validation Rules | Help Text / Behavior |
|---|---|---|---|---|
| **Habit name** | Text | **Yes** | 1–64 characters | E.g. *"Send 3 recruiter outreaches"*. |
| **Cadence** | Segmented Control | **Yes** | `Daily`, `Weekdays only`, `Weekly` | Days when habit is active. |
| **Measurement type** | Segmented Control | **Yes** | `Yes / No (Boolean)`, `Counted target` | Type of completion metric. |
| **Target count** | Number | Required if Counted | Integer ≥ 1 | E.g. `3` outreaches or `5` job applications. |
| **Unit label** | Text | No | Max 20 characters | E.g. `applications`, `connections`, `minutes`. |

### 7.2 Journal Entry Form (`06-habits-journal.html` J2)

| Field Label | Input Type | Required? | Validation Rules | Help Text / Behavior |
|---|---|---|---|---|
| **Title** | Text | No | Max 128 characters | Optional title for reflection. |
| **Entry type** | Select Dropdown | **Yes** | `Reflection`, `Strategy`, `Interview prep`, `Note`, `Post-mortem` | Categorizes journal item. |
| **Linked application** | Combobox | No | Active application | Connects journal note to company timeline. |
| **Content** | Textarea | **Yes** | Markdown text (max 20,000 chars) | Reflection or preparation text. |

---

## 8. Workspace & Member Forms

### 8.1 Invite Member Form (`08-workspace.html` W2)

| Field Label | Input Type | Required? | Validation Rules | Help Text / Behavior |
|---|---|---|---|---|
| **Workspace role** | Segmented Control | **Yes** | `User`, `Manager` | Role assigned upon joining. |
| **Usage limit** | Select Dropdown | **Yes** | `Single-use (1 member)`, `Multi-use (up to 10)`, `Multi-use (up to 50)` | Prevents code leaks. |
| **Expiration** | Select Dropdown | **Yes** | `24 hours`, `7 days`, `30 days`, `Never` | Code validity window. |
| **Invite note** | Text | No | Max 64 characters | E.g. *"Cohort 7 Spring Intake"*. |

---

## 9. Extension Token Generation Form (`09-settings.html` S8)

| Field Label | Input Type | Required? | Validation Rules | Help Text / Behavior |
|---|---|---|---|---|
| **Token label / Device**| Text | **Yes** | 1–64 characters | E.g. *"MacBook Chrome"*, *"Work Laptop"*. |
| **Workspace scope** | Select Dropdown | **Yes** | User's active workspaces | Extension captures into this workspace. |
| **Expiration** | Select Dropdown | **Yes** | `30 days`, `90 days`, `1 year` | Token lifetime. |
| **Permissions scope** | Radio / Checklist | **Yes** | `Capture only (Recommended)`, `Full access` | Least-privilege token scoping. |

---

## 10. Import Column Mapping Form (`12-import-export.html` E3)

| JobQuest Target Field | Source Header Match | Required? | Type Validation | Auto-Matched Aliases |
|---|---|---|---|---|
| **Company** | Dropdown | **Yes** | String (1–128) | `Company`, `Employer`, `Organization`, `Company Name` |
| **Role** | Dropdown | **Yes** | String (1–128) | `Role`, `Job Title`, `Title`, `Position` |
| **Stage** | Dropdown | No (Default Applied)| Stage Enum | `Stage`, `Status`, `Pipeline Stage` |
| **Date applied** | Dropdown | No (Default Today) | ISO Date | `Date Applied`, `Applied Date`, `Submission Date`, `Date` |
| **Job URL** | Dropdown | No | HTTP/HTTPS URL | `Job URL`, `URL`, `Link`, `Posting Link` |
| **Requisition ID** | Dropdown | No | String | `Req ID`, `Requisition ID`, `Job ID`, `Job Code` |
| **Salary** | Dropdown | No | Number / String | `Salary`, `Compensation`, `Pay`, `Rate` |
| **Notes** | Dropdown | No | Text | `Notes`, `Comments`, `Description` |
