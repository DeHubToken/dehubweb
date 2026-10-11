BEGIN;
INSERT INTO ai_payments(wallet_address,tx_hash,chain,paid_dhb,remaining_dhb,purpose)
VALUES('0x1111111111111111111111111111111111111111','0x' || repeat('2',64),'Base',2000,2000,'job');
DO $$
DECLARE k text := 'maboroshi:' || repeat('a',32) || ':prepare';
        w text := '0x1111111111111111111111111111111111111111';
        h text := '0x' || repeat('2',64);
BEGIN
  PERFORM maboroshi_payment_spend(k,w,h,1000);
  PERFORM maboroshi_payment_spend(k,w,h,1000);
  ASSERT (SELECT remaining_dhb FROM ai_payments WHERE tx_hash=h) = 1000, 'Retry debited twice';
  ASSERT (SELECT count(*) FROM maboroshi_stage_payments WHERE key=k) = 1;
  BEGIN
    PERFORM maboroshi_payment_spend(k,w,h,1001);
    RAISE EXCEPTION 'Changed amount accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'PAYMENT_BINDING_MISMATCH' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM maboroshi_payment_spend(k,'0x' || repeat('3',40),h,1000);
    RAISE EXCEPTION 'Changed wallet accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'PAYMENT_BINDING_MISMATCH' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM maboroshi_payment_spend('maboroshi:' || repeat('a',32) || ':draft',w,h,1500);
    RAISE EXCEPTION 'Overspend accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'PAYMENT_EXHAUSTED' THEN RAISE; END IF;
  END;
  ASSERT (SELECT count(*) FROM maboroshi_stage_payments) = 1, 'Failed debit left a receipt';
  PERFORM maboroshi_payment_refund(k);
  PERFORM maboroshi_payment_refund(k);
  ASSERT (SELECT remaining_dhb FROM ai_payments WHERE tx_hash=h) = 2000, 'Refund not restored exactly once';
  ASSERT (SELECT count(*) FROM ai_payment_refunds WHERE job_id=k) = 1;
  BEGIN
    PERFORM maboroshi_payment_spend(k,w,h,1000);
    RAISE EXCEPTION 'Reversed stage accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'PAYMENT_REVERSED' THEN RAISE; END IF;
  END;
  ASSERT NOT has_table_privilege('anon','public.maboroshi_stage_payments','SELECT');
  ASSERT NOT has_function_privilege('anon','public.maboroshi_payment_spend(text,text,text,numeric)','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','public.maboroshi_payment_refund(text)','EXECUTE');
END; $$;
ROLLBACK;
