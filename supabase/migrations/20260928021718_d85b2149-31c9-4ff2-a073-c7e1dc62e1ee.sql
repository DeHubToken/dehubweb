ALTER TABLE public.ai_generation_jobs
  ADD COLUMN payment_source text NOT NULL DEFAULT 'dhb',
  ADD COLUMN credit_debit_key text NULL,
  ALTER COLUMN tx_hash DROP NOT NULL;

ALTER TABLE public.ai_generation_jobs
  ADD CONSTRAINT ai_generation_jobs_payment_source_check CHECK (payment_source IN ('dhb','credits')),
  ADD CONSTRAINT ai_generation_jobs_payment_ref_check CHECK (
    (payment_source = 'dhb' AND tx_hash IS NOT NULL) OR
    (payment_source = 'credits' AND credit_debit_key IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.ai_job_record_credits(
  p_job_id uuid, p_wallet text, p_dhb numeric, p_kind text, p_model text,
  p_endpoint text, p_metadata jsonb, p_debit_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO ai_generation_jobs(id, wallet_address, tx_hash, price_dhb, kind, model, endpoint, metadata, payment_source, credit_debit_key)
  VALUES(p_job_id, lower(p_wallet), NULL, p_dhb, p_kind, p_model, p_endpoint, p_metadata, 'credits', p_debit_key);
END; $function$;

REVOKE ALL ON FUNCTION public.ai_job_record_credits(uuid, text, numeric, text, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_job_record_credits(uuid, text, numeric, text, text, text, jsonb, text) TO service_role;