-- Governance writes use the same verified wallet session as their RLS policy.
-- Requiring a second, shorter-lived API token rejected otherwise authenticated
-- requests, including older clients that only send the signed wallet session.
CREATE OR REPLACE FUNCTION public.enforce_governance_comment_badge()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  verified_wallet text := nullif(public.get_signed_request_wallet_address(), '');
BEGIN
  IF verified_wallet IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;
  IF verified_wallet <> lower(NEW.wallet_address) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Session does not belong to the supplied wallet';
  END IF;
  IF TG_OP = 'UPDATE' AND lower(OLD.wallet_address) <> verified_wallet THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Cannot change the comment author';
  END IF;
  IF NOT public.governance_has_comment_badge(verified_wallet) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Badge holders only';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_governance_comment_badge() FROM PUBLIC, anon, authenticated;
