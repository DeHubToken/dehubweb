DROP POLICY IF EXISTS "Anyone can view live audio spaces" ON public.audio_spaces;

CREATE POLICY "Anyone can view audio spaces"
ON public.audio_spaces
FOR SELECT
TO public
USING (true);