-- Self-hosted Whisper as the first transcription engine.
--
-- `transcription_worker` holds where the worker lives and the secret it calls
-- back with. Service role only, like video_dub_worker: nothing in a browser
-- has any reason to read it. `enabled` is the switch; off, every transcript
-- goes to the paid engines exactly as before.
CREATE TABLE IF NOT EXISTS public.transcription_worker (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  worker_url text CHECK (worker_url IS NULL OR worker_url LIKE 'https://%'),
  secret text,
  runpod_api_key text,
  runpod_endpoint_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.transcription_worker ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.transcription_worker FROM anon, authenticated;
GRANT ALL ON public.transcription_worker TO service_role;
INSERT INTO public.transcription_worker (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- The Whisper job a 'processing' row is waiting for. Only that job's callback
-- may write the transcript; a row that is still carrying one when the sweeper
-- finds it stale goes to the paid engines instead.
ALTER TABLE public.transcripts ADD COLUMN IF NOT EXISTS engine_job_id text;
