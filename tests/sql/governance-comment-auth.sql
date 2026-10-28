CREATE POLICY read_comments ON public.governance_comments FOR SELECT USING (true);
CREATE POLICY write_comments ON public.governance_comments FOR INSERT
  WITH CHECK (lower(wallet_address) = public.get_signed_request_wallet_address());
CREATE POLICY edit_comments ON public.governance_comments FOR UPDATE
  USING (lower(wallet_address) = public.get_signed_request_wallet_address())
  WITH CHECK (lower(wallet_address) = public.get_signed_request_wallet_address());
CREATE TRIGGER governance_comment_badge_guard BEFORE INSERT OR UPDATE
  ON public.governance_comments FOR EACH ROW EXECUTE FUNCTION public.enforce_governance_comment_badge();

BEGIN;
DO $$
DECLARE
  wallet text := '0x0000000000000000000000000000000000000001';
  other_wallet text := '0x0000000000000000000000000000000000000002';
  expiry bigint := extract(epoch FROM now())::bigint + 600;
  secret bytea;
  session text;
  other_session text;
  root_id uuid;
  reply_id uuid;
  n integer;
BEGIN
  SELECT key INTO secret FROM wallet_auth.secret WHERE id = 1;
  session := wallet || '.' || expiry || '.' || encode(extensions.hmac(
    convert_to(wallet || '.' || expiry, 'UTF8'), secret, 'sha256'), 'hex');
  other_session := other_wallet || '.' || expiry || '.' || encode(extensions.hmac(
    convert_to(other_wallet || '.' || expiry, 'UTF8'), secret, 'sha256'), 'hex');

  -- No secondary API JWT: a valid signed session is sufficient.
  PERFORM set_config('request.headers', jsonb_build_object('x-wallet-session', session)::text, true);
  PERFORM set_config('dehub.signed_wallet', '', true);
  EXECUTE 'SET LOCAL ROLE anon';
  INSERT INTO public.governance_comments(wallet_address, content)
    VALUES(wallet, 'Root') RETURNING id INTO root_id;
  INSERT INTO public.governance_comments(wallet_address, content, parent_id)
    VALUES(wallet, 'Reply', root_id) RETURNING id INTO reply_id;
  UPDATE public.governance_comments SET content = 'Edited reply' WHERE id = reply_id;
  SELECT count(*) INTO n FROM public.governance_comments
    WHERE id = reply_id AND parent_id = root_id AND content = 'Edited reply';
  IF n <> 1 THEN RAISE EXCEPTION 'Signed root/reply/edit failed'; END IF;
  BEGIN
    INSERT INTO public.governance_comments(wallet_address, content) VALUES(other_wallet, 'Impersonation');
    RAISE EXCEPTION 'Wrong wallet accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.governance_comments SET wallet_address = other_wallet WHERE id = root_id;
    RAISE EXCEPTION 'Author change accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'RESET ROLE';

  -- A stale redundant JWT must not override the valid signed identity.
  PERFORM set_config('request.headers', jsonb_build_object('x-wallet-session', session, 'x-dehub-token', 'expired')::text, true);
  PERFORM set_config('dehub.signed_wallet', '', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.governance_comments(wallet_address, content) VALUES(wallet, 'Valid session, old JWT');
  EXECUTE 'RESET ROLE';

  -- A claimed wallet alone, a forged session and an expired session all fail.
  FOREACH session IN ARRAY ARRAY['', wallet || '.' || expiry || '.forged', wallet || '.1.invalid'] LOOP
    PERFORM set_config('request.headers', jsonb_build_object('x-wallet-address', wallet, 'x-wallet-session', session)::text, true);
    PERFORM set_config('dehub.signed_wallet', '', true);
    EXECUTE 'SET LOCAL ROLE anon';
    BEGIN
      INSERT INTO public.governance_comments(wallet_address, content) VALUES(wallet, 'Unsigned');
      RAISE EXCEPTION 'Unverified session accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    EXECUTE 'RESET ROLE';
  END LOOP;

  PERFORM set_config('request.headers', jsonb_build_object('x-wallet-session', other_session)::text, true);
  PERFORM set_config('dehub.signed_wallet', '', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    INSERT INTO public.governance_comments(wallet_address, content) VALUES(other_wallet, 'No badge');
    RAISE EXCEPTION 'Badge-less wallet accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'Badge holders only' THEN RAISE; END IF;
  END;
  EXECUTE 'RESET ROLE';
END;
$$;
ROLLBACK;
