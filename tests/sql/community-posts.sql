BEGIN;
INSERT INTO public.communities(id,is_private) VALUES('00000000-0000-0000-0000-000000000001',false),('00000000-0000-0000-0000-000000000002',true);
INSERT INTO public.community_members(community_id,wallet_address,role) VALUES
 ('00000000-0000-0000-0000-000000000001','0x1111111111111111111111111111111111111111','owner'),
 ('00000000-0000-0000-0000-000000000002','0x1111111111111111111111111111111111111111','owner'),
 ('00000000-0000-0000-0000-000000000001','0x2222222222222222222222222222222222222222','member');
SET ROLE anon;
SELECT public.test_wallet('0x1111111111111111111111111111111111111111');
SELECT public.community_share_post('00000000-0000-0000-0000-000000000001',6552);
SELECT public.community_share_post('00000000-0000-0000-0000-000000000002',6552);
SELECT public.test_wallet('0x2222222222222222222222222222222222222222');
SELECT public.community_share_post('00000000-0000-0000-0000-000000000001',6552);
SELECT public.community_share_post('00000000-0000-0000-0000-000000000001',6553);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.community_post_shares)<>2 THEN RAISE EXCEPTION 'Private reference leaked or duplicate post created'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.community_post_shares WHERE token_id=6552 AND shared_by='0x1111111111111111111111111111111111111111') THEN RAISE EXCEPTION 'Duplicate changed original attribution'; END IF;
 BEGIN
  PERFORM public.community_remove_shared_post('00000000-0000-0000-0000-000000000001',6552);
  RAISE EXCEPTION 'Member removed another share';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.community_share_post('00000000-0000-0000-0000-000000000002',6554);
  RAISE EXCEPTION 'Nonmember added private share';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT public.community_remove_shared_post('00000000-0000-0000-0000-000000000001',6553);
SELECT set_config('request.headers','{"x-wallet-address":"0x1111111111111111111111111111111111111111"}',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.community_post_shares)<>1 THEN RAISE EXCEPTION 'Unsigned owner header leaked private shares'; END IF;
 BEGIN
  PERFORM public.community_share_post('00000000-0000-0000-0000-000000000001',6554);
  RAISE EXCEPTION 'Unsigned owner header allowed posting';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE public.community_members SET muted_until=now()+interval '1 day' WHERE wallet_address='0x2222222222222222222222222222222222222222';
SET ROLE anon;
SELECT public.test_wallet('0x2222222222222222222222222222222222222222');
DO $$ BEGIN
 BEGIN
  PERFORM public.community_share_post('00000000-0000-0000-0000-000000000001',6554);
  RAISE EXCEPTION 'Muted member added share';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT public.test_wallet('0x1111111111111111111111111111111111111111',extract(epoch FROM now())::bigint-1);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.community_post_shares)<>1 THEN RAISE EXCEPTION 'Expired session leaked private shares'; END IF;
END $$;
SELECT public.test_wallet('0x1111111111111111111111111111111111111111');
SELECT public.community_remove_shared_post('00000000-0000-0000-0000-000000000001',6552);
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.community_post_shares)<>1 THEN RAISE EXCEPTION 'Removal affected another community'; END IF;
 IF NOT EXISTS(SELECT FROM public.community_post_shares WHERE token_id=6552) THEN RAISE EXCEPTION 'Original post identity changed'; END IF;
END $$;
ROLLBACK;
