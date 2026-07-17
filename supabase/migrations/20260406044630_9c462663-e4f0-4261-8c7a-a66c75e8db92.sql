
ALTER TABLE public.audio_spaces
ADD COLUMN total_listens integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_stage_listens(p_space_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.audio_spaces
  SET total_listens = total_listens + 1
  WHERE id = p_space_id;
END;
$$;
