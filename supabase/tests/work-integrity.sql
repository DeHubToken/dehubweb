BEGIN;
-- All test bounties and sessions disappear at rollback. No existing bounty is mutated.
CREATE TEMP TABLE work_test_ids (name text PRIMARY KEY, id uuid);
GRANT SELECT ON work_test_ids TO anon;
CREATE FUNCTION pg_temp.work_headers(w text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE expiry text := (extract(epoch FROM now())::bigint + 300)::text; signature text; k bytea;
BEGIN
  SELECT key INTO k FROM wallet_auth.secret WHERE id = 1;
  signature := encode(extensions.hmac(convert_to(w || '.' || expiry,'UTF8'),k,'sha256'),'hex');
  PERFORM set_config('request.headers',json_build_object('x-wallet-address',w,'x-wallet-session',w || '.' || expiry || '.' || signature)::text,true);
END $$;
CREATE FUNCTION pg_temp.work_expect_failure(query text, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE query;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%' || message || '%' THEN RAISE EXCEPTION 'Wrong failure: %, expected %', SQLERRM,message; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'Unexpected success: %',query;
END $$;
INSERT INTO public.work_jobs (poster_address,job_type,title,price_per_unit,max_units,total_budget,status,deadline)
VALUES ('0x1111111111111111111111111111111111111111','clipping','Bounty integrity test',2,3,6,'open',now()+interval '1 day') RETURNING id;
INSERT INTO work_test_ids SELECT 'clip',id FROM public.work_jobs WHERE title='Bounty integrity test';
INSERT INTO public.work_jobs (poster_address,job_type,title,price_per_unit,max_units,total_budget,status,deadline)
VALUES ('0x1111111111111111111111111111111111111111','contract','Contract integrity test',2,1,2,'open',now()+interval '1 day') RETURNING id;
INSERT INTO work_test_ids SELECT 'contract',id FROM public.work_jobs WHERE title='Contract integrity test';
SET LOCAL ROLE anon;
SELECT set_config('request.headers','{"x-wallet-address":"0x1111111111111111111111111111111111111111"}',true);
SELECT pg_temp.work_expect_failure('UPDATE public.work_jobs SET title=''forged'' WHERE id=(SELECT id FROM pg_temp.work_test_ids WHERE name=''clip'')','Sign in again');
SELECT pg_temp.work_headers('0x2222222222222222222222222222222222222222');
INSERT INTO public.work_submissions (job_id,worker_address,proof_url)
SELECT id,'0x2222222222222222222222222222222222222222','https://example.com/clip' FROM work_test_ids WHERE name='clip';
SELECT pg_temp.work_expect_failure('UPDATE public.work_submissions SET approval_status=''paid'',payout_amount=100,payout_tx_hash=''fake'' WHERE job_id=(SELECT id FROM pg_temp.work_test_ids WHERE name=''clip'')','pending proof');
SELECT pg_temp.work_expect_failure('INSERT INTO public.work_submissions (job_id,worker_address,proof_url) SELECT id,''0x2222222222222222222222222222222222222222'',''https://example.com/clip'' FROM pg_temp.work_test_ids WHERE name=''clip''','already been submitted');
SELECT pg_temp.work_expect_failure('INSERT INTO public.work_submissions (job_id,worker_address,proof_url) SELECT id,''0x2222222222222222222222222222222222222222'',''https://example.com/contract'' FROM pg_temp.work_test_ids WHERE name=''contract''','not accepting proof');
INSERT INTO public.work_applications (job_id,applicant_address,cover_letter) SELECT id,'0x2222222222222222222222222222222222222222','test' FROM work_test_ids WHERE name='contract';
SELECT pg_temp.work_expect_failure('UPDATE public.work_applications SET status=''awarded'' WHERE job_id=(SELECT id FROM pg_temp.work_test_ids WHERE name=''contract'')','managed by the poster');
SELECT pg_temp.work_expect_failure('INSERT INTO public.work_reviews (job_id,reviewer_address,reviewee_address,reviewer_role,rating) SELECT id,''0x2222222222222222222222222222222222222222'',''0x1111111111111111111111111111111111111111'',''worker'',5 FROM pg_temp.work_test_ids WHERE name=''clip''','completed work');
SELECT pg_temp.work_headers('0x1111111111111111111111111111111111111111');
SELECT pg_temp.work_expect_failure('SELECT public.work_approve((SELECT id FROM public.work_submissions WHERE proof_url=''https://example.com/clip''),999,''https://example.com/clip'')','Verify the clip view count');
SELECT public.work_approve((SELECT id FROM public.work_submissions WHERE proof_url='https://example.com/clip'),2500,'https://example.com/clip');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.work_submissions WHERE proof_url='https://example.com/clip' AND approved_units=2 AND payout_amount=4 AND payout_state='unpaid') THEN RAISE EXCEPTION 'Incorrect clipping payout'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.work_jobs WHERE id=(SELECT id FROM work_test_ids WHERE name='clip') AND units_approved=2 AND released_amount=0) THEN RAISE EXCEPTION 'Approval incorrectly recorded as payment'; END IF;
END $$;
SELECT pg_temp.work_expect_failure('UPDATE public.work_jobs SET price_per_unit=1 WHERE id=(SELECT id FROM pg_temp.work_test_ids WHERE name=''clip'')','terms are locked');
RESET ROLE;
INSERT INTO work_test_ids SELECT 'submission',id FROM public.work_submissions WHERE proof_url='https://example.com/clip';
SET LOCAL ROLE anon;
SELECT public.work_claim_payment((SELECT id FROM work_test_ids WHERE name='submission'),8453);
DO $$ DECLARE first jsonb; second jsonb; BEGIN
  first := public.work_claim_payment((SELECT id FROM work_test_ids WHERE name='submission'),8453);
  second := public.work_claim_payment((SELECT id FROM work_test_ids WHERE name='submission'),8453);
  IF first->>'id' <> second->>'id' OR (second->>'created')::boolean THEN RAISE EXCEPTION 'Duplicate payment reservation'; END IF;
END $$;
SELECT public.work_record_broadcast((SELECT id FROM public.work_payment_intents WHERE submission_id=(SELECT id FROM work_test_ids WHERE name='submission')),'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
SELECT pg_temp.work_expect_failure('SELECT public.work_cancel_signature((SELECT id FROM public.work_payment_intents WHERE submission_id=(SELECT id FROM pg_temp.work_test_ids WHERE name=''submission'')))','must be reconciled');
RESET ROLE;
INSERT INTO work_private.receipt_key VALUES (1,'test-key') ON CONFLICT(id) DO UPDATE SET key=excluded.key;
SET LOCAL ROLE anon;
SELECT pg_temp.work_expect_failure('SELECT public.work_finalize_payment((SELECT id FROM public.work_payment_intents WHERE submission_id=(SELECT id FROM pg_temp.work_test_ids WHERE name=''submission'')),''{}'',''forged'')','Invalid chain receipt');
SELECT pg_temp.work_headers('0x2222222222222222222222222222222222222222');
SELECT public.work_action('dispute',(SELECT id FROM work_test_ids WHERE name='clip'),'Payment test dispute');
SELECT pg_temp.work_expect_failure('INSERT INTO public.work_submissions (job_id,worker_address,proof_url) SELECT id,''0x2222222222222222222222222222222222222222'',''https://example.com/disputed'' FROM pg_temp.work_test_ids WHERE name=''clip''','not accepting proof');
SELECT pg_temp.work_expect_failure('UPDATE public.work_disputes SET status=''resolved_worker'' WHERE job_id=(SELECT id FROM pg_temp.work_test_ids WHERE name=''clip'')','permission denied');
RESET ROLE;
UPDATE public.work_jobs SET deadline=now()-interval '1 hour' WHERE id=(SELECT id FROM work_test_ids WHERE name='contract');
SELECT public.work_expire_jobs();
SET LOCAL ROLE anon;
SELECT pg_temp.work_expect_failure('INSERT INTO public.work_applications (job_id,applicant_address,cover_letter) SELECT id,''0x2222222222222222222222222222222222222222'',''expired'' FROM pg_temp.work_test_ids WHERE name=''contract''','not accepting applications');
RESET ROLE;
-- Verified receipts bind exact amounts and identities; an unrelated valid transfer cannot settle work.
RESET ROLE;
CREATE FUNCTION pg_temp.work_sign_receipt(body jsonb) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT encode(extensions.hmac(convert_to(body::text,'UTF8'),convert_to('test-key','UTF8'),'sha256'),'hex');
$$;
SET LOCAL ROLE anon;
SELECT pg_temp.work_headers('0x1111111111111111111111111111111111111111');
DO $$ DECLARE i public.work_payment_intents; r jsonb; BEGIN
 SELECT * INTO STRICT i FROM public.work_payment_intents WHERE submission_id=(SELECT id FROM pg_temp.work_test_ids WHERE name='submission');
 r:=jsonb_build_object('id',i.id,'chain',8453,'hash',i.tx_hash,'status','confirmed','minedAt',now(),'transfers',jsonb_build_array(jsonb_build_object('token','0xd20ab1015f6a2de4a6fddebab270113f689c2f7c','from',i.payer_address,'to',i.worker_address,'amount','3000000000000000000')));
 BEGIN PERFORM public.work_finalize_payment(i.id,r::text,pg_temp.work_sign_receipt(r)); RAISE EXCEPTION 'Wrong amount accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%does not match%' THEN RAISE; END IF; END;
 r:=jsonb_set(r,'{transfers,0,amount}','"4000000000000000000"');
 PERFORM public.work_finalize_payment(i.id,r::text,pg_temp.work_sign_receipt(r));
 IF NOT EXISTS(SELECT 1 FROM public.work_submissions WHERE id=i.submission_id AND payout_state='confirmed' AND approval_status='paid') THEN RAISE EXCEPTION 'Verified payment not settled'; END IF;
 IF (SELECT released_amount FROM public.work_jobs WHERE id=i.job_id)<>4 THEN RAISE EXCEPTION 'Confirmed gross rollup incorrect'; END IF;
END $$;
RESET ROLE;
UPDATE public.work_config SET escrow_address='0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' WHERE id=1;
INSERT INTO public.work_jobs(poster_address,job_type,title,price_per_unit,max_units,total_budget,status,deadline)
VALUES('0x1111111111111111111111111111111111111111','shill','Funded integrity test',10,2,20,'draft',date_trunc('second',now()+interval '1 day'));
INSERT INTO work_test_ids SELECT 'funded',id FROM public.work_jobs WHERE title='Funded integrity test';
SET LOCAL ROLE anon;
SELECT pg_temp.work_headers('0x1111111111111111111111111111111111111111');
SELECT pg_temp.work_expect_failure('UPDATE public.work_jobs SET status=''open'' WHERE id=(SELECT id FROM pg_temp.work_test_ids WHERE name=''funded'')','managed by the server');
DO $$ DECLARE first jsonb; second jsonb; BEGIN
 first:=public.work_claim_funding((SELECT id FROM pg_temp.work_test_ids WHERE name='funded'));second:=public.work_claim_funding((SELECT id FROM pg_temp.work_test_ids WHERE name='funded'));
 IF NOT (first->>'created')::boolean OR (second->>'created')::boolean THEN RAISE EXCEPTION 'Funding reservation is not atomic'; END IF;
END $$;
SELECT public.work_record_funding((SELECT id FROM pg_temp.work_test_ids WHERE name='funded'),'0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
SELECT pg_temp.work_expect_failure('SELECT public.work_record_funding((SELECT id FROM pg_temp.work_test_ids WHERE name=''funded''),NULL,true)','Check the recorded');
DO $$ DECLARE j public.work_jobs; r jsonb; BEGIN
 SELECT * INTO STRICT j FROM public.work_jobs WHERE id=(SELECT id FROM pg_temp.work_test_ids WHERE name='funded');
 r:=jsonb_build_object('id',j.id,'chain',8453,'hash',j.pending_fund_tx_hash,'status','confirmed','createdJobs',jsonb_build_array(jsonb_build_object('escrow','0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee','jobId','123','poster',j.poster_address,'token','0xd20ab1015f6a2de4a6fddebab270113f689c2f7c','jobType',0,'amount','20000000000000000000','pricePerUnit','10000000000000000000','maxUnits','2','deadline',extract(epoch FROM j.deadline)::bigint::text)));
 PERFORM public.work_publish_funded(j.id,r::text,pg_temp.work_sign_receipt(r));
 IF NOT EXISTS(SELECT 1 FROM public.work_jobs WHERE id=j.id AND status='open' AND funded_amount=20 AND onchain_job_id=123) THEN RAISE EXCEPTION 'Confirmed funding not published'; END IF;
END $$;
SELECT pg_temp.work_expect_failure('UPDATE public.work_jobs SET deadline=deadline+interval ''1 day'' WHERE id=(SELECT id FROM pg_temp.work_test_ids WHERE name=''funded'')','deadline is locked');
SELECT pg_temp.work_headers('0x2222222222222222222222222222222222222222');
SELECT pg_temp.work_expect_failure('INSERT INTO public.work_submissions(job_id,worker_address,proof_url) SELECT id,''0x2222222222222222222222222222222222222222'',''https://example.com/funded'' FROM pg_temp.work_test_ids WHERE name=''funded''','Register funded proof');
DO $$ DECLARE j public.work_jobs; r jsonb; BEGIN
 SELECT * INTO STRICT j FROM public.work_jobs WHERE id=(SELECT id FROM pg_temp.work_test_ids WHERE name='funded');
 r:=jsonb_build_object('id',j.id,'chain',8453,'hash','0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','status','confirmed','events',jsonb_build_array(jsonb_build_object('name','ProofRegistered','escrow','0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee','jobId','123','worker','0x2222222222222222222222222222222222222222','proofHash',public.work_proof_hash('https://example.com/funded'))));
 PERFORM public.work_record_proof(j.id,'https://example.com/funded',r::text,pg_temp.work_sign_receipt(r));
END $$;
INSERT INTO public.work_submissions(job_id,worker_address,proof_url) SELECT id,'0x2222222222222222222222222222222222222222','https://example.com/funded' FROM work_test_ids WHERE name='funded';
SELECT pg_temp.work_expect_failure('DELETE FROM public.work_submissions WHERE job_id=(SELECT id FROM pg_temp.work_test_ids WHERE name=''funded'')','cannot be deleted');
RESET ROLE;

ROLLBACK;
