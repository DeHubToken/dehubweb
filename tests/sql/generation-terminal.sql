DO $$ DECLARE r jsonb; old_result jsonb; BEGIN
  r:=ai_generation_transition('00000000-0000-4000-8000-000000000001','succeeded','{"status":"succeeded","videoUrl":"https://media.test/one.mp4"}');
  IF NOT (r->>'claimed')::boolean THEN RAISE EXCEPTION 'Success was not claimed'; END IF;
  r:=ai_generation_transition('00000000-0000-4000-8000-000000000001','failed','{"status":"failed"}');
  IF (r->>'claimed')::boolean OR r#>>'{job,status}'<>'succeeded' THEN RAISE EXCEPTION 'Stale failure changed success'; END IF;
  BEGIN
    PERFORM ai_payment_release('receipt','owner',100,'00000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Succeeded job was refundable';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%GENERATION_REFUND_NOT_CLAIMED%' THEN RAISE; END IF; END;
  BEGIN
    UPDATE ai_generation_jobs SET status='failed' WHERE id='00000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Unconditional update changed success';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%GENERATION_TERMINAL_CONFLICT%' THEN RAISE; END IF; END;

  PERFORM ai_generation_transition('00000000-0000-4000-8000-000000000002','failed','{"status":"failed","error":"provider failed"}');
  r:=ai_generation_transition('00000000-0000-4000-8000-000000000002','succeeded','{"status":"succeeded"}');
  IF (r->>'claimed')::boolean OR r#>>'{job,status}'<>'refund_pending' THEN RAISE EXCEPTION 'Success overtook refund decision'; END IF;
  r:=ai_generation_refund_claim('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001');
  IF NOT (r->>'claimed')::boolean THEN RAISE EXCEPTION 'Refund lease not claimed'; END IF;
  r:=ai_generation_refund_claim('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
  IF (r->>'claimed')::boolean THEN RAISE EXCEPTION 'Competing refund lease claimed'; END IF;
  r:=ai_generation_refund_finish('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
  IF r->>'status'<>'refund_pending' THEN RAISE EXCEPTION 'Wrong lease finalized refund'; END IF;
  r:=ai_generation_refund_finish('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001');
  IF r->>'status'<>'failed' OR NOT (r#>>'{result,paymentRestored}')::boolean THEN RAISE EXCEPTION 'Refund not completed'; END IF;
  PERFORM ai_generation_refund_finish('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001');
  IF (SELECT remaining_dhb FROM ai_payments WHERE tx_hash='receipt')<>1100 THEN RAISE EXCEPTION 'Refund replay moved funds'; END IF;

  -- A stale submitting snapshot cannot refund a job already journalled successfully.
  PERFORM ai_generation_transition('00000000-0000-4000-8000-000000000003','succeeded','{"status":"succeeded","imageUrl":"https://media.test/three.png"}');
  r:=ai_generation_transition('00000000-0000-4000-8000-000000000003','failed','{}',NULL,NULL,NULL,ARRAY['submitting'],now()-interval '30 minutes');
  IF (r->>'claimed')::boolean THEN RAISE EXCEPTION 'Stale submitting job refunded success'; END IF;
  r:=ai_generation_transition('00000000-0000-4000-8000-000000000004','failed','{}',NULL,NULL,NULL,ARRAY['submitting'],now()-interval '30 minutes');
  IF NOT (r->>'claimed')::boolean THEN RAISE EXCEPTION 'Stale submission not claimed'; END IF;
  r:=ai_generation_transition('00000000-0000-4000-8000-000000000004','starting','{"predictionId":"late-ticket"}','late-ticket');
  IF (r->>'claimed')::boolean THEN RAISE EXCEPTION 'Late ticket overwrote refund decision'; END IF;

  -- External credit refunds use the same durable decision and fenced lease.
  PERFORM ai_generation_transition('00000000-0000-4000-8000-000000000005','failed','{}');
  PERFORM ai_generation_refund_claim('00000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000001');
  UPDATE ai_generation_jobs SET refund_lease_until=now()-interval '1 minute' WHERE id='00000000-0000-4000-8000-000000000005';
  PERFORM ai_generation_refund_claim('00000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000002');
  r:=ai_generation_refund_finish('00000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000001',true);
  IF r->>'status'<>'refund_pending' THEN RAISE EXCEPTION 'Expired credit refund owner finalized'; END IF;
  r:=ai_generation_refund_finish('00000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000002',true);
  IF r->>'status'<>'failed' OR EXISTS(SELECT 1 FROM ai_payment_refunds WHERE job_id='00000000-0000-4000-8000-000000000005') THEN RAISE EXCEPTION 'Credit refund touched wallet receipt'; END IF;

  SELECT result INTO old_result FROM ai_generation_jobs WHERE id='00000000-0000-4000-8000-000000000001';
  PERFORM ai_generation_save_result('00000000-0000-4000-8000-000000000001',old_result,(old_result-'savePending')||'{"libraryId":"saved-one"}');
  r:=ai_generation_save_result('00000000-0000-4000-8000-000000000001',old_result,old_result||'{"savePending":true}');
  IF r#>>'{result,libraryId}'<>'saved-one' OR r#>>'{result,savePending}'='true' THEN RAISE EXCEPTION 'Stale archive overwrote saved result'; END IF;
  IF has_function_privilege('anon','public.ai_generation_transition(uuid,text,jsonb,text,text,text,text[],timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'Public terminal transition exposed'; END IF;
  INSERT INTO ai_generation_jobs(id,wallet_address,price_dhb,kind,model,endpoint,payment_source,credit_debit_key)
    VALUES('00000000-0000-4000-8000-000000000099','owner',100,'image','test','generate-image','credits','ai:declined');
  r:=ai_generation_debit_declined('00000000-0000-4000-8000-000000000099');
  IF r->>'status'<>'failed' OR r#>>'{result,paymentNotTaken}'<>'true' OR r#>>'{result,paymentRestored}'<>'false' THEN RAISE EXCEPTION 'Definitive decline was misrepresented as a refund'; END IF;
  INSERT INTO ai_payments(wallet_address,tx_hash,paid_dhb,remaining_dhb) VALUES('owner','voice-receipt',100,40);
  PERFORM ai_payment_release('voice-receipt','owner',20,'legacy-voice-job');
  IF (SELECT remaining_dhb FROM ai_payments WHERE tx_hash='voice-receipt')<>60 THEN RAISE EXCEPTION 'Non-journalled receipt refund regressed'; END IF;
  BEGIN
    PERFORM ai_payment_release('voice-receipt','owner',20,'legacy-voice-job');
    RAISE EXCEPTION 'Legacy refund replay accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%REFUND_ALREADY_APPLIED%' THEN RAISE; END IF; END;
END $$;
