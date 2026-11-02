-- Holder gate: checks, writes and enforcement. Runs after
-- community-chat-history-bootstrap.sql, a fake pg_net and the migration.
\set ON_ERROR_STOP 1
BEGIN;

INSERT INTO public.communities(id) VALUES
 ('00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-0000000000a2');
SELECT set_config('dehub.community_privileged','1',false);
INSERT INTO public.community_members(community_id,wallet_address,role,status) VALUES
 ('00000000-0000-0000-0000-0000000000a1','0x1111111111111111111111111111111111111111','owner','active');
SELECT set_config('dehub.community_privileged','',false);

-- Not the owner: refused.
SELECT public.history_test_session('0x2222222222222222222222222222222222222222');
DO $$ BEGIN
  PERFORM public.community_set_holder_gate('00000000-0000-0000-0000-0000000000a1',56,'0x40b165fd5dddc2cd06d7b6b6f6b6f6b6f6b6f6b6',1000,'DHB',18);
  RAISE EXCEPTION 'non-owner set the gate';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

-- Owner sets it.
SELECT public.history_test_session('0x1111111111111111111111111111111111111111');
SELECT public.community_set_holder_gate('00000000-0000-0000-0000-0000000000a1',56,'0x40B165FD5DDDC2CD06D7B6B6F6B6F6B6F6B6F6B6',1000,'DHB',18);
DO $$ BEGIN
  IF (SELECT holder_gate_token FROM public.communities WHERE id='00000000-0000-0000-0000-0000000000a1')
     <> '0x40b165fd5dddc2cd06d7b6b6f6b6f6b6f6b6f6b6' THEN RAISE EXCEPTION 'token not lowercased'; END IF;
END $$;

-- Ungated community: open.
SELECT public.history_test_session('0x2222222222222222222222222222222222222222');
DO $$ BEGIN
  IF public.community_holder_check_start('00000000-0000-0000-0000-0000000000a2')->>'status' <> 'open' THEN RAISE EXCEPTION 'open expected'; END IF;
END $$;

-- Joining before any check is refused.
DO $$ BEGIN
  INSERT INTO public.community_members(community_id,wallet_address) VALUES ('00000000-0000-0000-0000-0000000000a1','0x2222222222222222222222222222222222222222');
  RAISE EXCEPTION 'joined without a check';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

-- Claiming to be an owner in the insert does not skip the check.
DO $$ BEGIN
  INSERT INTO public.community_members(community_id,wallet_address,role) VALUES ('00000000-0000-0000-0000-0000000000a1','0x2222222222222222222222222222222222222222','owner');
  RAISE EXCEPTION 'client-sent owner role skipped the gate';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

-- Reply holds 500 tokens (500e18 = 0x1b1ae4d6e2ef500000): pending, then not eligible.
UPDATE net.fake_reply SET body = '{"jsonrpc":"2.0","id":1,"result":"0x00000000000000000000000000000000000000000000001b1ae4d6e2ef500000"}';
SELECT public.history_test_session('0x2222222222222222222222222222222222222222');
DO $$ DECLARE r jsonb; BEGIN
  IF public.community_holder_check_start('00000000-0000-0000-0000-0000000000a1')->>'status' <> 'pending' THEN RAISE EXCEPTION 'pending expected'; END IF;
  -- The eth_call carries balanceOf(caller).
  IF (SELECT body->'params'->0->>'data' FROM net.sent ORDER BY id DESC LIMIT 1)
     <> '0x70a082310000000000000000000000002222222222222222222222222222222222222222' THEN RAISE EXCEPTION 'bad calldata'; END IF;
  r := public.community_holder_check_result('00000000-0000-0000-0000-0000000000a1');
  IF r->>'status' <> 'pending' THEN RAISE EXCEPTION 'reply should not be in yet: %', r; END IF;
  PERFORM net.deliver();
  r := public.community_holder_check_result('00000000-0000-0000-0000-0000000000a1');
  IF r->>'status' <> 'done' OR (r->>'balance')::numeric <> 500 OR (r->>'eligible')::boolean THEN RAISE EXCEPTION 'expected 500, not eligible: %', r; END IF;
END $$;
DO $$ BEGIN
  INSERT INTO public.community_members(community_id,wallet_address) VALUES ('00000000-0000-0000-0000-0000000000a1','0x2222222222222222222222222222222222222222');
  RAISE EXCEPTION 'joined while short';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

-- 2000 tokens (0x6c6b935b8bbd400000): eligible, join and chat allowed.
UPDATE net.fake_reply SET body = '{"jsonrpc":"2.0","id":1,"result":"0x00000000000000000000000000000000000000000000006c6b935b8bbd400000"}';
SELECT public.history_test_session('0x2222222222222222222222222222222222222222');
DO $$ DECLARE r jsonb; BEGIN
  PERFORM public.community_holder_check_start('00000000-0000-0000-0000-0000000000a1');
  PERFORM net.deliver();
  r := public.community_holder_check_result('00000000-0000-0000-0000-0000000000a1');
  IF (r->>'balance')::numeric <> 2000 OR NOT (r->>'eligible')::boolean THEN RAISE EXCEPTION 'expected eligible: %', r; END IF;
END $$;
INSERT INTO public.community_members(community_id,wallet_address) VALUES ('00000000-0000-0000-0000-0000000000a1','0x2222222222222222222222222222222222222222');
INSERT INTO public.community_chat_messages(id,community_id,wallet_address,content,created_at)
VALUES (gen_random_uuid(),'00000000-0000-0000-0000-0000000000a1','0x2222222222222222222222222222222222222222','gm',now());

-- They sold: the next check drops them below the line and chat refuses.
UPDATE net.fake_reply SET body = '{"jsonrpc":"2.0","id":1,"result":"0x0"}';
SELECT public.history_test_session('0x2222222222222222222222222222222222222222');
DO $$ BEGIN
  PERFORM public.community_holder_check_start('00000000-0000-0000-0000-0000000000a1');
  PERFORM net.deliver();
  PERFORM public.community_holder_check_result('00000000-0000-0000-0000-0000000000a1');
  INSERT INTO public.community_chat_messages(id,community_id,wallet_address,content,created_at)
  VALUES (gen_random_uuid(),'00000000-0000-0000-0000-0000000000a1','0x2222222222222222222222222222222222222222','still here',now());
  RAISE EXCEPTION 'sold-out holder could chat';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

-- Owner chats regardless; a failed RPC reply reports failed and writes nothing.
INSERT INTO public.community_chat_messages(id,community_id,wallet_address,content,created_at)
VALUES (gen_random_uuid(),'00000000-0000-0000-0000-0000000000a1','0x1111111111111111111111111111111111111111','owner',now());
UPDATE net.fake_reply SET body = '{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"boom"}}';
SELECT public.history_test_session('0x3333333333333333333333333333333333333333');
DO $$ BEGIN
  PERFORM public.community_holder_check_start('00000000-0000-0000-0000-0000000000a1');
  PERFORM net.deliver();
  IF public.community_holder_check_result('00000000-0000-0000-0000-0000000000a1')->>'status' <> 'failed' THEN RAISE EXCEPTION 'failed expected'; END IF;
  IF EXISTS (SELECT 1 FROM public.community_holders WHERE wallet_address='0x3333333333333333333333333333333333333333') THEN RAISE EXCEPTION 'wrote a failed check'; END IF;
END $$;

-- Clients can't write balances or read pending requests.
SET ROLE authenticated;
DO $$ BEGIN
  INSERT INTO public.community_holders(community_id,wallet_address,balance) VALUES ('00000000-0000-0000-0000-0000000000a1','0x4444444444444444444444444444444444444444',1e9);
  RAISE EXCEPTION 'client wrote a balance';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  PERFORM 1 FROM public.community_holder_requests;
  RAISE EXCEPTION 'client read requests';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;

-- Clearing the gate opens the community.
SELECT public.history_test_session('0x1111111111111111111111111111111111111111');
SELECT public.community_set_holder_gate('00000000-0000-0000-0000-0000000000a1',NULL,NULL,NULL,NULL,NULL);
INSERT INTO public.community_members(community_id,wallet_address) VALUES ('00000000-0000-0000-0000-0000000000a1','0x5555555555555555555555555555555555555555');

SELECT 'holder gate tests passed' AS result;
COMMIT;
