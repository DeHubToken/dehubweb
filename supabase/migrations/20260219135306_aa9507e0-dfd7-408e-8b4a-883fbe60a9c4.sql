
CREATE TABLE IF NOT EXISTS public.live_stream_sessions (
    token_id TEXT NOT NULL PRIMARY KEY,
    stream_id TEXT,
    address TEXT NOT NULL,
    started_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_live_stream_sessions_started_at
ON public.live_stream_sessions (started_at);

ALTER TABLE public.live_stream_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read"
ON public.live_stream_sessions FOR SELECT USING (true);
