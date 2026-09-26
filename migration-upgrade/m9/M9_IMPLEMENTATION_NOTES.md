# M9 Implementation Notes — Dashboard Parity

## Scope resolution

Gate 01 names M9 Goals, Analytics & Dashboard. M8 already delivered Goals and Analytics, while M6 delivered the Direction D action queue. M9 therefore implements only the remaining dashboard-parity slice. Journal, Calendar implementation, Import/Export, Extension work, and new analytics formulas remain excluded.

## Preference foundation

The forward-only migration `20260929100000_m9_dashboard_preferences.sql` adds `profiles.ui_preferences jsonb NOT NULL DEFAULT '{}'::jsonb` and requires the root value to be a JSON object. Existing profile RLS remains authoritative: a signed-in actor owns only their profile document, and a manager does not gain another member's presentation preferences.

Dashboard layouts are nested by workspace ID and dashboard type (`user` or `manager`). Writes preserve unrelated preference keys. Normalization drops unknown/duplicate widget IDs, repairs invalid sizes, and appends missing registry entries from safe defaults, so malformed or stale JSON cannot break or silently erase the dashboard.

## Stable registry and hierarchy

`apps/web/src/lib/dashboard.ts` preserves all 30 approved legacy widget IDs and names. Each widget maps to one of three Direction D tiers:

1. Needs your attention.
2. Current pipeline.
3. Trends & context.

The M6 queue remains the first and primary dashboard surface. User and manager layouts have separate defaults while keeping the same registry. Wide chart defaults and medium activity/goal defaults are encoded as data rather than component conditionals.

## Data composition

`DashboardView` starts independent queue, interview, quiet-application, analytics-range, timing, and application reads together with `Promise.all`. Existing M6 and M8 APIs remain the sources of truth; M9 does not duplicate calculations. The manager owner selector is passed to every owner-scoped data request. Authorization remains in RLS/RPC checks, never in React filtering.

The dashboard uses honest zero/empty states and keeps loading/error handling distinct. The measured local first-ready time is 262 ms against a 10,000 ms test budget. The existing production build warning for the 901.41 kB minified entry chunk is documented but non-blocking; bundle/secret policy scans pass.

## Customization and navigation

The accessible customization dialog exposes all 30 entries with visibility, order, width, reset, and save controls. Native keyboard focus/Space and arrow-button activation are covered in Playwright. Persistence is verified across reload and reset.

Existing drill-through destinations are retained. CR-005 is completed by routing Aging Applications to `#/analytics/aging`, which opens Analytics with the Aging tab selected.

## Security and architecture

- Option B custom ES256 authentication is unchanged.
- No service-role material reaches the browser.
- Direct profile CRUD relies on existing owner-private RLS.
- Analytics and operational mutations continue through their established PostgREST/RPC paths.
- No duplicate dashboard-preference table, role model, workspace model, task system, or analytics implementation was introduced.
