-- Add new columns for summary, chapters, speaker overrides, privacy
ALTER TABLE public.stage_transcripts
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS chapters jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS speaker_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS privacy text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS summary_status text NOT NULL DEFAULT 'pending';

-- Replace the public select policy to gate by privacy
DROP POLICY IF EXISTS "Anyone can view stage transcripts" ON public.stage_transcripts;

CREATE POLICY "View stage transcripts by privacy"
ON public.stage_transcripts
FOR SELECT
USING (
  privacy IN ('public', 'members')
  OR EXISTS (
    SELECT 1 FROM public.audio_spaces s
    WHERE s.id = stage_transcripts.stage_id
      AND lower(s.host_wallet_address) = get_request_wallet_address()
  )
);

-- Allow the host to update privacy / speaker_overrides directly from client
CREATE POLICY "Host can update own stage transcript"
ON public.stage_transcripts
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.audio_spaces s
    WHERE s.id = stage_transcripts.stage_id
      AND lower(s.host_wallet_address) = get_request_wallet_address()
  )
);

-- Translation cache table
CREATE TABLE IF NOT EXISTS public.stage_transcript_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL,
  language text NOT NULL,
  segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  chapters jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'ready',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stage_id, language)
);

CREATE INDEX IF NOT EXISTS stage_transcript_translations_stage_idx
  ON public.stage_transcript_translations(stage_id);

ALTER TABLE public.stage_transcript_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view stage transcript translations"
ON public.stage_transcript_translations
FOR SELECT
USING (true);

CREATE POLICY "Service role manages translations"
ON public.stage_transcript_translations
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TRIGGER stage_transcript_translations_updated_at
BEFORE UPDATE ON public.stage_transcript_translations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.stage_transcripts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stage_transcript_translations;