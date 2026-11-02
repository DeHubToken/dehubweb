-- Groups and channels: channel posting rule and paid entry checked on-chain.
-- Runs after the bootstrap, the holder gate migration and this migration.
\set ON_ERROR_STOP 1
BEGIN;

INSERT INTO public.communities(id, creator_wallet_address, kind, entry_price) VALUES
 ('00000000-0000-0000-0000-0000000000c1','0x1111111111111111111111111111111111111111','channel',NULL),
 ('00000000-0000-0000-0000-0000000000c2','0x1111111111111111111111111111111111111111','channel',250),
 ('00000000-0000-0000-0000-0000000000c3','0x1111111111111111111111111111111111111111','group',NULL);
SELECT set_config('dehub.community_privileged','1',false);
INSERT INTO public.community_members(community_id,wallet_address,role,status) VALUES
 ('00000000-0000-0000-0000-0000000000c1','0x1111111111111111111111111111111111111111','owner','active'),
 ('00000000-0000-0000-0000-0000000000c2','0x1111111111111111111111111111111111111111','owner','active'),
 ('00000000-0000-0000-0000-0000000000c3','0x1111111111111111111111111111111111111111','owner','active');
SELECT set_config('dehub.community_privileged','',false);

-- Unknown kinds are refused.
DO $$ BEGIN
  UPDATE public.communities SET kind = 'forum' WHERE id = '00000000-0000-0000-0000-0000000000c1';
  RAISE EXCEPTION 'bad kind accepted';
EXCEPTION WHEN check_violation THEN NULL; END $$;

-- Free channel: anyone joins, only the owner posts.
SELECT public.history_test_session('0x2222222222222222222222222222222222222222');
INSERT INTO public.community_members(community_id,wallet_address) VALUES ('00000000-0000-0000-0000-0000000000c1','0x2222222222222222222222222222222222222222');
DO $$ BEGIN
  INSERT INTO public.community_chat_messages(id,community_id,wallet_address,content,created_at)
  VALUES (gen_random_uuid(),'00000000-0000-0000-0000-0000000000c1','0x2222222222222222222222222222222222222222','hi',now());
  RAISE EXCEPTION 'member posted in a channel';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
INSERT INTO public.community_chat_messages(id,community_id,wallet_address,content,created_at)
VALUES (gen_random_uuid(),'00000000-0000-0000-0000-0000000000c1','0x1111111111111111111111111111111111111111','welcome',now());

-- Group: members chat.
INSERT INTO public.community_members(community_id,wallet_address) VALUES ('00000000-0000-0000-0000-0000000000c3','0x2222222222222222222222222222222222222222');
INSERT INTO public.community_chat_messages(id,community_id,wallet_address,content,created_at)
VALUES (gen_random_uuid(),'00000000-0000-0000-0000-0000000000c3','0x2222222222222222222222222222222222222222','hey all',now());

-- Paid channel: joining before paying is refused.
DO $$ BEGIN
  INSERT INTO public.community_members(community_id,wallet_address) VALUES ('00000000-0000-0000-0000-0000000000c2','0x2222222222222222222222222222222222222222');
  RAISE EXCEPTION 'joined a paid channel without paying';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

-- Free one says free.
DO $$ BEGIN
  IF public.community_entry_check('00000000-0000-0000-0000-0000000000c1')->>'status' <> 'free' THEN RAISE EXCEPTION 'free expected'; END IF;
END $$;

-- A bad hash is refused.
DO $$ BEGIN
  PERFORM public.community_entry_submit('00000000-0000-0000-0000-0000000000c2',56,'nope');
  RAISE EXCEPTION 'bad hash accepted';
EXCEPTION WHEN invalid_parameter_value THEN NULL; END $$;

-- Not mined yet: pending, asks again.
UPDATE net.fake_reply SET body = '{"jsonrpc":"2.0","id":1,"result":null}';
DO $$ DECLARE r jsonb; BEGIN
  IF public.community_entry_submit('00000000-0000-0000-0000-0000000000c2',56,'0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')->>'status' <> 'pending' THEN RAISE EXCEPTION 'pending expected'; END IF;
  IF (SELECT body->>'method' FROM net.sent ORDER BY id DESC LIMIT 1) <> 'eth_getTransactionReceipt' THEN RAISE EXCEPTION 'wrong rpc'; END IF;
  IF public.community_entry_check('00000000-0000-0000-0000-0000000000c2')->>'status' <> 'pending' THEN RAISE EXCEPTION 'still pending before reply'; END IF;
  PERFORM net.deliver();
  r := public.community_entry_check('00000000-0000-0000-0000-0000000000c2');
  IF r->>'status' <> 'pending' THEN RAISE EXCEPTION 'unmined should stay pending: %', r; END IF;
  IF (SELECT count(*) FROM net.sent WHERE NOT delivered) <> 1 THEN RAISE EXCEPTION 'should re-ask the node'; END IF;
END $$;

-- Mined, but the transfer went to someone else: failed.
UPDATE net.fake_reply SET body = '{"jsonrpc":"2.0","id":1,"result":{"status":"0x1","logs":[{"address":"0x680d3113caf77b61b510f332d5ef4cf5b41a761d","topics":["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef","0x0000000000000000000000002222222222222222222222222222222222222222","0x0000000000000000000000009999999999999999999999999999999999999999"],"data":"0x00000000000000000000000000000000000000000000000d8d726b7177a80000"}]}}';
DO $$ DECLARE r jsonb; BEGIN
  PERFORM net.deliver();
  r := public.community_entry_check('00000000-0000-0000-0000-0000000000c2');
  IF r->>'status' <> 'failed' THEN RAISE EXCEPTION 'wrong recipient should fail: %', r; END IF;
END $$;

-- Too little to the owner (100 tokens = 0x56bc75e2d63100000): failed.
UPDATE net.fake_reply SET body = '{"jsonrpc":"2.0","id":1,"result":{"status":"0x1","logs":[{"address":"0x680d3113caf77b61b510f332d5ef4cf5b41a761d","topics":["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef","0x0000000000000000000000002222222222222222222222222222222222222222","0x0000000000000000000000001111111111111111111111111111111111111111"],"data":"0x0000000000000000000000000000000000000000000000056bc75e2d63100000"}]}}';
DO $$ DECLARE r jsonb; BEGIN
  PERFORM public.community_entry_submit('00000000-0000-0000-0000-0000000000c2',56,'0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  PERFORM net.deliver();
  r := public.community_entry_check('00000000-0000-0000-0000-0000000000c2');
  IF r->>'status' <> 'failed' OR (r->>'amount')::numeric <> 100 THEN RAISE EXCEPTION 'underpaid should fail: %', r; END IF;
END $$;

-- 300 tokens to the owner (0x1043561a8829300000): paid, and now joining works.
UPDATE net.fake_reply SET body = '{"jsonrpc":"2.0","id":1,"result":{"status":"0x1","logs":[{"address":"0x680d3113caf77b61b510f332d5ef4cf5b41a761d","topics":["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef","0x0000000000000000000000002222222222222222222222222222222222222222","0x0000000000000000000000001111111111111111111111111111111111111111"],"data":"0x00000000000000000000000000000000000000000000001043561a8829300000"}]}}';
DO $$ DECLARE r jsonb; BEGIN
  PERFORM public.community_entry_submit('00000000-0000-0000-0000-0000000000c2',56,'0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc');
  PERFORM net.deliver();
  r := public.community_entry_check('00000000-0000-0000-0000-0000000000c2');
  IF r->>'status' <> 'paid' OR (r->>'amount')::numeric <> 300 THEN RAISE EXCEPTION 'expected paid 300: %', r; END IF;
END $$;
INSERT INTO public.community_members(community_id,wallet_address) VALUES ('00000000-0000-0000-0000-0000000000c2','0x2222222222222222222222222222222222222222');

-- Someone else cannot reuse that transaction.
SELECT public.history_test_session('0x3333333333333333333333333333333333333333');
DO $$ BEGIN
  PERFORM public.community_entry_submit('00000000-0000-0000-0000-0000000000c2',56,'0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC');
  RAISE EXCEPTION 'reused tx accepted';
EXCEPTION WHEN unique_violation THEN NULL; END $$;

-- Payments stay private.
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM 1 FROM public.community_entry_payments;
  RAISE EXCEPTION 'payments readable by clients';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;

COMMIT;
\echo 'groups and channels tests passed'
