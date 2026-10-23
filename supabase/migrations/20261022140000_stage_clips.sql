-- Stage clips: vertical shorts cut from finished public Stages by the
-- stage-clips edge function and rendered on the dub worker's host, then queued
-- for the brand accounts as growth_autopost_queue items of kind 'stage_clip'.
--
-- Depends on 20261022120000_growth_autopost.sql.

CREATE TABLE IF NOT EXISTS public.stage_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES public.audio_spaces(id) ON DELETE CASCADE,
  -- Position within the stage; at most three clips per stage.
  idx smallint NOT NULL CHECK (idx BETWEEN 0 AND 2),
  start_seconds numeric NOT NULL CHECK (start_seconds >= 0),
  end_seconds numeric NOT NULL,
  hook text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  -- The current render attempt; a callback for any other job is ignored.
  job_id uuid,
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  video_url text,
  duration_seconds numeric,
  error text,
  -- When the autopost queue item was made; null while it waits for one.
  queued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stage_id, idx),
  CHECK (end_seconds - start_seconds BETWEEN 10 AND 75)
);
CREATE INDEX IF NOT EXISTS stage_clips_status ON public.stage_clips (status, last_attempt_at);

-- Service role only, like the queue it feeds: a clip is not public until an
-- admin approves the post that carries it.
ALTER TABLE public.stage_clips ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stage_clips FROM anon, authenticated;
GRANT ALL ON public.stage_clips TO service_role;

-- The rendered MP4s. Public like the stage recordings they are cut from, so
-- the publishing platforms can fetch them by URL. The worker writes through a
-- signed upload URL and never holds a key.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('stage-clips', 'stage-clips', true, 104857600, ARRAY['video/mp4'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read stage clips" ON storage.objects;
CREATE POLICY "Public read stage clips" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'stage-clips');

-- The queue learns the new kind.
ALTER TABLE public.growth_autopost_queue DROP CONSTRAINT IF EXISTS growth_autopost_queue_kind_check;
ALTER TABLE public.growth_autopost_queue ADD CONSTRAINT growth_autopost_queue_kind_check
  CHECK (kind IN ('creator_of_day', 'growth_pulse', 'live_now', 'leaderboard', 'dhb_update', 'shorts_of_week', 'stage_clip'));

-- On for the short-video platforms, three a day; admins change it in the panel.
UPDATE public.growth_autopost_settings SET
  enabled_kinds = CASE WHEN 'stage_clip' = ANY (enabled_kinds) THEN enabled_kinds ELSE array_append(enabled_kinds, 'stage_clip') END,
  platforms = CASE WHEN platforms ? 'stage_clip' THEN platforms ELSE platforms || '{"stage_clip": ["tiktok", "instagram", "youtube"]}'::jsonb END,
  daily_caps = CASE WHEN daily_caps ? 'stage_clip' THEN daily_caps ELSE daily_caps || '{"stage_clip": 3}'::jsonb END
WHERE id;
