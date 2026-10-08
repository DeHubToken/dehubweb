-- One shared allowance across web/mobile. Failed reservations remain counted.
CREATE TABLE public.chirp_speech_usage (
  month date PRIMARY KEY,
  characters integer NOT NULL DEFAULT 0 CHECK (characters BETWEEN 0 AND 1000000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chirp_speech_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chirp_speech_usage FROM anon, authenticated;
GRANT ALL ON public.chirp_speech_usage TO service_role;

CREATE FUNCTION public.reserve_chirp_characters(p_characters integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  billing_month date := date_trunc('month', now() AT TIME ZONE 'America/Los_Angeles')::date;
  reserved integer;
BEGIN
  IF p_characters IS NULL OR p_characters < 1 OR p_characters > 5000 THEN RETURN false; END IF;
  INSERT INTO public.chirp_speech_usage (month, characters)
  VALUES (billing_month, p_characters)
  ON CONFLICT (month) DO UPDATE
    SET characters = chirp_speech_usage.characters + EXCLUDED.characters, updated_at = now()
    WHERE chirp_speech_usage.characters + EXCLUDED.characters <= 1000000
  RETURNING characters INTO reserved;
  RETURN reserved IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_chirp_characters(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_chirp_characters(integer) TO service_role;
