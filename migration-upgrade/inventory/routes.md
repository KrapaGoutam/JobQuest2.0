# Routes (Frontend Screens)

Full detail: `../ROUTE_SCREEN_INVENTORY.md`. This is the flat index of every
`go()` page id (there is no URL-based router — see that document for the 3
deep-link exceptions).

| Page id | Screen | Nav group |
|---|---|---|
| (none — pre-auth) | Auth (login/register/PIN transition) | n/a |
| `dashboard` | Dashboard (User) | Primary |
| `manager` | Dashboard (Manager) | Manager |
| `applications` | Applications (Table + Kanban) | Primary |
| `add` | Add / Edit Application | Primary |
| `quick-add` | Quick Add | (global action, not in sidebar) |
| `detail:<id>` | Application Detail | (special-cased, not in routes map) |
| `bulk` | Bulk Import | Career Assets |
| `imports` | Import History | **ungrouped — CR-004** |
| `interviews` | Interviews | Activity |
| `rejections` | Rejections | Activity |
| `follow_ups` | Follow-Ups | Activity |
| `networking_contacts` | Networking/Contacts | Activity |
| `resumes` | Resumes | Career Assets |
| `tasks` | Tasks | Activity |
| `habits` | Habits | Activity |
| `notes` | Journal & Notes (list + editor) | Activity |
| `reminders` | Reminder Center (+ Categories sub-view) | Activity |
| `calendar` | Calendar | Activity |
| `goals` | Goal Settings | (no nav entry — reached via Settings/Calendar) |
| `goal-history` | Goal History | Insights |
| `aging` | Aging Report | Insights |
| `stage-analytics` | Stage Analytics | Insights |
| `analytics` | Analytics | Insights |
| `exports` | Exports | Insights |
| `settings` | Settings | Settings |
| `profile` | Profile | (no nav entry — reached via Settings) |
| `users` | User Management | Manager |
| `audit` | Audit History | Manager |
