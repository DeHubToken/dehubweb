BEGIN;

CREATE SCHEMA IF NOT EXISTS work_private;
REVOKE ALL ON SCHEMA work_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS work_private.receipt_key (id integer PRIMARY KEY CHECK (id = 1), key text NOT NULL);
CREATE TABLE IF NOT EXISTS work_private.arbiters (address text PRIMARY KEY);
-- Project owner's verified DeHub account. Additional seats are configured by the project owner.
INSERT INTO work_private.arbiters VALUES ('0x9324840523a5d17dd12a2f11a9472e5a199c1937') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.work_wallet() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE parts text[]; secret_key bytea; wallet text;
BEGIN
  parts := string_to_array(nullif(current_setting('request.headers', true), '')::json ->> 'x-wallet-session', '.');
  IF array_length(parts, 1) IS DISTINCT FROM 3 OR parts[1] !~ '^0x[a-f0-9]{40}$'
     OR parts[2] !~ '^[0-9]{1,12}$' OR parts[2]::bigint <= extract(epoch FROM now()) THEN
    RAISE EXCEPTION 'Sign in again to manage bounties' USING ERRCODE = '42501';
  END IF;
  SELECT key INTO secret_key FROM wallet_auth.secret WHERE id = 1;
  IF encode(extensions.hmac(convert_to(parts[1] || '.' || parts[2], 'UTF8'), secret_key, 'sha256'), 'hex') IS DISTINCT FROM parts[3] THEN
    RAISE EXCEPTION 'Invalid wallet session' USING ERRCODE = '42501';
  END IF;
  wallet := lower(nullif(current_setting('request.headers', true), '')::json ->> 'x-wallet-address');
  IF wallet IS NOT NULL AND wallet <> parts[1] THEN RAISE EXCEPTION 'Wallet session mismatch'; END IF;
  RETURN parts[1];
END $$;

CREATE OR REPLACE FUNCTION public.work_is_arbiter() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM work_private.arbiters WHERE address = public.work_wallet());
$$;

CREATE TABLE IF NOT EXISTS public.work_config (
  id integer PRIMARY KEY CHECK (id = 1),
  chain_id integer NOT NULL DEFAULT 8453 CHECK (chain_id = 8453),
  escrow_address text,
  owner_address text NOT NULL DEFAULT '0x9324840523a5d17dd12a2f11a9472e5a199c1937',
  deployment_tx_hash text
);
INSERT INTO public.work_config (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE public.work_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY work_config_read ON public.work_config FOR SELECT USING (true);
GRANT SELECT ON public.work_config TO anon, authenticated;

ALTER TABLE public.work_submissions ADD COLUMN IF NOT EXISTS approved_units integer NOT NULL DEFAULT 0;
ALTER TABLE public.work_submissions ADD COLUMN IF NOT EXISTS view_evidence_url text;
ALTER TABLE public.work_submissions ADD COLUMN IF NOT EXISTS payout_state text NOT NULL DEFAULT 'unpaid';
ALTER TABLE public.work_submissions ADD COLUMN IF NOT EXISTS payout_chain_id integer;
ALTER TABLE public.work_submissions ADD COLUMN IF NOT EXISTS gross_amount numeric NOT NULL DEFAULT 0;
UPDATE public.work_submissions SET approved_units = 1 WHERE approval_status IN ('approved','paid') AND approved_units = 0;
UPDATE public.work_submissions SET gross_amount = payout_amount WHERE approval_status IN ('approved','paid');
UPDATE public.work_submissions SET payout_state = 'confirmed', payout_chain_id = 8453 WHERE payout_tx_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.work_payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.work_submissions(id),
  job_id uuid NOT NULL REFERENCES public.work_jobs(id),
  payer_address text NOT NULL,
  worker_address text NOT NULL,
  currency public.work_currency NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  gross_amount numeric NOT NULL CHECK (gross_amount > 0),
  chain_id integer NOT NULL CHECK (chain_id IN (8453,56)),
  state text NOT NULL DEFAULT 'signing' CHECK (state IN ('signing','broadcast','confirmed','failed','cancelled')),
  tx_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain_id, tx_hash)
);
CREATE UNIQUE INDEX work_payment_one_active ON public.work_payment_intents(submission_id) WHERE state IN ('signing','broadcast','confirmed');
ALTER TABLE public.work_payment_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY work_payment_read ON public.work_payment_intents FOR SELECT USING (true);
GRANT SELECT ON public.work_payment_intents TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.work_payment_intents, public.work_config FROM anon, authenticated;

-- Every write policy requires the signed session, regardless of the global legacy-wallet switch.
DO $$ DECLARE policy record; BEGIN
  FOR policy IN SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('work_jobs','work_applications','work_submissions','work_reviews','work_disputes') AND cmd <> 'SELECT'
  LOOP EXECUTE format('DROP POLICY %I ON public.%I', policy.policyname, policy.tablename); END LOOP;
END $$;
CREATE POLICY work_jobs_insert ON public.work_jobs FOR INSERT WITH CHECK (lower(poster_address) = public.work_wallet());
CREATE POLICY work_jobs_update ON public.work_jobs FOR UPDATE USING (lower(poster_address) = public.work_wallet()) WITH CHECK (lower(poster_address) = public.work_wallet());
CREATE POLICY work_jobs_delete ON public.work_jobs FOR DELETE USING (lower(poster_address) = public.work_wallet() AND status = 'draft');
CREATE POLICY work_apps_insert ON public.work_applications FOR INSERT WITH CHECK (lower(applicant_address) = public.work_wallet());
CREATE POLICY work_apps_update ON public.work_applications FOR UPDATE USING (lower(applicant_address) = public.work_wallet()) WITH CHECK (lower(applicant_address) = public.work_wallet());
CREATE POLICY work_subs_insert ON public.work_submissions FOR INSERT WITH CHECK (lower(worker_address) = public.work_wallet());
CREATE POLICY work_subs_update ON public.work_submissions FOR UPDATE USING (lower(worker_address) = public.work_wallet()) WITH CHECK (lower(worker_address) = public.work_wallet());
CREATE POLICY work_subs_delete ON public.work_submissions FOR DELETE USING (lower(worker_address) = public.work_wallet() AND approval_status = 'pending');
CREATE POLICY work_reviews_insert ON public.work_reviews FOR INSERT WITH CHECK (lower(reviewer_address) = public.work_wallet());
-- Disputes and outcomes are written only by the transactional functions below.
REVOKE INSERT, UPDATE, DELETE ON public.work_disputes FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.work_lock_job(p_id uuid) RETURNS public.work_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j public.work_jobs;
BEGIN
  PERFORM public.work_wallet();
  SELECT * INTO STRICT j FROM public.work_jobs WHERE id = p_id FOR UPDATE;
  RETURN j;
END $$;
REVOKE ALL ON FUNCTION public.work_lock_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.work_lock_job(uuid) TO anon, authenticated;

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
      IF NEW.status <> 'draft' OR NEW.fund_tx_hash IS NOT NULL OR NEW.onchain_job_id IS NOT NULL OR NEW.funded_amount <> 0
         OR NEW.units_approved <> 0 OR NEW.released_amount <> 0 OR NEW.awarded_worker_address IS NOT NULL
         OR NEW.funding_state <> 'unfunded' OR NEW.pending_fund_tx_hash IS NOT NULL OR NEW.refunded_amount <> 0 THEN
        RAISE EXCEPTION 'Save a draft and verify escrow funding before publishing';
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
    IF j.status <> 'completed' OR NEW.reviewer_address = NEW.reviewee_address THEN RAISE EXCEPTION 'Reviews require completed work and a counterparty'; END IF;
    IF NEW.reviewer_role = 'poster' THEN
      IF j.poster_address <> who OR NOT EXISTS (SELECT 1 FROM public.work_submissions WHERE job_id = j.id AND worker_address = lower(NEW.reviewee_address) AND approval_status IN ('approved','paid')) THEN RAISE EXCEPTION 'Invalid review counterparty'; END IF;
    ELSE
      IF lower(NEW.reviewee_address) <> j.poster_address OR NOT EXISTS (SELECT 1 FROM public.work_submissions WHERE job_id = j.id AND worker_address = who AND approval_status IN ('approved','paid')) THEN RAISE EXCEPTION 'Only a worker on this bounty can review its poster'; END IF;
    END IF;
    NEW.reviewer_address := who; NEW.reviewee_address := lower(NEW.reviewee_address);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER work_integrity_jobs BEFORE INSERT OR UPDATE ON public.work_jobs FOR EACH ROW EXECUTE FUNCTION public.work_guard_write();
CREATE TRIGGER work_integrity_apps BEFORE INSERT OR UPDATE ON public.work_applications FOR EACH ROW EXECUTE FUNCTION public.work_guard_write();
CREATE TRIGGER work_integrity_subs BEFORE INSERT OR UPDATE ON public.work_submissions FOR EACH ROW EXECUTE FUNCTION public.work_guard_write();
CREATE TRIGGER work_integrity_reviews BEFORE INSERT ON public.work_reviews FOR EACH ROW EXECUTE FUNCTION public.work_guard_write();

CREATE OR REPLACE FUNCTION public.work_rollup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE jid uuid;
BEGIN
  jid := CASE WHEN TG_OP = 'DELETE' THEN OLD.job_id ELSE NEW.job_id END;
  PERFORM 1 FROM public.work_jobs WHERE id = jid FOR UPDATE;
  UPDATE public.work_jobs SET
    units_approved = (SELECT coalesce(sum(approved_units),0) FROM public.work_submissions WHERE job_id = jid AND approval_status IN ('approved','paid')),
    released_amount = (SELECT coalesce(sum(gross_amount),0) FROM public.work_submissions WHERE job_id = jid AND payout_state = 'confirmed')
  WHERE id = jid;
  RETURN NULL;
END $$;
CREATE TRIGGER work_integrity_rollup AFTER INSERT OR UPDATE OR DELETE ON public.work_submissions FOR EACH ROW EXECUTE FUNCTION public.work_rollup();
UPDATE public.work_jobs j SET
  units_approved = (SELECT coalesce(sum(approved_units),0) FROM public.work_submissions WHERE job_id = j.id AND approval_status IN ('approved','paid')),
  released_amount = (SELECT coalesce(sum(gross_amount),0) FROM public.work_submissions WHERE job_id = j.id AND payout_state = 'confirmed');

CREATE OR REPLACE FUNCTION public.work_approve(p_submission uuid, p_views integer DEFAULT NULL, p_evidence text DEFAULT NULL)
RETURNS public.work_submissions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.work_submissions; j public.work_jobs; units integer; committed integer;
BEGIN
  SELECT * INTO STRICT s FROM public.work_submissions WHERE id = p_submission;
  SELECT * INTO STRICT j FROM public.work_jobs WHERE id = s.job_id FOR UPDATE;
  SELECT * INTO STRICT s FROM public.work_submissions WHERE id = p_submission FOR UPDATE;
  IF j.poster_address <> public.work_wallet() AND NOT (j.status='disputed' AND public.work_is_arbiter()) THEN RAISE EXCEPTION 'Only the poster or dispute arbiter can approve work'; END IF;
  IF (j.status='disputed' AND NOT public.work_is_arbiter()) OR j.status NOT IN ('open','in_progress','expired','disputed') OR s.approval_status <> 'pending' THEN RAISE EXCEPTION 'Submission is not awaiting approval'; END IF;
  IF j.job_type = 'clipping' THEN
    IF p_views IS NULL OR p_views < 1000 OR p_evidence IS NULL OR p_evidence !~ '^https://[^[:space:]]+$' THEN RAISE EXCEPTION 'Verify the clip view count and provide its source before approving'; END IF;
    units := p_views / 1000;
  ELSE units := 1; END IF;
  SELECT coalesce(sum(approved_units),0) INTO committed FROM public.work_submissions WHERE job_id = j.id AND approval_status IN ('approved','paid');
  IF committed + units > j.max_units THEN RAISE EXCEPTION 'Approval exceeds the remaining bounty units'; END IF;
  UPDATE public.work_submissions SET approval_status = 'approved', approved_units = units,
    gross_amount = units * j.price_per_unit,
    payout_amount = units * j.price_per_unit - CASE WHEN j.fund_tx_hash IS NOT NULL THEN trunc(units * j.price_per_unit * 0.05, CASE WHEN j.currency = 'USDC' THEN 6 ELSE 18 END) ELSE 0 END,
    view_count_cached = CASE WHEN j.job_type = 'clipping' THEN p_views ELSE 0 END,
    view_evidence_url = CASE WHEN j.job_type = 'clipping' THEN p_evidence ELSE NULL END
  WHERE id = s.id RETURNING * INTO s;
  RETURN s;
END $$;

CREATE OR REPLACE FUNCTION public.work_action(p_action text, p_id uuid, p_note text DEFAULT NULL,p_payload text DEFAULT NULL,p_signature text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j public.work_jobs; a public.work_applications; s public.work_submissions; who text := public.work_wallet();
BEGIN
  IF p_action = 'award' THEN
    SELECT * INTO STRICT a FROM public.work_applications WHERE id = p_id;
    SELECT * INTO STRICT j FROM public.work_jobs WHERE id = a.job_id FOR UPDATE;
    IF j.poster_address <> who OR j.status <> 'open' OR j.job_type <> 'contract' OR a.status <> 'pending'
      OR (j.deadline IS NOT NULL AND j.deadline <= now()) THEN RAISE EXCEPTION 'Cannot award this application'; END IF;
    IF j.fund_tx_hash IS NOT NULL THEN PERFORM public.work_event(j.id,p_payload,p_signature,'Awarded',jsonb_build_object('worker',a.applicant_address)); END IF;
    UPDATE public.work_applications SET status = CASE WHEN id = a.id THEN 'awarded'::public.work_app_status ELSE 'rejected'::public.work_app_status END WHERE job_id = j.id AND status = 'pending';
    UPDATE public.work_jobs SET awarded_worker_address = a.applicant_address, status = 'in_progress' WHERE id = j.id;
  ELSIF p_action = 'reject' THEN
    SELECT * INTO STRICT s FROM public.work_submissions WHERE id = p_id;
    SELECT * INTO STRICT j FROM public.work_jobs WHERE id = s.job_id FOR UPDATE;
    IF (j.status='disputed' AND NOT public.work_is_arbiter()) OR (j.poster_address <> who AND NOT (j.status='disputed' AND public.work_is_arbiter()))
      OR (s.approval_status <> 'pending' AND NOT (j.status='disputed' AND public.work_is_arbiter() AND s.approval_status='approved' AND s.payout_state='unpaid'))
      OR j.status NOT IN ('open','in_progress','expired','disputed') THEN RAISE EXCEPTION 'Cannot reject this submission'; END IF;
    IF j.fund_tx_hash IS NOT NULL THEN PERFORM public.work_event(j.id,p_payload,p_signature,'ProofRejected',jsonb_build_object('proofHash',public.work_proof_hash(s.proof_url))); END IF;
    UPDATE public.work_submissions SET approval_status = 'rejected',approved_units=0,gross_amount=0,payout_amount=0,rejection_reason = nullif(btrim(p_note),'') WHERE id = s.id;
  ELSIF p_action = 'complete' THEN
    SELECT * INTO STRICT j FROM public.work_jobs WHERE id = p_id FOR UPDATE;
    IF j.poster_address <> who OR j.status NOT IN ('open','in_progress','expired') THEN RAISE EXCEPTION 'Cannot complete this bounty'; END IF;
    IF j.fund_tx_hash IS NOT NULL THEN PERFORM public.work_event(j.id,p_payload,p_signature,'JobClosed'); END IF;
    IF EXISTS (SELECT 1 FROM public.work_submissions WHERE job_id = j.id AND (approval_status = 'pending' OR (approval_status = 'approved' AND payout_state <> 'confirmed')))
      OR EXISTS (SELECT 1 FROM public.work_disputes WHERE job_id = j.id AND status = 'open') THEN RAISE EXCEPTION 'Review and settle outstanding work before completing'; END IF;
    UPDATE public.work_jobs SET status = 'completed',refunded_amount=CASE WHEN fund_tx_hash IS NOT NULL THEN total_budget-released_amount ELSE 0 END WHERE id = j.id;
  ELSIF p_action = 'dispute' THEN
    SELECT * INTO STRICT j FROM public.work_jobs WHERE id = p_id FOR UPDATE;
    IF j.status NOT IN ('open','in_progress','expired') OR nullif(btrim(p_note),'') IS NULL
      OR (j.poster_address <> who AND j.awarded_worker_address IS DISTINCT FROM who AND NOT EXISTS (SELECT 1 FROM public.work_submissions WHERE job_id = j.id AND worker_address = who)) THEN RAISE EXCEPTION 'Only bounty participants can open a dispute'; END IF;
    IF EXISTS (SELECT 1 FROM public.work_disputes WHERE job_id = j.id AND status = 'open') THEN RAISE EXCEPTION 'A dispute is already open'; END IF;
    IF j.fund_tx_hash IS NOT NULL THEN PERFORM public.work_event(j.id,p_payload,p_signature,'Disputed',jsonb_build_object('openedBy',who)); END IF;
    INSERT INTO public.work_disputes (job_id,opened_by_address,reason) VALUES (j.id,who,p_note);
    UPDATE public.work_jobs SET status = 'disputed' WHERE id = j.id;
  ELSE RAISE EXCEPTION 'Unknown bounty action'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.work_claim_payment(p_submission uuid, p_chain integer DEFAULT 8453)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.work_submissions; j public.work_jobs; intent public.work_payment_intents; who text := public.work_wallet();
BEGIN
  SELECT * INTO STRICT s FROM public.work_submissions WHERE id = p_submission;
  SELECT * INTO STRICT j FROM public.work_jobs WHERE id = s.job_id FOR UPDATE;
  SELECT * INTO STRICT s FROM public.work_submissions WHERE id = p_submission FOR UPDATE;
  IF (j.poster_address <> who AND NOT (j.fund_tx_hash IS NOT NULL AND j.status='disputed' AND public.work_is_arbiter())) OR j.status NOT IN ('open','in_progress','completed','expired','disputed') OR (j.status='disputed' AND NOT public.work_is_arbiter()) THEN RAISE EXCEPTION 'Only the poster can settle this bounty'; END IF;
  IF s.approval_status <> 'approved' OR s.payout_tx_hash IS NOT NULL OR s.payout_state = 'confirmed' THEN RAISE EXCEPTION 'This submission is not awaiting payment'; END IF;
  IF p_chain NOT IN (8453,56) OR (j.currency = 'USDC' AND p_chain <> 8453) OR (j.fund_tx_hash IS NOT NULL AND p_chain <> 8453) THEN RAISE EXCEPTION 'Use Base for USDC and escrow payouts'; END IF;
  SELECT * INTO intent FROM public.work_payment_intents WHERE submission_id = s.id AND state IN ('signing','broadcast','confirmed');
  IF FOUND THEN RETURN to_jsonb(intent) || jsonb_build_object('created',false,'amount',intent.amount::text); END IF;
  IF s.payout_amount <= 0 OR s.gross_amount + j.released_amount
    + (SELECT coalesce(sum(gross_amount),0) FROM public.work_payment_intents WHERE job_id = j.id AND state IN ('signing','broadcast')) > j.total_budget
  THEN RAISE EXCEPTION 'Payment exceeds the remaining bounty budget'; END IF;
  INSERT INTO public.work_payment_intents (submission_id,job_id,payer_address,worker_address,currency,amount,gross_amount,chain_id)
    VALUES (s.id,j.id,who,s.worker_address,j.currency,s.payout_amount,s.gross_amount,p_chain) RETURNING * INTO intent;
  UPDATE public.work_submissions SET payout_state = 'signing' WHERE id = s.id;
  RETURN to_jsonb(intent) || jsonb_build_object('created',true,'amount',intent.amount::text);
END $$;

CREATE OR REPLACE FUNCTION public.work_record_broadcast(p_intent uuid, p_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.work_payment_intents;
BEGIN
  SELECT * INTO STRICT i FROM public.work_payment_intents WHERE id = p_intent FOR UPDATE;
  IF i.payer_address <> public.work_wallet() OR i.state NOT IN ('signing','broadcast') OR p_hash !~ '^0x[a-fA-F0-9]{64}$' THEN RAISE EXCEPTION 'Invalid payment broadcast'; END IF;
  IF i.tx_hash IS NOT NULL AND i.tx_hash <> lower(p_hash) THEN RAISE EXCEPTION 'A different transaction is already recorded'; END IF;
  UPDATE public.work_payment_intents SET tx_hash = lower(p_hash), state = 'broadcast' WHERE id = i.id;
  UPDATE public.work_submissions SET payout_state = 'broadcast', payout_chain_id = i.chain_id WHERE id = i.submission_id;
END $$;

CREATE OR REPLACE FUNCTION public.work_cancel_signature(p_intent uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.work_payment_intents;
BEGIN
  SELECT * INTO STRICT i FROM public.work_payment_intents WHERE id = p_intent FOR UPDATE;
  IF i.payer_address <> public.work_wallet() OR i.state <> 'signing' OR i.tx_hash IS NOT NULL THEN RAISE EXCEPTION 'Broadcast payments must be reconciled before retrying'; END IF;
  UPDATE public.work_payment_intents SET state = 'cancelled' WHERE id = i.id;
  UPDATE public.work_submissions SET payout_state = 'unpaid' WHERE id = i.submission_id;
END $$;

CREATE OR REPLACE FUNCTION public.work_receipt(p_payload text, p_signature text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE secret_key text;
BEGIN
  SELECT key INTO STRICT secret_key FROM work_private.receipt_key WHERE id = 1;
  IF encode(extensions.hmac(convert_to(p_payload,'UTF8'),convert_to(secret_key,'UTF8'),'sha256'),'hex') IS DISTINCT FROM p_signature THEN RAISE EXCEPTION 'Invalid chain receipt attestation'; END IF;
  RETURN p_payload::jsonb;
END $$;
REVOKE ALL ON FUNCTION public.work_receipt(text,text) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.work_config ADD COLUMN expected_code_hash text;
UPDATE public.work_config SET expected_code_hash='0x52a2f76d7cb74f59522b40cd7e2284a2e285125c88d783342a7fcd6817d3c01a' WHERE id=1;
ALTER TABLE public.work_config ADD COLUMN fee_recipient text NOT NULL DEFAULT '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c';
ALTER TABLE public.work_jobs ADD COLUMN funding_state text NOT NULL DEFAULT 'unfunded';
ALTER TABLE public.work_jobs ADD COLUMN pending_fund_tx_hash text;
ALTER TABLE public.work_jobs ADD COLUMN refunded_amount numeric NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX work_unique_funding ON public.work_jobs(fund_tx_hash) WHERE fund_tx_hash IS NOT NULL;
CREATE UNIQUE INDEX work_unique_chain_job ON public.work_jobs(onchain_job_id) WHERE onchain_job_id IS NOT NULL;
CREATE TABLE public.work_proof_registrations (
  job_id uuid NOT NULL REFERENCES public.work_jobs(id), proof_hash text NOT NULL, worker_address text NOT NULL,
  tx_hash text NOT NULL, PRIMARY KEY(job_id,proof_hash)
);
ALTER TABLE public.work_proof_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY work_proof_read ON public.work_proof_registrations FOR SELECT USING (true);
GRANT SELECT ON public.work_proof_registrations TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.work_proof_registrations FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.work_proof_hash(p_url text) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT '0x' || encode(extensions.digest(convert_to(lower(btrim(p_url)),'UTF8'),'sha256'),'hex');
$$;

CREATE OR REPLACE FUNCTION public.work_event(p_job uuid,p_payload text,p_signature text,p_name text,p_match jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; j public.work_jobs; e jsonb; escrow text;
BEGIN
 r := public.work_receipt(p_payload,p_signature);
 SELECT * INTO STRICT j FROM public.work_jobs WHERE id=p_job;
 SELECT escrow_address INTO STRICT escrow FROM public.work_config WHERE id=1;
 IF r->>'status' <> 'confirmed' OR (r->>'chain')::integer <> 8453 THEN RAISE EXCEPTION 'Escrow transaction has not confirmed'; END IF;
 SELECT entry INTO e FROM jsonb_array_elements(r->'events') entry WHERE entry @> (p_match || jsonb_build_object('name',p_name,'escrow',escrow,'jobId',j.onchain_job_id::text)) LIMIT 1;
 IF e IS NULL THEN RAISE EXCEPTION 'Receipt does not contain the required escrow action'; END IF;
 RETURN e;
END $$;
REVOKE ALL ON FUNCTION public.work_event(uuid,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.work_activate_escrow(p_payload text,p_signature text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; c public.work_config; d jsonb;
BEGIN
 IF NOT public.work_is_arbiter() THEN RAISE EXCEPTION 'Only the project owner can activate escrow'; END IF;
 r := public.work_receipt(p_payload,p_signature); d:=r->'deployment';
 SELECT * INTO STRICT c FROM public.work_config WHERE id=1 FOR UPDATE;
 IF c.expected_code_hash IS NULL OR d->>'codeHash' IS DISTINCT FROM c.expected_code_hash OR d->>'owner' IS DISTINCT FROM c.owner_address
  OR d->>'feeRecipient' IS DISTINCT FROM c.fee_recipient OR d->>'dhbAllowed' IS DISTINCT FROM 'true' OR d->>'usdcAllowed' IS DISTINCT FROM 'true'
  OR r->>'status' <> 'confirmed' OR (r->>'chain')::integer <> 8453 THEN RAISE EXCEPTION 'Deployment does not match the tested escrow configuration'; END IF;
 IF c.escrow_address IS NOT NULL AND c.escrow_address <> d->>'address' THEN RAISE EXCEPTION 'Escrow is already configured'; END IF;
 UPDATE public.work_config SET escrow_address=d->>'address',deployment_tx_hash=r->>'hash' WHERE id=1;
END $$;

CREATE OR REPLACE FUNCTION public.work_claim_funding(p_job uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.work_jobs; fresh boolean;
BEGIN
 SELECT * INTO STRICT j FROM public.work_jobs WHERE id=p_job FOR UPDATE;
 IF j.poster_address <> public.work_wallet() OR j.status <> 'draft' OR j.deadline IS NULL OR (j.funding_state='unfunded' AND j.deadline <= now()) THEN RAISE EXCEPTION 'Only a current draft can be funded'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.work_config WHERE id=1 AND escrow_address IS NOT NULL) THEN RAISE EXCEPTION 'Escrow setup is required before publishing. Your draft is saved.'; END IF;
 fresh := j.funding_state='unfunded';
 IF fresh THEN UPDATE public.work_jobs SET funding_state='signing' WHERE id=j.id; END IF;
 RETURN jsonb_build_object('created',fresh,'hash',j.pending_fund_tx_hash);
END $$;

CREATE OR REPLACE FUNCTION public.work_record_funding(p_job uuid,p_hash text DEFAULT NULL,p_cancel boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.work_jobs;
BEGIN
 SELECT * INTO STRICT j FROM public.work_jobs WHERE id=p_job FOR UPDATE;
 IF j.poster_address <> public.work_wallet() OR j.status <> 'draft' OR j.funding_state NOT IN ('signing','broadcast') THEN RAISE EXCEPTION 'Invalid funding reservation'; END IF;
 IF p_cancel THEN
  IF j.pending_fund_tx_hash IS NOT NULL THEN RAISE EXCEPTION 'Check the recorded funding transaction first'; END IF;
  UPDATE public.work_jobs SET funding_state='unfunded' WHERE id=j.id;
 ELSE
  IF p_hash !~ '^0x[a-fA-F0-9]{64}$' OR (j.pending_fund_tx_hash IS NOT NULL AND j.pending_fund_tx_hash <> lower(p_hash)) THEN RAISE EXCEPTION 'Invalid funding transaction'; END IF;
  UPDATE public.work_jobs SET funding_state='broadcast',pending_fund_tx_hash=lower(p_hash) WHERE id=j.id;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.work_publish_funded(p_job uuid,p_payload text,p_signature text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.work_jobs; r jsonb; e jsonb; c public.work_config; token text; decimals integer;
BEGIN
 SELECT * INTO STRICT j FROM public.work_jobs WHERE id=p_job FOR UPDATE;
 IF j.poster_address <> public.work_wallet() OR j.status <> 'draft' THEN RAISE EXCEPTION 'Only the poster can publish this draft'; END IF;
 r := public.work_receipt(p_payload,p_signature);
 IF r->>'id' <> j.id::text OR (r->>'chain')::integer <> 8453 OR r->>'hash' IS DISTINCT FROM j.pending_fund_tx_hash THEN RAISE EXCEPTION 'Receipt does not match draft funding'; END IF;
 IF r->>'status'='failed' THEN UPDATE public.work_jobs SET funding_state='unfunded',pending_fund_tx_hash=NULL WHERE id=j.id; RETURN; END IF;
 IF r->>'status' <> 'confirmed' THEN RAISE EXCEPTION 'Funding has not confirmed'; END IF;
 SELECT * INTO STRICT c FROM public.work_config WHERE id=1;
 token := CASE WHEN j.currency='USDC' THEN '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' ELSE '0xd20ab1015f6a2de4a6fddebab270113f689c2f7c' END;
 decimals := CASE WHEN j.currency='USDC' THEN 6 ELSE 18 END;
 SELECT entry INTO e FROM jsonb_array_elements(r->'createdJobs') entry WHERE entry->>'escrow'=c.escrow_address AND entry->>'poster'=j.poster_address AND entry->>'token'=token
  AND (entry->>'jobType')::integer=CASE j.job_type WHEN 'shill' THEN 0 WHEN 'clipping' THEN 1 ELSE 2 END
  AND (entry->>'amount')::numeric=j.total_budget*power(10::numeric,decimals)
  AND (entry->>'pricePerUnit')::numeric=j.price_per_unit*power(10::numeric,decimals)
  AND (entry->>'maxUnits')::integer=j.max_units AND (entry->>'deadline')::bigint=floor(extract(epoch FROM j.deadline)) LIMIT 1;
 IF e IS NULL THEN RAISE EXCEPTION 'Funding amount and bounty terms do not match the draft'; END IF;
 UPDATE public.work_jobs SET status='open',fund_tx_hash=r->>'hash',onchain_job_id=(e->>'jobId')::bigint,funded_amount=total_budget,funding_state='confirmed' WHERE id=j.id;
END $$;

CREATE OR REPLACE FUNCTION public.work_record_proof(p_job uuid,p_url text,p_payload text,p_signature text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e jsonb; r jsonb; who text:=public.work_wallet();
BEGIN
 e:=public.work_event(p_job,p_payload,p_signature,'ProofRegistered',jsonb_build_object('worker',who,'proofHash',public.work_proof_hash(p_url)));
 r:=p_payload::jsonb;
 INSERT INTO public.work_proof_registrations VALUES(p_job,e->>'proofHash',who,r->>'hash') ON CONFLICT(job_id,proof_hash) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.work_proof_registered(p_job uuid,p_url text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.work_proof_registrations WHERE job_id=p_job AND proof_hash=public.work_proof_hash(p_url) AND worker_address=public.work_wallet());
$$;
REVOKE ALL ON FUNCTION public.work_proof_registered(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.work_proof_registered(uuid,text) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.work_guard_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE j public.work_jobs;
BEGIN
 IF current_user IN ('postgres','service_role','supabase_admin') THEN RETURN OLD; END IF;
 j:=public.work_lock_job(CASE WHEN TG_TABLE_NAME='work_jobs' THEN OLD.id ELSE OLD.job_id END);
 IF j.fund_tx_hash IS NOT NULL OR j.funding_state <> 'unfunded' OR j.status='disputed' THEN RAISE EXCEPTION 'Funded or disputed evidence cannot be deleted'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER work_integrity_delete_subs BEFORE DELETE ON public.work_submissions FOR EACH ROW EXECUTE FUNCTION public.work_guard_delete();
CREATE TRIGGER work_integrity_delete_jobs BEFORE DELETE ON public.work_jobs FOR EACH ROW EXECUTE FUNCTION public.work_guard_delete();

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('work_activate_escrow','work_claim_funding','work_record_funding','work_publish_funded','work_record_proof','work_proof_hash')
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature); EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon,authenticated',f.signature); END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.work_finalize_payment(p_intent uuid, p_payload text, p_signature text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.work_payment_intents; j public.work_jobs; receipt jsonb; token text; decimals integer; source text; transferred numeric;
BEGIN
  receipt := public.work_receipt(p_payload,p_signature);
  SELECT * INTO STRICT i FROM public.work_payment_intents WHERE id = p_intent;
  SELECT * INTO STRICT j FROM public.work_jobs WHERE id = i.job_id FOR UPDATE;
  SELECT * INTO STRICT i FROM public.work_payment_intents WHERE id = p_intent FOR UPDATE;
  IF public.work_wallet() <> i.payer_address THEN RAISE EXCEPTION 'Only the payer can reconcile this payment'; END IF;
  IF receipt->>'id' <> i.id::text OR (receipt->>'chain')::integer <> i.chain_id OR receipt->>'hash' IS DISTINCT FROM i.tx_hash THEN RAISE EXCEPTION 'Receipt does not match the reserved payment'; END IF;
  IF i.state = 'confirmed' THEN RETURN 'confirmed'; END IF;
  IF i.state <> 'broadcast' THEN RAISE EXCEPTION 'Record the broadcast before reconciliation'; END IF;
  IF (receipt->>'minedAt')::timestamptz < i.created_at - interval '5 minutes' THEN RAISE EXCEPTION 'Historical transfers cannot be replayed as new payments'; END IF;
  IF receipt->>'status' = 'failed' THEN
    UPDATE public.work_payment_intents SET state = 'failed' WHERE id = i.id;
    UPDATE public.work_submissions SET payout_state = 'unpaid' WHERE id = i.submission_id;
    RETURN 'failed';
  END IF;
  IF receipt->>'status' <> 'confirmed' THEN RAISE EXCEPTION 'Payment has not confirmed'; END IF;
  token := CASE WHEN i.currency = 'USDC' THEN '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' WHEN i.chain_id = 56 THEN '0x680d3113caf77b61b510f332d5ef4cf5b41a761d' ELSE '0xd20ab1015f6a2de4a6fddebab270113f689c2f7c' END;
  decimals := CASE WHEN i.currency = 'USDC' THEN 6 ELSE 18 END;
  source := CASE WHEN j.fund_tx_hash IS NOT NULL THEN (SELECT escrow_address FROM public.work_config WHERE id = 1) ELSE i.payer_address END;
  SELECT coalesce(sum((entry->>'amount')::numeric),0) INTO transferred FROM jsonb_array_elements(receipt->'transfers') entry
    WHERE entry->>'token' = token AND entry->>'from' = source AND entry->>'to' = i.worker_address;
  IF transferred <> i.amount * power(10::numeric,decimals) THEN RAISE EXCEPTION 'Receipt token, sender, worker or amount does not match this payout'; END IF;
  IF j.fund_tx_hash IS NOT NULL THEN
    PERFORM public.work_event(j.id,p_payload,p_signature,'SubmissionApproved',jsonb_build_object('worker',i.worker_address,'paymentId','0x' || encode(extensions.digest(convert_to(i.id::text,'UTF8'),'sha256'),'hex'),
      'proofHash',(SELECT public.work_proof_hash(proof_url) FROM public.work_submissions WHERE id=i.submission_id)));
  END IF;
  UPDATE public.work_payment_intents SET state = 'confirmed' WHERE id = i.id;
  UPDATE public.work_submissions SET approval_status = 'paid', payout_state = 'confirmed', payout_tx_hash = i.tx_hash, payout_chain_id = i.chain_id WHERE id = i.submission_id;
  IF j.fund_tx_hash IS NOT NULL AND j.status <> 'disputed' AND NOT EXISTS(SELECT 1 FROM public.work_submissions WHERE job_id=j.id AND approval_status IN ('pending','approved'))
    AND (SELECT units_approved FROM public.work_jobs WHERE id=j.id) >= j.max_units THEN UPDATE public.work_jobs SET status='completed' WHERE id=j.id; END IF;
  RETURN 'confirmed';
END $$;

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
 IF EXISTS(SELECT 1 FROM public.work_submissions WHERE job_id=j.id AND id IS DISTINCT FROM s.id AND approval_status IN ('pending','approved')) THEN RAISE EXCEPTION 'Review and settle other submissions before resolving'; END IF;
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

-- Revoke the default PUBLIC execution grant on every new entry point explicitly.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('work_wallet','work_is_arbiter','work_approve','work_action','work_claim_payment','work_record_broadcast','work_cancel_signature','work_finalize_payment','work_resolve_dispute')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f.signature);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.work_expire_jobs() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.work_jobs SET status = 'expired' WHERE status IN ('open','in_progress') AND deadline <= now();
$$;
REVOKE ALL ON FUNCTION public.work_expire_jobs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.work_expire_jobs() TO service_role;
SELECT public.work_expire_jobs();
SELECT cron.schedule('work-expire-bounties', '*/15 * * * *', 'SELECT public.work_expire_jobs()');

COMMIT;
