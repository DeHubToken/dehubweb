-- Brand autopost: posts for dehub's own social accounts, built from live product
-- data by the growth-autopost edge function and published through the same
-- Zernio / Neynar integration multipost uses, from the brand profile.
--
-- Admin-only. Admins have no Supabase identity (their login is an admin JWT
-- from api.dehub.io), so "admin-only" here means what it means for every other
-- admin table: nothing for anon or authenticated, and the edge function, which
-- re-verifies the admin token against GET /api/admin/me, is the only way in.

CREATE TABLE IF NOT EXISTS public.growth_autopost_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('creator_of_day', 'growth_pulse', 'live_now', 'leaderboard', 'dhb_update', 'shorts_of_week')),
  platforms text[] NOT NULL DEFAULT '{}',
  -- Text per platform: { "twitter": "...", "farcaster": "..." }.
  text jsonb NOT NULL DEFAULT '{}',
  -- [{ "url": "https://...", "type": "image" }], the shape Zernio takes.
  media jsonb NOT NULL DEFAULT '[]',
  -- Untagged; UTM parameters are added per platform.
  link text,
  -- What the post is about (post:<tokenId>, week:2026-W43, stage:<id>…). The
  -- same thing is never queued twice for the same kind.
  source_ref text NOT NULL,
  -- publishing is held only while the function is talking to the platforms.
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'publishing', 'posted', 'failed', 'skipped')),
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  results jsonb,
  reviewed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, source_ref)
);
CREATE INDEX IF NOT EXISTS growth_autopost_queue_due ON public.growth_autopost_queue (scheduled_for) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS growth_autopost_queue_recent ON public.growth_autopost_queue (created_at DESC);

ALTER TABLE public.growth_autopost_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.growth_autopost_queue FROM anon, authenticated;
GRANT ALL ON public.growth_autopost_queue TO service_role;

CREATE TABLE IF NOT EXISTS public.growth_autopost_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  -- Off: every generated post waits for an admin. On: it goes straight to approved.
  auto_approve boolean NOT NULL DEFAULT false,
  enabled_kinds text[] NOT NULL DEFAULT ARRAY['creator_of_day', 'growth_pulse', 'live_now', 'leaderboard', 'dhb_update', 'shorts_of_week'],
  platforms jsonb NOT NULL DEFAULT '{
    "creator_of_day": ["twitter", "threads", "facebook", "instagram", "linkedin", "farcaster"],
    "growth_pulse": ["twitter", "threads", "facebook", "linkedin", "farcaster"],
    "live_now": ["twitter", "threads", "farcaster"],
    "leaderboard": ["twitter", "threads", "facebook", "farcaster"],
    "dhb_update": ["twitter", "farcaster"],
    "shorts_of_week": ["twitter", "threads", "facebook", "instagram", "farcaster"]
  }'::jsonb,
  -- Posts generated per kind per UTC day, and posts published per UTC day in all.
  daily_caps jsonb NOT NULL DEFAULT '{
    "creator_of_day": 1, "growth_pulse": 1, "live_now": 3, "leaderboard": 1, "dhb_update": 1, "shorts_of_week": 1
  }'::jsonb,
  daily_total_cap integer NOT NULL DEFAULT 8 CHECK (daily_total_cap BETWEEN 0 AND 100),
  -- A live stream's creator needs this many followers, a stage this many listeners.
  live_min_audience integer NOT NULL DEFAULT 50 CHECK (live_min_audience >= 0),
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.growth_autopost_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.growth_autopost_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.growth_autopost_settings FROM anon, authenticated;
GRANT ALL ON public.growth_autopost_settings TO service_role;

-- Scheduler key, the trenchstar pattern: the cron job reads it from the vault
-- and the function checks it through this RPC, so a public caller cannot make
-- the brand accounts post on its own timing.
SELECT vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text, 'growth_autopost_scheduler_key')
WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'growth_autopost_scheduler_key');

CREATE OR REPLACE FUNCTION public.growth_autopost_scheduler_authorized(p_token text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name = 'growth_autopost_scheduler_key' AND decrypted_secret = p_token) $$;
REVOKE ALL ON FUNCTION public.growth_autopost_scheduler_authorized(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.growth_autopost_scheduler_authorized(text) TO service_role;

DO $schedule$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'growth-autopost-generate') THEN
    PERFORM cron.unschedule('growth-autopost-generate');
  END IF;
  PERFORM cron.schedule('growth-autopost-generate', '7 * * * *', $job$
    SELECT net.http_post(
      url := 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/growth-autopost',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'growth_autopost_scheduler_key' LIMIT 1)),
      body := '{"action":"generate"}'::jsonb,
      timeout_milliseconds := 55000
    );
  $job$);

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'growth-autopost-publish') THEN
    PERFORM cron.unschedule('growth-autopost-publish');
  END IF;
  PERFORM cron.schedule('growth-autopost-publish', '*/10 * * * *', $job$
    SELECT net.http_post(
      url := 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/growth-autopost',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'growth_autopost_scheduler_key' LIMIT 1)),
      body := '{"action":"publish"}'::jsonb,
      timeout_milliseconds := 55000
    );
  $job$);
END $schedule$;
