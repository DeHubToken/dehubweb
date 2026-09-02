-- ============================================================================
-- Auto-dubbed audio for video posts.
-- ============================================================================
-- One row per (transcript, language). The transcript already holds the words
-- and `transcript_translations` the translated words, so the only new work a
-- dub needs is speech: a worker clones the speaker's voice from the original
-- audio, reads the translated lines in it, ducks the original under them and
-- writes one AAC track to the `video-dubs` bucket. The player then swaps that
-- track in over the untouched video.
--
-- The sweeper (`auto-dub`, cron below) fills a small set of languages for
-- every public video under DUB_MAX_SECONDS; a viewer picking any other
-- supported language asks for it on demand and every viewer after reads the
-- row.

CREATE TABLE IF NOT EXISTS public.video_dubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id uuid NOT NULL REFERENCES public.transcripts(id) ON DELETE CASCADE,
  language text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  -- Public URL of the finished track. Null until ready.
  audio_url text,
  provider text,
  -- 'cloned' when the speaker's own voice was used, 'stock' when there was
  -- not enough clean speech to clone from.
  voice text,
  duration_seconds integer,
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  job_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transcript_id, language)
);

CREATE INDEX IF NOT EXISTS idx_video_dubs_status
  ON public.video_dubs (status, last_attempt_at);

DROP TRIGGER IF EXISTS trg_video_dubs_updated_at ON public.video_dubs;
CREATE TRIGGER trg_video_dubs_updated_at
  BEFORE UPDATE ON public.video_dubs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.video_dubs IS
  'Voice-cloned dubbed audio tracks per transcript and language. Written by the auto-dub function; read by the players.';

-- ============================================================================
-- Access
-- ============================================================================
-- A dub is exactly as readable as its transcript: anyone can read the row of
-- a public or members transcript (status included, so a player can say
-- "preparing"), nobody can read a private one, and only the service role
-- writes.

ALTER TABLE public.video_dubs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dubs follow transcript visibility" ON public.video_dubs;
CREATE POLICY "Dubs follow transcript visibility" ON public.video_dubs
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transcripts t
      WHERE t.id = video_dubs.transcript_id AND t.visibility <> 'private'
    )
  );

DROP POLICY IF EXISTS "Service role manages dubs" ON public.video_dubs;
CREATE POLICY "Service role manages dubs" ON public.video_dubs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Players follow a row from pending to ready live rather than polling.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'video_dubs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.video_dubs;
  END IF;
END $do$;

-- ============================================================================
-- Storage
-- ============================================================================
-- Public bucket: the track is the spoken content of a public video, and the
-- player fetches it anonymously like the video itself. The worker writes
-- through a signed upload URL minted by the function, so it never holds a key.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'video-dubs',
  'video-dubs',
  true,
  26214400, -- 25 MB: a 10-minute track at 64 kbps is under 5 MB
  ARRAY['audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/x-m4a']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read video dubs" ON storage.objects;
CREATE POLICY "Public read video dubs" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'video-dubs');

-- ============================================================================
-- The sweeper
-- ============================================================================
-- Same shape as job 19 (auto-transcribe): an anon call every ten minutes, and
-- the function budgets itself. Named tag on the outer block because the cron
-- command is dollar-quoted too.

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-dub-sweep') THEN
    PERFORM cron.schedule(
      'auto-dub-sweep',
      '*/10 * * * *',
      $$
      select net.http_post(
        url := 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/auto-dub',
        headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I"}'::jsonb,
        body := '{}'::jsonb
      );
      $$
    );
  END IF;
END $do$;
