CREATE TABLE public.video_transcripts (
  token_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  transcript JSONB,
  duration_seconds INTEGER,
  chunks_total INTEGER DEFAULT 0,
  chunks_done INTEGER DEFAULT 0,
  error TEXT,
  model TEXT DEFAULT 'google/gemini-2.5-flash-lite',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.video_transcripts TO anon;
GRANT SELECT ON public.video_transcripts TO authenticated;
GRANT ALL ON public.video_transcripts TO service_role;

ALTER TABLE public.video_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Transcripts are publicly readable"
ON public.video_transcripts FOR SELECT
USING (true);

CREATE TRIGGER update_video_transcripts_updated_at
BEFORE UPDATE ON public.video_transcripts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();