-- One durable terminal decision owns delivery and payment recovery.
ALTER TABLE public.ai_generation_jobs
  ADD COLUMN IF NOT EXISTS refund_token uuid,
  ADD COLUMN IF NOT EXISTS refund_lease_until timestamptz;

CREATE OR REPLACE FUNCTION public.ai_generation_transition(
  p_job_id uuid,p_status text,p_result jsonb,
  p_prediction_id text DEFAULT NULL,p_provider text DEFAULT NULL,p_provider_app text DEFAULT NULL,
  p_expected_statuses text[] DEFAULT NULL,p_created_before timestamptz DEFAULT NULL,p_refund_not_before timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_job public.ai_generation_jobs%ROWTYPE; v_next text; v_result jsonb;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('starting','processing','succeeded','failed','canceled','cancelled','refund_pending') THEN RAISE EXCEPTION 'INVALID_GENERATION_STATUS'; END IF;
  SELECT * INTO v_job FROM ai_generation_jobs WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('claimed',false,'job',NULL); END IF;
  IF v_job.status IN ('succeeded','failed','canceled','cancelled','refund_pending')
    OR (p_expected_statuses IS NOT NULL AND NOT (v_job.status=ANY(p_expected_statuses)))
    OR (p_created_before IS NOT NULL AND v_job.created_at>=p_created_before) THEN
    RETURN jsonb_build_object('claimed',false,'job',to_jsonb(v_job));
  END IF;
  v_next:=CASE WHEN p_status IN ('failed','canceled','cancelled','refund_pending') THEN 'refund_pending' ELSE p_status END;
  v_result:=COALESCE(p_result,'{}'::jsonb);
  IF v_next='refund_pending' THEN
    v_result:=v_result||jsonb_build_object('status',CASE WHEN p_status IN ('canceled','cancelled') THEN p_status ELSE 'failed' END,'paymentRestored',false);
  ELSIF v_next='succeeded' THEN
    v_result:=(v_result-'paymentRestored')||jsonb_build_object('status','succeeded','savePending',true);
  END IF;
  UPDATE ai_generation_jobs SET status=v_next,result=v_result,
    prediction_id=COALESCE(p_prediction_id,prediction_id),provider=COALESCE(p_provider,provider),provider_app=COALESCE(p_provider_app,provider_app),
    refund_lease_until=CASE WHEN v_next='refund_pending' THEN p_refund_not_before ELSE refund_lease_until END,updated_at=clock_timestamp()
    WHERE id=p_job_id RETURNING * INTO v_job;
  RETURN jsonb_build_object('claimed',true,'job',to_jsonb(v_job));
END $$;

CREATE OR REPLACE FUNCTION public.ai_generation_refund_claim(p_job_id uuid,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_job public.ai_generation_jobs%ROWTYPE;
BEGIN
  IF p_token IS NULL THEN RAISE EXCEPTION 'INVALID_REFUND_TOKEN'; END IF;
  SELECT * INTO v_job FROM ai_generation_jobs WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('claimed',false,'job',NULL); END IF;
  IF v_job.status<>'refund_pending' OR v_job.refund_lease_until>clock_timestamp() THEN RETURN jsonb_build_object('claimed',false,'job',to_jsonb(v_job)); END IF;
  UPDATE ai_generation_jobs SET refund_token=p_token,refund_lease_until=clock_timestamp()+interval '60 seconds',updated_at=clock_timestamp()
    WHERE id=p_job_id RETURNING * INTO v_job;
  RETURN jsonb_build_object('claimed',true,'job',to_jsonb(v_job));
END $$;

-- Stale direct release callers cannot refund a succeeded journalled job.
CREATE OR REPLACE FUNCTION public.ai_payment_release(p_tx_hash text,p_wallet text,p_dhb numeric,p_job_id text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_payment_id uuid; v_remaining numeric; v_job public.ai_generation_jobs%ROWTYPE; v_refund_id text:=p_job_id;
BEGIN
  IF p_dhb IS NULL OR p_dhb<=0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  SELECT * INTO v_job FROM ai_generation_jobs WHERE id::text=lower(btrim(p_job_id)) FOR UPDATE;
  IF FOUND THEN
    v_refund_id:=v_job.id::text;
    IF v_job.status<>'refund_pending' THEN RAISE EXCEPTION 'GENERATION_REFUND_NOT_CLAIMED'; END IF;
    IF v_job.payment_source<>'dhb' OR v_job.tx_hash<>lower(p_tx_hash) OR v_job.wallet_address<>lower(p_wallet) OR v_job.price_dhb<>p_dhb THEN RAISE EXCEPTION 'GENERATION_REFUND_MISMATCH'; END IF;
  END IF;
  SELECT id INTO v_payment_id FROM ai_payments WHERE tx_hash=lower(p_tx_hash) AND wallet_address=lower(p_wallet);
  IF v_payment_id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
  INSERT INTO ai_payment_refunds(job_id,payment_id,dhb) VALUES(v_refund_id,v_payment_id,p_dhb) ON CONFLICT(job_id) DO NOTHING;
  IF NOT FOUND THEN RAISE EXCEPTION 'REFUND_ALREADY_APPLIED'; END IF;
  UPDATE ai_payments SET remaining_dhb=LEAST(remaining_dhb+p_dhb,paid_dhb),updated_at=clock_timestamp()
    WHERE id=v_payment_id RETURNING remaining_dhb INTO v_remaining;
  RETURN v_remaining;
END $$;

CREATE OR REPLACE FUNCTION public.ai_generation_refund_finish(p_job_id uuid,p_token uuid,p_credit_restored boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_job public.ai_generation_jobs%ROWTYPE;
BEGIN
  IF p_token IS NULL THEN RAISE EXCEPTION 'INVALID_REFUND_TOKEN'; END IF;
  SELECT * INTO v_job FROM ai_generation_jobs WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_job.status<>'refund_pending' OR v_job.refund_token IS DISTINCT FROM p_token OR v_job.refund_lease_until IS NULL OR v_job.refund_lease_until<=clock_timestamp() THEN RETURN to_jsonb(v_job); END IF;
  IF v_job.payment_source='credits' THEN
    IF NOT p_credit_restored THEN RETURN to_jsonb(v_job); END IF;
  ELSE
    BEGIN
      PERFORM ai_payment_release(v_job.tx_hash,v_job.wallet_address,v_job.price_dhb,v_job.id::text);
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%REFUND_ALREADY_APPLIED%' THEN RAISE; END IF;
    END;
  END IF;
  UPDATE ai_generation_jobs SET status=CASE WHEN result->>'status' IN ('canceled','cancelled') THEN result->>'status' ELSE 'failed' END,
    result=COALESCE(result,'{}'::jsonb)||jsonb_build_object('paymentRestored',true),refund_token=NULL,refund_lease_until=NULL,updated_at=clock_timestamp()
    WHERE id=p_job_id RETURNING * INTO v_job;
  RETURN to_jsonb(v_job);
END $$;

CREATE OR REPLACE FUNCTION public.ai_generation_save_result(p_job_id uuid,p_expected_result jsonb,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_job public.ai_generation_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM ai_generation_jobs WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_job.status='succeeded' AND v_job.result IS NOT DISTINCT FROM p_expected_result THEN
    UPDATE ai_generation_jobs SET result=p_result,updated_at=clock_timestamp() WHERE id=p_job_id RETURNING * INTO v_job;
  END IF;
  RETURN to_jsonb(v_job);
END $$;

CREATE OR REPLACE FUNCTION public.ai_generation_terminal_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF OLD.status IN ('succeeded','failed','canceled','cancelled') AND NEW.status<>OLD.status THEN RAISE EXCEPTION 'GENERATION_TERMINAL_CONFLICT'; END IF;
  IF OLD.status='refund_pending' AND NEW.status NOT IN ('refund_pending','failed','canceled','cancelled') THEN RAISE EXCEPTION 'GENERATION_TERMINAL_CONFLICT'; END IF;
  IF OLD.status IN ('failed','canceled','cancelled') THEN NEW.result:=OLD.result; END IF;
  IF OLD.status='succeeded' AND (OLD.result-'libraryId'-'savePending') IS DISTINCT FROM (NEW.result-'libraryId'-'savePending') THEN RAISE EXCEPTION 'GENERATION_TERMINAL_CONFLICT'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ai_generation_terminal_guard ON public.ai_generation_jobs;
CREATE TRIGGER ai_generation_terminal_guard BEFORE UPDATE ON public.ai_generation_jobs FOR EACH ROW EXECUTE FUNCTION public.ai_generation_terminal_guard();

REVOKE ALL ON FUNCTION public.ai_generation_transition(uuid,text,jsonb,text,text,text,text[],timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_generation_refund_claim(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_generation_refund_finish(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_generation_save_result(uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_generation_terminal_guard() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_payment_release(text,text,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_generation_transition(uuid,text,jsonb,text,text,text,text[],timestamptz,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_generation_refund_claim(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_generation_refund_finish(uuid,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_generation_save_result(uuid,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_payment_release(text,text,numeric,text) TO service_role;
