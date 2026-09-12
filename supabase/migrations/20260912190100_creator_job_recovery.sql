CREATE TABLE IF NOT EXISTS public.ai_generation_jobs (
  id uuid PRIMARY KEY,
  wallet_address text NOT NULL,
  tx_hash text NOT NULL,
  price_dhb numeric NOT NULL CHECK (price_dhb > 0),
  kind text NOT NULL,
  model text NOT NULL,
  endpoint text NOT NULL,
  provider text,
  prediction_id text,
  provider_app text,
  status text NOT NULL DEFAULT 'submitting',
  result jsonb,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(endpoint, prediction_id)
);
ALTER TABLE public.ai_generation_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_generation_jobs FROM anon, authenticated;
GRANT ALL ON public.ai_generation_jobs TO service_role;
CREATE INDEX IF NOT EXISTS ai_generation_jobs_pending ON public.ai_generation_jobs(updated_at) WHERE status IN ('starting', 'processing');

CREATE OR REPLACE FUNCTION public.ai_job_spend(p_job_id uuid, p_tx_hash text, p_wallet text, p_dhb numeric, p_kind text, p_model text, p_endpoint text, p_metadata jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM ai_payment_spend(p_tx_hash, p_wallet, p_dhb);
  INSERT INTO ai_generation_jobs(id, wallet_address, tx_hash, price_dhb, kind, model, endpoint, metadata)
  VALUES(p_job_id, lower(p_wallet), lower(p_tx_hash), p_dhb, p_kind, p_model, p_endpoint, p_metadata);
END; $$;
REVOKE ALL ON FUNCTION public.ai_job_spend(uuid,text,text,numeric,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_job_spend(uuid,text,text,numeric,text,text,text,jsonb) TO service_role;

CREATE TABLE IF NOT EXISTS public.creator_assets (
  id text NOT NULL,
  wallet_address text NOT NULL,
  storage_path text,
  metadata jsonb NOT NULL DEFAULT '{}',
  ready boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(wallet_address,id)
);
ALTER TABLE public.creator_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.creator_assets FROM anon, authenticated;
GRANT ALL ON public.creator_assets TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit)
VALUES('creator-assets','creator-assets',false,524288000)
ON CONFLICT(id) DO NOTHING;

DO $schedule$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'creator-job-recovery') THEN
    PERFORM cron.schedule('creator-job-recovery', '*/5 * * * *', $request$
      SELECT net.http_post(
        url := 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/creator-reconcile',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb
      );
    $request$);
  END IF;
END $schedule$;
