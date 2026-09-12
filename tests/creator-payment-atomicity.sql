-- Run after the Creator migration inside a transaction, then ROLLBACK.
DO $test$
DECLARE
  v_hash text := 'creator-check-' || gen_random_uuid()::text;
  v_wallet text := 'creator-check-' || gen_random_uuid()::text;
  v_job uuid := gen_random_uuid();
  v_balance numeric;
BEGIN
  INSERT INTO public.ai_payments(wallet_address,tx_hash,chain,paid_dhb,remaining_dhb)
  VALUES(v_wallet,v_hash,'Base',100,100);
  PERFORM public.ai_job_spend(v_job,v_hash,v_wallet,25,'video','test','generate-video','{}'::jsonb);
  SELECT remaining_dhb INTO v_balance FROM public.ai_payments WHERE tx_hash=v_hash;
  IF v_balance <> 75 THEN RAISE EXCEPTION 'Expected one 25 DHB debit'; END IF;
  BEGIN
    PERFORM public.ai_job_spend(v_job,v_hash,v_wallet,25,'video','test','generate-video','{}'::jsonb);
    RAISE EXCEPTION 'Duplicate job was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  SELECT remaining_dhb INTO v_balance FROM public.ai_payments WHERE tx_hash=v_hash;
  IF v_balance <> 75 THEN RAISE EXCEPTION 'Duplicate job charged twice'; END IF;
  PERFORM public.ai_payment_release(v_hash,v_wallet,25,v_job::text);
  BEGIN
    PERFORM public.ai_payment_release(v_hash,v_wallet,25,v_job::text);
    RAISE EXCEPTION 'Duplicate refund was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REFUND_ALREADY_APPLIED' THEN RAISE; END IF;
  END;
  SELECT remaining_dhb INTO v_balance FROM public.ai_payments WHERE tx_hash=v_hash;
  IF v_balance <> 100 THEN RAISE EXCEPTION 'Refund did not restore exactly the debit'; END IF;
END $test$;
