BEGIN;
CREATE TEMP TABLE reputation_jobs(name text,id uuid);
GRANT SELECT ON reputation_jobs TO anon;
CREATE FUNCTION pg_temp.reputation_headers(w text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE expiry text:=(extract(epoch FROM now())::bigint+300)::text; key bytea;
BEGIN
 SELECT s.key INTO key FROM wallet_auth.secret s WHERE id=1;
 PERFORM set_config('request.headers',jsonb_build_object('x-wallet-address',w,'x-wallet-session',w||'.'||expiry||'.'||encode(extensions.hmac(convert_to(w||'.'||expiry,'UTF8'),key,'sha256'),'hex'))::text,true);
END $$;
SET LOCAL ROLE anon;
SELECT pg_temp.reputation_headers('0x1111111111111111111111111111111111111111');
INSERT INTO public.work_jobs(poster_address,job_type,title,currency,price_per_unit,max_units,status,deadline)
VALUES('0x1111111111111111111111111111111111111111','shill','Reputation listing test','USDC',1,3,'open',now()+interval '1 day');
RESET ROLE;
INSERT INTO reputation_jobs SELECT 'open',id FROM public.work_jobs WHERE title='Reputation listing test';
INSERT INTO public.work_jobs(poster_address,job_type,title,currency,price_per_unit,max_units,status,deadline)
VALUES('0x1111111111111111111111111111111111111111','shill','Reputation draft test','USDC',1,1,'draft',now()+interval '1 day');
INSERT INTO reputation_jobs SELECT 'draft',id FROM public.work_jobs WHERE title='Reputation draft test';
SET LOCAL ROLE anon;
SELECT public.work_publish((SELECT id FROM reputation_jobs WHERE name='draft'));
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.work_jobs WHERE id=(SELECT id FROM reputation_jobs WHERE name='draft') AND status='open' AND funded_amount=0 AND fund_tx_hash IS NULL) THEN RAISE EXCEPTION 'Reputation publication failed'; END IF;
END $$;
RESET ROLE;
INSERT INTO public.work_submissions(job_id,worker_address,proof_url,approval_status,approved_units,gross_amount,payout_amount)
SELECT id,'0x2222222222222222222222222222222222222222','https://example.com/reputation-unpaid','approved',1,1,1 FROM reputation_jobs WHERE name='open';
INSERT INTO public.work_submissions(job_id,worker_address,proof_url,approval_status,approved_units,gross_amount,payout_amount)
SELECT id,'0x3333333333333333333333333333333333333333','https://example.com/reputation-worker','approved',1,1,1 FROM reputation_jobs WHERE name='open';
SET LOCAL ROLE anon;
SELECT pg_temp.reputation_headers('0x2222222222222222222222222222222222222222');
INSERT INTO public.work_reviews(job_id,reviewer_address,reviewee_address,reviewer_role,rating,comment)
SELECT id,'0x2222222222222222222222222222222222222222','0x1111111111111111111111111111111111111111','worker',1,'Accepted work remains unpaid' FROM reputation_jobs WHERE name='open';
SELECT pg_temp.reputation_headers('0x4444444444444444444444444444444444444444');
DO $$ BEGIN
 BEGIN
  INSERT INTO public.work_reviews(job_id,reviewer_address,reviewee_address,reviewer_role,rating)
  SELECT id,'0x4444444444444444444444444444444444444444','0x1111111111111111111111111111111111111111','worker',1 FROM reputation_jobs WHERE name='open';
  RAISE EXCEPTION 'Unrelated wallet reviewed bounty';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Reviews require%' THEN RAISE; END IF; END;
END $$;
SELECT pg_temp.reputation_headers('0x1111111111111111111111111111111111111111');
INSERT INTO public.work_reviews(job_id,reviewer_address,reviewee_address,reviewer_role,rating)
SELECT id,'0x1111111111111111111111111111111111111111','0x2222222222222222222222222222222222222222','poster',5 FROM reputation_jobs WHERE name='open';
INSERT INTO public.work_reviews(job_id,reviewer_address,reviewee_address,reviewer_role,rating)
SELECT id,'0x1111111111111111111111111111111111111111','0x3333333333333333333333333333333333333333','poster',4 FROM reputation_jobs WHERE name='open';
RESET ROLE;
SELECT 'Reputation publication, unpaid worker reviews, real counterparties and multiple worker reviews passed' AS validation;
SET LOCAL ROLE anon;
SELECT pg_temp.reputation_headers('0x2222222222222222222222222222222222222222');
SELECT public.work_action('dispute',(SELECT id FROM reputation_jobs WHERE name='open'),'Accepted work remains unpaid');
SELECT pg_temp.reputation_headers('0x9324840523a5d17dd12a2f11a9472e5a199c1937');
SELECT public.work_resolve_dispute((SELECT id FROM public.work_disputes WHERE job_id=(SELECT id FROM reputation_jobs WHERE name='open')),'0x2222222222222222222222222222222222222222',1,'Poster must settle accepted work',0);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.work_jobs WHERE id=(SELECT id FROM reputation_jobs WHERE name='open') AND status='in_progress') THEN RAISE EXCEPTION 'Direct settlement remained frozen'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.work_submissions WHERE job_id=(SELECT id FROM reputation_jobs WHERE name='open') AND worker_address='0x3333333333333333333333333333333333333333' AND approval_status='approved' AND payout_state='unpaid' AND payout_amount=1) THEN RAISE EXCEPTION 'Other worker claim was erased'; END IF;
END $$;
SELECT pg_temp.reputation_headers('0x1111111111111111111111111111111111111111');
SELECT public.work_claim_payment((SELECT id FROM public.work_submissions WHERE job_id=(SELECT id FROM reputation_jobs WHERE name='open') AND worker_address='0x3333333333333333333333333333333333333333'),8453);
RESET ROLE;
SELECT 'Reputation disputes preserve other workers and unblock poster settlement' AS dispute_validation;
ROLLBACK;
