# Endpoints

Full detail (auth, request/response shapes, tables, source lines): `../API_INVENTORY.md`.
This is the flat path index, grouped by domain, for quick lookup.

## Auth / Session
`GET /api/health`, `GET /api/ready`, `POST /api/auth/register`, `POST /api/auth/login`,
`POST /api/auth/transition-pin`, `POST /api/auth/logout`, `GET /api/auth/me`,
`GET/PATCH /api/settings`

## Applications
`GET/POST /api/applications`, `GET/PATCH/DELETE /api/applications/:id`,
`GET /api/applications/:id/activity`, `PATCH /api/applications/:id/stage`,
`GET /api/applications/:id/detail`, `GET /api/applications/query`,
`GET /api/applications/kanban`, `PATCH /api/applications/:id/board-order`,
`GET/PUT /api/application-view-preferences`, `POST /api/applications/:id/archive`,
`POST /api/applications/:id/restore`, `POST /api/applications/:id/pin`,
`POST /api/applications/:id/next-action`, `POST /api/applications/:id/checklist`,
`PATCH/DELETE /api/applications/:id/checklist/:itemId`,
`PATCH /api/applications/:id/checklist/:itemId/move`,
`GET/POST /api/tags`, `PATCH/DELETE /api/tags/:id`,
`GET/POST /api/saved-views`, `PATCH/DELETE /api/saved-views/:id`

## Activities / Timeline
`GET/POST /api/applications/:id/timeline`,
`GET /api/applications/:id/timeline/json`, `GET /api/applications/:id/timeline/csv`

## Interviews / Rejections / Follow-ups
`GET/POST/PATCH/DELETE /api/interviews(/:id)`,
`GET/POST/PATCH/DELETE /api/rejections(/:id)`,
`GET/POST/PATCH/DELETE /api/follow_ups(/:id)`, `GET /api/follow-ups/suggest`

## Networking
`GET/POST/PATCH/DELETE /api/networking_contacts(/:id)`

## Resumes
`GET/POST /api/resumes`, `PATCH/DELETE /api/resumes/:id`, `GET /api/resumes/analytics`,
`GET /api/resumes/:id/history`, `POST /api/resumes/:id/clone`, `GET /api/resumes/compare`,
`GET /api/exports/applications.xlsx`

## Goals
`GET/POST/PATCH/DELETE /api/daily_goals(/:id)`, `GET/POST/PATCH/DELETE /api/weekly_goals(/:id)`,
`GET/POST /api/goals/settings`, `GET /api/goals/history`, `GET /api/goals/comparison`,
`GET /api/goals/progress-series`

## Dashboard
`GET /api/dashboard`, `GET /api/manager/dashboard`, `GET/PUT/DELETE /api/dashboard/layout`,
`GET/PUT /api/navigation/preferences`, `GET /api/navigation/counts`

## Reminders
`GET/POST /api/reminders`, `PATCH/DELETE /api/reminders/:id`,
`GET/POST /api/reminder-categories`, `PATCH/DELETE /api/reminder-categories/:id`

## Import / Export
`POST /api/import/preview`, `POST /api/import`, `GET /api/import/history`,
`GET /api/import/history/:id/rows`, `GET /api/exports/json`, `GET /api/exports/:type`

## Tasks
`GET/POST /api/tasks`, `PATCH/DELETE /api/tasks/:id`

## Habits
`GET/POST /api/habits`, `GET /api/habits/:id/history`, `PUT /api/habits/:id/progress`,
`PATCH/DELETE /api/habits/:id`

## Notes
`GET/POST /api/notes`, `GET/PATCH/DELETE /api/notes/:id`

## Analytics
`GET /api/analytics/{stage-transitions,aging,stage-duration,source,resume,funnel,activity}`,
`GET /api/calendar`

## Extension
`POST/GET /api/extension/tokens`, `DELETE /api/extension/tokens/:id`,
`GET /api/extension/me`, `GET /api/extension/resumes`,
`GET /api/extension/stages` (alias `/api/extension/workflow-actions`),
`GET /api/extension/duplicate-check`, `POST /api/extension/applications`

## Manager
`GET /api/manager/dashboard`, `GET /api/manager/users`, `PATCH /api/manager/users/:id`,
`GET /api/manager/audit`

## Static
Catch-all: `frontend/dist` static file serving with SPA fallback to `index.html`.

**Total: 80+ distinct endpoint definitions** across these 17 groups (one path,
`PATCH /api/applications/:id/stage`, is defined twice — see `../API_INVENTORY.md`'s
dispatch-order note for which implementation actually wins).
