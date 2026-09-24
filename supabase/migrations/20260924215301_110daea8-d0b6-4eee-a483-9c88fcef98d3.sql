-- Free starter generations: a few cheap images per wallet so the first try
-- does not need a DHB transfer. One row per free job; the claim function is
-- the only writer and serialises per wallet so a burst cannot overshoot.
CREATE TABLE IF NOT EXISTS public.ai_free_generations (
  job_id uuid PRIMARY KEY,
  wallet_address text NOT NULL,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_free_generations_wallet_idx ON public.ai_free_generations (wallet_address);
ALTER TABLE public.ai_free_generations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.ai_free_claim(p_wallet text, p_job_id uuid, p_model text, p_limit int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  used int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ai_free:' || lower(p_wallet)));
  SELECT count(*) INTO used FROM public.ai_free_generations WHERE wallet_address = lower(p_wallet);
  IF used >= p_limit THEN
    RETURN false;
  END IF;
  INSERT INTO public.ai_free_generations (job_id, wallet_address, model) VALUES (p_job_id, lower(p_wallet), p_model);
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ai_free_claim(text, uuid, text, int) FROM anon, authenticated, public;