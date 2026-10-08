ALTER TABLE public.video_dub_worker ADD COLUMN IF NOT EXISTS worker_url text;
ALTER TABLE public.video_dub_worker ADD CONSTRAINT video_dub_worker_https CHECK (worker_url IS NULL OR worker_url LIKE 'https://%');
REVOKE ALL ON public.video_dub_worker FROM anon, authenticated;
GRANT ALL ON public.video_dub_worker TO service_role;
