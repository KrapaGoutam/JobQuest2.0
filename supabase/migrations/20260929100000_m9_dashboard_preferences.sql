-- M9 Dashboard Parity
-- Gate 03 retires dashboard_preferences into owner-private profile UI state.

alter table public.profiles
  add column ui_preferences jsonb not null default '{}'::jsonb;

alter table public.profiles
  add constraint chk_profiles_ui_preferences_object
  check (jsonb_typeof(ui_preferences) = 'object');

comment on column public.profiles.ui_preferences is
  'Owner-private presentation preferences. Dashboard layouts are keyed by workspace and dashboard type.';

-- Existing profiles_select_own / profiles_update_own RLS policies and the
-- authenticated SELECT/UPDATE grants continue to protect this new column.
