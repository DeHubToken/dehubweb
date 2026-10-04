BEGIN;

-- Reputation and verified payment history secure the marketplace. Posting needs no token deposit.
CREATE OR REPLACE FUNCTION public.work_reviewable(p_job uuid,p_worker text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.work_jobs j WHERE j.id=p_job AND j.status<>'draft' AND lower(p_worker)<>j.poster_address AND (
  EXISTS(SELECT 1 FROM public.work_submissions s WHERE s.job_id=j.id AND s.worker_address=lower(p_worker)
    AND (s.approval_status IN ('approved','paid','rejected') OR j.status='completed' OR j.deadline<=now()))
  OR (j.awarded_worker_address=lower(p_worker) AND (j.status='completed' OR j.deadline<=now()))
 ));
$$;
REVOKE ALL ON FUNCTION public.work_reviewable(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.work_reviewable(uuid,text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.work_guard_write() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE j public.work_jobs; who text; privileged boolean;
BEGIN
  privileged := current_user IN ('postgres','service_role','supabase_admin');
  IF privileged THEN RETURN NEW; END IF;
  who := public.work_wallet();
  IF TG_TABLE_NAME = 'work_jobs' THEN
    IF NEW.price_per_unit <> trunc(NEW.price_per_unit,CASE WHEN NEW.currency='USDC' THEN 6 ELSE 18 END) THEN RAISE EXCEPTION 'Price exceeds token precision'; END IF;
    IF NEW.price_per_unit <= 0 OR NEW.price_per_unit::text IN ('NaN','Infinity','-Infinity') OR NEW.max_units < 1
       OR (NEW.job_type = 'contract' AND NEW.max_units <> 1) OR btrim(NEW.title) = '' THEN RAISE EXCEPTION 'Invalid bounty terms'; END IF;
    IF TG_OP = 'INSERT' THEN
      IF NEW.status NOT IN ('draft','open') OR NEW.fund_tx_hash IS NOT NULL OR NEW.onchain_job_id IS NOT NULL OR NEW.funded_amount <> 0
         OR NEW.units_approved <> 0 OR NEW.released_amount <> 0 OR NEW.awarded_worker_address IS NOT NULL
         OR NEW.funding_state <> 'unfunded' OR NEW.pending_fund_tx_hash IS NOT NULL OR NEW.refunded_amount <> 0 THEN
        RAISE EXCEPTION 'New bounties must have no recorded funding or payouts';
      END IF;
      IF NEW.deadline IS NOT NULL AND NEW.deadline <= now() THEN RAISE EXCEPTION 'Deadline must be in the future'; END IF;
      NEW.poster_address := who;
    ELSE
      IF (to_jsonb(NEW) - ARRAY['title','description','cover_image_url','tags','platform','target_url','deadline','currency','price_per_unit','max_units','total_budget','updated_at'])
         IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['title','description','cover_image_url','tags','platform','target_url','deadline','currency','price_per_unit','max_units','total_budget','updated_at'])
      THEN RAISE EXCEPTION 'Bounty state and accounting are managed by the server'; END IF;
      IF OLD.status NOT IN ('draft','open','in_progress') THEN RAISE EXCEPTION 'This bounty is closed for editing'; END IF;
      IF (NEW.currency,NEW.price_per_unit,NEW.max_units) IS DISTINCT FROM (OLD.currency,OLD.price_per_unit,OLD.max_units)
        AND (OLD.fund_tx_hash IS NOT NULL OR OLD.funding_state <> 'unfunded' OR OLD.status NOT IN ('draft','open')
          OR EXISTS (SELECT 1 FROM public.work_applications WHERE job_id = OLD.id)
          OR EXISTS (SELECT 1 FROM public.work_submissions WHERE job_id = OLD.id)) THEN RAISE EXCEPTION 'Bounty terms are locked'; END IF;
      IF NEW.deadline IS DISTINCT FROM OLD.deadline AND NEW.deadline IS NOT NULL AND NEW.deadline <= now() THEN RAISE EXCEPTION 'Deadline must be in the future'; END IF;
      IF NEW.deadline IS DISTINCT FROM OLD.deadline AND (OLD.fund_tx_hash IS NOT NULL OR OLD.funding_state <> 'unfunded') THEN RAISE EXCEPTION 'The escrow deadline is locked'; END IF;
    END IF;
    NEW.total_budget := NEW.price_per_unit * NEW.max_units;
  ELSIF TG_TABLE_NAME = 'work_applications' THEN
    j := public.work_lock_job(NEW.job_id);
    IF TG_OP = 'INSERT' THEN
      IF j.job_type <> 'contract' OR j.status <> 'open' OR j.poster_address = who OR (j.deadline IS NOT NULL AND j.deadline <= now())
        OR NEW.status <> 'pending' THEN RAISE EXCEPTION 'This bounty is not accepting applications'; END IF;
      NEW.applicant_address := who;
    ELSE
      IF (to_jsonb(NEW) - ARRAY['cover_letter','proposed_amount','status','updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['cover_letter','proposed_amount','status','updated_at'])
        OR OLD.status <> 'pending' OR NEW.status NOT IN ('pending','withdrawn') THEN RAISE EXCEPTION 'Application outcome is managed by the poster'; END IF;
    END IF;
    IF NEW.proposed_amount IS NOT NULL AND (NEW.proposed_amount <= 0 OR NEW.proposed_amount > j.total_budget OR NEW.proposed_amount::text IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Invalid proposed amount'; END IF;
  ELSIF TG_TABLE_NAME = 'work_submissions' THEN
    j := public.work_lock_job(NEW.job_id);
    IF j.status NOT IN ('open','in_progress') OR j.poster_address = who OR (j.deadline IS NOT NULL AND j.deadline <= now())
      OR (j.job_type = 'contract' AND j.awarded_worker_address IS DISTINCT FROM who) THEN RAISE EXCEPTION 'This bounty is not accepting proof from this wallet'; END IF;
    IF TG_OP = 'INSERT' THEN
      IF NEW.approval_status <> 'pending' OR NEW.payout_amount <> 0 OR NEW.payout_tx_hash IS NOT NULL
        OR NEW.approved_units <> 0 OR NEW.view_count_cached <> 0 OR NEW.payout_state <> 'unpaid' OR NEW.gross_amount <> 0 THEN RAISE EXCEPTION 'Submission outcomes are managed by the poster'; END IF;
      NEW.worker_address := who;
    ELSE
      IF OLD.approval_status <> 'pending' OR (to_jsonb(NEW) - ARRAY['proof_url','proof_text','platform','updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['proof_url','proof_text','platform','updated_at']) THEN RAISE EXCEPTION 'Only pending proof can be edited'; END IF;
    END IF;
    NEW.proof_url := btrim(NEW.proof_url);
    IF NEW.proof_url !~ '^https://[^[:space:]]+$' THEN RAISE EXCEPTION 'Proof must be a valid HTTPS link'; END IF;
    IF j.fund_tx_hash IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.work_proof_registrations WHERE job_id=j.id AND worker_address=who AND proof_hash=public.work_proof_hash(NEW.proof_url)) THEN RAISE EXCEPTION 'Register funded proof on escrow before submitting'; END IF;
    IF EXISTS (SELECT 1 FROM public.work_submissions WHERE job_id = NEW.job_id AND id <> NEW.id AND lower(btrim(proof_url)) = lower(NEW.proof_url)) THEN RAISE EXCEPTION 'This proof has already been submitted'; END IF;
  ELSIF TG_TABLE_NAME = 'work_reviews' THEN
    SELECT * INTO STRICT j FROM public.work_jobs WHERE id = NEW.job_id;
    IF lower(NEW.reviewee_address)=who OR NEW.reviewer_role NOT IN ('poster','worker') THEN RAISE EXCEPTION 'Invalid review counterparty'; END IF;
    IF NEW.reviewer_role='poster' THEN
      IF j.poster_address<>who OR NOT public.work_reviewable(j.id,lower(NEW.reviewee_address)) THEN RAISE EXCEPTION 'Reviews require completed work, a reviewed submission or an expired deadline'; END IF;
    ELSE
      IF lower(NEW.reviewee_address)<>j.poster_address OR NOT public.work_reviewable(j.id,who) THEN RAISE EXCEPTION 'Reviews require completed work, a reviewed submission or an expired deadline'; END IF;
    END IF;
    NEW.reviewer_address:=who; NEW.reviewee_address:=lower(NEW.reviewee_address);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.work_publish(p_job uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.work_jobs;
BEGIN
 SELECT * INTO STRICT j FROM public.work_jobs WHERE id=p_job FOR UPDATE;
 IF j.poster_address<>public.work_wallet() OR j.status<>'draft' OR j.fund_tx_hash IS NOT NULL OR j.funding_state<>'unfunded' THEN RAISE EXCEPTION 'Only an unfunded draft can be published by its poster'; END IF;
 IF j.deadline<=now() THEN RAISE EXCEPTION 'Set a future deadline before publishing'; END IF;
 UPDATE public.work_jobs SET status='open',deadline=coalesce(deadline,now()+interval '30 days') WHERE id=j.id;
END $$;
REVOKE ALL ON FUNCTION public.work_publish(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.work_publish(uuid) TO anon,authenticated;

ALTER TABLE public.work_reviews DROP CONSTRAINT IF EXISTS work_reviews_job_id_reviewer_address_key;
CREATE UNIQUE INDEX work_review_one_counterparty ON public.work_reviews(job_id,reviewer_address,reviewee_address);

CREATE OR REPLACE FUNCTION public.work_resolve_dispute(p_dispute uuid,p_worker text,p_amount numeric,p_note text,p_refund numeric DEFAULT 0,p_payload text DEFAULT NULL,p_signature text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.work_disputes; j public.work_jobs; s public.work_submissions; e jsonb; decimals integer; net numeric;
BEGIN
 IF NOT public.work_is_arbiter() THEN RAISE EXCEPTION 'Only a configured arbiter can resolve disputes'; END IF;
 SELECT * INTO STRICT d FROM public.work_disputes WHERE id=p_dispute;
 SELECT * INTO STRICT j FROM public.work_jobs WHERE id=d.job_id FOR UPDATE;
 SELECT * INTO STRICT d FROM public.work_disputes WHERE id=p_dispute FOR UPDATE;
 IF d.status <> 'open' OR j.status <> 'disputed' THEN RAISE EXCEPTION 'This dispute is already resolved'; END IF;
 IF p_amount < 0 OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_amount > j.total_budget-j.released_amount OR p_refund < 0 OR p_refund::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid resolution amount'; END IF;
 SELECT * INTO s FROM public.work_submissions WHERE job_id=j.id AND worker_address=lower(p_worker) AND approval_status IN ('pending','approved') ORDER BY created_at LIMIT 1 FOR UPDATE;
 IF p_amount > 0 AND s.id IS NULL THEN RAISE EXCEPTION 'Choose a worker with outstanding submitted proof'; END IF;
 IF s.payout_state IN ('signing','broadcast','confirmed') THEN RAISE EXCEPTION 'Reconcile the existing payment first'; END IF;
 IF EXISTS(SELECT 1 FROM public.work_submissions WHERE job_id=j.id AND id IS DISTINCT FROM s.id AND (approval_status='pending' OR (j.fund_tx_hash IS NOT NULL AND approval_status='approved'))) THEN RAISE EXCEPTION 'Review and settle other submissions before resolving'; END IF;
 IF j.fund_tx_hash IS NOT NULL THEN
  IF p_amount+p_refund <> j.total_budget-j.released_amount THEN RAISE EXCEPTION 'Resolve the full remaining escrow balance'; END IF;
  decimals:=CASE WHEN j.currency='USDC' THEN 6 ELSE 18 END;
  e:=public.work_event(j.id,p_payload,p_signature,'DisputeResolved',jsonb_build_object('worker',lower(p_worker),'workerAmount',trunc(p_amount*power(10::numeric,decimals))::text,'posterRefund',trunc(p_refund*power(10::numeric,decimals))::text,
    'proofHash',coalesce(public.work_proof_hash(s.proof_url),'0x' || repeat('0',64))));
  net:=p_amount-trunc(p_amount*0.05,decimals);
  IF s.id IS NOT NULL THEN UPDATE public.work_submissions SET approval_status=CASE WHEN p_amount>0 THEN 'paid'::public.work_submission_status ELSE 'rejected'::public.work_submission_status END,
    approved_units=CASE WHEN p_amount>0 THEN greatest(1,approved_units) ELSE 0 END,gross_amount=p_amount,payout_amount=net,
    payout_state=CASE WHEN p_amount>0 THEN 'confirmed' ELSE 'unpaid' END,payout_tx_hash=CASE WHEN p_amount>0 THEN p_payload::jsonb->>'hash' ELSE NULL END,payout_chain_id=8453 WHERE id=s.id; END IF;
  UPDATE public.work_jobs SET status='completed',refunded_amount=p_refund WHERE id=j.id;
 ELSE
  IF p_refund <> 0 THEN RAISE EXCEPTION 'An unfunded bounty has no escrow to refund'; END IF;
  IF s.id IS NOT NULL THEN UPDATE public.work_submissions SET approval_status=CASE WHEN p_amount>0 THEN 'approved'::public.work_submission_status ELSE 'rejected'::public.work_submission_status END,
    approved_units=CASE WHEN p_amount>0 THEN greatest(1,approved_units) ELSE 0 END,payout_amount=p_amount,gross_amount=p_amount WHERE id=s.id; END IF;
  UPDATE public.work_jobs SET status='in_progress' WHERE id=j.id;
 END IF;
 UPDATE public.work_disputes SET status=CASE WHEN p_amount>0 THEN 'resolved_worker'::public.work_dispute_status ELSE 'resolved_poster'::public.work_dispute_status END,
  resolved_by_address=public.work_wallet(),resolved_at=now(),worker_amount=p_amount,poster_refund=p_refund,resolution_note=p_note,
  resolution_tx_hash=CASE WHEN j.fund_tx_hash IS NOT NULL THEN p_payload::jsonb->>'hash' ELSE NULL END WHERE id=d.id;
END $$;

COMMIT;
