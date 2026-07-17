
DROP POLICY IF EXISTS "Hosts can insert their own stage transcripts" ON public.stage_transcripts;
DROP POLICY IF EXISTS "Hosts can update their own stage transcripts" ON public.stage_transcripts;
DROP POLICY IF EXISTS "Hosts can delete their own stage transcripts" ON public.stage_transcripts;

CREATE POLICY "Service role manages stage transcripts"
ON public.stage_transcripts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
