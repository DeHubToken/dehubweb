-- DAO treasury proposals and manual buy offers
-- =============================================
--
-- This is deliberately not an escrow system. A proposal records an intent,
-- contributors decide it, an accepted buyer pays the DAO directly, and the
-- DAO records verification/fulfilment later (the future multisig can own that
-- final write path without changing the proposal or vote model).

CREATE TABLE public.dao_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposer_address TEXT NOT NULL,
  proposer_username TEXT,
  proposer_avatar TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('spend', 'buy')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 4000),

  -- A buy offer is price × DHB quantity. The stored total is authoritative,
  -- rather than a later market-price lookup changing what contributors voted on.
  dhb_amount NUMERIC(30, 6),
  price_usd NUMERIC(30, 8),
  total_usd NUMERIC(30, 2),

  -- A spend request says exactly what leaves the treasury and where. Nothing
  -- is sent automatically; an accepted request is queued for manual execution.
  spend_asset TEXT,
  spend_amount NUMERIC(30, 8),
  recipient_address TEXT,

  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'accepted', 'rejected', 'payment_submitted', 'completed', 'expired', 'cancelled')),
  electorate_dhb NUMERIC(30, 6) NOT NULL DEFAULT 0,
  accept_dhb NUMERIC(30, 6) NOT NULL DEFAULT 0,
  reject_dhb NUMERIC(30, 6) NOT NULL DEFAULT 0,
  voting_ends_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  payment_due_at TIMESTAMPTZ,
  voting_reminder_sent_at TIMESTAMPTZ,
  payment_reminder_sent_at TIMESTAMPTZ,

  -- Filled when an accepted buyer has paid. The transaction is evidence for
  -- manual review, never an automatic claim that payment was valid.
  payment_chain_id INTEGER,
  payment_asset TEXT,
  payment_amount NUMERIC(30, 8),
  payment_tx_hash TEXT,
  payment_submitted_at TIMESTAMPTZ,
  payment_verified_at TIMESTAMPTZ,
  payment_verified_by TEXT,
  fulfilment_tx_hash TEXT,
  fulfilled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT dao_buy_shape CHECK (
    kind <> 'buy' OR (
      dhb_amount > 0 AND price_usd > 0 AND total_usd > 0
      AND spend_asset IS NULL AND spend_amount IS NULL
    )
  ),
  CONSTRAINT dao_spend_shape CHECK (
    kind <> 'spend' OR (
      spend_asset IS NOT NULL AND spend_amount > 0 AND recipient_address IS NOT NULL
      AND dhb_amount IS NULL AND price_usd IS NULL AND total_usd IS NULL
    )
  )
);

-- Eligibility and weight are a snapshot taken when the proposal opens. A late
-- transfer cannot rewrite an active vote, and a contributor cannot move DHB
-- between addresses to vote repeatedly because historical contribution is
-- attached to one wallet in this snapshot.
CREATE TABLE public.dao_proposal_voters (
  proposal_id UUID NOT NULL REFERENCES public.dao_proposals(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  vote_weight NUMERIC(30, 6) NOT NULL CHECK (vote_weight > 0),
  PRIMARY KEY (proposal_id, wallet_address)
);

CREATE TABLE public.dao_proposal_votes (
  proposal_id UUID NOT NULL REFERENCES public.dao_proposals(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  vote_type SMALLINT NOT NULL CHECK (vote_type IN (-1, 1)),
  vote_weight NUMERIC(30, 6) NOT NULL CHECK (vote_weight > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, wallet_address),
  FOREIGN KEY (proposal_id, wallet_address)
    REFERENCES public.dao_proposal_voters(proposal_id, wallet_address)
    ON DELETE CASCADE
);

CREATE INDEX dao_proposals_status_created_idx
  ON public.dao_proposals(status, created_at DESC);
CREATE INDEX dao_proposals_deadline_idx
  ON public.dao_proposals(voting_ends_at) WHERE status = 'open';
CREATE INDEX dao_proposals_proposer_idx
  ON public.dao_proposals(lower(proposer_address), created_at DESC);
CREATE UNIQUE INDEX dao_proposals_evm_payment_tx_idx
  ON public.dao_proposals(lower(payment_tx_hash))
  WHERE payment_tx_hash IS NOT NULL AND payment_chain_id <> 101;
CREATE UNIQUE INDEX dao_proposals_solana_payment_tx_idx
  ON public.dao_proposals(payment_tx_hash)
  WHERE payment_tx_hash IS NOT NULL AND payment_chain_id = 101;

ALTER TABLE public.dao_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dao_proposal_voters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dao_proposal_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "DAO proposals are public"
  ON public.dao_proposals FOR SELECT USING (true);
CREATE POLICY "DAO voter snapshots are public"
  ON public.dao_proposal_voters FOR SELECT USING (true);
CREATE POLICY "DAO votes are public"
  ON public.dao_proposal_votes FOR SELECT USING (true);

GRANT SELECT ON public.dao_proposals, public.dao_proposal_voters, public.dao_proposal_votes
  TO anon, authenticated;

-- All consequential writes go through dao-proposals. Identity comes from a
-- verified DeHub token there and vote weight comes from dao_proposal_voters.
REVOKE INSERT, UPDATE, DELETE ON public.dao_proposals FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dao_proposal_voters FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dao_proposal_votes FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.recount_dao_proposal_votes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  target UUID;
BEGIN
  target := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.proposal_id
    ELSE NEW.proposal_id
  END;

  UPDATE public.dao_proposals p
  SET accept_dhb = COALESCE((
        SELECT SUM(v.vote_weight) FROM public.dao_proposal_votes v
        WHERE v.proposal_id = target AND v.vote_type = 1
      ), 0),
      reject_dhb = COALESCE((
        SELECT SUM(v.vote_weight) FROM public.dao_proposal_votes v
        WHERE v.proposal_id = target AND v.vote_type = -1
      ), 0),
      updated_at = now()
  WHERE p.id = target;
  RETURN NULL;
END;
$fn$;

CREATE TRIGGER recount_dao_votes
AFTER INSERT OR UPDATE OR DELETE ON public.dao_proposal_votes
FOR EACH ROW EXECUTE FUNCTION public.recount_dao_proposal_votes();

-- Verdict/payment notifications are driven from the server-owned status row,
-- so nobody can spoof one by inserting a custom notification from the client.
CREATE OR REPLACE FUNCTION public.notify_dao_proposal_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  message TEXT;
  notification_type TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  IF NEW.status = 'accepted' THEN
    notification_type := 'dao_proposal_accepted';
    message := CASE WHEN NEW.kind = 'buy'
      THEN 'Your DAO buy offer was accepted. Pay the agreed $' || NEW.total_usd || ' within 72 hours.'
      ELSE 'Your DAO spend request was accepted and is ready for manual execution.' END;
  ELSIF NEW.status = 'rejected' THEN
    notification_type := 'dao_proposal_rejected';
    message := 'Your DAO proposal was not accepted.';
  ELSIF NEW.status = 'payment_submitted' THEN
    notification_type := 'dao_payment_submitted';
    message := 'Payment proof was submitted for an accepted DAO buy offer and is waiting for manual verification.';
  ELSIF NEW.status = 'expired' THEN
    notification_type := 'dao_payment_expired';
    message := 'The accepted DAO buy offer expired before payment was submitted.';
  ELSIF NEW.status = 'completed' THEN
    notification_type := 'dao_proposal_completed';
    message := 'The DAO proposal has been manually verified and completed.';
  ELSE
    RETURN NEW;
  END IF;

  -- The proposer always gets the verdict. Voters get payment/completion
  -- updates because those are the events that require public accountability.
  INSERT INTO public.custom_notifications (
    recipient_address, actor_address, type, content, reference_id, reference_title
  ) VALUES (
    lower(NEW.proposer_address), lower(NEW.proposer_address), notification_type,
    message, NEW.id::text, NEW.title
  );

  IF NEW.status IN ('payment_submitted', 'completed') THEN
    INSERT INTO public.custom_notifications (
      recipient_address, actor_address, type, content, reference_id, reference_title
    )
    SELECT DISTINCT lower(v.wallet_address), lower(NEW.proposer_address), notification_type,
      message, NEW.id::text, NEW.title
    FROM public.dao_proposal_votes v
    WHERE v.proposal_id = NEW.id
      AND lower(v.wallet_address) <> lower(NEW.proposer_address);
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE TRIGGER notify_dao_status
AFTER UPDATE OF status ON public.dao_proposals
FOR EACH ROW EXECUTE FUNCTION public.notify_dao_proposal_status();

-- Resolve voting, expire unpaid offers, and deliver deadline reminders. The
-- voter snapshot lets this run entirely in Postgres without trusting a client
-- or needing to rescan two chains every ten minutes.
CREATE OR REPLACE FUNCTION public.resolve_due_dao_proposals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  changed integer := 0;
  affected integer := 0;
BEGIN
  -- One reminder, 24 hours before voting closes, only to people who have not
  -- voted. A unique transition marker on the proposal prevents cron spam.
  INSERT INTO public.custom_notifications (
    recipient_address, actor_address, type, content, reference_id, reference_title
  )
  SELECT lower(e.wallet_address), lower(p.proposer_address), 'dao_vote_deadline',
    '24 hours left to accept or reject this DAO proposal.', p.id::text, p.title
  FROM public.dao_proposals p
  JOIN public.dao_proposal_voters e ON e.proposal_id = p.id
  LEFT JOIN public.dao_proposal_votes v
    ON v.proposal_id = p.id AND v.wallet_address = e.wallet_address
  WHERE p.status = 'open'
    AND p.voting_reminder_sent_at IS NULL
    AND p.voting_ends_at > now()
    AND p.voting_ends_at <= now() + interval '24 hours'
    AND v.wallet_address IS NULL;

  UPDATE public.dao_proposals
  SET voting_reminder_sent_at = now(), updated_at = now()
  WHERE status = 'open'
    AND voting_reminder_sent_at IS NULL
    AND voting_ends_at > now()
    AND voting_ends_at <= now() + interval '24 hours';

  UPDATE public.dao_proposals p
  SET status = CASE
        WHEN p.accept_dhb > p.reject_dhb
         AND (p.accept_dhb + p.reject_dhb) >= (p.electorate_dhb * 0.10)
        THEN 'accepted' ELSE 'rejected' END,
      accepted_at = CASE
        WHEN p.accept_dhb > p.reject_dhb
         AND (p.accept_dhb + p.reject_dhb) >= (p.electorate_dhb * 0.10)
        THEN now() ELSE NULL END,
      payment_due_at = CASE
        WHEN p.kind = 'buy'
         AND p.accept_dhb > p.reject_dhb
         AND (p.accept_dhb + p.reject_dhb) >= (p.electorate_dhb * 0.10)
        THEN now() + interval '72 hours' ELSE NULL END,
      updated_at = now()
  WHERE p.status = 'open' AND p.voting_ends_at <= now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  changed := changed + affected;

  INSERT INTO public.custom_notifications (
    recipient_address, actor_address, type, content, reference_id, reference_title
  )
  SELECT lower(p.proposer_address), lower(p.proposer_address), 'dao_payment_deadline',
    '24 hours left to pay this accepted DAO buy offer.', p.id::text, p.title
  FROM public.dao_proposals p
  WHERE p.status = 'accepted' AND p.kind = 'buy'
    AND p.payment_tx_hash IS NULL
    AND p.payment_reminder_sent_at IS NULL
    AND p.payment_due_at > now()
    AND p.payment_due_at <= now() + interval '24 hours';

  UPDATE public.dao_proposals
  SET payment_reminder_sent_at = now(), updated_at = now()
  WHERE status = 'accepted' AND kind = 'buy'
    AND payment_tx_hash IS NULL
    AND payment_reminder_sent_at IS NULL
    AND payment_due_at > now()
    AND payment_due_at <= now() + interval '24 hours';

  UPDATE public.dao_proposals
  SET status = 'expired', updated_at = now()
  WHERE status = 'accepted' AND kind = 'buy'
    AND payment_tx_hash IS NULL AND payment_due_at <= now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  changed := changed + affected;

  RETURN changed;
END;
$fn$;

REVOKE ALL ON FUNCTION public.resolve_due_dao_proposals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_due_dao_proposals() TO service_role;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'resolve-dao-proposals') THEN
    PERFORM cron.schedule(
      'resolve-dao-proposals',
      '*/10 * * * *',
      $cron$SELECT public.resolve_due_dao_proposals()$cron$
    );
  END IF;
END
$do$;

DO $do$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.dao_proposals;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$do$;
