-- =============================================================================
-- AI-10 hotfix: Gemini sends an opaque OAuth `state` of ~1.2k characters, which
-- exceeded varchar(512). Widen the bound to 2048 (apps/api OAUTH_STATE_MAX_LENGTH).
-- Forward-only; increasing a varchar limit is a catalog-only change (no rewrite).
-- =============================================================================
alter table public.oauth_authorization_requests
  alter column state type varchar(2048);
