BEGIN;
SET ROLE service_role;
DO $$ DECLARE first jsonb; retry jsonb; BEGIN
 first:=public.reserve_agent_registration('0x1111111111111111111111111111111111111111','reserved_one','test','0x2222222222222222222222222222222222222222','0x'||repeat('2',64),'dehub_'||repeat('2',64));
 retry:=public.reserve_agent_registration('0x1111111111111111111111111111111111111111','reserved_one','changed','0x3333333333333333333333333333333333333333','0x'||repeat('3',64),'dehub_'||repeat('3',64));
 IF first IS DISTINCT FROM retry OR first->>'is_active'<>'false' THEN RAISE EXCEPTION 'Retry replaced reserved identity'; END IF;
 FOR i IN 3..6 LOOP
  PERFORM public.reserve_agent_registration('0x1111111111111111111111111111111111111111','reserved_'||i,'test','0x'||repeat(i::text,40),'0x'||repeat(i::text,64),'dehub_'||repeat(i::text,64));
 END LOOP;
 BEGIN
  PERFORM public.reserve_agent_registration('0x1111111111111111111111111111111111111111','reserved_sixth','test','0x'||repeat('7',40),'0x'||repeat('7',64),'dehub_'||repeat('7',64));
  RAISE EXCEPTION 'Quota allowed a sixth registration' USING ERRCODE='23514';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'AGENT_OWNER_LIMIT' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.reserve_agent_registration('0x8888888888888888888888888888888888888888','reserved_one','test','0x'||repeat('8',40),'0x'||repeat('8',64),'dehub_'||repeat('8',64));
  RAISE EXCEPTION 'Other owner resumed a registration';
 EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE anon;
SELECT set_config('request.headers','{"x-wallet-address":"0x1111111111111111111111111111111111111111"}',true);
DO $$ BEGIN
 BEGIN
  PERFORM public.reserve_agent_registration('0x9999999999999999999999999999999999999999','forged_owner','test','0x'||repeat('9',40),'0x'||repeat('9',64),'dehub_'||repeat('9',64));
  RAISE EXCEPTION 'Public client reserved an account';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 DELETE FROM public.ai_agents WHERE name='reserved_one';
 IF FOUND THEN RAISE EXCEPTION 'Unsigned header deleted another wallet registration'; END IF;
 UPDATE public.ai_agents SET is_active=true WHERE name='reserved_one';
 IF FOUND THEN RAISE EXCEPTION 'Unsigned header changed another wallet registration'; END IF;
 BEGIN
  PERFORM wallet_private_key FROM public.ai_agents;
  RAISE EXCEPTION 'Private key exposed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT public.test_wallet('0x1111111111111111111111111111111111111111');
DO $$ BEGIN
 UPDATE public.ai_agents SET description='owner edit' WHERE name='reserved_one';
 IF NOT FOUND THEN RAISE EXCEPTION 'Signed owner cannot edit'; END IF;
 DELETE FROM public.ai_agents WHERE name='reserved_one';
 IF NOT FOUND THEN RAISE EXCEPTION 'Signed owner cannot cancel pending registration'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
