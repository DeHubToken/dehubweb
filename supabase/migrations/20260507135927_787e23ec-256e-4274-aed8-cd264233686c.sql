-- Stage transcripts table for ended audio_spaces
CREATE TABLE IF NOT EXISTS public.stage_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending', -- pending | processing | ready | failed
  source_language text,
  full_text text,
  segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stage_transcripts_stage_id_idx ON public.stage_transcripts(stage_id);

ALTER TABLE public.stage_transcripts ENABLE ROW LEVEL SECURITY;

-- Anyone can read transcripts (stages are public)
CREATE POLICY "Anyone can view stage transcripts"
ON public.stage_transcripts FOR SELECT
USING (true);

-- Hosts can request transcripts for their own stages
CREATE POLICY "Hosts can insert their own stage transcripts"
ON public.stage_transcripts FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.audio_spaces s
    WHERE s.id = stage_id
      AND lower(s.host_wallet_address) = get_request_wallet_address()
  )
);

CREATE POLICY "Hosts can update their own stage transcripts"
ON public.stage_transcripts FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.audio_spaces s
    WHERE s.id = stage_id
      AND lower(s.host_wallet_address) = get_request_wallet_address()
  )
);

CREATE POLICY "Hosts can delete their own stage transcripts"
ON public.stage_transcripts FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.audio_spaces s
    WHERE s.id = stage_id
      AND lower(s.host_wallet_address) = get_request_wallet_address()
  )
);

-- Updated-at trigger
CREATE TRIGGER stage_transcripts_updated_at
BEFORE UPDATE ON public.stage_transcripts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();