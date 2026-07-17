
-- Trigger: notify when someone comments on a feature request
CREATE OR REPLACE FUNCTION public.notify_feature_request_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.custom_notifications (
    recipient_address,
    actor_address,
    actor_username,
    actor_avatar,
    type,
    content,
    reference_id,
    reference_title
  )
  SELECT
    fr.author_wallet_address,
    NEW.wallet_address,
    NEW.username,
    NEW.avatar,
    'feature_request_comment',
    LEFT(NEW.content, 100),
    fr.id::text,
    fr.title
  FROM public.feature_requests fr
  WHERE fr.id = NEW.feature_request_id
    AND lower(fr.author_wallet_address) != lower(NEW.wallet_address);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_feature_request_comment
AFTER INSERT ON public.feature_request_comments
FOR EACH ROW
EXECUTE FUNCTION public.notify_feature_request_comment();

-- Trigger: notify when someone votes on a governance proposal (likes only)
CREATE OR REPLACE FUNCTION public.notify_governance_vote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.vote_type = 1 THEN
    INSERT INTO public.custom_notifications (
      recipient_address,
      actor_address,
      actor_username,
      type,
      content,
      reference_id,
      reference_title
    )
    SELECT
      gp.author_wallet_address,
      NEW.wallet_address,
      NULL,
      'governance_vote',
      '',
      gp.id::text,
      gp.title
    FROM public.governance_proposals gp
    WHERE gp.id = NEW.proposal_id
      AND lower(gp.author_wallet_address) != lower(NEW.wallet_address);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_governance_vote
AFTER INSERT ON public.governance_votes
FOR EACH ROW
EXECUTE FUNCTION public.notify_governance_vote();

-- Trigger: notify when someone comments on a governance proposal
CREATE OR REPLACE FUNCTION public.notify_governance_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.custom_notifications (
    recipient_address,
    actor_address,
    actor_username,
    actor_avatar,
    type,
    content,
    reference_id,
    reference_title
  )
  SELECT
    gp.author_wallet_address,
    NEW.wallet_address,
    NEW.username,
    NEW.avatar,
    'governance_comment',
    LEFT(NEW.content, 100),
    gp.id::text,
    gp.title
  FROM public.governance_proposals gp
  WHERE gp.id = NEW.proposal_id
    AND lower(gp.author_wallet_address) != lower(NEW.wallet_address);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_governance_comment
AFTER INSERT ON public.governance_comments
FOR EACH ROW
EXECUTE FUNCTION public.notify_governance_comment();
