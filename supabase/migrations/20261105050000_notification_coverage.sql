-- Notifications that were missing from the Requests board, governance polls
-- and the DAO. Every row lands in custom_notifications like the rest, so the
-- bell, the app list and the push relay pick them up with no client change
-- beyond a sentence.
--
--   feature_request_comment_like  someone liked your comment on a request
--   governance_comment_like       someone liked your comment on a proposal
--   feature_request_status        your request moved to Queued or Shipped
--                                 (Shipped also tells everyone who liked it)
--   governance_result             a proposal you wrote or voted on closed
--   dao_proposal_accepted/rejected  now also reach the contributors who voted
--
-- Idempotent: safe to run again.

-- ── Likes on request comments ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_feature_request_comment_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.reaction = 'dislike' THEN RETURN NEW; END IF;
  INSERT INTO public.custom_notifications (
    recipient_address, actor_address, type, content,
    reference_id, reference_title, reference_comment_id
  )
  SELECT lower(c.wallet_address), lower(NEW.wallet_address), 'feature_request_comment_like',
         LEFT(c.content, 100), fr.id::text, fr.title, c.id::text
  FROM public.feature_request_comments c
  JOIN public.feature_requests fr ON fr.id = c.feature_request_id
  WHERE c.id = NEW.comment_id
    AND lower(c.wallet_address) <> lower(NEW.wallet_address)
    -- Unlike and like again is one notification, not two.
    AND NOT EXISTS (
      SELECT 1 FROM public.custom_notifications n
      WHERE n.type = 'feature_request_comment_like'
        AND n.reference_comment_id = c.id::text
        AND lower(n.actor_address) = lower(NEW.wallet_address)
    );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_feature_request_comment_like ON public.feature_request_comment_reactions;
CREATE TRIGGER on_feature_request_comment_like
  AFTER INSERT ON public.feature_request_comment_reactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_feature_request_comment_like();

-- ── Likes on proposal comments ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_governance_comment_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.reaction = 'dislike' THEN RETURN NEW; END IF;
  INSERT INTO public.custom_notifications (
    recipient_address, actor_address, type, content,
    reference_id, reference_title, reference_comment_id
  )
  SELECT lower(c.wallet_address), lower(NEW.wallet_address), 'governance_comment_like',
         LEFT(c.content, 100), gp.id::text, gp.title, c.id::text
  FROM public.governance_comments c
  JOIN public.governance_proposals gp ON gp.id = c.proposal_id
  WHERE c.id = NEW.comment_id
    AND lower(c.wallet_address) <> lower(NEW.wallet_address)
    AND NOT EXISTS (
      SELECT 1 FROM public.custom_notifications n
      WHERE n.type = 'governance_comment_like'
        AND n.reference_comment_id = c.id::text
        AND lower(n.actor_address) = lower(NEW.wallet_address)
    );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_governance_comment_like ON public.governance_comment_reactions;
CREATE TRIGGER on_governance_comment_like
  AFTER INSERT ON public.governance_comment_reactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_governance_comment_like();

-- ── A request moved to Queued or Shipped ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_feature_request_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  editor text := lower(COALESCE(public.get_signed_request_wallet_address(), ''));
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('in_progress', 'shipped') THEN RETURN NEW; END IF;
  IF editor = '' THEN editor := lower(NEW.author_wallet_address); END IF;

  INSERT INTO public.custom_notifications (
    recipient_address, actor_address, type, content, reference_id, reference_title
  ) VALUES (
    lower(NEW.author_wallet_address), editor, 'feature_request_status',
    CASE WHEN NEW.status = 'shipped' THEN 'shipped' ELSE 'in_progress' END,
    NEW.id::text, NEW.title
  );

  -- Shipped is news for everyone who liked the idea, not only its author.
  IF NEW.status = 'shipped' THEN
    INSERT INTO public.custom_notifications (
      recipient_address, actor_address, type, content, reference_id, reference_title
    )
    SELECT DISTINCT lower(v.wallet_address), editor, 'feature_request_status',
           'shipped_liked', NEW.id::text, NEW.title
    FROM public.feature_request_votes v
    WHERE v.feature_request_id = NEW.id
      AND v.vote_type = 1
      AND lower(v.wallet_address) <> lower(NEW.author_wallet_address);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_feature_request_status ON public.feature_requests;
CREATE TRIGGER on_feature_request_status
  AFTER UPDATE OF status ON public.feature_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_feature_request_status();

-- ── A governance proposal closed ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_governance_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF OLD.status <> 'open' OR NEW.status NOT IN ('passed', 'rejected') THEN RETURN NEW; END IF;

  INSERT INTO public.custom_notifications (
    recipient_address, actor_address, type, content, reference_id, reference_title
  ) VALUES (
    lower(NEW.author_wallet_address), lower(NEW.author_wallet_address), 'governance_result',
    NEW.status, NEW.id::text, NEW.title
  );

  INSERT INTO public.custom_notifications (
    recipient_address, actor_address, type, content, reference_id, reference_title
  )
  SELECT DISTINCT lower(v.wallet_address), lower(NEW.author_wallet_address), 'governance_result',
         NEW.status || '_voted', NEW.id::text, NEW.title
  FROM public.governance_votes v
  WHERE v.proposal_id = NEW.id
    AND lower(v.wallet_address) <> lower(NEW.author_wallet_address);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_governance_result ON public.governance_proposals;
CREATE TRIGGER on_governance_result
  AFTER UPDATE OF status ON public.governance_proposals
  FOR EACH ROW EXECUTE FUNCTION public.notify_governance_result();

-- ── DAO verdicts reach the contributors who voted ───────────────────────────
-- Same function as 20260908163000, plus the voter rows for accepted/rejected.
CREATE OR REPLACE FUNCTION public.notify_dao_proposal_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  message TEXT;
  voter_message TEXT;
  notification_type TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  IF NEW.status = 'accepted' THEN
    notification_type := 'dao_proposal_accepted';
    message := CASE WHEN NEW.kind = 'buy'
      THEN 'Your DAO buy offer was accepted. Pay the agreed $' || NEW.total_usd || ' within 72 hours.'
      ELSE 'Your DAO spend request was accepted and is ready for manual execution.' END;
    voter_message := 'A DAO proposal you voted on was accepted.';
  ELSIF NEW.status = 'rejected' THEN
    notification_type := 'dao_proposal_rejected';
    message := 'Your DAO proposal was not accepted.';
    voter_message := 'A DAO proposal you voted on was not accepted.';
  ELSIF NEW.status = 'payment_submitted' THEN
    notification_type := 'dao_payment_submitted';
    message := 'Payment proof was submitted for an accepted DAO buy offer and is waiting for manual verification.';
    voter_message := message;
  ELSIF NEW.status = 'expired' THEN
    notification_type := 'dao_payment_expired';
    message := 'The accepted DAO buy offer expired before payment was submitted.';
  ELSIF NEW.status = 'completed' THEN
    notification_type := 'dao_proposal_completed';
    message := 'The DAO proposal has been manually verified and completed.';
    voter_message := message;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.custom_notifications (
    recipient_address, actor_address, type, content, reference_id, reference_title
  ) VALUES (
    lower(NEW.proposer_address), lower(NEW.proposer_address), notification_type,
    message, NEW.id::text, NEW.title
  );

  IF voter_message IS NOT NULL THEN
    INSERT INTO public.custom_notifications (
      recipient_address, actor_address, type, content, reference_id, reference_title
    )
    SELECT DISTINCT lower(v.wallet_address), lower(NEW.proposer_address), notification_type,
      voter_message, NEW.id::text, NEW.title
    FROM public.dao_proposal_votes v
    WHERE v.proposal_id = NEW.id
      AND lower(v.wallet_address) <> lower(NEW.proposer_address);
  END IF;

  RETURN NEW;
END;
$fn$;

-- The push relay reads new rows in order; this keeps that read cheap.
CREATE INDEX IF NOT EXISTS custom_notifications_created_id_idx
  ON public.custom_notifications (created_at, id);
