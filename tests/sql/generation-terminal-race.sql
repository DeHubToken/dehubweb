DO $$ DECLARE j record; r jsonb; failures int; BEGIN
  FOR j IN SELECT * FROM ai_generation_jobs WHERE id::text>='00000000-0000-4000-8000-000000000010' LOOP
    IF j.status='refund_pending' THEN
      r:=ai_generation_refund_claim(j.id,gen_random_uuid());
      PERFORM ai_generation_refund_finish(j.id,(r#>>'{job,refund_token}')::uuid);
    END IF;
    -- A late failure for every winner must preserve the recorded terminal decision.
    r:=ai_generation_transition(j.id,'failed','{"status":"failed","error":"late poll"}');
    IF (r->>'claimed')::boolean THEN RAISE EXCEPTION 'Late poll changed a terminal winner'; END IF;
  END LOOP;
  SELECT count(*) INTO failures FROM ai_generation_jobs WHERE status='failed' AND payment_source='dhb';
  IF (SELECT remaining_dhb FROM ai_payments WHERE tx_hash='receipt')<>1000+failures*100 THEN RAISE EXCEPTION 'Receipt does not match committed refunds'; END IF;
  IF EXISTS(SELECT 1 FROM ai_payment_refunds refund JOIN ai_generation_jobs job ON job.id::text=refund.job_id WHERE job.status='succeeded') THEN RAISE EXCEPTION 'Succeeded job was refunded'; END IF;
  IF (SELECT count(*) FROM ai_payment_refunds WHERE payment_id=(SELECT id FROM ai_payments WHERE tx_hash='receipt'))<>failures THEN RAISE EXCEPTION 'Duplicate or missing receipt refund'; END IF;
END $$;
