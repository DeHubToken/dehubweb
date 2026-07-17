ALTER TABLE public.video_transcripts
  ADD COLUMN IF NOT EXISTS vtt_original text,
  ADD COLUMN IF NOT EXISTS source_lang text;