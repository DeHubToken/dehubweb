BEGIN;
INSERT INTO public.affiliate_codes(code,owner_address) VALUES
 ('PARENT','0x1111111111111111111111111111111111111111'),
 ('OTHER','0x2222222222222222222222222222222222222222');
SET ROLE anon;
SELECT public.test_wallet('0x3333333333333333333333333333333333333333');
SELECT public.attribute_affiliate_referral('PARENT','john');
SELECT public.attribute_affiliate_referral('OTHER','changed');
SELECT public.test_wallet('0x4444444444444444444444444444444444444444');
SELECT public.attribute_affiliate_referral('PARENT','sarah');
SELECT public.test_wallet('0x5555555555555555555555555555555555555555');
SELECT public.attribute_affiliate_referral('PARENT',repeat('x',65));
DO $$ BEGIN
 IF EXISTS (SELECT FROM public.get_affiliate_sub_referrals()) THEN RAISE EXCEPTION 'Recipient can see outreach tags'; END IF;
END $$;
SELECT public.test_wallet('0x2222222222222222222222222222222222222222');
DO $$ BEGIN
 IF EXISTS (SELECT FROM public.get_affiliate_sub_referrals()) THEN RAISE EXCEPTION 'Other affiliate can see outreach tags'; END IF;
END $$;
SELECT public.test_wallet('0x1111111111111111111111111111111111111111');
SELECT public.attribute_affiliate_referral('PARENT','self');
DO $$ BEGIN
 IF (SELECT count(*) FROM public.get_affiliate_sub_referrals()) <> 2 THEN RAISE EXCEPTION 'Missing owner tags'; END IF;
 IF NOT EXISTS (SELECT FROM public.get_affiliate_sub_referrals() WHERE sub_id='john' AND referred_address='0x3333333333333333333333333333333333333333') THEN RAISE EXCEPTION 'First touch changed'; END IF;
 IF NOT EXISTS (SELECT FROM public.get_affiliate_sub_referrals() WHERE sub_id='sarah') THEN RAISE EXCEPTION 'Second outreach tag missing'; END IF;
 IF (SELECT count(*) FROM public.affiliate_sub_referrals) <> 2 THEN RAISE EXCEPTION 'RLS mismatch'; END IF;
END $$;
SELECT public.test_wallet('0x1111111111111111111111111111111111111111',extract(epoch FROM now())::bigint-1);
DO $$ BEGIN
 IF EXISTS (SELECT FROM public.get_affiliate_sub_referrals()) THEN RAISE EXCEPTION 'Expired session leaked tags'; END IF;
END $$;
SELECT public.test_wallet('0x1111111111111111111111111111111111111111');
SELECT set_config('request.headers',jsonb_set(current_setting('request.headers')::jsonb,'{x-wallet-address}','"0x2222222222222222222222222222222222222222"')::text,true);
DO $$ BEGIN
 IF EXISTS (SELECT FROM public.get_affiliate_sub_referrals()) THEN RAISE EXCEPTION 'Mismatched wallet session leaked tags'; END IF;
END $$;
SELECT set_config('request.headers',jsonb_build_object('x-wallet-session','0x1111111111111111111111111111111111111111.'||(extract(epoch FROM now())::bigint+3600)||'.'||repeat('0',64))::text,true);
DO $$ BEGIN
 IF EXISTS (SELECT FROM public.get_affiliate_sub_referrals()) THEN RAISE EXCEPTION 'Forged signature leaked tags'; END IF;
END $$;
SELECT set_config('request.headers','{"x-wallet-address":"0x1111111111111111111111111111111111111111"}',true);
DO $$ BEGIN
 IF EXISTS (SELECT FROM public.get_affiliate_sub_referrals()) THEN RAISE EXCEPTION 'Unsigned owner header leaked tags'; END IF;
 BEGIN
  PERFORM public.attribute_affiliate_referral('PARENT','spoof');
  RAISE EXCEPTION 'Unsigned attribution accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'Sign in to attribute a referral' THEN RAISE; END IF;
 END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.affiliate_referrals WHERE code='PARENT') <> 3 THEN RAISE EXCEPTION 'Parent attribution lost'; END IF;
 IF EXISTS (SELECT FROM public.affiliate_referrals WHERE code='OTHER') THEN RAISE EXCEPTION 'First touch overwritten'; END IF;
 IF (SELECT count(*) FROM public.affiliate_sub_referrals) <> 2 THEN RAISE EXCEPTION 'Invalid or self tag saved'; END IF;
 IF EXISTS (SELECT FROM public.affiliate_codes WHERE commission_pct <> 20) THEN RAISE EXCEPTION 'Reward rate changed'; END IF;
END $$;
ROLLBACK;
