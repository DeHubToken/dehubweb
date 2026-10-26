-- Live clips: short vertical cuts of a DeHub live video stream, posted as
-- Shorts.
--
-- Two ways in, one table:
--   viewer     a viewer pressed Clip on a live stream or its replay
--   highlight  the live-clips function saw a chat or gift spike and cut the
--              moment for the streamer to approve in Live Studio
--
-- The live-clips edge function owns every write (service role). The worker on
-- the dub host grabs the live HLS window and renders the 1080x1920 MP4 through
-- signed upload URLs; it holds no database key. The client posts the rendered
-- file as a Short through the normal mint call, then reports the post back.
--
-- Status:
--   capturing  the worker is pulling the last stretch of the live stream
--   draft      a source exists; the clipper (or streamer) can trim and title it
--   rendering  the worker is cutting the vertical MP4
--   ready      rendered, waiting for the client to post it
--   posted     on the feed; post_token_id is the Short
--   dismissed  a highlight the streamer passed on
--   failed     see `error`

CREATE TABLE IF NOT EXISTS public.live_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The /clip/<n> share form.
  short_id bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  kind text NOT NULL CHECK (kind IN ('viewer', 'highlight')),
  status text NOT NULL DEFAULT 'capturing'
    CHECK (status IN ('capturing', 'draft', 'rendering', 'ready', 'posted', 'dismissed', 'failed')),

  -- The live post the clip comes from, and who streamed it.
  stream_token_id bigint NOT NULL,
  stream_id text,
  stream_title text NOT NULL DEFAULT '',
  streamer_address text NOT NULL,
  streamer_username text,
  -- Who pressed Clip; null for a highlight.
  clipper_address text,
  clipper_username text,

  -- Where the frames come from. `live` is the window the worker grabbed into
  -- this bucket; `replay` is the stream's own recording. The editor may pick
  -- any stretch inside [window_start, window_end] of source_url.
  source_kind text NOT NULL CHECK (source_kind IN ('live', 'replay')),
  source_url text,
  window_start numeric NOT NULL DEFAULT 0 CHECK (window_start >= 0),
  window_end numeric NOT NULL DEFAULT 0,
  -- Seconds into the broadcast of the moment itself, for display and dedupe.
  broadcast_offset numeric,

  start_seconds numeric,
  end_seconds numeric,
  title text NOT NULL DEFAULT '',
  -- Highlights only: how far the moment stood out, and why.
  score numeric,
  reason text,

  job_id uuid,
  attempts integer NOT NULL DEFAULT 0,
  error text,

  video_url text,
  poster_url text,
  card_url text,
  duration_seconds numeric,
  post_token_id bigint,
  posted_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (window_end >= window_start),
  CHECK (start_seconds IS NULL OR end_seconds IS NULL OR end_seconds - start_seconds BETWEEN 3 AND 75)
);

CREATE INDEX IF NOT EXISTS live_clips_stream ON public.live_clips (stream_token_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS live_clips_clipper ON public.live_clips (clipper_address, created_at DESC);
-- One highlight per half-minute of a broadcast, so a re-run of the detector
-- (every minute while the streamer has Studio open) cannot cut the same moment twice.
CREATE UNIQUE INDEX IF NOT EXISTS live_clips_highlight_moment
  ON public.live_clips (stream_token_id, (floor(broadcast_offset / 30)))
  WHERE kind = 'highlight';

ALTER TABLE public.live_clips ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.live_clips FROM anon, authenticated;
GRANT ALL ON public.live_clips TO service_role;

-- A posted clip is public: its page and share card read it with the anon key.
-- Drafts, highlights the streamer has not approved and failures stay private.
GRANT SELECT (
  id, short_id, kind, status, stream_token_id, stream_title, streamer_address, streamer_username,
  clipper_address, clipper_username, title, video_url, poster_url, card_url, duration_seconds,
  post_token_id, posted_at, created_at
) ON public.live_clips TO anon, authenticated;
DROP POLICY IF EXISTS "Posted live clips are public" ON public.live_clips;
CREATE POLICY "Posted live clips are public" ON public.live_clips
  FOR SELECT TO anon, authenticated USING (status = 'posted');

-- Grabbed sources, rendered clips, posters and share cards. Public like the
-- recordings they are cut from; written only through signed upload URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('live-clips', 'live-clips', true, 209715200, ARRAY['video/mp4', 'image/jpeg'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read live clips" ON storage.objects;
CREATE POLICY "Public read live clips" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'live-clips');
