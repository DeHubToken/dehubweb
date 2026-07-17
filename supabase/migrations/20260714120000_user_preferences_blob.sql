-- Per-user appearance & preference sync.
-- ---------------------------------------------------------------------------
-- Extends `user_display_preferences` (already wallet-scoped via RLS, see
-- 20260709045805) with a JSON blob holding every client preference: theme,
-- dim lights, dim strength, theme hues, brand colours, autoplay, animations,
-- feed layout, language, etc.
--
-- Before this, those lived in GLOBAL localStorage keys not tied to any account,
-- so settings leaked between accounts on the same device and never followed a
-- user to another device. Storing them here (keyed by wallet) makes a user's
-- settings follow their account and reset cleanly when a different account
-- signs in.
--
-- Partial upserts are safe: the app upserts `{wallet_address, preferences}`
-- while the existing Shorts feature upserts `{wallet_address, shorts_enabled}`.
-- Each `INSERT ... ON CONFLICT DO UPDATE` only touches the columns it provides,
-- and both remaining columns have defaults, so neither clobbers the other.

ALTER TABLE public.user_display_preferences
  ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;
