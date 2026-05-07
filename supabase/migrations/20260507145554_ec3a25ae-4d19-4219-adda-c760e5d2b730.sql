
ALTER TABLE public.stage_transcripts
  ADD COLUMN IF NOT EXISTS speaker_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS speaker_timeline jsonb NOT NULL DEFAULT '[]'::jsonb;
