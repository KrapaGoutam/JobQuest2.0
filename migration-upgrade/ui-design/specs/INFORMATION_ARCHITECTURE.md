# Information architecture (Direction D)

## Desktop sidebar
- Workspace switcher (active workspace name, role; lists your workspaces with roles; workspace settings when permitted; Create workspace)
- **New application** button
- Dashboard · Applications · Tasks & Follow-ups · Contacts · Calendar
- **Track:** Interviews · Habits · Journal · Resumes
- **Insights:** Analytics (Goal history, Aging, Stage analytics, Exports inside)
- **Workspace** (Manager only): Members · Import & export · Workflow · Audit history
- Settings · user row (theme: System / Light / Dark)

CR-004: Import History now lives under Workspace → Import & export. For users without the Manager role, it lives under Settings → Data.

## Header
Breadcrumb (workspace › page) · Manager badge when applicable · global search (`/`; ⌘K reserved for P2) · notifications.

## Global search results
Results are grouped by entity type, each with a type label: Applications (company, role, location, description, skills, source, employment type, work arrangement, stage, outcome, job ID), Contacts, Notes, Tasks.

## Mobile tab bar
Today · Apps · Tasks · Contacts · More (everything else, plus the workspace switcher and settings).

## Routes (proposed)
- `/` dashboard
- `/applications?view=table|board|calendar|timeline&saved=:id&owner=:userId`
- `/applications/:id` and `/applications/:id/job`, `/applications/:id/notes`
- `/tasks`, `/contacts`, `/calendar`, `/interviews`, `/habits`, `/journal`, `/resumes`
- `/analytics/*`
- `/workspace/members`, `/workspace/imports`, `/workspace/workflow`, `/workspace/audit`
- `/settings/*`

The preview pane is `?preview=:id` on the list route.
